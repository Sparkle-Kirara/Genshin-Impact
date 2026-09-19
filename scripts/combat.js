// Talent System v2 — TÁCH RIÊNG 2 bước theo đúng pipeline KQM: Talent% × Stat = Raw/Base Damage,
// SAU ĐÓ Enemy DEF mitigation mới áp dụng — 2 bước ĐỘC LẬP, không gộp vào 1 hàm (v1 cũ gộp cả 2
// vào getTalentMultiplier(), tên gây hiểu nhầm vì thực chất đã trả về gần-Final-Damage). Từ v2:
//
//   getTalentScaling(character, category, comboIndex)
//       -> { stat, multiplier }  [CHỈ đọc config, KHÔNG đụng stats/damage]
//   calculatePlayerToEnemyDamage(character, scaling, enemy)
//       -> Final Damage  [tự đọc character.stats[scaling.stat] -> Raw Damage -> DEF mitigation]
//
// category: 'melee' | 'plunge' | 'lowPlunge' | 'highPlunge' | 'skillBeam' | 'skillTick' | 'burst'
// — ứng với talents.normalAttack.combo[comboIndex] (category 'melee', BẮT BUỘC truyền comboIndex
// 0-based), talents.normalAttack.{plunge,lowPlunge,highPlunge}, talents.skill.{beam,tick},
// talents.burst.
function getTalentScaling(character, category, comboIndex) {
    const talents = character && character.talents;
    // Fallback AN TOÀN NGƯỢC nếu thiếu talents/category: trả về scaling TƯƠNG ĐƯƠNG hành vi
    // player.attack.* cũ (luôn ATK, multiplier gốc melee=1/plunge=2/skill=1.5/burst=2.5) — game
    // KHÔNG BAO GIỜ crash hay gây damage 0/NaN dù thiếu data. skillBeam/skillTick/lowPlunge/
    // highPlunge KHÔNG có tương đương trong hệ cũ -> fallback multiplier=1 (an toàn, không phải 0).
    // Charged Attack v1: thêm 'chargedAttack' vào legacyMap (fallback multiplier=1, giống lowPlunge/
    // highPlunge — KHÔNG có tương đương trong hệ player.attack.* cũ vì action này chưa từng tồn tại).
    const legacyMap = { melee: 1, plunge: 2, lowPlunge: 1, highPlunge: 1, chargedAttack: 1, polearmMelee: 1, skillBeam: 1.5, skillTick: 1.5, burst: 2.5, coordinatedAttack: 0.5, thunderFinisher: 2, burstActivation: 1, burstStateMelee: 1, burstStateChargedAttack: 1.5 };
    const legacyScaling = { stat: 'ATK', multiplier: (player.attack && category === 'melee') ? player.attack.melee : (legacyMap[category] || 1) };

    if (!talents) return legacyScaling;

    let scaling = null;
    if (category === 'melee') {
        const combo = talents.normalAttack && talents.normalAttack.combo;
        scaling = (Array.isArray(combo) && combo[comboIndex] && combo[comboIndex].scaling) ? combo[comboIndex].scaling : null;
    } else if (category === 'plunge' || category === 'lowPlunge' || category === 'highPlunge') {
        const entry = talents.normalAttack && talents.normalAttack[category];
        scaling = (entry && entry.scaling) ? entry.scaling : null;
    } else if (category === 'chargedAttack') {
        // Charged Attack v2 (Multi-Hit): đọc talents.normalAttack.chargedAttack.hits[hitIndex].scaling
        // — MỖI hit trong hits[] có scaling RIÊNG (khác v1 cũ: object đơn {scaling} không mảng).
        // comboIndex ở đây thực chất là `hitIndex` (tham số CHUNG TÊN với category melee, giữ nguyên
        // tên tham số hàm để không đổi chữ ký — nhưng Ý NGHĨA khác nhau tùy category, đúng như cách
        // 'melee' đã dùng comboIndex để tra combo[] từ trước). KHÔNG dùng player.comboIndex (Normal
        // Attack) — Charged Attack có index multi-hit RIÊNG (player.chargedAttackElapsed dùng để xác
        // định hit nào đang chạy, xem updateCombat() file 08).
        const hits = getChargedAttackHits();
        scaling = (Array.isArray(hits) && hits[comboIndex] && hits[comboIndex].scaling) ? hits[comboIndex].scaling : null;
    } else if (category === 'polearmMelee') {
        // Character #3 (Polearm) Validation — Normal Attack Multi-Hit: đọc
        // talents.normalAttack.combo[player.comboIndex - 1].hits[hitIndex].scaling — KHÁC 'melee'
        // (Sword, đọc combo[comboIndex].scaling PHẲNG, comboIndex do CALLER truyền vào là
        // player.comboIndex-1) VÀ khác 'chargedAttack' (hits[] KHÔNG PHỤ THUỘC comboIndex nào, chỉ 1
        // chuỗi hits[] xuyên suốt). Ở ĐÂY: comboIndex tham số hàm = hitIndex (index TRONG hits[] của
        // ĐÚNG combo slot hiện tại — ĐÚNG PATTERN chargedAttack dùng lại tên tham số này), nhưng CẦN
        // THÊM player.comboIndex (đọc TRỰC TIẾP từ player, không qua tham số — giống 'chargedAttack'
        // đọc trực tiếp qua getChargedAttackHits() mà không cần thêm tham số hàm) để biết ĐANG Ở SLOT
        // NÀO của combo trước khi tra hits[]. KHÔNG đổi chữ ký hàm getTalentScaling() — giữ nguyên 3
        // tham số (character, category, comboIndex) cho MỌI category, nhất quán với thiết kế hiện có.
        const hits = getPolearmHitsForCombo(player.comboIndex);
        scaling = (Array.isArray(hits) && hits[comboIndex] && hits[comboIndex].scaling) ? hits[comboIndex].scaling : null;
    } else if (category === 'skillBeam') {
        scaling = (talents.skill && talents.skill.beam && talents.skill.beam.scaling) ? talents.skill.beam.scaling : null;
    } else if (category === 'skillTick') {
        scaling = (talents.skill && talents.skill.tick && talents.skill.tick.scaling) ? talents.skill.tick.scaling : null;
    } else if (category === 'skillDecoyExplosion') {
        // Elemental Skill Validation — category MỚI cho Explosion AoE của Decoy Bomb (archer_test).
        // Đọc talents.skill.decoyExplosion.scaling — TÁCH BIỆT khỏi skillBeam/skillTick (schema của
        // Character #1, ngữ nghĩa Instant Beam/Tick không khớp Explosion 1 lần của Decoy).
        scaling = (talents.skill && talents.skill.decoyExplosion && talents.skill.decoyExplosion.scaling) ? talents.skill.decoyExplosion.scaling : null;
    } else if (category === 'burst') {
        scaling = (talents.burst && talents.burst.scaling) ? talents.burst.scaling : null;
    } else if (category === 'coordinatedAttack') {
        // Character #3 Validation — Coordinated Attack proc damage (Reactive Skill). Đọc
        // talents.coordinatedAttack.scaling (đặt CÙNG CẤP với talents.normalAttack/talents.burstState
        // trong roster, KHÔNG lồng trong skill/burst — đây là damage source RIÊNG, độc lập cả 2).
        scaling = (talents.coordinatedAttack && talents.coordinatedAttack.scaling) ? talents.coordinatedAttack.scaling : null;
    } else if (category === 'thunderFinisher') {
        // Character #3 Validation — Thunder Finisher (climax Burst State). Đọc
        // talents.thunderFinisher.scaling.
        scaling = (talents.thunderFinisher && talents.thunderFinisher.scaling) ? talents.thunderFinisher.scaling : null;
    } else if (category === 'burstActivation') {
        // Character #3 Validation — Burst Activation Attack (đòn mở màn Burst, TRƯỚC Burst State).
        // Đọc talents.burstActivation.scaling.
        scaling = (talents.burstActivation && talents.burstActivation.scaling) ? talents.burstActivation.scaling : null;
    } else if (category === 'burstStateMelee') {
        // Character #3 Validation — Burst State Normal Attack (schema RIÊNG hoàn toàn khỏi
        // normalAttack thường — talents.burstState.normalAttack.combo[]). comboIndex = hitIndex
        // TRONG hits[] của slot hiện tại (player.comboIndex) — ĐÚNG PATTERN polearmMelee.
        const hits = getPolearmHitsForCombo(player.comboIndex, true);
        scaling = (Array.isArray(hits) && hits[comboIndex] && hits[comboIndex].scaling) ? hits[comboIndex].scaling : null;
    } else if (category === 'burstStateChargedAttack') {
        // Character #3 Validation — Burst State Charged Attack (schema object RIÊNG —
        // talents.burstState.chargedAttack.hits[]). comboIndex = hitIndex.
        const hits = (talents.burstState && talents.burstState.chargedAttack && Array.isArray(talents.burstState.chargedAttack.hits))
            ? talents.burstState.chargedAttack.hits : [];
        scaling = (hits[comboIndex] && hits[comboIndex].scaling) ? hits[comboIndex].scaling : null;
    }
    if (!scaling || typeof scaling.multiplier !== 'number') return legacyScaling;
    // Trả về BẢN SAO (không phải tham chiếu trực tiếp tới object trong CHARACTER_ROSTER) — nơi
    // gọi (VD runBeamEffect() nhân thêm skillData.damage vào multiplier) an toàn khi sửa giá trị
    // trả về mà KHÔNG vô tình mutate data gốc trong roster (mutate sẽ gây tích lũy sai qua nhiều
    // lần gọi liên tiếp — lỗi nghiêm trọng nếu không tách bản sao ở đây).
    return { stat: scaling.stat, multiplier: scaling.multiplier };
}
window.getTalentScaling = getTalentScaling;

// getTalentImpact(character, category, comboIndex): Hit Reaction / Poise System v1 — ĐÚNG PATTERN
// getTalentScaling() ở trên (cùng category/comboIndex, cùng vị trí trong talents.normalAttack.*),
// nhưng đọc field `impact` THAY VÌ `scaling` — impact.type quyết định Reaction Level TRẦN của đòn
// đánh (xem resolveHitReaction() bên dưới), HOÀN TOÀN ĐỘC LẬP với scaling/multiplier/damage (2 field
// riêng biệt trong cùng object combo[i]/plunge/hits[i] — "impact thuộc combat/talent data, KHÔNG
// thuộc animation data", yêu cầu đã xác nhận).
//
// Fallback AN TOÀN NGƯỢC: nếu character/talents/category/impact thiếu (VD nhân vật test #2 chưa có
// field impact trong combo[] — xem 10-character-roster.js) -> trả về { type: 'light' } (mặc định vô
// hại, KHÔNG bao giờ crash hay throw). KHÔNG tự ý gán 'heavy'/'launch' làm fallback — 'light' là mức
// yếu nhất, an toàn nhất khi thiếu data (tránh vô tình buff Reaction Level cho nhân vật chưa khai báo
// impact).
function getTalentImpact(character, category, comboIndex) {
    const defaultImpact = { type: 'light' };
    const talents = character && character.talents;
    if (!talents) return defaultImpact;

    let impact = null;
    if (category === 'melee') {
        const combo = talents.normalAttack && talents.normalAttack.combo;
        impact = (Array.isArray(combo) && combo[comboIndex] && combo[comboIndex].impact) ? combo[comboIndex].impact : null;
    } else if (category === 'plunge' || category === 'lowPlunge' || category === 'highPlunge') {
        const entry = talents.normalAttack && talents.normalAttack[category];
        impact = (entry && entry.impact) ? entry.impact : null;
    } else if (category === 'chargedAttack') {
        // Charged Attack v2 (Multi-Hit): ĐÚNG PATTERN getTalentScaling() ở trên — đọc
        // hits[hitIndex].impact thay vì object đơn cũ.
        const hits = getChargedAttackHits();
        impact = (Array.isArray(hits) && hits[comboIndex] && hits[comboIndex].impact) ? hits[comboIndex].impact : null;
    } else if (category === 'polearmMelee') {
        // Character #3 (Polearm) Validation — ĐÚNG PATTERN getTalentScaling() category 'polearmMelee'
        // ở trên (đọc player.comboIndex trực tiếp để xác định slot, comboIndex tham số = hitIndex).
        const hits = getPolearmHitsForCombo(player.comboIndex);
        impact = (Array.isArray(hits) && hits[comboIndex] && hits[comboIndex].impact) ? hits[comboIndex].impact : null;
    } else if (category === 'coordinatedAttack') {
        impact = (talents.coordinatedAttack && talents.coordinatedAttack.impact) ? talents.coordinatedAttack.impact : null;
    } else if (category === 'thunderFinisher') {
        impact = (talents.thunderFinisher && talents.thunderFinisher.impact) ? talents.thunderFinisher.impact : null;
    } else if (category === 'burstActivation') {
        impact = (talents.burstActivation && talents.burstActivation.impact) ? talents.burstActivation.impact : null;
    } else if (category === 'burstStateMelee') {
        const hits = getPolearmHitsForCombo(player.comboIndex, true);
        impact = (Array.isArray(hits) && hits[comboIndex] && hits[comboIndex].impact) ? hits[comboIndex].impact : null;
    } else if (category === 'burstStateChargedAttack') {
        const hits = (talents.burstState && talents.burstState.chargedAttack && Array.isArray(talents.burstState.chargedAttack.hits))
            ? talents.burstState.chargedAttack.hits : [];
        impact = (hits[comboIndex] && hits[comboIndex].impact) ? hits[comboIndex].impact : null;
    }
    // skillBeam/skillTick/burst: CHƯA có impact ở Alpha v1.0 (yêu cầu đã xác nhận — "Skill/Burst
    // chưa thêm Impact") — rơi thẳng về defaultImpact, không cần nhánh riêng.
    if (!impact || typeof impact.type !== 'string') return defaultImpact;
    return { type: impact.type };
}
window.getTalentImpact = getTalentImpact;

// calculatePlayerToEnemyDamage(character, scaling, enemy): Bước 2 của pipeline — tự đọc
// character.stats[scaling.stat] (ATK/HP/DEF, "HP" ám chỉ maxHp — xem giải thích statKey bên
// dưới) làm Raw Damage = statValue × multiplier, RỒI áp dụng Enemy DEF mitigation THEO CÔNG
// THỨC GENSHIN (phụ thuộc CHÊNH LỆCH LEVEL giữa attacker/enemy, KHÔNG dùng enemy.stats.def —
// xem báo cáo Phase 2/3 đã xác nhận) để ra Final Damage. Đây là hàm DUY NHẤT chịu trách nhiệm
// DEF mitigation cho chiều Player -> Enemy; chiều Enemy -> Player VẪN dùng calculateFinalDamage()
// (player.stats.def/(def+100)) như cũ, KHÔNG đổi.
function calculatePlayerToEnemyDamage(character, scaling, enemy) {
    // Talent System v2 — FIX QUAN TRỌNG: dùng ĐÚNG stats/level của `character` được TRUYỀN VÀO
    // (snapshot tại thời điểm gọi, do nơi gọi quyết định — VD lúc bắn cho Melee/Plunge/Beam tức
    // thời, hoặc lúc VA CHẠM cho Small Shot/Water Bubble projectile bay qua nhiều frame), THAY VÌ
    // tự tra partyState[activeCharacterIndex] (state HIỆN TẠI lúc hàm này chạy) — nếu người chơi
    // switch nhân vật giữa lúc đạn đang bay, dùng activeCharacterIndex sẽ SAI (tính nhầm theo
    // nhân vật MỚI thay vì nhân vật đã bắn ra đạn, phá nguyên tắc "Raw Damage đóng băng lúc bắn"
    // đã thống nhất). Tìm đúng member trong partyState theo character.id — AN TOÀN NGƯỢC: nếu
    // không tìm thấy (character null/id lạ), fallback về activeMember hiện tại.
    const matchedMember = character && character.id ? partyState.find(m => m && m.id === character.id) : null;
    const activeMember = matchedMember || partyState[activeCharacterIndex];
    const stats = activeMember ? activeMember.stats : player.stats; // an toàn nếu gọi ngoài lúc party chưa sẵn sàng

    const statKey = String((scaling && scaling.stat) || 'ATK').toLowerCase();
    // "HP" trong scaling ám chỉ maxHp (chỉ số NỀN TẢNG, không phải HP hiện tại đang dao động
    // theo combat) — dùng maxHp nếu statKey là 'hp', tránh damage tự đổi theo % máu còn lại của
    // CHÍNH NGƯỜI GÂY SÁT THƯƠNG (không phải cơ chế mong muốn ở Alpha v1.0).
    const statValue = (statKey === 'hp') ? (stats.maxHp || 0) : (stats[statKey] || 0);
    const multiplier = (scaling && typeof scaling.multiplier === 'number') ? scaling.multiplier : 1;
    const rawDamage = statValue * multiplier;

    const attackerLevel = (activeMember && activeMember.level) || 1;
    const enemyLevel = (enemy && enemy.level) || 1;
    // EnemyDefMult theo công thức Genshin — chưa có DefReduction/DefIgnore ở Alpha v1.0 (schema
    // sẵn sàng cho sau, xem calculatePlayerToEnemyDamage trong file 02 nếu cần mở rộng tham số).
    const defMult = (attackerLevel + 100) / ((attackerLevel + 100) + (enemyLevel + 100));

    return Math.max(0, Math.round(rawDamage * defMult));
}
window.calculatePlayerToEnemyDamage = calculatePlayerToEnemyDamage;

// ============================================================
// Hit Reaction / Poise System — Alpha v1.0
// ============================================================
// resolveHitReaction(impact, defenderPoise): hàm TRUNG TÂM duy nhất tính Reaction Level/Stagger/
// Interrupt/Knockback — nhận vào 2 tham số THUẦN DATA (impact của đòn đánh, poise của defender),
// KHÔNG phụ thuộc Slime/Enemy/loại vũ khí cụ thể nào — đúng nguyên tắc "so sánh Impact Strength với
// Poise Resistance/Weight Class -> Reaction Level -> tính duration/knockback/interrupt", KHÔNG
// hard-code kiểu "Sword -> 0.1s". Nơi gọi (Slime.takeDamage()/Enemy.takeDamage() trong enemies.js)
// CHỈ áp dụng kết quả trả về, không tự tính gì thêm.
//
// HP/DEF/Poise/Weight Class là 4 hệ thống ĐỘC LẬP (yêu cầu đã xác nhận) — hàm này KHÔNG đọc/ghi
// hp/maxHp/damage ở bất kỳ đâu, chỉ làm việc với poise/weightClass/impact thuần túy.
//
// impact: { strength, type, knockback } — type là TRẦN tối đa (maxReactionLevel trong
//   IMPACT_TYPE_CONFIG, file 02) cho Reaction Level, strength CHƯA dùng ở Alpha v1.0 (xem ghi chú
//   dưới), knockback là hệ số nhân lực đẩy do đòn đánh quyết định.
// defenderPoise: { weightClass, resistance } — weightClass tra WEIGHT_CLASS_CONFIG (basePoise,
//   knockbackMult), resistance là hệ số nhân THÊM riêng của từng entity (VD boss có thể có
//   resistance > 1.0 dù cùng weightClass với quái thường — field mở rộng, Alpha v1.0 luôn = 1.0 cho
//   Slime, xem enemies.js).
//
// Trả về: { level, staggerDuration, interrupt, knockbackForce, verticalForce }
//   level: 'none' | 'light' | 'medium' | 'heavy' | 'launch' — Reaction Level cuối cùng.
//   staggerDuration: giây, tra theo LEVEL (KHÔNG theo entity) — REACTION_LEVEL_CONFIG (file 02).
//   interrupt: boolean — true nếu AI phải hủy action hiện tại (dùng bởi Slime.update(), xem
//     enterIdleState() trong enemies.js).
//   knockbackForce: số nhân CUỐI CÙNG cho hướng đẩy NGANG (horizontal) — = impact.knockback ×
//     weightClass.knockbackMult × reactionLevel.knockbackScale — thay thế hoàn toàn
//     COMBAT_FEEL_CONFIG.enemyRecoilForce.normal/large cứng trước đây (field đó GIỮ NGUYÊN, không
//     xoá, chỉ không còn dùng trong takeDamage() — an toàn cho code khác lỡ đọc).
//   verticalForce: Phase Launch weightClass — lực đẩy THEO PHƯƠNG DỌC (m/s, cùng đơn vị/scale với
//     jumpVelocityY của Slime — xem enemies.js). = REACTION_LEVEL_CONFIG[level].launchVertical ×
//     WEIGHT_CLASS_CONFIG[weightClass].launchMult nếu level === 'launch', ngược lại LUÔN = 0 (mọi
//     reaction khác — none/light/medium/heavy — KHÔNG có thành phần dọc, đúng tham khảo KQM TCL:
//     chỉ Launch/Air impulse mới tách 2 thành phần Horizontal + Vertical). launchMult là modifier
//     RIÊNG theo weightClass, KHÔNG dùng chung số với knockbackMult (xem WEIGHT_CLASS_CONFIG, file
//     02). Nơi gọi (enterHitReactionState() trong enemies.js) chỉ set thẳng jumpVelocityY =
//     reaction.verticalForce khi cần — KHÔNG cộng dồn, theo đúng yêu cầu "reset, không juggle".
//
// GHI CHÚ Alpha v1.0: impact.strength hiện CHƯA đưa vào công thức (chỉ impact.type quyết định
// poiseDamage qua IMPACT_TYPE_CONFIG) — vì mọi impact data đã chốt (Normal #1-4/Charged/Plunge) chỉ
// khai báo "type", không có "strength" riêng theo yêu cầu. Field strength vẫn có trong schema (đúng
// đề xuất ban đầu) để sẵn sàng mở rộng sau (VD Talent nâng cấp làm tăng strength của 1 đòn cụ thể)
// mà không cần đổi lại chữ ký hàm — nhưng KHÔNG tự ý đưa vào công thức compute ở bản này (task yêu
// cầu không tự ý balance/mở rộng ngoài phạm vi đã chốt).
function resolveHitReaction(impact, defenderPoise) {
    const impactType = (impact && impact.type) || 'light';
    const impactCfg = IMPACT_TYPE_CONFIG[impactType] || IMPACT_TYPE_CONFIG.light;

    const weightClass = (defenderPoise && defenderPoise.weightClass) || 'medium';
    const weightCfg = WEIGHT_CLASS_CONFIG[weightClass] || WEIGHT_CLASS_CONFIG.medium;
    const resistance = (defenderPoise && typeof defenderPoise.resistance === 'number') ? defenderPoise.resistance : 1.0;

    const effectiveResistance = Math.max(0.0001, weightCfg.basePoise * resistance); // tránh chia 0
    const ratio = impactCfg.poiseDamage / effectiveResistance;

    // Dò ngược từ level mạnh nhất xuống — level đầu tiên có minRatio <= ratio là kết quả (thứ tự
    // order trong REACTION_LEVEL_CONFIG đã tăng dần, dò ngược để lấy level CAO NHẤT thỏa mãn).
    const order = REACTION_LEVEL_CONFIG.order;
    let level = 'none';
    for (let i = order.length - 1; i >= 0; i--) {
        const lv = order[i];
        if (ratio >= REACTION_LEVEL_CONFIG[lv].minRatio) { level = lv; break; }
    }

    // Áp TRẦN của Impact Type (maxReactionLevel) — level không bao giờ vượt quá trần dù ratio cao.
    const maxLevel = impactCfg.maxReactionLevel;
    if (order.indexOf(level) > order.indexOf(maxLevel)) {
        level = maxLevel;
    }

    const levelCfg = REACTION_LEVEL_CONFIG[level];
    const impactKnockback = (impact && typeof impact.knockback === 'number') ? impact.knockback : 1.0;
    const knockbackForce = impactKnockback * weightCfg.knockbackMult * levelCfg.knockbackScale;

    // verticalForce: Phase Launch weightClass — CHỈ level 'launch' có giá trị khác 0, mọi level
    // khác luôn = 0 (không đổi so với trước). Từ bản này, verticalForce ĐÃ nhân theo weightClass
    // (weightCfg.launchMult) — tương tự cách knockbackForce ở trên đã nhân weightCfg.knockbackMult
    // — để Large/Massive Slime bị launch THẤP hơn Small Slime khi cùng đạt level 'launch', khớp
    // đúng cảm giác "nặng hơn khó bị hất lên hơn". Đây là điểm khác so với thiết kế ban đầu (trước
    // đó verticalForce KHÔNG nhân gì, dùng thẳng launchVertical — xem lịch sử comment cũ), đã được
    // yêu cầu xác nhận thay đổi. launchMult là modifier RIÊNG, KHÔNG dùng chung số với
    // knockbackMult (xem giải thích đầy đủ tại WEIGHT_CLASS_CONFIG, file 02) — vì độ khó bị đẩy
    // ngang và độ khó bị hất dọc không nhất thiết cùng tỉ lệ.
    const verticalForce = (level === 'launch' && typeof levelCfg.launchVertical === 'number')
        ? levelCfg.launchVertical * weightCfg.launchMult
        : 0;

    return {
        level: level,
        staggerDuration: levelCfg.staggerDuration,
        interrupt: levelCfg.interrupt,
        knockbackForce: knockbackForce,
        verticalForce: verticalForce
    };
}
window.resolveHitReaction = resolveHitReaction;

