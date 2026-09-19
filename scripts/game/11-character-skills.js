// ============================================================
// 11-character-skills.js — SKILL LIBRARY (Alpha v1.0 — Character System Foundation)
// ============================================================
// MỤC ĐÍCH: nguồn dữ liệu TĨNH duy nhất mô tả TỪNG KỸ NĂNG có thể tồn tại trong game.
// File này CHỈ CHỨA DỮ LIỆU — không có hàm spawn/update/damage nào ở đây. Logic thực thi
// (spawn mesh, raycast, tính damage, dọn dẹp) thuộc về Combat Engine (file 09, sẽ xây ở bước
// sau), Engine đọc skillId từ CHARACTER_ROSTER rồi tra vào đây để biết "kỹ năng này làm gì".
//
// TRIẾT LÝ DATA-DRIVEN (khóa cứng từ Alpha v1.0 trở đi):
//   - Mỗi skill khai báo effectType — Alpha v1.0 CHỈ hỗ trợ đúng 2 loại:
//       'projectile' : một thực thể (mesh) di chuyển theo hướng bắn, tồn tại qua nhiều frame,
//                      Engine phải update mỗi frame (di chuyển, kiểm tra va chạm, hết tầm/hết
//                      thời gian thì tự dọn). Water Bubble (Burst) CŨNG thuộc loại này — nó
//                      không phải một effectType riêng, chỉ là 'projectile' với các field mở
//                      rộng tùy chọn (damageTickInterval, pull) mà executor projectile đọc
//                      thêm NẾU CÓ, bỏ qua NẾU KHÔNG. Small Shot (đạn nhỏ lúc Aim) cũng thuộc
//                      loại này nhưng KHÔNG có các field mở rộng đó.
//       'beam'       : instant hitscan — gây damage NGAY LẬP TỨC cho mọi enemy trên đường
//                      thẳng tại thời điểm bắn, hình ảnh chỉ là hiệu ứng tồn tại rất ngắn
//                      (fadeDuration) rồi biến mất, KHÔNG cần Engine update va chạm mỗi frame.
//   - KHÔNG được thêm effectType mới (orbit_aoe, pull_vortex, summon...) cho tới khi thực sự
//     có nhân vật cần cơ chế đó và đã được duyệt kiến trúc trước — tránh phình Engine sớm.
//   - Field nào chỉ 1-2 skill dùng (VD `pull`, `aim.tickEffect`) PHẢI là optional — Engine đọc
//     kiểu "nếu skillData.pull thì áp dụng logic hút" chứ không giả định field luôn tồn tại.
//   - Số liệu bên dưới copy NGUYÊN VẸN từ ELEMENTAL_SKILL_CONFIG / BURST_CONFIG hiện có trong
//     02-collision-and-stats-core.js — không đổi cân bằng, chỉ đổi NƠI LƯU và HÌNH DẠNG lưu.
//
// QUAN TRỌNG VỀ THỨ TỰ LOAD: file thuần dữ liệu, không đọc biến global nào lúc parse — an
// toàn ở bất kỳ vị trí nào miễn TRƯỚC file 09 (Character Engine). Ở giai đoạn hiện tại (combat.js
// CHƯA refactor), file này CHƯA được nơi nào require — tồn tại song song, không ảnh hưởng
// gameplay hiện có. ELEMENTAL_SKILL_CONFIG/BURST_CONFIG cũ trong file 02 vẫn là nguồn được
// combat.js dùng thật cho tới khi Engine mới (file 09) thay thế từng entry point.
//
// window export: SKILL_LIBRARY
// ============================================================

