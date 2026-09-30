// ============================================================
// 09-character-system.js — CHARACTER ENGINE (Alpha v1.0 — Character System Foundation)
// ============================================================
// MỤC ĐÍCH: điều phối và THỰC THI skill/burst dựa trên dữ liệu đọc từ CHARACTER_ROSTER
// (file 10) + SKILL_LIBRARY (file 11). File này KHÔNG chứa số liệu riêng của bất kỳ nhân
// vật/nguyên tố nào — mọi con số (damage, speed, range, màu...) đều đọc từ skillData truyền
// vào, không đọc thẳng biến global kiểu ELEMENTAL_SKILL_CONFIG/BURST_CONFIG.
//
// TRẠNG THÁI TRIỂN KHAI (quan trọng — đọc trước khi dùng):
//   File này hiện CHƯA được bất kỳ entry point nào gọi tới. combat.js vẫn đang dùng đường cũ
//   (fireHydroProjectile/fireHydroBeam/launchBurstBubble/updateProjectiles) — theo đúng kế
//   hoạch đã thống nhất: "khóa data ổn định trước, viết Engine trước, CHUYỂN TỪNG entry point
//   sau, test kỹ mỗi bước". File này tồn tại song song, an toàn tuyệt đối, không ảnh hưởng
//   gameplay hiện tại cho tới khi có bước riêng nối combat.js sang các hàm dưới đây.
//
// PHẠM VI THAY ĐỔI CÒN LẠI (chưa làm ở bước này, chỉ ghi chú để không quên):
//   - File 02: đổi player.attack.hydroProjectile -> player.attack.skill; thêm khai báo
//     player.activeEffects = { skill: [], burst: [] }; XÓA khai báo activeProjectiles (biến
//     activeHydroBeamVisuals GIỮ NGUYÊN, không đổi — xem lý do ở runBeamEffect() bên dưới).
//     XÓA các field rời trên player dành riêng cho Burst cũ (burstSphere, burstDir,
//     burstDistTraveled, burstRotTimer, burstLifeTimer, burstHitCooldowns,
//     burstStaggeredEnemies, isBursting) — state tương ứng giờ nằm trong
//     player.activeEffects.burst[i].custom (xem runWaterBubbleEffect/updateWaterBubbleEffect).
//   - File 08: XÓA updateProjectiles(); thay bằng gọi updateActiveEffects(dt) tại đúng vị trí
//     cũ trong game loop. updateHydroBeamVisuals(dt) GIỮ NGUYÊN, tiếp tục được gọi như cũ.
//   - combat.js: nối handleSkillKeyDown/Up, startSkillAim, triggerElementalSkill,
//     handleBurstKeyDown/Up sang gọi executeCharacterSkill()/executeCharacterBurst() thay vì
//     fireHydroProjectile/fireHydroBeam/launchBurstBubble. raycastFromCrosshair() cần đổi
//     nguồn đọc activeProjectiles -> player.activeEffects.skill (giữ NGUYÊN logic loại trừ).
//     canUseBurst() cần đổi điều kiện "if (player.isBursting) return false;" sang đọc
//     "if (player.activeEffects.burst.length > 0) return false;" (CHƯA thực hiện ở file này).
//
// NGUYÊN TẮC "PRESERVE BEHAVIOR" ĐÃ ÁP DỤNG KHI VIẾT FILE NÀY:
//   Mọi hằng số, thứ tự phép tính, tên field (kể cả field không còn dùng như spawnPosition/
//   beamMesh: null trong shape đạn) được COPY NGUYÊN VẸN từ combat.js/08-physics-combat-
//   camera-loop.js gốc. Không tối ưu, không đổi hành vi va chạm/trail/damage/cleanup. Những
//   chỗ hành vi CŨ có vẻ là dead code hoặc chưa tối ưu được ghi chú tại chỗ, KHÔNG tự sửa.
//
// window export: executeCharacterSkill, executeCharacterBurst, runBeamEffect,
//                runProjectileEffect, updateActiveEffects, endEffect
// ============================================================


// ============================================================
// ĐIỀU PHỐI CHUNG — đọc CHARACTER_ROSTER + SKILL_LIBRARY, KHÔNG hard-code nguyên tố nào
// ============================================================

// Gọi thay cho việc gọi thẳng fireHydroBeam()/fireHydroProjectile() từ handleSkillKeyDown/Up,
// startSkillAim(), triggerElementalSkill() trong combat.js (nối dây ở bước sau).
// `character`: entry từ CHARACTER_ROSTER của nhân vật đang active (KHÔNG phải id string).
// `dir`: THREE.Vector3 hướng bắn world-space (tương đương `customDir` cũ) — có thể truyền
//        null/undefined để executor tự tính theo player.mesh.rotation.y như hành vi gốc.
function executeCharacterSkill(character, dir) {
    if (!character) return; // an toàn: chưa có nhân vật active hợp lệ

    const skillData = SKILL_LIBRARY[character.skillId];
    if (!skillData) return; // nhân vật chưa có skill (skillId: null) — no-op, KHÔNG lỗi

    if (skillData.effectType === 'beam') {
        runBeamEffect('skill', character, skillData, dir);
    } else if (skillData.effectType === 'projectile') {
        runProjectileEffect('skill', character, skillData, dir);
    } else if (skillData.effectType === 'reactive_persistent') {
        // Character #3 Validation — Reactive Off-field Electro Effect. Kích hoạt TỨC THỜI (giống
        // Beam/Projectile — không có Placement Mode, không cần `dir`), tạo 1 instance MỚI trong
        // activeElectroEffects[] (multi-instance được hỗ trợ tường minh — KHÔNG kiểm tra/phá instance
        // cũ nào, đúng nguyên tắc chung của project: skill mới KHÔNG BAO GIỜ tự hủy instance cũ chỉ
        // vì cast lại, đã áp dụng nhất quán từ Decoy Bugfix).
        deployElectroReactiveEffect(character);
    } else if (skillData.effectType === 'vortex_pull') {
        runVortexPullEffect('skill', character, skillData, dir); // Character #4
    } else {
        // Alpha v1.0 chỉ hỗ trợ 'beam'/'projectile'. Nếu tới đây nghĩa là SKILL_LIBRARY có
        // effectType sai chính tả hoặc chưa được Engine hỗ trợ — cảnh báo rõ ràng thay vì
        // âm thầm không làm gì, để lỗi data lộ ra ngay khi test thay vì chìm trong im lặng.
        console.warn(`[CharacterSystem] Skill "${character.skillId}" có effectType không hợp lệ: "${skillData.effectType}"`);
    }
}

// Gọi thay cho launchBurstBubble() từ handleBurstKeyDown() (nối dây ở bước sau).
function executeCharacterBurst(character, dir) {
    if (!character) return;

    const burstData = SKILL_LIBRARY[character.burstId];
    if (!burstData) return; // nhân vật chưa có burst — no-op

    if (burstData.effectType === 'beam') {
        runBeamEffect('burst', character, burstData, dir);
    } else if (burstData.effectType === 'projectile') {
        runProjectileEffect('burst', character, burstData, dir);
    } else if (burstData.effectType === 'aoe_zone') {
        // Elemental Burst Validation — effectType MỚI, dùng cho Burst dạng "vùng AoE đứng yên phía
        // trước Player, nhiều damage event theo thời gian" (Blazing Volley, archer_test) — khác hẳn
        // beam (instant hitscan) và projectile (di chuyển). Xem runPyroBurstZoneEffect() bên dưới.
        runPyroBurstZoneEffect('burst', character, burstData, dir);
    } else if (burstData.effectType === 'burst_state_activation') {
        // Character #3 Validation — KHÔNG giống 3 effectType trên (tất cả đều instant-trigger, gây
        // damage NGAY trong lời gọi này) — Burst Activation cần 1 STATE MACHINE PHỤ
        // (burstActivationWindup -> burstActivationActive -> Burst State kéo dài) vì cần: (1) khóa
        // HOÀN TOÀN movement/input trong lúc windup, (2) damage event xảy ra SAU 1 khoảng animation
        // active, KHÔNG PHẢI tức thời. KHÔNG effectType hiện có tái dùng được nguyên trạng (đã xác
        // nhận qua Integration Test Phase 12). Hàm này CHỈ khởi động state machine — damage thật xảy
        // ra trong updateCombat() (file 08) khi burstActivationActive kết thúc (xem đó).
        startBurstActivation(character, burstData, dir);
    } else if (burstData.effectType === 'stationary_field') {
        runWindFieldEffect('burst', character, burstData, dir); // Character #4
    } else if (burstData.effectType === 'heavy_slam') {
        runGroundSlamEffect('burst', character, burstData); // Character #5
    } else if (burstData.effectType === 'stationary_tick_field') {
        runRoseFieldEffect('burst', character, burstData); // Character #6
    } else {
        console.warn(`[CharacterSystem] Burst "${character.burstId}" có effectType không hợp lệ: "${burstData.effectType}"`);
    }
}


// ============================================================
// BEAM EXECUTOR — thay thế fireHydroBeam() (combat.js dòng 394-466)
// ============================================================
// Instant hitscan: quét mọi enemy còn sống trên đường thẳng [origin, origin + dir*maxRange],
// gây damage NGAY LẬP TỨC, hình ảnh chỉ là hiệu ứng fade nhanh (KHÔNG di chuyển/va chạm theo
// frame). Đây là logic TÍNH DAMAGE bằng thuật toán projection riêng — KHÔNG dùng
// raycastFromCrosshair() (hàm đó phục vụ convergence aim, mục đích khác, xem ghi chú cuối file).
function runBeamEffect(slot, character, skillData, dir) {
    sfx.playBurst(); // GIỮ NGUYÊN — Alpha v1.0 chưa data-driven hóa SFX theo nguyên tố (nợ kỹ
                      // thuật, xử lý ở bước sau, không thuộc phạm vi migration này)

    const forward = dir
        ? dir.clone().normalize()
        : new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)).normalize();
    const origin = player.position.clone().addScaledVector(forward, 0.9); // GIỮ NGUYÊN hệ số 0.9

    // Talent System v2: getTalentScaling() (category 'skillBeam' — ứng với Torrent Surge/Press,
    // TÁCH RIÊNG khỏi 'skillTick' của Dewdrop/Hold, xem roster) CHỈ đọc config {stat, multiplier}.
    // skillData.damage (hệ số phụ riêng THEO SKILL, từ SKILL_LIBRARY) VẪN GIỮ vai trò nhân chồng
    // vào Raw Damage TRƯỚC KHI áp DEF mitigation — 2 lớp multiplier độc lập, y hệt kiến trúc cũ,
    // chỉ khác giờ nhân vào multiplier CHỨ KHÔNG nhân vào kết quả đã qua DEF (đúng thứ tự pipeline
    // KQM: Talent% -> Raw Damage -> DEF mitigation, skillData.damage thuộc về bước Raw Damage).
    const beamScaling = getTalentScaling(character, 'skillBeam');
    beamScaling.multiplier *= skillData.damage; // nhân lớp phụ theo skill VÀO multiplier, trước DEF

    // --- Quét enemy cắt ngang đường thẳng — GIỮ NGUYÊN 100% thuật toán projection gốc ---
    let beamEndDistance = skillData.maxRange;
    const hitEnemies = [];
    for (let j = 0; j < enemies.length; j++) {
        const enemy = enemies[j];
        if (!enemy.alive) continue;
        const toEnemy = new THREE.Vector3().subVectors(enemy.position, origin);
        const t = toEnemy.dot(forward);
        if (t < 0 || t > skillData.maxRange) continue;

        const closestPoint = origin.clone().addScaledVector(forward, t);
        const perpDist = enemy.position.distanceTo(closestPoint);
        const enemyRadius = enemy.isLarge ? 1.4 : 0.8; // GIỮ NGUYÊN ước lượng bán kính theo loại
        if (perpDist <= skillData.beamRadius + enemyRadius) {
            hitEnemies.push({ enemy, t });
        }
    }
    hitEnemies.sort((a, b) => a.t - b.t); // GIỮ NGUYÊN — chỉ để nhất quán/dễ debug

    for (const { enemy, t } of hitEnemies) {
        // DEF mitigation tính THEO TỪNG enemy (mỗi enemy có thể khác level) — beam là hitscan tức
        // thời (không phải projectile bay theo frame), nên "lúc va chạm" = "lúc quét vòng lặp này",
        // KHÔNG cần tách thời điểm tính Raw Damage/DEF mitigation như Small Shot/Water Bubble.
        const beamFinalDamage = calculatePlayerToEnemyDamage(character, beamScaling, enemy);
        enemy.takeDamage(beamFinalDamage, forward, true, withDamageSource(null, character));
        const hitPos = origin.clone().addScaledVector(forward, t);
        spawnHydroSplash(hitPos, forward, true); // GIỮ NGUYÊN — hard-code Hydro trong tên hàm
        // Task 3 (Combat VFX): gợn nước + giọt bắn tại ĐÚNG điểm tia nước cắt qua enemy (hit thật).
        if (window.spawnHitImpact && getCharacterVfxElement(character)) window.spawnHitImpact(hitPos, forward, { element: getCharacterVfxElement(character), weight: 'light' });
                                                   // visual, ghi chú nợ kỹ thuật tương tự sfx,
                                                   // không xử lý trong migration này
        triggerHydroFlash();
        sfx.playHydroSplash();
        if (enemy.bodyMesh) {
            enemy.mesh.scale.set(1.28, 0.55, 1.28); // GIỮ NGUYÊN số liệu squash
            enemy.hydroSquashTimer = 0.18;
        }
        player.skillHitCount++;
        spawnEnergyParticles(enemy.position); // VFX-only — GIỮ NGUYÊN, tách biệt khỏi Energy thật bên dưới
        // Core Energy + Elemental Particle System v1: đọc ngưỡng/element/số particle từ
        // skillData.energyGeneration (data-driven, mục 11-12 spec) thay vì hard-code "6" ở đây.
        // an toàn ngược nếu skill chưa khai báo energyGeneration (Skill khác chưa cấu hình Energy).
        if (skillData.energyGeneration) {
            const eg = skillData.energyGeneration;
            const threshold = (typeof eg.hitsPerParticle === 'number') ? eg.hitsPerParticle : 1;
            if (player.skillHitCount >= threshold) {
                player.skillHitCount = 0;
                EnergySystem.generateParticles(enemy.position, eg.particles, eg.element);
            }
        }
        if (!enemy.alive) spawnDeathParticles(enemy.position);
    }

    // --- Obstacle chặn đường — GIỮ NGUYÊN, rút ngắn hình ảnh nếu bị chặn ---
    for (let k = 0; k < obstacles.length; k++) {
        const block = obstacles[k];
        const rayForTest = { origin, dir: forward };
        const hitDist = raycastAABBDistance(rayForTest, block.aabb);
        if (hitDist !== null && hitDist < beamEndDistance) beamEndDistance = hitDist;
    }

    // --- Hiệu ứng hình ảnh — GIỮ NGUYÊN activeHydroBeamVisuals (KHÔNG gộp vào activeEffects,
    // đã chốt riêng với người dùng: giữ tách biệt, ít thay đổi hơn cho bước migration này) ---
    spawnBeamVisual(origin, forward, beamEndDistance, skillData);
    // Task 3 (Combat VFX): KHOẢNH KHẮC PHÓNG (dù trúng hay trượt) — chớp nước ở miệng tia + gợn dưới
    // chân nhân vật. Hiệu ứng trúng đòn chỉ xuất hiện ở nhánh hitEnemies phía trên.
    const castVfx = getCharacterVfxElement(character);
    if (castVfx && window.spawnMuzzlePuff) {
        const prof = window.getElementVfx(castVfx);
        window.spawnMuzzlePuff(origin, forward, prof.light);
        window.spawnGroundRing(window.groundPointUnder(player.position), 1.3, prof.main, { life: 0.35, startRatio: 0.4, opacity: 0.6 });
    }

    // --- Recoil — GIỮ NGUYÊN cơ chế displacement-over-time (cộng vào velocity mỗi frame
    // trong updatePhysics, không cộng 1 lần ở đây, vì hàm này chạy sau updatePhysics) ---
    player.recoilDir.copy(forward).multiplyScalar(-1);
    player.recoilRemainingDist = skillData.recoilDistance;
    player.recoilTimer = skillData.recoilDuration;

    cameraState.shakeTimer = 0.14; cameraState.shakeIntensity = 0.18; // GIỮ NGUYÊN số liệu shake
}

// Thay thế spawnHydroBeamVisual() (combat.js dòng 626-647) — đổi tên để không hard-code Hydro
// trong tên hàm, đọc color/beamRadius/fadeDuration từ skillData thay vì
// ELEMENTAL_SKILL_CONFIG.pressureShot toàn cục. GIÁ TRỊ không đổi (đã copy đúng trong file 11).
function spawnBeamVisual(origin, dir, length, skillData) {
    const beamGeo = new THREE.CylinderGeometry(skillData.beamRadius * 0.7, skillData.beamRadius, Math.max(length, 0.01), 8);
    const beamMat = new THREE.MeshBasicMaterial({ color: skillData.color, transparent: true, opacity: 0.85 });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);

    const cylinderUpAxis = new THREE.Vector3(0, 1, 0);
    beamMesh.quaternion.setFromUnitVectors(cylinderUpAxis, dir.clone().normalize());
    beamMesh.position.copy(origin).addScaledVector(dir, length / 2);
    scene.add(beamMesh);

    // GIỮ NGUYÊN — push vào activeHydroBeamVisuals y hệt hành vi gốc, KHÔNG đổi sang activeEffects.
    activeHydroBeamVisuals.push({ mesh: beamMesh, timer: skillData.fadeDuration, maxTimer: skillData.fadeDuration });

    // GIỮ NGUYÊN — hạt nước dọc theo tia
    const segments = Math.max(3, Math.floor(length / 2));
    for (let s = 0; s < segments; s++) {
        spawnHydroTrail(origin.clone().addScaledVector(dir, (length * (s + 0.5)) / segments));
    }
}


// Gọi thay cho fireHydroProjectile(facingShotDir) trong updateSkillAim() (combat.js, nhánh
// fireTimer <= 0 lúc giữ Aim Mode). KHÁC executeCharacterSkill() ở chỗ: skill cấp cao nhất
// (SKILL_LIBRARY[character.skillId], VD hydro_pressure_shot) có effectType 'beam' — dùng cho
// Tap. Nhưng lúc GIỮ Aim, mỗi fireInterval bắn ra 1 viên đạn nhỏ mô tả trong
// skillData.aim.tickEffect (effectType 'projectile', behavior 'small_shot') — đây là 1 skill
// CON, không tra được qua executeCharacterSkill() (hàm đó chỉ biết tra skillId cấp cao nhất).
// Hàm riêng này đọc thẳng .aim.tickEffect rồi gọi runProjectileEffect() (không qua dispatcher
// effectType 'beam'/'projectile' ở executeCharacterSkill, vì đã biết chắc là projectile).
function executeSkillTickEffect(character, dir) {
    if (!character) return;
    const skillData = SKILL_LIBRARY[character.skillId];
    if (!skillData || !skillData.aim || !skillData.aim.tickEffect) return; // an toàn: nhân vật
        // chưa có skill, hoặc skill không có cấu hình Aim/tickEffect (VD skill dạng khác không
        // hỗ trợ Hold trong tương lai) — no-op, KHÔNG lỗi.
    runProjectileEffect('skill', character, skillData.aim.tickEffect, dir);
}


// ============================================================
// PROJECTILE EXECUTOR — DISPATCHER
// ============================================================
// effectType 'projectile' bao gồm 2 lifecycle khác biệt quá lớn để gộp an toàn vào 1 hàm
// (xem đối chiếu chi tiết launchBurstBubble()/updateBurst() ở phần Water Bubble bên dưới —
// đã xác nhận với người dùng: KHÔNG ép chung 1 hàm, tách 2 implementation riêng, dispatch qua
// skillData.behavior). runProjectileEffect()/updateActiveEffects() CHỈ điều phối, không tự
// chứa logic lifecycle nào — logic thật nằm trong runSmallShotEffect/runWaterBubbleEffect và
// cặp update tương ứng.
function runProjectileEffect(slot, character, skillData, dir) {
    const behavior = skillData.behavior || 'small_shot'; // mặc định an toàn ngược nếu thiếu field
    if (behavior === 'water_bubble') {
        runWaterBubbleEffect(slot, character, skillData, dir);
    } else {
        runSmallShotEffect(slot, character, skillData, dir);
    }
}

// Character #2 (Bow) Validation — MỞ RỘNG dispatcher: thêm slot 'arrows' vào vòng lặp hiện có
// (KHÔNG tạo update loop/game-loop-call riêng — dùng ĐÚNG 1 dispatcher chung cho mọi loại effect
// theo frame, đúng nguyên tắc "reuse Combat Foundation hiện tại"). fx trong slot 'arrows' luôn có
// behavior === 'arrow' (do spawnArrow() gán, xem bên dưới) — rẽ nhánh riêng, KHÔNG đi qua
// updateSmallShotEffect()/updateWaterBubbleEffect() (2 hàm đó giả định fx.skillData tồn tại, arrow
// không có skillData vì không xuất phát từ SKILL_LIBRARY — xuất phát từ talents.normalAttack.combo
// hoặc talents.bowChargedAttack, xem spawnArrow()).
function updateActiveEffects(dt) {
    updateCharacterKitTimers(dt); // Character #5/#6 — held skill + castLock (định nghĩa cuối file)
    for (const slot of ['skill', 'burst']) {
        const list = player.activeEffects[slot];
        for (let i = list.length - 1; i >= 0; i--) {
            const fx = list[i];
            const behavior = fx.skillData.behavior || 'small_shot';
            let shouldRemove;
            if (behavior === 'water_bubble') {
                shouldRemove = updateWaterBubbleEffect(fx, dt);
            } else if (behavior === 'pyro_burst_zone') {
                // Elemental Burst Validation — dispatch Pyro Burst Zone (archer_pyro_burst), ĐÚNG
                // PATTERN water_bubble ở trên.
                shouldRemove = updatePyroBurstZoneEffect(fx, dt);
            } else if (behavior === 'vortex_pull') {
                shouldRemove = updateVortexPullEffect(fx, dt);
            } else if (behavior === 'wind_field') {
                shouldRemove = updateWindFieldEffect(fx, dt);
            } else if (behavior === 'ground_slam') {
                shouldRemove = updateGroundSlamEffect(fx, dt);
            } else if (behavior === 'rose_field') {
                shouldRemove = updateRoseFieldEffect(fx, dt);
            } else {
                shouldRemove = updateSmallShotEffect(fx, dt);
            }
            if (shouldRemove) list.splice(i, 1);
        }
    }

    const arrowList = player.activeEffects.arrows;
    for (let i = arrowList.length - 1; i >= 0; i--) {
        if (updateArrowEffect(arrowList[i], dt)) arrowList.splice(i, 1);
    }

    // Elemental Skill Validation — Decoy KHÔNG nằm trong player.activeEffects (xem giải thích đầy
    // đủ ở đầu khối DECOY BOMB bên dưới file này — entity riêng, không phải hiệu ứng tạm thời) nên
    // cần 1 khối cập nhật RIÊNG ở đây, ngoài vòng lặp slot ở trên.
    //
    // BUGFIX (mục 3 — Multiple Decoy): duyệt TOÀN BỘ activeDecoys[] (trước đây chỉ update
    // window.activeDecoy — 1 object duy nhất) — mỗi Decoy có lifecycle độc lập, Decoy A không ảnh
    // hưởng Decoy B. Duyệt NGƯỢC (giống mọi vòng lặp splice-trong-lúc-duyệt khác trong file này,
    // VD updateArrowEffect ở trên) để explodeDecoy() (có thể tự splice phần tử khỏi activeDecoys[]
    // ngay trong updateDecoyEntity() nếu lifetime hết) không làm lệch index của các phần tử chưa
    // duyệt tới.
    for (let i = activeDecoys.length - 1; i >= 0; i--) {
        updateDecoyEntity(activeDecoys[i], dt);
    }

    // Character #3 Validation — activeElectroEffects[] update, ĐÚNG PATTERN activeDecoys[] ở trên
    // (duyệt ngược, splice-an-toàn — dù updateElectroReactiveEffect() hiện KHÔNG tự splice, chỉ set
    // active=false, việc splice thật xảy ra Ở ĐÂY để nhất quán chỗ duy nhất chịu trách nhiệm dọn
    // mảng, tránh 2 nơi cùng sửa 1 mảng).
    for (let i = activeElectroEffects.length - 1; i >= 0; i--) {
        const effect = activeElectroEffects[i];
        updateElectroReactiveEffect(effect, dt);
        if (!effect.active) activeElectroEffects.splice(i, 1);
    }
}


