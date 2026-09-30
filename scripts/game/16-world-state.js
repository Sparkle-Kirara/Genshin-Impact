// ============================================================
// Alpha M4 — WORLD STATE + SỰ KIỆN DÙNG CHUNG (GameEvents, WorldState, vùng khám phá, biên khu vực chơi)
// ============================================================
// Ba thứ nhỏ, tách riêng để thế giới / nhiệm vụ / save / UI nói chuyện với nhau mà không đụng ruột của nhau:
//
// 1. GameEvents — bus sự kiện tối giản (on / off / emit). Mỗi loại sự kiện giữ listener trong 1 Set: đăng ký
//    lại CÙNG 1 hàm là no-op (không bao giờ bị gọi 2 lần), lỗi của 1 listener bị cô lập (log, không chặn
//    listener khác). Sự kiện hiện có:
//      world:enter        { id }            người chơi vừa bước VÀO 1 vùng (mỗi lần vào, sườn lên)
//      world:discovered   { id, name }      lần ĐẦU vào vùng khám phá (1 lần mãi mãi, có lưu)
//      world:interacted   { id }            tương tác xong 1 vật thể thế giới (vd đọc xong bia đá) — mỗi lần
//      world:chestOpened  { id }            mở rương thế giới (1 lần mãi mãi)
//      encounter:started / encounter:completed / encounter:failed   { id, runId, ... } — phát từ 15-encounter
//      quest:accepted / quest:objectiveCompleted / quest:completed / quest:rewarded — phát từ 18-story-quest
//
// 2. WorldState — NGUỒN SỰ THẬT DUY NHẤT cho tiến trình thế giới cần giữ qua reload: vùng đã khám phá
//    (discovered), vật thể đã kích hoạt (activated — vd bia đá đã đọc), rương thế giới đã mở (opened).
//    Chỉ nhận id có trong danh mục đăng ký (registerId) -> save lạ/hỏng không thể bơm id rác vào world.
//    Save v2 đọc/ghi qua collect()/restore(); không nơi nào khác giữ bản sao các cờ này.
//
// 3. Vùng (zones) + biên khu vực chơi — kiểm tra vị trí người chơi 5 lần/giây (không phải mỗi frame), phát
//    world:enter khi đi từ ngoài vào trong (sườn lên) và world:discovered lần đầu. Biên khu vực chơi: người
//    chơi bị giữ trong ±PLAY_AREA_LIMIT (trước đây đi ra ±50 là rơi xuống Void rồi teleport — KI-205).
(function () {
    'use strict';

    // ------------------------------------------------------------------ 1. GameEvents
    const listeners = new Map();   // type -> Set<fn>
    const GameEvents = {
        on(type, fn) {
            if (typeof type !== 'string' || typeof fn !== 'function') return function () {};
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
            return function () { GameEvents.off(type, fn); };
        },
        off(type, fn) {
            const set = listeners.get(type);
            if (set) { set.delete(fn); if (set.size === 0) listeners.delete(type); }
        },
        emit(type, payload) {
            const set = listeners.get(type);
            if (!set || set.size === 0) return 0;
            let called = 0;
            Array.from(set).forEach(fn => {   // bản sao: listener tự huỷ đăng ký giữa chừng vẫn an toàn
                try { fn(payload || {}); called++; }
                catch (e) { console.warn('[GameEvents] listener lỗi cho "' + type + '":', e); }
            });
            return called;
        },
        listenerCount(type) {
            if (type) { const set = listeners.get(type); return set ? set.size : 0; }
            let n = 0; listeners.forEach(set => { n += set.size; }); return n;
        }
    };
    window.GameEvents = GameEvents;

    // ------------------------------------------------------------------ 2. WorldState
    const CATEGORIES = ['discovered', 'activated', 'opened'];
    const state = { discovered: new Set(), activated: new Set(), opened: new Set() };
    const knownIds = { discovered: new Set(), activated: new Set(), opened: new Set() };
    const ID_RE = /^[a-z0-9_]{1,48}$/;

    function mark(category, id) {
        if (!knownIds[category] || !knownIds[category].has(id)) {
            console.warn('[WorldState] id chưa đăng ký (' + category + '):', id);
            return false;
        }
        if (state[category].has(id)) return false;          // idempotent: lần 2 không đổi gì
        state[category].add(id);
        if (window.requestSave) window.requestSave();
        return true;
    }

    const WorldState = {
        // Danh mục id hợp lệ theo từng loại — gọi bởi 17-world-poi.js lúc dựng thế giới.
        registerId(category, id) {
            if (CATEGORIES.indexOf(category) === -1 || typeof id !== 'string' || !ID_RE.test(id)) return false;
            knownIds[category].add(id);
            return true;
        },
        discover(id) { return mark('discovered', id); },
        activate(id) { return mark('activated', id); },
        markOpened(id) { return mark('opened', id); },
        isDiscovered(id) { return state.discovered.has(id); },
        isActivated(id) { return state.activated.has(id); },
        isOpened(id) { return state.opened.has(id); },
        // Save v2 — mảng đã sắp xếp (ổn định giữa các lần lưu, dễ so sánh).
        collect() {
            const out = {};
            CATEGORIES.forEach(c => { out[c] = Array.from(state[c]).sort(); });
            return out;
        },
        // Nạp từ save: chỉ nhận chuỗi là id ĐÃ đăng ký; mọi thứ khác bị bỏ (trả về số mục bị bỏ để log).
        restore(data) {
            let dropped = 0;
            CATEGORIES.forEach(c => {
                state[c].clear();
                const list = data && Array.isArray(data[c]) ? data[c] : [];
                list.forEach(id => {
                    if (typeof id === 'string' && knownIds[c].has(id)) state[c].add(id);
                    else dropped++;
                });
            });
            if (dropped) console.warn('[WorldState] bỏ qua', dropped, 'id thế giới không hợp lệ trong save.');
            if (window.WorldPoi && window.WorldPoi.syncFromState) window.WorldPoi.syncFromState();
            return dropped;
        },
        knownIds(category) { return knownIds[category] ? Array.from(knownIds[category]) : []; },
        // ---- vùng
        registerZone: registerZone,
        isInsideZone(id) { const z = zones.get(id); return !!(z && z.inside); },
        getZone(id) { const z = zones.get(id); return z ? { id: z.id, name: z.name, x: z.x, z: z.z, radius: z.radius, minY: z.minY, inside: z.inside } : null; },
        zoneIds() { return Array.from(zones.keys()); },
        PLAY_AREA_LIMIT: 47
    };
    window.WorldState = WorldState;

    // ------------------------------------------------------------------ 3. Vùng + biên khu vực chơi
    // zone: { id, name, x, z, radius, minY?, discover (bool), notify (bool) }
    const zones = new Map();
    function registerZone(def) {
        if (!def || typeof def.id !== 'string' || !ID_RE.test(def.id)) return false;
        if (!(def.radius > 0) || !isFinite(def.x) || !isFinite(def.z)) return false;
        zones.set(def.id, {
            id: def.id, name: String(def.name || def.id), x: def.x, z: def.z, radius: def.radius,
            minY: (typeof def.minY === 'number') ? def.minY : null, discover: def.discover !== false,
            inside: false
        });
        if (def.discover !== false) knownIds.discovered.add(def.id);
        return true;
    }

    const ZONE_INTERVAL = 0.2;     // s — 5 lần/giây
    let zoneTimer = 0;
    function updateZones(dt) {
        zoneTimer -= dt;
        if (zoneTimer > 0) return;
        zoneTimer = ZONE_INTERVAL;
        const p = window.player;
        if (!p || !p.position || p.isDead) return;
        zones.forEach(z => {
            const dx = p.position.x - z.x, dz = p.position.z - z.z;
            const inside = (dx * dx + dz * dz) <= z.radius * z.radius && (z.minY === null || p.position.y >= z.minY);
            if (inside && !z.inside) {
                z.inside = true;
                GameEvents.emit('world:enter', { id: z.id });
                if (z.discover && WorldState.discover(z.id)) {
                    if (window.showRewardPopup) window.showRewardPopup('fa-solid fa-compass text-amber-300', 'Khám phá: ' + z.name);
                    GameEvents.emit('world:discovered', { id: z.id, name: z.name });
                }
            } else if (!inside && z.inside) {
                z.inside = false;
            }
        });
    }

    // Biên khu vực chơi — gọi từ updatePhysics() (08) SAU khi đã cộng vận tốc ngang + va chạm ngang.
    // Trả về true nếu vừa phải giữ người chơi lại (để 08 bỏ vận tốc ngang hướng ra ngoài).
    let edgeHintCooldown = 0;
    function clampPlayerToPlayArea(p) {
        if (!p || !p.position) return false;
        const L = WorldState.PLAY_AREA_LIMIT;
        let clamped = false;
        if (p.position.x > L) { p.position.x = L; if (p.velocity.x > 0) p.velocity.x = 0; clamped = true; }
        else if (p.position.x < -L) { p.position.x = -L; if (p.velocity.x < 0) p.velocity.x = 0; clamped = true; }
        if (p.position.z > L) { p.position.z = L; if (p.velocity.z > 0) p.velocity.z = 0; clamped = true; }
        else if (p.position.z < -L) { p.position.z = -L; if (p.velocity.z < 0) p.velocity.z = 0; clamped = true; }
        if (clamped && edgeHintCooldown <= 0) {
            edgeHintCooldown = 5.0;
            if (window.showRewardPopup) window.showRewardPopup('fa-solid fa-mountain text-stone-300', 'Phía trước là vực sâu — hãy quay lại.');
        }
        return clamped;
    }
    window.clampPlayerToPlayArea = clampPlayerToPlayArea;

    // Gọi 1 lần/frame từ animate() (08), trong nhánh dt > 0 — không làm gì khi game đang pause.
    window.updateWorld = function (dt) {
        if (!(dt > 0)) return;
        if (edgeHintCooldown > 0) edgeHintCooldown -= dt;
        updateZones(dt);
        if (window.WorldPoi && window.WorldPoi.update) window.WorldPoi.update(dt);
        if (window.StoryQuest && window.StoryQuest.update) window.StoryQuest.update(dt);
    };
})();