// Character #2 Validation — Skill Aim Hardcode Fix v1: helper DÙNG CHUNG cho MỌI nơi cần đọc
// thông số Aim Mode (holdThreshold, aim.maxDuration/fireInterval/cameraOffsetLerpSpeed/
// cameraSideOffset/cameraZoomDistance) — TRƯỚC ĐÂY 7 nơi (combat.js + file 08) đọc THẲNG biến
// TOÀN CỤC ELEMENTAL_SKILL_CONFIG (hard-code riêng cho Traveler/Hydro), dù phần lớn logic khác
// trong cùng hàm ĐÃ chuyển sang đọc SKILL_LIBRARY[character.skillId] data-driven — tình trạng
// "nửa vời" khiến sửa aim.* trong file 11 cho nhân vật khác KHÔNG có tác dụng, code vẫn lặng lẽ
// dùng số của Traveler. Từ v1: đọc SKILL_LIBRARY[character.skillId] LÀM NGUỒN CHÍNH, fallback về
// ĐÚNG ELEMENTAL_SKILL_CONFIG (số liệu gốc, GIỮ NGUYÊN 100%) nếu nhân vật/skill thiếu field —
// đảm bảo game KHÔNG BAO GIỜ crash dù chạy MỖI FRAME trong updateCamera()/updateSkillAim().
function getActiveSkillAimConfig() {
    const character = getActiveCharacterData();
    const skillData = character ? SKILL_LIBRARY[character.skillId] : null;
    return {
        holdThreshold: (skillData && typeof skillData.holdThreshold === 'number') ? skillData.holdThreshold : ELEMENTAL_SKILL_CONFIG.holdThreshold,
        aim: {
            maxDuration: (skillData && skillData.aim && typeof skillData.aim.maxDuration === 'number') ? skillData.aim.maxDuration : ELEMENTAL_SKILL_CONFIG.aim.maxDuration,
            fireInterval: (skillData && skillData.aim && typeof skillData.aim.fireInterval === 'number') ? skillData.aim.fireInterval : ELEMENTAL_SKILL_CONFIG.aim.fireInterval,
            cameraOffsetLerpSpeed: (skillData && skillData.aim && typeof skillData.aim.cameraOffsetLerpSpeed === 'number') ? skillData.aim.cameraOffsetLerpSpeed : ELEMENTAL_SKILL_CONFIG.aim.cameraOffsetLerpSpeed,
            cameraSideOffset: (skillData && skillData.aim && typeof skillData.aim.cameraSideOffset === 'number') ? skillData.aim.cameraSideOffset : ELEMENTAL_SKILL_CONFIG.aim.cameraSideOffset,
            cameraZoomDistance: (skillData && skillData.aim && typeof skillData.aim.cameraZoomDistance === 'number') ? skillData.aim.cameraZoomDistance : ELEMENTAL_SKILL_CONFIG.aim.cameraZoomDistance
        }
    };
}
window.getActiveSkillAimConfig = getActiveSkillAimConfig;

// Character Foundation v2 — Dependency Fix (mục D.3): 2 hằng số fallback DÙNG CHUNG cho pose
// Sword lúc Attack khi nhân vật/đòn KHÔNG có animation.attack (VD test_character_anemo) —
// TRƯỚC ĐÂY cùng 2 giá trị này bị LẶP LẠI dưới dạng magic number ở 5 nơi khác nhau (combat.js +
// file 08), dễ lệch nhau nếu sau này cần đổi giá trị fallback mặc định. Từ v2: định nghĩa 1
// LẦN DUY NHẤT ở đây, mọi nơi đọc qua tên hằng số này. KHÔNG đổi giá trị số (giữ NGUYÊN 100% so
// với bản cũ) — chỉ gom nơi định nghĩa, không đổi hành vi.
const DEFAULT_SWORD_WINDUP_ROTATION = { x: -Math.PI / 2.2, y: -Math.PI / 6, z: Math.PI / 6 };
const DEFAULT_SWORD_ACTIVE_END_ROTATION = { x: Math.PI / 3.5, y: Math.PI / 2, z: -Math.PI / 6 };
window.DEFAULT_SWORD_WINDUP_ROTATION = DEFAULT_SWORD_WINDUP_ROTATION;
window.DEFAULT_SWORD_ACTIVE_END_ROTATION = DEFAULT_SWORD_ACTIVE_END_ROTATION;

// Charged Attack v1 — Giữ nút xuyên suốt combo: ngưỡng độ trễ (giây) để phân biệt "tap NHANH để
// nối combo bình thường" (tay chưa kịp nhả đúng lúc windup/active chuyển sang recovery/comboGrace)
// với "giữ có chủ đích để charge". CHỈ khi player.isAttackHeld vẫn true LIÊN TỤC trong suốt khoảng
// thời gian này (đếm bằng player.heldThroughComboTimer — xem updateCombat() trong file 08) mới
// thực sự bắt đầu charge. Giá trị đủ ngắn để người chơi charge thật không cảm nhận được độ trễ, đủ
// dài để lọc bỏ tap nhanh (yêu cầu đã xác nhận — bug trước: tap #2 để nối combo bị "cướp" thành
// charge nếu tay chưa kịp nhả đúng khung hình chuyển state).
const HELD_THROUGH_COMBO_DELAY = 0.10;
window.HELD_THROUGH_COMBO_DELAY = HELD_THROUGH_COMBO_DELAY;

// Character Foundation v2 — Dependency Fix (mục D.1): helper DÙNG
// CHUNG cho MỌI nơi cần đọc weaponGrip.rotation — TRƯỚC ĐÂY 5 nơi (combat.js + file 08) đọc
// getActiveCharacterData().visualConfig.weaponGrip.rotation TRỰC TIẾP, KHÔNG kiểm tra null —
// nhân vật thiếu field weaponGrip trong visualConfig sẽ CRASH ngay khi vào combat/idle (khác
// hẳn animation.attack/rightHandBaseRotation vốn đã có fallback an toàn từ trước). Từ v2: nếu
// thiếu weaponGrip, trả về rotation TRUNG LẬP (0,0,0 — kiếm không xoay, nằm thẳng theo hướng
// tay) thay vì crash. Traveler LUÔN có weaponGrip riêng trong roster nên fallback này KHÔNG
// BAO GIỜ kích hoạt cho Character #1 — hành vi Character #1 giữ nguyên 100%.
function getWeaponGripRotation() {
    const visCfg = getActiveCharacterData().visualConfig;
    const grip = visCfg.weaponGrip && visCfg.weaponGrip.rotation;
    return grip || { x: 0, y: 0, z: 0 };
}
window.getWeaponGripRotation = getWeaponGripRotation;

// ============================================================
// Character #2 (Bow) Validation — Weapon Dispatch Helper
// ============================================================
// getActiveWeaponType(): điểm tra cứu DUY NHẤT cho "nhân vật đang active dùng vũ khí gì" — mọi nơi
// cần rẽ nhánh melee/bow (triggerAttack()/updateCombat() ở file 08/handleAttackDown()) PHẢI đọc qua
// hàm này, KHÔNG tự ý so sánh character.id/character.weaponType rải rác. Fallback 'melee' nếu
// thiếu field (an toàn ngược 100% cho Character #1/test_character_anemo vốn có weaponType: null —
// hành vi melee cone-hit GIỮ NGUYÊN không đổi).
//
// Character #3 (Polearm) Validation — GIỮ NGUYÊN 100% return value/behavior (chỉ 'bow'|'melee'),
// KHÔNG đổi thành 3-way ('bow'|'melee'|'polearm') dù weapon.type giờ có thể là 'polearm'. Lý do:
// hàm này hiện được dùng ở các điểm dispatch "Aim Mode (Bow) vs Charge-tại-chỗ (mọi weapon khác)"
// (VD line ~1365/1146 file 08/combat.js) — Polearm CŨNG dùng Charge-tại-chỗ (không Aim Mode, đúng
// spec "Không copy Bow Aim Mode"), nên vẫn ĐÚNG khi rơi vào nhánh 'melee' ở NHỮNG CHỖ ĐÓ. Đọc thêm
// weapon.type (schema mới, song song weaponType cũ — xem CHARACTER_ROSTER) TRƯỚC weaponType cũ, cho
// phép roster dùng field mới mà hành vi Bow không đổi. Những chỗ CẦN phân biệt riêng Sword/Polearm
// (visual: player.sword.rotation/slashWave — Sword-specific, KHÔNG phải "melee nói chung"; và damage
// dispatch Normal Attack multi-hit) PHẢI dùng getActiveWeaponCategory() (hàm mới bên dưới), KHÔNG
// dùng hàm này.
function getActiveWeaponType() {
    const character = getActiveCharacterData();
    const wt = (character && character.weapon && character.weapon.type) || (character && character.weaponType);
    return (wt === 'bow') ? 'bow' : 'melee';
}
window.getActiveWeaponType = getActiveWeaponType;

// getActiveWeaponCategory(): NGUỒN SỰ THẬT CHI TIẾT HƠN getActiveWeaponType() — trả về đúng 1 trong
// 'sword' | 'bow' | 'polearm' (có thể mở rộng thêm sau — 'dualSword'/'crossbow'/... — KHÔNG giới hạn
// binary như getActiveWeaponType()). Đọc character.weapon.type (schema mới —
// {category,type,visualProfile,attackProfile}, xem CHARACTER_ROSTER) TRƯỚC, fallback
// character.weaponType (schema cũ, chỉ có 'bow'|null) NẾU weapon.type chưa khai báo, fallback cuối
// 'sword' (mặc định an toàn ngược 100% cho Character #1/test_character_anemo — cả 2 đều chưa có
// weapon.type lẫn weaponType='bow', vốn đã là Sword-behavior từ trước).
//
// DÙNG CHO: mọi dispatch cần phân biệt CHÍNH XÁC Sword vs Polearm vs Bow (visual mesh-specific code
// như player.sword.rotation/slashWave — vốn là hành vi ĐẶC THÙ SWORD, không phải "melee nói chung";
// và Normal Attack damage dispatch multi-hit của Polearm). KHÔNG dùng cho các dispatch "Bow vs mọi
// weapon khác" (Aim Mode, Charge-tại-chỗ) — những chỗ đó tiếp tục dùng getActiveWeaponType() như cũ.
function getActiveWeaponCategory() {
    const character = getActiveCharacterData();
    const wt = (character && character.weapon && character.weapon.type) || (character && character.weaponType);
    if (wt === 'bow') return 'bow';
    if (wt === 'polearm') return 'polearm';
    return 'sword';
}
window.getActiveWeaponCategory = getActiveWeaponCategory;

// getBowArrowsForCombo(comboIndex): trả về mảng arrows[] của SHOT comboIndex (1-based, ĐÚNG quy
// ước player.comboIndex hiện có) của nhân vật Bow đang active — hoặc mảng rỗng an toàn nếu thiếu
// data (KHÔNG crash). Dùng bởi applyBowArrowSpawnTick() (dưới) VÀ triggerAttack() (reset
// arrowsSpawnedThisShot theo đúng độ dài).
function getBowArrowsForCombo(comboIndex) {
    const character = getActiveCharacterData();
    const combo = character && character.talents && character.talents.normalAttack && character.talents.normalAttack.combo;
    const entry = Array.isArray(combo) ? combo[comboIndex - 1] : null;
    return (entry && Array.isArray(entry.arrows)) ? entry.arrows : [];
}
window.getBowArrowsForCombo = getBowArrowsForCombo;

// getPolearmHitsForCombo(comboIndex, isBurstState): ĐÚNG PATTERN getBowArrowsForCombo() ở trên,
// nhưng đọc talents.normalAttack.combo[comboIndex-1].hits[] (Polearm — spec mục 7: "1 animation
// nhiều hit") thay vì .arrows[] (Bow). Trả về mảng rỗng an toàn nếu thiếu data hoặc nhân vật không
// phải Polearm (Sword/Bow không khai báo .hits[] trong combo entry — KHÔNG đổi hành vi 2 weapon đó).
// Dùng bởi applyPolearmNormalAttackHitsTick() (dưới) VÀ triggerAttack() (reset polearmHitsTriggered
// theo đúng độ dài, xem file 08/combat.js chỗ reset comboIndex).
//
// Character #3 Validation — isBurstState (mới, mặc định false = KHÔNG đổi hành vi cũ): khi true,
// đọc talents.burstState.normalAttack.combo THAY VÌ talents.normalAttack.combo (schema RIÊNG hoàn
// toàn, đã chốt qua Q&A — "duplication data chấp nhận được, KHÔNG override từng field lẻ").
function getPolearmHitsForCombo(comboIndex, isBurstState) {
    const character = getActiveCharacterData();
    const naSource = isBurstState
        ? (character && character.talents && character.talents.burstState && character.talents.burstState.normalAttack)
        : (character && character.talents && character.talents.normalAttack);
    const combo = naSource && naSource.combo;
    const entry = Array.isArray(combo) ? combo[comboIndex - 1] : null;
    return (entry && Array.isArray(entry.hits)) ? entry.hits : [];
}
window.getPolearmHitsForCombo = getPolearmHitsForCombo;

// applyBowArrowSpawnTick(): chạy MỖI FRAME trong nhánh 'active' của updateCombat() (file 08) CHỈ
// khi getActiveWeaponType() === 'bow' — thay thế HOÀN TOÀN nhánh melee cone-hit (enemies.forEach +
// hasHitList) cho state đó, đi đúng pipeline spec mục 2: Attack -> Projectile -> Projectile
// Movement -> Collision -> Hit Event -> Damage (KHÔNG hard-code "attack thực hiện = damage chắc
// chắn xảy ra" — spawnArrow() chỉ TẠO đạn, damage do va chạm thực tế của chính arrow đó quyết định,
// xem updateArrowEffect() trong file 09).
//
// prog: tiến độ (0..1) của 'active' hiện tại (ĐÃ tính sẵn ở nơi gọi, dùng chung công thức với melee)
// — arrows[i].spawnTime là GIÂY tính từ lúc 'active' bắt đầu (đồng quy ước với hits[].time của
// Charged Attack Sword), so sánh trực tiếp với "activeTiming - player.attackTimer" (thời gian đã
// trôi qua trong active), KHÔNG dùng prog (0..1) để tránh sai số khi activeTiming thay đổi.
function applyBowArrowSpawnTick(activeElapsed, forward) {
    const character = getActiveCharacterData();
    const arrows = getBowArrowsForCombo(player.comboIndex);

    for (let i = 0; i < arrows.length; i++) {
        const arrowData = arrows[i];
        const spawnTime = (arrowData && typeof arrowData.spawnTime === 'number') ? arrowData.spawnTime : 0;
        if (activeElapsed < spawnTime) continue; // chưa tới lúc spawn arrow này
        if (player.arrowsSpawnedThisShot[i]) continue; // đã spawn rồi (chỉ spawn 1 lần/arrow)

        player.arrowsSpawnedThisShot[i] = true;

        // Character #2 (Bow) — scaling THẬT của arrow đọc TRỰC TIẾP từ arrowData.scaling (KHÔNG qua
        // getTalentScaling('melee',...) — đó là scaling của MELEE COMBO, sai ngữ nghĩa cho arrow dù
        // cùng nằm trong combo[] — mỗi arrow có scaling RIÊNG theo đúng spec mục 2 "Mỗi shot có
        // scaling riêng"). Fallback nếu arrowData thiếu scaling (an toàn ngược, KHÔNG crash).
        const arrowScaling = (arrowData && arrowData.scaling && typeof arrowData.scaling.multiplier === 'number')
            ? { stat: arrowData.scaling.stat, multiplier: arrowData.scaling.multiplier }
            : { stat: 'ATK', multiplier: 0.5 };
        const arrowImpact = (arrowData && arrowData.impact && typeof arrowData.impact.type === 'string')
            ? { type: arrowData.impact.type } : { type: 'light' };
        // Normal Attack Arrow Speed — data-driven hóa: đọc TRỰC TIẾP từ arrowData.speed (roster,
        // 10-character-roster.js) thay vì hard-code 24 như trước. Fallback về 24 nếu arrow không
        // khai báo speed riêng (an toàn ngược, không bắt buộc mọi shot phải có field này).
        const arrowSpeed = (arrowData && typeof arrowData.speed === 'number') ? arrowData.speed : 24;

        // Character #2 (Bow) Validation — Target Assist 3D (spec mục 5 "origin phải là vị trí spawn
        // THẬT của projectile, không phải center Player"): spawnPosition tính TRƯỚC, dùng LÀM origin
        // cho TargetAssist.getAimDirection() — đảm bảo aim direction luôn xuất phát đúng từ điểm arrow
        // thực sự xuất hiện (mũi cung/muzzle xấp xỉ), không phải player.position gốc.
        const spawnPosition = player.position.clone().addScaledVector(forward, 0.9).add(new THREE.Vector3(0, 0.9, 0));

        // Spec mục 4-6, 10: nếu có target hợp lệ (player.softTargetEnemy, chọn 1 lần lúc trigger —
        // xem triggerAttack()), tính hướng bắn ĐẦY ĐỦ 3D hướng thẳng tới target point (center AABB)
        // — KHÔNG re-tìm target giữa chừng shot (đúng "không homing", target CỐ ĐỊNH suốt shot dù
        // gọi getAimDirection() nhiều lần cho nhiều arrow). Nếu target đã chết/bị dọn giữa chừng shot
        // (enemy.alive false) hoặc không có target hợp lệ ngay từ đầu, getAimDirection() trả về
        // null-safe qua kiểm tra alive ở đây -> fallback về forward (2D, hướng player hiện tại) —
        // đúng Test 5 "không có target -> bắn theo hướng hiện tại của Player/attack direction".
        const validTarget = (player.softTargetEnemy && player.softTargetEnemy.alive) ? player.softTargetEnemy : null;
        const aimDirection = validTarget ? TargetAssist.getAimDirection(spawnPosition, validTarget) : null;
        const finalDirection = aimDirection || forward;

        spawnArrow(character, spawnPosition, finalDirection, arrowScaling, arrowImpact, { speed: arrowSpeed });

        sfx.playSwing(); // GIỮ NGUYÊN SFX hiện có — nợ kỹ thuật (chưa có SFX riêng cho Bow release), không thuộc phạm vi task
    }
}
window.applyBowArrowSpawnTick = applyBowArrowSpawnTick;

// Combo Window Config v1: trả về comboWindow (giây) của nhân vật đang active — đọc từ
// visualConfig.comboWindow (field MỚI, optional), fallback về DEFAULT_COMBO_WINDOW (file 02) nếu
// nhân vật không khai báo riêng. DÙNG CHUNG bởi triggerAttack() (combat.js) và updateCombat()
// (file 08) để đảm bảo 1 nguồn duy nhất — không tự đọc visualConfig.comboWindow rải rác nhiều
// nơi. comboWindow là 1 GIÁ TRỊ DUY NHẤT áp dụng cho toàn bộ combo của nhân vật (KHÔNG per-đòn,
// khác với timing.windup/active/recovery vốn định nghĩa riêng từng đòn — quyết định đã chốt).
function getComboWindow() {
    const visCfg = getActiveCharacterData().visualConfig;
    return (typeof visCfg.comboWindow === 'number') ? visCfg.comboWindow : DEFAULT_COMBO_WINDOW;
}
window.getComboWindow = getComboWindow;

// Charged Attack v1 -> v2: helper DÙNG CHUNG (giống getComboWindow() ở trên) — đọc
// visualConfig.chargedAttack riêng của nhân vật đang active, fallback về DEFAULT_CHARGED_ATTACK
// (file 02) cho MỖI field riêng lẻ nếu nhân vật không khai báo field đó (an toàn ngược, không
// crash cho nhân vật/character data chưa có config này). TẤT CẢ nơi cần chargeTime/staminaCost của
// Charged Attack PHẢI đọc qua hàm này — không hard-code rải rác.
//
// Multi-Animation + Multi-Hit v2: windup/active/recovery ĐÃ XOÁ khỏi hàm này — dùng
// getChargedAttackPhaseDuration(phase) bên dưới thay thế (tính từ tổng animation segment, không còn
// là 1 con số cấu hình riêng — tránh 2 nguồn dữ liệu lệch nhau).
function getChargedAttackConfig() {
    const visCfg = getActiveCharacterData().visualConfig;
    const cfg = visCfg.chargedAttack || {};
    return {
        chargeTime: (typeof cfg.chargeTime === 'number') ? cfg.chargeTime : DEFAULT_CHARGED_ATTACK.chargeTime,
        staminaCost: (typeof cfg.staminaCost === 'number') ? cfg.staminaCost : DEFAULT_CHARGED_ATTACK.staminaCost
    };
}
window.getChargedAttackConfig = getChargedAttackConfig;

// ============================================================
// Charged Attack v2 — Multi-Animation + Multi-Hit
// ============================================================
// Nguyên tắc: animations[] và hits[] là 2 DANH SÁCH ĐỘC LẬP HOÀN TOÀN (yêu cầu đã xác nhận) — không
// có quan hệ 1:1, không ràng buộc tổng thời lượng. animations[] nằm ở
// talents.normalAttack.chargedAttack.animations (KHÔNG phải visualConfig — animation của Charged
// Attack tiếp tục nằm CÙNG chỗ với Normal Attack/Talent data theo đúng convention đã có từ v1, xem
// getChargedAttackAnim() cũ). hits[] nằm ở talents.normalAttack.chargedAttack.hits (cùng chỗ
// scaling/impact cũ). Combat core (updateCombat(), file 08) CHỈ ĐỌC data và thực thi sequence —
// KHÔNG hard-code số lượng animation/hit ở bất kỳ đâu.

// getChargedAttackAnimations(): trả về TOÀN BỘ mảng animations[] của nhân vật đang active, fallback
// về DEFAULT_CHARGED_ATTACK.animations (file 02) nếu nhân vật chưa khai báo. KHÔNG BAO GIỜ trả về
// mảng rỗng/null (an toàn cho mọi nơi gọi .length/.filter).
//
// Character #3 Validation — Burst State dispatch: khi player.isBurstStateActive, đọc
// talents.burstState.chargedAttack THAY VÌ talents.normalAttack.chargedAttack — GIỮ NGUYÊN object
// schema (KHÔNG chuyển thành mảng, đã chốt qua Q&A "phải preserve cùng schema với CA gốc").
function getChargedAttackAnimations() {
    const character = getActiveCharacterData();
    const source = player.isBurstStateActive
        ? (character.talents && character.talents.burstState && character.talents.burstState.chargedAttack)
        : (character.talents && character.talents.normalAttack && character.talents.normalAttack.chargedAttack);
    const animations = source && Array.isArray(source.animations) ? source.animations : null;
    return (animations && animations.length > 0) ? animations : DEFAULT_CHARGED_ATTACK.animations;
}
window.getChargedAttackAnimations = getChargedAttackAnimations;

// getChargedAttackAnimsForPhase(phase): lọc animations[] CHỈ giữ segment thuộc đúng `phase`
// ('windup'|'active'|'recovery') — ĐÚNG THỨ TỰ khai báo trong mảng gốc (không sắp xếp lại). Dùng bởi
// updateCombat() (file 08) để biết CÓ BAO NHIÊU segment con cần chạy tuần tự trong 1 attackState —
// KHÔNG giới hạn số lượng (có thể 0, 1, hoặc N segment cho 1 phase).
function getChargedAttackAnimsForPhase(phase) {
    return getChargedAttackAnimations().filter(a => a && a.phase === phase);
}
window.getChargedAttackAnimsForPhase = getChargedAttackAnimsForPhase;

