// ============================================================
// ============================================================
// combat.js — Tách ra từ game.js
// Chứa: Plunge Attack (trigger + impact), Melee Attack thường (Soft Targeting +
// Attack Lunge), Elemental Skill (Tap = Pressure Shot / Hold = Aim Mode bắn tia
// nhỏ liên tục), Elemental Burst (Water Bubble + Vortex CC, thi triển ngay khi
// nhấn).
//
// QUAN TRỌNG VỀ THỨ TỰ LOAD: file này PHẢI load SAU game.js (không phải trước).
// Lý do: các hàm bên dưới dùng trực tiếp tên trần của nhiều biến/hằng số khai
// báo bằng const/let bên trong game.js (player, scene, camera, particles,
// enemies, sfx, cameraState, skillAimState, burstAimState, COMBAT_TIMING,
// SOFT_TARGETING_CONFIG, ELEMENTAL_SKILL_CONFIG, BURST_CONFIG,
// findSoftTargetingRotation, getGroundYForPosition, deactivateGlider...).
// Các biến này CHỈ tồn tại trong global scope SAU KHI game.js đã chạy xong
// (script chạy tuần tự, cùng global lexical scope vì không dùng type="module").
// Do đó thứ tự đúng trong index.html là:
//   comic.js -> vfx.js -> enemies.js -> game.js -> combat.js -> ui.js
//
// game.js NGƯỢC LẠI gọi một số hàm định nghĩa trong file này (updateSkillAim,
// updateSkillCooldown, updateBurst, triggerPlungeImpact, endBurstBubble,
// handleAttackInput, handleSkillKeyDown/Up, handleBurstKeyDown/Up) — điều này
// vẫn AN TOÀN dù combat.js load sau, vì các lời gọi đó nằm bên trong function
// body của game.js (updatePhysics/updateCombat/input handlers), chỉ thực sự
// thực thi lúc runtime (khi game loop chạy / khi có input), tức LUÔN sau khi
// mọi <script> tag (kể cả combat.js) đã load xong. Chỉ cần đảm bảo KHÔNG có
// code top-level (chạy ngay lúc parse) nào trong game.js gọi các hàm này.
//
// combat.js EXPORT ra window (để game.js gọi tới):
//   handleAttackInput, handleSkillKeyDown, handleSkillKeyUp, updateSkillAim,
//   updateSkillCooldown, triggerPlungeImpact, handleBurstKeyDown,
//   handleBurstKeyUp, endBurstBubble, updateBurst
// ============================================================

            function triggerPlungeAttack() {
                if (player.isPlunging || skillAimState.phase === 'aiming') return;
                if (player.isGliding) deactivateGlider();

                player.isPlunging = true;
                player.attackState = 'plunge';
                player.velocity.set(0, -26.0, 0); 
                player.inputVelocity.set(0, 0, 0);

                player.mesh.scale.set(0.75, 1.4, 0.75);
                player.sword.rotation.set(Math.PI, 0, 0);

                spawnPlungeTrailParticles();
                sfx.playSwing();
            }

            function triggerPlungeImpact() {
                player.isPlunging = false;
                player.attackState = 'idle';

                player.mesh.scale.set(1.4, 0.55, 1.4);
                player.landSquashTimer = 0.22;
                
                if (player.attackState === 'idle' && !player.isClimbing) {
                    player.sword.rotation.set((-Math.PI / 3) + player.mesh.children[0].rotation.x, 0, Math.PI / 10);
                }

                // --- SOFT TARGETING cho Plunge Attack: xoay hướng về địch gần nhất ngay lúc tiếp đất.
                // Lưu ý: Plunge gây damage theo bán kính (AOE) quanh điểm rơi, không phụ thuộc hướng nhìn
                // để trúng đòn — soft targeting ở đây chỉ mang tính thẩm mỹ/nhất quán trải nghiệm, không
                // ảnh hưởng việc có gây sát thương hay không.
                const softTarget = findSoftTargetingRotation(player.position, player.mesh.rotation.y);
                if (softTarget) {
                    player.softTargetLockY = softTarget.targetY;
                    player.softTargetLerpSpeed = softTarget.lerpSpeed;
                } else {
                    player.softTargetLockY = null;
                }

                const impactPos = player.position.clone();
                const plungeRadius = 4.0;
                // Pre-Alpha v0.7 — Core Stats: player.attack.plunge là MULTIPLIER (hệ số nhân ATK),
                // không phải "damage tuyệt đối" — enemy.takeDamage() tự tính Final Damage qua
                // calculateFinalDamage(player.stats.atk, enemy.stats.def, multiplier) bên trong.
                const plungeDamageMultiplier = player.attack.plunge; 

                enemies.forEach(enemy => {
                    if (!enemy.alive) return;
                    const d = impactPos.distanceTo(enemy.position);
                    if (d < plungeRadius) {
                        const pushDir = new THREE.Vector3().subVectors(enemy.position, impactPos);
                        pushDir.y = 0;
                        pushDir.normalize();
                        if (pushDir.lengthSq() === 0) pushDir.set(1, 0, 0);

                        enemy.takeDamage(plungeDamageMultiplier, pushDir, true); 

                        if (enemy.bodyMesh) {
                            enemy.mesh.scale.set(1.5, 0.38, 1.5);
                            enemy.hydroSquashTimer = 0.25;
                        }
                    }
                });

                spawnPlungeImpactVisuals(impactPos);
                sfx.playBurst();
                triggerHydroFlash();

                cameraState.shakeTimer = 0.42;
                cameraState.shakeIntensity = 0.55; 
            }
            window.triggerPlungeImpact = triggerPlungeImpact;

            function handleAttackInput() {
                if (player.isClimbing || player.isSwimming || player.isDrowning || player.isDead) return;
                if (!player.isGrounded) {
                    if (!player.isPlunging) {
                        const heightAboveGround = player.position.y - (player.height / 2) - getGroundYForPosition(player.position);
                        if (heightAboveGround > 2.1) {
                            triggerPlungeAttack();
                        }
                    }
                    return; 
                }
                triggerAttack();
            }
            window.handleAttackInput = handleAttackInput;

            function triggerAttack() {
                if (player.isDashing || player.isClimbing || player.isSwimming || player.isDrowning || skillAimState.phase === 'aiming') return;
                if (player.attackState !== 'idle') {
                    if (player.attackState === 'recovery' && player.attackTimer < 0.08) player.attackBuffered = true; 
                    return; 
                }
                player.attackState = 'windup';
                player.attackTimer = COMBAT_TIMING.windup;
                player.attackBuffered = false; player.hasHitList = []; 
                player.mesh.scale.set(1.18, 0.82, 1.18);
                
                player.sword.rotation.set(-Math.PI / 2.2, -Math.PI / 6, Math.PI / 6);
                sfx.playSwing();

                // --- SOFT TARGETING: chỉ tính 1 lần lúc bắt đầu đòn đánh, KHÔNG khóa mục tiêu liên tục.
                // Không đụng gì tới hướng camera/di chuyển — chỉ set góc đích để updatePhysics() lerp
                // player.mesh.rotation.y hướng tới trong lúc windup (xem xử lý trong updatePhysics).
                const softTarget = findSoftTargetingRotation(player.position, player.mesh.rotation.y);
                if (softTarget) {
                    player.softTargetLockY = softTarget.targetY;
                    player.softTargetLerpSpeed = softTarget.lerpSpeed;
                } else {
                    player.softTargetLockY = null; // Không có địch trong 4m -> giữ nguyên hướng hiện tại
                }
            }

            let skillCooldownTimer = 0.0;
            const SKILL_COOLDOWN_DURATION = 7.0;

            // Kiểm tra điều kiện tiên quyết chung để dùng Elemental Skill (giữ nguyên hành vi cũ).
            function canUseElementalSkill() {
                if (!player.isGrounded || player.isClimbing || player.isSwimming || player.isDrowning) return false;
                if (skillCooldownTimer > 0 || skillAimState.phase !== 'idle') return false;
                if (burstAimState.phase !== 'idle') return false;
                return true;
            }

            // --- BƯỚC 1: gọi lúc keydown/touchstart của phím skill. KHÔNG bắn gì ngay lập tức — chuyển
            // sang phase 'holding' để bắt đầu đếm thời gian giữ. Việc quyết định Tap hay Hold xảy ra ở
            // handleSkillKeyUp() hoặc khi updateSkillAim() phát hiện đã vượt ngưỡng holdThreshold.
            function handleSkillKeyDown() {
                if (!canUseElementalSkill()) return; // canUseElementalSkill() đã tự chặn nếu phase !== 'idle'
                skillAimState.phase = 'holding';
                skillAimState.heldTime = 0;
            }
            window.handleSkillKeyDown = handleSkillKeyDown;

            // --- BƯỚC 2: gọi lúc keyup/touchend. Nếu vẫn đang ở phase 'holding' (chưa vượt ngưỡng) ->
            // đây là Tap, bắn Pressure Shot ngay theo hướng nhân vật đang nhìn. Nếu đang ở phase 'aiming'
            // -> người chơi chủ động thả phím sớm, kết thúc Aim State bằng Pressure Shot theo crosshair.
            function handleSkillKeyUp() {
                if (skillAimState.phase === 'aiming') {
                    endSkillAim();
                } else if (skillAimState.phase === 'holding') {
                    // TAP: bắn Pressure Shot ngay theo hướng nhân vật đang nhìn, không qua Aim State.
                    // Nếu có địch trong vùng hỗ trợ Soft Targeting (SOFT_TARGETING_CONFIG), áp dụng
                    // luôn: hướng bắn nhắm thẳng tới mục tiêu ngay lập tức (không đợi animation xoay
                    // xong, vì Tap cần cảm giác tức thời), đồng thời nhân vật vẫn xoay hình ảnh mượt
                    // theo góc đó (giống hệt cách triggerAttack() áp dụng cho đòn đánh thường).
                    sfx.playSwing();

                    const softTarget = findSoftTargetingRotation(player.position, player.mesh.rotation.y);
                    let shotDir = null;
                    if (softTarget) {
                        player.softTargetLockY = softTarget.targetY;
                        player.softTargetLerpSpeed = softTarget.lerpSpeed;
                        shotDir = new THREE.Vector3(Math.sin(softTarget.targetY), 0, Math.cos(softTarget.targetY));
                    }

                    fireHydroBeam(shotDir);
                    skillCooldownTimer = SKILL_COOLDOWN_DURATION; // Tap: cooldown bắt đầu ngay lập tức
                    pulseSkillButton();
                    skillAimState.phase = 'idle';
                }
                // Nếu phase đã là 'idle' (VD keyup bị gọi trùng lặp do safety-net ở nơi khác), không làm gì.
            }
            window.handleSkillKeyUp = handleSkillKeyUp;

            function pulseSkillButton() {
                const btn = isMobile ? document.getElementById('mobile-skill-btn') : document.getElementById('desktop-skill-btn');
                if (btn) { btn.style.transform = 'scale(0.85)'; setTimeout(() => { btn.style.transform = ''; }, 100); }
            }

            // --- ENTER: chuyển sang phase 'aiming'. Chặn hoàn toàn di chuyển (không chặn camera), hiện
            // crosshair UI, reset các timer liên quan. KHÔNG kích hoạt cooldown — Hold chỉ vào cooldown
            // sau khi Aim State thực sự kết thúc (xem endSkillAim()).
            function startSkillAim() {
                skillAimState.phase = 'aiming';
                skillAimState.aimTimer = 0;
                skillAimState.fireTimer = 0;
                player.velocity.x = 0; player.velocity.z = 0; player.inputVelocity.set(0, 0, 0);
                if (window.setSkillAimUIVisible) window.setSkillAimUIVisible(true);
            }

            // --- UPDATE: gọi mỗi frame từ updateCombat(). Xử lý cả 2 phase 'holding' và 'aiming'.
            function updateSkillAim(dt) {
                if (skillAimState.phase === 'holding') {
                    skillAimState.heldTime += dt;
                    if (skillAimState.heldTime >= ELEMENTAL_SKILL_CONFIG.holdThreshold) {
                        startSkillAim();
                    }
                }

                if (skillAimState.phase !== 'aiming') {
                    // Không (còn) đang aim — lerp cameraOffsetT về 0 dần để camera trả lại vị trí bình
                    // thường mượt mà (không giật cứng) sau khi endSkillAim() vừa chuyển phase về 'idle'.
                    // An toàn khi gọi cả lúc offset đã là 0 (VD phase 'holding'/'idle' thông thường).
                    if (skillAimState.cameraOffsetT > 0) {
                        skillAimState.cameraOffsetT = Math.max(0, skillAimState.cameraOffsetT - (1 - Math.exp(-ELEMENTAL_SKILL_CONFIG.aim.cameraOffsetLerpSpeed * dt)));
                    }
                    return;
                }

                // --- AIM 3D: aimDir là hướng camera ĐẦY ĐỦ 3 TRỤC (X/Y/Z) — dùng làm hướng bắn cho tia
                // nhỏ, để người chơi ngắm lên cao/xuống thấp đều bắn trúng đúng hướng crosshair. facingDir
                // (chỉ XZ, Y=0) TÁCH RIÊNG chỉ dùng để xoay hình ảnh nhân vật (rotation.y) — nhân vật
                // không nên "cúi gập" theo trục dọc dù đang ngắm lên/xuống.
                const aimDir = new THREE.Vector3();
                camera.getWorldDirection(aimDir);
                if (aimDir.lengthSq() < 0.0001) aimDir.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
                aimDir.normalize();

                const facingDir = new THREE.Vector3(aimDir.x, 0, aimDir.z);
                if (facingDir.lengthSq() > 0.0001) {
                    facingDir.normalize();
                    player.mesh.rotation.y = Math.atan2(facingDir.x, facingDir.z);
                }
                // Nếu facingDir gần (0,0,0) (camera nhìn gần như thẳng đứng), giữ nguyên rotation.y hiện
                // tại của nhân vật — không cần fallback gán lại vì không dùng facingDir cho việc gì khác.

                // Lerp cameraOffsetT tăng dần về 1 (full aim camera: zoom + lệch) — mượt mà thay vì snap.
                skillAimState.cameraOffsetT = Math.min(1, skillAimState.cameraOffsetT + (1 - Math.exp(-ELEMENTAL_SKILL_CONFIG.aim.cameraOffsetLerpSpeed * dt)));

                skillAimState.aimTimer += dt;
                skillAimState.fireTimer -= dt;

                if (skillAimState.fireTimer <= 0) {
                    skillAimState.fireTimer = ELEMENTAL_SKILL_CONFIG.aim.fireInterval;
                    fireHydroProjectile(aimDir);
                }

                // Trần thời gian tối đa: tự động kết thúc dù người chơi vẫn đang giữ phím.
                if (skillAimState.aimTimer >= ELEMENTAL_SKILL_CONFIG.aim.maxDuration) {
                    endSkillAim();
                }
            }
            window.updateSkillAim = updateSkillAim;

            // --- EXIT: bắn Pressure Shot theo hướng camera hiện tại (= hướng crosshair), ẩn crosshair,
            // trả camera về bình thường, vào cooldown, trở lại phase 'idle' (điều khiển bình thường).
            function endSkillAim() {
                if (skillAimState.phase !== 'aiming') return;
                // AIM 3D: dùng đầy đủ hướng camera (cả trục Y) — Pressure Shot bắn đúng lên cao/xuống
                // thấp theo hướng crosshair, không còn giới hạn song song mặt đất.
                const camForward = new THREE.Vector3();
                camera.getWorldDirection(camForward);
                if (camForward.lengthSq() < 0.0001) camForward.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
                camForward.normalize();

                fireHydroBeam(camForward);

                skillAimState.phase = 'idle';
                skillAimState.aimTimer = 0;
                skillAimState.fireTimer = 0;
                skillCooldownTimer = SKILL_COOLDOWN_DURATION; // Hold: cooldown chỉ bắt đầu SAU khi kết thúc
                if (window.setSkillAimUIVisible) window.setSkillAimUIVisible(false);
                pulseSkillButton();
                // cameraOffsetT KHÔNG reset về 0 ngay — để updateSkillAim() lerp mượt về bình thường ở
                // các frame kế tiếp (xem nhánh "phase !== 'aiming'" phía trên).
            }

            function triggerElementalSkill() {
                // Giữ lại hàm này cho tương thích ngược (được gọi ở nơi khác nếu có) — hành vi mặc định
                // tương đương 1 Tap tức thời khi gọi trực tiếp mà không qua handleSkillKeyDown/Up.
                if (!canUseElementalSkill()) return;
                sfx.playSwing();
                fireHydroBeam();
                skillCooldownTimer = SKILL_COOLDOWN_DURATION;
                pulseSkillButton();
            }
            window.triggerElementalSkill = triggerElementalSkill;

            // Bắn 1 tia nước nhỏ (Aim State) — vẫn dùng hệ thống đạn bay chậm qua activeProjectiles/dt
            // như cũ, KHÔNG áp dụng cơ chế instant beam (đó là riêng của Pressure Shot, xem
            // fireHydroBeam() bên dưới). `customDir` (tùy chọn): hướng bắn world-space cố định, dùng khi
            // bắn theo hướng camera lúc Aim State. Nếu không truyền, mặc định bắn theo hướng nhân vật
            // đang nhìn (player.mesh.rotation.y).
            function fireHydroProjectile(customDir) {
                sfx.playHydroShot();

                const forward = customDir ? customDir.clone().normalize() : new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)).normalize();
                const spawnPosition = player.position.clone().addScaledVector(forward, 0.9);

                const projGeo = new THREE.SphereGeometry(0.15, 8, 8);
                const projMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.9 });
                const projMesh = new THREE.Mesh(projGeo, projMat);
                projMesh.position.copy(spawnPosition);
                scene.add(projMesh);

                const cfg = ELEMENTAL_SKILL_CONFIG.smallShot;
                // Pre-Alpha v0.7 — Core Stats: kết quả này là MULTIPLIER tổng hợp (hệ số attack.
                // hydroProjectile của player × hệ số riêng cfg.damage của loại đạn), KHÔNG phải damage
                // tuyệt đối — enemy.takeDamage() tự tính Final Damage qua calculateFinalDamage() bên
                // trong.
                activeProjectiles.push({
                    type: 'hydro_small', mesh: projMesh, dir: forward,
                    speed: cfg.speed, damage: player.attack.hydroProjectile * cfg.damage, maxRange: cfg.maxRange, distanceTraveled: 0,
                    spawnPosition: spawnPosition, beamMesh: null
                });
            }

            // --- PRESSURE SHOT: TIA ÁP SUẤT NƯỚC (instant beam / hitscan) ---
            // Không phải đạn bay theo thời gian — bắn ra là gây sát thương NGAY LẬP TỨC cho MỌI kẻ địch
            // còn sống nằm trên đường thẳng từ player tới maxRange (không chỉ 1 mục tiêu). Hình ảnh chỉ
            // là 1 hình trụ mảnh xuất hiện rồi biến mất rất nhanh (fadeDuration) — mô phỏng "tốc độ cực
            // nhanh, cảm giác gần như tức thời" thay vì mô phỏng đạn bay thật.
            // `customDir` (tùy chọn): hướng bắn world-space cố định, dùng khi bắn theo hướng camera.
            function fireHydroBeam(customDir) {
                sfx.playBurst();

                const forward = customDir ? customDir.clone().normalize() : new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)).normalize();
                const origin = player.position.clone().addScaledVector(forward, 0.9);
                const cfg = ELEMENTAL_SKILL_CONFIG.pressureShot;
                // Pre-Alpha v0.7 — Core Stats: MULTIPLIER tổng hợp, xem giải thích ở fireHydroProjectile().
                const damageMultiplier = player.attack.hydroProjectile * cfg.damage;

                // --- Tìm mọi enemy còn sống cắt ngang đường thẳng [origin, origin + forward*maxRange] ---
                // Chiếu vị trí enemy lên đường thẳng (projection scalar t), kiểm tra:
                //  1. t nằm trong đoạn [0, maxRange] (không tính enemy phía sau lưng hoặc quá xa)
                //  2. khoảng cách vuông góc từ enemy tới đường thẳng <= beamRadius + bán kính ước lượng enemy
                let beamEndDistance = cfg.maxRange; // Rút ngắn hình ảnh nếu bị chặn bởi obstacle (tính sau)
                const hitEnemies = [];
                for (let j = 0; j < enemies.length; j++) {
                    const enemy = enemies[j];
                    if (!enemy.alive) continue;
                    const toEnemy = new THREE.Vector3().subVectors(enemy.position, origin);
                    const t = toEnemy.dot(forward);
                    if (t < 0 || t > cfg.maxRange) continue;

                    const closestPoint = origin.clone().addScaledVector(forward, t);
                    const perpDist = enemy.position.distanceTo(closestPoint);
                    const enemyRadius = enemy.isLarge ? 1.4 : 0.8; // Ước lượng bán kính va chạm theo loại
                    if (perpDist <= cfg.beamRadius + enemyRadius) {
                        hitEnemies.push({ enemy, t });
                    }
                }
                // Sắp xếp theo khoảng cách gần -> xa (thứ tự gây damage không quan trọng về mặt logic,
                // nhưng giữ nhất quán/dễ debug hơn khi đọc log hoặc mở rộng sau này).
                hitEnemies.sort((a, b) => a.t - b.t);

                for (const { enemy, t } of hitEnemies) {
                    enemy.takeDamage(damageMultiplier, forward, true);
                    const hitPos = origin.clone().addScaledVector(forward, t);
                    spawnHydroSplash(hitPos, forward, true);
                    triggerHydroFlash();
                    sfx.playHydroSplash();
                    if (enemy.bodyMesh) {
                        enemy.mesh.scale.set(1.28, 0.55, 1.28);
                        enemy.hydroSquashTimer = 0.18;
                    }
                    player.skillHitCount++;
                    if (player.skillHitCount >= 6) {
                        player.skillHitCount = 0;
                        spawnEnergyParticles(enemy.position);
                    }
                    if (!enemy.alive) spawnDeathParticles(enemy.position);
                }

                // Kiểm tra obstacle chặn đường — nếu có, rút ngắn hình ảnh beam tại điểm chặn gần nhất
                // (không ảnh hưởng enemy đã tính damage phía trước điểm chặn, vì chúng ở gần hơn).
                for (let k = 0; k < obstacles.length; k++) {
                    const block = obstacles[k];
                    const rayForTest = { origin, dir: forward };
                    const hitDist = raycastAABBDistance(rayForTest, block.aabb);
                    if (hitDist !== null && hitDist < beamEndDistance) beamEndDistance = hitDist;
                }

                spawnHydroBeamVisual(origin, forward, beamEndDistance);

                // --- RECOIL: đẩy lùi nhẹ theo hướng NGƯỢC hướng bắn, trải đều qua recoilDuration ---
                // Dùng cùng cơ chế với Attack Lunge (cộng vào velocity mỗi frame trong updatePhysics,
                // KHÔNG cộng 1 lần vào velocity ở đây) — vì fireHydroBeam() được gọi từ updateCombat(),
                // chạy SAU updatePhysics() trong cùng frame nên impulse 1 lần sẽ bị input-movement ghi
                // đè mất tác dụng ngay ở frame kế tiếp (bug tương tự lunge cũ trước khi được sửa).
                player.recoilDir.copy(forward).multiplyScalar(-1);
                player.recoilRemainingDist = cfg.recoilDistance;
                player.recoilTimer = cfg.recoilDuration;

                cameraState.shakeTimer = 0.14; cameraState.shakeIntensity = 0.18;
            }

            // Raycast đơn giản tia-vs-AABB, trả về khoảng cách (t >= 0) tới điểm chạm gần nhất, hoặc null
            // nếu không cắt. Dùng thuật toán "slab method" chuẩn — đủ dùng cho obstacle dạng hộp hiện có.
            function raycastAABBDistance(ray, aabb) {
                let tmin = 0, tmax = Infinity;
                const origins = [ray.origin.x, ray.origin.y, ray.origin.z];
                const dirs = [ray.dir.x, ray.dir.y, ray.dir.z];
                const mins = [aabb.minX, aabb.minY, aabb.minZ];
                const maxs = [aabb.maxX, aabb.maxY, aabb.maxZ];
                for (let axis = 0; axis < 3; axis++) {
                    if (Math.abs(dirs[axis]) < 1e-8) {
                        if (origins[axis] < mins[axis] || origins[axis] > maxs[axis]) return null;
                    } else {
                        let t1 = (mins[axis] - origins[axis]) / dirs[axis];
                        let t2 = (maxs[axis] - origins[axis]) / dirs[axis];
                        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
                        tmin = Math.max(tmin, t1);
                        tmax = Math.min(tmax, t2);
                        if (tmin > tmax) return null;
                    }
                }
                return tmin;
            }

            // Hiệu ứng hình ảnh cho Pressure Shot: 1 hình trụ mảnh từ origin kéo dài `length` mét (tính
            // theo khoảng cách raycast thực tế của fireHydroBeam), fade rất nhanh (fadeDuration) rồi tự
            // hủy — KHÔNG di chuyển, không bay, chỉ xuất hiện rồi biến mất gần như ngay lập tức để mô
            // phỏng "tốc độ cực nhanh, cảm giác tức thời".
            function spawnHydroBeamVisual(origin, dir, length) {
                const cfg = ELEMENTAL_SKILL_CONFIG.pressureShot;
                const beamGeo = new THREE.CylinderGeometry(cfg.beamRadius * 0.7, cfg.beamRadius, Math.max(length, 0.01), 8);
                const beamMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.85 });
                const beamMesh = new THREE.Mesh(beamGeo, beamMat);

                // AIM 3D: CylinderGeometry mặc định có trục dài theo Y cục bộ — dùng quaternion để xoay
                // trục đó khớp với `dir` (bất kỳ hướng 3D nào, không chỉ quanh trục Y như Euler cũ) để
                // hình ảnh tia luôn đúng hướng thật (kể cả khi ngắm lên cao/xuống thấp).
                const cylinderUpAxis = new THREE.Vector3(0, 1, 0);
                beamMesh.quaternion.setFromUnitVectors(cylinderUpAxis, dir.clone().normalize());
                beamMesh.position.copy(origin).addScaledVector(dir, length / 2);
                scene.add(beamMesh);

                activeHydroBeamVisuals.push({ mesh: beamMesh, timer: cfg.fadeDuration, maxTimer: cfg.fadeDuration });

                // Vài hạt nước dọc theo tia lúc xuất hiện, tăng cảm giác "phun nước" thay vì chỉ 1 khối trơn.
                const segments = Math.max(3, Math.floor(length / 2));
                for (let s = 0; s < segments; s++) {
                    spawnHydroTrail(origin.clone().addScaledVector(dir, (length * (s + 0.5)) / segments));
                }
            }



            function updateSkillCooldown(dt) {
                const mOverlay = document.getElementById('mobile-cooldown-overlay'), mText = document.getElementById('mobile-cooldown-text');
                const dOverlay = document.getElementById('desktop-cooldown-overlay'), dText = document.getElementById('desktop-cooldown-text'), dRadial = document.getElementById('desktop-cooldown-radial');

                if (skillCooldownTimer > 0) {
                    skillCooldownTimer -= dt;
                    if (skillCooldownTimer < 0) skillCooldownTimer = 0;
                    const displaySec = Math.ceil(skillCooldownTimer);
                    const progress = skillCooldownTimer / SKILL_COOLDOWN_DURATION;

                    if (mOverlay && mText) { mOverlay.classList.remove('hidden'); mText.textContent = displaySec; }
                    if (dOverlay && dText) {
                        dOverlay.classList.remove('hidden'); dText.textContent = displaySec;
                        if (dRadial) {
                            const sweepDeg = (progress * 360).toFixed(1);
                            dRadial.style.opacity = '1'; dRadial.style.background = `conic-gradient(transparent ${(360 - sweepDeg)}deg, rgba(34,211,238,0.45) ${(360 - sweepDeg)}deg)`;
                            dRadial.style.border = 'none'; dRadial.style.borderRadius = '12px';
                        }
                    }
                } else {
                    if (mOverlay) mOverlay.classList.add('hidden');
                    if (dOverlay) dOverlay.classList.add('hidden');
                    if (dRadial) { dRadial.style.opacity = '0'; dRadial.style.background = ''; }
                }
            }
            window.updateSkillCooldown = updateSkillCooldown;

            // --- TƯƠNG TÁC VỚI VẬT THỂ GẦN NHẤT (phím F / click / tap) ---
            // interactWithNearbyObject() và onEnemyKilled() đã chuyển lên gần khu vực khai báo
            // activeQuests/interactables (đầu file) để combat.js có thể tách thành 1 khối liền mạch.

            function pulseBurstButton() {
                const btn = document.getElementById(isMobile ? 'mobile-burst-btn' : 'desktop-burst-btn');
                if (btn) { btn.style.transform = 'scale(0.85)'; setTimeout(() => { btn.style.transform = ''; }, 120); }
            }

            // Điều kiện tiên quyết chung để dùng Burst (năng lượng đầy, không đang trong trạng thái
            // khóa hành động khác, chưa có bubble nào đang hoạt động, chưa đang trong Aim State khác).
            function canUseBurst() {
                if (!player.isGrounded || player.isClimbing || player.isSwimming || player.isDrowning) return false;
                if (player.energy < player.maxEnergy) return false;
                if (player.isBursting) return false;
                if (burstAimState.phase !== 'idle') return false;
                if (skillAimState.phase !== 'idle') return false;
                return true;
            }

            // --- Burst: thi triển NGAY khi nhấn (không còn Hold/Aim Mode, không crosshair) ---
            // Chỉ cần nhấn là tìm mục tiêu gần nhất trong phạm vi hỗ trợ (Soft Targeting), xoay nhân
            // vật về phía đó, phóng ngay. Nếu không có mục tiêu hợp lệ, phóng theo hướng hiện tại của
            // nhân vật — KHÔNG Hard Lock-On, giống hệt hành vi Tap cũ.
            function handleBurstKeyDown() {
                if (!canUseBurst()) return;

                const softTarget = findSoftTargetingRotation(player.position, player.mesh.rotation.y);
                let dir;
                if (softTarget) {
                    player.softTargetLockY = softTarget.targetY;
                    player.softTargetLerpSpeed = softTarget.lerpSpeed;
                    dir = new THREE.Vector3(Math.sin(softTarget.targetY), 0, Math.cos(softTarget.targetY));
                } else {
                    dir = new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
                }
                launchBurstBubble(dir);
            }
            window.handleBurstKeyDown = handleBurstKeyDown;

            // Giữ hàm này (được gọi từ input handler khi nhả phím) làm no-op có chủ đích: Burst giờ
            // thi triển hoàn toàn ở keydown, không còn phase 'holding'/'aiming' nào cần xử lý ở đây.
            function handleBurstKeyUp() {}
            window.handleBurstKeyUp = handleBurstKeyUp;

            // startBurstAim / updateBurstAim / endBurstAim đã được loại bỏ — Burst không còn Aim Mode,
            // thi triển ngay khi nhấn (xem handleBurstKeyDown ở trên).

            // Tạo Water Bubble + Water Vortex bao quanh, phóng theo hướng `dir` (Vector3, world-space,
            // chỉ XZ). Bubble di chuyển LIÊN TỤC theo hướng này cho tới khi hết lifetime hoặc maxRange —
            // không đứng yên. Vortex là vùng lực hút thực sự (không phải trang trí), xem updateBurst().
            function launchBurstBubble(dir) {
                if (!canUseBurst()) return;
                const forward = dir.clone(); forward.y = 0;
                if (forward.lengthSq() < 0.0001) forward.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
                forward.normalize();

                player.energy = 0; sfx.playBurst();
                player.mesh.scale.set(1.22, 0.72, 1.22);

                const burstGroup = new THREE.Group();
                const cfg = BURST_CONFIG.bubble;

                // Lõi Bubble — khối nước "sống", phồng/co nhẹ mỗi frame trong updateBurst().
                const innerGeo = new THREE.SphereGeometry(cfg.radius * 0.72, 16, 12);
                const innerMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.85 });
                burstGroup.add(new THREE.Mesh(innerGeo, innerMat));

                // Lớp ngoài mờ — gợi ý vùng vortex bằng hình ảnh (bán kính lớn hơn lõi, không phải hitbox).
                const outerGeo = new THREE.SphereGeometry(cfg.radius, 16, 12);
                const outerMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.20 });
                burstGroup.add(new THREE.Mesh(outerGeo, outerMat));

                // Water Vortex — vòng xoáy quanh Bubble, xoay liên tục để tạo cảm giác "đang điều khiển
                // dòng nước xung quanh". Đây CHỈ LÀ HÌNH ẢNH; vùng lực hút thực tế là BURST_CONFIG.vortex.radius,
                // tách biệt khỏi kích thước hình ảnh này (placeholder Pre-Alpha, có thể phóng to sau).
                const vortexRingA = new THREE.Mesh(
                    new THREE.TorusGeometry(cfg.radius * 1.35, 0.05, 8, 32),
                    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65 })
                );
                vortexRingA.rotation.x = Math.PI / 2;
                burstGroup.add(vortexRingA);

                const vortexRingB = new THREE.Mesh(
                    new THREE.TorusGeometry(cfg.radius * 1.7, 0.04, 8, 32),
                    new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.45 })
                );
                vortexRingB.rotation.x = Math.PI / 2;
                burstGroup.add(vortexRingB);

                burstGroup.position.copy(player.position).addScaledVector(forward, 1.2);
                burstGroup.position.y = player.position.y;
                scene.add(burstGroup);

                player.isBursting = true;
                player.burstSphere = burstGroup;
                player.burstDir = forward;
                player.burstDistTraveled = 0;
                player.burstRotTimer = 0;
                player.burstLifeTimer = 0;
                player.burstHitCooldowns = {};
                // Theo dõi quái to đang bị stagger (khựng) để duy trì hiệu ứng sau khi rời vortex —
                // key = enemy.id, value = thời gian (giây) còn lại của stagger.
                player.burstStaggeredEnemies = {};

                pulseBurstButton();
            }

            // Kết thúc Burst hiện tại: hiệu ứng tan biến nhỏ tại vị trí cuối, dọn dẹp mesh, thả toàn bộ
            // enemy đang bị stagger còn sót lại (không giữ khựng vĩnh viễn nếu Bubble biến mất giữa chừng).
            function endBurstBubble() {
                if (!player.burstSphere) return;
                const bPos = player.burstSphere.position.clone();
                const impGeo = new THREE.RingGeometry(0.3, 0.55, 20);
                const impMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
                const impMesh = new THREE.Mesh(impGeo, impMat);
                impMesh.position.copy(bPos); impMesh.rotation.x = Math.PI / 2; scene.add(impMesh);
                particles.push({ mesh: impMesh, velocity: new THREE.Vector3(0, 0, 0), life: 0.25, maxLife: 0.25, scaleUp: true, growthRate: 8 });

                scene.remove(player.burstSphere);
                player.burstSphere.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); });
                player.burstSphere = null;
                player.isBursting = false;
            }
            window.endBurstBubble = endBurstBubble;

            function updateBurst(dt) {
                if (!player.isBursting || !player.burstSphere) return;
                const cfg = BURST_CONFIG;
                // Pre-Alpha v0.7 — Core Stats: MULTIPLIER tổng hợp (xem giải thích ở fireHydroProjectile()).
                const damageMultiplier = player.attack.burst * cfg.damage;

                // --- DI CHUYỂN LIÊN TỤC: Bubble không bao giờ đứng yên, luôn trôi theo hướng đã chọn ---
                player.burstRotTimer += dt;
                player.burstLifeTimer += dt;
                const bob = Math.sin(player.burstRotTimer * cfg.bubble.pulseSpeed) * cfg.bubble.pulseAmount;
                player.burstSphere.position.addScaledVector(player.burstDir, cfg.bubble.speed * dt);
                player.burstSphere.position.y = player.position.y + bob * 2.0; // Bob nhẹ theo trục Y cho cảm giác "nổi"
                player.burstDistTraveled += cfg.bubble.speed * dt;

                if (Math.random() < 0.3) spawnBurstTrail(player.burstSphere.position);

                // --- HIỆU ỨNG "KHỐI NƯỚC SỐNG": phồng/co nhẹ lõi Bubble, Vortex xoay liên tục ---
                const pulseScale = 1.0 + Math.sin(player.burstRotTimer * cfg.bubble.pulseSpeed) * cfg.bubble.pulseAmount;
                const innerMesh = player.burstSphere.children[0];
                const outerMesh = player.burstSphere.children[1];
                const vortexRingA = player.burstSphere.children[2];
                const vortexRingB = player.burstSphere.children[3];
                if (innerMesh) innerMesh.scale.setScalar(pulseScale);
                if (outerMesh) outerMesh.scale.setScalar(1.0 + Math.sin(player.burstRotTimer * cfg.bubble.pulseSpeed * 0.7) * (cfg.bubble.pulseAmount * 0.6));
                if (vortexRingA) vortexRingA.rotation.z += dt * cfg.vortex.rotationSpeed;
                if (vortexRingB) vortexRingB.rotation.z -= dt * cfg.vortex.rotationSpeed * 0.65;

                // Fade dần theo tiến độ (khoảng cách hoặc thời gian, tùy cái nào gần hết trước).
                const rangeFade = Math.max(0, 1.0 - (player.burstDistTraveled / cfg.bubble.maxRange));
                const lifeFade = Math.max(0, 1.0 - (player.burstLifeTimer / cfg.bubble.lifetime));
                const fade = Math.min(rangeFade, lifeFade);
                if (innerMesh) innerMesh.material.opacity = 0.85 * fade;
                if (outerMesh) outerMesh.material.opacity = 0.20 * fade;
                if (vortexRingA) vortexRingA.material.opacity = 0.65 * fade;
                if (vortexRingB) vortexRingB.material.opacity = 0.45 * fade;

                const bPos = player.burstSphere.position;
                if (!player.burstHitCooldowns) player.burstHitCooldowns = {};
                if (!player.burstStaggeredEnemies) player.burstStaggeredEnemies = {};

                // --- CROWD CONTROL: Water Vortex hút quái trong phạm vi vortex.radius ---
                // Quái nhỏ: lực hút từ từ (KHÔNG teleport) — cộng vào velocity mỗi frame, tạo cảm giác
                // bị dòng nước kéo dần về phía Bubble. Quái to: KHÔNG bị hút hoàn toàn, chỉ giảm tốc độ
                // di chuyển hiện có (slowFactor) — khựng lại/gián đoạn chuyển động trong thời gian ngắn,
                // duy trì hiệu ứng đó thêm staggerDuration giây SAU KHI rời khỏi vortex.
                for (let i = 0; i < enemies.length; i++) {
                    const enemy = enemies[i];
                    if (!enemy.alive) continue;
                    const distToBubble = bPos.distanceTo(enemy.position);

                    if (distToBubble <= cfg.vortex.radius) {
                        if (enemy.isLarge) {
                            // Khựng: áp trực tiếp hệ số giảm tốc lên velocity ngang hiện tại của enemy,
                            // và refresh timer stagger để duy trì hiệu ứng sau khi rời vortex.
                            enemy.velocity.x *= cfg.pull.largeEnemySlowFactor;
                            enemy.velocity.z *= cfg.pull.largeEnemySlowFactor;
                            if (enemy.jumpVelocity) {
                                enemy.jumpVelocity.x *= cfg.pull.largeEnemySlowFactor;
                                enemy.jumpVelocity.z *= cfg.pull.largeEnemySlowFactor;
                            }
                            player.burstStaggeredEnemies[enemy.id] = cfg.pull.largeEnemyStaggerDuration;
                        } else {
                            // Hút từ từ về phía tâm Bubble — cộng thêm vào velocity (không ghi đè), để
                            // vẫn tương thích với collision/knockback hiện có của enemy.
                            const pullDir = new THREE.Vector3().subVectors(bPos, enemy.position);
                            pullDir.y = 0;
                            if (pullDir.lengthSq() > 0.0001) {
                                pullDir.normalize();
                                enemy.velocity.x += pullDir.x * cfg.pull.smallEnemyForce * dt * 10;
                                enemy.velocity.z += pullDir.z * cfg.pull.smallEnemyForce * dt * 10;
                            }
                        }
                    } else if (enemy.isLarge && player.burstStaggeredEnemies[enemy.id] > 0) {
                        // Đã rời vortex nhưng vẫn còn trong thời gian gián đoạn chuyển động — tiếp tục
                        // giảm tốc nhẹ hơn dần cho tới khi hết staggerDuration.
                        enemy.velocity.x *= cfg.pull.largeEnemySlowFactor;
                        enemy.velocity.z *= cfg.pull.largeEnemySlowFactor;
                    }

                    // --- DAMAGE: chỉ khi enemy lọt vào LÕI Bubble (bubble.radius), tách biệt khỏi CC ---
                    const cooldownKey = enemy.id;
                    if (player.burstHitCooldowns[cooldownKey] > 0) {
                        player.burstHitCooldowns[cooldownKey] -= dt;
                    } else if (distToBubble < cfg.bubble.radius + (enemy.width * 0.5)) {
                        const pushDir = new THREE.Vector3().subVectors(enemy.position, bPos);
                        pushDir.y = 0;
                        if (pushDir.lengthSq() < 0.0001) pushDir.set(1, 0, 0); else pushDir.normalize();

                        enemy.takeDamage(damageMultiplier, pushDir, true);
                        spawnHydroSplash(bPos.clone(), pushDir, true);
                        triggerHydroFlash();
                        sfx.playHydroSplash();

                        if (enemy.bodyMesh) { enemy.mesh.scale.set(1.4, 0.45, 1.4); enemy.hydroSquashTimer = 0.22; }
                        cameraState.shakeTimer = 0.20; cameraState.shakeIntensity = 0.28;
                        if (!enemy.alive) spawnDeathParticles(enemy.position);
                        player.burstHitCooldowns[cooldownKey] = cfg.damageTickInterval;
                    }
                }

                // Đếm lùi và dọn dẹp timer stagger của quái to đã rời vortex quá lâu.
                for (const key in player.burstStaggeredEnemies) {
                    player.burstStaggeredEnemies[key] -= dt;
                    if (player.burstStaggeredEnemies[key] <= 0) delete player.burstStaggeredEnemies[key];
                }
                for (const key in player.burstHitCooldowns) { if (player.burstHitCooldowns[key] < 0) player.burstHitCooldowns[key] = 0; }

                // Kết thúc khi hết quãng đường tối đa HOẶC hết thời gian tồn tại — cái nào tới trước.
                if (player.burstDistTraveled >= cfg.bubble.maxRange || player.burstLifeTimer >= cfg.bubble.lifetime) {
                    endBurstBubble();
                }
            }
            window.updateBurst = updateBurst;

            // updateBurstUI() đã chuyển sang ui.js
