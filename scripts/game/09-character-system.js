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
    if (!skillData) return; // nhân vật chưa có skill (VD test_character_anemo) — no-op, KHÔNG lỗi

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
    const arrowMesh = createArrowVisualMesh(ov.color);
    arrowMesh.position.copy(origin);
    // Xoay mesh để trục dài (Y cục bộ của CylinderGeometry) khớp hướng bay ban đầu — cập nhật lại
    // mỗi frame theo velocity thực tế trong updateArrowEffect() (để mũi tên "cúi đầu" theo gravity).
    arrowMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), forward);
    scene.add(arrowMesh);

    const speed = (typeof ov.speed === 'number') ? ov.speed : 24;
    const velocity = forward.clone().multiplyScalar(speed);

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
        elementIntensity: (typeof ov.elementIntensity === 'number') ? ov.elementIntensity : 0
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

    // Xoay mesh theo hướng bay THỰC TẾ mỗi frame (mũi tên "cúi đầu" dần theo gravity — hệ quả
    // trực quan của physics-based trajectory, không phải animation soạn tay).
    if (arrow.velocity.lengthSq() > 0.0001) {
        arrow.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), arrow.velocity.clone().normalize());
    }

    // --- COLLISION: dùng LẠI ĐÚNG AABB/intersectAABB() đã có (GIỐNG Small Shot) — KHÔNG tạo
    // collision primitive mới. Kiểm tra ENEMY TRƯỚC (spec mục 3 "Arrow -> Enemy": collision -> hit
    // event -> damage -> destroy arrow NGAY, không tiếp tục kiểm tra world cùng frame đó).
    const aAABB = new AABB();
    const arrowHitboxSize = 0.35; // nhỏ, phù hợp mũi tên mảnh — không phải số liệu balance cuối
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
        spawnCombatSparks(arrow.mesh.position, arrow.velocity.clone().normalize());
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
            spawnCombatSparks(enemy.position, pushDir);
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

                spawnCombatSparks(enemy.position, pushDir);
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
    return c.elapsed >= c.duration;
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
                const pullDir = new THREE.Vector3().subVectors(bPos, enemy.position);
                pullDir.y = 0;
                if (pullDir.lengthSq() > 0.0001) {
                    pullDir.normalize();
                    enemy.velocity.x += pullDir.x * skillData.pull.smallEnemyForce * dt * 10;
                    enemy.velocity.z += pullDir.z * skillData.pull.smallEnemyForce * dt * 10;
                }
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
        lastKnownHp: {},           // map enemy.id -> hp đã ghi nhận frame trước
        perEnemyCooldownTimer: {}, // map enemy.id -> cooldown còn lại trước khi trigger lại được

        // --- Coordinated Attack config (snapshot lúc cast, ĐÚNG PATTERN decoy.explosionScaling) ---
        perEnemyCooldown: (cfg && typeof cfg.perEnemyCooldown === 'number') ? cfg.perEnemyCooldown : 2.0,
        coordinatedScaling: getTalentScaling(character, 'coordinatedAttack'),
        coordinatedImpact: getTalentImpact(character, 'coordinatedAttack'),
        element: (SKILL_LIBRARY[character.skillId] && SKILL_LIBRARY[character.skillId].element) || 'electro'
    };

    activeElectroEffects.push(effect);
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
            delete effect.perEnemyCooldownTimer[enemy.id];
            continue;
        }

        if (effect.perEnemyCooldownTimer[enemy.id] > 0) {
            effect.perEnemyCooldownTimer[enemy.id] -= dt;
        }

        const prevHp = effect.lastKnownHp[enemy.id];
        if (prevHp !== undefined && enemy.hp < prevHp) {
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

                spawnCombatSparks(enemy.position, pushDir);
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

        spawnCombatSparks(enemy.position, pushDir);
        if (!enemy.alive) spawnDeathParticles(enemy.position);
    }

    // Explosion VFX placeholder (spec mục 15) — quả cầu mở rộng nhanh rồi biến mất, TÁI DÙNG
    // spawnCombatSparks() đã có tại tâm nổ cho hiệu ứng bổ sung, không cần particle system riêng.
    // GIỮ NGUYÊN — Explosion VFX/SFX/camera shake luôn phát dù có hit Enemy hay không (spec mục 4 chỉ
    // nói về Energy Particle, KHÔNG nói về feedback hình ảnh/âm thanh của chính vụ nổ).
    spawnCombatSparks(decoy.position, new THREE.Vector3(0, 1, 0));
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
