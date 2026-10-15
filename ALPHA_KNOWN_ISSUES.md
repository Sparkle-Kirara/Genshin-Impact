# ALPHA_KNOWN_ISSUES — sổ lỗi Alpha v1.0

_Cập nhật: 2026-09-30 · chốt Alpha v1.0 (M7 Mobile Optimization, M8 Alpha RC1, M9 Finalization — GI-ALPHA-M7-M9).
Trước đó: M4–M6, M2/M3, M1 Stabilization, M0.1._

Mã `BUG-xx` là mã trong báo cáo audit M0; `KI-xxx` là mã của file này. Test tương ứng nằm trong `tools/tests/`
(xem README ở đó). Sổ này ghi cả lỗi còn mở lẫn lỗi đã sửa — không xoá lỗi chưa giải quyết.

**Mức độ (từ M8, theo quy trình phân loại RC1)**

| Mức | Nghĩa | Với bản phát hành |
|---|---|---|
| **P0** Blocker | Không thể bắt đầu, chơi, hoàn thành hoặc lưu an toàn vòng chơi Alpha | Phải sửa trước khi phát hành |
| **P1** Critical | Hỏng tính năng lớn, lỗi tiến trình nghiêm trọng, hỏng save, input hỏng nặng | Phải sửa, trừ khi được duyệt hoãn |
| **P2** Major | Lỗi quan trọng ảnh hưởng chất lượng nhưng không chặn vòng chơi | Sửa khi hợp lý |
| **P3** Minor | Thẩm mỹ hoặc ảnh hưởng thấp | Có thể để sau |
| Thiết kế | Không phải lỗi: giới hạn đã chốt, ghi lại để không báo nhầm | — |

Các bảng lịch sử trước M7 giữ thang cũ: Blocker ≈ P0, High ≈ P1, Medium ≈ P2, Low ≈ P3, Info = Thiết kế.
**Bằng chứng**: `RT` tái hiện bằng test runtime · `CODE` xác nhận khi đọc code · `SUS` nghi ngờ, chưa tái hiện.
**Milestone gợi ý**: nhóm việc sau Alpha `PA-1`…`PA-8`, định nghĩa ở `ALPHA_ROADMAP.md` › "Sau Alpha v1.0".

## Tổng hợp khi chốt Alpha v1.0

| Mức | Đang mở | Đã sửa trong M7–M9 |
|---|---|---|
| P0 | **0** | 0 |
| P1 | **0** | 2 (KI-316, KI-340) |
| P2 | 6 | 14 (gồm KI-339 — lỗi do chính M7 gây ra, lượt hồi quy toàn bộ trước khi chốt bắt được) |
| P3 | 21 | 13 (gồm KI-337, KI-338 — cũng do M7 gây ra, lượt hồi quy toàn bộ trước khi chốt bắt được) |

Không lỗi nào đang mở chặn Alpha v1.0. Rủi ro lớn nhất còn lại là **KI-328**: chưa chơi thử trên thiết bị thật
(mọi kiểm thử cảm ứng / bố cục / hiệu năng chạy trên Chromium headless, cảm ứng thật qua CDP, GPU giả lập SwiftShader).

## Đang mở

