// ============================================================
// ui.js — Tách ra từ index.html
// Chứa: menu logic, HUD sync, burst UI, touch controls (input UI layer)
//
// LƯU Ý QUAN TRỌNG VỀ PHỤ THUỘC:
// File này đọc/ghi các biến global được khai báo trong index.html:
//   player, sfx, keys, cameraState, cameraSensitivityMultiplier,
//   getGroundYForPosition, deactivateGlider, activateGlider,
//   triggerDash, triggerElementalSkill, handleBurstKeyDown, handleBurstKeyUp, handleAttackInput,
//   altPressed
// và từ comic.js (phải load TRƯỚC ui.js):
//   COMIC_CASES
// => index.html PHẢI khai báo các biến/hàm trên TRƯỚC khi ui.js chạy
// các hàm dùng chúng (không cần trước lúc load, chỉ cần trước lúc GỌI).
// ============================================================

// --- Biến DOM & state được chia sẻ với index.html (global qua window) ---
window.container = document.getElementById('canvas-container');
window.isGamePaused = false;
window.isDialogueOpen = false; // true khi Dialogue UI đang mở — khoá input + đóng băng simulation
                                // (xem animate() trong game.js), mirror đúng cách isGamePaused hoạt động.
window.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
window.closeMenuBtn = document.getElementById('close-menu-btn');
window.gameMenu = document.getElementById('game-menu');
window.leftPanel = document.getElementById('menu-left-panel');
window.backdropClose = document.getElementById('menu-backdrop-close');

window.activeWindow = null; // null, 'settings', 'info', 'comic', 'skills-overview', 'reader', 'locked'

window.activeJoystickTouchId = null;
window.activeCameraTouchId = null;
// Touch riêng đang giữ nút Elemental Skill (Aim Mode) — TÁCH BIỆT khỏi activeCameraTouchId để hỗ trợ
// cả 2 kiểu thao tác: (1) 1 ngón giữ nút RỒI kéo lê để vừa giữ vừa xoay hướng bắn, (2) 2 ngón riêng
// biệt (1 giữ nút cố định, 1 ngón khác vẫy tự do để xoay camera qua activeCameraTouchId như bình thường).
window.skillAimTouchId = null;
window.skillAimTouchX = 0;
window.skillAimTouchY = 0;
window.joystickActive = false;
window.joystickStartPos = { x: 0, y: 0 };
window.joystickDelta = { x: 0, y: 0 };
window.touchIsDragging = false;
window.touchStartX = 0;
window.touchStartY = 0;
window.initialPinchDistance = null;

const joystickContainer = document.getElementById('joystick-container');
const joystickHandle = document.getElementById('joystick-handle');

// ============================================================
// STORY READER (Comic UI)
// ============================================================
// comic-story-reader giờ là 1 "trang" NGANG HÀNG với menu-content-comic (không lồng bên
// trong nữa) — mở case sẽ THAY THẾ HOÀN TOÀN trang danh sách, y hệt cách openMenuSubSection()
// chuyển đổi giữa settings/info/comic/skills-overview.
function openStoryReader(caseNum) {
    const listPage = document.getElementById('menu-content-comic');
    const readerPage = document.getElementById('comic-story-reader');
    const titleEl = document.getElementById('story-reader-title');
    const contentEl = document.getElementById('story-reader-content');
    const tagEl = document.getElementById('story-reader-case-tag');

    const story = COMIC_CASES[caseNum];
    if (story) {
        titleEl.textContent = story.title;
        contentEl.innerHTML = story.content;
        tagEl.textContent = story.caseId;

        if (listPage) listPage.classList.add('hidden');
        if (readerPage) readerPage.classList.remove('hidden');

        activeWindow = 'reader';
    }
}
window.openStoryReader = openStoryReader;

function closeStoryReader() {
    const listPage = document.getElementById('menu-content-comic');
    const readerPage = document.getElementById('comic-story-reader');

    if (readerPage && listPage) {
        readerPage.classList.add('hidden');
        listPage.classList.remove('hidden');
    }
    activeWindow = 'comic';
}
window.closeStoryReader = closeStoryReader;

// ============================================================
// SUB WINDOW / MENU NAVIGATION
// ============================================================
window.closeSubWindow = function () {
    const subWin = document.getElementById('rpg-sub-window');
    const subWinPanel = document.getElementById('rpg-sub-window-panel');
    if (subWin && subWinPanel) {
        subWin.classList.add('opacity-0', 'pointer-events-none');
        subWinPanel.classList.add('translate-y-8');
    }

    if (leftPanel) leftPanel.classList.remove('-translate-x-full');

    activeWindow = null;
};

window.handleBackNavigation = function () {
    if (typeof sfx !== 'undefined' && sfx.playSwing) {
        sfx.playSwing();
    }

    if (activeWindow === 'reader') {
        closeStoryReader();
    } else {
        window.closeSubWindow();
    }
};

window.closeMenuSubSection = function () {
    window.handleBackNavigation();
};

let gridAlertTimer = null;
window.showGridFeatureNotification = function (msg) {
    const banner = document.getElementById('grid-alert-banner');
    const text = document.getElementById('grid-alert-text');
    if (!banner || !text) return;

    text.textContent = msg;
    banner.classList.remove('opacity-0', 'pointer-events-none');

    if (gridAlertTimer) clearTimeout(gridAlertTimer);
    gridAlertTimer = setTimeout(() => {
        banner.classList.add('opacity-0', 'pointer-events-none');
    }, 2800);
};

// ============================================================
// PAUSE MENU TOGGLE
// ============================================================
function togglePauseMenu(forceState) {
    isGamePaused = forceState !== undefined ? forceState : !isGamePaused;
    const paimonStarBtn = document.getElementById('paimon-star-btn');
    const backpackBtn = document.getElementById('backpack-btn');

    if (isGamePaused) {
        gameMenu.classList.remove('opacity-0', 'pointer-events-none');
        setTimeout(() => {
            if (leftPanel) leftPanel.classList.remove('-translate-x-full');
        }, 50);

        keys.w = keys.a = keys.s = keys.d = keys.space = keys.dash = keys.ctrl = keys.dashJustPressed = false;
        joystickActive = false;
        joystickDelta = { x: 0, y: 0 };
        if (joystickHandle) joystickHandle.style.transform = 'translate(0px, 0px)';
        if (document.pointerLockElement === container) {
            document.exitPointerLock();
        }

        if (paimonStarBtn) {
            paimonStarBtn.classList.add('opacity-0', 'pointer-events-none');
        }
        // backpack-btn (Pre-Alpha v0.6) ẩn cùng lúc với paimon-star-btn — cả 2 đều là phím tắt HUD,
        // không nên hiện đè lên trên menu overlay khi đang mở.
        if (backpackBtn) {
            backpackBtn.classList.add('opacity-0', 'pointer-events-none');
        }
    } else {
        const subWin = document.getElementById('rpg-sub-window');
        const subWinPanel = document.getElementById('rpg-sub-window-panel');
        if (subWin && subWinPanel) {
            subWin.classList.add('opacity-0', 'pointer-events-none');
            subWinPanel.classList.add('translate-y-8');
        }

        if (leftPanel) leftPanel.classList.add('-translate-x-full');
        setTimeout(() => {
            gameMenu.classList.add('opacity-0', 'pointer-events-none');
        }, 200);

        if (!isMobile && !altPressed) {
            container.requestPointerLock().catch(() => {});
        }

        if (paimonStarBtn) {
            paimonStarBtn.classList.remove('opacity-0', 'pointer-events-none');
        }
        if (backpackBtn) {
            backpackBtn.classList.remove('opacity-0', 'pointer-events-none');
        }

        activeWindow = null;
    }
}
window.togglePauseMenu = togglePauseMenu;

// ============================================================
// SAVE SYSTEM — RESET CONFIRMATION UI (Infrastructure Update #1, mục 4)
// ============================================================
// Chỉ quản lý việc HIỆN/ẨN overlay xác nhận — hành động xoá dữ liệu thực sự (localStorage.removeItem
// + reload trang) nằm trong window.resetSaveData() (game.js), gọi trực tiếp từ nút "Xoá dữ liệu"
// trong HTML (không qua hàm trung gian ở đây, vì không cần xử lý gì thêm trước khi gọi).
window.confirmResetSaveData = function () {
    const overlay = document.getElementById('reset-save-confirm-overlay');
    if (overlay) overlay.classList.remove('hidden');
};
window.closeResetSaveDataConfirm = function () {
    const overlay = document.getElementById('reset-save-confirm-overlay');
    if (overlay) overlay.classList.add('hidden');
};

