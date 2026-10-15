# CHANGELOG

Định dạng: mỗi bản ghi theo nhóm **Added / Improved / Fixed / Known Issues / Deferred**. Chỉ ghi thay đổi đã có trong
repository (kèm mã lỗi `KI-xxx` / `BUG-xx` trong `ALPHA_KNOWN_ISSUES.md` và test tương ứng trong `tools/tests/`).

## Chưa phát hành — M7 Performance, bước P0 (đo)

### Added

- **Bảng đo hiệu năng `?perf=1`** (`scripts/perf-hud.js`): FPS, thời gian khung + tóm tắt 10 s (p95, max, số
  khung trên 33 / 50 ms), ms CPU của logic và `renderer.render()` (không gồm thời gian GPU), draw call pass chính + pass bóng
  (r128 không tính pass bóng vào `renderer.info`, nên đếm riêng), tam giác, geometry / texture / shader, quái sống, VFX
  (các danh sách VFX dùng chung), pixel ratio / độ phân giải canvas, heap (chỉ Chrome). Chạy trong chính vòng `animate()`
  (không thêm vòng lặp), cập nhật chữ 2 lần/giây, không nhận chạm/chuột. Không có `?perf=1`: không tạo DOM, không cài
  hook. Chưa có tối ưu nào (P1+ chờ số đo trên máy thật). Test: `tools/tests/m7/perf-hud.js`.

## Alpha v1.0 — 2026-09-30

Bản chốt Alpha (milestone M7 Mobile Optimization + M8 Alpha RC1 + M9 Finalization) dựng trên các milestone trước:
Pre-Alpha v0.9 → M0.1 Loop Integrity → nhân vật #3/#4/#5/#6 → Party → M1 Stabilization → M2/M3 Enemy & Encounter →
M4–M6 World, Save v2, Quest. Phiên bản: file `VERSION`.

### Added

- **Vòng chơi Alpha hoàn chỉnh**: Opening/Title → thế giới → nhận nhiệm vụ chính "Ngọn Lửa Tháp Canh" (4 bước: tới Tháp
  Canh Cổ → đọc bia đá → hạ quái ở Bãi Đá Thử Thách → báo cáo) → thưởng 1 lần → lưu → tải lại → chơi tiếp (M4–M6).
- **6 nhân vật chơi được**: #1 Traveler (kiếm, Hydro), #2 Archer Test (cung, Aim Mode, Decoy), #3 Polearm Test (Thunder
  State), #4 Windstep (kéo Anemo, field Burst), #5 Ironwake (trọng kiếm, Counter Stance), #6 Veyla (pháp khí, Violet Arc
  giữ/chạm, Lightning Rose).
