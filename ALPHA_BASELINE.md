# ALPHA_BASELINE — Alpha v1.0

_Chốt: 2026-09-30 (M9). Tài liệu ngắn để giai đoạn sau bắt đầu mà không phải khám phá lại hệ thống. Chi tiết kiến trúc:
`ALPHA_ARCHITECTURE.md`; lỗi còn mở: `ALPHA_KNOWN_ISSUES.md`; nợ kỹ thuật: `ALPHA_TECH_DEBT.md`; cách chạy: `README.md`._

## 1. Alpha v1.0 là gì

Một vòng chơi hoàn chỉnh, chơi được trên điện thoại (màn hình ngang) và PC:

```
Mở game → Opening/Title (nhập tên lần đầu) → thế giới 100×100 → Trinh sát Arin (nhận nhiệm vụ "Ngọn Lửa Tháp Canh")
→ đèn lồng → Tháp Canh Cổ (khám phá, leo được) → bia đá → rương thế giới → Bãi Đá Thử Thách (3 quái M2)
→ đánh bằng đội 4 người (đòn thường / Charged / Skill / Burst / đổi người) → thắng (+40 lần đầu) → báo cáo → nhận thưởng
→ tự lưu (localStorage, save v2) → tải lại → chơi tiếp → khám phá tự do
```