// ============================================================
// BURST UI (Energy water-fill display)
// ============================================================
function updateBurstUI() {
    const energyRatio = Math.min(player.energy / player.maxEnergy, 1.0);
    const isReady = player.energy >= player.maxEnergy;
    const fillPct = (energyRatio * 100).toFixed(1);
    const rippleTop = (100 - energyRatio * 100).toFixed(1);
    const energyText = `${Math.floor(player.energy)}/${player.maxEnergy}`;
    const rippleOpacity = (energyRatio > 0.05 && energyRatio < 0.98) ? '0.8' : '0';

    function applyWaterUI(waterId, rippleId, iconId, labelId, numId, btnEl) {
        const water = document.getElementById(waterId), ripple = document.getElementById(rippleId);
        const icon = document.getElementById(iconId), label = document.getElementById(labelId), num = document.getElementById(numId);

        if (water) water.style.height = fillPct + '%';
        if (ripple) { ripple.style.top = rippleTop + '%'; ripple.style.opacity = rippleOpacity; }
        if (num) num.textContent = energyText;
        if (!btnEl || !icon || !label) return;

        if (isReady) {
            icon.style.color = '#22d3ee'; icon.style.opacity = '1'; label.style.color = '#22d3ee';
            btnEl.classList.add('burst-ready'); btnEl.style.borderColor = '';
        } else {
            icon.style.color = ''; icon.style.opacity = energyRatio > 0.1 ? '0.75' : '0.35';
            label.style.color = ''; btnEl.classList.remove('burst-ready');
        }
    }
    applyWaterUI('desktop-burst-water', 'desktop-burst-ripple', 'desktop-burst-icon', 'desktop-burst-label', 'desktop-burst-energy-text', document.getElementById('desktop-burst-btn'));
    applyWaterUI('mobile-burst-water', 'mobile-burst-ripple', 'mobile-burst-icon', 'mobile-burst-label', 'mobile-burst-energy-text', document.getElementById('mobile-burst-btn'));
}
window.updateBurstUI = updateBurstUI;

// ============================================================
// TOUCH CONTROLS (mobile input UI layer)
// ============================================================
const setupTouchBtn = (id, actionDown, actionUp = null) => {
    const btn = document.getElementById(id);
    if (btn) {
        btn.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            if (isGamePaused || player.isDrowning) return;
            e.preventDefault();
            actionDown();
        });
        if (actionUp) {
            btn.addEventListener('touchend', (e) => { e.stopPropagation(); if (isGamePaused || player.isDrowning) return; e.preventDefault(); actionUp(); });
            btn.addEventListener('touchcancel', (e) => { e.stopPropagation(); if (isGamePaused || player.isDrowning) return; e.preventDefault(); actionUp(); });
        }
    }
};

function initTouchControls() {
    setupTouchBtn('mobile-attack-btn', handleAttackInput);
    setupTouchBtn('mobile-dash-btn', () => { keys.dash = true; triggerDash(); }, () => { keys.dash = false; player.isSprinting = false; });

    setupTouchBtn('mobile-jump-btn', () => {
        player.jumpRequested = true;
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
    });

    // Nút skill KHÔNG dùng setupTouchBtn chung — cần theo dõi riêng touch.identifier của chính ngón
    // đang giữ nút, để nó cũng có thể xoay camera khi kéo lê (xem xử lý trong touchmove toàn cục).
    const mobileSkillBtn = document.getElementById('mobile-skill-btn');
    if (mobileSkillBtn) {
        mobileSkillBtn.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            if (isGamePaused || player.isDrowning) return;
            e.preventDefault();
            const touch = e.changedTouches[0];
            skillAimTouchId = touch.identifier;
            skillAimTouchX = touch.clientX;
            skillAimTouchY = touch.clientY;
            if (window.handleSkillKeyDown) window.handleSkillKeyDown();
        });
        const endSkillTouch = (e) => {
            e.stopPropagation();
            if (isGamePaused || player.isDrowning) return;
            e.preventDefault();
            skillAimTouchId = null;
            if (window.handleSkillKeyUp) window.handleSkillKeyUp();
        };
        mobileSkillBtn.addEventListener('touchend', endSkillTouch);
        mobileSkillBtn.addEventListener('touchcancel', endSkillTouch);
    }
    // Nút burst dùng touchstart/touchend riêng (không setupTouchBtn) để hỗ trợ Tap/Hold giống
    // Elemental Skill — Tap bắn ngay theo soft target, Hold vào Burst Aim State.
    const mobileBurstBtn = document.getElementById('mobile-burst-btn');
    if (mobileBurstBtn) {
        mobileBurstBtn.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            if (isGamePaused || player.isDrowning) return;
            e.preventDefault();
            if (window.handleBurstKeyDown) window.handleBurstKeyDown();
        });
        const endBurstTouch = (e) => {
            e.stopPropagation();
            if (isGamePaused || player.isDrowning) return;
            e.preventDefault();
            if (window.handleBurstKeyUp) window.handleBurstKeyUp();
        };
        mobileBurstBtn.addEventListener('touchend', endBurstTouch);
        mobileBurstBtn.addEventListener('touchcancel', endBurstTouch);
    }

    setupTouchBtn('mobile-drop-btn', () => {
        if (player.isClimbing) {
            player.isClimbing = false;
            player.velocity.set(0, 0, 0);
            player.velocity.addScaledVector(player.climbNormal, 2.0);
        }
    });

    const mWalkToggle = document.getElementById('mobile-walk-toggle');
    if (mWalkToggle) {
        mWalkToggle.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            if (isGamePaused || player.isDrowning) return;
            e.preventDefault();
            player.walkMode = !player.walkMode; if (player.walkMode) player.isSprinting = false;
            mWalkToggle.classList.toggle('walk-active', player.walkMode);
            const icon = document.getElementById('mobile-walk-icon'), label = document.getElementById('mobile-walk-label');
            if (icon) icon.className = player.walkMode ? 'fa-solid fa-person-walking text-sm' : 'fa-solid fa-person-running text-sm';
            if (label) label.textContent = player.walkMode ? 'WALK' : 'RUN';
        });
    }
}
window.initTouchControls = initTouchControls;

function updateJoystickWithTouch(touch) {
    const maxDrag = 45;
    let dx = touch.clientX - joystickStartPos.x, dy = touch.clientY - joystickStartPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > maxDrag) { dx = (dx / distance) * maxDrag; dy = (dy / distance) * maxDrag; }
    joystickHandle.style.transform = `translate(${dx}px, ${dy}px)`;
    joystickDelta.x = dx / maxDrag; joystickDelta.y = dy / maxDrag;
}

function resetJoystick() {
    joystickActive = false; joystickHandle.style.transform = 'translate(0px, 0px)';
    joystickDelta.x = 0; joystickDelta.y = 0;
}

function initTouchGlobalListeners() {
    window.addEventListener('touchstart', (e) => {
        // Ưu tiên tuyệt đối: nếu điểm chạm nằm trong bất kỳ vùng .scrollable-panel nào
        // (comic, sub-window, hoặc bất kỳ UI cuộn nào thêm sau này), luôn để trình duyệt
        // xử lý scroll gốc — không can thiệp gì cả, không cần chạm đúng thanh cuộn.
        if (e.target.closest('.scrollable-panel')) return;

        if (isGamePaused || player.isDrowning) {
            if (e.target.closest('#menu-left-panel') || e.target.closest('#rpg-sub-window') || e.target.closest('#paimon-star-btn')) {
                return;
            }
            e.preventDefault();
            return;
        }

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            if (targetEl && (targetEl.closest('button') || targetEl.closest('.combat-btn') || targetEl.closest('#desktop-skill-btn') || targetEl.closest('#game-menu'))) continue;

            if (touch.clientX < window.innerWidth / 2) {
                if (activeJoystickTouchId === null) {
                    activeJoystickTouchId = touch.identifier; joystickActive = true;
                    joystickContainer.style.left = `${touch.clientX - 65}px`; joystickContainer.style.bottom = `${window.innerHeight - touch.clientY - 65}px`;
                    joystickStartPos = { x: touch.clientX, y: touch.clientY };
                    updateJoystickWithTouch(touch);
                }
            } else {
                if (activeCameraTouchId === null) { activeCameraTouchId = touch.identifier; touchIsDragging = true; touchStartX = touch.clientX; touchStartY = touch.clientY; }
            }
        }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        // Ưu tiên tuyệt đối: xem chú thích ở touchstart phía trên — cùng nguyên tắc,
        // áp dụng cho mọi vùng .scrollable-panel bất kể trạng thái pause/drowning.
        if (e.target.closest('.scrollable-panel')) return;

        if (isGamePaused || player.isDrowning) {
            if (e.target.closest('#menu-left-panel')) {
                return;
            }
            e.preventDefault();
            return;
        }

        e.preventDefault();
        const cameraTouches = [];
        for (let i = 0; i < e.touches.length; i++) { if (e.touches[i].identifier !== activeJoystickTouchId) cameraTouches.push(e.touches[i]); }

        if (cameraTouches.length === 2) {
            const dx = cameraTouches[0].clientX - cameraTouches[1].clientX, dy = cameraTouches[0].clientY - cameraTouches[1].clientY;
            const currentDist = Math.sqrt(dx * dx + dy * dy);
            if (initialPinchDistance !== null) {
                const factor = currentDist / initialPinchDistance;
                if (factor !== 1) cameraState.targetDistance = Math.max(cameraState.minDistance, Math.min(cameraState.maxDistance, cameraState.targetDistance - (factor - 1) * 2));
            }
            initialPinchDistance = currentDist; return;
        } else initialPinchDistance = null;

        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            if (touch.identifier === activeJoystickTouchId) updateJoystickWithTouch(touch);
            else if (touch.identifier === activeCameraTouchId) {
                cameraState.targetTheta -= (touch.clientX - touchStartX) * cameraState.sensitivity * 1.5 * cameraSensitivityMultiplier;
                cameraState.targetPhi += (touch.clientY - touchStartY) * cameraState.sensitivity * 1.5 * cameraSensitivityMultiplier;
                cameraState.targetPhi = Math.max(cameraState.minPhi, Math.min(cameraState.maxPhi, cameraState.targetPhi));
                touchStartX = touch.clientX; touchStartY = touch.clientY;
            }
            // Ngón đang giữ nút skill (Aim Mode) cũng xoay camera khi kéo lê — độc lập với
            // activeCameraTouchId, nên vẫn hoạt động song song nếu có thêm 1 ngón khác vẫy tự do.
            if (touch.identifier === skillAimTouchId) {
                cameraState.targetTheta -= (touch.clientX - skillAimTouchX) * cameraState.sensitivity * 1.5 * cameraSensitivityMultiplier;
                cameraState.targetPhi += (touch.clientY - skillAimTouchY) * cameraState.sensitivity * 1.5 * cameraSensitivityMultiplier;
                cameraState.targetPhi = Math.max(cameraState.minPhi, Math.min(cameraState.maxPhi, cameraState.targetPhi));
                skillAimTouchX = touch.clientX; skillAimTouchY = touch.clientY;
            }
        }
    }, { passive: false });

    const handleTouchEnd = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeJoystickTouchId) {
                resetJoystick(); activeJoystickTouchId = null;
                joystickContainer.style.left = '40px'; joystickContainer.style.bottom = '40px';
            } else if (e.changedTouches[i].identifier === activeCameraTouchId) { touchIsDragging = false; activeCameraTouchId = null; }

            // An toàn: nếu ngón đang giữ nút skill bị trượt ra khỏi vùng nút trước khi thả tay,
            // touchend gắn trực tiếp trên nút có thể không kích hoạt — dọn dẹp ở đây để tránh
            // Aim Mode bị kẹt mãi mãi (skillAimTouchId không về null, handleSkillKeyUp không được gọi).
            if (e.changedTouches[i].identifier === skillAimTouchId) {
                skillAimTouchId = null;
                if (window.handleSkillKeyUp) window.handleSkillKeyUp();
            }
        }
    };
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });
}
window.initTouchGlobalListeners = initTouchGlobalListeners;