// createArrowVisualMesh(color): factory geometry DÙNG CHUNG — tách phần dựng hình học mũi tên
// (CylinderGeometry mảnh) ra khỏi spawnArrow() để KHÔNG lặp lại code khi cần dùng CHO MỤC ĐÍCH
// KHÁC ngoài projectile thật. Dùng bởi spawnArrow() (arrow bay thật) VÀ
// startBowArrowPreview()/updateBowArrowPreview() (combat.js — arrow visual TĨNH gắn trên Bow lúc
// Aim Mode, spec mục 5). Trả về THREE.Mesh CHƯA add vào scene/parent nào — nơi gọi tự quyết định
// gắn vào đâu (scene cho arrow bay thật, rightHand cho preview).
function createArrowVisualMesh(color) {
    const arrowGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6);
    const arrowMat = new THREE.MeshBasicMaterial({ color: color || 0xe2c290 });
    return new THREE.Mesh(arrowGeo, arrowMat);
}
window.createArrowVisualMesh = createArrowVisualMesh;

// ============================================================
// ARROW PROJECTILE — Character #2 (Bow) Validation
// ============================================================
// Spec mục 3: "Arrow phải sử dụng chuyển động dựa trên PHYSICS" — KHÔNG spawn-bay-đường-thẳng-cố-
// định-tới-thời-điểm-X-gây-damage như Small Shot (spec mục 3 loại trừ tường minh kiểu này). Vì
// vậy Arrow KHÔNG tái dùng runSmallShotEffect()/updateSmallShotEffect() (đó là thẳng, không
// gravity/drag) — cần implementation RIÊNG, nhưng vẫn REUSE TRIỆT ĐỂ collision architecture hiện
// có: intersectAABB(), obstacles[].aabb, enemy.aabb, AABB class (GIỐNG HỆT cách Small Shot/Water
// Bubble đã dùng) — chỉ khác ở CÁCH DI CHUYỂN (velocity + gravity + drag thay vì dir cố định *
// speed), không phải collision primitive mới.
//
// spawnArrow(): hàm DÙNG CHUNG cho CẢ Normal Attack (Shot #1-#5, gọi từ
// applyBowArrowSpawnTick() trong combat.js) LẪN Charged Attack Bow (gọi từ endBowChargedAttack()
// trong combat.js) — spec mục 9 "Charged Arrow phải dùng CÙNG Projectile System với Normal Arrow,
// KHÔNG tạo projectile architecture riêng". `overrides` (optional) cho phép Charged Attack ghi đè
// speed/gravity/drag/lifetime theo Charge Level mà KHÔNG cần 2 hàm spawn riêng.
function spawnArrow(character, origin, dir, scaling, impact, overrides) {
    const forward = dir.clone().normalize();
    const ov = overrides || {};

    // Placeholder hình học đơn giản — thon dài theo trục bay, dễ nhận diện bằng mắt khi test.
    // KHÔNG phải polish hình ảnh cuối cùng (ngoài phạm vi task "combat architecture").
    // Character #6 (Catalyst): visual 'orb' = quả cầu năng lượng phát sáng thay cho thân mũi tên.
    const arrowMesh = (ov.visual === 'orb')
        ? new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: (typeof ov.color === 'number') ? ov.color : 0xffffff }))
        : createArrowVisualMesh(ov.color);
    arrowMesh.position.copy(origin);
    // Xoay mesh để trục dài (Y cục bộ của CylinderGeometry) khớp hướng bay ban đầu — cập nhật lại
    // mỗi frame theo velocity thực tế trong updateArrowEffect() (để mũi tên "cúi đầu" theo gravity).
    arrowMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), forward);
    scene.add(arrowMesh);

    const speed = (typeof ov.speed === 'number') ? ov.speed : 24;
    const velocity = forward.clone().multiplyScalar(speed);

    // Task 3 (Combat VFX): màu vệt bay + chớp phóng. Mũi tên mang element thật (Charged Attack level
    // có element) -> màu nguyên tố đó; mũi tên thường (vật lý) -> vàng nhạt trung tính. Chỉ nhân vật
    // opt-in visualConfig.vfxElement mới có (Archer).
    const arrowVfxOn = !!getCharacterVfxElement(character) && !!window.spawnMuzzlePuff;
    const arrowElement = (typeof ov.element === 'string') ? ov.element : null;
    const arrowTrailColor = arrowElement ? window.getElementVfx(arrowElement).main : 0xfef3c7;
    if (arrowVfxOn) window.spawnMuzzlePuff(origin, forward, arrowElement ? window.getElementVfx(arrowElement).light : 0xfffbeb);

    player.activeEffects.arrows.push({
        type: 'arrow',
        mesh: arrowMesh,
        velocity: velocity,
        // gravity/drag: PLACEHOLDER, dễ chỉnh (spec mục 3 + mục 3 "World: ~30s placeholder, phải
        // dễ chỉnh sửa" — áp dụng tinh thần tương tự cho toàn bộ số liệu physics ở đây).
        gravity: (typeof ov.gravity === 'number') ? ov.gravity : 14,
        drag: (typeof ov.drag === 'number') ? ov.drag : 0.06, // hệ số giảm speed/giây (tỉ lệ thuận vận tốc)
        scaling: scaling, // {stat, multiplier} — ĐÃ đọc qua getTalentScaling(), damage tính lúc va chạm
        impact: impact,
        character: character, // snapshot nhân vật lúc bắn (giống Small Shot/Water Bubble)
        lifeTimer: 0,
        maxLifeTime: (typeof ov.maxLifeTime === 'number') ? ov.maxLifeTime : 6, // tự hủy nếu bay quá lâu không trúng gì
        stuck: false,       // true sau khi cắm vào world — dừng hoạt động như projectile (spec mục 3)
        stuckTimer: 0,      // đếm XUÔI sau khi cắm, so với stuckLifeTime để tự destroy
        stuckLifeTime: (typeof ov.stuckLifeTime === 'number') ? ov.stuckLifeTime : 30, // PLACEHOLDER dễ chỉnh (spec mục 3)
        // Character #2 (Bow) Validation — Charged Attack Charge Levels (spec mục 5): element/
        // elementIntensity CHỈ LƯU LÀM DATA đi kèm arrow, KHÔNG có logic nào trong updateArrowEffect()
        // đọc/áp dụng 2 field này (Element System thiết kế RIÊNG sau — spec mục 5 xác nhận "CHƯA
        // implement Element Application/Aura/Reaction"). Arrow Normal Attack (không truyền qua
        // overrides) mặc định null/0 — vô hại, nhất quán với Level 0 "không Element".
        element: (typeof ov.element !== 'undefined') ? ov.element : null,
        elementIntensity: (typeof ov.elementIntensity === 'number') ? ov.elementIntensity : 0,
        vfxTrailColor: arrowVfxOn ? arrowTrailColor : null, // Task 3 — null = không vẽ vệt (nhân vật chưa opt-in)
        hitboxSize: (typeof ov.hitboxSize === 'number') ? ov.hitboxSize : 0.35, // Character #6: orb to hơn mũi tên
        sweep: ov.sweep === true
    });
}
window.spawnArrow = spawnArrow;

// updateArrowEffect(arrow, dt): trả về true nếu cần splice khỏi player.activeEffects.arrows.
function updateArrowEffect(arrow, dt) {
    // --- ĐÃ CẮM VÀO WORLD: không còn hoạt động như projectile (spec mục 3 "Arrow -> World") —
    // chỉ đếm thời gian tồn tại rồi tự destroy, KHÔNG di chuyển/va chạm gì thêm.
    if (arrow.stuck) {
        arrow.stuckTimer += dt;
        if (arrow.stuckTimer >= arrow.stuckLifeTime) {
            cleanupEffect(arrow);
            return true;
        }
        return false;
    }

    arrow.lifeTimer += dt;

    // --- PHYSICS: gravity kéo velocity.y xuống, drag giảm dần toàn bộ vector velocity theo thời
    // gian (spec mục 3: "Gravity" + "Drag/deceleration" + "Speed có thể thay đổi trong quá trình
    // bay") — KHÔNG phải "bay đường thẳng cố định" (spec loại trừ tường minh).
    arrow.velocity.y -= arrow.gravity * dt;
    const dragFactor = Math.max(0, 1 - arrow.drag * dt);
    arrow.velocity.multiplyScalar(dragFactor);

    const prevPosition = arrow.mesh.position.clone();
    arrow.mesh.position.addScaledVector(arrow.velocity, dt);
    // Character #6 — sweep (chỉ projectile khai báo sweep: true, vd orb Catalyst): nếu quãng bay 1 frame dài
    // hơn hitbox (frame dài/FPS thấp), dò các điểm trung gian; gặp enemy thì dừng orb tại điểm đó để nhánh
    // collision bên dưới xử lý như bình thường -> không bay xuyên qua quái. Bow (không khai báo) giữ nguyên.
    if (arrow.sweep) {
        const travel = arrow.mesh.position.distanceTo(prevPosition);
        const stepLen = Math.max(0.1, (arrow.hitboxSize || 0.35) * 0.8);
        const steps = Math.ceil(travel / stepLen);
        if (steps > 1) {
            const probe = new AABB();
            const probeObj = { position: new THREE.Vector3() };
            let found = false;
            for (let k = 1; k < steps && !found; k++) {
                probeObj.position.lerpVectors(prevPosition, arrow.mesh.position, k / steps);
                probe.updateFromObject(probeObj, arrow.hitboxSize, arrow.hitboxSize, arrow.hitboxSize);
                for (let j = 0; j < enemies.length; j++) {
                    if (enemies[j].alive && intersectAABB(probe, enemies[j].aabb)) { found = true; break; }
                }
            }
            if (found) arrow.mesh.position.copy(probeObj.position);
        }
    }
    // Task 3 (Combat VFX): vệt bay (pooled dot) — thể hiện đường đạn, dễ đọc trên mobile.
    if (arrow.vfxTrailColor != null && window.spawnWeaponTrail) window.spawnWeaponTrail(arrow.mesh.position, arrow.vfxTrailColor, arrow.element ? 0.9 : 0.6);

    // Xoay mesh theo hướng bay THỰC TẾ mỗi frame (mũi tên "cúi đầu" dần theo gravity — hệ quả
    // trực quan của physics-based trajectory, không phải animation soạn tay).
    if (arrow.velocity.lengthSq() > 0.0001) {
        arrow.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), arrow.velocity.clone().normalize());
    }

    // --- COLLISION: dùng LẠI ĐÚNG AABB/intersectAABB() đã có (GIỐNG Small Shot) — KHÔNG tạo
    // collision primitive mới. Kiểm tra ENEMY TRƯỚC (spec mục 3 "Arrow -> Enemy": collision -> hit
    // event -> damage -> destroy arrow NGAY, không tiếp tục kiểm tra world cùng frame đó).
    const aAABB = new AABB();
    const arrowHitboxSize = arrow.hitboxSize || 0.35; // nhỏ, phù hợp mũi tên mảnh — Catalyst orb khai báo riêng
    aAABB.updateFromObject(arrow.mesh, arrowHitboxSize, arrowHitboxSize, arrowHitboxSize);

    for (let j = 0; j < enemies.length; j++) {
        const enemy = enemies[j];
        if (!enemy.alive || !intersectAABB(aAABB, enemy.aabb)) continue;

        // Spec mục 2: "Damage chỉ xảy ra khi collision thực tế" — KHÔNG có đường code nào khác gây
        // damage cho arrow ngoài nhánh này. DEF mitigation tính ĐÚNG LÚC VA CHẠM (đúng pattern Small
        // Shot/Water Bubble — arrow.scaling đóng băng từ lúc bắn, DEF động theo enemy thực sự trúng).
        const finalDamage = calculatePlayerToEnemyDamage(arrow.character, arrow.scaling, enemy);
        enemy.takeDamage(finalDamage, arrow.velocity.clone().normalize(), false, withDamageSource(arrow.impact, arrow.character));

        hitstopTimer = COMBAT_FEEL_CONFIG.hitStopDuration;
        sfx.playHit();
        cameraState.shakeTimer = COMBAT_FEEL_CONFIG.cameraShake.duration;
        cameraState.shakeIntensity = COMBAT_FEEL_CONFIG.cameraShake.intensity;
        // Task 3 (Combat VFX): chỉ ở nhánh TRÚNG thật — hiệu ứng theo element CỦA MŨI TÊN (null = vật lý)
        // và độ nặng từ arrow.impact. Nhân vật chưa opt-in -> tia lửa trắng như cũ.
        if (arrow.vfxTrailColor != null && window.spawnHitImpact) window.spawnHitImpact(arrow.mesh.position, arrow.velocity.clone().normalize(), { element: arrow.element, weight: window.impactWeight(arrow.impact) });
        else spawnCombatSparks(arrow.mesh.position, arrow.velocity.clone().normalize());
        if (!enemy.alive) spawnDeathParticles(enemy.position);

        // Spec mục 3 "Arrow -> Enemy": Hit Event -> Damage -> Destroy Arrow — KHÔNG "stick" như
        // world, biến mất NGAY (khác world, nơi arrow CẮM LẠI thay vì bị hủy).
        cleanupEffect(arrow);
        return true;
    }

    // --- WORLD COLLISION (spec mục 3 "Arrow -> World"): dùng LẠI obstacles[]/intersectAABB() y hệt
    // Small Shot/updatePhysics() (file 08) — KHÔNG tự giả định collision implementation mới. Nếu
    // trúng world: dừng lại/"cắm" vào đúng vị trí va chạm (spec: "world collision phải ngăn arrow
    // bay xuyên qua obstacle để đánh enemy phía sau" — việc dừng NGAY khi vừa chạm, trước khi có
    // thể đi xuyên, đã tự nhiên thỏa điều kiện này vì kiểm tra chạy MỖI FRAME với AABB nhỏ).
    for (let k = 0; k < obstacles.length; k++) {
        const block = obstacles[k];
        if (!intersectAABB(aAABB, block.aabb)) continue;

        arrow.stuck = true;
        arrow.stuckTimer = 0;
        arrow.velocity.set(0, 0, 0);
        // Snap về đúng vị trí VỪA TRƯỚC khi xuyên vào obstacle (frame trước) — tránh mũi tên hiện
        // "ngập" nửa trong khối khi cắm, nhất quán cảm giác với cách player/enemy AABB resolve va
        // chạm bằng vị trí frame trước (xem updatePhysics(), file 08).
        arrow.mesh.position.copy(prevPosition);
        // Task 3 (Combat VFX): TRƯỢT (cắm vào vật cản) -> bụi xám, không màu nguyên tố, không vòng chớp —
        // không thể nhầm với trúng đòn.
        if (arrow.vfxTrailColor != null && window.spawnDustPuff) window.spawnDustPuff(arrow.mesh.position);
        return false; // KHÔNG splice — arrow tiếp tục tồn tại (đã cắm) cho tới khi hết stuckLifeTime
    }

    // --- Hết thời gian bay tối đa mà chưa trúng gì (an toàn, tránh arrow bay vô hạn nếu bắn lên
    // trời/ra ngoài map) — tự hủy hẳn (KHÔNG chuyển sang trạng thái "cắm", vì không thực sự chạm
    // world nào).
    if (arrow.lifeTimer >= arrow.maxLifeTime) {
        cleanupEffect(arrow);
        return true;
    }

    return false;
}
window.updateArrowEffect = updateArrowEffect;


// ============================================================
// SMALL SHOT — thay thế fireHydroProjectile() (combat.js dòng 364-386) +
// phần rẽ nhánh 'hydro_small' trong updateProjectiles() (08-physics-combat-camera-loop.js
// dòng 1093-1181). PRESERVE BEHAVIOR 100% — đã đối chiếu và xác nhận đúng ở bước trước.
// ============================================================
function runSmallShotEffect(slot, character, skillData, dir) {
    sfx.playHydroShot(); // GIỮ NGUYÊN — nợ kỹ thuật SFX hard-code, ghi chú như trên

    const forward = dir
        ? dir.clone().normalize()
        : new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)).normalize();
    const spawnPosition = player.position.clone().addScaledVector(forward, 0.9); // GIỮ NGUYÊN hệ số 0.9

    // GIỮ NGUYÊN hình học SphereGeometry(0.15, 8, 8) — Alpha v1.0 không đổi hình dạng đạn.
    const projGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const projMat = new THREE.MeshBasicMaterial({ color: skillData.color, transparent: true, opacity: 0.9 });
    const projMesh = new THREE.Mesh(projGeo, projMat);
    projMesh.position.copy(spawnPosition);
    scene.add(projMesh);

    // GIỮ NGUYÊN toàn bộ field kể cả field không còn được đọc ở đâu (spawnPosition, beamMesh:
    // null) — theo đúng nguyên tắc "không tự ý xóa field chết trong bước migration này".
    // type: 'hydro_small' GIỮ NGUYÊN hard-code — updateSmallShotEffect() bên dưới vẫn rẽ nhánh
    // rotation/trail theo type này y hệt code gốc. Nợ kỹ thuật đã báo trước với người dùng.
    // Talent System v2 — Projectile bay theo frame: LƯU scaling {stat,multiplier} (đã nhân sẵn
    // skillData.damage vào multiplier, category 'skillTick' — ứng với Dewdrop/Hold, TÁCH RIÊNG
    // khỏi 'skillBeam' của Torrent Surge/Press) thay vì tính sẵn Final Damage ở đây — DEF
    // mitigation phải tính ĐÚNG LÚC VA CHẠM (updateSmallShotEffect() bên dưới), vì lúc bắn CHƯA
    // biết chắc enemy nào sẽ bị trúng/enemy đó level bao nhiêu (đạn có thể bay qua nhiều enemy
    // khác level trước khi trúng đích — theo đúng yêu cầu đã xác nhận).
    const tickScaling = getTalentScaling(character, 'skillTick');
    tickScaling.multiplier *= skillData.damage; // nhân lớp phụ theo skill VÀO multiplier, trước DEF

    player.activeEffects[slot].push({
        type: 'hydro_small', mesh: projMesh, dir: forward,
        speed: skillData.speed, scaling: tickScaling, character: character,
        maxRange: skillData.maxRange, distanceTraveled: 0,
        spawnPosition: spawnPosition, beamMesh: null,
        skillData: skillData // cần để update đọc trailChance một cách data-driven
    });
}

// Trả về true nếu effect này cần bị splice khỏi list (thay cho việc tự splice trong vòng lặp
// updateProjectiles() gốc — tách ra để dispatcher updateActiveEffects() điều khiển việc splice).
function updateSmallShotEffect(proj, dt) {
    proj.mesh.position.addScaledVector(proj.dir, proj.speed * dt); // GIỮ NGUYÊN
    proj.distanceTraveled += proj.speed * dt; // GIỮ NGUYÊN

    // GIỮ NGUYÊN nhánh if/else theo proj.type y hệt gốc — nhánh else là dead code đã xác nhận
    // (không có nơi nào tạo proj.type khác 'hydro_small' trong toàn bộ codebase), giữ lại
    // nguyên vẹn theo đúng chỉ thị "phát hiện vấn đề không liên quan migration -> ghi chú,
    // không tự sửa".
    if (proj.type === 'hydro_small') {
        proj.mesh.rotation.y += dt * 12.0; // GIỮ NGUYÊN số liệu
        proj.mesh.rotation.x += dt * 7.0;
        if (Math.random() < proj.skillData.trailChance) { // đổi nguồn đọc: global -> skillData
            spawnHydroTrail(proj.mesh.position); // GIÁ TRỊ trailChance không đổi (0.6)
        }
    } else {
        proj.mesh.rotation.y += dt * 10.0;
        if (Math.random() < 0.3) {
            spawnRunTrail(proj.mesh.position, proj.dir);
        }
    }

    let hitSucceeded = false;
    const pAABB = new AABB();
    let projWidth = 0.4; // GIỮ NGUYÊN
    pAABB.updateFromObject(proj.mesh, projWidth, projWidth, projWidth);

    for (let j = 0; j < enemies.length; j++) {
        const enemy = enemies[j];
        if (enemy.alive && intersectAABB(pAABB, enemy.aabb)) {
            const isHydroProj = proj.type === 'hydro_small'; // GIỮ NGUYÊN
            // Talent System v2: DEF mitigation tính ĐÚNG LÚC VA CHẠM (biết chính xác enemy nào bị
            // trúng, đúng level của enemy đó tại thời điểm này) — thay vì dùng Final Damage đã
            // "đóng băng" từ lúc bắn. Raw Damage (proj.scaling) vẫn đóng băng từ lúc bắn (đúng
            // theo yêu cầu: chỉ DEF mitigation là động, Raw Damage/Talent Scaling không đổi giữa
            // chừng dù người chơi switch nhân vật trong lúc đạn đang bay).
            const tickFinalDamage = calculatePlayerToEnemyDamage(proj.character, proj.scaling, enemy);
            enemy.takeDamage(tickFinalDamage, proj.dir, isHydroProj, withDamageSource(null, proj.character));

            if (isHydroProj) {
                spawnHydroSplash(proj.mesh.position, proj.dir, false);
                // Task 3 (Combat VFX): hiệu ứng trúng đòn nhỏ gọn (đạn Hold bắn liên tục — weight light).
                if (window.spawnHitImpact && getCharacterVfxElement(proj.character)) window.spawnHitImpact(proj.mesh.position, proj.dir, { element: getCharacterVfxElement(proj.character), weight: 'light' });
                triggerHydroFlash();
                sfx.playHydroSplash();
                if (enemy.bodyMesh) {
                    enemy.mesh.scale.set(1.28, 0.72, 1.28); // GIỮ NGUYÊN — khác squash của Beam
                    enemy.hydroSquashTimer = 0.12;
                }
            } else {
                spawnCombatSparks(proj.mesh.position, proj.dir);
                sfx.playHit();
            }

            player.skillHitCount++;
            spawnEnergyParticles(enemy.position); // VFX-only — GIỮ NGUYÊN, tách biệt khỏi Energy thật bên dưới
            // Core Energy + Elemental Particle System v1 — ĐÚNG PATTERN runBeamEffect() ở trên,
            // đọc ngưỡng/element/số particle từ proj.skillData.energyGeneration (Small Shot tickEffect
            // dùng entry RIÊNG, hitsPerParticle = 3, xem SKILL_LIBRARY file 11).
            if (proj.skillData.energyGeneration) {
                const eg = proj.skillData.energyGeneration;
                const threshold = (typeof eg.hitsPerParticle === 'number') ? eg.hitsPerParticle : 1;
                if (player.skillHitCount >= threshold) {
                    player.skillHitCount = 0;
                    EnergySystem.generateParticles(enemy.position, eg.particles, eg.element);
                }
            }

            if (!enemy.alive) spawnDeathParticles(enemy.position);
            hitSucceeded = true;
            break;
        }
    }

    if (!hitSucceeded) {
        for (let k = 0; k < obstacles.length; k++) {
            const block = obstacles[k];
            if (intersectAABB(pAABB, block.aabb)) {
                if (proj.type === 'hydro_small') {
                    spawnHydroSplash(proj.mesh.position, proj.dir, false);
                    sfx.playHydroSplash();
                } else {
                    spawnCombatSparks(proj.mesh.position, proj.dir);
                    sfx.playHit();
                }
                hitSucceeded = true;
                break;
            }
        }
    }

    if (proj.distanceTraveled >= proj.maxRange || hitSucceeded) {
        if (!hitSucceeded && proj.type === 'hydro_small') {
            spawnHydroSplash(proj.mesh.position, proj.dir, false);
        }
        cleanupEffect(proj);
        return true; // báo dispatcher splice khỏi list
    }
    return false;
}