// getChargedAttackPhaseDuration(phase): tổng duration (giây) của TẤT CẢ segment thuộc `phase` —
// THAY THẾ hoàn toàn windup/active/recovery cố định cũ trong getChargedAttackConfig(). Nếu phase
// không có segment nào (mảng rỗng) -> trả về 0 (attackState đó sẽ chuyển ngay lập tức, không "đứng
// khựng" chờ 1 duration không tồn tại).
function getChargedAttackPhaseDuration(phase) {
    const segs = getChargedAttackAnimsForPhase(phase);
    let total = 0;
    for (let i = 0; i < segs.length; i++) {
        total += (typeof segs[i].duration === 'number') ? segs[i].duration : 0;
    }
    return total;
}
window.getChargedAttackPhaseDuration = getChargedAttackPhaseDuration;

// getChargedAttackAnimSegment(phase, indexInPhase): trả về ĐÚNG segment thứ `indexInPhase` (0-based)
// trong danh sách ĐÃ LỌC theo `phase`, kèm theo `startOffset` — pose "Start" THỰC SỰ cần dùng để nội
// suy liền mạch (KHÔNG "giật"): nếu đây là segment ĐẦU TIÊN của TOÀN BỘ chuỗi animations[] (không
// phải chỉ đầu tiên trong phase) -> startOffset = ĐỌC TRỰC TIẾP *.rightHandOffsetStart/
// rightHandRotOffsetStart/coreOffsetStart designer khai báo trong chính segment đó (fallback base
// {0,0,0} nếu field không tồn tại/không đúng shape — an toàn ngược); ngược lại (segment thứ 2 trở đi
// trong TOÀN chuỗi) -> startOffset = offsetEnd của segment NGAY TRƯỚC nó trong mảng animations[] GỐC
// (bất kể segment đó thuộc phase nào — VD segment cuối của 'windup' nối liền segment đầu của
// 'active') — ÉP BUỘC liên tục, BỎ QUA *.rightHandOffsetStart designer khai báo cho các segment này
// (nếu có khai báo, coi như dữ liệu thừa/không dùng tới — tránh giật hình do designer lỡ khai báo
// sai/không khớp segment liền kề). Trả về null nếu index vượt quá số segment của phase (hết phase —
// nơi gọi tự xử lý chuyển phase kế/kết thúc).
//
// LƯU Ý QUAN TRỌNG: chỉ segment ĐẦU TIÊN CỦA TOÀN CHUỖI animations[] (globalIndex === 0) mới đọc
// *Start từ data — MỌI segment khác (kể cả segment đầu tiên của 1 phase KHÔNG PHẢI windup, VD segment
// đầu của 'active' nối tiếp windup) đều BỊ ép buộc dùng End của segment trước, bất kể *.
// rightHandOffsetStart trong data của nó là gì.
function getChargedAttackAnimSegment(phase, indexInPhase) {
    const allAnims = getChargedAttackAnimations();
    const phaseSegs = getChargedAttackAnimsForPhase(phase);
    if (indexInPhase < 0 || indexInPhase >= phaseSegs.length) return null;

    const segment = phaseSegs[indexInPhase];
    const globalIndex = allAnims.indexOf(segment);

    let startOffset;
    if (globalIndex <= 0) {
        // Segment ĐẦU TIÊN của toàn chuỗi -> ĐỌC TRỰC TIẾP *Start designer khai báo trong CHÍNH
        // segment này (KHÔNG có "segment trước" nào để nối) — fallback base {0,0,0} cho từng field
        // riêng lẻ nếu thiếu/sai kiểu (an toàn ngược, không crash cho data cũ/thiếu field).
        startOffset = {
            rightHandOffset: segment.rightHandOffsetStart || { x: 0, y: 0, z: 0 },
            rightHandRotOffset: segment.rightHandRotOffsetStart || { x: 0, y: 0, z: 0 },
            coreOffset: segment.coreOffsetStart || { x: 0, y: 0, z: 0 }
        };
    } else {
        const prevSegment = allAnims[globalIndex - 1];
        startOffset = {
            rightHandOffset: prevSegment.rightHandOffsetEnd || { x: 0, y: 0, z: 0 },
            rightHandRotOffset: prevSegment.rightHandRotOffsetEnd || { x: 0, y: 0, z: 0 },
            coreOffset: prevSegment.coreOffsetEnd || { x: 0, y: 0, z: 0 }
        };
    }

    return { segment: segment, startOffset: startOffset };
}
window.getChargedAttackAnimSegment = getChargedAttackAnimSegment;

// getChargedAttackHits(): trả về TOÀN BỘ mảng hits[] của nhân vật đang active, fallback về
// DEFAULT_CHARGED_ATTACK.hits (file 02) nếu nhân vật chưa khai báo. KHÔNG BAO GIỜ trả về mảng rỗng.
// Character #3 Validation — Burst State dispatch: đọc talents.burstState.chargedAttack.hits khi
// player.isBurstStateActive (ĐÚNG PATTERN getChargedAttackAnimations() ở trên).
function getChargedAttackHits() {
    const character = getActiveCharacterData();
    const source = player.isBurstStateActive
        ? (character.talents && character.talents.burstState && character.talents.burstState.chargedAttack)
        : (character.talents && character.talents.normalAttack && character.talents.normalAttack.chargedAttack);
    const hits = source && Array.isArray(source.hits) ? source.hits : null;
    return (hits && hits.length > 0) ? hits : DEFAULT_CHARGED_ATTACK.hits;
}
window.getChargedAttackHits = getChargedAttackHits;

// applyChargedAttackAnimTick(phase, dt): hàm DÙNG CHUNG cho CẢ 3 nhánh chargedWindup/chargedActive/
// chargedRecovery (file 08) — advance player.chargedPhaseElapsed theo dt, TỰ ĐỘNG chuyển
// player.chargedAnimIndex sang segment kế tiếp khi segment hiện tại đã đủ duration (giữ phần dư thời
// gian, KHÔNG mất frame time), và NỘI SUY áp dụng rightHand/core lên player NGAY trong hàm này (dùng
// getChargedAttackAnimSegment() để lấy startOffset liền mạch). Model 1 index CHUNG cho toàn bộ N
// segment của phase — tránh viết lặp lại vòng lặp advance-segment 3 lần trong file 08.
//
// Trả về:
//   phaseFinished: true nếu ĐÃ CHẠY HẾT toàn bộ segment của phase (nơi gọi tự chuyển attackState kế
//     tiếp — side-effect khác nhau tùy phase nên KHÔNG xử lý ở đây, chỉ báo hiệu).
//   noSegments: true nếu phase này không có segment nào (0 segment) — nơi gọi nên chuyển state NGAY
//     lập tức mà không cần đợi animation gì (đúng yêu cầu "KHÔNG giới hạn số animation", bao gồm cả
//     trường hợp 0).
//
// KHÔNG đụng player.attackTimer — attackTimer TIẾP TỤC đóng vai trò "tổng thời gian còn lại của
// PHASE" (đếm ngược, GIỮ NGUYÊN pattern cũ để tương thích với buffer nối tiếp/stamina regen-delay
// đọc player.attackState — xem updateStamina()), trong khi chargedAnimIndex/chargedPhaseElapsed là
// CƠ CHẾ RIÊNG chỉ phục vụ animation nội bộ. 2 cơ chế chạy song song, cùng dt, không xung đột vì
// KHÔNG đọc/ghi chéo lẫn nhau.
function applyChargedAttackAnimTick(phase, dt) {
    const phaseSegs = getChargedAttackAnimsForPhase(phase);
    if (phaseSegs.length === 0) return { phaseFinished: true, noSegments: true };

    player.chargedPhaseElapsed += dt;

    // Advance qua các segment đã xong duration — dùng while (không phải if) để xử lý đúng trường hợp
    // dt lớn bất thường (frame lag) nhảy qua nhiều segment ngắn trong 1 frame, KHÔNG bỏ sót segment.
    while (player.chargedAnimIndex < phaseSegs.length) {
        const currentSeg = phaseSegs[player.chargedAnimIndex];
        const segDuration = (typeof currentSeg.duration === 'number') ? currentSeg.duration : 0;
        if (player.chargedPhaseElapsed < segDuration || segDuration <= 0) break;
        player.chargedPhaseElapsed -= segDuration;
        player.chargedAnimIndex++;
    }

    if (player.chargedAnimIndex >= phaseSegs.length) {
        // Hết toàn bộ segment của phase — SNAP lần cuối về đúng offsetEnd của segment CUỐI CÙNG
        // (tránh sai số cộng dồn từ phép nội suy nhiều frame — ĐÚNG nguyên tắc snap-lần-cuối đã áp
        // dụng cho Normal Attack/Charged Attack v1).
        const lastResult = getChargedAttackAnimSegment(phase, phaseSegs.length - 1);
        if (lastResult) {
            const visCfg = getActiveCharacterData().visualConfig;
            const e = lastResult.segment;
            player.rightHand.position.set(
                visCfg.rightHandPosition.x + (e.rightHandOffsetEnd ? e.rightHandOffsetEnd.x : 0),
                visCfg.rightHandPosition.y + (e.rightHandOffsetEnd ? e.rightHandOffsetEnd.y : 0),
                visCfg.rightHandPosition.z + (e.rightHandOffsetEnd ? e.rightHandOffsetEnd.z : 0)
            );
            const re = e.rightHandRotOffsetEnd || { x: 0, y: 0, z: 0 };
            player.rightHand.rotation.set(re.x, re.y, re.z);
            const ce = e.coreOffsetEnd || { x: 0, y: 0, z: 0 };
            player.core.position.set(
                visCfg.corePosition.x + ce.x,
                visCfg.corePosition.y + ce.y,
                visCfg.corePosition.z + ce.z
            );
        }
        return { phaseFinished: true, noSegments: false };
    }

    // Còn segment đang chạy — nội suy Start (liền mạch, xem getChargedAttackAnimSegment()) -> End
    // theo prog = chargedPhaseElapsed / duration của ĐÚNG segment hiện tại.
    const result = getChargedAttackAnimSegment(phase, player.chargedAnimIndex);
    if (!result) return { phaseFinished: false, noSegments: false }; // an toàn, không nên xảy ra

    const seg = result.segment;
    const start = result.startOffset;
    const segDuration = (typeof seg.duration === 'number' && seg.duration > 0) ? seg.duration : 0.0001;
    const prog = Math.min(1, player.chargedPhaseElapsed / segDuration);

    const visCfg = getActiveCharacterData().visualConfig;
    const endPos = seg.rightHandOffsetEnd || { x: 0, y: 0, z: 0 };
    const endRot = seg.rightHandRotOffsetEnd || { x: 0, y: 0, z: 0 };
    const endCore = seg.coreOffsetEnd || { x: 0, y: 0, z: 0 };

    player.rightHand.position.set(
        visCfg.rightHandPosition.x + start.rightHandOffset.x + (endPos.x - start.rightHandOffset.x) * prog,
        visCfg.rightHandPosition.y + start.rightHandOffset.y + (endPos.y - start.rightHandOffset.y) * prog,
        visCfg.rightHandPosition.z + start.rightHandOffset.z + (endPos.z - start.rightHandOffset.z) * prog
    );
    player.rightHand.rotation.set(
        start.rightHandRotOffset.x + (endRot.x - start.rightHandRotOffset.x) * prog,
        start.rightHandRotOffset.y + (endRot.y - start.rightHandRotOffset.y) * prog,
        start.rightHandRotOffset.z + (endRot.z - start.rightHandRotOffset.z) * prog
    );
    player.core.position.set(
        visCfg.corePosition.x + start.coreOffset.x + (endCore.x - start.coreOffset.x) * prog,
        visCfg.corePosition.y + start.coreOffset.y + (endCore.y - start.coreOffset.y) * prog,
        visCfg.corePosition.z + start.coreOffset.z + (endCore.z - start.coreOffset.z) * prog
    );

    return { phaseFinished: false, noSegments: false };
}
window.applyChargedAttackAnimTick = applyChargedAttackAnimTick;

// resolveMeleeHitCollision(enemy, playerPos, forward, hitShapeConfig): HÀM DÙNG CHUNG — thay thế 3
// đoạn code TRÙNG LẶP Y HỆT (applyChargedAttackHitsTick ở dưới, applyPolearmNormalAttackHitsTick ở
// dưới, và nhánh Sword melee trong updateCombat() file 08) từng tự viết lại chính xác cùng 1 logic
// "distance + forward.dot() cone check". Character #3 (Polearm) Validation — architecture change đã
// chốt qua Q&A: thêm hitShape MỚI ('circle') cho AoE 360° thật (Spinning Thrust/Burst Activation),
// đồng thời dọn dẹp 3 chỗ trùng lặp thành 1 nguồn.
//
// hitShapeConfig = { hitShape, hitRadius } — lấy TRỰC TIẾP từ hit object trong data
// (talents...hits[hitIndex]). Field hitShape là OPTIONAL — nếu thiếu, fallback 'cone' (AN TOÀN NGƯỢC
// 100%: mọi hit hiện có của Sword/Charged Attack/Polearm NA KHÔNG khai báo hitShape sẽ tự động dùng
// đúng logic cone y hệt trước khi có hàm này, KHÔNG cần sửa data cũ).
//
// 'cone': distance < combatRange (2.8 thường / 4.2 large, GIỮ NGUYÊN — đây là refactor gom code
// trùng lặp, KHÔNG PHẢI balance change, không đổi bất kỳ số nào) VÀ forward.dot(toEnemy) > 0.45
// (~63° hướng trước). 'circle': distance <= hitRadius, KHÔNG xét forward — AoE 360° thật, độc lập
// hướng nhìn/di chuyển.
//
// 'box'/'capsule'/'line': CHƯA implement (đúng phạm vi đã chốt — chỉ liệt kê trong schema/comment
// để không chặn mở rộng sau này, KHÔNG viết logic collision cho chúng ở đây).
//
// Trả về: { hit: boolean, toEnemy: THREE.Vector3 (normalized, hướng từ player tới enemy — dùng lại
// cho pushDir/VFX ở call site, tránh tính lại) } — hoặc { hit: false } nếu không trúng (toEnemy vẫn
// trả về để call site có thể dùng cho mục đích khác nếu cần, dù thường không dùng khi hit=false).
function resolveMeleeHitCollision(enemy, playerPos, forward, hitShapeConfig) {
    const toEnemy = new THREE.Vector3().subVectors(enemy.position, playerPos);
    const shape = (hitShapeConfig && hitShapeConfig.hitShape) || 'cone'; // fallback 'cone' — an toàn ngược

    if (shape === 'circle') {
        const hitRadius = (hitShapeConfig && typeof hitShapeConfig.hitRadius === 'number') ? hitShapeConfig.hitRadius : 0;
        const dist = toEnemy.length();
        if (dist <= hitRadius) {
            if (dist > 0.0001) toEnemy.normalize(); else toEnemy.set(0, 0, 1); // enemy đứng đúng tâm — hướng mặc định an toàn
            return { hit: true, toEnemy };
        }
        return { hit: false, toEnemy };
    }

    // 'cone' (mặc định) — GIỮ NGUYÊN 100% logic/số liệu cũ, chỉ gom vào 1 hàm.
    const combatRange = enemy.isLarge ? 4.2 : 2.8;
    const dist = toEnemy.length();
    if (dist < combatRange) {
        toEnemy.normalize();
        if (forward.dot(toEnemy) > 0.45) {
            return { hit: true, toEnemy };
        }
    }
    return { hit: false, toEnemy };
}
window.resolveMeleeHitCollision = resolveMeleeHitCollision;

// withDamageSource(impact, character): Character #3 (Polearm) Validation — Damage Source Metadata.
// HÀM DÙNG CHUNG — merge field `source` vào BẢN SAO của impact object (KHÔNG sửa impact gốc trong
// data roster — data đó là static/dùng lại nhiều lần, sửa trực tiếp sẽ làm ô nhiễm object dùng
// chung). Mọi damage TỪ CHARACTER (melee/arrow/Decoy Explosion/Burst/Charged Attack/Polearm NA-CA)
// PHẢI đi qua hàm này trước khi truyền vào enemy.takeDamage() — đây là DATA để enemy.lastDamageSource
// ghi nhận (enemies.js), dùng bởi Reactive Skill (HP polling) để xác định "character nào vừa gây
// damage" và "damage này CÓ ĐƯỢC PHÉP trigger Reactive Effect hay không".
//
// canTriggerReactiveEffects: true — ĐÚNG NGUYÊN TẮC đã chốt "Character gây valid damage -> Reactive
// Skill có quyền kiểm tra trigger" (bao gồm CẢ Character #3 tự đánh — không giới hạn chỉ "character
// khác"). sourceCharacterId đọc character.id (character đang active — an toàn nếu character=null/
// undefined, sourceCharacterId sẽ là undefined, không lỗi).
//
// impact có thể là null/undefined (VD Beam/tick Projectile/Water Bubble hiện KHÔNG truyền impact) —
// hàm này tạo object MỚI {type: undefined, ...source} trong trường hợp đó, KHÔNG ảnh hưởng
// resolveHitReaction() (đọc impact.type qua `(impact && impact.type) || 'light'`, {} và undefined
// cho kết quả GIỐNG HỆT NHAU — đã verify qua code đọc).
function withDamageSource(impact, character) {
    return Object.assign({}, impact, {
        source: {
            sourceType: 'character',
            sourceCharacterId: character ? character.id : undefined,
            canTriggerReactiveEffects: true
        }
    });
}
window.withDamageSource = withDamageSource;

// applyChargedAttackHitsTick(dt): hàm DÙNG CHUNG, chạy CHỈ trong nhánh chargedActive (file 08) —
// advance player.chargedAttackElapsed theo dt, kiểm tra TỪNG hit trong hits[] xem đã tới `time` của
// nó chưa (yêu cầu đã xác nhận: hits[].time tính TỪ LÚC chargedActive bắt đầu, ĐỘC LẬP hoàn toàn với
// animations[]/chargedAnimIndex — 2 mảng KHÔNG có quan hệ 1:1). Với MỖI hit đã "mở" (elapsed >=
// time) mà CHƯA trigger lần nào (chargedHitsTriggered[i] === false), chạy vòng lặp enemies.forEach()
// GIỐNG HỆT logic v1 cũ (soft targeting range/angle check) — NHƯNG dùng scaling/impact RIÊNG của hit
// đó (getTalentScaling/getTalentImpact với hitIndex = i) và track hit vào chargedHasHitList theo
// CHUỖI "enemyId:i" (KHÔNG PHẢI chỉ enemyId — xem giải thích tại field player.chargedHasHitList, file
// 02) — enemy đã trúng hit #0 vẫn có thể trúng hit #1 (multi-hit đúng nghĩa), nhưng KHÔNG trúng lại
// hit #0 lần thứ 2 (VD đứng nguyên trong tầm suốt nhiều frame của hit đó).
//
// forward (hướng tấn công) được TRUYỀN VÀO thay vì tự tính lại — dùng CHUNG 1 giá trị forward tính 1
// lần đầu chargedActive (ĐÚNG PATTERN v1 cũ: forward tính 1 lần trong nhánh chargedActive, KHÔNG đổi
// theo hit — hit sau vẫn đánh theo hướng lúc BẮT ĐẦU active, không xoay theo hướng camera/di chuyển
// giữa chừng, tránh hành vi lạ nếu người chơi xoay người giữa 2 hit).
//
// Damage Pipeline: TIẾP TỤC ĐÚNG Talent Scaling -> calculatePlayerToEnemyDamage() ->
// enemy.takeDamage() hiện có cho MỖI hit — KHÔNG tạo công thức damage riêng cho multi-hit (đúng yêu
// cầu mục 4).
function applyChargedAttackHitsTick(dt, forward) {
    player.chargedAttackElapsed += dt;

    const hits = getChargedAttackHits();
    const character = getActiveCharacterData();
    const category = player.isBurstStateActive ? 'burstStateChargedAttack' : 'chargedAttack';

    for (let hitIndex = 0; hitIndex < hits.length; hitIndex++) {
        const hitData = hits[hitIndex];
        const hitTime = (hitData && typeof hitData.time === 'number') ? hitData.time : 0;
        if (player.chargedAttackElapsed < hitTime) continue; // chưa tới lúc "mở" hit này
        if (player.chargedHitsTriggered[hitIndex]) continue; // hit này đã trigger rồi (chỉ mở 1 lần)

        player.chargedHitsTriggered[hitIndex] = true;

        const hitScaling = getTalentScaling(character, category, hitIndex);
        const hitImpact = getTalentImpact(character, category, hitIndex);

        enemies.forEach(enemy => {
            if (!enemy.alive) return;
            const hitKey = enemy.id + ':' + hitIndex;
            if (player.chargedHasHitList.includes(hitKey)) return;

            // Character #3 (Polearm) Validation — dùng resolveMeleeHitCollision() dùng chung, đọc
            // hitData.hitShape/hitRadius (optional — Sword/Charged Attack hiện có KHÔNG khai báo,
            // fallback 'cone' GIỮ NGUYÊN 100% hành vi cũ, xem hàm dùng chung phía trên).
            const result = resolveMeleeHitCollision(enemy, player.position, forward, hitData);
            if (result.hit) {
                const finalDamage = calculatePlayerToEnemyDamage(character, hitScaling, enemy);
                enemy.takeDamage(finalDamage, forward, false, withDamageSource(hitImpact, character));
                player.chargedHasHitList.push(hitKey);

                hitstopTimer = COMBAT_FEEL_CONFIG.hitStopDuration;
                sfx.playHit();
                cameraState.shakeTimer = COMBAT_FEEL_CONFIG.cameraShake.duration;
                cameraState.shakeIntensity = COMBAT_FEEL_CONFIG.cameraShake.intensity;

                const hitPoint = enemy.position.clone().addScaledVector(result.toEnemy, -0.4);
                spawnCombatSparks(hitPoint, result.toEnemy);

                if (!enemy.alive) spawnDeathParticles(enemy.position);
            }
        });
    }
}
window.applyChargedAttackHitsTick = applyChargedAttackHitsTick;

