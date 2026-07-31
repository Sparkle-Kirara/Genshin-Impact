            const keys = window.keys = { w: false, a: false, s: false, d: false, space: false, dash: false, ctrl: false, dashJustPressed: false };
            let altPressed = false;
            Object.defineProperty(window, 'altPressed', {
                get() { return altPressed; },
                set(v) { altPressed = v; },
                configurable: true
            });

            window.addEventListener('contextmenu', (e) => { e.preventDefault(); });

            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (window.isDialogueOpen) {
                        if (window.closeDialogue) window.closeDialogue();
                        return;
                    }
                    if (isGamePaused) {
                        // Close both subwindow and pause menu
                        closeSubWindow();
                        togglePauseMenu(false);
                    } else {
                        togglePauseMenu(true);
                    }
                    return;
                }

                if (e.key === 'Alt') {
                    e.preventDefault();
                    if (!altPressed) { altPressed = true; if (document.pointerLockElement === container) document.exitPointerLock(); }
                    return;
                }

                if (isGamePaused || window.isDialogueOpen || player.isDrowning || player.isDead) return;

                const k = e.key.toLowerCase();
                if (k === 'w' || e.key === 'ArrowUp') keys.w = true;
                if (k === 's' || e.key === 'ArrowDown') keys.s = true;
                if (k === 'a' || e.key === 'ArrowLeft') keys.a = true;
                if (k === 'd' || e.key === 'ArrowRight') keys.d = true;
                if (k === 'e' && !e.repeat) handleSkillKeyDown();
                if (k === 'f') interactWithNearbyObject();
                if (k === 'q' && !e.repeat) handleBurstKeyDown();

                // --- PARTY SWITCH (Pre-Alpha v0.8.5, Bước 1 — input TẠM thời, chưa có Character HUD) ---
                // Phím 1/2/3/4 tương ứng slot 0-3 trong partyState. Chỉ để TEST switchToCharacter() trên
                // desktop trong lúc chưa có UI thật (Bước 3 sẽ thay bằng chạm avatar trên Character HUD
                // và giữ luôn phím số này làm phương án desktop chính thức).
                if (!e.repeat && ['1', '2', '3', '4'].includes(e.key) && window.switchToCharacter) {
                    window.switchToCharacter(parseInt(e.key, 10) - 1);
                }
                
                if (k === 'x' && player.isClimbing) {
                    player.isClimbing = false;
                    player.velocity.set(0, 0, 0);
                    player.velocity.addScaledVector(player.climbNormal, 2.0); 
                }

                if (e.key === 'Control' && !e.repeat) {
                    e.preventDefault(); player.walkMode = !player.walkMode;
                    if (player.walkMode) player.isSprinting = false;
                    const mWalkBtn = document.getElementById('mobile-walk-toggle');
                    if (mWalkBtn) mWalkBtn.classList.toggle('walk-active', player.walkMode);
                    const icon = document.getElementById('mobile-walk-icon');
                    const label = document.getElementById('mobile-walk-label');
                    if (icon) icon.className = player.walkMode ? 'fa-solid fa-person-walking text-sm' : 'fa-solid fa-person-running text-sm';
                    if (label) label.textContent = player.walkMode ? 'WALK' : 'RUN';
                }
                
                if (e.key === 'Shift') {
                    if (!keys.dash) {
                        keys.dashJustPressed = true;
                    }
                    keys.dash = true;
                    if (keys.dashJustPressed) {
                        triggerDash();
                        keys.dashJustPressed = false;
                    }
                }
                if (e.key === ' ' && !e.repeat) { 
                    e.preventDefault(); 
                    if (!keys.space && skillAimState.phase !== 'aiming') {
                        keys.space = true;
                        player.jumpRequested = true;
                        
                        // Disable Glide Activation in Swimming
                        if (!player.isGrounded && !player.isClimbing && !player.isSwimming) {
                            const heightAboveGround = player.position.y - (player.height / 2) - getGroundYForPosition(player.position);
                            if (heightAboveGround > 2.1) {
                                if (player.isGliding) {
                                    deactivateGlider();
                                } else if (player.velocity.y < 3.0 && !player.isPlunging) {
                                    activateGlider();
                                }
                            }
                        }
                    }
                }
            });

            window.addEventListener('keyup', (e) => {
                if (isGamePaused || window.isDialogueOpen || player.isDrowning || player.isDead) return;

                if (e.key === 'Alt') {
                    e.preventDefault();
                    if (altPressed) { altPressed = false; if (!isMobile && document.pointerLockElement !== container && !isGamePaused) container.requestPointerLock().catch(() => {}); }
                    return;
                }
                const k = e.key.toLowerCase();
                if (k === 'w' || e.key === 'ArrowUp') keys.w = false;
                if (k === 's' || e.key === 'ArrowDown') keys.s = false;
                if (k === 'a' || e.key === 'ArrowLeft') keys.a = false;
                if (k === 'd' || e.key === 'ArrowRight') keys.d = false;
                if (e.key === 'Shift') {
                    keys.dash = false;
                    keys.dashJustPressed = false; 
                    player.isSprinting = false;
                }
                if (e.key === ' ') {
                    keys.space = false;
                }
                if (k === 'e') handleSkillKeyUp();
                if (k === 'q') handleBurstKeyUp();
            });

            window.addEventListener('blur', () => { 
                for (let k in keys) keys[k] = false; 
                altPressed = false; 
            });

            window.addEventListener('mousedown', (e) => {
                if (isGamePaused || window.isDialogueOpen || player.isDrowning || player.isDead) return;
                if (isMobile || altPressed || e.target.closest('button') || e.target.closest('.joystick-zone') || e.target.closest('.combat-btn') || e.target.closest('#desktop-skill-btn') || e.target.closest('#game-menu')) return;
                
                if (document.pointerLockElement !== container) { container.requestPointerLock().catch(() => {}); return; }
                if (document.pointerLockElement === container) {
                    if (e.button === 0) handleAttackInput(); 
                    else if (e.button === 2) { 
                        keys.dash = true; 
                        triggerDash(); 
                    }
                }
            });

            window.addEventListener('mouseup', (e) => { 
                if (isGamePaused || window.isDialogueOpen || player.isDrowning || player.isDead) return;
                if (!isMobile && !altPressed && e.button === 2) {
                    keys.dash = false; 
                    player.isSprinting = false;
                }
            });

            window.addEventListener('mousemove', (e) => {
                if (isMobile || isGamePaused || window.isDialogueOpen) return;
                if (document.pointerLockElement === container && !altPressed) {
                    cameraState.targetTheta -= e.movementX * cameraState.sensitivity * cameraSensitivityMultiplier;
                    cameraState.targetPhi += e.movementY * cameraState.sensitivity * cameraSensitivityMultiplier;
                    cameraState.targetPhi = Math.max(cameraState.minPhi, Math.min(cameraState.maxPhi, cameraState.targetPhi));
                }
            });

            document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== container && !altPressed && !isGamePaused) altPressed = false; });

            window.addEventListener('wheel', (e) => {
                if (isGamePaused || window.isDialogueOpen) return;
                cameraState.targetDistance += e.deltaY * cameraState.zoomSensitivity * 0.1;
                cameraState.targetDistance = Math.max(cameraState.minDistance, Math.min(cameraState.maxDistance, cameraState.targetDistance));
            }, { passive: true });

            window.addEventListener('resize', () => {
                camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            });

            // Desktop skill/burst button wiring và joystick refs đã chuyển sang ui.js
            // (xem initDesktopButtons() trong ui.js).

            function startClimbing(normal) {
                // Stamina Guard: Không cho leo nếu kiệt sức
                if (player.stamina <= 0) return;

                player.isClimbing = true;
                player.climbNormal.copy(normal);
                player.velocity.set(0, 0, 0);
                player.inputVelocity.set(0, 0, 0);
                player.isDashing = false;
                player.isSprinting = false;
                player.climbJumpTimer = 0;
                if (player.isGliding) deactivateGlider();
                player.isPlunging = false;
                player.jumpRequested = false;
                
                const targetAngle = Math.atan2(-normal.x, -normal.z);
                player.mesh.rotation.y = targetAngle;
            }

            // syncHUDVariables() đã chuyển sang ui.js