| ID | Mức | Khu vực | Tái hiện (tóm tắt) | Trạng thái | Chặn Alpha? | Milestone gợi ý |
|---|---|---|---|---|---|---|
| KI-328 | P2 | Nền tảng / kiểm thử | Chưa chạy trên điện thoại / máy tính bảng thật (Android Chrome, iOS Safari). FPS, nhiệt, bộ nhớ, pin, cảm giác joystick và nút chưa đo; mọi số đo hiện có lấy từ Chromium headless + SwiftShader (1–5 fps trên CPU). | Mở — không kiểm được trong môi trường này | Không (rủi ro chính, ghi rõ trong bản phát hành) | PA-1 |
| KI-327 | P2 | Build / phát hành | `index.html` dùng Tailwind **Play CDN** (biên dịch CSS trong trình duyệt lúc chạy, chặn hiển thị ban đầu, không dành cho production); Three.js r128, Font Awesome, Google Fonts cũng từ CDN → cần mạng, không chơi offline được. Tái hiện: chặn `cdn.tailwindcss.com` → HUD / menu mất style. | Mở | Không (chạy đúng khi có mạng) | PA-2 |
| KI-106 | P2 | Party / combat | Nhân vật active hết HP là thua (màn hình gục) dù 3 thành viên khác còn HP; không tự đổi người, không có "party wipe". | Mở — cần chốt quy tắc | Không | PA-3 |
| KI-201 | P2 | World / save | Vật phẩm nhặt tự nhiên (nấm, táo, hoa…) không lưu trạng thái "đã nhặt": tải lại trang là nhặt lại được ngay. | Mở (CODE) | Không | PA-5 |
| KI-302 | P2 | UI / Paimon Menu | Màn Character đọc `CHARACTER_DATA` tĩnh (luôn Traveler/Hydro) thay vì nhân vật đang active (gồm KI-114, TD-12). Màn Party dùng đúng dữ liệu runtime. | Mở (CODE) | Không | PA-4 |
| KI-126 | P2 | Cân bằng | Số liệu là placeholder chưa playtest: đòn thường Traveler ~4 damage/hit (Cự Thạch Búa ~45 đòn thường). **RC1 (M8)**: Energy chỉ đến từ hạt của Skill trúng đích, đo 0.7 Energy/s (Traveler, Skill mỗi lần hồi) → Burst đầu tiên cần ~50–70 s giao chiến, trong khi trận Thử Thách chỉ ~35–40 s: người chơi mới thường xong vòng Alpha mà chưa đầy Burst nếu không đánh ở chỗ khác trước (`m8/rc1-journey.js` S13). | Mở — chờ playtest người thật | Không | PA-7 |
| KI-303 | P3 | UI | (Phần phiên bản đã sửa ở M9.) Còn dữ liệu giả trong menu / màn tiêu đề: "Adventure Rank 42 Required", Lv.42 / WL5 / UID, ping 24 ms, server "Asia". | Mở (CODE) | Không | PA-4 |
| KI-304 | P3 | Flow / tải | Thanh loading là giả lập (2 % / 80 ms), sau đó `startGameplay()` dựng scene đồng bộ. Đo (SwiftShader): `startGameplay` 1.3–1.7 s, khung hình đầu 4.0–6.1 s → màn hình đứng hình khi vào game. | Mở (RT, số đo M7) | Không | PA-4 |
| KI-311 | P3 | UI | Overlay danh sách nhiệm vụ Bảng không pause game; WASD vẫn chạy phía sau. | Mở (SUS) | Không | PA-4 |
| KI-312 | P3 | Flow | Không có Restart; nút `#btn-restart-prototype` là code chết. | Mở (CODE) | Không | PA-4 |
| KI-105 | P3 | Combat | Trong hitstop, `actualDt` lấy `getDelta()` lần 2 ≈ 0 → cooldown / timer đứng yên trong hitstop. | Mở (CODE) | Không | PA-3 |
| KI-109 | P3 | Combat #4 | Quái nặng có thể lọt khỏi cửa sổ hit của Vortex. | Mở (RT báo cáo #4) | Không | PA-3 |
| KI-110 | P3 | VFX | `isHydro=true` được truyền cho vùng lửa #2 và cú lao (plunge) → flash màu cyan sai nguyên tố (gốc: TD-04). | Mở (CODE) | Không | PA-3 |
| KI-112 | P3 | Party | Nhân vật ở bench không hồi cooldown / Tailwind cho tới khi vào đội lại. | Mở (CODE) | Không | PA-3 |
| KI-107 | P3 | Quái | Quái không va chạm nhau; Slime không tìm đường → có thể kẹt sau tường. | Mở (CODE/SUS) | Không | PA-6 |
| KI-108 | P3 | Quái | Góc xoay Slime không wrap → có thể xoay "vòng dài". | Mở (CODE/SUS) | Không | PA-6 |
| KI-124 | P3 | Quái | Quái tầm xa không kiểm tra tầm nhìn: ngắm xuyên đá; đạn chạm đá bị huỷ (không gây damage). | Mở (CODE) | Không | PA-6 |
| KI-118 | P3 | Nội dung | Vũ khí #5 / #6 là khối procedural; chưa có chân dung nhân vật (chữ cái + màu nguyên tố). | Mở | Không | PA-8 |
| KI-202 | P3 | Nhiệm vụ Bảng | Mục `turned_in` không bao giờ bị xoá khỏi `activeQuests` / save (tăng dần, nhỏ). | Mở (CODE) | Không | PA-5 |
| KI-203 | P3 | Dữ liệu | `gather_mushroom_8` / `gather_apple_8` có `targetCount: 10`; comment "2 phút" nhưng respawn 90 s. | Mở (CODE) | Không | PA-5 |
| KI-205 | P3 | World | (Biên map đã có từ M4.) Cây / đá trang trí, cột đèn lồng, NPC không có collision (đi xuyên qua). | Mở (CODE) | Không | PA-5 |
| KI-208 | P3 | Save | Người chơi mới với save hỏng: popup nhập tên ghi save v2 mới ngay khi Xác nhận; bản gốc đã được sao lưu trước đó (sao lưu thất bại thì chặn ghi) → không mất dữ liệu, nhưng ô chính không còn bản gốc. | Mở (RT `save-v2.js` S6) | Không | PA-5 |
| KI-210 | P3 | Encounter | Trận đang đánh dở không được lưu (xem KI-123): tải lại giữa trận → nhiệm vụ vẫn ở bước "Hạ toàn bộ quái…", đánh lại từ đầu; không mất tiến trình, không nhận thưởng 2 lần (`m8/interruptions.js`). | Mở — hành vi đã chốt | Không | PA-5 |
| KI-329 | P3 | Asset | Thư mục `assets/` (5 video Opening, nhạc nền `background.mp3`, nhạc `bg_ost` / `combat_ost`, favicon) không nằm trong repository → các request 404, game dùng dự phòng (Opening vẽ canvas, nhạc tổng hợp / im lặng). Bản phát hành phải kèm thư mục này (`README.md`). | Mở | Không | PA-2 |
| KI-330 | P3 | Hiệu năng | 5 canvas toàn màn hình của Opening vẫn được resize ở mỗi lần đổi kích thước cửa sổ trong lúc chơi (xoay máy). | Mở (CODE) | Không | PA-1 |
| KI-331 | P3 | Kiểm thử | Bộ test đầy đủ chạy ~2,5 giờ trên SwiftShader (lượt cuối: 2 giờ 16 phút); vài test combat cũ đợi theo thời gian thực (`c56test.js` — có `TEST_WAIT_FACTOR`; `regress.js`) → chập chờn khi CPU bận: ở M9, `regress.js` báo #2 đòn thường 0 damage khi chạy song song một trình duyệt khác, PASS khi chạy một mình. Chạy bộ test một mình trên máy. Hành trình RC1 dùng vị trí đặt sẵn cạnh quái và hồi HP khi < 30 % (ghi rõ trong test). | Mở | Không | PA-1 |
| KI-341 | P3 | UI / cảm ứng | Chữ trên nút tương tác luôn là "Nhấn F để …" (vd. "Nhấn F để nói chuyện với Trinh sát Arin") kể cả trên điện thoại — không có phím F; nút vẫn chạm được, chỉ sai lời nhắc. Chữ lấy thẳng từ từng vật tương tác (`promptText`), `updateInteractPrompt` (ui.js) không đổi theo thiết bị. Thấy khi xem ảnh chụp bố cục M9. | Mở (CODE, ảnh chụp) | Không | PA-4 |