// ============================================================
// WATER BUBBLE — thay thế launchBurstBubble() + updateBurst() + endBurstBubble()
// (combat.js dòng 739-926). PRESERVE BEHAVIOR 100% — đối chiếu từng dòng với bản gốc.
//
// KHÁC BIỆT LỚN với Small Shot (lý do tách implementation riêng theo skillData.behavior):
//   - mesh là THREE.Group 4 lớp (lõi/lớp ngoài/2 vòng vortex), không phải 1 Mesh đơn.
//   - KHÔNG biến mất khi trúng đòn — gây damage lặp lại theo tick (damageTickInterval) cho
//     TỪNG enemy riêng, dùng va chạm dạng khoảng-cách-tâm (không phải AABB như Small Shot).
//   - Có Pull/CC: hút quái nhỏ, làm chậm + stagger quái to trong bán kính vortex.
//   - Điều kiện dừng dựa trên quãng đường/thời gian tồn tại, HOÀN TOÀN TÁCH BIỆT khỏi việc có
//     trúng đòn hay không.
//   - Khi kết thúc: có hiệu ứng "tan biến" riêng (RingGeometry đẩy vào mảng particles[] toàn
//     cục), KHÔNG dùng cleanupEffect() dùng chung với Small Shot/Beam.
//   - Có tác động lên player lúc bắn (energy, scale mesh nhân vật) mà Small Shot không có.
// ============================================================

// State bổ sung riêng cho Water Bubble được lưu NGAY TRONG effect instance (fx.custom) thay vì
// rải rác trên player.* như bản gốc (player.burstDir/burstDistTraveled/burstRotTimer/
// burstLifeTimer/burstHitCooldowns/burstStaggeredEnemies) — đây là thay đổi KIẾN TRÚC LƯU TRỮ
// thuần túy (đúng mục tiêu ban đầu của việc chuyển sang activeEffects), giá trị và công thức
// tính toán bên trong GIỮ NGUYÊN 100% không đổi.
function runWaterBubbleEffect(slot, character, skillData, dir) {
    // GIỮ NGUYÊN: launchBurstBubble() tự gọi lại canUseBurst() dù nơi gọi (handleBurstKeyDown)
    // đã kiểm tra trước đó — hành vi phụ của code gốc, không ảnh hưởng nếu giữ nguyên nhưng
    // canUseBurst() thuộc combat.js (điều kiện tiên quyết chung, không phải riêng skill nào)
    // nên KHÔNG lặp lại ở đây — việc gọi canUseBurst() vẫn thuộc trách nhiệm của entry point
    // (handleBurstKeyDown trong combat.js) ở bước nối dây sau, không phải của executor này.

    const forward = dir.clone(); forward.y = 0; // GIỮ NGUYÊN
    if (forward.lengthSq() < 0.0001) forward.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)); // GIỮ NGUYÊN
    forward.normalize();

    player.energy = 0; sfx.playBurst(); // GIỮ NGUYÊN
    player.mesh.scale.set(1.22, 0.72, 1.22); // GIỮ NGUYÊN — squash nhân vật lúc bắn Burst

    const burstGroup = new THREE.Group();

    // GIỮ NGUYÊN toàn bộ 4 mesh con — lõi, lớp ngoài mờ, 2 vòng vortex. Màu sắc: bản gốc hard-
    // code 0x67e8f9 (lõi)/0x22d3ee (lớp ngoài)/0x38bdf8+0x22d3ee (2 vòng vortex) — CHỈ đổi lõi
    // sang đọc skillData.color (đúng bằng 0x67e8f9 đã copy trong file 11, giá trị KHÔNG đổi).
    // 3 mesh còn lại GIỮ NGUYÊN hard-code màu vì SKILL_LIBRARY hiện chưa có field riêng cho
    // từng lớp — đây là nợ kỹ thuật nhỏ, không thuộc phạm vi preserve-behavior (giá trị màu
    // hiển thị ra không đổi, chỉ là chưa data-driven hóa hết mọi lớp).
    const innerGeo = new THREE.SphereGeometry(skillData.radius * 0.72, 16, 12);
    const innerMat = new THREE.MeshBasicMaterial({ color: skillData.color, transparent: true, opacity: 0.85 });
    burstGroup.add(new THREE.Mesh(innerGeo, innerMat));

    const outerGeo = new THREE.SphereGeometry(skillData.radius, 16, 12);
    const outerMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.20 });
    burstGroup.add(new THREE.Mesh(outerGeo, outerMat));

    const vortexRingA = new THREE.Mesh(
        new THREE.TorusGeometry(skillData.radius * 1.35, 0.05, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65 })
    );
    vortexRingA.rotation.x = Math.PI / 2;
    burstGroup.add(vortexRingA);

    const vortexRingB = new THREE.Mesh(
        new THREE.TorusGeometry(skillData.radius * 1.7, 0.04, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.45 })
    );
    vortexRingB.rotation.x = Math.PI / 2;
    burstGroup.add(vortexRingB);

    burstGroup.position.copy(player.position).addScaledVector(forward, 1.2); // GIỮ NGUYÊN
    burstGroup.position.y = player.position.y; // GIỮ NGUYÊN
    // Task 3 (Combat VFX): KÍCH HOẠT Burst — sóng nước lan rộng dưới chân + cột giọt nước bắn lên +
    // chớp tại điểm quả cầu xuất hiện. Chỉ báo hiệu kích hoạt; damage vẫn chỉ do tick va chạm của quả cầu.
    const burstVfx = getCharacterVfxElement(character);
    if (burstVfx && window.spawnGroundRing) {
        const prof = window.getElementVfx(burstVfx);
        const feet = window.groundPointUnder(player.position);
        window.spawnGroundRing(feet, 3.0, prof.main, { life: 0.55, fill: true, thickness: 0.14 });
        window.spawnGroundRing(feet, 1.8, prof.light, { life: 0.4, startRatio: 0.2 });
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            window.spawnDot(player.position, { color: i % 2 ? prof.main : prof.light, life: 0.6, vel: new THREE.Vector3(Math.cos(a) * 3.2, 5 + Math.random() * 2, Math.sin(a) * 3.2), gravity: 14, size: 1.1, endSize: 0.5 });
        }
        window.spawnFacingRing(burstGroup.position, 2.0, prof.light, { life: 0.3 });
    }
    scene.add(burstGroup);

    // GIỮ NGUYÊN mọi giá trị khởi tạo — chỉ đổi NƠI LƯU: fx.custom thay vì field rời trên player.
    player.activeEffects[slot].push({
        type: 'water_bubble', mesh: burstGroup, dir: forward,
        skillData: skillData,
        custom: {
            distTraveled: 0,      // = player.burstDistTraveled cũ
            rotTimer: 0,           // = player.burstRotTimer cũ
            lifeTimer: 0,           // = player.burstLifeTimer cũ
            hitCooldowns: {},        // = player.burstHitCooldowns cũ
            staggeredEnemies: {},      // = player.burstStaggeredEnemies cũ
            // Talent System v2 — Projectile bay theo frame: LƯU scaling {stat,multiplier} (đã
            // nhân sẵn skillData.damage vào multiplier) + character (snapshot đúng nhân vật lúc
            // bắn) thay vì tính sẵn Final Damage — DEF mitigation phải tính ĐÚNG LÚC VA CHẠM
            // (updateWaterBubbleEffect() bên dưới), nhất quán với Small Shot (xem giải thích đầy
            // đủ ở runSmallShotEffect()). character lưu lại để calculatePlayerToEnemyDamage()
            // dùng ĐÚNG stats/level tại thời điểm bắn, không bị ảnh hưởng nếu người chơi switch
            // nhân vật giữa lúc Bubble đang bay.
            scaling: (function() {
                const s = getTalentScaling(character, 'burst');
                s.multiplier *= skillData.damage;
                return s;
            })(),
            character: character
        }
    });

    pulseBurstButton(); // GIỮ NGUYÊN
}

// ============================================================
// PYRO BURST ZONE — Elemental Burst Validation (Character #2, archer_test)
// ============================================================
// runPyroBurstZoneEffect(): tạo 1 VÙNG AOE ĐỨNG YÊN phía trước Player (spec mục 2), lưu state
// trong fx.custom (ĐÚNG PATTERN Water Bubble — hitsTriggered/hasHitList thay vì
// distTraveled/hitCooldowns vì bản chất "nhiều hit rời rạc theo mốc thời gian" thay vì "damage
// liên tục theo tick"). Mesh chỉ là 1 hình nón/quạt phẳng trên mặt đất — placeholder visual (spec
// mục 10), KHÔNG ảnh hưởng gì tới hit detection (hit detection dùng thuần toán học cone-check,
// giống applyChargedAttackHitsTick(), KHÔNG dựa vào raycast/collision mesh của chính visual này).
function runPyroBurstZoneEffect(slot, character, skillData, dir) {
    sfx.playBurst(); // GIỮ NGUYÊN pattern SFX chung cho mọi Burst (như Water Bubble)

    // Spec mục 2: "AoE định hướng theo hướng Player đang nhìn/aim TẠI THỜI ĐIỂM ACTIVATE, giữ
    // hướng đó xuyên suốt Burst — KHÔNG lock camera, KHÔNG force quay camera". `dir` đã được
    // handleBurstKeyDown() (combat.js) tính sẵn qua Soft Targeting (giống Water Bubble/Beam) TẠI
    // THỜI ĐIỂM NHẤN — forward ĐÓNG BĂNG vào fx.dir ngay đây, các hit sau này (kể cả khi Player
    // xoay camera tự do trong lúc Burst đang chạy) đều dùng ĐÚNG hướng đã đóng băng này, không đọc
    // lại player.mesh.rotation.y mỗi frame.
    const forward = dir.clone(); forward.y = 0;
    if (forward.lengthSq() < 0.0001) forward.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
    forward.normalize();

    player.energy = 0; // Spec mục 1: consume Energy — ĐÚNG PATTERN Water Bubble (canUseBurst() đã check đầy trước đó)

    // Visual placeholder (spec mục 10) — 1 hình quạt phẳng (CircleGeometry cắt theo thetaLength,
    // xoay để mở về hướng forward) nằm trên mặt đất, màu Pyro, mờ dần theo elapsed/duration (xử lý
    // trong updatePyroBurstZoneEffect()).
    const aoeCfg = skillData.aoe || { range: 7, coneDot: 0.3 };
    const coneAngle = Math.acos(THREE.MathUtils.clamp(aoeCfg.coneDot, -1, 1)) * 2; // tổng góc mở (radian) suy từ coneDot, chỉ dùng cho VISUAL — hit detection vẫn tự tính coneDot riêng từng hit
    const zoneGeo = new THREE.CircleGeometry(aoeCfg.range, 24, -coneAngle / 2, coneAngle);
    const zoneMat = new THREE.MeshBasicMaterial({ color: skillData.color || 0xea580c, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    const zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
    zoneMesh.rotation.x = -Math.PI / 2;
    // CircleGeometry mặc định vẽ quạt bắt đầu từ trục +X (thetaStart=0 tính từ +X, quay CCW nhìn từ
    // +Y xuống) — cần xoay quanh Y để tâm quạt trùng với forward (Z là "phía trước" quy ước của
    // project, xem forward = (sin, 0, cos)). Góc xoay: atan2(forward.x, forward.z) rồi + PI/2 để bù
    // trừ quy ước gốc của CircleGeometry (trục +X) sang quy ước forward (trục +Z).
    zoneMesh.rotation.z = -(Math.atan2(forward.x, forward.z) - Math.PI / 2);
    zoneMesh.position.copy(player.position);
    zoneMesh.position.y = getGroundYForPosition(player.position) + 0.05;
    scene.add(zoneMesh);

    player.activeEffects[slot].push({
        type: 'pyro_burst_zone', mesh: zoneMesh, dir: forward,
        skillData: skillData,
        custom: {
            elapsed: 0,
            duration: (skillData.timing && typeof skillData.timing.duration === 'number') ? skillData.timing.duration : 1.6,
            // hitsTriggered[i] / finalHitTriggered: ĐÚNG PATTERN player.chargedHitsTriggered — đánh
            // dấu hit đã "mở" (tới đúng mốc thời gian), KHÔNG phải đã trúng enemy nào.
            hitsTriggered: (skillData.hits || []).map(() => false),
            finalHitTriggered: false,
            // hasHitList: ĐÚNG PATTERN player.chargedHasHitList — key "enemy.id:hitIndex" (hitIndex
            // là số thứ tự trong hits[], hoặc chuỗi 'final' cho Final Hit) để PHÂN BIỆT enemy nào đã
            // trúng hit nào (spec mục 4: "cùng 1 Hit Event không được damage cùng Enemy nhiều lần,
            // nhưng Hit #2 vẫn có thể damage lại Enemy đã trúng Hit #1").
            hasHitList: [],
            origin: player.position.clone(), // ĐÓNG BĂNG vị trí Player lúc activate — AoE đứng yên tại đây dù Player di chuyển sau đó trong lúc Burst đang chạy (spec mục 2 ngụ ý vùng cố định, không di chuyển theo Player)
            character: character
        }
    });

    // Task 3 (Combat VFX): KÍCH HOẠT Burst — chớp lửa quanh chân + tàn lửa bốc lên. Các HIT thật của
    // Burst có hiệu ứng riêng tại đúng mốc thời gian của từng hit (updatePyroBurstZoneEffect).
    const zoneVfx = getCharacterVfxElement(character);
    if (zoneVfx && window.spawnGroundRing) {
        const prof = window.getElementVfx(zoneVfx);
        window.spawnGroundRing(window.groundPointUnder(player.position), 2.2, prof.light, { life: 0.4, startRatio: 0.2 });
        for (let i = 0; i < 10; i++) {
            window.spawnDot(player.position, { color: i % 2 ? prof.main : prof.light, life: 0.55, vel: new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3), gravity: -1.5, drag: 1.5, size: 1.1, endSize: 0.2 });
        }
    }

    pulseBurstButton(); // GIỮ NGUYÊN pattern chung mọi Burst
}

// updatePyroBurstZoneEffect(fx, dt): trả về true nếu cần splice khỏi player.activeEffects.burst
// (dispatcher updateActiveEffects() lo việc splice thật, ĐÚNG PATTERN updateWaterBubbleEffect()).
function updatePyroBurstZoneEffect(fx, dt) {
    const c = fx.custom;
    c.elapsed += dt;

    // Visual fade dần theo % thời gian còn lại — placeholder đơn giản (spec mục 10).
    const progress = Math.min(1, c.elapsed / c.duration);
    fx.mesh.material.opacity = 0.35 * (1 - progress * 0.7);

    const hits = fx.skillData.hits || [];
    const finalHit = fx.skillData.finalHit || null;
    const character = c.character;

    // Base scaling ĐỌC QUA getTalentScaling() category 'burst' (ĐÚNG PATTERN Water Bubble/Beam —
    // KHÔNG hard-code multiplier ở đây, đọc talents.burst.scaling của nhân vật). Tính LẠI mỗi lần
    // 1 hit "mở" (không phải mỗi frame) để tránh lãng phí — đặt hàm nhỏ dùng chung cho hits[] lẫn
    // finalHit, mỗi loại có damageMult riêng nhân thêm vào.
    function resolveHitDamage(enemy, hitEntry) {
        const scaling = getTalentScaling(character, 'burst');
        const damageMult = (hitEntry && typeof hitEntry.damageMult === 'number') ? hitEntry.damageMult : 1;
        scaling.multiplier *= damageMult;
        return calculatePlayerToEnemyDamage(character, scaling, enemy);
    }

    // aoe check dùng CHUNG cho cả hits[] lẫn finalHit — mỗi hit CÓ THỂ ghi đè aoe riêng (spec:
    // finalHit.aoe rộng hơn), fallback về skillData.aoe (mặc định) nếu hit không tự khai báo.
    function checkAoeHit(enemy, hitEntry) {
        const aoeCfg = hitEntry.aoe || fx.skillData.aoe || { range: 7, coneDot: 0.3 };
        const toEnemy = new THREE.Vector3().subVectors(enemy.position, c.origin);
        const dist = toEnemy.length();
        if (dist > aoeCfg.range || dist < 0.001) return false;
        toEnemy.normalize();
        return fx.dir.dot(toEnemy) > aoeCfg.coneDot;
    }

    // --- hits[] thường (spec mục 3-4) ---
    for (let hitIndex = 0; hitIndex < hits.length; hitIndex++) {
        const hitEntry = hits[hitIndex];
        const hitTime = (hitEntry && typeof hitEntry.time === 'number') ? hitEntry.time : 0;
        if (c.elapsed < hitTime) continue;
        if (c.hitsTriggered[hitIndex]) continue;
        c.hitsTriggered[hitIndex] = true;

        const hitImpact = (hitEntry.impact && typeof hitEntry.impact.type === 'string') ? { type: hitEntry.impact.type } : { type: 'light' };
        // Task 3 (Combat VFX): quạt lửa quét ĐÚNG range/coneDot của hit này, tại ĐÚNG thời điểm hit mở —
        // người chơi thấy nhịp các đợt damage thật (dù có trúng ai hay không).
        const zoneHitVfx = getCharacterVfxElement(character);
        if (zoneHitVfx && window.spawnConeFlash) {
            const zc = hitEntry.aoe || fx.skillData.aoe || { range: 7, coneDot: 0.3 };
            window.spawnConeFlash(fx.mesh.position, fx.dir, zc.range, zc.coneDot, window.getElementVfx(zoneHitVfx).main, { life: 0.3, opacity: 0.55 });
        }

        for (let j = 0; j < enemies.length; j++) {
            const enemy = enemies[j];
            if (!enemy.alive) continue;
            const hitKey = enemy.id + ':' + hitIndex;
            if (c.hasHitList.includes(hitKey)) continue; // spec mục 4: Hit Event này KHÔNG damage 2 lần cùng 1 Enemy
            if (!checkAoeHit(enemy, hitEntry)) continue;

            const dmg = resolveHitDamage(enemy, hitEntry);
            const pushDir = new THREE.Vector3().subVectors(enemy.position, c.origin);
            if (pushDir.lengthSq() < 0.0001) pushDir.copy(fx.dir); else pushDir.normalize();
            enemy.takeDamage(dmg, pushDir, true, withDamageSource(hitImpact, character));
            c.hasHitList.push(hitKey);

            hitstopTimer = COMBAT_FEEL_CONFIG.hitStopDuration;
            sfx.playHit();
            cameraState.shakeTimer = COMBAT_FEEL_CONFIG.cameraShake.duration;
            cameraState.shakeIntensity = COMBAT_FEEL_CONFIG.cameraShake.intensity;
            if (zoneHitVfx && window.spawnHitImpact) window.spawnHitImpact(enemy.position, pushDir, { element: zoneHitVfx, weight: window.impactWeight(hitImpact) });
            else spawnCombatSparks(enemy.position, pushDir);
            if (!enemy.alive) spawnDeathParticles(enemy.position);
        }
    }

    // --- Final Hit (spec mục 8) — damage event RIÊNG, KHÔNG gộp vào vòng lặp hits[] ở trên (dùng
    // hitKey hậu tố ':final' để tách biệt hoàn toàn khỏi hasHitList của hits[] thường — 1 enemy có
    // thể trúng CẢ hits[] thường LẪN finalHit, đây là 2 Hit Event khác nhau).
    if (finalHit) {
        const finalTime = (typeof finalHit.time === 'number') ? finalHit.time : c.duration;
        if (c.elapsed >= finalTime && !c.finalHitTriggered) {
            c.finalHitTriggered = true;
            const finalImpact = (finalHit.impact && typeof finalHit.impact.type === 'string') ? { type: finalHit.impact.type } : { type: 'launch' };
            // Task 3 (Combat VFX): đợt CUỐI — quạt lửa đậm + lớp trong, tại vùng Burst.
            const finalVfx = getCharacterVfxElement(character);
            if (finalVfx && window.spawnConeFlash) {
                const fc = finalHit.aoe || fx.skillData.aoe || { range: 7, coneDot: 0.3 };
                const prof = window.getElementVfx(finalVfx);
                window.spawnConeFlash(fx.mesh.position, fx.dir, fc.range, fc.coneDot, prof.light, { life: 0.45, opacity: 0.8 });
                window.spawnConeFlash(fx.mesh.position, fx.dir, fc.range * 0.7, fc.coneDot, prof.main, { life: 0.35, opacity: 0.7 });
            }

            for (let j = 0; j < enemies.length; j++) {
                const enemy = enemies[j];
                if (!enemy.alive) continue;
                const hitKey = enemy.id + ':final';
                if (c.hasHitList.includes(hitKey)) continue;
                if (!checkAoeHit(enemy, finalHit)) continue;

                const dmg = resolveHitDamage(enemy, finalHit);
                const pushDir = new THREE.Vector3().subVectors(enemy.position, c.origin);
                if (pushDir.lengthSq() < 0.0001) pushDir.copy(fx.dir); else pushDir.normalize();
                // Spec mục 7-8: Final Hit CÓ THỂ Launch — truyền THẲNG finalImpact ({type:'launch'})
                // vào takeDamage(), weight class của TỪNG enemy tự quyết định có thực sự bị Launch
                // hay không (resolveHitReaction()) — KHÔNG hard-code "mọi enemy đều bị launch".
                enemy.takeDamage(dmg, pushDir, true, withDamageSource(finalImpact, character));
                c.hasHitList.push(hitKey);

                if (finalVfx && window.spawnHitImpact) window.spawnHitImpact(enemy.position, pushDir, { element: finalVfx, weight: window.impactWeight(finalImpact) });
                else spawnCombatSparks(enemy.position, pushDir);
                if (!enemy.alive) spawnDeathParticles(enemy.position);
            }

            // Feedback mạnh hơn cho Final Hit (spec mục 10: "stronger explosion VFX") — placeholder.
            cameraState.shakeTimer = 0.35;
            cameraState.shakeIntensity = 0.45;
            sfx.playHit();
        }
    }

    // Kết thúc khi hết duration — TẤT CẢ hits[]/finalHit lúc này đã chắc chắn được xử lý (duration
    // luôn >= finalHit.time theo data hợp lệ, nhưng vẫn check độc lập để an toàn nếu data sai).
    // Alpha M1 (BUG-03): trước M1 chỉ trả true (dispatcher splice state) mà KHÔNG gỡ mesh vùng quạt khỏi
    // scene — mỗi lần Burst để lại 1 mesh mờ + geometry/material không giải phóng. Dọn đúng pattern các
    // effect khác (cleanupEffect: scene.remove + dispose) trước khi báo kết thúc.
    if (c.elapsed >= c.duration) {
        cleanupEffect(fx);
        return true;
    }
    return false;
}

// Trả về true nếu cần splice khỏi list (dispatcher updateActiveEffects() lo việc splice thật).
function updateWaterBubbleEffect(fx, dt) {
    const skillData = fx.skillData;
    const c = fx.custom;
    // Talent System v2: KHÔNG còn tính damageMultiplier sớm ở đây — Final Damage (bao gồm DEF
    // mitigation) được tính ĐÚNG LÚC VA CHẠM (xem enemy.takeDamage() bên dưới, dùng
    // calculatePlayerToEnemyDamage(fx.custom.character, fx.custom.scaling, enemy)) vì mỗi enemy
    // Bubble chạm phải có thể khác level — Raw Damage (fx.custom.scaling) vẫn đóng băng từ lúc bắn.

    // --- DI CHUYỂN LIÊN TỤC — GIỮ NGUYÊN 100% ---
    c.rotTimer += dt;
    c.lifeTimer += dt;
    const bob = Math.sin(c.rotTimer * skillData.pulse.speed) * skillData.pulse.amount;
    fx.mesh.position.addScaledVector(fx.dir, skillData.speed * dt);
    fx.mesh.position.y = player.position.y + bob * 2.0;
    c.distTraveled += skillData.speed * dt;

    if (Math.random() < 0.3) spawnBurstTrail(fx.mesh.position); // GIỮ NGUYÊN — xác nhận tồn tại trong vfx.js

    // --- HIỆU ỨNG "KHỐI NƯỚC SỐNG" — GIỮ NGUYÊN 100% ---
    const pulseScale = 1.0 + Math.sin(c.rotTimer * skillData.pulse.speed) * skillData.pulse.amount;
    const innerMesh = fx.mesh.children[0];
    const outerMesh = fx.mesh.children[1];
    const vortexRingA = fx.mesh.children[2];
    const vortexRingB = fx.mesh.children[3];
    if (innerMesh) innerMesh.scale.setScalar(pulseScale);
    if (outerMesh) outerMesh.scale.setScalar(1.0 + Math.sin(c.rotTimer * skillData.pulse.speed * 0.7) * (skillData.pulse.amount * 0.6));
    if (vortexRingA) vortexRingA.rotation.z += dt * skillData.pull.rotationSpeed;
    if (vortexRingB) vortexRingB.rotation.z -= dt * skillData.pull.rotationSpeed * 0.65;

    // --- FADE — GIỮ NGUYÊN 100% ---
    const rangeFade = Math.max(0, 1.0 - (c.distTraveled / skillData.maxRange));
    const lifeFade = Math.max(0, 1.0 - (c.lifeTimer / skillData.lifetime));
    const fade = Math.min(rangeFade, lifeFade);
    if (innerMesh) innerMesh.material.opacity = 0.85 * fade;
    if (outerMesh) outerMesh.material.opacity = 0.20 * fade;
    if (vortexRingA) vortexRingA.material.opacity = 0.65 * fade;
    if (vortexRingB) vortexRingB.material.opacity = 0.45 * fade;

    const bPos = fx.mesh.position;

    // --- CROWD CONTROL — GIỮ NGUYÊN 100% thuật toán, chỉ đổi nơi đọc cfg.pull -> skillData.pull ---
    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (!enemy.alive) continue;
        const distToBubble = bPos.distanceTo(enemy.position);

        if (distToBubble <= skillData.pull.radius) {
            if (enemy.isLarge) {
                enemy.velocity.x *= skillData.pull.largeEnemySlowFactor;
                enemy.velocity.z *= skillData.pull.largeEnemySlowFactor;
                if (enemy.jumpVelocity) {
                    enemy.jumpVelocity.x *= skillData.pull.largeEnemySlowFactor;
                    enemy.jumpVelocity.z *= skillData.pull.largeEnemySlowFactor;
                }
                c.staggeredEnemies[enemy.id] = skillData.pull.largeEnemyStaggerDuration;
            } else {
                // Alpha M1 (BUG-05): trước M1 cộng lực vào enemy.velocity.x/z — Slime KHÔNG tích phân
                // velocity.x/z (chỉ dùng jumpVelocity/knockback) nên quả cầu không hề kéo được quái, còn
                // velocity bị cộng dồn rác mãi mãi. Nay dùng CHUNG applyControlledPull() của Character #4
                // (bước kéo có giới hạn mỗi frame, không vượt tâm, có va chạm tĩnh, không teleport): tốc độ
                // kéo = pull.smallEnemyForce (m/s), dừng ở mép quả cầu (skillData.radius) để quái nằm
                // trong vùng damage tick. AI/di chuyển/chết của quái giữ nguyên — pull chỉ cộng thêm 1 bước.
                applyControlledPull(enemy, bPos, skillData.pull.smallEnemyForce, skillData.radius, dt);
            }
        } else if (enemy.isLarge && c.staggeredEnemies[enemy.id] > 0) {
            enemy.velocity.x *= skillData.pull.largeEnemySlowFactor;
            enemy.velocity.z *= skillData.pull.largeEnemySlowFactor;
        }

        // --- DAMAGE THEO TICK — GIỮ NGUYÊN 100% ---
        const cooldownKey = enemy.id;
        if (c.hitCooldowns[cooldownKey] > 0) {
            c.hitCooldowns[cooldownKey] -= dt;
        } else if (distToBubble < skillData.radius + (enemy.width * 0.5)) {
            const pushDir = new THREE.Vector3().subVectors(enemy.position, bPos);
            pushDir.y = 0;
            if (pushDir.lengthSq() < 0.0001) pushDir.set(1, 0, 0); else pushDir.normalize();

            // Talent System v2: DEF mitigation tính ĐÚNG LÚC VA CHẠM — biết chính xác enemy nào
            // bị trúng, đúng level enemy đó tại thời điểm này (mỗi tick Bubble có thể chạm enemy
            // khác nhau/khác level). Raw Damage (fx.custom.scaling, fx.custom.character) vẫn đóng
            // băng từ lúc bắn Burst.
            const bubbleFinalDamage = calculatePlayerToEnemyDamage(c.character, c.scaling, enemy);
            enemy.takeDamage(bubbleFinalDamage, pushDir, true, withDamageSource(null, c.character));
            spawnHydroSplash(bPos.clone(), pushDir, true);
            // Task 3 (Combat VFX): mỗi TICK damage thật của quả cầu -> hiệu ứng trúng đòn tại enemy.
            if (window.spawnHitImpact && getCharacterVfxElement(c.character)) window.spawnHitImpact(enemy.position, pushDir, { element: getCharacterVfxElement(c.character), weight: 'light' });
            triggerHydroFlash();
            sfx.playHydroSplash();

            if (enemy.bodyMesh) { enemy.mesh.scale.set(1.4, 0.45, 1.4); enemy.hydroSquashTimer = 0.22; }
            cameraState.shakeTimer = 0.20; cameraState.shakeIntensity = 0.28;
            if (!enemy.alive) spawnDeathParticles(enemy.position);
            c.hitCooldowns[cooldownKey] = skillData.damageTickInterval;
        }
    }

    // GIỮ NGUYÊN — đếm lùi/dọn dẹp timer stagger
    for (const key in c.staggeredEnemies) {
        c.staggeredEnemies[key] -= dt;
        if (c.staggeredEnemies[key] <= 0) delete c.staggeredEnemies[key];
    }
    for (const key in c.hitCooldowns) { if (c.hitCooldowns[key] < 0) c.hitCooldowns[key] = 0; }

    // --- ĐIỀU KIỆN DỪNG — GIỮ NGUYÊN 100%: theo range/lifetime, KHÔNG liên quan va chạm ---
    if (c.distTraveled >= skillData.maxRange || c.lifeTimer >= skillData.lifetime) {
        endWaterBubbleEffect(fx);
        return true; // báo dispatcher splice khỏi list
    }
    return false;
}

