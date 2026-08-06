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
                        if (heightAboveGround > 2.6) {
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

                    // BUGFIX (Pre-Alpha Stabilization — Soft Target khi đang di chuyển): dùng góc từ
                    // HƯỚNG CAMERA thay vì player.mesh.rotation.y làm tâm "hình nón phía trước" của Soft
                    // Targeting. rotation.y được lerp mượt dần theo hướng di chuyển (xem updatePhysics(),
                    // khối "HỆ THỐNG PROCEDURAL ANIMATION") nên tại đúng thời điểm bấm skill trong lúc
                    // đang di chuyển, nó là 1 giá trị TRUNG GIAN đang "đuổi theo" hướng joystick/AWSD với
                    // độ trễ — không phản ánh đúng hướng người chơi thực sự muốn ngắm tới. Hệ quả cũ: địch
                    // ở tier 2/3 (giới hạn góc ±120°/±72°) dễ bị tính lệch ra ngoài "hình nón" và bị loại
                    // sai, khiến findSoftTargetingRotation() trả về null, hàm gọi fallback về hướng di
                    // chuyển (đúng triệu chứng bug đã xác nhận). Hướng camera là giá trị TỨC THỜI, ổn
                    // định, không bị trễ animation — quyết định đã chốt: dùng camera, KHÔNG dùng
                    // inputVelocity, đồng bộ với cách Aim Mode xác định hướng ngắm.
                    const camForwardForSoftTarget = new THREE.Vector3();
                    camera.getWorldDirection(camForwardForSoftTarget);
                    const softTargetFacingAngle = (camForwardForSoftTarget.x === 0 && camForwardForSoftTarget.z === 0)
                        ? player.mesh.rotation.y // Camera nhìn thẳng đứng (hiếm, XZ suy biến) — fallback an toàn
                        : Math.atan2(camForwardForSoftTarget.x, camForwardForSoftTarget.z);

                    const softTarget = findSoftTargetingRotation(player.position, softTargetFacingAngle);
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

                // --- AIM 3D: aimDir là hướng CAMERA thô (3 trục X/Y/Z) — vẫn cần giữ lại làm fallback
                // (facing gần thẳng đứng) và làm gốc tính provisionalSpawn bên dưới, y hệt trước đây.
                const aimDir = new THREE.Vector3();
                camera.getWorldDirection(aimDir);
                if (aimDir.lengthSq() < 0.0001) aimDir.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
                aimDir.normalize();

                // --- HƯỚNG XOAY NHÂN VẬT: TRƯỚC ĐÂY xoay theo aimDir (hướng camera thô) — nhưng đạn
                // THẬT SỰ bay theo correctedDir (từ vị trí spawn trên người nhân vật TỚI điểm crosshair
                // raycast trúng, xem nhánh bắn phía dưới), 2 hướng này KHÔNG song song (origin đạn ở
                // thân player, camera ở xa phía sau/trên — bug đã note ở nhánh bắn). Điều chỉnh: raycast
                // MỖI FRAME (không chỉ lúc fireTimer <= 0) để lấy đúng điểm ngắm hiện tại, tính lại
                // correctedDir kiểu tương tự, rồi xoay nhân vật theo correctedDir đó — để hình ảnh nhân
                // vật khớp ĐÚNG hướng skill sắp/đang phóng ra, không phải hướng camera.
                const provisionalSpawnForFacing = player.position.clone().addScaledVector(aimDir, 0.9);
                const crosshairAimResult = raycastFromCrosshair();
                const facingShotDir = crosshairAimResult.point.clone().sub(provisionalSpawnForFacing);
                if (facingShotDir.lengthSq() > 0.0001) facingShotDir.normalize(); else facingShotDir.copy(aimDir);

                const facingDir = new THREE.Vector3(facingShotDir.x, 0, facingShotDir.z);
                if (facingDir.lengthSq() > 0.0001) {
                    facingDir.normalize();
                    player.mesh.rotation.y = Math.atan2(facingDir.x, facingDir.z);

                    // BUGFIX (Pre-Alpha Stabilization — Dash hướng sai sau Aim Mode): đồng bộ
                    // lastMovementDirection theo ĐÚNG hướng player.mesh vừa xoay tới (nay là hướng skill
                    // phóng ra, không còn là hướng camera thô) trong Aim Mode. Trước đây, input di
                    // chuyển bị khóa hoàn toàn trong lúc Aim (xem startSkillAim(): velocity.x/z = 0) nên
                    // lastMovementDirection KHÔNG được cập nhật ở khối input-movement thường
                    // (updatePhysics(), chỉ chạy khi có hasMovementInput) — nó bị "đóng băng" ở hướng di
                    // chuyển CUỐI CÙNG trước khi vào Aim. Hệ quả: nếu người chơi thoát Aim rồi Dash ngay
                    // mà không giữ AWSD/joystick, triggerDash() (06-camps-save-system.js) rơi vào nhánh
                    // fallback dùng lastMovementDirection cũ đó — bắn SAI hướng, lệch với hướng nhân vật
                    // vừa xoay tới lúc Aim. Cập nhật ở đây mỗi frame trong Aim Mode để
                    // lastMovementDirection luôn phản ánh đúng hướng player.mesh hiện tại.
                    player.lastMovementDirection.copy(facingDir);
                }
                // Nếu facingDir gần (0,0,0) (điểm ngắm gần như thẳng trên/dưới vị trí spawn), giữ nguyên
                // rotation.y hiện tại của nhân vật — không cần fallback gán lại vì không dùng facingDir
                // cho việc gì khác.

                // Lerp cameraOffsetT tăng dần về 1 (full aim camera: zoom + lệch) — mượt mà thay vì snap.
                skillAimState.cameraOffsetT = Math.min(1, skillAimState.cameraOffsetT + (1 - Math.exp(-ELEMENTAL_SKILL_CONFIG.aim.cameraOffsetLerpSpeed * dt)));

                skillAimState.aimTimer += dt;
                skillAimState.fireTimer -= dt;

                if (skillAimState.fireTimer <= 0) {
                    skillAimState.fireTimer = ELEMENTAL_SKILL_CONFIG.aim.fireInterval;
                    // --- CROSSHAIR ALIGNMENT: dùng LẠI facingShotDir đã raycast ở trên (khối xoay nhân
                    // vật, chạy mỗi frame) thay vì raycast lại lần nữa ở đây — vừa tránh raycast trùng
                    // trong cùng 1 frame, vừa đảm bảo hướng đạn bắn ra LUÔN khớp tuyệt đối với hướng
                    // player.mesh đang xoay tới (yêu cầu: nhân vật quay theo đúng hướng skill phóng ra).
                    fireHydroProjectile(facingShotDir);
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

                // --- CROSSHAIR ALIGNMENT: cùng kỹ thuật như updateSkillAim() — raycast từ camera lấy
                // điểm đích thật, rồi tính lại hướng bắn từ điểm SPAWN (không đổi vị trí spawn) tới đúng
                // điểm đó, thay vì bắn song song hướng camera (nguồn gốc bug lệch Crosshair đã xác định
                // trong lịch sử trò chuyện — origin ở thân player, camera thật ở xa phía sau/trên).
                const aimResult = raycastFromCrosshair();
                const provisionalOrigin = player.position.clone().addScaledVector(camForward, 0.9);
                const correctedForward = aimResult.point.clone().sub(provisionalOrigin);
                if (correctedForward.lengthSq() > 0.0001) correctedForward.normalize(); else correctedForward.copy(camForward);

                fireHydroBeam(correctedForward);

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

            // --- AIM MODE & CROSSHAIR ALIGNMENT (Pre-Alpha Stabilization) ---
            // raycastFromCrosshair(): bắn 1 tia THẬT từ VỊ TRÍ CAMERA (không phải player.position) theo
            // đúng hướng camera đang nhìn — đây chính là "đường ngắm" mà Crosshair (chấm giữa màn hình)
            // đại diện.
            //
            // BUGFIX (mở rộng phạm vi raycast): TRƯỚC ĐÂY chỉ quét thủ công 2 mảng cố định — obstacles
            // (AABB va chạm) và enemies (bán kính ước lượng hình cầu) — nên KHÔNG bắt được bất kỳ mesh
            // nào khác không nằm trong 2 mảng đó (mặt đất/ground, cây/đá trang trí từ
            // createEnvironmentProps(), signpost, hàng rào spawn...), vì các mesh này chỉ scene.add()
            // thẳng, không có AABB va chạm đăng ký riêng. Thay bằng THREE.Raycaster THẬT, quét trực tiếp
            // scene.children (recursive) — tự động bắt được MỌI mesh có geometry thật đang tồn tại
            // trong scene, không cần đăng ký thủ công từng loại object vào từng mảng riêng như trước.
            //
            // Loại trừ khỏi kết quả raycast (những thứ KHÔNG nên chặn đường ngắm của chính người chơi):
            //   - player.mesh và toàn bộ mesh con của nó (không thể tự chặn tia ngắm của chính mình).
            //   - THREE.InstancedMesh (cỏ — grassMesh) — phủ dày đặc khắp map, nếu để chặn tia thì
            //     crosshair sẽ luôn dừng lại ở khoảng cách rất gần bất cứ đâu có cỏ, phá hỏng hoàn toàn
            //     khả năng ngắm xa. Cỏ thuần tuý là chi tiết hình ảnh, không có ý nghĩa va chạm — loại
            //     TRƯỚC khi gọi intersectObjects() (không phải lọc kết quả sau) để tránh lãng phí raycast
            //     lên hàng nghìn instance mỗi frame trong lúc Aim (xem raycastFromCrosshair() bên dưới).
            //   - Mesh thuộc hiệu ứng tạm thời của CHÍNH Elemental Skill (activeProjectiles đã bắn ra,
            //     activeHydroBeamVisuals) — tránh trường hợp viên đạn/tia nước vừa bắn ra trước đó (còn
            //     đang bay/còn hiệu ứng fade) lại tự chặn đường ngắm của phát bắn tiếp theo.
            //   - THREE.Sprite (thanh máu enemy...) — luôn xoay mặt về camera, là lớp UI overlay chứ
            //     không phải hình khối thật của thế giới. Cần crosshairRaycaster.camera (set 1 lần bên
            //     dưới) để Three.js không throw lỗi khi raycast chạm phải Sprite.
            //
            // Trả về { point: THREE.Vector3, distance: number, hitEnemy: Enemy | null }:
            //   - Trúng vật gì đó: point = điểm va chạm gần nhất trên toàn bộ tia.
            //   - Không trúng gì: point = điểm ảo cách camera 700m theo hướng nhìn (nằm giữa khoảng
            //     500-1000m theo spec) — đủ xa để coi như "vô cực" nhưng vẫn là số hữu hạn, tránh NaN/
            //     Infinity lan sang các phép tính hướng bay phía sau.
            //   - hitEnemy: tham chiếu Enemy nếu mesh trúng gần nhất thuộc về đúng 1 enemy còn sống (dò
            //     ngược từ mesh bị trúng lên tới enemy.mesh gần nhất trong chuỗi cha — enemy.mesh là 1
            //     THREE.Group nên tia có thể trúng bất kỳ mesh con nào bên trong nó, không chỉ chính nó).
            const CROSSHAIR_RAYCAST_MAX_DISTANCE = 700;
            const crosshairRaycaster = new THREE.Raycaster();
            crosshairRaycaster.far = CROSSHAIR_RAYCAST_MAX_DISTANCE;
            // BUGFIX: scene chứa THREE.Sprite (hpBarBg/hpBarFill, con của enemy.mesh — xem enemies.js)
            // — Three.js BẮT BUỘC raycaster.camera phải được set trước khi raycast trúng bất kỳ Sprite
            // nào (sprite luôn xoay mặt về camera nên cần biết camera để tính đúng mặt phẳng của nó),
            // nếu không sẽ throw "Raycaster.camera needs to be set" thay vì bỏ qua êm.
            //
            // BUGFIX #2 (lỗi tái diễn lúc bấm Elemental Skill lần đầu): KHÔNG được gán
            // crosshairRaycaster.camera = camera Ở ĐÂY (top-level, chạy ngay lúc combat.js được load).
            // Biến `camera` chỉ THỰC SỰ được gán new THREE.PerspectiveCamera(...) bên trong initThree()
            // (04-scene-init.js) — hàm này chỉ chạy SAU KHI người chơi bấm Start ở Opening/Title Screen
            // (window.startGameplay()), KHÔNG chạy ngay lúc script load. Tại thời điểm dòng top-level
            // này từng chạy trước đây, `camera` vẫn còn undefined (đã khai báo nhưng chưa gán) —
            // crosshairRaycaster.camera bị gán undefined vĩnh viễn (KHÔNG BAO GIỜ được gán lại sau đó),
            // nên raycast trúng Sprite vẫn throw lỗi y hệt dù `camera` thật đã tồn tại từ lâu vào lúc đó.
            // Sửa: gán lại crosshairRaycaster.camera = camera MỖI LẦN raycastFromCrosshair() chạy (xem
            // bên trong hàm) — cùng cách camOrigin/camDir cũng đọc `camera` bên trong hàm, không phải
            // top-level.

            // Dò object bị trúng có thuộc về 1 Enemy còn sống hay không — leo ngược lên cây cha (mesh
            // trúng có thể là 1 sub-mesh nằm sâu bên trong enemy.mesh, VD phần thân/mắt riêng biệt).
            function findOwningEnemy(hitObject) {
                for (let i = 0; i < enemies.length; i++) {
                    const enemy = enemies[i];
                    if (!enemy.alive || !enemy.mesh) continue;
                    let node = hitObject;
                    while (node) {
                        if (node === enemy.mesh) return enemy;
                        node = node.parent;
                    }
                }
                return null;
            }

            function raycastFromCrosshair() {
                const camOrigin = new THREE.Vector3();
                camera.getWorldPosition(camOrigin);
                const camDir = new THREE.Vector3();
                camera.getWorldDirection(camDir);
                if (camDir.lengthSq() < 0.0001) camDir.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
                camDir.normalize();

                // Gán LẠI mỗi lần gọi (xem BUGFIX #2 ở khai báo crosshairRaycaster phía trên) — đảm bảo
                // luôn dùng đúng camera THẬT đã được initThree() khởi tạo, không phải giá trị undefined
                // còn sót lại từ lúc combat.js mới load script (trước khi initThree() từng chạy).
                crosshairRaycaster.camera = camera;
                crosshairRaycaster.set(camOrigin, camDir);
                // Lọc BỎ InstancedMesh (cỏ) TRƯỚC KHI gọi intersectObjects() — không phải sau khi có kết
                // quả. Three.js raycast lên InstancedMesh phải tự kiểm tra TỪNG instance riêng lẻ (cỏ có
                // thể lên tới hàng nghìn instance, xem createGrassBlades()), nên nếu lọc SAU (như bản
                // đầu tiên) vẫn tốn chi phí tính toán ray-instance cho toàn bộ cỏ mỗi frame trong lúc
                // Aim dù kết quả bị vứt bỏ ngay sau đó. Lọc TRƯỚC giúp Three.js không bao giờ phải chạm
                // tới InstancedMesh này trong quá trình raycast.
                const raycastTargets = scene.children.filter(obj => !obj.isInstancedMesh);
                const hits = crosshairRaycaster.intersectObjects(raycastTargets, true);

                let closestDist = CROSSHAIR_RAYCAST_MAX_DISTANCE;
                let hitEnemy = null;

                for (let i = 0; i < hits.length; i++) {
                    const hit = hits[i];
                    if (hit.distance >= closestDist) break; // hits[] đã sắp xếp tăng dần theo distance

                    // Loại trừ player.mesh (và mesh con của nó) — không thể tự chặn tia ngắm của mình.
                    let isPlayerMesh = false;
                    let node = hit.object;
                    while (node) {
                        if (node === player.mesh) { isPlayerMesh = true; break; }
                        node = node.parent;
                    }
                    if (isPlayerMesh) continue;

                    // Loại trừ TOÀN BỘ THREE.Sprite (VD hpBarBg/hpBarFill của enemy, xem enemies.js) —
                    // sprite trong game này luôn là lớp UI overlay (thanh máu luôn xoay mặt về camera),
                    // không phải hình khối THẬT của thế giới, nên không có ý nghĩa chặn đường ngắm.
                    // Không liệt kê tên cụ thể từng sprite để không bị lệch nếu sau này thêm loại sprite
                    // khác (VD damage number) — mọi Sprite đều bị loại như nhau.
                    if (hit.object.isSprite) continue;

                    // Loại trừ hiệu ứng tạm thời của chính Elemental Skill (đạn/tia nước đang bay/fade).
                    // Cả projMesh (activeProjectiles) và beamMesh (activeHydroBeamVisuals) đều là
                    // THREE.Mesh đơn giản không có mesh con, nên so khớp trực tiếp là đủ.
                    const isOwnSkillEffect =
                        activeProjectiles.some(p => p.mesh === hit.object) ||
                        activeHydroBeamVisuals.some(b => b.mesh === hit.object);
                    if (isOwnSkillEffect) continue;

                    closestDist = hit.distance;
                    hitEnemy = findOwningEnemy(hit.object);
                }

                const point = camOrigin.clone().addScaledVector(camDir, closestDist);
                return { point, distance: closestDist, hitEnemy };
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

                // BUGFIX (Pre-Alpha Stabilization — Soft Target khi đang di chuyển): cùng lý do và cách
                // sửa như handleSkillKeyUp() — xem comment đầy đủ ở đó. Tóm tắt: dùng hướng CAMERA làm
                // tâm "hình nón phía trước" của Soft Targeting thay vì player.mesh.rotation.y (bị trễ do
                // đang lerp theo hướng di chuyển), để không loại nhầm địch ở tier 2/3 khi đang di chuyển.
                const camForwardForSoftTarget = new THREE.Vector3();
                camera.getWorldDirection(camForwardForSoftTarget);
                const softTargetFacingAngle = (camForwardForSoftTarget.x === 0 && camForwardForSoftTarget.z === 0)
                    ? player.mesh.rotation.y
                    : Math.atan2(camForwardForSoftTarget.x, camForwardForSoftTarget.z);

                const softTarget = findSoftTargetingRotation(player.position, softTargetFacingAngle);
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