## Đã sửa (M7–M9)

Cột Test là test chứng minh bản sửa (chạy trên Alpha v1.0: PASS). Các test `m7/` cũng đã chạy trên bản M4–M6 trước khi
sửa: `mobile-input` 7/26, `mobile-layout` 22/66 (L9/L10 thêm sau), `lifecycle` 4/6, `perf-mobile` 3/11 PASS — chi tiết từng
mục trong báo cáo M7–M9. Cảm ứng trong test là TouchEvent thật của Chromium qua CDP `Input.dispatchTouchEvent`
(không gọi thẳng hàm xử lý).

| ID | Mức | Khu vực | Vấn đề (trước M7) | Sửa | Test |
|---|---|---|---|---|---|
| KI-316 | P1 | Input cảm ứng / party | Chạm slot đổi nhân vật bằng ngón thứ 2 (ngón 1 đang giữ joystick hoặc nút) không có tác dụng: slot chỉ nghe `click`, mà Chromium không sinh `click` cho ngón thứ 2 → không đổi người được khi đang di chuyển. | `ui.js` slot party nghe thêm `touchstart` (1 chạm = 1 lần đổi, không sinh click trùng). | `m7/mobile-input.js` I1, I2 |
| KI-340 | P1 | Opening / input PC | **Có từ trước (tái hiện trên bản M4–M6), phát hiện ở M8 bằng hành trình RC1 trên PC**: người chơi mới gõ tên, bấm chuột "Xác nhận" (nút giữ focus) rồi nhấn Enter ở màn Start → Enter vừa bắt đầu Door Intro vừa kích hoạt lại nút Xác nhận đang focus → lớp Start hiện lại đè Door Intro; mỗi lần Enter sau đó chạy lại Door Intro từ đầu — kẹt vòng lặp nếu chỉ dùng bàn phím (chuột thoát được sau ~10 s). | `opening.js`: nút Xác nhận bỏ qua khi popup đã đóng và tự bỏ focus; 2 phím Enter của Opening `preventDefault()` để không kích hoạt thêm nút đang focus. | `m8/rc1-journey.js` bản PC (S2 nay đòi vào được gameplay); probe: bản M4–M6 kẹt ở Door Intro 150 s, bản sửa vào gameplay sau 33 s |
| KI-315 | P2 | Bố cục HUD điện thoại | Vùng joystick che 1/3 phải slot 2–4, nút Đi bộ che slot 1–2 ở mọi cỡ màn ngang; màn cao ≤ 328 px: slot 4 ra ngoài màn hình; 568×320: nút Burst che số HP; màn dọc: Attack / Burst che thanh HP. | CSS M7: joystick nghỉ và nút Đi bộ dời sang phải cột nhân vật (`left: 84px`); slot co theo chiều cao (56 → 52 → 46 → 40 px); thanh HP co theo bề rộng, màn dọc đặt trên cụm nút. | `m7/mobile-layout.js` L1, L2, L4 (11 cỡ) |
| KI-111 / BUG-16 | P2 | Combat #2 / party | Đổi nhân vật khi #2 đang ngắm: trạng thái ngắm đi theo sang nhân vật mới, thả tay bắn mũi tên tính cho nhân vật mới. | `performCharacterSwap` huỷ Aim Mode qua `cancelAimModeInput('switch')` (tách từ `cancelHeldCombatInput`), đúng thiết kế đã chốt ở M1. | `m7/mobile-input.js` I3, I4; `c2b.js` (siết điều kiện) |
| KI-117 / BUG-17 | P2 | Input cảm ứng | `touchcancel` (cuộc gọi đến, cử chỉ hệ thống) bị xử lý như thả tay: Violet Arc #6 phóng, Counter #5 chém, #1 bắn; trên nút Attack ra đòn thường / Charged, #2 bắn tên. | `touchcancel` → `cancelHeldCombatInput('touchcancel')`: huỷ, không ra đòn, không tính cooldown. | `m7/mobile-input.js` I5a–c, I6a–b; `c56mobile.js` |
| KI-334 | P2 | Input cảm ứng | 2 ngón cùng đặt trên nút Attack / Skill: cả hai gọi "nhấn"; ngón nhấc trước kết thúc lượt giữ của ngón kia. | "1 nút = 1 ngón": nút ghi ngón sở hữu, chỉ ngón đó kết thúc. | `m7/mobile-input.js` I8 |
| KI-335 | P2 | Input cảm ứng | Ngón mất sự kiện kết thúc giữ joystick mãi (nhân vật tự chạy 9 m/s, ngón mới bị bỏ qua); nút Attack / Skill thoát sớm khi pause / đuối nước TRƯỚC khi xoá ngón → ngón "treo" sau khi mở Paimon Menu. | `releaseStaleTouches()` đối chiếu `e.touches` ở mỗi lần chạm (capture) → nhả ngón treo, huỷ đòn đang giữ; xoá ngón trước các điều kiện thoát. | `m7/mobile-input.js` I9, I11 |
| KI-317 | P2 | Input PC | Giữ Attack (đang nạp) khi hội thoại mở: nhả chuột trong hội thoại bị bỏ qua → đóng hội thoại xong Charged Attack tự ra. | `openDialogue` gọi `cancelHeldCombatInput('dialogue')`. | `m7/mobile-input.js` I13a |
| KI-318 | P2 | Input PC | Giữ W lúc nhân vật gục: nhả phím trên màn hình gục bị bỏ qua → hồi sinh xong nhân vật tự chạy. | Nhả phím di chuyển được xử lý trước điều kiện pause / hội thoại / gục; `enterDeadState` huỷ thao tác đang giữ. | `m7/mobile-input.js` I13b |
| KI-319 | P2 | Input / trình duyệt | `requestPointerLock()` trả về `undefined` (Firefox, Safari cũ) → `.catch` gây TypeError, đóng Paimon Menu không hiện lại nút HUD. | `requestGamePointerLock()` (try/catch, chỉ `.catch` khi là Promise) ở mọi chỗ gọi. | `m7/mobile-input.js` I14 (giả lập) |
| KI-301 | P2 | Input | Laptop màn cảm ứng bị coi là điện thoại (có touch = mobile): HUD cảm ứng, chuột không đánh, không mouse-look. | `detectTouchPrimaryDevice()` chọn theo con trỏ chính (`pointer: coarse`). | `m7/mobile-input.js` I15a–c |
| KI-307 | P2 | Bố cục di động | Không có `viewport-fit=cover` / vùng an toàn: HUD, joystick, Paimon Menu, hội thoại, màn tiêu đề nằm dưới tai thỏ / thanh home. | `viewport-fit=cover` + biến `--safe-*` (env) cho các lớp đó. | `m7/mobile-layout.js` L7a–f (giả lập CDP) |
| KI-324 | P2 | Paimon Menu di động | Nút Thoát (về màn tiêu đề) bị ép còn 0 px ở màn cao ≤ 340 px — không thoát được từ menu. | Nút giữ kích thước; khoảng cách dải tiện ích co theo chiều cao. | `m7/mobile-layout.js` L10 |
| KI-320 | P2 | Vòng đời | Video Opening (video nền Title lặp vô hạn) tiếp tục phát sau khi vào gameplay. | `stopOpeningMedia()` khi vào / trở lại gameplay. | `m7/lifecycle.js` V1b, V1c |
| KI-321 (TD-22) | P2 | Hiệu năng | HUD ghi DOM ~20 lần mỗi khung hình kể cả khi đứng yên → 1 style recalc + 1 layout / khung, ~10 text node rác / khung. | HUD chỉ ghi khi giá trị đổi (`hudText` / `hudToggle` / `hudStyle`). Đứng yên: 20 → 0 ghi / khung. | `m7/perf-mobile.js` P1–P3 |
| KI-309 | P3 | Bố cục di động | Túi đồ / Nhân vật 40 px, Đi bộ 62×24 px; chữ nút Burst 7 px. | Vùng chạm ≥ 44 px (hình nhìn thấy giữ nguyên); chữ Burst 9 / 8 px. | `m7/mobile-layout.js` L3, L5 |
| KI-323 | P3 | Bố cục di động | Nút Hồi sinh vô hình (`pointer-events-auto` trong màn hình gục đang ẩn, z 50) vẫn nhận chạm / click ở giữa-dưới màn hình (không hồi sinh khi còn sống, nhưng nuốt chạm). Lộ ra khi bố cục M7 đặt điều khiển màn dọc vào vùng đó. | Nút không nhận chạm khi màn hình gục ẩn (CSS). | `m7/mobile-layout.js` L2 (390×844) |
| KI-313 | P3 | Bố cục di động | Thông báo phần thưởng (trái, 1/3 chiều cao) đè cột nhân vật / joystick. | M7: trên cảm ứng xếp ngay dưới quest tracker. M9: test L9 mới cho thấy ở màn cao ≤ 390 px chồng thông báo vẫn đè nút Đi bộ / chỗ nghỉ joystick (6/9 cỡ) → dời sang phải các nút đó khi cùng dải dọc. (Thông báo không nhận chạm, tự tắt sau 2 s.) | `m7/mobile-layout.js` L9 |
| KI-336 | P3 | Input cảm ứng / hội thoại | Chạm vùng 3D khi hội thoại đang mở vẫn bật joystick / xoay camera phía sau. | Chạm toàn cục bị bỏ qua khi hội thoại mở (hội thoại vẫn nhận chạm). | `m7/mobile-input.js` I12 |
| KI-322 | P3 | Hiệu năng | ~20 hiệu ứng CSS của Paimon Menu vẫn chạy khi menu đang đóng. | Tạm dừng khi menu đóng (`animation-play-state`). | `m7/perf-mobile.js` P4 |
| KI-326 | P3 | Console | `preventDefault()` trên `touchcancel` không huỷ được → lỗi console trên Chrome. | Chỉ gọi khi `e.cancelable`. | `m7/mobile-input.js` I-B |
| KI-306 | P3 | Âm thanh | Danh sách nhạc lặp `<= quantity + 1` → mỗi thư mục có 1 file không tồn tại (~10 % lần chọn bài là im lặng + 404). | Lặp `<= quantity`. | `m8/build-check.js` B2 |
| KI-325 | P3 | Save / console | Mỗi ván mới in cảnh báo "đội hình đã lưu có mục không hợp lệ" dù không có lỗi. | Chỉ nạp đội hình khi save có dữ liệu party. | `m7/lifecycle.js` V1, `m8/build-check.js` B3 |
| KI-310 | P3 | Build | Eruda (debug console) luôn nạp từ CDN và `init()`; markup thừa sau `</html>` làm trang cuộn được 9–13 px. | Eruda chỉ nạp với `?debug=1` (nhớ lại, tắt bằng `?debug=0`); xoá markup thừa; `overscroll-behavior: none`. | `m8/build-check.js` B5, B7; `m7/mobile-layout.js` L6 |
| KI-303 (phần phiên bản) | P3 | UI | Màn tiêu đề hiện "Ver. 4.8_LIVE" giả. | "Alpha v1.0", khớp `<title>`, Paimon Menu, file `VERSION`. | `m8/build-check.js` B7 |
| KI-333 | P3 | Build | Favicon khai báo sai kiểu MIME (`type="png"`). | `type="image/png"`. | `m8/build-check.js` B1a (đọc đường dẫn) |
| KI-337 | P3 | Bố cục di động / độ bền | **Lỗi do chính M7 tạo ra, chưa từng có trong bản phát hành nào**: vùng chạm mở rộng của nút Đi bộ (`::before`) dựa vào lớp Tailwind `absolute` của nút — khi Tailwind không nạp được (CDN bị chặn / offline, xem KI-327; hoặc stub trong test) vùng chạm phủ cả màn hình, mọi cú chạm / click đều bật-tắt Đi bộ. Phát hiện ở lượt hồi quy toàn bộ lần 2 (`menutest.js` T16). | `#mobile-walk-toggle { position: absolute; }` trong khối M7 của style.css (trùng lớp Tailwind, bố cục thật không đổi). | `menutest.js` T16; probe không Tailwind (mọi điểm chạm trúng nút Đi bộ → trúng canvas như bản M4–M6) |
| KI-339 | P2 | Bố cục di động / input | **Lỗi do chính M7 tạo ra, chưa từng có trong bản phát hành nào**: M7 dời nút Đi bộ + chỗ nghỉ joystick sang x 84–214 (để khỏi đè cột nhân vật) nhưng (a) ở màn ngang hẹp < 736 px (667×375, 640×360, 568×320) nút tương tác F ở giữa-dưới đè lên chỗ nghỉ joystick — chạm mép trái nút đó là tương tác thay vì di chuyển; (b) tracker có 3 nhiệm vụ (cao ~180 px) xuống tới nút Đi bộ (844×390, 667×375) hoặc chỗ nghỉ joystick (568×320). Phát hiện ở lượt hồi quy toàn bộ lần 4 (`m4/ui-layout.js` U3, U4). | Nút tương tác (màn ngang < 736 px hoặc thấp ≤ 360 px): đặt trong dải giữa cột joystick (x ≥ 222 px) và nút Burst (cách mép phải 184 px), ngay trên thanh HP; chữ dài cắt "…". Cách sửa đầu tiên (nâng nút lên trên joystick) lại đè tracker 3 nhiệm vụ ở 667×375 — U3 chạy lại bắt được, đã bỏ; probe sau đó cho thấy ở màn cao ≤ 360 px tracker 3 nhiệm vụ chạm cả vị trí cũ của nút (568×320: 42 px, 640/740/800×360: 4 px) nên nút được hạ xuống sát thanh HP. Màn dọc: nút đặt trên thanh HP (trước đó nút đè joystick / Skill). Tracker: `layoutQuestTracker` bước sang phải cột Đi bộ/joystick hoặc dừng trước nút bên phải nếu sẽ đè (chỉ khi vẽ lại). | `m4/ui-layout.js` U3, U4; `m7/mobile-layout.js` L11, L12 (mới, 9 cỡ màn; L12 kiểm cả tracker 3 nhiệm vụ với nút tương tác hiện cùng lúc) |
| KI-338 | P3 | Bố cục di động | **Lỗi do chính M7 tạo ra, chưa từng có trong bản phát hành nào**: quy tắc vùng an toàn `html #encounter-hud { top: … }` ghi đè cả 3 mức `top` riêng của khung Thử Thách (12 / 8 / 62 px theo cỡ màn) → ở màn dọc ≤ 560 px khung lên sát mép trên, đè nút Túi đồ. Phát hiện ở lượt hồi quy toàn bộ lần 4 (`m2/encounter-ui.js` U3, 390×844). | Giữ đủ 3 mức gốc, mỗi mức cộng `--safe-top`. | `m2/encounter-ui.js` U3 (chạy lại sau khi sửa) |