// applyPolearmNormalAttackHitsTick(activeElapsed, forward): ĐÚNG PATTERN applyChargedAttackHitsTick()
// ở trên (multi-hit/1 animation qua hits[] + hitKey "enemyId:hitIndex", KHÔNG viết công thức damage
// riêng — vẫn calculatePlayerToEnemyDamage() -> enemy.takeDamage() như mọi nguồn damage khác trong
// project) — nhưng khác NGUỒN elapsed: Charged Attack dùng player.chargedAttackElapsed (tính từ lúc
// TOÀN BỘ Charged Attack bắt đầu, KHÔNG có khái niệm combo slot), còn Polearm Normal Attack dùng
// activeElapsed = activeTiming - player.attackTimer (thời gian đã trôi qua trong 'active' phase CỦA
// ĐÚNG COMBO SLOT hiện tại — ĐÚNG PATTERN Bow applyBowArrowSpawnTick() đã dùng, xem file 08 chỗ gọi
// hàm này) — vì mỗi combo slot (Attack #1/#2/#3...) có hits[] RIÊNG (getPolearmHitsForCombo(), đọc
// theo player.comboIndex hiện tại), không phải 1 chuỗi hits[] xuyên suốt cả combo.
//
// hits[].time trong data (talents.normalAttack.combo[i].hits[]) tính TỪ LÚC 'active' phase của ĐÚNG
// đòn đó bắt đầu (0 = ngay khi vào active) — KHÔNG liên quan animation/comboIndex khác, giống hệt quy
// ước hits[].time của Charged Attack (tính từ lúc chargedActive bắt đầu).
// Character #3 Validation — Burst State dispatch: hàm này giờ TỰ ĐỌC player.isBurstStateActive để
// chọn ĐÚNG NGUỒN DATA (talents.burstState.normalAttack.combo[] thay vì talents.normalAttack.combo[])
// VÀ ĐÚNG CATEGORY khi tính damage ('burstStateMelee' thay vì 'polearmMelee') — KHÔNG cần sửa call
// site (file 08 vẫn gọi applyPolearmNormalAttackHitsTick(activeElapsed, forward) y hệt cũ, dispatch
// nội bộ trong hàm này tự động đúng theo trạng thái Burst State hiện tại).
function applyPolearmNormalAttackHitsTick(activeElapsed, forward) {
    const isBurst = !!player.isBurstStateActive;
    const hits = getPolearmHitsForCombo(player.comboIndex, isBurst);
    const character = getActiveCharacterData();
    const category = isBurst ? 'burstStateMelee' : 'polearmMelee';

    for (let hitIndex = 0; hitIndex < hits.length; hitIndex++) {
        const hitData = hits[hitIndex];
        const hitTime = (hitData && typeof hitData.time === 'number') ? hitData.time : 0;
        if (activeElapsed < hitTime) continue; // chưa tới lúc "mở" hit này
        if (player.polearmHitsTriggered[hitIndex]) continue; // hit này đã trigger rồi (chỉ mở 1 lần)

        player.polearmHitsTriggered[hitIndex] = true;

        // category 'polearmMelee'/'burstStateMelee' — dispatch RIÊNG khỏi 'melee' (Sword,
        // 1-hit-per-slot, xem getTalentScaling()/getTalentImpact()) vì combo[i].hits[] là schema KHÁC
        // combo[i].scaling phẳng của Sword — hitIndex ở đây là index TRONG hits[] của slot, tương
        // đương hitIndex của 'chargedAttack' (không phải comboIndex).
        const hitScaling = getTalentScaling(character, category, hitIndex);
        const hitImpact = getTalentImpact(character, category, hitIndex);

        enemies.forEach(enemy => {
            if (!enemy.alive) return;
            const hitKey = enemy.id + ':' + hitIndex;
            if (player.polearmHasHitList.includes(hitKey)) return;

            // Dùng resolveMeleeHitCollision() dùng chung — NA3 Twin Thunder Thrust (2 hit, cone
            // mặc định vì KHÔNG khai báo hitShape trong data, giữ nguyên hành vi cone như trước).
            const result = resolveMeleeHitCollision(enemy, player.position, forward, hitData);
            if (result.hit) {
                const finalDamage = calculatePlayerToEnemyDamage(character, hitScaling, enemy);
                enemy.takeDamage(finalDamage, forward, false, withDamageSource(hitImpact, character));
                player.polearmHasHitList.push(hitKey);

                hitstopTimer = COMBAT_FEEL_CONFIG.hitStopDuration;
                sfx.playHit();
                cameraState.shakeTimer = COMBAT_FEEL_CONFIG.cameraShake.duration;
                cameraState.shakeIntensity = COMBAT_FEEL_CONFIG.cameraShake.intensity;

                const hitPoint = enemy.position.clone().addScaledVector(result.toEnemy, -0.4);
                spawnCombatSparks(hitPoint, result.toEnemy);

                if (!enemy.alive) spawnDeathParticles(enemy.position);
            }
        });
    }
}
window.applyPolearmNormalAttackHitsTick = applyPolearmNormalAttackHitsTick;

