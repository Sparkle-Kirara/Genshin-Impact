            // --- FLAG: OPENING / TITLE SCREEN ĐANG HIỂN THỊ (Pre-Alpha v0.9) ---
            // window.isOpeningActive được khởi tạo = true ở ĐẦU <head> trong index.html (script inline
            // đầu tiên của toàn trang, trước MỌI file game — kể cả file này). KHÔNG khởi tạo lại ở đây
            // — đặt tại index.html đảm bảo cờ luôn sẵn sàng SỚM HƠN bất kỳ file game logic 01-08 nào
            // kịp chạy, độc lập hoàn toàn với thứ tự load giữa 8 file đó (xem bugfix liên quan: trước
            // đây khởi tạo ở đây, sau 06-camps-save-system.js — file có setInterval autosave chạy
            // top-level — tạo ra 1 khoảng hở lý thuyết). scripts/opening.js (enterGameplay()) là nơi
            // DUY NHẤT được phép đổi cờ này thành false, khi Opening kết thúc.

            const keys = window.keys = { w: false, a: false, s: false, d: false, space: false, dash: false, ctrl: false, dashJustPressed: false };
            let altPressed = false;
            Object.defineProperty(window, 'altPressed', {
                get() { return altPressed; },
                set(v) { altPressed = v; },
                configurable: true
            });

            window.addEventListener('contextmenu', (e) => { e.preventDefault(); });

            // --- GUARD: OPENING / TITLE SCREEN (Pre-Alpha v0.9) ---
            // window.isOpeningActive = true mặc định (đặt đầu <head> trong index.html, tắt = false trong
            // enterGameplay() khi Opening kết thúc). File này (07-input-handlers.js) chạy TOP-LEVEL
            // ngay khi <script> load — TRƯỚC KHI initThree() từng gọi — nên các listener bên dưới đã
            // ĐĂNG KÝ SẴN và sẽ nhận sự kiện ngay cả khi Opening còn đang hiển thị (che gameplay bằng
            // z-index, không chặn input tới window). Nếu không chặn, người chơi có thể: (1) vô tình gây
            // side-effect gameplay (mở Pause Menu, đổi player.walkMode...) trong lúc Opening chạy, hoặc
            // (2) làm crash 'resize' handler (camera/renderer vẫn undefined cho tới khi initThree()
            // chạy xong). Thêm guard sớm nhất có thể trong mỗi handler, TRƯỚC mọi truy cập
            // player/camera/renderer.

            window.addEventListener('keydown', (e) => {
                if (window.isOpeningActive) return;
                if (e.key === 'Escape') {
                    if (window.isDialogueOpen) {
                        if (window.closeDialogue) window.closeDialogue();
                        return;
                    }
                    // Quit Confirmation Popup (Pre-Alpha v0.9) — ưu tiên đóng TRƯỚC nhánh isGamePaused
                    // bên dưới. Nếu không, Escape sẽ đóng cả Paimon Menu (togglePauseMenu(false)) trong
                    // khi popup Quit vẫn còn class 'flex' (chưa qua hideQuitConfirm()) — lần mở Paimon
                    // Menu kế tiếp, popup Quit sẽ hiện đè lên dù người chơi không bấm nút Quit.
                    const quitConfirmOverlay = document.getElementById('quit-confirm-overlay');
                    if (quitConfirmOverlay && !quitConfirmOverlay.classList.contains('hidden')) {
                        if (window.hideQuitConfirm) window.hideQuitConfirm();
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

                // --- PARTY SWITCH (Task 74821 — phím chính thức trên PC) ---
                // Phím 1/2/3/4 = slot 0-3 (hiện gợi ý trên Party HUD bên phải). Đi qua đúng 1 đường
                // switchToCharacter() (kiểm tra slot rỗng/điều kiện chặn ở đó). Bỏ qua khi đang gõ vào ô
                // nhập liệu (input/textarea/contenteditable) để không đổi nhân vật ngoài ý muốn.
                const typingTarget = e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || ''));
                if (!e.repeat && !typingTarget && ['1', '2', '3', '4'].includes(e.key) && window.switchToCharacter) {
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
                if (window.isOpeningActive) return;
                // Alpha M7: THẢ phím di chuyển / Shift / Space luôn được ghi nhận — chỉ đặt cờ về false, không bao giờ gây
                // ra hành động. Trước đây keyup bị bỏ qua cả lúc đang gục / đuối nước / hội thoại / pause: giữ W khi nhân
                // vật gục, thả W trên màn hình tử vong -> hồi sinh xong nhân vật tự chạy (đã tái hiện: 9.9 m trong 1.5 s).
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
                if (isGamePaused || window.isDialogueOpen || player.isDrowning || player.isDead) return;

                if (e.key === 'Alt') {
                    e.preventDefault();
                    if (altPressed) { altPressed = false; if (!isMobile && document.pointerLockElement !== container && !isGamePaused) window.requestGamePointerLock(container); }
                    return;
                }
                if (k === 'e') handleSkillKeyUp();
                if (k === 'q') handleBurstKeyUp();
            });

            // Alpha M1 (BUG-08): mất focus (Alt-Tab, click ra ngoài) HOẶC tab bị ẩn -> nhả TOÀN BỘ input đang
            // giữ: phím di chuyển (như cũ) + joystick/ngón chạm (ui.js) + Attack/Charge/Aim/Held Skill
            // (combat.js — huỷ, KHÔNG ra đòn). Các sự kiện thả nút sẽ không tới trong lúc đó.
            function releaseAllHeldInput(reason) {
                for (let k in keys) keys[k] = false;
                altPressed = false;
                if (window.releaseTouchInputState) window.releaseTouchInputState();
                if (window.cancelHeldCombatInput) window.cancelHeldCombatInput(reason);
            }
            window.addEventListener('blur', () => { 
                if (window.isOpeningActive) return;
                releaseAllHeldInput('blur');
            });
            document.addEventListener('visibilitychange', () => {
                if (window.isOpeningActive || document.visibilityState !== 'hidden') return;
                releaseAllHeldInput('hidden');
            });

            window.addEventListener('mousedown', (e) => {
                if (window.isOpeningActive) return;
                if (isGamePaused || window.isDialogueOpen || player.isDrowning || player.isDead) return;
                if (isMobile || altPressed || e.target.closest('button') || e.target.closest('.joystick-zone') || e.target.closest('.combat-btn') || e.target.closest('#desktop-skill-btn') || e.target.closest('#game-menu')) return;
                
                if (document.pointerLockElement !== container) { window.requestGamePointerLock(container); return; }
                if (document.pointerLockElement === container) {
                    // Charged Attack v1: mousedown giờ gọi handleAttackDown() thay vì
                    // handleAttackInput() trực tiếp — handleAttackDown() tự quyết định bắt đầu charge
                    // (nếu đang idle) hay đi thẳng qua path Normal Attack/combo-buffer cũ (nếu đang
                    // giữa combo, giữ NGUYÊN hành vi cũ 100% cho trường hợp đó — xem combat.js).
                    if (e.button === 0) handleAttackDown();
                    else if (e.button === 2) { 
                        keys.dash = true; 
                        triggerDash(); 
                    }
                }
            });

            window.addEventListener('mouseup', (e) => { 
                if (window.isOpeningActive) return;
                if (isGamePaused || window.isDialogueOpen || player.isDrowning || player.isDead) return;
                // Charged Attack v1: THẢ nút Attack (button 0) -> handleAttackUp() quyết định Normal
                // Attack (thả sớm) hay Charged Attack (đã giữ đủ chargeTime) — xem combat.js. Đây là
                // listener mouseup ĐẦU TIÊN cho Attack (trước đây mousedown là entry point DUY NHẤT,
                // không có xử lý mouseup nào cho Attack) — không đụng gì tới nhánh dash (button 2)
                // ngay bên dưới.
                if (e.button === 0) handleAttackUp();
                if (!isMobile && !altPressed && e.button === 2) {
                    keys.dash = false; 
                    player.isSprinting = false;
                }
            });

            window.addEventListener('mousemove', (e) => {
                if (window.isOpeningActive) return;
                if (isMobile || isGamePaused || window.isDialogueOpen) return;
                if (document.pointerLockElement === container && !altPressed) {
                    cameraState.targetTheta -= e.movementX * cameraState.sensitivity * cameraSensitivityMultiplier;
                    cameraState.targetPhi += e.movementY * cameraState.sensitivity * cameraSensitivityMultiplier;
                    cameraState.targetPhi = Math.max(cameraState.minPhi, Math.min(cameraState.maxPhi, cameraState.targetPhi));
                }
            });

            document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== container && !altPressed && !isGamePaused) altPressed = false; });

            window.addEventListener('wheel', (e) => {
                if (window.isOpeningActive) return;
                if (isGamePaused || window.isDialogueOpen) return;
                cameraState.targetDistance += e.deltaY * cameraState.zoomSensitivity * 0.1;
                cameraState.targetDistance = Math.max(cameraState.minDistance, Math.min(cameraState.maxDistance, cameraState.targetDistance));
            }, { passive: true });

            window.addEventListener('resize', () => {
                // Guard riêng (không dùng window.isOpeningActive) — kiểm tra thẳng camera/renderer đã
                // tồn tại chưa, vì đây là lỗi CRASH cụ thể (không chỉ "input rò rỉ" như các handler
                // khác): camera/renderer là undefined cho tới khi initThree() chạy xong, dù Opening đã
                // kết thúc hay chưa (fallback an toàn 2 lớp).
                if (!camera || !renderer) return;
                camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
                // Alpha M1 (BUG-07): animate() không render khi pause, mà setSize() xoá trắng canvas -> vẽ lại
                // ĐÚNG 1 frame để nền phía sau Paimon Menu không bị đen (không cần khi đang ở Title: canvas ẩn).
                if (window.isGamePaused && !window.isOpeningActive && scene) renderer.render(scene, camera);
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