## Lịch sử đã sửa trước M7 (thang mức cũ)

### M4–M6

| ID | Mức | Vấn đề (trước M4) | Sửa | Test (`tools/tests/m4/`) |
|---|---|---|---|---|
| KI-122 | Medium | Mặt đất HIỂN THỊ lật trục Z so với mặt đất va chạm (`getTerrainHeight(vx, vy)` cho đỉnh nằm ở z = −vy): đồi/lòng hồ hiện ở vị trí đối xứng, người/quái/đồ vật trông lún hoặc lơ lửng. | 04: `getTerrainHeight(vx, −vy)` (1 dòng). Mặt nước, camp, props vốn đặt theo độ cao logic → giờ khớp hình. | `world.js` W10: raycast mesh vs `getTerrainHeight` ở 144 điểm, lệch tối đa 0.094 m (cách lật cũ: 2.72 m) |
| KI-125 | Medium | Slime của camp lang thang ngẫu nhiên khắp map, tới cả spawn/đấu trường thử thách (probe build M2/M3: sau 60 s đứng yên, Slime xa camp tới 49.65 m ngoài bán kính camp; 1 con cách spawn 1.2 m). | enemies.js: khi lang thang idle, Slime ở ngoài `spawnRadius + 1.5 m` quay về hướng tâm camp (±0.3 rad). Không đổi phát hiện/đuổi/tấn công. | `slime-leash.js` (probe cùng kịch bản: xa nhất 2.0 m ngoài bán kính sau 60 s); L2 đuổi người chơi vẫn chạy |
| KI-205 (phần biên) | Medium | Không có ranh giới map: đi ra mép ±50 là rơi rồi teleport về spawn. | 16: người chơi bị giữ trong ±47 + nhắc "Phía trước là vực sâu — hãy quay lại." (tối đa 1 lần/5 s). Phần "cây/đá không collision" vẫn mở. | `world.js` W2 (đi vào 4 mép, vị trí ngoài biên kéo về) |
| KI-308 | Low | Mobile: quest tracker (`top-1/3 left-4`) chồng cột đổi nhân vật / nút Đi bộ / joystick — nay tracker hiện ngay từ đầu game (nhiệm vụ chính) nên sẽ luôn chồng. | ui.js `layoutQuestTracker()`: cảm ứng → tracker lên hàng trên, bên phải nút Paimon + cột nhân vật; ẩn tạm khi thẻ Thử Thách chiếm hàng trên. Desktop: toast phần thưởng dời xuống dưới tracker. | `ui-layout.js` U1/U3 (Tailwind thật, 844×390 + 667×375) |
| KI-007 (mở rộng) | Medium | Save phiên bản khác bị sao lưu rồi GHI ĐÈ bằng hành trình mới — kể cả save của phiên bản MỚI HƠN. | Save v2 (06): phiên bản mới hơn → không đọc, KHÔNG ghi đè, hỏi người chơi (chơi tiếp không lưu / ghi đè). Save hỏng mà sao lưu thất bại → cũng chặn ghi. | `save-v2.js` S6/S7 |
| TD-09 | — | Save không có migration: đổi version = mất save. | Save v2: `SaveSchema.parse → migrate (v1→v2) → sanitize`; v1 được nâng cấp khi đọc, bản gốc sao lưu `…_v1_backup`. | `save-v2.js` S3; từ M8 thêm `m8/existing-saves.js` (save thật của build M2–M3 và M4–M6) |