// ============================================================
// MENU BUTTON EVENT WIRING (backdrop, close, paimon star)
// Được gọi 1 lần từ index.html sau khi DOM sẵn sàng
// ============================================================
function initMenuButtons() {
    if (backdropClose) {
        const triggerBackdropClose = () => {
            closeSubWindow();
            togglePauseMenu(false);
        };
        backdropClose.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerBackdropClose();
        });
        backdropClose.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            e.preventDefault();
            triggerBackdropClose();
        }, { passive: false });
    }

    if (closeMenuBtn) {
        closeMenuBtn.addEventListener('click', () => {
            showGridFeatureNotification('Quit / Return to Title features are currently locked.');
            sfx.playBlockedSound();
        });
    }

    const paimonStarBtn = document.getElementById('paimon-star-btn');
    if (paimonStarBtn) {
        const handleStarActivation = () => {
            if (isGamePaused || player.isDrowning) return;

            sfx.playSwing();
            paimonStarBtn.classList.add('star-active-bounce');

            setTimeout(() => {
                paimonStarBtn.classList.remove('star-active-bounce');
                togglePauseMenu(true);
            }, 120);
        };

        // Click trên PC/Desktop
        paimonStarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleStarActivation();
        });

        // Touch trên Mobile
        paimonStarBtn.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            e.preventDefault();
            handleStarActivation();
        }, { passive: false });
    }
}
window.initMenuButtons = initMenuButtons;

// ============================================================
// HUD SYNC — cập nhật hiển thị theo trạng thái player mỗi frame
// ============================================================
function syncHUDVariables() {
    const playerHalfH = player.height / 2;
    const posDisplay = document.getElementById('pos-display');
    if (posDisplay) posDisplay.textContent = `${player.position.x.toFixed(1)}, ${(player.position.y - playerHalfH).toFixed(1)}, ${player.position.z.toFixed(1)}`;
    const energyDisplay = document.getElementById('energy-display');
    if (energyDisplay) energyDisplay.textContent = `${player.energy} / ${player.maxEnergy}`;

    const hpFill = document.getElementById('hp-fill');
    const hpText = document.getElementById('hp-text');
    if (hpFill) {
        const hpRatio = Math.max(0, Math.min(1, player.hp / player.maxHp));
        hpFill.style.width = (hpRatio * 100) + '%';
        hpFill.classList.remove('bg-emerald-600', 'bg-amber-500', 'bg-red-600');
        if (hpRatio > 0.5) hpFill.classList.add('bg-emerald-600');
        else if (hpRatio > 0.25) hpFill.classList.add('bg-amber-500');
        else hpFill.classList.add('bg-red-600');
    }
    if (hpText) hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;

    // Pre-Alpha v0.8 (Character) — cập nhật real-time Character Screen NẾU đang mở đúng tab đó (mục 3
    // spec: "cập nhật theo thời gian thực"). Chỉ vẽ lại khi thực sự đang mở (activeWindow ===
    // 'character') để tránh lãng phí thao tác DOM mỗi frame lúc màn hình đang đóng — cùng cách tối ưu
    // đã áp dụng cho renderInventoryGrid() ở onInventoryItemAdded().
    if (window.activeWindow === 'character' && window.renderCharacterScreen) {
        window.renderCharacterScreen();
    }

    const staminaStateTag = document.getElementById('stamina-state-tag');
    if (staminaStateTag) {
        staminaStateTag.textContent = `${Math.floor(player.stamina)} / ${player.maxStamina}`;
    }

    const dashStateTag = document.getElementById('dash-state-tag');
    if (dashStateTag) {
        if (player.dashCooldownTimer > 0) {
            dashStateTag.textContent = player.dashCooldownTimer.toFixed(1) + "s";
            dashStateTag.className = "text-right text-amber-500 font-bold";
        } else {
            dashStateTag.textContent = "READY";
            dashStateTag.className = "text-right text-emerald-500 font-bold";
        }
    }

    const desktopClimbHint = document.getElementById('desktop-climb-hint');
    const mobileDropBtn = document.getElementById('mobile-drop-btn');

    if (player.isClimbing) {
        if (isMobile && mobileDropBtn) mobileDropBtn.classList.remove('hidden');
        if (!isMobile && desktopClimbHint) desktopClimbHint.classList.remove('hidden');
    } else {
        if (isMobile && mobileDropBtn) mobileDropBtn.classList.add('hidden');
        if (!isMobile && desktopClimbHint) desktopClimbHint.classList.add('hidden');
    }

    const moveStateTag = document.getElementById('move-state-tag');
    if (moveStateTag) {
        if (player.isDrowning) {
            moveStateTag.textContent = "DROWNING";
            moveStateTag.className = "text-right text-red-500 font-bold animate-pulse";
        } else if (player.isClimbing) {
            moveStateTag.textContent = "CLIMB";
            moveStateTag.className = "text-right text-amber-500 font-bold animate-pulse";
        } else if (player.isSwimming) {
            if (player.swimState === 'fast') {
                moveStateTag.textContent = "SWIM FAST";
                moveStateTag.className = "text-right text-cyan-300 font-bold animate-pulse";
            } else if (player.swimState === 'slow') {
                moveStateTag.textContent = "SWIM SLOW";
                moveStateTag.className = "text-right text-cyan-400 font-bold";
            } else {
                moveStateTag.textContent = "SWIM IDLE";
                moveStateTag.className = "text-right text-blue-400 font-bold";
            }
        } else if (player.isDashing) {
            moveStateTag.textContent = "DASH";
            moveStateTag.className = "text-right text-amber-400 font-bold";
        } else if (player.isGliding) {
            moveStateTag.textContent = "GLIDE";
            moveStateTag.className = "text-right text-cyan-400 font-bold animate-pulse";
        } else if (player.isPlunging) {
            moveStateTag.textContent = "PLUNGE";
            moveStateTag.className = "text-right text-red-500 font-bold animate-pulse";
        } else if (player.isSprinting) {
            moveStateTag.textContent = "SPRINT";
            moveStateTag.className = "text-right text-emerald-400 font-bold";
        } else if (player.walkMode) {
            moveStateTag.textContent = "WALK";
            moveStateTag.className = "text-right text-sky-300 font-bold";
        } else if (player.inputVelocity.lengthSq() > 0.01) {
            moveStateTag.textContent = "JOG";
            moveStateTag.className = "text-right text-sky-400 font-bold";
        } else {
            moveStateTag.textContent = "IDLE";
            moveStateTag.className = "text-right text-slate-500 font-bold";
        }
    }

    const physicsDisplay = document.getElementById('physics-display');
    if (physicsDisplay) {
        if (player.isDrowning) {
            physicsDisplay.textContent = "Drowning";
            physicsDisplay.className = "text-right text-red-500 font-bold";
        } else if (player.isClimbing) {
            physicsDisplay.textContent = "Wall (Climbing)";
            physicsDisplay.className = "text-right text-amber-400 font-bold";
        } else if (player.isSwimming) {
            physicsDisplay.textContent = "Water (Swimming)";
            physicsDisplay.className = "text-right text-cyan-400 font-bold";
        } else if (player.isInWater) {
            physicsDisplay.textContent = "Water (Wading)";
            physicsDisplay.className = "text-right text-cyan-500 font-bold";
        } else {
            physicsDisplay.textContent = player.isGrounded ? (player.isSprinting ? "Grounded (Running)" : "Grounded") : (player.isGliding ? "Airborne (Gliding)" : "Airborne");
            physicsDisplay.className = "text-right text-sky-400 font-bold";
        }
    }
}
window.initDesktopButtons = function () {
    const dSkillBtn = document.getElementById('desktop-skill-btn');
    if (dSkillBtn) {
        // mousedown/mouseup (thay vì click) để hỗ trợ Tap/Hold — click chỉ bắn 1 sự kiện lúc thả tay,
        // không đủ để phân biệt thời gian giữ chuột như handleSkillKeyDown/handleSkillKeyUp cần.
        dSkillBtn.addEventListener('mousedown', () => { if (!isGamePaused && window.handleSkillKeyDown) window.handleSkillKeyDown(); });
        dSkillBtn.addEventListener('mouseup', () => { if (window.handleSkillKeyUp) window.handleSkillKeyUp(); });
        dSkillBtn.addEventListener('mouseleave', () => { if (window.handleSkillKeyUp) window.handleSkillKeyUp(); });
    }

    const dBurstBtn = document.getElementById('desktop-burst-btn');
    if (dBurstBtn) {
        dBurstBtn.addEventListener('mousedown', () => { if (!isGamePaused && window.handleBurstKeyDown) window.handleBurstKeyDown(); });
        dBurstBtn.addEventListener('mouseup', () => { if (window.handleBurstKeyUp) window.handleBurstKeyUp(); });
        dBurstBtn.addEventListener('mouseleave', () => { if (window.handleBurstKeyUp) window.handleBurstKeyUp(); });
    }
};

