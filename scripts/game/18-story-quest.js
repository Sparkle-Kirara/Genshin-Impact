// ============================================================
// Alpha M6 — NHIỆM VỤ CHÍNH ALPHA (chuỗi mục tiêu) + UI nhiệm vụ
// ============================================================
// Nhỏ nhất đủ dùng cho lát Alpha: 1 nhiệm vụ nhiều mục tiêu tuần tự, dữ liệu trong STORY_QUEST_DEFINITIONS. Không
// có ngôn ngữ kịch bản: mỗi mục tiêu thuộc 1 trong 4 loại, mỗi loại hoàn thành bởi ĐÚNG 1 sự kiện có thật của thế giới:
//   reach      world:enter { id: zone }            (16-world-state — vùng quanh Tháp Canh)
//   interact   world:interacted { id: target }     (17-world-poi — đọc xong bia đá)
//   encounter  encounter:completed { id }          (15-encounter — thắng lượt Thử Thách Alpha)
//   talk       lựa chọn 'Báo cáo' trong hội thoại với NPC giao nhiệm vụ (qua handleNpcAction)
// Chỉ mục tiêu ĐANG hoạt động mới nghe sự kiện -> mục tiêu tương lai không thể hoàn thành trước; sự kiện lặp lại
// (đọc bia 2 lần, thắng encounter 2 lần) không cộng thêm gì vì chỉ số mục tiêu đã sang mục khác.
//
// Trạng thái (nguồn sự thật DUY NHẤT, lưu trong Save v2 phần `story`):
//   available -> active (mục tiêu 0..n-1) -> completed (xong hết, CHƯA nhận thưởng) -> rewarded (đã nhận)
// Thưởng đi qua REWARD_HANDLERS có sẵn, đúng 1 lần: cờ rewardClaimed đặt TRƯỚC khi gọi handler.
// UI (tracker trái màn hình, dấu !/? trên NPC, điểm đánh dấu mục tiêu 3D, trang Nhiệm Vụ trong Paimon Menu) chỉ ĐỌC
// state này — không giữ bản sao riêng.
(function () {
    'use strict';

    const STORY_QUEST_DEFINITIONS = {
        alpha_watchtower: {
            id: 'alpha_watchtower',
            title: 'Ngọn Lửa Tháp Canh',
            giver: 'scout_arin',
            giverName: 'Trinh sát Arin',
            summary: 'Tinh thể trên Tháp Canh Cổ ở rìa Rừng Tây chập chờn từ đêm qua. Trinh sát Arin nhờ bạn tới xem và dẹp lũ quái đang tụ lại gần khu cắm trại.',
            objectives: [
                { id: 'reach_tower', type: 'reach', zone: 'watchtower', anchor: 'watchtower',
                  text: 'Đi tới Tháp Canh Cổ', hint: 'Theo hàng đèn lồng phía Nam khu cắm trại' },
                { id: 'read_stele', type: 'interact', target: 'watchtower_stele', anchor: 'watchtower_stele',
                  text: 'Đọc bia đá dưới chân tháp', hint: 'Tấm bia có dòng chữ phát sáng' },
                { id: 'clear_trial', type: 'encounter', encounter: 'alpha_trial', anchor: 'alpha_trial',
                  text: 'Hạ toàn bộ quái ở Bãi Đá Thử Thách', hint: 'Kích hoạt cột sáng gần khu cắm trại' },
                { id: 'report', type: 'talk', npc: 'scout_arin', anchor: 'scout_arin',
                  text: 'Báo cáo với Trinh sát Arin', hint: 'Cô ấy đứng ở cửa Nam khu cắm trại' }
            ],
            rewards: [
                { type: 'primogem', amount: 60 },
                { type: 'exp', amount: 80 },
                { type: 'material', itemId: 'apple', amount: 3 }
            ]
        }
    };
    window.STORY_QUEST_DEFINITIONS = STORY_QUEST_DEFINITIONS;

    const STATUSES = ['available', 'active', 'completed', 'rewarded'];
    const OBJECTIVE_TYPES = ['reach', 'interact', 'encounter', 'talk'];
    const states = new Map();          // questId -> { status, objectiveIndex, rewardClaimed }
    const warnedMissing = new Set();
    let initialized = false;
    const offFns = [];

    function def(id) { return Object.prototype.hasOwnProperty.call(STORY_QUEST_DEFINITIONS, id) ? STORY_QUEST_DEFINITIONS[id] : null; }
    function freshState() { return { status: 'available', objectiveIndex: 0, rewardClaimed: false }; }
    function st(id) {
        if (!def(id)) return null;
        if (!states.has(id)) states.set(id, freshState());
        return states.get(id);
    }
    function currentObjective(id) {
        const d = def(id), s = st(id);
        if (!d || !s || s.status !== 'active') return null;
        return d.objectives[s.objectiveIndex] || null;
    }
    function notify(icon, text) { if (window.showRewardPopup) window.showRewardPopup(icon, text); }
    function changed() {
        if (window.requestSave) window.requestSave();
        if (window.refreshQuestTracker) window.refreshQuestTracker();
        refreshMarkers();
        if (window.activeWindow === 'quests') renderJournal();
    }

    // Mục tiêu có thực sự tồn tại trong thế giới không (thiếu -> nhiệm vụ không kẹt cứng: báo, không crash).
    function objectiveAvailable(o) {
        if (!o) return false;
        if (o.type === 'reach') return !!(window.WorldState && window.WorldState.getZone(o.zone));
        if (o.type === 'interact') return !!(window.WorldState && window.WorldState.knownIds('activated').indexOf(o.target) !== -1);
        if (o.type === 'encounter') return !!(window.ENCOUNTER_DEFINITIONS && window.ENCOUNTER_DEFINITIONS[o.encounter]);
        if (o.type === 'talk') return !!(window.WorldPoi && window.WorldPoi.scout && window.WorldPoi.scout.npcId === o.npc);
        return false;
    }

    // ------------------------------------------------------------------ chuyển trạng thái
    function accept(id) {
        const d = def(id), s = st(id);
        if (!d) return { ok: false, reason: 'unknown_quest' };
        if (s.status !== 'available') return { ok: false, reason: 'state_' + s.status };
        s.status = 'active';
        s.objectiveIndex = 0;
        notify('fa-solid fa-scroll text-amber-300', 'Nhận nhiệm vụ: ' + d.title);
        if (window.GameEvents) window.GameEvents.emit('quest:accepted', { id: id });
        onObjectiveActivated(id);
        changed();
        return { ok: true };
    }

    // Hoàn thành mục tiêu HIỆN TẠI nếu (và chỉ nếu) nó đúng là objectiveId — idempotent với sự kiện lặp.
    function completeObjective(id, objectiveId) {
        const d = def(id), s = st(id);
        const o = currentObjective(id);
        if (!o || o.id !== objectiveId) return false;
        s.objectiveIndex++;
        notify('fa-solid fa-circle-check text-emerald-300', 'Xong: ' + o.text);
        if (window.GameEvents) window.GameEvents.emit('quest:objectiveCompleted', { id: id, objective: o.id, index: s.objectiveIndex - 1 });
        if (s.objectiveIndex >= d.objectives.length) {
            s.status = 'completed';
            notify('fa-solid fa-gift text-amber-300', 'Hoàn thành mục tiêu — gặp ' + d.giverName + ' để nhận thưởng');
            if (window.GameEvents) window.GameEvents.emit('quest:completed', { id: id });
        } else {
            onObjectiveActivated(id);
        }
        changed();
        return true;
    }

    // Mục tiêu 'reach' vừa kích hoạt mà người chơi ĐANG đứng trong vùng -> tính là đã tới.
    function onObjectiveActivated(id) {
        const o = currentObjective(id);
        if (!o) return;
        if (!objectiveAvailable(o) && !warnedMissing.has(id + ':' + o.id)) {
            warnedMissing.add(id + ':' + o.id);
            console.warn('[StoryQuest] mục tiêu "' + o.id + '" của "' + id + '" chưa có trong thế giới — nhiệm vụ tạm dừng ở bước này.');
        }
        if (o.type === 'reach' && window.WorldState && window.WorldState.isInsideZone(o.zone)) {
            Promise.resolve().then(() => completeObjective(id, o.id));   // sau khi thông báo "nhận/xong" hiện xong
        }
    }

    function claimReward(id) {
        const d = def(id), s = st(id);
        if (!d || !s) return { ok: false, reason: 'unknown_quest' };
        if (s.rewardClaimed || s.status === 'rewarded') return { ok: false, reason: 'already_claimed' };
        if (s.status !== 'completed') return { ok: false, reason: 'not_completed' };
        s.rewardClaimed = true;          // TRƯỚC khi phát thưởng -> lần autosave kế tiếp thấy cả 2 cùng lúc
        s.status = 'rewarded';
        const handlers = window.REWARD_HANDLERS || {};
        d.rewards.forEach(r => {
            const h = handlers[r.type];
            if (typeof h === 'function') h(r.amount, r);
            else console.warn('[StoryQuest] không có REWARD_HANDLERS cho', r.type);
        });
        if (window.showQuestCompletePopup) window.showQuestCompletePopup();
        if (window.GameEvents) window.GameEvents.emit('quest:rewarded', { id: id });
        changed();
        return { ok: true };
    }

    // ------------------------------------------------------------------ sự kiện thế giới -> mục tiêu
    function onWorldEvent(type, payload) {
        Object.keys(STORY_QUEST_DEFINITIONS).forEach(id => {
            const o = currentObjective(id);
            if (!o || !payload) return;
            if (type === 'world:enter' && o.type === 'reach' && payload.id === o.zone) completeObjective(id, o.id);
            else if (type === 'world:interacted' && o.type === 'interact' && payload.id === o.target) completeObjective(id, o.id);
            else if (type === 'encounter:completed' && o.type === 'encounter' && payload.id === o.encounter) completeObjective(id, o.id);
        });
    }

    // ------------------------------------------------------------------ NPC: kịch bản + hành động
    function registerDialogue() {
        const n = 'Trinh sát Arin';
        const data = window.NPC_DIALOGUE_DATA;
        if (!data) return;
        data.scout_arin = Object.assign(data.scout_arin || {}, {
            offer: [
                { speaker: n, text: 'Chào lữ khách! Tôi là Arin, trinh sát của đoàn cắm trại này.' },
                { speaker: n, text: 'Tinh thể trên Tháp Canh Cổ ở rìa Rừng Tây cứ chập chờn từ đêm qua. Bạn tới xem giúp tôi được không? Cứ theo hàng đèn lồng.',
                  choices: [{ text: 'Nhận nhiệm vụ', action: 'quest_accept' }, { text: 'Để sau', action: 'end' }] }
            ],
            active_reach_tower: [
                { speaker: n, text: 'Tháp Canh Cổ ở rìa Rừng Tây — đi theo hàng đèn lồng phía Nam là tới.', choices: [{ text: 'Đã rõ', action: 'end' }] }
            ],
            active_read_stele: [
                { speaker: n, text: 'Dưới chân tháp có một tấm bia đá. Đọc nó giúp tôi nhé.', choices: [{ text: 'Đã rõ', action: 'end' }] }
            ],
            active_clear_trial: [
                { speaker: n, text: 'Lũ quái đang tụ ở Bãi Đá Thử Thách ngay cạnh trại. Chạm vào cột sáng để khiêu chiến chúng.', choices: [{ text: 'Đã rõ', action: 'end' }] }
            ],
            report: [
                { speaker: n, text: 'Bạn về rồi! Tình hình ngoài đó thế nào?', choices: [{ text: 'Báo cáo', action: 'quest_report' }] }
            ],
            reward: [
                { speaker: n, text: 'Tuyệt vời. Nhờ bạn mà đường quanh trại yên ổn trở lại. Đây là phần thưởng của bạn.',
                  choices: [{ text: 'Nhận thưởng', action: 'quest_claim' }] }
            ],
            done: [
                { speaker: n, text: 'Cảm ơn lần nữa, lữ khách. Hẹn gặp lại trên đường phiêu lưu!', choices: [{ text: 'Tạm biệt', action: 'end' }] }
            ]
        });
    }

    function questForGiver(npcId) {
        return Object.keys(STORY_QUEST_DEFINITIONS).find(id => STORY_QUEST_DEFINITIONS[id].giver === npcId) || null;
    }

    function dialogueStateFor(npcId) {
        const id = questForGiver(npcId);
        if (!id) return null;
        const s = st(id), o = currentObjective(id);
        if (s.status === 'available') return 'offer';
        if (s.status === 'completed') return 'reward';
        if (s.status === 'rewarded') return 'done';
        if (o && o.type === 'talk' && o.npc === npcId) return 'report';
        return o ? 'active_' + o.id : 'idle';
    }

    function handleNpcAction(npcId, action, npc) {
        const id = questForGiver(npcId);
        if (!id) return false;
        if (action === 'quest_accept') {
            accept(id);
            if (window.closeDialogue) window.closeDialogue();
            return true;
        }
        if (action === 'quest_report') {
            const o = currentObjective(id);
            if (o && o.type === 'talk' && o.npc === npcId) completeObjective(id, o.id);
            if (npc && window.openDialogue) window.openDialogue(npc);   // mở tiếp đúng kịch bản mới (reward/…)
            return true;
        }
        if (action === 'quest_claim') {
            claimReward(id);
            if (window.closeDialogue) window.closeDialogue();
            return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ Save v2 (phần `story`)
    function collect() {
        const out = {};
        states.forEach((s, id) => {
            if (!def(id)) return;
            out[id] = { status: s.status, objectiveIndex: s.objectiveIndex, rewardClaimed: s.rewardClaimed === true };
        });
        return out;
    }

    // Kiểm tra + chuẩn hoá từng nhiệm vụ đã lưu. Không bao giờ bịa tiến trình: dữ liệu mâu thuẫn -> lùi về trạng
    // thái hợp lệ gần nhất KHÔNG vượt quá điều đã lưu; riêng rewardClaimed=true luôn được giữ (chống nhận thưởng 2 lần).
    function sanitizeEntry(id, raw) {
        const d = def(id);
        const n = d.objectives.length;
        if (!raw || typeof raw !== 'object') return { state: null, warning: 'not_object' };
        const claimed = raw.rewardClaimed === true;
        let status = STATUSES.indexOf(raw.status) !== -1 ? raw.status : null;
        let idx = (typeof raw.objectiveIndex === 'number' && isFinite(raw.objectiveIndex)) ? Math.floor(raw.objectiveIndex) : null;
        let warning = null;
        if (claimed || status === 'rewarded') {
            if (!claimed || status !== 'rewarded') warning = 'reward_flag_mismatch';
            return { state: { status: 'rewarded', objectiveIndex: n, rewardClaimed: true }, warning: warning };
        }
        if (status === null) return { state: null, warning: 'bad_status' };
        if (status === 'available') return { state: freshState(), warning: (idx && idx !== 0) ? 'index_ignored' : null };
        if (status === 'completed') {
            if (idx !== n) warning = 'index_fixed';
            return { state: { status: 'completed', objectiveIndex: n, rewardClaimed: false }, warning: warning };
        }
        // active
        if (idx === null || idx < 0) { idx = 0; warning = 'index_fixed'; }
        if (idx >= n) { idx = n - 1; warning = 'index_fixed'; }
        return { state: { status: 'active', objectiveIndex: idx, rewardClaimed: false }, warning: warning };
    }

    function restore(data) {
        states.clear();
        if (!data || typeof data !== 'object' || Array.isArray(data)) { refreshAfterLoad(); return; }   // nạp save không tự ghi save
        Object.keys(data).forEach(id => {
            if (!def(id)) { console.warn('[StoryQuest] bỏ qua nhiệm vụ không tồn tại trong save:', id); return; }
            const r = sanitizeEntry(id, data[id]);
            if (r.warning) console.warn('[StoryQuest] dữ liệu nhiệm vụ "' + id + '" không hợp lệ (' + r.warning + ') — đã chuẩn hoá.');
            if (r.state) states.set(id, r.state);
        });
        refreshAfterLoad();
    }
    function refreshAfterLoad() {
        if (window.refreshQuestTracker) window.refreshQuestTracker();
        refreshMarkers();
    }

    // ------------------------------------------------------------------ UI: tracker (ui.js vẽ, đọc từ đây)
    function trackerLine(id) {
        const d = def(id), s = st(id), o = currentObjective(id);
        if (s.status === 'available') return { text: 'Gặp ' + d.giverName + ' để nhận nhiệm vụ', anchor: d.giver };
        if (s.status === 'completed') return { text: 'Nhận thưởng từ ' + d.giverName, anchor: d.giver };
        if (!o) return null;
        return { text: o.text + (objectiveAvailable(o) ? '' : ' (tạm thời chưa khả dụng)'), anchor: o.anchor };
    }
    function getTrackerEntries() {
        const out = [];
        Object.keys(STORY_QUEST_DEFINITIONS).forEach(id => {
            const s = st(id);
            if (s.status === 'rewarded') return;
            const line = trackerLine(id);
            if (!line) return;
            out.push({ id: id, title: STORY_QUEST_DEFINITIONS[id].title, line: line.text, status: s.status,
                step: s.status === 'active' ? (s.objectiveIndex + 1) + '/' + STORY_QUEST_DEFINITIONS[id].objectives.length : '' });
        });
        return out;
    }

    // Khoảng cách tới mục tiêu hiện tại — cập nhật 4 lần/giây, chỉ ghi DOM khi số mét đổi.
    let distTimer = 0;
    const lastDist = new Map();
    function updateDistances(dt) {
        distTimer -= dt;
        if (distTimer > 0) return;
        distTimer = 0.25;
        if (window.syncQuestTrackerVisibility) window.syncQuestTrackerVisibility();   // ui.js: ẩn tracker khi khung Thử Thách chiếm chỗ (cảm ứng)
        const p = window.player;
        if (!p || !p.position) return;
        Object.keys(STORY_QUEST_DEFINITIONS).forEach(id => {
            const s = st(id);
            const el = document.querySelector('.quest-tracker-item[data-story-quest="' + id + '"] .story-quest-distance');
            if (!el) return;
            const line = s.status === 'rewarded' ? null : trackerLine(id);
            const a = line && window.WorldPoi ? window.WorldPoi.getAnchor(line.anchor) : null;
            const text = a ? Math.max(0, Math.round(Math.hypot(a.x - p.position.x, a.z - p.position.z))) + ' m' : '';
            if (lastDist.get(id) !== text || el.textContent !== text) { lastDist.set(id, text); el.textContent = text; }
        });
    }

    // ------------------------------------------------------------------ UI: dấu mục tiêu 3D + dấu !/? trên NPC
    const marker = { group: null, diamond: null, beam: null, anchorKey: null, t: 0 };
    const npcMarker = { sprite: null, textures: {}, symbol: null };

    function ensureMarker() {
        if (marker.group || !window.scene) return;
        const g = new THREE.Group();
        const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0),
            new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.95, depthTest: false }));
        diamond.scale.set(1, 1.5, 1);
        diamond.renderOrder = 998;
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 14, 8, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.28, depthWrite: false }));
        beam.position.y = 7;
        g.add(diamond); g.add(beam);
        g.visible = false;
        g.traverse(o => { o.raycast = function () {}; });
        window.scene.add(g);
        marker.group = g; marker.diamond = diamond; marker.beam = beam;
    }
    function symbolTexture(symbol) {
        if (npcMarker.textures[symbol]) return npcMarker.textures[symbol];
        const c = document.createElement('canvas'); c.width = 64; c.height = 64;
        const ctx = c.getContext('2d');
        ctx.fillStyle = 'rgba(18,16,30,0.85)'; ctx.beginPath(); ctx.arc(32, 32, 28, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = '#fbbf24'; ctx.stroke();
        ctx.fillStyle = '#fcd34d'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(symbol, 32, 34);
        const tex = new THREE.CanvasTexture(c);
        npcMarker.textures[symbol] = tex;
        return tex;
    }
    function ensureNpcMarker() {
        if (npcMarker.sprite || !window.scene) return;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: symbolTexture('!'), transparent: true, depthTest: false }));
        sp.scale.set(0.7, 0.7, 0.7);
        sp.renderOrder = 997;
        sp.visible = false;
        sp.raycast = function () {};
        window.scene.add(sp);
        npcMarker.sprite = sp;
    }

    function refreshMarkers() {
        if (!initialized) return;
        ensureMarker(); ensureNpcMarker();
        // Alpha có đúng 1 nhiệm vụ chính -> 1 bộ dấu; nhiều nhiệm vụ sau này thì lặp theo từng nhiệm vụ.
        const id = Object.keys(STORY_QUEST_DEFINITIONS)[0], d = def(id), s = st(id);
        // Dấu trên NPC: '!' = có nhiệm vụ để nhận, '?' = đang chờ báo cáo / nhận thưởng.
        let symbol = null;
        const o = currentObjective(id);
        if (s.status === 'available') symbol = '!';
        else if (s.status === 'completed' || (o && o.type === 'talk')) symbol = '?';
        const giverAnchor = window.WorldPoi ? window.WorldPoi.getAnchor(d.giver) : null;
        if (npcMarker.sprite) {
            npcMarker.sprite.visible = !!(symbol && giverAnchor);
            if (symbol && npcMarker.symbol !== symbol) { npcMarker.sprite.material.map = symbolTexture(symbol); npcMarker.sprite.material.needsUpdate = true; npcMarker.symbol = symbol; }
            if (giverAnchor) npcMarker.sprite.position.set(giverAnchor.x, giverAnchor.y, giverAnchor.z);
        }
        // Dấu mục tiêu: chỉ khi đang làm nhiệm vụ (không hiện lúc chưa nhận — dấu '!' trên NPC đã đủ).
        const line = (s.status === 'active' || s.status === 'completed') ? trackerLine(id) : null;
        marker.anchorKey = line ? line.anchor : null;
        const a = marker.anchorKey && window.WorldPoi ? window.WorldPoi.getAnchor(marker.anchorKey) : null;
        if (marker.group) {
            marker.group.visible = !!a;
            if (a) marker.group.position.set(a.x, a.y, a.z);
        }
    }

    function update(dt) {
        if (!initialized) return;
        marker.t += dt;
        if (marker.group && marker.group.visible && marker.diamond) {
            marker.diamond.position.y = Math.sin(marker.t * 2.4) * 0.18;
            marker.diamond.rotation.y += dt * 1.6;
        }
        if (npcMarker.sprite && npcMarker.sprite.visible) {
            const a = window.WorldPoi && window.WorldPoi.getAnchor(STORY_QUEST_DEFINITIONS[Object.keys(STORY_QUEST_DEFINITIONS)[0]].giver);
            if (a) npcMarker.sprite.position.y = a.y + Math.sin(marker.t * 2.0) * 0.08;
        }
        updateDistances(dt);
    }

    // ------------------------------------------------------------------ UI: trang Nhiệm Vụ trong Paimon Menu
    let journalRoot = null;
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function injectJournalCss() {
        if (document.getElementById('quest-journal-style')) return;
        const css = document.createElement('style');
        css.id = 'quest-journal-style';
        css.textContent = [
            '#menu-content-quests{display:flex;flex-direction:column;gap:12px;color:#f7e8cf}',
            '#menu-content-quests.hidden{display:none}',
            '#menu-content-quests .qj-title{font-size:20px;font-weight:700;color:#ebdcb9;font-family:serif;border-bottom:1px solid rgba(45,40,79,.4);padding-bottom:8px}',
            '#menu-content-quests .qj-label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#9c94c0;font-weight:600;margin-top:4px}',
            '#menu-content-quests .qj-card{background:rgba(0,0,0,.22);border:1px solid rgba(251,191,36,.35);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px}',
            '#menu-content-quests .qj-card.qj-board{border-color:rgba(120,113,108,.5)}',
            '#menu-content-quests .qj-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}',
            '#menu-content-quests .qj-name{font-size:15px;font-weight:700;color:#fde68a}',
            '#menu-content-quests .qj-badge{font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px;border:1px solid;white-space:nowrap}',
            '#menu-content-quests .qj-badge.available{color:#fcd34d;border-color:rgba(252,211,77,.5);background:rgba(252,211,77,.08)}',
            '#menu-content-quests .qj-badge.active{color:#7dd3fc;border-color:rgba(125,211,252,.5);background:rgba(125,211,252,.08)}',
            '#menu-content-quests .qj-badge.completed{color:#86efac;border-color:rgba(134,239,172,.5);background:rgba(134,239,172,.08)}',
            '#menu-content-quests .qj-badge.rewarded{color:#a8a29e;border-color:rgba(168,162,158,.5)}',
            '#menu-content-quests .qj-summary{font-size:13px;line-height:1.5;color:#d6d3d1}',
            '#menu-content-quests .qj-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}',
            '#menu-content-quests .qj-steps li{font-size:13px;display:flex;gap:8px;align-items:flex-start;color:#a8a29e}',
            '#menu-content-quests .qj-steps li.done{color:#86efac;text-decoration:line-through;text-decoration-color:rgba(134,239,172,.5)}',
            '#menu-content-quests .qj-steps li.current{color:#fef3c7;font-weight:600}',
            '#menu-content-quests .qj-steps .qj-hint{display:block;font-size:12px;font-weight:400;color:#a8a29e}',
            '#menu-content-quests .qj-rewards{display:flex;flex-wrap:wrap;gap:6px}',
            '#menu-content-quests .qj-rewards span{font-size:12px;padding:2px 8px;border-radius:8px;background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.3);color:#bae6fd}',
            '#menu-content-quests .qj-empty{font-size:13px;color:#a8a29e}'
        ].join('\n');
        document.head.appendChild(css);
    }
    function ensureJournalRoot() {
        if (journalRoot && document.body.contains(journalRoot)) return journalRoot;
        const anchor = document.getElementById('menu-content-locked');
        if (!anchor || !anchor.parentNode) return null;
        injectJournalCss();
        journalRoot = document.createElement('div');
        journalRoot.id = 'menu-content-quests';
        journalRoot.className = 'hidden';
        anchor.parentNode.insertBefore(journalRoot, anchor);
        return journalRoot;
    }
    function rewardLabel(r) {
        if (r.type === 'primogem') return '+' + r.amount + ' Nguyên Thạch';
        if (r.type === 'exp') return '+' + r.amount + ' EXP';
        if (r.type === 'material') {
            const item = window.ITEM_DATABASE && window.ITEM_DATABASE[r.itemId];
            return '+' + r.amount + ' ' + (item ? item.name : r.itemId);
        }
        return '+' + r.amount + ' ' + r.type;
    }
    const BADGE = { available: 'Có thể nhận', active: 'Đang thực hiện', completed: 'Chờ nhận thưởng', rewarded: 'Đã hoàn thành' };

    function renderJournal() {
        const root = ensureJournalRoot();
        if (!root) return;
        let html = '<div class="qj-title">Nhiệm Vụ</div><div class="qj-label">Nhiệm vụ chính</div>';
        Object.keys(STORY_QUEST_DEFINITIONS).forEach(id => {
            const d = def(id), s = st(id);
            const steps = d.objectives.map((o, i) => {
                const done = s.status === 'completed' || s.status === 'rewarded' || (s.status === 'active' && i < s.objectiveIndex);
                const cur = s.status === 'active' && i === s.objectiveIndex;
                const icon = done ? 'fa-circle-check' : (cur ? 'fa-location-dot' : 'fa-circle');
                return '<li class="' + (done ? 'done' : (cur ? 'current' : '')) + '"><i class="fa-solid ' + icon + '"></i><span>' + esc(o.text) +
                    (cur && o.hint ? '<span class="qj-hint">' + esc(o.hint) + '</span>' : '') + '</span></li>';
            }).join('');
            html += '<div class="qj-card" data-quest="' + esc(id) + '"><div class="qj-head"><span class="qj-name">' + esc(d.title) + '</span>' +
                '<span class="qj-badge ' + s.status + '">' + BADGE[s.status] + '</span></div>' +
                '<div class="qj-summary">' + esc(d.summary) + '</div>' +
                (s.status === 'available' ? '<div class="qj-summary">Gặp <b>' + esc(d.giverName) + '</b> ở cửa Nam khu cắm trại để nhận nhiệm vụ.</div>' : '') +
                '<ul class="qj-steps">' + steps + '</ul>' +
                '<div class="qj-rewards">' + d.rewards.map(r => '<span>' + esc(rewardLabel(r)) + '</span>').join('') + '</div></div>';
        });
        html += '<div class="qj-label">Nhiệm vụ Hiệp hội</div>';
        const board = (window.activeQuests || []).filter(q => q && q.status !== 'turned_in');
        if (board.length === 0) html += '<div class="qj-empty">Chưa nhận nhiệm vụ nào — xem Bảng Nhiệm Vụ cạnh Katheryne.</div>';
        board.forEach(q => {
            const status = q.status === 'completed' ? 'completed' : 'active';
            html += '<div class="qj-card qj-board"><div class="qj-head"><span class="qj-name">' + esc(q.title) + '</span><span class="qj-badge ' + status + '">' +
                (status === 'completed' ? 'Chờ trả nhiệm vụ' : 'Đang thực hiện') + '</span></div><div class="qj-summary">' + esc(q.description || '') +
                ' — ' + esc(q.currentCount) + '/' + esc(q.targetCount) + '</div></div>';
        });
        root.innerHTML = html;
    }

    // ------------------------------------------------------------------ khởi tạo (1 lần)
    window.initStoryQuest = function () {
        if (initialized) return;
        initialized = true;
        registerDialogue();
        Object.keys(STORY_QUEST_DEFINITIONS).forEach(id => {
            const d = STORY_QUEST_DEFINITIONS[id];
            d.objectives.forEach(o => { if (OBJECTIVE_TYPES.indexOf(o.type) === -1) console.warn('[StoryQuest] loại mục tiêu lạ:', o.type); });
            st(id);
        });
        if (window.GameEvents) {
            ['world:enter', 'world:interacted', 'encounter:completed'].forEach(type => {
                const fn = function (payload) { onWorldEvent(type, payload); };
                offFns.push(window.GameEvents.on(type, fn));
            });
        }
        ensureJournalRoot();
        refreshAfterLoad();
    };

    window.collectStorySaveData = collect;
    window.restoreStorySaveData = restore;
    window.renderQuestJournal = renderJournal;

    window.StoryQuest = {
        DEFINITIONS: STORY_QUEST_DEFINITIONS,
        STATUSES: STATUSES,
        accept: accept,
        claimReward: claimReward,
        completeObjective: completeObjective,
        currentObjective: currentObjective,
        getState(id) { const s = st(id); return s ? Object.assign({}, s) : null; },
        getTrackerEntries: getTrackerEntries,
        dialogueStateFor: dialogueStateFor,
        handleNpcAction: handleNpcAction,
        sanitizeEntry(id, raw) { return def(id) ? sanitizeEntry(id, raw) : null; },
        collect: collect,
        restore: restore,
        update: update,
        renderJournal: renderJournal,
        get markerAnchor() { return marker.anchorKey; },
        get markerVisible() { return !!(marker.group && marker.group.visible); },
        get npcSymbol() { return npcMarker.sprite && npcMarker.sprite.visible ? npcMarker.symbol : null; },
        get initialized() { return initialized; },
        get sceneRoots() { return [marker.group, npcMarker.sprite].filter(Boolean); }
    };
})();
