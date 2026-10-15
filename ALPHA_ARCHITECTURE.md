# ALPHA_ARCHITECTURE — Genshin Impact Fan-made

_Cập nhật: 2026-09-30 · Alpha v1.0 (Phase 0 → M9: M0.1, M1, M2/M3, M4–M6, M7 Mobile, M8 RC1, M9 Finalization) · Nguồn sự thật: code thực tế trong repo. Bản tóm tắt ngắn cho giai đoạn sau: `ALPHA_BASELINE.md`._

Tài liệu này mô tả kiến trúc **đang tồn tại**, không phải kiến trúc mong muốn. Những gì cần sửa nằm ở
`ALPHA_TECH_DEBT.md`; lỗi cụ thể nằm ở `ALPHA_KNOWN_ISSUES.md`; kế hoạch nằm ở `ALPHA_ROADMAP.md`.

---

## 1. Cấu trúc repository

```
index.html                      HTML + CSS layout (Tailwind CDN) + inline script lớn (~900 dòng):
                                  terrain (getTerrainHeight), startGameplay(), menu sub-sections,
                                  SoundFX / MusicManager, settings UI, eruda (debug console — chỉ nạp
                                  với ?debug=1, M9)
style/style.css                 CSS riêng (opening, HUD, menu)
assets/                         video/âm thanh opening, OST, icon — nạp bằng đường dẫn tương đối;
                                  thiếu file thì code tự fallback (canvas/âm tổng hợp)
scripts/
  comic.js                      Devlog "comic" archive (menu)
  vfx.js                        VFX dùng chung: ELEMENT_VFX, pool chấm, ring/flash/strike, damage number
  enemies.js                    class Enemy (dummy), class Slime (+AI), recordDamageEvent
  game/10-character-roster.js   CHARACTER_ROSTER — dữ liệu nhân vật (stats, talents, combo, visualConfig)
  game/11-character-skills.js   SKILL_LIBRARY — dữ liệu Skill/Burst (effectType/behavior, energyGeneration)
  game/01-…-chest.js            Interactable, QuestBoard, NPC/dialogue, Inventory, REWARD_HANDLERS,
                                  WorldItem, Chest
  game/02-…-stats-core.js       quest/kill hooks, loot table, LEVEL_CONFIG, player, party,
                                  switchToCharacter, soft targeting, WEIGHT_CLASS/IMPACT config
  game/03-…-helpers.js          cameraState, AABB, resolveStaticCollisions, skill state helpers
  game/04-scene-init.js         initThree(), buildCharacterMesh, obstacles/climb walls
  game/05-environment-props.js  props, rừng, hồ, text wall
  game/06-camps-save-system.js  CAMP_CONFIGS/campStates, respawn chu kỳ, Save/Load/Autosave, death/revive
  game/07-input-handlers.js     bàn phím/chuột (pointer lock)
  game/08-…-loop.js             animate(), updatePhysics, combat tick, camera, enemy update/cleanup
  game/09-character-system.js   executeCharacterSkill/Burst, updateActiveEffects (projectile/zone/field)
  game/12-energy-system.js      EnergySystem — hạt năng lượng nguyên tố
  game/13-enemy-definitions.js  M2/M3 — CHỈ dữ liệu: ENEMY_DEFINITIONS (3 quái Alpha) + ENCOUNTER_DEFINITIONS
  game/14-enemy-framework.js    M2 — FieldEnemy (phần dùng chung) + ENEMY_ARCHETYPES (melee/ranged/heavy)
                                  + đạn của quái; export window.EnemyFramework
  game/15-encounter-system.js   M3 — vòng encounter (trạng thái, cột sáng, HUD #encounter-hud, cờ first-clear);
                                  export window.EncounterSystem; M6: phát encounter:started/completed/failed
  game/16-world-state.js        M4 — GameEvents (bus sự kiện), WorldState (nguồn sự thật tiến trình thế giới),
                                  vùng khám phá (kiểm 5 lần/s), biên khu vực chơi ±47 (clampPlayerToPlayArea)
  game/17-world-poi.js          M4 — vùng Alpha: Trinh sát Arin, hàng đèn lồng, Tháp Canh Cổ (leo được), bia đá,
                                  rương thế giới, 5 vùng khám phá; export window.WorldPoi / ALPHA_REGION
  game/18-story-quest.js        M6 — nhiệm vụ chính nhiều bước (StoryQuest), tracker/đánh dấu 3D/dấu !/? trên NPC,
                                  trang Nhiệm Vụ trong Paimon Menu
  combat.js                     damage formula, hit reaction, NA/CA/plunge, bow, cooldown, Thunder State
  ui.js                         HUD, touch controls, menu, inventory/quest UI, #thunder-hud
  opening.js                    Intro → Title → Door → Loading → enterGameplay / return to title
```

**Không có** bundler, module system hay asset loader 3D. Toàn bộ hình học là procedural (THREE primitives).
Three.js r128 từ CDN. Bộ test (test-only, game không nạp) nằm ở `tools/tests/` — xem mục 11.

## 2. Thứ tự nạp script (ràng buộc cứng)

```
comic → vfx → enemies → 10-roster → 11-skills → 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08
      → 09-character-system → 12-energy → 13-enemy-definitions → 14-enemy-framework → 15-encounter-system
      → 16-world-state → 17-world-poi → 18-story-quest → combat → ui → inline <script> (index.html) → opening
```
13–18 (M2–M6) bọc trong IIFE (không thêm tên global nào ngoài các `window.*` export có chủ đích). 15 cần
`Interactable` (01) và được `initThree()` (04) gọi qua `window.initEncounters()` sau `createInteractables()`;
04 gọi tiếp `initWorldPoi()` rồi `initStoryQuest()` (cả hai idempotent), TRƯỚC `loadGameData()/applySaveData()`.

Các file chia sẻ **global scope** (top-level `const`/`function` của classic script) và `window.*`.
Nhiều hàm được gọi chéo qua `window.xxx` với guard `if (window.xxx)`. Đổi thứ tự nạp là rủi ro cao.