window.syncHUDVariables = syncHUDVariables;

// ============================================================
// PARTY SWITCH TẠM THỜI (Pre-Alpha v0.8.5, Bước 1)
// ============================================================
// initPartySwitchTemp(): render 1 hàng nút tối giản (chưa style theo Character HUD thật) vào
// #party-switch-temp (index.html) — mỗi nút ứng với 1 slot CÓ Character trong window.partyState (bỏ
// qua slot Reserved null). Bấm nút gọi thẳng window.switchToCharacter(index). CHỈ để test trên mobile
// trong lúc Bước 2-3 chưa xây Character HUD/hiệu ứng chuyển thật — khối này sẽ bị THAY THẾ hoàn toàn
// (không phải mở rộng thêm) khi làm Character HUD.
window.initPartySwitchTemp = function () {
    const container = document.getElementById('party-switch-temp');
    if (!container || !window.partyState) return;

    container.innerHTML = '';
    window.partyState.forEach((member, index) => {
        if (!member) return; // Slot Reserved — chưa có Character
        const btn = document.createElement('button');
        btn.className = 'w-14 h-14 rounded-full bg-stone-850/90 border-2 border-stone-700/60 text-white text-[10px] font-bold flex items-center justify-center shadow-lg select-none';
        btn.textContent = member.name;
        btn.addEventListener('click', () => { window.switchToCharacter(index); });
        container.appendChild(btn);
    });
};

// ============================================================
// HỆ THỐNG TƯƠNG TÁC & NHIỆM VỤ (QUEST UI)
// Phụ thuộc: window.nearbyInteractable, window.activeQuests, window.interactables
// (định nghĩa trong game.js), window.interactWithNearbyObject (game.js)
// ============================================================

// Cập nhật prompt "Nhấn F" khi nearbyInteractable thay đổi (gọi từ updatePhysics trong game.js)
window.updateInteractPrompt = function (interactable) {
    const prompt = document.getElementById('interact-prompt');
    const promptText = document.getElementById('interact-prompt-text');
    if (!prompt || !promptText) return;

    if (interactable) {
        const text = (typeof interactable.getPromptText === 'function')
            ? interactable.getPromptText()
            : (interactable.promptText || 'Nhấn F để tương tác');
        promptText.textContent = text;
        prompt.classList.remove('hidden');
    } else {
        prompt.classList.add('hidden');
    }
};

// ============================================================
// QUEST LIST POPUP (v0.6 Wilderness) — danh sách nhiều quest cùng lúc, có scroll
// ============================================================
// Mở từ CẢ HAI nguồn: QuestBoard.onInteract() (bấm F trực tiếp) VÀ
// Katheryne.onDialogueAction('view_quests') (qua dialogue) — cùng 1 hàm, cùng 1 UI, đúng yêu cầu "hai
// cách đều mở ra danh sách nhiệm vụ giống nhau".
window.openQuestListPopup = function (questBoard) {
    const overlay = document.getElementById('quest-list-overlay');
    if (!overlay || !questBoard) return;

    overlay.__questBoard = questBoard; // giữ tham chiếu để render lại sau khi Nhận/Trả
    window.renderQuestListCards(questBoard);

    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    if (document.pointerLockElement === container) {
        document.exitPointerLock();
    }
};

