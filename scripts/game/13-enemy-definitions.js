// ============================================================
// Alpha M2/M3 — DỮ LIỆU QUÁI KHUNG M2 + ENCOUNTER (chỉ data, không có logic)
// ============================================================
// Mọi con số cân bằng của 3 archetype quái mới và của encounter Alpha nằm ở file này — chỉnh balance chỉ
// cần sửa ở đây. Field thiếu / sai kiểu / ngoài khoảng hợp lệ KHÔNG làm crash game:
//   - quái:      normalizeEnemyDefinition()     (game/14-enemy-framework.js) điền mặc định an toàn + console.warn
//   - encounter: normalizeEncounterDefinition() (game/15-encounter-system.js) bỏ spawn/thưởng hỏng + console.warn;
//                encounter không còn spawn hợp lệ nào thì KHÔNG khởi động được (trả lý do, không ném lỗi).
// Slime cũ (enemies.js) KHÔNG đọc file này — giữ nguyên số liệu/hành vi của nó.
//
// ENEMY_DEFINITIONS[id]:
//   name / role        tên + vai trò hiển thị (HUD encounter)
//   archetype          'melee' | 'ranged' | 'heavy' — chọn behaviour trong ENEMY_ARCHETYPES (14-enemy-framework.js)
//   level              dùng cho DEF mitigation chiều Player -> Enemy (calculatePlayerToEnemyDamage, combat.js)
//   stats              { maxHp, atk, def } — atk đi qua calculateFinalDamage(atk, DEF người chơi) như Slime
//   poise              { weightClass, resistance } — đọc bởi resolveHitReaction() chung (knockback/stagger/launch)
//   size               { width, height } — AABB va chạm/trúng đòn (depth = width)
//   isLarge            true -> tầm đánh cận chiến/AoE của người chơi rộng hơn, khối lượng va chạm lớn (như Large Slime)
//   hoverHeight        m — lơ lửng cách mặt đất (0 = đứng trên đất)
//   moveSpeed/turnRate m/s, tốc độ xoay (1/s)
//   detectRange        m — tự phát hiện người chơi (quái trong encounter được "báo động" sẵn, bỏ qua ngưỡng này)
//   leashRange         m — không đuổi xa hơn ngần này tính từ điểm neo (home); encounter đặt home = tâm đấu trường
//   attack             nhịp tấn công: range (bắt đầu báo trước), telegraph (s), active (s), recovery (s), cooldown (s)
//                      + tham số riêng từng archetype (xem chú thích tại từng con)
//   rewards            { exp } — cấp ĐÚNG 1 lần/con qua REWARD_HANDLERS.exp (cùng đường EXP với Slime)
//   questType          chuỗi truyền cho onEnemyKilled() (tiến độ quest 'kill' — hiện không quest nào nhắm loại này)
//   visual             { body, accent, glow } — màu khối hình học đơn giản (không dùng asset ngoài)
window.ENEMY_DEFINITIONS = {
    // A — CẬN CHIẾN CƠ BẢN: tiến lại gần, giơ tay báo trước (vùng quạt đỏ lớn dần, hướng KHOÁ), đấm 1 phát, thở.
    alpha_brawler: {
        name: 'Đấu Sĩ Gỉ Sét',
        role: 'Cận chiến',
        archetype: 'melee',
        level: 1,
        stats: { maxHp: 90, atk: 50, def: 10 },
        poise: { weightClass: 'medium', resistance: 1.0 },   // đòn nặng (heavy/launch) mới ngắt được
        size: { width: 1.0, height: 1.7 },
        moveSpeed: 3.6,
        turnRate: 9,
        detectRange: 14,
        leashRange: 22,
        attack: {
            range: 2.0,       // m — mục tiêu trong tầm này (và đã quay mặt tới) thì bắt đầu báo trước
            telegraph: 0.6,   // s — vùng quạt báo trước; hướng khoá ngay lúc bắt đầu (không bám theo)
            active: 0.2,      // s — cú đấm; damage kiểm tra ĐÚNG 1 lần ở khung đầu
            recovery: 0.9,    // s — đứng thở, không tấn công
            cooldown: 0.6,    // s — sau recovery mới được báo trước đòn kế
            hitRange: 2.4,    // m — bán kính vùng quạt (= vùng vẽ trên đất)
            hitArc: 100,      // độ — góc vùng quạt
            lunge: 0.4,       // m — nhích tới khi đấm (chỉ hình ảnh/di chuyển, vùng trúng đã khoá)
            push: 4.5,
            stagger: 0.15
        },
        rewards: { exp: 15 },
        questType: 'alpha_brawler',
        visual: { body: 0xc2410c, accent: 0xfdba74, glow: 0xfacc15 }
    },

    // B — TẦM XA: giữ khoảng cách 7–11 m, lùi khi bị áp sát, báo trước bằng tia ngắm trên đất (bám theo rồi KHOÁ
    // trong aimLock giây cuối), bắn 1 quả cầu bay thẳng (không đuổi theo) — né bằng cách bước ngang.
    alpha_caster: {
        name: 'Pháp Cầu Lam',
        role: 'Tầm xa',
        archetype: 'ranged',
        level: 1,
        stats: { maxHp: 55, atk: 38, def: 8 },
        poise: { weightClass: 'light', resistance: 1.0 },    // hầu như đòn nào cũng ngắt được -> áp sát là khắc chế
        size: { width: 0.9, height: 1.2 },
        hoverHeight: 0.9,
        moveSpeed: 3.0,
        turnRate: 7,
        detectRange: 18,
        leashRange: 22,
        attack: {
            range: 13,             // m — chỉ bắn khi mục tiêu trong tầm này
            preferredMin: 7,       // m — khoảng cách ưa thích (không tiến lại gần hơn)
            preferredMax: 11,      // m — xa hơn thì tiến lại
            retreatRange: 5,       // m — mục tiêu gần hơn -> lùi lại
            retreatSpeed: 2.6,
            telegraph: 0.85,       // s — tia ngắm + quả cầu nạp
            aimLock: 0.35,         // s cuối của telegraph: tia ngắm khoá (sáng lên), không bám theo nữa
            active: 0.15,
            recovery: 0.9,
            cooldown: 1.8,
            projectileSpeed: 12,   // m/s — bay thẳng, không homing
            projectileRadius: 0.3,
            projectileRange: 18,   // m — tự huỷ sau quãng đường này
            push: 3.0,
            stagger: 0.1
        },
        rewards: { exp: 15 },
        questType: 'alpha_caster',
        visual: { body: 0x0f766e, accent: 0x5eead4, glow: 0x22d3ee }
    },

    // C — HẠNG NẶNG: đi chậm, giơ búa báo trước lâu (vòng tròn đỏ đầy dần tại điểm nện KHOÁ từ đầu, không xoay theo),
    // nện diện rộng, rồi hồi phục rất lâu (cửa sổ phản công). Khó ngắt (poise heavy — chỉ đòn launch mới ngắt).
    alpha_crusher: {
        name: 'Cự Thạch Búa',
        role: 'Hạng nặng',
        archetype: 'heavy',
        level: 1,
        stats: { maxHp: 180, atk: 120, def: 20 },
        poise: { weightClass: 'heavy', resistance: 1.0 },
        size: { width: 1.9, height: 2.6 },
        isLarge: true,
        moveSpeed: 2.0,
        turnRate: 3.5,
        detectRange: 14,
        leashRange: 22,
        attack: {
            range: 3.0,
            telegraph: 1.3,       // s — dài: đủ thời gian chạy khỏi vòng tròn
            active: 0.25,
            recovery: 1.8,        // s — búa cắm đất, đứng im: cửa sổ phản công chính
            cooldown: 1.2,
            impactOffset: 1.8,    // m — tâm vùng nện nằm trước mặt, KHOÁ lúc bắt đầu báo trước
            impactRadius: 2.6,    // m — bán kính vùng nện (vòng đỏ vẽ đúng bằng vùng này)
            push: 8.0,
            stagger: 0.35
        },
        rewards: { exp: 30 },
        questType: 'alpha_crusher',
        visual: { body: 0x475569, accent: 0x94a3b8, glow: 0xf97316 }
    }
};