// Thay thế endBurstBubble() (combat.js dòng 798-811). GIỮ NGUYÊN 100% — bao gồm CẢ VIỆC KHÔNG
// xóa c.staggeredEnemies khi kết thúc, dù comment gốc mô tả ý định khác. Đây là hành vi ĐÃ XÁC
// NHẬN với người dùng: preserve behavior tuyệt đối, kể cả khả năng là bug có sẵn trong code
// gốc — KHÔNG tự sửa trong bước migration này.
//
// LƯU Ý KIẾN TRÚC: hàm này KHÔNG dùng chung cleanupEffect() (dùng cho Small Shot/Beam) vì
// Water Bubble có hiệu ứng "tan biến" riêng (RingGeometry đẩy vào particles[] toàn cục) mà
// cleanupEffect() không có — dùng chung sẽ làm mất hiệu ứng này, vi phạm preserve-behavior.
function endWaterBubbleEffect(fx) {
    const bPos = fx.mesh.position.clone();
    const impGeo = new THREE.RingGeometry(0.3, 0.55, 20);
    const impMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    const impMesh = new THREE.Mesh(impGeo, impMat);
    impMesh.position.copy(bPos); impMesh.rotation.x = Math.PI / 2; scene.add(impMesh);
    particles.push({ mesh: impMesh, velocity: new THREE.Vector3(0, 0, 0), life: 0.25, maxLife: 0.25, scaleUp: true, growthRate: 8 });

    scene.remove(fx.mesh);
    fx.mesh.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); }); // GIỮ NGUYÊN cách dispose (Group, không qua cleanupEffect)
    // GIỮ NGUYÊN: bản gốc set player.burstSphere = null; player.isBursting = false — ở kiến
    // trúc mới, việc "null hóa" tương đương với việc dispatcher splice fx khỏi
    // player.activeEffects[slot] (xảy ra ngay sau khi hàm này return ở updateWaterBubbleEffect).
    // KHÔNG còn player.isBursting global — canUseBurst() cần đổi cách kiểm tra "đang có Burst
    // active hay không" sang đọc player.activeEffects.burst.length > 0 ở bước nối dây combat.js
    // sau (CHƯA thực hiện ở file này, chỉ ghi chú để không quên).
}

// ============================================================
// ELECTRO REACTIVE EFFECT — Elemental Skill (Character #3, Polearm/Electro)
// ============================================================
// Character #3 Full Implementation Integration — Reactive Off-field Coordinated Electro Attack.
// KHÔNG PHẢI static ground field, KHÔNG PHẢI automatic periodic tick effect (kiểu Pyro Burst Zone
// tự AoE theo mốc thời gian cố định) — đây là entity CHỈ phản ứng khi có Damage Event hợp lệ xảy
// ra trên enemy, dùng HP POLLING (project không có event/observer system cho damage — không có
// addEventListener/dispatchEvent/callback nào cho takeDamage() trong toàn bộ codebase, đã xác nhận
// qua đọc code) kết hợp enemy.lastDamageSource (field mới, enemies.js) để biết "vừa có damage hợp
// lệ" MÀ KHÔNG CẦN sửa chữ ký takeDamage().
//
// Sống trong window.activeElectroEffects[] — ĐÚNG PATTERN activeDecoys[] (mảng riêng, KHÔNG dùng
// player.activeEffects vì effect này sống LÂU và BÁM THEO Active Character thay vì gắn với 1 lần
// cast cụ thể). Multi-instance ĐƯỢC HỖ TRỢ TƯỜNG MINH (yêu cầu implementation đã xác nhận rõ — "Do
// NOT collapse this into a single active effect") — mỗi instance có lifetime/per-enemy cooldown/
// ownership RIÊNG, hoàn toàn độc lập với instance khác.
window.activeElectroEffects = [];

// deployElectroReactiveEffect(character): ĐIỂM VÀO — gọi khi Elemental Skill Character #3 được kích
// hoạt (executeCharacterSkill() dispatch effectType 'reactive_persistent', xem bên dưới). KHÔNG có
// Placement Mode (khác Decoy) — kích hoạt tức thời, không cần chọn vị trí (vì effect không gắn với
// vị trí, nó bám theo CHARACTER).
function deployElectroReactiveEffect(character) {
    const cfg = (character.talents && character.talents.reactiveConfig) ? character.talents.reactiveConfig : null;

    const effect = {
        // --- Identity ---
        id: 'electro_fx_' + (window.nextEnemyId ? window.nextEnemyId++ : Date.now()),
        character: character, // snapshot NHÂN VẬT ĐÃ CAST — dùng cho DEF/scaling lúc Coordinated
                               // Attack proc VÀ để refresh() (Thunder Warrior's Resolve) biết effect
                               // này CÓ PHẢI "thuộc về chính Character #3" hay không (so character.id).

        // --- Lifetime (KHÔNG phụ thuộc Player quay lại sân hay không — đã chốt) ---
        lifetime: (cfg && typeof cfg.lifetime === 'number') ? cfg.lifetime : 10,
        elapsed: 0,
        active: true,

        // --- HP Polling state (per-instance — mỗi effect có bảng riêng, KHÔNG dùng chung 1 bảng
        // toàn cục, đảm bảo multi-instance hoạt động độc lập đúng nghĩa) ---
        lastKnownHp: {},           // map enemy.id -> hp đã ghi nhận frame trước (giữ cho debug/tương thích)
        lastKnownDamageSeq: {},    // map enemy.id -> damageEventSeq đã ghi nhận frame trước (nguồn phát hiện hit)
        perEnemyCooldownTimer: {}, // map enemy.id -> cooldown còn lại trước khi trigger lại được

        // --- Coordinated Attack config (snapshot lúc cast, ĐÚNG PATTERN decoy.explosionScaling) ---
        perEnemyCooldown: (cfg && typeof cfg.perEnemyCooldown === 'number') ? cfg.perEnemyCooldown : 2.0,
        coordinatedScaling: getTalentScaling(character, 'coordinatedAttack'),
        coordinatedImpact: getTalentImpact(character, 'coordinatedAttack'),
        element: (SKILL_LIBRARY[character.skillId] && SKILL_LIBRARY[character.skillId].element) || 'electro'
    };

    activeElectroEffects.push(effect);

    // Readability Batch — phản hồi LÚC CAST (trước đây hoàn toàn không có gì hiển thị): tia sét đánh
    // xuống chính nhân vật + vòng Electro lan ra quanh chân. Chỉ hiển thị, không gây damage (effect
    // này chỉ gây damage qua Coordinated Attack khi proc, đúng thiết kế).
    if (window.spawnElectroStrike && player && player.position) {
        window.spawnElectroStrike(player.position.clone().add(new THREE.Vector3(0, 0.3, 0)), { color: window.FX_COLORS.electroBright });
        window.spawnGroundRing(window.groundPointUnder(player.position), 2.4, window.FX_COLORS.electro, { life: 0.5, fill: true });
    }
    return effect;
}
window.deployElectroReactiveEffect = deployElectroReactiveEffect;

// updateElectroReactiveEffect(effect, dt): gọi MỖI FRAME từ updateActiveEffects() (dispatcher
// chung) — HP polling MỌI enemy, so sánh với lastKnownHp lưu từ frame trước.
//
// Quy tắc polling (yêu cầu implementation đã xác nhận từng dòng):
//   - prevHp !== undefined && enemy.hp < prevHp -> vừa có damage.
//   - enemy.lastDamageSource.canTriggerReactiveEffects !== false -> ĐƯỢC PHÉP proc (mặc định TRUE
//     nếu thiếu source hoàn toàn — "bất kỳ character nào" bao gồm cả nguồn damage CHƯA gắn metadata,
//     an toàn ngược nếu có chỗ nào đó trong tương lai quên gọi withDamageSource()).
//   - canTriggerReactiveEffects === false (Coordinated Attack tự gây) -> KHÔNG proc — chặn domino.
//   - lastKnownHp CẬP NHẬT SAU KHI xử lý xong (bao gồm CẢ HP đã bị chính proc này trừ thêm) — đảm
//     bảo KHÔNG đọc lại cùng 1 lần giảm HP ở frame kế tiếp.
//   - per-enemy cooldown RIÊNG cho enemy đó trong CHÍNH effect instance này (không phải global).
//
// Dead enemies: dọn dẹp lastKnownHp/perEnemyCooldownTimer NGAY khi !enemy.alive — enemy respawn GIỮ
// NGUYÊN id (đã xác nhận qua enemies.js — id chỉ gán trong constructor, respawn không tạo lại), nên
// PHẢI dọn dẹp lúc chết để tránh so sánh nhầm HP cũ (trước chết) với HP mới (sau respawn).
function updateElectroReactiveEffect(effect, dt) {
    if (!effect.active) return;

    effect.elapsed += dt;
    if (effect.elapsed >= effect.lifetime) {
        effect.active = false;
        return;
    }

    // Character #3 Validation — Energy Particle Rule: "Coordinated Attack may generate at most 1
    // Energy Particle per frame" — cờ RESET đầu mỗi frame update của CHÍNH effect này (per-instance,
    // KHÔNG phải toàn cục — 2 effect khác nhau proc cùng frame vẫn có thể sinh 2 Particle riêng, đây
    // chỉ là safeguard "same proc/same frame", KHÔNG PHẢI global Energy cooldown).
    let energyGeneratedThisFrame = false;

    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];

        if (!enemy.alive) {
            // Dọn dẹp — enemy chết, xóa polling state để tránh so sánh nhầm lúc respawn (giữ nguyên id).
            delete effect.lastKnownHp[enemy.id];
            delete effect.lastKnownDamageSeq[enemy.id];
            delete effect.perEnemyCooldownTimer[enemy.id];
            continue;
        }

        if (effect.perEnemyCooldownTimer[enemy.id] > 0) {
            effect.perEnemyCooldownTimer[enemy.id] -= dt;
        }

        // Phát hiện "vừa có damage event" qua enemy.damageEventSeq (DAMAGE EVENT CONTRACT, enemies.js)
        // thay vì so HP giảm: HP polling KHÔNG thấy được hit trên dummy bất tử (HP không bao giờ đổi)
        // -> Coordinated Attack không proc -> không có hạt năng lượng. Quy tắc lọc nguồn
        // (canTriggerReactiveEffects), per-enemy cooldown, tối đa 1 hạt/frame GIỮ NGUYÊN.
        const prevSeq = effect.lastKnownDamageSeq[enemy.id];
        const curSeq = enemy.damageEventSeq || 0;
        if (prevSeq !== undefined && curSeq > prevSeq) {
            const src = enemy.lastDamageSource;
            const canTrigger = !src || src.canTriggerReactiveEffects !== false;
            const cooldownReady = !(effect.perEnemyCooldownTimer[enemy.id] > 0);

            if (canTrigger && cooldownReady) {
                // --- Coordinated Electro Attack proc ---
                const dmg = calculatePlayerToEnemyDamage(effect.character, effect.coordinatedScaling, enemy);
                const pushDir = new THREE.Vector3().subVectors(enemy.position, effect.character.position || enemy.position);
                if (pushDir.lengthSq() < 0.0001) pushDir.set(0, 0, 1); else pushDir.normalize();

                // Character #3 Validation — canTriggerReactiveEffects: false — CHẶN domino (damage
                // này KHÔNG được phép tự trigger lại effect này hay bất kỳ effect Electro nào khác).
                const coordinatedImpactWithSource = Object.assign({}, effect.coordinatedImpact, {
                    source: {
                        sourceType: 'coordinated_skill',
                        sourceCharacterId: effect.character.id,
                        canTriggerReactiveEffects: false
                    }
                });
                enemy.takeDamage(dmg, pushDir, false, coordinatedImpactWithSource);

                // Readability Batch — Coordinated Attack phải NHẬN RA ĐƯỢC: tia sét tím đánh xuống
                // enemy (thay cho tia lửa trắng chung của mọi đòn thường trước đây). Damage number đi
                // kèm tự có style 'electro' qua impact.source.sourceType === 'coordinated_skill'.
                if (window.spawnElectroStrike) window.spawnElectroStrike(enemy.position);
                else spawnCombatSparks(enemy.position, pushDir);
                if (!enemy.alive) spawnDeathParticles(enemy.position);

                effect.perEnemyCooldownTimer[enemy.id] = effect.perEnemyCooldown;

                // Character #3 Validation — Energy Particle Spawn Position: sinh tại enemy.position
                // (KHÔNG force về player.position — Particle tự bay hút về Character đang active qua
                // cơ chế EnergySystem.updateParticles() có sẵn, hoạt động đúng CẢ KHI #3 off-field).
                if (!energyGeneratedThisFrame) {
                    EnergySystem.generateParticles(enemy.position, 1, effect.element);
                    energyGeneratedThisFrame = true;
                }
            }
        }

        // CẬP NHẬT lastKnownHp SAU KHI xử lý xong (bao gồm cả HP đã bị coordinated attack vừa trừ
        // thêm nếu có proc) — đảm bảo KHÔNG đọc lại cùng 1 lần giảm HP ở frame kế tiếp.
        effect.lastKnownHp[enemy.id] = enemy.hp;
        effect.lastKnownDamageSeq[enemy.id] = enemy.damageEventSeq || 0; // SAU KHI xử lý (gồm cả event của chính proc)
    }
}
window.updateElectroReactiveEffect = updateElectroReactiveEffect;

