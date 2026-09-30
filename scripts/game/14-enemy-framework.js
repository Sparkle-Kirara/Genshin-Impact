// ============================================================
// Alpha M2 — ENEMY FRAMEWORK (quái có báo trước: cận chiến / tầm xa / hạng nặng)
// ============================================================
// Mục tiêu: thêm loại quái mới mà KHÔNG sửa hệ thống chiến đấu của người chơi. Mọi đòn của 6 nhân vật (chém
// hình nón/tròn, mũi tên/cầu Catalyst theo AABB, tia nước, AoE, kéo của #4/#1, nổ Decoy...) đều duyệt
// window.enemies[] và gọi enemy.takeDamage(amount, dir, isHydro, impact) — lớp FieldEnemy dưới đây giữ ĐÚNG
// "giao diện ngầm" mà Slime đang có (position, alive, aabb, width/height/depth, mesh/bodyMesh, isLarge, poise,
// level, stats/hp/maxHp, velocity, knockback, isGrounded, alignToGround, takeDamage, update, dispose), nên các
// đường sát thương sẵn có hoạt động nguyên vẹn, không có đường sát thương thứ hai.
//
// Cấu trúc (không có 1 lớp "khổng lồ"):
//   1. Chuẩn hoá định nghĩa   normalizeEnemyDefinition() — mặc định an toàn + kiểm tra khoảng + cảnh báo.
//   2. FieldEnemy             phần DÙNG CHUNG: vòng đời, trạng thái chiến đấu (bảng chuyển hợp lệ), chọn mục
//                             tiêu 4 lần/giây, di chuyển mượt + tách nhau + va chạm tĩnh + biên, nhận damage qua
//                             resolveHitReaction chung, chết 1 lần, thưởng 1 lần, dọn dẹp/hồi sinh, thanh máu.
//   3. ENEMY_ARCHETYPES       phần RIÊNG mỗi vai trò (hình khối, báo trước, ra đòn, dáng) — object nhỏ.
//   4. Đạn của quái           tối thiểu: bay thẳng, gắn chủ, tự huỷ khi chủ chết / chạm vật cản / hết tầm.
// Đòn trúng người chơi LUÔN đi qua window.applyEnemyAttackToPlayer() (enemies.js) — CÙNG hàm Slime dùng
// (Counter #5 → calculateFinalDamage → HP/bất tử/phản hồi → gục).
//
// Vòng đời:  unspawned → spawning → active → dying → despawned   (despawned → spawning chỉ qua respawn())
//   - Chỉ 'active' mới được vào trạng thái chiến đấu / tấn công; 'spawning' (0.7 s) chưa đánh được.
//   - Chết (die) và thưởng (dispatchRewards) có cờ riêng -> tối đa 1 lần dù bị gọi lại / trúng thêm đòn.
//   - despawn() (bị dọn cưỡng bức: reset encounter...) KHÔNG phải chết: không thưởng, không bắn sự kiện chết.
//   - dispose() gỡ mesh + telegraph khỏi scene, giải phóng geometry/material riêng, huỷ đạn còn bay, xoá
//     listener/tham chiếu mục tiêu. Không có setTimeout/listener DOM nào — mọi đồng hồ đếm theo dt.
// Trạng thái chiến đấu: idle / approach / reposition / telegraph / attack / recover / stagger / return
//   (xem COMBAT_TRANSITIONS). attack chỉ đi tới từ telegraph, chỉ thoát sang recover; telegraph bị chặn khi
//   attackCooldown > 0 -> không thể tấn công liên tục bỏ qua nhịp.
(function () {
    'use strict';

    // ------------------------------------------------------------------ hằng số dùng chung
    const SPAWN_DURATION = 0.7;       // s — xuất hiện (chưa tấn công được)
    const DEATH_DURATION = 0.6;       // s — thu nhỏ/chìm rồi mới gỡ khỏi world
    const RETARGET_INTERVAL = 0.25;   // s — chọn lại mục tiêu 4 lần/giây (không mỗi frame)
    const WORLD_LIMIT = 45;           // ±m — cùng biên knockback của quái cũ (mặt đất 100×100)
    const HP_BAR_NEARBY = 14;         // m — hiện thanh máu khi người chơi ở gần
    const MAX_ENEMY_PROJECTILES = 24;
    const DEG = Math.PI / 180;

    const ARCHETYPE_KEYS = ['melee', 'ranged', 'heavy'];
    const LIFECYCLE_TRANSITIONS = {
        unspawned: ['spawning'],
        spawning: ['active', 'dying', 'despawned'],
        active: ['dying', 'despawned'],
        dying: ['despawned'],
        despawned: ['spawning']            // chỉ respawn() dùng
    };
    const COMBAT_TRANSITIONS = {
        idle: ['approach', 'reposition', 'telegraph', 'stagger', 'return'],
        approach: ['idle', 'reposition', 'telegraph', 'stagger', 'return'],
        reposition: ['idle', 'approach', 'telegraph', 'stagger', 'return'],
        telegraph: ['attack', 'idle', 'stagger'],       // idle = huỷ vì mất mục tiêu
        attack: ['recover'],                            // khung ra đòn ngắn — không bị ngắt, luôn sang recover
        recover: ['idle', 'approach', 'reposition', 'stagger', 'return'],
        stagger: ['idle', 'approach', 'reposition', 'return', 'stagger'],
        return: ['idle', 'approach', 'reposition', 'stagger']
    };
    // Trạng thái mà đòn có interrupt (resolveHitReaction) được phép ngắt.
    const INTERRUPTIBLE = { idle: 1, approach: 1, reposition: 1, telegraph: 1, recover: 1, return: 1 };

    // ------------------------------------------------------------------ 1. định nghĩa + chuẩn hoá
    const DEFAULT_ENEMY = {
        name: 'Quái', role: '', archetype: 'melee', level: 1,
        stats: { maxHp: 60, atk: 20, def: 10 },
        poise: { weightClass: 'medium', resistance: 1.0 },
        size: { width: 1.0, height: 1.6 },
        isLarge: false, hoverHeight: 0,
        moveSpeed: 3.0, turnRate: 8, detectRange: 12, leashRange: 22,
        attack: {
            range: 2.0, telegraph: 0.6, active: 0.2, recovery: 0.9, cooldown: 0.8,
            hitRange: 2.2, hitArc: 90, lunge: 0.5,
            preferredMin: 7, preferredMax: 11, retreatRange: 5, retreatSpeed: 2.5, aimLock: 0.3,
            projectileSpeed: 11, projectileRadius: 0.3, projectileRange: 16,
            impactOffset: 1.6, impactRadius: 2.4,
            push: 4.0, stagger: 0.1, unblockable: false
        },
        rewards: { exp: 0 },
        questType: null,
        visual: { body: 0x9ca3af, accent: 0xe5e7eb, glow: 0xfacc15 }
    };
    // Khoảng hợp lệ [min, max] của mọi field số — sai kiểu / NaN / ngoài khoảng -> giữ mặc định + cảnh báo.
    const NUMERIC_LIMITS = {
        'level': [1, 90], 'stats.maxHp': [1, 100000], 'stats.atk': [0, 10000], 'stats.def': [0, 10000],
        'poise.resistance': [0.1, 10], 'size.width': [0.3, 6], 'size.height': [0.3, 8], 'hoverHeight': [0, 5],
        'moveSpeed': [0, 15], 'turnRate': [0.5, 30], 'detectRange': [1, 60], 'leashRange': [2, 80],
        'attack.range': [0.5, 40], 'attack.telegraph': [0.1, 5], 'attack.active': [0.05, 2],
        'attack.recovery': [0, 6], 'attack.cooldown': [0, 10], 'attack.hitRange': [0.5, 10], 'attack.hitArc': [10, 360],
        'attack.lunge': [0, 4], 'attack.preferredMin': [0, 40], 'attack.preferredMax': [0, 40],
        'attack.retreatRange': [0, 40], 'attack.retreatSpeed': [0, 15], 'attack.aimLock': [0, 5],
        'attack.projectileSpeed': [1, 60], 'attack.projectileRadius': [0.05, 2], 'attack.projectileRange': [1, 80],
        'attack.impactOffset': [0, 10], 'attack.impactRadius': [0.5, 10],
        'attack.push': [0, 30], 'attack.stagger': [0, 2], 'rewards.exp': [0, 100000]
    };

    function readPath(obj, path) {
        return path.split('.').reduce((o, k) => (o && typeof o === 'object') ? o[k] : undefined, obj);
    }
    function writePath(obj, path, value) {
        const keys = path.split('.');
        let o = obj;
        for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
        o[keys[keys.length - 1]] = value;
    }
    function isColor(v) { return typeof v === 'number' && isFinite(v) && v >= 0 && v <= 0xffffff; }

    // Trả về { def, warnings } — def = null CHỈ khi raw không phải object (không có gì để dựng quái).
    function normalizeEnemyDefinition(raw, id) {
        const warnings = [];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { def: null, warnings: ['definition is not an object'] };
        const def = JSON.parse(JSON.stringify(DEFAULT_ENEMY));
        def.id = String(id || raw.id || 'field_enemy');
        ['name', 'role'].forEach(k => {
            if (raw[k] === undefined) return;
            if (typeof raw[k] === 'string' && raw[k].trim()) def[k] = raw[k].trim();
            else warnings.push(k + ' invalid');
        });
        if (raw.archetype !== undefined) {
            if (ARCHETYPE_KEYS.indexOf(raw.archetype) !== -1) def.archetype = raw.archetype;
            else warnings.push('archetype "' + raw.archetype + '" unknown -> melee');
        }
        Object.keys(NUMERIC_LIMITS).forEach(path => {
            const v = readPath(raw, path);
            if (v === undefined) return;   // thiếu = dùng mặc định (không phải lỗi)
            const lim = NUMERIC_LIMITS[path];
            if (typeof v !== 'number' || !isFinite(v) || v < lim[0] || v > lim[1]) { warnings.push(path + '=' + String(v) + ' invalid'); return; }
            writePath(def, path, v);
        });
        const wc = readPath(raw, 'poise.weightClass');
        if (wc !== undefined) {
            if (window.WEIGHT_CLASS_CONFIG && window.WEIGHT_CLASS_CONFIG[wc]) def.poise.weightClass = wc;
            else warnings.push('poise.weightClass "' + wc + '" unknown');
        }
        if (raw.isLarge !== undefined) { if (typeof raw.isLarge === 'boolean') def.isLarge = raw.isLarge; else warnings.push('isLarge invalid'); }
        const ub = readPath(raw, 'attack.unblockable');
        if (ub !== undefined) { if (typeof ub === 'boolean') def.attack.unblockable = ub; else warnings.push('attack.unblockable invalid'); }
        ['body', 'accent', 'glow'].forEach(k => {
            const c = readPath(raw, 'visual.' + k);
            if (c === undefined) return;
            if (isColor(c)) def.visual[k] = c; else warnings.push('visual.' + k + ' invalid');
        });
        if (raw.questType !== undefined && typeof raw.questType !== 'string') warnings.push('questType invalid');
        def.questType = (typeof raw.questType === 'string' && raw.questType) ? raw.questType : def.id;
        // Ràng buộc chéo: giữ khoảng cách hợp lý, số nguyên cho HP/EXP.
        const a = def.attack;
        if (a.preferredMin > a.preferredMax) { warnings.push('preferredMin > preferredMax (swapped)'); const t = a.preferredMin; a.preferredMin = a.preferredMax; a.preferredMax = t; }
        if (a.retreatRange > a.preferredMin) { warnings.push('retreatRange > preferredMin (clamped)'); a.retreatRange = a.preferredMin; }
        if (a.aimLock > a.telegraph) { warnings.push('aimLock > telegraph (clamped)'); a.aimLock = a.telegraph; }
        def.stats.maxHp = Math.max(1, Math.round(def.stats.maxHp));
        def.rewards.exp = Math.max(0, Math.floor(def.rewards.exp));
        return { def: def, warnings: warnings };
    }

    const warnedDefinitions = new Set();
    // Đọc + chuẩn hoá window.ENEMY_DEFINITIONS[id] (mỗi lần spawn — hiếm, rẻ). Cảnh báo 1 lần / id.
    function getEnemyDefinition(id) {
        const table = window.ENEMY_DEFINITIONS || {};
        if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(table, id)) return null;
        const res = normalizeEnemyDefinition(table[id], id);
        if (res.warnings.length && !warnedDefinitions.has(id)) {
            warnedDefinitions.add(id);
            console.warn('[EnemyFramework] ENEMY_DEFINITIONS.' + id + ': dùng giá trị mặc định cho', res.warnings.join('; '));
        }
        return res.def;
    }

    // ------------------------------------------------------------------ tiện ích hình học
    function hDist(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
    function yawTo(from, to) { return Math.atan2(to.x - from.x, to.z - from.z); }
    function wrapAngle(a) { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; }
    function easeOut(k) { return 1 - (1 - k) * (1 - k); }
    function noRaycast() { /* telegraph / đạn không chặn tia ngắm (raycastFromCrosshair, combat.js) */ }

    // Cao độ đứng được tại (x, z): địa hình + mặt trên obstacle nằm dưới chân (cùng quy tắc Slime.getGroundY).
    function groundHeightAt(x, z, halfW, halfD, y) {
        let best = (typeof getTerrainHeight === 'function') ? getTerrainHeight(x, z) : 0;
        const inset = 0.18;
        const obs = window.obstacles || [];
        for (let i = 0; i < obs.length; i++) {
            const bb = obs[i].aabb;
            if (x + halfW - inset >= bb.minX && x - halfW + inset <= bb.maxX && z + halfD - inset >= bb.minZ && z - halfD + inset <= bb.maxZ) {
                if (y >= bb.maxY - 0.25 && bb.maxY > best) best = bb.maxY;
            }
        }
        return best;
    }

    const liveFieldEnemies = new Set();   // quái khung M2 đang có visual (dùng cho tách nhau + đạn)

    // ------------------------------------------------------------------ 2. FieldEnemy (phần dùng chung)
    class FieldEnemy {
        constructor(def, x, z, opts) {
            opts = opts || {};
            this.id = window.nextEnemyId++;
            this.isFieldEnemy = true;
            this.def = def;
            this.defId = def.id;
            this.archetype = def.archetype;
            this.behavior = ENEMY_ARCHETYPES[def.archetype];
            this.name = def.name;
            this.level = def.level;
            this.stats = { maxHp: def.stats.maxHp, hp: def.stats.maxHp, atk: def.stats.atk, def: def.stats.def };
            this.poise = { weightClass: def.poise.weightClass, resistance: def.poise.resistance };
            this.width = def.size.width; this.depth = def.size.width; this.height = def.size.height;
            this.isLarge = !!def.isLarge;
            this.hoverHeight = def.hoverHeight;
            this.leashRange = (typeof opts.leashRange === 'number') ? opts.leashRange : def.leashRange;
            // Vùng quái được phép tự đi tới (quanh home) — mặc định = leash. Encounter đặt nhỏ hơn để trận đấu gọn;
            // mục tiêu vẫn được nhắm trong leashRange (quái tầm xa đứng ở mép vẫn bắn được).
            this.moveRadius = (typeof opts.moveRadius === 'number' && opts.moveRadius > 0) ? Math.min(opts.moveRadius, this.leashRange) : this.leashRange;
            this.home = new THREE.Vector3(
                (typeof opts.homeX === 'number') ? opts.homeX : x, 0, (typeof opts.homeZ === 'number') ? opts.homeZ : z);
            this.spawnPoint = new THREE.Vector3(x, 0, z);
            this.position = new THREE.Vector3(x, 0, z);
            this.velocity = new THREE.Vector3();     // vận tốc đi bộ ngang (x/z)
            this.desiredVel = new THREE.Vector3();
            this.knockback = new THREE.Vector3();    // cùng quy ước Slime (resolveStaticCollisions xoá khi chạm tường)
            this.vy = 0;
            this.isGrounded = true;
            this.facing = (typeof opts.facing === 'number') ? opts.facing : 0;
            this.alertedByDefault = !!opts.alerted;
            this.strafeSign = (this.id % 2) ? 1 : -1;
            this.aabb = new window.AABB();
            this.rejectedTransitions = 0;            // số lần 1 chuyển trạng thái KHÔNG hợp lệ bị chặn (test/debug)
            this.encounterId = null;
            this.encounterRunId = 0;
            this.resetCombatFields();
            this.buildVisuals();
            this.lifecycle = 'unspawned';
            this.alignToGround(true);
            this.setLifecycle('spawning');
        }

        // Toàn bộ trạng thái chiến đấu/đếm giờ — dùng lại khi respawn() để "hồi sinh" = đúng trạng thái ban đầu.
        resetCombatFields() {
            this.stats.hp = this.stats.maxHp;
            this.alive = false;
            this.combatState = 'idle';
            this.stateTime = 0;
            this.lifecycleTime = 0;
            this.animClock = Math.random() * 10;
            this.target = null;
            this.attackTarget = null;
            this.retargetTimer = 0;
            this.alerted = this.alertedByDefault;
            this.attackCooldown = 0;
            this.attackSeq = 0;
            this.attackCount = 0;          // số lần THỰC SỰ vào khung ra đòn (test nhịp tấn công)
            this.attackHitDone = false;
            this.staggerDuration = 0;
            this.telegraphDir = new THREE.Vector3(0, 0, 1);
            this.telegraphOrigin = new THREE.Vector3();
            this.telegraphPoint = new THREE.Vector3();
            this.aimPoint = new THREE.Vector3();
            this.lastDamageSource = null;
            this.hpBarVisibleTimer = 0;
            this.flashTimer = 0;
            this.hydroSquashTimer = undefined;
            this.deathHandled = false;
            this.rewardDispatched = false;
            this.deathEventCount = 0;
            this.deathListeners = [];
            this.pendingRemoval = false;
            this.despawnReason = null;
            this.isEngagingPlayer = false;
            this.velocity.set(0, 0, 0);
            this.knockback.set(0, 0, 0);
            this.vy = 0;
        }

        get hp() { return this.stats.hp; }
        set hp(v) { this.stats.hp = v; }
        get maxHp() { return this.stats.maxHp; }
        set maxHp(v) { this.stats.maxHp = v; }

        // ---------------- visual (hình khối + thanh máu + telegraph)
        buildVisuals() {
            this.mesh = new THREE.Group();          // gốc: position = tâm AABB; scale để dành cho Hydro squash (09/combat)
            this.visual = new THREE.Group();        // thân động (xuất hiện, dáng đòn, chết)
            this.mesh.add(this.visual);
            this.flashMaterials = [];
            this.parts = this.behavior.buildVisual(this, this.visual) || {};
            this.bodyMesh = this.parts.bodyMesh || null;   // có bodyMesh -> các đòn Hydro squash this.mesh như với Slime
            this.buildHpBar();
            this.telegraphRoot = new THREE.Group();      // telegraph nằm trong world-space (khoá vị trí, không đi theo quái)
            this.telegraphRoot.visible = false;
            this.telegraph = this.behavior.buildTelegraph(this, this.telegraphRoot) || {};
            this.telegraphRoot.traverse(o => { if (o.isMesh) { o.raycast = noRaycast; o.renderOrder = 3; } });
            window.scene.add(this.mesh);
            window.scene.add(this.telegraphRoot);
            this.mesh.rotation.y = this.facing;
            this.restMeshScale = this.mesh.scale.clone();
            this.flashBase = this.flashMaterials.map(m => ({ m: m, color: m.emissive ? m.emissive.getHex() : 0, intensity: m.emissiveIntensity || 0 }));
            const collect = window.collectOwnedGpuResources || collectOwnedGpuResources;
            this.ownedGpuResources = collect(this.mesh, []).concat(collect(this.telegraphRoot, []));
            this.disposed = false;
            liveFieldEnemies.add(this);
        }

        buildHpBar() {
            const width = this.isLarge ? 1.5 : 1.0;
            const y = this.height * 0.5 + 0.35;
            this.hpBarBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x1a1a2e, transparent: true, opacity: 0.85, depthTest: false }));
            this.hpBarBg.scale.set(width, 0.14, 1);
            this.hpBarBg.position.set(0, y, 0);
            this.hpBarBg.renderOrder = 998;
            this.hpBarFill = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x4ade80, transparent: true, opacity: 1.0, depthTest: false }));
            this.hpBarFill.scale.set(width, 0.1, 1);
            this.hpBarFill.position.set(0, y, 0.001);
            this.hpBarFill.renderOrder = 999;
            this.hpBarMaxWidth = width;
            this.hpBarBg.visible = this.hpBarFill.visible = false;
            this.mesh.add(this.hpBarBg);
            this.mesh.add(this.hpBarFill);
        }

        // Cùng cách vẽ thanh máu Slime (vơi từ phải, xanh -> vàng -> đỏ).
        updateHpBarVisual() {
            const pct = Math.max(0, Math.min(1, this.stats.hp / Math.max(1, this.stats.maxHp)));
            this.hpBarFill.scale.x = this.hpBarMaxWidth * pct;
            this.hpBarFill.position.x = -(this.hpBarMaxWidth * (1 - pct)) / 2;
            this.hpBarFill.material.color.setHex(pct > 0.5 ? 0x4ade80 : pct > 0.25 ? 0xfbbf24 : 0xef4444);
        }

        setHpBarVisible(v) {
            if (this.hpBarBg.visible === v) return;
            this.hpBarBg.visible = v;
            this.hpBarFill.visible = v;
        }

        // ---------------- vòng đời
        setLifecycle(next) {
            const allowed = LIFECYCLE_TRANSITIONS[this.lifecycle] || [];
            if (allowed.indexOf(next) === -1) { this.rejectedTransitions++; return false; }
            this.lifecycle = next;
            this.lifecycleTime = 0;
            if (next === 'spawning') {
                this.alive = true;
                this.visual.scale.setScalar(0.15);
                this.visual.rotation.set(0, 0, 0);
                this.visual.position.set(0, 0, 0);
                this.updateHpBarVisual();
                const g = this.getGroundY();
                if (window.spawnGroundRing) window.spawnGroundRing({ x: this.position.x, y: g, z: this.position.z }, Math.max(1.2, this.width * 1.1), this.def.visual.glow, { life: SPAWN_DURATION, startRatio: 0.2, fill: true, opacity: 0.8 });
            } else if (next === 'active') {
                this.combatState = 'idle';
                this.stateTime = 0;
                this.visual.scale.setScalar(1);
                this.visual.position.set(0, 0, 0);
            }
            return true;
        }

        // ---------------- trạng thái chiến đấu (chỉ khi 'active')
        setCombatState(next) {
            if (this.lifecycle !== 'active' || !this.alive) { this.rejectedTransitions++; return false; }
            if (next === this.combatState && next !== 'stagger') return true;
            const allowed = COMBAT_TRANSITIONS[this.combatState] || [];
            if (allowed.indexOf(next) === -1) { this.rejectedTransitions++; return false; }
            if (next === 'telegraph' && this.attackCooldown > 0) { this.rejectedTransitions++; return false; }
            const prev = this.combatState;
            this.combatState = next;
            this.stateTime = 0;
            if (prev === 'telegraph' && next !== 'attack') this.hideTelegraph();
            if (next === 'attack') {
                this.attackSeq++;
                this.attackCount++;
                this.attackHitDone = false;
                this.hideTelegraph();
            } else if (next === 'recover') {
                this.attackCooldown = this.def.attack.recovery + this.def.attack.cooldown;
            } else if (next === 'stagger') {
                this.velocity.set(0, 0, 0);
                if (prev === 'telegraph') this.attackCooldown = Math.max(this.attackCooldown, 0.6);
            }
            return true;
        }

        startTelegraph() {
            if (!this.target || !this.setCombatState('telegraph')) return false;
            this.attackTarget = this.target;
            this.telegraphDir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
            this.telegraphOrigin.set(this.position.x, this.getGroundY(), this.position.z);
            this.aimPoint.copy(this.target.position);
            this.behavior.onTelegraphStart(this);
            this.telegraphRoot.visible = true;
            return true;
        }

        hideTelegraph() {
            if (this.telegraphRoot) this.telegraphRoot.visible = false;
        }

        // Huỷ mọi đòn đang dở (mất mục tiêu / chết / bị dọn) — không để telegraph treo trên đất.
        cancelAttack() {
            this.hideTelegraph();
            this.attackTarget = null;
            this.attackHitDone = true;
        }

        // ---------------- mục tiêu
        isTargetValid(t) {
            if (!t) return false;
            if (t === window.player) return !t.isDead;
            if (t.isDecoy) return !!t.active;
            return false;
        }

        // Taunt của Decoy (#2) — CÙNG quy tắc Slime: Decoy active trong attractionRadius được ưu tiên; ngược lại người
        // chơi (không chết) trong tầm phát hiện, hoặc trong leash nếu đã giao chiến (trễ ngưỡng -> không nhấp nháy mục tiêu).
        updateTarget() {
            const prev = this.target;
            let next = null;
            const decoy = window.activeDecoy;
            if (decoy && decoy.active && hDist(this.position, decoy.position) <= decoy.attractionRadius) {
                next = decoy;
            } else {
                const p = window.player;
                if (p && !p.isDead) {
                    const d = hDist(this.position, p.position);
                    const engaged = (prev === p) || this.alerted;
                    const range = engaged ? this.leashRange : this.def.detectRange;
                    if (d <= range && hDist(this.home, p.position) <= this.leashRange) next = p;
                }
            }
            this.target = next;
            // Mất mục tiêu giữa lúc báo trước -> huỷ đòn (không đánh vào khoảng không), nghỉ ngắn rồi mới báo trước lại.
            if (!next && prev && this.combatState === 'telegraph') {
                this.setCombatState('idle');
                this.attackCooldown = Math.max(this.attackCooldown, 0.5);
            }
        }

        // ---------------- nhận damage (giao diện chung với Slime/Enemy)
        takeDamage(amount, direction, isHydro, impact) {
            if (!this.alive || this.disposed) return;     // đã chết / đã dọn: không tác dụng phụ nào
            this.lastDamageSource = (impact && impact.source) ? impact.source : null;
            window.recordDamageEvent(this, amount, impact);   // DAMAGE EVENT CONTRACT (enemies.js)
            const finalDamage = Math.max(0, Math.round(Number(amount) || 0));
            this.hp = Math.max(0, this.hp - finalDamage);

            if (window.spawnDamageNumber) {
                const origin = this.position.clone();
                origin.y += this.height * 0.6;
                window.spawnDamageNumber(origin, finalDamage, window.getDamageNumberStyle ? window.getDamageNumberStyle(impact) : undefined);
            }
            this.updateHpBarVisual();
            this.hpBarVisibleTimer = 3.0;
            this.flash(isHydro);

            const dir = new THREE.Vector3();
            if (direction && typeof direction.x === 'number') { dir.set(direction.x, 0, direction.z); }
            if (dir.lengthSq() < 1e-6) dir.set(Math.sin(this.facing + Math.PI), 0, Math.cos(this.facing + Math.PI));
            dir.normalize();
            if (impact && window.resolveHitReaction) {
                const reaction = window.resolveHitReaction(impact, this.poise);
                this.knockback.copy(dir).multiplyScalar(reaction.knockbackForce);
                const canInterrupt = this.lifecycle === 'active' &&
                    (INTERRUPTIBLE[this.combatState] || (this.combatState === 'stagger' && reaction.level === 'launch'));
                if (reaction.interrupt && canInterrupt) {
                    this.staggerDuration = reaction.staggerDuration;
                    if (reaction.level === 'launch' && reaction.verticalForce > 0) { this.vy = reaction.verticalForce; this.isGrounded = false; }
                    this.cancelAttack();
                    this.setCombatState('stagger');
                }
            } else {
                const cfg = window.COMBAT_FEEL_CONFIG && window.COMBAT_FEEL_CONFIG.enemyRecoilForce;
                if (cfg) this.knockback.copy(dir).multiplyScalar(this.isLarge ? cfg.large : cfg.normal);
            }

            if (this.hp <= 0) { this.die('damage'); return; }
            this.alerted = true;   // bị đánh -> giao chiến (trong leash)
        }

        flash(isHydro) {
            this.flashTimer = 0.15;
            const color = isHydro ? 0x22d3ee : 0xffffff;
            for (let i = 0; i < this.flashMaterials.length; i++) {
                const m = this.flashMaterials[i];
                if (m.emissive) { m.emissive.setHex(color); m.emissiveIntensity = 0.85; }
            }
        }

        clearFlash() {
            for (let i = 0; i < this.flashBase.length; i++) {
                const b = this.flashBase[i];
                if (b.m.emissive) { b.m.emissive.setHex(b.color); b.m.emissiveIntensity = b.intensity; }
            }
        }

        // ---------------- chết / thưởng / dọn dẹp
        onDeath(fn) {
            if (typeof fn === 'function' && !this.disposed) this.deathListeners.push(fn);
        }

        die(reason) {
            if (this.deathHandled || this.disposed) return false;
            if (this.lifecycle !== 'active' && this.lifecycle !== 'spawning') return false;   // đã dọn/chưa spawn: không "chết"
            this.deathHandled = true;
            this.alive = false;
            this.hp = 0;
            this.setLifecycle('dying');
            this.cancelAttack();
            this.target = null;
            this.isEngagingPlayer = false;
            this.velocity.set(0, 0, 0);
            this.setHpBarVisible(false);
            removeProjectilesOf(this, 'owner_dead');
            this.dispatchRewards();
            if (window.onEnemyKilled) window.onEnemyKilled(this.def.questType);   // tiến độ quest 'kill' (cùng hook Slime)
            this.deathEventCount++;
            const listeners = this.deathListeners.slice();
            for (let i = 0; i < listeners.length; i++) {
                try { listeners[i](this, reason); } catch (e) { console.warn('[EnemyFramework] onDeath listener lỗi:', e); }
            }
            if (window.spawnDustPuff) window.spawnDustPuff(this.position.clone());
            return true;
        }

        // Thưởng riêng của 1 con (EXP) — đi qua REWARD_HANDLERS.exp có sẵn, tối đa 1 lần.
        dispatchRewards() {
            if (this.rewardDispatched) return false;
            this.rewardDispatched = true;
            const exp = this.def.rewards.exp;
            if (exp > 0 && window.REWARD_HANDLERS && window.REWARD_HANDLERS.exp) window.REWARD_HANDLERS.exp(exp);
            return true;
        }

        // Dọn cưỡng bức (reset encounter, rời vùng...) — KHÔNG phải chết: không thưởng, không sự kiện chết.
        despawn(reason) {
            if (this.lifecycle === 'despawned' || this.lifecycle === 'unspawned') return false;
            this.alive = false;
            this.setLifecycle('despawned');
            this.cancelAttack();
            this.target = null;
            this.isEngagingPlayer = false;
            removeProjectilesOf(this, 'owner_despawned');
            if (this.mesh) this.mesh.visible = false;
            this.pendingRemoval = true;          // animate() (08) gỡ khỏi enemies[] + dispose() ở frame kế
            this.despawnReason = reason || 'despawn';
            return true;
        }

        dispose() {
            if (this.disposed) return;
            this.disposed = true;
            if (this.lifecycle !== 'despawned') { this.alive = false; this.lifecycle = 'despawned'; this.pendingRemoval = true; }
            removeProjectilesOf(this, 'owner_disposed');
            if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh);
            if (this.telegraphRoot && this.telegraphRoot.parent) this.telegraphRoot.parent.remove(this.telegraphRoot);
            (this.ownedGpuResources || []).forEach(r => r.dispose());
            this.ownedGpuResources = [];
            this.deathListeners.length = 0;
            this.target = null;
            this.attackTarget = null;
            liveFieldEnemies.delete(this);
        }

        // Hồi sinh tại (x, z) (mặc định: điểm spawn cũ) — chỉ từ 'despawned'. Trạng thái = đúng như con mới.
        respawn(x, z) {
            if (this.lifecycle !== 'despawned') return false;
            if (typeof x === 'number' && typeof z === 'number') this.spawnPoint.set(x, 0, z);
            this.resetCombatFields();
            if (this.disposed) this.buildVisuals();
            else { this.mesh.visible = true; liveFieldEnemies.add(this); }
            this.position.set(this.spawnPoint.x, 0, this.spawnPoint.z);
            this.alignToGround(true);
            if (window.enemies && window.enemies.indexOf(this) === -1) window.enemies.push(this);
            return this.setLifecycle('spawning');
        }

        // ---------------- vị trí / mặt đất
        getRestOffset() { return this.hoverHeight + this.height / 2; }
        getGroundY() { return groundHeightAt(this.position.x, this.position.z, this.width / 2, this.depth / 2, this.position.y - this.getRestOffset()); }

        // initial = true: lúc spawn (đứng lên cả mặt obstacle bên dưới). Ngược lại cùng quy tắc Slime.alignToGround:
        // chỉ tính mặt obstacle đang ở dưới chân (applyControlledPull của #4/#1 gọi hàm này sau mỗi bước kéo).
        alignToGround(initial) {
            const feetY = initial ? Infinity : this.position.y - this.getRestOffset();
            this.position.y = groundHeightAt(this.position.x, this.position.z, this.width / 2, this.depth / 2, feetY) + this.getRestOffset();
            this.vy = 0;
            this.isGrounded = true;
            this.mesh.position.copy(this.position);
            this.aabb.updateFromObject(this.mesh, this.width, this.height, this.depth);
        }

        distanceTo(point) { return hDist(this.position, point); }
        isFacing(point, maxDeg) { return Math.abs(wrapAngle(yawTo(this.position, point) - this.facing)) <= maxDeg * DEG; }
        turnTowards(point, dt, rateMul) {
            const diff = wrapAngle(yawTo(this.position, point) - this.facing);
            this.facing = wrapAngle(this.facing + diff * (1 - Math.exp(-this.def.turnRate * (rateMul || 1) * dt)));
        }

        // Đi tới point, dừng êm ở stopDist (giảm tốc trong 1 m cuối -> không vọt quá, không rung).
        steerTowards(point, speed, stopDist) {
            const dx = point.x - this.position.x, dz = point.z - this.position.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d <= stopDist || d < 1e-4) { this.desiredVel.set(0, 0, 0); return d; }
            const k = Math.min(1, (d - stopDist) / 1.0);
            this.desiredVel.set(dx / d * speed * k, 0, dz / d * speed * k);
            return d;
        }

        // Lùi khỏi point; sát mép leash thì đi ngang (không bị dồn ra ngoài vùng neo).
        steerAway(point, speed) {
            let dx = this.position.x - point.x, dz = this.position.z - point.z;
            const d = Math.sqrt(dx * dx + dz * dz) || 1;
            dx /= d; dz /= d;
            const nx = this.position.x + dx, nz = this.position.z + dz;
            const homeD = Math.hypot(nx - this.home.x, nz - this.home.z);
            if (homeD > this.moveRadius - 2 || Math.abs(nx) > WORLD_LIMIT - 1 || Math.abs(nz) > WORLD_LIMIT - 1) {
                const sx = -dz * this.strafeSign, sz = dx * this.strafeSign;
                this.desiredVel.set(sx * speed, 0, sz * speed);
            } else {
                this.desiredVel.set(dx * speed, 0, dz * speed);
            }
        }

        // ---------------- vòng update (animate() gọi mỗi frame qua enemies[])
        update(dt) {
            if (this.disposed || !(dt > 0)) return;
            this.lifecycleTime += dt;
            this.animClock += dt;
            if (this.lifecycle === 'spawning') { this.updateSpawning(dt); return; }
            if (this.lifecycle === 'dying') { this.updateDying(dt); return; }
            if (this.lifecycle !== 'active') return;

            this.stateTime += dt;
            if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt);
            this.updateFeedback(dt);

            this.retargetTimer -= dt;
            if (this.retargetTimer <= 0 || (this.target && !this.isTargetValid(this.target))) {
                this.retargetTimer = RETARGET_INTERVAL;
                this.updateTarget();
            }

            this.desiredVel.set(0, 0, 0);
            if (this.combatState === 'stagger') {
                if (this.stateTime >= this.staggerDuration && this.isGrounded) this.setCombatState(this.target ? 'approach' : 'idle');
            } else if (this.combatState === 'return') {
                this.updateReturn(dt);
            } else if (!this.target && (this.combatState === 'idle' || this.combatState === 'approach' || this.combatState === 'reposition')) {
                this.updateIdle(dt);
            } else {
                this.behavior.think(this, dt);
            }

            this.integrate(dt);
            this.behavior.animate(this, dt);
            this.isEngagingPlayer = !!(this.target && this.target === window.player);
            this.updateHpBarVisibility(dt);
        }

        updateSpawning(dt) {
            const k = Math.min(1, this.lifecycleTime / SPAWN_DURATION);
            this.visual.scale.setScalar(0.15 + 0.85 * easeOut(k));
            this.visual.position.y = -this.height * 0.35 * (1 - k);
            this.integrate(dt);
            if (k >= 1) this.setLifecycle('active');
        }

        updateDying(dt) {
            const k = Math.min(1, this.lifecycleTime / DEATH_DURATION);
            this.visual.scale.setScalar(Math.max(0.05, 1 - 0.9 * k));
            this.visual.position.y = -this.height * 0.4 * k;
            this.visual.rotation.z = 0.5 * k;
            if (k >= 1) {
                this.setLifecycle('despawned');
                this.mesh.visible = false;
                this.pendingRemoval = true;
                this.despawnReason = 'defeated';
            }
        }

        updateFeedback(dt) {
            if (this.flashTimer > 0) { this.flashTimer -= dt; if (this.flashTimer <= 0) this.clearFlash(); }
            // Alpha M1 (BUG-04) — cùng cách Slime trả dáng sau Hydro squash (đòn Hydro set mesh.scale + hydroSquashTimer).
            if (this.hydroSquashTimer > 0) this.hydroSquashTimer -= dt;
            else if (this.hydroSquashTimer !== undefined && !this.mesh.scale.equals(this.restMeshScale)) {
                this.mesh.scale.lerp(this.restMeshScale, 1 - Math.exp(-20 * dt));
                if (this.mesh.scale.distanceToSquared(this.restMeshScale) < 1e-6) this.mesh.scale.copy(this.restMeshScale);
            }
        }

        updateIdle(dt) {
            if (this.combatState !== 'idle') this.setCombatState('idle');
            if (hDist(this.position, this.home) > Math.max(3, this.leashRange * 0.5)) this.setCombatState('return');
        }

        updateReturn(dt) {
            if (this.target) { this.setCombatState('approach'); return; }
            this.turnTowards(this.home, dt);
            const d = this.steerTowards(this.home, this.def.moveSpeed, 0.8);
            if (d <= 1.0) this.setCombatState('idle');
        }

        updateHpBarVisibility(dt) {
            const p = window.player;
            const near = p ? hDist(this.position, p.position) <= HP_BAR_NEARBY : false;
            if (!near && this.hpBarVisibleTimer > 0) this.hpBarVisibleTimer -= dt;
            this.setHpBarVisible(this.alive && (near || !!this.target || this.hpBarVisibleTimer > 0));
        }

        // Tích phân chuyển động: tăng tốc có giới hạn tới desiredVel (mượt, không giật), tách nhau với quái khung M2
        // khác, knockback tắt dần, trọng lực/lơ lửng, va chạm tĩnh (cùng resolveStaticCollisions), biên world.
        integrate(dt) {
            const locked = this.combatState === 'telegraph' || this.combatState === 'attack' || this.lifecycle !== 'active';
            if (!locked) this.addSeparation();
            // Giữ quái trong moveRadius quanh home: bỏ thành phần vận tốc mong muốn hướng RA NGOÀI khi đã tới mép
            // (knockback vẫn có thể đẩy quá mép một chút; 'return' luôn đi vào trong nên không bị ảnh hưởng).
            const hx = this.position.x - this.home.x, hz = this.position.z - this.home.z;
            const hd = Math.sqrt(hx * hx + hz * hz);
            if (hd > this.moveRadius - 0.5 && hd > 1e-6) {
                const out = (this.desiredVel.x * hx + this.desiredVel.z * hz) / hd;
                if (out > 0) { this.desiredVel.x -= out * hx / hd; this.desiredVel.z -= out * hz / hd; }
            }
            const accel = Math.max(4, this.def.moveSpeed * 6) * dt;
            const dvx = this.desiredVel.x - this.velocity.x, dvz = this.desiredVel.z - this.velocity.z;
            const dl = Math.sqrt(dvx * dvx + dvz * dvz);
            if (dl <= accel) { this.velocity.x = this.desiredVel.x; this.velocity.z = this.desiredVel.z; }
            else { this.velocity.x += dvx / dl * accel; this.velocity.z += dvz / dl * accel; }
            this.velocity.y = 0;

            this.position.x += (this.velocity.x + this.knockback.x) * dt;
            this.position.z += (this.velocity.z + this.knockback.z) * dt;
            if (this.knockback.lengthSq() > 0.0001) this.knockback.multiplyScalar(Math.exp(-10 * dt)); else this.knockback.set(0, 0, 0);

            const restY = groundHeightAt(this.position.x, this.position.z, this.width / 2, this.depth / 2, this.position.y - this.getRestOffset()) + this.getRestOffset();
            if (!this.isGrounded || this.vy !== 0 || this.position.y > restY + 0.05) {
                const g = (window.player && window.player.gravity) || 38;
                this.vy -= g * dt;
                this.position.y += this.vy * dt;
                if (this.position.y <= restY) { this.position.y = restY; this.vy = 0; this.isGrounded = true; }
                else this.isGrounded = false;
            } else {
                this.position.y = restY;
                this.isGrounded = true;
            }

            this.mesh.position.copy(this.position);
            if (window.resolveStaticCollisions) window.resolveStaticCollisions(this, this.width, this.height, this.depth, dt);
            this.position.x = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, this.position.x));
            this.position.z = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, this.position.z));
            if (this.position.y < -50) { this.position.set(this.home.x, 0, this.home.z); this.alignToGround(); }
            this.mesh.position.copy(this.position);
            this.mesh.rotation.y = this.facing;
            this.aabb.updateFromObject(this.mesh, this.width, this.height, this.depth);
        }

        addSeparation() {
            let sx = 0, sz = 0;
            liveFieldEnemies.forEach(other => {
                if (other === this || !other.alive) return;
                const dx = this.position.x - other.position.x, dz = this.position.z - other.position.z;
                const minD = (this.width + other.width) * 0.5 + 0.3;
                const d2 = dx * dx + dz * dz;
                if (d2 < minD * minD && d2 > 1e-6) {
                    const d = Math.sqrt(d2);
                    const k = (minD - d) / minD;
                    sx += dx / d * k; sz += dz / d * k;
                }
            });
            if (sx || sz) { this.desiredVel.x += sx * this.def.moveSpeed; this.desiredVel.z += sz * this.def.moveSpeed; }
        }

        // ---------------- ra đòn (dùng chung cho mọi archetype)
        // victim = người chơi hoặc Decoy. Quái KHÔNG active/đã chết thì không bao giờ gây damage.
        deliverHit(victim, opts) {
            if (!this.alive || this.lifecycle !== 'active') return 'ignored';
            if (!victim) return 'ignored';
            if (victim.isDecoy) {
                if (!victim.active) return 'ignored';
                victim.takeDamage(this.stats.atk);     // Decoy: HP tuyến tính, không DEF — đúng cách Slime đánh Decoy
                if (window.sfx) window.sfx.playHit();
                return 'decoy';
            }
            if (victim !== window.player) return 'ignored';
            const A = this.def.attack;
            return window.applyEnemyAttackToPlayer(this, Object.assign({
                kind: 'melee', attackId: this.id + ':' + this.attackSeq, unblockable: A.unblockable,
                push: A.push, stagger: A.stagger
            }, opts || {}));
        }
    }

    // ------------------------------------------------------------------ vật liệu dùng chung cho hình khối quái
    // Vật liệu có ánh sáng cho thân quái; mặc định đăng ký vào danh sách chớp trắng khi trúng đòn.
    function stdMat(e, color, params, flashable) {
        const m = new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.75, metalness: 0.05, emissive: 0x000000, emissiveIntensity: 0 }, params || {}));
        if (flashable !== false) e.flashMaterials.push(m);
        return m;
    }
    function glowMat(color, opacity) {
        return new THREE.MeshBasicMaterial({ color: color, transparent: opacity !== undefined, opacity: opacity !== undefined ? opacity : 1 });
    }
    // Vật liệu vùng báo trước: vẽ ĐÈ lên cỏ/mặt đất (depthTest false) — cỏ instanced cao ~0.3-0.5 m che mất vòng
    // nằm sát đất; báo trước phải luôn đọc được (bán trong suốt nên chỉ phủ nhẹ lên chân nhân vật).
    function tgMat(color, opacity) {
        return new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
    }
    function addPart(parent, geo, mat, x, y, z, shadow) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        if (shadow) { m.castShadow = true; m.receiveShadow = true; }
        parent.add(m);
        return m;
    }
    function lerpTo(obj, key, value, k) { obj[key] += (value - obj[key]) * k; }

    // ------------------------------------------------------------------ đòn "vùng" (dùng chung)
    // Người chơi (hoặc Decoy) trong hình quạt (origin, dir, bán kính, góc) — kiểm tra ĐÚNG 1 lần mỗi đòn.
    function victimInSector(victim, origin, dir, radius, arcDeg) {
        const pos = victim.position;
        const dx = pos.x - origin.x, dz = pos.z - origin.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const bodyR = victim === window.player ? window.player.width / 2 : 0.5;
        if (d > radius + bodyR) return false;
        if (Math.abs(pos.y - (origin.y + 0.9)) > 2.2) return false;
        if (d < 0.6) return true;
        return (dx / d) * dir.x + (dz / d) * dir.z >= Math.cos(arcDeg * DEG / 2);
    }
    function victimInCircle(victim, center, radius) {
        const pos = victim.position;
        const bodyR = victim === window.player ? window.player.width / 2 : 0.5;
        if (Math.abs(pos.y - (center.y + 0.9)) > 2.2) return false;
        return hDist(pos, center) <= radius + bodyR;
    }

    // ------------------------------------------------------------------ 3. ENEMY_ARCHETYPES (phần riêng)
    // Mỗi archetype: buildVisual / buildTelegraph / onTelegraphStart / think (máy trạng thái riêng) / animate.
    const ENEMY_ARCHETYPES = {};

    // ===== A — MELEE: tiến lại, báo trước vùng quạt (khoá hướng), 1 cú đấm, thở =====
    ENEMY_ARCHETYPES.melee = {
        buildVisual(e, root) {
            const v = e.def.visual, h = e.height;
            const body = stdMat(e, v.body), accent = stdMat(e, v.accent), glow = glowMat(v.glow);
            const p = {};
            const legGeo = new THREE.BoxGeometry(0.24, h * 0.3, 0.28);
            addPart(root, legGeo, accent, -0.2, -h * 0.35, 0, true);
            addPart(root, legGeo, accent, 0.2, -h * 0.35, 0, true);
            p.torso = addPart(root, new THREE.CylinderGeometry(0.34, 0.46, h * 0.45, 10), body, 0, 0, 0, true);
            p.bodyMesh = p.torso;
            addPart(p.torso, new THREE.BoxGeometry(0.5, 0.28, 0.1), accent, 0, 0.05, 0.38, false);
            p.head = addPart(p.torso, new THREE.SphereGeometry(0.27, 12, 10), body, 0, h * 0.37, 0, true);
            const eyeGeo = new THREE.BoxGeometry(0.1, 0.06, 0.04);
            addPart(p.head, eyeGeo, glow, -0.1, 0.03, 0.25, false);
            addPart(p.head, eyeGeo, glow, 0.1, 0.03, 0.25, false);
            const armGeo = new THREE.BoxGeometry(0.2, 0.5, 0.2), fistGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
            p.armL = new THREE.Group(); p.armL.position.set(-0.5, h * 0.17, 0); p.torso.add(p.armL);
            p.armR = new THREE.Group(); p.armR.position.set(0.5, h * 0.17, 0); p.torso.add(p.armR);
            [p.armL, p.armR].forEach(arm => { addPart(arm, armGeo, body, 0, -0.25, 0, true); addPart(arm, fistGeo, accent, 0, -0.56, 0.02, true); });
            return p;
        },
        buildTelegraph(e, root) {
            const A = e.def.attack, arc = A.hitArc * DEG;
            const pivot = new THREE.Group(); root.add(pivot);
            const start = -Math.PI / 2 - arc / 2;   // CircleGeometry nằm ngang: theta -PI/2 = hướng +Z cục bộ (mặt trước)
            const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 28, start, arc), tgMat(0xef4444, 0.3));
            fill.rotation.x = -Math.PI / 2;
            const edge = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 28, 1, start, arc), tgMat(0xfca5a5, 0.85));
            edge.rotation.x = -Math.PI / 2;
            edge.scale.setScalar(A.hitRange);
            pivot.add(fill); pivot.add(edge);
            return { pivot: pivot, fill: fill, edge: edge };
        },
        onTelegraphStart(e) {
            const t = e.telegraph;
            t.pivot.position.set(e.telegraphOrigin.x, e.telegraphOrigin.y + 0.1, e.telegraphOrigin.z);
            t.pivot.rotation.y = e.facing;
            t.fill.scale.setScalar(0.2);
        },
        think(e, dt) {
            const A = e.def.attack, t = e.target;
            switch (e.combatState) {
                case 'telegraph': {
                    const k = Math.min(1, e.stateTime / A.telegraph);
                    e.telegraph.fill.scale.setScalar(Math.max(0.2, k) * A.hitRange);
                    e.telegraph.fill.material.opacity = 0.2 + 0.3 * k;
                    if (e.stateTime >= A.telegraph) e.setCombatState('attack');
                    return;
                }
                case 'attack': {
                    if (!e.attackHitDone) {
                        e.attackHitDone = true;
                        const v = e.attackTarget;
                        if (v && e.isTargetValid(v) && victimInSector(v, e.telegraphOrigin, e.telegraphDir, A.hitRange, A.hitArc)) {
                            e.deliverHit(v, { kind: 'melee', origin: e.position });
                        }
                        if (window.sfx) window.sfx.playSwing();
                        if (window.spawnConeFlash) window.spawnConeFlash(e.telegraphOrigin, e.telegraphDir, A.hitRange, Math.cos(A.hitArc * DEG / 2), 0xfca5a5, { life: 0.2, opacity: 0.6 });
                    }
                    // Nhích tới khi đấm (hình ảnh/di chuyển) — vùng trúng đòn đã khoá lúc báo trước, không đổi theo cú nhích.
                    const lungeT = A.active * 0.6;
                    if (e.stateTime < lungeT) { e.desiredVel.copy(e.telegraphDir).multiplyScalar(A.lunge / lungeT); e.velocity.copy(e.desiredVel); }
                    if (e.stateTime >= A.active) e.setCombatState('recover');
                    return;
                }
                case 'recover':
                    if (e.stateTime >= A.recovery) e.setCombatState(t ? 'approach' : 'idle');
                    return;
                default: {   // idle / approach / reposition
                    if (!t) { e.setCombatState('idle'); return; }
                    e.turnTowards(t.position, dt);
                    const d = e.distanceTo(t.position);
                    if (d > A.range) {
                        e.setCombatState('approach');
                        e.steerTowards(t.position, e.def.moveSpeed, A.range * 0.8);
                    } else if (e.attackCooldown <= 0 && e.isFacing(t.position, 30)) {
                        e.startTelegraph();
                    } else if (e.combatState !== 'idle') {
                        e.setCombatState('idle');
                    }
                }
            }
        },
        animate(e, dt) {
            const p = e.parts, A = e.def.attack, s = e.combatState, k = 1 - Math.exp(-14 * dt);
            // rotation.x của tay: 0 = thõng xuống, dương = kéo ra sau, âm = đưa ra trước/lên. Thân: âm = ngả sau.
            let armR = 0, armL = 0, lean = 0, bob = 0;
            if (s === 'telegraph') { const q = Math.min(1, e.stateTime / A.telegraph); armR = 1.1 * q; armL = -0.7 * q; lean = -0.22 * q; }
            else if (s === 'attack') { armR = -1.55; armL = 0.35; lean = 0.3; }
            else if (s === 'recover') { const q = Math.min(1, e.stateTime / A.recovery); armR = -1.2 * (1 - q); lean = 0.18 * (1 - q); }
            else if (s === 'stagger') { lean = -0.4; armR = 0.5; armL = 0.5; }
            else if (e.velocity.lengthSq() > 0.2) { const w = Math.sin(e.animClock * 10); armR = w * 0.6; armL = -w * 0.6; bob = Math.abs(w) * 0.06; }
            lerpTo(p.armR.rotation, 'x', armR, s === 'attack' ? 1 : k);
            lerpTo(p.armL.rotation, 'x', armL, k);
            lerpTo(p.torso.rotation, 'x', lean, k);
            e.visual.position.y = bob;
        }
    };

    // ===== B — RANGED: giữ khoảng cách, tia ngắm báo trước (bám rồi khoá), bắn đạn bay thẳng =====
    ENEMY_ARCHETYPES.ranged = {
        buildVisual(e, root) {
            const v = e.def.visual, p = {};
            const coreMat = stdMat(e, v.body, { emissive: v.glow, emissiveIntensity: 0.35 });
            p.core = addPart(root, new THREE.OctahedronGeometry(0.42, 0), coreMat, 0, 0.05, 0, true);
            p.core.scale.set(1, 1.25, 1);
            p.coreMat = coreMat;
            p.bodyMesh = p.core;
            p.ring = addPart(root, new THREE.TorusGeometry(0.62, 0.05, 6, 28), stdMat(e, v.accent), 0, 0.05, 0, false);
            p.ring.rotation.x = Math.PI / 2 - 0.35;
            p.tail = addPart(root, new THREE.ConeGeometry(0.16, 0.45, 6), stdMat(e, v.body), 0, -0.5, 0, false);
            p.tail.rotation.x = Math.PI;
            p.eye = addPart(p.core, new THREE.SphereGeometry(0.09, 8, 6), glowMat(0xffffff), 0, 0.02, 0.36, false);
            p.charge = addPart(root, new THREE.SphereGeometry(0.22, 12, 10), glowMat(v.glow, 0.9), 0, 0.05, 0.62, false);
            p.charge.scale.setScalar(0.01);
            p.charge.visible = false;
            return p;
        },
        buildTelegraph(e, root) {
            const pivot = new THREE.Group(); root.add(pivot);
            const lane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tgMat(0x22d3ee, 0.3));
            lane.rotation.x = -Math.PI / 2;
            const tip = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 24), tgMat(0xe0f2fe, 0.8));
            tip.rotation.x = -Math.PI / 2;
            pivot.add(lane); pivot.add(tip);
            return { pivot: pivot, lane: lane, tip: tip };
        },
        onTelegraphStart(e) {
            e.aimLocked = false;
            e.telegraph.lane.material.color.setHex(0x22d3ee);
            e.telegraph.tip.material.color.setHex(0x67e8f9);
            this.updateAim(e, true);
        },
        // Tia ngắm: từ quái tới điểm ngắm, dài đúng tầm đạn, rộng đúng đường kính đạn + thân người chơi.
        updateAim(e, track) {
            const A = e.def.attack, t = e.telegraph;
            if (track && e.attackTarget && e.isTargetValid(e.attackTarget)) e.aimPoint.copy(e.attackTarget.position);
            e.facing = yawTo(e.position, e.aimPoint);
            e.telegraphDir.set(Math.sin(e.facing), 0, Math.cos(e.facing));
            const gy = e.getGroundY();
            t.pivot.position.set(e.position.x, gy + 0.1, e.position.z);
            t.pivot.rotation.y = e.facing;
            // Dải ngắm tới điểm ngắm + 3 m (vùng nguy hiểm quanh người chơi); đạn thật vẫn bay hết projectileRange.
            const width = (A.projectileRadius + 0.4) * 2;
            const aimDist = Math.min(A.projectileRange, hDist(e.position, e.aimPoint));
            const laneLen = Math.min(A.projectileRange, aimDist + 3);
            t.lane.scale.set(width, laneLen, 1);
            t.lane.position.set(0, 0, laneLen / 2);
            t.tip.position.set(0, 0.01, aimDist);
            t.tip.scale.setScalar(A.projectileRadius + 0.4);
        },
        fire(e) {
            const A = e.def.attack;
            const muzzle = e.position.clone().addScaledVector(e.telegraphDir, 0.65);
            muzzle.y = e.position.y + 0.05;
            // Ngắm vào điểm đã KHOÁ (tâm người chơi lúc khoá) — không cập nhật theo vị trí hiện tại -> né được.
            const aim = e.aimPoint.clone();
            if (e.attackTarget && e.attackTarget.isDecoy) aim.y += 0.8;   // Decoy đặt sát đất
            const dir = aim.sub(muzzle);
            const flat = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
            if (flat < 0.001) dir.copy(e.telegraphDir); else dir.y = Math.max(-0.6, Math.min(0.6, dir.y / flat)) * flat;
            dir.normalize();
            spawnEnemyProjectile(e, muzzle, dir, { speed: A.projectileSpeed, radius: A.projectileRadius, range: A.projectileRange, color: e.def.visual.glow });
            if (window.spawnMuzzlePuff) window.spawnMuzzlePuff(muzzle, dir, e.def.visual.glow);
            if (window.sfx && window.sfx.playHydroShot) window.sfx.playHydroShot();
        },
        think(e, dt) {
            const A = e.def.attack, t = e.target;
            switch (e.combatState) {
                case 'telegraph': {
                    const lockAt = A.telegraph - A.aimLock;
                    const tracking = e.stateTime < lockAt;
                    this.updateAim(e, tracking);
                    if (!tracking && !e.aimLocked) {
                        e.aimLocked = true;
                        e.telegraph.lane.material.color.setHex(0xe0f2fe);
                        e.telegraph.tip.material.color.setHex(0xffffff);
                    }
                    e.telegraph.lane.material.opacity = tracking ? 0.2 : 0.38;
                    if (e.stateTime >= A.telegraph) e.setCombatState('attack');
                    return;
                }
                case 'attack':
                    if (!e.attackHitDone) { e.attackHitDone = true; this.fire(e); }
                    if (e.stateTime >= A.active) e.setCombatState('recover');
                    return;
                case 'recover':
                    if (e.stateTime >= A.recovery) e.setCombatState(t ? 'reposition' : 'idle');
                    return;
                default: {   // idle / approach / reposition
                    if (!t) { e.setCombatState('idle'); return; }
                    e.turnTowards(t.position, dt);
                    const d = e.distanceTo(t.position);
                    e.aimLocked = false;
                    const canShoot = e.attackCooldown <= 0 && d <= A.range && e.isFacing(t.position, 25);
                    if (d < A.retreatRange) {
                        // Bị áp sát: lùi (hoặc đi ngang ở mép leash). Kẹt quá 1.2 s vẫn được bắn (có báo trước).
                        if (e.combatState !== 'reposition') e.setCombatState('reposition');
                        e.steerAway(t.position, A.retreatSpeed);
                        if (canShoot && e.stateTime >= 1.2) e.startTelegraph();
                    } else if (d > A.preferredMax) {
                        e.setCombatState('approach');
                        e.steerTowards(t.position, e.def.moveSpeed, A.preferredMax * 0.9);
                        if (canShoot) e.startTelegraph();
                    } else if (canShoot) {
                        e.startTelegraph();
                    } else if (e.combatState !== 'idle') {
                        e.setCombatState('idle');
                    }
                }
            }
        },
        animate(e, dt) {
            const p = e.parts, A = e.def.attack, s = e.combatState;
            e.visual.position.y = Math.sin(e.animClock * 2.4) * 0.08;
            let spin = 1.5, charge = 0, glow = 0.35, tilt = 0;
            if (s === 'telegraph') { const q = Math.min(1, e.stateTime / A.telegraph); spin = 1.5 + 8 * q; charge = q; glow = 0.35 + 1.1 * q; }
            else if (s === 'attack') { spin = 6; glow = 1.2; tilt = -0.25; }
            else if (s === 'recover') { spin = 0.6; glow = 0.15; }
            else if (s === 'stagger') { spin = 0.2; tilt = 0.45; glow = 0.1; }
            p.ring.rotation.z += spin * dt;
            p.charge.visible = charge > 0.02;
            p.charge.scale.setScalar(Math.max(0.01, charge));
            if (e.flashTimer <= 0) p.coreMat.emissiveIntensity = glow;
            e.visual.rotation.x += (tilt - e.visual.rotation.x) * (1 - Math.exp(-10 * dt));
        }
    };

    // ===== C — HEAVY: đi chậm, giơ búa lâu, vòng tròn đỏ KHOÁ tại điểm nện, nện diện rộng, hồi phục dài =====
    ENEMY_ARCHETYPES.heavy = {
        buildVisual(e, root) {
            const v = e.def.visual, h = e.height, p = {};
            const body = stdMat(e, v.body, { roughness: 0.9 }), accent = stdMat(e, v.accent, { roughness: 0.85 }), glow = glowMat(v.glow);
            const legGeo = new THREE.BoxGeometry(0.5, h * 0.27, 0.55);
            addPart(root, legGeo, accent, -0.45, -h * 0.365, 0, true);
            addPart(root, legGeo, accent, 0.45, -h * 0.365, 0, true);
            p.torso = addPart(root, new THREE.BoxGeometry(1.5, h * 0.46, 1.0), body, 0, -h * 0.02, 0, true);
            p.bodyMesh = p.torso;
            p.head = addPart(p.torso, new THREE.BoxGeometry(0.62, 0.46, 0.56), body, 0, h * 0.32, 0.04, true);
            addPart(p.head, new THREE.BoxGeometry(0.5, 0.08, 0.02), glow, 0, 0.02, 0.29, false);
            const shoulderGeo = new THREE.BoxGeometry(0.46, 0.36, 0.62);
            addPart(p.torso, shoulderGeo, accent, -0.95, h * 0.17, 0, true);
            addPart(p.torso, shoulderGeo, accent, 0.95, h * 0.17, 0, true);
            // Búa: trục xoay ở vai phải; lúc nghỉ búa thõng xuống, báo trước = giơ ngược ra sau đầu, nện = bổ xuống trước.
            p.hammer = new THREE.Group(); p.hammer.position.set(0.95, h * 0.12, 0.2); p.torso.add(p.hammer);
            addPart(p.hammer, new THREE.CylinderGeometry(0.07, 0.07, 1.5, 8), accent, 0, -0.75, 0, true);
            p.hammerHead = addPart(p.hammer, new THREE.BoxGeometry(0.9, 0.55, 0.55), body, 0, -1.45, 0, true);
            addPart(p.hammerHead, new THREE.BoxGeometry(0.92, 0.1, 0.57), glow, 0, 0, 0, false);
            return p;
        },
        buildTelegraph(e, root) {
            const edge = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), tgMat(0xf97316, 0.9));
            edge.rotation.x = -Math.PI / 2;
            const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), tgMat(0xef4444, 0.35));
            fill.rotation.x = -Math.PI / 2;
            root.add(edge); root.add(fill);
            return { edge: edge, fill: fill };
        },
        onTelegraphStart(e) {
            const A = e.def.attack;
            e.telegraphPoint.copy(e.telegraphOrigin).addScaledVector(e.telegraphDir, A.impactOffset);
            e.telegraphPoint.y = groundHeightAt(e.telegraphPoint.x, e.telegraphPoint.z, 0.1, 0.1, e.position.y);
            const t = e.telegraph;
            t.edge.position.set(e.telegraphPoint.x, e.telegraphPoint.y + 0.1, e.telegraphPoint.z);
            t.fill.position.set(e.telegraphPoint.x, e.telegraphPoint.y + 0.09, e.telegraphPoint.z);
            t.edge.scale.setScalar(A.impactRadius);
            t.fill.scale.setScalar(0.05);
        },
        think(e, dt) {
            const A = e.def.attack, t = e.target;
            switch (e.combatState) {
                case 'telegraph': {
                    const k = Math.min(1, e.stateTime / A.telegraph);
                    e.telegraph.fill.scale.setScalar(Math.max(0.05, k) * A.impactRadius);   // lấp đầy = sắp nện
                    e.telegraph.edge.material.opacity = 0.6 + 0.35 * Math.abs(Math.sin(e.stateTime * (6 + 10 * k)));
                    if (e.stateTime >= A.telegraph) e.setCombatState('attack');
                    return;
                }
                case 'attack':
                    if (!e.attackHitDone) {
                        e.attackHitDone = true;
                        const v = e.attackTarget;
                        if (v && e.isTargetValid(v) && victimInCircle(v, e.telegraphPoint, A.impactRadius)) {
                            e.deliverHit(v, { kind: 'melee', origin: e.telegraphPoint, shakeTimer: 0.35, shakeIntensity: 0.45 });
                        } else if (window.player && hDist(window.player.position, e.telegraphPoint) < 9 && window.cameraState) {
                            window.cameraState.shakeTimer = 0.25; window.cameraState.shakeIntensity = 0.3;
                        }
                        if (window.spawnGroundRing) {
                            window.spawnGroundRing(e.telegraphPoint, A.impactRadius, 0xfdba74, { life: 0.45, fill: true, thickness: 0.18, startRatio: 0.3 });
                            window.spawnGroundRing(e.telegraphPoint, A.impactRadius * 1.35, 0xf97316, { life: 0.6, thickness: 0.08, startRatio: 0.6, opacity: 0.6 });
                        }
                        if (window.spawnDustPuff) window.spawnDustPuff(e.telegraphPoint.clone());
                        if (window.sfx && window.sfx.playBurst) window.sfx.playBurst();
                    }
                    if (e.stateTime >= A.active) e.setCombatState('recover');
                    return;
                case 'recover':
                    if (e.stateTime >= A.recovery) e.setCombatState(t ? 'approach' : 'idle');
                    return;
                default: {
                    if (!t) { e.setCombatState('idle'); return; }
                    e.turnTowards(t.position, dt);
                    const d = e.distanceTo(t.position);
                    if (d > A.range) {
                        e.setCombatState('approach');
                        e.steerTowards(t.position, e.def.moveSpeed, A.range * 0.85);
                    } else if (e.attackCooldown <= 0 && e.isFacing(t.position, 35)) {
                        e.startTelegraph();
                    } else if (e.combatState !== 'idle') {
                        e.setCombatState('idle');
                    }
                }
            }
        },
        animate(e, dt) {
            const p = e.parts, A = e.def.attack, s = e.combatState, k = 1 - Math.exp(-8 * dt);
            // rotation.x của búa: 0.15 = thõng xuống, -2.6 = giơ cao phía trước-trên, -1.05 = bổ xuống đất phía trước.
            let hammer = 0.15, lean = 0, bob = 0;
            if (s === 'telegraph') { const q = Math.min(1, e.stateTime / A.telegraph); hammer = 0.15 - 2.75 * easeOut(q); lean = -0.18 * q; }
            else if (s === 'attack') { hammer = -1.05; lean = 0.28; }
            else if (s === 'recover') { const q = Math.min(1, e.stateTime / A.recovery); const r = q < 0.7 ? 0 : (q - 0.7) / 0.3; hammer = -1.05 + 1.2 * r; lean = 0.28 * (1 - r); }
            else if (s === 'stagger') { lean = -0.3; }
            else if (e.velocity.lengthSq() > 0.2) { bob = Math.abs(Math.sin(e.animClock * 5)) * 0.08; }
            lerpTo(p.hammer.rotation, 'x', hammer, s === 'attack' ? Math.min(1, dt * 30) : k);
            lerpTo(p.torso.rotation, 'x', lean, k);
            e.visual.position.y = bob;
        }
    };

    // ------------------------------------------------------------------ 4. đạn của quái (tối thiểu)
    // Bay thẳng (không homing), va chạm: Decoy -> người chơi (qua applyEnemyAttackToPlayer) -> obstacle -> mặt đất ->
    // hết tầm. Chủ chết / bị dọn -> đạn tắt NGAY (quái chết không còn gây damage). Geometry/material DÙNG CHUNG
    // (tạo 1 lần), mỗi viên chỉ là 1 Mesh -> không rò GPU khi bắn nhiều.
    const enemyProjectiles = [];
    let projectileGeo = null;
    const projectileMats = {};
    function projectileMaterial(color) {
        if (!projectileMats[color]) projectileMats[color] = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.95 });
        return projectileMats[color];
    }

    function spawnEnemyProjectile(owner, origin, dir, cfg) {
        if (!owner || !owner.alive || owner.lifecycle !== 'active') return null;
        if (!projectileGeo) projectileGeo = new THREE.SphereGeometry(1, 12, 10);
        while (enemyProjectiles.length >= MAX_ENEMY_PROJECTILES) removeProjectileAt(0, 'cap');
        const mesh = new THREE.Mesh(projectileGeo, projectileMaterial(cfg.color || 0x22d3ee));
        mesh.scale.setScalar(cfg.radius);
        mesh.position.copy(origin);
        mesh.raycast = noRaycast;
        mesh.renderOrder = 4;
        window.scene.add(mesh);
        const p = {
            owner: owner, mesh: mesh, velocity: dir.clone().multiplyScalar(cfg.speed), radius: cfg.radius,
            traveled: 0, range: cfg.range, color: cfg.color || 0x22d3ee,
            attackId: owner.id + ':' + owner.attackSeq, atk: owner.stats.atk, target: owner.attackTarget
        };
        enemyProjectiles.push(p);
        return p;
    }

    function removeProjectileAt(i, reason) {
        const p = enemyProjectiles[i];
        if (!p) return;
        if (p.mesh.parent) p.mesh.parent.remove(p.mesh);   // geometry/material dùng chung -> không dispose
        p.removedReason = reason;
        enemyProjectiles.splice(i, 1);
    }

    function removeProjectilesOf(owner, reason) {
        for (let i = enemyProjectiles.length - 1; i >= 0; i--) if (enemyProjectiles[i].owner === owner) removeProjectileAt(i, reason);
    }

    function projectileHitsPlayer(pos, radius) {
        const pl = window.player;
        if (!pl || pl.isDead) return false;
        const dx = pos.x - pl.position.x, dz = pos.z - pl.position.z;
        if (Math.sqrt(dx * dx + dz * dz) > radius + pl.width / 2) return false;
        return pos.y >= pl.position.y - pl.height / 2 - radius && pos.y <= pl.position.y + pl.height / 2 + radius;
    }

    function updateEnemyProjectiles(dt) {
        if (!(dt > 0)) return;
        const step = new THREE.Vector3();
        for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
            const p = enemyProjectiles[i];
            if (!p.owner.alive || p.owner.lifecycle !== 'active') { removeProjectileAt(i, 'owner_inactive'); continue; }
            const dist = p.velocity.length() * dt;
            const n = Math.max(1, Math.ceil(dist / Math.max(0.1, p.radius)));
            step.copy(p.velocity).multiplyScalar(dt / n);
            let done = null;
            for (let s = 0; s < n && !done; s++) {
                p.mesh.position.add(step);
                p.traveled += dist / n;
                const pos = p.mesh.position;
                const decoy = window.activeDecoy;
                if (decoy && decoy.active && hDist(pos, decoy.position) <= p.radius + 0.7 && pos.y >= decoy.position.y - 0.5 && pos.y <= decoy.position.y + 2.0) {
                    decoy.takeDamage(p.atk);
                    done = 'decoy';
                    break;
                }
                if (projectileHitsPlayer(pos, p.radius)) {
                    const res = window.applyEnemyAttackToPlayer(p.owner, {
                        kind: 'projectile', attackId: p.attackId, atk: p.atk, origin: pos.clone().sub(p.velocity),
                        unblockable: p.owner.def.attack.unblockable, push: p.owner.def.attack.push, stagger: p.owner.def.attack.stagger
                    });
                    if (res === 'hit' || res === 'countered') { done = res; break; }   // bất tử -> đạn bay xuyên (né được)
                }
                const obs = window.obstacles || [];
                for (let k = 0; k < obs.length; k++) {
                    const bb = obs[k].aabb;
                    if (pos.x > bb.minX - p.radius && pos.x < bb.maxX + p.radius && pos.y > bb.minY - p.radius && pos.y < bb.maxY + p.radius && pos.z > bb.minZ - p.radius && pos.z < bb.maxZ + p.radius) { done = 'obstacle'; break; }
                }
                if (done) break;
                if (typeof getTerrainHeight === 'function' && pos.y <= getTerrainHeight(pos.x, pos.z)) { done = 'ground'; break; }
                if (p.traveled >= p.range) { done = 'range'; break; }
            }
            if (!done) {
                if (window.spawnDot && Math.random() < 0.7) window.spawnDot(p.mesh.position, { color: p.color, life: 0.2, size: 1.3, endSize: 0.2, opacity: 0.7 });
                continue;
            }
            const at = p.mesh.position.clone();
            if (done === 'hit' || done === 'countered' || done === 'decoy') { if (window.spawnFacingRing) window.spawnFacingRing(at, 0.8, p.color, { life: 0.2 }); }
            else if (window.spawnDustPuff) window.spawnDustPuff(at);
            removeProjectileAt(i, done);
        }
    }

    // ------------------------------------------------------------------ nhà máy + export
    // Tạo 1 quái từ ENEMY_DEFINITIONS[defId] tại (x, z) và đưa vào window.enemies[] (giống spawnCampSlime).
    // defId không tồn tại / không phải object -> trả null, KHÔNG tạo gì (không crash).
    function spawnFieldEnemy(defId, x, z, opts) {
        const def = getEnemyDefinition(defId);
        if (!def) { console.warn('[EnemyFramework] không có định nghĩa quái hợp lệ:', defId); return null; }
        if (typeof x !== 'number' || !isFinite(x) || typeof z !== 'number' || !isFinite(z)) { console.warn('[EnemyFramework] vị trí spawn không hợp lệ:', x, z); return null; }
        x = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, x));
        z = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, z));
        const enemy = new FieldEnemy(def, x, z, opts);
        window.enemies.push(enemy);
        return enemy;
    }

    window.FieldEnemy = FieldEnemy;
    window.ENEMY_ARCHETYPES = ENEMY_ARCHETYPES;
    window.spawnFieldEnemy = spawnFieldEnemy;
    window.updateEnemyProjectiles = updateEnemyProjectiles;
    window.EnemyFramework = {
        FieldEnemy: FieldEnemy,
        ENEMY_ARCHETYPES: ENEMY_ARCHETYPES,
        LIFECYCLE_TRANSITIONS: LIFECYCLE_TRANSITIONS,
        COMBAT_TRANSITIONS: COMBAT_TRANSITIONS,
        SPAWN_DURATION: SPAWN_DURATION,
        DEATH_DURATION: DEATH_DURATION,
        normalizeEnemyDefinition: normalizeEnemyDefinition,
        getEnemyDefinition: getEnemyDefinition,
        spawnFieldEnemy: spawnFieldEnemy,
        spawnEnemyProjectile: spawnEnemyProjectile,
        removeProjectilesOf: removeProjectilesOf,
        updateEnemyProjectiles: updateEnemyProjectiles,
        get projectiles() { return enemyProjectiles; },
        get liveEnemies() { return Array.from(liveFieldEnemies); }
    };
})();