- **Party 4 người**: đổi nhân vật (phím 1–4 / chạm), HUD Party mobile + PC, Paimon Menu › Party, bench giữ nguyên tiến trình.
- **Khung quái M2**: 3 kiểu quái (cận chiến, tầm xa có đạn né được, hạng nặng), đường đòn quái → người chơi dùng chung
  (kể cả Counter #5). **Encounter M3**: cột sáng, 3 quái, thắng/thua/thử lại, thưởng lần đầu lưu save.
- **Vùng Alpha M4**: Trinh sát Arin, đèn lồng dẫn đường, Tháp Canh Cổ leo được, bia đá, rương thế giới, 5 vùng khám phá,
  biên khu vực chơi.
- **Save v2 (M5)**: schema v2 trên cùng ô lưu, tự nâng cấp save v1 (giữ bản gốc), kiểm tra từng phần dữ liệu, không ghi đè
  save của phiên bản mới hơn, báo lỗi ghi thật, không ghi lặp.
- **Nhiệm vụ M6**: tracker, dấu 3D, dấu !/? trên NPC, trang Nhiệm Vụ trong Paimon Menu.
- **M7**: hỗ trợ tai thỏ / camera đục lỗ (`viewport-fit=cover` + vùng an toàn cho HUD, menu, hội thoại, màn hình tiêu đề);
  cột đổi nhân vật co theo chiều cao màn hình; chọn bộ điều khiển theo con trỏ chính (laptop cảm ứng dùng chuột + phím).
- **M8/M9**: `README.md` (cách chạy, danh sách asset không có trong repo), `VERSION`, `CHANGELOG.md`, `ALPHA_BASELINE.md`;
  công cụ debug eruda chỉ nạp khi mở với `?debug=1`.
- **Bộ test** `tools/tests/` (Playwright, 42 file / 46 lượt chạy trong `run-all.js`): combat từng nhân vật, năng lượng, party, menu, lỗi M1, quái/encounter,
  thế giới/save/nhiệm vụ, và mới ở M7–M8: `m7/` (input cảm ứng thật nhiều ngón, bố cục 11 cỡ màn hình + giả lập tai thỏ,
  vòng đời tài nguyên, chi phí mỗi khung hình), `m8/` (hành trình RC1 từ trạng thái sạch trên điện thoại + PC, save từ
  bản cũ, gián đoạn, kiểm tra build).

### Improved

- **Input cảm ứng (M7)**: đổi nhân vật được cả khi ngón khác đang giữ joystick / nút (KI-316); mỗi nút Attack/Skill chỉ
  nhận 1 ngón (KI-334); ngón "treo" (mất sự kiện kết thúc) tự được nhả ở lần chạm kế tiếp (KI-335); chạm trong lúc hội
  thoại không mở joystick/camera (KI-336).
- **Bố cục HUD điện thoại (M7)**: không còn điều khiển chồng nhau ở mọi cỡ đã đo (568×320 → 915×412, màn dọc 390×844,
  máy tính bảng); vùng chạm Túi đồ / Nhân vật / Đi bộ ≥ 44 px (giữ nguyên kích thước nhìn thấy); chữ nút Burst 7 → 9/8 px;
  thanh HP không bị nút che số; nút Thoát trong Paimon Menu không còn bị ép mất ở màn thấp; trang không còn cuộn được.
- **Hiệu năng mỗi khung hình (M7, đo được)**: HUD chỉ ghi DOM khi giá trị đổi — lúc đứng yên 20 → 0 lần ghi DOM/khung,
  layout 1 → 0/khung, không còn ~10 text node rác/khung; ~20 hiệu ứng CSS trong Paimon Menu đang đóng được tạm dừng.
- **Vòng đời tài nguyên (M7)**: video Opening dừng khi vào gameplay (video nền Title lặp vô hạn từng chạy ngầm).
- Thế giới M4: mặt đất hiển thị khớp va chạm (KI-122), Slime camp không đi lang thang (KI-125).

### Fixed

- **M7–M9**:
  - KI-315 — vùng joystick / nút Đi bộ che 1/3 phải slot đổi nhân vật 2–4 trên mọi cỡ điện thoại ngang; slot 4 ra
    ngoài màn hình ở màn cao ≤ 328 px.
  - KI-316 — chạm slot đổi nhân vật không có tác dụng khi ngón khác đang giữ joystick (trình duyệt không sinh `click`).
  - KI-340 — PC: bấm chuột "Xác nhận" tên rồi nhấn Enter ở màn Start làm lớp Start hiện lại và mỗi lần Enter chạy lại Door
    Intro (kẹt vòng lặp nếu chỉ dùng bàn phím).
  - KI-111 / BUG-16 — đổi nhân vật khi #2 đang ngắm bắn mũi tên cho nhân vật mới → nay huỷ ngắm (thiết kế M1).
  - KI-117 / BUG-17 — `touchcancel` làm phóng Violet Arc (#6), chém Counter (#5), bắn Aim (#1) → nay là huỷ.
  - KI-317 — giữ Attack rồi mở hội thoại: đóng hội thoại xong Charged Attack tự bắn.
  - KI-318 — giữ W lúc nhân vật gục: hồi sinh xong tự chạy (phím thả trên màn hình tử vong bị bỏ qua).
  - KI-319 — `requestPointerLock()` trả về undefined (Firefox, Safari cũ) làm lỗi TypeError, đóng menu không hiện lại nút.
  - KI-301 — laptop màn cảm ứng bị dùng HUD điện thoại, không đánh được bằng chuột.
  - KI-307 — không có vùng an toàn tai thỏ / thanh home.
  - KI-309 — vùng chạm nhỏ; KI-310 — eruda luôn nạp + markup thừa sau `</html>`; KI-313 — thông báo phần thưởng đè cột
    nhân vật / joystick (điện thoại).
  - KI-320 — video nền Title tiếp tục phát sau khi vào gameplay.
  - KI-321 (TD-22) — HUD ghi lại DOM mỗi khung hình; KI-322 — hiệu ứng CSS của menu đang đóng chạy mỗi khung hình.
  - KI-323 — nút Hồi sinh vô hình (màn hình gục đang ẩn) vẫn nhận chạm ở giữa-dưới màn hình.
  - KI-324 — nút Thoát của Paimon Menu bị ép còn 0 px ở màn cao ≤ 340 px.
  - KI-306 — danh sách nhạc có 1 file không tồn tại mỗi thư mục (~10 % lần chọn bài là im lặng + 404).
  - KI-325 — mỗi ván mới in cảnh báo "đội hình đã lưu có mục không hợp lệ" dù không có lỗi.
  - KI-326 — `preventDefault()` trên `touchcancel` sinh lỗi console trên Chrome.
  - KI-334 — 2 ngón trên nút Attack: ngón nhấc trước kết thúc lượt giữ của ngón kia; KI-335 — ngón mất sự kiện kết thúc
    giữ joystick mãi (nhân vật tự chạy) và id ngón treo sau khi mở menu; KI-336 — chạm vùng 3D lúc hội thoại mở vẫn bật
    joystick / camera.
  - KI-303 (phần phiên bản) — màn hình tiêu đề hiện "Ver. 4.8_LIVE" giả → "Alpha v1.0".
  - KI-333 — favicon khai báo sai kiểu MIME (`type="png"`).
- **M4–M6**: KI-122, KI-125, KI-205 (biên map), KI-308 (tracker chồng HUD), KI-007 mở rộng (không ghi đè save mới hơn), TD-09.
- **M1**: BUG-01 (tên người chơi), BUG-02 (dt nhảy sau khi đổi tab), BUG-03 (mesh Burst #2 tồn đọng), BUG-04 (Slime bẹp
  mãi), BUG-05 (Water Bubble không kéo), BUG-07 (render khi pause/title), BUG-08 (input kẹt khi mất focus / mở menu),
  BUG-11, BUG-12 (rò tài nguyên Slime), BUG-14.
- **M0.1 / Burst / Party**: KI-001 (mất level nhân vật active), KI-002 (Quest Board kẹt vĩnh viễn), KI-003, KI-004 (mở
  rương 2 lần), KI-005, KI-006, KI-007, KI-008, KI-009 (Burst khoá chéo), KI-010, KI-011.

### Known Issues

Không còn lỗi P0 (chặn) hay P1 (nghiêm trọng) đã biết. Còn các lỗi P2/P3 — danh sách đầy đủ (mức, khu vực, cách tái hiện,
có chặn Alpha không, milestone gợi ý) ở `ALPHA_KNOWN_ISSUES.md`. Nổi bật:

- Chưa thử trên điện thoại thật; hiệu năng GPU trên điện thoại chưa đo (mọi số đo từ Chromium headless + SwiftShader).
- Thư mục `assets/` không nằm trong repository (game có dự phòng khi thiếu).
- Tailwind dùng Play CDN (biên dịch CSS trong trình duyệt lúc chạy) — không dành cho production (KI-327).
- Nhân vật active gục là thua dù đội còn người (KI-106); vật phẩm nhặt tự nhiên không được lưu (KI-201); màn Character
  đọc dữ liệu tĩnh (KI-302); còn dữ liệu giả trong menu / title (KI-303).
- Cân bằng chưa playtest (KI-126): Burst cần ~50–70 s giao chiến để đầy, dài hơn trận Thử Thách (~35–40 s) — người chơi
  mới thường xong vòng Alpha mà chưa dùng Burst nếu không đánh ở chỗ khác trước.

### Deferred

Không thuộc Alpha v1.0 (xem `ALPHA_ROADMAP.md` mục "Phạm vi Alpha v1.0 đã chốt"): Wish/gacha, vùng đất / nhiệm vụ / quái /
nhân vật mới, progression mở rộng (vũ khí, thánh di vật, đột phá), inventory tiêu hao/chế tạo, party wipe tự đổi người,
bảng phản ứng nguyên tố đầy đủ, encounter nhiều wave, chuyển Slime sang khung quái M2, CSS Tailwind build sẵn cho
production, tối ưu render theo đo đạc trên máy thật (bóng đổ / pixel ratio / instancing / pool projectile), Restart,
loading thật.