// ============================================================
// BURST ACTIVATION STATE MACHINE — Elemental Burst (Character #3, Polearm/Electro)
// ============================================================
// Character #3 Full Implementation Integration — state machine PHỤ, độc lập với attackState combo
// thường (windup/active/recovery) — dùng 2 giá trị attackState MỚI:
// 'burstActivationWindup' -> 'burstActivationActive' -> (kết thúc) -> Burst State bắt đầu.
//
// startBurstActivation(character, burstData, dir): gọi TỪ executeCharacterBurst() ngay khi Player
// bấm Burst (SAU KHI player.energy đã set 0, canUseBurst() đã pass — xem handleBurstKeyDown()).
// KHÔNG gây damage ở đây — chỉ khởi động state machine, damage thật xảy ra ở
// updateBurstActivationTick() (gọi từ game loop file 08) khi 'burstActivationActive' kết thúc.
function startBurstActivation(character, burstData, dir) {
    // BUGFIX (Character #4 — Polearm Thunder Burst): comment ở trên hàm này ghi rõ "gọi TỪ
    // executeCharacterBurst() ngay khi Player bấm Burst (SAU KHI player.energy đã set 0..." — nhưng
    // handleBurstKeyDown() (combat.js) KHÔNG BAO GIỜ thực sự set player.energy = 0 trước khi dispatch
    // tới đây (khác hẳn runWaterBubbleEffect()/runPyroBurstZoneEffect(), 2 executor Burst còn lại,
    // MỖI HÀM ĐỀU tự set player.energy = 0 ngay khi cast — xem dòng tương ứng trong 2 hàm đó). Hệ quả
    // đã xác nhận qua test thực tế: Character #4 dùng Burst xong, Energy KHÔNG hề giảm, canUseBurst()
    // (player.energy < player.maxEnergy) vẫn luôn true -> Burst dùng được liên tục không giới hạn,
    // không đúng như comment mô tả và không nhất quán với 2 nhân vật còn lại. Sửa: tự reset Energy
    // NGAY TẠI ĐÂY (điểm vào duy nhất của state machine này), ĐÚNG PATTERN 2 executor kia — không phụ
    // thuộc vào combat.js phải làm đúng việc gọi trước, tự khép kín logic trong chính executor.
    player.energy = 0;
    player.attackState = 'burstActivationWindup';
    player.attackTimer = (burstData.activationTiming && typeof burstData.activationTiming.windup === 'number')
        ? burstData.activationTiming.windup : 0.2;
    // Snapshot character/burstData/dir để updateBurstActivationTick() (file 08, KHÔNG có quyền truy
    // cập trực tiếp tham số hàm này) đọc lại đúng ngữ cảnh — ĐÚNG PATTERN player.activeEffects lưu
    // character snapshot cho các effect khác.
    player.burstActivationCharacter = character;
    player.burstActivationBurstData = burstData;
    player.burstActivationDir = dir.clone();
}
window.startBurstActivation = startBurstActivation;

// updateBurstActivationTick(): gọi từ chuỗi if/else attackState chính (file 08) — attackTimer ĐÃ
// ĐƯỢC TRỪ dt Ở NGOÀI (điểm chung player.attackTimer -= dt trước chuỗi if/else, đúng pattern
// windup/active/recovery của combo thường) — hàm này CHỈ kiểm tra ngưỡng <= 0 và chuyển state,
// KHÔNG tự trừ dt lần nữa (tránh double-decrement).
function updateBurstActivationTick() {
    if (player.attackTimer > 0) return;

    if (player.attackState === 'burstActivationWindup') {
        // Windup xong -> chuyển Active.
        const burstData = player.burstActivationBurstData;
        player.attackState = 'burstActivationActive';
        player.attackTimer = (burstData.activationTiming && typeof burstData.activationTiming.active === 'number')
            ? burstData.activationTiming.active : 0.15;
        return;
    }

    if (player.attackState === 'burstActivationActive') {
        // Active xong -> Small AoE Circle damage (hitShape:circle, Impact HEAVY, KHÔNG tạo Thunder
        // Charge — đã chốt rõ), RỒI vào Burst State.
        const character = player.burstActivationCharacter;
        const activationScaling = getTalentScaling(character, 'burstActivation');
        const activationImpact = getTalentImpact(character, 'burstActivation');
        const hitShapeConfig = (character.talents && character.talents.burstActivation) ? character.talents.burstActivation : null;

        for (let i = 0; i < enemies.length; i++) {
            const enemy = enemies[i];
            if (!enemy.alive) continue;
            const result = resolveMeleeHitCollision(enemy, player.position, player.burstActivationDir, hitShapeConfig);
            if (result.hit) {
                const dmg = calculatePlayerToEnemyDamage(character, activationScaling, enemy);
                enemy.takeDamage(dmg, result.toEnemy, false, withDamageSource(activationImpact, character));
                spawnCombatSparks(enemy.position, result.toEnemy);
                if (!enemy.alive) spawnDeathParticles(enemy.position);
            }
        }

        cameraState.shakeTimer = 0.35;
        cameraState.shakeIntensity = 0.5;
        sfx.playBurst();

        // Readability Batch — Activation AoE: vòng tròn mở rộng tới ĐÚNG hitRadius đọc từ data
        // (talents.burstActivation.hitRadius) — người chơi thấy chính xác vùng đã gây damage. Kèm
        // tia sét lớn đánh xuống nhân vật báo hiệu BẮT ĐẦU Burst State.
        if (window.spawnGroundRing) {
            const activationRadius = (hitShapeConfig && typeof hitShapeConfig.hitRadius === 'number') ? hitShapeConfig.hitRadius : 3.0;
            const groundCenter = window.groundPointUnder(player.position);
            window.spawnGroundRing(groundCenter, activationRadius, window.FX_COLORS.electro, { life: 0.55, fill: true, thickness: 0.16 });
            window.spawnElectroStrike(player.position.clone(), { big: true });
        }

        // --- Vào Burst State ---
        const burstData = player.burstActivationBurstData;
        player.isBurstStateActive = true;
        player.burstStateTimer = (typeof burstData.burstStateDuration === 'number') ? burstData.burstStateDuration : 7.0;
        player.burstStateExitPending = false;
        player.thunderCharge = 0;
        player.thunderChargeCooldownTimer = 0;

        // Dọn snapshot tạm — KHÔNG cần giữ sau khi Activation xong.
        player.burstActivationCharacter = null;
        player.burstActivationBurstData = null;
        player.burstActivationDir = null;

        player.attackState = 'idle';
        player.attackTimer = 0;
    }
}
window.updateBurstActivationTick = updateBurstActivationTick;

// ============================================================
// DECOY BOMB — Elemental Skill Validation (Character #2, Pyro)
// ============================================================
// Decoy là entity RIÊNG BIỆT (spec mục 12: "không phải player clone, không phải visual mesh") —
// KHÔNG dùng player.activeEffects.skill/burst/arrows (những slot đó chứa hiệu ứng TẠM THỜI di
// chuyển/tự dọn theo va chạm) — Decoy sống LÂU (nhiều giây), có HP, bị Enemy AI nhắm tới, và có
// vòng đời riêng.
//
// BUGFIX (Elemental Skill Bugfix v1, mục 2-3) — THAY ĐỔI KIẾN TRÚC: window.activeDecoy (single
// global) đã bị thay bằng window.activeDecoys[] (mảng). Lý do: hành vi cũ "cast ES lần nữa ->
// Decoy cũ tự nổ trước khi tạo Decoy mới" (deployDecoy() gọi explodeDecoy(window.activeDecoy) ở
// đầu hàm) SAI theo yêu cầu mới — Decoy A đang tồn tại KHÔNG được tự nổ chỉ vì Player cast ES lần
// nữa; Decoy A phải tiếp tục sống bình thường, Decoy B được tạo THÊM (không thay thế). Vì vậy
// KHÔNG còn khái niệm "1 slot duy nhất bị ghi đè" — cần 1 danh sách để mỗi Decoy có lifecycle độc
// lập (HP/Lifetime/Explosion riêng, Decoy A không điều khiển Decoy B).
//
// window.activeDecoy (số ít) VẪN được GIỮ LẠI dưới dạng compatibility shim CHỈ ĐỂ enemies.js (file
// ngoài phạm vi sửa của bugfix này, không có trong bộ file được cung cấp) không bị crash — code đó
// đọc window.activeDecoy.position/window.activeDecoy.takeDamage() như 1 object đơn. Shim này luôn
// trỏ tới PHẦN TỬ ĐẦU TIÊN còn active trong activeDecoys[] (xem syncActiveDecoyShim() bên dưới) —
// đây KHÔNG phải giải pháp multi-decoy targeting đầy đủ cho AI (ngoài phạm vi bugfix, spec mục 3
// xác nhận "không cần giới hạn số lượng Decoy mới... trừ khi architecture hiện tại đã có giới hạn
// rõ ràng" — không yêu cầu Enemy AI phải nhắm đúng MỌI Decoy cùng lúc), chỉ đảm bảo hành vi cũ
// (nhắm 1 Decoy) không crash khi có nhiều Decoy tồn tại.
window.activeDecoys = [];
window.activeDecoy = null; // compatibility shim — xem giải thích ở trên, đồng bộ bởi syncActiveDecoyShim()

// syncActiveDecoyShim(): đồng bộ window.activeDecoy (số ít) trỏ về phần tử active ĐẦU TIÊN trong
// activeDecoys[], hoặc null nếu không còn Decoy nào — gọi lại mỗi khi activeDecoys[] thay đổi
// (deploy mới/explode) để enemies.js luôn thấy 1 giá trị hợp lệ hoặc null, KHÔNG BAO GIỜ trỏ tới
// 1 Decoy đã explode (active === false).
function syncActiveDecoyShim() {
    window.activeDecoy = activeDecoys.find(d => d.active) || null;
}

// buildDecoyVisual(): visual PLACEHOLDER đơn giản (spec mục 1, 15: "không cần model hoàn chỉnh,
// ưu tiên functional gameplay trước") — Core hình cầu (tái dùng Ý TƯỞNG hình học Core của
// buildCharacterMesh(), 04-scene-init.js, nhưng KHÔNG gọi lại hàm đó — Decoy không cần
// tiltRoot/2 tay/weapon, chỉ cần 1 khối duy nhất đứng yên đủ để nhận diện là "hình nhân giả").
// Màu đỏ (Pyro) nhấp nháy nhẹ theo thời gian tồn tại — xử lý trong updateDecoyEntity(), không phải
// ở đây (hàm này chỉ dựng geometry/material 1 lần lúc spawn).
function buildDecoyVisual() {
    const group = new THREE.Group();

    const coreGeo = new THREE.SphereGeometry(0.58, 16, 12);
    const coreMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.8, metalness: 0.1, emissive: 0x7f1d1d, emissiveIntensity: 0.4 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = 0.9; // xấp xỉ chiều cao Core của Character thật (visualConfig.corePosition.y các nhân vật hiện có ~0.68-0.9)
    core.castShadow = true;
    group.add(core);

    // Vòng tròn đánh dấu attraction radius trên mặt đất — placeholder visual đơn giản (spec mục 15:
    // "Attraction có thể có visual indicator/range/effect đơn giản"), dùng RingGeometry nằm phẳng.
    const ringGeo = new THREE.RingGeometry(0.9, 1.0, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);

    return { group, core, coreMat };
}

// deployDecoy(character, position): ĐIỂM VÀO — gọi từ endSkillAim() (combat.js) khi
// player.isDecoyPlacing === true, TẠI ĐÚNG VỊ TRÍ đã raycast/snap ground (xem combat.js).
//
// BUGFIX (mục 2): KHÔNG còn tự động explode Decoy cũ khi tạo Decoy mới — hành vi cũ đã XÓA
// (trước đây có `if (window.activeDecoy...) explodeDecoy(window.activeDecoy)` ngay đầu hàm này).
// Decoy mới giờ chỉ ĐƯỢC THÊM VÀO activeDecoys[], không đụng tới Decoy đang tồn tại. Việc có thể
// cast ES lần nữa hay không đã được kiểm soát HOÀN TOÀN bởi Cooldown (canUseElementalSkill() ở
// combat.js) — đây là cơ chế giới hạn tần suất DUY NHẤT còn lại cho Decoy (mục 3: không cần thêm
// giới hạn số lượng Decoy trong bugfix này).
function deployDecoy(character, position) {
    // Elemental Skill Validation — scaling đọc qua getTalentScaling() (combat.js, category
    // 'skillDecoyExplosion') — ĐÚNG PATTERN mọi nguồn damage khác trong dự án (melee/arrow/charged
    // attack), có fallback an toàn (legacyScaling) nếu roster thiếu data, KHÔNG đọc trực tiếp
    // character.talents.skill.decoyExplosion.scaling nữa (thiếu nhất quán so với kiến trúc chung).
    const explosionScaling = getTalentScaling(character, 'skillDecoyExplosion');
    const cfg = (character.talents && character.talents.decoyConfig) ? character.talents.decoyConfig : null;
    // NOTE: decoyConfig nằm ở character.talents.decoyConfig theo schema roster (xem 10-character-
    // roster.js, đặt CÙNG CẤP với talents.skill/talents.normalAttack/talents.bowChargedAttack).

    const visual = buildDecoyVisual();
    visual.group.position.copy(position);
    scene.add(visual.group);

    const maxHp = (cfg && typeof cfg.maxHp === 'number') ? cfg.maxHp : 400;
    const decoy = {
        // --- Identity (spec mục 12) ---
        id: 'decoy_' + (window.nextEnemyId ? window.nextEnemyId++ : Date.now()), // reuse bộ đếm id chung với Enemy nếu có, tránh trùng id
        isDecoy: true, // cờ nhận diện — Enemy AI (enemies.js) và mọi hệ thống khác dùng field này để phân biệt Decoy với Enemy/Player thật
        character: character, // snapshot nhân vật đã triển khai Decoy — dùng cho DEF/scaling lúc Explosion

        // --- Transform ---
        position: visual.group.position, // THAM CHIẾU TRỰC TIẾP tới position của mesh — di chuyển 1 nơi, cả 2 đồng bộ (Decoy không di chuyển, nhưng giữ nhất quán pattern)
        mesh: visual.group,
        coreMat: visual.coreMat,

        // --- HP (spec mục 6) ---
        maxHp: maxHp,
        hp: maxHp,
        alive: true,

        // --- Lifetime (spec mục 7) ---
        lifetime: (cfg && typeof cfg.lifetime === 'number') ? cfg.lifetime : 12,
        lifeTimer: 0,

        // --- Attraction / Taunt (spec mục 3) ---
        attractionRadius: (cfg && typeof cfg.attractionRadius === 'number') ? cfg.attractionRadius : 10,
        active: true, // false sau khi đã explode — dùng để chặn double-explode

        // --- Explosion config (spec mục 8-11) — snapshot lúc deploy, KHÔNG đổi giữa chừng ---
        explosionRadius: (cfg && typeof cfg.explosionRadius === 'number') ? cfg.explosionRadius : 5,
        explosionImpact: (cfg && cfg.explosionImpact) ? cfg.explosionImpact : { type: 'launch' },
        explosionScaling: explosionScaling, // đã là bản sao an toàn từ getTalentScaling() (có fallback legacyScaling nếu thiếu data)
        // Spec mục 9 — element: DATA THUẦN đi kèm Explosion event, KHÔNG có Element Aura/Reaction nào
        // đọc/áp dụng field này trong task này.
        element: (cfg && cfg.element === 'characterElement') ? character.element : (cfg ? cfg.element : null),

        // Core Energy + Elemental Particle System v1 — snapshot energyGeneration từ SKILL_LIBRARY
        // lúc deploy, ĐÚNG PATTERN explosionScaling/element ở trên (Explosion đọc lại state đã đóng
        // băng từ lúc deploy, KHÔNG tra cứu SKILL_LIBRARY lại lúc nổ). archer_decoy_bomb.energyGeneration
        // có thể không tồn tại (skill khác chưa cấu hình) — optional, explodeDecoy() tự kiểm tra.
        energyGeneration: (SKILL_LIBRARY[character.skillId] && SKILL_LIBRARY[character.skillId].energyGeneration)
            ? SKILL_LIBRARY[character.skillId].energyGeneration
            : null,

        // takeDamage: gắn TRỰC TIẾP làm method của object — cho phép Enemy code (enemies.js) gọi
        // `decoy.takeDamage(dmg)` với cú pháp GIỐNG HỆT `enemy.takeDamage(...)` quen
        // thuộc (dù signature đơn giản hơn — Decoy không cần dir/isAOE/impact vì bản thân Decoy
        // không có Hit Reaction/Poise/Launch riêng, chỉ có HP tuyến tính, spec không yêu cầu Decoy
        // phản ứng vật lý khi bị đánh). Định nghĩa hàm decoyTakeDamage() Ở NGOÀI (dưới object này)
        // rồi gán vào đây để tránh lặp lại thân hàm nếu sau này cần gọi trực tiếp không qua `this`.
        takeDamage: decoyTakeDamage
    };

    // BUGFIX (mục 2-3): THÊM vào activeDecoys[] thay vì ghi đè 1 biến global duy nhất — Decoy cũ (nếu
    // có) không bị động tới, tiếp tục sống độc lập trong cùng mảng.
    activeDecoys.push(decoy);
    syncActiveDecoyShim();

    // Task 3 (Combat VFX) — ĐẶT Decoy (KHÔNG phải nổ): vòng mảnh, mờ đánh dấu ĐÚNG explosionRadius thật
    // (vùng sẽ bị nổ sau này) gắn làm con của decoy.mesh -> tự dọn cùng Decoy (explodeDecoy dispose mọi
    // con). Kèm chớp "cắm xuống" nhỏ. Không lửa, không tia lửa -> tách bạch với hiệu ứng nổ.
    const decoyVfx = getCharacterVfxElement(character);
    if (decoyVfx && window.spawnGroundRing) {
        const prof = window.getElementVfx(decoyVfx);
        const tele = new THREE.Mesh(
            new THREE.RingGeometry(0.94, 1, 48),
            new THREE.MeshBasicMaterial({ color: prof.main, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
        );
        tele.rotation.x = -Math.PI / 2;
        tele.position.y = 0.06;
        tele.scale.setScalar(decoy.explosionRadius / (decoy.mesh.scale.x || 1));
        tele.userData.isDecoyTelegraph = true;
        decoy.mesh.add(tele);
        decoy.telegraphMat = tele.material;
        window.spawnGroundRing(decoy.position, 1.4, prof.light, { life: 0.35, startRatio: 0.2, opacity: 0.8 });
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            window.spawnDot(decoy.position, { color: 0xe7e5e4, life: 0.3, vel: new THREE.Vector3(Math.cos(a) * 2, 1.2, Math.sin(a) * 2), gravity: 4, size: 0.8, endSize: 1.1, opacity: 0.6 });
        }
    }

    // Passive/Unique Mechanic — "Overwatch" (Phase 1): trigger NGAY khi Decoy deploy THÀNH CÔNG (đã
    // chốt qua Q&A — không phải lúc Explosion). Data-driven: chỉ áp dụng nếu character có
    // talents.passive.overwatch (Character #2 khai báo, nhân vật Decoy tương lai khác có thể không
    // có Passive này — Engine KHÔNG hard-code theo skillId/tên nhân vật). REFRESH về đúng duration
    // (không cộng dồn với overwatchTimer cũ còn lại, nếu có) — đã chốt qua Q&A.
    const overwatchCfg = character.talents && character.talents.passive && character.talents.passive.overwatch;
    if (overwatchCfg && typeof overwatchCfg.duration === 'number') {
        player.overwatchTimer = overwatchCfg.duration;
    }

    sfx.playSwing(); // PLACEHOLDER SFX Deploy — nợ kỹ thuật, chưa có SFX riêng cho Decoy (spec mục 15 chấp nhận placeholder)
    return decoy;
}
window.deployDecoy = deployDecoy;

// decoyTakeDamage(amount): gọi bởi Enemy khi tấn công trúng Decoy (enemies.js, patch riêng — Enemy
// gọi decoy.takeDamage(dmg) giống hệt cú pháp enemy.takeDamage() quen thuộc, để phía
// AI code không cần biết chi tiết bên trong). Khi HP <= 0 -> nổ NGAY LẬP TỨC (spec mục 6: "Không để
// Decoy tồn tại sau khi HP = 0" — Early Explosion, spec mục 7 nhánh 2).
function decoyTakeDamage(amount) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    // Flash đỏ đậm hơn khi trúng đòn — feedback tối thiểu (spec mục 15), TÁI DÙNG coreMat đã có thay
    // vì tạo flashMaterial riêng như Enemy (không cần thiết cho placeholder này).
    this.coreMat.emissiveIntensity = 1.0;
    if (this.hp <= 0) {
        explodeDecoy(this);
    }
}

// updateDecoyEntity(dt): gọi MỖI FRAME từ updateActiveEffects() (dispatcher chung, xem bên dưới) —
// CHỈ xử lý lifecycle của CHÍNH Decoy (đếm lifetime, hiệu ứng visual nhấp nháy nhẹ) — KHÔNG xử lý gì
// liên quan Enemy AI ở đây (Enemy tự đọc window.activeDecoy(s) trong update() của chính nó, xem patch
// enemies.js — tách biệt hoàn toàn 2 phía, đúng nguyên tắc "Decoy không biết gì về Enemy, Enemy tự
// quyết định có bị thu hút hay không"). BUGFIX (mục 3): Decoy A không được điều khiển lifecycle của
// Decoy B — hàm này CHỈ nhận đúng 1 decoy làm tham số và chỉ đụng tới state của decoy đó, không đổi
// so với trước (đã đúng ngay từ đầu, giữ nguyên khi chuyển sang vòng lặp nhiều Decoy bên dưới).
function updateDecoyEntity(decoy, dt) {
    if (!decoy.active) return;

    decoy.lifeTimer += dt;

    // Nhấp nháy nhẹ theo thời gian còn lại — cường độ tăng dần khi gần hết lifetime (feedback trực
    // quan "sắp nổ", placeholder đơn giản theo spec mục 15).
    const timeLeft = decoy.lifetime - decoy.lifeTimer;
    const urgency = Math.max(0, 1 - timeLeft / decoy.lifetime);
    decoy.coreMat.emissiveIntensity = 0.4 + Math.sin(decoy.lifeTimer * (4 + urgency * 8)) * 0.3 + urgency * 0.3;
    // Task 3: vòng báo vùng nổ nhấp nháy nhanh dần theo đúng urgency sẵn có (sắp hết lifetime).
    if (decoy.telegraphMat) decoy.telegraphMat.opacity = 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(decoy.lifeTimer * (4 + urgency * 10))) + urgency * 0.25;

    // Spec mục 7 nhánh 1 — Lifetime hết -> Explosion.
    if (decoy.lifeTimer >= decoy.lifetime) {
        explodeDecoy(decoy);
    }
}