window.closeQuestListPopup = function () {
    const overlay = document.getElementById('quest-list-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
};

// Vẽ lại TOÀN BỘ danh sách card trong popup dựa trên questBoard.getAllQuestInstances() hiện tại —
// gọi lại mỗi khi có thay đổi (mở popup lần đầu, sau khi Nhận, sau khi Trả) để luôn khớp state mới
// nhất, tương tự cách refreshQuestTracker() vẽ lại toàn bộ tracker thay vì patch từng phần tử.
window.renderQuestListCards = function (questBoard) {
    const container = document.getElementById('quest-list-scroll');
    const template = document.getElementById('quest-list-card-template');
    if (!container || !template || !questBoard) return;

    container.innerHTML = '';

    const instances = questBoard.getAllQuestInstances();
    instances.forEach(instance => {
        const entry = questBoard._findActiveEntry(instance.instanceId);
        const clone = template.content.cloneNode(true);

        clone.querySelector('.quest-list-card-title').textContent = instance.title;
        clone.querySelector('.quest-list-card-description').textContent = instance.description;

        const slotTag = clone.querySelector('.quest-list-card-slot-tag');
        if (instance.slot === 'combat') {
            slotTag.textContent = 'Chiến đấu';
            slotTag.className = 'quest-list-card-slot-tag text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-red-400/50 text-red-300 bg-red-500/10';
        } else {
            slotTag.textContent = 'Thu thập';
            slotTag.className = 'quest-list-card-slot-tag text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-emerald-400/50 text-emerald-300 bg-emerald-500/10';
        }

        // Reward: hiện tại luôn đúng 1 entry { type: 'primogem', amount } theo QUEST_DEFINITIONS —
        // hiển thị generic theo reward[0] để không hard-code riêng cho primogem (dễ mở rộng loại
        // thưởng khác sau này chỉmần thêm nhánh if theo reward.type nếu cần icon khác).
        const reward = instance.rewards && instance.rewards[0];
        clone.querySelector('.quest-list-card-reward-text').textContent = reward ? `+${reward.amount} Nguyên Thạch` : '';

        const progressEl = clone.querySelector('.quest-list-card-progress');
        const actionBtn = clone.querySelector('.quest-list-card-action-btn');

        if (!entry) {
            // Chưa nhận
            progressEl.textContent = `0/${instance.targetCount}`;
            actionBtn.textContent = 'Nhận nhiệm vụ';
            actionBtn.className = 'quest-list-card-action-btn mt-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors text-[#12101e] bg-amber-400 hover:bg-amber-300';
            actionBtn.onclick = () => {
                questBoard.acceptQuest(instance.instanceId);
                window.renderQuestListCards(questBoard); // Vẽ lại ngay để card chuyển sang "Đang làm"
            };
        } else if (entry.status === 'completed') {
            progressEl.textContent = `${entry.currentCount}/${entry.targetCount}`;
            actionBtn.textContent = 'Trả nhiệm vụ';
            actionBtn.className = 'quest-list-card-action-btn mt-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors text-[#12101e] bg-emerald-400 hover:bg-emerald-300';
            actionBtn.onclick = () => {
                questBoard.turnInQuest(instance.instanceId);
                window.renderQuestListCards(questBoard); // Slot đã được cấp quest MỚI trong turnInQuest() — vẽ lại để hiện ngay
            };
        } else {
            // status 'active', chưa đủ điều kiện trả
            progressEl.textContent = `${entry.currentCount}/${entry.targetCount}`;
            actionBtn.textContent = 'Đang thực hiện';
            actionBtn.disabled = true;
            actionBtn.className = 'quest-list-card-action-btn mt-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors text-stone-500 bg-stone-800 cursor-not-allowed';
        }

        container.appendChild(clone);
    });
};

// Vẽ lại toàn bộ quest tracker dựa trên window.activeQuests hiện tại
window.refreshQuestTracker = function () {
    const tracker = document.getElementById('quest-tracker');
    const template = document.getElementById('quest-tracker-item-template');
    if (!tracker || !template || !window.activeQuests) return;

    const quests = window.activeQuests.filter(q => q.status !== 'turned_in');
    if (quests.length === 0) {
        tracker.classList.add('hidden');
        tracker.classList.remove('flex');
        tracker.innerHTML = '';
        return;
    }

    tracker.innerHTML = '';
    quests.forEach(q => {
        const clone = template.content.cloneNode(true);
        const itemEl = clone.querySelector('.quest-tracker-item');
        itemEl.dataset.questId = q.id;
        clone.querySelector('.quest-tracker-title').textContent = q.title;
        clone.querySelector('.quest-tracker-progress').textContent = `${q.currentCount}/${q.targetCount}`;

        const exclaim = clone.querySelector('.quest-tracker-exclaim');
        if (q.status === 'completed' && exclaim) {
            exclaim.textContent = '✓';
            exclaim.classList.remove('text-red-400');
            exclaim.classList.add('text-emerald-400');
        }

        tracker.appendChild(clone);
    });

    tracker.classList.remove('hidden');
    tracker.classList.add('flex');
};

// Hiện popup "HOÀN THÀNH" giữa màn hình trong 1.4s
window.showQuestCompletePopup = function () {
    const popup = document.getElementById('quest-complete-popup');
    if (!popup) return;
    popup.classList.remove('hidden');
    popup.classList.add('flex');
    setTimeout(() => {
        popup.classList.add('hidden');
        popup.classList.remove('flex');
    }, 1400);
};

// Hiện 1 dòng phần thưởng (VD: "+45 Gold") ở góc trái, tự biến mất sau 2s
window.showRewardPopup = function (iconClass, text) {
    const container = document.getElementById('reward-popup-container');
    const template = document.getElementById('reward-popup-item-template');
    if (!container || !template) return;

    const clone = template.content.cloneNode(true);
    const itemEl = clone.querySelector('.reward-popup-item');
    clone.querySelector('.reward-popup-icon').className = 'reward-popup-icon ' + iconClass + ' text-sm';
    clone.querySelector('.reward-popup-text').textContent = text;

    container.appendChild(itemEl);
    // Trigger fade-in ở frame kế tiếp (để transition CSS hoạt động)
    requestAnimationFrame(() => { itemEl.classList.remove('opacity-0'); });

    setTimeout(() => {
        itemEl.classList.add('opacity-0');
        setTimeout(() => { itemEl.remove(); }, 300);
    }, 2000);
};

// Hiện thông báo nhặt vật phẩm (Pre-Alpha v0.6 — Inventory), VD "Sweet Flower +1". Dùng chung
// #reward-popup-container/style với showRewardPopup() ở trên, nhưng KHÔNG dùng chung hàm đó vì icon
// vật phẩm (ITEM_DATABASE[id].icon) có thể là emoji ('🌸') hoặc class Font Awesome ('fa-solid fa-...')
// tuỳ item — showRewardPopup() giả định luôn là class FA nên gán thẳng vào className, emoji sẽ không
// hiển thị đúng qua đường đó. Tự nhận diện: chuỗi bắt đầu bằng 'fa-' -> icon FA (dùng <i>), ngược lại
// hiển thị trực tiếp làm text bên trong <i> (emoji vẫn render bình thường như 1 ký tự unicode).
window.showItemPickupPopup = function (itemId, quantity) {
    const def = window.ITEM_DATABASE ? window.ITEM_DATABASE[itemId] : null;
    if (!def) return;

    const container = document.getElementById('reward-popup-container');
    const template = document.getElementById('reward-popup-item-template');
    if (!container || !template) return;

    const clone = template.content.cloneNode(true);
    const itemEl = clone.querySelector('.reward-popup-item');
    const iconEl = clone.querySelector('.reward-popup-icon');

    const isFontAwesome = typeof def.icon === 'string' && def.icon.startsWith('fa-');
    if (isFontAwesome) {
        iconEl.className = 'reward-popup-icon ' + def.icon + ' text-sm';
    } else {
        // Emoji/text thuần — bỏ hết class FA, chỉ giữ font-size tương đương để căn chỉnh đẹp.
        iconEl.className = 'reward-popup-icon text-sm';
        iconEl.textContent = def.icon;
    }
    clone.querySelector('.reward-popup-text').textContent = `${def.name} +${quantity}`;

    container.appendChild(itemEl);
    requestAnimationFrame(() => { itemEl.classList.remove('opacity-0'); });

    setTimeout(() => {
        itemEl.classList.add('opacity-0');
        setTimeout(() => { itemEl.remove(); }, 300);
    }, 2000);
};

// Hook vào Inventory.addItem() (game.js) — được gọi MỖI LẦN có item mới được thêm vào túi, bất kể
// nguồn gốc (WorldItem.onInteract(), REWARD_HANDLERS.material, hay bất kỳ nguồn nào sau này). Đặt hook
// ở đây (thay vì gọi showItemPickupPopup() trực tiếp trong WorldItem.onInteract()) để MỌI đường thêm
// item trong tương lai đều tự động có thông báo, không cần nhớ gọi popup ở từng nơi gọi addItem().
window.onInventoryItemAdded = function (itemId, addedQuantity, newTotal) {
    window.showItemPickupPopup(itemId, addedQuantity);
    // Nếu đang mở đúng tab Inventory lúc nhặt được item (hiếm khi xảy ra vì World item nhặt lúc đang
    // chơi, menu đóng — nhưng vẫn xử lý đúng cho trường hợp mở đồng thời/debug) thì vẽ lại grid ngay.
    if (window.activeWindow === 'inventory' && window.renderInventoryCategoryTabs) {
        window.renderInventoryGrid(window.currentInventoryCategory || 'material');
    }
};

// ============================================================
// INVENTORY UI (Pre-Alpha v0.6)
// ============================================================
// Đọc dữ liệu từ window.ITEM_CATEGORIES / window.ITEM_DATABASE / window.playerInventory (game.js) —
// file này (Engine/UI, tầng 3 trong kiến trúc 3-layer) hoàn toàn không biết chi tiết từng item cụ
// thể, chỉ biết cách VẼ ra DOM từ dữ liệu được cung cấp.

// Danh mục đang được chọn trong tab — giữ state ở đây (không phải trong game.js) vì đây thuần là
// trạng thái UI, không phải trạng thái game (không cần lưu khi save/load sau này).
window.currentInventoryCategory = 'material';
window.currentInventorySelectedItemId = null;

// Vẽ lại toàn bộ dải tab danh mục từ ITEM_CATEGORIES — gọi 1 lần mỗi khi mở Inventory (không cần
// gọi lại liên tục vì ITEM_CATEGORIES không đổi lúc runtime, khác với renderInventoryGrid).
window.renderInventoryCategoryTabs = function () {
    const container = document.getElementById('inventory-category-tabs');
    const template = document.getElementById('inventory-category-tab-template');
    if (!container || !template || !window.ITEM_CATEGORIES) return;

    container.innerHTML = '';
    Object.keys(window.ITEM_CATEGORIES).forEach(categoryKey => {
        const cat = window.ITEM_CATEGORIES[categoryKey];
        const clone = template.content.cloneNode(true);
        const btn = clone.querySelector('.inventory-category-tab');
        btn.querySelector('.inventory-category-tab-icon').className = 'inventory-category-tab-icon ' + cat.icon;
        btn.querySelector('.inventory-category-tab-label').textContent = cat.label;
        btn.dataset.category = categoryKey;
        btn.onclick = () => window.renderInventoryGrid(categoryKey);
        container.appendChild(btn);
    });

    window.renderInventoryGrid(window.currentInventoryCategory);
};

// Vẽ lại grid vật phẩm cho 1 danh mục cụ thể + cập nhật trạng thái active của tab tương ứng. Gọi lại
// hàm này (không phải renderInventoryCategoryTabs) mỗi khi CHỈ dữ liệu số lượng đổi (VD vừa nhặt thêm
// 1 item) — tránh vẽ lại tab không cần thiết.
window.renderInventoryGrid = function (categoryKey) {
    window.currentInventoryCategory = categoryKey;

    // Cập nhật style active/inactive cho tab — thêm/bớt trực tiếp các class Tailwind cụ thể (xem
    // giải thích ở template trong index.html) thay vì 1 custom class trừu tượng.
    const TAB_ACTIVE_CLASSES = ['border-amber-400/70', 'text-amber-200', 'bg-[#241f3b]'];
    const TAB_INACTIVE_CLASSES = ['border-[#2d284f]/60', 'text-[#9c94c0]', 'bg-[#141224]/60'];
    document.querySelectorAll('.inventory-category-tab').forEach(tab => {
        const isActive = tab.dataset.category === categoryKey;
        if (isActive) {
            tab.classList.remove(...TAB_INACTIVE_CLASSES);
            tab.classList.add(...TAB_ACTIVE_CLASSES);
        } else {
            tab.classList.remove(...TAB_ACTIVE_CLASSES);
            tab.classList.add(...TAB_INACTIVE_CLASSES);
        }
    });

    const grid = document.getElementById('inventory-item-grid');
    const emptyState = document.getElementById('inventory-empty-state');
    const template = document.getElementById('inventory-item-slot-template');
    if (!grid || !template || !window.playerInventory) return;

    const items = window.playerInventory.getItemsByCategory(categoryKey);

    grid.innerHTML = '';
    if (items.length === 0) {
        grid.classList.add('hidden');
        if (emptyState) { emptyState.classList.remove('hidden'); emptyState.classList.add('flex'); }
    } else {
        grid.classList.remove('hidden');
        if (emptyState) { emptyState.classList.add('hidden'); emptyState.classList.remove('flex'); }

        items.forEach(item => {
            const clone = template.content.cloneNode(true);
            const slot = clone.querySelector('.inventory-item-slot');
            const iconEl = slot.querySelector('.inventory-item-slot-icon');

            const isFontAwesome = typeof item.icon === 'string' && item.icon.startsWith('fa-');
            if (isFontAwesome) {
                iconEl.innerHTML = `<i class="${item.icon}"></i>`;
            } else {
                iconEl.textContent = item.icon;
            }

            slot.querySelector('.inventory-item-slot-qty').textContent = item.stackable ? `×${item.quantity}` : '';
            slot.dataset.itemId = item.id;
            slot.onclick = () => window.selectInventoryItem(item.id);
            grid.appendChild(slot);
        });
    }

    // Nếu item đang được chọn không còn thuộc danh mục hiện tại (vừa đổi tab) hoặc không còn tồn tại
    // trong túi (số lượng về 0 — chưa xảy ra ở v0.6 vì chưa có tính năng dùng/bỏ item, nhưng xử lý
    // trước cho chắc), ẩn panel chi tiết thay vì hiển thị dữ liệu cũ sai lệch.
    const stillValid = items.some(i => i.id === window.currentInventorySelectedItemId);
    if (!stillValid) window.clearInventoryDetail();
};

// Hiển thị panel chi tiết cho 1 item cụ thể khi người chơi bấm vào ô trong grid.
window.selectInventoryItem = function (itemId) {
    const def = window.ITEM_DATABASE ? window.ITEM_DATABASE[itemId] : null;
    const quantity = window.playerInventory ? window.playerInventory.getQuantity(itemId) : 0;
    if (!def || quantity <= 0) { window.clearInventoryDetail(); return; }

    window.currentInventorySelectedItemId = itemId;

    document.getElementById('inventory-detail-empty')?.classList.add('hidden');
    document.getElementById('inventory-detail-content')?.classList.remove('hidden');
    document.getElementById('inventory-detail-content')?.classList.add('flex');

    const iconEl = document.getElementById('inventory-detail-icon');
    if (iconEl) {
        const isFontAwesome = typeof def.icon === 'string' && def.icon.startsWith('fa-');
        iconEl.innerHTML = isFontAwesome ? `<i class="${def.icon}"></i>` : '';
        if (!isFontAwesome) iconEl.textContent = def.icon;
    }

    const nameEl = document.getElementById('inventory-detail-name');
    if (nameEl) nameEl.textContent = def.name;

    const categoryEl = document.getElementById('inventory-detail-category');
    if (categoryEl) categoryEl.textContent = window.ITEM_CATEGORIES[def.category] ? window.ITEM_CATEGORIES[def.category].label : def.category;

    const descEl = document.getElementById('inventory-detail-description');
    if (descEl) descEl.textContent = def.description;

    const qtyEl = document.getElementById('inventory-detail-quantity');
    if (qtyEl) qtyEl.textContent = quantity;

    // Highlight lại đúng ô đang chọn trong grid — dùng class Tailwind cụ thể (xem giải thích ở
    // template trong index.html), thông qua helper dùng chung với clearInventoryDetail() bên dưới.
    window.updateInventorySlotHighlight(itemId);
};

// Helper dùng chung: gán/gỡ style "đang được chọn" cho đúng 1 slot trong grid — tách riêng để
// selectInventoryItem() và clearInventoryDetail() (gỡ toàn bộ highlight) không lặp code.
const INVENTORY_SLOT_ACTIVE_CLASSES = ['border-amber-400/70', 'bg-[#1c1830]'];
window.updateInventorySlotHighlight = function (selectedItemId) {
    document.querySelectorAll('.inventory-item-slot').forEach(slot => {
        if (slot.dataset.itemId === selectedItemId) {
            slot.classList.add(...INVENTORY_SLOT_ACTIVE_CLASSES);
        } else {
            slot.classList.remove(...INVENTORY_SLOT_ACTIVE_CLASSES);
        }
    });
};

window.clearInventoryDetail = function () {
    window.currentInventorySelectedItemId = null;
    document.getElementById('inventory-detail-content')?.classList.add('hidden');
    document.getElementById('inventory-detail-content')?.classList.remove('flex');
    document.getElementById('inventory-detail-empty')?.classList.remove('hidden');
    window.updateInventorySlotHighlight(null); // null -> không có slot nào khớp -> gỡ hết highlight
};

// ============================================================
// CHARACTER UI (Pre-Alpha v0.8)
// ============================================================
// Đọc dữ liệu từ window.CHARACTER_DATA / window.LEVEL_CONFIG / window.player (game.js) — file này
// (Engine/UI, tầng 3 trong kiến trúc 3-layer, cùng pattern với Inventory/Quest) hoàn toàn không biết
// công thức level/EXP tính thế nào, chỉ biết cách VẼ ra DOM từ dữ liệu được cung cấp.

// Vẽ lại toàn bộ Character Screen — gọi mỗi lần mở tab Character (openMenuSubSection('character'))
// để đảm bảo luôn khớp state mới nhất, và cũng được gọi lại bởi checkLevelUp() (game.js) + syncHUDVariables()
// (ngay dưới) để cập nhật real-time nếu màn hình đang mở lúc HP đổi (mục 3 spec: "cập nhật theo thời
// gian thực khi nhân vật tăng cấp hoặc thay đổi dữ liệu").
window.renderCharacterScreen = function () {
    if (!window.CHARACTER_DATA || !window.player) return;
    const data = window.CHARACTER_DATA;
    const p = window.player;

    const nameEl = document.getElementById('character-name');
    if (nameEl) nameEl.textContent = data.name;

    const regionEl = document.getElementById('character-region');
    if (regionEl) regionEl.textContent = data.region || '';

    const elementEl = document.getElementById('character-element');
    if (elementEl) elementEl.textContent = data.element;

    const levelEl = document.getElementById('character-level');
    if (levelEl) levelEl.textContent = p.level || 1;

    // Thanh EXP — dùng window.LEVEL_CONFIG.expForLevel() (game.js) để biết ngưỡng EXP cần cho level
    // hiện tại, KHÔNG tự tính công thức riêng ở đây (UI không biết gì về cách tính, chỉ hiển thị).
    const expFill = document.getElementById('character-exp-fill');
    const expText = document.getElementById('character-exp-text');
    if (window.LEVEL_CONFIG) {
        const needed = window.LEVEL_CONFIG.expForLevel(p.level || 1);
        const current = p.exp || 0;
        const ratio = needed > 0 ? Math.max(0, Math.min(1, current / needed)) : 0;
        if (expFill) expFill.style.width = (ratio * 100) + '%';
        if (expText) expText.textContent = `${Math.floor(current)} / ${needed}`;
    }

    // Attributes — đọc TRỰC TIẾP từ player.hp/maxHp/stats (cùng nguồn dữ liệu HUD thanh máu chính
    // dùng, xem syncHUDVariables()) để không bao giờ lệch giữa 2 nơi hiển thị HP.
    const hpFill = document.getElementById('character-hp-fill');
    const hpText = document.getElementById('character-hp-text');
    if (hpFill) {
        const hpRatio = Math.max(0, Math.min(1, p.hp / p.maxHp));
        hpFill.style.width = (hpRatio * 100) + '%';
        hpFill.classList.remove('bg-emerald-600', 'bg-amber-500', 'bg-red-600');
        if (hpRatio > 0.5) hpFill.classList.add('bg-emerald-600');
        else if (hpRatio > 0.25) hpFill.classList.add('bg-amber-500');
        else hpFill.classList.add('bg-red-600');
    }
    if (hpText) hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;

    const atkText = document.getElementById('character-atk-text');
    if (atkText) atkText.textContent = p.stats.atk;

    const defText = document.getElementById('character-def-text');
    if (defText) defText.textContent = p.stats.def;
};

// ============================================================
// PLAYER NAME PROMPT (Pre-Alpha v0.8 — UI adjustment)
// ============================================================
// Hiện ĐÚNG 1 LẦN lúc bắt đầu hành trình mới (initThree() gọi khi loadGameData() trả về null — xem
// 04-scene-init.js). Dùng chung togglePauseMenu(true) để khoá input/pointer lock giống hệt lúc mở
// Pause Menu bình thường — tránh người chơi vẫn di chuyển/điều khiển được trong lúc modal đang che
// màn hình. KHÔNG dùng window.confirm()/prompt() (native browser dialog) vì spec yêu cầu giao diện
// riêng theo phong cách game (2 nút Xác nhận/Hủy, style nhất quán với các popup khác).
window.showPlayerNamePrompt = function () {
    const overlay = document.getElementById('player-name-prompt-overlay');
    const input = document.getElementById('player-name-prompt-input');
    if (!overlay) return;

    if (!window.isGamePaused) window.togglePauseMenu(true);
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    if (input) {
        input.value = '';
        // Focus sau 1 frame — tránh trường hợp overlay vừa hiện (transition) chưa nhận input ngay.
        requestAnimationFrame(() => input.focus());
    }
};

window.closePlayerNamePrompt = function () {
    const overlay = document.getElementById('player-name-prompt-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
    if (window.isGamePaused) window.togglePauseMenu(false);
};

// Xác nhận: tên vừa nhập (trim khoảng trắng thừa) — nếu rỗng sau khi trim, coi như Hủy (fallback
// 'Traveler', xử lý ngay trong setCharacterName() ở game.js, không cần kiểm tra riêng ở đây).
window.confirmPlayerNamePrompt = function () {
    const input = document.getElementById('player-name-prompt-input');
    const name = input ? input.value : '';
    if (window.setCharacterName) window.setCharacterName(name);
    if (window.requestSave) window.requestSave(); // Lưu ngay — mục 2: "dữ liệu... sẽ lưu vào data"
    window.closePlayerNamePrompt();
};

// Hủy: tên mặc định 'Traveler' (setCharacterName() tự fallback khi truyền chuỗi rỗng).
window.cancelPlayerNamePrompt = function () {
    if (window.setCharacterName) window.setCharacterName('');
    if (window.requestSave) window.requestSave();
    window.closePlayerNamePrompt();
};

// Phím tắt mở Character Screen từ icon trên HUD (mục 1, cách 1 trong character.md) — cùng pattern với
// openInventoryQuick(): mở Pause Menu trước (nếu chưa mở) rồi nhảy thẳng tới tab Character, thay vì
// người chơi phải tự mở Paimon Menu rồi bấm vào ô Character theo cách 2.
window.openCharacterQuick = function () {
    if (window.isDialogueOpen) return; // Không mở đè lên Dialogue đang mở
    if (!window.isGamePaused) {
        window.togglePauseMenu(true);
    }
    // Đợi 1 frame để togglePauseMenu() kịp hiện #game-menu (transition), tránh openMenuSubSection()
    // thao tác trên phần tử vẫn còn pointer-events-none.
    requestAnimationFrame(() => {
        if (window.openMenuSubSection) window.openMenuSubSection('character');
    });
};

// Phím tắt mở Inventory từ icon Backpack trên HUD (mục 1, cách 2 trong đề bài) — mở PAUSE MENU trước
// (nếu chưa mở) rồi nhảy thẳng tới tab Inventory, thay vì người chơi phải tự mở Paimon Menu rồi bấm
// vào ô Inventory theo cách 1. Dùng chung togglePauseMenu()/openMenuSubSection() để hành vi (khoá
// input, pointer lock, v.v.) nhất quán với việc mở menu thông thường.
window.openInventoryQuick = function () {
    if (window.isDialogueOpen) return; // Không mở đè lên Dialogue đang mở
    if (!window.isGamePaused) {
        window.togglePauseMenu(true);
    }
    // Đợi 1 frame để togglePauseMenu() kịp hiện #game-menu (transition), tránh openMenuSubSection()
    // thao tác trên phần tử vẫn còn pointer-events-none.
    requestAnimationFrame(() => {
        if (window.openMenuSubSection) window.openMenuSubSection('inventory');
    });
};



// Khởi tạo toàn bộ event wiring cho hệ thống quest — gọi 1 lần lúc khởi động
window.initQuestSystem = function () {
    const overlay = document.getElementById('quest-list-overlay');
    const closeBtn = document.getElementById('quest-list-close-btn');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => window.closeQuestListPopup());
    }

    // Bấm ra ngoài popup (backdrop) cũng đóng — nhất quán với các popup khác trong game
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) window.closeQuestListPopup();
        });
    }

    // Nút prompt tương tác — dùng chung cho cả click chuột (desktop) và chạm (mobile)
    const interactBtn = document.getElementById('interact-prompt-btn');
    if (interactBtn) {
        interactBtn.addEventListener('click', () => {
            if (window.interactWithNearbyObject) window.interactWithNearbyObject();
        });
        interactBtn.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (window.interactWithNearbyObject) window.interactWithNearbyObject();
        }, { passive: false });
    }
};

