# ALPHA_TECH_DEBT

_Cập nhật: 2026-09-30 · chốt Alpha v1.0 / M7–M9 (TD-22 xử lý; TD-23 đã đo phần có thể đo, quyết định để PA-1; TD-31 một phần; TD-11 một phần). Trước đó M4–M6 (TD-09 xử lý; TD-06 một phần; thêm TD-15, TD-16, TD-17, TD-27). Trước đó M2/M3 (TD-03 xử lý phần lớn; TD-02, TD-05 một phần; thêm TD-13, TD-14, TD-26). Trước đó M1: TD-24, TD-30 đã xử lý; TD-31 xử lý phần test._ Nợ kỹ thuật **không phải bug trực tiếp**, nhưng làm tăng rủi ro/chi phí cho
các phase sau. Mỗi mục ghi phase nên xử lý. Quy tắc: chỉ trả nợ khi milestone đang làm cần tới nó.

## Kiến trúc

| ID | Nợ | Ảnh hưởng | Xử lý ở |
|---|---|---|---|
| TD-01 | Global scope + thứ tự `<script>` cứng; gọi chéo qua `window.*` với guard `if (window.x)` (lỗi đặt tên → im lặng không chạy). | Thêm file/đổi thứ tự dễ vỡ | Giữ nguyên cho Alpha; ghi rõ trong ARCHITECTURE |
| TD-02 | Enemy logic hardcode `isSlime` ở ≥8 nơi (cleanup, nhạc combat, chest, spawn cap, save purge, ally alert, mass, `onEnemyKilled('slime')`). Enemy không có `isSlime` tự động nhận contact damage (08). **M2: một phần** — quái mới dùng cờ `isFieldEnemy` + `FieldEnemy` (không đi qua các nhánh `isSlime`); 08 chỉ thêm 2 chỗ (`isFieldEnemy` không có contact damage; nhạc combat đọc cả hai). Các nhánh `isSlime` của Slime giữ nguyên. | Còn 2 "họ" quái song song (TD-13) | Khi chuyển Slime sang framework |
| TD-03 | ~~Không có helper `damagePlayer()` dùng chung — damage lên player inline trong `Slime.update` và contact dummy.~~ **M2: xử lý phần lớn** — `window.applyEnemyAttackToPlayer()` (enemies.js) là đường duy nhất cho Slime + quái M2 (melee/đạn/AoE), gồm Counter #5. Còn lại: contact damage của dummy (08) vẫn là khối riêng (có quy tắc damage ≤ 0 của M1). | Nhỏ | Khi đụng tới dummy |
| TD-04 | Nguyên tố trên damage event chỉ là `isHydro` (boolean). Damage event chưa mang `element`/metadata chuẩn. | Chặn Phase 9, sai màu flash (KI-110) | **Phase 9** (có thể gộp khi làm base class Phase 3) |
| TD-05 | Camp hardcode Slime + Chest; chưa có encounter lifecycle tổng quát. **M3: một phần** — có `EncounterSystem` dữ liệu hoá (trạng thái, theo dõi quái riêng, thắng/thua, thưởng 1 lần, reset) cho quái M2; camp Slime vẫn là hệ thống riêng. Encounter chỉ có 1 wave, 1 điều kiện `defeat_all`. | Camp chưa dùng được encounter | Khi cần camp đa dạng |
| TD-06 | Quest Bảng chỉ có `kill`/`gather`, 2 slot cố định. **M6: một phần** — nhiệm vụ chính dữ liệu hoá (`STORY_QUEST_DEFINITIONS`, 18) có chuỗi mục tiêu reach / interact / encounter / talk theo sự kiện thật (TD-15). | Thêm loại mục tiêu = sửa 18 | Khi cần nhiệm vụ mới |
| TD-07 | Inventory chưa có `removeItem`; `maxStack` không được áp; 5/6 category rỗng. | Chặn quest "nộp vật phẩm", crafting | **Phase 7** |
| TD-08 | `player.level/exp` là bản sao, `player.stats` là tham chiếu chung — 2 cơ chế đồng bộ khác nhau cho cùng "cửa sổ" nhân vật active (gốc của KI-001). | Dễ tái phát bug persistence | Phase 8 (giữ fix M0.1, cân nhắc chuyển level/exp sang getter giống hp) |
| ~~TD-09~~ | ~~Save schema v1 không có migration.~~ **Đã xử lý ở M5**: `SaveSchema.parse/migrate/sanitize` (06), schema v2, v1 nâng cấp khi đọc. Còn lại: `sanitize` là 1 hàm dài biết mọi section (thêm section mới = sửa 06 + module sở hữu). | Nhỏ | Khi thêm section |
| TD-10 | `updateThunderHUD` (UI) tự đếm ngược timer gameplay (`reactiveRefreshFlashTimer`, `thunderFinisherFlashTimer`). | UI và logic dính nhau | Phase 10 |
| TD-11 | `openMenuSubSection` ở index.html, phần menu còn lại ở ui.js; nhiều biến gán 2 lần (ui.js và `startGameplay`). **M7: một phần** — `isMobile` nay tính ở 1 hàm dùng chung (`detectTouchPrimaryDevice()`, ui.js) cho cả 2 nơi. | Khó bảo trì, rủi ro duplicate init nếu `startGameplay` chạy lại | PA-4 |
| TD-12 | `CHARACTER_DATA` tĩnh (legacy trước Party System) vẫn được UI đọc. | KI-302 | Phase 10 |
| TD-13 | 2 "họ" quái song song: `Slime`/`Enemy` (enemies.js, AI riêng) và `FieldEnemy` (M2, lifecycle/state machine chung). Giao diện ngầm cho đòn người chơi giống nhau, nhưng camp/chest/save purge chỉ biết Slime. | Sửa hành vi chung phải sửa 2 nơi | Khi có quyết định chuyển Slime sang framework (không làm ở Alpha nếu không cần) |
| TD-14 | Encounter: chưa có wave, chỉ `defeat_all`, vị trí/arena là toạ độ tay trong `ENCOUNTER_DEFINITIONS`; không có tường/biên vùng đấu (thua khi rời quá `leaveGrace`). | Chặn encounter phức tạp hơn | Khi milestone cần (M4+) |
| TD-15 | 2 hệ nhiệm vụ song song: QuestBoard (lặp lại, `activeQuests`) và StoryQuest (M6, `story` trong save). Trang Nhiệm Vụ + tracker gộp hiển thị cả hai nhưng logic/tiến trình tách biệt (không trùng dữ liệu). | Thêm loại nhiệm vụ phải chọn hệ | Khi có nhiệm vụ thứ 2 / bảng nhiệm vụ lớn hơn |
| TD-16 | Vùng Alpha là toạ độ tay trong `ALPHA_REGION` (17) + hình khối procedural; vùng khám phá là hình tròn (không theo địa hình). Không có trình sửa map (ngoài phạm vi theo spec). | Thêm vùng mới = thêm dữ liệu + dựng hình trong 17 | Khi mở rộng thế giới |
| TD-17 | `GameEvents` là bus toàn cục đơn giản (không namespace, không thứ tự ưu tiên); listener tự huỷ qua hàm `off` trả về. Hiện chỉ có 3 listener cố định. | Thêm nhiều hệ nghe sự kiện cần quy ước tên | Khi có hệ thứ 3 nghe sự kiện |