// explodeDecoy(decoy): Explosion — AAoE Elemental Damage + Launch (spec mục 8, 10, 11). REUSE TOÀN
// BỘ pipeline Combat Foundation hiện có: getTalentScaling-style scaling đã snapshot sẵn
// (decoy.explosionScaling) -> calculatePlayerToEnemyDamage() (DEF mitigation ĐÚNG LÚC NỔ, giống mọi
// nguồn damage khác trong project) -> enemy.takeDamage(dmg, dir, isAOE, impact) — KHÔNG viết công
// thức damage/launch riêng, KHÔNG tạo AoE detection mới (dùng distance check đơn giản, đồng dạng
// với cách project đã check phạm vi ở nhiều nơi khác — VD ALLY_ALERT_RADIUS trong enemies.js).
function explodeDecoy(decoy) {
    if (!decoy.active) return; // chặn double-explode (VD HP=0 cùng lúc lifetime hết trong cùng frame)
    decoy.active = false;
    decoy.alive = false;

    // BUGFIX (mục 4 — Energy chỉ khi thực sự hit Enemy): TRƯỚC ĐÂY EnergySystem.generateParticles()
    // được gọi VÔ ĐIỀU KIỆN sau vòng lặp AoE, bất kể có Enemy nào thực sự bị hit hay không (VD Decoy
    // nổ giữa chỗ trống không có Enemy trong explosionRadius vẫn tạo Particle — SAI theo spec mục 4).
    // Sửa: đếm số Enemy THỰC SỰ bị hit trong vòng lặp AoE bên dưới (hitCount), Generate Particle CHỈ
    // KHI hitCount > 0 — đặt SAU vòng lặp (kiểm tra Collision Detection xong mới quyết định có tạo
    // Energy Particle hay không, đúng flow: Explosion -> AoE Collision Detection -> Có Enemy bị hit? ->
    // Generate Particle).
    let hitCount = 0;

    // Spec mục 11 — AoE detection: mỗi enemy trong bán kính explosionRadius XỬ LÝ ĐỘC LẬP (Enemy A
    // trong AoE -> hit, Enemy B ngoài AoE -> không hit) — duyệt enemies[] y hệt pattern
    // updateArrowEffect()/runBeamEffect() đã dùng cho AoE/hit detection khác trong project.
    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (!enemy.alive) continue;
        const dist = enemy.position.distanceTo(decoy.position);
        if (dist > decoy.explosionRadius) continue; // Enemy B (ví dụ spec mục 11) — ngoài AoE, bỏ qua

        hitCount++;

        // DEF mitigation tính ĐÚNG LÚC NỔ (đúng pattern toàn dự án — KHÔNG tính trước rồi lưu số cố
        // định, vì DEF của từng enemy khác nhau).
        const explosionDamage = calculatePlayerToEnemyDamage(decoy.character, decoy.explosionScaling, enemy);
        const pushDir = new THREE.Vector3().subVectors(enemy.position, decoy.position);
        if (pushDir.lengthSq() < 0.0001) pushDir.set(0, 0, 1); else pushDir.normalize();

        // Spec mục 10 — Launch: TRUYỀN THẲNG decoy.explosionImpact ({type: 'launch'}) làm tham số thứ
        // 4 của takeDamage() — ĐÚNG PATTERN mọi nguồn damage khác (melee/arrow/plunge) đã dùng. Weight
        // class của TỪNG enemy tự quyết định có thực sự bị Launch hay không (resolveHitReaction(),
        // combat.js) — KHÔNG hard-code enemy nào chắc chắn bị launch (spec mục 10 xác nhận).
        enemy.takeDamage(explosionDamage, pushDir, true, withDamageSource(decoy.explosionImpact, decoy.character));

        // Task 3: trúng NỔ thật -> hiệu ứng Pyro theo impact của vụ nổ (launch).
        if (window.spawnHitImpact && getCharacterVfxElement(decoy.character)) window.spawnHitImpact(enemy.position, pushDir, { element: getCharacterVfxElement(decoy.character), weight: window.impactWeight(decoy.explosionImpact) });
        else spawnCombatSparks(enemy.position, pushDir);
        if (!enemy.alive) spawnDeathParticles(enemy.position);
    }

    // Explosion VFX placeholder (spec mục 15) — quả cầu mở rộng nhanh rồi biến mất, TÁI DÙNG
    // spawnCombatSparks() đã có tại tâm nổ cho hiệu ứng bổ sung, không cần particle system riêng.
    // GIỮ NGUYÊN — Explosion VFX/SFX/camera shake luôn phát dù có hit Enemy hay không (spec mục 4 chỉ
    // nói về Energy Particle, KHÔNG nói về feedback hình ảnh/âm thanh của chính vụ nổ).
    spawnCombatSparks(decoy.position, new THREE.Vector3(0, 1, 0));
    // Task 3: vụ NỔ — vòng lửa lan tới ĐÚNG explosionRadius (vùng damage thật) + cột tàn lửa. Luôn hiện
    // khi Decoy nổ (kể cả không trúng ai — vụ nổ vẫn xảy ra thật, chỉ không có damage).
    if (window.spawnGroundRing && getCharacterVfxElement(decoy.character)) {
        const prof = window.getElementVfx(getCharacterVfxElement(decoy.character));
        window.spawnGroundRing(decoy.position, decoy.explosionRadius, prof.main, { life: 0.5, fill: true, thickness: 0.16, startRatio: 0.15 });
        window.spawnFacingRing(decoy.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 2.4, prof.light, { life: 0.3 });
        for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * 3;
            window.spawnDot(decoy.position, { color: i % 3 ? prof.main : prof.light, life: 0.6 + Math.random() * 0.3, vel: new THREE.Vector3(Math.cos(a) * r, 4 + Math.random() * 3, Math.sin(a) * r), gravity: -1, drag: 1.2, size: 1.2, endSize: 0.2 });
        }
    }
    cameraState.shakeTimer = 0.3;
    cameraState.shakeIntensity = 0.4;
    sfx.playHit(); // PLACEHOLDER SFX Explosion

    // Core Energy + Elemental Particle System v1 — mục 12: "tạo Particle một lần dù có nhiều hit".
    // Explosion là 1 Hit Event AoE duy nhất (không phải chuỗi tick như Beam/Small Shot), nên
    // generate ĐÚNG 1 LẦN Ở ĐÂY (ngoài vòng lặp enemies[] phía trên) bất kể explosion trúng bao
    // nhiêu enemy — KHÔNG nhân theo số enemy bị trúng.
    //
    // BUGFIX (mục 4): thêm điều kiện hitCount > 0 — Explosion KHÔNG trúng Enemy nào (hitCount === 0)
    // -> KHÔNG generate Particle, đúng flow yêu cầu (AoE Collision Detection quyết định TRƯỚC, Energy
    // chỉ là hệ quả SAU KHI xác nhận có hit thật).
    if (decoy.energyGeneration && hitCount > 0) {
        EnergySystem.generateParticles(decoy.position, decoy.energyGeneration.particles, decoy.energyGeneration.element);
    }

    // Dọn mesh khỏi scene — Decoy KHÔNG đi qua cleanupEffect() (hàm đó giả định fx.mesh là Mesh/Group
    // đơn giản với đúng 2 loại geometry/material, an toàn để tái dùng vì buildDecoyVisual() cũng trả
    // về đúng dạng Group 2 con — nhưng để tường minh ý đồ "đây là Decoy, không phải activeEffects
    // item", viết dispose riêng thay vì gọi cleanupEffect(decoy)).
    scene.remove(decoy.mesh);
    decoy.mesh.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); });

    // BUGFIX (mục 2-3): remove ĐÚNG decoy này khỏi activeDecoys[] bằng index (KHÔNG dùng
    // `window.activeDecoy = null` như cũ — giờ có thể có nhiều Decoy khác vẫn đang active trong mảng,
    // xóa nhầm tất cả sẽ phá lifecycle độc lập của chúng).
    const idx = activeDecoys.indexOf(decoy);
    if (idx !== -1) activeDecoys.splice(idx, 1);
    syncActiveDecoyShim();
}
window.explodeDecoy = explodeDecoy;

// Dọn dẹp 1 effect instance khỏi scene — tách riêng thành hàm dùng chung để endEffect() (dọn
// thủ công, VD hủy giữa chừng) và updateActiveEffects() (dọn khi hết range/trúng đòn) không
// lặp lại logic dispose. GIỮ NGUYÊN cách dispose gốc (kiểm tra isGroup hay Mesh đơn).
function cleanupEffect(fx) {
    scene.remove(fx.mesh);
    if (fx.mesh.isGroup) {
        fx.mesh.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); });
    } else {
        fx.mesh.geometry.dispose();
        fx.mesh.material.dispose();
    }
}

// Dọn dẹp thủ công 1 effect theo slot + index — dùng khi cần hủy effect giữa chừng (VD tương
// lai: người chơi hủy Burst, hoặc chuyển nhân vật giữa combat). Alpha v1.0 CHƯA có nơi nào gọi
// hàm này (chưa có tính năng hủy giữa chừng) — viết sẵn theo đúng kiến trúc đã thống nhất,
// không phải suy đoán thêm tính năng ngoài phạm vi.
function endEffect(slot, index) {
    const list = player.activeEffects[slot];
    if (!list || index < 0 || index >= list.length) return;
    cleanupEffect(list[index]);
    list.splice(index, 1);
}


// ============================================================
// GHI CHÚ QUAN TRỌNG — raycastFromCrosshair() (combat.js dòng 561-620)
// ============================================================
// Hàm này KHÔNG thuộc phạm vi executor ở file này — nó phục vụ CONVERGENCE AIM (xác định
// điểm crosshair đang ngắm tới để chỉnh hướng bắn cho chuẩn trong lúc giữ Aim Mode), khác
// hoàn toàn với việc TÍNH DAMAGE của Beam (thuật toán projection riêng trong runBeamEffect()
// ở trên). raycastFromCrosshair() vẫn ở lại combat.js, KHÔNG di chuyển sang file này.
//
// Tuy nhiên hàm đó ĐỌC TRỰC TIẾP activeProjectiles/activeHydroBeamVisuals để loại trừ chính
// hiệu ứng skill của mình khỏi kết quả raycast (tránh viên đạn/tia vừa bắn tự chặn crosshair
// của chính nó) — khi activeProjectiles bị thay bằng player.activeEffects.skill (bước sau, ở
// combat.js), đoạn loại trừ đó CẦN được sửa tương ứng, GIỮ NGUYÊN LOGIC loại trừ (đã xác nhận
// với người dùng), chỉ đổi nguồn đọc:
//
//   const isOwnSkillEffect =
//       player.activeEffects.skill.some(p => p.mesh === hit.object) ||
//       activeHydroBeamVisuals.some(b => b.mesh === hit.object);   // activeHydroBeamVisuals GIỮ NGUYÊN
//
// Đây là việc của bước "nối entry point trong combat.js", CHƯA thực hiện ở file này.
// ============================================================


window.executeCharacterSkill = executeCharacterSkill;
window.executeSkillTickEffect = executeSkillTickEffect;
window.executeCharacterBurst = executeCharacterBurst;
window.runBeamEffect = runBeamEffect;
window.runProjectileEffect = runProjectileEffect;
window.updateActiveEffects = updateActiveEffects;
window.endEffect = endEffect;
// Character #2 (Bow) Validation
window.spawnArrow = spawnArrow;
window.updateArrowEffect = updateArrowEffect;
// Elemental Skill Validation — Decoy Bomb
window.deployDecoy = deployDecoy;
window.explodeDecoy = explodeDecoy;
window.updateDecoyEntity = updateDecoyEntity;
// Elemental Burst Validation — Pyro Burst Zone
window.runPyroBurstZoneEffect = runPyroBurstZoneEffect;
window.updatePyroBurstZoneEffect = updatePyroBurstZoneEffect;

// ============================================================
// Readability Batch (Character #3) — PER-FRAME COMBAT VISUALS
// ============================================================
// updateCharacterCombatVisuals(dt): gọi mỗi frame từ animate() (file 08, trong khối dt > 0 — dừng
// theo hitstop như mọi simulation hình ảnh khác). CHỈ HIỂN THỊ, không đọc/ghi damage/HP/timer
// gameplay nào — chỉ ĐỌC state có sẵn (attackState, isBurstStateActive, burstStateTimer).
//   1. Spear trail: vệt sáng theo mũi vũ khí trong 'active'/'chargedActive' — data-driven qua
//      visualConfig.attackTrailColor (chỉ nhân vật có khai báo mới có vệt).
//   2. Burst State aura: vòng Electro xoay dưới chân suốt Burst State; nháy nhanh khi còn < 1.5s
//      (báo sắp hết); khi Burst State kết thúc -> 1 vòng tan ra (báo đã thoát).
let burstAuraMesh = null;
let wasBurstStateActive = false;
let burstAuraTime = 0;
const _tipWorld = new THREE.Vector3();

// getCharacterVfxElement(character): nguyên tố HIỂN THỊ của nhân vật (visualConfig.vfxElement, opt-in).
// Trả null nếu nhân vật không khai báo -> nơi gọi giữ nguyên hiệu ứng cũ (Character #3 không khai báo
// field này, nên toàn bộ hiệu ứng hiện có của #3 KHÔNG bị thay đổi).
function getCharacterVfxElement(character) {
    return (character && character.visualConfig && typeof character.visualConfig.vfxElement === 'string') ? character.visualConfig.vfxElement : null;
}
window.getCharacterVfxElement = getCharacterVfxElement;

// Bow charge ring — 1 mesh duy nhất tạo lười (lazy), ẩn/hiện, KHÔNG tạo mới mỗi frame.
let bowChargeRing = null;
let bowChargeLastLevel = -1;
let bowChargeTime = 0;
const BOW_CHARGE_LEVEL_COLORS = [0xd6d3d1, 0xfbbf24, 0xf97316]; // Level 0 / 1 / 2 (full)
function updateBowChargeVisual(dt) {
    const aiming = !!player.isBowChargedAiming && !!window.getCurrentBowChargeLevel;
    if (!aiming) {
        if (bowChargeRing) bowChargeRing.visible = false;
        bowChargeLastLevel = -1;
        return;
    }
    const levels = window.getBowChargedAttackConfig().levels;
    const current = window.getCurrentBowChargeLevel();
    const levelIndex = Math.max(0, levels.indexOf(current));
    const isMax = levelIndex === levels.length - 1 && levels.length > 1;
    if (!bowChargeRing) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false });
        bowChargeRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), mat);
        bowChargeRing.renderOrder = 5;
        window.scene.add(bowChargeRing);
    }
    bowChargeTime += dt;
    const anchor = (player.sword) ? player.sword.getWorldPosition(_tipWorld) : _tipWorld.copy(player.position);
    bowChargeRing.visible = true;
    bowChargeRing.position.copy(anchor);
    if (window.camera) bowChargeRing.quaternion.copy(window.camera.quaternion);
    const colorIdx = Math.min(BOW_CHARGE_LEVEL_COLORS.length - 1, isMax ? BOW_CHARGE_LEVEL_COLORS.length - 1 : levelIndex);
    bowChargeRing.material.color.setHex(BOW_CHARGE_LEVEL_COLORS[colorIdx]);
    const pulse = isMax ? 0.08 * Math.sin(bowChargeTime * 14) : 0;
    const r = 0.35 + 0.18 * levelIndex + pulse;
    bowChargeRing.scale.setScalar(r);
    bowChargeRing.material.opacity = isMax ? 0.95 : 0.55 + 0.15 * levelIndex;

    if (bowChargeLastLevel !== -1 && levelIndex > bowChargeLastLevel && window.spawnFacingRing) {
        // Vừa lên level -> chớp + tia lửa (full charge: to hơn, màu lửa).
        window.spawnFacingRing(anchor, isMax ? 1.2 : 0.8, BOW_CHARGE_LEVEL_COLORS[colorIdx], { life: 0.25 });
        for (let i = 0; i < (isMax ? 10 : 5); i++) {
            const a = Math.random() * Math.PI * 2;
            window.spawnDot(anchor, { color: BOW_CHARGE_LEVEL_COLORS[colorIdx], life: 0.3, vel: new THREE.Vector3(Math.cos(a) * 3, Math.sin(a) * 3, (Math.random() - 0.5) * 2), drag: 5, size: 0.8, endSize: 0.1 });
        }
    }
    bowChargeLastLevel = levelIndex;
}

function updateCharacterCombatVisuals(dt) {
    if (!player || !player.mesh || !window.scene) return;
    const character = getActiveCharacterData();
    const vis = character && character.visualConfig;

    // --- 1. Spear trail ---
    if (vis && typeof vis.attackTrailColor === 'number' && window.spawnWeaponTrail &&
        (player.attackState === 'active' || player.attackState === 'chargedActive' || player.attackState === 'burstActivationActive')) {
        const tip = player.sword && player.sword.userData && player.sword.userData.tip;
        if (tip) {
            // tipLocal (optional, Task 3): điểm mũi vũ khí trong toạ độ cục bộ của `tip` — kiếm của
            // Traveler khai báo {z:1.35}; mũi giáo của Character #3 không khai báo -> giữ offset cũ.
            const tl = player.sword.userData.tipLocal;
            const tipWorld = tl ? _tipWorld.set(tl.x, tl.y, tl.z) : _tipWorld.set(0, 0, 0.12);
            tip.localToWorld(tipWorld);
            window.spawnWeaponTrail(tipWorld, player.isBurstStateActive ? window.FX_COLORS.electroBright : vis.attackTrailColor);
        }
    }

    // --- Character #4 — Tailwind: luồng gió nhỏ quanh chân khi đang có buff VÀ đang di chuyển.
    const twMember = partyState[window.activeCharacterIndex];
    if (twMember && twMember.tailwindTimer > 0 && window.spawnDot && player.inputVelocity && player.inputVelocity.lengthSq() > 1 && Math.random() < 0.5) {
        const twVfx = window.getElementVfx(getCharacterVfxElement(character) || character.element);
        const a = Math.random() * Math.PI * 2;
        const feet = window.groundPointUnder(player.position);
        window.spawnDot(feet.add(new THREE.Vector3(Math.cos(a) * 0.5, 0.15, Math.sin(a) * 0.5)), { color: Math.random() < 0.5 ? twVfx.main : twVfx.light, life: 0.35, vel: new THREE.Vector3(-Math.sin(a) * 2.5, 0.8, Math.cos(a) * 2.5), drag: 2, size: 0.6, endSize: 0.15, opacity: 0.7 });
    }

    // --- 3. Bow charge indicator (Task 3) — CHỈ đọc state có sẵn: player.isBowChargedAiming +
    // getCurrentBowChargeLevel() (cùng hàm Engine dùng để quyết định mũi tên bắn ra). Vòng quanh cây cung
    // lớn dần và đổi màu theo Charge Level; lên level -> chớp + tia lửa. Không đổi charge/aim logic.
    updateBowChargeVisual(dt);

    // --- 2. Burst State aura ---
    const active = !!player.isBurstStateActive;
    if (active) {
        if (!burstAuraMesh) {
            const geo = new THREE.RingGeometry(0.95, 1.15, 40);
            const mat = new THREE.MeshBasicMaterial({ color: window.FX_COLORS.electro, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false });
            burstAuraMesh = new THREE.Mesh(geo, mat);
            burstAuraMesh.rotation.x = -Math.PI / 2;
            window.scene.add(burstAuraMesh);
        }
        burstAuraTime += dt;
        burstAuraMesh.visible = true;
        const g = window.groundPointUnder(player.position);
        burstAuraMesh.position.set(g.x, g.y + 0.06, g.z);
        burstAuraMesh.rotation.z += dt * 2.5;
        const endingSoon = player.burstStateTimer > 0 && player.burstStateTimer < 1.5;
        const pulseSpeed = endingSoon ? 18 : 5;
        const pulse = 0.5 + 0.5 * Math.sin(burstAuraTime * pulseSpeed);
        burstAuraMesh.material.opacity = endingSoon ? 0.25 + 0.65 * pulse : 0.55 + 0.3 * pulse;
        const s = 1.0 + 0.08 * pulse;
        burstAuraMesh.scale.set(s, s, s);
        // Mũi giáo sáng mạnh hơn trong Burst State.
        const tip = player.sword && player.sword.userData && player.sword.userData.tip;
        if (tip && tip.material && tip.material.emissive) tip.material.emissiveIntensity = 1.1 + 0.4 * pulse;
    } else {
        if (burstAuraMesh) burstAuraMesh.visible = false;
        if (wasBurstStateActive) {
            // Vừa thoát Burst State -> vòng tan ra + trả độ sáng mũi giáo về mức thường.
            if (window.spawnGroundRing) window.spawnGroundRing(window.groundPointUnder(player.position), 2.0, window.FX_COLORS.electro, { life: 0.45, startRatio: 0.55, opacity: 0.6 });
            const tip = player.sword && player.sword.userData && player.sword.userData.tip;
            if (tip && tip.material && tip.material.emissive) tip.material.emissiveIntensity = 0.55;
        }
    }
    wasBurstStateActive = active;
}
window.updateCharacterCombatVisuals = updateCharacterCombatVisuals;

// ============================================================
// Task 3 (Combat VFX) — CHARACTER SWITCH CUE
// ============================================================
// spawnSwitchCue(characterId): gọi từ switchToCharacter() SAU KHI đổi thành công (return true) — vòng
// sáng dưới chân + cột hạt bốc lên theo NGUYÊN TỐ của nhân vật vừa vào sân (vfxElement nếu có, không
// thì element thật trong roster). Ngắn (~0.5s), không chặn input, không đổi gì trong gameplay.
function spawnSwitchCue(characterId) {
    const character = CHARACTER_ROSTER[characterId];
    if (!character || !window.spawnGroundRing) return;
    const prof = window.getElementVfx(getCharacterVfxElement(character) || character.element);
    const feet = window.groundPointUnder(player.position);
    window.spawnGroundRing(feet, 1.5, prof.main, { life: 0.45, startRatio: 0.25, opacity: 0.8 });
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        window.spawnDot(feet.clone().add(new THREE.Vector3(Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7)), { color: i % 2 ? prof.main : prof.light, life: 0.5, vel: new THREE.Vector3(0, 3.5 + Math.random() * 1.5, 0), drag: 2, size: 0.9, endSize: 0.15 });
    }
}
window.spawnSwitchCue = spawnSwitchCue;

// ============================================================
// CHARACTER #4 — ANEMO SWORD (anemo_sword)
// ============================================================

