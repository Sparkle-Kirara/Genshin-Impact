# Genshin Impact (fan-made) — Alpha v1.0

Game web 3D thuần HTML/CSS/JavaScript + Three.js r128, **ưu tiên điện thoại (màn hình ngang)**, có hỗ trợ PC.
Không có bước build: **thư mục này chính là bản chạy**. Phiên bản ghi trong file `VERSION`; thay đổi xem `CHANGELOG.md`.

## Chạy game

1. Đặt thư mục `assets/` (video Opening, nhạc, icon — **không nằm trong repository**, xem bảng dưới) cạnh `index.html`.
   Thiếu asset game vẫn chạy (Opening vẽ bằng canvas dự phòng, nhạc im lặng), chỉ có lỗi 404 trong console.
2. Phục vụ thư mục bằng web server tĩnh bất kỳ, rồi mở trang:

   ```bash
   python3 -m http.server 8080      # hoặc: npx http-server -p 8080
   # máy tính:  http://localhost:8080/
   # điện thoại cùng Wi-Fi: http://<IP của máy tính>:8080/
   ```

   Mở thẳng `index.html` từ ổ đĩa (`file://`) cũng vào được gameplay (kiểm tự động: `tools/tests/m8/build-check.js` B4),
   nhưng nên dùng web server (một số trình duyệt / WebView giới hạn `file://`).
3. Lần đầu cần Internet: Tailwind Play CDN, three.js r128 (cdnjs), Font Awesome (cdnjs), Google Fonts.

| Mục | Ghi chú |
|---|---|
| Trình duyệt | Bản gần đây của Chrome / Edge / Samsung Internet / Safari / Firefox (code dùng `?.` và `??`: tối thiểu Chrome 80, Safari 13.1, Firefox 74). Kiểm tự động trên Chromium 141 (headless, giả lập cảm ứng). **Chưa thử trên điện thoại thật.** |
| Hướng màn hình | Ngang là chính (nút Start xin toàn màn hình rồi khoá ngang — Paimon Menu › Settings › Fullscreen, mặc định bật). Dọc vẫn chơi được, HUD không chồng nhau nhưng khung nhìn hẹp. |
| Điều khiển | Tự chọn theo con trỏ chính: điện thoại/máy tính bảng → HUD cảm ứng; PC (kể cả laptop màn cảm ứng) → chuột + bàn phím (WASD, chuột trái, E, Q, F, 1–4, Shift, Space, Esc). |
| Lưu game | Tự động vào `localStorage` khoá `genshinFanGame_saveData_v1` (schema v2, tự nâng cấp save v1). Xoá: Paimon Menu › Settings › Reset Save Data. |
| Debug trên điện thoại | Console eruda: mở game với `?debug=1` (được nhớ), tắt bằng `?debug=0`. Mặc định KHÔNG nạp. |
| Đo hiệu năng | Mở game với `?perf=1` (không nhớ — mỗi lần phải thêm vào URL; dùng cùng eruda: `?perf=1&debug=1`). Bảng nhỏ góc trên: FPS, thời gian khung (p95 / max / số khung > 33 ms, > 50 ms trong 10 s), ms CPU của logic và `render()`, draw call pass chính + pass bóng, tam giác, geometry / texture / shader, quái sống, VFX. Chi tiết: `perfHud.snapshot()` trong console. Không có `?perf=1` thì không tạo gì. (`scripts/perf-hud.js`) |

## Asset không có trong repository

Tên file phân biệt HOA/thường trên web server Linux.

| Đường dẫn | Dùng cho | Nếu thiếu |
|---|---|---|
| `assets/icons/Genshin_Impact.png` | icon tab trình duyệt | không có icon |
| `assets/opening/intro/logo.mp4` | logo mở đầu | vẽ canvas dự phòng |
| `assets/opening/title/background.mp4` | nền màn hình tiêu đề (lặp) | vẽ canvas dự phòng |
| `assets/opening/title/background.mp3` | nhạc màn hình tiêu đề | nhạc tổng hợp WebAudio |
| `assets/opening/door/door_intro.mp4` | cảnh tiến tới cánh cửa | vẽ canvas dự phòng |
| `assets/opening/door/open_door.mp4` | cảnh mở cửa | vẽ canvas dự phòng |
| `assets/opening/loading/loading_scene.mp4` | cảnh tải | vẽ canvas dự phòng |
| `assets/audio/bg_ost` → `ost1.mp3` … `ost9.mp3` | nhạc nền khám phá (`BG_OST_QUANTITY = 9` trong `index.html`) | im lặng |
| `assets/audio/combat_ost` → `ost1.mp3` … `ost8.mp3` | nhạc chiến đấu (`COMBAT_OST_QUANTITY = 8`) | im lặng |

Thêm/bớt file nhạc: sửa đúng con số tương ứng trong `index.html`.

## Kiểm thử

Bộ test Playwright trong `tools/tests` (chỉ dùng để test, game không nạp gì từ đó):

```bash
cd tools/tests
npm install && npx playwright install chromium   # lần đầu
npm test                    # toàn bộ 42 file, lần lượt (~2–3 giờ trên máy chậm dùng software renderer)
npm run test:m7             # nhóm M7 (mobile), tương tự test:core / test:m1 / test:m2 / test:m4 / test:m8
node m8/rc1-journey.js      # 1 file bất kỳ
```

Chi tiết từng file: `tools/tests/README.md`.

## Tài liệu

| File | Nội dung |
|---|---|
| `CHANGELOG.md` | Alpha v1.0 có gì (Added / Improved / Fixed / Known Issues / Deferred) |
| `ALPHA_BASELINE.md` | Alpha v1.0 là gì, hệ thống chính, điểm nối, chỗ dễ vỡ, test, việc để sau — điểm xuất phát cho giai đoạn tiếp |
| `ALPHA_KNOWN_ISSUES.md` | Sổ lỗi còn mở (mức P0–P3, có chặn Alpha không, milestone gợi ý) + lịch sử lỗi đã sửa |
| `ALPHA_ROADMAP.md` | Trạng thái từng hệ thống, phạm vi Alpha đã chốt, việc để sau |
| `ALPHA_ARCHITECTURE.md` | Kiến trúc chi tiết (thứ tự script, dữ liệu, luồng) |
| `ALPHA_TECH_DEBT.md` | Nợ kỹ thuật |
