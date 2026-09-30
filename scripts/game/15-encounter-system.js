// ============================================================
// Alpha M3 — ENCOUNTER LOOP (World → Bắt đầu → Giao chiến → Thắng/Thua → Thưởng/Reset → Tiếp tục)
// ============================================================
// Dữ liệu: window.ENCOUNTER_DEFINITIONS (game/13-enemy-definitions.js). Quái: EnemyFramework.spawnFieldEnemy
// (game/14-enemy-framework.js). File này KHÔNG tự gây damage, KHÔNG tự cộng đồ — chỉ điều phối:
//   - Trạng thái: inactive → starting → active → completing → completed ; starting/active → failed ;
//                 mọi trạng thái (trừ inactive) → resetting → inactive (resetting chỉ tồn tại trong reset()).
//     Chuyển trạng thái không hợp lệ bị chặn (xem ENCOUNTER_TRANSITIONS) -> không thể "thắng" khi đang failed, không
//     khởi động chồng khi đang starting/active/completing.
//   - Theo dõi: CHỈ quái do encounter này spawn (Map theo id -> đăng ký trùng không làm tăng số). Chết = sự kiện
//     onDeath của quái (idempotent, lọc theo runId để bỏ sự kiện muộn của lượt cũ). Quái biến mất ngoài ý muốn
//     (bị gỡ khỏi enemies[], bị dispose, despawn) được quét 4 lần/giây và tính là "đã rời trận" -> encounter không
//     bao giờ kẹt ở active. Hết quái mà không hạ được con nào -> tự reset (không thưởng).
//   - Thắng: đúng 1 lần/lượt (completing → completed), thưởng qua REWARD_HANDLERS có sẵn; thưởng lần đầu
//     (firstClear) có cờ lưu trong save (key tuỳ chọn `encounters`, save v1 giữ nguyên version) -> thử lại hay reload
//     không nhận lại. Cờ được đặt TRƯỚC khi gọi handler nên lần autosave (debounce) nào cũng thấy cả 2 cùng lúc.
//   - Thua: người chơi gục (player.isDead — hệ thống chết/hồi sinh có sẵn, không thêm phạt) hoặc rời vùng đấu quá
//     leaveGrace giây -> dọn quái, hiện kết quả, cột sáng cho thử lại.
//   - Không khoá thế giới: không tường chắn, không khoá input; mọi thao tác dọn dẹp chạy trong updateEncounters()
//     (SAU vòng update quái của animate()) hoặc từ input — không bao giờ sửa enemies[] giữa vòng duyệt.
// Kích hoạt: cột sáng (Interactable) — phím F / nút chạm tương tác sẵn có (interactWithNearbyObject). Trong lúc
// starting/active/completing cột sáng tắt tương tác (bán kính 0) -> không kích hoạt lặp.
(function () {
    'use strict';

    const ENCOUNTER_TRANSITIONS = {
        inactive: ['starting'],
        starting: ['active', 'failed', 'resetting'],
        active: ['completing', 'failed', 'resetting'],
        completing: ['completed', 'resetting'],
        completed: ['resetting'],
        failed: ['resetting'],
        resetting: ['inactive']
    };
    const COMPLETING_DELAY = 1.0;   // s — để hiệu ứng chết chạy xong rồi mới hiện chiến thắng + thưởng
    const START_TIMEOUT = 4.0;      // s — trần thời gian ở 'starting'
    const SWEEP_INTERVAL = 0.25;    // s — dò quái mất tích (4 lần/giây)
    const RESULT_SHOW_TIME = 7.0;   // s — thẻ kết quả (chiến thắng / thất bại)
    const INTERACT_COOLDOWN = 1.0;  // s (thời gian thật) — bỏ qua tương tác ngay sau khi đổi trạng thái (F tự lặp khi giữ)
    const BEACON_RADIUS = 2.6;
    const WORLD_LIMIT = 45;
    const ROLE_ICONS = { melee: 'fa-hand-fist', ranged: 'fa-crosshairs', heavy: 'fa-hammer' };
    const REWARD_LABELS = { primogem: 'Nguyên Thạch', exp: 'EXP' };

    function nowSec() { return performance.now() / 1000; }
    function isNum(v, min, max) { return typeof v === 'number' && isFinite(v) && v >= min && v <= max; }
    function clampWorld(v) { return Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, v)); }
    function hDist(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
    function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function noRaycast() { /* trang trí cột sáng không chặn tia ngắm */ }

    // ------------------------------------------------------------------ chuẩn hoá định nghĩa
    // { def, warnings, error } — def = null (kèm error) khi không thể chạy: không phải object / không có spawn hợp lệ.
    function normalizeEncounterDefinition(raw, id) {
        const warnings = [];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { def: null, warnings: warnings, error: 'definition_not_object' };
        const def = { id: String(id || raw.id || ''), name: 'Thử Thách', beacon: null, arena: null, spawnInterval: 0.35, spawns: [], completion: 'defeat_all', rewards: { firstClear: [], repeat: [] } };
        if (!def.id) return { def: null, warnings: warnings, error: 'missing_id' };
        if (raw.name !== undefined) { if (typeof raw.name === 'string' && raw.name.trim()) def.name = raw.name.trim(); else warnings.push('name invalid'); }
        const EF = window.EnemyFramework;
        if (!Array.isArray(raw.spawns) || raw.spawns.length === 0) return { def: null, warnings: warnings, error: 'no_spawns' };
        raw.spawns.forEach((s, i) => {
            if (!s || typeof s !== 'object') { warnings.push('spawns[' + i + '] not an object'); return; }
            if (!EF || !EF.getEnemyDefinition(s.enemyId)) { warnings.push('spawns[' + i + '].enemyId "' + s.enemyId + '" unknown'); return; }
            if (!isNum(s.x, -1e6, 1e6) || !isNum(s.z, -1e6, 1e6)) { warnings.push('spawns[' + i + '] position invalid'); return; }
            def.spawns.push({ enemyId: s.enemyId, x: clampWorld(s.x), z: clampWorld(s.z) });
        });
        if (def.spawns.length === 0) return { def: null, warnings: warnings, error: 'no_valid_spawns' };
        const a = (raw.arena && typeof raw.arena === 'object') ? raw.arena : {};
        const avgX = def.spawns.reduce((t, s) => t + s.x, 0) / def.spawns.length;
        const avgZ = def.spawns.reduce((t, s) => t + s.z, 0) / def.spawns.length;
        def.arena = {
            x: isNum(a.x, -WORLD_LIMIT, WORLD_LIMIT) ? a.x : avgX,
            z: isNum(a.z, -WORLD_LIMIT, WORLD_LIMIT) ? a.z : avgZ,
            leaveRadius: isNum(a.leaveRadius, 5, 90) ? a.leaveRadius : 24,
            leaveGrace: isNum(a.leaveGrace, 1, 60) ? a.leaveGrace : 6
        };
        // Vùng di chuyển của quái (<= leaveRadius); thiếu/sai -> = leaveRadius (hành vi cũ).
        def.arena.fightRadius = isNum(a.fightRadius, 4, def.arena.leaveRadius) ? a.fightRadius : def.arena.leaveRadius;
        ['x', 'z', 'leaveRadius', 'leaveGrace', 'fightRadius'].forEach(k => { if (a[k] !== undefined && a[k] !== def.arena[k]) warnings.push('arena.' + k + ' invalid'); });
        if (raw.beacon !== undefined) {
            const b = raw.beacon;
            if (b && isNum(b.x, -WORLD_LIMIT, WORLD_LIMIT) && isNum(b.z, -WORLD_LIMIT, WORLD_LIMIT)) def.beacon = { x: b.x, z: b.z };
            else warnings.push('beacon invalid (không có cột sáng — chỉ khởi động qua EncounterSystem.start)');
        }
        if (raw.spawnInterval !== undefined) { if (isNum(raw.spawnInterval, 0, 5)) def.spawnInterval = raw.spawnInterval; else warnings.push('spawnInterval invalid'); }
        if (raw.completion !== undefined && raw.completion !== 'defeat_all') warnings.push('completion "' + raw.completion + '" unsupported -> defeat_all');
        const r = (raw.rewards && typeof raw.rewards === 'object') ? raw.rewards : {};
        const handlers = window.REWARD_HANDLERS || {};
        ['firstClear', 'repeat'].forEach(k => {
            if (r[k] === undefined) return;
            if (!Array.isArray(r[k])) { warnings.push('rewards.' + k + ' not an array'); return; }
            r[k].forEach((it, i) => {
                const tag = 'rewards.' + k + '[' + i + ']';
                if (!it || typeof it.type !== 'string' || typeof handlers[it.type] !== 'function') { warnings.push(tag + ' type unknown'); return; }
                if (!isNum(it.amount, 1, 1e6)) { warnings.push(tag + ' amount invalid'); return; }
                if (it.type === 'material') {
                    if (!(window.ITEM_DATABASE && typeof it.itemId === 'string' && window.ITEM_DATABASE[it.itemId])) { warnings.push(tag + ' itemId invalid'); return; }
                    def.rewards[k].push({ type: 'material', amount: Math.floor(it.amount), itemId: it.itemId });
                } else {
                    def.rewards[k].push({ type: it.type, amount: Math.floor(it.amount) });
                }
            });
        });
        return { def: def, warnings: warnings, error: null };
    }

    // ------------------------------------------------------------------ dữ liệu bền (save)
    const persistent = new Map();   // id -> { firstClearClaimed, clears }
    function getPersistent(id) {
        if (!persistent.has(id)) persistent.set(id, { firstClearClaimed: false, clears: 0 });
        return persistent.get(id);
    }
    // Chỉ ghi encounter có tiến trình -> save của người chưa từng thắng không đổi hình dạng gì.
    function collectEncounterSaveData() {
        const out = {};
        persistent.forEach((p, id) => { if (p.firstClearClaimed || p.clears > 0) out[id] = { firstClearClaimed: !!p.firstClearClaimed, clears: p.clears | 0 }; });
        return out;
    }
    function restoreEncounterSaveData(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return;
        Object.keys(data).forEach(id => {
            const d = data[id];
            if (!d || typeof d !== 'object') return;
            const p = getPersistent(id);
            if (typeof d.firstClearClaimed === 'boolean') p.firstClearClaimed = d.firstClearClaimed;
            if (isNum(d.clears, 0, 1e9)) p.clears = Math.floor(d.clears);
        });
    }

    // ------------------------------------------------------------------ runtime
    const runtimes = new Map();
    const warnedInvalid = new Set();

    function getRuntime(id) {
        if (typeof id !== 'string') return null;
        if (runtimes.has(id)) return runtimes.get(id);
        const table = window.ENCOUNTER_DEFINITIONS || {};
        if (!Object.prototype.hasOwnProperty.call(table, id)) return null;
        const res = normalizeEncounterDefinition(table[id], id);
        if ((res.warnings.length || !res.def) && !warnedInvalid.has(id)) {
            warnedInvalid.add(id);
            console.warn('[Encounter] ' + id + (res.def ? ': bỏ qua/điền mặc định — ' : ' KHÔNG hợp lệ (' + res.error + ') — ') + res.warnings.join('; '));
        }
        if (!res.def) return null;
        const rt = createRuntime(res.def);
        runtimes.set(id, rt);
        return rt;
    }

    function createRuntime(def) {
        const EF = window.EnemyFramework;
        return {
            id: def.id, def: def, state: 'inactive', stateTime: 0, stateChangedAt: 0, runId: 0,
            members: new Map(), defeated: new Set(), removed: new Set(), spawnSlots: [],
            spawnIndex: 0, spawnTimer: 0, sweepTimer: 0, leaveTimer: 0,
            failReason: null, rewardGrantedRunId: 0, lastRewards: [], lastRewardFirstClear: false, resultTimer: 0,
            spawnInfo: def.spawns.map(s => { const d = EF.getEnemyDefinition(s.enemyId); return { name: d.name, role: d.role, archetype: d.archetype }; }),
            beacon: null,
            stats: { starts: 0, spawned: 0, registrations: 0, completions: 0, rewardGrants: 0, failures: 0, resets: 0, aborts: 0, rejectedTransitions: 0 }
        };
    }

    function setState(rt, next) {
        const allowed = ENCOUNTER_TRANSITIONS[rt.state] || [];
        if (allowed.indexOf(next) === -1) { rt.stats.rejectedTransitions++; return false; }
        rt.state = next;
        rt.stateTime = 0;
        rt.stateChangedAt = nowSec();
        return true;
    }

    function totalCount(rt) { return (rt.def.spawns.length - rt.spawnIndex) + rt.members.size + (rt.spawnSlots.filter(s => s === 'failed').length); }
    function remainingCount(rt) { return Math.max(0, totalCount(rt) - rt.defeated.size - rt.removed.size); }

    function clearRun(rt) {
        rt.members.clear(); rt.defeated.clear(); rt.removed.clear(); rt.spawnSlots = [];
        rt.spawnIndex = 0; rt.spawnTimer = 0; rt.sweepTimer = 0; rt.leaveTimer = 0; rt.resultTimer = 0;
    }

    // Bắt đầu 1 lượt. Trả { ok, reason?, runId? } — không bao giờ ném lỗi.
    function start(id) {
        const rt = getRuntime(id);
        if (!rt) return { ok: false, reason: 'invalid_definition' };
        if (rt.state === 'starting' || rt.state === 'active' || rt.state === 'completing') return { ok: false, reason: 'busy' };
        const p = window.player;
        if (!p || p.isDead) return { ok: false, reason: 'player_unavailable' };
        if (!window.EnemyFramework || !window.enemies) return { ok: false, reason: 'framework_missing' };
        if (rt.state === 'completed' || rt.state === 'failed') resetRuntime(rt, 'restart');
        if (rt.state !== 'inactive') return { ok: false, reason: 'state_' + rt.state };
        clearRun(rt);
        rt.runId++;
        rt.failReason = null;
        rt.lastRewards = [];
        rt.lastRewardFirstClear = false;
        setState(rt, 'starting');
        rt.stats.starts++;
        spawnNext(rt);   // con đầu tiên xuất hiện ngay, các con sau cách nhau spawnInterval
        emitEncounter('encounter:started', rt);
        return { ok: true, runId: rt.runId };
    }

    function spawnNext(rt) {
        if (rt.spawnIndex >= rt.def.spawns.length) return null;
        const slot = rt.spawnIndex++;
        const s = rt.def.spawns[slot];
        const a = rt.def.arena;
        const p = window.player;
        const facing = p ? Math.atan2(p.position.x - s.x, p.position.z - s.z) : 0;
        const enemy = window.EnemyFramework.spawnFieldEnemy(s.enemyId, s.x, s.z, {
            alerted: true, homeX: a.x, homeZ: a.z, leashRange: a.leaveRadius + 2, moveRadius: a.fightRadius, facing: facing
        });
        rt.stats.spawned++;
        if (!enemy) { rt.spawnSlots[slot] = 'failed'; rt.removed.add('slot' + slot); return null; }
        rt.spawnSlots[slot] = enemy.id;
        register(rt, enemy);
        return enemy;
    }

    // Đăng ký 1 quái vào lượt hiện tại — trùng id / sai lượt / sai trạng thái -> bỏ qua (không tăng số).
    function register(rt, enemy) {
        if (!rt || !enemy || !enemy.isFieldEnemy || enemy.disposed) return false;
        if (rt.state !== 'starting' && rt.state !== 'active') return false;
        if (rt.members.has(enemy.id)) return false;
        if (enemy.encounterId && (enemy.encounterId !== rt.id || enemy.encounterRunId !== rt.runId)) return false;
        enemy.encounterId = rt.id;
        enemy.encounterRunId = rt.runId;
        rt.members.set(enemy.id, enemy);
        const runId = rt.runId;
        enemy.onDeath(e => onMemberDefeated(rt, e, runId));
        rt.stats.registrations++;
        return true;
    }

    // Callback chết của quái: CHỈ ghi nhận (idempotent) — quyết định thắng/thua để updateRuntime() xử lý sau vòng quái.
    function onMemberDefeated(rt, enemy, runId) {
        if (runId !== rt.runId || !rt.members.has(enemy.id)) return;
        if (rt.defeated.has(enemy.id) || rt.removed.has(enemy.id)) return;
        rt.defeated.add(enemy.id);
    }

    // Quái của lượt này không còn trong world (gỡ khỏi enemies[], dispose, despawn) mà không có sự kiện chết.
    function sweep(rt) {
        rt.members.forEach((e, id) => {
            if (rt.defeated.has(id) || rt.removed.has(id)) return;
            if (e.deathHandled) { rt.defeated.add(id); return; }
            if (e.disposed || e.lifecycle === 'despawned' || window.enemies.indexOf(e) === -1) { rt.removed.add(id); }
        });
    }

    function despawnMembers(rt, reason) {
        rt.members.forEach(e => {
            if (e.disposed) return;
            e.despawn(reason);
            const i = window.enemies.indexOf(e);
            if (i !== -1) window.enemies.splice(i, 1);
            e.dispose();
        });
    }

    function fail(rt, reason) {
        if (!setState(rt, 'failed')) return false;
        rt.failReason = reason;
        rt.stats.failures++;
        rt.resultTimer = RESULT_SHOW_TIME;
        rt.spawnIndex = rt.def.spawns.length;
        despawnMembers(rt, 'encounter_failed');
        emitEncounter('encounter:failed', rt, { reason: reason });
        return true;
    }

    // Alpha M6: báo cho hệ khác (nhiệm vụ...) qua GameEvents — CHỈ thông báo, không ai sửa encounter qua đây.
    // runId đi kèm để bên nghe tự chống xử lý trùng.
    function emitEncounter(type, rt, extra) {
        if (!window.GameEvents) return;
        window.GameEvents.emit(type, Object.assign({ id: rt.id, runId: rt.runId }, extra || {}));
    }

    function resetRuntime(rt, reason) {
        if (rt.state === 'inactive') { despawnMembers(rt, reason || 'reset'); clearRun(rt); return true; }
        if (!setState(rt, 'resetting')) return false;
        despawnMembers(rt, reason || 'reset');
        clearRun(rt);
        rt.runId++;          // sự kiện chết muộn của lượt cũ bị bỏ qua
        rt.stats.resets++;
        setState(rt, 'inactive');
        return true;
    }

    // Thưởng hoàn thành — tối đa 1 lần/lượt; firstClear chỉ 1 lần/save. Đi qua REWARD_HANDLERS có sẵn.
    function grantRewards(rt) {
        if (rt.rewardGrantedRunId === rt.runId) return false;
        rt.rewardGrantedRunId = rt.runId;
        const p = getPersistent(rt.id);
        const first = !p.firstClearClaimed;
        const list = first ? rt.def.rewards.firstClear : rt.def.rewards.repeat;
        if (first) p.firstClearClaimed = true;   // đặt TRƯỚC khi phát thưởng (cùng 1 lần autosave)
        p.clears = (p.clears || 0) + 1;
        rt.lastRewards = [];
        rt.lastRewardFirstClear = first;
        const handlers = window.REWARD_HANDLERS || {};
        list.forEach(r => {
            const h = handlers[r.type];
            if (typeof h !== 'function') return;
            h(r.amount, r);
            rt.lastRewards.push(r);
        });
        rt.stats.rewardGrants++;
        rt.stats.completions++;
        if (window.requestSave) window.requestSave();
        return true;
    }

    function updateRuntime(rt, dt) {
        rt.stateTime += dt;
        const p = window.player;
        if (rt.state === 'starting') {
            if (p && p.isDead) { fail(rt, 'defeat'); return; }
            rt.spawnTimer += dt;
            while (rt.spawnIndex < rt.def.spawns.length && rt.spawnTimer >= rt.def.spawnInterval) {
                rt.spawnTimer -= rt.def.spawnInterval;
                spawnNext(rt);
            }
            sweep(rt);
            if (rt.spawnIndex >= rt.def.spawns.length) {
                let ready = true;
                rt.members.forEach(e => { if (e.lifecycle === 'spawning') ready = false; });
                if (ready || rt.stateTime >= START_TIMEOUT) setState(rt, 'active');
            }
        } else if (rt.state === 'active') {
            if (p && p.isDead) { fail(rt, 'defeat'); return; }
            rt.sweepTimer -= dt;
            if (rt.sweepTimer <= 0) { rt.sweepTimer = SWEEP_INTERVAL; sweep(rt); }
            if (p) {
                if (hDist(p.position, rt.def.arena) > rt.def.arena.leaveRadius) {
                    rt.leaveTimer += dt;
                    if (rt.leaveTimer >= rt.def.arena.leaveGrace) { fail(rt, 'left_area'); return; }
                } else {
                    rt.leaveTimer = 0;
                }
            }
            if (remainingCount(rt) <= 0) {
                if (rt.defeated.size > 0) setState(rt, 'completing');
                else { rt.stats.aborts++; resetRuntime(rt, 'no_enemies_left'); }
            }
        } else if (rt.state === 'completing') {
            if (rt.stateTime >= COMPLETING_DELAY) {
                grantRewards(rt);
                setState(rt, 'completed');
                rt.resultTimer = RESULT_SHOW_TIME;
                emitEncounter('encounter:completed', rt, { firstClear: rt.lastRewardFirstClear === true });
            }
        } else if ((rt.state === 'completed' || rt.state === 'failed') && rt.resultTimer > 0) {
            // Đang ở màn hình gục (thua) -> giữ thẻ kết quả tới sau khi hồi sinh để người chơi kịp đọc.
            if (!(p && p.isDead)) rt.resultTimer = Math.max(0, rt.resultTimer - dt);
        }
    }

    function updateEncounters(dt) {
        if (!(dt > 0)) return;
        runtimes.forEach(rt => updateRuntime(rt, dt));
        renderHud();
    }

    // ------------------------------------------------------------------ cột sáng bắt đầu (Interactable)
    const BEACON_COLORS = { ready: 0xfbbf24, busy: 0xef4444, done: 0x4ade80 };
    class EncounterBeacon extends Interactable {
        constructor(rt) {
            const b = rt.def.beacon;
            const gy = (typeof getTerrainHeight === 'function') ? getTerrainHeight(b.x, b.z) : 0;
            super(new THREE.Vector3(b.x, gy, b.z), '', BEACON_RADIUS);
            this.encounterId = rt.id;
            this.isEncounterBeacon = true;
            this.visualState = null;
            this.t = 0;
            this.buildMesh(gy);
        }
        buildMesh(gy) {
            const g = new THREE.Group();
            g.position.set(this.position.x, gy, this.position.z);
            const stone = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.95 });
            const stoneLight = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.9 });
            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 0.45, 8), stone);
            base.position.y = 0.225; base.castShadow = true; base.receiveShadow = true; g.add(base);
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.5, 0.38), stoneLight);
            pillar.position.y = 1.2; pillar.castShadow = true; g.add(pillar);
            this.runeMat = new THREE.MeshBasicMaterial({ color: BEACON_COLORS.ready });
            [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(a => {
                const rune = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.02), this.runeMat);
                rune.position.set(Math.sin(a) * 0.2, 1.2, Math.cos(a) * 0.2); rune.rotation.y = a; g.add(rune);
            });
            this.crystalMat = new THREE.MeshStandardMaterial({ color: BEACON_COLORS.ready, emissive: BEACON_COLORS.ready, emissiveIntensity: 0.9, roughness: 0.3 });
            this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), this.crystalMat);
            this.crystal.position.y = 2.35; g.add(this.crystal);
            // Cột sáng cao — nhìn thấy từ xa (đi từ điểm spawn về phía Nam là thấy).
            this.beamMat = new THREE.MeshBasicMaterial({ color: BEACON_COLORS.ready, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
            const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 9, 10, 1, true), this.beamMat);
            beam.position.y = 2.35 + 4.5; beam.raycast = noRaycast; g.add(beam);
            this.ringMat = new THREE.MeshBasicMaterial({ color: BEACON_COLORS.ready, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
            const ring = new THREE.Mesh(new THREE.RingGeometry(BEACON_RADIUS - 0.2, BEACON_RADIUS, 40), this.ringMat);
            ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07; ring.raycast = noRaycast; g.add(ring);
            window.scene.add(g);
            this.mesh = g;
        }
        getPromptText() {
            const rt = runtimes.get(this.encounterId);
            if (!rt) return '';
            const verb = (rt.state === 'completed' || rt.state === 'failed') ? 'thử lại' : 'bắt đầu';
            return 'Nhấn F để ' + verb + ': ' + rt.def.name;
        }
        onInteract() {
            const rt = runtimes.get(this.encounterId);
            if (!rt) return;
            if (nowSec() - rt.stateChangedAt < INTERACT_COOLDOWN) return;   // F tự lặp khi giữ / chạm 2 lần
            if (rt.state === 'inactive' || rt.state === 'completed' || rt.state === 'failed') start(this.encounterId);
        }
        update(dt) {
            const rt = runtimes.get(this.encounterId);
            const state = rt ? rt.state : 'inactive';
            const busy = state === 'starting' || state === 'active' || state === 'completing' || state === 'resetting';
            this.interactionRadius = busy ? 0 : BEACON_RADIUS;
            const look = busy ? 'busy' : (state === 'completed' ? 'done' : 'ready');
            if (look !== this.visualState) {
                this.visualState = look;
                const c = BEACON_COLORS[look];
                this.runeMat.color.setHex(c); this.crystalMat.color.setHex(c); this.crystalMat.emissive.setHex(c);
                this.beamMat.color.setHex(c); this.ringMat.color.setHex(c);
                this.ringMat.opacity = busy ? 0.15 : 0.45;
            }
            this.t += dt;
            this.crystal.rotation.y += dt * 1.6;
            this.crystal.position.y = 2.35 + Math.sin(this.t * 2) * 0.12;
            this.beamMat.opacity = 0.16 + 0.08 * (0.5 + 0.5 * Math.sin(this.t * 2.5));
        }
    }

    // ------------------------------------------------------------------ HUD (DOM nhẹ, chỉ ghi khi đổi nội dung)
    const HUD_CSS = [
        '#encounter-hud{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:32;pointer-events:none;',
        'width:max-content;max-width:min(460px,calc(100vw - 200px));min-width:220px;}',
        '#encounter-hud.enc-hidden{display:none;}',
        '#encounter-hud .enc-card{background:rgba(18,16,30,0.88);border:1px solid rgba(251,191,36,0.55);border-radius:12px;',
        'padding:8px 14px;box-shadow:0 6px 18px rgba(0,0,0,0.45);text-align:center;color:#fef3c7;}',
        '#encounter-hud .enc-title{font-size:14px;font-weight:700;letter-spacing:0.04em;color:#fde68a;}',
        '#encounter-hud .enc-title i,#encounter-hud .enc-result-title i{margin-right:6px;}',
        '#encounter-hud .enc-sub{font-size:13px;font-weight:600;margin-top:2px;color:#f5f5f4;}',
        '#encounter-hud .enc-sub.enc-warn{color:#fca5a5;}',
        '#encounter-hud .enc-list{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:6px;}',
        '#encounter-hud .enc-chip{font-size:12px;line-height:1.2;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,0.08);',
        'border:1px solid rgba(255,255,255,0.2);color:#e7e5e4;white-space:nowrap;}',
        '#encounter-hud .enc-chip i{margin-right:5px;}',
        '#encounter-hud .enc-chip.enc-down{opacity:0.45;text-decoration:line-through;}',
        '#encounter-hud .enc-chip.enc-wait{opacity:0.6;font-style:italic;}',
        '#encounter-hud .enc-result-title{font-size:19px;font-weight:800;letter-spacing:0.08em;}',
        '#encounter-hud.enc-victory .enc-card{border-color:rgba(250,204,21,0.85);}',
        '#encounter-hud.enc-victory .enc-result-title{color:#fde047;}',
        '#encounter-hud.enc-failed .enc-card{border-color:rgba(248,113,113,0.85);}',
        '#encounter-hud.enc-failed .enc-result-title{color:#fca5a5;}',
        '#encounter-hud .enc-rewards{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:6px;font-size:13px;font-weight:700;color:#fef9c3;}',
        '#encounter-hud .enc-hint{font-size:12px;color:#d6d3d1;margin-top:5px;}',
        '@media (max-width:900px),(max-height:480px){#encounter-hud{top:8px;max-width:min(420px,calc(100vw - 150px));min-width:180px;}',
        '#encounter-hud .enc-card{padding:6px 10px;}}',
        // Màn dọc hẹp: xuống dưới hàng nút góc trên (Paimon / Túi / Nhân vật), vẫn né cột Party bên trái.
        '@media (max-width:560px){#encounter-hud{top:62px;max-width:calc(100vw - 150px);min-width:0;}}'
    ].join('');

    let hudEl = null;
    let lastHudSig = '';
    function ensureHud() {
        if (hudEl && document.body.contains(hudEl)) return hudEl;
        if (!document.getElementById('encounter-hud-styles')) {
            const st = document.createElement('style');
            st.id = 'encounter-hud-styles';
            st.textContent = HUD_CSS;
            document.head.appendChild(st);
        }
        hudEl = document.getElementById('encounter-hud');
        if (!hudEl) {
            hudEl = document.createElement('div');
            hudEl.id = 'encounter-hud';
            hudEl.className = 'enc-hidden';
            hudEl.setAttribute('role', 'status');
            hudEl.setAttribute('aria-live', 'polite');
            document.body.appendChild(hudEl);
        }
        lastHudSig = '';
        return hudEl;
    }

    function rewardText(r) {
        const label = r.type === 'material'
            ? ((window.ITEM_DATABASE && window.ITEM_DATABASE[r.itemId] && window.ITEM_DATABASE[r.itemId].name) || r.itemId)
            : (REWARD_LABELS[r.type] || r.type);
        return '+' + r.amount + ' ' + label;
    }

    function hudRuntime() {
        let pick = null;
        runtimes.forEach(rt => {
            if (pick) return;
            const busy = rt.state === 'starting' || rt.state === 'active' || rt.state === 'completing';
            const result = (rt.state === 'completed' || rt.state === 'failed') && rt.resultTimer > 0;
            if (busy || result) pick = rt;
        });
        return pick;
    }

    function renderHud() {
        const el = ensureHud();
        if (!el) return;
        const rt = hudRuntime();
        const leaving = rt && rt.state === 'active' && rt.leaveTimer > 0 ? Math.ceil(rt.def.arena.leaveGrace - rt.leaveTimer) : 0;
        const sig = rt ? [rt.id, rt.state, rt.runId, remainingCount(rt), totalCount(rt), Array.from(rt.defeated).join(','),
            Array.from(rt.removed).join(','), rt.spawnSlots.join(','), leaving, window.isMobile ? 'm' : 'd'].join('|') : 'none';
        if (sig === lastHudSig) return;   // chữ ký = toàn bộ nội dung hiển thị -> chỉ ghi DOM khi thật sự đổi
        lastHudSig = sig;
        if (!rt) { el.className = 'enc-hidden'; el.innerHTML = ''; return; }
        const act = window.isMobile ? 'chạm nút tương tác' : 'nhấn F';
        if (rt.state === 'completed') {
            const rewards = rt.lastRewards.length
                ? '<div class="enc-rewards">' + rt.lastRewards.map(r => '<span>' + esc(rewardText(r)) + '</span>').join('') + '</div>'
                : '<div class="enc-hint">Đã nhận thưởng lần đầu — lần thắng này không có thưởng thêm.</div>';
            el.className = 'enc-victory';
            el.innerHTML = '<div class="enc-card"><div class="enc-result-title"><i class="fa-solid fa-trophy"></i>CHIẾN THẮNG</div>' +
                '<div class="enc-sub">' + esc(rt.def.name) + '</div>' + rewards +
                '<div class="enc-hint">Tiếp tục khám phá, hoặc quay lại cột sáng và ' + act + ' để thử lại.</div></div>';
            return;
        }
        if (rt.state === 'failed') {
            const why = rt.failReason === 'left_area' ? 'Bạn đã rời khỏi khu vực thử thách.' : 'Bạn đã gục ngã — kẻ địch đã rút lui.';
            el.className = 'enc-failed';
            el.innerHTML = '<div class="enc-card"><div class="enc-result-title"><i class="fa-solid fa-skull"></i>THẤT BẠI</div>' +
                '<div class="enc-sub">' + esc(why) + '</div>' +
                '<div class="enc-hint">Quay lại cột sáng và ' + act + ' để thử lại.</div></div>';
            return;
        }
        let sub, warn = false;
        if (rt.state === 'starting') sub = 'Chuẩn bị — kẻ địch đang xuất hiện!';
        else if (rt.state === 'completing') sub = 'Đã hạ toàn bộ kẻ địch!';
        else if (leaving > 0) { sub = 'Quay lại khu vực thử thách! ' + leaving + 's'; warn = true; }
        else sub = 'Còn lại: ' + remainingCount(rt) + '/' + totalCount(rt);
        const chips = rt.spawnInfo.map((info, i) => {
            const slot = rt.spawnSlots[i];
            let cls = 'enc-chip';
            if (slot === undefined) cls += ' enc-wait';
            else if (slot === 'failed' || rt.defeated.has(slot) || rt.removed.has(slot)) cls += ' enc-down';
            return '<span class="' + cls + '"><i class="fa-solid ' + (ROLE_ICONS[info.archetype] || 'fa-circle') + '"></i>' + esc(info.name) + '</span>';
        }).join('');
        el.className = '';
        el.innerHTML = '<div class="enc-card"><div class="enc-title"><i class="fa-solid fa-shield-halved"></i>' + esc(rt.def.name) + '</div>' +
            '<div class="enc-sub' + (warn ? ' enc-warn' : '') + '">' + esc(sub) + '</div><div class="enc-list">' + chips + '</div></div>';
    }

    // ------------------------------------------------------------------ khởi tạo + export
    let initialized = false;
    // Gọi 1 lần từ initThree() (04) sau createInteractables(): dựng cột sáng cho mỗi encounter hợp lệ có beacon.
    function initEncounters() {
        if (initialized) return;
        initialized = true;
        ensureHud();
        const table = window.ENCOUNTER_DEFINITIONS || {};
        Object.keys(table).forEach(id => {
            const rt = getRuntime(id);
            if (!rt || !rt.def.beacon || rt.beacon) return;
            rt.beacon = new EncounterBeacon(rt);
            window.interactables.push(rt.beacon);
        });
    }

    window.initEncounters = initEncounters;
    window.updateEncounters = updateEncounters;
    window.collectEncounterSaveData = collectEncounterSaveData;
    window.restoreEncounterSaveData = restoreEncounterSaveData;
    window.EncounterSystem = {
        TRANSITIONS: ENCOUNTER_TRANSITIONS,
        COMPLETING_DELAY: COMPLETING_DELAY,
        RESULT_SHOW_TIME: RESULT_SHOW_TIME,
        INTERACT_COOLDOWN: INTERACT_COOLDOWN,
        normalizeEncounterDefinition: normalizeEncounterDefinition,
        start: start,
        reset: function (id, reason) { const rt = runtimes.get(id); return rt ? resetRuntime(rt, reason || 'manual') : false; },
        register: function (id, enemy) { const rt = runtimes.get(id); return rt ? register(rt, enemy) : false; },
        getState: function (id) { const rt = runtimes.get(id); return rt ? rt.state : null; },
        getProgress: function (id) {
            const rt = runtimes.get(id);
            if (!rt) return null;
            return { state: rt.state, runId: rt.runId, total: totalCount(rt), remaining: remainingCount(rt), defeated: rt.defeated.size, removed: rt.removed.size, members: Array.from(rt.members.keys()), failReason: rt.failReason, leaveTimer: rt.leaveTimer };
        },
        getRuntime: function (id) { return getRuntime(id); },
        getPersistent: function (id) { return Object.assign({}, getPersistent(id)); },
        get runtimes() { return runtimes; }
    };
})();