## Hiệu năng (chưa đo trên máy thật — không tối ưu mù)

| ID | Nợ | Xử lý ở |
|---|---|---|
| TD-20 | Projectile (arrow/shot) tạo geometry + material mới mỗi lần bắn; mỗi frame `new AABB`, `clone()` cho từng arrow; arrow cắm lại 30s. | Phase 15 (pool khi Catalyst #6 làm tăng số projectile — cân nhắc làm luôn ở Phase 1) |
| TD-21 | `resolveStaticCollisions`/`getGroundY` cấp phát `AABB`/vector và closure mỗi lần gọi (~2 lần/enemy/frame). | Phase 15 |
| ~~TD-22~~ | ~~`syncHUDVariables` + burst/cooldown HUD ghi DOM mỗi frame.~~ **Đã xử lý ở M7 (KI-321)**: `hudText` / `hudToggle` / `hudStyle` (ui.js) chỉ ghi khi giá trị đổi — đứng yên 20 → 0 lần ghi DOM / khung, layout 1 → 0 / khung (`m7/perf-mobile.js`). Còn lại: `updateThunderHUD` vẫn tự đếm timer (TD-10). | — |
| TD-23 | Renderer: antialias + PCFSoftShadowMap + pixelRatio tới 2 — nặng với điện thoại. **M7 đã đo phần đo được** (SwiftShader, không đại diện cho GPU điện thoại): 218–445 draw call, ~76–85k tam giác, ~800 geometry, shadow map 1024², JS ~8–9 ms / khung. Không đổi renderer vì chưa có số đo GPU thật để so sánh trước / sau (quy tắc "không tối ưu mù"). | PA-1 (đo trên máy thật trước) |
| ~~TD-24~~ | ~~Text wall 361 khối trong danh sách collision.~~ **Đã xử lý ở M1 (BUG-11)**: chữ trang trí không còn trong `obstacles`. Còn lại: 361 khối vẫn là 361 mesh/geometry riêng (có thể gộp/instancing khi làm tối ưu). | Phase 15 (phần mesh) |
| TD-25 | Chest particle, `_playOpenAnimation` dùng rAF riêng ngoài game loop (không dừng khi pause). | Phase 14 |
| TD-27 | M4–M6: vùng Alpha + dấu nhiệm vụ thêm ~45 draw call khi nhìn từ spawn về tháp (376 so với 331, 55 mesh/sprite — `m4/perf.js`); `updateWorld` chạy mỗi frame nhưng chỉ ~0.03–0.1 ms trung bình (vùng 5 lần/s, khoảng cách 4 lần/s). Tháp/đèn/NPC không instancing. Số đo trên SwiftShader, chưa đo trên điện thoại. | Phase 15 (cần đo máy thật) |
| TD-26 | Quái M2: mỗi con là nhiều mesh primitive + 2 sprite thanh máu + telegraph riêng (không instancing) — encounter đang đánh thêm ~40 draw call (255 → ~295, đo trong `m2/encounter-perf.js`); đường va chạm/mặt đất dùng chung vẫn cấp phát vector tạm mỗi frame (TD-21). CPU code quái + đạn + encounter ~0.6 ms/frame trung bình trên máy test (SwiftShader) — chưa đo trên điện thoại. | Phase 15 (cần đo máy thật) |

## Kiểm thử & quy trình

| ID | Nợ | Xử lý ở |
|---|---|---|
| ~~TD-30~~ | ~~Không có test suite trong repo.~~ **Đã xử lý ở M1**: `tools/tests/` (10 bộ cũ + 10 test M1, `npm test`, README). | — |
| TD-31 | index.html dùng CDN lúc chạy (Tailwind Play CDN, Three r128, Font Awesome, Google Fonts). Từ M1 bộ test tự thay CDN bằng bản local/stub ngay trong harness (index.html giữ nguyên CDN). M2: test layout có thể dùng Tailwind thật build sẵn (`tools/tests/vendor/tailwind-3.4.17.css`) — phải build lại khi thêm class Tailwind mới (README test). **M8/M9: một phần** — có dấu phiên bản (`VERSION`, `<title>`, màn tiêu đề, Paimon Menu), quy trình chạy tối thiểu (`README.md`), eruda chỉ nạp với `?debug=1`, `m8/build-check.js`. Còn: CSS build sẵn cho production (KI-327). | PA-2 |

## Code chết / comment lệch (dọn khi chạm tới file)

- `propObstacles` (05) không dùng; `Chest.trimScale` gán nhưng không áp; `player.staggerTimer` không đọc;
  `hitReactionDirection` của slime không dùng; nhánh respawn của dummy không bao giờ chạy; comment
  `updateProjectiles` (08) trỏ tới hàm không còn; `#btn-restart-prototype` chết; `activeDecoys[]` tồn tại
  nhưng AI slime chỉ đọc shim `window.activeDecoy`.