// ============================================================
// ============================================================
// combat.js — Tách ra từ game.js
// Chứa: Plunge Attack (trigger + impact), Melee Attack thường (Soft Targeting +
// Attack Lunge), Elemental Skill (Tap = Pressure Shot / Hold = Aim Mode bắn tia
// nhỏ liên tục), Elemental Burst (Water Bubble + Vortex CC, thi triển ngay khi
// nhấn).
//
// QUAN TRỌNG VỀ THỨ TỰ LOAD: file này PHẢI load SAU game.js (không phải trước).
// Lý do: các hàm bên dưới dùng trực tiếp tên trần của nhiều biến/hằng số khai
// báo bằng const/let bên trong game.js (player, scene, camera, particles,
// enemies, sfx, cameraState, skillAimState, burstAimState, COMBAT_TIMING,
// SOFT_TARGETING_CONFIG, ELEMENTAL_SKILL_CONFIG, BURST_CONFIG,
// findSoftTargetingRotation, getGroundYForPosition, deactivateGlider...).
// Các biến này CHỈ tồn tại trong global scope SAU KHI game.js đã chạy xong
// (script chạy tuần tự, cùng global lexical scope vì không dùng type="module").
// Do đó thứ tự đúng trong index.html là:
//   comic.js -> vfx.js -> enemies.js -> game.js -> combat.js -> ui.js
//
// game.js NGƯỢC LẠI gọi một số hàm định nghĩa trong file này (updateSkillAim,
// updateSkillCooldown, triggerPlungeImpact, handleAttackInput, handleSkillKeyDown/Up,
// handleBurstKeyDown/Up) — điều này vẫn AN TOÀN dù combat.js load sau, vì các lời gọi đó nằm
// bên trong function body của game.js (updatePhysics/updateCombat/input handlers), chỉ thực sự
// thực thi lúc runtime (khi game loop chạy / khi có input), tức LUÔN sau khi
// mọi <script> tag (kể cả combat.js) đã load xong. Chỉ cần đảm bảo KHÔNG có
// code top-level (chạy ngay lúc parse) nào trong game.js gọi các hàm này.
//
// Alpha v1.0 — Character System: updateBurst/endBurstBubble/fireHydroBeam/fireHydroProjectile/
// launchBurstBubble/updateProjectiles đã bị XÓA khỏi combat.js/08-physics-combat-camera-loop.js
// (dead code sau khi migrate) — logic thi triển tương ứng giờ nằm trong 09-character-system.js
// (runBeamEffect/runSmallShotEffect/runWaterBubbleEffect + các hàm update/end tương ứng), đọc
// dữ liệu từ CHARACTER_ROSTER (10-character-roster.js)/SKILL_LIBRARY (11-character-skills.js).
//
// combat.js EXPORT ra window (để game.js gọi tới):
//   handleAttackInput, handleSkillKeyDown, handleSkillKeyUp, updateSkillAim,
//   updateSkillCooldown, triggerPlungeImpact, handleBurstKeyDown, handleBurstKeyUp
// ============================================================

            function triggerPlungeAttack() {
                if (player.isPlunging || skillAimState.phase === 'aiming') return;
                if (player.isGliding) deactivateGlider();

                player.isPlunging = true;
                player.attackState = 'plunge';
                player.velocity.set(0, -26.0, 0); 
                player.inputVelocity.set(0, 0, 0);

                player.mesh.scale.set(0.75, 1.4, 0.75);
                player.sword.rotation.set(Math.PI, 0, 0);

                spawnPlungeTrailParticles();
                sfx.playSwing();
            }

            function triggerPlungeImpact() {
                player.isPlunging = false;
                player.attackState = 'idle';

                player.mesh.scale.set(1.4, 0.55, 1.4);
                player.landSquashTimer = 0.22;
                
                if (player.attackState === 'idle' && !player.isClimbing) {
                    // Alpha v1.0 — Character Foundation: idle pose của kiếm đọc từ
                    // CHARACTER_ROSTER[...].visualConfig.weaponGrip.rotation (data-driven, chỉnh
                    // trong 10-character-roster.js sẽ có hiệu lực ngay) thay vì hard-code
                    // (-Math.PI/3, 0, Math.PI/10). tiltRoot.rotation.x vẫn cộng thêm vào trục X để
                    // kiếm "ăn theo" độ nghiêng thân (GIỮ NGUYÊN hành vi cũ).
                    // Character Foundation v2: đọc qua getWeaponGripRotation() (có fallback an
                    // toàn) thay vì trực tiếp — xem giải thích ở đầu file.
                    const grip = getWeaponGripRotation();
                    player.sword.rotation.set(grip.x + player.tiltRoot.rotation.x, grip.y, grip.z);
                }

                // --- SOFT TARGETING cho Plunge Attack: xoay hướng về địch gần nhất ngay lúc tiếp đất.
                // Lưu ý: Plunge gây damage theo bán kính (AOE) quanh điểm rơi, không phụ thuộc hướng nhìn
                // để trúng đòn — soft targeting ở đây chỉ mang tính thẩm mỹ/nhất quán trải nghiệm, không
                // ảnh hưởng việc có gây sát thương hay không.
                const softTarget = findSoftTargetingRotation(player.position, player.mesh.rotation.y);
                if (softTarget) {
                    player.softTargetLockY = softTarget.targetY;
                    player.softTargetLerpSpeed = softTarget.lerpSpeed;
                } else {
                    player.softTargetLockY = null;
                }

                const impactPos = player.position.clone();
                const plungeRadius = 4.0;
                // Talent System v2: getTalentScaling() CHỈ đọc config {stat, multiplier} — tính 1
                // lần trước vòng lặp (không đổi theo enemy). Final Damage (bao gồm DEF mitigation)
                // tính RIÊNG theo TỪNG enemy trong forEach qua calculatePlayerToEnemyDamage() (mỗi
                // enemy có thể khác level).
                const character = getActiveCharacterData();
                const plungeScaling = getTalentScaling(character, 'plunge');
                // Hit Reaction / Poise System v1: yêu cầu đã xác nhận — Plunge dùng CHUNG 1
                // impact.type cho cả lowPlunge/highPlunge (code hiện tại chỉ thực sự dùng category
                // 'plunge', xem plungeScaling ở trên — 'lowPlunge'/'highPlunge' tồn tại trong talent
                // schema nhưng CHƯA được kích hoạt ở đường code này, ngoài phạm vi Alpha v1.0).
                const plungeImpact = getTalentImpact(character, 'plunge');

                enemies.forEach(enemy => {
                    if (!enemy.alive) return;
                    const d = impactPos.distanceTo(enemy.position);
                    if (d < plungeRadius) {
                        const pushDir = new THREE.Vector3().subVectors(enemy.position, impactPos);
                        pushDir.y = 0;
                        pushDir.normalize();
                        if (pushDir.lengthSq() === 0) pushDir.set(1, 0, 0);

                        const plungeFinalDamage = calculatePlayerToEnemyDamage(character, plungeScaling, enemy);
                        enemy.takeDamage(plungeFinalDamage, pushDir, true, withDamageSource(plungeImpact, character)); 

                        if (enemy.bodyMesh) {
                            enemy.mesh.scale.set(1.5, 0.38, 1.5);
                            enemy.hydroSquashTimer = 0.25;
                        }
                    }
                });

                spawnPlungeImpactVisuals(impactPos);
                sfx.playBurst();
                triggerHydroFlash();

                cameraState.shakeTimer = 0.42;
                cameraState.shakeIntensity = 0.55; 
            }
            window.triggerPlungeImpact = triggerPlungeImpact;

            function handleAttackInput() {
                if (player.isClimbing || player.isSwimming || player.isDrowning || player.isDead) return;
                if (!player.isGrounded) {
                    if (!player.isPlunging) {
                        const heightAboveGround = player.position.y - (player.height / 2) - getGroundYForPosition(player.position);
                        if (heightAboveGround > 2.6) {
                            triggerPlungeAttack();
                        }
                    }
                    return; 
                }
                triggerAttack();
            }
            window.handleAttackInput = handleAttackInput;

            // ============================================================
            // Charged Attack v1 — Auto-trigger v2 (Fixed Charge Time, kích hoạt NGAY khi đủ giờ,
            // KHÔNG cần thả nút) + Buffer nối tiếp
            // ============================================================
            // KHÔNG thay handleAttackInput() ở trên — hàm đó vẫn giữ nguyên vai trò "thực hiện 1
            // Normal Attack/combo-continue NGAY LẬP TỨC", vẫn được gọi y hệt như cũ từ: (1)
            // updateCombat() (file 08) khi replay input đã buffer lúc kết thúc recovery/comboGrace,
            // và (2) handleAttackUp() bên dưới khi người chơi thả nút TRƯỚC khi đủ chargeTime (case
            // "Tap"/thả sớm — Normal Attack đi qua ĐÚNG code path cũ, không có gì khác biệt).
            //
            // 2 hàm MỚI dưới đây là ĐIỂM VÀO input duy nhất cho input Attack Down/Up (thay thế lời
            // gọi handleAttackInput() trực tiếp từ mousedown trong 07-input-handlers.js — xem thay
            // đổi tương ứng ở file đó). Input Down/Up KHÔNG đụng vào comboIndex/attackBuffered/
            // hasHitList của Normal Attack — 1 action riêng biệt hoàn toàn (theo đúng yêu cầu).

            // handleAttackDown(): gọi khi người chơi NHẤN Attack (mousedown/touchstart).
            //   - Set isAttackHeld = true VÔ ĐIỀU KIỆN đầu tiên — updateCombat() (file 08) đọc cờ
            //     này mỗi frame để biết nút có đang giữ hay không, dùng CHO CẢ lần charge đầu tiên
            //     (attackState === 'charging') LẪN buffer nối tiếp lúc Charged Attack đang chạy
            //     (chargedWindup/chargedActive/chargedRecovery).
            //   - Charge được phép bắt đầu trong 2 trường hợp (yêu cầu đã xác nhận):
            //       (a) player.attackState === 'idle' — không đang trong Normal Attack nào.
            //       (b) player.attackState === 'recovery' || 'comboGrace' — ĐANG TRONG COMBO WINDOW
            //           của Normal Attack combo (đòn hiện tại đã đánh xong active, đang chờ input
            //           tiếp theo) — ĐÚNG điều kiện mà triggerAttack() dùng để quyết định buffer combo
            //           (xem "player.attackState === 'recovery' || player.attackState ===
            //           'comboGrace'" trong triggerAttack() ở trên). KHÔNG cho charge trong
            //           'windup'/'active' (đòn hiện tại còn đang đánh dở — phải đợi hết Combo Window
            //           mới được charge, yêu cầu đã xác nhận).
            //     Cả 2 trường hợp đều chuyển attackState = 'charging', reset chargeTimer. Việc TỰ
            //     ĐỘNG thi triển Charged Attack khi chargeTimer đủ giờ nằm trong updateCombat() (file
            //     08, nhánh 'charging') — KHÔNG chờ release (Auto-trigger v2).
            //   - Khi bắt đầu charge TỪ GIỮA COMBO (case (b)) -> RESET NGAY comboIndex = 0 và
            //     attackBuffered = false (yêu cầu đã xác nhận: combo coi như bị cắt bởi Charged
            //     Attack, reset về 0 hoàn toàn — giống hệt combo bị ngắt do hết Combo Window mà không
            //     có input). Reset NGAY LÚC BẮT ĐẦU CHARGE (không đợi tới lúc Charged Attack kết
            //     thúc) vì 1 khi đã chuyển sang 'charging', Normal Attack combo cũ không còn ý nghĩa
            //     gì để giữ lửng lơ — nếu người chơi thả sớm (chưa đủ giờ), handleAttackUp() sẽ gọi
            //     lại handleAttackInput() với attackState đã là 'idle', tự nhiên tính lại comboIndex
            //     từ 0 -> 1 (bấm Attack mới, KHÔNG nối vào combo cũ) — không cần xử lý gì thêm ở đó.
            //   - Nếu attackState khác các case trên (đang giữa 'windup'/'active' của Normal Attack
            //     Combo) -> giữ NGUYÊN hành vi cũ 100%: gọi handleAttackInput() (đúng code path
            //     combo-buffer đã có từ trước — không đổi gì). Điều này đảm bảo Tap Attack liên tiếp
            //     để nối combo #1->#2->#3->#4 hoạt động y hệt trước khi có Charged Attack (task yêu
            //     cầu tuyệt đối không phá combo hiện tại).
            //   - Nếu attackState là chargedWindup/chargedActive/chargedRecovery (Charged Attack
            //     đang chạy) -> KHÔNG gọi handleAttackInput() (sẽ phá state machine Charged Attack).
            //     Chỉ cần isAttackHeld = true đã set ở trên; updateCombat() (file 08) tự đếm
            //     chargedRebuffTimer trong lúc 3 state này đang chạy để quyết định buffer.
            //
            // fromHeldDelay (tham số MỚI, mặc định false): true CHỈ khi hàm này được gọi TỪ
            // updateCombat() (file 08) sau khi đã đợi đủ HELD_THROUGH_COMBO_DELAY trong lúc
            // recovery/comboGrace (xem khối "isInComboWindow" trong updateCombat()). Yêu cầu đã xác
            // nhận: mousedown MỚI đúng lúc recovery/comboGrace CŨNG phải đợi đủ độ trễ này mới được
            // charge — GIỐNG HỆT trường hợp giữ xuyên suốt từ windup/active — KHÔNG được charge ngay
            // lập tức chỉ vì đang ở 2 state đó. Vì vậy nhánh charge cho 'recovery'/'comboGrace' CHỈ
            // chạy khi fromHeldDelay === true; mousedown thật sự (fromHeldDelay mặc định false) đi
            // qua handleAttackInput() như combo bình thường (set attackBuffered = true), và chính
            // updateCombat() sẽ tự gọi lại handleAttackDown(state, true) nếu giữ đủ lâu.
            function handleAttackDown(fromHeldDelay = false) {
                if (player.isClimbing || player.isSwimming || player.isDrowning || player.isDead) return;
                player.isAttackHeld = true;
                const canStartChargeFromIdle = (player.attackState === 'idle');
                const canStartChargeFromComboWindow = fromHeldDelay && (player.attackState === 'recovery' || player.attackState === 'comboGrace');
                if ((canStartChargeFromIdle || canStartChargeFromComboWindow) && player.isGrounded && !player.isDashing && skillAimState.phase !== 'aiming') {
                    if (player.attackState === 'recovery' || player.attackState === 'comboGrace') {
                        // Bắt đầu charge từ giữa combo -> cắt combo NGAY, reset về 0 (yêu cầu đã xác
                        // nhận). KHÔNG đụng gì tới hasHitList/attackTimer hiện tại của đòn Normal
                        // Attack cũ — attackState đổi sang 'charging' ngay dòng dưới sẽ khiến
                        // updateCombat() (file 08) không còn đọc tới các field đó của Normal Attack
                        // nữa cho tới khi về lại 'idle'.
                        player.comboIndex = 0;
                        player.attackBuffered = false;
                        // SNAP tay/kiếm về idle base pose NGAY (không lerp) — TRÁNH GIẬT HÌNH: recovery
                        // của Normal Attack đang lerp RightHand/Core hướng TỚI windup của đòn kế tiếp
                        // (dự đoán combo tiếp diễn — xem nhánh 'recovery' trong file 08), nên tại thời
                        // điểm bị charge cắt ngang, tay đang ở 1 vị trí lỡ dở GIỮA recovery pose và
                        // windup pose kế — không phải base pose (offset 0) mà animation chargedWindup
                        // (file 08) bắt đầu nội suy TỪ. Snap về base trước khi chuyển 'charging' đảm
                        // bảo chargedWindup lerp từ đúng điểm xuất phát, không bị "giật" 1 frame. Y hệt
                        // pattern snap-về-idle khi Normal Attack Combo Window đóng không buffer (xem
                        // "Combo Attack System v1" trong file 08, nhánh recovery/attackTimer<=0).
                        const grip = getWeaponGripRotation();
                        player.sword.rotation.set(grip.x + player.tiltRoot.rotation.x, grip.y, grip.z);
                        const visCfg = getActiveCharacterData().visualConfig;
                        player.rightHand.position.set(visCfg.rightHandPosition.x, visCfg.rightHandPosition.y, visCfg.rightHandPosition.z);
                        player.rightHand.rotation.set(0, 0, 0);
                        player.core.position.set(visCfg.corePosition.x, visCfg.corePosition.y, visCfg.corePosition.z);
                    }
                    player.attackState = 'charging';
                    player.chargeTimer = 0;
                    player.chargeReady = false;
                    return;
                }
                const isChargedAttackRunning = (player.attackState === 'chargedWindup' || player.attackState === 'chargedActive' || player.attackState === 'chargedRecovery');
                if (isChargedAttackRunning) return; // chỉ cần isAttackHeld=true, không gọi gì thêm
                handleAttackInput();
            }
            window.handleAttackDown = handleAttackDown;

            // handleAttackUp(): gọi khi người chơi THẢ Attack (mouseup/touchend).
            //   - Set isAttackHeld = false VÔ ĐIỀU KIỆN đầu tiên (đối xứng với handleAttackDown()).
            //   - Nếu KHÔNG đang ở attackState === 'charging' -> không làm gì thêm. Bao gồm CẢ
            //     trường hợp Charged Attack đã tự thi triển xong (Auto-trigger v2 — lúc này
            //     attackState đã chuyển sang chargedWindup/chargedActive/chargedRecovery, không còn
            //     là 'charging' nữa nên nhánh dưới tự động bỏ qua, KHÔNG kích hoạt thêm lần nữa) LẪN
            //     trường hợp đang giữa Normal Attack Combo (input Down đã tự xử lý xong ở
            //     handleAttackDown()). Đảm bảo 1 lần release KHÔNG BAO GIỜ kích hoạt thêm 1 action
            //     ngoài ý muốn.
            //   - Nếu đang 'charging' (nghĩa là CHƯA đủ chargeTime — nếu đã đủ giờ thì
            //     updateCombat() đã tự chuyển sang 'chargedWindup' rồi, không còn 'charging' nữa) ->
            //     thả sớm -> Normal Attack, đi qua ĐÚNG handleAttackInput()/triggerAttack() hiện có —
            //     combo progression không bị ảnh hưởng gì.
            function handleAttackUp() {
                player.isAttackHeld = false;
                // Reset heldThroughComboTimer NGAY lúc thả tay — nếu người chơi vừa tap #2 để nối
                // combo (nhả tay trước khi đạt HELD_THROUGH_COMBO_DELAY), timer này không được phép
                // "nhớ" phần đã đếm dở từ tap trước đó cho lần giữ kế tiếp (xem updateCombat() file
                // 08, nơi timer này được đếm lên trong lúc recovery/comboGrace).
                player.heldThroughComboTimer = 0;

                // Character #2 (Bow) Validation — spec mục 8 "Release: khi thả nút, arrow bắn NGAY".
                // Bow Charged Attack lúc này đang ở skillAimState.phase === 'aiming' VỚI
                // player.attackState === 'idle' (KHÔNG phải 'charging' — xem triggerBowChargedAttack(),
                // đã chuyển attackState về 'idle' ngay khi vào Aim Mode) — nhánh "if (attackState !==
                // 'charging') return" bên dưới KHÔNG bắt được trường hợp này, nên cần chặn RIÊNG ở đây
                // TRƯỚC khi tới nhánh đó. endSkillAim() tự no-op an toàn nếu phase không phải 'aiming'
                // (đã có sẵn guard đầu hàm) nên gọi ở đây không rủi ro gọi nhầm khi Skill (E) đang aim
                // — điều kiện isBowChargedAiming đảm bảo CHỈ Release đúng Charged Attack Bow, không
                // đụng gì tới Aim Mode do phím Skill kích hoạt.
                if (player.isBowChargedAiming) {
                    endSkillAim();
                    return;
                }

                if (player.attackState !== 'charging') return;
                player.attackState = 'idle'; // trả về idle TRƯỚC khi gọi lại đúng path cũ
                handleAttackInput();
            }
            window.handleAttackUp = handleAttackUp;

            // triggerChargedAttack(): thi triển Charged Attack. KHÔNG đụng comboIndex/hasHitList của
            // Normal Attack — dùng player.chargedHasHitList RIÊNG (reset ở đây, mỗi lần trigger, kể
            // cả lần trigger do buffer nối tiếp).
            //
            // Stamina Gate: kiểm tra player.stamina >= staminaCost NGAY ĐẦU HÀM, TRƯỚC bất kỳ side-
            // effect nào (đổi attackState, reset timer, animation...) — ĐÚNG pattern "tiêu hao tức
            // thời 1 lần" đã có sẵn cho Dash/Climb Jump (STAMINA_CONFIG.DASH_COST/CLIMB_JUMP_COST —
            // xem updateStamina()/nhánh jumpRequested trong 08-physics-combat-camera-loop.js): "if
            // (stamina >= cost) { trừ + thực hiện } else { KHÔNG thực hiện gì cả }". TÍCH HỢP vào
            // ĐÚNG hệ thống Stamina đã có (STAMINA_CONFIG.js — file 02, player.stamina — file 02),
            // KHÔNG tạo field/hệ thống Stamina riêng cho Charged Attack.
            //
            // Trả về true nếu Charged Attack THỰC SỰ được kích hoạt (đủ stamina), false nếu không đủ
            // stamina (KHÔNG làm gì cả — không đổi attackState/comboIndex/hasHitList/animation, để
            // nguyên cho nơi gọi (updateCombat(), file 08) tự quyết định fallback đúng theo yêu cầu
            // "không được làm hỏng Normal Attack Combo" — xem 2 điểm gọi triggerChargedAttack() trong
            // file 08, cả 2 đều kiểm tra giá trị trả về này.
            function triggerChargedAttack() {
                const staminaCost = getChargedAttackConfig().staminaCost;
                if (player.stamina < staminaCost) {
                    // Không đủ Stamina: KHÔNG trừ (không trừ âm), KHÔNG thực hiện Charged Attack,
                    // KHÔNG đổi bất kỳ state nào của Normal Attack/Charged Attack — trả về false để
                    // nơi gọi tự xử lý fallback (yêu cầu đã xác nhận: hủy charge NGAY, không đợi thả
                    // tay — xem updateCombat() nhánh 'charging' trong file 08).
                    sfx.playBlockedSound();
                    return false;
                }
                // Đủ Stamina: trừ TỨC THỜI 1 lần TẠI ĐÂY (đúng lúc Charged Attack THỰC SỰ kích hoạt —
                // yêu cầu đã xác nhận: "chargeTimer >= chargeTime -> ... -> Charged Attack được thực
                // hiện" chỉ tính khi hàm này thực sự chạy tới đây, KHÔNG phải lúc bắt đầu charging hay
                // lúc đang giữ nút — không có bất kỳ chỗ nào khác trong toàn bộ Charged Attack trừ
                // Stamina liên tục theo dt, chỉ đúng 1 lần tại đây mỗi lần kích hoạt thành công).
                player.stamina = Math.max(STAMINA_CONFIG.MIN_STAMINA, player.stamina - staminaCost);

                player.attackState = 'chargedWindup';
                // Multi-Animation v2: attackTimer giờ = TỔNG duration của TẤT CẢ animation segment
                // thuộc phase 'windup' (KHÔNG còn 1 con số cố định timing.windup — xem
                // getChargedAttackPhaseDuration() ở trên). Nếu phase 'windup' không có segment nào
                // (nhân vật thiết kế Charged Attack không cần windup) -> 0, updateCombat() (file 08)
                // sẽ chuyển sang 'chargedActive' NGAY frame kế tiếp (KHÔNG "đứng khựng chờ 0 giây" vì
                // <= 0 kiểm tra đúng ngay).
                player.attackTimer = getChargedAttackPhaseDuration('windup');
                player.chargeReady = false;
                player.chargeTimer = 0;
                // Buffer nối tiếp: reset lại để lần chạy Charged Attack MỚI này bắt đầu đếm lại từ 0
                // (không kế thừa timer/buffer của lần trước — mỗi lần trigger là 1 chu kỳ độc lập).
                // chargedRebuffArmed = false: BẮT BUỘC phải thả tay ra ít nhất 1 lần trong đòn MỚI
                // này trước khi được phép bắt đầu đếm chargedRebuffTimer (yêu cầu đã xác nhận: giữ
                // liên tục xuyên suốt KHÔNG tính buffer).
                player.chargedRebuffTimer = 0;
                player.chargedAttackBuffered = false;
                player.chargedRebuffArmed = false;
                // Multi-Hit v2: reset TOÀN BỘ hit-tracking cho 1 CHU KỲ Charged Attack MỚI — "Charged
                // Attack multi-hit vẫn là MỘT instance" (yêu cầu đã xác nhận) -> CHỈ reset ở ĐÂY (lúc
                // trigger), KHÔNG reset giữa các animation segment/phase/hit. chargedHasHitList giờ
                // lưu "enemyId:hitIndex" (xem giải thích tại field, file 02) — mảng RỖNG nghĩa là
                // CHƯA có enemy nào bị bất kỳ hit nào của instance này trúng.
                player.chargedHasHitList = [];
                // chargedAttackElapsed: reset về 0 NGAY LÚC TRIGGER — nhưng LƯU Ý: hits[].time tính
                // từ lúc 'chargedActive' BẮT ĐẦU (yêu cầu đã xác nhận), không phải lúc trigger (có thể
                // còn windup trước đó) — nên giá trị này sẽ được RESET LẠI LẦN NỮA đúng lúc chuyển
                // sang 'chargedActive' (xem updateCombat() file 08, nhánh chargedWindup->chargedActive
                // transition). Reset ở đây chỉ để an toàn/nhất quán, không phải nguồn chân lý cho hit
                // timing khi có windup.
                player.chargedAttackElapsed = 0;
                // chargedHitsTriggered: mảng cờ "hit[i] đã mở" — ĐỘ DÀI PHẢI KHỚP hits[].length hiện
                // tại của nhân vật (đọc qua getChargedAttackHits(), tính NGAY LÚC trigger — nhân vật/
                // hits[] không đổi giữa chừng 1 lần trigger nên an toàn để tính 1 lần ở đây).
                player.chargedHitsTriggered = getChargedAttackHits().map(() => false);
                // chargedAnimIndex/chargedPhaseElapsed: reset về 0 cho phase 'windup' sắp chạy (segment
                // đầu tiên của windup, elapsed=0 trong segment đó).
                player.chargedAnimIndex = 0;
                player.chargedPhaseElapsed = 0;
                player.mesh.scale.set(1.18, 0.82, 1.18);

                // Animation Charged Attack v1: KHÔNG snap sword.rotation ở đây — pose "charge" được
                // nội suy MỖI FRAME qua rightHand/core trong updateCombat() (file 08, nhánh
                // 'chargedWindup') dựa trên attackTimer đang đếm ngược từ timing.windup vừa set ở
                // trên. sword.rotation chỉ "đi theo" rightHand qua Three.js hierarchy — giống hệt
                // nguyên tắc đã áp dụng cho Normal Attack (không có snap rời rạc nào ở đây, tránh
                // "giật" animation ngay lúc bắt đầu windup).
                sfx.playSwing();

                // --- SOFT TARGETING: giống hệt logic Normal Attack — tính 1 lần lúc bắt đầu.
                const softTarget = findSoftTargetingRotation(player.position, player.mesh.rotation.y);
                if (softTarget) {
                    player.softTargetLockY = softTarget.targetY;
                    player.softTargetLerpSpeed = softTarget.lerpSpeed;
                } else {
                    player.softTargetLockY = null;
                }
                return true;
            }
            window.triggerChargedAttack = triggerChargedAttack;


            function triggerAttack() {
                if (player.isDashing || player.isClimbing || player.isSwimming || player.isDrowning || skillAimState.phase === 'aiming') return;
                if (player.attackState !== 'idle') {
                    // Combo Attack System v2: Combo Window = TOÀN BỘ recovery (không chỉ 0.08s cuối
                    // như trước — cửa sổ 80ms đó quá hẹp để bấm trúng nhịp, gây ra đúng 2 triệu chứng
                    // đã xác nhận: input rớt ra ngoài buffer -> combo bị reset về #1 (nhìn như "lặp
                    // lại #1"), và chỉ khi tình cờ bấm trúng 80ms cuối mới nối được sang #2 ("vài lần
                    // #1 mới ra #2"). Sửa: bấm bất cứ lúc nào trong 'recovery' đều buffer -> nối sang
                    // đòn tiếp theo ngay khi recovery hiện tại kết thúc. KHÔNG buffer trong 'windup'/
                    // 'active' (giữ nguyên — không cho hủy đòn đang đánh giữa chừng). Vẫn KHÔNG kiểm
                    // tra hasHitList/damage/hit confirmation (combo progression không phụ thuộc hit).
                    //
                    // Combo Window Config v1: buffer THÊM trong 'comboGrace' (state MỚI, xem
                    // updateCombat() file 08) — giai đoạn sau khi recovery đã lerp xong nhưng
                    // comboWindow (getComboWindow(), có thể dài hơn recovery) vẫn chưa đóng. Tay/kiếm
                    // đứng yên ở pose cuối recovery trong giai đoạn này, bấm vẫn nối combo bình thường.
                    if (player.attackState === 'recovery' || player.attackState === 'comboGrace') player.attackBuffered = true;
                    return; 
                }

                // Combo Attack System v1: xác định comboIndex cho đòn SẮP chạy.
                //   - Nếu player.comboIndex === 0 (không trong combo, vừa từ idle bấm Attack lần
                //     đầu) -> đòn mới là #1.
                //   - Nếu player.comboIndex > 0 (đang giữa combo, hàm này được gọi lại từ
                //     handleAttackInput() do attackBuffered kích hoạt ở updateCombat()) -> đòn mới
                //     là comboIndex + 1, XOAY VÒNG về #1 nếu đã vượt quá số đòn có sẵn trong mảng
                //     animation.attack (an toàn cho nhân vật có ít đòn hơn dự kiến, hoặc chưa có
                //     animation.attack nào — attackList.length sẽ là 0, xử lý riêng bên dưới).
                const character = getActiveCharacterData();
                const attackList = (character.visualConfig.animation && character.visualConfig.animation.attack) || [];
                if (attackList.length > 0) {
                    const nextIndex = player.comboIndex === 0 ? 1 : player.comboIndex + 1;
                    player.comboIndex = ((nextIndex - 1) % attackList.length) + 1; // xoay vòng 1-based
                } else {
                    // Nhân vật chưa có animation.attack nào (VD test_character_anemo) — comboIndex
                    // giữ ý nghĩa "đang trong 1 đòn" để logic reset ở updateCombat() vẫn nhất quán,
                    // nhưng không có data để tra (currentAttackAnim() trả về null, mọi nơi đọc đã
                    // có fallback an toàn từ trước).
                    player.comboIndex = 1;
                }

                player.attackState = 'windup';
                // Combo Attack System v2: timing đọc theo ĐÚNG đòn vừa xác định comboIndex ở trên
                // (getCurrentAttackTiming() gọi getCurrentAttackAnim(), đọc player.comboIndex —
                // THỨ TỰ QUAN TRỌNG: phải gọi SAU khi comboIndex đã set, không phải trước).
                player.attackTimer = getCurrentAttackTiming().windup;
                // hasHitList RESET MỖI ĐÒN trong combo (không chỉ đòn đầu) — mỗi đòn gây damage độc
                // lập với các đòn trước, theo đúng yêu cầu đã xác nhận.
                player.attackBuffered = false; player.hasHitList = []; 
                // Character #2 (Bow) Validation — arrowsSpawnedThisShot RESET MỖI SHOT (giống hệt lý
                // do hasHitList reset mỗi đòn ở trên) — mảng boolean khớp ĐÚNG độ dài arrows[] của
                // shot SẮP chạy (player.comboIndex vừa được set ở trên). Với nhân vật melee (không
                // phải Bow), getBowArrowsForCombo() trả về [] an toàn — mảng rỗng không gây side-
                // effect gì (applyBowArrowSpawnTick() chỉ được gọi khi getActiveWeaponType()==='bow').
                player.arrowsSpawnedThisShot = getBowArrowsForCombo(player.comboIndex).map(() => false);
                // Character #3 (Polearm) Validation — polearmHitsTriggered RESET MỖI ĐÒN trong combo,
                // ĐÚNG PATTERN arrowsSpawnedThisShot ở trên. getPolearmHitsForCombo() trả về [] an toàn
                // cho Sword/Bow (không có side-effect gì, applyPolearmNormalAttackHitsTick() chỉ được
                // gọi khi getActiveWeaponCategory()==='polearm', xem file 08). polearmHasHitList reset
                // theo TỪNG ĐÒN (không phải từng hit) — ĐÚNG PATTERN chargedHasHitList reset theo TỪNG
                // LẦN charge (không phải per-hit) — mỗi đòn combo mới coi là "phiên hit" hoàn toàn mới,
                // không giữ lại lịch sử enemy đã trúng hit nào ở đòn TRƯỚC.
                player.polearmHitsTriggered = getPolearmHitsForCombo(player.comboIndex, !!player.isBurstStateActive).map(() => false);
                player.polearmHasHitList = [];
                player.mesh.scale.set(1.18, 0.82, 1.18);

                // Alpha v1.0 — Attack Animation: pose windup của Sword đọc từ
                // visualConfig.animation.attack[comboIndex-1].sword.windupRotation (data-driven,
                // combo-aware). AN TOÀN nếu nhân vật chưa có config này (VD test_character_anemo):
                // fallback về đúng giá trị hard-code cũ, KHÔNG đổi hành vi nếu thiếu data.
                {
                    const attackAnim = attackList[player.comboIndex - 1];
                    const w = attackAnim && attackAnim.sword && attackAnim.sword.windupRotation;
                    if (w) {
                        player.sword.rotation.set(w.x, w.y, w.z);
                    } else {
                        const d = DEFAULT_SWORD_WINDUP_ROTATION;
                        player.sword.rotation.set(d.x, d.y, d.z);
                    }
                }
                sfx.playSwing();

                // --- SOFT TARGETING: chỉ tính 1 lần lúc bắt đầu đòn đánh, KHÔNG khóa mục tiêu liên tục.
                // Không đụng gì tới hướng camera/di chuyển — chỉ set góc đích để updatePhysics() lerp
                // player.mesh.rotation.y hướng tới trong lúc windup (xem xử lý trong updatePhysics).
                //
                // Character #2 (Bow) Validation — Target Assist 3D Upgrade: Bow Normal Attack giờ
                // dùng TargetAssist.getNearestTarget() (02-collision-and-stats-core.js, khoảng cách 3D
                // thật, bao gồm Y) THAY VÌ findSoftTargetingRotation() với config riêng như trước —
                // tách biệt "xoay thân nhân vật" (vẫn cần, chỉ xoay ngang/yaw, dùng
                // findSoftTargetingRotation() y hệt melee để thân player hướng về phía target) khỏi
                // "hướng bắn arrow" (cần đầy đủ 3D, xử lý riêng trong applyBowArrowSpawnTick() qua
                // TargetAssist.getAimDirection(), xem combat.js). Melee (Sword) GIỮ NGUYÊN 100% —
                // chỉ dùng findSoftTargetingRotation()/SOFT_TARGETING_CONFIG mặc định như trước.
                const isBow = getActiveWeaponType() === 'bow';
                const softTarget = findSoftTargetingRotation(player.position, player.mesh.rotation.y, isBow ? SOFT_TARGETING_CONFIG : null);
                if (softTarget) {
                    player.softTargetLockY = softTarget.targetY;
                    player.softTargetLerpSpeed = softTarget.lerpSpeed;
                } else {
                    player.softTargetLockY = null; // Không có địch trong phạm vi -> giữ nguyên hướng hiện tại
                }

                // Character #2 (Bow) Validation — Target Assist 3D (spec mục 4 "Nearest Target + 3D",
                // mục 7 "Generic Module"): chọn ĐỘC LẬP với soft target xoay thân ở trên — dùng
                // TargetAssist.getNearestTarget() (khoảng cách 3D thật qua Vector3.distanceTo, bao gồm
                // Y) thay vì tier/góc của findSoftTargetingRotation(). Lưu ENEMY REFERENCE (không phải
                // hướng đã tính sẵn) vào player.softTargetEnemy — applyBowArrowSpawnTick() sẽ tự tính
                // aim direction 3D MỖI LẦN spawn arrow, dùng ĐÚNG vị trí spawn thật của arrow đó làm
                // origin (spec mục 5), nhưng LUÔN với CÙNG 1 enemy đã chọn ở đây (không re-tìm target
                // giữa chừng shot — đúng "không homing"). null nếu không có enemy hợp lệ trong tầm
                // (Test 5: Bow bắn theo hướng player hiện tại, xử lý fallback trong
                // applyBowArrowSpawnTick()).
                player.softTargetEnemy = isBow ? TargetAssist.getNearestTarget(player.position, BOW_RANGED_TARGET_ASSIST_CONFIG) : null;
            }

            // Combo Attack System v1: helper dùng chung — trả về entry animation.attack ĐÚNG của
            // đòn đang chạy (theo player.comboIndex), hoặc null nếu nhân vật không có config này.
            // TẤT CẢ nơi khác (updateCombat() trong file 08) PHẢI dùng hàm này thay vì tự tra mảng,
            // để đảm bảo duy nhất 1 nguồn xác định "đòn nào đang chạy".
            function getCurrentAttackAnim() {
                const character = getActiveCharacterData();
                const attackList = character.visualConfig.animation && character.visualConfig.animation.attack;
                if (!attackList || attackList.length === 0) return null;
                return attackList[player.comboIndex - 1] || null;
            }
            window.getCurrentAttackAnim = getCurrentAttackAnim;

            // Combo Attack System v3 — Recovery nối animation: trả về entry animation.attack của
            // đòn KẾ TIẾP (xoay vòng về #1 nếu đòn hiện tại là đòn cuối trong mảng), dùng làm ĐÍCH
            // ĐẾN cho lerp recovery (thay vì luôn về base pose 0 offset như trước — xem updateCombat()
            // trong file 08). Lý do dùng windup của đòn kế tiếp làm đích thay vì thêm field "End" mới
            // vào schema recovery: tránh trùng lặp data (windup pose của đòn N+1 vốn đã tồn tại sẵn),
            // và đảm bảo animation LUÔN nối liền mạch dù người chơi có bấm tiếp combo hay không (theo
            // yêu cầu đã xác nhận — recovery luôn "chạy tới" windup #2, không quan tâm buffer).
            // Trả về null nếu nhân vật không có config animation.attack (an toàn, dùng fallback ở nơi gọi).
            function getNextAttackAnim() {
                const character = getActiveCharacterData();
                const attackList = character.visualConfig.animation && character.visualConfig.animation.attack;
                if (!attackList || attackList.length === 0) return null;
                const nextIndex = (player.comboIndex % attackList.length); // xoay vòng 0-based
                return attackList[nextIndex] || null;
            }
            window.getNextAttackAnim = getNextAttackAnim;

            // Combo Attack System v2 — Timing per-đòn: trả về {windup, active, recovery} (giây)
            // CỦA ĐÚNG ĐÒN đang chạy (qua getCurrentAttackAnim()). FALLBACK về COMBAT_TIMING toàn
            // cục (02-collision-and-stats-core.js, GIỮ NGUYÊN không đổi) nếu đòn không tự định
            // nghĩa timing riêng — an toàn cho nhân vật/đòn thiếu data (VD test_character_anemo).
            // TẤT CẢ nơi đọc windup/active/recovery duration (combat.js, 08-physics-combat-camera-
            // loop.js, ATTACK_LUNGE_CONFIG) PHẢI dùng hàm này thay vì đọc COMBAT_TIMING trực tiếp.
            function getCurrentAttackTiming() {
                const attackAnim = getCurrentAttackAnim();
                return (attackAnim && attackAnim.timing) || COMBAT_TIMING;
            }
            window.getCurrentAttackTiming = getCurrentAttackTiming;

            // Alpha v1.0 — Character System: skillCooldownTimer (biến cục bộ) + SKILL_COOLDOWN_
            // DURATION (hằng số hard-code 7.0) đã XÓA — cooldown giờ đọc/ghi qua
            // partyState[activeCharacterIndex].skillCooldownTimer (per-character, để switch nhân vật
            // giữa combat không làm mất/lẫn cooldown — field này đã được initParty() khởi tạo sẵn = 0
            // cho mỗi PartyMember, xem file 02) và đọc thời lượng cooldown từ
            // SKILL_LIBRARY[character.skillId].cooldown (data-driven, không hard-code theo nhân vật/
            // nguyên tố nào — nhân vật chưa có skill thì coi cooldown = 0, không lỗi).

            // getActiveSkillCooldownDuration(): trả về cooldown THẬT (giây) của Elemental Skill nhân
            // vật đang active — TÁCH RIÊNG thành helper dùng chung bởi startSkillCooldown() (set timer)
            // VÀ updateSkillCooldown() (tính % UI), để 2 nơi không lặp lại cùng 1 logic dispatch
            // decoyConfig.cooldown (tránh sửa 1 nơi quên nơi kia — đúng nguyên nhân bug mục 1 ban đầu:
            // startSkillCooldown() đã đọc đúng decoyConfig.cooldown nhưng updateSkillCooldown() vẫn còn
            // đọc thẳng skillData.cooldown, khiến progress bar Decoy luôn sai dù timer đã đúng).
            function getActiveSkillCooldownDuration(character) {
                const skillData = character ? SKILL_LIBRARY[character.skillId] : null;
                let cooldownDuration = skillData ? skillData.cooldown : 0;
                if ((cooldownDuration === null || cooldownDuration === undefined) &&
                    character && character.talents && character.talents.decoyConfig &&
                    typeof character.talents.decoyConfig.cooldown === 'number') {
                    cooldownDuration = character.talents.decoyConfig.cooldown;
                }
                return cooldownDuration || 0;
            }

            // Helper: bắt đầu cooldown cho Elemental Skill của nhân vật ĐANG ACTIVE, đọc thời lượng từ
            // SKILL_LIBRARY[skillId].cooldown (data-driven). An toàn nếu nhân vật chưa có skill
            // (skillId null) — không set cooldown, không lỗi (dù trường hợp này thực tế không nên xảy
            // ra vì canUseElementalSkill()/executeCharacterSkill() đã chặn bắn khi thiếu skill từ
            // trước, hàm này chỉ phòng hờ).
            //
            // BUGFIX (mục 1 — ES Character #2 chưa có cooldown thực sự): archer_decoy_bomb.cooldown
            // trong SKILL_LIBRARY (file 11) CỐ Ý để null — số cooldown THẬT của Decoy nằm ở
            // character.talents.decoyConfig.cooldown (roster, file 10, comment tại đó đã ghi rõ ý
            // định "đọc THẬT từ decoyConfig.cooldown") vì decoyConfig là cấu hình ĐI THEO NHÂN VẬT
            // (khác Decoy-user tương lai có thể có cooldown khác nhau), tách biệt khỏi SKILL_LIBRARY
            // (cấu hình đi theo SKILL/Placement Mode). TRƯỚC ĐÂY hàm này chỉ đọc skillData.cooldown
            // trực tiếp -> luôn nhận null cho Decoy -> skillCooldownTimer = null -> điều kiện
            // `skillCooldownTimer > 0` ở canUseElementalSkill() luôn false -> ES bắn được liên tục,
            // KHÔNG có cooldown. Sửa: dùng getActiveSkillCooldownDuration() (dispatch ĐÚNG NHƯ comment
            // ở file 11 mô tả), KHÔNG đổi hành vi cho skill khác (hydro_pressure_shot vẫn đọc
            // skillData.cooldown như cũ, vì decoyConfig không tồn tại trên nhân vật đó).
            function startSkillCooldown() {
                const character = getActiveCharacterData();
                partyState[activeCharacterIndex].skillCooldownTimer = getActiveSkillCooldownDuration(character);
            }

            // Kiểm tra điều kiện tiên quyết chung để dùng Elemental Skill (giữ nguyên hành vi cũ).
            function canUseElementalSkill() {
                if (!player.isGrounded || player.isClimbing || player.isSwimming || player.isDrowning) return false;
                const activeMember = partyState[activeCharacterIndex];
                if (activeMember.skillCooldownTimer > 0 || skillAimState.phase !== 'idle') return false;
                if (burstAimState.phase !== 'idle') return false;
                // Character #2 Validation — BUG FIX: TRƯỚC ĐÂY hàm này KHÔNG kiểm tra character.skillId
                // tồn tại — nhân vật chưa có skill (VD test_character_anemo, skillId: null) vẫn qua
                // được điều kiện này, khiến handleSkillKeyDown()/updateSkillAim() chạy tiếp: phát SFX
                // (handleSkillKeyUp phát sfx.playSwing() TRƯỚC KHI executeCharacterSkill() tự no-op vì
                // SKILL_LIBRARY[null] undefined), và Hold vẫn vào được aim mode dù không có gì để bắn.
                // Từ v1: chặn NGAY TỪ ĐÂY nếu thiếu skillId — không phát SFX, không vào aim mode, đúng
                // ý nghĩa "nhân vật chưa có skill" thay vì chỉ im lặng không gây damage.
                const character = getActiveCharacterData();
                if (!character || !character.skillId) return false;
                return true;
            }

            // Elemental Skill Validation — isDecoySkillActive(): nhận diện "nhân vật đang active có
            // Elemental Skill kiểu Decoy hay không" — kiểm tra qua SKILL_LIBRARY[skillId].effectType
            // === 'decoy' (KHÔNG kiểm tra character.id/tên riêng — data-driven, nhân vật tương lai
            // nào có skill effectType 'decoy' cũng tự động hoạt động đúng qua cùng 1 dispatch này).
            function isDecoySkillActive() {
                const character = getActiveCharacterData();
                const skillData = character && SKILL_LIBRARY[character.skillId];
                return !!(skillData && skillData.effectType === 'decoy');
            }
            window.isDecoySkillActive = isDecoySkillActive;

            // --- BƯỚC 1: gọi lúc keydown/touchstart của phím skill. KHÔNG bắn gì ngay lập tức — chuyển
            // sang phase 'holding' để bắt đầu đếm thời gian giữ. Việc quyết định Tap hay Hold xảy ra ở
            // handleSkillKeyUp() hoặc khi updateSkillAim() phát hiện đã vượt ngưỡng holdThreshold.
            function handleSkillKeyDown() {
                if (!canUseElementalSkill()) return; // canUseElementalSkill() đã tự chặn nếu phase !== 'idle'
                // Elemental Skill Validation — set isDecoyPlacing TRƯỚC khi vào 'holding', vì
                // updateSkillAim() có thể tự chuyển 'holding' -> 'aiming' (startSkillAim()) NGAY frame
                // kế tiếp nếu holdThreshold = 0 (đúng cấu hình archer_decoy_bomb, xem file 11) — cờ
                // phải sẵn sàng TRƯỚC đó để startSkillAim()/updateSkillAim() dispatch đúng ngay từ đầu.
                player.isDecoyPlacing = isDecoySkillActive();
                skillAimState.phase = 'holding';
                skillAimState.heldTime = 0;
            }
            window.handleSkillKeyDown = handleSkillKeyDown;

            // --- BƯỚC 2: gọi lúc keyup/touchend. Nếu vẫn đang ở phase 'holding' (chưa vượt ngưỡng) ->
            // đây là Tap, bắn Pressure Shot ngay theo hướng nhân vật đang nhìn. Nếu đang ở phase 'aiming'
            // -> người chơi chủ động thả phím sớm, kết thúc Aim State bằng Pressure Shot theo crosshair.
            function handleSkillKeyUp() {
                if (skillAimState.phase === 'aiming') {
                    endSkillAim();
                } else if (skillAimState.phase === 'holding') {
                    // Elemental Skill Validation — Decoy Bomb (holdThreshold=0, xem file 11) về lý
                    // thuyết LUÔN chuyển 'holding' -> 'aiming' ngay frame animation kế tiếp
                    // (updateSkillAim(), combat.js) trước khi người chơi kịp buông tay — nhưng nếu
                    // keydown+keyup xảy ra trong CÙNG 1 frame (trước khi updateSkillAim() kịp chạy dù
                    // chỉ 1 lần), phase vẫn còn 'holding' tại đây. Nhánh Tap bên dưới (gọi
                    // executeCharacterSkill()) KHÔNG phù hợp cho Decoy (effectType 'decoy' không được
                    // dispatcher đó hỗ trợ — sẽ rơi vào console.warn, không đặt Decoy nào). Xử lý an
                    // toàn: coi như hủy thao tác (về idle, không phạt cooldown) — người chơi bấm lại
                    // là được, tránh silent-fail khó hiểu.
                    if (isDecoySkillActive()) {
                        skillAimState.phase = 'idle';
                        player.isDecoyPlacing = false;
                        return;
                    }

                    // TAP: bắn Pressure Shot ngay theo hướng nhân vật đang nhìn, không qua Aim State.
                    // Nếu có địch trong vùng hỗ trợ Soft Targeting (SOFT_TARGETING_CONFIG), áp dụng
                    // luôn: hướng bắn nhắm thẳng tới mục tiêu ngay lập tức (không đợi animation xoay
                    // xong, vì Tap cần cảm giác tức thời), đồng thời nhân vật vẫn xoay hình ảnh mượt
                    // theo góc đó (giống hệt cách triggerAttack() áp dụng cho đòn đánh thường).
                    sfx.playSwing();

                    // BUGFIX (Pre-Alpha Stabilization — Soft Target khi đang di chuyển): dùng góc từ
                    // HƯỚNG CAMERA thay vì player.mesh.rotation.y làm tâm "hình nón phía trước" của Soft
                    // Targeting. rotation.y được lerp mượt dần theo hướng di chuyển (xem updatePhysics(),
                    // khối "HỆ THỐNG PROCEDURAL ANIMATION") nên tại đúng thời điểm bấm skill trong lúc
                    // đang di chuyển, nó là 1 giá trị TRUNG GIAN đang "đuổi theo" hướng joystick/AWSD với
                    // độ trễ — không phản ánh đúng hướng người chơi thực sự muốn ngắm tới. Hệ quả cũ: địch
                    // ở tier 2/3 (giới hạn góc ±120°/±72°) dễ bị tính lệch ra ngoài "hình nón" và bị loại
                    // sai, khiến findSoftTargetingRotation() trả về null, hàm gọi fallback về hướng di
                    // chuyển (đúng triệu chứng bug đã xác nhận). Hướng camera là giá trị TỨC THỜI, ổn
                    // định, không bị trễ animation — quyết định đã chốt: dùng camera, KHÔNG dùng
                    // inputVelocity, đồng bộ với cách Aim Mode xác định hướng ngắm.
                    const camForwardForSoftTarget = new THREE.Vector3();
                    camera.getWorldDirection(camForwardForSoftTarget);
                    const softTargetFacingAngle = (camForwardForSoftTarget.x === 0 && camForwardForSoftTarget.z === 0)
                        ? player.mesh.rotation.y // Camera nhìn thẳng đứng (hiếm, XZ suy biến) — fallback an toàn
                        : Math.atan2(camForwardForSoftTarget.x, camForwardForSoftTarget.z);

                    const softTarget = findSoftTargetingRotation(player.position, softTargetFacingAngle);
                    let shotDir = null;
                    if (softTarget) {
                        player.softTargetLockY = softTarget.targetY;
                        player.softTargetLerpSpeed = softTarget.lerpSpeed;
                        shotDir = new THREE.Vector3(Math.sin(softTarget.targetY), 0, Math.cos(softTarget.targetY));
                    }

                    // Alpha v1.0 — Character System: gọi executeCharacterSkill() (09-character-
                    // system.js) thay vì fireHydroBeam() trực tiếp — Engine tự đọc skillId/effectType
                    // của nhân vật đang active từ CHARACTER_ROSTER/SKILL_LIBRARY và điều phối đúng
                    // executor (runBeamEffect cho Pressure Shot). HÀNH VI GIỮ NGUYÊN 100% vì
                    // hydro_pressure_shot có effectType 'beam', executeCharacterSkill sẽ gọi đúng
                    // runBeamEffect() với cùng shotDir đã tính ở trên.
                    executeCharacterSkill(getActiveCharacterData(), shotDir);
                    startSkillCooldown(); // Tap: cooldown bắt đầu ngay lập tức
                    pulseSkillButton();
                    skillAimState.phase = 'idle';
                }
                // Nếu phase đã là 'idle' (VD keyup bị gọi trùng lặp do safety-net ở nơi khác), không làm gì.
            }
            window.handleSkillKeyUp = handleSkillKeyUp;

            function pulseSkillButton() {
                const btn = isMobile ? document.getElementById('mobile-skill-btn') : document.getElementById('desktop-skill-btn');
                if (btn) { btn.style.transform = 'scale(0.85)'; setTimeout(() => { btn.style.transform = ''; }, 100); }
            }

            // --- ENTER: chuyển sang phase 'aiming'. Chặn hoàn toàn di chuyển (không chặn camera), hiện
            // crosshair UI, reset các timer liên quan. KHÔNG kích hoạt cooldown — Hold chỉ vào cooldown
            // sau khi Aim State thực sự kết thúc (xem endSkillAim()).
            function startSkillAim() {
                skillAimState.phase = 'aiming';
                skillAimState.aimTimer = 0;
                skillAimState.fireTimer = 0;
                // Character #2 (Bow) Validation — CHỈ zero-out velocity nếu Aim Mode này THỰC SỰ khóa
                // movement (Elemental Skill, getAimModeLockMovement() === true). Bow Charged Attack
                // (lockMovement mặc định false) KHÔNG zero-out — tránh giật/khựng vận tốc đột ngột
                // ngay lúc chuyển sang Aim Mode trong khi WASD vẫn tiếp tục hoạt động bình thường
                // (spec mục 6: "Movement không được tự động thoát Aim Mode" — ngụ ý chuyển động phải
                // mượt mà, không bị cắt ngang khi vào/ra Aim Mode).
                if (getAimModeLockMovement()) {
                    player.velocity.x = 0; player.velocity.z = 0; player.inputVelocity.set(0, 0, 0);
                }
                // Character #2 (Bow) Validation — spec mục 3: Bow dùng crosshair RIÊNG. Đọc
                // player.isBowChargedAiming TẠI THỜI ĐIỂM GỌI startSkillAim() — an toàn vì
                // triggerBowChargedAttack() (bên dưới) LUÔN set isBowChargedAiming = true TRƯỚC KHI
                // gọi startSkillAim() (thứ tự đã đúng từ trước, không cần đổi). Elemental Skill (E)
                // không set field này -> mặc định false -> kind='skill' (hành vi GIỮ NGUYÊN).
                //
                // Elemental Skill Validation — thêm nhánh 'decoy' (player.isDecoyPlacing, set TRƯỚC ở
                // handleSkillKeyDown() — đúng thời điểm cần, tương tự isBowChargedAiming). Reticle
                // Placement Mode dùng chung DOM crosshair với Bow (đơn giản, không tạo thêm 1 element
                // HTML mới cho mỗi loại Aim Mode — có thể tách riêng sau nếu cần phân biệt hình ảnh rõ
                // hơn, không thuộc phạm vi "functional gameplay trước" của task này).
                let aimUIKind = 'skill';
                if (player.isBowChargedAiming) aimUIKind = 'bow';
                else if (player.isDecoyPlacing) aimUIKind = 'bow'; // dùng chung reticle 'bow' — placeholder, xem giải thích trên
                if (window.setSkillAimUIVisible) window.setSkillAimUIVisible(true, aimUIKind);
            }

            // ============================================================
            // Character #2 (Bow) Validation — Charged Attack Bow (Draw Bow -> Aim Mode -> Charge ->
            // Release), spec mục 4-11.
            // ============================================================
            // getBowChargedAttackConfig(): helper DÙNG CHUNG (ĐÚNG PATTERN getChargedAttackConfig()
            // của Sword) — đọc talents.bowChargedAttack của nhân vật Bow đang active, fallback an
            // toàn (mảng rỗng/staminaCost=0) nếu thiếu data (KHÔNG crash cho nhân vật Bow thiếu config
            // — dù archer_test luôn có sẵn, giữ fallback theo đúng nguyên tắc toàn dự án).
            // Character #2 (Bow) Validation — Aim Mode Movement Lock (spec mục 5-7): TRƯỚC ĐÂY
            // updatePhysics() (file 08) hard-code "skillAimState.phase === 'aiming' ? 0 : ..." —
            // dùng CHUNG 1 giá trị boolean cho MỌI nguồn Aim Mode (Skill lẫn Bow), không thể cấu hình
            // riêng. Yêu cầu mới: Character #1 Elemental Skill GIỮ NGUYÊN movement locked (hành vi
            // gốc), nhưng Bow Charged Attack Aim Mode phải UNLOCK movement (WASD hoạt động bình
            // thường trong lúc aim/charge). Thêm field `lockMovement` (data-driven, ĐÚNG concept
            // spec đề xuất "aimModeConfig: { lockMovement: false }") vào bowChargedAttack — đọc bởi
            // updatePhysics() qua getAimModeLockMovement() bên dưới, KHÔNG hard-code true/false trực
            // tiếp trong file 08 nữa. archer_test không tự khai báo field này trong roster -> fallback
            // false ở ĐÂY (Bow mặc định KHÔNG khóa movement, đúng yêu cầu) — nếu vũ khí Bow khác trong
            // tương lai muốn khóa movement, chỉ cần khai báo `lockMovement: true` trong roster.
            function getBowChargedAttackConfig() {
                const character = getActiveCharacterData();
                const cfg = character && character.talents && character.talents.bowChargedAttack;
                return {
                    staminaCost: (cfg && typeof cfg.staminaCost === 'number') ? cfg.staminaCost : 0,
                    lockMovement: (cfg && typeof cfg.lockMovement === 'boolean') ? cfg.lockMovement : false,
                    levels: (cfg && Array.isArray(cfg.levels) && cfg.levels.length > 0) ? cfg.levels : [{ minChargeTime: 0, scaling: { stat: 'ATK', multiplier: 1 }, impact: { type: 'light' }, arrowSpeed: 24, element: null, elementIntensity: 0 }]
                };
            }
            window.getBowChargedAttackConfig = getBowChargedAttackConfig;

            // getAimModeLockMovement(): điểm tra cứu DUY NHẤT cho "Aim Mode hiện tại có khóa movement
            // hay không" — updatePhysics() (file 08) đọc qua hàm này thay vì hard-code
            // "phase === 'aiming' ? 0 : ...". Elemental Skill (Character #1, isBowChargedAiming ===
            // false) -> LUÔN true, GIỮ NGUYÊN 100% hành vi gốc ("Không thay đổi behavior của Character
            // #1 nếu không cần thiết" — yêu cầu đã xác nhận). Bow Charged Attack -> đọc
            // getBowChargedAttackConfig().lockMovement (data-driven, mặc định false).
            function getAimModeLockMovement() {
                if (player.isBowChargedAiming) return getBowChargedAttackConfig().lockMovement;
                return true; // Elemental Skill — hành vi gốc, không đổi.
            }
            window.getAimModeLockMovement = getAimModeLockMovement;

            // Character #2 (Bow) Validation — getAimModeBlocksTerrainStates(): điểm tra cứu DUY NHẤT
            // cho "Aim Mode hiện tại có khóa Jump/Climbing/Gliding/Swimming hay không" (yêu cầu mới:
            // "Chỉ di chuyển, khóa jump, climbing, gliding và swimming khi đang trong aim mode của
            // Bow"). Dùng bởi updatePhysics() (file 08, chặn bắt đầu Climbing/Swimming + Jump) VÀ bởi
            // input layer (07-input-handlers.js phím Space, ui.js mobile-jump-btn) để chặn NGAY TỪ
            // NGUỒN INPUT thay vì chỉ chặn ở tầng physics — nhất quán giữa desktop/mobile.
            //
            // Elemental Skill (Character #1): TRẢ VỀ TRUE — hành vi gốc dự án đã luôn chặn Jump/Glide
            // khi Skill đang aim (xem điều kiện "skillAimState.phase !== 'aiming'" ở phím Space, file
            // 07 — ĐÃ CÓ TỪ TRƯỚC, không phải do task này thêm). Bow Charged Attack: LUÔN true khi
            // đang aim (yêu cầu mới, KHÔNG data-driven như lockMovement vì yêu cầu không đề cập biến
            // thể theo từng vũ khí cho riêng nhóm hành động này — có thể data-driven hóa sau nếu cần).
            function getAimModeBlocksTerrainStates() {
                return skillAimState.phase === 'aiming';
            }
            window.getAimModeBlocksTerrainStates = getAimModeBlocksTerrainStates;

            // getCurrentBowChargeLevel(): tra Charge Level HIỆN TẠI theo player.bowAimChargeTimer đã
            // trôi qua — chọn level CAO NHẤT có minChargeTime <= thời gian đã giữ (spec mục 6 "Level 0
            // -> Level 1 -> Level 2", power tăng dần theo thời gian giữ). levels[] không bắt buộc sắp
            // xếp sẵn trong data (duyệt tìm max để an toàn dù designer lỡ khai báo không đúng thứ tự).
            // Passive/Unique Mechanic — "Overwatch" (Phase 1, Character #2): trả về chargeTimeBonus
            // (giây) đang có hiệu lực cho phiên charge HIỆN TẠI, hoặc 0 nếu không có Passive/không
            // active. TÁCH RIÊNG thành helper dùng chung bởi getCurrentBowChargeLevel() (tra Charge
            // Level) VÀ updateBowAimChargeTick() (Full Charge feedback rising-edge) — 2 nơi PHẢI cộng
            // CÙNG 1 con số để nhất quán (nếu chỉ sửa 1 nơi, Full Charge feedback sẽ nổ SAI thời điểm
            // so với Charge Level thực tế đã đạt — đúng bài học từ bug cooldown UI trước đó, tránh lặp
            // lại kiểu lỗi "2 nơi đọc cấu hình khác nhau").
            //
            // Đọc player.overwatchActiveForThisCharge (đã snapshot 1 LẦN tại triggerBowChargedAttack(),
            // KHÔNG đọc lại player.overwatchTimer ở đây — timer đã bị tiêu về 0 ngay lúc bắt đầu charge,
            // xem giải thích đầy đủ ở triggerBowChargedAttack() bên dưới).
            function getOverwatchChargeTimeBonus() {
                if (!player.overwatchActiveForThisCharge) return 0;
                const character = getActiveCharacterData();
                const cfg = character && character.talents && character.talents.passive && character.talents.passive.overwatch;
                return (cfg && typeof cfg.chargeTimeBonus === 'number') ? cfg.chargeTimeBonus : 0;
            }
            window.getOverwatchChargeTimeBonus = getOverwatchChargeTimeBonus;

            // getCurrentBowChargeLevel(): tra Charge Level HIỆN TẠI theo player.bowAimChargeTimer đã
            // trôi qua — chọn level CAO NHẤT có minChargeTime <= thời gian đã giữ (spec mục 6 "Level 0
            // -> Level 1 -> Level 2", power tăng dần theo thời gian giữ). levels[] không bắt buộc sắp
            // xếp sẵn trong data (duyệt tìm max để an toàn dù designer lỡ khai báo không đúng thứ tự).
            //
            // Passive "Overwatch": cộng getOverwatchChargeTimeBonus() vào giá trị SO SÁNH (effectiveChargeTime)
            // — KHÔNG sửa player.bowAimChargeTimer thật (UI/preview vẫn phản ánh đúng thời gian đã giữ
            // thật, chỉ LEVEL tra được nới lên). Nếu bonus đủ lớn để vượt luôn minChargeTime của Level 2
            // (full charge), hàm này tự nhiên trả về Level 2 luôn — không cần nhánh đặc biệt (đã chốt
            // qua Q&A: "rút ngắn thời gian cần để đạt Full Charge" — ĐÂY chính là cách đạt điều đó, chỉ
            // bằng cách cộng thẳng vào effectiveChargeTime dùng chung cho mọi Level, không xử lý riêng
            // Level 2).
            function getCurrentBowChargeLevel() {
                const levels = getBowChargedAttackConfig().levels;
                const effectiveChargeTime = player.bowAimChargeTimer + getOverwatchChargeTimeBonus();
                let best = levels[0];
                for (let i = 0; i < levels.length; i++) {
                    const lv = levels[i];
                    const minT = (typeof lv.minChargeTime === 'number') ? lv.minChargeTime : 0;
                    const bestMinT = (typeof best.minChargeTime === 'number') ? best.minChargeTime : 0;
                    if (effectiveChargeTime >= minT && minT >= bestMinT) best = lv;
                }
                return best;
            }
            window.getCurrentBowChargeLevel = getCurrentBowChargeLevel;

            // triggerBowChargedAttack(): ĐIỂM VÀO — gọi 1 LẦN DUY NHẤT từ nhánh 'charging' của
            // updateCombat() (file 08) ngay khi phát hiện weaponType === 'bow'. Spec mục 4 "Draw Bow
            // Transition -> Aim Mode": chuyển thẳng player.attackState về 'idle' (Bow Charged Attack
            // KHÔNG dùng chargedWindup/chargedActive/chargedRecovery của Sword — toàn bộ thời gian
            // charge/aim diễn ra TRONG skillAimState, tách biệt khỏi player.attackState) rồi kích hoạt
            // startSkillAim() — ĐÚNG hàm Aim Mode hiện có (spec mục 4.2 "Bow Charged Attack phải reuse
            // Aim Mode hiện tại", mục 11.9 "Existing Aim Mode phải được reuse"). isBowChargedAiming =
            // true đánh dấu nguồn kích hoạt là Bow (để updateSkillAim()/endSkillAim() rẽ đúng nhánh,
            // KHÔNG gọi executeCharacterSkill() — nhân vật Bow không có skillId).
            //
            // Stamina Gate: spec mục 10 "staminaCost = 0" cho archer_test, NHƯNG đọc qua config (không
            // hard-code 0 ở Engine) — nhân vật Bow khác trong tương lai có thể có staminaCost khác 0
            // (spec mục 10: "Không giả định mọi Charged Attack đều có cùng stamina behavior"). Dùng
            // ĐÚNG STAMINA_CONFIG/player.stamina đã có (giống triggerChargedAttack() của Sword) — nếu
            // không đủ, hủy về idle NGAY, không vào Aim Mode.
            function triggerBowChargedAttack() {
                const staminaCost = getBowChargedAttackConfig().staminaCost;
                if (player.stamina < staminaCost) {
                    sfx.playBlockedSound();
                    player.attackState = 'idle';
                    return;
                }
                if (staminaCost > 0) {
                    player.stamina = Math.max(STAMINA_CONFIG.MIN_STAMINA, player.stamina - staminaCost);
                }

                player.attackState = 'idle'; // xem giải thích ở trên — Bow Charged Attack không dùng chargedWindup/Active/Recovery
                player.chargeTimer = 0;
                player.chargeReady = false;

                player.isBowChargedAiming = true;
                player.bowAimChargeTimer = 0;

                // Passive/Unique Mechanic — "Overwatch" (Phase 1, Character #2): TIÊU THỤ
                // overwatchTimer NGAY TẠI ĐÂY (đã chốt qua Q&A — "tiêu ngay lúc bắt đầu giữ nút", dù
                // sau đó Player thả sớm/hủy không bắn thì Passive vẫn đã mất). Snapshot vào
                // overwatchActiveForThisCharge để giữ hiệu lực SUỐT phiên charge này (đọc bởi
                // getCurrentBowChargeLevel()/updateBowAimChargeTick()), rồi set overwatchTimer = 0 NGAY
                // — không phải giảm dần, vì "tiêu" nghĩa là mất toàn bộ ngay lập tức, không phải hết
                // dần theo thời gian.
                player.overwatchActiveForThisCharge = player.overwatchTimer > 0;
                player.overwatchTimer = 0;

                startSkillAim(); // REUSE Aim Mode hiện có (camera zoom/lệch, crosshair, khóa di chuyển)
                startBowArrowPreview(); // spec mục 5 — arrow visual xuất hiện NGAY khi vào Aim Mode (Level 0)
                sfx.playSwing(); // GIỮ NGUYÊN SFX hiện có cho hành động "kéo cung" — nợ kỹ thuật SFX riêng Bow, không thuộc phạm vi task

                // --- SOFT TARGETING: xoay nhân vật về hướng camera ngay khi vào Aim (ĐÚNG PATTERN
                // các entry point khác của Aim Mode — startSkillAim() không tự làm việc này, nhân
                // vật sẽ tự xoay dần MỖI FRAME trong updateSkillAim() theo hướng crosshair, giống Skill).
            }
            window.triggerBowChargedAttack = triggerBowChargedAttack;

            // ============================================================
            // Character #2 (Bow) Validation — Arrow Visual / Aim Charge Effect (spec mục 5)
            // ============================================================
            // Arrow preview là 1 THREE.Mesh TĨNH gắn làm CON của rightHand (KHÔNG phải projectile
            // thật trong player.activeEffects.arrows — không di chuyển/không va chạm/không gây
            // damage), đặt tại vị trí xấp xỉ shooting point trên Bow, để người chơi nhìn thấy "đã đặt
            // tên vào cung" trong lúc Aim/Charge — TÁI DÙNG createArrowVisualMesh() (file 09, cùng
            // geometry với arrow bay thật) để nhất quán hình dạng, không tạo asset riêng.
            //
            // startBowArrowPreview(): tạo mesh 1 LẦN khi vào Aim Mode (gọi từ triggerBowChargedAttack()
            // ở trên) — màu/scale khởi tạo theo Charge Level 0 (getBowChargedAttackConfig().levels[0]),
            // rồi updateBowArrowPreview() (gọi mỗi frame từ updateBowAimChargeTick()) chỉ CẬP NHẬT
            // material.color/scale theo Charge Level hiện tại — KHÔNG tạo/xóa mesh mỗi frame (tránh
            // chi phí geometry/material dựng lại liên tục).
            function startBowArrowPreview() {
                clearBowArrowPreview(); // an toàn nếu lỡ có preview cũ chưa dọn (không nên xảy ra, nhưng tránh rò rỉ mesh nếu có)

                const levels = getBowChargedAttackConfig().levels;
                const level0 = levels[0];
                const previewColor = (level0 && level0.elementIntensity > 0) ? 0xf59e0b : 0xe2c290;
                const previewMesh = window.createArrowVisualMesh(previewColor);

                // Vị trí LOCAL so với rightHand — đặt gần weaponGrip (nơi Bow gắn), hướng dọc theo Z
                // cục bộ của rightHand (xấp xỉ hướng "đặt tên vào dây cung, chĩa về phía trước nhân
                // vật"). PLACEHOLDER đơn giản, không phải vị trí anchor chính xác theo từng animation
                // frame của Bow (ngoài phạm vi task — không có xương/animation rig cho việc này).
                previewMesh.position.set(0, 0, 0.35);
                previewMesh.rotation.x = Math.PI / 2; // trục dài (Y cục bộ CylinderGeometry) nằm dọc Z sau khi xoay quanh X

                player.rightHand.add(previewMesh);
                player.bowAimArrowPreview = previewMesh;
            }
            window.startBowArrowPreview = startBowArrowPreview;

            // updateBowArrowPreview(level): CHỈ đổi material.color + scale theo Charge Level hiện tại
            // (spec mục 5: Level 0 = physical/không effect, Level 1 = elemental nhẹ, Level 2 = elemental
            // mạnh/Full Charge). elementIntensity ĐỌC TỪ DATA (levels[i].elementIntensity, roster) —
            // KHÔNG áp dụng logic Element Application/Aura/Reaction nào (spec mục 5 xác nhận CHƯA
            // implement) — chỉ dùng intensity để nội suy màu/scale làm visual feedback đơn thuần.
            function updateBowArrowPreview(level) {
                if (!player.bowAimArrowPreview || !level) return;
                const intensity = (typeof level.elementIntensity === 'number') ? level.elementIntensity : 0;

                // Màu: nội suy từ màu "physical" (be nhạt, Level 0) sang màu "elemental" (hổ phách,
                // full ở intensity=1) — PLACEHOLDER, chờ Element System thiết kế màu theo character.element
                // thật (character.element hiện null cho archer_test, xem 10-character-roster.js).
                const baseColor = new THREE.Color(0xe2c290);
                const elementalColor = new THREE.Color(0xf59e0b);
                const mixedColor = baseColor.clone().lerp(elementalColor, intensity);
                player.bowAimArrowPreview.material.color.copy(mixedColor);

                // Scale nhẹ tăng theo intensity (spec mục 6: "Visual Effect... tăng dần") — placeholder
                // đơn giản, KHÔNG phải polish hình ảnh cuối cùng.
                const scale = 1 + intensity * 0.35;
                player.bowAimArrowPreview.scale.set(scale, scale, scale);
            }
            window.updateBowArrowPreview = updateBowArrowPreview;

            // clearBowArrowPreview(): gỡ mesh khỏi rightHand + giải phóng geometry/material — gọi từ
            // endBowChargedAttack() (Release — arrow preview biến mất, thay bằng arrow bay thật qua
            // spawnArrow()) VÀ từ startBowArrowPreview() (dọn preview cũ trước khi tạo mới, phòng hờ).
            function clearBowArrowPreview() {
                if (!player.bowAimArrowPreview) return;
                player.rightHand.remove(player.bowAimArrowPreview);
                player.bowAimArrowPreview.geometry.dispose();
                player.bowAimArrowPreview.material.dispose();
                player.bowAimArrowPreview = null;
            }
            window.clearBowArrowPreview = clearBowArrowPreview;

            // updateBowAimChargeTick(dt): chạy MỖI FRAME trong lúc skillAimState.phase === 'aiming' VÀ
            // player.isBowChargedAiming === true — CHỈ đếm bowAimChargeTimer + xử lý Full Charge
            // feedback (spec mục 7). KHÔNG bắn gì ở đây (Release chỉ xảy ra ở endBowChargedAttack(),
            // gọi từ endSkillAim() khi người chơi THẢ nút — spec mục 8 "khi thả nút, arrow bắn NGAY").
            function updateBowAimChargeTick(dt) {
                // Passive/Unique Mechanic — "Overwatch": cùng bonus với getCurrentBowChargeLevel(),
                // đọc 1 LẦN ở đầu hàm (overwatchActiveForThisCharge không đổi trong suốt phiên charge,
                // an toàn khi cache lại cho cả 2 phép so sánh wasFullCharge/isFullChargeNow bên dưới —
                // PHẢI dùng CÙNG 1 giá trị bonus cho cả 2, nếu không rising-edge có thể bị lệch 1 frame).
                const overwatchBonus = getOverwatchChargeTimeBonus();
                const levels = getBowChargedAttackConfig().levels;
                const maxLevelMinTime = levels[levels.length - 1].minChargeTime;
                const wasFullCharge = (player.bowAimChargeTimer + overwatchBonus) >= maxLevelMinTime;
                player.bowAimChargeTimer += dt;
                const isFullChargeNow = (player.bowAimChargeTimer + overwatchBonus) >= maxLevelMinTime;

                // Spec mục 5/6 — Arrow Visual/Charge Level progression: cập nhật MỖI FRAME theo Charge
                // Level HIỆN TẠI (getCurrentBowChargeLevel() đã có sẵn, dùng LẠI logic tra cứu y hệt
                // endBowChargedAttack() dùng lúc Release — 1 nguồn xác định Charge Level DUY NHẤT).
                updateBowArrowPreview(getCurrentBowChargeLevel());

                // Spec mục 7 — Full Charge feedback: kích hoạt CHÍNH XÁC 1 LẦN tại thời điểm chuyển
                // sang Full Charge (không lặp lại mỗi frame trong khi vẫn giữ Full Charge) — dùng
                // wasFullCharge/isFullChargeNow để bắt đúng CẠNH LÊN (rising edge), placeholder đơn
                // giản: pulse camera shake nhẹ + sfx có sẵn (Visual/Sound/Animation feedback CHI TIẾT
                // để placeholder/configurable theo đúng spec mục 7, không cần polish cuối).
                if (isFullChargeNow && !wasFullCharge) {
                    sfx.playHit(); // PLACEHOLDER — chưa có SFX riêng "Full Charge" cho Bow
                    cameraState.shakeTimer = 0.12;
                    cameraState.shakeIntensity = 0.10;
                }
            }
            window.updateBowAimChargeTick = updateBowAimChargeTick;

            // endBowChargedAttack(): gọi từ endSkillAim() KHI player.isBowChargedAiming === true — spec
            // mục 8 "Release: arrow spawn NGAY lập tức khi thả nút, không delay". Reuse HOÀN TOÀN
            // raycastFromCrosshair() (đã tính sẵn ở nơi gọi, truyền vào forward) để xác định hướng bắn,
            // ĐÚNG PATTERN endSkillAim() cũ của Elemental Skill — KHÔNG tạo aim-resolution logic mới.
            // Spec mục 9: Charged Arrow dùng CHUNG spawnArrow() với Normal Arrow — chỉ khác qua
            // `overrides` (speed theo Charge Level). Spec mục 5/6: scaling/impact/arrowSpeed đọc từ
            // ĐÚNG Charge Level đạt được tại thời điểm release (getCurrentBowChargeLevel()).
            function endBowChargedAttack(forward) {
                const character = getActiveCharacterData();
                const level = getCurrentBowChargeLevel();

                // Spec mục 5 — arrow PREVIEW (tĩnh, gắn trên Bow) biến mất NGAY khi Release, thay bằng
                // arrow BAY THẬT (spawnArrow() bên dưới) — dọn TRƯỚC khi spawn để không có 2 mesh arrow
                // hiển thị chồng lấn trong cùng 1 frame.
                clearBowArrowPreview();

                const scaling = (level.scaling && typeof level.scaling.multiplier === 'number')
                    ? { stat: level.scaling.stat, multiplier: level.scaling.multiplier }
                    : { stat: 'ATK', multiplier: 1 };
                const impact = (level.impact && typeof level.impact.type === 'string') ? { type: level.impact.type } : { type: 'light' };

                const spawnPosition = player.position.clone().addScaledVector(forward, 0.9).add(new THREE.Vector3(0, 0.9, 0));
                // element/elementIntensity: CHỈ TRUYỀN LÀM DATA đi kèm arrow (spec mục 5 — "chuẩn bị
                // data/architecture để biểu diễn", KHÔNG áp dụng Element Application/Aura/Reaction nào
                // ở đây — overrides.element/elementIntensity hiện KHÔNG được updateArrowEffect() đọc
                // tới cho bất kỳ logic gameplay nào, chỉ lưu trên effect instance cho Element System
                // thiết kế sau này đọc, xem spawnArrow() file 09).
                spawnArrow(character, spawnPosition, forward, scaling, impact, {
                    speed: (typeof level.arrowSpeed === 'number') ? level.arrowSpeed : 24,
                    color: 0xf59e0b, // PLACEHOLDER — arrow charged có màu khác arrow thường để dễ phân biệt khi test
                    element: (level.element === 'characterElement') ? character.element : level.element,
                    elementIntensity: level.elementIntensity || 0
                });

                player.isBowChargedAiming = false;
                player.bowAimChargeTimer = 0;

                // Passive/Unique Mechanic — "Overwatch": dọn dẹp SAU KHI level đã resolve xong ở trên
                // (getCurrentBowChargeLevel() đã dùng buff nếu có) — reset về false để KHÔNG rò rỉ sang
                // phiên Charged Attack kế tiếp không liên quan (phiên đó phải tự đọc lại
                // player.overwatchTimer MỚI qua triggerBowChargedAttack(), không được thừa hưởng buff
                // đã dùng từ phiên này).
                player.overwatchActiveForThisCharge = false;
            }
            window.endBowChargedAttack = endBowChargedAttack;

            // --- UPDATE: gọi mỗi frame từ updateCombat(). Xử lý cả 2 phase 'holding' và 'aiming'.
            function updateSkillAim(dt) {
                if (skillAimState.phase === 'holding') {
                    skillAimState.heldTime += dt;
                if (skillAimState.heldTime >= getActiveSkillAimConfig().holdThreshold) {
                        startSkillAim();
                    }
                }

                if (skillAimState.phase !== 'aiming') {
                    // Không (còn) đang aim — lerp cameraOffsetT về 0 dần để camera trả lại vị trí bình
                    // thường mượt mà (không giật cứng) sau khi endSkillAim() vừa chuyển phase về 'idle'.
                    // An toàn khi gọi cả lúc offset đã là 0 (VD phase 'holding'/'idle' thông thường).
                    if (skillAimState.cameraOffsetT > 0) {
                        skillAimState.cameraOffsetT = Math.max(0, skillAimState.cameraOffsetT - (1 - Math.exp(-getActiveSkillAimConfig().aim.cameraOffsetLerpSpeed * dt)));
                    }
                    return;
                }

                // --- AIM 3D: aimDir là hướng CAMERA thô (3 trục X/Y/Z) — vẫn cần giữ lại làm fallback
                // (facing gần thẳng đứng) và làm gốc tính provisionalSpawn bên dưới, y hệt trước đây.
                const aimDir = new THREE.Vector3();
                camera.getWorldDirection(aimDir);
                if (aimDir.lengthSq() < 0.0001) aimDir.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
                aimDir.normalize();

                // --- HƯỚNG XOAY NHÂN VẬT: TRƯỚC ĐÂY xoay theo aimDir (hướng camera thô) — nhưng đạn
                // THẬT SỰ bay theo correctedDir (từ vị trí spawn trên người nhân vật TỚI điểm crosshair
                // raycast trúng, xem nhánh bắn phía dưới), 2 hướng này KHÔNG song song (origin đạn ở
                // thân player, camera ở xa phía sau/trên — bug đã note ở nhánh bắn). Điều chỉnh: raycast
                // MỖI FRAME (không chỉ lúc fireTimer <= 0) để lấy đúng điểm ngắm hiện tại, tính lại
                // correctedDir kiểu tương tự, rồi xoay nhân vật theo correctedDir đó — để hình ảnh nhân
                // vật khớp ĐÚNG hướng skill sắp/đang phóng ra, không phải hướng camera.
                const provisionalSpawnForFacing = player.position.clone().addScaledVector(aimDir, 0.9);
                const crosshairAimResult = raycastFromCrosshair();
                const facingShotDir = crosshairAimResult.point.clone().sub(provisionalSpawnForFacing);
                if (facingShotDir.lengthSq() > 0.0001) facingShotDir.normalize(); else facingShotDir.copy(aimDir);

                const facingDir = new THREE.Vector3(facingShotDir.x, 0, facingShotDir.z);
                if (facingDir.lengthSq() > 0.0001) {
                    facingDir.normalize();
                    player.mesh.rotation.y = Math.atan2(facingDir.x, facingDir.z);

                    // BUGFIX (Pre-Alpha Stabilization — Dash hướng sai sau Aim Mode): đồng bộ
                    // lastMovementDirection theo ĐÚNG hướng player.mesh vừa xoay tới (nay là hướng skill
                    // phóng ra, không còn là hướng camera thô) trong Aim Mode. Trước đây, input di
                    // chuyển bị khóa hoàn toàn trong lúc Aim (xem startSkillAim(): velocity.x/z = 0) nên
                    // lastMovementDirection KHÔNG được cập nhật ở khối input-movement thường
                    // (updatePhysics(), chỉ chạy khi có hasMovementInput) — nó bị "đóng băng" ở hướng di
                    // chuyển CUỐI CÙNG trước khi vào Aim. Hệ quả: nếu người chơi thoát Aim rồi Dash ngay
                    // mà không giữ AWSD/joystick, triggerDash() (06-camps-save-system.js) rơi vào nhánh
                    // fallback dùng lastMovementDirection cũ đó — bắn SAI hướng, lệch với hướng nhân vật
                    // vừa xoay tới lúc Aim. Cập nhật ở đây mỗi frame trong Aim Mode để
                    // lastMovementDirection luôn phản ánh đúng hướng player.mesh hiện tại.
                    player.lastMovementDirection.copy(facingDir);
                }
                // Nếu facingDir gần (0,0,0) (điểm ngắm gần như thẳng trên/dưới vị trí spawn), giữ nguyên
                // rotation.y hiện tại của nhân vật — không cần fallback gán lại vì không dùng facingDir
                // cho việc gì khác.

                // Lerp cameraOffsetT tăng dần về 1 (full aim camera: zoom + lệch) — mượt mà thay vì snap.
                skillAimState.cameraOffsetT = Math.min(1, skillAimState.cameraOffsetT + (1 - Math.exp(-getActiveSkillAimConfig().aim.cameraOffsetLerpSpeed * dt)));

                skillAimState.aimTimer += dt;

                // Character #2 (Bow) Validation — DISPATCH: Aim Mode ĐANG ĐƯỢC TÁI SỬ DỤNG BỞI Charged
                // Attack Bow (isBowChargedAiming === true) rẽ nhánh HOÀN TOÀN KHÁC phần "bắn liên tục
                // small shot mỗi fireInterval" bên dưới (đó là hành vi RIÊNG của Elemental Skill Hold —
                // spec Bow KHÔNG có bắn liên tục trong lúc giữ Aim, chỉ 1 phát DUY NHẤT lúc Release,
                // spec mục 8). CHỈ đếm Charge Level (updateBowAimChargeTick()) — KHÔNG có trần thời
                // gian nào áp dụng cho Bow ở đây nữa (xem BUGFIX ở khối "Trần thời gian tối đa" phía
                // dưới — Bow charge giờ vô hạn, chỉ kết thúc khi Release thật sự).
                //
                // Elemental Skill Validation — thêm nhánh isDecoyPlacing: Placement Mode KHÔNG bắn gì
                // liên tục trong lúc giữ (giống Bow, khác Elemental Skill Hold gốc) — chỉ cần camera/
                // crosshair hoạt động (đã xử lý ở trên, chung cho mọi nhánh) để người chơi NGẮM VỊ TRÍ,
                // việc deploy thật sự xảy ra ở endSkillAim() khi Release (spec mục 2: "Confirm/Release
                // -> Spawn Decoy"). Nhánh else (fireTimer/executeSkillTickEffect) GIỮ NGUYÊN 100% cho
                // Elemental Skill khi cả 2 cờ đều false — hành vi Character #1 không đổi.
                if (player.isBowChargedAiming) {
                    updateBowAimChargeTick(dt);
                } else if (player.isDecoyPlacing) {
                    // Không làm gì thêm mỗi frame — Placement Mode chỉ cần camera/facing đã cập nhật ở
                    // trên. Có thể mở rộng sau này (VD hiện preview vị trí Decoy sẽ đặt, xem limitation
                    // trong báo cáo cuối).
                } else {
                    skillAimState.fireTimer -= dt;
                    if (skillAimState.fireTimer <= 0) {
                        skillAimState.fireTimer = getActiveSkillAimConfig().aim.fireInterval;
                        // --- CROSSHAIR ALIGNMENT: dùng LẠI facingShotDir đã raycast ở trên (khối xoay nhân
                        // vật, chạy mỗi frame) thay vì raycast lại lần nữa ở đây — vừa tránh raycast trùng
                        // trong cùng 1 frame, vừa đảm bảo hướng đạn bắn ra LUÔN khớp tuyệt đối với hướng
                        // player.mesh đang xoay tới (yêu cầu: nhân vật quay theo đúng hướng skill phóng ra).
                        // Alpha v1.0 — Character System: gọi executeSkillTickEffect() thay vì
                        // fireHydroProjectile() trực tiếp — đọc SKILL_LIBRARY[skillId].aim.tickEffect
                        // (skill CON dùng riêng cho Small Shot lúc giữ Aim, khác skill cấp cao nhất dùng
                        // cho Tap/Beam). HÀNH VI GIỮ NGUYÊN 100%.
                        executeSkillTickEffect(getActiveCharacterData(), facingShotDir);
                    }
                }

                // Trần thời gian tối đa: tự động kết thúc dù người chơi vẫn đang giữ phím.
                //
                // Character #2 (Bow) Validation — BUGFIX: trước đây điều kiện này chạy VÔ ĐIỀU KIỆN
                // cho CẢ Bow LẪN Skill, dùng CHUNG getActiveSkillAimConfig().aim.maxDuration (fallback
                // về ELEMENTAL_SKILL_CONFIG.aim.maxDuration = 3.5s vì archer_test.skillId === null).
                // Hệ quả: giữ Bow Charged Attack quá 3.5s (rất dễ xảy ra khi Level 2 chỉ cần 1.4s rồi
                // người chơi tiếp tục ngắm) sẽ bị TỰ ĐỘNG endSkillAim() -> bắn arrow dù CHƯA thả nút —
                // đúng behavior của Elemental Skill Hold (có trần thời gian giữ hợp lý) nhưng SAI cho
                // Bow (yêu cầu đã xác nhận: "sau khi vào Level 2 sẽ KHÔNG tự động bắn, phải đợi Release
                // — thời gian charge vô hạn"). Sửa: CHỈ áp dụng trần thời gian này khi KHÔNG PHẢI Bow —
                // Bow Charged Attack giờ có thể giữ Aim Mode VÔ THỜI HẠN, chỉ kết thúc khi
                // handleAttackUp() gọi endSkillAim() (Release thật sự, xem combat.js).
                if (!player.isBowChargedAiming && skillAimState.aimTimer >= getActiveSkillAimConfig().aim.maxDuration) {
                    endSkillAim();
                }
            }
            window.updateSkillAim = updateSkillAim;

            // --- EXIT: bắn Pressure Shot theo hướng camera hiện tại (= hướng crosshair), ẩn crosshair,
            // trả camera về bình thường, vào cooldown, trở lại phase 'idle' (điều khiển bình thường).
            function endSkillAim() {
                if (skillAimState.phase !== 'aiming') return;
                // AIM 3D: dùng đầy đủ hướng camera (cả trục Y) — Pressure Shot bắn đúng lên cao/xuống
                // thấp theo hướng crosshair, không còn giới hạn song song mặt đất.
                const camForward = new THREE.Vector3();
                camera.getWorldDirection(camForward);
                if (camForward.lengthSq() < 0.0001) camForward.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
                camForward.normalize();

                // --- CROSSHAIR ALIGNMENT: cùng kỹ thuật như updateSkillAim() — raycast từ camera lấy
                // điểm đích thật, rồi tính lại hướng bắn từ điểm SPAWN (không đổi vị trí spawn) tới đúng
                // điểm đó, thay vì bắn song song hướng camera (nguồn gốc bug lệch Crosshair đã xác định
                // trong lịch sử trò chuyện — origin ở thân player, camera thật ở xa phía sau/trên).
                const aimResult = raycastFromCrosshair();
                const provisionalOrigin = player.position.clone().addScaledVector(camForward, 0.9);
                const correctedForward = aimResult.point.clone().sub(provisionalOrigin);
                if (correctedForward.lengthSq() > 0.0001) correctedForward.normalize(); else correctedForward.copy(camForward);

                // Elemental Skill Validation — DISPATCH: Aim Mode đang được Decoy Placement Mode tái
                // sử dụng -> Confirm/Deploy Decoy TẠI ĐIỂM RAYCAST (spec mục 2: "Chọn vị trí -> Confirm
                // -> Spawn Decoy"), KHÔNG bắn theo hướng như executeCharacterSkill()/endBowChargedAttack
                // (Decoy không phải projectile/beam — cần 1 ĐIỂM, không phải 1 HƯỚNG). aimResult.point
                // đã có sẵn từ raycastFromCrosshair() ở trên (world position thật nơi tia ngắm chạm
                // vào — spec mục 5 nói tương tự cho projectile origin, ở đây áp dụng cho placement
                // point). Snap Y theo getGroundYForPosition() (world collision hiện có, spec mục 2:
                // "không spawn ở vị trí không hợp lệ nếu có thể kiểm tra") — tránh Decoy lơ lửng giữa
                // không trung nếu raycast trúng 1 điểm hơi cao hơn mặt đất thật (VD trúng lá cây/tán
                // cỏ) hoặc chìm dưới nếu trúng điểm thấp hơn ground thật.
                //
                // wasDecoyPlacing: lưu TRƯỚC khi reset (tương tự wasBowChargedAiming ở dưới) để
                // setSkillAimUIVisible(false, kind) chọn đúng crosshair cần ẩn.
                const wasDecoyPlacing = player.isDecoyPlacing;
                if (wasDecoyPlacing) {
                    const character = getActiveCharacterData();
                    const placementPoint = aimResult.point.clone();
                    // placementMaxRange (SKILL_LIBRARY, file 11) — spec mục 2: giới hạn khoảng cách đặt
                    // hợp lý, tránh raycast trúng điểm quá xa (chân trời/bầu trời) rồi đặt Decoy ở đó.
                    const skillData = SKILL_LIBRARY[character.skillId];
                    const maxRange = (skillData && typeof skillData.placementMaxRange === 'number') ? skillData.placementMaxRange : 15;
                    const distFromPlayer = placementPoint.distanceTo(player.position);
                    if (distFromPlayer > maxRange) {
                        // Quá xa — kéo điểm đặt về ĐÚNG maxRange dọc theo hướng đã ngắm, thay vì hủy bỏ
                        // hoàn toàn (giữ cảm giác phản hồi tức thời, người chơi luôn đặt được Decoy ở
                        // khoảng cách tối đa nếu ngắm ra xa quá tầm).
                        const dirFromPlayer = placementPoint.clone().sub(player.position).normalize();
                        placementPoint.copy(player.position).addScaledVector(dirFromPlayer, maxRange);
                    }
                    // Snap Y xuống đúng mặt đất/obstacle tại vị trí (X,Z) đã chọn — getGroundYForPosition()
                    // đọc obstacles[]/terrain hiện có, KHÔNG tạo world collision check mới.
                    placementPoint.y = getGroundYForPosition(placementPoint);

                    deployDecoy(character, placementPoint);
                    startSkillCooldown();
                    player.isDecoyPlacing = false;

                    skillAimState.phase = 'idle';
                    skillAimState.aimTimer = 0;
                    skillAimState.fireTimer = 0;
                    if (window.setSkillAimUIVisible) window.setSkillAimUIVisible(false, 'bow'); // dùng chung reticle 'bow', xem giải thích ở startSkillAim()
                    pulseSkillButton();
                    return; // KHÔNG chạy tiếp nhánh Bow/Elemental Skill bên dưới
                }

                // Character #2 (Bow) Validation — DISPATCH: Aim Mode đang được Charged Attack Bow tái
                // sử dụng -> Release bắn arrow (spec mục 8, endBowChargedAttack() trong combat.js),
                // KHÔNG gọi executeCharacterSkill() (nhân vật Bow không có skillId — gọi nhầm sẽ no-op
                // vô hại nhưng sai ngữ nghĩa) VÀ KHÔNG startSkillCooldown() (Bow Charged Attack không
                // có cooldown riêng trong phạm vi task này — spec không đề cập cooldown cho Charged
                // Attack, chỉ có Stamina Gate đã xử lý ở triggerBowChargedAttack()). Nhánh else GIỮ
                // NGUYÊN 100% hành vi Elemental Skill cũ của Character #1.
                //
                // wasBowChargedAiming: lưu LẠI giá trị TRƯỚC khi gọi endBowChargedAttack() — hàm đó tự
                // set player.isBowChargedAiming = false Ở BÊN TRONG (đúng thiết kế, đánh dấu Charged
                // Attack đã hoàn tất) — nếu đọc player.isBowChargedAiming SAU lời gọi đó (như ở dòng
                // setSkillAimUIVisible bên dưới) sẽ luôn thấy false, ẩn NHẦM crosshair Bow thay vì
                // crosshair Skill mặc định (kind rơi vào 'skill' dù vừa aim bằng Bow).
                const wasBowChargedAiming = player.isBowChargedAiming;
                if (wasBowChargedAiming) {
                    endBowChargedAttack(correctedForward);
                } else {
                    // Alpha v1.0 — Character System: gọi executeCharacterSkill() thay vì fireHydroBeam()
                    // trực tiếp. HÀNH VI GIỮ NGUYÊN 100%.
                    executeCharacterSkill(getActiveCharacterData(), correctedForward);
                    startSkillCooldown(); // Hold: cooldown chỉ bắt đầu SAU khi kết thúc
                }

                skillAimState.phase = 'idle';
                skillAimState.aimTimer = 0;
                skillAimState.fireTimer = 0;
                if (window.setSkillAimUIVisible) window.setSkillAimUIVisible(false, wasBowChargedAiming ? 'bow' : 'skill');
                pulseSkillButton();
                // cameraOffsetT KHÔNG reset về 0 ngay — để updateSkillAim() lerp mượt về bình thường ở
                // các frame kế tiếp (xem nhánh "phase !== 'aiming'" phía trên).
            }

            function triggerElementalSkill() {
                // Giữ lại hàm này cho tương thích ngược (được gọi ở nơi khác nếu có) — hành vi mặc định
                // tương đương 1 Tap tức thời khi gọi trực tiếp mà không qua handleSkillKeyDown/Up.
                if (!canUseElementalSkill()) return;
                sfx.playSwing();
                // Alpha v1.0 — Character System: dir=undefined -> executeCharacterSkill/runBeamEffect
                // tự fallback theo player.mesh.rotation.y, y hệt fireHydroBeam() không tham số cũ.
                executeCharacterSkill(getActiveCharacterData(), undefined);
                startSkillCooldown();
                pulseSkillButton();
            }
            window.triggerElementalSkill = triggerElementalSkill;

            // Alpha v1.0 — Character System: fireHydroProjectile() đã bị XÓA (dead code) — thay bằng
            // runSmallShotEffect() trong 09-character-system.js, gọi qua executeSkillTickEffect().

            // Alpha v1.0 — Character System: fireHydroBeam() đã bị XÓA (dead code) — thay bằng
            // runBeamEffect() trong 09-character-system.js, gọi qua executeCharacterSkill().
            // raycastAABBDistance() bên dưới VẪN GIỮ LẠI (không phải dead code) — runBeamEffect()
            // trong file 09 vẫn gọi hàm này để kiểm tra obstacle chặn đường bắn.

            // nếu không cắt. Dùng thuật toán "slab method" chuẩn — đủ dùng cho obstacle dạng hộp hiện có.
            function raycastAABBDistance(ray, aabb) {
                let tmin = 0, tmax = Infinity;
                const origins = [ray.origin.x, ray.origin.y, ray.origin.z];
                const dirs = [ray.dir.x, ray.dir.y, ray.dir.z];
                const mins = [aabb.minX, aabb.minY, aabb.minZ];
                const maxs = [aabb.maxX, aabb.maxY, aabb.maxZ];
                for (let axis = 0; axis < 3; axis++) {
                    if (Math.abs(dirs[axis]) < 1e-8) {
                        if (origins[axis] < mins[axis] || origins[axis] > maxs[axis]) return null;
                    } else {
                        let t1 = (mins[axis] - origins[axis]) / dirs[axis];
                        let t2 = (maxs[axis] - origins[axis]) / dirs[axis];
                        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
                        tmin = Math.max(tmin, t1);
                        tmax = Math.min(tmax, t2);
                        if (tmin > tmax) return null;
                    }
                }
                return tmin;
            }

            // --- AIM MODE & CROSSHAIR ALIGNMENT (Pre-Alpha Stabilization) ---
            // raycastFromCrosshair(): bắn 1 tia THẬT từ VỊ TRÍ CAMERA (không phải player.position) theo
            // đúng hướng camera đang nhìn — đây chính là "đường ngắm" mà Crosshair (chấm giữa màn hình)
            // đại diện.
            //
            // BUGFIX (mở rộng phạm vi raycast): TRƯỚC ĐÂY chỉ quét thủ công 2 mảng cố định — obstacles
            // (AABB va chạm) và enemies (bán kính ước lượng hình cầu) — nên KHÔNG bắt được bất kỳ mesh
            // nào khác không nằm trong 2 mảng đó (mặt đất/ground, cây/đá trang trí từ
            // createEnvironmentProps(), signpost, hàng rào spawn...), vì các mesh này chỉ scene.add()
            // thẳng, không có AABB va chạm đăng ký riêng. Thay bằng THREE.Raycaster THẬT, quét trực tiếp
            // scene.children (recursive) — tự động bắt được MỌI mesh có geometry thật đang tồn tại
            // trong scene, không cần đăng ký thủ công từng loại object vào từng mảng riêng như trước.
            //
            // Loại trừ khỏi kết quả raycast (những thứ KHÔNG nên chặn đường ngắm của chính người chơi):
            //   - player.mesh và toàn bộ mesh con của nó (không thể tự chặn tia ngắm của chính mình).
            //   - THREE.InstancedMesh (cỏ — grassMesh) — phủ dày đặc khắp map, nếu để chặn tia thì
            //     crosshair sẽ luôn dừng lại ở khoảng cách rất gần bất cứ đâu có cỏ, phá hỏng hoàn toàn
            //     khả năng ngắm xa. Cỏ thuần tuý là chi tiết hình ảnh, không có ý nghĩa va chạm — loại
            //     TRƯỚC khi gọi intersectObjects() (không phải lọc kết quả sau) để tránh lãng phí raycast
            //     lên hàng nghìn instance mỗi frame trong lúc Aim (xem raycastFromCrosshair() bên dưới).
            //   - Mesh thuộc hiệu ứng tạm thời của CHÍNH Elemental Skill (activeProjectiles đã bắn ra,
            //     activeHydroBeamVisuals) — tránh trường hợp viên đạn/tia nước vừa bắn ra trước đó (còn
            //     đang bay/còn hiệu ứng fade) lại tự chặn đường ngắm của phát bắn tiếp theo.
            //   - THREE.Sprite (thanh máu enemy...) — luôn xoay mặt về camera, là lớp UI overlay chứ
            //     không phải hình khối thật của thế giới. Cần crosshairRaycaster.camera (set 1 lần bên
            //     dưới) để Three.js không throw lỗi khi raycast chạm phải Sprite.
            //
            // Trả về { point: THREE.Vector3, distance: number, hitEnemy: Enemy | null }:
            //   - Trúng vật gì đó: point = điểm va chạm gần nhất trên toàn bộ tia.
            //   - Không trúng gì: point = điểm ảo cách camera 700m theo hướng nhìn (nằm giữa khoảng
            //     500-1000m theo spec) — đủ xa để coi như "vô cực" nhưng vẫn là số hữu hạn, tránh NaN/
            //     Infinity lan sang các phép tính hướng bay phía sau.
            //   - hitEnemy: tham chiếu Enemy nếu mesh trúng gần nhất thuộc về đúng 1 enemy còn sống (dò
            //     ngược từ mesh bị trúng lên tới enemy.mesh gần nhất trong chuỗi cha — enemy.mesh là 1
            //     THREE.Group nên tia có thể trúng bất kỳ mesh con nào bên trong nó, không chỉ chính nó).
            const CROSSHAIR_RAYCAST_MAX_DISTANCE = 700;
            const crosshairRaycaster = new THREE.Raycaster();
            crosshairRaycaster.far = CROSSHAIR_RAYCAST_MAX_DISTANCE;
            // BUGFIX: scene chứa THREE.Sprite (hpBarBg/hpBarFill, con của enemy.mesh — xem enemies.js)
            // — Three.js BẮT BUỘC raycaster.camera phải được set trước khi raycast trúng bất kỳ Sprite
            // nào (sprite luôn xoay mặt về camera nên cần biết camera để tính đúng mặt phẳng của nó),
            // nếu không sẽ throw "Raycaster.camera needs to be set" thay vì bỏ qua êm.
            //
            // BUGFIX #2 (lỗi tái diễn lúc bấm Elemental Skill lần đầu): KHÔNG được gán
            // crosshairRaycaster.camera = camera Ở ĐÂY (top-level, chạy ngay lúc combat.js được load).
            // Biến `camera` chỉ THỰC SỰ được gán new THREE.PerspectiveCamera(...) bên trong initThree()
            // (04-scene-init.js) — hàm này chỉ chạy SAU KHI người chơi bấm Start ở Opening/Title Screen
            // (window.startGameplay()), KHÔNG chạy ngay lúc script load. Tại thời điểm dòng top-level
            // này từng chạy trước đây, `camera` vẫn còn undefined (đã khai báo nhưng chưa gán) —
            // crosshairRaycaster.camera bị gán undefined vĩnh viễn (KHÔNG BAO GIỜ được gán lại sau đó),
            // nên raycast trúng Sprite vẫn throw lỗi y hệt dù `camera` thật đã tồn tại từ lâu vào lúc đó.
            // Sửa: gán lại crosshairRaycaster.camera = camera MỖI LẦN raycastFromCrosshair() chạy (xem
            // bên trong hàm) — cùng cách camOrigin/camDir cũng đọc `camera` bên trong hàm, không phải
            // top-level.

            // Dò object bị trúng có thuộc về 1 Enemy còn sống hay không — leo ngược lên cây cha (mesh
            // trúng có thể là 1 sub-mesh nằm sâu bên trong enemy.mesh, VD phần thân/mắt riêng biệt).
            function findOwningEnemy(hitObject) {
                for (let i = 0; i < enemies.length; i++) {
                    const enemy = enemies[i];
                    if (!enemy.alive || !enemy.mesh) continue;
                    let node = hitObject;
                    while (node) {
                        if (node === enemy.mesh) return enemy;
                        node = node.parent;
                    }
                }
                return null;
            }

            function raycastFromCrosshair() {
                const camOrigin = new THREE.Vector3();
                camera.getWorldPosition(camOrigin);
                const camDir = new THREE.Vector3();
                camera.getWorldDirection(camDir);
                if (camDir.lengthSq() < 0.0001) camDir.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
                camDir.normalize();

                // Gán LẠI mỗi lần gọi (xem BUGFIX #2 ở khai báo crosshairRaycaster phía trên) — đảm bảo
                // luôn dùng đúng camera THẬT đã được initThree() khởi tạo, không phải giá trị undefined
                // còn sót lại từ lúc combat.js mới load script (trước khi initThree() từng chạy).
                crosshairRaycaster.camera = camera;
                crosshairRaycaster.set(camOrigin, camDir);
                // Lọc BỎ InstancedMesh (cỏ) TRƯỚC KHI gọi intersectObjects() — không phải sau khi có kết
                // quả. Three.js raycast lên InstancedMesh phải tự kiểm tra TỪNG instance riêng lẻ (cỏ có
                // thể lên tới hàng nghìn instance, xem createGrassBlades()), nên nếu lọc SAU (như bản
                // đầu tiên) vẫn tốn chi phí tính toán ray-instance cho toàn bộ cỏ mỗi frame trong lúc
                // Aim dù kết quả bị vứt bỏ ngay sau đó. Lọc TRƯỚC giúp Three.js không bao giờ phải chạm
                // tới InstancedMesh này trong quá trình raycast.
                const raycastTargets = scene.children.filter(obj => !obj.isInstancedMesh);
                const hits = crosshairRaycaster.intersectObjects(raycastTargets, true);

                let closestDist = CROSSHAIR_RAYCAST_MAX_DISTANCE;
                let hitEnemy = null;

                for (let i = 0; i < hits.length; i++) {
                    const hit = hits[i];
                    if (hit.distance >= closestDist) break; // hits[] đã sắp xếp tăng dần theo distance

                    // Loại trừ player.mesh (và mesh con của nó) — không thể tự chặn tia ngắm của mình.
                    let isPlayerMesh = false;
                    let node = hit.object;
                    while (node) {
                        if (node === player.mesh) { isPlayerMesh = true; break; }
                        node = node.parent;
                    }
                    if (isPlayerMesh) continue;

                    // Loại trừ TOÀN BỘ THREE.Sprite (VD hpBarBg/hpBarFill của enemy, xem enemies.js) —
                    // sprite trong game này luôn là lớp UI overlay (thanh máu luôn xoay mặt về camera),
                    // không phải hình khối THẬT của thế giới, nên không có ý nghĩa chặn đường ngắm.
                    // Không liệt kê tên cụ thể từng sprite để không bị lệch nếu sau này thêm loại sprite
                    // khác (VD damage number) — mọi Sprite đều bị loại như nhau.
                    if (hit.object.isSprite) continue;

                    // Loại trừ hiệu ứng tạm thời của chính Elemental Skill (đạn/tia nước đang bay/fade).
                    // Alpha v1.0 — Character System: activeProjectiles (đã xóa) -> player.activeEffects.
                    // skill. activeHydroBeamVisuals GIỮ NGUYÊN (không migrate — quyết định đã chốt).
                    // Cả projMesh (activeEffects.skill) và beamMesh (activeHydroBeamVisuals) đều là
                    // THREE.Mesh đơn giản không có mesh con, nên so khớp trực tiếp là đủ.
                    const isOwnSkillEffect =
                        player.activeEffects.skill.some(p => p.mesh === hit.object) ||
                        activeHydroBeamVisuals.some(b => b.mesh === hit.object);
                    if (isOwnSkillEffect) continue;

                    closestDist = hit.distance;
                    hitEnemy = findOwningEnemy(hit.object);
                }

                const point = camOrigin.clone().addScaledVector(camDir, closestDist);
                return { point, distance: closestDist, hitEnemy };
            }

            // Alpha v1.0 — Character System: spawnHydroBeamVisual() đã bị XÓA (dead code, chỉ
            // fireHydroBeam() đã xóa gọi tới) — thay bằng spawnBeamVisual() trong 09-character-
            // system.js (đọc skillData thay vì ELEMENTAL_SKILL_CONFIG.pressureShot toàn cục).




            function updateSkillCooldown(dt) {
                const mOverlay = document.getElementById('mobile-cooldown-overlay'), mText = document.getElementById('mobile-cooldown-text');
                const dOverlay = document.getElementById('desktop-cooldown-overlay'), dText = document.getElementById('desktop-cooldown-text'), dRadial = document.getElementById('desktop-cooldown-radial');

                const activeMember = partyState[activeCharacterIndex];

                if (activeMember.skillCooldownTimer > 0) {
                    activeMember.skillCooldownTimer -= dt;
                    if (activeMember.skillCooldownTimer < 0) activeMember.skillCooldownTimer = 0;
                    const displaySec = Math.ceil(activeMember.skillCooldownTimer);
                    // Alpha v1.0 — Character System: progress (thanh UI) chia cho cooldown CỦA SKILL
                    // NHÂN VẬT ĐANG ACTIVE (đọc từ SKILL_LIBRARY qua getActiveCharacterData()), không
                    // còn hard-code SKILL_COOLDOWN_DURATION=7.0 — để nhân vật khác có cooldown khác vẫn
                    // hiển thị đúng tỉ lệ. Fallback về 1 nếu vì lý do nào đó không đọc được skillData
                    // (an toàn tránh chia cho 0/NaN, không nên xảy ra trong thực tế).
                    //
                    // BUGFIX (mục 1): dùng getActiveSkillCooldownDuration() thay vì đọc thẳng
                    // skillData.cooldown — TRƯỚC ĐÂY skillData.cooldown = null với Decoy khiến
                    // cooldownDuration luôn fallback về 1, làm progress bar quét gần hết vòng ngay lập
                    // tức rồi đứng im (sai tỉ lệ so với 12s cooldown thật), dù displaySec đếm ngược
                    // đúng số giây. Cùng nguồn dispatch với startSkillCooldown() — sửa 1 chỗ, cả 2 nơi
                    // luôn nhất quán.
                    const character = getActiveCharacterData();
                    const cooldownDuration = getActiveSkillCooldownDuration(character) || 1;
                    const progress = activeMember.skillCooldownTimer / cooldownDuration;

                    if (mOverlay && mText) { mOverlay.classList.remove('hidden'); mText.textContent = displaySec; }
                    if (dOverlay && dText) {
                        dOverlay.classList.remove('hidden'); dText.textContent = displaySec;
                        if (dRadial) {
                            const sweepDeg = (progress * 360).toFixed(1);
                            dRadial.style.opacity = '1'; dRadial.style.background = `conic-gradient(transparent ${(360 - sweepDeg)}deg, rgba(34,211,238,0.45) ${(360 - sweepDeg)}deg)`;
                            dRadial.style.border = 'none'; dRadial.style.borderRadius = '12px';
                        }
                    }
                } else {
                    if (mOverlay) mOverlay.classList.add('hidden');
                    if (dOverlay) dOverlay.classList.add('hidden');
                    if (dRadial) { dRadial.style.opacity = '0'; dRadial.style.background = ''; }
                }
            }
            window.updateSkillCooldown = updateSkillCooldown;

            // --- TƯƠNG TÁC VỚI VẬT THỂ GẦN NHẤT (phím F / click / tap) ---
            // interactWithNearbyObject() và onEnemyKilled() đã chuyển lên gần khu vực khai báo
            // activeQuests/interactables (đầu file) để combat.js có thể tách thành 1 khối liền mạch.

            function pulseBurstButton() {
                const btn = document.getElementById(isMobile ? 'mobile-burst-btn' : 'desktop-burst-btn');
                if (btn) { btn.style.transform = 'scale(0.85)'; setTimeout(() => { btn.style.transform = ''; }, 120); }
            }

            // Điều kiện tiên quyết chung để dùng Burst (năng lượng đầy, không đang trong trạng thái
            // khóa hành động khác, chưa có bubble nào đang hoạt động, chưa đang trong Aim State khác).
            function canUseBurst() {
                if (!player.isGrounded || player.isClimbing || player.isSwimming || player.isDrowning) return false;
                if (player.energy < player.maxEnergy) return false;
                // Alpha v1.0 — Character System: player.isBursting (đã xóa khỏi player, xem file 02)
                // thay bằng kiểm tra player.activeEffects.burst.length > 0 — tương đương "đang có ít
                // nhất 1 Burst effect (Water Bubble) còn sống". HÀNH VI GIỮ NGUYÊN: chỉ cho phép 1
                // Water Bubble tồn tại cùng lúc, y hệt cờ isBursting cũ.
                if (player.activeEffects.burst.length > 0) return false;
                if (burstAimState.phase !== 'idle') return false;
                if (skillAimState.phase !== 'idle') return false;
                // Character #2 Validation — BUG FIX: cùng loại bug với canUseElementalSkill() — thiếu
                // check character.burstId tồn tại, khiến handleBurstKeyDown() vẫn chạy tới
                // executeCharacterBurst() (tự no-op) SAU KHI đã tính soft-targeting/xoay nhân vật —
                // không gây lỗi rõ ràng nhưng lãng phí tính toán và về nguyên tắc nên chặn sớm, nhất
                // quán với cách skill được chặn.
                const character = getActiveCharacterData();
                if (!character || !character.burstId) return false;
                return true;
            }

            // --- Burst: thi triển NGAY khi nhấn (không còn Hold/Aim Mode, không crosshair) ---
            // Chỉ cần nhấn là tìm mục tiêu gần nhất trong phạm vi hỗ trợ (Soft Targeting), xoay nhân
            // vật về phía đó, phóng ngay. Nếu không có mục tiêu hợp lệ, phóng theo hướng hiện tại của
            // nhân vật — KHÔNG Hard Lock-On, giống hệt hành vi Tap cũ.
            function handleBurstKeyDown() {
                if (!canUseBurst()) return;

                // BUGFIX (Pre-Alpha Stabilization — Soft Target khi đang di chuyển): cùng lý do và cách
                // sửa như handleSkillKeyUp() — xem comment đầy đủ ở đó. Tóm tắt: dùng hướng CAMERA làm
                // tâm "hình nón phía trước" của Soft Targeting thay vì player.mesh.rotation.y (bị trễ do
                // đang lerp theo hướng di chuyển), để không loại nhầm địch ở tier 2/3 khi đang di chuyển.
                const camForwardForSoftTarget = new THREE.Vector3();
                camera.getWorldDirection(camForwardForSoftTarget);
                const softTargetFacingAngle = (camForwardForSoftTarget.x === 0 && camForwardForSoftTarget.z === 0)
                    ? player.mesh.rotation.y
                    : Math.atan2(camForwardForSoftTarget.x, camForwardForSoftTarget.z);

                const softTarget = findSoftTargetingRotation(player.position, softTargetFacingAngle);
                let dir;
                if (softTarget) {
                    player.softTargetLockY = softTarget.targetY;
                    player.softTargetLerpSpeed = softTarget.lerpSpeed;
                    dir = new THREE.Vector3(Math.sin(softTarget.targetY), 0, Math.cos(softTarget.targetY));
                } else {
                    dir = new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
                }
                // Alpha v1.0 — Character System: gọi executeCharacterBurst() (09-character-system.js)
                // thay vì launchBurstBubble() trực tiếp — Engine tự đọc burstId/effectType/behavior
                // của nhân vật đang active từ CHARACTER_ROSTER/SKILL_LIBRARY và điều phối đúng
                // executor (runWaterBubbleEffect cho hydro_water_bubble). HÀNH VI GIỮ NGUYÊN 100% —
                // đã đối chiếu từng dòng runWaterBubbleEffect với launchBurstBubble() gốc.
                executeCharacterBurst(getActiveCharacterData(), dir);
            }
            window.handleBurstKeyDown = handleBurstKeyDown;

            // Giữ hàm này (được gọi từ input handler khi nhả phím) làm no-op có chủ đích: Burst giờ
            // thi triển hoàn toàn ở keydown, không còn phase 'holding'/'aiming' nào cần xử lý ở đây.
            function handleBurstKeyUp() {}
            window.handleBurstKeyUp = handleBurstKeyUp;

            // startBurstAim / updateBurstAim / endBurstAim đã được loại bỏ — Burst không còn Aim Mode,
            // thi triển ngay khi nhấn (xem handleBurstKeyDown ở trên).

            // Alpha v1.0 — Character System: launchBurstBubble()/endBurstBubble()/updateBurst() đã bị
            // XÓA (dead code) — thay bằng runWaterBubbleEffect()/endWaterBubbleEffect()/
            // updateWaterBubbleEffect() trong 09-character-system.js, gọi qua
            // executeCharacterBurst()/updateActiveEffects(). Đã đối chiếu từng dòng với bản gốc trước
            // khi xóa (xem lịch sử: "đối chiếu đầy đủ launchBurstBubble()/updateBurst()").

            // updateBurstUI() đã chuyển sang ui.js
