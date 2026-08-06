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

                // Tính toán tỷ lệ chìm dưới nước: Độ sâu / Chiều cao nhân vật
                let depthRatio = inWaterNow ? (waterSurfaceY - (player.position.y - playerHalfH)) / player.height : 0;

                // Vào chế độ Bơi nếu ngập hơn 70% cơ thể
                if (inWaterNow && depthRatio > 0.7) {
                    
                    // State Priority: Huỷ bỏ Plunge Attack ngay lập tức nếu đáp xuống vùng nước sâu
                    if (player.isPlunging) {
                        player.isPlunging = false;
                        player.attackState = 'idle';
                        player.sword.rotation.set((-Math.PI / 3) + player.mesh.children[0].rotation.x, 0, Math.PI / 10);
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
                        player.mesh.children[0].rotation.z = 0;
                        player.mesh.children[1].rotation.z = 0;
                        
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

                        // Aim Mode của Elemental Skill: chặn hoàn toàn di chuyển (targetSpeed = 0), giống
                        // cách Genshin khóa chân nhân vật khi giương cung — nhưng KHÔNG chặn camera, người
                        // chơi vẫn xoay hướng ngắm tự do (xử lý riêng trong updateCamera, không đụng ở đây).
                        const targetSpeed = skillAimState.phase === 'aiming' ? 0 : (hasMovementInput ? (player.attackState !== 'idle' ? activeMaxSpeed * 0.35 : activeMaxSpeed) : 0);
                    
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
                if (player.jumpRequested) {
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
                        
                        if (!player.isGrounded && !player.isPlunging && movingIntoWall) {
                            startClimbing(wallDetection.normal);
                            if (player.isSwimming) { 
                                player.isSwimming = false; 
                                player.sword.visible = true; 
                            } // Chuyển từ bơi sang leo tường liền mạch
                        } else if (player.isGrounded && movingIntoWall && (keys.w || (joystickActive && joystickDelta.y < -0.5))) {
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

                    player.mesh.children[0].rotation.x += (targetTiltX - player.mesh.children[0].rotation.x) * (1 - Math.exp(-8 * dt));
                    player.mesh.children[1].rotation.x += (targetTiltX - player.mesh.children[1].rotation.x) * (1 - Math.exp(-8 * dt));
                    player.mesh.children[0].rotation.z += (targetTiltZ - player.mesh.children[0].rotation.z) * (1 - Math.exp(-12 * dt));
                    player.mesh.children[1].rotation.z += (targetTiltZ - player.mesh.children[1].rotation.z) * (1 - Math.exp(-12 * dt));
                    
                    player.sword.visible = false; // Giấu kiếm khi đang bơi
                } 
                else if (player.isClimbing) {
                    const targetAngle = Math.atan2(-player.climbNormal.x, -player.climbNormal.z);
                    let angleDiff = targetAngle - player.mesh.rotation.y;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    player.mesh.rotation.y += angleDiff * (1 - Math.exp(-20 * dt));

                    player.mesh.children[0].rotation.x = -0.1; 
                    player.mesh.children[1].rotation.x = -0.1; 
                    if (player.gliderGroup) player.gliderGroup.rotation.x = -0.1;

                    if (player.attackState === 'idle') {
                        player.sword.rotation.set(-Math.PI / 2, 0, Math.PI / 10);
                    }
                    player.sword.visible = true;
                } else if (!softTargetingActiveThisFrame && player.inputVelocity.lengthSq() > 0.01 && !player.isDashing && !player.isPlunging) {
                    const targetAngle = Math.atan2(player.inputVelocity.x, player.inputVelocity.z);
                    let angleDiff = targetAngle - player.mesh.rotation.y;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    player.mesh.rotation.y += angleDiff * (1 - Math.exp(-14 * dt));

                    const targetTiltX = Math.min(player.inputVelocity.length() * 0.012, 0.18);
                    player.mesh.children[0].rotation.x += (targetTiltX - player.mesh.children[0].rotation.x) * (1 - Math.exp(-12 * dt)); 
                    player.mesh.children[1].rotation.x += (targetTiltX - player.mesh.children[1].rotation.x) * (1 - Math.exp(-12 * dt)); 
                    
                    // Phục hồi lại trục nghiêng thân (nếu trước đó đã nghiêng ngả do bơi lội)
                    player.mesh.children[0].rotation.z += (0 - player.mesh.children[0].rotation.z) * (1 - Math.exp(-12 * dt));
                    player.mesh.children[1].rotation.z += (0 - player.mesh.children[1].rotation.z) * (1 - Math.exp(-12 * dt));

                    if (player.attackState === 'idle') {
                        player.sword.rotation.set((-Math.PI / 3) + player.mesh.children[0].rotation.x, 0, Math.PI / 10);
                    }
                    player.sword.visible = true;
                } else if (!player.isPlunging) {
                    player.mesh.children[0].rotation.x += (0 - player.mesh.children[0].rotation.x) * (1 - Math.exp(-15 * dt));
                    player.mesh.children[1].rotation.x += (0 - player.mesh.children[1].rotation.x) * (1 - Math.exp(-15 * dt));
                    
                    player.mesh.children[0].rotation.z += (0 - player.mesh.children[0].rotation.z) * (1 - Math.exp(-15 * dt));
                    player.mesh.children[1].rotation.z += (0 - player.mesh.children[1].rotation.z) * (1 - Math.exp(-15 * dt));

                    if (player.attackState === 'idle') {
                        player.sword.rotation.set((-Math.PI / 3) + player.mesh.children[0].rotation.x, 0, Math.PI / 10);
                    }
                    player.sword.visible = true;
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
                    // --- ON-GROUND: Idle / Walking / Running / Sprint ---
                    if (player.isSprinting || player.isDashing) {
                        // Sprint: tiêu liên tục theo dt. Dash: chi phí tức thời đã trừ ở triggerDash()
                        // (STAMINA_CONFIG.DASH_COST), ở đây KHÔNG trừ thêm liên tục — nhưng suốt thời
                        // gian animation Dash (isDashing=true) vẫn coi là đang tiêu hao để chặn hồi
                        // phục + reset delay, đúng spec "Dash ngay lập tức hủy hồi, reset bộ đếm 1.5s".
                        if (player.isSprinting) {
                            player.stamina = Math.max(STAMINA_CONFIG.MIN_STAMINA, player.stamina - STAMINA_CONFIG.SPRINT_COST_PER_SECOND * dt);
                        }
                        isConsumingStamina = true;

                        if (player.stamina <= STAMINA_CONFIG.MIN_STAMINA && player.isSprinting) {
                            // Hết Stamina khi Sprint: tự động dừng Sprint, chuyển về chạy/đi bộ thường.
                            player.isSprinting = false;
                        }
                    }
                    // Idle/Walking/Running (không Sprint không Dash) → isConsumingStamina giữ false,
                    // rơi vào khối regen bên dưới như bình thường.
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
                    player.sword.material.emissive.setHex(0x000000); 
                    return; 
                }

                player.attackTimer -= dt;

                if (player.attackState === 'windup') {
                    if (player.attackTimer <= 0) {
                        player.attackState = 'active'; 
                        player.attackTimer = COMBAT_TIMING.active;
                        
                        if (combatStateTag) { combatStateTag.textContent = 'ACTIVE'; combatStateTag.className = 'text-right text-amber-400 font-bold animate-pulse'; }
                        
                        player.mesh.scale.set(0.82, 1.18, 0.82);

                        if (player.isGrounded) {
                            // --- ATTACK LUNGE: tính lại mục tiêu ngay tại thời điểm active bắt đầu (dùng
                            // vị trí/khoảng cách mới nhất, sau khi soft targeting đã xoay xong trong lúc
                            // windup) — không phải Dash, không lao thẳng tới địch. Quãng đường di chuyển
                            // được trải đều qua ATTACK_LUNGE_CONFIG.duration trong updatePhysics(), có
                            // collision-check đầy đủ như di chuyển thường, không cộng thẳng vào velocity
                            // (velocity bị input-movement ghi đè lại mỗi frame nên lunge kiểu cũ mất tác dụng).
                            const lungeTarget = findSoftTargetingRotation(player.position, player.mesh.rotation.y);
                            const lungeDistance = calculateLungeDistance(lungeTarget ? lungeTarget.distance : null);

                            player.lungeDir.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)).normalize();
                            player.lungeRemainingDist = lungeDistance;
                            player.lungeTimer = ATTACK_LUNGE_CONFIG.duration;
                        }

                        player.sword.material.emissive.setHex(0x94a3b8);
                        player.slashWave.visible = true;
                        player.slashWave.scale.setScalar(COMBAT_FEEL_CONFIG.slashEffect.startScale);
                        player.slashWave.material.opacity = COMBAT_FEEL_CONFIG.slashEffect.startOpacity;
                        
                        player.slashWave.rotation.set(Math.PI / 2 - 0.3, -0.3, Math.PI / 6); 
                        
                        player.sword.rotation.set(-Math.PI / 2.2, -Math.PI / 6, Math.PI / 6); 
                    }
                } 
                else if (player.attackState === 'active') {
                    const prog = (COMBAT_TIMING.active - player.attackTimer) / COMBAT_TIMING.active;
                    const se = COMBAT_FEEL_CONFIG.slashEffect;
                    const slashScale = se.startScale + (se.endScale - se.startScale) * prog;
                    player.slashWave.scale.setScalar(slashScale);
                    player.slashWave.material.opacity = se.startOpacity + (se.endOpacity - se.startOpacity) * prog;
                    
                    const startX = -Math.PI / 2.2, startY = -Math.PI / 6, startZ = Math.PI / 6;
                    const endX = Math.PI / 3.5, endY = Math.PI / 2, endZ = -Math.PI / 6;
                    player.sword.rotation.x = startX + (endX - startX) * prog;
                    player.sword.rotation.y = startY + (endY - startY) * prog;
                    player.sword.rotation.z = startZ + (endZ - startZ) * prog;

                    const forward = new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)).normalize();

                    enemies.forEach(enemy => {
                        if (!enemy.alive || player.hasHitList.includes(enemy.id)) return; 

                        const toEnemy = new THREE.Vector3().subVectors(enemy.position, player.position);
                        const combatRange = enemy.isLarge ? 4.2 : 2.8; 
                        
                        if (toEnemy.length() < combatRange) { 
                            toEnemy.normalize();
                            if (forward.dot(toEnemy) > 0.45) { 
                                enemy.takeDamage(player.attack.melee, forward);
                                player.hasHitList.push(enemy.id); 

                                hitstopTimer = COMBAT_FEEL_CONFIG.hitStopDuration;
                                sfx.playHit();
                                cameraState.shakeTimer = COMBAT_FEEL_CONFIG.cameraShake.duration;
                                cameraState.shakeIntensity = COMBAT_FEEL_CONFIG.cameraShake.intensity;

                                const hitPoint = enemy.position.clone().addScaledVector(toEnemy, -0.4);
                                spawnCombatSparks(hitPoint, toEnemy);

                                if (!enemy.alive) spawnDeathParticles(enemy.position);
                            }
                        }
                    });

                    if (player.attackTimer <= 0) {
                        player.attackState = 'recovery'; player.attackTimer = COMBAT_TIMING.recovery;
                        if (combatStateTag) { combatStateTag.textContent = 'RECOVERY'; combatStateTag.className = 'text-right text-sky-500 font-bold'; }
                        player.slashWave.visible = false;
                        player.sword.material.emissive.setHex(0x000000);
                    }
                } 
                else if (player.attackState === 'recovery') {
                    const prog = (COMBAT_TIMING.recovery - player.attackTimer) / COMBAT_TIMING.recovery;
                    
                    const endActiveX = Math.PI / 3.5, endActiveY = Math.PI / 2, endActiveZ = -Math.PI / 6;
                    const idleX = (-Math.PI / 3) + player.mesh.children[0].rotation.x, idleY = 0, idleZ = Math.PI / 10;
                    
                    player.sword.rotation.x = endActiveX + (idleX - endActiveX) * prog;
                    player.sword.rotation.y = endActiveY + (idleY - endActiveY) * prog;
                    player.sword.rotation.z = endActiveZ + (idleZ - endActiveZ) * prog;

                    if (player.attackTimer <= 0) {
                        player.attackState = 'idle';
                        if (combatStateTag) { combatStateTag.textContent = 'IDLE'; combatStateTag.className = 'text-right text-slate-500 font-bold'; }
                        player.sword.rotation.set((-Math.PI / 3) + player.mesh.children[0].rotation.x, 0, Math.PI / 10);
                        if (player.attackBuffered) { player.attackBuffered = false; handleAttackInput(); }
                    }
                }
            }

            function updateProjectiles(dt) {
                for (let i = activeProjectiles.length - 1; i >= 0; i--) {
                    const proj = activeProjectiles[i];
                    proj.mesh.position.addScaledVector(proj.dir, proj.speed * dt);
                    proj.distanceTraveled += proj.speed * dt;
                    
                    if (proj.type === 'hydro_small') {
                        proj.mesh.rotation.y += dt * 12.0;
                        proj.mesh.rotation.x += dt * 7.0;
                        if (Math.random() < ELEMENTAL_SKILL_CONFIG.smallShot.trailChance) {
                            spawnHydroTrail(proj.mesh.position);
                        }
                    } else {
                        proj.mesh.rotation.y += dt * 10.0;
                        if (Math.random() < 0.3) {
                            spawnRunTrail(proj.mesh.position, proj.dir);
                        }
                    }

                    let hitSucceeded = false;
                    const pAABB = new AABB();
                    let projWidth = 0.4;
                    pAABB.updateFromObject(proj.mesh, projWidth, projWidth, projWidth);

                    for (let j = 0; j < enemies.length; j++) {
                        const enemy = enemies[j];
                        if (enemy.alive && intersectAABB(pAABB, enemy.aabb)) {
                            const isHydroProj = proj.type === 'hydro_small';
                            // Pre-Alpha v0.7 — Core Stats: proj.damage là MULTIPLIER tổng hợp (xem
                            // fireHydroProjectile() trong combat.js), không phải damage tuyệt đối.
                            enemy.takeDamage(proj.damage, proj.dir, isHydroProj);

                            if (isHydroProj) {
                                spawnHydroSplash(proj.mesh.position, proj.dir, false);
                                triggerHydroFlash();
                                sfx.playHydroSplash();
                                if (enemy.bodyMesh) {
                                    enemy.mesh.scale.set(1.28, 0.72, 1.28);
                                    enemy.hydroSquashTimer = 0.12;
                                }
                            } else {
                                spawnCombatSparks(proj.mesh.position, proj.dir);
                                sfx.playHit();
                            }
                            
                            player.skillHitCount++;
                            if (player.skillHitCount >= 3) {
                                player.skillHitCount = 0;
                                spawnEnergyParticles(enemy.position);
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
                        scene.remove(proj.mesh);
                        if (proj.mesh.isGroup) {
                            proj.mesh.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); });
                        } else {
                            proj.mesh.geometry.dispose();
                            proj.mesh.material.dispose();
                        }
                        activeProjectiles.splice(i, 1);
                    }
                }
            }

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
                    const offsetAmount = ELEMENTAL_SKILL_CONFIG.aim.cameraSideOffset * skillAimState.cameraOffsetT;
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
                const activeAimZoomDistance = ELEMENTAL_SKILL_CONFIG.aim.cameraZoomDistance;
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

                    if (skillCooldownTimer > 0) {
                        skillCooldownTimer -= actualDt;
                        if (skillCooldownTimer < 0) skillCooldownTimer = 0;
                    }
                    updateSkillCooldown(actualDt);
                    updateBurstUI();

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
                        updateProjectiles(dt);
                        updateHydroBeamVisuals(dt);
                        updateBurst(dt);
                        updateEnergyParticles(dt);
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