// ============================================================
// HỆ THỐNG DIALOGUE (Pre-Alpha v0.5) — ENGINE / UI
// Phụ thuộc: window.NPC_DIALOGUE_DATA, window.isDialogueOpen (định nghĩa trong game.js/ui.js)
// Nền tảng dùng chung cho NPC / Quest / Shop / Blacksmith / Cooking / Story / Cutscene / Event —
// engine ở đây KHÔNG biết gì về nội dung hay ý nghĩa của từng "action" cụ thể, chỉ biết cách hiển
// thị 1 script (mảng node) và chuyển tiếp/kết thúc — xem chú thích cấu trúc dữ liệu trong game.js
// (NPC_DIALOGUE_DATA) để hiểu cách 1 NPC cụ thể gắn nội dung + xử lý riêng vào engine chung này.
// ============================================================

const DIALOGUE_CONFIG = {
    // Tốc độ hiệu ứng Typewriter — số mili-giây giữa mỗi ký tự hiện ra. Đặt ở đây (không hard-code
    // trong hàm) để dễ tinh chỉnh, và là chỗ tự nhiên để sau này thêm chế độ "Auto Play"/tốc độ đọc
    // tuỳ chỉnh (mục 9 — khả năng mở rộng) mà không phải sửa lại logic typewriter.
    typewriterMs: 22
};

