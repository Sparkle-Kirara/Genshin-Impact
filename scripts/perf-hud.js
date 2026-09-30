// ============================================================
// perf-hud.js — Alpha M7-P0: bảng đo hiệu năng (CHỈ bật khi URL có ?perf=1)
// ============================================================
// Mục đích: đo game THẬT trên PC / điện thoại trước khi tối ưu (M7 P1+). Chỉ ĐỌC số liệu, không đổi
// gameplay, VFX, chất lượng hình hay cách vẽ.
//
// Tắt (mặc định, không có ?perf=1): file này return ngay — không tạo DOM, không định nghĩa
// window.perfHud, không cài hook nào. animate() (file 08) chỉ kiểm tra `if (perfHud)` 3 lần mỗi khung.
//
// Bật: animate() gọi 3 mốc trong CHÍNH vòng lặp của nó (không thêm requestAnimationFrame / setInterval):
//   perfHud.frameStart()          đầu khung (ngay sau requestAnimationFrame(animate))
//   perfHud.renderStart()         xong logic game, ngay trước renderer.render()
//   perfHud.frameEnd(rendered)    sau renderer.render() (rendered = false khi game đang pause, không vẽ)
// Bảng chữ được ghi lại tối đa 2 lần/giây (1 lần gán textContent); mỗi khung chỉ ghi vài số vào mảng vòng.
//
// Giới hạn đo (xem thêm báo cáo M7-P0):
//   - "khung" = khoảng cách giữa 2 lần animate() chạy (nhịp requestAnimationFrame) -> ra FPS thật của trang.
//   - "logic" / "render" = thời gian JS trên luồng chính. render là lúc CPU gửi lệnh vẽ, KHÔNG gồm thời gian
//     GPU vẽ thật (GPU chạy song song; đo nó cần gl.finish() — sẽ làm chậm game nên không dùng). Khi GPU là
//     điểm nghẽn: FPS thấp nhưng logic + render nhỏ -> phần còn lại là chờ GPU / vsync.
//   - three.js r128 reset renderer.info SAU pass bóng, nên info.render.calls chỉ là pass chính. Pass bóng
//     được đếm riêng bằng cách bọc renderer.shadowMap.render (chỉ khi ?perf=1; bọc đi thẳng vào hàm gốc,
//     không đổi gì cách vẽ). Số draw call là số lệnh vẽ, không quy đổi thẳng ra ms.
//   - Số VFX = các danh sách VFX dùng chung (particles, ghostTrails, combatFx, dot pool đang chạy); mesh
//     riêng của từng skill (player.activeEffects, aura nhân vật...) KHÔNG nằm trong số này.
(function () {
    'use strict';
    var on = false;
    try { on = new URLSearchParams(window.location.search).get('perf') === '1'; } catch (e) { on = false; }
    if (!on) return;

    var CAP = 1200;                 // mảng vòng: đủ cho 10 s ở 120 Hz
    var REFRESH_MS = 500;           // cập nhật chữ 2 lần/giây
    var buf = {
        t: new Float64Array(CAP),   // thời điểm kết thúc khung
        frame: new Float32Array(CAP), update: new Float32Array(CAP), render: new Float32Array(CAP),
        main: new Float32Array(CAP), shadow: new Float32Array(CAP), tris: new Float32Array(CAP)
    };
    var head = 0, count = 0;
    var lastStart = 0, tStart = 0, tRender = 0, shadowCalls = 0, shadowTris = 0, lastRefresh = 0;
    var paused = false, hooked = false, el = null, stats = null;

    // Tab ẩn -> rAF dừng; khung đầu tiên sau khi quay lại không phải "giật" của game.
    document.addEventListener('visibilitychange', function () { lastStart = 0; });

    function hookShadowPass(renderer) {
        var sm = renderer && renderer.shadowMap;
        if (!sm || typeof sm.render !== 'function') return;
        var orig = sm.render;
        sm.render = function () {
            var info = renderer.info.render, c0 = info.calls, t0 = info.triangles;
            var r = orig.apply(this, arguments);
            shadowCalls += info.calls - c0; shadowTris += info.triangles - t0;
            return r;
        };
    }

    function createEl() {
        el = document.createElement('div');
        el.id = 'perf-hud';
        el.setAttribute('aria-hidden', 'true');
        // Góc trên, lùi sang trái cụm nút tròn góc trên phải (~100 px) để không đè bảng nhiệm vụ góc trên trái;
        // màn hẹp (dọc) thì căn giữa. pointer-events: none — không bao giờ nhận chạm / chuột.
        var css = document.createElement('style');
        css.id = 'perf-hud-style';
        css.textContent =
            '#perf-hud{position:fixed;top:calc(4px + env(safe-area-inset-top,0px));right:calc(108px + env(safe-area-inset-right,0px));' +
            'z-index:2147483000;pointer-events:none;user-select:none;-webkit-user-select:none;background:rgba(0,0,0,.6);color:#e5e7eb;' +
            'padding:3px 6px;border-radius:4px;font:11px/1.25 ui-monospace,Menlo,Consolas,monospace;white-space:pre;' +
            'max-width:calc(100vw - 16px);overflow:hidden}' +
            '.touch-ui #perf-hud{font-size:10px}' +
            '@media (max-width:639px){#perf-hud{right:auto;left:50%;transform:translateX(-50%)}}';
        document.head.appendChild(css);
        el.textContent = 'perf: đang đo…';
        document.body.appendChild(el);
    }

    function frameStart() {
        var now = performance.now();
        if (!hooked && window.renderer) { hooked = true; hookShadowPass(window.renderer); }
        if (!el && document.body) createEl();
        tStart = now;
    }
    function renderStart() {
        tRender = performance.now();
        shadowCalls = 0; shadowTris = 0;
    }
    function frameEnd(rendered) {
        var now = performance.now();
        paused = !rendered;
        if (rendered) {
            if (lastStart > 0) {
                var info = window.renderer.info.render;
                buf.t[head] = now;
                buf.frame[head] = tStart - lastStart;
                buf.update[head] = tRender - tStart;
                buf.render[head] = now - tRender;
                buf.main[head] = info.calls;
                buf.shadow[head] = shadowCalls;
                buf.tris[head] = info.triangles + shadowTris;
                head = (head + 1) % CAP; if (count < CAP) count++;
            }
            lastStart = tStart;
        } else {
            lastStart = 0;          // khung pause không vào thống kê; khung đầu sau pause cũng không
        }
        if (now - lastRefresh >= REFRESH_MS) { lastRefresh = now; refresh(now); }
    }

    function countEnemies() {
        var list = window.enemies || [], alive = 0, dummies = 0;
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            if (e && e.alive === true && !e.pendingRemoval) { alive++; if (!e.isSlime && !e.isFieldEnemy) dummies++; }
        }
        return { alive: alive, dummies: dummies, listed: list.length };
    }
    function len(a) { return a && a.length ? a.length : 0; }
    function countVfx() {
        var dots = typeof window.countActiveDots === 'function' ? window.countActiveDots() : null;
        var v = { particles: len(window.particles), ghostTrails: len(window.ghostTrails), combatFx: len(window.combatFx), dots: dots,
            damageNumbers: len(window.damageNumbers), energyOrbs: len(window.energyParticles) };
        v.total = v.particles + v.ghostTrails + v.combatFx + (dots || 0);
        return v;
    }

    function refresh(now) {
        // 1 s gần nhất: FPS, trung bình; 10 s gần nhất: p95, max, số khung giật
        var n1 = 0, sumF1 = 0, sumU = 0, sumR = 0, sumM = 0, sumS = 0, sumT = 0, win = [];
        for (var k = 0; k < count; k++) {
            var i = (head - 1 - k + CAP) % CAP, age = now - buf.t[i];
            if (age > 10000) break;
            win.push(buf.frame[i]);
            // máy rất chậm (< 1 khung/s): vẫn lấy khung mới nhất
            if (age <= 1000 || k === 0) { n1++; sumF1 += buf.frame[i]; sumU += buf.update[i]; sumR += buf.render[i]; sumM += buf.main[i]; sumS += buf.shadow[i]; sumT += buf.tris[i]; }
        }
        var r = window.renderer, mem = r && r.info ? r.info.memory : null;
        var sorted = win.slice().sort(function (a, b) { return a - b; });
        var p = function (q) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0; };
        var over33 = 0, over50 = 0;
        for (var j = 0; j < win.length; j++) { if (win[j] > 33.4) over33++; if (win[j] > 50) over50++; }
        var heap = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
        stats = {
            paused: paused,
            fps: n1 && sumF1 > 0 ? 1000 * n1 / sumF1 : 0,
            frameMs: n1 ? sumF1 / n1 : 0, updateMs: n1 ? sumU / n1 : 0, renderMs: n1 ? sumR / n1 : 0,
            window10s: { frames: win.length, p50: p(0.5), p95: p(0.95), p99: p(0.99), max: sorted.length ? sorted[sorted.length - 1] : 0, over33: over33, over50: over50 },
            drawCalls: { main: n1 ? sumM / n1 : 0, shadow: n1 ? sumS / n1 : 0 }, triangles: n1 ? sumT / n1 : 0,
            geometries: mem ? mem.geometries : null, textures: mem ? mem.textures : null,
            programs: r && r.info && r.info.programs ? r.info.programs.length : null,
            enemies: countEnemies(), vfx: countVfx(), sceneChildren: window.scene ? window.scene.children.length : null,
            pixelRatio: r ? r.getPixelRatio() : null, canvas: r ? [r.domElement.width, r.domElement.height] : null,
            heapMB: heap
        };
        if (!el) return;
        var f1 = function (x) { return x.toFixed(1); }, f0 = function (x) { return Math.round(x); };
        var s = stats, w = s.window10s, dc = s.drawCalls, v = s.vfx, en = s.enemies;
        // ~40 ký tự / dòng để vừa màn điện thoại ngang (chi tiết đầy đủ: perfHud.snapshot()).
        var lines = [
            'FPS ' + f1(s.fps) + ' · khung ' + f1(s.frameMs) + ' ms' + (s.paused ? ' · TẠM DỪNG' : ''),
            '10s p95 ' + f1(w.p95) + ' max ' + f1(w.max) + ' · >33ms ×' + w.over33 + ' >50ms ×' + w.over50,
            'CPU logic ' + f1(s.updateMs) + ' render ' + f1(s.renderMs) + ' ms' + (s.heapMB !== null ? ' · heap ' + f0(s.heapMB) + 'MB' : ''),
            'draw ' + f0(dc.main + dc.shadow) + ' (' + f0(dc.main) + ' + bóng ' + f0(dc.shadow) + ') · ' + f0(s.triangles / 1000) + 'k tam giác',
            'geo ' + s.geometries + ' tex ' + s.textures + ' shader ' + s.programs + ' · DPR ' + s.pixelRatio + ' ' + (s.canvas ? s.canvas[0] + '×' + s.canvas[1] : ''),
            'quái ' + en.alive + (en.dummies ? ' (' + en.dummies + ' bù nhìn)' : '') + ' · VFX ' + v.total + ' · dmg ' + v.damageNumbers + ' · obj ' + s.sceneChildren
        ];
        el.textContent = lines.join('\n');
    }

    // snapshot(): số đang hiển thị (dạng object) — gõ trong DevTools / eruda: copy(perfHud.snapshot())
    function snapshot() { refresh(performance.now()); return JSON.parse(JSON.stringify(stats)); }

    window.perfHud = { enabled: true, frameStart: frameStart, renderStart: renderStart, frameEnd: frameEnd, snapshot: snapshot };
    try { console.info('[perf] ?perf=1 — bảng đo hiệu năng đang bật'); } catch (e) { /* ignore */ }
})();