## 3. Luồng ứng dụng

```
window.onload → runOpeningFlow() (opening.js)
  Logo → Title (Start) → [Name popup nếu chưa có save] → Door intro → Open door → Loading (giả lập)
  → enterGameplay() → window.startGameplay() (index.html, chạy 1 lần)
       → initThree(): scene, world, camps, chests, quest board, initParty(), encounter, vùng Alpha (M4), nhiệm vụ (M6)
       → loadGameData() → applySaveData()   (SAU khi world đã dựng xong) → SaveSystem.reportLoadIssue() (M5)
       → animate() loop
Skip Opening (setting đã lưu) → thẳng enterGameplay()
Pause: Paimon/Esc → togglePauseMenu()  (chặn update; KHÔNG render — M1; huỷ input chiến đấu đang giữ)
Main loop: animate() lấy 1 dt duy nhất = min(clock.getDelta(), MAX_FRAME_DELTA = 0.1) cho MỌI hệ thống (M1)
  trong `if (dt > 0)`: physics → combat → effects → camps → vòng enemies[] (update; gỡ quái chết/`pendingRemoval`)
  → updateEnemyProjectiles(dt) → updateEncounters(dt) (M2/M3) → updateWorld(dt) (M4/M6) → nhạc combat
  updatePhysics: sau va chạm ngang → clampPlayerToPlayArea (M4, biên ±47) → snap mặt đất
Return to title: confirmQuitToTitle() → saveGameNow() → runReturnToTitleFlow() (không reload trang)
Death: enterDeadState() → death screen → confirmRevive() → playerRespawn()
```

## 4. Nhân vật & Party

- **Roster (dữ liệu)**: `CHARACTER_ROSTER[id]` — `baseStats`, `weapon.type`, `talents` (scaling/impact theo
  category), combo stages (windup/active/recovery, `hits[]` cho sword), charged attack, `visualConfig`
  (`vfxElement`, `attackTrailColor`, `weaponAccentColor`).
- **Skill/Burst (dữ liệu)**: `SKILL_LIBRARY[skillId]` — `effectType`/`behavior`, cooldown, holdThreshold,
  `energyGeneration {particles, hitsPerParticle, element}`.
- **Dispatch**: `executeCharacterSkill` / `executeCharacterBurst` → hàm `run*Effect` → đẩy effect vào
  `player.activeEffects.{skill,burst,arrows}` → `updateActiveEffects(dt)` (09) tick + cleanup.
- **Party**: `PARTY_CONFIG` = 4 slot. Hiện tại:

| Slot | id | Vũ khí | Nguyên tố | Ghi chú |
|---|---|---|---|---|
| 1 | `traveler_hydro` | Sword | Hydro | baseline |
| 2 | `archer_test` | Bow | Pyro | aim, decoy, pyro zone |
| 3 | `polearm_test` | Polearm | Electro | Thunder State, Coordinated Attack, Overwatch |
| 4 | `anemo_sword` (Windstep) | Sword | Anemo | vortex pull, stationary field, Tailwind |
| (roster) | `claymore_counter` (Ironwake) | Claymore | Physical (placeholder) | Counter Stance (giữ E), Earthsplitter |
| (roster) | `catalyst_electro` (Veyla) | Catalyst | Electro | orb NA, CA nổ tại mục tiêu, Violet Arc tap/hold, Lightning Rose |

Roster có 6 nhân vật chơi được; đội mặc định vẫn là #1–#4, #5/#6 thêm qua Paimon Menu › Party.

### Loại vũ khí (GI-CHAR-05-06)
`getActiveWeaponCategory()` trả `sword | bow | polearm | claymore | catalyst`. Helper:
`isBladeWeaponCategory` (sword + claymore: đường `hits[]`, vệt chém, slash wave) và
`isProjectileWeaponCategory` (bow + catalyst: NA qua `applyBowArrowSpawnTick` + TargetAssist, không lao người).
`combo[i].arrows[]` có thể khai báo thông số projectile: `gravity, drag, maxLifeTime, stuckLifeTime,
visual:'orb', color, element (khoá VFX), hitboxSize, sweep` (sweep = dò va chạm dọc đường bay, chống xuyên).
`hits[]` của NA/CA có thể khai báo `hitstop`, `shake`; hit CA có `center:'target'` (+`targetRange`,
`fallbackDistance`) để AoE đặt tại mục tiêu. Talent mới đọc qua category `'talent:<đường.dẫn>'`.

### Held Skill (09 — `inputMode: 'held'`)
Skill có `inputMode:'held'` bắt đầu NGAY khi nhấn (không qua Aim Mode): `beginHeldSkill` → cập nhật mỗi frame →
`releaseHeldSkill('release'|'expire')` khi thả phím/touchend/touchcancel hoặc hết `held.maxHold` →
`cancelHeldSkill('switch'|'dead')`. Mỗi lần kích hoạt resolve đúng 1 kết quả; tự hết giờ nên không bao giờ kẹt.
Trong lúc giữ: chặn NA/Burst/Skill khác, `held.moveMultiplier` giảm tốc chạy. Kết quả ghi `window.heldSkillLog` (debug).

### INCOMING ATTACK CONTRACT (Counter)
`window.interceptIncomingAttack(attacker, {kind, attackId, unblockable})` được gọi ĐÚNG lúc đòn địch chắc chắn
trúng player — trả `true` = đòn bị chặn (không trừ HP/đẩy lùi). Từ M2 chỉ có 1 nơi gọi:
`window.applyEnemyAttackToPlayer()` (enemies.js), đường dùng chung của cú lao Slime và mọi đòn quái M2 (chém
cận chiến `kind:'melee'`, đạn `kind:'projectile'`, cú nện hạng nặng). Va chạm thân dummy, rơi độ cao,
`unblockable:true` không được chặn.

- `partyState[i]` giữ state riêng từng thành viên (stats object, level, exp, energy, skillCooldownTimer,
  overwatchTimer, tailwindTimer, mesh refs). `player` là "cửa sổ" của thành viên active: `player.stats`
  **trỏ chung** object stats của member; `player.level/exp` là **bản sao** (chép ngược khi switch/save).
