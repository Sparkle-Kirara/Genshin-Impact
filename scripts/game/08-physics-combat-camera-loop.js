            // Combo Attack System v4 — helper DÙNG CHUNG cho 6 nhánh idle/walk/run/swim/climb/plunge
            // trong updatePhysics() bên dưới: TRƯỚC ĐÂY mỗi nhánh tự lerp RightHand.position.y và
            // RightHand.rotation.z về base pose (copy-paste 6 lần, X/Z position + rotation.x/y KHÔNG
            // BAO GIỜ bị động tới — giữ nguyên giá trị cuối cùng combat để lại, một lỗi tiềm ẩn đã tồn
            // tại). Từ v4: lerp ĐẦY ĐỦ position (x,y,z) VÀ rotation (x,y,z) về đúng
            // visualConfig.rightHandPosition / rightHandBaseRotation (field mới, xem file 10) — đảm
            // bảo RightHand luôn hồi về ĐÚNG idle stance thật (tay ra trước, thấp, nghiêng phải) dù
            // đến từ trạng thái nào (combat, bơi, leo, plunge...). KHÔNG đụng leftHand/core/sway
            // velocity — giữ nguyên logic cũ cho các phần đó, gọi thêm bên cạnh helper này nếu cần.
            function applyRightHandBasePose(lerpFactor) {
                const visCfg = getActiveCharacterData().visualConfig;
                const baseRot = visCfg.rightHandBaseRotation || { x: 0, y: 0, z: 0 }; // fallback an toàn cho nhân vật thiếu field mới
                player.rightHand.position.x += (visCfg.rightHandPosition.x - player.rightHand.position.x) * lerpFactor;
                player.rightHand.position.y += (visCfg.rightHandPosition.y - player.rightHand.position.y) * lerpFactor;
                player.rightHand.position.z += (visCfg.rightHandPosition.z - player.rightHand.position.z) * lerpFactor;
                player.rightHand.rotation.x += (baseRot.x - player.rightHand.rotation.x) * lerpFactor;
                player.rightHand.rotation.y += (baseRot.y - player.rightHand.rotation.y) * lerpFactor;
                player.rightHand.rotation.z += (baseRot.z - player.rightHand.rotation.z) * lerpFactor;
            }

            function updatePhysics(dt) {
                if (dt > 0.1) dt = 0.1;
                const playerHalfW = player.width / 2, playerHalfH = player.height / 2, playerHalfD = player.depth / 2, eps = 0.001;

                if (player.invulnTimer > 0) player.invulnTimer -= dt;
                if (player.staggerTimer > 0) player.staggerTimer -= dt;

                if (player.isDead) {
                    // Dừng hoàn toàn input/physics cho đến khi người chơi bấm Revive
                    return;
                }

                if (player.isDrowning) {
                    // Chặn tất cả logic vật lý khác khi đang đuối nước
                    return;
                }

                // --- PHÁT HIỆN MẶT NƯỚC & CHUYỂN TRẠNG THÁI SWIMMING (PURE DETECTION VOLUME) ---
                let inWaterNow = false;
                let waterSurfaceY = -1.0;
                const pAABBForWater = getPlayerAABBAt(player.position);
                for (let i = 0; i < waterAreas.length; i++) {
                    if (intersectAABB(pAABBForWater, waterAreas[i].aabb)) {
                        inWaterNow = true;
                        waterSurfaceY = waterAreas[i].aabb.maxY;
                        break;
                    }
                }
                player.isInWater = inWaterNow;

                // Character #2 (Bow) Validation — Aim Mode Movement Constraints (yêu cầu mới): trong
                // lúc Bow Charged Attack đang Aim, KHÓA việc chuyển sang Swimming/Climbing/Gliding —
                // "nếu nhân vật di chuyển đến khu vực nước hay núi, sẽ chặn không cho bơi/leo, tức là
                // không thể xuống nước khi đang trong Aim Mode". Đọc qua getAimModeBlocksTerrainStates()
                // (combat.js) — ĐIỂM TRA CỨU DUY NHẤT, dùng chung với input layer (phím Space/mobile-
                // jump-btn) để nhất quán giữa physics và input, tránh 2 nguồn sự thật khác nhau.
                const bowAimBlocksTerrainStates = getAimModeBlocksTerrainStates();

                // Tính toán tỷ lệ chìm dưới nước: Độ sâu / Chiều cao nhân vật
                let depthRatio = inWaterNow ? (waterSurfaceY - (player.position.y - playerHalfH)) / player.height : 0;

                // Vào chế độ Bơi nếu ngập hơn 70% cơ thể
                if (inWaterNow && depthRatio > 0.7 && !bowAimBlocksTerrainStates) {
                    
                    // State Priority: Huỷ bỏ Plunge Attack ngay lập tức nếu đáp xuống vùng nước sâu
                    if (player.isPlunging) {
                        player.isPlunging = false;
                        player.attackState = 'idle';
                        // Alpha v1.0 — Character Foundation: children[0] (thân cylinder cũ) đã bị xóa —
                        // đọc tilt qua player.tiltRoot.rotation.x thay vì children[0].rotation.x.
                        // Alpha v1.0 — Character Foundation: idle pose kiếm đọc từ
                        // CHARACTER_ROSTER[...].visualConfig.weaponGrip.rotation (data-driven).
                        {
                            const grip = getWeaponGripRotation(); // Character Foundation v2: fallback an toàn nếu thiếu weaponGrip
                            player.sword.rotation.set(grip.x + player.tiltRoot.rotation.x, grip.y, grip.z);
                        }
                        spawnHydroSplash(player.position, new THREE.Vector3(0, 1, 0), true);
                        sfx.playHydroSplash();
                    }

                    // State Priority: Huỷ bỏ Gliding nếu đáp xuống nước
                    if (player.isGliding) {
                        deactivateGlider();
                    }

                    if (!player.isSwimming && !player.isClimbing) {
                        player.isSwimming = true;
                        player.swimState = 'idle';
                        player.isDashing = false;
                        player.isSprinting = false;
                        player.velocity.y = Math.max(player.velocity.y, -4.0); // Giảm lực rơi khi chạm mặt nước
                        spawnHydroSplash(player.position, new THREE.Vector3(0, 1, 0), true);
                        sfx.playHydroSplash();
                    }
                } 
                // Thoát chế độ bơi nếu lùi vào vùng nước cạn (hoặc lên bờ)
                else if (!inWaterNow || depthRatio < 0.5) {
                    if (player.isSwimming) {
                        player.isSwimming = false;
                        player.swimState = 'idle';
                        player.sword.visible = true;
                        // Phục hồi lại trục rotation bị nghiêng khi bơi
                        player.tiltRoot.rotation.z = 0; // Alpha v1.0: gộp children[0]/[1] cũ thành 1 dòng ghi tiltRoot
                        
                        // Cung cấp một lực đẩy nhỏ (Hop) giúp người chơi dễ dàng leo ra khỏi vùng nước mép bờ
                        const movingForward = keys.w || (joystickActive && joystickDelta.y < -0.3);
                        if (movingForward) player.velocity.y = 5.5; 
                    }
                }

                // --- TIÊU HAO VÀ HỒI PHỤC THỂ LỰC ---
                // Toàn bộ logic đã tách sang updateStamina() (định nghĩa bên dưới updatePhysics) — xem
                // hàm đó cho state machine đầy đủ theo từng trạng thái (Sprint/Dash/Climb/ClimbJump/
                // Glide/SwimStroke/SwimSprint/Idle) và STAMINA_CONFIG (02-collision-and-stats-core.js)
                // cho toàn bộ thông số. Giữ NGUYÊN vị trí gọi ở đây (trước khối input-movement phía
                // dưới xác định lại isSprinting/swimState của frame này) — hành vi cũ vốn dùng state
                // của FRAME TRƯỚC để tính tiêu hao frame này, không đảo thứ tự để tránh phá vỡ Movement.
                updateStamina(dt);
                // Lưu ý: nếu updateStamina() vừa gọi triggerDrowningSequence(), nó set
                // player.isDrowning = true NGAY (isDead chỉ true sau 1000ms qua setTimeout riêng) — vì
                // guard "if (player.isDrowning) return;" đã có sẵn ở ĐẦU updatePhysics() (phía trên),
                // toàn bộ phần còn lại của FRAME NÀY vẫn chạy tiếp bình thường 1 lần cuối (vô hại, vì
                // triggerDrowningSequence() đã tự set velocity/inputVelocity về gần như đứng yên), và
                // guard đó sẽ tự chặn hoàn toàn từ FRAME KẾ TIẾP trở đi — không cần return thêm ở đây.

                // --- CẬP NHẬT GIAO DIỆN VÒNG THỂ LỰC DI ĐỘNG ---
                if (staminaContainer && staminaRing) {
                    const pct = player.stamina / player.maxStamina;
                    
                    // Chỉ hiển thị khi stamina sụt giảm dưới ngưỡng UI_VISIBLE_THRESHOLD_PCT
                    if (pct < STAMINA_CONFIG.UI_VISIBLE_THRESHOLD_PCT) {
                        staminaContainer.style.opacity = '1';
                        // Chiếu tọa độ 3D nhân vật sang 2D màn hình phẳng
                        const tempV = new THREE.Vector3();
                        player.mesh.getWorldPosition(tempV);
                        tempV.y += 0.8; // Đưa vòng thể lực lên ngang hông/vai nhân vật
                        tempV.project(camera);
                        
                        const sx = (tempV.x * 0.5 + 0.5) * window.innerWidth;
                        const sy = (tempV.y * -0.5 + 0.5) * window.innerHeight;
                        
                        staminaContainer.style.left = `${sx}px`;
                        staminaContainer.style.top = `${sy}px`;
                        
                        // Cập nhật dash-offset của SVG Path
                        const dashOffset = 100 - (pct * 100);
                        staminaRing.style.strokeDashoffset = dashOffset;
                        
                        // Đổi màu đỏ khi thể lực xuống dưới UI_LOW_WARNING_THRESHOLD_PCT
                        if (pct < STAMINA_CONFIG.UI_LOW_WARNING_THRESHOLD_PCT) {
                            staminaRing.className.baseVal = "text-red-500 transition-all duration-75";
                        } else {
                            staminaRing.className.baseVal = "text-amber-400 transition-all duration-75";
                        }
                    } else {
                        staminaContainer.style.opacity = '0';
                    }
                }

                // --- XỬ LÝ LỰC (Trọng lực / Lực nổi) ---
                if (player.isClimbing) {
                    if (player.climbJumpTimer > 0) {
                        player.climbJumpTimer -= dt;
                        player.velocity.y = player.jumpForce * 0.8;
                        player.velocity.x = 0;
                        player.velocity.z = 0;
                    } else {
                        let climbInputY = 0;
                        let climbInputX = 0;
                        if (joystickActive) { 
                            climbInputY = -joystickDelta.y; 
                            climbInputX = joystickDelta.x;
                        } 
                        else {
                            if (keys.w) climbInputY = 1;
                            if (keys.s) climbInputY = -1;
                            if (keys.a) climbInputX = -1;
                            if (keys.d) climbInputX = 1;
                        }
                        
                        const up = new THREE.Vector3(0, 1, 0);
                        const right = new THREE.Vector3().crossVectors(up, player.climbNormal).normalize();
                        
                        const climbSpeed = 4.0;
                        player.velocity.x = climbInputX * right.x * climbSpeed;
                        player.velocity.y = climbInputY * climbSpeed;
                        player.velocity.z = climbInputX * right.z * climbSpeed;
                    }
                } 
                else if (player.isSwimming) {
                    // SWIMMING BUOYANCY - Thay thế trọng lực bằng lực nổi hướng tới mục tiêu
                    const floatTargetY = waterSurfaceY - player.height * 0.25; // 75% cơ thể ở dưới nước, 25% nổi lên trên
                    const buoyancy = (floatTargetY - player.position.y) * 15.0;
                    player.velocity.y += buoyancy * dt;
                    player.velocity.y *= Math.exp(-5.0 * dt); // Lực cản mạnh của nước chiều dọc (Damping)
                }
                else if (!player.isDashing) {
                    if (player.isGliding) {
                        player.velocity.y = -1.35; 
                    } else if (player.isPlunging) {
                        player.velocity.y -= 45.0 * dt; 
                        if (player.velocity.y < -45) player.velocity.y = -45;
                    } else {
                        player.velocity.y -= player.gravity * dt;
                    }
                    if (player.velocity.y < -30 && !player.isPlunging) player.velocity.y = -30; 
                }

                // --- XỬ LÝ DI CHUYỂN NGANG (X, Z) ---
                if (player.isDashing) {
                    const progress = player.dashTimer / player.dashDuration; 
                    const currentDashSpeed = player.dashSpeed * Math.pow(progress, 1.2); 

                    player.velocity.x = player.dashDirection.x * currentDashSpeed;
                    player.velocity.z = player.dashDirection.z * currentDashSpeed;

                    spawnDashWindTrail(player.position, player.dashDirection);

                    player.ghostSpawnTimer += dt;
                    if (player.ghostSpawnTimer >= 0.04) { spawnPlayerGhost(player.mesh); player.ghostSpawnTimer = 0; }

                    player.dashTimer -= dt;
                    if (player.dashTimer <= 0) {
                        player.isDashing = false; 
                        player.dashCooldownTimer = player.dashCooldown;
                        
                        if (keys.dash && player.stamina > 0) {
                            player.isSprinting = true;
                            player.inputVelocity.copy(player.dashDirection).multiplyScalar(player.sprintSpeed);
                        } else {
                            const dashExitMomentum = player.dashSpeed * 0.55; 
                            player.inputVelocity.copy(player.dashDirection).multiplyScalar(dashExitMomentum);
                        }
                    }
                } else {
                    if (player.dashCooldownTimer > 0) {
                        player.dashCooldownTimer -= dt;
                        if (player.dashCooldownTimer < 0) player.dashCooldownTimer = 0;
                    }
                }

                if (player.isPlunging) {
                    player.velocity.x = 0;
                    player.velocity.z = 0;
                    player.inputVelocity.set(0, 0, 0);

                    if (Math.random() < 0.45) spawnPlungeTrailParticles();
                } 
                else if (player.isSwimming) {
                    // SWIMMING MOVEMENT LOGIC
                    let moveX = 0, moveZ = 0;
                    if (joystickActive) { moveX = joystickDelta.x; moveZ = joystickDelta.y; } 
                    else {
                        if (keys.w) moveZ = -1; if (keys.s) moveZ = 1;
                        if (keys.a) moveX = -1; if (keys.d) moveX = 1;
                    }

                    const camForward = new THREE.Vector3(); camera.getWorldDirection(camForward); camForward.y = 0; camForward.normalize();
                    const camRight = new THREE.Vector3(); camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();
                    const moveDirection = new THREE.Vector3(); moveDirection.addScaledVector(camForward, -moveZ); moveDirection.addScaledVector(camRight, moveX);   

                    const hasMovementInput = moveDirection.lengthSq() > 0.01;
                    if (hasMovementInput) { moveDirection.normalize(); player.lastMovementDirection.copy(moveDirection); }

                    // Quản lý trạng thái Bơi (Fast dần decay về Slow nếu không còn giữ Input hoặc hết Timer)
                    if (player.swimState === 'fast') {
                        if (player.stamina <= STAMINA_CONFIG.MIN_STAMINA) {
                            player.swimState = 'slow';
                        } else if (player.swimFastTimer > 0) {
                            player.swimFastTimer -= dt;
                        } else if (!keys.dash) { // if timer ended and not holding sprint
                            player.swimState = hasMovementInput ? 'slow' : 'idle';
                        }
                        
                        // Fallback to idle if totally stopped
                        if (!hasMovementInput) {
                            player.swimState = 'idle';
                        }
                    } else {
                        if (hasMovementInput) {
                            const enteringSwimSprint = (player.swimState !== 'fast') && keys.dash && player.stamina > STAMINA_CONFIG.MIN_STAMINA;
                            player.swimState = (keys.dash && player.stamina > STAMINA_CONFIG.MIN_STAMINA) ? 'fast' : 'slow';
                            if (enteringSwimSprint) {
                                // Swim Sprint — trừ SWIM_SPRINT_START_COST TỨC THỜI đúng 1 lần tại thời
                                // điểm CHUYỂN sang 'fast' (không phải mỗi frame đang ở 'fast' — phần đó
                                // đã xử lý riêng ở updateStamina()/STAMINA_CONFIG.SWIM_SPRINT_COST_PER_SECOND).
                                player.stamina = Math.max(STAMINA_CONFIG.MIN_STAMINA, player.stamina - STAMINA_CONFIG.SWIM_SPRINT_START_COST);
                            }
                        } else {
                            player.swimState = 'idle';
                        }
                    }

                    let targetSpeed = 0;
                    if (player.swimState === 'fast') targetSpeed = 11.0; // Swim Fast
                    else if (player.swimState === 'slow') targetSpeed = 4.5; // Swim Slow (Breaststroke speed)

                    // Lực cản của nước (Drag/Lerp Factor)
                    const lerpFactor = targetSpeed > 0 ? (3.5 * dt) : (6.0 * dt); 
                    const desiredVelocity = moveDirection.clone().multiplyScalar(targetSpeed);
                    player.inputVelocity.lerp(desiredVelocity, Math.min(lerpFactor, 1));

                    player.velocity.x = player.inputVelocity.x; 
                    player.velocity.z = player.inputVelocity.z;

                    // Procedural Bobbing/Oscillation Timer Updates
                    player.swimOscillationTimer += dt;
                    if (player.swimState === 'idle') {
                        // Nhấp nhô trục Y nhẹ khi treading water
                        player.velocity.y += Math.sin(player.swimOscillationTimer * 3.0) * 0.8 * dt;
                    }

                    // Particles nước văng ra khi đang bơi
                    if (player.swimState === 'fast' && Math.random() < 0.25) {
                        spawnHydroTrail(player.position);
                    } else if (player.swimState === 'slow' && Math.random() < 0.08) {
                        spawnHydroTrail(player.position);
                    }
                }
                else if (!player.isDashing && !player.isClimbing) {
                    // GROUNDED / AIRBORNE MOVEMENT LOGIC

                    // --- FALLING INPUT LOCK (Pre-Alpha Stabilization) ---
                    // "Falling" ở đây = đang trên không, KHÔNG Gliding/Climbing/Swimming/Dashing (2 vế
                    // sau đã tự loại trừ bởi điều kiện `else if` bao ngoài) — bao gồm CẢ pha đang nhảy
                    // lên (velocity.y > 0) LẪN pha đang rơi xuống, ngay khi rời mặt đất cho tới khi
                    // chạm đất hoặc chuyển sang Gliding (quyết định đã chốt trong lịch sử trò chuyện).
                    // Khi true: người chơi vẫn có thể GIỮ AWSD/joystick (không có gì ngăn input), nhưng
                    // input đó KHÔNG được đọc/xử lý ở đây — velocity.x/z và lastMovementDirection giữ
                    // NGUYÊN giá trị từ frame trước (đà quán tính lúc rời đất), không lerp theo hướng
                    // mới. Đặt SAU "!isDashing && !isClimbing" nhưng TRƯỚC khi đọc bất kỳ input nào, để
                    // không tính toán/ghi đè gì cả trong nhánh này khi đang Falling.
                    const isFalling = !player.isGrounded && !player.isGliding;

                    if (isFalling) {
                        // Không đọc keys/joystick, không đổi velocity.x/z, không đổi
                        // lastMovementDirection — nhân vật giữ nguyên quỹ đạo ngang đã có lúc rời đất,
                        // chỉ rơi thẳng theo trọng lực (gravity xử lý ở khối XỬ LÝ LỰC phía trên).
                    } else {
                        let moveX = 0, moveZ = 0;
                        if (joystickActive) { moveX = joystickDelta.x; moveZ = joystickDelta.y; } 
                        else {
                            if (keys.w) moveZ = -1; if (keys.s) moveZ = 1;
                            if (keys.a) moveX = -1; if (keys.d) moveX = 1;
                        }

                        const camForward = new THREE.Vector3(); camera.getWorldDirection(camForward); camForward.y = 0; camForward.normalize();
                        const camRight = new THREE.Vector3(); camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();
                        const moveDirection = new THREE.Vector3(); moveDirection.addScaledVector(camForward, -moveZ); moveDirection.addScaledVector(camRight, moveX);   

                        const hasMovementInput = moveDirection.lengthSq() > 0.01;
                        if (hasMovementInput) { moveDirection.normalize(); player.lastMovementDirection.copy(moveDirection); }

                        if (!keys.dash || !hasMovementInput || player.walkMode || player.isGliding || player.stamina <= STAMINA_CONFIG.MIN_STAMINA) {
                            player.isSprinting = false;
                        } else if (player.isGrounded && !player.isDashing) {
                            player.isSprinting = true;
                        }

                        let activeMaxSpeed = player.speed;
                        if (player.isGliding) activeMaxSpeed = 9.2; 
                        else if (player.walkMode) activeMaxSpeed = player.walkSpeed;
                        else if (player.isSprinting) activeMaxSpeed = player.sprintSpeed;

                        // Character #2 (Bow) Validation — yêu cầu mới: "giảm tốc độ di chuyển khi đang
                        // trong aim mode, tốc độ giảm còn bằng tốc độ đi bộ (walk, đã có sẵn)". Áp dụng
                        // SAU khi activeMaxSpeed đã tính theo trạng thái khác (Gliding/walkMode/
                        // Sprinting) — Aim Mode GHI ĐÈ xuống walkSpeed bất kể trạng thái nào ở trên
                        // (VD đang Sprint rồi vào Aim Mode -> giảm về walkSpeed ngay, không giữ tốc độ
                        // chạy). CHỈ áp dụng khi Aim Mode KHÔNG khóa movement hoàn toàn
                        // (!getAimModeLockMovement()) — Elemental Skill (lockMovement=true) không bị
                        // ảnh hưởng bởi dòng này vì targetSpeed đã = 0 ở điều kiện bên dưới, việc giới
                        // hạn activeMaxSpeed ở đây vô nghĩa với Skill nhưng vô hại (0 * bất kỳ số nào
                        // vẫn = 0).
                        if (skillAimState.phase === 'aiming' && !getAimModeLockMovement()) {
                            activeMaxSpeed = player.walkSpeed;
                        }

                        // Aim Mode Movement Lock (data-driven, xem getAimModeLockMovement() trong
                        // combat.js) — TRƯỚC ĐÂY hard-code "skillAimState.phase === 'aiming' ? 0 :
                        // ..." dùng CHUNG cho mọi nguồn Aim Mode. Elemental Skill của Character #1
                        // GIỮ NGUYÊN hành vi gốc: chặn hoàn toàn di chuyển (targetSpeed = 0), giống
                        // cách Genshin khóa chân nhân vật khi giương cung — nhưng KHÔNG chặn camera,
                        // người chơi vẫn xoay hướng ngắm tự do (xử lý riêng trong updateCamera, không
                        // đụng ở đây). Character #2 (Bow) Charged Attack: getAimModeLockMovement()
                        // trả về false (mặc định) -> targetSpeed tính theo activeMaxSpeed ĐÃ GIỚI HẠN
                        // = walkSpeed ở trên (thay vì tốc độ chạy bình thường) — WASD hoạt động đầy đủ
                        // nhưng chậm hơn trong lúc aim/charge (spec mục 5-6, cập nhật giảm tốc).
                        // Character #3 Validation — Burst Activation: FULL movement lock (targetSpeed=0)
                        // khi attackState là burstActivationWindup/burstActivationActive — KHÁC hẳn
                        // mức 0.35x mặc định của mọi attackState khác (đây là trạng thái ĐẶC BIỆT, đòi
                        // hỏi khóa hoàn toàn theo yêu cầu implementation, không phải giảm tốc thông
                        // thường).
                        //
                        // Character #3 Validation — NA5 movementMultiplier: đọc
                        // getCurrentAttackAnim().movementMultiplier (field MỚI, optional — chỉ NA5 của
                        // Character #3 khai báo 0.25, mọi combo slot khác của mọi nhân vật KHÔNG có field
                        // này nên fallback về đúng 0.35 cũ, KHÔNG đổi hành vi Character #1/#2/Polearm
                        // NA1-4). Chỉ áp dụng khi attackState 'active'/'windup' (không phải 'recovery'
                        // — cùng cách 0.35 cũ chỉ áp dụng theo attackState !== 'idle' nói chung, giữ
                        // logic tối thiểu, không phân biệt windup/active/recovery ở mức cao hơn 0.35 cũ
                        // vốn đã làm).
                        const isBurstActivationLock = (player.attackState === 'burstActivationWindup' || player.attackState === 'burstActivationActive');
                        const currentAttackAnimForMove = (player.attackState !== 'idle' && typeof getCurrentAttackAnim === 'function') ? getCurrentAttackAnim() : null;
                        const moveMult = (currentAttackAnimForMove && typeof currentAttackAnimForMove.movementMultiplier === 'number') ? currentAttackAnimForMove.movementMultiplier : 0.35;
                        const targetSpeed = (skillAimState.phase === 'aiming' && getAimModeLockMovement()) ? 0
                            : isBurstActivationLock ? 0
                            : (hasMovementInput ? (player.attackState !== 'idle' ? activeMaxSpeed * moveMult : activeMaxSpeed) : 0);
                    
                        const lerpFactor = targetSpeed > 0 ? (player.acceleration * dt) : (player.deceleration * dt);
                        const desiredVelocity = moveDirection.clone().multiplyScalar(targetSpeed);
                        player.inputVelocity.lerp(desiredVelocity, Math.min(lerpFactor, 1));

                        player.velocity.x = player.inputVelocity.x; 
                        player.velocity.z = player.inputVelocity.z;

                        if (player.isSprinting && hasMovementInput && player.isGrounded && Math.random() < 0.3) {
                            spawnRunTrail(player.position, player.lastMovementDirection);
                        } else if (hasMovementInput && player.isGrounded && !player.walkMode && Math.random() < 0.15) {
                            spawnRunTrail(player.position, player.lastMovementDirection);
                        }
                    }
                }

                // --- ATTACK LUNGE: cộng THÊM vào velocity (không ghi đè) sau khi mọi logic di chuyển
                // khác đã finalize trong frame này — tránh đúng bug của lunge cũ (bị input-movement ghi
                // đè mất tác dụng ở frame kế). Quãng đường trải đều qua lungeTimer, giảm dần mỗi frame,
                // dừng hẳn khi hết quãng đường hoặc hết thời gian — không phải Dash, không tự lao vào địch.
                if (player.lungeTimer > 0 && player.lungeRemainingDist > 0) {
                    const lungeStep = Math.min(player.lungeRemainingDist, (player.lungeRemainingDist / player.lungeTimer) * dt);
                    player.velocity.x += player.lungeDir.x * (lungeStep / dt);
                    player.velocity.z += player.lungeDir.z * (lungeStep / dt);
                    player.lungeRemainingDist -= lungeStep;
                    player.lungeTimer -= dt;
                    if (player.lungeTimer <= 0 || player.lungeRemainingDist <= 0.001) {
                        player.lungeTimer = 0;
                        player.lungeRemainingDist = 0;
                    }
                } else {
                    player.lungeTimer = 0;
                    player.lungeRemainingDist = 0;
                }

                // --- PRESSURE SHOT RECOIL: cùng cơ chế với Attack Lunge ở trên (cộng THÊM vào velocity,
                // trải đều qua recoilTimer) — đẩy lùi nhẹ theo hướng ngược lại hướng bắn, không làm mất
                // kiểm soát nhân vật (chỉ là 1 lực đẩy ngắn, người chơi vẫn di chuyển bình thường ngay
                // sau đó nếu muốn, vì đây chỉ cộng thêm chứ không ghi đè input-movement).
                // LƯU Ý: chỉ áp dụng recoilDir.x/z (phương ngang) — CHỦ Ý bỏ qua recoilDir.y dù hướng bắn
                // giờ có thể nghiêng lên/xuống (Aim 3D). Đẩy nhân vật theo trục dọc dễ gây cảm giác khó
                // chịu (bị hất lên/ấn xuống đất) và phức tạp hóa tương tác với gravity/grounded — giữ
                // recoil thuần ngang cho cảm giác nhất quán, dễ đoán.
                if (player.recoilTimer > 0 && player.recoilRemainingDist > 0) {
                    const recoilStep = Math.min(player.recoilRemainingDist, (player.recoilRemainingDist / player.recoilTimer) * dt);
                    player.velocity.x += player.recoilDir.x * (recoilStep / dt);
                    player.velocity.z += player.recoilDir.z * (recoilStep / dt);
                    player.recoilRemainingDist -= recoilStep;
                    player.recoilTimer -= dt;
                    if (player.recoilTimer <= 0 || player.recoilRemainingDist <= 0.001) {
                        player.recoilTimer = 0;
                        player.recoilRemainingDist = 0;
                    }
                } else {
                    player.recoilTimer = 0;
                    player.recoilRemainingDist = 0;
                }

                // Nhảy (Jump)
                // Character #2 (Bow) Validation — chặn hoàn toàn Jump khi đang Bow Aim Mode (yêu cầu:
                // "khóa jump... khi đang trong aim mode"). Vẫn phải reset jumpRequested = false ở dưới
                // dù bị chặn — nếu không, input Jump sẽ bị "dồn lại" và tự kích hoạt ngay khi thoát
                // Aim Mode (frame kế tiếp phase không còn 'aiming'), gây nhảy ngoài ý muốn ngay lúc
                // Release/thoát aim — reset ngay tại đây để tránh hành vi rò rỉ đó.
                if (player.jumpRequested && bowAimBlocksTerrainStates) {
                    player.jumpRequested = false;
                } else if (player.jumpRequested) {
                    if (player.isSwimming) {
                        // Chặn nhảy từ trong nước
                    } else if (player.isClimbing) {
                        // STAMINA JUMP COST: dùng STAMINA_CONFIG.CLIMB_JUMP_COST (25.0) — không đủ thì
                        // không cho Climb Jump, không trừ âm (đúng spec).
                        if (player.stamina >= STAMINA_CONFIG.CLIMB_JUMP_COST) {
                            player.climbJumpTimer = 0.25; 
                            player.stamina = Math.max(STAMINA_CONFIG.MIN_STAMINA, player.stamina - STAMINA_CONFIG.CLIMB_JUMP_COST);
                            playtestMetrics.jumps++;
                        } else {
                            sfx.playBlockedSound();
                        }
                    } else if (player.isGrounded) {
                        player.velocity.y = player.jumpForce; 
                        player.isGrounded = false; 
                        playtestMetrics.jumps++; 

                        if (player.isDashing) {
                            player.isDashing = false;
                            player.dashCooldownTimer = player.dashCooldown;
                            player.inputVelocity.copy(player.dashDirection).multiplyScalar(player.sprintSpeed);
                        }
                    }
                    player.jumpRequested = false; 
                }

                // --- FALL DAMAGE: theo dõi đỉnh cao nhất của chu kỳ rơi hiện tại ---
                // Khi đang đứng trên đất: reset điểm bắt đầu theo dõi (chưa rơi).
                // Khi đang ở trên không: cập nhật lên giá trị Y cao nhất đã đạt được.
                // Nhờ dựa vào "đỉnh cao nhất" thay vì Y lúc rời đất, các trường hợp bật nhảy
                // liên tiếp trên không (VD nhảy leo tường) vẫn được tính đúng độ cao rơi thực tế.
                //
                // BUGFIX (Pre-Alpha Stabilization — xem deactivateGlider() trong
                // 06-camps-save-system.js cho lý do đầy đủ): trong lúc isGliding=true, KHÔNG cập nhật
                // "đỉnh cao nhất" — deactivateGlider() sẽ tự reset fallStartY về đúng độ cao hiện tại
                // ngay khi thoát Glide (bất kể lý do thoát), coi mỗi lần thoát Glide là khởi đầu 1 chu
                // kỳ rơi MỚI. Bỏ qua tường minh ở đây (thay vì chỉ dựa vào deactivateGlider() ghi đè
                // sau) để không phụ thuộc ngầm vào thứ tự gọi hàm — rõ ràng: đang Glide thì fallStartY
                // đứng yên, không tăng theo đỉnh cao đạt được trong lúc lượn.
                if (player.isGrounded) {
                    player.fallStartY = player.position.y;
                } else if (player.isGliding) {
                    // Giữ nguyên fallStartY hiện tại — không cập nhật trong lúc đang lượn.
                } else if (!Number.isNaN(player.fallStartY)) {
                    player.fallStartY = Math.max(player.fallStartY, player.position.y);
                } else {
                    player.fallStartY = player.position.y;
                }

                // Cập nhật vị trí Y và Va chạm mặt đất / vật cản
                player.position.y += player.velocity.y * dt;
                let currentAABB = getPlayerAABBAt(player.position);
                let groundedNow = false;

                const terrainFloorY = getTerrainHeight(player.position.x, player.position.z);

                // --- GIỚI HẠN VÙNG DI CHUYỂN: RƠI KHỎI PLANE/WATER (VOID) ---
                // terrainFloorY chạm mức VOID_DEPTH_Y nghĩa là X/Z hiện tại nằm ngoài plane hợp lệ.
                // Loại trừ trường hợp đang ở trong một water area (Trigger Volume riêng, có thể nằm
                // ngoài phạm vi plane một cách hợp lệ, ví dụ Water Test Zone) để không phá vỡ bơi lội.
                const isVoidFloor = terrainFloorY <= (window.VOID_DEPTH_Y ?? -100.0);
                if (isVoidFloor && !inWaterNow && player.position.y <= playerHalfH + terrainFloorY) {
                    player.position.copy(PLAYER_SPAWN_POSITION);
                    player.velocity.set(0, 0, 0);
                    player.fallStartY = player.position.y; // Tránh fall damage giả sau teleport
                    player.wasGrounded = true;
                    currentAABB = getPlayerAABBAt(player.position);
                } else if (player.position.y <= playerHalfH + terrainFloorY) {
                    player.position.y = playerHalfH + terrainFloorY; 
                    player.velocity.y = 0; 
                    groundedNow = true; 
                    currentAABB = getPlayerAABBAt(player.position);
                }

                for (let i = 0; i < obstacles.length; i++) {
                    const block = obstacles[i];
                    if (intersectAABB(currentAABB, block.aabb)) {
                        const prevBottom = (player.position.y - playerHalfH) - player.velocity.y * dt;
                        if (player.velocity.y <= 0) {
                            if (prevBottom >= block.aabb.maxY - 0.25) {
                                player.position.y = block.aabb.maxY + playerHalfH; 
                                player.velocity.y = 0; 
                                groundedNow = true; 
                                currentAABB = getPlayerAABBAt(player.position);
                            }
                        } else if (player.velocity.y > 0) {
                            const prevTop = player.position.y - player.velocity.y * dt + playerHalfH;
                            if (prevTop <= block.aabb.minY + 0.15) {
                                player.position.y = block.aabb.minY - playerHalfH - eps; 
                                player.velocity.y = 0; 
                                currentAABB = getPlayerAABBAt(player.position);
                            }
                        }
                    }
                }

                if (groundedNow) {
                    player.coyoteTimer = 0.08; 
                } else if (player.coyoteTimer > 0) {
                    player.coyoteTimer -= dt;
                    if (player.coyoteTimer < 0) player.coyoteTimer = 0;
                }
                player.isGrounded = groundedNow || player.coyoteTimer > 0;

                // Lưu lại trước khi triggerPlungeImpact() có thể set isPlunging = false bên dưới —
                // Fall Damage cần biết cú tiếp đất này có phải do Plunge Attack chủ động hay không.
                const wasPlungingBeforeLanding = player.isPlunging;

                if (groundedNow) {
                    if (player.isClimbing && player.velocity.y <= 0) player.isClimbing = false;
                    if (player.isGliding) deactivateGlider();
                    if (player.isPlunging) triggerPlungeImpact();
                    if (player.velocity.y < 0) player.velocity.y = 0;
                    currentAABB = getPlayerAABBAt(player.position);
                }

                player.position.x += player.velocity.x * dt;
                currentAABB = getPlayerAABBAt(player.position);
                const playerBottom = player.position.y - playerHalfH;

                // --- CHỈ XỬ LÝ COLLISION KHI KHÔNG CLIMBING ---
                if (!player.isClimbing) {
                    for (let i = 0; i < obstacles.length; i++) {
                        const block = obstacles[i];
                        if (intersectAABB(currentAABB, block.aabb)) {
                            const stepDiff = block.aabb.maxY - playerBottom;
                            if (stepDiff > 0.15) {
                                if (player.velocity.x > 0) player.position.x = block.aabb.minX - playerHalfW - eps;
                                else if (player.velocity.x < 0) player.position.x = block.aabb.maxX + playerHalfW + eps;
                                player.velocity.x = 0; 
                                if (player.isDashing) player.isDashing = false; 
                                currentAABB = getPlayerAABBAt(player.position);
                            }
                        }
                    }
                }

                player.position.z += player.velocity.z * dt;
                currentAABB = getPlayerAABBAt(player.position);
                const playerBottomZ = player.position.y - playerHalfH; 

                // --- CHỈ XỬ LÝ COLLISION KHI KHÔNG CLIMBING ---
                if (!player.isClimbing) {
                    for (let i = 0; i < obstacles.length; i++) {
                        const block = obstacles[i];
                        if (intersectAABB(currentAABB, block.aabb)) {
                            const stepDiffZ = block.aabb.maxY - playerBottomZ; 
                            if (stepDiffZ > 0.15) {
                                if (player.velocity.z > 0) player.position.z = block.aabb.minZ - playerHalfD - eps;
                                else if (player.velocity.z < 0) player.position.z = block.aabb.maxZ + playerHalfD + eps;
                                player.velocity.z = 0; 
                                if (player.isDashing) player.isDashing = false; 
                                currentAABB = getPlayerAABBAt(player.position);
                            }
                        }
                    }
                }

                // --- SNAP-TO-TERRAIN SAU KHI DI CHUYỂN NGANG (v0.3 Frontier) ---
                // Terrain giờ có đồi/dốc thật (không còn phẳng tuyệt đối như trước v0.3) — cao độ Y
                // được tính ở ĐẦU frame (dòng trên) dựa trên vị trí X/Z TRƯỚC khi player di chuyển
                // ngang. Nếu không snap lại, khi chạy ngang qua sườn dốc, Y bị "trễ" 1 frame so với
                // terrain thực tế tại vị trí MỚI — trên dốc đủ dốc/tốc độ đủ nhanh, điều này khiến
                // player "bay" lơ lửng phía trên mặt đất trong chốc lát (terrain tụt xuống nhanh hơn Y
                // rơi tự nhiên) hoặc bị lún xuống dưới mặt đất (terrain nhô lên nhanh hơn). CHỈ áp dụng
                // khi đang isGrounded (không đụng tới nhảy/rơi tự do/plunge/climbing/swimming — những
                // state đó có logic Y riêng, không nên bị ghi đè ở đây).
                if (player.isGrounded && !player.isClimbing && !player.isSwimming && !player.isPlunging && player.velocity.y <= 0) {
                    const terrainAtNewPos = getTerrainHeight(player.position.x, player.position.z);
                    // Bỏ qua nếu vị trí mới rơi vào Void (ngoài plane hợp lệ) — nhánh Void ở đầu frame
                    // (dựa trên vị trí CŨ) sẽ xử lý teleport về spawn ở frame kế tiếp như bình thường,
                    // không cần snap vào giá trị -100 ở đây.
                    if (terrainAtNewPos > (window.VOID_DEPTH_Y ?? -100.0)) {
                        // Chỉ snap nếu KHÔNG đang đứng trên 1 obstacle (box) cao hơn terrain tại đó —
                        // so sánh với floorY hiện tại (đã được set đúng bởi vòng lặp obstacle phía trên
                        // nếu player đang đứng trên box) để tránh việc snap kéo player tụt khỏi bề mặt
                        // box xuống lại mặt đất bên dưới.
                        const currentFloorY = player.position.y - playerHalfH;
                        const standingOnObstacle = currentFloorY > terrainAtNewPos + 0.05;
                        if (!standingOnObstacle) {
                            player.position.y = terrainAtNewPos + playerHalfH;
                            currentAABB = getPlayerAABBAt(player.position);
                        }
                    }
                }

                // Sát ranh giới bám tường mượt mà hơn khi đang di chuyển ngang tự do
                if (player.isClimbing) {
                    player.position.addScaledVector(player.climbNormal, -0.15); 
                }

                if (!player.wasGrounded && groundedNow && player.velocity.y >= -2.0) {
                    // Soft landing
                } else if (!player.wasGrounded && groundedNow) {
                    const impactSpeed = Math.abs(player.velocity.y);
                    const squashAmt = Math.min(impactSpeed / 20, 0.38);
                    player.mesh.scale.set(1.0 + squashAmt, 1.0 - squashAmt * 0.85, 1.0 + squashAmt);
                    player.landSquashTimer = 0.15;
                }

                // --- FALL DAMAGE: chỉ tính khi VỪA tiếp đất sau một chu kỳ trên không ---
                // Loại trừ Plunge Attack: đó là hành động chủ động của người chơi, không phải ngã.
                // Đi xuống dốc/bậc thang không kích hoạt được nhánh này vì isGrounded luôn true
                // liên tục trong lúc đó, nên fallStartY được reset mỗi frame và fallHeight ~ 0.
                if (!player.wasGrounded && groundedNow && !wasPlungingBeforeLanding) {
                    const fallHeight = player.fallStartY - player.position.y;
                    applyFallDamage(fallHeight);
                }
                player.wasGrounded = groundedNow;

                if (!player.isDashing && !player.isPlunging && !player.isClimbing) {
                    const scaleRecovery = 1 - Math.exp(-18 * dt);
                    player.mesh.scale.x += (1.0 - player.mesh.scale.x) * scaleRecovery;
                    player.mesh.scale.y += (1.0 - player.mesh.scale.y) * scaleRecovery;
                    player.mesh.scale.z += (1.0 - player.mesh.scale.z) * scaleRecovery;
                }

                player.mesh.position.copy(player.position);

                resolveDynamicCollisions();
                resolveStaticCollisions(player, player.width, player.height, player.depth, dt);
                enemies.forEach(enemy => { if (enemy.alive) resolveStaticCollisions(enemy, enemy.width, enemy.height, enemy.depth, dt); });

                const wallDetection = detectClimbableWall();
                
                if (player.isClimbing) {
                    if (!wallDetection.normal) {
                        player.isClimbing = false;
                        if (player.velocity.y > 0) {
                            player.velocity.y = 5.0;
                            player.velocity.addScaledVector(player.climbNormal, -3.5); 
                        }
                    } else {
                        player.climbNormal.copy(wallDetection.normal);
                    }
                } else {
                    if (wallDetection.normal) {
                        const movingIntoWall = player.inputVelocity.dot(wallDetection.normal) < -0.1 ||
                                               player.velocity.dot(wallDetection.normal) < -0.1;
                        
                        // Character #2 (Bow) Validation — chặn bắt đầu Climbing khi đang Bow Aim Mode
                        // (bowAimBlocksTerrainStates tính ở đầu hàm) — "chặn không cho leo khi đang
                        // trong Aim Mode của Bow".
                        if (!bowAimBlocksTerrainStates && !player.isGrounded && !player.isPlunging && movingIntoWall) {
                            startClimbing(wallDetection.normal);
                            if (player.isSwimming) { 
                                player.isSwimming = false; 
                                player.sword.visible = true; 
                            } // Chuyển từ bơi sang leo tường liền mạch
                        } else if (!bowAimBlocksTerrainStates && player.isGrounded && movingIntoWall && (keys.w || (joystickActive && joystickDelta.y < -0.5))) {
                            startClimbing(wallDetection.normal);
                        }
                    }
                }

                enemies.forEach(enemy => {
                    if (!enemy.alive || enemy.isSlime) return; // Slime dùng cơ chế attack telegraph riêng (xem Slime.update)
                    if (player.position.distanceTo(enemy.position) < ((player.width + enemy.width) * 0.45) && player.invulnTimer <= 0) {
                        // Pre-Alpha v0.7 — Core Stats: dùng calculateFinalDamage() nhất quán với Slime,
                        // thay vì enemy.attackDamage (thuộc tính đã bị loại bỏ khỏi class Enemy khi
                        // chuyển sang this.stats — xem enemies.js).
                        const dmg = calculateFinalDamage(enemy.stats.atk, player.stats.def);
                        player.hp = Math.max(0, player.hp - dmg); player.invulnTimer = 0.8; 
                        triggerDamageFlash(); sfx.playHit();
                        if (spawnDamageNumber) {
                            const numberOrigin = player.position.clone();
                            numberOrigin.y += player.height * 0.75;
                            spawnDamageNumber(numberOrigin, dmg);
                        }
                        cameraState.shakeTimer = 0.25; cameraState.shakeIntensity = 0.35;
                        const pushDir = new THREE.Vector3().subVectors(player.position, enemy.position); pushDir.y = 0;
                        player.velocity.add(pushDir.normalize().multiplyScalar(5.0));
                        if (player.hp <= 0) enterDeadState('combat');
                    }
                });

                const distanceMoved = player.position.distanceTo(playtestMetrics.lastPosition);
                if (distanceMoved > 0.001 && distanceMoved < 10) playtestMetrics.totalDistance += distanceMoved;
                playtestMetrics.lastPosition.copy(player.position);

                // --- HỆ THỐNG PROCEDURAL ANIMATION TÁCH BIỆT (XOAY VÀ LẮC CƠ THỂ) ---

                // --- SOFT TARGETING: override tạm thời rotation.y trong lúc windup của đòn đánh,
                // KHÔNG khóa mục tiêu liên tục (chỉ set 1 lần lúc bắt đầu đòn, tự tắt khi xong).
                // Không đụng inputVelocity/camera — sau khi softTargetLockY về null, quyền điều khiển
                // hướng quay trả lại hoàn toàn cho logic di chuyển/camera bên dưới như bình thường.
                let softTargetingActiveThisFrame = false;
                if (player.softTargetLockY !== null) {
                    softTargetingActiveThisFrame = true;
                    let angleDiff = player.softTargetLockY - player.mesh.rotation.y;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    player.mesh.rotation.y += angleDiff * (1 - Math.exp(-player.softTargetLerpSpeed * dt));

                    // Tắt hỗ trợ khi: đã xoay đủ gần góc đích, HOẶC đòn đánh không còn ở windup/plunge nữa
                    // (bước sang active/recovery/idle) — đảm bảo hướng đã ổn định trước lúc hitbox kiểm tra
                    // trúng đòn, và không xoay kéo dài suốt cả animation kiểu Hard Lock-On.
                    const stillWindingUp = (player.attackState === 'windup') || player.isPlunging;
                    if (Math.abs(angleDiff) < 0.01 || !stillWindingUp) {
                        player.softTargetLockY = null;
                    }
                }

                if (player.isSwimming) {
                    // Idle Animation (Character Foundation): lerp Core/LeftHand/RightHand VỀ base
                    // pose khi rời khỏi Idle branch — tránh "kẹt" ở vị trí lệch cuối cùng của dao
                    // động sin(). KHÔNG đụng tiltRoot/sword/logic bơi bên dưới.
                    {
                        const visCfg = getActiveCharacterData().visualConfig;
                        const lerpFactor = 1 - Math.exp(-15 * dt);
                        player.core.position.y += (visCfg.corePosition.y - player.core.position.y) * lerpFactor;
                        player.leftHand.position.y += (visCfg.leftHandPosition.y - player.leftHand.position.y) * lerpFactor;
                        player.leftHand.rotation.z += (0 - player.leftHand.rotation.z) * lerpFactor;
                        applyRightHandBasePose(lerpFactor);
                        // Arm Sway v1: reset lag về 0 khi rời nhánh Movement — tránh lần sau quay lại
                        // Movement bị "nhảy cóc" từ giá trị sway cũ thay vì bắt đầu mượt từ 0.
                        player.leftHandSwayVelocity += (0 - player.leftHandSwayVelocity) * lerpFactor;
                        player.rightHandSwayVelocity += (0 - player.rightHandSwayVelocity) * lerpFactor;
                    }

                    const targetAngle = Math.atan2(player.inputVelocity.x, player.inputVelocity.z);
                    if (player.swimState !== 'idle' && player.inputVelocity.lengthSq() > 0.1) {
                        let angleDiff = targetAngle - player.mesh.rotation.y;
                        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                        player.mesh.rotation.y += angleDiff * (1 - Math.exp(-12 * dt)); // Xoay mượt khi bơi
                    }

                    let targetTiltX = 0;
                    let targetTiltZ = 0;

                    if (player.swimState === 'fast') {
                        targetTiltX = 0.65; // Đổ người về trước nhiều hơn để bơi sải
                        targetTiltZ = Math.sin(player.swimOscillationTimer * 12.0) * 0.35; // Lắc vai liên tục (Freestyle roll)
                    } else if (player.swimState === 'slow') {
                        targetTiltX = 0.35 + Math.sin(player.swimOscillationTimer * 5.0) * 0.08; // Cúi nhẹ & nhấp nhô theo nhịp (Breaststroke bob)
                        targetTiltZ = 0; // Trục trái phải ổn định
                    } else {
                        targetTiltX = 0.05; // Đứng thẳng
                        targetTiltZ = Math.sin(player.swimOscillationTimer * 2.0) * 0.03; // Lắc lư cực nhẹ (Treading sway)
                    }

                    player.tiltRoot.rotation.x += (targetTiltX - player.tiltRoot.rotation.x) * (1 - Math.exp(-8 * dt));
                    player.tiltRoot.rotation.z += (targetTiltZ - player.tiltRoot.rotation.z) * (1 - Math.exp(-12 * dt));
                    
                    player.sword.visible = false; // Giấu kiếm khi đang bơi
                } 
                else if (player.isClimbing) {
                    // Idle Animation (Character Foundation): xem giải thích ở nhánh isSwimming phía trên.
                    {
                        const visCfg = getActiveCharacterData().visualConfig;
                        const lerpFactor = 1 - Math.exp(-15 * dt);
                        player.core.position.y += (visCfg.corePosition.y - player.core.position.y) * lerpFactor;
                        player.leftHand.position.y += (visCfg.leftHandPosition.y - player.leftHand.position.y) * lerpFactor;
                        player.leftHand.rotation.z += (0 - player.leftHand.rotation.z) * lerpFactor;
                        applyRightHandBasePose(lerpFactor);
                        // Arm Sway v1: xem giải thích ở nhánh isSwimming phía trên.
                        player.leftHandSwayVelocity += (0 - player.leftHandSwayVelocity) * lerpFactor;
                        player.rightHandSwayVelocity += (0 - player.rightHandSwayVelocity) * lerpFactor;
                    }

                    const targetAngle = Math.atan2(-player.climbNormal.x, -player.climbNormal.z);
                    let angleDiff = targetAngle - player.mesh.rotation.y;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    player.mesh.rotation.y += angleDiff * (1 - Math.exp(-20 * dt));

                    player.tiltRoot.rotation.x = -0.1;
                    if (player.gliderGroup) player.gliderGroup.rotation.x = -0.1;

                    if (player.attackState === 'idle') {
                        // Character Foundation v2 — Dependency Fix (mục D.2): TRƯỚC ĐÂY hard-code
                        // tuyệt đối (-Math.PI/2, 0, Math.PI/10), áp dụng như nhau cho MỌI nhân vật
                        // bất kể weaponGrip riêng của họ — nhân vật dùng vũ khí khác kiếm dài (VD
                        // búa, quyền trượng) sẽ có pose leo tường sai lệch không kiểm soát được qua
                        // data. Từ v2: đọc visualConfig.climbGripRotation (field MỚI, optional) —
                        // fallback ĐÚNG giá trị cũ nếu nhân vật không khai báo, đảm bảo Character #1
                        // (Traveler, roster CHƯA có field này) giữ NGUYÊN 100% hành vi cũ.
                        const visCfg = getActiveCharacterData().visualConfig;
                        const climbGrip = visCfg.climbGripRotation || { x: -Math.PI / 2, y: 0, z: Math.PI / 10 };
                        player.sword.rotation.set(climbGrip.x, climbGrip.y, climbGrip.z);
                    }
                    player.sword.visible = true;
                } else if (!softTargetingActiveThisFrame && player.inputVelocity.lengthSq() > 0.01 && !player.isDashing && !player.isPlunging) {
                    // Arm Sway / Inertia v1 (Character Movement): CHỈ chạy trong nhánh Movement lean
                    // hiện có — KHÔNG đụng Idle animation (implementation Idle giữ nguyên 100%, nằm
                    // riêng trong nhánh else if (!player.isPlunging) bên dưới). Công thức tổng quát:
                    //   Final Hand Position = Base Pose + Movement Sway
                    // (Idle Offset không xuất hiện ở đây vì nhánh này chỉ chạy khi ĐANG DI CHUYỂN,
                    // Idle branch chỉ chạy khi KHÔNG di chuyển — 2 nhánh loại trừ lẫn nhau trong cùng
                    // chuỗi if/else-if, không bao giờ cộng dồn 2 hệ thống cùng lúc).
                    //
                    // Nguồn chính: player.inputVelocity (ĐÃ tự mượt qua lerp ở nơi khác, không dùng
                    // sin(time) độc lập làm chuyển động chính — đúng yêu cầu). Cơ chế inertia: tính
                    // "target offset" tỉ lệ theo tốc độ di chuyển hiện tại, rồi để leftHandSwayVelocity/
                    // rightHandSwayVelocity (giá trị ĐANG hiển thị) lerp CHẬM về target đó — độ trễ
                    // giữa target và giá trị hiển thị chính là cảm giác "quán tính" (tay rớt lại phía
                    // sau khi bắt đầu di chuyển, dần bắt kịp, rồi trễ lại khi dừng/đổi hướng).
                    //
                    // v1 CHỈ positional offset theo trục Y (không rotation, không phase sin phụ, theo
                    // đúng phạm vi đã chốt) — biên độ nhỏ hơn Idle bob, không đụng sword trực tiếp
                    // (sword tự "đi theo" vì là con của rightHand).
                    //
                    // Combo Window Config v1 — BUG FIX: TRƯỚC ĐÂY khối sway này chạy KHÔNG ĐIỀU KIỆN
                    // theo attackState — nếu người chơi di chuyển trong lúc 'comboGrace' (hoàn toàn
                    // có thể, comboGrace CHỈ giảm 35% tốc độ chứ không khóa chân, xem targetSpeed ở
                    // trên), khối này ghi đè rightHand/core/leftHand VỀ base pose + sway offset MỖI
                    // FRAME, phá pose cuối recovery mà updateCombat() đang cố giữ nguyên — cùng loại
                    // bug với nhánh Idle bob đã sửa. Từ v2: bỏ qua HOÀN TOÀN khối sway khi đang
                    // 'comboGrace' — tay/core/leftHand đứng yên đúng pose recovery bất kể có di chuyển
                    // hay không, updateCombat() là nguồn DUY NHẤT quyết định pose trong state này.
                    if (player.attackState !== 'comboGrace') {
                        const swaySpeed = player.inputVelocity.length(); // m/s hiện tại
                        // targetSwayOffset: lệch xuống nhẹ theo tốc độ — mô phỏng tay "trĩu" xuống do
                        // quán tính khi di chuyển, giới hạn trần để không bao giờ lệch quá xa base pose
                        // (yêu cầu: "rất nhẹ ở v1", floating elemental creature, không giống humanoid chạy).
                        const targetSwayOffset = -Math.min(swaySpeed * 0.006, 0.05);
                        // Lerp CHẬM hơn hẳn so với lerpFactor thường dùng (12-15) ở nơi khác trong file
                        // này — đây chính là "độ trễ" tạo cảm giác quán tính, không phải lag do thiếu
                        // tối ưu code.
                        const swayLerpFactor = 1 - Math.exp(-6 * dt);
                        player.leftHandSwayVelocity += (targetSwayOffset - player.leftHandSwayVelocity) * swayLerpFactor;
                        player.rightHandSwayVelocity += (targetSwayOffset - player.rightHandSwayVelocity) * swayLerpFactor;

                        const visCfg = getActiveCharacterData().visualConfig;
                        const resetLerpFactor = 1 - Math.exp(-15 * dt); // giữ nguyên tốc độ hồi Core/rotation.z như trước
                        player.core.position.y += (visCfg.corePosition.y - player.core.position.y) * resetLerpFactor;
                        player.leftHand.position.y = visCfg.leftHandPosition.y + player.leftHandSwayVelocity;
                        player.leftHand.rotation.z += (0 - player.leftHand.rotation.z) * resetLerpFactor; // v1: không rotation sway
                        player.rightHand.position.y = visCfg.rightHandPosition.y + player.rightHandSwayVelocity;
                        // Combo Attack System v4: X/Z position + rotation.x/y KHÔNG có sway riêng
                        // (v1 chỉ sway theo Y, xem comment "v1 CHỈ positional offset theo trục Y" phía
                        // trên) — lerp chúng về đúng base pose mới bằng resetLerpFactor sẵn có, TÁCH
                        // RIÊNG khỏi Y (Y vẫn do sway điều khiển ở dòng trên, không gọi
                        // applyRightHandBasePose() ở đây vì nó sẽ ghi đè Y bằng lerp thường, phá sway).
                        {
                            const baseRot = visCfg.rightHandBaseRotation || { x: 0, y: 0, z: 0 };
                            player.rightHand.position.x += (visCfg.rightHandPosition.x - player.rightHand.position.x) * resetLerpFactor;
                            player.rightHand.position.z += (visCfg.rightHandPosition.z - player.rightHand.position.z) * resetLerpFactor;
                            player.rightHand.rotation.x += (baseRot.x - player.rightHand.rotation.x) * resetLerpFactor;
                            player.rightHand.rotation.y += (baseRot.y - player.rightHand.rotation.y) * resetLerpFactor;
                            player.rightHand.rotation.z += (baseRot.z - player.rightHand.rotation.z) * resetLerpFactor;
                        }
                    }

                    const targetAngle = Math.atan2(player.inputVelocity.x, player.inputVelocity.z);
                    let angleDiff = targetAngle - player.mesh.rotation.y;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    player.mesh.rotation.y += angleDiff * (1 - Math.exp(-14 * dt));

                    const targetTiltX = Math.min(player.inputVelocity.length() * 0.012, 0.18);
                    player.tiltRoot.rotation.x += (targetTiltX - player.tiltRoot.rotation.x) * (1 - Math.exp(-12 * dt));
                    
                    // Phục hồi lại trục nghiêng thân (nếu trước đó đã nghiêng ngả do bơi lội)
                    player.tiltRoot.rotation.z += (0 - player.tiltRoot.rotation.z) * (1 - Math.exp(-12 * dt));

                    if (player.attackState === 'idle') {
                        {
                            const grip = getWeaponGripRotation(); // Character Foundation v2: fallback an toàn nếu thiếu weaponGrip
                            player.sword.rotation.set(grip.x + player.tiltRoot.rotation.x, grip.y, grip.z);
                        }
                    }
                    player.sword.visible = true;
                } else if (!player.isPlunging) {
                    player.tiltRoot.rotation.x += (0 - player.tiltRoot.rotation.x) * (1 - Math.exp(-15 * dt));
                    
                    player.tiltRoot.rotation.z += (0 - player.tiltRoot.rotation.z) * (1 - Math.exp(-15 * dt));

                    if (player.attackState === 'idle') {
                        {
                            const grip = getWeaponGripRotation(); // Character Foundation v2: fallback an toàn nếu thiếu weaponGrip
                            player.sword.rotation.set(grip.x + player.tiltRoot.rotation.x, grip.y, grip.z);
                        }

                        // --- IDLE ANIMATION (Character Foundation) — procedural bob bằng sin(),
                        // KHÔNG phụ thuộc FPS (dùng idleAnimTimer tích lũy theo dt). Core/LeftHand/
                        // RightHand dao động NHẸ quanh base pose (visualConfig.corePosition/
                        // leftHandPosition/rightHandPosition) — CỘNG offset tương đối lên base, KHÔNG
                        // gán tọa độ tuyệt đối, để không phá vị trí đã thiết kế thủ công. Weapon
                        // không cần animation riêng — nó là con của rightHand nên tự động đi theo.
                        player.idleAnimTimer += dt;
                        const visCfg = getActiveCharacterData().visualConfig;
                        const t = player.idleAnimTimer;

                        // Core: biên độ nhỏ nhất trong 3 bộ phận, chỉ bob theo trục Y.
                        const coreBobSpeed = 1.6, coreBobAmount = 0.035;
                        player.core.position.y = visCfg.corePosition.y + Math.sin(t * coreBobSpeed) * coreBobAmount;

                        // LeftHand: biên độ nhỏ hơn Core (theo yêu cầu), lệch phase riêng, có thêm
                        // rotation nhẹ (KHÔNG phải vung mạnh — biên độ rotation rất nhỏ).
                        const handBobSpeed = 1.6, handBobAmount = 0.022;
                        const leftPhase = 0.6;
                        player.leftHand.position.y = visCfg.leftHandPosition.y + Math.sin(t * handBobSpeed + leftPhase) * handBobAmount;
                        player.leftHand.rotation.z = Math.sin(t * handBobSpeed + leftPhase) * 0.05;

                        // RightHand: cùng biên độ với LeftHand nhưng lệch phase KHÁC (không đồng bộ
                        // tuyệt đối với LeftHand), giữ vị trí đủ gần base để Weapon (con của
                        // rightHand) không đổi tư thế Idle quá nhiều.
                        //
                        // Combo Attack System v4: base pose giờ có rightHandBaseRotation khác 0 (tay
                        // nghiêng phải ở idle, xem file 10) — rotation.z bob PHẢI dao động QUANH
                        // baseRot.z (cộng thêm), KHÔNG còn quanh 0 như trước, nếu không idle bob sẽ
                        // kéo tay về thẳng đứng giữa các nhịp sin(), phá dáng nghiêng đã thiết kế.
                        // X/Z position + rotation.x/y không có bob riêng (v1 chỉ bob theo Y/rotation.z)
                        // — lerp NHANH về base pose mới mỗi frame (không cần lerpFactor mượt vì idle
                        // đứng yên, không có chuyển động nguồn nào tạo giật ở 2 trục này).
                        const rightPhase = 2.4;
                        const baseRot = visCfg.rightHandBaseRotation || { x: 0, y: 0, z: 0 };
                        player.rightHand.position.x = visCfg.rightHandPosition.x;
                        player.rightHand.position.y = visCfg.rightHandPosition.y + Math.sin(t * handBobSpeed + rightPhase) * handBobAmount;
                        player.rightHand.position.z = visCfg.rightHandPosition.z;
                        player.rightHand.rotation.x = baseRot.x;
                        player.rightHand.rotation.y = baseRot.y;
                        player.rightHand.rotation.z = baseRot.z + Math.sin(t * handBobSpeed + rightPhase) * 0.05;
                    } else if (player.attackState !== 'comboGrace') {
                        // Idle bob TẠM DỪNG khi đang tấn công (attackState !== 'idle', theo yêu cầu
                        // đã xác nhận) — lerp mượt Core/LeftHand/RightHand VỀ ĐÚNG base pose thay vì
                        // để chúng "kẹt" ở vị trí lệch cuối cùng của dao động sin() khi rời Idle.
                        // KHÔNG reset idleAnimTimer (giữ pha dao động liên tục, để khi quay lại Idle
                        // không bị giật do nhảy pha đột ngột).
                        //
                        // Combo Window Config v1 — BUG FIX: TRƯỚC ĐÂY nhánh này chạy cho MỌI
                        // attackState khác 'idle', kể cả 'comboGrace' — nghĩa là mỗi frame trong lúc
                        // comboGrace, applyRightHandBasePose() kéo rightHand/core VỀ base pose (idle),
                        // ĐÈ LÊN pose cuối recovery mà updateCombat() (chạy SAU updatePhysics() trong
                        // cùng frame, xem game loop) đã cố tình giữ nguyên không đổi — kết quả quan sát
                        // được là tay "trôi dần về idle" trong suốt comboGrace thay vì đứng yên đúng
                        // pose recovery. Từ v2: loại trừ 'comboGrace' khỏi nhánh này — updateCombat()
                        // chịu trách nhiệm DUY NHẤT giữ nguyên pose trong state đó, ở đây không đụng gì.
                        const visCfg = getActiveCharacterData().visualConfig;
                        const lerpFactor = 1 - Math.exp(-15 * dt);
                        player.core.position.y += (visCfg.corePosition.y - player.core.position.y) * lerpFactor;
                        player.leftHand.position.y += (visCfg.leftHandPosition.y - player.leftHand.position.y) * lerpFactor;
                        player.leftHand.rotation.z += (0 - player.leftHand.rotation.z) * lerpFactor;
                        applyRightHandBasePose(lerpFactor);
                        // Arm Sway v1: xem giải thích ở nhánh isSwimming phía trên.
                        player.leftHandSwayVelocity += (0 - player.leftHandSwayVelocity) * lerpFactor;
                        player.rightHandSwayVelocity += (0 - player.rightHandSwayVelocity) * lerpFactor;
                    }
                    player.sword.visible = true;
                } else {
                    // Idle Animation (Character Foundation): trường hợp CÒN LẠI duy nhất không rơi
                    // vào 4 nhánh trên — player.isPlunging === true. Xem giải thích ở nhánh isSwimming
                    // phía trên. KHÔNG đụng tiltRoot/sword/logic Plunge khác (nằm ở combat.js).
                    const visCfg = getActiveCharacterData().visualConfig;
                    const lerpFactor = 1 - Math.exp(-15 * dt);
                    player.core.position.y += (visCfg.corePosition.y - player.core.position.y) * lerpFactor;
                    player.leftHand.position.y += (visCfg.leftHandPosition.y - player.leftHand.position.y) * lerpFactor;
                    player.leftHand.rotation.z += (0 - player.leftHand.rotation.z) * lerpFactor;
                    applyRightHandBasePose(lerpFactor);
                    // Arm Sway v1: xem giải thích ở nhánh isSwimming phía trên.
                    player.leftHandSwayVelocity += (0 - player.leftHandSwayVelocity) * lerpFactor;
                    player.rightHandSwayVelocity += (0 - player.rightHandSwayVelocity) * lerpFactor;
                }

                // --- CẬP NHẬT VẬT THỂ TƯƠNG TÁC GẦN NHẤT ---
                for (let i = 0; i < interactables.length; i++) {
                    if (typeof interactables[i].update === 'function') interactables[i].update(dt);
                }
                let closestInteractable = null;
                let closestDistSq = Infinity;
                for (let i = 0; i < interactables.length; i++) {
                    const obj = interactables[i];
                    const distSq = obj.distanceSqTo(player.position);
                    const radiusSq = obj.interactionRadius * obj.interactionRadius;
                    if (distSq <= radiusSq && distSq < closestDistSq) {
                        closestDistSq = distSq;
                        closestInteractable = obj;
                    }
                }
                window.nearbyInteractable = closestInteractable;
                // Gọi mỗi frame khi có vật trong tầm (không chỉ lúc đổi object) để prompt text
                // luôn phản ánh đúng trạng thái hiện tại (VD: quest vừa hoàn thành lúc đang đứng gần).
                if (window.updateInteractPrompt) window.updateInteractPrompt(closestInteractable);

                syncHUDVariables();
            }

            // --- updateStamina(dt) — Pre-Alpha Stabilization: Stamina System Rework ---
            // Tách hoàn toàn khỏi updatePhysics() để dễ đọc/bảo trì/mở rộng — mọi thông số lấy từ
            // STAMINA_CONFIG (02-collision-and-stats-core.js), không hardcode số nào ở đây. Được gọi ở
            // ĐÚNG vị trí cũ trong updatePhysics() (trước khối input-movement xác định lại
            // isSprinting/swimState của frame hiện tại) — giữ nguyên hành vi "dùng state frame trước để
            // tính tiêu hao frame này" của bản gốc, không đảo thứ tự.
            //
            // STATE MACHINE — đúng 8 trạng thái theo spec, mỗi trạng thái xác định rõ CÓ tiêu hao hay
            // không / tiêu bao nhiêu / CÓ được hồi hay không:
            //   Idle/Walking/Running (không Sprint, không Dash, không Climb/Swim/Glide) → được hồi (sau delay)
            //   Sprint       → tiêu SPRINT_COST_PER_SECOND/s, chặn hồi, reset delay
            //   Dash         → tiêu DASH_COST tức thời (xử lý ở triggerDash(), KHÔNG ở đây) + trong suốt
            //                   animation Dash (isDashing=true) vẫn chặn hồi/reset delay như Sprint
            //   Climbing     → di chuyển trên tường: tiêu CLIMB_COST_PER_SECOND/s; đứng yên trên tường: không tiêu
            //   Climb Jump   → tiêu CLIMB_JUMP_COST tức thời (xử lý ở nhánh jumpRequested phía dưới, KHÔNG ở đây)
            //   Swimming     → xem 3 nhánh con: Swim Stroke / Swim Sprint / Floating-Idle
            //   Gliding      → tiêu GLIDE_COST_PER_SECOND/s liên tục
            //
            // Dash và Climb Jump tiêu hao TỨC THỜI tại đúng thời điểm hành động xảy ra (không phải mỗi
            // frame) nên vẫn nằm ở triggerDash()/nhánh jumpRequested như bản gốc — updateStamina() chỉ
            // xử lý phần LIÊN TỤC theo dt + cờ chặn-hồi khi các hành động đó đang diễn ra.
            function updateStamina(dt) {
                let isConsumingStamina = false; // true → chặn hồi phục + reset regen delay timer frame này

                if (player.isClimbing) {
                    // --- CLIMBING ---
                    let isMovingOnWall = false;
                    if (joystickActive && (Math.abs(joystickDelta.x) > 0.1 || Math.abs(joystickDelta.y) > 0.1)) {
                        isMovingOnWall = true;
                    } else if (keys.w || keys.s || keys.a || keys.d) {
                        isMovingOnWall = true;
                    }

                    if (player.climbJumpTimer > 0) {
                        // Climb Jump: chi phí tức thời đã trừ ở nhánh jumpRequested (25.0 —
                        // STAMINA_CONFIG.CLIMB_JUMP_COST) — không trừ thêm liên tục ở đây, nhưng VẪN
                        // coi là đang tiêu hao để chặn hồi phục trong lúc animation nhảy-leo diễn ra.
                        isConsumingStamina = true;
                    } else if (isMovingOnWall) {
                        player.stamina = Math.max(STAMINA_CONFIG.MIN_STAMINA, player.stamina - STAMINA_CONFIG.CLIMB_COST_PER_SECOND * dt);
                        isConsumingStamina = true;
                    }
                    // Đứng yên trên tường (không di chuyển, không vừa nhảy) → không tiêu, nhưng cũng
                    // KHÔNG hồi (Climbing không nằm trong danh sách "được hồi" của spec — chỉ Idle mới
                    // hồi). isConsumingStamina giữ false ở nhánh này là ĐÚNG Ý: không tiêu VÀ không hồi,
                    // xử lý bằng cách bỏ qua regen thay vì thêm cờ riêng — xem khối regen bên dưới.

                    if (player.stamina <= STAMINA_CONFIG.MIN_STAMINA) {
                        // Hết Stamina khi đang leo: mất lực bám, hủy Climbing, rơi tự do.
                        player.isClimbing = false;
                        player.velocity.set(0, -3.0, 0);
                        sfx.playBlockedSound();
                    }

                } else if (player.isSwimming) {
                    // --- SWIMMING: 3 nhánh con — Swim Sprint / Swim Stroke / Floating-Idle ---
                    if (player.swimState === 'fast') {
                        // Swim Sprint: chi phí KHỞI ĐỘNG (SWIM_SPRINT_START_COST) đã trừ tức thời tại
                        // đúng thời điểm chuyển sang 'fast' (xem nhánh gán swimState='fast' trong khối
                        // input-movement bên dưới, updatePhysics()) — ở đây chỉ trừ phần LIÊN TỤC.
                        // Swim Stroke Timer KHÔNG chạy trong trạng thái này (đúng spec).
                        player.stamina = Math.max(STAMINA_CONFIG.MIN_STAMINA, player.stamina - STAMINA_CONFIG.SWIM_SPRINT_COST_PER_SECOND * dt);
                        isConsumingStamina = true;
                        player.swimStrokeTimer = 0.0; // reset để không cộng dồn sai khi rời Swim Sprint

                        if (player.stamina <= STAMINA_CONFIG.MIN_STAMINA) {
                            // LỖ HỔNG ĐÃ VÁ (xem lịch sử trò chuyện): nếu chỉ chuyển về 'slow' mà không
                            // trigger gì, Swim Stroke Timer ở nhánh 'slow' bên dưới sẽ KHÔNG BAO GIỜ
                            // chạy được (bị chặn bởi "stamina > MIN_STAMINA") — nhân vật sẽ kẹt bơi
                            // 'slow' với 0 stamina vĩnh viễn, không bao giờ kích hoạt đuối nước. Quyết
                            // định đã chốt: coi Swim Sprint cạn sạch = hết sức NGAY, không chờ 1 Swim
                            // Stroke hoàn thành như nhánh 'slow' thường.
                            player.swimState = 'slow';
                            player.isStaminaExhausted = true;
                            triggerDrowningSequence();
                            return;
                        }
                    } else if (player.swimState === 'slow') {
                        // Swim Stroke: bơi thường + đang di chuyển. Trừ theo NHỊP (mỗi
                        // SWIM_STROKE_INTERVAL giây trừ SWIM_STROKE_COST 1 lần), KHÔNG trừ theo dt mỗi
                        // frame — bộ đếm này ĐỘC LẬP hoàn toàn với swimOscillationTimer (chỉ phục vụ
                        // animation/tilt mesh, xem updatePhysics() phần XOAY/NGHIÊNG KHI BƠI).
                        isConsumingStamina = true; // đang bơi chủ động → chặn hồi phục dù có thể chưa tới nhịp trừ

                        if (player.stamina > STAMINA_CONFIG.MIN_STAMINA) {
                            player.swimStrokeTimer += dt;
                            if (player.swimStrokeTimer >= STAMINA_CONFIG.SWIM_STROKE_INTERVAL) {
                                player.swimStrokeTimer -= STAMINA_CONFIG.SWIM_STROKE_INTERVAL; // giữ phần dư thay vì reset về 0 tuyệt đối — tránh trôi nhịp khi dt không đều
                                player.stamina = Math.max(STAMINA_CONFIG.MIN_STAMINA, player.stamina - STAMINA_CONFIG.SWIM_STROKE_COST);

                                if (player.stamina <= STAMINA_CONFIG.MIN_STAMINA) {
                                    // Đúng spec "Hết Stamina": Stroke hiện tại vẫn hoàn thành bình
                                    // thường (đã trừ ở trên, clamp về 0), nhưng KHÔNG được bắt đầu
                                    // Stroke tiếp theo — chặn bằng isStaminaExhausted, timer đứng yên.
                                    player.isStaminaExhausted = true;
                                    player.swimStrokeTimer = 0.0;
                                }
                            }
                        }
                    } else {
                        // Floating/Idle trong nước (swimState === 'idle'): hoàn toàn trung lập — không
                        // tiêu, không hồi. isConsumingStamina giữ false nhưng khối regen bên dưới sẽ
                        // TỰ BỎ QUA nhánh idle-swim nhờ kiểm tra player.isSwimming riêng — xem dưới.
                        player.swimStrokeTimer = 0.0; // reset để lần bơi tiếp theo bắt đầu nhịp mới, không cộng dồn thời gian đứng yên
                    }

                    // Kích hoạt Đuối Nước khi Swim Stroke cạn sạch Stamina (nhánh 'fast'/Swim Sprint đã
                    // tự xử lý + return riêng ở trên) — giữ đúng hành vi gốc: ngắt update vật lý ngay
                    // khi trigger.
                    if (player.stamina <= STAMINA_CONFIG.MIN_STAMINA && player.isStaminaExhausted) {
                        triggerDrowningSequence();
                        return; // Ngắt updateStamina() — updatePhysics() cũng return theo do isDead sẽ true
                    }

                } else if (player.isGliding) {
                    // --- GLIDING (MỚI — trước đây không tiêu hao gì) ---
                    player.stamina = Math.max(STAMINA_CONFIG.MIN_STAMINA, player.stamina - STAMINA_CONFIG.GLIDE_COST_PER_SECOND * dt);
                    isConsumingStamina = true;

                    if (player.stamina <= STAMINA_CONFIG.MIN_STAMINA) {
                        // Hết Stamina khi lượn: kết thúc Gliding, rơi tự do (deactivateGlider() đã tắt
                        // isGliding + ẩn glider mesh; velocity giữ nguyên, gravity ở khối XỬ LÝ LỰC phía
                        // trên updatePhysics() sẽ tự kéo nhân vật rơi ngay khung hình kế tiếp).
                        deactivateGlider();
                    }

                } else {
                    // --- ON-GROUND: Idle / Walking / Running / Sprint / Charged Attack ---
                    const isChargedAttackActive = (player.attackState === 'chargedWindup' || player.attackState === 'chargedActive' || player.attackState === 'chargedRecovery');
                    if (player.isSprinting || player.isDashing || isChargedAttackActive) {
                        // Sprint: tiêu liên tục theo dt. Dash: chi phí tức thời đã trừ ở triggerDash()
                        // (STAMINA_CONFIG.DASH_COST), ở đây KHÔNG trừ thêm liên tục — nhưng suốt thời
                        // gian animation Dash (isDashing=true) vẫn coi là đang tiêu hao để chặn hồi
                        // phục + reset delay, đúng spec "Dash ngay lập tức hủy hồi, reset bộ đếm 1.5s".
                        // Charged Attack: ÁP DỤNG ĐÚNG CÙNG QUY TẮC (yêu cầu đã xác nhận — "độ trễ
                        // regen khi dùng Charged Attack giống như khi dùng Dash"). Chi phí tức thời
                        // (staminaCost) đã trừ ở triggerChargedAttack() (combat.js) NGAY lúc kích hoạt
                        // — ở ĐÂY KHÔNG trừ thêm liên tục gì cả, chỉ coi suốt 3 giai đoạn
                        // chargedWindup/chargedActive/chargedRecovery là "đang tiêu hao" để chặn hồi +
                        // reset bộ đếm delay mỗi frame, giống hệt cách isDashing hoạt động — độ trễ
                        // REGEN_DELAY_SECONDS (1.5s) chỉ THỰC SỰ bắt đầu đếm ngược SAU KHI
                        // chargedRecovery kết thúc (attackState về 'idle'), không phải ngay lúc trừ
                        // stamina lúc bắt đầu chargedWindup.
                        if (player.isSprinting) {
                            player.stamina = Math.max(STAMINA_CONFIG.MIN_STAMINA, player.stamina - STAMINA_CONFIG.SPRINT_COST_PER_SECOND * dt);
                        }
                        isConsumingStamina = true;

                        if (player.stamina <= STAMINA_CONFIG.MIN_STAMINA && player.isSprinting) {
                            // Hết Stamina khi Sprint: tự động dừng Sprint, chuyển về chạy/đi bộ thường.
                            player.isSprinting = false;
                        }
                    }
                    // Idle/Walking/Running (không Sprint/Dash/Charged Attack) → isConsumingStamina giữ
                    // false, rơi vào khối regen bên dưới như bình thường.
                }

                // --- HỒI PHỤC (REGEN) — áp dụng cho MỌI trạng thái KHÔNG tiêu hao, TRỪ Climbing (đứng
                // yên trên tường không hồi) và Floating/Idle dưới nước (trung lập tuyệt đối) — 2 ngoại
                // lệ này đã tự "return" sớm hoặc rơi vào đây với điều kiện chặn riêng bên dưới. ---
                const isNeutralNoRegenState = (player.isClimbing) || (player.isSwimming && player.swimState === 'idle');

                if (isConsumingStamina) {
                    // Đang tiêu hao (Sprint/Dash/Climb-di-chuyển/Climb-Jump/Swim-Stroke/Swim-Sprint/
                    // Glide) → HỦY hồi ngay lập tức + RESET bộ đếm delay về đầy, đúng spec.
                    player.staminaRegenDelayTimer = STAMINA_CONFIG.REGEN_DELAY_SECONDS;
                } else if (!isNeutralNoRegenState) {
                    // Không tiêu hao và không phải trạng thái trung lập (VD Idle/Walking/Running trên
                    // cạn, hoặc vừa buông Sprint/Dash) → đếm ngược delay rồi hồi.
                    if (player.staminaRegenDelayTimer > 0) {
                        player.staminaRegenDelayTimer = Math.max(0, player.staminaRegenDelayTimer - dt);
                    } else {
                        player.stamina = Math.min(player.maxStamina, player.stamina + STAMINA_CONFIG.REGEN_PER_SECOND * dt);
                        // Đã hồi được (dù chỉ 1 chút) → Stamina chắc chắn > 0, gỡ cờ hết-sức nếu còn sót
                        // lại từ lần Swim Stroke cạn kiệt trước đó (VD người chơi đã lên bờ/hết bơi).
                        if (player.isStaminaExhausted && player.stamina > STAMINA_CONFIG.MIN_STAMINA) {
                            player.isStaminaExhausted = false;
                        }
                    }
                }

                // Gỡ cờ hết-sức ngay khi rời khỏi trạng thái Swimming hẳn (VD lên bờ) — tránh cờ này
                // vô tình rò rỉ sang ảnh hưởng Sprint/Climb ở lần bơi tiếp theo nếu logic mở rộng sau
                // này (Food/Talent/Passive) có đọc lại field này theo cách khác.
                if (!player.isSwimming && player.isStaminaExhausted) {
                    player.isStaminaExhausted = false;
                }
            }

            // ============================================================
            // Weapon Visual System — setWeaponEmissive(hex)
            // ============================================================
            // Trước đây code gọi TRỰC TIẾP player.sword.material.emissive.setHex(hex) ở 5 chỗ trong
            // updateCombat() (glow full-charge lúc Charged Attack Sword) — giả định player.sword LUÔN
            // là 1 THREE.Mesh có .material. Từ khi có Weapon Visual System (buildWeaponMesh(),
            // 04-scene-init.js), player.sword có thể là THREE.Group (VD Bow — thân cung + dây cung là
            // 2 Mesh con riêng, Group không có .material) -> gọi trực tiếp sẽ crash
            // ("Cannot read properties of undefined (reading 'emissive')") NGAY CẢ Ở TRẠNG THÁI IDLE
            // (dòng "if (player.attackState === 'idle') { player.sword.material.emissive... }" chạy
            // MỖI FRAME bất kể weaponType).
            //
            // setWeaponEmissive() dùng traverse() để tự tìm MỌI mesh con có .material bên trong
            // player.sword (hoạt động ĐÚNG Y HỆT cho trường hợp cũ — player.sword là 1 Mesh đơn,
            // traverse() vẫn duyệt qua chính nó — VÀ an toàn cho Group nhiều mesh con). Mesh không có
            // material.emissive (VD MeshBasicMaterial như dây cung — không hỗ trợ emissive) được bỏ
            // qua an toàn qua optional chaining, không crash, không cần khai báo riêng từng loại vũ khí.
            function setWeaponEmissive(hex) {
                if (!player.sword) return;
                player.sword.traverse(obj => {
                    if (obj.material && obj.material.emissive) obj.material.emissive.setHex(hex);
                });
            }
            window.setWeaponEmissive = setWeaponEmissive;

            function updateCombat(dt) {
                updateSkillAim(dt);

                const combatStateTag = document.getElementById('combat-state-tag');
                if (player.isPlunging) {
                    if (combatStateTag) {
                        combatStateTag.textContent = 'PLUNGE';
                        combatStateTag.className = 'text-right text-red-500 font-bold animate-pulse';
                    }
                    return;
                }

                if (player.attackState === 'idle') {
                    setWeaponEmissive(0x000000); 
                    return; 
                }

                // Charged Attack v1 — Buffer nối tiếp: đếm chargedRebuffTimer trong SUỐT 3 giai đoạn
                // chargedWindup/chargedActive/chargedRecovery (không riêng gì recovery — người chơi
                // có thể bắt đầu giữ lại ngay từ lúc đòn hiện tại còn đang windup/active, miễn giữ ĐỦ
                // chargeTime tính TỪ LÚC BẮT ĐẦU GIỮ LẠI thì được buffer). Đặt ở ĐẦU updateCombat()
                // (chạy TRƯỚC mọi nhánh con windup/active/recovery của CẢ Normal Attack lẫn Charged
                // Attack) để không phải lặp code 3 lần trong 3 nhánh chargedX bên dưới, và không ảnh
                // hưởng gì tới windup/active/recovery/comboGrace của Normal Attack (điều kiện chỉ
                // đúng khi đang ở 1 trong 3 state Charged Attack).
                //
                // Quy tắc đã xác nhận: CHỈ tính buffer khi người chơi THẢ TAY RA rồi GIỮ LẠI TỪ ĐẦU
                // trong lúc đòn hiện tại đang chạy — giữ LIÊN TỤC không thả tay xuyên suốt (từ lúc
                // charge lần 1) KHÔNG được tính. chargedRebuffArmed đánh dấu "đã thả tay ít nhất 1
                // lần trong đòn hiện tại" — chỉ khi đã armed thì chargedRebuffTimer mới bắt đầu đếm.
                // PHẢI giữ đủ chargeTime lần 2 (tính từ lúc bắt đầu giữ lại) mới được đánh dấu buffer
                // — thả ra giữa chừng thì reset chargedRebuffTimer về 0 (vẫn giữ armed=true, giữ lại
                // lần nữa vẫn tính, vì đã có ít nhất 1 lần thả tay rồi).
                const isChargedAttackRunning = (player.attackState === 'chargedWindup' || player.attackState === 'chargedActive' || player.attackState === 'chargedRecovery');
                if (isChargedAttackRunning) {
                    if (!player.isAttackHeld) {
                        // Thả tay ra -> "arm" cho phép đếm buffer nếu giữ lại sau đó, đồng thời reset
                        // timer (chưa giữ lại thì chưa tính gì).
                        player.chargedRebuffArmed = true;
                        player.chargedRebuffTimer = 0;
                    } else if (player.chargedRebuffArmed && !player.chargedAttackBuffered) {
                        // Đang giữ lại (SAU KHI đã từng thả tay ít nhất 1 lần) và chưa đủ giờ.
                        player.chargedRebuffTimer += dt;
                        if (player.chargedRebuffTimer >= getChargedAttackConfig().chargeTime) {
                            player.chargedAttackBuffered = true;
                        }
                    }
                    // else: đang giữ liên tục xuyên suốt (chưa từng thả tay -> chargedRebuffArmed vẫn
                    // false) -> không đếm gì, đúng theo yêu cầu.
                }

                // Charged Attack v1 — Giữ nút xuyên suốt/mousedown mới trong recovery/comboGrace: đếm
                // heldThroughComboTimer trong SUỐT 'recovery'/'comboGrace' của Normal Attack (yêu cầu
                // đã xác nhận: charge được phép bắt đầu bất kỳ lúc nào trong Combo Window — CẢ khi
                // giữ liên tục từ windup/active LẪN khi mousedown MỚI xảy ra ngay lúc đang
                // recovery/comboGrace — 2 trường hợp NÀY ĐỀU phải đợi đủ độ trễ, không được charge
                // ngay). CHỈ khi isAttackHeld giữ true LIÊN TỤC quá ngưỡng HELD_THROUGH_COMBO_DELAY
                // (combat.js) mới thực sự gọi handleAttackDown(true) để bắt đầu charge — tham số
                // fromHeldDelay=true báo cho hàm đó biết đã đợi đủ độ trễ, được phép rẽ vào nhánh
                // charge dù đang ở recovery/comboGrace (xem handleAttackDown() trong combat.js — nếu
                // KHÔNG truyền true, mousedown trong 2 state này chỉ set attackBuffered=true như combo
                // bình thường, KHÔNG charge ngay — tránh bug "cướp" combo khi tap nhanh). Timer được
                // RESET về 0 ngay lúc vừa chuyển vào recovery (xem khối active->recovery ở trên) hoặc
                // lúc mouseup (handleAttackUp() trong combat.js) — ở đây CHỈ cộng dồn, không tự reset.
                const isInComboWindow = (player.attackState === 'recovery' || player.attackState === 'comboGrace');
                if (isInComboWindow && player.isAttackHeld) {
                    player.heldThroughComboTimer += dt;
                    if (player.heldThroughComboTimer >= HELD_THROUGH_COMBO_DELAY) {
                        handleAttackDown(true);
                    }
                }

                // Charged Attack v1 — 'charging': nhánh RIÊNG, KHÔNG dùng player.attackTimer (biến
                // đó thuộc về windup/active/recovery/comboGrace của Normal Attack) — dùng
                // player.chargeTimer đếm XUÔI (không phải đếm ngược) thời gian đang giữ nút. Return
                // sớm TRƯỚC dòng "player.attackTimer -= dt" bên dưới để không đụng gì tới state
                // machine Normal Attack.
                //
                // Auto-trigger v2: KHI chargeTimer đạt chargeTime, Charged Attack THI TRIỂN NGAY LẬP
                // TỨC tại đây — KHÔNG còn chờ handleAttackUp()/release nữa (khác v1 cũ). Yêu cầu đã
                // xác nhận: "nhấn giữ -> đủ thời gian -> kích hoạt luôn, không cần thả".
                //
                // Stamina Gate: triggerChargedAttack() trả về false nếu KHÔNG đủ Stamina (xem
                // combat.js — kiểm tra + trừ Stamina nằm trọn trong hàm đó, KHÔNG lặp lại logic ở
                // đây). Yêu cầu đã xác nhận: nếu không đủ Stamina, HỦY CHARGE NGAY LẬP TỨC (về idle),
                // KHÔNG đợi người chơi thả tay — snap tay/kiếm về base pose (population TƯƠNG TỰ
                // pattern snap-về-idle đã dùng ở nơi khác — comboIndex/attackBuffered KHÔNG bị đụng gì
                // ở đây vì nhánh 'charging' này chưa từng chạm tới chúng).
                if (player.attackState === 'charging') {
                    if (combatStateTag) { combatStateTag.textContent = 'CHARGING'; combatStateTag.className = 'text-right text-orange-400 font-bold animate-pulse'; }

                    // Character #2 (Bow) Validation — BUGFIX: dispatch Bow PHẢI đợi ĐÚNG "Existing
                    // Charged Attack hold condition" (chargeTimer >= chargeTime) TRƯỚC KHI vào Aim Mode
                    // — giống hệt Sword. Bản patch trước đây dispatch triggerBowChargedAttack() NGAY
                    // frame đầu tiên attackState chuyển sang 'charging' (tức NGAY khi mousedown), coi
                    // "vừa nhấn nút" = "đã đạt điều kiện Charged Attack" — sai, vì handleAttackDown()
                    // (combat.js) set 'charging' NGAY từ mousedown cho MỌI lần bấm (kể cả tap nhanh cho
                    // Normal Attack), chỉ có chargeTimer đạt ngưỡng chargeTime mới thực sự xác nhận
                    // "người chơi ĐANG GIỮ đủ lâu". Hệ quả bug: Normal Attack (tap ngắn) cũng kích hoạt
                    // Aim Mode/crosshair trong khoảnh khắc trước khi handleAttackUp() (combat.js) kịp
                    // cắt ngang, gây crosshair hiện chớp nhoáng dù chưa đủ điều kiện Charged Attack.
                    //
                    // Sửa: Bow giờ CŨNG đếm player.chargeTimer += dt và so sánh với ĐÚNG
                    // getChargedAttackConfig().chargeTime — TÁI SỬ DỤNG NGUYÊN threshold/biến đếm của
                    // Sword (spec mục 7: "Behavior chung được reuse") — CHỈ khác hành động khi đạt
                    // ngưỡng (rẽ nhánh dưới: Sword -> triggerChargedAttack()/chargedWindup, Bow ->
                    // triggerBowChargedAttack()/Aim Mode). Trong lúc CHƯA đạt ngưỡng, Bow không làm gì
                    // khác Sword đang làm (chỉ tăng timer, return, đợi frame sau) — nếu người chơi thả
                    // tay trước khi đạt ngưỡng, handleAttackUp() (combat.js, ĐÃ có sẵn nhánh
                    // isBowChargedAiming trước đó bị gọi NHẦM — xem BUGFIX #2 dưới) sẽ tự quay lại đúng
                    // "Existing Charged Attack Condition" cũ: hủy charge, chạy Normal Attack qua
                    // handleAttackInput() — HÀNH VI Y HỆT SWORD, không cần thêm code riêng.
                    player.chargeTimer += dt;
                    if (player.chargeTimer < getChargedAttackConfig().chargeTime) return;

                    if (getActiveWeaponType() === 'bow') {
                        // Character #2 (Bow) Validation — chargeTimer/chargeReady KHÔNG còn ý nghĩa gì
                        // sau điểm này (Bow chuyển hẳn sang bowAimChargeTimer bên trong
                        // triggerBowChargedAttack(), xem combat.js) — reset về 0 để tránh giá trị cũ rò
                        // rỉ sang lần charge kế tiếp (đối xứng với reset chargeTimer=0 lúc bắt đầu
                        // 'charging' ở handleAttackDown()).
                        player.chargeTimer = 0;
                        triggerBowChargedAttack();
                        return;
                    }

                    {
                        const activated = triggerChargedAttack();
                        if (!activated) {
                            // Không đủ Stamina -> hủy charge NGAY, về idle (yêu cầu đã xác nhận —
                            // KHÔNG đợi thả tay). isAttackHeld GIỮ NGUYÊN giá trị hiện tại (không đổi
                            // ở đây) — nếu người chơi vẫn đang giữ nút sau khi bị hủy, KHÔNG tự động
                            // làm gì thêm (không tự bắt đầu charge lại, không tự đánh Normal Attack) —
                            // phải thả tay rồi bấm lại mới có hành động mới, tránh vòng lặp hủy liên
                            // tục mỗi frame khi Stamina vẫn chưa hồi kịp.
                            player.attackState = 'idle';
                            if (combatStateTag) { combatStateTag.textContent = 'IDLE'; combatStateTag.className = 'text-right text-slate-500 font-bold'; }
                            const grip = getWeaponGripRotation();
                            player.sword.rotation.set(grip.x + player.tiltRoot.rotation.x, grip.y, grip.z);
                            const visCfg = getActiveCharacterData().visualConfig;
                            player.rightHand.position.set(visCfg.rightHandPosition.x, visCfg.rightHandPosition.y, visCfg.rightHandPosition.z);
                            player.rightHand.rotation.set(0, 0, 0);
                            player.core.position.set(visCfg.corePosition.x, visCfg.corePosition.y, visCfg.corePosition.z);
                        }
                    }
                    return;
                }

                player.attackTimer -= dt;

                // Character #3 Validation — Burst Activation state machine (KHÔNG thuộc chuỗi combo
                // windup/active/recovery thường — 2 giá trị attackState RIÊNG). Kiểm tra TRƯỚC chuỗi
                // if/else combo chính, return NGAY để không rơi vào bất kỳ nhánh combo nào khác (2
                // state machine hoàn toàn tách biệt).
                if (player.attackState === 'burstActivationWindup' || player.attackState === 'burstActivationActive') {
                    updateBurstActivationTick();
                    return;
                }

                if (player.attackState === 'windup') {
                    if (player.attackTimer <= 0) {
                        player.attackState = 'active'; 
                        // Combo Attack System v2: timing đọc theo đòn đang chạy (comboIndex không
                        // đổi trong suốt 1 đòn, chỉ đổi khi triggerAttack() chạy lại cho đòn tiếp).
                        const timing = getCurrentAttackTiming();
                        player.attackTimer = timing.active;
                        
                        if (combatStateTag) { combatStateTag.textContent = 'ACTIVE'; combatStateTag.className = 'text-right text-amber-400 font-bold animate-pulse'; }
                        
                        player.mesh.scale.set(0.82, 1.18, 0.82);

                        if (player.isGrounded) {
                            // --- ATTACK LUNGE: tính lại mục tiêu ngay tại thời điểm active bắt đầu (dùng
                            // vị trí/khoảng cách mới nhất, sau khi soft targeting đã xoay xong trong lúc
                            // windup) — không phải Dash, không lao thẳng tới địch. Quãng đường di chuyển
                            // được trải đều qua thời lượng active CỦA ĐÚNG ĐÒN đang chạy (Combo Attack
                            // System v2 — KHÔNG còn hard-code ATTACK_LUNGE_CONFIG.duration=COMBAT_TIMING.
                            // active cố định, để lunge luôn khớp animation thật, kể cả khi Attack #2/#3
                            // có active ngắn/dài hơn Attack #1), có collision-check đầy đủ như di chuyển
                            // thường, không cộng thẳng vào velocity (velocity bị input-movement ghi đè
                            // lại mỗi frame nên lunge kiểu cũ mất tác dụng).
                            //
                            // Character #2 (Bow) Validation — BUGFIX: Attack Lunge là hành vi ĐẶC THÙ
                            // MELEE (bước tới để "vào tầm" cận chiến) — người chơi báo Bow Normal Attack
                            // đang bị nhích người tới giống Sword dù không nên có. Nguyên nhân: khối setup
                            // lúc windup->active này chạy VÔ ĐIỀU KIỆN cho MỌI weaponType (không có dispatch
                            // — khác với vòng lặp collision/damage trong nhánh 'active' runtime, ĐÃ dispatch
                            // đúng từ trước qua applyBowArrowSpawnTick()/getActiveWeaponType()). Bọc lại:
                            // CHỈ tính/set lunge khi weaponType !== 'bow' — Sword giữ nguyên 100% hành vi.
                            if (getActiveWeaponType() !== 'bow') {
                                const lungeTarget = findSoftTargetingRotation(player.position, player.mesh.rotation.y);
                                const lungeDistance = calculateLungeDistance(lungeTarget ? lungeTarget.distance : null);

                                player.lungeDir.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)).normalize();
                                player.lungeRemainingDist = lungeDistance;
                                player.lungeTimer = timing.active;
                            }
                        }

                        // Character #2 (Bow) Validation — BUGFIX: setWeaponEmissive (glow kiếm) VÀ
                        // slashWave (vết chém hình ảnh) là hiệu ứng ĐẶC THÙ MELEE/SWORD — người chơi báo
                        // Bow Normal Attack đang hiện vết chém giống Sword. Cùng nguyên nhân với lunge ở
                        // trên (khối setup chạy vô điều kiện). Bọc lại CHỈ chạy khi weaponType !== 'bow'.
                        // player.slashWave.visible GIỮ MẶC ĐỊNH false cho Bow (không set true ở đây) —
                        // đảm bảo mesh vết chém không hiện dù có thể còn sót trạng thái visible=true từ
                        // lần cuối Sword dùng nó (character khác trong party) TRƯỚC KHI player này từng
                        // active — an toàn vì mỗi Character có slashWave mesh RIÊNG (xem meshRefs.slashWave
                        // trong initParty(), 02-collision-and-stats-core.js), không dùng chung 1 mesh.
                        //
                        // Character #3 (Polearm) Validation — BUGFIX: TRƯỚC ĐÂY điều kiện này là
                        // `getActiveWeaponType() !== 'bow'` — đúng cho Sword, nhưng Polearm CŨNG khớp
                        // điều kiện đó (Polearm !== 'bow') nên sẽ VÔ TÌNH chạy code slashWave/emissive
                        // của SWORD (player.sword.material qua setWeaponEmissive, hình dạng vết chém
                        // kiếm) — SAI vì đây là hiệu ứng ĐẶC THÙ SWORD, không phải "melee nói chung".
                        // Sửa: dùng getActiveWeaponCategory() === 'sword' (nguồn sự thật chi tiết hơn,
                        // phân biệt đúng Sword/Bow/Polearm) THAY VÌ getActiveWeaponType() !== 'bow' —
                        // Polearm baseline CHƯA có hiệu ứng visual riêng ở phase này (đúng phạm vi
                        // "Polearm Baseline" — không thiết kế VFX Character #3, chỉ đảm bảo Polearm
                        // KHÔNG THỪA HƯỞNG NHẦM hiệu ứng Sword). Sword giữ nguyên 100% hành vi cũ.
                        if (getActiveWeaponCategory() === 'sword') {
                            setWeaponEmissive(0x94a3b8);
                            player.slashWave.visible = true;
                            player.slashWave.scale.setScalar(COMBAT_FEEL_CONFIG.slashEffect.startScale);
                            player.slashWave.material.opacity = COMBAT_FEEL_CONFIG.slashEffect.startOpacity;

                            player.slashWave.rotation.set(Math.PI / 2 - 0.3, -0.3, Math.PI / 6);
                        }

                        // Combo Attack System v1: đọc animation qua getCurrentAttackAnim() (tra
                        // theo comboIndex), thay vì trực tiếp visualConfig.animation.attack (object
                        // phẳng cũ, giờ là mảng). fallback về giá trị hard-code cũ nếu không có.
                        //
                        // Character #3 (Polearm) Validation — ĐÚNG PATTERN đã sửa ở phase 'active'
                        // (dòng ~1566): đọc attackAnim0[weaponCat] thay vì cứng attackAnim0.sword, để
                        // Polearm có thể khai báo windupRotation riêng (thrust/sweep khác slash). Bow
                        // KHÔNG chạy qua khối windup->active này (dispatch riêng ở nhánh 'bow' phía
                        // trên, xem getActiveWeaponType() === 'bow' check ở đầu block) nên không cần lo
                        // ngại ảnh hưởng Bow.
                        {
                            const weaponCat0 = getActiveWeaponCategory(); // 'sword' | 'polearm'
                            const attackAnim0 = getCurrentAttackAnim();
                            const attackAnimW0 = attackAnim0 && attackAnim0[weaponCat0];
                            const w0 = (attackAnimW0 && attackAnimW0.windupRotation) || DEFAULT_SWORD_WINDUP_ROTATION;
                            player.sword.rotation.set(w0.x, w0.y, w0.z);
                        }

                        // Attack Animation v1 (Normal Attack): tại thời điểm CHUYỂN sang active,
                        // snap RightHand/Core về ĐÚNG điểm cuối windup (đảm bảo khớp chính xác điểm
                        // bắt đầu của nội suy active bên dưới, không lệch do sai số làm tròn của nhánh
                        // nội suy windup ở khối else phía dưới). Đọc visualConfig.animation.attack —
                        // AN TOÀN nếu nhân vật chưa có config này (VD test_character_anemo): bỏ qua,
                        // để rightHand/core giữ nguyên hành vi cũ (chỉ sword animation) — KHÔNG crash.
                        {
                            const attackAnim = getCurrentAttackAnim();
                            if (attackAnim) {
                                const visCfg = getActiveCharacterData().visualConfig;
                                const w = attackAnim.windup;
                                player.rightHand.position.set(
                                    visCfg.rightHandPosition.x + w.rightHandOffset.x,
                                    visCfg.rightHandPosition.y + w.rightHandOffset.y,
                                    visCfg.rightHandPosition.z + w.rightHandOffset.z
                                );
                                player.rightHand.rotation.set(w.rightHandRotOffset.x, w.rightHandRotOffset.y, w.rightHandRotOffset.z);
                                player.core.position.set(
                                    visCfg.corePosition.x + w.coreOffset.x,
                                    visCfg.corePosition.y + w.coreOffset.y,
                                    visCfg.corePosition.z + w.coreOffset.z
                                );
                            }
                        }
                    } else {
                        // Attack Animation v1 (Normal Attack): NỘI SUY RightHand/Core từ base pose
                        // (offset = 0, vì lúc bắt đầu windup nhân vật đang ở Idle/Movement pose) TỚI
                        // điểm windup, theo prog tính từ attackTimer đang đếm ngược. Đây là phần "kéo
                        // nhẹ về sau/phải" mà người chơi thực sự nhìn thấy trong lúc windup.
                        // Combo Attack System v2: mẫu số đọc timing CỦA ĐÚNG ĐÒN đang chạy.
                        const prog = 1 - (player.attackTimer / getCurrentAttackTiming().windup);
                        const attackAnim = getCurrentAttackAnim();
                        if (attackAnim) {
                            const visCfg = getActiveCharacterData().visualConfig;
                            const w = attackAnim.windup;
                            player.rightHand.position.set(
                                visCfg.rightHandPosition.x + w.rightHandOffset.x * prog,
                                visCfg.rightHandPosition.y + w.rightHandOffset.y * prog,
                                visCfg.rightHandPosition.z + w.rightHandOffset.z * prog
                            );
                            player.rightHand.rotation.set(
                                w.rightHandRotOffset.x * prog,
                                w.rightHandRotOffset.y * prog,
                                w.rightHandRotOffset.z * prog
                            );
                            player.core.position.set(
                                visCfg.corePosition.x + w.coreOffset.x * prog,
                                visCfg.corePosition.y + w.coreOffset.y * prog,
                                visCfg.corePosition.z + w.coreOffset.z * prog
                            );
                        }
                    }
                } 
                else if (player.attackState === 'active') {
                    // Combo Attack System v2: mẫu số đọc timing CỦA ĐÚNG ĐÒN đang chạy.
                    const activeTiming = getCurrentAttackTiming().active;
                    const prog = (activeTiming - player.attackTimer) / activeTiming;

                    // Character #2 (Bow) Validation — BUGFIX: slashWave (vết chém hình ảnh) là hiệu ứng
                    // ĐẶC THÙ MELEE — cùng lý do/cùng chỗ set slashWave.visible=true lúc windup->active
                    // ở trên, phần UPDATE mỗi frame này cũng cần bọc lại tương ứng (nếu Bow không set
                    // visible=true thì scale/opacity update ở đây tuy vô hại về mặt thị giác — mesh vẫn
                    // ẩn — nhưng vẫn tốn phép tính mỗi frame không cần thiết; bọc lại cho nhất quán và
                    // rõ ràng ý đồ, tránh gây hiểu lầm khi đọc code sau này).
                    //
                    // Character #3 (Polearm) Validation — BUGFIX: cùng lý do với khối windup->active ở
                    // trên (dòng ~1449) — đổi `!== 'bow'` thành `getActiveWeaponCategory() === 'sword'`
                    // để Polearm KHÔNG thừa hưởng nhầm slashWave (hiệu ứng đặc thù Sword).
                    if (getActiveWeaponCategory() === 'sword') {
                        const se = COMBAT_FEEL_CONFIG.slashEffect;
                        const slashScale = se.startScale + (se.endScale - se.startScale) * prog;
                        player.slashWave.scale.setScalar(slashScale);
                        player.slashWave.material.opacity = se.startOpacity + (se.endOpacity - se.startOpacity) * prog;
                    }
                    
                    // Combo Attack System v1: đọc animation qua getCurrentAttackAnim() (tra theo
                    // comboIndex). Fallback về đúng giá trị cũ nếu nhân vật chưa có config này (VD
                    // test_character_anemo) — KHÔNG đổi hành vi khi thiếu data.
                    //
                    // Character #3 (Polearm) Validation — GIỮ NGUYÊN player.sword làm field mesh vật lý
                    // DÙNG CHUNG cho mọi weapon cận chiến (Sword VÀ Polearm) — ĐÚNG kiến trúc đã có sẵn
                    // từ Character #2: buildCharacterMesh() (04-scene-init.js) LUÔN trả về field tên
                    // `sword` bất kể weaponType, chỉ GEOMETRY bên trong thay đổi theo weaponType (xem
                    // comment tại initParty(), 02-collision-and-stats-core.js — Bow đã dùng đúng pattern
                    // này, "GIÁ TRỊ ĐỌC RA/HÀNH VI KHÔNG ĐỔI, chỉ mesh geometry đổi"). Field name `sword`
                    // là TÊN BIẾN LỊCH SỬ, không phải ràng buộc semantic — không cần field riêng
                    // `weaponMesh`/`polearmMesh` mới, tránh sửa lại ~19 chỗ khác trong file này đang
                    // dùng player.sword cho grip/idle/climb/swim (đều ĐÚNG áp dụng chung cho mọi melee
                    // weapon, không cần phân biệt Sword/Polearm ở NHỮNG CHỖ ĐÓ).
                    //
                    // Chỉ ANIMATION ROTATION VALUES (windupRotation/activeRotationEnd) cần khác nhau
                    // giữa Sword (slash) và Polearm (thrust/sweep) — đọc qua attackAnim[weaponCategory]
                    // (VD attackAnim.sword hoặc attackAnim.polearm, xem CHARACTER_ROSTER.talents/
                    // visualConfig.animation.attack[]) thay vì cứng attackAnim.sword. Polearm CHƯA có
                    // config này ở test fixture (Phase 1 Baseline) sẽ fallback về DEFAULT_SWORD_*
                    // (không lỗi, chỉ animation trông giống Sword tạm thời — chấp nhận được cho
                    // baseline, spec không yêu cầu animation cuối cùng ở phase này).
                    if (getActiveWeaponCategory() !== 'bow') {
                        const weaponCat = getActiveWeaponCategory(); // 'sword' | 'polearm'
                        const attackAnimCombo1 = getCurrentAttackAnim();
                        const attackAnimWeapon = attackAnimCombo1 && attackAnimCombo1[weaponCat];
                        const swStart = (attackAnimWeapon && attackAnimWeapon.windupRotation) || DEFAULT_SWORD_WINDUP_ROTATION;
                        const swEnd = (attackAnimWeapon && attackAnimWeapon.activeRotationEnd) || DEFAULT_SWORD_ACTIVE_END_ROTATION;
                        const startX = swStart.x, startY = swStart.y, startZ = swStart.z;
                        const endX = swEnd.x, endY = swEnd.y, endZ = swEnd.z;
                        player.sword.rotation.x = startX + (endX - startX) * prog;
                        player.sword.rotation.y = startY + (endY - startY) * prog;
                        player.sword.rotation.z = startZ + (endZ - startZ) * prog;
                    }

                    // Attack Animation v1 (Normal Attack): nội suy RightHand/Core từ điểm windup TỚI
                    // điểm slash theo CÙNG prog đã có (đây là "phần nhanh nhất" của animation, đúng
                    // yêu cầu). Đọc lại attackAnim mỗi frame — đơn giản hơn cache qua frame, chi phí
                    // không đáng kể (chỉ 1 object lookup). AN TOÀN nếu thiếu config (bỏ qua như windup).
                    {
                        const attackAnim = getCurrentAttackAnim();
                        if (attackAnim) {
                            const visCfg = getActiveCharacterData().visualConfig;
                            const a = attackAnim.active;
                            player.rightHand.position.set(
                                visCfg.rightHandPosition.x + a.rightHandOffsetStart.x + (a.rightHandOffsetEnd.x - a.rightHandOffsetStart.x) * prog,
                                visCfg.rightHandPosition.y + a.rightHandOffsetStart.y + (a.rightHandOffsetEnd.y - a.rightHandOffsetStart.y) * prog,
                                visCfg.rightHandPosition.z + a.rightHandOffsetStart.z + (a.rightHandOffsetEnd.z - a.rightHandOffsetStart.z) * prog
                            );
                            player.rightHand.rotation.set(
                                a.rightHandRotOffsetStart.x + (a.rightHandRotOffsetEnd.x - a.rightHandRotOffsetStart.x) * prog,
                                a.rightHandRotOffsetStart.y + (a.rightHandRotOffsetEnd.y - a.rightHandRotOffsetStart.y) * prog,
                                a.rightHandRotOffsetStart.z + (a.rightHandRotOffsetEnd.z - a.rightHandRotOffsetStart.z) * prog
                            );
                            player.core.position.set(
                                visCfg.corePosition.x + a.coreOffsetStart.x + (a.coreOffsetEnd.x - a.coreOffsetStart.x) * prog,
                                visCfg.corePosition.y + a.coreOffsetStart.y + (a.coreOffsetEnd.y - a.coreOffsetStart.y) * prog,
                                visCfg.corePosition.z + a.coreOffsetStart.z + (a.coreOffsetEnd.z - a.coreOffsetStart.z) * prog
                            );
                        }
                    }

                    const forward = new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)).normalize();

                    // Talent System v2: getTalentScaling() CHỈ đọc config {stat, multiplier} — tính
                    // 1 LẦN trước vòng lặp (không đổi theo từng enemy, đúng đòn đang chạy qua
                    // comboIndex - 1, 0-based, khớp animation.attack[]/talents.normalAttack.combo[]
                    // — player.comboIndex là 1-based, xem combat.js). Final Damage (bao gồm DEF
                    // mitigation) được tính RIÊNG theo TỪNG enemy bên trong forEach (mỗi enemy có thể
                    // khác level) qua calculatePlayerToEnemyDamage(). KHÔNG đụng gì tới hasHitList/
                    // comboIndex/attackState/timing/animation — CHỈ đổi nguồn con số damage.
                    // Character #2 (Bow) Validation — DISPATCH theo weaponType: nhân vật Bow KHÔNG
                    // chạy melee cone-hit (enemies.forEach + hasHitList) — thay vào đó
                    // applyBowArrowSpawnTick() spawn arrow theo đúng spawnTime của TỪNG arrow trong
                    // shot đang chạy (spec mục 2: Attack thực hiện != Damage chắc chắn — damage do
                    // chính arrow tự va chạm quyết định, xem file 09). activeElapsed = thời gian ĐÃ
                    // TRÔI QUA trong 'active' hiện tại, tính từ activeTiming/attackTimer đã có sẵn
                    // (KHÔNG dùng prog 0..1 để tránh sai số/nhầm đơn vị). Nhánh melee GIỮ NGUYÊN 100%
                    // không đổi khi weaponType !== 'bow' (an toàn ngược cho Character #1/test_character_anemo).
                    //
                    // Character #3 (Polearm) Validation — dispatch 3 CHIỀU thay vì 2 (Bow/Melee cũ):
                    // thêm nhánh RIÊNG cho Polearm (multi-hit/slot qua hits[], xem
                    // applyPolearmNormalAttackHitsTick() combat.js) TRƯỚC khi rơi vào nhánh 'melee' cũ
                    // (Sword, 1-hit-per-slot, category 'melee' — KHÔNG dùng được cho Polearm vì thiếu
                    // hits[] trong schema combo[] phẳng). Dùng getActiveWeaponCategory() (3 giá trị
                    // 'sword'|'bow'|'polearm') CHỈ ở điểm rẽ nhánh polearm/else — 2 nhánh
                    // if/else-if(bow) còn lại GIỮ NGUYÊN getActiveWeaponType() như cũ (đủ để phân biệt
                    // Bow, không cần đổi). Sword rơi vào else cuối cùng — HÀNH VI KHÔNG ĐỔI.
                    if (getActiveWeaponType() === 'bow') {
                        const activeElapsed = activeTiming - player.attackTimer;
                        applyBowArrowSpawnTick(activeElapsed, forward);
                    } else if (getActiveWeaponCategory() === 'polearm') {
                        const activeElapsed = activeTiming - player.attackTimer;
                        applyPolearmNormalAttackHitsTick(activeElapsed, forward);
                    } else {
                        const meleeScaling = getTalentScaling(getActiveCharacterData(), 'melee', player.comboIndex - 1);
                        // Hit Reaction / Poise System v1: ĐÚNG PATTERN meleeScaling ở trên — tính 1 LẦN
                        // trước vòng lặp (impact.type theo đòn đang chạy, comboIndex - 1 khớp
                        // talents.normalAttack.combo[] — xem getTalentImpact() trong combat.js). Truyền
                        // xuyên qua takeDamage() làm tham số thứ 4 — KHÔNG ảnh hưởng gì đến
                        // hasHitList/comboIndex/attackState/damage đã tính ở meleeScaling/meleeFinalDamage
                        // (2 luồng độc lập, cùng đọc chung 1 comboIndex).
                        const meleeImpact = getTalentImpact(getActiveCharacterData(), 'melee', player.comboIndex - 1);

                        enemies.forEach(enemy => {
                            if (!enemy.alive || player.hasHitList.includes(enemy.id)) return; 

                            // Dùng resolveMeleeHitCollision() dùng chung (combat.js) — Sword hiện
                            // KHÔNG khai báo hitShape trong data (talents.normalAttack.combo[i]
                            // phẳng, không có hits[]), nên truyền {} làm hitShapeConfig — fallback
                            // 'cone' GIỮ NGUYÊN 100% hành vi cũ (đúng combatRange 2.8/4.2 như trước).
                            const result = resolveMeleeHitCollision(enemy, player.position, forward, null);
                            if (result.hit) {
                                const meleeFinalDamage = calculatePlayerToEnemyDamage(getActiveCharacterData(), meleeScaling, enemy);
                                enemy.takeDamage(meleeFinalDamage, forward, false, withDamageSource(meleeImpact, getActiveCharacterData()));
                                player.hasHitList.push(enemy.id); 

                                hitstopTimer = COMBAT_FEEL_CONFIG.hitStopDuration;
                                sfx.playHit();
                                cameraState.shakeTimer = COMBAT_FEEL_CONFIG.cameraShake.duration;
                                cameraState.shakeIntensity = COMBAT_FEEL_CONFIG.cameraShake.intensity;

                                const hitPoint = enemy.position.clone().addScaledVector(result.toEnemy, -0.4);
                                spawnCombatSparks(hitPoint, result.toEnemy);

                                if (!enemy.alive) spawnDeathParticles(enemy.position);
                            }
                        });
                    }

                    if (player.attackTimer <= 0) {
                        // Combo Attack System v2: timing đọc theo đòn đang chạy.
                        player.attackState = 'recovery'; player.attackTimer = getCurrentAttackTiming().recovery;
                        if (combatStateTag) { combatStateTag.textContent = 'RECOVERY'; combatStateTag.className = 'text-right text-sky-500 font-bold'; }
                        player.slashWave.visible = false;
                        setWeaponEmissive(0x000000);

                        // Charged Attack v1 — Giữ nút xuyên suốt từ windup/active: KHÔNG tự động bắt
                        // đầu charge NGAY tại đây nữa (bug đã sửa — xem HELD_THROUGH_COMBO_DELAY trong
                        // combat.js: gọi handleAttackDown() ngay lập tức tại thời điểm chuyển state
                        // khiến tap NHANH để nối combo bình thường, tay chưa kịp nhả đúng lúc frame
                        // chuyển tới, bị "cướp" thành charge — reset attackBuffered=false, mất input
                        // tap #2 hợp lệ). Từ v3: nếu isAttackHeld vẫn true, chỉ RESET
                        // heldThroughComboTimer về 0 (bắt đầu đếm lại từ đây) — updateCombat() sẽ tự
                        // tăng timer này mỗi frame trong lúc 'recovery'/'comboGrace' đang chạy (xem
                        // khối kiểm tra ở đầu 2 nhánh đó bên dưới), CHỈ khi timer vượt ngưỡng
                        // HELD_THROUGH_COMBO_DELAY (đủ để phân biệt "giữ có chủ đích" với "tap nhanh")
                        // mới thực sự gọi handleAttackDown() để bắt đầu charge.
                        if (player.isAttackHeld) {
                            player.heldThroughComboTimer = 0;
                        }
                    }
                } 
                else if (player.attackState === 'recovery') {
                    // Combo Attack System v2: mẫu số đọc timing CỦA ĐÚNG ĐÒN đang chạy.
                    const recoveryTiming = getCurrentAttackTiming().recovery;
                    const prog = (recoveryTiming - player.attackTimer) / recoveryTiming;

                    // Combo Attack System v1: đọc animation qua getCurrentAttackAnim() (tra theo
                    // comboIndex) — PHẢI khớp đúng đòn đang chạy (không phải luôn là attack[0]),
                    // đảm bảo recovery của Attack #2/#3 dùng đúng activeRotationEnd của chính đòn đó.
                    //
                    // Character #3 (Polearm) Validation — ĐÚNG PATTERN đã sửa ở phase 'windup'/'active':
                    // đọc attackAnimCombo2[weaponCat] thay vì cứng .sword. Nhánh 'recovery' này chạy VÔ
                    // ĐIỀU KIỆN cho MỌI weaponType kể cả Bow (không có dispatch Bow/non-Bow ở tầng ngoài
                    // — khác 'windup'/'active' đã có if/else riêng) — GIỮ NGUYÊN cấu trúc này (không
                    // thêm dispatch mới), chỉ đổi nguồn đọc rotation config. Vô hại với Bow như trước
                    // (player.sword vẫn ẩn khi Bow active, animation set lên object ẩn không ảnh hưởng
                    // hình ảnh) — weaponCat = 'bow' fallback về DEFAULT_SWORD_* giống hệt hành vi cũ.
                    const weaponCat2 = getActiveWeaponCategory(); // 'sword' | 'bow' | 'polearm'
                    const attackAnimCombo2 = getCurrentAttackAnim();
                    const attackAnimWeapon2 = attackAnimCombo2 && attackAnimCombo2[weaponCat2];
                    const swEndActive = (attackAnimWeapon2 && attackAnimWeapon2.activeRotationEnd) || DEFAULT_SWORD_ACTIVE_END_ROTATION;
                    const endActiveX = swEndActive.x, endActiveY = swEndActive.y, endActiveZ = swEndActive.z;

                    // Combo Attack System v3: đích đến (End) của recovery ĐỔI từ idle grip pose sang
                    // windupRotation của đòn KẾ TIẾP (getNextAttackAnim(), xoay vòng — xem combat.js)
                    // để animation nối liền mạch qua Attack #2/#3... thay vì luôn "chạy về" idle pose
                    // rồi bị cắt ngang lúc combo nối tiếp. Recovery LUÔN chạy tới windup #kế tiếp bất
                    // kể người chơi có bấm buffer hay không (theo yêu cầu đã xác nhận) — trường hợp
                    // combo KHÔNG tiếp diễn (không buffer) sẽ snap về idle pose NGAY LÚC recovery kết
                    // thúc (attackTimer <= 0, xem khối bên dưới), không lerp dở dang.
                    //
                    // Character #3 (Polearm) Validation — nextAttackAnim[weaponCat2] thay vì cứng .sword,
                    // đồng bộ với swEndActive ở trên (cùng nguồn weaponCat2).
                    const nextAttackAnim = getNextAttackAnim();
                    const nextWeaponRot = (nextAttackAnim && nextAttackAnim[weaponCat2] && nextAttackAnim[weaponCat2].windupRotation);
                    const targetX = nextWeaponRot ? nextWeaponRot.x : endActiveX;
                    const targetY = nextWeaponRot ? nextWeaponRot.y : endActiveY;
                    const targetZ = nextWeaponRot ? nextWeaponRot.z : endActiveZ;

                    player.sword.rotation.x = endActiveX + (targetX - endActiveX) * prog;
                    player.sword.rotation.y = endActiveY + (targetY - endActiveY) * prog;
                    player.sword.rotation.z = endActiveZ + (targetZ - endActiveZ) * prog;

                    // Attack Animation v2 (Normal Attack): Recovery — lerp TUYẾN TÍNH RightHand/Core từ
                    // điểm cuối active (r.rightHandOffsetStart/...) TỚI windup offset của đòn KẾ TIẾP
                    // (nextAttackAnim.windup) thay vì luôn về base pose 0 offset — animation vì vậy nối
                    // liền mạch vào windup #2/#3 dù combo có tiếp diễn hay không (snap về idle riêng ở
                    // dưới nếu combo thực sự dừng). Field overshootFactor vẫn GIỮ trong schema cho v3
                    // sau (chưa dùng ở đây, không xóa).
                    {
                        const attackAnim = getCurrentAttackAnim();
                        if (attackAnim) {
                            const visCfg = getActiveCharacterData().visualConfig;
                            const r = attackAnim.recovery;
                            const nextWindup = nextAttackAnim && nextAttackAnim.windup;
                            // Fallback an toàn: nếu đòn kế tiếp không có windup config (VD nhân vật
                            // thiếu data), coi như đích đến = base pose (0 offset), giữ đúng hành vi cũ.
                            const endOffset = nextWindup ? nextWindup.rightHandOffset : { x: 0, y: 0, z: 0 };
                            const endRotOffset = nextWindup ? nextWindup.rightHandRotOffset : { x: 0, y: 0, z: 0 };
                            const endCoreOffset = nextWindup ? nextWindup.coreOffset : { x: 0, y: 0, z: 0 };

                            player.rightHand.position.set(
                                visCfg.rightHandPosition.x + r.rightHandOffsetStart.x + (endOffset.x - r.rightHandOffsetStart.x) * prog,
                                visCfg.rightHandPosition.y + r.rightHandOffsetStart.y + (endOffset.y - r.rightHandOffsetStart.y) * prog,
                                visCfg.rightHandPosition.z + r.rightHandOffsetStart.z + (endOffset.z - r.rightHandOffsetStart.z) * prog
                            );
                            player.rightHand.rotation.set(
                                r.rightHandRotOffsetStart.x + (endRotOffset.x - r.rightHandRotOffsetStart.x) * prog,
                                r.rightHandRotOffsetStart.y + (endRotOffset.y - r.rightHandRotOffsetStart.y) * prog,
                                r.rightHandRotOffsetStart.z + (endRotOffset.z - r.rightHandRotOffsetStart.z) * prog
                            );
                            player.core.position.set(
                                visCfg.corePosition.x + r.coreOffsetStart.x + (endCoreOffset.x - r.coreOffsetStart.x) * prog,
                                visCfg.corePosition.y + r.coreOffsetStart.y + (endCoreOffset.y - r.coreOffsetStart.y) * prog,
                                visCfg.corePosition.z + r.coreOffsetStart.z + (endCoreOffset.z - r.coreOffsetStart.z) * prog
                            );
                        }
                    }

                    if (player.attackTimer <= 0) {
                        // Combo Window Config v1: so sánh comboWindow (tổng, TÍNH TỪ LÚC recovery bắt
                        // đầu) với recoveryTiming vừa chạy xong. Nếu comboWindow > recovery -> còn dư
                        // thời gian grace -> chuyển 'comboGrace' (đứng yên ở pose cuối recovery, vẫn
                        // nhận input) thay vì snap/nối ngay. Nếu comboWindow <= recovery -> graceTime
                        // <= 0 -> giữ NGUYÊN hành vi cũ 100% (snap/nối ngay lúc recovery hết, như
                        // trước khi có comboWindow) — an toàn ngược cho nhân vật không khai báo field.
                        const graceTime = getComboWindow() - recoveryTiming;

                        if (graceTime > 0 && !player.attackBuffered) {
                            // Còn thời gian grace VÀ chưa có input buffer — chuyển sang comboGrace,
                            // ĐỨNG YÊN ở đúng pose hiện tại (không snap, không lerp thêm — pose lúc
                            // này đã là windup của đòn kế tiếp do vừa lerp xong ở trên, GIỮ NGUYÊN).
                            player.attackState = 'comboGrace';
                            player.attackTimer = graceTime;
                            if (combatStateTag) { combatStateTag.textContent = 'COMBO GRACE'; combatStateTag.className = 'text-right text-amber-500 font-bold'; }
                        } else {
                            player.attackState = 'idle';
                            if (combatStateTag) { combatStateTag.textContent = 'IDLE'; combatStateTag.className = 'text-right text-slate-500 font-bold'; }
                            if (player.attackBuffered) {
                                // Combo Window còn mở lúc recovery kết thúc VÀ có input đã buffer — nối
                                // sang đòn tiếp theo. Tay/sword hiện đã ở ĐÚNG windup pose của đòn kế tiếp
                                // (vừa lerp tới ở trên) — KHÔNG snap gì thêm ở đây, handleAttackInput() ->
                                // triggerAttack() sẽ tự tính comboIndex mới và chuyển state sang windup.
                                player.attackBuffered = false; handleAttackInput();
                            } else {
                                // Combo Attack System v1: Combo Window đã đóng mà KHÔNG có input tiếp
                                // theo — reset comboIndex về 0, và SNAP tay/sword về idle pose ngay lập
                                // tức (vì tay hiện đang ở windup pose của đòn kế tiếp, không phải idle —
                                // phải snap, không lerp dở, tránh đứng sai tư thế). Lần nhấn Attack kế
                                // tiếp sẽ bắt đầu lại từ đòn #1.
                                player.comboIndex = 0;
                                const grip = getWeaponGripRotation(); // Character Foundation v2: fallback an toàn nếu thiếu weaponGrip
                                player.sword.rotation.set(grip.x + player.tiltRoot.rotation.x, grip.y, grip.z);
                                const visCfg = getActiveCharacterData().visualConfig;
                                player.rightHand.position.set(visCfg.rightHandPosition.x, visCfg.rightHandPosition.y, visCfg.rightHandPosition.z);
                                player.rightHand.rotation.set(0, 0, 0);
                                player.core.position.set(visCfg.corePosition.x, visCfg.corePosition.y, visCfg.corePosition.z);
                            }
                        }
                    }
                }
                else if (player.attackState === 'comboGrace') {
                    // Combo Window Config v1 — state MỚI: animation đã lerp xong hết recovery, ĐỨNG
                    // YÊN ở pose cuối recovery (= windup pose của đòn kế tiếp, không đổi gì thêm mỗi
                    // frame — khác 'recovery' vốn liên tục lerp). Vẫn nhận input (xem triggerAttack()
                    // trong combat.js, đã thêm 'comboGrace' vào điều kiện buffer). Kết thúc khi
                    // attackTimer <= 0 (hết graceTime) — nối combo nếu có buffer, snap về idle nếu
                    // không, TÁI SỬ DỤNG nguyên logic nhánh else phía trên (không lặp code).
                    if (combatStateTag) { combatStateTag.textContent = 'COMBO GRACE'; combatStateTag.className = 'text-right text-amber-500 font-bold'; }
                    if (player.attackTimer <= 0) {
                        player.attackState = 'idle';
                        if (combatStateTag) { combatStateTag.textContent = 'IDLE'; combatStateTag.className = 'text-right text-slate-500 font-bold'; }
                        if (player.attackBuffered) {
                            player.attackBuffered = false; handleAttackInput();
                        } else {
                            player.comboIndex = 0;
                            const grip = getWeaponGripRotation();
                            player.sword.rotation.set(grip.x + player.tiltRoot.rotation.x, grip.y, grip.z);
                            const visCfg = getActiveCharacterData().visualConfig;
                            player.rightHand.position.set(visCfg.rightHandPosition.x, visCfg.rightHandPosition.y, visCfg.rightHandPosition.z);
                            player.rightHand.rotation.set(0, 0, 0);
                            player.core.position.set(visCfg.corePosition.x, visCfg.corePosition.y, visCfg.corePosition.z);
                        }
                    } else if (player.attackBuffered) {
                        // Combo Window Config v1: bấm GIỮA CHỪNG lúc đang comboGrace (chưa hết
                        // graceTime) — nối combo NGAY, không đợi hết grace (cảm giác phản hồi tức
                        // thời, giống hệt cách 'recovery' xử lý buffer trước đây).
                        player.attackState = 'idle';
                        if (combatStateTag) { combatStateTag.textContent = 'IDLE'; combatStateTag.className = 'text-right text-slate-500 font-bold'; }
                        player.attackBuffered = false; handleAttackInput();
                    }
                }
                // ============================================================
                // Charged Attack v2 — chargedWindup / chargedActive / chargedRecovery (Multi-Animation
                // + Multi-Hit)
                // ============================================================
                // 3 nhánh RIÊNG, SONG SONG với windup/active/recovery của Normal Attack ở trên —
                // không chia sẻ code/field animation, không đụng comboIndex/attackBuffered/
                // hasHitList. Dùng CHUNG player.attackTimer (đếm ngược, giống windup/active/recovery
                // — AN TOÀN vì Normal Attack và Charged Attack không bao giờ chạy đồng thời: cùng là
                // player.attackState nên loại trừ lẫn nhau) làm "tổng thời gian còn lại của phase"
                // (= getChargedAttackPhaseDuration(phase), TÍNH TỪ TỔNG animation segment — KHÔNG còn
                // 1 con số cấu hình cố định windup/active/recovery như v1 cũ).
                //
                // Animation: applyChargedAttackAnimTick(phase, dt) (combat.js) xử lý TOÀN BỘ việc
                // advance qua N animation segment + nội suy rightHand/core — KHÔNG hard-code số lượng
                // segment ở đây (yêu cầu đã xác nhận — "KHÔNG giới hạn số animation").
                //
                // Hit: applyChargedAttackHitsTick(dt, forward) (combat.js) CHỈ chạy trong
                // chargedActive — xử lý TOÀN BỘ M hit trong hits[] theo `time` riêng của từng hit,
                // ĐỘC LẬP hoàn toàn với animation segment (yêu cầu đã xác nhận).
                else if (player.attackState === 'chargedWindup') {
                    if (combatStateTag) { combatStateTag.textContent = 'CHARGED WINDUP'; combatStateTag.className = 'text-right text-orange-400 font-bold animate-pulse'; }

                    const windupTick = applyChargedAttackAnimTick('windup', dt);

                    if (player.attackTimer <= 0 || windupTick.phaseFinished) {
                        player.attackState = 'chargedActive';
                        player.attackTimer = getChargedAttackPhaseDuration('active');
                        // Reset index/elapsed cho phase MỚI (active) — segment đầu tiên, elapsed=0.
                        player.chargedAnimIndex = 0;
                        player.chargedPhaseElapsed = 0;
                        // Reset elapsed cho hits[] — hits[].time tính TỪ LÚC chargedActive BẮT ĐẦU
                        // (yêu cầu đã xác nhận), nên phải reset ĐÚNG TẠI ĐÂY (không phải lúc trigger,
                        // vì có thể có windup trước đó làm elapsed bị trôi nếu không reset lại).
                        player.chargedAttackElapsed = 0;
                        if (combatStateTag) { combatStateTag.textContent = 'CHARGED ACTIVE'; combatStateTag.className = 'text-right text-amber-400 font-bold animate-pulse'; }

                        player.mesh.scale.set(0.82, 1.18, 0.82);

                        // Lunge: yêu cầu đã xác nhận — CHỈ 1 LẦN DUY NHẤT ở đầu chuỗi active (KHÔNG
                        // lặp lại dù active có nhiều animation segment con) — giữ NGUYÊN vị trí gọi cũ
                        // (đúng lúc chuyển windup->active), KHÔNG di chuyển logic này vào bất kỳ vòng
                        // lặp segment nào.
                        if (player.isGrounded) {
                            const lungeTarget = findSoftTargetingRotation(player.position, player.mesh.rotation.y);
                            const lungeDistance = calculateLungeDistance(lungeTarget ? lungeTarget.distance : null);
                            player.lungeDir.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)).normalize();
                            player.lungeRemainingDist = lungeDistance;
                            player.lungeTimer = player.attackTimer; // = tổng duration phase active
                        }

                        // chargedAttackForward: TÍNH 1 LẦN DUY NHẤT tại đây — dùng lại cho MỌI hit
                        // trong suốt chargedActive (xem applyChargedAttackHitsTick() trong combat.js).
                        player.chargedAttackForward.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)).normalize();

                        setWeaponEmissive(0x94a3b8);
                        player.slashWave.visible = true;
                        player.slashWave.scale.setScalar(COMBAT_FEEL_CONFIG.slashEffect.startScale);
                        player.slashWave.material.opacity = COMBAT_FEEL_CONFIG.slashEffect.startOpacity;
                        player.slashWave.rotation.set(Math.PI / 2 - 0.3, -0.3, Math.PI / 6);

                        // Animation: áp dụng NGAY frame đầu tiên của phase active (tick với dt=0 để
                        // snap đúng điểm bắt đầu segment đầu tiên của active, tránh 1 frame "đứng
                        // yên" ở pose cuối windup trước khi kịp nội suy).
                        applyChargedAttackAnimTick('active', 0);
                    }
                }
                else if (player.attackState === 'chargedActive') {
                    const activeTiming = getChargedAttackPhaseDuration('active');
                    const prog = activeTiming > 0 ? (activeTiming - player.attackTimer) / activeTiming : 1;
                    const se = COMBAT_FEEL_CONFIG.slashEffect;
                    player.slashWave.scale.setScalar(se.startScale + (se.endScale - se.startScale) * prog);
                    player.slashWave.material.opacity = se.startOpacity + (se.endOpacity - se.startOpacity) * prog;

                    applyChargedAttackAnimTick('active', dt);

                    // Multi-Hit v2: xử lý TOÀN BỘ hits[] theo time riêng — forward CỐ ĐỊNH tính lúc
                    // bắt đầu active (player.chargedAttackForward, xem nhánh chargedWindup ở trên).
                    applyChargedAttackHitsTick(dt, player.chargedAttackForward);

                    if (player.attackTimer <= 0) {
                        player.attackState = 'chargedRecovery';
                        player.attackTimer = getChargedAttackPhaseDuration('recovery');
                        player.chargedAnimIndex = 0;
                        player.chargedPhaseElapsed = 0;
                        if (combatStateTag) { combatStateTag.textContent = 'CHARGED RECOVERY'; combatStateTag.className = 'text-right text-sky-500 font-bold'; }
                        player.slashWave.visible = false;
                        setWeaponEmissive(0x000000);
                        applyChargedAttackAnimTick('recovery', 0);
                    }
                }
                else if (player.attackState === 'chargedRecovery') {
                    applyChargedAttackAnimTick('recovery', dt);

                    if (player.attackTimer <= 0) {
                        // Buffer nối tiếp (Auto-trigger v2): kiểm tra chargedAttackBuffered NGAY LÚC
                        // Recovery kết thúc — 3 trường hợp loại trừ lẫn nhau, ĐÚNG 1 nhánh chạy:
                        //   (1) chargedAttackBuffered === true VÀ đủ Stamina -> tự thi triển Charged
                        //       Attack KẾ TIẾP ngay, KHÔNG cần thả rồi bấm lại nữa (triggerChargedAttack()
                        //       tự reset lại chargedRebuffTimer/chargedRebuffArmed/chargedAttackBuffered
                        //       cho chu kỳ mới, và tự trừ Stamina — xem combat.js).
                        //   (1b) chargedAttackBuffered === true NHƯNG KHÔNG đủ Stamina -> yêu cầu đã
                        //       xác nhận: LUÔN về idle, KHÔNG tự động đánh Normal Attack dù đang giữ
                        //       nút hay không (khác hẳn case (2) — thiếu Stamina KHÔNG được coi là tín
                        //       hiệu "muốn tap Normal Attack"). staminaBlockedBuffer đánh dấu case này
                        //       để LOẠI TRỪ khỏi điều kiện fallback Normal Attack bên dưới.
                        //   (2) chargedRebuffArmed === true (đã thả tay RA ít nhất 1 lần trong đòn
                        //       này) NHƯNG chưa đủ giờ khi giữ lại (chargedAttackBuffered vẫn false)
                        //       -> rơi về Normal Attack (yêu cầu đã xác nhận) — coi như vừa bấm Attack
                        //       từ idle, đi qua ĐÚNG handleAttackInput()/triggerAttack() hiện có.
                        //   (3) chargedRebuffArmed === false — BAO GỒM CẢ trường hợp giữ LIÊN TỤC
                        //       xuyên suốt từ đầu không hề thả tay (isAttackHeld vẫn true nhưng CHƯA
                        //       TỪNG thả -> không đủ điều kiện buffer THEO YÊU CẦU ĐÃ XÁC NHẬN) LẪN
                        //       trường hợp không giữ gì cả -> về idle bình thường, KHÔNG đánh Normal
                        //       Attack (bug đã sửa: trước đây dùng player.isAttackHeld thay vì
                        //       chargedRebuffArmed nên giữ liên tục không thả bị hiểu nhầm thành "thả
                        //       sớm" và tự đánh Attack #1 ngay sau Charged Attack).
                        let staminaBlockedBuffer = false;
                        if (player.chargedAttackBuffered) {
                            const activated = triggerChargedAttack();
                            if (activated) {
                                return;
                            }
                            staminaBlockedBuffer = true;
                        }

                        player.attackState = 'idle';
                        if (combatStateTag) { combatStateTag.textContent = 'IDLE'; combatStateTag.className = 'text-right text-slate-500 font-bold'; }
                        // Recovery đã lerp XONG về base offset=0 ở trên (applyChargedAttackAnimTick()
                        // tự snap chính xác lần cuối khi hết segment — xem combat.js) — trả
                        // sword.rotation về ĐÚNG weaponGrip idle pose (giống hệt cách Normal Attack
                        // snap về idle khi combo kết thúc không buffer — xem nhánh comboIndex=0 ở
                        // trên, dòng ~1480).
                        const grip = getWeaponGripRotation();
                        player.sword.rotation.set(grip.x + player.tiltRoot.rotation.x, grip.y, grip.z);
                        const visCfg = getActiveCharacterData().visualConfig;
                        player.rightHand.position.set(visCfg.rightHandPosition.x, visCfg.rightHandPosition.y, visCfg.rightHandPosition.z);
                        player.rightHand.rotation.set(0, 0, 0);
                        player.core.position.set(visCfg.corePosition.x, visCfg.corePosition.y, visCfg.corePosition.z);

                        if (!staminaBlockedBuffer && player.chargedRebuffArmed && player.isAttackHeld) {
                            // Trường hợp (2): đã thả tay ít nhất 1 lần trong đòn này rồi giữ lại,
                            // nhưng chưa đủ giờ -> rơi về Normal Attack. player.attackState vừa set
                            // 'idle' ở trên -> handleAttackInput() sẽ chạy đúng nhánh "bấm Attack từ
                            // idle" (triggerAttack() với comboIndex tính lại từ 0 -> 1, KHÔNG liên
                            // quan gì tới comboIndex cũ trước khi charge). Điều kiện PHẢI có
                            // chargedRebuffArmed — nếu không, giữ liên tục xuyên suốt (isAttackHeld
                            // true nhưng chưa từng thả) sẽ rơi vào đây nhầm, gây bug "giữ đủ giờ ->
                            // Charged Attack -> tự đánh thêm Normal Attack #1 dù không hề thả tay".
                            // !staminaBlockedBuffer LOẠI TRỪ case (1b) — thiếu Stamina LUÔN về idle,
                            // không rơi vào đây dù chargedRebuffArmed/isAttackHeld đúng (yêu cầu đã
                            // xác nhận).
                            handleAttackInput();
                        }
                    }
                }
            }

            // Alpha v1.0 — Character System: updateProjectiles() đã bị XÓA (dead code, dùng
            // activeProjectiles đã xóa khỏi file 02) — thay bằng updateSmallShotEffect()
            // (09-character-system.js), gọi qua updateActiveEffects() trong game loop bên dưới.

            // Cập nhật hiệu ứng hình ảnh Pressure Shot (instant beam) — chỉ fade opacity theo thời gian
            // rồi tự hủy, KHÔNG di chuyển, không va chạm (damage đã được tính ngay lúc bắn trong fireHydroBeam).
            function updateHydroBeamVisuals(dt) {
                for (let i = activeHydroBeamVisuals.length - 1; i >= 0; i--) {
                    const visual = activeHydroBeamVisuals[i];
                    visual.timer -= dt;
                    const t = Math.max(0, visual.timer / visual.maxTimer);
                    visual.mesh.material.opacity = 0.85 * t;

                    if (visual.timer <= 0) {
                        scene.remove(visual.mesh);
                        visual.mesh.geometry.dispose();
                        visual.mesh.material.dispose();
                        activeHydroBeamVisuals.splice(i, 1);
                    }
                }
            }

            function updateCamera(dt) {
                const targetX = player.position.x;
                const targetY = player.position.y + cameraState.targetYOffset;
                const targetZ = player.position.z;
                cameraState.targetFocus.set(targetX, targetY, targetZ);

                // --- SKILL AIM STATE: offset camera lệch sang phải (world-space, theo trục "right" của
                // chính camera tại theta hiện tại) để nhân vật hiển thị lệch TRÁI màn hình, tạo khoảng
                // trống quan sát phía trước — giống chế độ ngắm cung trong Genshin Impact. cameraOffsetT
                // (0..1) được lerp mượt trong updateSkillAim(), không snap cứng.
                if (skillAimState.cameraOffsetT > 0) {
                    const rightX = Math.cos(cameraState.currentTheta);
                    const rightZ = -Math.sin(cameraState.currentTheta);
                    const offsetAmount = getActiveSkillAimConfig().aim.cameraSideOffset * skillAimState.cameraOffsetT;
                    cameraState.targetFocus.x += rightX * offsetAmount;
                    cameraState.targetFocus.z += rightZ * offsetAmount;
                }

                const followLerpFactor = 1 - Math.exp(-cameraState.followDamping * dt);
                const rotationLerpFactor = 1 - Math.exp(-cameraState.rotationDamping * dt);
                const zoomLerpFactor = 1 - Math.exp(-cameraState.zoomDamping * dt);

                cameraState.currentFocus.lerp(cameraState.targetFocus, followLerpFactor);

                cameraState.currentTheta += (cameraState.targetTheta - cameraState.currentTheta) * rotationLerpFactor;
                cameraState.currentPhi += (cameraState.targetPhi - cameraState.currentPhi) * rotationLerpFactor;

                // Zoom gần hơn khi đang Skill Aim State — nội suy giữa targetDistance bình thường và
                // aim.cameraZoomDistance theo cameraOffsetT, để zoom in/out mượt cùng nhịp với offset lệch.
                // (Burst không còn Aim Mode nên không còn tham gia vào phép tính này.)
                const activeAimOffsetT = skillAimState.cameraOffsetT;
                const activeAimZoomDistance = getActiveSkillAimConfig().aim.cameraZoomDistance;
                const desiredDistance = activeAimOffsetT > 0
                    ? cameraState.targetDistance + (activeAimZoomDistance - cameraState.targetDistance) * activeAimOffsetT
                    : cameraState.targetDistance;
                cameraState.distance += (desiredDistance - cameraState.distance) * zoomLerpFactor;

                const horizontalDistance = cameraState.distance * Math.cos(cameraState.currentPhi);
                
                const baseCamPos = new THREE.Vector3(
                    cameraState.currentFocus.x + horizontalDistance * Math.sin(cameraState.currentTheta),
                    cameraState.currentFocus.y + cameraState.distance * Math.sin(cameraState.currentPhi),
                    cameraState.currentFocus.z + horizontalDistance * Math.cos(cameraState.currentTheta)
                );

                if (cameraState.shakeTimer > 0) {
                    const intensity = cameraState.shakeTimer * cameraState.shakeIntensity;
                    cameraState.shakeOffset.set(
                        (Math.random() - 0.5) * intensity,
                        (Math.random() - 0.5) * intensity,
                        (Math.random() - 0.5) * intensity
                    );
                } else {
                    cameraState.shakeOffset.set(0, 0, 0);
                }

                camera.position.copy(baseCamPos).add(cameraState.shakeOffset);
                camera.lookAt(cameraState.currentFocus);

                let targetFov = 60;
                if (player.isDashing) {
                    targetFov = 72; 
                } else if (player.isGliding) {
                    targetFov = 74; 
                } else if (player.isSprinting) {
                    targetFov = 68;   
                } else if (player.walkMode) {
                    targetFov = 56;   
                } else if (player.velocity.length() > 6) {
                    targetFov = 63; 
                }
                
                if (player.attackState === 'active') {
                    targetFov -= 4;
                }

                if (hitstopTimer > 0) {
                    targetFov -= 3;
                }

                // Skill Aim State: FOV hẹp hơn nhẹ (giống ống ngắm) — áp dụng SAU cùng, đè lên mọi state
                // FOV khác, vì đang aim thì player.isGrounded/không dashing/gliding nên các nhánh trên
                // hiếm khi xung đột, nhưng vẫn ưu tiên tuyệt đối để đảm bảo cảm giác ngắm nhất quán.
                if (skillAimState.cameraOffsetT > 0) {
                    targetFov -= 6 * skillAimState.cameraOffsetT;
                }

                camera.fov += (targetFov - camera.fov) * 8 * dt;
                camera.updateProjectionMatrix();

                if (camera.position.y < 0) {
                    groundMat.transparent = true;
                    groundMat.opacity = 0.35; 
                } else {
                    groundMat.transparent = false;
                    groundMat.opacity = 1.0;  
                }
            }

            function animate() {
                requestAnimationFrame(animate);

                let dt = clock.getDelta();

                if (!window.isGamePaused && !window.isDialogueOpen) {
                    if (hitstopTimer > 0) {
                        hitstopTimer -= dt;
                        dt = 0; 
                    }

                    if (cameraState.shakeTimer > 0) {
                        cameraState.shakeTimer -= (dt === 0 ? clock.getDelta() : dt);
                    }

                    const actualDt = (dt === 0) ? clock.getDelta() : dt;

                    // Alpha v1.0 — Character System: khối đếm ngược skillCooldownTimer TRỰC TIẾP ở đây
                    // (biến cục bộ cũ trong combat.js, giờ đã xóa) bị XÓA — đây là logic TRÙNG LẶP với
                    // đếm ngược bên trong updateSkillCooldown() (combat.js) đang tự làm cùng việc trên
                    // partyState[activeCharacterIndex].skillCooldownTimer. Giữ cả 2 sẽ đếm ngược 2
                    // lần/frame, khiến cooldown thực tế trôi nhanh gấp đôi UI hiển thị.
                    updateSkillCooldown(actualDt);
                    updateBurstUI();

                    // Passive/Unique Mechanic — "Overwatch" (Phase 1, Character #2): đếm ngược
                    // player.overwatchTimer cùng nhịp actualDt như skillCooldownTimer ở trên (không đặt
                    // trong khối `if (dt > 0)` bên dưới — cùng lý do: đây là timing window cho THAO TÁC
                    // tiếp theo của Player, không phải simulation gameplay cần dừng theo hitstop). Clamp
                    // về 0, KHÔNG cho âm.
                    if (player.overwatchTimer > 0) {
                        player.overwatchTimer -= actualDt;
                        if (player.overwatchTimer < 0) player.overwatchTimer = 0;
                    }

                    if (player.isGliding && player.gliderGroup) {
                        const flap = Math.sin(clock.getElapsedTime() * 7.5) * 0.08;
                        player.gliderGroup.children[0].rotation.z = flap;     
                        player.gliderGroup.children[1].rotation.z = -flap;    
                        
                        if (Math.random() < 0.35) {
                            spawnGliderTrailParticles();
                        }
                    }

                    if (dt > 0) {
                        updatePhysics(dt);
                        updateCombat(dt);
                        // Alpha v1.0 — Character System: updateProjectiles() (dead code, còn giữ định
                        // nghĩa để tương thích ngược tạm thời) thay bằng updateActiveEffects()
                        // (09-character-system.js) — giờ xử lý CẢ 2 slot skill VÀ burst (Water Bubble
                        // đã migrate qua updateWaterBubbleEffect). updateBurst(dt) (định nghĩa cũ vẫn
                        // còn trong combat.js, thành dead code) KHÔNG còn được gọi ở đây — gọi song
                        // song sẽ chạy Burst 2 lần/frame vì cùng xử lý player.activeEffects.burst.
                        updateActiveEffects(dt);
                        updateHydroBeamVisuals(dt);
                        updateEnergyParticles(dt);
                        // Core Energy + Elemental Particle System v1 — Particle THẬT (cộng Energy khi
                        // collect), TÁCH BIỆT hoàn toàn khỏi updateEnergyParticles(dt) ở trên (đó là VFX
                        // thuần túy trong vfx.js, không cộng Energy — GIỮ NGUYÊN, không gộp 2 hệ thống).
                        EnergySystem.updateParticles(dt);
                        updateDamageNumbers(dt); // Pre-Alpha v0.7 — Core Stats
                        updateCampRespawns(dt);

                        for (let i = enemies.length - 1; i >= 0; i--) {
                            const enemy = enemies[i];
                            enemy.update(dt);
                            
                            if (enemy.isSlime && !enemy.alive && enemy.respawnTimer <= 0) {
                                scene.remove(enemy.mesh);
                                if (enemy.bodyMesh) {
                                    enemy.bodyMesh.geometry.dispose();
                                    enemy.bodyMesh.material.dispose();
                                }
                                // Pre-Alpha v0.7 — Core Stats: dispose HP bar sprite material — mỗi
                                // slime có material RIÊNG (không dùng chung, xem constructor), an toàn
                                // dispose không ảnh hưởng slime khác. KHÔNG cần dispose geometry (Sprite
                                // dùng geometry tĩnh dùng chung toàn cục — xem giải thích tương tự ở
                                // vfx.js updateDamageNumbers()).
                                if (enemy.hpBarBg) enemy.hpBarBg.material.dispose();
                                if (enemy.hpBarFill) enemy.hpBarFill.material.dispose();
                                enemies.splice(i, 1);
                            }
                        }

                        // --- MUSIC: xác định in_combat dựa TRỰC TIẾP vào isEngagingPlayer của Slime —
                        // cờ này phản ánh đúng chính xác việc slime có đang thực sự nhắm vào player hay
                        // không (được set lại tại từng điểm chuyển trạng thái trong enemies.js), nên
                        // nhạc combat bật/tắt khớp 100% với việc slime "phát hiện" / "hết phát hiện"
                        // player — không tự suy luận lại bằng khoảng cách + field riêng ở đây nữa.
                        const inCombatNow = enemies.some(e => e.isSlime && e.alive && e.isEngagingPlayer);
                        if (window.music) window.music.update(dt, inCombatNow);

                        for (let i = ghostTrails.length - 1; i >= 0; i--) {
                            const trail = ghostTrails[i];
                            trail.life -= dt;
                            const progress = trail.life / trail.maxLife;

                            trail.mesh.children.forEach(mesh => {
                                mesh.material.opacity = 0.35 * progress;
                            });

                            if (trail.life <= 0) {
                                scene.remove(trail.mesh);
                                trail.mesh.children.forEach(child => {
                                    child.geometry.dispose();
                                    child.material.dispose();
                                });
                                ghostTrails.splice(i, 1);
                            }
                        }

                        for (let i = particles.length - 1; i >= 0; i--) {
                            const p = particles[i];
                            p.life -= dt;

                            if (p.scaleUp) {
                                const growth = p.growthRate * dt;
                                p.mesh.scale.x += growth;
                                p.mesh.scale.y += growth;
                                p.mesh.scale.z += growth;
                            }

                            if (p.gravity) {
                                p.velocity.y -= p.gravity * dt;
                            }

                            p.mesh.position.addScaledVector(p.velocity, dt);

                            if (p.scaleDown) {
                                p.mesh.scale.multiplyScalar(Math.max(0, 0.95 - (dt * 2)));
                            }

                            if (p.mesh.material && typeof p.mesh.material.opacity !== 'undefined') {
                                p.mesh.material.transparent = true;
                                p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
                            }

                            if (p.life <= 0) {
                                scene.remove(p.mesh);
                                p.mesh.geometry.dispose();
                                p.mesh.material.dispose();
                                particles.splice(i, 1);
                            }
                        }
                    }

                    updateCamera(actualDt);
                } else {
                    updateCamera(dt);
                }

                renderer.render(scene, camera);
            }
            window.animate = animate;