### M1 Stabilization

Mỗi mục có 1 test tái hiện: FAIL trên build trước M1, PASS sau M1.

| ID | Mức | Vấn đề (trước M1) | Sửa | Test (`tools/tests/m1/`) |
|---|---|---|---|---|
| BUG-01 | High | Tên người chơi bị thay bằng tên nhân vật sau lần đổi nhân vật đầu tiên; save ghi tên nhân vật. | Tên người chơi nằm ở field riêng `player.playerName` (chỉ `setCharacterName()` ghi); `CHARACTER_DATA.name` chỉ là tên nhân vật active. Save v1 giữ key `player.characterName` nhưng chứa tên người chơi; save cũ đã bị ghi tên nhân vật (trùng tên trong roster) nạp tên mặc định `Traveler` + cảnh báo console. | `bug01-player-name.js` |
| BUG-02 / KI-104 | Medium | `dt` thô cho enemy/effect/camp/cooldown (chỉ physics người chơi kẹp 0.1) → sau khi đổi tab timer nhảy, field biến mất, quái "dịch chuyển". | 1 dt duy nhất kẹp `MAX_FRAME_DELTA = 0.1` ngay đầu `animate()`; bỏ kẹp riêng trong `updatePhysics()`. | `bug02-frame-delta.js` |
| BUG-03 | Medium | Burst #2 (Pyro zone): state kết thúc nhưng mesh vùng quạt ở lại scene, mỗi lần Burst thêm 1 mesh. | `updatePyroBurstZoneEffect()` gọi `cleanupEffect(fx)` khi hết duration. | `bug03-burst-mesh-cleanup.js` |
| BUG-04 / KI-101 | Medium | Slime bị bẹp vĩnh viễn sau đòn Hydro. | `Slime.restMeshScale` chụp lúc tạo; `update()` giữ dáng bẹp trong `hydroSquashTimer` rồi trả về đúng scale gốc. | `bug04-slime-squash.js` |
| BUG-05 / KI-102 | Medium | Water Bubble (#1) không kéo được slime (ghi vào `velocity.x/z` mà slime không dùng; velocity cộng dồn rác). | Quái nhỏ trong vùng hút dùng `applyControlledPull()` của #4: 3 m/s (`pull.smallEnemyForce`), dừng ở mép bóng (`radius` 1 m), không ghi velocity. Quái lớn giữ logic làm chậm cũ (xem KI-120). | `bug05-water-bubble-pull.js` |
| BUG-07 / KI-305 | Low | Vẫn render gameplay khi Pause và khi đã về Title. | `animate()` không gọi `renderer.render` khi `isGamePaused`; resize lúc pause vẽ lại đúng 1 frame. Resume / Start again render lại bình thường. | `bug07-render-pause-title.js` |
| BUG-08 | Medium | Mất focus (blur) chỉ xoá phím di chuyển: Attack đang giữ vẫn charge và tự ra Charged Attack; Aim/Held Skill kẹt rồi tự bắn. Cùng lỗi khi mở Paimon Menu lúc đang giữ Attack. | `cancelHeldCombatInput()` (combat.js) + `releaseTouchInputState()` (ui.js) gọi khi blur, khi tab ẩn, và khi mở Paimon Menu. (M7 mở rộng: hội thoại, gục, `touchcancel`, đổi người — KI-317/318/117/111.) | `bug08-input-blur.js` |
| BUG-11 / KI-204 | Low | 361 khối chữ "WELCOME TO / GENSHIN IMPACT :)" ngoài map nằm trong `obstacles` (duyệt mỗi frame). | Tách `DECORATIVE_TEXT_WALL_CONFIGS`: vẫn dựng mesh (hình ảnh không đổi) nhưng không có AABB. `obstacles` 378 → 17. | `bug11-decorative-obstacles.js` |
| BUG-12 / KI-206 | Low | Dọn slime chỉ dispose geometry thân + material đang gắn + material thanh máu → rò mắt và 2/3 material thân. | `Slime.dispose()` giải phóng đúng danh sách tài nguyên chụp lúc tạo; dùng ở cả 2 nơi xoá slime. | `bug12-slime-disposal.js` |
| BUG-14 / KI-103 | Low | Va chạm dummy (ATK 0 → 0 damage) vẫn cho i-frame, đẩy lùi, số "0", rung. | Va chạm có damage ≤ 0 bị bỏ qua; damage > 0 giữ nguyên phản hồi. | `bug14-zero-damage-contact.js` |

### M0.1 Loop Integrity, hotfix Burst, Task 74821 Party

| ID | Mức | Vấn đề | Bằng chứng |
|---|---|---|---|
| KI-001 | High | Level/EXP của nhân vật **đang active** không được lưu → reload về Lv.1/0 EXP. Khi khôi phục active ≠ slot 0, slot 0 bị ghi đè Lv.1. | RT: build cũ Lv.4→Lv.1 sau reload; build mới giữ Lv.4/75 EXP |
| KI-002 | Blocker | Quest Board: `questInstanceCounter` reset mỗi lần tải trang → sinh lại instanceId đã có (`turned_in`) → slot Combat kẹt vĩnh viễn "Đang thực hiện" (bị lưu vào save). | RT: build cũ kẹt ở vòng 2; build mới 4 vòng + reload OK; save đã kẹt được tự sửa khi load |
| KI-003 | High | Mỗi slime chết tạo 1 WorldItem hồi sinh vĩnh viễn (60s) → `interactables` phình mãi + farm vô hạn `slime_condensate`. | CODE + RT |
| KI-004 | High | Mở rương: thưởng phát ngay nhưng camp chỉ chuyển `respawning` sau 0.9s → autosave trong khoảng hở + reload = mở rương lần 2. | CODE; RT build mới |
| KI-005 | Medium | Reload khi camp đang hồi sinh dở → camp thiếu quái cả chu kỳ đó. | CODE; RT build mới: đủ composition |
| KI-006 | Medium | Load không kiểm tra dữ liệu: position NaN/null, inventory id lạ/số âm được nạp thẳng. | RT build mới: bị lọc |
| KI-007 | Medium | Save hỏng/sai version bị bỏ qua im lặng rồi bị autosave ghi đè (mất trắng). | RT build mới: bản thô được sao lưu vào `…_unreadable_backup` |
| KI-008 | Low | `Slime.takeDamage` không chặn khi đã chết → nhánh chết có thể chạy 2 lần (quest/loot/EXP). | CODE; RT build mới: hit thứ 2 bị bỏ qua |
| KI-009 | High | Burst của 1 nhân vật đang chạy chặn Burst của MỌI nhân vật khác. Nay chỉ chặn khi Burst của chính nhân vật active còn sống. | RT: build cũ 0/5 cặp, build mới 5/5 |
| KI-010 | High | Đổi nhân vật khi #3 đang vung Burst → Thunder State mở ra trên nhân vật MỚI. Nay chặn đổi trong lúc cast (~0.5s). | RT (Task 74821) |
| KI-011 | Medium | Đổi nhân vật giữa đòn thường → combo/timeline của nhân vật cũ chạy tiếp trên nhân vật mới. Nay huỷ đòn khi đổi. | RT (Task 74821) |
| ~~KI-116~~ | — | ~~Counter chỉ có 1 nguồn đòn hợp lệ.~~ Đã xử lý ở M2: mọi đòn quái M2 đi qua `applyEnemyAttackToPlayer` → `interceptIncomingAttack`. | RT `m2/enemy-archetypes.js` A7 |

## Thiết kế / giới hạn đã chốt (không phải lỗi)

| ID | Nội dung |
|---|---|
| KI-113 | Roster có 6 nhân vật, đội 4 người + bench; không có dữ liệu unlock/sở hữu (mọi nhân vật trong roster đều khả dụng). Chưa có ảnh chân dung. |
| KI-115 | #5 Claymore: nguyên tố 'Physical' placeholder (hạt năng lượng trung tính). Đổi = sửa element / vfxElement / energyGeneration.element. |
| KI-119 | #5 / #6 chưa có Passive (spec nhân vật không yêu cầu). |
| KI-120 | Water Bubble với quái LỚN: hệ số làm chậm trong data là `1` (không làm chậm); cách nhân theo frame phụ thuộc FPS. Cần chốt hệ số nếu muốn làm chậm. |
| KI-121 / BUG-13 | #1 Traveler giữ combo 4 đòn cho Alpha (entry 5 là dữ liệu dự phòng). |
| KI-123 | Encounter 1 wave, điều kiện `defeat_all`; trạng thái trận đang chạy không lưu (KI-210); cờ thưởng lần đầu có lưu. |
| KI-207 | Save v2 dùng ô `genshinFanGame_saveData_v1` (tên khoá cũ; phiên bản schema nằm trong field `version`). Mỗi loại sao lưu 1 ô (`…_unreadable_backup`, `…_v1_backup`); không có UI khôi phục (chỉ qua DevTools). |
| KI-209 | Nhiệm vụ chính: đúng 1 nhiệm vụ, 4 loại mục tiêu (reach / interact / encounter / talk), không bỏ nhiệm vụ, không lịch sử; nhiệm vụ Bảng là hệ riêng (TD-15). |
| KI-211 | Đỉnh Tháp Canh chỉ lên được bằng leo (tốn stamina); nhảy từ mái (~7.8 m) dưới ngưỡng sát thương rơi (9 m). |
| KI-314 | Mobile: quest tracker ẩn trong lúc thẻ Thử Thách hiện ở hàng trên (thẻ đó đã hiển thị mục tiêu). |
| — | Không có đảm bảo bảo mật phía máy chủ: game chạy hoàn toàn trên trình duyệt, save nằm ở `localStorage` và người chơi sửa được. Save được kiểm tra / làm sạch khi đọc để game không hỏng, không phải để chống gian lận. |

## Chưa kiểm được

- **Thiết bị thật** (KI-328): điện thoại / máy tính bảng Android và iOS, Safari (WebKit), Firefox. Hành vi `requestPointerLock()`
  của Firefox chỉ được giả lập (I14). Vùng an toàn tai thỏ chỉ được giả lập bằng CDP (L7).
- **Hiệu năng thật**: không có số FPS nào đại diện cho điện thoại — SwiftShader chạy 1–5 fps trên CPU. Từ M1 game kẹp dt
  0.1 s nên test ở FPS thấp vẫn đúng logic, nhưng cảm giác né đòn (telegraph 0.6 / 0.85 / 1.3 s) ở 60 fps trên cảm ứng
  thật chưa được người chơi thử.
- **Tailwind thật**: test bố cục dùng Tailwind v3.4.17 build sẵn từ class của game (`tools/tests/vendor/`), không phải
  Play CDN; Font Awesome / Google Fonts bị chặn trong test (icon không hiện trên ảnh chụp test).
- **Người chơi thật**: hành trình RC1 (`m8/rc1-journey.js`) chơi bằng input thật (joystick / chạm / phím / chuột), nhưng
  trong trận bot được đặt cạnh quái và hồi HP khi < 30 %; chưa có playtest người thật.
- **Âm thanh**: headless không nghe được; chỉ kiểm tra danh sách file (B2) và code.
