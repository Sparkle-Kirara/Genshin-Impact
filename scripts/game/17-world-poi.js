// ============================================================
// Alpha M4 — VÙNG ALPHA: ĐIỂM THAM QUAN (POI) + VẬT THỂ TƯƠNG TÁC CỦA THẾ GIỚI
// ============================================================
// Dựng thêm trên thế giới SẴN CÓ (không thay map): lối đi từ khu cắm trại (spawn) ra Tháp Canh Cổ ở rìa Rừng Tây,
// rồi quay về qua Bãi Đá Thử Thách (encounter M3). Tất cả là dữ liệu trong ALPHA_REGION + vài hàm dựng hình
// procedural — không có asset ngoài.
//
//   Trinh sát Arin   NPC giao nhiệm vụ, đứng ở cửa ra phía Nam của khu cắm trại (dùng class NPC + engine hội thoại có sẵn;
//                    nội dung/trạng thái hội thoại do module nhiệm vụ 18 quyết định qua StoryQuest.dialogueStateFor()).
//   Hàng đèn lồng    4 cột đèn dẫn đường từ trại tới tháp (trang trí, không va chạm).
//   Tháp Canh Cổ     landmark cao ~9.5 m nhìn thấy từ trại; thân tháp là 2 AABB trong `obstacles` -> leo được, đỉnh
//                    phẳng đứng được (điểm ngắm cảnh, có vùng khám phá riêng 'watchtower_top').
//   Bia đá cổ        Interactable: đọc qua đúng khung hội thoại có sẵn; đọc xong -> WorldState.activate + world:interacted.
//   Rương Tháp Canh  Chest của thế giới (không thuộc camp): khoá cho tới khi bia đá đã được đọc, mở 1 lần duy nhất
//                    (cờ WorldState.opened đặt TRƯỚC khi phát thưởng -> reload/tương tác lặp không nhận lại).
//   Vùng khám phá    Tháp Canh, Đỉnh Tháp, Rừng Tây, Hồ Gương, Bãi Đá Thử Thách (WorldState.registerZone).
//
// Tương tác dùng CHUNG hệ Interactable (01) + chọn vật gần nhất (08) + phím F / nút chạm (interactWithNearbyObject,
// 02) — không có hệ tương tác thứ hai. initWorldPoi() idempotent; WorldPoi.syncFromState() khớp thế giới với
// WorldState sau khi nạp save (vd rương đã mở thì gỡ khỏi thế giới).
(function () {
    'use strict';

    const ALPHA_REGION = {
        scout: { id: 'scout_arin', name: 'Trinh sát Arin', x: 0.6, z: -8.0 },
        lanterns: [[2.2, -12.5], [3.4, -18.5], [4.5, -24.8], [5.3, -30.4]],
        tower: { id: 'watchtower', name: 'Tháp Canh Cổ', x: 6, z: -37, plinth: 3.6, body: 3.0, plinthH: 1.0, bodyH: 7.0 },
        stele: { id: 'watchtower_stele', name: 'Bia đá cổ', x: 6, z: -33.0 },
        chest: {
            id: 'watchtower_chest', name: 'Rương Tháp Canh', x: 10.2, z: -35.6, chestType: 'exquisite',
            requires: 'watchtower_stele',
            rewards: [{ type: 'primogem', amount: 30 }, { type: 'material', itemId: 'sweet_flower', amount: 3 }]
        },
        zones: [
            { id: 'watchtower', name: 'Tháp Canh Cổ', x: 6, z: -37, radius: 9 },
            { id: 'watchtower_top', name: 'Đỉnh Tháp Canh', x: 6, z: -37, radius: 2.4, topOfTower: true },
            { id: 'west_forest', name: 'Rừng Tây', x: -22, z: -28, radius: 13 },
            { id: 'mirror_lake', name: 'Hồ Gương', x: -36, z: 40, radius: 13 },
            { id: 'trial_grounds', name: 'Bãi Đá Thử Thách', x: -11, z: -10, radius: 8 }
        ]
    };
    window.ALPHA_REGION = ALPHA_REGION;

    const built = { ready: false, scout: null, stele: null, chest: null, tower: null, crystal: null, halo: null, lanternLamps: [], lanterns: [], towerTopY: 0, time: 0 };

    function groundY(x, z) { return (typeof getTerrainHeight === 'function') ? getTerrainHeight(x, z) : 0; }
    function std(color, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.9, metalness: 0.02 }, extra || {})); }
    function addMesh(parent, geo, mat, x, y, z, shadow) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
        parent.add(m);
        return m;
    }
    // Hộp va chạm theo TOẠ ĐỘ THẾ GIỚI (cx, cy, cz = tâm) — cùng cấu trúc { mesh, aabb } với vách đá (04).
    function addObstacle(mesh, cx, cy, cz, w, h, d) {
        const aabb = new AABB(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2);
        obstacles.push({ mesh: mesh, aabb: aabb });
        return aabb;
    }

    // ------------------------------------------------------------------ Tháp Canh Cổ (landmark leo được)
    function buildTower() {
        const t = ALPHA_REGION.tower;
        const gy = groundY(t.x, t.z);
        const group = new THREE.Group();
        group.position.set(t.x, 0, t.z);
        const stone = std(0x8a8173), stoneDark = std(0x6f685d), wood = std(0x6b4a2f), slit = new THREE.MeshBasicMaterial({ color: 0x1c1917 });

        // Nền phẳng mỏng (chỉ hình ảnh) + bệ + thân tháp. Bệ và thân là 2 hộp va chạm (không xoay -> AABB khớp hình).
        addMesh(group, new THREE.BoxGeometry(5.6, 0.12, 5.6), stoneDark, 0, gy + 0.04, 0, false).receiveShadow = true;
        const plinthY = gy - 0.2 + t.plinthH / 2;
        const plinth = addMesh(group, new THREE.BoxGeometry(t.plinth, t.plinthH, t.plinth), stoneDark, 0, plinthY, 0);
        const bodyY = gy - 0.2 + t.plinthH + t.bodyH / 2;
        const body = addMesh(group, new THREE.BoxGeometry(t.body, t.bodyH, t.body), stone, 0, bodyY, 0);
        const topY = gy - 0.2 + t.plinthH + t.bodyH;
        // Viền đỉnh + 4 lỗ châu mai ở góc (trang trí) + khe cửa sổ tối trên 4 mặt.
        addMesh(group, new THREE.BoxGeometry(t.body + 0.4, 0.3, t.body + 0.4), stoneDark, 0, topY - 0.15, 0);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
            addMesh(group, new THREE.BoxGeometry(0.55, 0.6, 0.55), stoneDark, sx * (t.body / 2), topY + 0.3, sz * (t.body / 2));
        });
        [0.35, 0.65].forEach(f => {
            const y = gy - 0.2 + t.plinthH + t.bodyH * f;
            addMesh(group, new THREE.BoxGeometry(0.35, 0.9, 0.06), slit, 0, y, t.body / 2 + 0.02, false);
            addMesh(group, new THREE.BoxGeometry(0.35, 0.9, 0.06), slit, 0, y, -t.body / 2 - 0.02, false);
            addMesh(group, new THREE.BoxGeometry(0.06, 0.9, 0.35), slit, t.body / 2 + 0.02, y, 0, false);
            addMesh(group, new THREE.BoxGeometry(0.06, 0.9, 0.35), slit, -t.body / 2 - 0.02, y, 0, false);
        });
        // Giá đèn gỗ + tinh thể phát sáng trên đỉnh (thấy được từ trại, lắc nhẹ trong update()).
        addMesh(group, new THREE.CylinderGeometry(0.08, 0.1, 1.0, 6), wood, 0, topY + 0.5, 0);
        const crystalMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xf59e0b, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.1 });
        const crystal = addMesh(group, new THREE.OctahedronGeometry(0.55, 0), crystalMat, 0, topY + 1.55, 0, false);
        const halo = addMesh(group, new THREE.SphereGeometry(0.95, 16, 12),
            new THREE.MeshBasicMaterial({ color: 0xfcd34d, transparent: true, opacity: 0.22, depthWrite: false }), 0, topY + 1.55, 0, false);
        window.scene.add(group);

        // Va chạm: group đặt ở (x, 0, z), mesh con dùng y tuyệt đối -> tâm thế giới = (t.x, y, t.z).
        addObstacle(plinth, t.x, plinthY, t.z, t.plinth, t.plinthH, t.plinth);
        addObstacle(body, t.x, bodyY, t.z, t.body, t.bodyH, t.body);

        built.tower = group; built.crystal = crystal; built.halo = halo; built.towerTopY = topY;
        return group;
    }

    // ------------------------------------------------------------------ Hàng đèn lồng dẫn đường
    function buildLanterns() {
        const postGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.7, 6), armGeo = new THREE.BoxGeometry(0.5, 0.06, 0.06);
        const lampGeo = new THREE.BoxGeometry(0.22, 0.28, 0.22);
        const postMat = std(0x5c4326), lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1c2, emissive: 0xfbbf24, emissiveIntensity: 0.9, roughness: 0.4 });
        ALPHA_REGION.lanterns.forEach(([x, z]) => {
            const gy = groundY(x, z);
            const g = new THREE.Group();
            g.position.set(x, gy, z);
            addMesh(g, postGeo, postMat, 0, 0.85, 0);
            addMesh(g, armGeo, postMat, 0.2, 1.62, 0);
            built.lanternLamps.push(addMesh(g, lampGeo, lampMat, 0.4, 1.45, 0, false));
            window.scene.add(g);
            built.lanterns.push(g);
        });
    }

    // ------------------------------------------------------------------ Trinh sát Arin (NPC có sẵn class)
    class ScoutNpc extends NPC {
        constructor(position) {
            super(position, ALPHA_REGION.scout.id, 'Nhấn F để nói chuyện với ' + ALPHA_REGION.scout.name);
            this.worldId = ALPHA_REGION.scout.id;
        }
        getDialogueState() {
            const s = window.StoryQuest && window.StoryQuest.dialogueStateFor ? window.StoryQuest.dialogueStateFor(this.npcId) : null;
            return s || 'idle';
        }
        onDialogueAction(action, choice) {
            if (window.StoryQuest && window.StoryQuest.handleNpcAction) return !!window.StoryQuest.handleNpcAction(this.npcId, action, this);
            return false;
        }
    }
    window.ScoutNpc = ScoutNpc;

    function buildScout() {
        const s = ALPHA_REGION.scout;
        const pos = new THREE.Vector3(s.x, groundY(s.x, s.z), s.z);
        const npc = new ScoutNpc(pos);
        const g = new THREE.Group();
        const cloak = std(0x3f6b4a), skin = std(0xf3d3ae, { roughness: 0.7 }), leather = std(0x7a5738);
        addMesh(g, new THREE.CylinderGeometry(0.34, 0.42, 1.15, 10), cloak, 0, 0.62, 0);
        addMesh(g, new THREE.SphereGeometry(0.34, 10, 8), cloak, 0, 1.2, 0);
        addMesh(g, new THREE.SphereGeometry(0.22, 12, 10), skin, 0, 1.5, 0);
        addMesh(g, new THREE.ConeGeometry(0.27, 0.42, 10), cloak, 0, 1.72, -0.03);   // mũ trùm
        addMesh(g, new THREE.BoxGeometry(0.46, 0.08, 0.5), leather, 0, 0.95, 0);      // thắt lưng
        const staff = addMesh(g, new THREE.CylinderGeometry(0.035, 0.035, 1.8, 6), leather, 0.42, 0.9, 0.05);
        staff.rotation.z = 0.08;
        g.position.copy(pos);
        g.rotation.y = Math.atan2(0 - s.x, 0 - s.z);   // quay mặt về trại
        window.scene.add(g);
        npc.mesh = g;
        interactables.push(npc);
        built.scout = npc;
        // Hội thoại mặc định (khi module nhiệm vụ không có) — 18-story-quest.js ghi thêm các kịch bản theo nhiệm vụ.
        window.NPC_DIALOGUE_DATA[s.id] = Object.assign({
            idle: [{ speaker: s.name, text: 'Đường về phía Rừng Tây dạo này không yên ổn. Cẩn thận nhé, lữ khách.', choices: [{ text: 'Tạm biệt', action: 'end' }] }]
        }, window.NPC_DIALOGUE_DATA[s.id] || {});
        return npc;
    }

    // ------------------------------------------------------------------ Bia đá cổ (đọc qua engine hội thoại có sẵn)
    class SteleInteractable extends Interactable {
        constructor(position) {
            super(position, 'Nhấn F để đọc: ' + ALPHA_REGION.stele.name, 2.2);
            this.worldId = ALPHA_REGION.stele.id;
            this.npcId = ALPHA_REGION.stele.id;   // khoá vào NPC_DIALOGUE_DATA (engine chỉ cần npcId + getDialogueState)
        }
        getDialogueState() { return window.WorldState.isActivated(this.worldId) ? 'reread' : 'read'; }
        onInteract() { if (window.openDialogue) window.openDialogue(this); }
        onDialogueAction(action) {
            if (action !== 'stele_done') return false;
            window.WorldState.activate(this.worldId);                            // lần đầu mới đổi state (idempotent)
            window.GameEvents.emit('world:interacted', { id: this.worldId });    // mỗi lần đọc xong
            if (window.closeDialogue) window.closeDialogue();
            return true;
        }
    }
    window.SteleInteractable = SteleInteractable;

    function buildStele() {
        const s = ALPHA_REGION.stele;
        const gy = groundY(s.x, s.z);
        const stele = new SteleInteractable(new THREE.Vector3(s.x, gy, s.z));
        const g = new THREE.Group();
        g.position.set(s.x, gy, s.z);
        addMesh(g, new THREE.BoxGeometry(1.4, 0.25, 0.6), std(0x6f685d), 0, 0.1, 0);
        const slab = addMesh(g, new THREE.BoxGeometry(1.05, 1.5, 0.26), std(0x9c9384), 0, 0.95, 0);
        slab.rotation.x = -0.06;
        // Dòng chữ khắc phát sáng nhẹ (3 vạch) — tắt sáng sau khi đã đọc (xem syncFromState()).
        const glyphMat = new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.9 });
        [1.3, 1.0, 0.7].forEach(y => addMesh(g, new THREE.BoxGeometry(0.62, 0.06, 0.02), glyphMat, 0, y, 0.15, false));
        // Mặt chữ hướng +Z — về phía khu cắm trại (trại ở z = 0, bia ở z < 0).
        window.scene.add(g);
        stele.mesh = g;
        stele.glyphMat = glyphMat;
        interactables.push(stele);
        built.stele = stele;
        window.NPC_DIALOGUE_DATA[s.id] = {
            read: [
                { speaker: s.name, text: 'Nét khắc đã mờ: «Khi ngọn lửa trên tháp tắt, quái vật sẽ tụ về Bãi Đá Thử Thách, sát bên khu cắm trại.»' },
                { speaker: s.name, text: 'Bên dưới có một dấu tay còn mới — ai đó đã đến đây trước bạn.',
                  choices: [{ text: 'Ghi nhớ nội dung', action: 'stele_done' }] }
            ],
            reread: [
                { speaker: s.name, text: '«Khi ngọn lửa trên tháp tắt, quái vật sẽ tụ về Bãi Đá Thử Thách, sát bên khu cắm trại.»',
                  choices: [{ text: 'Rời đi', action: 'stele_done' }] }
            ]
        };
        return stele;
    }

    // ------------------------------------------------------------------ Rương của thế giới (mở 1 lần, có lưu)
    class WorldChest extends Chest {
        constructor(position, def) {
            super(position, null, def.chestType);
            this.worldId = def.id;
            this.label = def.name;
            this.requires = def.requires || null;
            this.fixedRewards = def.rewards.slice();
            this.isWorldChest = true;
        }
        // "Còn quái trong camp" của Chest gốc = điều kiện KHOÁ: ở đây khoá cho tới khi vật thể yêu cầu đã được kích hoạt.
        _campHasAliveSlimes() { return !!this.requires && !window.WorldState.isActivated(this.requires); }
        getPromptText() { return this.state === 'unlocked' ? 'Mở: ' + this.label : ''; }
        _open() {
            if (this.isOpened) return;
            this.isOpened = true;
            this.state = 'opened';
            this.interactionRadius = 0;
            // Cờ bền đặt TRƯỚC khi phát thưởng (reward handler -> requestSave thấy luôn cờ này). Rương đã mở từ trước
            // (cờ có sẵn) thì không phát lại gì.
            const firstTime = window.WorldState.markOpened(this.worldId);
            this._playOpenAnimation();
            if (firstTime) {
                this.fixedRewards.forEach(r => {
                    const h = window.REWARD_HANDLERS[r.type];
                    if (h) h(r.amount, r); else console.warn('[WorldChest] không có REWARD_HANDLERS cho', r.type);
                });
            }
            window.GameEvents.emit('world:chestOpened', { id: this.worldId, firstTime: firstTime });
            if (window.sfx && window.sfx.playBurst) window.sfx.playBurst();
            setTimeout(() => this.removeFromWorld(), 900);
        }
        removeFromWorld() {
            if (this.meshGroup) {
                if (this.meshGroup.parent) this.meshGroup.parent.remove(this.meshGroup);
                this.meshGroup.traverse(o => {
                    if (o.geometry) o.geometry.dispose();
                    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
                });
            }
            this.pendingRemoval = true;          // 08 gỡ khỏi interactables ở frame kế tiếp (+ bỏ nearbyInteractable)
            this.interactionRadius = 0;
            this.meshGroup = null; this.mesh = null;
            if (built.chest === this) built.chest = null;   // không giữ tham chiếu tới vật thể đã gỡ khỏi thế giới
        }
    }
    window.WorldChest = WorldChest;

    function buildChest() {
        const c = ALPHA_REGION.chest;
        const pos = new THREE.Vector3(c.x, groundY(c.x, c.z), c.z);
        const chest = new WorldChest(pos, c);
        chest.meshGroup.position.copy(pos);
        chest.meshGroup.rotation.y = -Math.PI / 2;
        window.scene.add(chest.meshGroup);
        interactables.push(chest);
        built.chest = chest;
        return chest;
    }

    function registerZones() {
        ALPHA_REGION.zones.forEach(z => {
            const def = Object.assign({}, z);
            if (z.topOfTower) def.minY = built.towerTopY + 0.5;
            window.WorldState.registerZone(def);
        });
    }

    // ------------------------------------------------------------------ API
    function getAnchor(id) {
        const r = ALPHA_REGION;
        if (id === r.scout.id && built.scout) return { x: built.scout.position.x, y: built.scout.position.y + 2.35, z: built.scout.position.z };
        if (id === r.tower.id) return { x: r.tower.x, y: built.towerTopY + 2.6, z: r.tower.z };
        if (id === r.stele.id) return { x: r.stele.x, y: groundY(r.stele.x, r.stele.z) + 2.1, z: r.stele.z };
        if (id === r.chest.id) return { x: r.chest.x, y: groundY(r.chest.x, r.chest.z) + 1.6, z: r.chest.z };
        const enc = window.ENCOUNTER_DEFINITIONS && window.ENCOUNTER_DEFINITIONS[id];
        if (enc && enc.beacon) return { x: enc.beacon.x, y: groundY(enc.beacon.x, enc.beacon.z) + 3.2, z: enc.beacon.z };
        return null;
    }

    // Khớp thế giới với WorldState (sau khi nạp save): rương đã mở -> gỡ hẳn; bia đã đọc -> chữ khắc bớt sáng.
    function syncFromState() {
        if (!built.ready) return;
        const WS = window.WorldState;
        if (built.chest && WS.isOpened(built.chest.worldId) && !built.chest.pendingRemoval) {
            built.chest.isOpened = true;
            built.chest.state = 'opened';
            built.chest.removeFromWorld();
        }
        if (built.stele && built.stele.glyphMat) built.stele.glyphMat.opacity = WS.isActivated(built.stele.worldId) ? 0.35 : 0.9;
    }

    function update(dt) {
        if (!built.ready) return;
        built.time += dt;
        if (built.crystal) {
            built.crystal.rotation.y += dt * 0.8;
            built.crystal.position.y = built.towerTopY + 1.55 + Math.sin(built.time * 1.6) * 0.12;
        }
        if (built.halo) {
            built.halo.position.y = built.crystal ? built.crystal.position.y : built.halo.position.y;
            built.halo.material.opacity = 0.18 + Math.sin(built.time * 2.2) * 0.06;
        }
        if (built.stele && built.stele.glyphMat && !window.WorldState.isActivated(built.stele.worldId)) {
            built.stele.glyphMat.opacity = 0.65 + Math.sin(built.time * 3) * 0.25;
        }
    }

    window.initWorldPoi = function () {
        if (built.ready) return;                 // idempotent (Return to Title không dựng lại world)
        if (!window.scene || !window.WorldState) return;
        ['watchtower_stele'].forEach(id => window.WorldState.registerId('activated', id));
        window.WorldState.registerId('opened', ALPHA_REGION.chest.id);
        buildTower();
        buildLanterns();
        buildScout();
        buildStele();
        buildChest();
        registerZones();
        built.ready = true;
        syncFromState();
    };

    window.WorldPoi = {
        REGION: ALPHA_REGION,
        getAnchor: getAnchor,
        syncFromState: syncFromState,
        update: update,
        get ready() { return built.ready; },
        get scout() { return built.scout; },
        get stele() { return built.stele; },
        get chest() { return built.chest; },
        get towerTopY() { return built.towerTopY; },
        // Gốc trong scene của mọi thứ module này dựng (đo đạc / chẩn đoán; rương đã mở không còn trong danh sách).
        get sceneRoots() { return [built.tower].concat(built.lanterns, [built.scout && built.scout.mesh, built.stele && built.stele.mesh, built.chest && built.chest.meshGroup]).filter(Boolean); }
    };
})();