// --- SESSION STATE (runtime, không phải data-driven) ---
// Chỉ tồn tại trong lúc dialogue đang mở — reset hoàn toàn mỗi lần openDialogue()/closeDialogue().
let dialogueSession = {
    npc: null,          // NPC instance đang nói chuyện (để gọi lại onDialogueAction())
    script: null,       // mảng node hiện tại đang chạy (1 trong các key của NPC_DIALOGUE_DATA[npcId])
    lineIndex: 0,       // node hiện tại trong script
    isTyping: false,    // đang chạy hiệu ứng typewriter hay đã hiện xong toàn bộ text
    typewriterHandle: null // interval id, LUÔN phải clear trước khi bắt đầu 1 typewriter mới
};

// Mở hội thoại với 1 NPC — gọi từ NPC.onInteract() trong game.js. Tự tra state hiện tại của NPC
// (npc.getDialogueState()) để chọn đúng script trong NPC_DIALOGUE_DATA[npc.npcId].
window.openDialogue = function (npc) {
    if (!npc || !npc.npcId) return;
    const npcData = window.NPC_DIALOGUE_DATA && window.NPC_DIALOGUE_DATA[npc.npcId];
    if (!npcData) { console.warn('Không tìm thấy dữ liệu hội thoại cho npcId:', npc.npcId); return; }

    const stateKey = (typeof npc.getDialogueState === 'function') ? npc.getDialogueState() : 'default';
    const script = npcData[stateKey] || npcData.default;
    if (!script || script.length === 0) return;

    window.isDialogueOpen = true;

    // Xoá sạch input đang giữ (giống hệt togglePauseMenu(true)) — tránh việc nhân vật "kẹt" di
    // chuyển theo hướng cũ sau khi đóng dialogue nếu người chơi đang giữ phím lúc mở hội thoại.
    if (typeof keys === 'object') {
        keys.w = keys.a = keys.s = keys.d = keys.space = keys.dash = keys.ctrl = keys.dashJustPressed = false;
    }
    if (document.pointerLockElement === container) {
        document.exitPointerLock();
    }

    dialogueSession.npc = npc;
    dialogueSession.script = script;
    dialogueSession.lineIndex = 0;

    const box = document.getElementById('dialogue-box');
    if (box) { box.classList.remove('hidden'); box.classList.add('flex'); }

    renderDialogueLine();
};

// Hiện node hiện tại (dialogueSession.script[dialogueSession.lineIndex]) — chạy typewriter, ẩn
// choices/continue-indicator cho tới khi text hiện xong.
function renderDialogueLine() {
    const node = dialogueSession.script[dialogueSession.lineIndex];
    if (!node) { window.closeDialogue(); return; }

    const speakerEl = document.getElementById('dialogue-speaker');
    if (speakerEl) speakerEl.textContent = node.speaker || '';

    hideDialogueChoices();
    setDialogueContinueIndicatorVisible(false);
    startDialogueTypewriter(node.text || '');

    // --- ĐIỂM MỞ RỘNG (mục 9, chưa triển khai) ---
    // node.portrait / node.expression / node.voice / node.camera / node.animation đã có sẵn trong
    // cấu trúc dữ liệu (xem game.js) — chỗ này là nơi tự nhiên để áp dụng chúng sau này, VD:
    //   if (node.portrait) setDialoguePortrait(node.portrait, node.expression);
    //   if (node.voice) sfx.playVoice(node.voice);
    // Hiện tại cố ý để trống — không có node nào set các trường này nên không ảnh hưởng gì.
}