// --- Controlled pull (dùng chung cho Skill Vortex Pull + Burst Eye of the Tempest của #4) ---
// Kéo 1 enemy về điểm hội tụ `point` theo mặt phẳng ngang, BƯỚC CÓ GIỚI HẠN mỗi frame:
//   step = min(speed * weightFactor * dt, khoảng cách còn lại - stopRadius)
// -> không bao giờ vượt quá điểm hội tụ (không overshoot/dao động), không teleport. Sau mỗi bước chạy
// resolveStaticCollisions() — CÙNG hàm va chạm tĩnh mà knockback của enemy đang dùng (enemies.js) — để
// không bị kéo xuyên tường/obstacle. KHÔNG đụng knockback/jumpVelocity/launch (pull là kênh riêng).
// Lý do không dùng enemy.velocity: Slime KHÔNG tích phân velocity.x/z (chỉ dùng jumpVelocity/knockback),
// nên cộng lực vào velocity sẽ không có tác dụng (đã xác nhận khi audit).
function getPullWeightFactor(enemy, weightFactorTable) {
    const wc = (enemy.poise && enemy.poise.weightClass) || (enemy.isLarge ? 'heavy' : 'light');
    const table = weightFactorTable || {};
    return (typeof table[wc] === 'number') ? table[wc] : 1.0;
}

function applyControlledPull(enemy, point, speed, stopRadius, dt) {
    if (!enemy || !enemy.alive || dt <= 0) return false;
    const dx = point.x - enemy.position.x;
    const dz = point.z - enemy.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= stopRadius || dist < 0.0001) return false;
    const step = Math.min(speed * dt, dist - stopRadius);
    if (step <= 0) return false;
    enemy.position.x += (dx / dist) * step;
    enemy.position.z += (dz / dist) * step;
    if (enemy.mesh) enemy.mesh.position.copy(enemy.position);
    if (window.resolveStaticCollisions && enemy.mesh) window.resolveStaticCollisions(enemy, enemy.width, enemy.height, enemy.depth, dt);
    if (enemy.isGrounded && typeof enemy.alignToGround === 'function') enemy.alignToGround();
    if (enemy.mesh) enemy.mesh.position.copy(enemy.position);
    if (enemy.aabb && enemy.mesh) enemy.aabb.updateFromObject(enemy.mesh, enemy.width, enemy.height, enemy.depth);
    return true;
}
window.applyControlledPull = applyControlledPull;

function horizontalDistance(a, b) {
    const dx = a.x - b.x, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}

// --- Passive Tailwind ---
function getTailwindConfig(character) {
    const t = character && character.talents && character.talents.passive && character.talents.passive.tailwind;
    return (t && typeof t.duration === 'number') ? t : null;
}
// Hệ số tốc độ di chuyển cho nhân vật ĐANG ACTIVE (1 nếu không có buff). Đọc bởi updatePhysics (file 08).
function getTailwindSpeedMultiplier() {
    const member = partyState[window.activeCharacterIndex];
    if (!member || !(member.tailwindTimer > 0)) return 1;
    const cfg = getTailwindConfig(CHARACTER_ROSTER[member.id]);
    return (cfg && typeof cfg.moveSpeedMultiplier === 'number') ? cfg.moveSpeedMultiplier : 1;
}
window.getTailwindSpeedMultiplier = getTailwindSpeedMultiplier;

// Cast Skill thành công -> ĐẶT LẠI (refresh, không cộng dồn) thời gian buff của đúng nhân vật đã cast.
function grantTailwind(character) {
    const cfg = getTailwindConfig(character);
    if (!cfg) return;
    const member = partyState.find(m => m && m.id === character.id);
    if (member) member.tailwindTimer = cfg.duration;
}

// --- Elemental Skill: Vortex Pull ---
function buildVortexVisual(skillData, vfx) {
    const group = new THREE.Group();
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 6, 36), new THREE.MeshBasicMaterial({ color: vfx.main, transparent: true, opacity: 0.8, depthWrite: false }));
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color: vfx.light, transparent: true, opacity: 0.85, depthWrite: false }));
    const ringC = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 6, 24), new THREE.MeshBasicMaterial({ color: vfx.core, transparent: true, opacity: 0.9, depthWrite: false }));
    ringA.rotation.x = Math.PI / 2; ringB.rotation.x = Math.PI / 2; ringC.rotation.x = Math.PI / 2;
    ringB.position.y = 0.45; ringC.position.y = 0.9;
    group.add(ringA); group.add(ringB); group.add(ringC);
    // Chỉ báo mặt đất: vòng mảnh đúng bán kính KÉO (vùng ảnh hưởng thật).
    const ground = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48), new THREE.MeshBasicMaterial({ color: vfx.main, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    ground.rotation.x = -Math.PI / 2;
    ground.scale.setScalar(skillData.vortex.pullRadius);
    ground.position.y = -0.84;
    group.add(ground);
    return group;
}

function runVortexPullEffect(slot, character, skillData, dir) {
    const v = skillData.vortex;
    const forward = (dir ? dir.clone() : new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)));
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) forward.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
    forward.normalize();

    // Điểm hội tụ (convergence point) — cố định từ lúc cast, trước mặt nhân vật.
    const center = player.position.clone().addScaledVector(forward, v.forwardOffset);
    center.y = window.groundPointUnder(center).y + 0.9;

    const vfx = window.getElementVfx(getCharacterVfxElement(character) || character.element);
    const group = buildVortexVisual(skillData, vfx);
    group.position.copy(center);
    group.scale.setScalar(0.3);
    scene.add(group);

    player.activeEffects[slot].push({
        type: 'vortex_pull', mesh: group, skillData: skillData,
        custom: { elapsed: 0, center: center, character: character, hitDone: false, vfx: vfx }
    });

    // Tư thế "vung kiếm" (squash như các Skill/Burst khác) + âm thanh + chớp gió tại điểm hội tụ.
    player.mesh.scale.set(1.15, 0.85, 1.15);
    sfx.playSwing();
    if (window.spawnMuzzlePuff) window.spawnMuzzlePuff(player.position.clone().addScaledVector(forward, 1.0), forward, vfx.light);
    if (window.spawnGroundRing) window.spawnGroundRing(window.groundPointUnder(center), v.pullRadius, vfx.light, { life: 0.4, startRatio: 1.0, opacity: 0.5, thickness: 0.05 });

    grantTailwind(character); // Passive — cast Skill thành công
}
window.runVortexPullEffect = runVortexPullEffect;

function updateVortexPullEffect(fx, dt) {
    const c = fx.custom;
    const v = fx.skillData.vortex;
    c.elapsed += dt;

    // 1) PULL — chỉ trong [0, pullDuration]; sau đó không còn lực nào.
    if (c.elapsed <= v.pullDuration) {
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e.alive) continue;
            if (horizontalDistance(e.position, c.center) > v.pullRadius) continue;
            applyControlledPull(e, c.center, v.pullSpeed * getPullWeightFactor(e, v.weightFactor), v.stopRadius, dt);
        }
        // Dải gió xoắn hút vào tâm (pooled dots) — thể hiện hướng kéo.
        if (window.spawnDot) {
            for (let k = 0; k < 2; k++) {
                const a = Math.random() * Math.PI * 2;
                const r = v.pullRadius * (0.55 + Math.random() * 0.4);
                const p = new THREE.Vector3(c.center.x + Math.cos(a) * r, c.center.y - 0.5 + Math.random() * 0.8, c.center.z + Math.sin(a) * r);
                const toC = new THREE.Vector3(c.center.x - p.x, 0, c.center.z - p.z).normalize();
                const tang = new THREE.Vector3(-toC.z, 0, toC.x);
                const vel = toC.multiplyScalar(r / 0.45).addScaledVector(tang, 3.5);
                window.spawnDot(p, { color: k ? c.vfx.main : c.vfx.light, life: 0.42, vel: vel, drag: 1.5, size: 0.8, endSize: 0.3 });
            }
        }
    }

    // 2) DAMAGE — ĐÚNG 1 event tại hitTime (độc lập với pull), trúng mỗi enemy tối đa 1 lần.
    if (!c.hitDone && c.elapsed >= v.hitTime) {
        c.hitDone = true;
        const character = c.character;
        const scaling = getTalentScaling(character, 'skillVortex');
        const impact = getTalentImpact(character, 'skillVortex');
        let hitCount = 0;
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e.alive) continue;
            if (horizontalDistance(e.position, c.center) > v.hitRadius || Math.abs(e.position.y - c.center.y) > 2.5) continue;
            const pushDir = new THREE.Vector3(e.position.x - c.center.x, 0, e.position.z - c.center.z);
            if (pushDir.lengthSq() < 0.0001) pushDir.set(0, 0, 1); else pushDir.normalize();
            const dmg = calculatePlayerToEnemyDamage(character, scaling, e);
            e.takeDamage(dmg, pushDir, false, withDamageSource(impact, character));
            hitCount++;
            if (window.spawnHitImpact) window.spawnHitImpact(e.position, pushDir, { element: getCharacterVfxElement(character) || character.element, weight: window.impactWeight(impact) });
            if (!e.alive) spawnDeathParticles(e.position);
        }
        if (hitCount > 0) {
            hitstopTimer = COMBAT_FEEL_CONFIG.hitStopDuration;
            sfx.playHit();
            cameraState.shakeTimer = COMBAT_FEEL_CONFIG.cameraShake.duration;
            cameraState.shakeIntensity = COMBAT_FEEL_CONFIG.cameraShake.intensity;
            const eg = fx.skillData.energyGeneration;
            if (eg) EnergySystem.generateParticles(c.center, eg.particles, eg.element);
        }
        // Tín hiệu damage event (có trúng hay không): vòng gió bung ra đúng hitRadius.
        if (window.spawnGroundRing) window.spawnGroundRing(window.groundPointUnder(c.center), v.hitRadius, c.vfx.light, { life: 0.3, startRatio: 0.25, thickness: 0.14 });
        if (window.spawnFacingRing) window.spawnFacingRing(c.center, 1.8, c.vfx.core, { life: 0.22 });
    }

    // 3) Hình ảnh vortex: mở ra nhanh, xoay, co lại ở cuối vòng đời.
    const life = v.lifetime;
    const t = c.elapsed / life;
    const s = t < 0.2 ? 0.3 + (t / 0.2) * 0.9 : t > 0.8 ? 1.2 * Math.max(0, (1 - t) / 0.2) : 1.2;
    fx.mesh.scale.set(s, 1, s);
    fx.mesh.children[0].rotation.z += dt * 9;
    fx.mesh.children[1].rotation.z -= dt * 13;
    fx.mesh.children[2].rotation.z += dt * 17;
    const fade = t > 0.8 ? Math.max(0, (1 - t) / 0.2) : 1;
    fx.mesh.children.forEach((m, i) => { m.material.opacity = (i === 3 ? 0.35 : 0.85) * fade; });

    if (c.elapsed >= life) {
        cleanupEffect(fx);
        return true;
    }
    return false;
}

// --- Elemental Burst: Eye of the Tempest (vùng gió cố định) ---
function buildWindFieldVisual(field, vfx) {
    const group = new THREE.Group();
    const boundary = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 64), new THREE.MeshBasicMaterial({ color: vfx.main, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
    boundary.rotation.x = -Math.PI / 2; boundary.scale.setScalar(field.radius);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: vfx.main, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.scale.setScalar(field.radius); disc.position.y = -0.01;
    group.add(boundary); group.add(disc);
    // 3 dải gió cong xoay quanh tâm ở các bán kính khác nhau.
    [0.35, 0.6, 0.85].forEach((rr, i) => {
        const arc = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 40, 1, i * 2.1, 1.5), new THREE.MeshBasicMaterial({ color: i % 2 ? vfx.light : vfx.main, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
        arc.rotation.x = -Math.PI / 2; arc.scale.setScalar(field.radius * rr); arc.position.y = 0.02 + i * 0.01;
        group.add(arc);
    });
    // Tâm: vòng xoáy nhỏ dựng đứng — dễ nhận ra "mắt bão".
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 28), new THREE.MeshBasicMaterial({ color: vfx.core, transparent: true, opacity: 0.85, depthWrite: false }));
    eye.rotation.x = Math.PI / 2; eye.position.y = 0.9;
    group.add(eye);
    return group;
}

function runWindFieldEffect(slot, character, burstData, dir) {
    const field = burstData.field;
    player.energy = 0; // consume Energy — ĐÚNG PATTERN mọi executor Burst hiện có
    sfx.playBurst();
    player.mesh.scale.set(1.22, 0.72, 1.22);

    // Vị trí CỐ ĐỊNH tại lúc kích hoạt — không đi theo nhân vật.
    const center = window.groundPointUnder(player.position);
    const vfx = window.getElementVfx(getCharacterVfxElement(character) || character.element);
    const group = buildWindFieldVisual(field, vfx);
    group.position.set(center.x, center.y + 0.06, center.z);
    scene.add(group);

    player.activeEffects[slot].push({
        type: 'wind_field', mesh: group, skillData: burstData,
        custom: {
            elapsed: 0,
            duration: field.duration,
            center: center,
            character: character,
            vfx: vfx,
            pulsesTriggered: field.pulses.map(() => false),
            hasHitList: [],   // "p<pulseIndex>:<enemyId>"
            pullUntil: -1
        }
    });

    // Kích hoạt (KHÔNG gây damage): cột gió + vòng bung ra đúng bán kính vùng.
    if (window.spawnGroundRing) {
        window.spawnGroundRing(center, field.radius, vfx.light, { life: 0.55, startRatio: 0.1, thickness: 0.1, fill: true });
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            window.spawnDot(center.clone().add(new THREE.Vector3(Math.cos(a) * 1.2, 0.2, Math.sin(a) * 1.2)), { color: i % 2 ? vfx.main : vfx.light, life: 0.7, vel: new THREE.Vector3(-Math.sin(a) * 3, 5 + Math.random() * 2, Math.cos(a) * 3), drag: 1.5, size: 1.1, endSize: 0.2 });
        }
    }
    pulseBurstButton();
}
window.runWindFieldEffect = runWindFieldEffect;

function endWindFieldEffect(fx) {
    const c = fx.custom;
    if (window.spawnGroundRing) window.spawnGroundRing(c.center, fx.skillData.field.radius, c.vfx.light, { life: 0.5, startRatio: 1.0, opacity: 0.6, thickness: 0.06 });
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        if (window.spawnDot) window.spawnDot(c.center.clone().add(new THREE.Vector3(Math.cos(a) * 2, 0.4, Math.sin(a) * 2)), { color: c.vfx.light, life: 0.5, vel: new THREE.Vector3(Math.cos(a) * 3, 1.5, Math.sin(a) * 3), drag: 2, size: 0.8, endSize: 0.1 });
    }
    cleanupEffect(fx);
}

function updateWindFieldEffect(fx, dt) {
    const c = fx.custom;
    const field = fx.skillData.field;
    c.elapsed += dt;

    // Hết duration -> kết thúc NGAY, không pulse/pull nào bắt đầu thêm.
    if (c.elapsed >= c.duration) {
        endWindFieldEffect(fx);
        return true;
    }

    // PULSES — lịch rời rạc; mỗi pulse mở đúng 1 lần, mỗi enemy trúng tối đa 1 lần/pulse.
    for (let pi = 0; pi < field.pulses.length; pi++) {
        const pulse = field.pulses[pi];
        if (c.pulsesTriggered[pi] || c.elapsed < pulse.time || pulse.time >= c.duration) continue;
        c.pulsesTriggered[pi] = true;
        c.pullUntil = c.elapsed + field.pull.pullDuration;

        const character = c.character;
        const scaling = getTalentScaling(character, 'burst');
        scaling.multiplier *= (typeof pulse.damageMult === 'number') ? pulse.damageMult : 1;
        const impact = (pulse.impact && pulse.impact.type) ? { type: pulse.impact.type } : { type: 'light' };
        const isLast = pi === field.pulses.length - 1;
        let hit = 0;

        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e.alive) continue;
            const key = 'p' + pi + ':' + e.id;
            if (c.hasHitList.includes(key)) continue;
            if (horizontalDistance(e.position, c.center) > field.radius || Math.abs(e.position.y - c.center.y) > 3) continue;
            const pushDir = new THREE.Vector3(c.center.x - e.position.x, 0, c.center.z - e.position.z); // hướng VÀO tâm (gió cuốn vào)
            if (pushDir.lengthSq() < 0.0001) pushDir.set(0, 0, 1); else pushDir.normalize();
            const dmg = calculatePlayerToEnemyDamage(character, scaling, e);
            e.takeDamage(dmg, pushDir, false, withDamageSource(impact, character));
            c.hasHitList.push(key);
            hit++;
            if (window.spawnHitImpact) window.spawnHitImpact(e.position, pushDir, { element: getCharacterVfxElement(character) || character.element, weight: window.impactWeight(impact) });
            if (!e.alive) spawnDeathParticles(e.position);
        }
        if (hit > 0) {
            sfx.playHit();
            cameraState.shakeTimer = isLast ? 0.25 : 0.1;
            cameraState.shakeIntensity = isLast ? 0.3 : 0.12;
        }
        // Nhịp pulse (có trúng hay không): sóng gió quét từ tâm ra biên — đồng bộ với damage event thật.
        if (window.spawnGroundRing) window.spawnGroundRing(c.center, field.radius, isLast ? c.vfx.core : c.vfx.light, { life: isLast ? 0.5 : 0.38, startRatio: 0.12, thickness: isLast ? 0.1 : 0.06, opacity: isLast ? 0.9 : 0.7 });
    }

    // PULL ngắn sau mỗi pulse (không liên tục cả Burst).
    if (c.elapsed <= c.pullUntil) {
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e.alive) continue;
            if (horizontalDistance(e.position, c.center) > field.radius) continue;
            applyControlledPull(e, c.center, field.pull.pullSpeed * getPullWeightFactor(e, field.weightFactor), field.pull.stopRadius, dt);
        }
    }

    // Hình ảnh: dải gió xoay, mắt bão xoay, mờ dần 0.6s cuối; hạt gió lác đác hút vào tâm.
    const ch = fx.mesh.children;
    ch[2].rotation.z += dt * 1.6; ch[3].rotation.z -= dt * 2.3; ch[4].rotation.z += dt * 3.1; ch[5].rotation.z += dt * 6;
    const fade = Math.min(1, (c.duration - c.elapsed) / 0.6);
    ch.forEach((m, i) => { m.material.opacity = [0.75, 0.1, 0.6, 0.6, 0.6, 0.85][i] * fade; });
    if (window.spawnDot && Math.random() < 0.6) {
        const a = Math.random() * Math.PI * 2, r = field.radius * (0.4 + Math.random() * 0.55);
        const p = new THREE.Vector3(c.center.x + Math.cos(a) * r, c.center.y + 0.3 + Math.random() * 1.2, c.center.z + Math.sin(a) * r);
        window.spawnDot(p, { color: c.vfx.light, life: 0.8, vel: new THREE.Vector3(-Math.sin(a) * 3 - Math.cos(a) * 1.5, 0.3, Math.cos(a) * 3 - Math.sin(a) * 1.5), drag: 0.5, size: 0.7, endSize: 0.2, opacity: 0.6 });
    }
    return false;
}

// --- Dọn dẹp khi đổi nhân vật (gọi từ switchToCharacter, TRƯỚC khi đổi) ---
// Vortex Pull là hiệu ứng ngắn gắn với lần vung kiếm của nhân vật -> kết thúc ngay khi nhân vật rời sân
// (không còn lực kéo nào). Vùng Burst Eye of the Tempest là vùng CỐ ĐỊNH -> tiếp tục tới hết duration
// (cùng quy tắc với vùng Burst Pyro của Archer, vốn không bị huỷ khi đổi nhân vật).
function onCharacterSwitchedOut(prevId) {
    // Character #5/#6: Counter Stance / Violet Arc đang giữ của nhân vật rời sân -> huỷ sạch (không cooldown).
    if (heldSkill.active && heldSkill.character && heldSkill.character.id === prevId) cancelHeldSkill('switch');
    const list = player.activeEffects.skill;
    for (let i = list.length - 1; i >= 0; i--) {
        const fx = list[i];
        if (fx.type === 'vortex_pull' && fx.custom && fx.custom.character && fx.custom.character.id === prevId) {
            cleanupEffect(fx);
            list.splice(i, 1);
        }
    }
}
window.onCharacterSwitchedOut = onCharacterSwitchedOut;

// ============================================================
// CHARACTER #5 / #6 (GI-CHAR-05-06) — HELD SKILL CONTROLLER + 2 BURST MỚI
// ============================================================
// HELD SKILL = Elemental Skill có SKILL_LIBRARY[...].inputMode === 'held'. Vòng đời DUY NHẤT:
//   beginHeldSkill()  <- handleSkillKeyDown (phím E / touchstart nút Skill)
//   updateHeldSkill() <- mỗi frame (updateCharacterKitTimers, gọi từ updateActiveEffects)
//   releaseHeldSkill('release' | 'expire') <- handleSkillKeyUp (E / touchend / touchcancel) hoặc hết maxHold
//   cancelHeldSkill('switch' | 'dead')     <- đổi nhân vật (onCharacterSwitchedOut) / nhân vật gục
// Mỗi lần kích hoạt chỉ resolve ĐÚNG 1 kết quả (cờ `resolved` + endHeldSkill() dọn sạch trạng thái).
// Tự hết giờ (maxHold) => KHÔNG bao giờ kẹt dù mất sự kiện thả tay (touch bị huỷ, mất focus...).
//
// Counter (Character #5, behavior 'counter_stance'):
//   stance -> [đòn địch HỢP LỆ trúng trong cửa sổ phòng thủ] -> Counter (Normal | Perfect) + chặn damage
//          -> [thả phím / hết giờ, không có đòn nào] -> Release Swing (đòn chém thường của Skill)
//          -> [đổi nhân vật / gục]                    -> Interrupted (không cooldown, không damage)
//   Đòn hợp lệ = đòn đi qua window.interceptIncomingAttack() — gọi từ window.applyEnemyAttackToPlayer()
//   (enemies.js): cú nhảy tấn công của Slime + đòn của quái M2 (14-enemy-framework.js: chém cận chiến,
//   đạn tầm xa, cú nện hạng nặng), đúng lúc nó THẬT SỰ trúng (tầm + khung tấn công + player không bất tử).
//   Va chạm thân dummy, rơi độ cao, đòn có unblockable: true KHÔNG được tính.
// Violet Arc (Character #6, behavior 'violet_arc'): thả trước tapThreshold = Tap; giữ lâu hơn = Hold
//   (nạp dần tới maxHold rồi tự phóng). Tap/Hold có cooldown & năng lượng riêng.

const heldSkill = { active: false, mode: null, character: null, skillData: null, elapsed: 0, resolved: false, visual: null, chargeFullFxDone: false };
window.heldSkillState = heldSkill;
// Nhật ký kết quả (chỉ để debug/test tự động — KHÔNG ảnh hưởng gameplay, giữ tối đa 40 mục).
const heldSkillLog = window.heldSkillLog = [];
function logHeldSkill(event, extra) {
    heldSkillLog.push(Object.assign({ event: event, t: performance.now() }, extra || {}));
    if (heldSkillLog.length > 40) heldSkillLog.shift();
}