const SKILL_LIBRARY = {

    // --- HYDRO — PRESSURE SHOT (Elemental Skill của traveler_hydro) ---
    // Nguồn gốc số liệu: ELEMENTAL_SKILL_CONFIG trong 02-collision-and-stats-core.js.
    // Bao gồm cả Tap (bắn beam ngay) lẫn Hold/Aim (bắn liên tục small shot dạng projectile).
    hydro_pressure_shot: {
        id: 'hydro_pressure_shot',
        effectType: 'beam',

        // holdThreshold: thời gian (giây) giữ phím tối thiểu để chuyển từ Tap sang Hold/Aim.
        holdThreshold: 0.2,

        // Thông số INSTANT BEAM (Tap) — gây damage ngay lập tức cho mọi enemy trên đường thẳng.
        // Stat Baseline Update v1 — BUG FIX: damage TỪNG là 1.5 (hệ số phụ thời Talent v1 cũ, khi
        // talents.skill chỉ là 1 multiplier tùy ý). Từ khi Talent Scaling đổi sang % ATK THẬT của
        // Genshin (talents.skill.beam.scaling.multiplier = 1.893, tức 189.3% ATK, xem roster) —
        // nhân CHỒNG 1.5 lên số đó cho ra 283.95% ATK, GẦN GẤP ĐÔI baseline thật (sát thương cao
        // bất thường đã xác nhận là bug). Đặt = 1 (không nhân gì thêm) vì Talent% đã là con số ĐẦY
        // ĐỦ — field vẫn giữ lại (không xóa) để tương thích code đọc skillData.damage, nhưng không
        // còn vai trò "hệ số phụ" cho các skill đã có Talent % thật.
        damage: 1,
        maxRange: 32,             // Tầm xa tối đa (m) của tia
        beamRadius: 0.4,          // Bán kính (m) hình trụ tia — cũng là bán kính va chạm
        fadeDuration: 0.3,        // Thời gian (giây) hiệu ứng hình ảnh tồn tại trước khi biến mất
        recoilDistance: 1.2,      // Quãng đường (m) nhân vật bị đẩy lùi sau khi bắn
        recoilDuration: 0.01,     // Thời gian (giây) trải đều quãng đường recoil

        color: 0x22d3ee,
        cooldown: 7.0,             // Giây — dùng chung cho cả Tap và Hold (cooldown bắt đầu khi kết thúc)

        // energyGeneration: Core Energy + Elemental Particle System v1 (mục 11-12 spec) — thay thế
        // player.skillHitCount (VFX-only, KHÔNG cộng Energy) bằng cấu hình data-driven thật. Tách
        // biệt "Skill gây damage" khỏi "Skill tạo Particle" (mục 12): Particle KHÔNG sinh ra mỗi
        // hit, mà mỗi khi đủ hitsPerParticle hit (đúng ngưỡng skillHitCount cũ: Beam = 6, xem
        // runBeamEffect ở file 09) mới tạo particles particle 1 lần. Số liệu là PLACEHOLDER (mục 8,
        // 21) — particles/element/hitsPerParticle đều đọc từ đây, KHÔNG hard-code trong Engine.
        energyGeneration: {
            particles: 1,           // PLACEHOLDER — số Particle tạo ra mỗi lần đạt ngưỡng hitsPerParticle
            hitsPerParticle: 6,      // GIỮ NGUYÊN ngưỡng cũ của Beam (player.skillHitCount >= 6, file 09)
            element: 'hydro'
        },

        // aim: thông số riêng cho trạng thái Hold/Aim Mode (giữ phím) — bắn liên tục small shot
        // dạng projectile thay vì 1 phát beam duy nhất.
        aim: {
            maxDuration: 3.5,             // Thời gian tối đa (giây) được giữ Aim Mode
            fireInterval: 0.35,           // Khoảng cách (giây) giữa 2 lần bắn small shot liên tiếp
            cameraZoomDistance: 6.0,      // targetDistance camera khi đang Aim
            cameraSideOffset: 2.0,        // Lệch ngang (m) điểm camera nhìn tới khi Aim
            cameraOffsetLerpSpeed: 10.0,  // Tốc độ lerp offset camera (công thức 1-exp(-speed*dt))

            // tickEffect: mô tả MỖI viên đạn nhỏ bắn ra trong lúc giữ Aim — bản thân nó là 1
            // effect 'projectile' độc lập, Engine spawn lặp lại theo fireInterval ở trên.
            tickEffect: {
                effectType: 'projectile',
                // behavior: field DISPATCH — effectType 'projectile' bao gồm nhiều lifecycle rất
                // khác nhau về độ phức tạp (đạn bay đơn giản trúng-là-biến-mất VS quả cầu sống
                // lâu có pull/CC/damage-tick). 'behavior' KHÔNG phải effectType mới — nó chỉ nói
                // cho Engine (file 09) biết dùng implementation nào (runSmallShotEffect vs
                // runWaterBubbleEffect) mà không phải nhồi mọi lifecycle vào 1 hàm dài. Nếu thiếu
                // field này, Engine mặc định coi là 'small_shot' (an toàn ngược).
                behavior: 'small_shot',
                speed: 15.0,
                // Stat Baseline Update v1 — BUG FIX: cùng lý do như damage của Beam ở trên (0.4 x
                // 32.8% ATK thật = 13.12% ATK, THẤP HƠN baseline thật thay vì cao hơn — vẫn là bug
                // dù chiều ngược lại, vì con số 0.4 không còn ý nghĩa gì sau khi Talent% đổi sang
                // số Genshin thật). Đặt = 1.
                damage: 1,
                maxRange: 24,
                trailChance: 0.6,      // Xác suất/frame sinh hạt nước theo đường bay
                color: 0x22d3ee,

                // energyGeneration riêng cho tickEffect (Small Shot lúc Hold/Aim) — ngưỡng KHÁC Beam
                // (skillHitCount cũ dùng 3 cho Small Shot, 6 cho Beam, xem runSmallShotEffect/
                // runBeamEffect ở file 09) nên KHÔNG dùng chung entry energyGeneration của Beam.
                energyGeneration: {
                    particles: 1,
                    hitsPerParticle: 3,   // GIỮ NGUYÊN ngưỡng cũ (player.skillHitCount >= 3, file 09)
                    element: 'hydro'
                }
            }
        }
    },

    // --- HYDRO — WATER BUBBLE (Burst của traveler_hydro) ---
    // Nguồn gốc số liệu: BURST_CONFIG trong 02-collision-and-stats-core.js.
    // effectType 'projectile': quả cầu nước di chuyển liên tục, không phải effectType riêng dù
    // hành vi (hút CC, damage theo tick) phức tạp hơn Small Shot — pull/damageTickInterval là
    // field MỞ RỘNG TÙY CHỌN mà executor 'projectile' đọc thêm nếu có.
    hydro_water_bubble: {
        id: 'hydro_water_bubble',
        effectType: 'projectile',
        // behavior: xem giải thích đầy đủ ở hydro_pressure_shot.aim.tickEffect.behavior phía
        // trên. Water Bubble dùng implementation HOÀN TOÀN RIÊNG (runWaterBubbleEffect /
        // updateWaterBubbleEffect trong file 09) — không dùng chung luồng code với Small Shot,
        // vì lifecycle (mesh Group nhiều lớp, pull/CC, damage theo tick, điều kiện dừng theo
        // range/lifetime KHÔNG phụ thuộc va chạm) khác biệt quá lớn để gộp an toàn.
        behavior: 'water_bubble',

        speed: 2,                  // m/s — di chuyển chậm, khác hẳn tốc độ Small Shot
        lifetime: 14,               // Giây — tự biến mất nếu chưa hết trước đó
        maxRange: 12,                // Quãng đường tối đa (m) trước khi tự kết thúc
        radius: 1,                   // Bán kính (m) vùng va chạm/AOE của quả cầu
        // Stat Baseline Update v1 — BUG FIX: cùng lý do như Beam/Small Shot ở trên (0.5 x 101.9%
        // ATK thật = 50.95% ATK, THẤP HƠN nhiều baseline thật — bug tương tự, chiều ngược). Đặt = 1.
        damage: 1,
        damageTickInterval: 0.35,    // Giây giữa 2 lần gây damage liên tiếp cho CÙNG 1 enemy
                                      // (field mở rộng — chỉ effectType 'projectile' có AOE kéo
                                      // dài mới cần, Small Shot không dùng field này)

        color: 0x67e8f9,

        // pulse: hiệu ứng hình ảnh phồng/xẹp nhẹ theo thời gian — thuần visual, không ảnh hưởng
        // va chạm hay damage.
        pulse: { speed: 4.0, amount: 0.06 },

        // pull: field mở rộng tùy chọn — mô tả lực hút/CC áp dụng lên enemy trong bán kính.
        // Executor 'projectile' PHẢI kiểm tra field này tồn tại trước khi áp dụng logic hút —
        // các projectile khác (Small Shot, đạn tương lai của nhân vật khác) không có field này
        // và phải hoạt động bình thường khi thiếu nó.
        pull: {
            radius: 3,                       // Bán kính (m) vùng hút quanh quả cầu
            rotationSpeed: 10,                // Tốc độ xoay quanh tâm (dùng cho enemy nhỏ bị hút)
            smallEnemyForce: 3,               // Lực hút áp dụng cho enemy nhỏ
            largeEnemySlowFactor: 1,          // Hệ số làm chậm enemy lớn (không bị hút hẳn vào tâm)
            largeEnemyStaggerDuration: 0.3    // Giây stagger áp dụng cho enemy lớn khi vào vùng hút
        },

        cooldown: null   // Burst dùng điều kiện Energy đầy (canUseBurst), không dùng cooldown
                          // theo thời gian như Elemental Skill — giữ null tường minh thay vì bỏ
                          // field, để Engine/người đọc sau này không nhầm là thiếu sót dữ liệu.
    },

    // --- PYRO — DECOY BOMB (Elemental Skill của archer_test, Character #2) ---
    // Elemental Skill Validation: effectType MỚI 'decoy' — file 11 (comment đầu file) quy định
    // "KHÔNG thêm effectType mới cho tới khi thực sự có nhân vật cần cơ chế đó" — Decoy là entity
    // TỒN TẠI LÂU DÀI, ĐỨNG YÊN, CÓ HP RIÊNG, bị Enemy AI nhắm tới — khác hẳn bản chất 'projectile'
    // (di chuyển, tự dọn khi hết tầm/va chạm) và 'beam' (tức thời) đã có, nên hợp lệ để thêm mới
    // theo đúng điều kiện đó (không phải phá luật, mà là trường hợp luật cho phép mở rộng).
    //
    // Flow: Elemental Skill input -> Placement Mode (REUSE skillAimState/Aim Mode, xem
    // player.isDecoyPlacing trong combat.js) -> Confirm (Release) -> deployDecoy() spawn entity thật
    // (09-character-system.js) -> entity tự sống theo decoyConfig (roster) tới khi HP=0 hoặc hết
    // lifetime -> Explosion (AoE damage + Launch, reuse Combat Foundation).
    archer_decoy_bomb: {
        id: 'archer_decoy_bomb',
        effectType: 'decoy',

        // holdThreshold: ĐÚNG PATTERN hydro_pressure_shot — nhưng Decoy Bomb KHÔNG có nhánh "Tap"
        // có ý nghĩa riêng (không có action nào hợp lý để "bắn ngay không cần chọn vị trí" — Placement
        // Mode LÀ bản chất cốt lõi của skill này). holdThreshold = 0 nghĩa là vào Placement Mode
        // NGAY LẬP TỨC khi nhấn phím Skill (không cần giữ) — TÁI SỬ DỤNG nguyên cơ chế 'holding' ->
        // 'aiming' hiện có (updateSkillAim() tự chuyển phase khi heldTime >= holdThreshold, xem
        // combat.js), chỉ đặt threshold = 0 để bỏ qua cảm giác "phải giữ mới vào aim".
        holdThreshold: 0,

        cooldown: null, // đọc THẬT từ decoyConfig.cooldown (roster, theo NHÂN VẬT) — xem
                         // getActiveSkillAimConfig()/startSkillCooldown() dispatch trong combat.js,
                         // field này giữ null tường minh để không nhầm là thiếu sót dữ liệu (giống
                         // cách hydro_water_bubble.cooldown = null đã làm cho trường hợp tương tự).

        // aim: PLACEMENT MODE config — TÁI SỬ DỤNG NGUYÊN cameraZoomDistance/cameraSideOffset/
        // cameraOffsetLerpSpeed (Aim Mode hiện có), maxDuration là trần an toàn (không giữ Placement
        // Mode vô hạn — khác Bow Charged Attack CỐ Ý bỏ trần, vì Decoy Placement không có khái niệm
        // "charge level" cần giữ lâu, giữ lâu chỉ để ngắm vị trí nên trần thời gian vẫn hợp lý).
        aim: {
            maxDuration: 6.0,
            cameraZoomDistance: 7.0,
            cameraSideOffset: 1.5,
            cameraOffsetLerpSpeed: 8.0
        },

        // placementMaxRange: khoảng cách tối đa (m) từ Player mà vị trí đặt Decoy được chấp nhận —
        // spec mục 2 "Placement cần xác định vị trí HỢP LỆ trong World" — reticle raycast có thể trúng
        // điểm RẤT XA (VD nhìn lên trời/chân trời), placementMaxRange chặn việc đặt Decoy quá xa tầm
        // kiểm soát thực tế. PLACEHOLDER, chưa balance.
        placementMaxRange: 15,

        color: 0xdc2626, // Đỏ (Pyro) — dùng cho reticle placement + visual Decoy/Explosion placeholder

        // energyGeneration: Core Energy + Elemental Particle System v1 — Decoy Bomb CHƯA từng có
        // player.skillHitCount tương đương (explodeDecoy() gây AoE damage 1 lần, không phải chuỗi
        // hit theo tick) nên KHÔNG dùng hitsPerParticle — particles sinh ra 1 LẦN DUY NHẤT lúc nổ
        // (mục 12: "tạo Particle một lần dù có nhiều hit" — đây là trường hợp "1 hit AoE = 1 lần
        // generate", KHÔNG phải "mỗi hit riêng lẻ = 1 particle").
        //
        // Phase 4 — Energy/Kit Integration Review (Q&A đã chốt): particles TỪ 2 -> 3. Lý do: với
        // particles=2, ENERGY_CONFIG.particle.sameElement=3 (file 12, dùng CHUNG mọi nhân vật —
        // KHÔNG sửa ở đó để tránh ảnh hưởng Character #1), cooldown=12s (decoyConfig.cooldown, file
        // 10) và maxEnergy=42 (baseStats, Phase 2) -> nạp Energy chỉ ~0.5/giây, cần TỚI 7 lần Decoy
        // nổ trúng liên tiếp (~84 giây tối thiểu) mới đủ 1 lần Burst — CHẬM GẤP ĐÔI Character #1
        // (~1.0 Energy/giây qua Beam liên tục, đã tính toán so sánh) dù maxEnergy đã thấp hơn. Đây
        // không phải bug (Character #2 CHỈ có 1 nguồn Energy duy nhất, khóa cứng bởi cooldown — khác
        // bản chất so với Beam spam liên tục của Character #1) nhưng con số cụ thể quá cực đoan,
        // khiến Burst gần như không thể dùng trong gameplay thực tế. particles=3 đưa nhịp về ~0.75
        // Energy/giây (đầy trong ~56s, ~4.7 lần nổ trúng) — CHẬM HƠN Character #1 CÓ CHỦ ĐÍCH (vẫn
        // phản ánh đúng "Burst hiếm hơn, risk/reward gắn với việc Decoy phải thực sự hit" đã chốt từ
        // Elemental Skill Bugfix v1) nhưng không còn cực đoan tới mức Burst bất khả thi. VẪN LÀ
        // PLACEHOLDER — số liệu cuối chờ Phase 5 Balance dựa trên combat thực tế, con số này chỉ đưa
        // nhịp về vùng hợp lý để không chặn hoàn toàn việc test Burst ở các phase sau.
        // Phase 5 — Balance (cascading update): decoyConfig.cooldown TĂNG 12s -> 15s (file 10, lý do
        // xem comment ở decoyConfig — tạo GAP có chủ đích giữa 2 lần Decoy). Vì nhịp Energy phụ thuộc
        // TRỰC TIẾP vào cooldown này (Energy/giây = particles × sameElement / cooldown), particles
        // CẦN ĐIỀU CHỈNH LẠI theo — particles=3 (chốt ở Phase 4) với cooldown=15s chỉ còn ~0.6
        // Energy/giây, RỚT KHỎI target 0.7-0.8 đã chốt. Tăng particles: 3 -> 4 đưa nhịp về đúng 0.8
        // Energy/giây (đầy 42 Energy trong ~52.5s, ~3.5 lần nổ trúng) — vẫn trong target range, vẫn
        // chậm hơn Character #1 có chủ đích. VẪN LÀ PLACEHOLDER.
        energyGeneration: {
            particles: 4,   // PLACEHOLDER — xem giải thích nhịp Energy ở trên (Phase 5, cascading update)
            element: 'pyro'
        }
    },

    // --- PYRO — BLAZING VOLLEY (Elemental Burst của archer_test, Character #2) ---
    // Elemental Burst Validation: effectType MỚI 'aoe_zone' — Burst KHÔNG phải projectile di chuyển
    // (khác Water Bubble) và KHÔNG phải instant hitscan đường thẳng (khác Beam) — nó là 1 VÙNG ĐỨNG
    // YÊN phía trước Player, tồn tại 1 khoảng thời gian ngắn, gây NHIỀU damage event theo timeline
    // nội bộ (spec mục 3: "Burst không phải projectile đơn, là chuỗi AoE hit events"). Hợp lệ để
    // thêm effectType mới theo đúng điều kiện đã áp dụng cho Decoy ('decoy') trước đó — không có
    // effectType hiện tại nào khớp bản chất này.
    //
    // executeCharacterBurst() (09-character-system.js) dispatch effectType 'aoe_zone' ->
    // runPyroBurstZoneEffect() — TÁI SỬ DỤNG pattern hit-tracking "enemy.id + ':' + hitIndex" đã có
    // ở Charged Attack multi-hit (applyChargedAttackHitsTick(), combat.js) và pattern lưu state
    // riêng trong fx.custom đã có ở Water Bubble (runWaterBubbleEffect()).
    archer_pyro_burst: {
        id: 'archer_pyro_burst',
        effectType: 'aoe_zone',
        // behavior: dùng bởi updateActiveEffects() (file 09, dispatcher theo fx.skillData.behavior)
        // để rẽ nhánh update() đúng — ĐÚNG PATTERN 'water_bubble' đã có.
        behavior: 'pyro_burst_zone',

        energyCost: null, // Burst dùng điều kiện Energy ĐẦY (canUseBurst() check player.energy >= player.maxEnergy, KHÔNG dùng cooldown/energyCost riêng theo số — ĐÚNG PATTERN hydro_water_bubble, giữ null tường minh)
        cooldown: null,   // xem giải thích null ở hydro_water_bubble — Burst dùng Energy, không dùng cooldown thời gian

        // timing.duration: tổng thời gian (giây) vùng AoE tồn tại — hits[]/finalHit.time đo TỪ MỐC
        // NÀY (0 = ngay lúc Burst bắt đầu). PLACEHOLDER, chưa balance (spec mục 12 xác nhận).
        timing: { duration: 1.6 },

        // aoe: kích thước/orientation mặc định của vùng AoE — HÌNH NÓN phía trước Player (spec mục 2:
        // "AoE phía trước Player, định hướng theo hướng đang nhìn/aim TẠI THỜI ĐIỂM ACTIVATE, giữ
        // hướng đó xuyên suốt Burst — KHÔNG lock camera"). TÁI DÙNG chính xác thuật toán cone-check
        // "distance + forward.dot(toEnemy) > coneDot" đã dùng cho melee/Charged Attack — chỉ khác số
        // liệu (range xa hơn, cone rộng hơn — phù hợp AoE Burst thay vì melee).
        aoe: {
            range: 7,       // m — khoảng cách tối đa tính từ Player lúc activate
            coneDot: 0.3    // ngưỡng dot product — 0.3 ~ cone rộng ±72°, RỘNG HƠN melee (0.45 ~ ±63°) vì Burst là AoE diện rộng, không phải đòn đâm hướng hẹp
        },

        // hits: mảng data-driven (spec mục 3: "KHÔNG hard-code if (hitCount === 5), dùng cấu trúc
        // hits: [...]") — mỗi hit độc lập về timing/damageMult/impact, applyPyroBurstHitsTick()
        // (combat.js) duyệt mảng này, KHÔNG hard-code số lượng. `damageMult`: hệ số nhân PHỤ riêng
        // theo từng hit (ĐÚNG PATTERN skillData.damage của Water Bubble/Beam — nhân vào
        // talents.burst.scaling.multiplier TRƯỚC DEF mitigation), KHÔNG dùng field `scaling` đầy đủ
        // ở mỗi hit để tránh 2 lớp multiplier chồng chéo khó hiểu (base Talent% nằm ở
        // talents.burst.scaling, ĐỘ CHÊNH giữa các hit nằm ở damageMult). PLACEHOLDER, chưa balance.
        hits: [
            { time: 0.15, damageMult: 0.55, impact: { type: 'light' } },
            { time: 0.40, damageMult: 0.55, impact: { type: 'light' } },
            { time: 0.65, damageMult: 0.60, impact: { type: 'medium' } },
            { time: 0.90, damageMult: 0.60, impact: { type: 'medium' } }
        ],

        // finalHit: damage event RIÊNG, mạnh hơn (spec mục 8: "KHÔNG gộp Final Hit vào hit trước") —
        // AoE RỘNG HƠN các hit thường (finalHit.aoe ghi đè aoe mặc định ở trên, optional), Impact
        // 'launch' (spec mục 7-8: "Final Hit có thể dùng Launch").
        finalHit: {
            time: 1.25,
            damageMult: 1.4,
            impact: { type: 'launch' },
            aoe: { range: 8.5, coneDot: 0.2 } // rộng hơn hits[] thường — ±78° thay vì ±72°, PLACEHOLDER
        },

        element: 'Pyro', // spec mục 5: chỉ cần metadata, KHÔNG có Element Reaction nào đọc field này trong task này

        color: 0xea580c // Cam đỏ (Pyro) — dùng cho VFX placeholder
    },

    // --- ELECTRO — THUNDERCLAP RESONANCE (Elemental Skill của polearm_test, Character #3) ---
    // Reactive Off-field Electro Effect — effectType MỚI 'reactive_persistent' (KHÔNG khớp bất kỳ
    // effectType hiện có nào: không phải decoy vật lý-có-HP, không phải aoe_zone tự động tick theo
    // thời gian — đây là entity CHỈ phản ứng khi có Damage Event hợp lệ xảy ra, dùng HP polling thay
    // vì event hook thật (project không có hệ thống event/observer cho damage — xem
    // 12-energy-system.js/09-character-system.js, không nơi nào dùng callback/dispatchEvent cho
    // takeDamage) — polling enemy.hp giữa 2 frame + enemy.lastDamageSource (field mới, enemies.js)
    // để xác định "vừa có damage hợp lệ" mà KHÔNG cần sửa chữ ký takeDamage()).
    //
    // Sống trong window.activeElectroEffects[] (mảng riêng, ĐÚNG PATTERN activeDecoys[] — entity độc
    // lập khỏi activeCharacterIndex, KHÔNG dùng player.activeEffects vì effect này sống LÂU, bám theo
    // Active Character thay vì gắn với 1 lần cast, xem updateActiveEffects() dispatcher mới trong
    // 09-character-system.js).
    polearm_electro_reactive: {
        id: 'polearm_electro_reactive',
        effectType: 'reactive_persistent',

        cooldown: null, // đọc THẬT từ reactiveConfig.cooldown (roster, theo NHÂN VẬT) — ĐÚNG PATTERN
                         // archer_decoy_bomb.cooldown=null (dispatch qua decoyConfig.cooldown) — ở
                         // đây dispatch qua character.talents.reactiveConfig.cooldown (xem roster).

        // holdThreshold: KHÔNG khai báo — CỐ Ý (khác Decoy, holdThreshold=0 nghĩa là "luôn chuyển
        // sang Aim Mode ngay", SAI cho Reactive Effect vì nó không cần Aim Mode/Placement Mode gì cả
        // — kích hoạt tức thời như Beam của Character #1). Để trống -> getActiveSkillAimConfig()
        // fallback về ELEMENTAL_SKILL_CONFIG.holdThreshold mặc định (0.2s, xem 02-collision-and-
        // stats-core.js) -> Tap bình thường (nhả phím trước 0.2s) đi đúng nhánh Tap tức thời
        // (executeCharacterSkill(), combat.js) — KHÔNG bao giờ vào Aim Mode, ĐÚNG hành vi mong
        // muốn cho Reactive Effect.

        // reactiveConfig: số liệu THẬT của effect — snapshot lúc cast (ĐÚNG PATTERN decoyConfig, xem
        // 10-character-roster.js character.talents.reactiveConfig).
        color: 0xa855f7, // Tím-xanh Electro — dùng cho VFX placeholder Coordinated Attack proc

        element: 'electro' // metadata cho Energy Particle sinh ra khi proc — KHÔNG có Element
                            // Reaction nào đọc field này ở phase hiện tại (đúng phạm vi project)
    },

    // --- ELECTRO — THUNDER BURST (Elemental Burst của polearm_test, Character #3) ---
    // Elemental Burst Validation — effectType MỚI 'burst_state_activation'. KHÁC HẲN 'beam'/
    // 'projectile'/'aoe_zone' hiện có (cả 3 đều instant-trigger, không có windup/input-lock riêng) —
    // Character #3 Burst cần 1 STATE MACHINE PHỤ (burstActivationWindup -> burstActivationActive ->
    // Burst State kéo dài 6-8s) — đã xác nhận qua Integration Test (Phase 12) rằng KHÔNG effectType
    // nào hiện có tái dùng được nguyên trạng cho hành vi này.
    polearm_thunder_burst: {
        id: 'polearm_thunder_burst',
        effectType: 'burst_state_activation',

        energyCost: null, // Burst dùng điều kiện Energy ĐẦY (canUseBurst()) — ĐÚNG PATTERN archer_pyro_burst
        cooldown: null,

        // activationTiming: windup/active của Activation Attack (state machine phụ MỚI, xem
        // executeCharacterBurst() dispatch 'burst_state_activation' — combat.js/09-character-system.js).
        // Windup KHÓA HOÀN TOÀN movement/input (đã chốt qua Q&A — "giống windup của NA5" nhưng ở đây
        // là full lock, không phải giảm % như NA5).
        activationTiming: { windup: 0.20, active: 0.15 },

        // burstStateDuration: Burst State kéo dài BAO LÂU sau khi Activation Attack kết thúc.
        // PLACEHOLDER 7.0s (giữa 6-8s đã chốt).
        burstStateDuration: 7.0,

        element: 'Electro',
        color: 0x9333ea // Tím Electro đậm — VFX placeholder Burst Activation
    }

};

window.SKILL_LIBRARY = SKILL_LIBRARY;
