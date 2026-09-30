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
// Alpha M7 (KI-301): chọn bộ điều khiển theo CON TRỎ CHÍNH của thiết bị, không theo "có màn cảm ứng hay không". Trước đây
// laptop màn cảm ứng (chuột/trackpad là con trỏ chính) bị coi là mobile: HUD cảm ứng thay HUD desktop, chuột trái không
// tấn công, không mouse-look. Điện thoại / máy tính bảng: con trỏ chính 'coarse' -> vẫn là mobile như cũ. Trình duyệt
// không có matchMedia: giữ đúng điều kiện cũ. Dùng chung với startGameplay() (index.html) — 1 định nghĩa duy nhất.
window.detectTouchPrimaryDevice = function () {
    const touchCapable = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (typeof window.matchMedia !== 'function') return touchCapable;
    if (window.matchMedia('(pointer: coarse)').matches) return true;
    return touchCapable && !window.matchMedia('(any-pointer: fine)').matches;
};
window.isMobile = window.detectTouchPrimaryDevice();

// Alpha M8 (kiểm tra build): requestPointerLock() trả về Promise trên Chrome/Edge >= 92 nhưng trả về undefined trên một số
// trình duyệt khác (Firefox, Safari đời cũ) — lệnh cũ `container.requestPointerLock().catch(...)` ném TypeError ở đó và cắt
// ngang hàm gọi (vd togglePauseMenu(false) không kịp hiện lại nút Paimon / Túi đồ). Mọi nơi xin pointer lock đi qua đây.
window.requestGamePointerLock = function (el) {
    const target = el || window.container;
    if (!target || typeof target.requestPointerLock !== 'function') return;
    try {
        const p = target.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* bị từ chối / không hỗ trợ — bỏ qua như trước */ }
};
window.closeMenuBtn = document.getElementById('close-menu-btn');
window.gameMenu = document.getElementById('game-menu');
window.leftPanel = document.getElementById('menu-left-panel');
window.backdropClose = document.getElementById('menu-backdrop-close');

window.activeWindow = null; // null, 'settings', 'info', 'comic', 'skills-overview', 'reader', 'locked'

window.activeJoystickTouchId = null;
window.activeCameraTouchId = null;
// ============================================================
// Aim Mode Touch — cơ chế TỔNG QUÁT HÓA (Character #2 Bow Validation)
// ============================================================
// TRƯỚC ĐÂY: skillAimTouchId/X/Y gắn CỨNG riêng cho #mobile-skill-btn — chỉ nút đó mới có cơ chế
// "ngón đang giữ nút cũng xoay camera khi kéo lê" (touchmove toàn cục kiểm tra
// touch.identifier === skillAimTouchId). Khi Bow Charged Attack tái sử dụng Aim Mode
// (skillAimState, xem combat.js) qua NÚT KHÁC (#mobile-attack-btn), ngón giữ nút đó KHÔNG nằm
// trong bất kỳ biến nào mà touchmove kiểm tra -> camera hoàn toàn không xoay được trong Bow Aim
// Mode trên mobile (không phải do logic camera/skillAimState sai, mà do UI layer chưa biết ngón
// nào cần theo dõi).
//
// SỬA: aimTouchId/X/Y là biến DÙNG CHUNG cho MỌI nguồn vào Aim Mode (Elemental Skill, Bow Charged
// Attack, và vũ khí/skill tương lai) — touchmove toàn cục CHỈ kiểm tra 1 điều kiện DUY NHẤT dựa
// trên STATE (skillAimState.phase === 'aiming'), không hard-code theo tên nút cụ thể. Mỗi nút dẫn
// vào Aim Mode (mobile-skill-btn, mobile-attack-btn) tự lưu "ngón đang giữ nút NÀY" vào 1 biến cục
// bộ RIÊNG của chính nút đó (skillBtnTouchId, attackBtnTouchId — xem initTouchControls()) — các
// biến riêng này CHỈ dùng để xác định "ngón nào vừa bấm xuống nút gì", KHÔNG dùng trực tiếp để xoay
// camera. Việc "ngón này giờ điều khiển aim" chỉ được xác nhận (gán vào aimTouchId) NGAY KHI
// skillAimState.phase thực sự chuyển sang 'aiming' — đúng với bản chất Bow Charged Attack (chỉ vào
// Aim Mode SAU KHI giữ đủ chargeTime, không phải ngay lúc chạm nút, xem checkPendingAimTouch()
// trong touchmove bên dưới) VÀ vẫn tương thích 100% với Skill (Hold vào Aim ngay khi
// handleSkillKeyDown() bắt đầu đếm, coi như "chạm nút = có thể vào aim ngay" — không đổi cảm giác).
window.aimTouchId = null;
window.aimTouchX = 0;
window.aimTouchY = 0;
// skillBtnTouchId/attackBtnTouchId: theo dõi "ngón nào vừa CHẠM XUỐNG nút gì" — RIÊNG cho từng nút,
// dùng bởi checkPendingAimTouch() (touchmove) để xác nhận đúng ngón nào cần gán vào aimTouchId khi
// Aim Mode thực sự bắt đầu (skillAimState.phase === 'aiming'). null khi không có ngón nào đang giữ
// nút tương ứng. Mở rộng vũ khí/skill tương lai: thêm 1 biến cùng dạng (vd burstBtnTouchId) + đăng
// ký trong checkPendingAimTouch(), KHÔNG cần sửa gì trong touchmove toàn cục.
window.skillBtnTouchId = null;
window.attackBtnTouchId = null;
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
        // Alpha M1 (BUG-08): khi menu mở, mouseup/keyup/touchend của gameplay bị bỏ qua -> Attack/Aim/Held Skill
        // đang giữ sẽ kẹt và tự ra đòn khi đóng menu (đã tái hiện: giữ Attack -> Esc -> thả chuột -> đóng menu
        // -> Charged Attack tự bắn). Huỷ chúng cùng lúc với phím di chuyển ở trên, như khi mất focus.
        if (window.cancelHeldCombatInput) window.cancelHeldCombatInput('pause');
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
            window.requestGamePointerLock(container);
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
// Alpha M7 (TD-22) — HUD CHỈ GHI DOM KHI GIÁ TRỊ ĐỔI
// ============================================================
// Đo trước M7 (tools/tests/m7/perf-mobile.js): mỗi khung hình — kể cả lúc đứng yên — HUD ghi lại ĐÚNG giá trị cũ ~20 lần
// (thanh HP, ô hồi chiêu và nút Burst của CẢ bộ desktop lẫn mobile, dấu tương tác, các dòng chẩn đoán trong Paimon Menu):
// mỗi khung 1 lần tính lại style + 1 lần layout, ~10 text node rác chờ GC. Các hàm dưới chỉ ghi khi giá trị khác.
//   hudText / hudClass / hudToggle so với giá trị ĐANG CÓ trên DOM (nơi khác có ghi cùng phần tử cũng không lệch).
//   hudStyle nhớ giá trị đã ghi gần nhất (trình duyệt chuẩn hoá lại cách viết, vd '#22d3ee' -> 'rgb(34, 211, 238)',
//   nên không so trực tiếp với el.style được); chỉ dùng cho thuộc tính style mà duy nhất HUD này ghi.
const hudStyleCache = new WeakMap();
function hudText(el, value) { if (!el) return; const t = String(value); if (el.textContent !== t) el.textContent = t; }
function hudClass(el, value) { if (el && el.className !== value) el.className = value; }
function hudToggle(el, cls, on) { if (el && el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on); }
function hudStyle(el, prop, value) {
    if (!el) return;
    let c = hudStyleCache.get(el); if (!c) { c = {}; hudStyleCache.set(el, c); }
    if (c[prop] !== value) { el.style[prop] = value; c[prop] = value; }
}
window.hudText = hudText; window.hudClass = hudClass; window.hudToggle = hudToggle; window.hudStyle = hudStyle;

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

        // Alpha M7: chỉ ghi khi đổi (xem hudStyle/hudText/hudToggle ở trên) — hiển thị y hệt trước.
        hudStyle(water, 'height', fillPct + '%');
        if (ripple) { hudStyle(ripple, 'top', rippleTop + '%'); hudStyle(ripple, 'opacity', rippleOpacity); }
        hudText(num, energyText);
        if (!btnEl || !icon || !label) return;

        if (isReady) {
            hudStyle(icon, 'color', '#22d3ee'); hudStyle(icon, 'opacity', '1'); hudStyle(label, 'color', '#22d3ee');
            hudToggle(btnEl, 'burst-ready', true); hudStyle(btnEl, 'borderColor', '');
        } else {
            hudStyle(icon, 'color', ''); hudStyle(icon, 'opacity', energyRatio > 0.1 ? '0.75' : '0.35');
            hudStyle(label, 'color', ''); hudToggle(btnEl, 'burst-ready', false);
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
            // Alpha M7: touchcancel không bao giờ huỷ được (cancelable=false) — gọi preventDefault() trên nó chỉ sinh lỗi
            // "Ignored attempt to cancel a touchcancel event…" trong console của Chrome; chỉ gọi khi sự kiện huỷ được.
            btn.addEventListener('touchend', (e) => { e.stopPropagation(); if (isGamePaused || player.isDrowning) return; if (e.cancelable) e.preventDefault(); actionUp(); });
            btn.addEventListener('touchcancel', (e) => { e.stopPropagation(); if (isGamePaused || player.isDrowning) return; if (e.cancelable) e.preventDefault(); actionUp(); });
        }
    }
};