function isHeldSkillActive() { return heldSkill.active; }
window.isHeldSkillActive = isHeldSkillActive;

function getHeldSkillMoveMultiplier() {
    if (!heldSkill.active || !heldSkill.skillData || !heldSkill.skillData.held) return 1;
    const m = heldSkill.skillData.held.moveMultiplier;
    return (typeof m === 'number') ? m : 1;
}
window.getHeldSkillMoveMultiplier = getHeldSkillMoveMultiplier;

function kitVfxColor(character, key) {
    const el = getCharacterVfxElement(character);
    return window.getElementVfx ? window.getElementVfx(el || 'physical')[key || 'main'] : 0xffffff;
}

function buildHeldSkillVisual(mode, character) {
    const group = new THREE.Group();
    const color = kitVfxColor(character, 'main');
    const ringMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    if (mode === 'counter_stance') {
        // Khiên bán trong suốt phía trước — silhouette "thủ thế" dễ đọc trên màn hình nhỏ.
        const shieldMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
        const shield = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 1.6, 24, 1, true, -Math.PI / 3, Math.PI * 2 / 3), shieldMat);
        shield.position.y = 0.8;
        shield.rotation.y = Math.PI; // mặt trước nhân vật (+Z cục bộ)
        group.add(shield);
        ring.scale.setScalar(1.25);
    } else {
        ring.scale.setScalar(0.4);
    }
    group.position.copy(window.groundPointUnder ? window.groundPointUnder(player.position) : player.position);
    scene.add(group);
    return group;
}

function disposeHeldSkillVisual() {
    if (!heldSkill.visual) return;
    scene.remove(heldSkill.visual);
    heldSkill.visual.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    heldSkill.visual = null;
}

function beginHeldSkill(character, skillData) {
    if (heldSkill.active || !character || !skillData) return false;
    heldSkill.active = true;
    heldSkill.mode = skillData.behavior;
    heldSkill.character = character;
    heldSkill.skillData = skillData;
    heldSkill.elapsed = 0;
    heldSkill.resolved = false;
    heldSkill.chargeFullFxDone = false;
    heldSkill.visual = buildHeldSkillVisual(heldSkill.mode, character);
    if (heldSkill.mode === 'counter_stance') {
        // Tư thế thủ: trọng kiếm dựng ngang trước ngực (chỉ hình ảnh — không có damage ở đây).
        if (player.sword) player.sword.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        player.mesh.scale.set(1.08, 0.94, 1.08);
        sfx.playSwing();
        logHeldSkill('stance_entered', { id: character.id });
    } else {
        logHeldSkill('charge_started', { id: character.id });
    }
    return true;
}
window.beginHeldSkill = beginHeldSkill;

function endHeldSkill() {
    disposeHeldSkillVisual();
    if (heldSkill.mode === 'counter_stance' && typeof getWeaponGripRotation === 'function' && player.sword && player.tiltRoot) {
        const grip = getWeaponGripRotation();
        player.sword.rotation.set(grip.x + player.tiltRoot.rotation.x, grip.y, grip.z);
    }
    heldSkill.active = false;
    heldSkill.mode = null;
    heldSkill.character = null;
    heldSkill.skillData = null;
    heldSkill.elapsed = 0;
    heldSkill.resolved = false;
}

function updateHeldSkill(dt) {
    if (!heldSkill.active) return;
    if (player.isDead) { cancelHeldSkill('dead'); return; }
    const active = getActiveCharacterData();
    if (!active || active.id !== heldSkill.character.id) { cancelHeldSkill('switch'); return; }
    heldSkill.elapsed += dt;
    const cfg = heldSkill.skillData.held || {};
    if (heldSkill.visual) {
        heldSkill.visual.position.copy(window.groundPointUnder ? window.groundPointUnder(player.position) : player.position);
        heldSkill.visual.rotation.y = player.mesh.rotation.y;
        const ring = heldSkill.visual.children[0];
        if (heldSkill.mode === 'counter_stance') {
            // Cửa sổ Perfect: vòng sáng rõ + đập nhịp; sau đó mờ dần -> người chơi đọc được thời điểm vàng.
            const c = heldSkill.skillData.counter;
            const inPerfect = heldSkill.elapsed >= c.startup && heldSkill.elapsed <= c.startup + c.perfectWindow;
            ring.material.opacity = inPerfect ? 0.85 : 0.4;
            ring.material.color.setHex(inPerfect ? kitVfxColor(heldSkill.character, 'light') : kitVfxColor(heldSkill.character, 'main'));
            const s = 1.25 + (inPerfect ? Math.sin(heldSkill.elapsed * 30) * 0.05 : 0);
            ring.scale.setScalar(s);
        } else {
            const ratio = getVioletArcChargeRatio();
            const r = 0.4 + (heldSkill.skillData.arc.holdRadius - 0.4) * ratio;
            ring.scale.setScalar(Math.max(0.4, r));
            ring.material.opacity = 0.35 + 0.45 * ratio;
            if (ratio >= 1 && !heldSkill.chargeFullFxDone) {
                heldSkill.chargeFullFxDone = true;
                if (window.spawnGroundRing) window.spawnGroundRing(window.groundPointUnder(player.position), heldSkill.skillData.arc.holdRadius, kitVfxColor(heldSkill.character, 'core'), { life: 0.25, startRatio: 0.9, opacity: 0.9 });
            }
        }
    }
    if (heldSkill.elapsed >= (cfg.maxHold || 1.5)) releaseHeldSkill('expire');
}

function releaseHeldSkill(reason) {
    if (!heldSkill.active || heldSkill.resolved) return;
    heldSkill.resolved = true;
    if (heldSkill.mode === 'counter_stance') performCounterRelease(reason);
    else performVioletArc(reason);
    endHeldSkill();
}
window.releaseHeldSkill = releaseHeldSkill;

function cancelHeldSkill(reason) {
    if (!heldSkill.active) return;
    logHeldSkill(heldSkill.mode === 'counter_stance' ? 'stance_interrupted' : 'charge_interrupted', { reason: reason });
    endHeldSkill();
}
window.cancelHeldSkill = cancelHeldSkill;

// Đánh 1 vùng tròn quanh `center` — 1 damage event/enemy/lần gọi (hitKeys chặn trùng). Dùng pipeline
// chung: getTalentScaling/Impact -> calculatePlayerToEnemyDamage -> enemy.takeDamage(withDamageSource).
function strikeCircle(character, center, radius, category, opts) {
    opts = opts || {};
    const scaling = getTalentScaling(character, category);
    if (typeof opts.damageMult === 'number') scaling.multiplier *= opts.damageMult;
    const impact = opts.impact || getTalentImpact(character, category);
    const vfxEl = getCharacterVfxElement(character);
    const hitKeys = opts.hitKeys || new Set();
    const hitEnemies = [];
    enemies.forEach(enemy => {
        if (!enemy.alive || hitKeys.has(enemy.id)) return;
        if (opts.onlyTarget && enemy !== opts.onlyTarget) return;
        const res = resolveMeleeHitCollision(enemy, center, opts.forward || new THREE.Vector3(0, 0, 1), { hitShape: 'circle', hitRadius: radius + (enemy.isLarge ? 0.6 : 0) });
        if (!res.hit && enemy !== opts.onlyTarget) return;
        const dir = res.toEnemy && res.toEnemy.lengthSq() > 0 ? res.toEnemy.clone() : new THREE.Vector3(0, 0, 1);
        hitKeys.add(enemy.id);
        const dmg = calculatePlayerToEnemyDamage(character, scaling, enemy);
        enemy.takeDamage(dmg, dir, false, withDamageSource(impact, character));
        hitEnemies.push(enemy);
        if (window.spawnHitImpact) window.spawnHitImpact(enemy.position.clone().addScaledVector(dir, -0.4), dir, { element: vfxEl, weight: window.impactWeight ? window.impactWeight(impact) : 1 });
        if (!enemy.alive) spawnDeathParticles(enemy.position);
    });
    if (hitEnemies.length) {
        sfx.playHit();
        hitstopTimer = (typeof opts.hitstop === 'number') ? opts.hitstop : COMBAT_FEEL_CONFIG.hitStopDuration;
        cameraState.shakeTimer = COMBAT_FEEL_CONFIG.cameraShake.duration * 1.5;
        cameraState.shakeIntensity = (typeof opts.shake === 'number') ? opts.shake : COMBAT_FEEL_CONFIG.cameraShake.intensity;
    }
    return hitEnemies;
}
window.strikeCircle = strikeCircle;

function generateKitParticles(hitEnemies, energyCfg) {
    if (!hitEnemies.length || !energyCfg || !energyCfg.particles || !window.EnergySystem) return;
    window.EnergySystem.generateParticles(hitEnemies[0].position.clone(), energyCfg.particles, energyCfg.element || null);
}

function kitLabel(text, style) {
    if (!window.spawnDamageNumber) return;
    const p = player.position.clone(); p.y += player.height * 1.05;
    window.spawnDamageNumber(p, text, style);
}

// --- Character #5: Counter ---
// INCOMING ATTACK CONTRACT (enemies.js gọi): trả true = đòn bị chặn hoàn toàn.
window.interceptIncomingAttack = function (attacker, info) {
    if (!heldSkill.active || heldSkill.mode !== 'counter_stance' || heldSkill.resolved) return false;
    if (!info || info.unblockable) { logHeldSkill('ineligible_attack', { reason: info ? 'unblockable' : 'no_info' }); return false; }
    const active = getActiveCharacterData();
    if (!active || active.id !== heldSkill.character.id) return false;
    const c = heldSkill.skillData.counter;
    if (heldSkill.elapsed < c.startup) { logHeldSkill('too_early', { elapsed: heldSkill.elapsed }); return false; }
    const perfect = heldSkill.elapsed <= c.startup + c.perfectWindow;
    heldSkill.resolved = true;
    performCounter(perfect, attacker, info);
    endHeldSkill();
    return true;
};

function performCounter(perfect, attacker, info) {
    const character = heldSkill.character;
    const c = heldSkill.skillData.counter;
    const variant = perfect ? c.perfect : c.normal;
    // Chặn đòn: không trừ HP (enemies.js bỏ qua), thêm bất tử ngắn để đòn trùng khung khác không xuyên qua.
    player.invulnTimer = Math.max(player.invulnTimer, c.postCounterInvuln);
    const forward = new THREE.Vector3().subVectors(attacker.position, player.position); forward.y = 0;
    if (forward.lengthSq() > 0.0001) { forward.normalize(); player.mesh.rotation.y = Math.atan2(forward.x, forward.z); }
    const hits = strikeCircle(character, player.position, variant.radius, perfect ? 'talent:skill.counterPerfect' : 'talent:skill.counterNormal',
        { forward: forward, hitstop: variant.hitstop, shake: variant.shake });
    generateKitParticles(hits, perfect ? c.perfect.energyGeneration : c.normal.energyGeneration);
    startSkillCooldown();
    // Phản hồi: vòng va chạm + nhãn chữ; Perfect = vòng kép vàng sáng + nhãn PERFECT lớn.
    if (window.spawnGroundRing) {
        const gp = window.groundPointUnder(player.position);
        window.spawnGroundRing(gp, variant.radius, kitVfxColor(character, perfect ? 'light' : 'main'), { life: 0.35, startRatio: 0.3, thickness: 0.14 });
        if (perfect) window.spawnGroundRing(gp, variant.radius * 1.25, 0xfde047, { life: 0.5, startRatio: 0.5, thickness: 0.08 });
    }
    player.mesh.scale.set(0.82, 1.2, 0.82);
    kitLabel(perfect ? 'PERFECT' : 'COUNTER', perfect ? 'perfect' : 'counter');
    logHeldSkill(perfect ? 'counter_perfect' : 'counter_normal', { attackId: info.attackId, hits: hits.length, elapsed: heldSkill.elapsed });
}

function performCounterRelease(reason) {
    const character = heldSkill.character;
    const r = heldSkill.skillData.release;
    const forward = new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
    const center = player.position.clone().addScaledVector(forward, r.forwardOffset || 0);
    const hits = strikeCircle(character, center, r.radius, 'talent:skill.release', { forward: forward, hitstop: r.hitstop, shake: r.shake });
    generateKitParticles(hits, r.energyGeneration);
    startSkillCooldown();
    if (window.spawnGroundRing) window.spawnGroundRing(window.groundPointUnder(center), r.radius, kitVfxColor(character, 'main'), { life: 0.3, thickness: 0.1 });
    player.mesh.scale.set(0.85, 1.15, 0.85);
    sfx.playSwing();
    logHeldSkill(reason === 'expire' ? 'stance_expired_swing' : 'release_swing', { hits: hits.length, elapsed: heldSkill.elapsed });
}

// --- Character #6: Violet Arc ---
function getVioletArcChargeRatio() {
    if (!heldSkill.active || heldSkill.mode !== 'violet_arc') return 0;
    const cfg = heldSkill.skillData.held;
    return Math.max(0, Math.min(1, (heldSkill.elapsed - cfg.tapThreshold) / Math.max(0.01, cfg.maxHold - cfg.tapThreshold)));
}
window.getVioletArcChargeRatio = getVioletArcChargeRatio;

function performVioletArc(reason) {
    const character = heldSkill.character;
    const sd = heldSkill.skillData;
    const arc = sd.arc;
    const isTap = heldSkill.elapsed < sd.held.tapThreshold && reason !== 'expire';
    const color = kitVfxColor(character, 'main');
    if (isTap) {
        // Tap: đánh THẲNG mục tiêu gần nhất trong tapRange (không cần ngắm); không có -> vùng nhỏ phía trước.
        const target = (typeof TargetAssist !== 'undefined') ? TargetAssist.getNearestTarget(player.position, { maxRange: arc.tapRange }) : null;
        let hits;
        if (target) {
            const d = new THREE.Vector3().subVectors(target.position, player.position); d.y = 0;
            if (d.lengthSq() > 0.0001) player.mesh.rotation.y = Math.atan2(d.x, d.z);
            hits = strikeCircle(character, target.position, 0, 'talent:skill.arcTap', { onlyTarget: target });
            if (window.spawnElectroStrike) window.spawnElectroStrike(target.position, { color: color });
        } else {
            const fwd = new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
            const pt = player.position.clone().addScaledVector(fwd, arc.tapFallbackDistance);
            hits = strikeCircle(character, pt, arc.tapFallbackRadius, 'talent:skill.arcTap', { forward: fwd });
            if (window.spawnElectroStrike) window.spawnElectroStrike(pt, { color: color });
            if (window.spawnGroundRing) window.spawnGroundRing(window.groundPointUnder(pt), arc.tapFallbackRadius, color, { life: 0.3 });
        }
        generateKitParticles(hits, arc.tapEnergyGeneration);
        startSkillCooldown(arc.tapCooldown);
        logHeldSkill('arc_tap', { hits: hits.length, target: !!target });
    } else {
        const ratio = getVioletArcChargeRatio();
        const full = ratio >= 1;
        const hits = strikeCircle(character, player.position, arc.holdRadius, 'talent:skill.arcHold', {
            damageMult: arc.holdMinDamageRatio + (1 - arc.holdMinDamageRatio) * ratio,
            impact: { type: full ? 'heavy' : 'medium' }, hitstop: full ? 0.09 : 0.06, shake: full ? 0.4 : 0.25
        });
        hits.forEach(e => { if (window.spawnElectroStrike) window.spawnElectroStrike(e.position, { color: color, big: full }); });
        if (window.spawnGroundRing) window.spawnGroundRing(window.groundPointUnder(player.position), arc.holdRadius, color, { life: 0.4, startRatio: 0.2, thickness: 0.12 });
        generateKitParticles(hits, full ? arc.holdFullEnergyGeneration : arc.holdEnergyGeneration);
        startSkillCooldown(arc.holdCooldown);
        logHeldSkill('arc_hold', { hits: hits.length, ratio: ratio, full: full, reason: reason });
    }
    sfx.playBurst();
}

// --- Bộ đếm dùng chung cho kit #5/#6 (gọi 1 lần/frame từ updateActiveEffects) ---
function updateCharacterKitTimers(dt) {
    if (player.castLockTimer > 0) player.castLockTimer = Math.max(0, player.castLockTimer - dt);
    updateHeldSkill(dt);
}

// --- Character #5 Burst: Ground Slam (behavior 'ground_slam') ---
// Tâm CỐ ĐỊNH tại vị trí cast. Lịch strikes[] rời rạc (time, radius, damageMult, impact) — mỗi strike là
// 1 damage event/enemy (hit key "s<i>:<id>"). startup khoá di chuyển ngắn (castLockTimer) + bất tử ngắn.
function runGroundSlamEffect(slot, character, burstData) {
    const cfg = burstData.slam;
    player.energy = 0;
    player.castLockTimer = cfg.startup;
    player.invulnTimer = Math.max(player.invulnTimer, cfg.invuln);
    const center = window.groundPointUnder ? window.groundPointUnder(player.position) : player.position.clone();
    const group = new THREE.Group();
    const tele = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), new THREE.MeshBasicMaterial({ color: kitVfxColor(character, 'main'), transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    tele.rotation.x = -Math.PI / 2;
    tele.scale.setScalar(cfg.strikes[0].radius);
    group.add(tele);
    group.position.set(center.x, center.y + 0.07, center.z);
    scene.add(group);
    player.mesh.scale.set(1.2, 0.8, 1.2); // lấy đà
    if (player.sword) player.sword.rotation.set(-Math.PI / 2.2, 0, 0); // giơ trọng kiếm lên cao
    sfx.playSwing();
    player.activeEffects[slot].push({
        type: 'ground_slam', mesh: group, skillData: burstData,
        custom: { elapsed: 0, character: character, center: center.clone(), done: cfg.strikes.map(() => false), hitKeys: cfg.strikes.map(() => new Set()) }
    });
}

function updateGroundSlamEffect(fx, dt) {
    const c = fx.custom;
    const cfg = fx.skillData.slam;
    c.elapsed += dt;
    for (let i = 0; i < cfg.strikes.length; i++) {
        const s = cfg.strikes[i];
        if (c.done[i] || c.elapsed < s.time) continue;
        c.done[i] = true;
        strikeCircle(c.character, c.center, s.radius, 'burst', { damageMult: s.damageMult, impact: s.impact, hitKeys: c.hitKeys[i], hitstop: s.hitstop, shake: s.shake });
        if (window.spawnGroundRing) window.spawnGroundRing(c.center, s.radius, i === 0 ? 0xfde68a : kitVfxColor(c.character, 'main'), { life: 0.45, startRatio: 0.15, thickness: 0.16 });
        if (window.spawnDustPuff) for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            window.spawnDustPuff(new THREE.Vector3(c.center.x + Math.cos(a) * s.radius * 0.6, c.center.y + 0.1, c.center.z + Math.sin(a) * s.radius * 0.6));
        }
        if (i === 0) player.mesh.scale.set(0.8, 1.2, 0.8);
    }
    if (fx.mesh && fx.mesh.children[0]) fx.mesh.children[0].material.opacity = Math.max(0, 0.45 * (1 - c.elapsed / cfg.duration));
    if (c.elapsed >= cfg.duration) { cleanupEffect(fx); return true; }
    return false;
}

// --- Character #6 Burst: Lightning Rose (behavior 'rose_field') ---
// Vùng CỐ ĐỊNH tại vị trí cast (không đi theo/không homing). Tick rời rạc: tick k tại firstTick + k*interval
// (k < maxTicks, trong duration). Mỗi tick đánh mỗi enemy trong bán kính tối đa 1 lần (key "k:id").
// Tồn tại độc lập với nhân vật ra sân (giống field #4); hết duration -> dọn mesh, không tick nữa.
function runRoseFieldEffect(slot, character, burstData) {
    const cfg = burstData.field;
    player.energy = 0;
    const center = window.groundPointUnder ? window.groundPointUnder(player.position) : player.position.clone();
    const color = kitVfxColor(character, 'main');
    const group = new THREE.Group();
    const boundary = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 64), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    boundary.rotation.x = -Math.PI / 2;
    boundary.scale.setScalar(cfg.radius);
    boundary.position.y = 0.06;
    group.add(boundary);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), new THREE.MeshBasicMaterial({ color: kitVfxColor(character, 'light'), transparent: true, opacity: 0.9 }));
    orb.position.y = 1.4;
    group.add(orb);
    group.position.copy(center);
    scene.add(group);
    if (window.spawnGroundRing) window.spawnGroundRing(center, cfg.radius, kitVfxColor(character, 'core'), { life: 0.4, startRatio: 0.2 });
    sfx.playBurst();
    player.activeEffects[slot].push({
        type: 'rose_field', mesh: group, skillData: burstData,
        custom: { elapsed: 0, duration: cfg.duration, character: character, center: center.clone(), ticksDone: 0, tickHits: new Set(), orb: orb, boundary: boundary }
    });
}

function updateRoseFieldEffect(fx, dt) {
    const c = fx.custom;
    const cfg = fx.skillData.field;
    c.elapsed += dt;
    while (c.ticksDone < cfg.maxTicks && c.elapsed >= cfg.firstTick + c.ticksDone * cfg.tickInterval && c.elapsed <= c.duration) {
        const k = c.ticksDone++;
        const color = kitVfxColor(c.character, 'main');
        const orbWorld = c.orb.getWorldPosition(new THREE.Vector3());
        const scaling = getTalentScaling(c.character, 'burst');
        const impact = cfg.tickImpact || { type: 'light' };
        let hitCount = 0;
        enemies.forEach(enemy => {
            if (!enemy.alive) return;
            const key = k + ':' + enemy.id;
            if (c.tickHits.has(key)) return;
            const dx = enemy.position.x - c.center.x, dz = enemy.position.z - c.center.z;
            if (dx * dx + dz * dz > cfg.radius * cfg.radius) return;
            c.tickHits.add(key);
            const dir = new THREE.Vector3(dx, 0, dz); if (dir.lengthSq() > 0.0001) dir.normalize(); else dir.set(0, 0, 1);
            enemy.takeDamage(calculatePlayerToEnemyDamage(c.character, scaling, enemy), dir, false, withDamageSource(impact, c.character));
            hitCount++;
            if (window.spawnElectroStrike) window.spawnElectroStrike(enemy.position, { color: color });
            if (!enemy.alive) spawnDeathParticles(enemy.position);
        });
        if (hitCount && window.spawnDot) window.spawnDot(orbWorld, { color: kitVfxColor(c.character, 'light'), life: 0.3, size: 2.2, endSize: 0.5, opacity: 0.8 });
        c.lastTickHits = hitCount;
    }
    const left = c.duration - c.elapsed;
    if (c.orb) { c.orb.position.y = 1.4 + Math.sin(c.elapsed * 3) * 0.12; c.orb.material.opacity = left < 1 ? Math.max(0, left) * 0.9 : 0.9; }
    if (c.boundary) c.boundary.material.opacity = left < 1 ? Math.max(0, left) * 0.6 : 0.6;
    if (c.elapsed >= c.duration) { cleanupEffect(fx); return true; }
    return false;
}
