# ALPHA_ROADMAP — Alpha v1.0

_Cập nhật: 2026-09-30 · **Alpha v1.0 đã chốt** (M7 Mobile Optimization, M8 Alpha RC1, M9 Finalization). Trước đó:
Phase 0, M0.1, M0 Audit, M1 Stabilization, M2+M3 (Enemy Framework & Encounter Loop), M4–M6 (World, Save v2,
Quest/Flow/UI)._ Roadmap gốc là mục tiêu; repo là sự thật. Alpha v1.0 là gì, chạy thế nào: `ALPHA_BASELINE.md`,
`README.md`; lỗi còn mở: `ALPHA_KNOWN_ISSUES.md`; thay đổi: `CHANGELOG.md`.

**M7–M9 (2026-09-30, GI-ALPHA-M7-M9)** đã xong. M7: input cảm ứng đa chạm (đổi nhân vật khi đang giữ joystick,
1 nút = 1 ngón, ngón "treo" tự nhả, `touchcancel` = huỷ, đổi người huỷ Aim), bố cục HUD điện thoại không chồng nhau ở
11 cỡ màn hình + vùng an toàn tai thỏ, vùng chạm ≥ 44 px, chọn bộ điều khiển theo con trỏ chính, HUD chỉ ghi DOM khi
đổi, video Opening dừng trong gameplay. M8: chốt phạm vi (mục 0 dưới đây), hành trình RC1 đủ 24 bước từ trạng thái
sạch trên điện thoại và PC, save thật của build cũ, test gián đoạn, kiểm tra build. M9: `VERSION` (Alpha v1.0),
`CHANGELOG.md`, sổ lỗi P0–P3, `ALPHA_BASELINE.md`. Test: nhóm `m7`, `m8` (`npm run test:m7`, `npm run test:m8`); lượt
chạy toàn bộ cuối trên bản chốt: 46/46 PASS (Chromium headless, SwiftShader — chưa thử trên thiết bị thật, KI-328).

## 0. Phạm vi Alpha v1.0 đã chốt (scope freeze — M8)

Từ RC1 không thêm tính năng lớn nào ngoài sửa lỗi chặn. Mục "Để sau" không được đưa lén vào Alpha.

| Nhóm | Hệ thống / tính năng | Trạng thái Alpha v1.0 |
|---|---|---|
| **Bắt buộc** | Opening / Title / nhập tên → gameplay; Pause, Return to Title | Có — RC1 S1–S3, S20 |
| Bắt buộc | Vùng Alpha: Trinh sát Arin, đèn lồng, Tháp Canh Cổ, bia đá, rương thế giới, Bãi Đá Thử Thách, biên ±47 | Có |
| Bắt buộc | Nhiệm vụ chính "Ngọn Lửa Tháp Canh" 4 bước, thưởng 1 lần | Có |
| Bắt buộc | Combat: đòn thường / Charged / Skill / Burst, năng lượng, cooldown; 6 nhân vật | Có |
| Bắt buộc | Party 4 người + bench, đổi nhân vật, HUD party điện thoại + PC | Có |
| Bắt buộc | Quái M2 (3 kiểu) + encounter M3 (thắng / thua / thử lại, thưởng lần đầu) | Có |
| Bắt buộc | Save v2 (tự lưu theo sự kiện, migration v1, save hỏng / mới hơn an toàn) | Có |
| Bắt buộc | Điều khiển cảm ứng + bố cục điện thoại + vùng an toàn | Có (giả lập; chưa thử máy thật — KI-328) |
| Bắt buộc | Paimon Menu: Party, Nhiệm Vụ, Túi đồ, Cài đặt | Có (màn Character đọc dữ liệu tĩnh — KI-302) |
| **Tuỳ chọn (polish)** | Camp Slime + Quest Board lặp lại | Có sẵn, giữ nguyên |
| Tuỳ chọn | Dọn dữ liệu giả trong menu / title (KI-303) | Một phần (số phiên bản); phần còn lại để sau |
| Tuỳ chọn | Loading thật (KI-304), Restart (KI-312), màn Character theo nhân vật active (KI-302) | Để sau (PA-4) |
| Tuỳ chọn | Tự đổi người khi nhân vật active gục / party wipe (KI-106) | Để sau — cần chốt thiết kế (PA-3) |
| Tuỳ chọn | Lưu trạng thái vật phẩm nhặt tự nhiên (KI-201) | Để sau (PA-5) |
| **Để sau** | Wish / gacha | Không thuộc Alpha |
| Để sau | Vùng đất, nhiệm vụ, quái, nhân vật, vũ khí mới | Không thuộc Alpha |
| Để sau | Progression mở rộng (vũ khí, thánh di vật, đột phá), inventory tiêu hao / chế tạo (TD-07) | Không thuộc Alpha |
| Để sau | `element` trên damage event + phản ứng nguyên tố (TD-04); encounter nhiều wave (TD-14); Slime sang khung quái M2 (TD-02, TD-13) | Không thuộc Alpha |
| Để sau | Tối ưu render theo đo đạc máy thật (bóng đổ, pixel ratio, instancing, pool projectile — TD-20/21/23/26/27) | Không thuộc Alpha (cần đo trước — PA-1) |
| Để sau | CSS Tailwind build sẵn, tự host font / icon / Three.js (KI-327, TD-31) | Không thuộc Alpha (PA-2) |
| Để sau | Va chạm camera; VFX hoàn thiện #5/#6, death VFX, audio hook; chân dung nhân vật (KI-118) | Không thuộc Alpha (PA-8) |