- `switchToCharacter(i)` → `canSwitchCharacter()` → `performCharacterSwap(prev, i)`: gọi
  `onCharacterSwitchedOut(prevId)` (dọn effect on-field), huỷ đòn thường/CA đang dở, đổi "cửa sổ" player,
  `spawnSwitchCue`, `onPartyChanged('switch')`. Cooldown của **mọi** thành viên tick trong
  `updateSkillCooldown` (combat.js) — off-field vẫn hồi.
- **Quy tắc chặn đổi nhân vật** (`canSwitchCharacter()` — nguồn duy nhất, HUD cũng đọc):
  `dead` · `burst_state` (Burst State #3) · `burst_cast` (đang vung Burst dạng activation của #3) ·
  `plunge`. Đòn thường/CA **không** chặn mà bị huỷ khi đổi; đang giữ nút Attack thì đếm giữ lại từ 0.
  Slot trống / trùng nhân vật active → từ chối.

### Party API (`window.Party`, file 02 — Task 74821)

Nguồn sự thật: `partyState` (đúng 4 phần tử, `null` = slot trống) + `activeCharacterIndex`.
`PARTY_CONFIG` chỉ là đội hình mặc định (khởi tạo / fallback). Nhân vật bị gỡ khỏi đội được giữ trong
bench (theo id) cùng level/exp/HP/energy/cooldown/mesh — thêm lại là khôi phục nguyên trạng. Chưa có hệ
thống sở hữu/unlock: "available" = mọi entry chơi được trong `CHARACTER_ROSTER`.

| Hàm | Mô tả |
|---|---|
| `Party.CAPACITY` | 4 |
| `Party.getSlots()` | ảnh chụp chỉ-đọc `[{index, characterId, name, element, isActive, level, hp, maxHp, energy, maxEnergy, skillCooldown}]` (slot trống: `{index, characterId: null}`) |
| `Party.getIds()` / `getActiveIndex()` / `getActiveMember()` | đọc đội hình / nhân vật active |
| `Party.getAvailableCharacterIds()` | nhân vật có thể xếp vào đội |
| `Party.getRosterEntries()` | roster cho UI: `[{id, name, element, region, weaponType, level, inParty, slot, isActive}]` (đọc CHARACTER_ROSTER + runtime, không sao chép định nghĩa) |
| `Party.previewActiveId(ids)` | nhân vật sẽ điều khiển nếu commit(ids) — cùng quy tắc với commit |
| `Party.validate(ids)` | `{valid, errors[{code, slot, id}], normalized}` — code: `not_array`, `over_capacity`, `unknown_character`, `duplicate_character`, `empty_party` |
| `Party.commit(ids, {lenient?, fromLoad?})` | áp đội hình (strict mặc định: có lỗi → từ chối). Trả `{ok, reason?, errors, activeIndex}`; `reason`: `invalid` / `busy` (đang bị chặn đổi nhân vật mà thay đổi làm mất nhân vật active) |
| `Party.setSlot(i, id\|null)` | gán / thay / xoá 1 slot (trùng slot khác → `duplicate_character`) |
| `Party.swapSlots(a, b)` | đổi chỗ 2 slot (nhân vật active giữ nguyên, chỉ đổi số slot) |
| `Party.switchTo(i)` / `Party.canSwitch()` | đổi nhân vật / hỏi được đổi không (`{ok, reason}`) |
| `window.onPartyChanged(kind)` | callback sau mọi thay đổi (`'switch'` hoặc `'composition'`) — HUD đăng ký ở ui.js |

**Paimon Menu › Party** (Task 92641, ui.js `renderPartySetup`, ô menu đổi tên Team → Party trong
index.html): 4 slot + lưới roster. Chỉ giữ **bản nháp** ids trong lúc chỉnh; "Áp dụng" gọi `Party.commit()`,
"Hoàn tác" hoặc đóng menu thì bỏ nháp. Tương tác chạm/click: chọn slot → chọn nhân vật (chưa trong đội = đặt
vào/thay; đã ở slot khác = đổi chỗ); không chọn slot → nhân vật trong đội = chọn slot của họ, ngoài đội = vào
slot trống đầu tiên. "Gỡ khỏi đội" không cho gỡ thành viên cuối. Badge "Đang điều khiển" / "Sẽ vào sân" /
"Mới". 1 listener uỷ quyền gắn 1 lần; CSS riêng `#party-setup-styles` (không phụ thuộc Tailwind JIT).

Luồng menu Party (tham khảo cho mở rộng): đọc `getSlots()` + `getAvailableCharacterIds()` → sửa bản nháp trong menu →
`validate(nháp)` để báo lỗi → `commit(nháp)` → HUD tự vẽ lại qua `onPartyChanged`. Nếu nhân vật active
bị gỡ, slot đầu tiên có người vào sân qua đúng đường đổi nhân vật. Save lưu `partySlots` + `partyBench`;
save cũ không có `partySlots` giữ đội mặc định.

## 5. Combat pipeline

```
Input → attack/skill state (windup → active → recovery)  [animation, KHÔNG gây damage]
  → hit tick rời rạc (NA stage / hits[] / effect pulse / projectile collision)  [collision]
  → resolveMeleeHitCollision (cone hoặc circle) / AABB projectile
  → getTalentScaling(category) → calculatePlayerToEnemyDamage()
  → enemy.takeDamage(dmg, dir, isHydro, withDamageSource(impact, character))   [damage event]
       → recordDamageEvent(target, amount, impact)   // DAMAGE EVENT CONTRACT
       → HP, damage number, flash
       → resolveHitReaction(impact, poise)  → knockback / interrupt / launch   [impact & poise]
  → EnergySystem.generateParticles(...) theo energyGeneration của nguồn        [energy]
  → VFX (vfx.js) — không bao giờ gây damage                                    [presentation]
```

- **Chống trùng hit**: mỗi đòn có hit list riêng (`hasHitList`, `swordHasHitList`, per-effect key set).
- **Impact types**: light / medium / heavy / launch → `IMPACT_TYPE_CONFIG`; **weight class**:
  light 22 / medium 65 / heavy 120 / massive 250 (`WEIGHT_CLASS_CONFIG`). Không có poise tích lũy — mỗi hit
  được xét độc lập.
- **DAMAGE EVENT CONTRACT**: mọi vật nhận sát thương phải gọi `window.recordDamageEvent(this, amount, impact)`
  ở đầu `takeDamage` (tăng `damageEventSeq`). Các cơ chế "proc" (Coordinated Attack #3, hạt năng lượng)
  đọc sequence này, **không** đọc HP.
- **Nguyên tố**: chỉ ở mức định danh (`element` trong roster/skill, `vfxElement`). Damage event mang cờ
  `isHydro` (boolean, chỉ đổi màu flash). Không có aura/status/reaction.
- **Player nhận damage** (M2): `window.applyEnemyAttackToPlayer(attacker, opts)` (enemies.js) là đường DUY NHẤT
  cho đòn của Slime và quái M2: đã gục → `'ignored'`; `invulnTimer > 0` → `'invulnerable'`; Counter #5
  (`interceptIncomingAttack`) → `'countered'`; còn lại `calculateFinalDamage(opts.atk ?? attacker.stats.atk, def)`
  → HP, `invulnTimer` 0.8s, flash/âm/số/rung, đẩy lùi từ `opts.origin`, `staggerTimer`, HP 0 → `enterDeadState`
  → `'hit'`. Mỗi lần gọi = 1 đòn (caller tự đảm bảo 1 lần/đòn qua cờ/attackId). Dummy vẫn có contact damage
  riêng ở 08 (damage ≤ 0 → bỏ qua hoàn toàn — M1); quái M2 và Slime không có contact damage.

## 6. Kẻ địch & Camp

- `class Slime` (small: light/poise 22; large: heavy/poise 120) — AI: idle → prep/jump (lang thang) →
  chase → attack_prep (telegraph) → attack_jump → attack_land → chase; `hitReaction`.
  Di chuyển bằng `jumpVelocity` + `knockback` (**không** tích phân `velocity.x/z`) — lực kéo từ skill phải đi
  qua `applyControlledPull()` (09; #4 Vortex/Tempest, #1 Water Bubble từ M1).
  `restMeshScale` (scale gốc, khôi phục sau Hydro squash) và `dispose()` (gỡ khỏi scene + giải phóng đúng
  tài nguyên GPU chụp lúc tạo) — M1.
  **Dây neo camp (M4, KI-125)**: khi lang thang ở trạng thái idle (và lúc chọn hướng nhảy idle → prep), Slime của
  camp ở xa hơn `spawnRadius + 1.5 m` sẽ quay hướng về tâm camp (`campHomeAngle`, ±0.3 rad). Chỉ ảnh hưởng lang
  thang — phát hiện, đuổi, tấn công, số liệu không đổi.
- `class Enemy` — dummy bất tử (HP 999999) tại (-6,-18) và (16,22).
- Camps: `CAMP_CONFIGS` (camp_a/b/c, composition small/large) + `campStates` (`phase` active/respawning,
  `cleared`, `spawnQueue`). Chu kỳ: dọn sạch → chest unlock → mở chest → respawning 90s → spawn lần lượt.
- Nhiều nơi phụ thuộc cờ `isSlime` (cleanup, nhạc combat, chest, spawn cap, save purge, ally alert).
  Quái M2 có `isFieldEnemy` (không có `isSlime`) nên KHÔNG bị các nhánh đó đụng tới (camp, chest, quest
  `onEnemyKilled('slime')`, spawn cap); 08 chỉ thêm 2 điểm: bỏ contact damage cho `isFieldEnemy`, nhạc combat
  đọc `isEngagingPlayer` của cả hai loại.

### Enemy framework (M2 — `game/14-enemy-framework.js`, dữ liệu ở `game/13-enemy-definitions.js`)
- **Định nghĩa** (`ENEMY_DEFINITIONS[id]`): `archetype` (melee | ranged | heavy), `stats` {hp, atk, def}, `level`,
  `weightClass`, `size`, `movement` {moveSpeed, turnRate, detectRange, leashRange}, `attack` {…theo archetype},
  `rewards` {exp}, `visual` {màu}. `normalizeEnemyDefinition()` điền mặc định an toàn, kẹp số ngoài khoảng,
  sửa cặp sai (preferredMin > preferredMax…) và cảnh báo 1 lần/id (`[EnemyFramework]`). Id không tồn tại /
  vị trí NaN → `spawnFieldEnemy()` trả `null`, không spawn gì.
- **FieldEnemy** (phần dùng chung, giữ ĐÚNG giao diện ngầm của Slime mà mọi đòn người chơi dùng — position,
  alive, aabb, width/height/depth, mesh/bodyMesh, isLarge, poise, level, stats/hp/maxHp, velocity, knockback,
  isGrounded, alignToGround, takeDamage, update, dispose → 6 nhân vật đánh được mà không sửa code combat):
  - Vòng đời `unspawned → spawning (0.7s, chưa đánh) → active → dying (0.6s) → despawned`;
    `despawned → spawning` chỉ qua `respawn()`. Bảng `LIFECYCLE_TRANSITIONS` chặn chuyển sai.
  - Trạng thái chiến đấu `idle / approach / reposition / telegraph / attack / recover / stagger / return`
    (`COMBAT_TRANSITIONS`): `attack` chỉ tới từ `telegraph`, chỉ thoát sang `recover`; telegraph bị chặn khi
    `attackCooldown > 0`; chỉ `active` mới vào được trạng thái chiến đấu.
  - Mục tiêu: chọn lại 4 lần/giây (không mỗi frame): Decoy #2 (`window.activeDecoy`) trong tầm thì ưu tiên,
    không thì player (còn sống, trong detect/leash); mất mục tiêu → huỷ telegraph → `return` về home.
  - Di chuyển: steering có giảm tốc khi tới nơi, xoay theo `turnRate`, tách nhau giữa quái M2,
    `resolveStaticCollisions`, kẹp biên ±45, bám mặt đất.
  - Nhận damage: CÙNG thứ tự `Slime.takeDamage` — `recordDamageEvent` (1 event/đòn) → HP (nguồn sự thật duy
    nhất, `Math.max(0, round)`) → số damage → thanh máu → flash → `resolveHitReaction(impact, poise)`: ngắt
    (stagger, huỷ telegraph) khi reaction báo `interrupt` VÀ trạng thái cho phép (không ngắt khung `attack`,
    `spawning`, `dying`). Damage 0/âm/NaN/không phải số → HP không đổi, không NaN (vẫn là 1 damage event như
    Slime). Đã chết/đã dọn → return ngay, không side effect nào.
  - Chết: `die()` 1 lần (cờ) → `onDeath` listeners (encounter) → thưởng `REWARD_HANDLERS.exp` 1 lần →
    `dying` → `pendingRemoval` → 08 gọi `dispose()` + gỡ khỏi `enemies[]`. `despawn()` (dọn cưỡng bức) không
    thưởng, không bắn sự kiện chết. `dispose()` idempotent: gỡ mesh/telegraph, giải phóng geometry/material
    riêng, huỷ đạn còn bay, xoá listener/tham chiếu.
- **ENEMY_ARCHETYPES** (phần riêng, object nhỏ — hình khối, telegraph, ra đòn, dáng):
  melee = hình quạt khoá hướng + 1 lần kiểm tra trúng + lao ngắn; ranged = giữ khoảng cách, lùi khi bị áp sát,
  vệt ngắm theo mục tiêu rồi KHOÁ trước khi bắn, đạn bay thẳng (né được); heavy = vòng tròn khoá tại chỗ,
  telegraph dài, AoE, hồi chiêu dài (cửa sổ phản công).
- **Đạn của quái**: tối đa 24 viên, geometry dùng chung + material cache theo màu; va chạm theo thứ tự Decoy →
  player (qua `applyEnemyAttackToPlayer`; `invulnerable` thì bay xuyên) → vật cản → mặt đất → hết tầm; chủ không
  còn `active` → đạn bị huỷ (quái chết không gây damage).

### Encounter (M3 — `game/15-encounter-system.js`)
- **Định nghĩa** (`ENCOUNTER_DEFINITIONS[id]`): `beacon` {x,z}, `arena` {x, z, leaveRadius, leaveGrace, fightRadius}
  (quái nhắm người chơi trong `leaveRadius + 2` quanh tâm nhưng tự di chuyển chỉ trong `fightRadius` — `moveRadius`
  của FieldEnemy — để trận gọn, không trôi sang vùng camp Slime),
  `spawnInterval`, `spawns[]` {enemyId, x, z}, `completion: 'defeat_all'`, `rewards` {firstClear[], repeat[]}.
  `normalizeEncounterDefinition()` bỏ phần hỏng, lỗi nặng (không phải object / không có spawn hợp lệ) → không
  start được (`invalid_definition`), không throw. Chưa hỗ trợ nhiều wave.
- **Trạng thái** (`ENCOUNTER_TRANSITIONS`): `inactive → starting → active → completing → completed`;
  `starting/active → failed`; mọi trạng thái ≠ inactive `→ resetting → inactive`. `start()` khi đang bận →
  `busy`; từ completed/failed → reset rồi start lượt mới (`runId++`).
- **Theo dõi**: Map chỉ chứa quái do lượt này spawn (đăng ký trùng bị từ chối); sự kiện chết lọc theo `runId`,
  idempotent; quét 4 lần/giây quái bị gỡ/dispose ngoài ý muốn → tính "đã rời trận"; hết quái mà chưa hạ
  con nào → tự reset (không thưởng).
- **Thắng**: `completing` (1s) → thưởng qua `REWARD_HANDLERS` đúng 1 lần/lượt; `firstClear` chỉ 1 lần mãi mãi
  (cờ đặt TRƯỚC khi gọi handler, lưu trong save) → `completed`. **Thua**: player gục (hệ thống chết có sẵn,
  không thêm phạt) hoặc ở ngoài `leaveRadius` quá `leaveGrace` giây → dọn quái + đạn → `failed`.
- **Kích hoạt**: `EncounterBeacon extends Interactable` (cột sáng) — phím F / nút chạm tương tác có sẵn;
  bán kính tương tác = 0 khi đang bận + chặn 1s sau mỗi lần đổi trạng thái → không kích hoạt lặp.
- Không khoá thế giới (không tường, không khoá input); mọi dọn dẹp chạy trong `updateEncounters()` sau vòng
  update quái — không sửa `enemies[]` giữa vòng duyệt.

## 7. World, Interaction, Quest, Inventory

- Terrain 100×100 (−50..50) procedural. **M4**: người chơi bị giữ trong ±47 (`clampPlayerToPlayArea`, 16) —
  không còn đi ra mép rồi rơi xuống void (KI-205); nhắc "Phía trước là vực sâu" tối đa 1 lần/5 s. Nhánh
  rơi-xuống-void → teleport về spawn vẫn còn (dự phòng). **KI-122 đã sửa (M4)**: mesh mặt đất đặt đỉnh theo
  `getTerrainHeight(vx, −vy)` → mặt đất nhìn thấy = mặt đất va chạm (test `m4/world.js` W10: lệch < 0.1 m ở 144 điểm).
  Collision: AABB (`obstacles` = `CLIMB_WALL_CONFIGS`, 17 khối đá/núi + 2 khối Tháp Canh — M4). Chữ khối "WELCOME…" ngoài map
  (`DECORATIVE_TEXT_WALL_CONFIGS`) chỉ là hình ảnh, không va chạm (M1). Props (cây, đá…) **không** có collision.
- `Interactable` base: bán kính tương tác trên mặt phẳng; mỗi frame chọn `nearbyInteractable` gần nhất;
  F / nút `#interact-prompt-btn` → `interactWithNearbyObject()` — điểm vào DUY NHẤT (M4): trả `true/false`, bỏ qua
  khi pause/hội thoại/đuối nước/chết, vật `pendingRemoval` hoặc bán kính 0, `isAvailable()` (tuỳ chọn) = false, và
  cùng 1 vật trong 300 ms (F giữ tự lặp, click + touch cùng lúc) → mỗi lần bấm = 1 lần kích hoạt.
- **Vùng Alpha (M4, 17)** — dữ liệu trong `ALPHA_REGION`: Trinh sát Arin (0.6, −8, NPC giao nhiệm vụ, cửa Nam khu
  cắm trại) → 4 đèn lồng dẫn đường → Tháp Canh Cổ (6, −37; cao ~7.8 m + tinh thể; 2 AABB → leo được bằng hệ leo có
  sẵn, đỉnh đứng được) + bia đá (6, −33; đọc qua khung hội thoại có sẵn) + Rương Tháp Canh (10.2, −35.6; khoá tới khi
  bia đã đọc, mở 1 lần) → quay về Bãi Đá Thử Thách (encounter M3, cột sáng (−4, −4)) → về lại Arin. 5 vùng khám phá:
  Tháp Canh (r 9), Đỉnh Tháp (r 2.4, chỉ khi đứng trên mái), Rừng Tây, Hồ Gương, Bãi Đá Thử Thách.
- **WorldState (16)** = nguồn sự thật duy nhất của tiến trình thế giới: `discovered` / `activated` / `opened` (Set
  id). Chỉ nhận id đã `registerId` (17 đăng ký) → save lạ không bơm được id rác. `WorldPoi.syncFromState()` khớp
  thế giới sau khi nạp (rương đã mở bị gỡ hẳn, bia đã đọc bớt sáng).
- **GameEvents (16)**: `on(type, fn) → off`, `off`, `emit` (listener lỗi bị cô lập), `listenerCount`. Set/loại →
  đăng ký lại cùng hàm là no-op. Sự kiện: `world:enter` (mỗi lần vào vùng), `world:discovered` (lần đầu),
  `world:interacted` (đọc xong bia), `world:chestOpened`, `encounter:started|completed|failed` (15),
  `quest:accepted|objectiveCompleted|completed|rewarded` (18). Hiện có đúng 3 listener (nhiệm vụ nghe
  world:enter / world:interacted / encounter:completed), không tăng qua Return to Title / mở menu.
- **Nhiệm vụ chính (M6, 18)** — `STORY_QUEST_DEFINITIONS.alpha_watchtower` "Ngọn Lửa Tháp Canh", 4 mục tiêu tuần tự:
  `reach` (world:enter vùng Tháp Canh) → `interact` (world:interacted bia đá) → `encounter` (encounter:completed
  alpha_trial) → `talk` (lựa chọn "Báo cáo" với Arin). Trạng thái `available → active(0..3) → completed → rewarded`;
  chỉ mục tiêu ĐANG hoạt động nhận sự kiện (mục tiêu tương lai không hoàn thành trước; sự kiện lặp không cộng).
  Thưởng (60 Nguyên Thạch, 80 EXP, 3 Táo) qua `REWARD_HANDLERS`, cờ `rewardClaimed` đặt TRƯỚC khi phát. Mục tiêu
  thiếu đích (vd encounter bị gỡ) → tracker ghi "(tạm thời chưa khả dụng)" + 1 cảnh báo, không crash. Hội thoại của
  Arin chọn kịch bản theo trạng thái (`offer` / `active_*` / `report` / `reward` / `done`).
- `WorldItem` (hoa/nấm/berry/táo — hồi sinh tại chỗ sau 60s; **loot rơi từ quái**: dùng 1 lần, tự biến mất
  sau 180s — M0.1), `Chest` (locked → unlocking → unlocked → opened), `QuestBoard`, `NPC` (Katheryne).
- Quest: `QUEST_DEFINITIONS` (data-driven, objective `kill` | `gather`), `QuestBoard` 2 slot
  (combat / gathering), lifecycle: instance trên board → `active` → `completed` → `turned_in` → cấp instance
  mới. Progress từ event thật: `onEnemyKilled(type)`, `onItemGathered`.
- Inventory: `ITEM_DATABASE` (5 material), `Inventory` (Map id → qty; add/get, **chưa có remove**).
- Reward: `REWARD_HANDLERS` (`primogem`, `material`, `exp`) — một đường cộng duy nhất cho mỗi loại.
- Progression: `LEVEL_CONFIG.expForLevel(L) = 50 + (L−1)·25`, `getScaledStats(baseStats, level)`,
  `checkLevelUp()`; EXP từ slime vào nhân vật active.

## 8. Save / Load

**Save v2 (M5)** — cùng ô lưu `localStorage['genshinFanGame_saveData_v1']` (tên khoá có sẵn), `version: 2`.
- Đọc: `SaveSchema.parse` (JSON hỏng → `malformed`; không phải object → `invalid_structure`; version không phải số
  nguyên / < 1 → `unsupported_version`; > 2 → `future_version`) → `migrate` (v1 → v2: giữ nguyên MỌI field v1,
  thêm `meta {schema 2, migratedFrom 1}`, `world` rỗng, `story` rỗng; tất định, áp lên v2 = bản sao y nguyên; bản
  v1 gốc sao lưu 1 lần vào `…_v1_backup`) → `sanitize` (kiểu + khoảng + id có thật: vị trí ±50 / y −20..80,
  Nguyên Thạch ≥ 0, thành viên party theo roster, level 1–90, item theo `ITEM_DATABASE` (trùng → giữ mục đầu),
  quest Bảng hợp lệ (đủ số → `completed`), camp có thật, settings trong khoảng; world/story kiểm sâu ở module sở
  hữu). Phần hỏng dùng mặc định của game + 1 dòng cảnh báo — không bịa tiến trình.
- Không đọc được: bản gốc sao lưu vào `…_unreadable_backup` (chỉ ghi khi nội dung khác) rồi chơi mới + báo 1
  lần. Phiên bản MỚI HƠN (hoặc hỏng mà sao lưu thất bại): **chặn ghi**, giữ nguyên ô lưu, hộp thoại "Chơi tiếp,
  không lưu" / "Bắt đầu hành trình mới (ghi đè)".
- Ghi: `saveGameNow()` trả `{ ok, … }` — `ok:false` khi đang reset / đang chặn / ghi lỗi (toast 1 lần mỗi chuỗi
  lỗi, toast khi ghi lại được); nội dung không đổi (bỏ qua `savedAt`) và ô lưu vẫn đúng bản đó → bỏ qua ghi
  (`unchanged`). `window.SaveSystem.getStatus()` cho trạng thái (writes, failures, blocked, notice…).
- Section v2 mới: `meta`, `world` (từ WorldState), `story` (từ StoryQuest: `{status, objectiveIndex,
  rewardClaimed}` theo id; nạp lại qua `sanitizeEntry`: `rewardClaimed` luôn thắng → không nhận thưởng 2 lần,
  chỉ số bị kẹp, trạng thái lạ bị bỏ). Nhiệm vụ Bảng vẫn ở `activeQuests`/`questSlots` (không trùng dữ liệu).
- Nguồn sự thật (không có bản sao mâu thuẫn): inventory = `playerInventory`; party = `partyState` + bench;
  rương camp = `campStates`; rương thế giới / bia / khám phá = `WorldState`; encounter = cờ của 15;
  nhiệm vụ chính = StoryQuest; nhiệm vụ Bảng = `activeQuests`.

Lịch sử (v1, trước M5):
- `localStorage['genshinFanGame_saveData_v1']`, `version: 1`.
- Lưu: vị trí/rotation, primogem, tên NGƯỜI CHƠI (`player.characterName` trong save = `player.playerName` —
  tách khỏi `CHARACTER_DATA.name` là tên nhân vật active, M1); `partySlots` (id theo slot) + `partyBench`; `party[]` (id, level, exp, stats, energy, reserved fields);
  `activeCharacterIndex` (khôi phục qua id); inventory; `activeQuests`; `questSlots`; `campStates`; settings.
- `encounters` (M3, key TUỲ CHỌN, save vẫn `version: 1`): `{ <encounterId>: { firstClearClaimed, clears } }` —
  chỉ ghi encounter đã có tiến trình; khi load kiểm kiểu từng field, key lạ bị bỏ qua (Map, không nhiễm
  prototype). Save cũ không có key → mặc định chưa nhận thưởng lần đầu.
- Không lưu: cooldown, effect đang chạy, slime HP/vị trí, quái M2 và trạng thái encounter đang chạy (reload
  giữa trận = encounter về `inactive`), trạng thái collectible tự nhiên.
- Autosave: `requestSave()` debounce 300ms theo sự kiện + 10s định kỳ + `beforeunload` + tab hidden; tắt
  trong Opening. Manual: khi Return to Title.
- M0.1: validate position/inventory khi load; save không đọc được được sao lưu vào
  `genshinFanGame_saveData_v1_unreadable_backup` trước khi bị ghi đè.
- Từ M5: autosave định kỳ 10 s KHÔNG ghi lại khi không có gì đổi; mọi thay đổi tiến trình M4–M6 (khám phá, bia,
  rương, nhiệm vụ) gọi `requestSave()` ngay khi xảy ra.

## 9. UI / HUD / Input

- HUD DOM (index.html + ui.js): HP, stamina ring, skill cooldown, burst energy, interact prompt, quest
  tracker, damage number (3D sprite trong vfx.js), `#thunder-hud` (chips Coordinated/Overwatch/Decoy/
  Tailwind/Tempest + Thunder State panel).
- Touch: joystick nổi (nửa trái), kéo camera (nửa phải), pinch zoom, nút attack (giữ = CA / aim cung),
  skill, burst (tap/hold), dash/sprint, jump/glide, drop, walk, interact.
- **Chọn bộ điều khiển (M7)**: `detectTouchPrimaryDevice()` (ui.js) theo con trỏ chính (`pointer: coarse`, hoặc có
  touch mà không có con trỏ fine) → `window.isMobile` + lớp `touch-ui` trên `<html>`. Laptop màn cảm ứng = PC.
- **Quy tắc cảm ứng (M7)**: mỗi nút Attack / Skill chỉ do 1 ngón sở hữu (`attackBtnTouchId`, `skillBtnTouchId`), chỉ
  ngón đó kết thúc; `touchcancel` = huỷ (`cancelHeldCombatInput('touchcancel')`), không phải thả tay; listener cảm
  ứng toàn cục (capture) gọi `releaseStaleTouches()` ở mỗi lần chạm — ngón không còn trong `e.touches` được nhả
  (joystick về chỗ nghỉ, đòn đang giữ bị huỷ); slot party nghe `touchstart` (ngón thứ 2 không sinh `click`); chạm
  vùng 3D bị bỏ qua khi hội thoại mở. Bố cục điện thoại + vùng an toàn (`--safe-*`, `viewport-fit=cover`) ở khối
  "Alpha M7" cuối `style/style.css`; joystick nghỉ ở `left: 84px` (phải cột nhân vật), cột slot co theo chiều cao.
- **HUD ghi DOM có điều kiện (M7)**: `hudText` / `hudToggle` / `hudStyle` (ui.js) chỉ ghi khi giá trị đổi — dùng cho
  mọi phần tử HUD cập nhật mỗi khung (HP, cooldown, Burst, prompt, bảng thông tin).
- **Party HUD** (ui.js, 1 renderer cho 2 biến thể, đọc `Party.getSlots()`): mobile = cột nút tròn trong
  `#party-switch-temp` (góc trên trái, giữ nguyên vị trí); PC = `#party-hud-desktop` (tạo bằng JS trong
  `#desktop-hud`) cột dọc sát mép phải (right 16px, căn giữa dọc), tên + vòng tròn + phím 1–4. Viền vàng =
  active, vạch HP, chấm màu = Burst sẵn sàng, mờ khi đang bị chặn đổi nhân vật; ẩn trên PC khi mở hội
  thoại. Chỉ ghi DOM khi giá trị đổi.
- **Encounter HUD** (M3, `#encounter-hud`, CSS tự chèn trong 15): thẻ giữa-trên màn hình (top 12px; màn thấp /
  ≤900px: 8px; ≤560px: 62px, dưới cụm nút góc trên), `pointer-events: none`, chữ ≥ 12px. Nội dung: tên thử
  thách + "Còn lại n/N" + chip từng quái (gạch khi đã hạ), cảnh báo rời khu vực (đếm ngược), thẻ CHIẾN THẮNG
  (thưởng hoặc "đã nhận thưởng lần đầu") / THẤT BẠI (lý do) tự ẩn sau 7s; gợi ý "nhấn F" (PC) / "chạm nút
  tương tác" (mobile). Chỉ ghi DOM khi nội dung đổi. Thanh máu quái: sprite trên đầu (như Slime), hiện khi ở gần.
- Desktop: WASD, chuột trái attack, E/Q, F, 1–4, Shift, Space, Ctrl, X, Esc, pointer lock.
- Mất focus / tab ẩn / mở Paimon Menu (M1): `releaseAllHeldInput()` (07) = xoá phím +
  `releaseTouchInputState()` (ui.js) + `cancelHeldCombatInput()` (combat.js: huỷ charge, Aim Mode, Held Skill —
  không ra đòn, không cooldown). M7 thêm: mở hội thoại, gục (`enterDeadState`), `touchcancel`; đổi nhân vật huỷ
  Aim Mode qua `cancelAimModeInput('switch')` (KI-111); nhả phím di chuyển luôn được xử lý kể cả khi pause / gục.
  Pointer lock đi qua `requestGamePointerLock()` (an toàn khi trình duyệt trả về `undefined`).
- Menu Paimon: 16 ô; chạy thật: Settings, Inventory, Character, Party, Skills overview, Comic, Info, **Quests (M6)**
  — trang "Nhiệm Vụ" chỉ đọc (`#menu-content-quests`, tạo bằng JS, vẽ lại mỗi lần mở từ StoryQuest +
  `activeQuests`): thẻ nhiệm vụ chính (trạng thái, tóm tắt, các bước xong/đang làm + gợi ý, phần thưởng) + danh sách
  nhiệm vụ Hiệp hội. Back / Esc như các trang khác. Còn lại mở placeholder "locked" (Map, Wish, Shop, …).
- **Quest tracker (M6)**: nhiệm vụ chính đứng đầu (viền vàng, "Tên · k/4", dòng mục tiêu, khoảng cách tới mục tiêu
  cập nhật 4 lần/s — chỉ ghi DOM khi số mét đổi), rồi các nhiệm vụ Bảng. Vẽ lại chỉ khi trạng thái đổi. Desktop:
  vị trí cũ (trái, 1/3 cao), toast phần thưởng dời xuống dưới tracker. Cảm ứng: hàng trên cùng, bên phải nút Paimon /
  cột đổi nhân vật / nút Đi bộ (không che điều khiển — KI-308); ẩn tạm khi thẻ Thử Thách chiếm hàng trên. M9: khi tracker
  cao (nhiều nhiệm vụ) `layoutQuestTracker()` đẩy nó sang phải cột nút Đi bộ / chỗ nghỉ joystick hoặc thu hẹp trước cụm nút
  bên phải; thông báo phần thưởng xếp dưới tracker, tránh cùng cột đó (KI-313, KI-339). Nút tương tác (F) trên cảm ứng: màn
  ngang < 736 px hoặc thấp ≤ 360 px đặt trong dải giữa cột joystick và nút Burst, ngay trên thanh HP (chữ dài cắt "…");
  màn dọc đặt trên thanh HP (CSS cuối `style.css`).
  Đánh dấu 3D: kim cương vàng + cột sáng trên mục tiêu hiện tại (depthTest off); '!' / '?' trên đầu Arin.

## 10. VFX & Audio

- vfx.js: `ELEMENT_VFX` (hydro/pyro/electro/anemo/physical), pool 180 chấm, `combatFx` (cap 160),
  helper ring/cone/strike/trail, damage number canvas riêng từng số, kích thước theo khoảng cách.
- Nhân vật opt-in VFX qua `visualConfig.vfxElement`; #3 giữ visual riêng.
- Audio: SFX tổng hợp WebAudio (`SoundFX`), nhạc `MusicManager` (file trong `assets/audio/…`),
  nhạc title `<audio>`. Không có file SFX.

## 11. Kiểm thử

`tools/tests/` (từ M1): Playwright (Chromium headless) — `npm test` chạy toàn bộ, README liệt kê từng file.
Harness tự dựng web server trên thư mục repo, thay CDN bằng bản local/stub (chạy offline), bỏ qua Opening
bằng save có `skipOpening`, chờ theo thời gian GAME (`waitSim`) thay vì thời gian thật. `GAME_ROOT` chạy test
trên 1 bản game khác (dùng để chứng minh test M1 FAIL trên build cũ). **Chưa kiểm trên thiết bị di động thật
hay ở 60 fps.** M2/M3 thêm nhóm `m2` (`npm run test:m2`: framework, archetype, encounter, UI, hiệu năng/dọn dẹp,
chơi thử bằng input thật). Test layout có thể dùng Tailwind thật offline: `launch({ tailwind: true })` phục vụ
`tools/tests/vendor/tailwind-3.4.17.css` (build sẵn từ class của game) thay cho stub rỗng. M4–M6 thêm nhóm `m4`
(`npm run test:m4`: world, save-v2, quest, journey, interrupted, ui-layout, perf, slime-leash). M7 thêm nhóm `m7`
(cảm ứng thật đa ngón qua CDP, bố cục 11 cỡ màn hình + giả lập tai thỏ, vòng đời tài nguyên, chi phí mỗi khung); M8
thêm nhóm `m8` (hành trình RC1 từ trạng thái sạch trên điện thoại + PC, save thật của build cũ, gián đoạn, kiểm tra
build).