Kèm theo: 6 nhân vật (#1–#6), Party (4 slot + bench), Paimon Menu (Party, Nhiệm Vụ, Túi đồ, Nhân vật, Cài đặt…), camp
Slime + Quest Board (nhiệm vụ lặp), hệ năng lượng/cooldown, save v2 có migration từ v1.

**Không có**: Wish, vùng/nhân vật/quái mới ngoài danh sách trên, progression sâu, multiplayer/backend, asset 3D (mọi hình
là khối procedural). Danh sách để sau: `ALPHA_ROADMAP.md` › "Phạm vi Alpha v1.0 đã chốt".

## 2. Hệ thống chính — trách nhiệm — điểm nối

| Hệ thống | File | Trách nhiệm | Nối với |
|---|---|---|---|
| Khởi động / Opening | `index.html` (inline `startGameplay`), `scripts/opening.js` | Logo → Title → tên → Door → Loading → `startGameplay()` 1 lần; Return to Title / Start again không dựng lại scene | Save (có save thì bỏ popup tên), `window.isOpeningActive` chặn input |
| Vòng lặp | `game/08` `animate()` | 1 dt kẹp 0.1 s cho mọi hệ; không render khi pause; thứ tự: physics → combat → effects → quái → đạn quái → encounter → world | mọi hệ `update*(dt)` |
| Input | `game/07` (phím/chuột), `ui.js` (cảm ứng) | Nhấn/thả → `handleAttackDown/Up`, `handleSkillKeyDown/Up`, `handleBurstKeyDown`, `switchToCharacter`; huỷ thao tác giữ khi blur / ẩn tab / mở menu / hội thoại / gục / `touchcancel` (`cancelHeldCombatInput`) | combat.js, 02 |
| Nhân vật / kỹ năng | `game/10` (dữ liệu), `game/11` (SKILL_LIBRARY), `game/09` (thực thi), `combat.js` | Dữ liệu hoá theo `effectType`/`behavior`; damage qua `calculatePlayerToEnemyDamage` + `enemy.takeDamage(…, withDamageSource)` | Energy (12), VFX, quái |
| Party | `game/02` (`Party` API, `switchToCharacter`, `canSwitchCharacter`), `ui.js` (HUD) | partyState là nguồn sự thật; đổi người huỷ đòn/aim đang dở; bench giữ tiến trình | Save, HUD, menu Party |
| Quái / Encounter | `enemies.js` (Slime, dummy), `game/13`–`15` | FieldEnemy + 3 archetype; `applyEnemyAttackToPlayer` là đường đòn duy nhất; EncounterSystem (trạng thái, thưởng lần đầu) | GameEvents, Save (`encounters`) |
| Thế giới / Nhiệm vụ | `game/16` (GameEvents, WorldState, biên), `game/17` (vùng Alpha), `game/18` (StoryQuest) | Tiến trình thế giới và nhiệm vụ chỉ đổi qua sự kiện thật (`world:*`, `encounter:*`, `quest:*`) | UI tracker, Save (`world`, `story`) |
| Save | `game/06` | Save v2: `SaveSchema.parse → migrate → sanitize`; tự lưu theo sự kiện (300 ms) + định kỳ + khi đóng tab | mọi hệ có trạng thái lưu |
| HUD / Menu | `ui.js`, `index.html`, `style/style.css` | HUD cảm ứng và PC dùng chung dữ liệu; HUD chỉ ghi DOM khi đổi (M7); bố cục di động + vùng an toàn ở cuối style.css | tất cả |

## 3. Chỗ dễ vỡ (đọc trước khi sửa)

- **Thứ tự `<script>`** trong `index.html` là ràng buộc cứng (global scope, `window.*`). Thêm file = đặt đúng vị trí.
- **Dòng kết thúc**: `scripts/game/01`–`07` dùng CRLF; `scripts/opening.js` và `style/style.css` lẫn CRLF / LF theo từng
  dòng; các file khác LF. Giữ nguyên khi sửa (công cụ tự "chuẩn hoá" sẽ biến diff vài dòng thành diff cả file).
- **`player.stats` là tham chiếu, `level/exp` là bản sao** giữa player và partyState (gốc KI-001) — đổi người phải đồng bộ.
- **Trạng thái "đang giữ"** (Attack/Aim/Held Skill/joystick): mọi đường vào menu/hội thoại/gục/mất focus phải đi qua
  `cancelHeldCombatInput()` / `releaseTouchInputState()`; nút cảm ứng mới nên theo mẫu "1 nút = 1 ngón" ở `ui.js`.
- **Bố cục HUD điện thoại**: cột nhân vật (trái), joystick nghỉ ở `left: 84px`, cụm nút phải; mọi thay đổi HUD chạy
  `tools/tests/m7/mobile-layout.js` (hit-test 11 cỡ màn hình + giả lập tai thỏ).
- **Save**: thêm trường mới = sửa `collectSaveData` + `SaveSchema.sanitize` + nơi khôi phục; đổi cấu trúc = migration.
- **Tailwind Play CDN**: class Tailwind mới chỉ có tác dụng trong test layout sau khi build lại `tools/tests/vendor/tailwind-3.4.17.css`.
  Phần lớn test chạy với stub Tailwind rỗng (giống khi CDN bị chặn): CSS riêng trong `style.css` không được dựa vào lớp
  Tailwind để định vị — `::before` / `::after` tuyệt đối cần phần tử cha tự có `position` (bài học KI-337).
- **Hai hệ quái** (Slime vs FieldEnemy) và **hai hệ nhiệm vụ** (Quest Board vs StoryQuest) song song (TD-13, TD-15).

## 4. Kiểm thử — điểm vào

`tools/tests/` (Playwright, Chromium headless, không cần server riêng): `npm test` (toàn bộ 42 file / 46 lượt chạy, tuần
tự, ~2,5 giờ ở đây) hoặc theo nhóm `test:core | test:m1 | test:m2 | test:m4 | test:m7 | test:m8`. Lượt chạy cuối trên bản
chốt (2026-09-30, Chromium 141 headless + SwiftShader, 2 giờ 16 phút): **46/46 PASS**; chi tiết: báo cáo M7–M9. Hành trình
người chơi đầy đủ: `m8/rc1-journey.js` (điện thoại + PC, từ trạng thái sạch). Save từ bản cũ: `m8/existing-saves.js`
(fixture sinh bằng build M2–M3 và M4–M6).

## 5. Nợ kỹ thuật và việc để sau

Nợ: `ALPHA_TECH_DEBT.md` (TD-01 global scope, TD-04 element trên damage event, TD-13/15 hệ song song, TD-20/21 cấp phát
mỗi khung, TD-23 render chưa đo trên máy thật, TD-31 CDN/build). Để sau: `ALPHA_ROADMAP.md` › "Phạm vi Alpha v1.0 đã chốt".

**Việc nên làm đầu tiên sau Alpha**: chơi thử + đo trên điện thoại thật (FPS, nhiệt, bộ nhớ, cảm giác joystick/nút),
rồi mới quyết định tối ưu render (bóng đổ, pixel ratio) và CSS build sẵn thay Tailwind Play CDN.