function initTouchControls() {
    // Character #2 (Bow) Validation — mobile-attack-btn KHÔNG còn dùng setupTouchBtn() chung, ĐỔI
    // sang touchstart/touchend RIÊNG (cùng pattern mobile-skill-btn ở trên) để theo dõi
    // attackBtnTouchId — ngón đang giữ nút này CÓ THỂ trở thành ngón điều khiển Aim Mode nếu Bow
    // Charged Attack thực sự kích hoạt (xem checkPendingAimTouch() trong touchmove toàn cục — gán
    // aimTouchId SAU KHI xác nhận skillAimState.phase === 'aiming', KHÁC VỚI mobile-skill-btn vì Bow
    // cần chờ đủ chargeTime trước khi vào Aim, không phải ngay lúc chạm nút). handleAttackDown()/
    // handleAttackUp() GIỮ NGUYÊN 100% — Normal Attack (tap ngắn) không hề bị ảnh hưởng, vì
    // attackBtnTouchId chỉ dùng để XÁC ĐỊNH ngón nào, không tự ý can thiệp state combat.
    // Alpha M7 — quy tắc chung cho nút Attack / Skill (giữ được):
    //   - Mỗi nút thuộc về ĐÚNG 1 ngón (ngón chạm xuống đầu tiên). Ngón thứ 2 chạm cùng nút trong lúc ngón đầu còn giữ
    //     KHÔNG tính là 1 lần bấm mới, và ngón đó nhấc lên cũng không kết thúc thao tác của ngón đầu (trước đây: 2 lần
    //     handleAttackDown(), ngón nào nhấc trước cũng "thả" luôn thao tác của ngón còn lại).
    //   - touchend = THẢ (như cũ). touchcancel = HUỶ: trình duyệt/hệ điều hành cắt ngang ngón tay (cuộc gọi đến, cử chỉ
    //     hệ thống...) — thao tác đang giữ bị huỷ, KHÔNG tự ra đòn (KI-117 / BUG-17: trước đây Violet Arc #6 phóng,
    //     Counter #5 chém, Aim #1 bắn khi touchcancel). Dùng đúng đường huỷ cancelHeldCombatInput() của M1 (không cooldown).
    //   - Id ngón luôn được dọn khi ngón của nút kết thúc, KỂ CẢ lúc đang pause/đuối nước (trước đây return sớm trước khi
    //     dọn -> id cũ kẹt lại vì stopPropagation() chặn luôn phần dọn dẹp toàn cục). Chỉ hành động gameplay mới bị bỏ qua
    //     lúc pause/đuối nước (giữ nguyên hành vi cũ).
    const mobileAttackBtn = document.getElementById('mobile-attack-btn');
    if (mobileAttackBtn) {
        mobileAttackBtn.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            if (isGamePaused || player.isDrowning) return;
            e.preventDefault();
            if (attackBtnTouchId !== null) return; // ngón thứ 2 trên cùng nút: không phải lần bấm mới
            attackBtnTouchId = e.changedTouches[0].identifier;
            handleAttackDown();
        });
        const endAttackTouch = (e) => {
            e.stopPropagation();
            const own = findTouchById(e.changedTouches, attackBtnTouchId);
            if (!own) { if (!isGamePaused && !player.isDrowning && e.cancelable) e.preventDefault(); return; } // không phải ngón đang giữ nút
            attackBtnTouchId = null;
            if (aimTouchId === own.identifier) aimTouchId = null;
            if (isGamePaused || player.isDrowning) return;
            if (e.cancelable) e.preventDefault();   // touchcancel không huỷ được — tránh lỗi console của Chrome
            if (e.type === 'touchcancel') { if (window.cancelHeldCombatInput) window.cancelHeldCombatInput('touchcancel'); return; }
            handleAttackUp();
        };
        mobileAttackBtn.addEventListener('touchend', endAttackTouch);
        mobileAttackBtn.addEventListener('touchcancel', endAttackTouch);
    }
    setupTouchBtn('mobile-dash-btn', () => { keys.dash = true; triggerDash(); }, () => { keys.dash = false; player.isSprinting = false; });

    setupTouchBtn('mobile-jump-btn', () => {
        // Character #2 (Bow) Validation — đồng bộ với desktop (phím Space, 07-input-handlers.js đã
        // có điều kiện "skillAimState.phase !== 'aiming'" từ trước cho Elemental Skill) — mobile
        // TRƯỚC ĐÂY THIẾU guard này, cho phép Jump/Glide ngay cả khi đang Aim Mode (cả Skill lẫn
        // Bow) trên mobile — lỗ hổng có sẵn, nay liên quan trực tiếp tới yêu cầu "khóa jump... khi
        // đang trong aim mode của Bow". getAimModeBlocksTerrainStates() (combat.js) là điểm tra cứu
        // DÙNG CHUNG với updatePhysics()/desktop input.
        if (window.getAimModeBlocksTerrainStates && window.getAimModeBlocksTerrainStates()) return;
        player.jumpRequested = true;
        if (!player.isGrounded && !player.isClimbing && !player.isSwimming) {
            const heightAboveGround = player.position.y - (player.height / 2) - getGroundYForPosition(player.position);
            if (heightAboveGround > 2.6) {
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
            if (skillBtnTouchId !== null) return; // Alpha M7: ngón thứ 2 trên cùng nút — xem quy tắc ở nút Attack
            const touch = e.changedTouches[0];
            skillBtnTouchId = touch.identifier;
            // Elemental Skill: Hold luôn dẫn thẳng vào Aim Mode ngay khi bắt đầu đếm giữ (threshold
            // thật nằm trong updateSkillAim()/skillAimState.phase 'holding'->'aiming', KHÔNG phải ở
            // UI layer) — gán aimTouchId NGAY tại đây, GIỮ NGUYÊN HÀNH VI CŨ 100% cho Character #1.
            aimTouchId = touch.identifier;
            aimTouchX = touch.clientX;
            aimTouchY = touch.clientY;
            if (window.handleSkillKeyDown) window.handleSkillKeyDown();
        });
        const endSkillTouch = (e) => {
            e.stopPropagation();
            const own = findTouchById(e.changedTouches, skillBtnTouchId);
            if (!own) { if (!isGamePaused && !player.isDrowning && e.cancelable) e.preventDefault(); return; } // Alpha M7: không phải ngón đang giữ nút
            skillBtnTouchId = null;
            if (aimTouchId === own.identifier) aimTouchId = null;
            if (isGamePaused || player.isDrowning) return;
            if (e.cancelable) e.preventDefault();
            // Alpha M7 (KI-117): touchcancel = HUỶ (Violet Arc không phóng, Counter không chém, Aim không bắn, không cooldown).
            if (e.type === 'touchcancel') { if (window.cancelHeldCombatInput) window.cancelHeldCombatInput('touchcancel'); return; }
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
            if (e.cancelable) e.preventDefault();   // Alpha M7: touchcancel không huỷ được
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

// Alpha M7: joystick về vị trí nghỉ do CSS quy định (.joystick-zone trong style.css — đã dời ra khỏi cột đổi nhân vật
// và có tính vùng an toàn tai thỏ), thay vì ghi cứng 40px ở 2 nơi như trước.
function resetJoystickPosition() {
    if (joystickContainer) { joystickContainer.style.left = ''; joystickContainer.style.bottom = ''; }
}

// Alpha M7: tìm 1 ngón theo identifier trong 1 TouchList (null nếu không có).
function findTouchById(list, id) {
    if (id === null || id === undefined || !list) return null;
    for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
    return null;
}

// Alpha M7 (ngón "treo"): nếu trình duyệt không bao giờ gửi touchend/touchcancel cho 1 ngón (phần tử nhận chạm bị gỡ
// khỏi DOM, hệ điều hành nuốt sự kiện...), trước đây ngón đó giữ joystick / camera / nút mãi mãi — nhân vật tự chạy,
// ngón mới đặt xuống bị bỏ qua (chỉ blur mới gỡ được). TouchEvent.touches luôn là danh sách MỌI ngón đang thật sự chạm
// màn hình, nên ở mỗi sự kiện chạm (listener capture trên window — chạy TRƯỚC các nút có stopPropagation) các ngón
// đang theo dõi mà không còn trong e.touches được nhả. Ngón đang kết thúc ở chính sự kiện này (changedTouches) do
// handler của nó tự xử lý (thả / huỷ) nên được bỏ qua ở đây. Ngón "treo" đang giữ Attack/Skill -> HUỶ thao tác đang
// giữ (không tự ra đòn), đúng như khi mất focus.
function releaseStaleTouches(e) {
    const live = e.touches;
    const alive = (id) => findTouchById(live, id) !== null || findTouchById(e.changedTouches, id) !== null;
    if (activeJoystickTouchId !== null && !alive(activeJoystickTouchId)) {
        activeJoystickTouchId = null;
        if (joystickHandle) resetJoystick();
        resetJoystickPosition();
    }
    if (activeCameraTouchId !== null && !alive(activeCameraTouchId)) { activeCameraTouchId = null; touchIsDragging = false; }
    if (aimTouchId !== null && !alive(aimTouchId)) aimTouchId = null;
    let lostHeldButton = false;
    if (attackBtnTouchId !== null && !alive(attackBtnTouchId)) { attackBtnTouchId = null; lostHeldButton = true; }
    if (skillBtnTouchId !== null && !alive(skillBtnTouchId)) { skillBtnTouchId = null; lostHeldButton = true; }
    if (lostHeldButton && window.cancelHeldCombatInput) window.cancelHeldCombatInput('touch_lost');
}
window.releaseStaleTouches = releaseStaleTouches;

// Alpha M1 (BUG-08): quên mọi ngón tay đang giữ (joystick, camera, nút Skill/Attack, ngón đang aim) khi cửa
// sổ mất focus / tab ẩn — touchend của các ngón đó có thể không bao giờ tới. Gọi từ 07-input-handlers.js
// (blur/visibilitychange), CÙNG lúc với cancelHeldCombatInput() (combat.js) lo phần state chiến đấu.
function releaseTouchInputState() {
    if (joystickHandle) resetJoystick();
    resetJoystickPosition();
    activeJoystickTouchId = null;
    activeCameraTouchId = null;
    touchIsDragging = false;
    initialPinchDistance = null;
    skillBtnTouchId = null;
    attackBtnTouchId = null;
    aimTouchId = null;
}
window.releaseTouchInputState = releaseTouchInputState;

function initTouchGlobalListeners() {
    // Alpha M7: dọn ngón "treo" TRƯỚC mọi handler khác (capture) — xem releaseStaleTouches().
    window.addEventListener('touchstart', releaseStaleTouches, { capture: true, passive: true });
    window.addEventListener('touchend', releaseStaleTouches, { capture: true, passive: true });
    window.addEventListener('touchcancel', releaseStaleTouches, { capture: true, passive: true });

    window.addEventListener('touchstart', (e) => {
        // Ưu tiên tuyệt đối: nếu điểm chạm nằm trong bất kỳ vùng .scrollable-panel nào
        // (comic, sub-window, hoặc bất kỳ UI cuộn nào thêm sau này), luôn để trình duyệt
        // xử lý scroll gốc — không can thiệp gì cả, không cần chạm đúng thanh cuộn.
        if (e.target.closest('.scrollable-panel')) return;
        // Alpha M7: trong lúc hội thoại, chạm chỉ dành cho khung thoại / nút lựa chọn — không mở joystick hay kéo camera
        // (desktop cũng không xoay camera khi đang hội thoại). Không preventDefault để nút lựa chọn vẫn nhận 'click'.
        if (window.isDialogueOpen && !isGamePaused) return;

        if (isGamePaused || player.isDrowning) {
            // BUGFIX (v0.9 – Return to Title Flow): #opening-root PHẢI nằm trong whitelist này — khi
            // Return to Title chạy (runReturnToTitleFlow(), scripts/opening.js), window.isGamePaused bị
            // set true để đóng băng gameplay, nhưng #opening-root (Start Overlay, Character Name Popup,
            // các modal Opening...) hiện lại NGAY SAU ĐÓ và cần nhận touch bình thường. Whitelist theo
            // toàn bộ #opening-root (không liệt kê từng ID con) vì bất cứ khi nào nó đang hiển thị,
            // isGamePaused chắc chắn đang true do chính luồng Return to Title gây ra — không có tình
            // huống nào #opening-root hiện mà lại KHÔNG nên nhận touch. #quit-confirm-overlay/
            // #reset-save-confirm-overlay vẫn giữ riêng vì chúng có thể mở ngay TRONG gameplay (Paimon
            // Menu), không nằm trong #opening-root. (Đã gỡ #player-name-prompt-overlay khỏi whitelist
            // này — overlay đó không còn tồn tại, xem ghi chú dọn dẹp gần renderCharacterScreen().)
            if (e.target.closest('#menu-left-panel') || e.target.closest('#rpg-sub-window') || e.target.closest('#paimon-star-btn') || e.target.closest('#quit-confirm-overlay') || e.target.closest('#reset-save-confirm-overlay') || e.target.closest('#opening-root')) {
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
                    // Alpha M7: toạ độ theo khung chứa joystick (#mobile-controls — lùi vào trong vùng an toàn tai thỏ)
                    // thay vì theo cả cửa sổ; khi khung chứa phủ kín màn hình (không tai thỏ) kết quả y hệt trước.
                    const host = joystickContainer.offsetParent;
                    const hr = host ? host.getBoundingClientRect() : { left: 0, bottom: window.innerHeight };
                    joystickContainer.style.left = `${touch.clientX - hr.left - 65}px`; joystickContainer.style.bottom = `${hr.bottom - touch.clientY - 65}px`;
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
            // BUGFIX (v0.9): xem chú thích tương ứng ở touchstart phía trên — cùng lý do.
            if (e.target.closest('#menu-left-panel') || e.target.closest('#quit-confirm-overlay') || e.target.closest('#opening-root')) {
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

        // Character #2 (Bow) Validation — checkPendingAimTouch(): xác nhận GÁN aimTouchId cho ĐÚNG
        // ngón đang giữ 1 trong các nút combat (skillBtnTouchId/attackBtnTouchId) NGAY KHI Aim Mode
        // thực sự bắt đầu (skillAimState.phase === 'aiming'), nếu chưa có ngón nào được gán. Đây là
        // ĐIỂM DUY NHẤT quyết định "ngón nào điều khiển aim" — dựa trên STATE
        // (skillAimState.phase), KHÔNG hard-code theo tên nút. Với Skill: aimTouchId đã được gán
        // NGAY lúc touchstart (xem initTouchControls()), nên điều kiện "aimTouchId === null" ở đây
        // luôn false -> không làm gì, hành vi Skill GIỮ NGUYÊN 100%. Với Bow: attackBtnTouchId được
        // gán lúc touchstart nhưng aimTouchId CÒN null (vì chưa chắc sẽ vào Aim Mode — có thể chỉ là
        // Normal Attack) -> chỉ khi player.isBowChargedAiming thực sự bật (chargeTimer đã đạt
        // threshold, xem updateCombat() file 08) mới gán aimTouchId = attackBtnTouchId, TỪ THỜI ĐIỂM
        // ĐÓ trở đi ngón giữ nút Attack mới bắt đầu xoay camera — đúng UX "chỉ xoay khi đã thực sự
        // đang aim", không xoay nhầm trong lúc chỉ đang combo Normal Attack thường.
        if (aimTouchId === null && skillAimState && skillAimState.phase === 'aiming') {
            if (attackBtnTouchId !== null && player.isBowChargedAiming) {
                aimTouchId = attackBtnTouchId;
                const t = Array.prototype.find.call(e.touches, tt => tt.identifier === attackBtnTouchId);
                if (t) { aimTouchX = t.clientX; aimTouchY = t.clientY; }
            } else if (skillBtnTouchId !== null && !player.isBowChargedAiming) {
                // An toàn ngược: nếu vì lý do nào đó Skill chưa kịp gán ở touchstart (không nên xảy
                // ra, nhưng tránh rò rỉ nếu thứ tự event thay đổi trong tương lai).
                aimTouchId = skillBtnTouchId;
                const t = Array.prototype.find.call(e.touches, tt => tt.identifier === skillBtnTouchId);
                if (t) { aimTouchX = t.clientX; aimTouchY = t.clientY; }
            }
        }

        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            if (touch.identifier === activeJoystickTouchId) updateJoystickWithTouch(touch);
            else if (touch.identifier === activeCameraTouchId) {
                cameraState.targetTheta -= (touch.clientX - touchStartX) * cameraState.sensitivity * 1.5 * cameraSensitivityMultiplier;
                cameraState.targetPhi += (touch.clientY - touchStartY) * cameraState.sensitivity * 1.5 * cameraSensitivityMultiplier;
                cameraState.targetPhi = Math.max(cameraState.minPhi, Math.min(cameraState.maxPhi, cameraState.targetPhi));
                touchStartX = touch.clientX; touchStartY = touch.clientY;
            }
            // Character #2 (Bow) Validation — GENERIC: ngón đang điều khiển AIM MODE (bất kể nguồn —
            // Skill hay Bow Charged Attack, xác định bởi aimTouchId ở checkPendingAimTouch() trên)
            // cũng xoay camera khi kéo lê — độc lập với activeCameraTouchId, vẫn hoạt động song song
            // nếu có thêm 1 ngón khác vẫy tự do. TRƯỚC ĐÂY: chỉ kiểm tra skillAimTouchId (hard-code
            // riêng Skill) — đây chính là nguyên nhân Bow Aim Mode không xoay camera được trên mobile.
            if (touch.identifier === aimTouchId) {
                cameraState.targetTheta -= (touch.clientX - aimTouchX) * cameraState.sensitivity * 1.5 * cameraSensitivityMultiplier;
                cameraState.targetPhi += (touch.clientY - aimTouchY) * cameraState.sensitivity * 1.5 * cameraSensitivityMultiplier;
                cameraState.targetPhi = Math.max(cameraState.minPhi, Math.min(cameraState.maxPhi, cameraState.targetPhi));
                aimTouchX = touch.clientX; aimTouchY = touch.clientY;
            }
        }
    }, { passive: false });

    const handleTouchEnd = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeJoystickTouchId) {
                resetJoystick(); activeJoystickTouchId = null;
                resetJoystickPosition();
            } else if (e.changedTouches[i].identifier === activeCameraTouchId) { touchIsDragging = false; activeCameraTouchId = null; }

            // Character #2 (Bow) Validation — GENERIC: nếu ngón đang giữ 1 trong các nút combat dẫn
            // vào Aim Mode (Skill hoặc Attack/Bow) kết thúc touch qua listener TOÀN CỤC này (thay vì
            // qua touchend/touchcancel gắn trực tiếp trên nút — 2 listener đó đã tự gọi
            // handleSkillKeyUp()/handleAttackUp() VÀ dọn biến của chính chúng, xem initTouchControls()
            // — DOM Touch Events luôn bắn touchend trên đúng element mà touchstart bắt đầu, kể cả khi
            // ngón trượt ra ngoài vùng nút, nên listener trên nút LUÔN chạy). Khối dưới đây CHỈ dọn
            // biến toàn cục cho AN TOÀN TUYỆT ĐỐI (double-safety, phòng trường hợp browser/OS bất
            // thường không bắn đúng thứ tự) — KHÔNG gọi lại handleSkillKeyUp()/handleAttackUp() ở đây
            // để tránh gọi trùng 2 lần (dù cả 2 hàm đó đều idempotent/an toàn khi gọi lặp, tránh side-
            // effect kép không cần thiết vẫn là lựa chọn sạch hơn).
            if (e.changedTouches[i].identifier === skillBtnTouchId) skillBtnTouchId = null;
            if (e.changedTouches[i].identifier === attackBtnTouchId) attackBtnTouchId = null;
            if (e.changedTouches[i].identifier === aimTouchId) aimTouchId = null;
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

    // Nút Quit (góc dưới thanh utility strip của Paimon Menu, icon power-off) — trước v0.9 chỉ hiện
    // thông báo "tính năng đang khoá" (placeholder). Từ v0.9: mở popup xác nhận Quit riêng
    // (#quit-confirm-overlay) — xem window.showQuitConfirm() bên dưới.
    if (closeMenuBtn) {
        closeMenuBtn.addEventListener('click', () => {
            if (window.showQuitConfirm) window.showQuitConfirm();
        });
    }

    // Quit Confirmation Popup — 2 nút Hủy/Xác nhận (đặt cạnh nơi mở popup để dễ theo dõi luồng, dù
    // định nghĩa hàm show/hide/confirm nằm ở cuối file — xem window.showQuitConfirm()).
    // Hủy: CHỈ ẩn popup xác nhận, KHÔNG đóng luôn Paimon Menu phía sau — popup này mở TỪ TRONG Paimon
    // Menu đang mở sẵn (isGamePaused đã true từ trước), Hủy nghĩa là "quay lại Paimon Menu", không phải
    // "thoát khỏi Paimon Menu".
    const quitConfirmCancelBtn = document.getElementById('quit-confirm-cancel-btn');
    if (quitConfirmCancelBtn) {
        quitConfirmCancelBtn.addEventListener('click', () => {
            if (window.hideQuitConfirm) window.hideQuitConfirm();
        });
    }
    const quitConfirmConfirmBtn = document.getElementById('quit-confirm-confirm-btn');
    if (quitConfirmConfirmBtn) {
        quitConfirmConfirmBtn.addEventListener('click', () => {
            if (window.confirmQuitToTitle) window.confirmQuitToTitle();
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
    // Alpha M7 (TD-22): mọi lần ghi DOM trong hàm này đi qua hudText / hudClass / hudToggle / hudStyle (chỉ ghi khi đổi).
    if (window.updatePartyHUD) window.updatePartyHUD(); // Party HUD (Task 74821) — chỉ ghi DOM khi đổi
    const playerHalfH = player.height / 2;
    const posDisplay = document.getElementById('pos-display');
    hudText(posDisplay, `${player.position.x.toFixed(1)}, ${(player.position.y - playerHalfH).toFixed(1)}, ${player.position.z.toFixed(1)}`);
    const energyDisplay = document.getElementById('energy-display');
    hudText(energyDisplay, `${player.energy} / ${player.maxEnergy}`);

    const hpFill = document.getElementById('hp-fill');
    const hpText = document.getElementById('hp-text');
    if (hpFill) {
        const hpRatio = Math.max(0, Math.min(1, player.hp / player.maxHp));
        // Alpha M7: chỉ ghi khi đổi; độ rộng làm tròn 0.01% (không thấy khác biệt) để so sánh được giữa các khung hình.
        hudStyle(hpFill, 'width', (hpRatio * 100).toFixed(2) + '%');
        const hpColor = hpRatio > 0.5 ? 'bg-emerald-600' : (hpRatio > 0.25 ? 'bg-amber-500' : 'bg-red-600');
        ['bg-emerald-600', 'bg-amber-500', 'bg-red-600'].forEach(c => hudToggle(hpFill, c, c === hpColor));
    }
    hudText(hpText, `${Math.ceil(player.hp)} / ${player.maxHp}`);

    // Pre-Alpha v0.8 (Character) — cập nhật real-time Character Screen NẾU đang mở đúng tab đó (mục 3
    // spec: "cập nhật theo thời gian thực"). Chỉ vẽ lại khi thực sự đang mở (activeWindow ===
    // 'character') để tránh lãng phí thao tác DOM mỗi frame lúc màn hình đang đóng — cùng cách tối ưu
    // đã áp dụng cho renderInventoryGrid() ở onInventoryItemAdded().
    if (window.activeWindow === 'character' && window.renderCharacterScreen) {
        window.renderCharacterScreen();
    }

    const staminaStateTag = document.getElementById('stamina-state-tag');
    if (staminaStateTag) {
        hudText(staminaStateTag, `${Math.floor(player.stamina)} / ${player.maxStamina}`);
    }

    const dashStateTag = document.getElementById('dash-state-tag');
    if (dashStateTag) {
        if (player.dashCooldownTimer > 0) {
            hudText(dashStateTag, player.dashCooldownTimer.toFixed(1) + "s");
            hudClass(dashStateTag, "text-right text-amber-500 font-bold");
        } else {
            hudText(dashStateTag, "READY");
            hudClass(dashStateTag, "text-right text-emerald-500 font-bold");
        }
    }

    const desktopClimbHint = document.getElementById('desktop-climb-hint');
    const mobileDropBtn = document.getElementById('mobile-drop-btn');

    if (player.isClimbing) {
        if (isMobile && mobileDropBtn) hudToggle(mobileDropBtn, 'hidden', false);
        if (!isMobile && desktopClimbHint) hudToggle(desktopClimbHint, 'hidden', false);
    } else {
        if (isMobile && mobileDropBtn) hudToggle(mobileDropBtn, 'hidden', true);
        if (!isMobile && desktopClimbHint) hudToggle(desktopClimbHint, 'hidden', true);
    }

    const moveStateTag = document.getElementById('move-state-tag');
    if (moveStateTag) {
        if (player.isDrowning) {
            hudText(moveStateTag, "DROWNING");
            hudClass(moveStateTag, "text-right text-red-500 font-bold animate-pulse");
        } else if (player.isClimbing) {
            hudText(moveStateTag, "CLIMB");
            hudClass(moveStateTag, "text-right text-amber-500 font-bold animate-pulse");
        } else if (player.isSwimming) {
            if (player.swimState === 'fast') {
                hudText(moveStateTag, "SWIM FAST");
                hudClass(moveStateTag, "text-right text-cyan-300 font-bold animate-pulse");
            } else if (player.swimState === 'slow') {
                hudText(moveStateTag, "SWIM SLOW");
                hudClass(moveStateTag, "text-right text-cyan-400 font-bold");
            } else {
                hudText(moveStateTag, "SWIM IDLE");
                hudClass(moveStateTag, "text-right text-blue-400 font-bold");
            }
        } else if (player.isDashing) {
            hudText(moveStateTag, "DASH");
            hudClass(moveStateTag, "text-right text-amber-400 font-bold");
        } else if (player.isGliding) {
            hudText(moveStateTag, "GLIDE");
            hudClass(moveStateTag, "text-right text-cyan-400 font-bold animate-pulse");
        } else if (player.isPlunging) {
            hudText(moveStateTag, "PLUNGE");
            hudClass(moveStateTag, "text-right text-red-500 font-bold animate-pulse");
        } else if (player.isSprinting) {
            hudText(moveStateTag, "SPRINT");
            hudClass(moveStateTag, "text-right text-emerald-400 font-bold");
        } else if (player.walkMode) {
            hudText(moveStateTag, "WALK");
            hudClass(moveStateTag, "text-right text-sky-300 font-bold");
        } else if (player.inputVelocity.lengthSq() > 0.01) {
            hudText(moveStateTag, "JOG");
            hudClass(moveStateTag, "text-right text-sky-400 font-bold");
        } else {
            hudText(moveStateTag, "IDLE");
            hudClass(moveStateTag, "text-right text-slate-500 font-bold");
        }
    }

    const physicsDisplay = document.getElementById('physics-display');
    if (physicsDisplay) {
        if (player.isDrowning) {
            hudText(physicsDisplay, "Drowning");
            hudClass(physicsDisplay, "text-right text-red-500 font-bold");
        } else if (player.isClimbing) {
            hudText(physicsDisplay, "Wall (Climbing)");
            hudClass(physicsDisplay, "text-right text-amber-400 font-bold");
        } else if (player.isSwimming) {
            hudText(physicsDisplay, "Water (Swimming)");
            hudClass(physicsDisplay, "text-right text-cyan-400 font-bold");
        } else if (player.isInWater) {
            hudText(physicsDisplay, "Water (Wading)");
            hudClass(physicsDisplay, "text-right text-cyan-500 font-bold");
        } else {
            hudText(physicsDisplay, player.isGrounded ? (player.isSprinting ? "Grounded (Running)" : "Grounded") : (player.isGliding ? "Airborne (Gliding)" : "Airborne"));
            hudClass(physicsDisplay, "text-right text-sky-400 font-bold");
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
// PARTY HUD (Task 74821) — 1 renderer DUY NHẤT cho cả mobile và PC
// ============================================================
// Nguồn dữ liệu: window.Party.getSlots() / canSwitch() (file 02) — HUD KHÔNG giữ state gameplay riêng.
//   - Mobile: giữ nguyên vị trí + kiểu nút tròn 56px của #party-switch-temp (góc trên trái, xếp dọc),
//     chỉ bổ sung highlight nhân vật active, vạch HP, chấm Burst sẵn sàng.
//   - PC: CÙNG component slot (nút tròn + tên), bố cục dọc sát mép PHẢI, căn giữa theo chiều dọc
//     (tránh cụm nút Túi/Nhân vật ở góc trên phải và nút Skill ở góc dưới phải), kèm gợi ý phím 1-4.
// Slot trống không hiển thị (giữ cách trình bày có sẵn); phím/nhãn vẫn khớp đúng số slot.
// Cập nhật: dựng lại khi đội hình đổi (window.onPartyChanged), còn HP/active/burst/khóa đổi thì so khớp
// chữ ký mỗi frame và CHỈ ghi DOM khi giá trị thực sự đổi.
(function () {
    const ELEMENT_COLORS = window.PARTY_ELEMENT_COLORS = { Hydro: '#3BA3FF', Pyro: '#f97316', Electro: '#a855f7', Anemo: '#2dd4bf', Geo: '#eab308', Cryo: '#a5f3fc', Dendro: '#84cc16', Physical: '#d6d3d1' };
    const views = { mobile: null, desktop: null };   // { root, slots: [{btn, hpFill, burstDot, index}] }
    let lastSignature = '';

    function elementColor(el) { return ELEMENT_COLORS[el] || '#a8a29e'; }

    function buildSlot(slot, variant) {
        const color = elementColor(slot.element);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.partySlot = String(slot.index);
        const circle = document.createElement('span');
        // Nút tròn — y hệt nút mobile gốc (w-14 h-14 rounded-full bg-stone-850/90 border-2 ...), thêm style
        // inline để không phụ thuộc Tailwind JIT cho phần mới.
        circle.className = 'w-14 h-14 rounded-full bg-stone-850/90 border-2 border-stone-700/60 text-white text-[10px] font-bold flex items-center justify-center shadow-lg select-none';
        // Alpha M7: slot mobile đọc cỡ từ biến CSS --party-slot-size (56px, co lại trên màn thấp — xem cuối style.css).
        const size = variant === 'desktop' ? '48px' : 'var(--party-slot-size, 56px)';
        Object.assign(circle.style, {
            position: 'relative', overflow: 'hidden', width: size, height: size, borderRadius: '9999px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0',
            background: 'rgba(28,25,23,0.9)', border: '2px solid rgba(68,64,60,0.6)', color: '#fff',
            fontSize: variant === 'desktop' ? '15px' : '10px', fontWeight: '700', boxShadow: '0 4px 10px rgba(0,0,0,0.45)',
            transition: 'border-color 0.12s, box-shadow 0.12s, opacity 0.12s'
        });
        const label = document.createElement('span');
        label.style.position = 'relative';
        label.style.zIndex = '1';
        // Mobile giữ nguyên chữ = tên nhân vật; PC hiện chữ cái đầu trong vòng tròn (tên đầy đủ nằm bên trái).
        label.textContent = variant === 'desktop' ? (slot.name || '?').charAt(0).toUpperCase() : slot.name;
        circle.appendChild(label);
        const tint = document.createElement('span');   // màu nguyên tố nhạt phía sau chữ (placeholder avatar)
        Object.assign(tint.style, { position: 'absolute', inset: '0', background: 'radial-gradient(circle at 50% 35%, ' + color + '55, transparent 70%)' });
        circle.insertBefore(tint, label);
        const hpTrack = document.createElement('span');
        Object.assign(hpTrack.style, { position: 'absolute', left: '18%', right: '18%', bottom: '5px', height: '3px', borderRadius: '2px', background: 'rgba(0,0,0,0.55)', zIndex: '2' });
        const hpFill = document.createElement('span');
        Object.assign(hpFill.style, { display: 'block', height: '100%', width: '100%', borderRadius: '2px', background: '#4ade80' });
        hpTrack.appendChild(hpFill);
        circle.appendChild(hpTrack);
        const burstDot = document.createElement('span');   // Burst sẵn sàng (energy đầy)
        Object.assign(burstDot.style, { position: 'absolute', top: '4px', right: '6px', width: '8px', height: '8px', borderRadius: '9999px', background: color, boxShadow: '0 0 6px ' + color, display: 'none', zIndex: '2' });
        circle.appendChild(burstDot);

        if (variant === 'desktop') {
            Object.assign(btn.style, { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', background: 'transparent', border: '0', padding: '0', cursor: 'pointer', pointerEvents: 'auto' });
            const name = document.createElement('span');
            Object.assign(name.style, { color: '#f5f5f4', fontSize: '13px', fontWeight: '600', textShadow: '0 1px 3px rgba(0,0,0,0.9)', whiteSpace: 'nowrap', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' });
            name.textContent = slot.name;
            const key = document.createElement('span');
            Object.assign(key.style, { minWidth: '20px', height: '20px', padding: '0 4px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: '#fde68a', background: 'rgba(18,16,30,0.85)', border: '1px solid rgba(251,191,36,0.55)', fontFamily: 'monospace' });
            key.textContent = String(slot.index + 1);
            btn.appendChild(name);
            btn.appendChild(circle);
            btn.appendChild(key);
            btn.title = slot.name + ' [' + (slot.index + 1) + ']';
        } else {
            Object.assign(btn.style, { background: 'transparent', border: '0', padding: '0' });
            btn.appendChild(circle);
        }
        // Click (PC khi thả chuột bằng Alt) / chạm (mobile) — CÙNG 1 đường switchToCharacter().
        btn.addEventListener('click', () => { if (window.switchToCharacter) window.switchToCharacter(slot.index); });
        // Alpha M7: chạm = đổi ngay khi ngón chạm xuống. Chỉ dựa vào 'click' thì KHÔNG đổi được trong lúc ngón khác đang
        // giữ joystick / nút (trình duyệt không sinh 'click' cho cú chạm của ngón thứ 2 — đã đo trên Chromium: đang giữ
        // joystick thì chạm slot không đổi nhân vật). preventDefault() -> không sinh 'click' sau đó -> không đổi 2 lần.
        btn.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (window.switchToCharacter) window.switchToCharacter(slot.index);
        }, { passive: false });
        return { btn: btn, circle: circle, hpFill: hpFill, burstDot: burstDot, index: slot.index, color: color };
    }

    function ensureDesktopRoot() {
        let root = document.getElementById('party-hud-desktop');
        if (root) return root;
        const host = document.getElementById('desktop-hud');
        if (!host) return null;
        root = document.createElement('div');
        root.id = 'party-hud-desktop';
        Object.assign(root.style, {
            position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px', pointerEvents: 'none', zIndex: '31'
        });
        host.appendChild(root);
        return root;
    }

    function rebuild() {
        if (!window.Party) return;
        const slots = window.Party.getSlots();
        const targets = { mobile: document.getElementById('party-switch-temp'), desktop: ensureDesktopRoot() };
        Object.keys(targets).forEach(variant => {
            const root = targets[variant];
            if (!root) { views[variant] = null; return; }
            root.innerHTML = '';   // gỡ node cũ (listener đi theo node — không tích luỹ listener)
            const built = [];
            slots.forEach(slot => {
                if (!slot.characterId) return;   // slot trống: không hiển thị (trình bày có sẵn)
                const v = buildSlot(slot, variant);
                root.appendChild(v.btn);
                built.push(v);
            });
            views[variant] = { root: root, slots: built };
        });
        lastSignature = '';
        update();
    }

    function update() {
        if (!window.Party || (!views.mobile && !views.desktop)) return;
        const slots = window.Party.getSlots();
        const sw = window.Party.canSwitch();
        const hide = !!window.isDialogueOpen;
        let sig = (sw.ok ? '1' : '0') + (hide ? 'h' : '') + '|';
        slots.forEach(s => {
            if (!s.characterId) { sig += '-|'; return; }
            sig += s.characterId + ':' + (s.isActive ? 'A' : '') + ':' + Math.round(100 * s.hp / Math.max(1, s.maxHp)) + ':' + (s.energy >= s.maxEnergy ? 'B' : '') + '|';
        });
        if (sig === lastSignature) return;
        lastSignature = sig;
        ['mobile', 'desktop'].forEach(variant => {
            const view = views[variant];
            if (!view) return;
            if (variant === 'desktop') view.root.style.display = hide ? 'none' : 'flex';
            view.slots.forEach(v => {
                const s = slots[v.index];
                if (!s || !s.characterId) return;
                const pct = Math.max(0, Math.min(1, s.hp / Math.max(1, s.maxHp)));
                v.hpFill.style.width = (pct * 100).toFixed(0) + '%';
                v.hpFill.style.background = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#facc15' : '#ef4444';
                v.burstDot.style.display = s.energy >= s.maxEnergy ? 'block' : 'none';
                v.circle.style.borderColor = s.isActive ? '#fbbf24' : 'rgba(68,64,60,0.6)';
                v.circle.style.boxShadow = s.isActive ? '0 0 0 2px rgba(251,191,36,0.35), 0 0 12px rgba(251,191,36,0.55)' : '0 4px 10px rgba(0,0,0,0.45)';
                // Nhân vật không-active mờ đi khi đổi người đang bị chặn (vd Burst State của #3).
                v.circle.style.opacity = (!s.isActive && !sw.ok) ? '0.45' : '1';
                v.btn.setAttribute('aria-pressed', s.isActive ? 'true' : 'false');
                v.btn.dataset.active = s.isActive ? '1' : '0';
            });
        });
    }

    window.initPartyHUD = rebuild;
    window.updatePartyHUD = update;
    // Gọi bởi file 02 sau MỌI thay đổi đội hình/nhân vật active: 'switch' chỉ cần cập nhật, còn lại dựng lại.
    window.onPartyChanged = function (kind) { if (kind === 'switch') update(); else rebuild(); };
    // Giữ tên cũ — index.html gọi initPartySwitchTemp() sau initThree().
    window.initPartySwitchTemp = rebuild;
})();

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
        hudText(promptText, text);                 // Alpha M7: chỉ ghi khi đổi (gọi mỗi khung hình)
        hudToggle(prompt, 'hidden', false);
    } else {
        hudToggle(prompt, 'hidden', true);
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
// Alpha M6: nhiệm vụ chính (StoryQuest, 18-story-quest.js) đứng ĐẦU tracker — chỉ đọc getTrackerEntries(), không giữ
// state riêng. Dòng khoảng cách (.story-quest-distance) do module nhiệm vụ cập nhật 4 lần/giây.
window.refreshQuestTracker = function () {
    const tracker = document.getElementById('quest-tracker');
    const template = document.getElementById('quest-tracker-item-template');
    if (!tracker || !template || !window.activeQuests) return;

    const story = (window.StoryQuest && window.StoryQuest.getTrackerEntries) ? window.StoryQuest.getTrackerEntries() : [];
    const quests = window.activeQuests.filter(q => q.status !== 'turned_in');
    if (quests.length === 0 && story.length === 0) {
        tracker.classList.add('hidden');
        tracker.classList.remove('flex');
        tracker.innerHTML = '';
        window.layoutQuestTracker();
        return;
    }

    tracker.innerHTML = '';
    story.forEach(e => {
        const clone = template.content.cloneNode(true);
        const itemEl = clone.querySelector('.quest-tracker-item');
        itemEl.dataset.storyQuest = e.id;
        itemEl.classList.add('quest-tracker-item--story');
        itemEl.style.borderLeftColor = '#fbbf24';
        itemEl.style.background = 'linear-gradient(90deg, rgba(56,40,8,0.88), rgba(18,16,30,0.82))';
        const icon = itemEl.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-star text-amber-300 text-sm mt-0.5 relative';
        const exclaim = clone.querySelector('.quest-tracker-exclaim');
        if (exclaim) {
            if (e.status === 'available') exclaim.textContent = '!';
            else if (e.status === 'completed') { exclaim.textContent = '✓'; exclaim.classList.remove('text-red-400'); exclaim.classList.add('text-emerald-400'); }
            else exclaim.remove();
        }
        const title = clone.querySelector('.quest-tracker-title');
        title.textContent = e.title + (e.step ? ' · ' + e.step : '');
        title.style.fontSize = '12px';
        const line = clone.querySelector('.quest-tracker-progress');
        line.textContent = e.line;
        line.style.fontSize = '12px';
        line.style.color = '#e7e5e4';
        const dist = document.createElement('span');
        dist.className = 'story-quest-distance';
        dist.style.fontSize = '12px';
        dist.style.minHeight = '16px';          // dòng khoảng cách luôn chiếm chỗ -> chiều cao tracker không đổi khi số mét hiện ra
        dist.style.display = 'block';
        dist.style.color = '#a8a29e';
        line.parentNode.appendChild(dist);
        tracker.appendChild(clone);
    });
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
    window.layoutQuestTracker();
};

// Alpha M6 — vị trí tracker (từ khi có nhiệm vụ chính, tracker hiện ngay từ đầu game, không chỉ khi nhận nhiệm vụ Bảng):
//   Cảm ứng: cột trái đã có nút đổi nhân vật, nút Đi bộ và joystick -> tracker lên hàng trên cùng, bên phải các điều
//            khiển đó (không che nút nào). Khi khung Thử Thách (encounter HUD) đang hiện ở giữa phía trên, tracker ẩn tạm
//            (khung đó đã hiển thị đúng mục tiêu đang làm) — xem syncQuestTrackerVisibility().
//   Desktop: giữ vị trí cũ (trái, 1/3 chiều cao); thông báo phần thưởng (#reward-popup-container, cùng cột) dời xuống
//            dưới tracker thay vì đè lên tracker khi tracker cao hơn.
// Chỉ đọc kích thước lúc tracker vẽ lại / đổi kích thước cửa sổ — không chạy mỗi frame.
window.layoutQuestTracker = function () {
    const tracker = document.getElementById('quest-tracker');
    if (!tracker) return;
    const rewards = document.getElementById('reward-popup-container');
    if (window.isMobile) {
        // Alpha M7: chỉ tính các nút nằm CÙNG DẢI NGANG với tracker (hàng trên) — nút Đi bộ nay ở cột joystick phía dưới —
        // và giới hạn bề rộng để tracker dừng trước cụm nút Túi đồ/Nhân vật góc phải (màn dọc trước đây bị che).
        let right = 64, top = 16;
        const paimon = document.getElementById('paimon-star-btn');
        if (paimon) { const pr = paimon.getBoundingClientRect(); if (pr.height > 0) top = pr.top; }
        const bandBottom = top + 110;
        ['paimon-star-btn', 'party-switch-temp', 'mobile-walk-toggle'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && r.top < bandBottom && r.bottom > top) right = Math.max(right, r.right);
        });
        let rightLimit = window.innerWidth - 8;
        const topRight = document.getElementById('hud-top-right');
        if (topRight) { const tr = topRight.getBoundingClientRect(); if (tr.width > 0) rightLimit = tr.left - 8; }
        let left = Math.round(right + 10);
        const place = () => {
            tracker.style.left = left + 'px';
            tracker.style.top = Math.round(top) + 'px';
            tracker.style.maxWidth = Math.max(140, Math.round(rightLimit - left)) + 'px';
        };
        place();
        // Alpha M9 (KI-339, m4/ui-layout.js U3 ở hồi quy cuối): khi có vài nhiệm vụ, tracker cao ~180 px và xuống tới cột nút Đi bộ
        // + chỗ nghỉ joystick (M7 dời cột này sang phải cột nhân vật) hoặc cụm nút chiến đấu bên phải ở màn thấp -> bước sang
        // phải cột trái / dừng trước nút bên phải mà nó sẽ đè (vài lượt vì đổi bề rộng làm đổi chiều cao). Chỗ nghỉ joystick tính
        // theo nút Đi bộ (joystick có thể đang nổi dưới ngón tay). Chỉ chạy khi tracker vẽ lại / đổi cỡ màn, không chạy mỗi khung.
        if (!tracker.classList.contains('hidden')) {
            const walkEl = document.getElementById('mobile-walk-toggle'), joyEl = document.getElementById('joystick-container');
            const boxes = [];
            if (walkEl) { const wr = walkEl.getBoundingClientRect(); if (wr.width > 0) boxes.push({ l: wr.left, t: wr.top, r: wr.left + Math.max(wr.width, joyEl ? joyEl.offsetWidth : 0), b: window.innerHeight, side: 'L' }); }
            ['mobile-jump-btn', 'mobile-dash-btn', 'mobile-skill-btn', 'mobile-attack-btn', 'mobile-burst-btn'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                const r = el.getBoundingClientRect();
                if (r.width > 0) boxes.push({ l: r.left, t: r.top, r: r.right, b: r.bottom, side: 'R' });
            });
            for (let pass = 0; pass < 4; pass++) {
                const tr = tracker.getBoundingClientRect();
                if (!(tr.width > 0 && tr.height > 0)) break;
                let changed = false;
                boxes.forEach(o => {
                    if (o.r + 8 <= tr.left || o.l - 8 >= tr.right || o.b + 8 <= tr.top || o.t - 8 >= tr.bottom) return;
                    if (o.side === 'L') { const nl = Math.round(o.r + 10); if (nl > left) { left = nl; changed = true; } }
                    else { const nr = Math.round(o.l - 8); if (nr < rightLimit) { rightLimit = nr; changed = true; } }
                });
                if (!changed) break;
                place();
            }
        }
        // Alpha M7 (KI-313): thông báo phần thưởng trên cảm ứng xếp NGAY DƯỚI tracker (cùng lề trái) thay vì ở 1/3 chiều cao
        // bên trái — chỗ đó nay là cột đổi nhân vật + joystick (thông báo che mất nút).
        if (rewards) {
            const b = tracker.classList.contains('hidden') ? 0 : tracker.getBoundingClientRect().bottom;
            const tTop = Math.round(b > 0 ? b + 8 : top + 70);
            // Alpha M9 (KI-313, đo bằng m7/mobile-layout.js L9): chồng thông báo (~3 dòng ≈ 130 px) không được đè cột nhân vật,
            // nút Đi bộ và chỗ nghỉ của joystick ngay dưới nút đó (màn thấp) -> bắt đầu bên phải chúng nếu cùng dải dọc. Chỗ
            // nghỉ joystick tính theo nút Đi bộ (joystick có thể đang nổi dưới ngón tay lúc này).
            let tLeft = left;
            const party = document.getElementById('party-switch-temp');
            if (party) { const pr = party.getBoundingClientRect(); if (pr.width > 0 && pr.top < tTop + 130 && pr.bottom > tTop) tLeft = Math.max(tLeft, Math.round(pr.right + 8)); }
            const walk = document.getElementById('mobile-walk-toggle'), joy = document.getElementById('joystick-container');
            if (walk) { const wr = walk.getBoundingClientRect(); if (wr.width > 0 && wr.top < tTop + 130) tLeft = Math.max(tLeft, Math.round(wr.left + Math.max(wr.width, joy ? joy.offsetWidth : 0) + 8)); }
            rewards.style.left = tLeft + 'px';
            rewards.style.top = tTop + 'px';
        }
    } else if (rewards) {
        const b = tracker.classList.contains('hidden') ? 0 : tracker.getBoundingClientRect().bottom;
        rewards.style.top = b > 0 ? 'max(calc(33.333vh + 90px), ' + Math.round(b + 8) + 'px)' : 'calc(33.333vh + 90px)';
    }
    window.syncQuestTrackerVisibility();
};

// Gọi 4 lần/giây từ StoryQuest.update() (18) — chỉ đọc className, chỉ ghi DOM khi trạng thái đổi.
window.syncQuestTrackerVisibility = function () {
    const tracker = document.getElementById('quest-tracker');
    if (!tracker) return;
    const hud = document.getElementById('encounter-hud');
    const hide = !!window.isMobile && !!hud && !hud.classList.contains('enc-hidden');
    if (tracker.classList.contains('qt-hud-hidden') !== hide) {
        tracker.classList.toggle('qt-hud-hidden', hide);
        tracker.style.visibility = hide ? 'hidden' : '';
    }
};
window.addEventListener('resize', () => { if (window.layoutQuestTracker) window.layoutQuestTracker(); });

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

// GỠ BỎ (v0.9 — dọn dẹp code chết): khối PLAYER NAME PROMPT (Pre-Alpha v0.8) — 4 hàm
// showPlayerNamePrompt/closePlayerNamePrompt/confirmPlayerNamePrompt/cancelPlayerNamePrompt và
// markup #player-name-prompt-overlay (index.html) đã bị xoá — thay thế hoàn toàn bởi Character Name
// Popup tích hợp sẵn trong Opening/Title Screen (scripts/opening.js — runBackgroundStage(), dùng
// chung đúng window.setCharacterName() + window.requestSave() từng được xây ở đây). Đường gọi cũ
// duy nhất (initThree(), 04-scene-init.js) cũng đã được gỡ — xem comment ở đó để biết chi tiết race
// condition (debounce 300ms của requestSave()) đã khiến khối này trở thành code không bao giờ thực
// sự hiển thị được trong điều kiện chơi bình thường.

// ============================================================
// QUIT CONFIRMATION POPUP (Pre-Alpha v0.9 – Prelude)
// ============================================================
// Mở từ nút #close-menu-btn (góc dưới thanh utility strip TRONG Paimon Menu — nghĩa là Paimon Menu
// LUÔN đang mở sẵn, isGamePaused đã true, lúc popup này được gọi). togglePauseMenu(true) chỉ gọi
// PHÒNG HỜ nếu vì lý do nào đó hàm bị gọi khi chưa pause (không phải luồng chính) — tránh gọi lại
// không cần thiết khi đã pause, vì togglePauseMenu(true) có transition riêng (trượt panel...), gọi
// thừa sẽ gây giật hình dù không đổi giá trị isGamePaused.
window.showQuitConfirm = function () {
    const overlay = document.getElementById('quit-confirm-overlay');
    if (!overlay) return;

    if (!window.isGamePaused) window.togglePauseMenu(true);
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
};

// Chỉ ẩn popup — KHÔNG đụng đến togglePauseMenu(). Paimon Menu (phía sau popup) vẫn giữ nguyên trạng
// thái đang mở, người chơi "Hủy" nghĩa là quay lại Paimon Menu, không phải thoát khỏi nó.
window.hideQuitConfirm = function () {
    const overlay = document.getElementById('quit-confirm-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
};


// Xác nhận Quit -> quay lại Title Screen (Pre-Alpha v0.9 – Return to Title Flow). LƯU tiến trình hiện
// tại NGAY (saveGameNow() — ghi thẳng xuống localStorage, không debounce, khác requestSave() vốn trễ
// 300ms — cần chắc chắn đã ghi xong trước khi rời gameplay). KHÔNG dùng window.location.reload() nữa
// (spec v0.9 – Return to Title Flow: "Không reload trang") — thay vào đó đóng Paimon Menu + popup Quit
// Confirm (dọn sạch UI overlay đang mở), rồi gọi window.returnToTitle() (scripts/opening.js) để ẩn
// canvas/HUD gameplay và chạy tiếp Opening Flow TỪ Background Stage (bỏ qua logo.mp4/Character Name
// Popup/door_intro.mp4 — các bước đó chỉ dành cho Cold Start, xem runReturnToTitleFlow()).
window.confirmQuitToTitle = function () {
    if (window.saveGameNow) window.saveGameNow();
    if (window.hideQuitConfirm) window.hideQuitConfirm();
    if (window.isGamePaused) window.togglePauseMenu(false);
    if (window.returnToTitle) window.returnToTitle();
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
    if (window.updatePartyHUD) window.updatePartyHUD(); // ẩn/hiện Party HUD PC theo dialogue

    // Xoá sạch input đang giữ (giống hệt togglePauseMenu(true)) — tránh việc nhân vật "kẹt" di
    // chuyển theo hướng cũ sau khi đóng dialogue nếu người chơi đang giữ phím lúc mở hội thoại.
    if (typeof keys === 'object') {
        keys.w = keys.a = keys.s = keys.d = keys.space = keys.dash = keys.ctrl = keys.dashJustPressed = false;
    }
    // Alpha M7: huỷ luôn thao tác chiến đấu đang GIỮ (Attack đang charge, Aim, Held Skill) — trong hội thoại sự kiện thả
    // nút (mouseup/keyup) bị bỏ qua, nên trước đây đóng hội thoại xong Charged Attack tự bắn (đã tái hiện: giữ chuột trái
    // -> nói chuyện -> thả chuột trong hội thoại -> đóng -> Charged Attack). Cùng đường huỷ như mở Paimon Menu (M1).
    if (window.cancelHeldCombatInput) window.cancelHeldCombatInput('dialogue');
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
    if (window.updatePartyHUD) window.updatePartyHUD(); // ẩn/hiện Party HUD PC theo dialogue

    // Trả lại pointer lock cho desktop, giống hành vi togglePauseMenu(false) — để mouse-look hoạt
    // động lại ngay, không bắt người chơi phải click lại vào canvas trước.
    if (!isMobile && !altPressed && document.pointerLockElement !== container) {
        window.requestGamePointerLock(container);
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
// ELEMENTAL SKILL / BOW CHARGED ATTACK — AIM MODE CROSSHAIR UI
// ============================================================
// Bật/tắt crosshair giữa màn hình khi skillAimState.phase chuyển sang/rời khỏi 'aiming'
// (gọi từ game.js: startSkillAimMode() / endSkillAimMode()).
//
// Character #2 (Bow) Validation — thêm tham số `kind` (mặc định 'skill', BACKWARD-COMPAT 100% cho
// mọi lời gọi cũ không truyền tham số này — Character #1 Elemental Skill KHÔNG đổi hành vi). spec
// mục 3 "Bow-specific crosshair/reticle": kind === 'bow' chọn ĐÚNG #bow-aim-crosshair (index.html)
// thay vì #skill-aim-crosshair — 2 DOM element TÁCH BIỆT hoàn toàn, mỗi lần chỉ 1 trong 2 hiện ra
// (không có 2 crosshair chồng lên nhau, vì startSkillAim()/endSkillAim() trong combat.js luôn
// truyền ĐÚNG kind theo player.isBowChargedAiming tại thời điểm gọi).
window.setSkillAimUIVisible = function (visible, kind) {
    const elementId = (kind === 'bow') ? 'bow-aim-crosshair' : 'skill-aim-crosshair';
    const crosshair = document.getElementById(elementId);
    if (!crosshair) return;
    if (visible) {
        crosshair.classList.remove('opacity-0', 'scale-75');
        crosshair.classList.add('opacity-100', 'scale-100');
    } else {
        crosshair.classList.remove('opacity-100', 'scale-100');
        crosshair.classList.add('opacity-0', 'scale-75');
    }
};


// ============================================================
// Readability Batch (Character #3) — THUNDER / COORDINATED HUD
// ============================================================
// updateThunderHUD(dt): gọi mỗi frame từ animate() (file 08, cạnh updateBurstUI — chạy cả lúc
// hitstop để HUD không bị "đứng hình"). CHỈ ĐỌC state gameplay có sẵn, không ghi gì ngoài 2 timer
// hiển thị (thunderFinisherFlashTimer / reactiveRefreshFlashTimer, do combat.js set khi sự kiện xảy ra).
//   - Chip "Coordinated": hiện khi còn ≥1 Reactive Electro Effect sống (kể cả khi Character #3 đang
//     off-field) + thời gian còn lại của effect sống lâu nhất; nháy sáng khi Passive refresh.
//   - Panel "Thunder State": chỉ hiện trong Burst State — thanh thời gian (nháy khi < 1.5s), 3 pip
//     Thunder Charge (pip mới sáng lên có hiệu ứng "pop"), pip xám khi đang post-Finisher cooldown
//     (Charge tạm thời không tích được), banner "THUNDER FINISHER" khi Finisher kích hoạt.
//   - "Thunder State ended" hiện ngắn khi Burst State kết thúc.
// DOM dựng bằng JS + inline style (không phụ thuộc Tailwind), pointer-events: none (không chặn input).
(function () {
    let root = null, chip = null, chipText = null, panel = null, bar = null, barFill = null, pips = [], banner = null, endNote = null;
    // Task 3 (UI consistency): hàng chip trạng thái — CÙNG kiểu dáng chip Coordinated, mỗi chip có
    // icon + chữ (không chỉ dựa vào màu). Chỉ hiện state CÓ THẬT trong code:
    //   Overwatch — player.overwatchTimer > 0 (buff Passive Archer đang chờ dùng cho lần Charged kế tiếp)
    //   Decoy     — activeDecoys[] còn sống (thời gian tới khi tự nổ, ×n nếu nhiều)
    let chipRow = null, owChip = null, owText = null, decoyChip = null, decoyText = null;
    // Character #4: Tailwind (buff tốc độ của nhân vật đang ra sân) + Tempest (vùng Burst gió còn tồn tại).
    let twChip = null, twText = null, tempestChip = null, tempestText = null;
    // Character #5/#6: Counter Stance, Violet Arc (mức nạp), Lightning Rose (thời gian vùng còn lại).
    let counterChip = null, counterText = null, arcChip = null, arcText = null, roseChip = null, roseText = null;
    let lastCharge = 0, burstMax = 0, wasBurst = false, endNoteTimer = 0;
    const pipPop = [0, 0, 0];

    function el(tag, style, parent) {
        const e = document.createElement(tag);
        Object.assign(e.style, style);
        if (parent) parent.appendChild(e);
        return e;
    }

    function build() {
        root = el('div', { position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)', zIndex: 35,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', pointerEvents: 'none',
            fontFamily: 'Inter, system-ui, sans-serif', userSelect: 'none' }, document.body);
        root.id = 'thunder-hud';

        chipRow = el('div', { display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '92vw' }, root);
        chip = el('div', { display: 'none', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '999px',
            background: 'rgba(30,12,56,0.82)', border: '1px solid rgba(192,132,252,0.7)', color: '#e9d5ff',
            fontSize: '12px', fontWeight: '700', letterSpacing: '0.04em', boxShadow: '0 0 10px rgba(168,85,247,0.35)',
            transition: 'box-shadow 0.15s, background 0.15s' }, chipRow);
        el('span', { fontSize: '13px' }, chip).textContent = '⚡';
        chipText = el('span', {}, chip);

        const chipStyle = (bg, border, color, glow) => ({ display: 'none', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '999px',
            background: bg, border: '1px solid ' + border, color: color, fontSize: '12px', fontWeight: '700', letterSpacing: '0.04em', boxShadow: '0 0 10px ' + glow });
        owChip = el('div', chipStyle('rgba(60,30,4,0.82)', 'rgba(251,191,36,0.75)', '#fde68a', 'rgba(251,191,36,0.3)'), chipRow);
        el('span', { fontSize: '13px' }, owChip).textContent = '🎯';
        owText = el('span', {}, owChip);
        decoyChip = el('div', chipStyle('rgba(66,20,6,0.82)', 'rgba(249,115,22,0.75)', '#fed7aa', 'rgba(249,115,22,0.3)'), chipRow);
        el('span', { fontSize: '13px' }, decoyChip).textContent = '🔥';
        decoyText = el('span', {}, decoyChip);
        twChip = el('div', chipStyle('rgba(4,47,46,0.82)', 'rgba(45,212,191,0.75)', '#ccfbf1', 'rgba(45,212,191,0.3)'), chipRow);
        el('span', { fontSize: '13px' }, twChip).textContent = '💨';
        twText = el('span', {}, twChip);
        tempestChip = el('div', chipStyle('rgba(4,47,46,0.82)', 'rgba(153,246,228,0.8)', '#ccfbf1', 'rgba(45,212,191,0.35)'), chipRow);
        el('span', { fontSize: '13px' }, tempestChip).textContent = '🌀';
        tempestText = el('span', {}, tempestChip);
        counterChip = el('div', chipStyle('rgba(69,26,3,0.85)', 'rgba(245,158,11,0.8)', '#fde68a', 'rgba(245,158,11,0.35)'), chipRow);
        el('span', { fontSize: '13px' }, counterChip).textContent = '🛡';
        counterText = el('span', {}, counterChip);
        arcChip = el('div', chipStyle('rgba(80,7,36,0.85)', 'rgba(244,114,182,0.8)', '#fbcfe8', 'rgba(244,114,182,0.35)'), chipRow);
        el('span', { fontSize: '13px' }, arcChip).textContent = '⚡';
        arcText = el('span', {}, arcChip);
        roseChip = el('div', chipStyle('rgba(80,7,36,0.85)', 'rgba(249,168,212,0.85)', '#fce7f3', 'rgba(244,114,182,0.35)'), chipRow);
        el('span', { fontSize: '13px' }, roseChip).textContent = '🌹';
        roseText = el('span', {}, roseChip);

        panel = el('div', { display: 'none', flexDirection: 'column', alignItems: 'center', gap: '5px', padding: '7px 14px 8px',
            borderRadius: '12px', background: 'rgba(20,8,40,0.85)', border: '1px solid rgba(168,85,247,0.8)',
            boxShadow: '0 0 16px rgba(168,85,247,0.45)' }, root);
        el('div', { color: '#e9d5ff', fontSize: '11px', fontWeight: '800', letterSpacing: '0.18em' }, panel).textContent = 'THUNDER STATE';
        bar = el('div', { width: '150px', height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }, panel);
        barFill = el('div', { width: '100%', height: '100%', background: 'linear-gradient(90deg,#7c3aed,#e9d5ff)' }, bar);
        const pipRow = el('div', { display: 'flex', gap: '8px', marginTop: '2px' }, panel);
        for (let i = 0; i < 3; i++) {
            pips.push(el('div', { width: '16px', height: '16px', transform: 'rotate(45deg)', borderRadius: '3px',
                border: '2px solid #c084fc', background: 'transparent' }, pipRow));
        }

        banner = el('div', { display: 'none', marginTop: '4px', padding: '4px 14px', borderRadius: '6px',
            color: '#fde68a', fontSize: '18px', fontWeight: '900', letterSpacing: '0.12em',
            textShadow: '0 0 10px rgba(168,85,247,0.9), 0 2px 0 #3b0764', background: 'rgba(59,7,100,0.55)' }, root);
        banner.textContent = 'THUNDER FINISHER';

        endNote = el('div', { display: 'none', color: '#d8b4fe', fontSize: '12px', fontWeight: '700', letterSpacing: '0.08em',
            padding: '3px 10px', borderRadius: '999px', background: 'rgba(20,8,40,0.7)' }, root);
        endNote.textContent = 'Thunder State ended';
    }

    function updateThunderHUD(dt) {
        const player = window.player;
        if (!player) return;
        if (!root) build();
        dt = dt || 0;

        // --- Coordinated chip ---
        const fxList = window.activeElectroEffects || [];
        let alive = 0, longest = 0;
        for (let i = 0; i < fxList.length; i++) {
            const fx = fxList[i];
            if (!fx.active) continue;
            alive++;
            longest = Math.max(longest, fx.lifetime - fx.elapsed);
        }
        if (alive > 0) {
            chip.style.display = 'flex';
            chipText.textContent = 'Coordinated ' + longest.toFixed(1) + 's' + (alive > 1 ? '  ×' + alive : '');
            const refreshing = player.reactiveRefreshFlashTimer > 0;
            chip.style.boxShadow = refreshing ? '0 0 22px rgba(253,230,138,0.95)' : '0 0 10px rgba(168,85,247,0.35)';
            chip.style.background = refreshing ? 'rgba(88,28,135,0.95)' : 'rgba(30,12,56,0.82)';
        } else {
            chip.style.display = 'none';
        }
        if (player.reactiveRefreshFlashTimer > 0) player.reactiveRefreshFlashTimer = Math.max(0, player.reactiveRefreshFlashTimer - dt);

        // --- Overwatch chip (Archer Passive) ---
        if (player.overwatchTimer > 0) {
            owChip.style.display = 'flex';
            owText.textContent = 'Overwatch ' + player.overwatchTimer.toFixed(1) + 's';
        } else {
            owChip.style.display = 'none';
        }

        // --- Decoy chip ---
        const decoys = window.activeDecoys || [];
        let decoyAlive = 0, decoyLeft = Infinity;
        for (let i = 0; i < decoys.length; i++) {
            const dc = decoys[i];
            if (!dc || !dc.active) continue;
            decoyAlive++;
            decoyLeft = Math.min(decoyLeft, dc.lifetime - dc.lifeTimer);
        }
        if (decoyAlive > 0) {
            decoyChip.style.display = 'flex';
            decoyText.textContent = 'Decoy ' + Math.max(0, decoyLeft).toFixed(1) + 's' + (decoyAlive > 1 ? '  ×' + decoyAlive : '');
        } else {
            decoyChip.style.display = 'none';
        }

        // --- Tailwind chip (Character #4 Passive — chỉ khi nhân vật đang active có buff) ---
        const activeMember = window.partyState ? window.partyState[window.activeCharacterIndex] : null;
        if (activeMember && activeMember.tailwindTimer > 0) {
            twChip.style.display = 'flex';
            twText.textContent = 'Tailwind ' + activeMember.tailwindTimer.toFixed(1) + 's';
        } else {
            twChip.style.display = 'none';
        }

        // --- Tempest chip (Character #4 Burst field còn tồn tại, kể cả khi #4 ở ngoài sân) ---
        const burstList = (player.activeEffects && player.activeEffects.burst) || [];
        let fieldLeft = -1;
        for (let i = 0; i < burstList.length; i++) {
            const fx = burstList[i];
            if (fx && fx.type === 'wind_field' && fx.custom) fieldLeft = Math.max(fieldLeft, fx.custom.duration - fx.custom.elapsed);
        }
        if (fieldLeft > 0) {
            tempestChip.style.display = 'flex';
            tempestText.textContent = 'Tempest ' + fieldLeft.toFixed(1) + 's';
        } else {
            tempestChip.style.display = 'none';
        }

        // --- Character #5/#6 chips — đọc thẳng state gameplay (heldSkillState / activeEffects.burst) ---
        const hs = window.heldSkillState;
        if (hs && hs.active && hs.mode === 'counter_stance' && hs.skillData) {
            const cc = hs.skillData.counter;
            const inPerfect = hs.elapsed >= cc.startup && hs.elapsed <= cc.startup + cc.perfectWindow;
            counterChip.style.display = 'flex';
            counterText.textContent = inPerfect ? 'Counter — PERFECT' : 'Counter';
            counterChip.style.boxShadow = inPerfect ? '0 0 14px rgba(253,224,71,0.8)' : '0 0 10px rgba(245,158,11,0.35)';
        } else {
            counterChip.style.display = 'none';
        }
        if (hs && hs.active && hs.mode === 'violet_arc' && hs.skillData) {
            const tapT = hs.skillData.held.tapThreshold;
            arcChip.style.display = 'flex';
            arcText.textContent = hs.elapsed < tapT ? 'Violet Arc' : ('Violet Arc ' + Math.round((window.getVioletArcChargeRatio ? window.getVioletArcChargeRatio() : 0) * 100) + '%');
        } else {
            arcChip.style.display = 'none';
        }
        let roseLeft = -1;
        for (let i = 0; i < burstList.length; i++) {
            const fx = burstList[i];
            if (fx && fx.type === 'rose_field' && fx.custom) roseLeft = Math.max(roseLeft, fx.custom.duration - fx.custom.elapsed);
        }
        if (roseLeft > 0) {
            roseChip.style.display = 'flex';
            roseText.textContent = 'Lightning Rose ' + roseLeft.toFixed(1) + 's';
        } else {
            roseChip.style.display = 'none';
        }

        // --- Thunder State panel ---
        const inBurst = !!player.isBurstStateActive;
        if (inBurst) {
            if (!wasBurst) { burstMax = Math.max(0.01, player.burstStateTimer); lastCharge = 0; }
            panel.style.display = 'flex';
            const ratio = Math.max(0, Math.min(1, player.burstStateTimer / burstMax));
            barFill.style.width = (ratio * 100).toFixed(1) + '%';
            const ending = player.burstStateTimer < 1.5;
            barFill.style.opacity = ending ? (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(performance.now() / 60))) : '1';

            const charge = player.thunderCharge || 0;
            const blocked = player.thunderChargeCooldownTimer > 0;
            // Finisher vừa nổ: Charge đã về 0 ngay trong cùng frame (combat.js) — vẫn cho 3 pip sáng
            // vàng trong lúc banner hiện, để người chơi thấy "đủ 3 -> Finisher" chứ không thấy pip
            // biến mất đột ngột.
            const finisherShow = player.thunderFinisherFlashTimer > 0.45;
            for (let i = 0; i < 3; i++) {
                if (i < charge && i >= lastCharge) pipPop[i] = 0.25; // pip vừa được +1 -> pop
                pipPop[i] = Math.max(0, pipPop[i] - dt);
                const filled = finisherShow || i < charge;
                const fillColor = finisherShow ? '#fde68a' : (blocked ? '#6b7280' : '#c084fc');
                pips[i].style.borderColor = finisherShow ? '#fde68a' : (blocked ? '#6b7280' : '#c084fc');
                pips[i].style.background = filled ? fillColor : 'transparent';
                pips[i].style.boxShadow = filled && !blocked ? '0 0 10px ' + (finisherShow ? 'rgba(253,230,138,0.95)' : 'rgba(192,132,252,0.95)') : 'none';
                pips[i].style.transform = 'rotate(45deg) scale(' + (1 + pipPop[i] * 2.4).toFixed(2) + ')';
            }
            lastCharge = charge;
        } else {
            panel.style.display = 'none';
            if (wasBurst) endNoteTimer = 1.2;
        }
        wasBurst = inBurst;

        // --- Finisher banner ---
        if (player.thunderFinisherFlashTimer > 0) {
            banner.style.display = 'block';
            const t = player.thunderFinisherFlashTimer;
            banner.style.transform = 'scale(' + (1 + Math.max(0, t - 0.7) * 2.5).toFixed(2) + ')';
            banner.style.opacity = Math.min(1, t / 0.25).toFixed(2);
            player.thunderFinisherFlashTimer = Math.max(0, t - dt);
        } else {
            banner.style.display = 'none';
        }

        // --- Burst exit note ---
        if (endNoteTimer > 0) {
            endNote.style.display = 'block';
            endNote.style.opacity = Math.min(1, endNoteTimer / 0.3).toFixed(2);
            endNoteTimer = Math.max(0, endNoteTimer - dt);
        } else {
            endNote.style.display = 'none';
        }
    }
    window.updateThunderHUD = updateThunderHUD;
})();

// ============================================================
// PARTY SETUP — Paimon Menu › Party (Task 92641)
// ============================================================
// Màn chỉnh đội hình. KHÔNG giữ state đội hình riêng: mỗi lần mở dựng lại từ window.Party (file 02).
// Trong lúc chỉnh chỉ có 1 BẢN NHÁP ids (chưa áp dụng) — bấm "Áp dụng" mới gọi Party.commit(), đóng menu
// hoặc bấm "Hoàn tác" thì bỏ nháp. Menu mở = game đang pause, nhưng commit vẫn tôn trọng quy tắc chặn đổi
// nhân vật (vd #3 đang Burst State -> không được gỡ nhân vật đang điều khiển).
// Tương tác (tap/click, không cần kéo-thả):
//   - Chạm 1 slot -> chọn slot (chạm lại để bỏ chọn).
//   - Có slot đang chọn + chạm nhân vật: chưa có trong đội -> vào slot đó (thay người cũ nếu có);
//     đã ở slot khác -> ĐỔI CHỖ 2 slot; đã ở chính slot đó -> không đổi.
//   - Không chọn slot + chạm nhân vật: đã trong đội -> chọn slot của họ; chưa trong đội -> vào slot trống
//     đầu tiên (hết slot trống -> nhắc chọn slot để thay).
//   - "Gỡ khỏi đội" với slot đang chọn (không cho gỡ thành viên cuối cùng).
// Listener: 1 listener uỷ quyền gắn đúng 1 lần trên container — mở lại bao nhiêu lần cũng không nhân bản.
(function () {
    const WEAPON_NAMES = { sword: 'Kiếm Đơn', bow: 'Cung', polearm: 'Vũ Khí Cán Dài', claymore: 'Trọng Kiếm', catalyst: 'Pháp Khí' };
    const REASON_TEXT = {
        busy: 'Không thể thay nhân vật đang điều khiển lúc này (đang thi triển Burst, đang cắm xuống hoặc đã gục).',
        invalid: 'Đội hình không hợp lệ.',
        empty_party: 'Đội cần ít nhất 1 nhân vật.',
        duplicate_character: 'Một nhân vật chỉ được ở 1 slot.',
        unknown_character: 'Nhân vật không hợp lệ.'
    };
    const ui = { draft: null, selected: null, message: '', messageKind: 'info', root: null };

    function injectStyles() {
        if (document.getElementById('party-setup-styles')) return;
        const st = document.createElement('style');
        st.id = 'party-setup-styles';
        st.textContent = `
#menu-content-party{display:flex;flex-direction:column;gap:12px;height:100%;min-height:0;color:#f7e8cf}
#menu-content-party.hidden{display:none}
#menu-content-party .ps-title{font-size:20px;font-weight:700;color:#ebdcb9;font-family:serif;border-bottom:1px solid rgba(45,40,79,.4);padding-bottom:8px;flex-shrink:0}
#menu-content-party .ps-body{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding-right:4px}
#menu-content-party .ps-label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9c94c0;font-weight:600}
#menu-content-party .ps-slots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
#menu-content-party .ps-roster{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
#menu-content-party .ps-card{position:relative;background:rgba(20,18,36,.85);border:1px solid rgba(45,40,79,.7);border-radius:12px;padding:10px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;min-height:44px;text-align:center;color:inherit;font:inherit;transition:border-color .12s,box-shadow .12s,transform .12s}
#menu-content-party .ps-card:hover{border-color:rgba(235,220,185,.45)}
#menu-content-party .ps-card.is-selected{border-color:#fbbf24;box-shadow:0 0 0 2px rgba(251,191,36,.3),0 0 14px rgba(251,191,36,.25)}
#menu-content-party .ps-card.is-empty{border-style:dashed;color:#6e6884;justify-content:center;min-height:132px}
#menu-content-party .ps-card.in-party{opacity:.72}
#menu-content-party .ps-card.in-party.is-focus{opacity:1}
#menu-content-party .ps-num{position:absolute;top:6px;left:8px;font:700 11px monospace;color:#fde68a;background:rgba(18,16,30,.9);border:1px solid rgba(251,191,36,.5);border-radius:4px;padding:0 5px}
#menu-content-party .ps-avatar{width:56px;height:56px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;color:#fff;border:2px solid rgba(235,220,185,.35);background:#1c1917;flex-shrink:0}
#menu-content-party .ps-name{font-weight:700;font-size:13px;color:#f7e8cf;line-height:1.2}
#menu-content-party .ps-meta{font-size:11px;color:#9c94c0;line-height:1.3}
#menu-content-party .ps-badges{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;min-height:18px}
#menu-content-party .ps-badge{font-size:10px;font-weight:700;border-radius:9999px;padding:1px 7px;border:1px solid}
#menu-content-party .ps-badge.active{color:#fde68a;border-color:rgba(251,191,36,.6);background:rgba(120,53,15,.35)}
#menu-content-party .ps-badge.next{color:#a7f3d0;border-color:rgba(52,211,153,.6);background:rgba(6,78,59,.35)}
#menu-content-party .ps-badge.changed{color:#bfdbfe;border-color:rgba(96,165,250,.6);background:rgba(30,58,138,.35)}
#menu-content-party .ps-badge.slot{color:#e9d5ff;border-color:rgba(192,132,252,.55);background:rgba(59,7,100,.35)}
#menu-content-party .ps-hint{font-size:12px;color:#9c94c0;min-height:18px}
#menu-content-party .ps-footer{flex-shrink:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-top:1px solid rgba(45,40,79,.4);padding-top:10px}
#menu-content-party .ps-msg{flex:1;min-width:160px;font-size:12px}
#menu-content-party .ps-msg.info{color:#9c94c0}#menu-content-party .ps-msg.ok{color:#86efac}#menu-content-party .ps-msg.err{color:#fca5a5}
#menu-content-party .ps-btn{min-height:40px;min-width:96px;padding:0 14px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;border:1px solid rgba(235,220,185,.4);background:rgba(31,26,53,.9);color:#f7e8cf}
#menu-content-party .ps-btn.primary{background:#ebdcb9;color:#1a1530;border-color:#ebdcb9}
#menu-content-party .ps-btn:disabled{opacity:.4;cursor:not-allowed}
@media (max-width:640px){#menu-content-party .ps-slots{grid-template-columns:repeat(2,minmax(0,1fr))}#menu-content-party .ps-roster{grid-template-columns:repeat(2,minmax(0,1fr))}#menu-content-party .ps-avatar{width:44px;height:44px;font-size:16px}}
`;
        document.head.appendChild(st);
    }

    function ensureRoot() {
        if (ui.root && document.body.contains(ui.root)) return ui.root;
        const anchor = document.getElementById('menu-content-locked') || document.getElementById('menu-content-character');
        if (!anchor || !anchor.parentNode) return null;
        injectStyles();
        const root = document.createElement('div');
        root.id = 'menu-content-party';
        root.className = 'hidden';
        anchor.parentNode.insertBefore(root, anchor);
        root.addEventListener('click', onClick);   // gắn đúng 1 lần (root chỉ tạo 1 lần)
        ui.root = root;
        return root;
    }

    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function avatar(entry) {
        const color = (window.PARTY_ELEMENT_COLORS || {})[entry.element] || '#a8a29e';
        return `<span class="ps-avatar" style="background:radial-gradient(circle at 50% 35%, ${color}88, #1c1917 72%);border-color:${color}aa">${esc((entry.name || '?').charAt(0).toUpperCase())}</span>`;
    }
    function sameIds(a, b) { return a.join('|') === b.join('|'); }
    function setMsg(text, kind) { ui.message = text || ''; ui.messageKind = kind || 'info'; }

    function render() {
        const root = ensureRoot();
        if (!root || !window.Party) return;
        const P = window.Party;
        const committed = P.getIds();
        if (!ui.draft) ui.draft = committed.slice();
        const roster = P.getRosterEntries();
        const byId = {}; roster.forEach(r => { byId[r.id] = r; });
        const activeNow = P.getActiveMember() ? P.getActiveMember().id : null;
        const dirty = !sameIds(ui.draft, committed);
        const check = P.validate(ui.draft);
        const nextActive = dirty ? P.previewActiveId(ui.draft) : activeNow;
        const memberCount = ui.draft.filter(Boolean).length;

        let slotsHtml = '';
        for (let i = 0; i < P.CAPACITY; i++) {
            const id = ui.draft[i];
            const sel = ui.selected === i ? ' is-selected' : '';
            if (!id) {
                slotsHtml += `<button type="button" class="ps-card is-empty${sel}" data-action="slot" data-slot="${i}"><span class="ps-num">${i + 1}</span><span style="font-size:22px">+</span><span class="ps-meta">Trống</span></button>`;
                continue;
            }
            const e = byId[id] || { id: id, name: id, element: '', weaponType: '', level: 1 };
            const badges = [];
            if (id === activeNow) badges.push('<span class="ps-badge active">Đang điều khiển</span>');
            if (dirty && id === nextActive && id !== activeNow) badges.push('<span class="ps-badge next">Sẽ vào sân</span>');
            if (committed[i] !== id) badges.push('<span class="ps-badge changed">Mới</span>');
            slotsHtml += `<button type="button" class="ps-card${sel}" data-action="slot" data-slot="${i}" data-char="${esc(id)}"><span class="ps-num">${i + 1}</span>${avatar(e)}<span class="ps-name">${esc(e.name)}</span><span class="ps-meta">Lv.${esc(e.level)} · ${esc(e.element)} · ${esc(WEAPON_NAMES[e.weaponType] || e.weaponType)}</span><span class="ps-badges">${badges.join('')}</span></button>`;
        }

        let rosterHtml = '';
        roster.forEach(e => {
            const at = ui.draft.indexOf(e.id);
            const cls = at !== -1 ? ' in-party' + (ui.selected === at ? ' is-focus' : '') : '';
            const badge = at !== -1 ? `<span class="ps-badge slot">Slot ${at + 1}</span>` : '<span class="ps-badge next" style="opacity:.8">Có thể thêm</span>';
            rosterHtml += `<button type="button" class="ps-card${cls}" data-action="char" data-id="${esc(e.id)}">${avatar(e)}<span class="ps-name">${esc(e.name)}</span><span class="ps-meta">Lv.${esc(e.level)} · ${esc(e.element)} · ${esc(WEAPON_NAMES[e.weaponType] || e.weaponType)}</span><span class="ps-badges">${badge}</span></button>`;
        });

        let hint;
        if (ui.selected === null) hint = 'Chọn 1 slot, rồi chọn nhân vật để đặt vào / thay thế. Chọn nhân vật đã trong đội để đổi chỗ.';
        else if (ui.draft[ui.selected]) hint = `Slot ${ui.selected + 1} đang chọn — chọn nhân vật để thay, hoặc chọn nhân vật ở slot khác để đổi chỗ.`;
        else hint = `Slot ${ui.selected + 1} (trống) đang chọn — chọn nhân vật để thêm vào.`;
        const canRemove = ui.selected !== null && !!ui.draft[ui.selected] && memberCount > 1;
        const msg = ui.message || (dirty ? 'Có thay đổi chưa áp dụng (đóng menu sẽ bỏ thay đổi).' : `Đội hiện tại: ${memberCount}/${P.CAPACITY} · Roster: ${roster.length} nhân vật.`);
        const msgKind = ui.message ? ui.messageKind : 'info';

        ui.root.innerHTML =
            `<div class="ps-title">Party</div>` +
            `<div class="ps-body scrollable-panel">` +
                `<div class="ps-label">Đội hình (tối đa ${P.CAPACITY})</div>` +
                `<div class="ps-slots">${slotsHtml}</div>` +
                `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="ps-hint" style="flex:1">${esc(hint)}</span>` +
                `<button type="button" class="ps-btn" data-action="remove" ${canRemove ? '' : 'disabled'} title="${memberCount <= 1 ? 'Không thể gỡ thành viên cuối cùng' : ''}">Gỡ khỏi đội</button></div>` +
                `<div class="ps-label">Nhân vật (${roster.length})</div>` +
                `<div class="ps-roster">${rosterHtml}</div>` +
            `</div>` +
            `<div class="ps-footer"><span class="ps-msg ${msgKind}" data-role="msg">${esc(msg)}</span>` +
                `<button type="button" class="ps-btn" data-action="reset" ${dirty ? '' : 'disabled'}>Hoàn tác</button>` +
                `<button type="button" class="ps-btn primary" data-action="apply" ${dirty && check.valid ? '' : 'disabled'}>Áp dụng</button>` +
            `</div>`;
    }

    function onClick(ev) {
        const el = ev.target.closest('[data-action]');
        if (!el || !ui.root.contains(el) || el.disabled) return;
        const P = window.Party;
        if (!P || !ui.draft) return;
        const action = el.dataset.action;
        setMsg('');
        if (action === 'slot') {
            const i = parseInt(el.dataset.slot, 10);
            ui.selected = ui.selected === i ? null : i;
        } else if (action === 'char') {
            const id = el.dataset.id;
            const at = ui.draft.indexOf(id);
            if (ui.selected !== null) {
                if (at === ui.selected) { /* đã ở đúng slot */ }
                else if (at !== -1) {                       // đổi chỗ 2 slot
                    const t = ui.draft[ui.selected]; ui.draft[ui.selected] = id; ui.draft[at] = t;
                } else {                                     // thêm / thay
                    ui.draft[ui.selected] = id;
                }
            } else if (at !== -1) {
                ui.selected = at;                            // focus slot của nhân vật đó
            } else {
                const empty = ui.draft.indexOf(null);
                if (empty !== -1) { ui.draft[empty] = id; ui.selected = empty; }
                else setMsg('Đội đã đủ 4 người — chọn 1 slot để thay bằng nhân vật này.', 'info');
            }
        } else if (action === 'remove') {
            if (ui.selected !== null && ui.draft.filter(Boolean).length > 1) ui.draft[ui.selected] = null;
            else setMsg(REASON_TEXT.empty_party, 'err');
        } else if (action === 'reset') {
            ui.draft = P.getIds(); ui.selected = null;
        } else if (action === 'apply') {
            const res = P.commit(ui.draft.slice());
            if (res.ok) {
                ui.draft = P.getIds(); ui.selected = null;
                const a = P.getActiveMember();
                setMsg('Đã áp dụng đội hình.' + (a ? ` Đang điều khiển: ${a.name}.` : ''), 'ok');
                if (typeof sfx !== 'undefined' && sfx.playSwing) sfx.playSwing();
            } else {
                const firstErr = res.errors && res.errors[0];
                setMsg(REASON_TEXT[res.reason === 'invalid' && firstErr ? firstErr.code : res.reason] || REASON_TEXT.invalid, 'err');
            }
        }
        render();
    }

    // Gọi từ openMenuSubSection('party') (index.html): bỏ nháp cũ, dựng từ state thật, hiện container.
    window.renderPartySetup = function () {
        ui.draft = null; ui.selected = null; setMsg('');
        render();
        if (ui.root) ui.root.classList.remove('hidden');
    };
    // Cho test/tích hợp: đọc bản nháp hiện tại (chỉ-đọc).
    window.getPartySetupDraft = function () { return ui.draft ? ui.draft.slice() : null; };
})();