// ENCOUNTER_DEFINITIONS[id]:
//   name        tên hiển thị (HUD, lời nhắc tương tác)
//   beacon      { x, z } — cột sáng bắt đầu thử thách (Interactable: phím F / nút chạm tương tác)
//   arena       { x, z, leaveRadius, leaveGrace, fightRadius } — tâm đấu trường; người chơi ở ngoài leaveRadius quá
//               leaveGrace giây khi đang giao chiến -> thử thách thất bại (dọn quái, không phạt gì thêm). Quái trong
//               encounter lấy tâm này làm điểm neo: vẫn nhắm người chơi trong leaveRadius + 2 nhưng BẢN THÂN chỉ di
//               chuyển trong fightRadius (mặc định = leaveRadius) -> trận đấu gọn, không kéo sang vùng camp Slime.
//   spawnInterval  s giữa 2 lần quái xuất hiện (xuất hiện lần lượt, dễ đọc)
//   spawns      [{ enemyId, x, z }] — enemyId phải có trong ENEMY_DEFINITIONS
//   completion  'defeat_all' (điều kiện duy nhất ở Alpha)
//   rewards     firstClear: thưởng lần thắng ĐẦU TIÊN (cờ lưu trong save, không nhận lại sau reload/thử lại);
//               repeat: thưởng mỗi lần thắng lại (rỗng = không có — quái vẫn cho EXP riêng như Slime).
//               Mỗi mục { type, amount, itemId? } đi qua REWARD_HANDLERS[type] có sẵn.
// Waves: chưa hỗ trợ ở Alpha (1 đợt duy nhất).
window.ENCOUNTER_DEFINITIONS = {
    alpha_trial: {
        name: 'Thử Thách Alpha',
        // Cột sáng ngay mép khu spawn (~6 m về phía Tây Nam, dễ thấy khi vừa vào game); đấu trường là đồng cỏ phẳng
        // ngoài hàng rào spawn, cách 3 camp Slime > 22 m. (Lúc chọn, mesh mặt đất còn bị lật trục Z — KI-122 — nên vùng
        // này được chọn vì 2 mặt khớp nhau; M4 đã sửa KI-122, mặt đất hiển thị giờ khớp va chạm ở mọi nơi.)
        beacon: { x: -4, z: -4 },
        // fightRadius 12: quái (kể cả quái tầm xa đang lùi) không rời quá 12 m khỏi tâm -> người chơi đuổi theo cũng
        // không trôi tới vùng Slime của camp A/B/C (playthrough trước đó: 1/3 số đòn trúng là của Slime lang thang).
        arena: { x: -11, z: -10, leaveRadius: 20, leaveGrace: 6, fightRadius: 12 },
        spawnInterval: 0.35,
        spawns: [
            { enemyId: 'alpha_brawler', x: -9, z: -8 },
            { enemyId: 'alpha_caster', x: -16, z: -11 },
            { enemyId: 'alpha_crusher', x: -13, z: -14 }
        ],
        completion: 'defeat_all',
        rewards: {
            firstClear: [{ type: 'primogem', amount: 40 }, { type: 'exp', amount: 60 }],
            repeat: []
        }
    }
};