## 0b. Sau Alpha v1.0 — nhóm việc đề xuất

Rút từ kế hoạch gốc (mục 3 bên dưới), nợ kỹ thuật và sổ lỗi; mã `PA-x` được dùng ở cột "Milestone gợi ý" của
`ALPHA_KNOWN_ISSUES.md`. Thứ tự gợi ý: **PA-1 trước** (đo thật rồi mới tối ưu), PA-2 trước khi chia sẻ rộng, PA-7
(playtest) quyết định số liệu cho PA-3 / PA-6.

| Mã | Nhóm việc | Gồm | Nguồn |
|---|---|---|---|
| PA-1 | Thiết bị thật & hiệu năng | Chơi thử + đo FPS / nhiệt / bộ nhớ trên Android + iOS; rồi mới chỉnh bóng đổ / pixel ratio / antialias, pool projectile, cấp phát mỗi khung; KI-328, KI-330, KI-331 | M15 gốc, TD-20/21/23/26/27 |
| PA-2 | Build phát hành | CSS Tailwind build sẵn thay Play CDN, tự host font / icon / Three.js, đóng gói thư mục `assets/` | KI-327, KI-329, TD-31 |
| PA-3 | Luật party & combat | Party wipe / tự đổi người, cooldown bench, hitstop dt, Vortex với quái nặng, `element` trên damage event | KI-106, 112, 105, 109, 110; TD-04; M8+M10 gốc |
| PA-4 | UI & flow | Màn Character theo nhân vật active, dọn dữ liệu giả, loading thật, Restart, overlay nhiệm vụ Bảng | KI-302, 303, 304, 311, 312; TD-11, TD-12; M7/M12 gốc |
| PA-5 | Dữ liệu thế giới / nhiệm vụ / save | Lưu vật phẩm nhặt, dọn `turned_in`, sửa dữ liệu nhiệm vụ Bảng, collision props, inventory remove | KI-201, 202, 203, 205, 208, 210; TD-07 |
| PA-6 | Quái | Va chạm giữa quái, tìm đường, tầm nhìn quái tầm xa, Slime sang khung M2, encounter nhiều wave | KI-107, 108, 124; TD-02, TD-13, TD-14 |
| PA-7 | Cân bằng & playtest | Số liệu quái, nhịp năng lượng / Burst so với độ dài trận, cảm giác né đòn ở 60 fps trên cảm ứng | KI-126; M16 gốc |
| PA-8 | Trình bày | Chân dung, mô hình vũ khí #5/#6, VFX hoàn thiện, death VFX, audio hook, va chạm camera | KI-118; M14 gốc |

**M1 Stabilization (2026-09-29)** đã xong: BUG-01/02/03/04/05/07/08/11/12/14 (chi tiết + test trong
`ALPHA_KNOWN_ISSUES.md`), bộ test đưa vào `tools/tests/`. Phần lớn "M2.1 Combat hygiene" bên dưới (dt clamp, slime
squash, Water Bubble pull, dummy contact 0-damage) đã nằm trong M1; còn lại của M2.1: hitstop dt (KI-105), flash
sai nguyên tố (KI-110).