function startDialogueTypewriter(fullText) {
    const textEl = document.getElementById('dialogue-text');
    if (!textEl) return;

    if (dialogueSession.typewriterHandle) {
        clearInterval(dialogueSession.typewriterHandle);
        dialogueSession.typewriterHandle = null;
    }

    textEl.textContent = '';
    dialogueSession.isTyping = true;
    let i = 0;
    dialogueSession.typewriterHandle = setInterval(() => {
        i++;
        textEl.textContent = fullText.slice(0, i);
        if (i >= fullText.length) {
            clearInterval(dialogueSession.typewriterHandle);
            dialogueSession.typewriterHandle = null;
            onDialogueLineFullyShown();
        }
    }, DIALOGUE_CONFIG.typewriterMs);
}

// Hiện ngay toàn bộ text còn lại — gọi khi người chơi chạm màn hình lúc chữ đang chạy.
function completeDialogueTypewriter() {
    const node = dialogueSession.script[dialogueSession.lineIndex];
    const textEl = document.getElementById('dialogue-text');
    if (!node || !textEl) return;
    if (dialogueSession.typewriterHandle) {
        clearInterval(dialogueSession.typewriterHandle);
        dialogueSession.typewriterHandle = null;
    }
    textEl.textContent = node.text || '';
    onDialogueLineFullyShown();
}

// Text đã hiện đầy đủ (dù do typewriter chạy xong tự nhiên hay bị chạm để hiện ngay) — hiện choices
// nếu node có, ngược lại hiện mũi tên "chạm để tiếp tục".
function onDialogueLineFullyShown() {
    dialogueSession.isTyping = false;
    const node = dialogueSession.script[dialogueSession.lineIndex];
    if (node && node.choices && node.choices.length > 0) {
        renderDialogueChoices(node.choices);
    } else {
        setDialogueContinueIndicatorVisible(true);
    }
}

// Gọi khi người chơi chạm vào khung thoại HOẶC bấm nút "Tiếp" (mục 5). Đang gõ (isTyping) thì LUÔN
// cho phép hiện nhanh toàn bộ câu trước — kể cả khi câu đó sẽ có choices (đúng mục 4: chạm trong
// lúc chữ đang chạy luôn hiện ngay). CHỈ sau khi câu đã hiện xong, nếu có choices thì mới chặn
// advance — bắt buộc phải bấm 1 trong các nút choice (xử lý riêng ở resolveDialogueChoice).
window.advanceDialogue = function () {
    if (!window.isDialogueOpen) return;

    if (dialogueSession.isTyping) {
        completeDialogueTypewriter();
        return;
    }

    const node = dialogueSession.script[dialogueSession.lineIndex];
    if (node && node.choices && node.choices.length > 0) return; // đã hiện xong, chờ người chơi chọn

    dialogueSession.lineIndex++;
    if (dialogueSession.lineIndex >= dialogueSession.script.length) {
        window.closeDialogue();
        return;
    }
    renderDialogueLine();
};

function renderDialogueChoices(choices) {
    const container = document.getElementById('dialogue-choices-container');
    const template = document.getElementById('dialogue-choice-template');
    if (!container || !template) return;

    container.innerHTML = '';
    choices.forEach(choice => {
        const clone = template.content.cloneNode(true);
        const btn = clone.querySelector('.dialogue-choice-btn');
        btn.textContent = choice.text;
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // không để lọt xuống dialogue-box (sẽ bị hiểu nhầm thành advance)
            resolveDialogueChoice(choice);
        });
        container.appendChild(clone);
    });

    container.classList.remove('hidden');
    container.classList.add('flex');
}

function hideDialogueChoices() {
    const container = document.getElementById('dialogue-choices-container');
    if (!container) return;
    container.classList.add('hidden');
    container.classList.remove('flex');
    container.innerHTML = '';
}

function setDialogueContinueIndicatorVisible(visible) {
    const el = document.getElementById('dialogue-continue-indicator');
    if (!el) return;
    el.classList.toggle('hidden', !visible);
}

// Xử lý khi người chơi bấm 1 nút lựa chọn (mục 6). Thứ tự ưu tiên:
//   1. Cho NPC cơ hội tự xử lý riêng (onDialogueAction) — nếu trả về true, engine dừng ở đây,
//      KHÔNG tự jumpTo/end nữa (NPC tự lo, VD: đã tự đóng dialogue để mở 1 popup khác).
//   2. Có choice.jumpTo -> nhảy sang script khác CÙNG NPC (branching), reset về node đầu.
//   3. Không có gì đặc biệt -> kết thúc hội thoại (mặc định an toàn cho mọi action tương lai).
function resolveDialogueChoice(choice) {
    const npc = dialogueSession.npc;
    if (npc && typeof npc.onDialogueAction === 'function') {
        const handled = npc.onDialogueAction(choice.action, choice);
        if (handled) return;
    }

    if (choice.jumpTo) {
        const npcData = window.NPC_DIALOGUE_DATA[npc.npcId];
        const nextScript = npcData && npcData[choice.jumpTo];
        if (nextScript && nextScript.length > 0) {
            dialogueSession.script = nextScript;
            dialogueSession.lineIndex = 0;
            renderDialogueLine();
            return;
        }
    }

    window.closeDialogue();
}

window.closeDialogue = function () {
    if (dialogueSession.typewriterHandle) {
        clearInterval(dialogueSession.typewriterHandle);
        dialogueSession.typewriterHandle = null;
    }
    dialogueSession.npc = null;
    dialogueSession.script = null;
    dialogueSession.lineIndex = 0;
    dialogueSession.isTyping = false;

    hideDialogueChoices();
    const box = document.getElementById('dialogue-box');
    if (box) { box.classList.add('hidden'); box.classList.remove('flex'); }

    window.isDialogueOpen = false;

    // Trả lại pointer lock cho desktop, giống hành vi togglePauseMenu(false) — để mouse-look hoạt
    // động lại ngay, không bắt người chơi phải click lại vào canvas trước.
    if (!isMobile && !altPressed && document.pointerLockElement !== container) {
        container.requestPointerLock().catch(() => {});
    }
};

// Khởi tạo toàn bộ event wiring cho Dialogue UI — gọi 1 lần lúc khởi động, giống initQuestSystem.
window.initDialogueSystem = function () {
    const box = document.getElementById('dialogue-box');
    if (box) {
        box.addEventListener('click', () => { window.advanceDialogue(); });
        box.addEventListener('touchend', (e) => {
            e.preventDefault();
            window.advanceDialogue();
        }, { passive: false });
    }
};

// ============================================================
// MÀN HÌNH TỬ VONG (DEATH SCREEN) — style Genshin Impact
// Phụ thuộc: window.enterDeadState / window.confirmRevive (định nghĩa trong game.js)
// ============================================================

const DEATH_SCREEN_CONTENT = {
    combat: {
        title: 'Defeated',
        subtext: 'Kẻ địch trong khu vực này rất nguy hiểm. Hãy cẩn trọng khi giao chiến.'
    },
    drown: {
        title: 'Drowned',
        subtext: 'Stamina does not regenerate while swimming. You will drown if it runs out.'
    },
    fall: {
        title: 'Fell to death',
        subtext: 'Always assess your stamina levels when climbing. You will take damage if you fall from too high.'
    }
};

// Hiện màn hình tử vong, fade opacity 0 -> 1 trong 1s. deathType: 'combat' | 'drown' | 'fall'
window.showDeathScreen = function (deathType) {
    const screen = document.getElementById('death-screen');
    const titleEl = document.getElementById('death-screen-title');
    const subtextEl = document.getElementById('death-screen-subtext');
    if (!screen || !titleEl || !subtextEl) return;

    const content = DEATH_SCREEN_CONTENT[deathType] || DEATH_SCREEN_CONTENT.combat;
    titleEl.textContent = content.title;
    subtextEl.textContent = content.subtext;

    screen.classList.remove('pointer-events-none');
    // Trigger fade ở frame kế tiếp để transition CSS hoạt động đúng
    requestAnimationFrame(() => { screen.style.opacity = '1'; });
};

window.hideDeathScreen = function () {
    const screen = document.getElementById('death-screen');
    if (!screen) return;
    screen.style.opacity = '0';
    setTimeout(() => { screen.classList.add('pointer-events-none'); }, 1000);
};

window.initDeathScreen = function () {
    const reviveBtn = document.getElementById('death-screen-revive-btn');
    if (reviveBtn) {
        reviveBtn.addEventListener('click', () => {
            if (window.confirmRevive) window.confirmRevive();
        });
    }
};

// ============================================================
// ELEMENTAL SKILL — AIM MODE CROSSHAIR UI
// ============================================================
// Bật/tắt crosshair giữa màn hình khi skillAimState.phase chuyển sang/rời khỏi 'aiming'
// (gọi từ game.js: startSkillAimMode() / endSkillAimMode()).
window.setSkillAimUIVisible = function (visible) {
    const crosshair = document.getElementById('skill-aim-crosshair');
    if (!crosshair) return;
    if (visible) {
        crosshair.classList.remove('opacity-0', 'scale-75');
        crosshair.classList.add('opacity-100', 'scale-100');
    } else {
        crosshair.classList.remove('opacity-100', 'scale-100');
        crosshair.classList.add('opacity-0', 'scale-75');
    }
};