**M2 + M3 (2026-09-29, GI-ALPHA-M2-M3)** đã xong: khung quái (`game/14-enemy-framework.js`, dữ liệu ở
`game/13-enemy-definitions.js`) với 3 archetype cận chiến / tầm xa (đạn né được) / hạng nặng; đường đòn quái →
player dùng chung `applyEnemyAttackToPlayer` (Slime + quái mới, gồm Counter #5); vòng encounter
(`game/15-encounter-system.js`) — cột sáng F/chạm → 3 quái → thắng (thưởng lần đầu 1 lần, lưu save) / thua
(gục hoặc rời khu vực) → thử lại. Test: nhóm `m2` trong `tools/tests`. Chưa làm: wave, `element` trên damage event,
chuyển Slime sang framework. Lỗi có sẵn phát hiện khi làm: KI-122 (mặt đất hiển thị lật trục Z).

**M4–M6 (2026-09-29, GI-ALPHA-M4-M6)** đã xong: vùng Alpha nhỏ, liền mạch trên map sẵn có — Trinh sát Arin ở cửa
Nam trại → hàng đèn lồng → Tháp Canh Cổ (leo được, đỉnh có vùng khám phá riêng) + bia đá + rương thế giới → Bãi Đá
Thử Thách (encounter M3) → về lại Arin; 5 vùng khám phá; biên khu vực chơi ±47; tương tác 1 lần/lần bấm (M4, file
16/17). Save v2: phiên bản 2 trên cùng ô lưu, migrate v1 → v2 tất định, kiểm tra từng section, chặn ghi đè save
phiên bản mới hơn, báo lỗi ghi, không ghi lặp khi không đổi (M5, 06). Nhiệm vụ chính "Ngọn Lửa Tháp Canh" 4 bước
theo sự kiện thật, thưởng 1 lần, tracker + đánh dấu 3D + dấu !/? + trang Nhiệm Vụ trong Paimon Menu (M6, 18).
Sửa kèm vì thuộc độ liền mạch của thế giới: KI-122 (mặt đất lật trục), KI-125 (Slime camp lang thang), KI-205 (biên
map), KI-308 (tracker mobile chồng điều khiển). Test: nhóm `m4` (`npm run test:m4`).

## 1. Baseline — phân loại hệ thống

Thang: **Complete** (đủ cho Alpha) · **Functional** (chạy được, cần cải thiện) · **Partial** · **Missing** ·
**Broken** (hỏng/chặn).

| Hệ thống | Trạng thái | Lý do ngắn |
|---|---|---|
| Bootstrap / script order | Functional | Chạy ổn, nhưng global scope + thứ tự cứng (TD-01) |
| Title → Start → Gameplay | Functional | Opening đầy đủ, Skip Opening, chống init 2 lần; loading giả lập, không Restart. M7: video Opening dừng trong gameplay |
| Pause / Resume / Return to Title | Functional | Hoạt động, lưu khi thoát; từ M1 không render khi pause/title, input đang giữ được huỷ khi mở menu |
| Character registry (data-driven) | Complete | Roster + Skill library + dispatch theo effectType/behavior |
| Nhân vật #1 Sword Hydro | Complete | Đã regression |
| Nhân vật #2 Bow Pyro | Complete | Aim, decoy, zone — đã regression |
| Nhân vật #3 Polearm Electro | Complete | Thunder State/Coordinated/VFX/HUD — đã regression |
| Nhân vật #4 Sword Anemo | Complete | Pull theo trọng lượng, field cố định, Tailwind — đã test |
| Nhân vật #5 Claymore | Complete | GI-CHAR-05-06: Counter Stance, Charged / Heavy, Earthsplitter Burst (`c56test.js`, `c56mobile.js`); trước đó Missing |
| Nhân vật #6 Catalyst | Complete | GI-CHAR-05-06: Violet Arc giữ / chạm, Lightning Rose (`c56test.js`, `c56mobile.js`); trước đó Missing |
| Combat core (damage/impact/poise/hit list) | Functional | Event-driven, chống trùng hit; M1 sửa KI-101..104; còn KI-105, 110 |
| Energy | Complete | Hạt theo event thật, dummy = slime = mọi vật nhận damage |
| Cooldown / off-field | Complete | Tick cho cả party, không reset khi switch |
| Stamina | Functional | Có ring HUD, dash/sprint/CA dùng stamina |
| Projectile (người chơi) | Functional | Tách travel/collision/damage; không pool (TD-20) |
| Enemy — light melee (slime nhỏ) | Functional | AI đọc được, telegraph; lỗi bẹp đã sửa (M1) |
| Enemy — heavy (slime lớn) | Partial | Weight heavy đúng, nhưng AI giống slime nhỏ. **M2**: có quái hạng nặng riêng (Cự Thạch Búa — telegraph khoá, AoE, hồi chiêu dài) → Functional |
| Enemy — normal melee | Functional (M2) | Đấu Sĩ Gỉ Sét: quạt khoá hướng, lao ngắn |
| Enemy — ranged + projectile địch | Functional (M2) | Pháp Cầu Lam + đạn tối thiểu (bay thẳng, né được, huỷ khi chủ chết) |
| Encounter system | Functional (M3) | `EncounterSystem` cho quái M2 (1 wave, defeat_all, thưởng lần đầu lưu save). Camp Slime vẫn riêng (TD-05) |
| World / map | Functional | 100×100, 3 camp, hồ, rừng. **M4**: vùng Alpha (NPC, đèn dẫn đường, tháp leo được, bia, rương thế giới, 5 vùng khám phá), biên ±47, mặt đất hiển thị = va chạm (KI-122). Props vẫn không collision |
| Camera | Partial | Orbit + FOV + soft target; không collision camera |
| Interaction / chest / pickup | Functional | F + nút touch; chest 4 trạng thái; pickup respawn. **M4**: 1 kích hoạt / lần bấm, bỏ qua đích đã gỡ/không khả dụng; rương thế giới mở 1 lần có lưu |
| Quest | Functional | Bảng: kill/gather (M0.1 sửa kẹt slot). **M6**: nhiệm vụ chính 4 bước reach/interact/encounter/talk theo sự kiện thật, thưởng 1 lần, lưu save, tracker/dấu 3D/trang Nhiệm Vụ |
| Inventory | Partial | Add/get/UI/persist; thiếu remove, category rỗng |
| Progression (level/EXP) | Functional | Level + scaled stats; persistence đã sửa (M0.1); chưa có weapon/equipment |
| Party / switching | Functional | 4 slot + bench, state riêng, HUD party điện thoại + PC; M7: đổi người bằng ngón thứ 2, đổi người huỷ Aim. Chưa có party wipe / auto-switch (KI-106) |
| Element foundation | Partial | Element chỉ là nhãn + VFX; damage event dùng `isHydro` (TD-04) |
| HUD | Functional | HP/stamina/cooldown/energy/prompt/quest/damage numbers/#thunder-hud; party HUD tạm |
| Save / Load / Autosave | Functional | **Trước M0.1: Broken** (KI-001/002/004). **M5**: schema v2 + migrate v1, kiểm tra từng section, save phiên bản mới hơn không bị ghi đè, lỗi ghi được báo, không ghi lặp |
| Menu (Paimon) | Partial | 8/16 mục chạy thật (thêm Party — Task 92641, Quests — M6); còn lại placeholder có dữ liệu giả (KI-303) |
| Wish | **Missing** | Chỉ có ô menu mở placeholder; primogem có nhưng không dùng |
| VFX | Functional | Hệ thống dùng chung + nhận diện riêng từng nhân vật |
| Audio | Functional | SFX tổng hợp, nhạc theo file (off-by-one KI-306 đã sửa ở M8); file nhạc không có trong repo (KI-329) |
| Asset management | Functional | Không loader 3D; asset thiếu thì fallback |
| Mobile input | Complete (M7, giả lập) | Joystick, camera drag, pinch, nút đủ hành động; đa chạm an toàn, `touchcancel` = huỷ, vùng an toàn, vùng chạm ≥ 44 px, bố cục kiểm ở 11 cỡ màn hình. Chưa thử máy thật (KI-328) |
| Mobile performance | **Chưa đo trên máy thật** | M7 đo phần CPU / DOM (HUD không còn ghi DOM mỗi khung) và thống kê render trên SwiftShader; GPU / FPS / nhiệt trên điện thoại chưa đo (KI-328, PA-1) |
| Build / phát hành | Functional (M8/M9) | Thư mục tĩnh, không bundler; `README.md`, `VERSION`, `CHANGELOG.md`; Tailwind Play CDN (KI-327), `assets/` không có trong repo (KI-329) |

**Vòng chơi Alpha** (Title → … → Save → Reload): **đi được hết** — từ M8 được kiểm bằng hành trình RC1 24 bước từ
trạng thái sạch (điện thoại + PC). Nhận xét gốc của Phase 0 ("encounter chỉ slime, quest chỉ kill/gather, roster thiếu
2 vũ khí") đã được M2–M6 và GI-CHAR-05-06 giải quyết; Inventory vẫn không tiêu hao (TD-07, để sau).

## 2. Critical path (kế hoạch gốc Phase 0 — lịch sử)

```
M0.1 ✅ ─► M2.1 Combat hygiene ─► M3 Enemy framework (+ element trên damage event) ─► M4 Encounter
      ─► M5/M6 World POIs + Quest objectives + Benchmark quest ─► M11 Save schema v2 ─► M12 Flow
      ─► M16 Full regression ─► M17 RC
Nhánh song song (bắt buộc cho exit Alpha, chỉ phụ thuộc M2.1): M1.1 Claymore #5 ─► M1.2 Catalyst #6
Nhánh phụ: M7 Inventory/Progression, M8+M10 Party/HUD, M14 Presentation, M15 Mobile perf, M13 Wish (tùy chọn)
```

**Phải tuần tự**: M3 → M4 → M6 (quest "defeat" cần enemy type + encounter hoàn thành); M6 → M11 (đổi save
schema đúng 1 lần sau khi quest/world ổn định); mọi thứ → M16 → M17.

**Gộp được an toàn**: nhóm bug combat nhỏ (M2.1); element trên damage event đi chung base class enemy (M3);
World POIs + Quest (M5+M6); Party + HUD (M8+M10); pool projectile đi cùng Catalyst (M1.2).

## 3. Trình tự thực thi đề xuất (kế hoạch gốc Phase 0 — lịch sử; phần còn lại chuyển sang PA-x ở mục 0b)

Lưu ý: số M ở bảng này là đánh số của kế hoạch gốc (ví dụ "M7 Inventory"), khác với milestone thực tế đã làm (M7 Mobile
Optimization, M8 RC1, M9 Finalization).

| # | Milestone | Phase | Phụ thuộc | Cần owner? |
|---|---|---|---|---|
| M0.1 | Loop Integrity Hotfix (save/quest/reward) | 0→6/7/11 | — | ✅ Xong |
| **M2.1** | Combat hygiene: dt clamp cho enemy/effect/camp, slime squash, Water Bubble pull lên slime (qua `applyControlledPull`), dummy contact 0-damage, hitstop dt, flash sai nguyên tố | 2 | — | Không |
| M1.1 | Character #5 Claymore — Heavy Breaker | 1 | M2.1 | **Duyệt kit (mục 4)** |
| M1.2 | Character #6 Catalyst — Ranged Specialist (+ pool projectile) | 1 | M2.1 | **Duyệt kit (mục 4)** |
| M3 | Enemy framework: `enemyType` thay `isSlime`, `damagePlayer()` chung, `element` trong damage event; archetype normal melee + ranged (projectile địch); heavy có đòn riêng | 3 + 9 | M2.1 | ✅ Phần framework + archetype + hit helper xong (GI-ALPHA-M2-M3). Chưa: `element` trên damage event, bỏ `isSlime` |
| M4 | Encounter lifecycle tái sử dụng (composition theo type, activation, victory, reward 1 lần, reset) | 4 | M3 | ✅ Bản tối thiểu xong cùng M2-M3 (1 encounter Alpha); wave/nhiều encounter để sau |
| M5+M6 | Biên map + POI; objective go-to / interact / sequence; benchmark quest Talk→Travel→Defeat→Chest→Return→Claim | 5 + 6 | M4 | ✅ Xong trong GI-ALPHA-M4-M6 (quest: Talk → Reach tháp → Đọc bia (mở rương) → Encounter → Báo cáo → Nhận thưởng). Nội dung/lời thoại cần owner đọc duyệt |
| M7 | Inventory remove/consume, Character screen đúng nhân vật, progression tối thiểu | 7 | M6 | Không |
| M8+M10 | Party: auto-switch khi gục, HUD party (HP/cooldown/energy), đồng bộ UI | 8 + 10 | M1.x | Duyệt quy tắc party wipe |
| M11 | Save schema v2 + migration v1→v2 (quest objectives, collectible, world state) | 11 | M6 | ✅ Phần lớn làm cùng M4–M6 (world state, nhiệm vụ chính, migration, kiểm tra, lỗi ghi). Chưa: collectible tự nhiên (KI-201) |
| M12 | Flow: Restart, loading thật, dừng render khi pause/title, dọn placeholder dữ liệu giả | 12 | M11 | Không |
| M13 | Wish (tùy chọn) | 13 | M7 | **Có làm hay hoãn?** |
| M14 | Presentation (VFX #5/#6 hoàn thiện, death VFX, audio hook) | 14 | M1.x | Playtest |
| M15 | Mobile perf (đo trên máy thật) | 15 | — | **Cần owner đo trên điện thoại** |
| M16 | Full regression + test report | 16 | tất cả | Playtest |
| M17 | Alpha v1.0 RC | 17 | M16 | Duyệt RC |

**Vì sao M2.1 trước Claymore/Catalyst**: #5 dựa vào impact/poise nặng, #6 dựa vào projectile; các lỗi dt/
squash/pull hiện tại sẽ làm sai cảm giác cả hai và khiến regression khó phân biệt lỗi mới/lỗi cũ. M2.1 không
cần quyết định thiết kế, trong khi #5/#6 cần owner duyệt kit.

## 4. Đề xuất kit Character #5 và #6 (lịch sử — đã làm ở GI-CHAR-05-06 theo kit được duyệt, khác đề xuất dưới đây)

Theo đúng convention hiện có (combo stages, `talents` scaling/impact, `SKILL_LIBRARY` effectType,
`energyGeneration`). Số liệu là điểm khởi đầu để tune khi playtest.

### #5 — Claymore "Heavy Breaker"
- **Nguyên tố**: đề xuất **Geo** (thêm profile VFX `geo` vàng hổ phách/đá; chỉ là nhãn + VFX, không phản ứng).
  Phương án khác: dùng lại Pyro/Physical.
- **NA**: 4 đòn chậm (windup dài), impact medium → medium → heavy → heavy; đòn 4 có hitstop dài hơn và bụi đất.
  Không đòn thường nào launch.
- **CA**: 1 cú bổ xuống sau windup ~0.45s, vùng tròn r≈3.0 trước mặt, impact heavy, tốn stamina.
  (Không làm "xoay liên tục tốn stamina" kiểu Genshin — tránh subsystem mới.)
- **Skill "Breaker Slam"**: windup có chủ đích ~0.35s → đập mạnh hình nón phía trước, impact **launch**
  (slime lớn chỉ bị stagger theo weight). CD ~9s, 3 hạt năng lượng.
- **Burst "Fault Line"**: nhảy lên → đập đất AoE r≈5 impact launch + 1 dư chấn sau 0.6s impact medium
  (2 damage event rời rạc). Energy 60.
- **Passive "Unyielding"**: trong windup của CA/Skill/Burst không bị đẩy lùi khi trúng đòn (super armor), vẫn
  nhận damage.

### #6 — Catalyst "Ranged Elemental Specialist"
- **Nguyên tố**: đề xuất **Cryo** (profile VFX `cryo` trắng xanh băng). Phương án khác: Dendro, hoặc dùng lại
  nguyên tố có sẵn.
- **NA**: 3 quả cầu bay (projectile thật: travel → AABB collision → damage event), hướng theo soft target,
  impact light; tầm ~12m. Dùng pool để không cấp phát mỗi lần bắn.
- **CA**: vận ~0.6s → nổ AoE r≈2.5 tại mục tiêu soft-target (hoặc 8m phía trước nếu không có), impact medium.
- **Skill "Frost Sigil"**: đặt 1 quả cầu đứng yên, 4 xung damage rời rạc trong r≈3.5 trong 4s. CD ~10s, 3 hạt.
- **Burst "Hailfall"**: 6 cột băng rơi lên các mục tiêu trong 10m trong 1.5s (mỗi cột 1 event, 1 lần/mục tiêu/
  cột), không mục tiêu thì rơi quanh người chơi.
- **Passive "Focus"**: trong 6s sau Skill, CA vận nhanh hơn 50%.

## 5. Ngoài phạm vi Alpha (giữ nguyên theo spec)

Multiplayer, open world lớn, procedural world, AI phức tạp, full reaction matrix, artifact sâu, refinement,
gacha economy đầy đủ, boss framework lớn, narrative nhánh lớn, voice acting, cinematic tools, backend,
monetization.
