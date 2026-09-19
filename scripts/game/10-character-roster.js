// ============================================================
// 10-character-roster.js — CHARACTER DATABASE (Alpha v1.0 — Character System Foundation)
// ============================================================
// MỤC ĐÍCH: nguồn dữ liệu TĨNH duy nhất mô tả từng nhân vật có thể tồn tại trong game.
// File này CHỈ CHỨA DỮ LIỆU — không có hàm xử lý logic, không có state runtime (hp hiện
// tại, cooldown hiện tại, energy hiện tại... nằm ở partyState[i], xem file 02).
//
// TRIẾT LÝ DATA-DRIVEN (khóa cứng từ Alpha v1.0 trở đi):
//   - Character KHÔNG tự chứa logic thi triển skill — chỉ tham chiếu skillId/burstId trỏ
//     sang SKILL_LIBRARY (file 11-character-skills.js).
//   - Combat Engine (file 09-character-system.js, sẽ xây ở bước sau) đọc CHARACTER_ROSTER +
//     SKILL_LIBRARY rồi THỰC THI — không có dòng code nào trong Engine được phép hard-code
//     theo id/element/tên của 1 nhân vật cụ thể.
//   - Thêm 1 nhân vật mới = thêm 1 entry ở đây (+ skill/burst tương ứng trong file 11 nếu là
//     kỹ năng chưa từng có) — KHÔNG sửa Combat Engine.
//
// QUAN TRỌNG VỀ THỨ TỰ LOAD: file này chỉ định nghĩa dữ liệu thuần túy (object literal),
// không đọc bất kỳ biến global nào của game.js/combat.js lúc parse — do đó AN TOÀN khi đặt
// ở bất kỳ đâu trong thứ tự load, miễn là TRƯỚC file 09 (Character Engine, sẽ đọc
// CHARACTER_ROSTER) và TRƯỚC nơi PARTY_CONFIG/initParty() cần tra cứu characterId (file 02).
// Ở giai đoạn hiện tại (chưa refactor combat.js), file này CHƯA được bất kỳ nơi nào require —
// tồn tại song song, không ảnh hưởng gameplay hiện có.
//
// window export: CHARACTER_ROSTER
// ============================================================

const CHARACTER_ROSTER = {

    // --- TRAVELER (HYDRO) — nhân vật chính hiện có, giữ đúng số liệu từ PARTY_CONFIG cũ
    // (02-collision-and-stats-core.js) để không lệch cân bằng khi migrate sang schema mới. ---
    traveler_hydro: {
        id: 'traveler_hydro',
        name: 'Traveler',
        element: 'Hydro',
        region: 'Mondstadt',

        // rarity / weaponType / gameplayType: có trong đề xuất cấu trúc ban đầu, giữ chỗ sẵn
        // cho Alpha nhưng chưa có ý nghĩa gameplay nào đọc tới — placeholder trung lập, không
        // ảnh hưởng gì tới hệ thống hiện tại cho tới khi có tính năng thực sự dùng chúng.
        rarity: null,
        weaponType: null,
        gameplayType: null,

        // baseStats: giá trị KHỞI ĐIỂM (level 1) — partyState[i].stats TÍNH qua
        // getScaledStats(baseStats, level) lúc initParty() (file 02), KHÔNG còn clone tay + cộng
        // dồn statGrowth tuyến tính như trước — mỗi lần lên cấp TÍNH LẠI TỪ ĐÂY theo công thức
        // Level Scaling kiểu Genshin (xem getLevelMultiplier(), file 02). Sửa baseStats ở đây
        // KHÔNG ảnh hưởng nhân vật đã lên cấp trong save cũ (save lưu stats đã tính, không lưu lại
        // baseStats).
        //
        // Stat Baseline Update v1 — 912/18/57: CHỐT theo Genshin Traveler Lv.1 Ascension 0, xác
        // nhận qua 2 nguồn độc lập khớp nhau (Sportskeeda bảng ascension, Pocket Gamer) VÀ nguồn
        // gốc KQM TCL (Base Stats table, Traveler Hydro) — đây là BASELINE để xây hệ thống, CHƯA
        // phải balance cuối cùng (sẽ điều chỉnh sau khi gameplay chạy ổn, theo đúng yêu cầu đã
        // xác nhận).
        //
        // Energy System Fix v1 — maxEnergy: field RIÊNG từng nhân vật (xem giải thích ở Energy
        // System Fix v1, không lặp lại ở đây) — GIỮ NGUYÊN, không thuộc phạm vi Stat Baseline
        // Update.
        baseStats: { maxHp: 912, atk: 18, def: 57, maxEnergy: 50 },

        // skillId / burstId: tham chiếu sang SKILL_LIBRARY (file 11). null hợp lệ — nghĩa là
        // nhân vật chưa có kỹ năng thật (Engine phải luôn kiểm tra null trước khi thực thi).
        skillId: 'hydro_pressure_shot',
        burstId: 'hydro_water_bubble',

        // Stat Baseline Update v1 — Talent Scaling: số liệu Lv.1 CHỐT theo Genshin Traveler
        // (Hydro), nguồn KQM TCL "Full Talent Values" (Base Stats + Attacks tables, Traveler
        // Hydro) — ĐÂY LÀ BASELINE, chưa phải balance cuối cùng.
        //
        // stat: "ATK" | "HP" | "DEF" — Engine (getTalentScaling()/calculatePlayerToEnemyDamage(),
        // combat.js) đọc partyState[i].stats[stat] tương ứng, KHÔNG hard-code luôn là atk — cho
        // phép skill scale theo HP/DEF mà không cần sửa Engine (VD Suffusion bonus bên dưới).
        //
        // normalAttack.combo: mảng ĐỦ 5 HIT theo đúng Talent thật của Traveler (44.5/43.4/53.0/
        // 58.3/70.8% ATK) dù Combo System hiện tại CHỈ chạy Attack #1-#4 (animation.attack[] chỉ
        // có 4 phần tử) — hit #5 nằm sẵn trong schema, CHƯA được Engine đọc tới cho tới khi combo
        // được mở rộng đủ 5 đòn (không thuộc phạm vi thay đổi lần này, chỉ chuẩn bị data).
        //
        // normalAttack.plunge/lowPlunge/highPlunge: 3 loại Plunge riêng biệt theo đúng Genshin
        // (Plunge DMG thường 63.9%, Low Plunge 128%, High Plunge 160%) — game hiện tại CHỈ có 1
        // loại Plunge (dùng field 'plunge'), lowPlunge/highPlunge có sẵn trong schema cho tương
        // lai nếu phân biệt Low/High Plunge (theo độ cao rơi) được triển khai.
        //
        // skill.beam/tick/suffusionBonus: Skill Hydro Traveler THẬT SỰ có 3 thành phần khác nhau
        // (không đơn giản 1 multiplier×ATK như thiết kế v1 cũ) — đây CHÍNH LÀ ví dụ khẳng định
        // schema { stat, multiplier } đúng hướng, vì Suffusion scale theo HP chứ không phải ATK:
        //   beam: Torrent Surge (đòn Press/Tap, ứng với runBeamEffect() trong game) — 189.3% ATK.
        //   tick: Dewdrop (mỗi tick lúc Hold/Aim, ứng với runSmallShotEffect()) — 32.8% ATK.
        //   suffusionBonus: DMG Bonus cộng thêm theo Max HP khi giữ Hold quá 50% HP — 0.64% Max HP
        //   — CHỈ có trong schema, CHƯA kích hoạt trong gameplay (game chưa có cơ chế Suffusion).
        //
        // skill/burst.level: placeholder cho Talent Level tương lai (schema sẵn sàng, CHƯA có
        // logic progression).
        talents: {
            normalAttack: {
                // Hit Reaction / Poise System v1 — impact.type MỚI cho mỗi đòn (yêu cầu đã xác nhận:
                // "impact thuộc combat/talent data, KHÔNG thuộc animation data" — đặt CÙNG chỗ với
                // Talent Scaling ở đây, không đặt trong visualConfig.animation). Đọc qua
                // resolveHitReaction() (combat.js) tại điểm hit detection (file 08) — KHÔNG ảnh hưởng
                // gì đến scaling/multiplier/damage hiện có (2 field độc lập trong cùng object).
                combo: [
                    { scaling: { stat: 'ATK', multiplier: 0.445 }, impact: { type: 'light' } }, // Attack #1
                    { scaling: { stat: 'ATK', multiplier: 0.434 }, impact: { type: 'light' } }, // Attack #2
                    { scaling: { stat: 'ATK', multiplier: 0.530 }, impact: { type: 'light' } }, // Attack #3
                    { scaling: { stat: 'ATK', multiplier: 0.583 }, impact: { type: 'heavy' } }, // Attack #4
                    { scaling: { stat: 'ATK', multiplier: 0.708 }, impact: { type: 'heavy' } }  // Attack #5 (chưa dùng, combo hiện chỉ 4 đòn — impact tạm giống #4 để tránh thiếu data nếu combo mở rộng sau)
                ],
                // Plunge Attack: yêu cầu đã xác nhận — dùng CHUNG 1 impact.type ("heavy") cho cả
                // lowPlunge/highPlunge, chưa cần phân biệt phức tạp hơn ở Alpha v1.0.
                plunge: { scaling: { stat: 'ATK', multiplier: 0.639 }, impact: { type: 'heavy' } },
                lowPlunge: { scaling: { stat: 'ATK', multiplier: 1.28 }, impact: { type: 'heavy' } },
                highPlunge: { scaling: { stat: 'ATK', multiplier: 1.60 }, impact: { type: 'heavy' } },
                // Charged Attack v1 -> v2 (Multi-Animation + Multi-Hit) — PLACEHOLDER, chưa balance
                // (giá trị tạm để test gameplay, KHÔNG phải số liệu cuối cùng — cần xác nhận riêng
                // trước khi dùng cho bản chính thức). Tách biệt hoàn toàn khỏi combo[]/plunge — đọc
                // qua getTalentScaling(character, 'chargedAttack', hitIndex) trong combat.js, KHÔNG
                // dùng comboIndex.
                //
                // animations[]: N animation segment tùy ý (KHÔNG giới hạn số lượng — yêu cầu đã xác
                // nhận), mỗi phần tử có `phase` ('windup'|'active'|'recovery' — nhóm segment vào
                // đúng player.attackState) + `duration` (giây) + ĐỦ 4 cặp Start/End
                // (rightHandOffset/rightHandRotOffset/coreOffset) — thống nhất 1 shape cho MỌI vị trí
                // trong chuỗi. Engine tự nối Start của segment sau = End của segment trước (đảm bảo
                // liền mạch, không "giật") — xem getChargedAttackAnimSegment() trong combat.js.
                // Segment ĐẦU TIÊN của TOÀN CHUỖI có Start ngầm định = base pose (offset 0).
                //
                // BACKWARD COMPATIBILITY: dữ liệu bên dưới là NGUYÊN VẸN 3 phase cũ (charge/release/
                // recovery, TỪNG NẰM Ở visualConfig.animation.chargedAttack) chuyển 1:1 sang
                // animations[0]/animations[1]/animations[2] TẠI ĐÚNG VỊ TRÍ talents.normalAttack.
                // chargedAttack.animations — KHÔNG đổi bất kỳ con số nào, chỉ đổi hình dạng + vị trí
                // (yêu cầu đã xác nhận mục 8 — "giá trị gameplay cũ phải được bảo toàn"). charge cũ
                // (chỉ có 1 offset đích, ngầm định Start=0) -> animations[0].rightHandOffsetStart =
                // {0,0,0} (base), .End = offset cũ.
                //
                // hits[]: M hit tùy ý (KHÔNG giới hạn số lượng — yêu cầu đã xác nhận). Mỗi hit có
                // `time` (giây, TÍNH TỪ LÚC chargedActive BẮT ĐẦU — KHÔNG liên quan/ràng buộc gì tới
                // animations[] ở trên, yêu cầu đã xác nhận "2 mảng độc lập hoàn toàn"), `scaling`,
                // `impact` — mỗi hit là 1 damage event ĐỘC LẬP, đi qua ĐÚNG Talent Scaling ->
                // calculatePlayerToEnemyDamage() -> enemy.takeDamage() pipeline hiện có (KHÔNG tạo
                // công thức damage riêng). Hit DUY NHẤT bên dưới = NGUYÊN VẸN scaling/impact cũ.
                // time: 0 = TRÚNG NGAY khi chargedActive bắt đầu (khớp hành vi v1 cũ).
                chargedAttack: {
                    // animations[]: SỐ LƯỢNG SEGMENT TÙY Ý theo từng nhân vật (yêu cầu đã xác nhận —
                    // KHÔNG hard-code chỉ 2/3 segment ở tầng combat core, xem
                    // applyChargedAttackAnimTick()/getChargedAttackAnimsForPhase() trong combat.js —
                    // cả 2 hàm đều lặp qua .length thực tế của mảng, không giả định số lượng cố
                    // định). Traveler CHỌN dùng 3 segment cho phase 'active' (nhiều pha vung nối tiếp
                    // trong 1 lần đánh) — đây là LỰA CHỌN DATA của riêng Traveler, nhân vật khác có
                    // thể dùng 1, 2, 5, hay bất kỳ số lượng segment nào cho 'active' mà không cần sửa
                    // gì ở combat core.
                    animations: [
                        {
                            phase: 'windup',
                            duration: 0.10, // = visualConfig.chargedAttack.windup cũ (GIỮ NGUYÊN số liệu)
                            rightHandOffsetStart: { x: 0, y: 0, z: 0 }, // base — charge cũ ngầm định bắt đầu từ 0
                            rightHandOffsetEnd: { x: -0.25, y: 0.55, z: 0.15 }, // = charge.rightHandOffset cũ
                            rightHandRotOffsetStart: { x: 0, y: 0, z: 0 },
                            rightHandRotOffsetEnd: { x: -0.15, y: 0.5, z: -0.3 }, // = charge.rightHandRotOffset cũ
                            coreOffsetStart: { x: 0, y: 0, z: 0 },
                            coreOffsetEnd: { x: 0, y: 0.08, z: -0.08 } // = charge.coreOffset cũ
                        },
                        // Phase 'active' — 3 SEGMENT nối tiếp (pha vung #1 -> #2 -> #3), tổng duration
                        // = 0.20s (chia đều mỗi segment ~0.0667s — PLACEHOLDER, có thể chỉnh riêng
                        // từng segment không cần bằng nhau). rightHandOffsetStart của segment #2/#3
                        // CHỈ mang tính THAM KHẢO trong data — engine THỰC TẾ tự lấy offsetEnd của
                        // segment liền trước làm điểm bắt đầu (xem getChargedAttackAnimSegment() trong
                        // combat.js, áp dụng cho MỌI segment không phải đầu tiên của TOÀN CHUỖI
                        // animations[], không riêng gì trong 1 phase) — đảm bảo LUÔN liền mạch dù
                        // designer có ghi Start lệch với End của segment trước.
                        {
                            phase: 'active',
                            duration: 0.1,
                            rightHandOffsetStart: { x: 1.0, y: 0.6, z: 0.4 },
                            rightHandOffsetEnd: { x: 2.4, y: -0.6, z: -0.9 },
                            rightHandRotOffsetStart: { x: -0.15, y: 0.5, z: -0.3 },
                            rightHandRotOffsetEnd: { x: 0.0, y: -0.7333, z: 0.4 },
                            coreOffsetStart: { x: 0.0, y: 0.08, z: -0.08 },
                            coreOffsetEnd: { x: -0.05, y: 0.0267, z: -0.0033 }
                        },
                        {
                            phase: 'active',
                            duration: 0.1,
                            rightHandOffsetStart: { x: 1.4, y: 0.4, z: 0.4 },
                            rightHandOffsetEnd: { x: -0.8, y: -0.5, z: 0.8 },
                            rightHandRotOffsetStart: { x: 0.0, y: -0.7333, z: 0.4 },
                            rightHandRotOffsetEnd: { x: 0.15, y: -1.9667, z: 1.1 },
                            coreOffsetStart: { x: -0.05, y: 0.0267, z: -0.0033 },
                            coreOffsetEnd: { x: -0.1, y: -0.0267, z: 0.0733 }
                        },
                        {
                            phase: 'recovery',
                            duration: 0.28, // = visualConfig.chargedAttack.recovery cũ (GIỮ NGUYÊN số liệu)
                            rightHandOffsetStart: { x: -0.6, y: 0.2, z: 0.6 },
                            rightHandOffsetEnd: { x: 0, y: 0, z: 0 }, // base — recovery cũ ngầm định về 0
                            rightHandRotOffsetStart: { x: 0.3, y: -3.2, z: 1.8 },
                            rightHandRotOffsetEnd: { x: 0, y: 0, z: 0 },
                            coreOffsetStart: { x: -0.15, y: -0.08, z: 0.15 },
                            coreOffsetEnd: { x: 0, y: 0, z: 0 }
                        }
                    ],
                    hits: [
                        { time: 0.05, scaling: { stat: 'ATK', multiplier: 0.8 }, impact: { type: 'heavy' } }, // PLACEHOLDER
                        { time: 0.10, scaling: { stat: 'ATK', multiplier: 1.2 }, impact: { type: 'launch' } } 
                    ]
                }
            },
            skill: {
                level: 1,
                beam: { scaling: { stat: 'ATK', multiplier: 1.893 } },
                tick: { scaling: { stat: 'ATK', multiplier: 0.328 } },
                suffusionBonus: { scaling: { stat: 'HP', multiplier: 0.0064 } }
            },
            burst: { level: 1, scaling: { stat: 'ATK', multiplier: 1.019 } }
        },

        // visualConfig: mọi thứ liên quan tới HÌNH ẢNH nhân vật — đặt tên "visual" thay vì
        // "mesh" có chủ đích, để khi Alpha sau này chuyển từ khối hình học (SphereGeometry
        // placeholder) sang model 3D thật (VD .glb qua GLTFLoader), CHỈ CẦN thêm field mới
        // (modelPath, animationClips...) vào object này — không đổi tên field, không đổi nơi
        // Engine đọc field, không phải sửa CHARACTER_ROSTER schema.
        //
        // Character Foundation (Alpha v1.0): schema Core/Hand/Hand — nhân vật là 3 sphere rời
        // (Core/LeftHand/RightHand, KHÔNG torso, KHÔNG chân, lơ lửng) + weapon gắn vào rightHand.
        // Đây là visual style CHÍNH THỨC của game (không phải placeholder chờ thay humanoid model
        // sau này) — xem 04-scene-init.js buildCharacterMesh() để biết cách các field này được đọc.
        //
        // LƯU Ý QUY ƯỚC TRỤC X (đã xác nhận qua test thực tế trên JoiPlay, không phải giả định):
        // trong hệ trục/camera hiện tại của game, X CỤC BỘ DƯƠNG hiển thị ở BÊN TRÁI màn hình khi
        // nhìn nhân vật từ sau lưng (góc camera third-person mặc định) — NGƯỢC với quy ước "phải
        // tay = X dương" thường gặp. Để tên field "rightHand"/"leftHand" KHỚP ĐÚNG vị trí hiển thị
        // trên màn hình (rightHand = bên phải màn hình khi nhìn từ sau lưng), rightHandPosition.x
        // mang giá trị ÂM và leftHandPosition.x mang giá trị DƯƠNG — NGƯỢC lại với quy ước "phải
        // tay = X dương" thường gặp trong toán học/engine 3D thông thường. Đã xác nhận qua test
        // thực tế: đảo dấu này cho kết quả kiếm hiện đúng bên phải màn hình như mong muốn.
        visualConfig: {
            coreColor: 0x475569,
            handColor: 0x475569,     // Alpha v1.0: mặc định trùng coreColor cho đơn giản — tách
                                       // field riêng để nhân vật tương lai có thể có màu tay khác
                                       // core mà không cần đổi schema.
            coreRadius: 0.6,
            handRadius: 0.26,
            floatingHeight: 0,        // Alpha v1.0: offset Y của toàn bộ tiltRoot so với gốc
                                       // playerGroup — 0 nghĩa là dùng đúng vị trí gốc hiện tại,
                                       // để nhân vật tương lai lơ lửng cao/thấp khác nhau.
            // Vị trí tương đối (local space, tính từ tâm tiltRoot) của Core/LeftHand/RightHand —
            // giá trị đã được người dùng tinh chỉnh qua test thực tế trên JoiPlay (checkpoint xác
            // nhận), KHÔNG phải giá trị suy đoán ban đầu. Xem ghi chú quy ước trục X ở trên —
            // rightHandPosition.x ÂM (không phải dương) để khớp đúng "bên phải màn hình".
            corePosition: { x: 0, y: 0.68, z: 0 },
            leftHandPosition: { x: 1.2, y: 0.25, z: 0 },
            // Combo Attack System v4 — IDLE STANCE MỚI (không phải offset combat, đây là base pose
            // THẬT khi đứng yên/di chuyển): tay phải hướng RA TRƯỚC (Z âm, theo quy ước "Z âm = lên
            // trước" đã xác nhận), THẤP HƠN so với v1 cũ (y: 0.25 -> 0.12), NGHIÊNG SANG PHẢI (X âm
            // hơn v1 cũ: -1.2 -> -1.35, theo quy ước "X âm = phải màn hình"). Toàn bộ 6 nhánh
            // idle/walk/run/swim/climb/plunge trong updatePhysics() (file 08) đều lerp VỀ ĐÚNG field
            // này làm base — xem applyRightHandBasePose() (thêm mới trong file 08).
            rightHandPosition: { x: -1.35, y: 0.12, z: -0.35 },
            // rightHandBaseRotation: rotation NỀN của RightHand khi KHÔNG tấn công (idle/di chuyển) —
            // field MỚI, trước đây không tồn tại (rotation X/Y của RightHand mặc định luôn = 0 vì
            // không nhánh idle/walk/run nào từng động tới, chỉ rotation.z được lerp về 0 — đây là một
            // lỗi tiềm ẩn đã tồn tại, không phải tính năng cũ). Vì Sword là CON của RightHand (xem
            // weaponGrip), nghiêng RightHand ở đây làm Sword tự động nghiêng theo qua hierarchy — ĐÚNG
            // nguyên tắc đã chốt "không đổi rotation kiếm trực tiếp, chỉ đổi rotation tay". Giá trị
            // dưới đây là ĐIỂM KHỞI ĐẦU hợp lý (nghiêng nhẹ theo trục Y để mũi kiếm chếch ra trước-phải)
            // — CẦN người dùng tự quan sát và tinh chỉnh bằng mắt trên JoiPlay giống các checkpoint
            // trước, không phải giá trị đã xác nhận qua test thực tế.
            rightHandBaseRotation: { x: 0.15, y: -0.3, z: 0.1 },
            // weaponGrip: transform CỤC BỘ của weapon so với rightHand (weapon là CON của
            // rightHand, không phải con ngang hàng playerGroup như bố cục cũ). Gốc cục bộ của
            // geometry kiếm đã dời sang CHUÔI kiếm (xem 04-scene-init.js, swordGeo.translate()) —
            // position bên dưới đã được TÍNH LẠI (dùng THREE.Vector3.applyEuler thật, không suy
            // luận tay) để bù trừ độ lệch do đổi gốc, giữ ĐÚNG vị trí hiển thị lưỡi kiếm trên màn
            // hình như checkpoint trước (khi gốc còn ở giữa kiếm). Nếu đổi rotation, position này
            // CẦN được tính lại tương ứng (không còn đúng nếu chỉ đổi rotation mà giữ nguyên
            // position) — công thức: position_mới = position_cũ - offsetLocal.applyEuler(rotation),
            // với offsetLocal = (0, 0, 0.725) (khoảng cách chuôi->tâm kiếm cũ theo local Z).
            //
            // LƯU Ý (Combo Attack System v4): vì RightHand giờ có rightHandBaseRotation khác 0 ở
            // idle (trước là 0,0,0), player.sword.rotation LÚC IDLE (nhánh attackState === 'idle' ở
            // file 08, VD dòng ~830/842) hiện gán TUYỆT ĐỐI = weaponGrip.rotation (+ tiltRoot.x) —
            // KHÔNG cộng thêm rightHandBaseRotation, vì Sword là CON của RightHand nên rotation của
            // RightHand áp dụng qua hierarchy TỰ ĐỘNG (Three.js), weaponGrip.rotation vẫn giữ nguyên
            // Ý NGHĨA "rotation cục bộ của kiếm so với tay" — KHÔNG cần sửa công thức gán sword.rotation.
            weaponGrip: {
                position: { x: -0.1, y: -0.16, z: -0.1 },
                rotation: { x: Math.PI / 180 * 155, y: Math.PI / 180 * -10, z: Math.PI / 180 * 150}
            },
            // climbGripRotation: pose TUYỆT ĐỐI của Sword lúc đang leo tường (isClimbing, xem file
            // 08) — field MỚI (Character Foundation v2, Dependency Fix mục D.2). TRƯỚC ĐÂY hard-code
            // cứng trong Engine (-Math.PI/2, 0, Math.PI/10), áp dụng như nhau cho MỌI nhân vật bất
            // kể weaponGrip riêng — giá trị dưới đây GIỮ NGUYÊN ĐÚNG số cũ để Traveler (Character #1)
            // không đổi hành vi. Optional cho nhân vật khác — nếu không khai báo, Engine tự fallback
            // về đúng giá trị này (xem nhánh isClimbing trong updatePhysics(), file 08).
            climbGripRotation: { x: -Math.PI / 2, y: 0, z: Math.PI / 10 },
            // comboWindow: Combo Window Config v1 — field MỚI, 1 GIÁ TRỊ DUY NHẤT (giây, KHÔNG
            // per-đòn) áp dụng cho toàn bộ combo của nhân vật này. Đại diện TỔNG thời gian tính từ
            // lúc recovery của đòn hiện tại BẮT ĐẦU mà input vẫn được chấp nhận để nối sang đòn kế
            // tiếp — có thể LỚN HƠN recovery của từng đòn riêng lẻ (xem updateCombat() file 08,
            // state 'comboGrace' mới). Recovery của 4 đòn hiện tại: 0.10s / 0.12s / 0.21s / 0.10s —
            // nếu comboWindow = recovery (như trước khi có field này), cửa sổ bấm để nối Attack #1
            // -> #2 chỉ có 0.10s, khá hẹp. Đặt 0.30s ở đây để có thêm ~0.20s grace sau khi Attack
            // #1/#4 (recovery ngắn nhất) kết thúc animation — CẦN người dùng tự chơi thử và tinh
            // chỉnh lại bằng cảm giác thực tế trên JoiPlay, đây chỉ là điểm khởi đầu hợp lý dựa trên
            // recovery ngắn nhất hiện có. Optional — nếu không khai báo, fallback về
            // DEFAULT_COMBO_WINDOW (0.26s, file 02) qua getComboWindow() (combat.js).
            comboWindow: 0.30,
            // chargedAttack: Charged Attack v1 -> v2 — config CHỈ CÒN chargeTime + staminaCost tại
            // đây. windup/active/recovery (thời lượng mỗi phase) ĐÃ CHUYỂN sang được TÍNH TỰ ĐỘNG từ
            // tổng duration các animation segment cùng `phase` trong talents.normalAttack.
            // chargedAttack.animations[] (xem getChargedAttackPhaseDuration() trong combat.js) — TRÁNH
            // 2 nguồn dữ liệu có thể lệch nhau (trước kia windup/active/recovery ở ĐÂY và duration
            // trong từng animation segment là 2 chỗ tách biệt, dễ quên đồng bộ). Optional — nếu không
            // khai báo, fallback về DEFAULT_CHARGED_ATTACK (file 02) qua getChargedAttackConfig()
            // (combat.js). PLACEHOLDER — chưa balance, chỉ đủ để test.
            // staminaCost: 25 Stamina/lần Charged Attack thực sự kích hoạt — baseline lấy cảm hứng
            // Genshin Impact (yêu cầu đã xác nhận), tích hợp qua STAMINA_CONFIG/player.stamina đã có
            // sẵn (xem triggerChargedAttack() trong combat.js), KHÔNG tạo hệ thống Stamina riêng.
            chargedAttack: {
                chargeTime: 0.25, // giữ Attack tối thiểu 0.25s để Charged Attack "sẵn sàng"
                staminaCost: 25.0
            },
            // Alpha v1.0 — Attack Animation v1: keyframe procedural cho Normal Attack, đọc bởi
            // updateCombat() (08-physics-combat-camera-loop.js) tại 3 giai đoạn windup/active/
            // recovery (TÁI SỬ DỤNG timer/prog đã có của Attack System, KHÔNG tạo state machine
            // mới). Mọi offset RightHand/Core là TƯƠNG ĐỐI so với base pose (rightHandPosition/
            // corePosition, rightHand.rotation gốc = (0,0,0)) — Engine áp dụng CỘNG lên base,
            // không gán tuyệt đối. Data-driven theo nhân vật: nhân vật khác có thể có bộ số khác
            // hoặc animation.attack riêng mà không cần sửa Combat System — chỉ cần thêm entry mới.
            //
            // CHECKPOINT QUAN TRỌNG (qua quan sát thực tế trên JoiPlay): ban đầu Sword có rotation
            // animation RIÊNG trong lúc Attack (xoay theo windupRotation -> activeRotationEnd,
            // độc lập với RightHand) — nhưng khi cả Sword VÀ RightHand cùng xoay, hình ảnh bị
            // "xoay chồng xoay", không tự nhiên (không giống cách vung kiếm thật, vốn chỉ do
            // cánh tay/cổ tay điều khiển, vũ khí chỉ đi theo qua hierarchy). Người dùng đã tự
            // quan sát và quyết định: TỪ NAY, rotation của Sword GIỮ NGUYÊN CỐ ĐỊNH trong suốt
            // Attack — windupRotation và activeRotationEnd được đặt CÙNG 1 giá trị (đúng ý đồ,
            // không phải trùng hợp) để nội suy active không tạo ra chuyển động xoay nào cho Sword.
            // Toàn bộ chuyển động của cú chém giờ chỉ đến từ rightHand.position/rotation (windup/
            // active/core bên dưới) — Sword tự "đi theo" vì là con của rightHand trong hierarchy.
            // 2 field windupRotation/activeRotationEnd VẪN GIỮ trong schema (không xóa, không gộp
            // thành 1 field) để nếu sau này cần cho nhân vật khác có Sword tự xoay riêng, chỉ cần
            // đặt 2 giá trị khác nhau — không phải đổi lại kiến trúc Engine.
            // Combo Attack System v1: animation.attack đổi từ OBJECT PHẲNG sang MẢNG các đòn —
            // attack[0] = Attack #1 (giữ NGUYÊN VẸN 100% số liệu cũ, KHÔNG đổi 1 giá trị nào, chỉ
            // bọc thêm 1 lớp mảng). attack[1], attack[2]... dành cho Attack #2/#3/... thêm sau này.
            // Engine (updateCombat() trong 08, triggerAttack() trong combat.js) tra
            // attack[player.comboIndex - 1] để lấy đúng entry của đòn đang chạy trong combo. Số
            // lượng đòn = attack.length — nhân vật khác có thể có mảng dài/ngắn khác nhau, không
            // hard-code số lượng đòn trong Engine.
            animation: {
                attack: [{
                    // Combo Attack System v5 — Quỹ đạo THIẾT KẾ LẠI theo idle stance mới (xem
                    // rightHandBaseRotation/rightHandPosition ở trên): mọi offset dưới đây CỘNG lên
                    // idle base mới {x:-1.35, y:0.12, z:-0.35}, KHÔNG phải base cũ {x:-1.2, y:0.25,
                    // z:0} — cùng 1 con số offset giờ cho vị trí tuyệt đối khác trước.
                    //
                    // Attack #1 — chém CHÉO: windup dơ CAO lên + lệch PHẢI (X âm thêm so với base,
                    // chuẩn bị vung), active quét chéo từ trên-phải XUỐNG dưới-trái (kết thúc X dương
                    // = lệch trái, Y âm = xuống thấp, theo đúng mô tả "trên-phải xuống dưới-trái").
                    // Sword rotation GIỮ 0 (không tự xoay, đi theo RightHand qua hierarchy — đúng
                    // nguyên tắc "không đổi rotation kiếm trực tiếp" đã chốt).
                    timing: { windup: 0.12, active: 0.14, recovery: 0.10 },

                    sword: {
                        windupRotation: { x: 0, y: 0, z: 0},
                        activeRotationEnd: { x: 0, y: 0, z: 0}
                    },
                    // Windup: dơ cao (Y dương) + lệch phải thêm (X âm nhẹ) + hơi rút ra sau (Z dương
                    // nhẹ, như kéo tay chuẩn bị) — CẦN người dùng tự quan sát/tinh chỉnh trên JoiPlay.
                    windup: {
                        rightHandOffset: { x: -0.15, y: 0.35, z: 0.1 },
                        rightHandRotOffset: { x: -0.1, y: 0.3, z: -0.2 },
                        coreOffset: { x: 0, y: 0.05, z: -0.05 }
                    },
                    // Active: quét TỪ điểm cuối windup (trên-phải) ĐẾN điểm cuối chém (dưới-trái) —
                    // X tăng mạnh dương (sang trái), Y giảm mạnh (xuống thấp), Z tăng nhẹ dương (đâm
                    // nhẹ ra trước theo đà vung, KHÔNG đảo dấu so với windup — giữ liền mạch).
                    active: {
                        rightHandOffsetStart: { x: -0.15, y: 0.35, z: 0.1 },
                        rightHandOffsetEnd: { x: 0.55, y: -0.5, z: 0.15 },
                        rightHandRotOffsetStart: { x: -0.1, y: 0.3, z: -0.2 },
                        rightHandRotOffsetEnd: { x: 0.2, y: -2.6, z: 1.4 },
                        coreOffsetStart: { x: 0, y: 0.05, z: -0.05 },
                        coreOffsetEnd: { x: -0.1, y: -0.06, z: 0.1 }
                    },
                    // Recovery: điểm BẮT ĐẦU lerp = điểm cuối active (bắt buộc khớp active.*End —
                    // nếu không khớp animation sẽ "giật" ngay lúc chuyển active->recovery). Đích ĐẾN
                    // của lerp KHÔNG khai báo ở đây nữa — Engine (file 08) tự lấy windup của đòn KẾ
                    // TIẾP làm đích (xem getNextAttackAnim() trong combat.js, đã áp dụng từ Combo
                    // Attack System v3) — recovery #1 sẽ tự lerp tới windup #2 bên dưới.
                    recovery: {
                        rightHandOffsetStart: { x: 0.55, y: -0.5, z: 0.15 },
                        rightHandRotOffsetStart: { x: 0.2, y: -2.6, z: 1.4 },
                        coreOffsetStart: { x: -0.1, y: -0.06, z: 0.1 },
                        overshootFactor: 1.15
                    }
                }, {
                    // Attack #2 — chém NGANG: windup XUẤT PHÁT từ vị trí recovery #1 (X/Z GIỮ NGUYÊN
                    // = 0.55/0.15, khớp đúng recovery.*Start của Attack #1 ở trên) nhưng Y NÂNG CAO
                    // HƠN (theo đúng mô tả "windup bắt đầu ở y cao hơn recovery #1") — active quét
                    // NGANG từ trái (X dương, thừa hưởng windup) sang phải (X âm), Y GIỮ NGUYÊN xuyên
                    // suốt (đặc trưng chém ngang, khác #1/#3 là chém chéo).
                    timing: { windup: 0.08, active: 0.18, recovery: 0.12 },

                    sword: {
                        windupRotation: { x: 0, y: 0, z: 0 },
                        activeRotationEnd: { x: 0, y: 0, z: 0 }
                    },
                    windup: {
                        rightHandOffset: { x: 0.55, y: -0.15, z: 0.15 },
                        rightHandRotOffset: { x: 0.2, y: -2.6, z: 1.4 },
                        coreOffset: { x: -0.1, y: -0.02, z: 0.1 },
                    },
                    // Active (Slash ngang): X từ dương lớn (trái, thừa hưởng windup) giảm về âm lớn
                    // (phải) — Y KHÔNG ĐỔI (windup->active->recovery cùng 1 mức Y, đúng "ngang thật
                    // sự" theo mô tả). Z gần 0 (không đâm ra trước/sau nhiều, thuần chém ngang).
                    active: {
                        rightHandOffsetStart: { x: 0.55, y: -0.15, z: 0.15 },
                        rightHandOffsetEnd: { x: -0.65, y: -0.15, z: 0.1 },
                        rightHandRotOffsetStart: { x: 0.2, y: -2.6, z: 1.4 },
                        rightHandRotOffsetEnd: { x: 0.2, y: -0.4, z: -1.2 },
                        coreOffsetStart: { x: -0.1, y: -0.02, z: 0.1 },
                        coreOffsetEnd: { x: 0.1, y: 0, z: 0.05 }
                    },
                    // Recovery: bắt đầu = điểm cuối active #2 (bên phải). Đích đến tự động là windup
                    // #3 (xem giải thích ở recovery #1 phía trên) — recovery #2 sẽ tự lerp tới windup
                    // #3 bên dưới.
                    recovery: {
                        rightHandOffsetStart: { x: -0.65, y: -0.15, z: 0.1 },
                        rightHandRotOffsetStart: { x: 0.2, y: -0.4, z: -1.2 },
                        coreOffsetStart: { x: 0.1, y: 0, z: 0.05 },
                        overshootFactor: 1.15
                    }
                }, {
                    // Attack #3 — chém CHÉO NGƯỢC (dưới-phải lên trên-trái, ngược hướng Attack #1):
                    // windup XUẤT PHÁT từ vị trí recovery #2 (X/Z GIỮ NGUYÊN = -0.65/0.1, khớp đúng
                    // recovery.*Start của Attack #2 ở trên — bên phải, cao trung bình ngang mặt) NHƯNG
                    // Y THẤP HƠN MỘT CHÚT (theo đúng mô tả "windup #3 bắt đầu với y thấp hơn so với
                    // recovery #2") — active quét CHÉO từ dưới-phải LÊN trên-trái (X tăng dương mạnh
                    // = sang trái, Y tăng dương mạnh = lên cao, ngược chiều Y so với Attack #1).
                    timing: { windup: 0.11, active: 0.20, recovery: 0.21 },

                    sword: {
                        windupRotation: { x: 0, y: 0, z: 0 },
                        activeRotationEnd: { x: 0, y: 0, z: 0 }
                    },
                    // Windup: thừa hưởng X/Z từ recovery #2, HẠ Y xuống thấp hơn (chuẩn bị chém từ
                    // dưới lên) — CẦN người dùng tự quan sát/tinh chỉnh trên JoiPlay.
                    windup: {
                        rightHandOffset: { x: -0.65, y: -0.3, z: 0.1 },
                        rightHandRotOffset: { x: 0.2, y: -0.4, z: -1.2 },
                        coreOffset: { x: 0.1, y: -0.05, z: 0.05 },
                    },
                    // Active: quét TỪ điểm cuối windup (dưới-phải) ĐẾN điểm cuối chém (trên-trái) —
                    // X tăng mạnh dương (sang trái), Y tăng mạnh dương (lên cao, NGƯỢC Attack #1 vốn Y
                    // giảm), Z giảm nhẹ âm (hơi ngả người ra trước theo đà chém lên).
                    active: {
                        rightHandOffsetStart: { x: -0.65, y: -0.3, z: 0.1 },
                        rightHandOffsetEnd: { x: 0.5, y: 0.5, z: -0.15 },
                        rightHandRotOffsetStart: { x: 0.2, y: -0.4, z: -1.2 },
                        rightHandRotOffsetEnd: { x: -0.2, y: 2.8, z: -1.5 },
                        coreOffsetStart: { x: 0.1, y: -0.05, z: 0.05 },
                        coreOffsetEnd: { x: -0.1, y: 0.08, z: -0.08 }
                    },
                    // Recovery: bắt đầu = điểm cuối active #3 (trên-trái). #3 là đòn CUỐI trong mảng
                    // -> Engine tự XOAY VÒNG, lấy windup của Attack #1 làm đích lerp (xem
                    // getNextAttackAnim() trong combat.js) — recovery #3 sẽ tự lerp về windup #1,
                    // khép kín vòng combo. CẦN kiểm tra bằng mắt trên JoiPlay xem cú nối trên-trái
                    // (#3) -> windup #1 (trên-phải) có tự nhiên không, vì đây là 2 tư thế khác biệt.
                    recovery: {
                        rightHandOffsetStart: { x: 0.5, y: 0.5, z: -0.15 },
                        rightHandRotOffsetStart: { x: -0.2, y: 2.8, z: -1.5 },
                        coreOffsetStart: { x: -0.1, y: 0.08, z: -0.08 },
                        overshootFactor: 1.15
                    }
                }, {
                    // Combo Attack System v5 — Quỹ đạo THIẾT KẾ LẠI theo idle stance mới (xem
                    // rightHandBaseRotation/rightHandPosition ở trên): mọi offset dưới đây CỘNG lên
                    // idle base mới {x:-1.35, y:0.12, z:-0.35}, KHÔNG phải base cũ {x:-1.2, y:0.25,
                    // z:0} — cùng 1 con số offset giờ cho vị trí tuyệt đối khác trước.
                    //
                    // Attack #4 — chém CHÉO: windup dơ CAO lên + lệch PHẢI (X âm thêm so với base,
                    // chuẩn bị vung), active quét chéo từ trên-phải XUỐNG dưới-trái (kết thúc X dương
                    // = lệch trái, Y âm = xuống thấp, theo đúng mô tả "trên-phải xuống dưới-trái").
                    // Sword rotation GIỮ 0 (không tự xoay, đi theo RightHand qua hierarchy — đúng
                    // nguyên tắc "không đổi rotation kiếm trực tiếp" đã chốt).
                    timing: { windup: 0.12, active: 0.14, recovery: 0.10 },

                    sword: {
                        windupRotation: { x: 0, y: 0, z: 0},
                        activeRotationEnd: { x: 0, y: 0, z: 0}
                    },
                    // Windup: dơ cao (Y dương) + lệch phải thêm (X âm nhẹ) + hơi rút ra sau (Z dương
                    // nhẹ, như kéo tay chuẩn bị) — CẦN người dùng tự quan sát/tinh chỉnh trên JoiPlay.
                    windup: {
                        rightHandOffset: { x: -0.15, y: 0.35, z: 0.1 },
                        rightHandRotOffset: { x: -0.1, y: 0.3, z: -0.2 },
                        coreOffset: { x: 0, y: 0.05, z: -0.05 }
                    },
                    // Active: quét TỪ điểm cuối windup (trên-phải) ĐẾN điểm cuối chém (dưới-trái) —
                    // X tăng mạnh dương (sang trái), Y giảm mạnh (xuống thấp), Z tăng nhẹ dương (đâm
                    // nhẹ ra trước theo đà vung, KHÔNG đảo dấu so với windup — giữ liền mạch).
                    active: {
                        rightHandOffsetStart: { x: -0.15, y: 0.35, z: 0.1 },
                        rightHandOffsetEnd: { x: 0.55, y: -0.5, z: 0.15 },
                        rightHandRotOffsetStart: { x: -0.1, y: 0.3, z: -0.2 },
                        rightHandRotOffsetEnd: { x: 0.2, y: -2.6, z: 1.4 },
                        coreOffsetStart: { x: 0, y: 0.05, z: -0.05 },
                        coreOffsetEnd: { x: -0.1, y: -0.06, z: 0.1 }
                    },
                    // Recovery: điểm BẮT ĐẦU lerp = điểm cuối active (bắt buộc khớp active.*End —
                    // nếu không khớp animation sẽ "giật" ngay lúc chuyển active->recovery). Đích ĐẾN
                    // của lerp KHÔNG khai báo ở đây nữa — Engine (file 08) tự lấy windup của đòn KẾ
                    // TIẾP làm đích (xem getNextAttackAnim() trong combat.js, đã áp dụng từ Combo
                    // Attack System v3) — recovery #1 sẽ tự lerp tới windup #2 bên dưới.
                    recovery: {
                        rightHandOffsetStart: { x: 0.55, y: -0.5, z: 0.15 },
                        rightHandRotOffsetStart: { x: 0.2, y: -2.6, z: 1.4 },
                        coreOffsetStart: { x: -0.1, y: -0.06, z: 0.1 },
                        overshootFactor: 1.15
                    }
                }]
            }
            // Chỗ mở rộng tương lai (không cần khai báo trước, thêm khi cần):
            //   modelPath: đường dẫn model 3D thật
            //   scale: hệ số scale riêng nếu model có kích thước khác chuẩn
            //   skinVariant: biến thể trang phục/màu
        },

        // animationConfig: để trống — chưa có hệ thống animation clip thật (hiện tại dùng
        // procedural animation viết tay trong updatePhysics). Giữ chỗ theo đúng đề xuất cấu
        // trúc ban đầu để không phải đổi schema khi animation system thật được xây.
        animationConfig: {}
    },

    // --- TEST CHARACTER (ANEMO) — nhân vật thử nghiệm switch, CHƯA có skill/burst thật.
    // skillId/burstId = null là trạng thái HỢP LỆ, không phải lỗi — dùng để test Engine xử lý
    // đúng trường hợp "nhân vật chưa có kỹ năng" mà không crash.
    //
    // Character #2 Foundation & Data-Driven Validation: MỌI giá trị dưới đây (corePosition,
    // rightHandBaseRotation, climbGripRotation, comboWindow, animation.attack) được chọn CỐ Ý
    // KHÁC BIỆT RÕ RỆT so với traveler_hydro — không phải để đẹp, mà để bất kỳ giá trị nào của
    // Traveler "dính" lại qua switchToCharacter() (do thiếu fallback, đọc nhầm field, hoặc hard-
    // code sót đâu đó trong Engine) sẽ HIỆN RA NGAY LẬP TỨC khi quan sát bằng mắt, thay vì im lặng
    // trùng khớp ngẫu nhiên. Đây CHÍNH LÀ mục đích kiểm chứng của Character #2 — không phải
    // animation polish (xem "Bước 3" trong tài liệu thiết kế gốc).
    test_character_anemo: {
        id: 'test_character_anemo',
        name: 'Test Character',
        element: 'Anemo',
        region: 'Mondstadt',
        rarity: null,
        weaponType: null,
        gameplayType: null,
        // maxEnergy: CỐ Ý khác Traveler (50) — số khác biệt rõ (80) để kiểm chứng
        // switchToCharacter() đọc đúng maxEnergy riêng của nhân vật này, không dính giá trị 50 của
        // Traveler (xem giải thích đầy đủ ở baseStats của Traveler, đầu file).
        baseStats: { maxHp: 140, atk: 12, def: 8, maxEnergy: 80 },
        skillId: null,
        burstId: null,
        // Talent System v2 Validation: multiplier CỐ Ý khác Traveler — số lớn hơn hẳn (2.0-3.5) để
        // nếu Engine lỡ đọc nhầm talents của Traveler, sát thương sẽ CHÊNH LỆCH RÕ RỆT, dễ nhận ra
        // khi test. Đòn #1 và #4 trong combo dùng multiplier KHÁC NHAU (2.0 vs 3.0, khác Traveler
        // đang dùng 5 giá trị Genshin thật 0.445-0.708) — kiểm chứng Engine đọc ĐÚNG index trong
        // mảng combo[], không phải luôn lấy phần tử đầu tiên. skill.beam scale theo "HP" thay vì
        // "ATK" (dù skillId hiện = null, chưa thi triển được) — kiểm chứng
        // getTalentScaling()/calculatePlayerToEnemyDamage() đọc ĐÚNG stat được khai báo, không
        // hard-code luôn là ATK. Field tên khớp ĐÚNG cấu trúc mới (skill.beam/skill.tick, không
        // còn skill.scaling đơn — xem Stat Baseline Update v1, roster Traveler phía trên).
        talents: {
            normalAttack: {
                combo: [
                    { scaling: { stat: 'ATK', multiplier: 2.0 } }, // Attack #1
                    { scaling: { stat: 'ATK', multiplier: 2.5 } }, // Attack #2
                    { scaling: { stat: 'ATK', multiplier: 2.5 } }, // Attack #3
                    { scaling: { stat: 'ATK', multiplier: 3.0 } }  // Attack #4
                ],
                plunge: { scaling: { stat: 'ATK', multiplier: 3.5 } }
            },
            skill: {
                level: 1,
                beam: { scaling: { stat: 'HP', multiplier: 0.1 } },
                tick: { scaling: { stat: 'HP', multiplier: 0.02 } }
            },
            burst: { level: 1, scaling: { stat: 'DEF', multiplier: 3.0 } }
        },
        visualConfig: {
            coreColor: 0x16a34a,
            handColor: 0x16a34a,
            coreRadius: 0.6,
            handRadius: 0.26,
            floatingHeight: 0,
            corePosition: { x: 0, y: 0.68, z: 0 },
            leftHandPosition: { x: 1.2, y: 0.25, z: 0 },
            rightHandPosition: { x: -1.2, y: 0.25, z: 0 },
            // rightHandBaseRotation: CỐ Ý khác Traveler (0.15, -0.3, 0.1) — dùng số tròn, biên độ
            // lớn hơn hẳn để dễ nhận ra bằng mắt nếu Engine lỡ đọc nhầm sang field của Traveler.
            rightHandBaseRotation: { x: 0, y: 0.5, z: -0.3 },
            weaponGrip: {
                position: { x: 0, y: -0.3279, z: -0.0825 },
                rotation: { x: -Math.PI / 3, y: 0, z: Math.PI / 10 }
            },
            // climbGripRotation: CỐ Ý khác Traveler (-π/2, 0, π/10) — kiểm chứng field optional mới
            // hoạt động đúng khi nhân vật CÓ khai báo (khác trường hợp Traveler test giá trị mặc
            // định, và khác trường hợp KHÔNG khai báo gì để test fallback).
            climbGripRotation: { x: -Math.PI / 4, y: Math.PI / 2, z: 0 },
            // comboWindow: CỐ Ý khác cả DEFAULT_COMBO_WINDOW (0.26s) lẫn Traveler (0.30s) — số nhỏ
            // hơn hẳn (0.15s) để nếu Engine lỡ dùng nhầm giá trị của Traveler/default, combo sẽ
            // "nối" quá dễ dàng thấy rõ (window dài hơn dự tính) khi test trên JoiPlay.
            comboWindow: 0.15,
            // animation.attack: ĐỦ 4 đòn (khớp scope "Attack #1 khác, #2 khác, #3 khác, #4 khác"
            // trong tài liệu gốc) — mỗi đòn quét theo 1 TRỤC RIÊNG BIỆT, số liệu tròn, biên độ lớn
            // (không polish, không cần "đẹp" — chỉ cần rõ ràng để phân biệt bằng mắt khi test):
            //   Attack #1: quét theo X (trái <-> phải)
            //   Attack #2: quét theo Y (lên <-> xuống)
            //   Attack #3: quét theo Z (trước <-> sau)
            //   Attack #4: quét đồng thời cả 3 trục (khác hẳn kiểu "1 trục" của #1-#3, để kiểm
            //   chứng combo 4 đòn không bị Engine giả định cứng "chỉ có 3 kiểu quỹ đạo")
            // Tính liên tục vẫn giữ ĐÚNG nguyên tắc đã áp dụng cho Traveler: active.*End của đòn N
            // khớp recovery.*Start của đòn N; windup.*Offset của đòn N khớp X/Z của recovery.*Start
            // đòn N-1 (chỉ Y được phép đổi, theo thiết kế "nối tiếp nhưng đổi độ cao" đã chốt).
            animation: {
                attack: [{
                    // Attack #1 — quét NGANG theo X, windup/active/recovery đơn giản, số tròn.
                    timing: { windup: 0.10, active: 0.15, recovery: 0.20 },
                    sword: {
                        windupRotation: { x: 0, y: 0, z: 0 },
                        activeRotationEnd: { x: 0, y: 0, z: 0 }
                    },
                    windup: {
                        rightHandOffset: { x: 0.3, y: 0, z: 0 },
                        rightHandRotOffset: { x: 0, y: 0, z: 0 },
                        coreOffset: { x: 0, y: 0, z: 0 }
                    },
                    active: {
                        rightHandOffsetStart: { x: 0.3, y: 0, z: 0 },
                        rightHandOffsetEnd: { x: -0.6, y: 0, z: 0 },
                        rightHandRotOffsetStart: { x: 0, y: 0, z: 0 },
                        rightHandRotOffsetEnd: { x: 0, y: 1.0, z: 0 },
                        coreOffsetStart: { x: 0, y: 0, z: 0 },
                        coreOffsetEnd: { x: -0.1, y: 0, z: 0 }
                    },
                    recovery: {
                        rightHandOffsetStart: { x: -0.6, y: 0, z: 0 },
                        rightHandRotOffsetStart: { x: 0, y: 1.0, z: 0 },
                        coreOffsetStart: { x: -0.1, y: 0, z: 0 }
                    }
                }, {
                    // Attack #2 — quét theo Y (lên/xuống). Windup thừa hưởng X/Z từ recovery #1
                    // (-0.6, 0), CHỈ đổi Y (nâng lên 0.2, theo đúng nguyên tắc "nối tiếp, đổi độ cao"
                    // đã áp dụng cho Traveler).
                    timing: { windup: 0.10, active: 0.15, recovery: 0.20 },
                    sword: {
                        windupRotation: { x: 0, y: 0, z: 0 },
                        activeRotationEnd: { x: 0, y: 0, z: 0 }
                    },
                    windup: {
                        rightHandOffset: { x: -0.6, y: 0.2, z: 0 },
                        rightHandRotOffset: { x: 0, y: 1.0, z: 0 },
                        coreOffset: { x: -0.1, y: 0, z: 0 }
                    },
                    active: {
                        rightHandOffsetStart: { x: -0.6, y: 0.2, z: 0 },
                        rightHandOffsetEnd: { x: -0.6, y: -0.5, z: 0 },
                        rightHandRotOffsetStart: { x: 0, y: 1.0, z: 0 },
                        rightHandRotOffsetEnd: { x: 1.0, y: 1.0, z: 0 },
                        coreOffsetStart: { x: -0.1, y: 0, z: 0 },
                        coreOffsetEnd: { x: -0.1, y: -0.05, z: 0 }
                    },
                    recovery: {
                        rightHandOffsetStart: { x: -0.6, y: -0.5, z: 0 },
                        rightHandRotOffsetStart: { x: 1.0, y: 1.0, z: 0 },
                        coreOffsetStart: { x: -0.1, y: -0.05, z: 0 }
                    }
                }, {
                    // Attack #3 — quét theo Z (trước/sau). Windup thừa hưởng X/Y từ recovery #2
                    // (-0.6, -0.5), CHỈ đổi... theo đúng nguyên tắc, lần này trục "không đổi" giữa
                    // 2 đòn là X/Y (đòn #3 tự thân quét Z), nên windup #3 giữ NGUYÊN X/Y của
                    // recovery #2 y hệt.
                    timing: { windup: 0.10, active: 0.15, recovery: 0.20 },
                    sword: {
                        windupRotation: { x: 0, y: 0, z: 0 },
                        activeRotationEnd: { x: 0, y: 0, z: 0 }
                    },
                    windup: {
                        rightHandOffset: { x: -0.6, y: -0.5, z: 0.2 },
                        rightHandRotOffset: { x: 1.0, y: 1.0, z: 0 },
                        coreOffset: { x: -0.1, y: -0.05, z: 0 }
                    },
                    active: {
                        rightHandOffsetStart: { x: -0.6, y: -0.5, z: 0.2 },
                        rightHandOffsetEnd: { x: -0.6, y: -0.5, z: -0.5 },
                        rightHandRotOffsetStart: { x: 1.0, y: 1.0, z: 0 },
                        rightHandRotOffsetEnd: { x: 1.0, y: 0, z: 1.0 },
                        coreOffsetStart: { x: -0.1, y: -0.05, z: 0 },
                        coreOffsetEnd: { x: -0.1, y: -0.05, z: -0.05 }
                    },
                    recovery: {
                        rightHandOffsetStart: { x: -0.6, y: -0.5, z: -0.5 },
                        rightHandRotOffsetStart: { x: 1.0, y: 0, z: 1.0 },
                        coreOffsetStart: { x: -0.1, y: -0.05, z: -0.05 }
                    }
                }, {
                    // Attack #4 — quét ĐỒNG THỜI cả 3 trục (khác #1-#3 chỉ quét 1 trục), kiểm chứng
                    // Engine không giả định cứng "mỗi đòn chỉ đổi 1 trục". Windup thừa hưởng nguyên
                    // X/Y/Z từ recovery #3 (không đổi gì, khác #2/#3 vốn có đổi 1 trục Y/Z) — minh
                    // họa rằng field "đổi độ cao ở windup" là TÙY CHỌN thiết kế, không bắt buộc.
                    timing: { windup: 0.10, active: 0.15, recovery: 0.20 },
                    sword: {
                        windupRotation: { x: 0, y: 0, z: 0 },
                        activeRotationEnd: { x: 0, y: 0, z: 0 }
                    },
                    windup: {
                        rightHandOffset: { x: -0.6, y: -0.5, z: -0.5 },
                        rightHandRotOffset: { x: 1.0, y: 0, z: 1.0 },
                        coreOffset: { x: -0.1, y: -0.05, z: -0.05 }
                    },
                    active: {
                        rightHandOffsetStart: { x: -0.6, y: -0.5, z: -0.5 },
                        rightHandOffsetEnd: { x: 0.3, y: 0.2, z: 0.2 },
                        rightHandRotOffsetStart: { x: 1.0, y: 0, z: 1.0 },
                        rightHandRotOffsetEnd: { x: 0, y: 0, z: 0 },
                        coreOffsetStart: { x: -0.1, y: -0.05, z: -0.05 },
                        coreOffsetEnd: { x: 0, y: 0, z: 0 }
                    },
                    // Recovery #4 (đòn cuối trong mảng) — xoay vòng, Engine tự lerp về windup #1
                    // (getNextAttackAnim() modulo attackList.length, xem combat.js) — recovery.Start
                    // ở đây KHÔNG khớp X/Z với windup #1 ({x:0.3,y:0,z:0}) một cách cố ý, giống hệt
                    // cách Traveler cũng có điểm "gãy" tại vòng lặp #4 -> #1 (đã ghi chú cần kiểm tra
                    // bằng mắt) — Character #2 tái hiện đúng đặc điểm kiến trúc này để kiểm chứng
                    // Engine xử lý xoay vòng nhất quán giữa các nhân vật.
                    recovery: {
                        rightHandOffsetStart: { x: 0.3, y: 0.2, z: 0.2 },
                        rightHandRotOffsetStart: { x: 0, y: 0, z: 0 },
                        coreOffsetStart: { x: 0, y: 0, z: 0 }
                    }
                }]
            }
        },
        animationConfig: {}
    },

    // ============================================================
    // CHARACTER #2 — BOW WEAPON VALIDATION (archer_test)
    // ============================================================
    // MỤC ĐÍCH: nhân vật thử nghiệm khả năng mở rộng Combat Foundation sang vũ khí tầm xa
    // (projectile-based). KHÔNG redesign Combo System / Charged Attack trigger / Aim Mode hiện
    // có — chỉ THÊM DATA mới mà Engine đọc qua field `weaponType: 'bow'` để dispatch đúng
    // implementation (spawn arrow thay vì melee cone-hit — xem triggerAttack()/updateCombat()
    // trong combat.js/file 08, và Charged Attack Bow trong combat.js).
    //
    // talents.normalAttack.combo: 5-shot (ĐỦ 5, khác Traveler chỉ chạy 4/5 và test_character_anemo
    // chỉ có 4) — combo[i].arrows mô tả SỐ MŨI TÊN + timing spawn riêng của mỗi shot (field MỚI,
    // CHỈ Engine đọc khi weaponType === 'bow' — nhân vật melee không có field này, giữ nguyên hành
    // vi cone-hit cũ). Scaling multiplier là PLACEHOLDER (chưa balance — yêu cầu đã xác nhận
    // "KHÔNG chốt balance numbers trong task này").
    archer_test: {
        id: 'archer_test',
        name: 'Archer Test',
        // Elemental Skill Validation — element: 'Pyro' (yêu cầu mới: "Character #2 hiện đang định
        // hướng là Pyro"). CHỈ dùng làm DATA đi kèm Explosion event (spec mục 9: "Skill có thể cung
        // cấp element: 'pyro' hoặc cấu trúc tương đương") — KHÔNG có Element Aura/Reaction/Gauge nào
        // đọc/áp dụng field này (Element System hoàn chỉnh ngoài phạm vi, xem spec mục 9 + 17).
        element: 'Pyro',
        region: 'Mondstadt',
        rarity: null,
        // weaponType: 'bow' — CHÌA KHÓA dispatch của toàn bộ task này. Engine (combat.js/file 08)
        // kiểm tra field này để rẽ nhánh "Attack thường = spawn arrow" thay vì "Attack thường =
        // melee cone-hit", và "Charged Attack = Aim Mode + Release bắn tên" thay vì "Charged Attack
        // = animation multi-hit tại chỗ" của Character #1. Nhân vật không khai báo/weaponType khác
        // 'bow' tiếp tục đi ĐÚNG code path melee cũ — không đổi hành vi Character #1.
        weaponType: 'bow',
        gameplayType: null,

        // Phase 2 — Character Stats (Q&A đã chốt): baseStats CŨ { maxHp: 850, atk: 22, def: 48,
        // maxEnergy: 60 } là placeholder ngẫu nhiên từ lúc scaffold weaponType: 'bow' ban đầu (không
        // có cơ sở thiết kế, khác mọi nhân vật khác trong file này đều có comment giải thích số liệu)
        // — ĐÃ THAY bằng baseline có chủ đích, phản ánh gameplay role đã xác nhận: "Fragile ranged
        // carry" — mỏng máu rõ rệt (maxHp/def cùng thấp hơn Traveler, KHÔNG chỉ HP thấp mà DEF vẫn
        // cao — tránh mâu thuẫn identity), bù lại bằng ATK nhỉnh nhẹ (phần lớn sức mạnh đến từ Decoy
        // AoE + Passive Overwatch, không dồn vào ATK thuần), và maxEnergy thấp hơn Traveler (bù cho
        // Energy generation KHÔNG ĐỀU — chỉ tới từ Decoy Explosion hit-gated, khác Beam/Small Shot
        // đều đặn của Traveler). So với Traveler (Lv.1: 912/18/57/50): maxHp -32%, atk +11%, def -26%,
        // maxEnergy -16%. TOÀN BỘ SỐ LIỆU LÀ PLACEHOLDER — chưa balance final (đúng phạm vi Phase 2,
        // sẽ review lại ở Phase 5 dựa trên combat thực tế).
        baseStats: { maxHp: 620, atk: 20, def: 42, maxEnergy: 42 },

        // Elemental Skill Validation — skillId: 'archer_decoy_bomb' (SKILL_LIBRARY, file 11) — Skill
        // của Decoy Bomb.
        // Elemental Burst Validation — burstId: 'archer_pyro_burst' (SKILL_LIBRARY, file 11) — Burst
        // MỚI trong task này (Blazing Volley, AoE multi-hit phía trước Player).
        skillId: 'archer_decoy_bomb',
        burstId: 'archer_pyro_burst',

        talents: {
            // Elemental Burst Validation — talents.burst.scaling: dùng ĐÚNG category 'burst' đã có sẵn
            // trong getTalentScaling() (combat.js, dispatcher chung — không cần category mới, khác
            // với Decoy Explosion vì Burst không thuộc nhóm "skill.xxx"). Đây là multiplier CƠ SỞ
            // (Talent%) nhân với multiplier RIÊNG của từng hit trong SKILL_LIBRARY.hits[]/finalHit —
            // 2 lớp multiplier độc lập, ĐÚNG PATTERN Water Bubble (skillData.damage nhân vào
            // beamScaling.multiplier trước DEF, xem runBeamEffect()). PLACEHOLDER, chưa balance.
            burst: {
                scaling: { stat: 'ATK', multiplier: 1.0 }
            },
            // Elemental Skill Validation — talents.skill.decoyExplosion: scaling RIÊNG cho AoE damage
            // lúc Decoy nổ, đọc qua getTalentScaling(character, 'skillDecoyExplosion') (category MỚI,
            // xem combat.js) — TÁCH BIỆT khỏi talents.skill.beam/tick (schema cũ của Character #1,
            // dành cho Instant Beam/Small Shot Tick, ngữ nghĩa không khớp Explosion AoE 1 LẦN của
            // Decoy). PLACEHOLDER, CHƯA balance cuối cùng (spec mục 9 xác nhận).
            skill: {
                decoyExplosion: {
                    scaling: { stat: 'ATK', multiplier: 1.8 }
                }
            },
            normalAttack: {
                // combo: 5 shot theo ĐÚNG spec mục 1. `arrows` field MỚI — mảng mô tả từng mũi tên
                // trong shot đó: `spawnTime` (giây, TÍNH TỪ LÚC 'active' của SHOT ĐÓ bắt đầu — cùng
                // quy ước với hits[].time của Charged Attack, KHÔNG phải global timeline) +
                // `scaling`/`impact` RIÊNG (Shot #3 có 2 arrow, spec mục 2 yêu cầu "2 arrow dùng
                // CÙNG damage/scaling profile" — nên arrows[0]/arrows[1] của Shot #3 dùng scaling
                // giống hệt nhau, NHƯNG vẫn 2 entry riêng vì spawnTime khác nhau + là 2 hit source
                // độc lập, đúng spec mục 2 "Mỗi projectile là một hit source độc lập").
                //
                // `speed` (Normal Attack Arrow Speed — data-driven hóa): TRƯỚC ĐÂY tốc độ bay mũi tên
                // của Normal Attack bị hard-code = 24 THẲNG trong lời gọi spawnArrow() (combat.js,
                // applyBowArrowSpawnTick()), không đọc từ roster — khác với Charged Attack, nơi mỗi
                // Charge Level đã có arrowSpeed riêng (xem bowChargedAttack.levels[] bên dưới). Giờ
                // MỖI arrow tự khai báo speed RIÊNG (đơn vị/giây, cùng thang đo với arrowSpeed của
                // Charged Attack) — applyBowArrowSpawnTick() (combat.js) đọc arrowData.speed thay vì
                // hard-code, fallback về 24 nếu thiếu (an toàn ngược, KHÔNG bắt buộc mọi shot phải
                // khai báo). Shot #5 (finishing shot) đặt speed cao hơn 1 chút (28 thay vì 24) —
                // PLACEHOLDER thể hiện "đòn kết thúc mạnh hơn", KHÔNG phải giá trị balance cuối.
                combo: [
                    { // Shot #1 — 1 arrow, "kéo cung -> bắn -> recoil nhẹ"
                        timing: { windup: 0.14, active: 0.10, recovery: 0.16 },
                        arrows: [
                            { spawnTime: 0.02, scaling: { stat: 'ATK', multiplier: 0.45 }, impact: { type: 'light' }, speed: 24 }
                        ]
                    },
                    { // Shot #2 — 1 arrow, "xoay người -> bắn"
                        timing: { windup: 0.10, active: 0.10, recovery: 0.16 },
                        arrows: [
                            { spawnTime: 0.02, scaling: { stat: 'ATK', multiplier: 0.46 }, impact: { type: 'light' }, speed: 24 }
                        ]
                    },
                    { // Shot #3 — 2 arrow, spawn KHÔNG cùng thời điểm (spec mục 1), CÙNG scaling
                        // profile (spec mục 2: "Hai arrow sử dụng cùng damage/scaling profile").
                        timing: { windup: 0.12, active: 0.16, recovery: 0.18 },
                        arrows: [
                            { spawnTime: 0.03, scaling: { stat: 'ATK', multiplier: 0.30 }, impact: { type: 'light' }, speed: 24 },
                            { spawnTime: 0.11, scaling: { stat: 'ATK', multiplier: 0.30 }, impact: { type: 'light' }, speed: 24 }
                        ]
                    },
                    { // Shot #4 — 1 arrow, "lùi người -> bắn"
                        timing: { windup: 0.10, active: 0.10, recovery: 0.16 },
                        arrows: [
                            { spawnTime: 0.02, scaling: { stat: 'ATK', multiplier: 0.52 }, impact: { type: 'light' }, speed: 24 }
                        ]
                    },
                    { // Shot #5 — 1 arrow, đòn kết thúc — "kéo cung thật mạnh -> finishing shot"
                        timing: { windup: 0.20, active: 0.12, recovery: 0.24 },
                        arrows: [
                            { spawnTime: 0.03, scaling: { stat: 'ATK', multiplier: 0.75 }, impact: { type: 'heavy' }, speed: 28 }
                        ]
                    }
                ]
                // KHÔNG khai báo plunge/lowPlunge/highPlunge/chargedAttack ở đây — Plunge Attack của
                // Bow tiếp tục dùng ĐÚNG code path chung hiện có (fallback legacyScaling an toàn nếu
                // thiếu, xem getTalentScaling() combat.js — không thuộc phạm vi task này). Charged
                // Attack của Bow KHÔNG dùng schema animations[]/hits[] cũ (đó là cho charge-tại-chỗ
                // kiểu Sword) — xem `bowChargedAttack` riêng bên dưới, đọc bởi implementation Aim
                // Mode MỚI trong combat.js (dispatch theo weaponType, KHÔNG tái dùng
                // getChargedAttackHits()/applyChargedAttackAnimTick() của Character #1).
            },

            // bowChargedAttack: config RIÊNG cho Charged Attack kiểu Bow (Draw -> Aim -> Charge ->
            // Release), TÁCH KHỎI talents.normalAttack.chargedAttack (schema animations[]/hits[] đó
            // dành cho charge-tại-chỗ multi-hit của Sword, KHÔNG áp dụng được cho flow Aim Mode).
            // 3 Charge Level theo ĐÚNG spec mục 5 — element/elementIntensity CHỈ LÀ DATA CHUẨN BỊ
            // (spec mục 5 xác nhận "CHƯA implement Element Application/Aura/Reaction"), KHÔNG có
            // logic nào đọc/áp dụng elementIntensity trong task này.
            bowChargedAttack: {
                staminaCost: 0, // spec mục 10 — Bow Charged Attack KHÔNG tiêu Stamina
                levels: [
                    { // Level 0 — Physical, không Element
                        minChargeTime: 0,      // đạt Level 0 ngay khi bắt đầu Aim (giữ >= 0s)
                        scaling: { stat: 'ATK', multiplier: 0.9 },
                        impact: { type: 'light' },
                        arrowSpeed: 26,
                        element: null,
                        elementIntensity: 0
                    },
                    { // Level 1 — có Element, cường độ thấp
                        minChargeTime: 0.6,
                        scaling: { stat: 'ATK', multiplier: 1.4 },
                        impact: { type: 'heavy' },
                        arrowSpeed: 30,
                        element: 'characterElement', // placeholder — Engine sẽ đọc character.element
                        elementIntensity: 0.4
                    },
                    { // Level 2 — Full Charge, cường độ đầy đủ
                        minChargeTime: 1.4,
                        scaling: { stat: 'ATK', multiplier: 2.2 },
                        impact: { type: 'launch' },
                        arrowSpeed: 36,
                        element: 'characterElement',
                        elementIntensity: 1.0
                    }
                ]
            },

            // Elemental Skill Validation — decoyConfig: TOÀN BỘ số liệu Decoy Bomb tập trung Ở ĐÂY
            // (spec mục 1, 6, 7, 13: "Decoy HP/Lifetime/Attraction radius PHẢI configurable, PLACEHOLDER
            // chưa balance"). Đọc bởi deployDecoy()/updateDecoy() (combat.js/09-character-system.js).
            // Không đặt trong SKILL_LIBRARY (file 11, dữ liệu SKILL — Placement Mode/Aim config) để
            // tách biệt "cấu hình entity Decoy" (theo NHÂN VẬT, có thể khác nhau giữa các Decoy-user
            // tương lai — spec mục 13 "Decoy khác nhau, HP khác nhau...") khỏi "cấu hình cách kích
            // hoạt Skill" (theo SKILL — Placement Mode threshold, giống hydro_pressure_shot.aim).
            decoyConfig: {
                maxHp: 400,             // PLACEHOLDER — spec mục 6, chưa balance
                lifetime: 12,           // giây — PLACEHOLDER — spec mục 7, chưa balance
                attractionRadius: 10,   // m — bán kính Taunt (spec mục 3), PLACEHOLDER
                explosionRadius: 5,     // m — bán kính AoE lúc nổ (spec mục 8, 11), PLACEHOLDER
                explosionImpact: { type: 'launch' }, // spec mục 10: Explosion dùng Reaction Level 'launch'
                element: 'characterElement', // placeholder — Engine đọc character.element (đúng pattern bowChargedAttack.levels[].element)
                // Phase 5 — Balance (Q&A đã chốt): cooldown TỪ 12.0 -> 15.0. Lý do: cooldown (12s) và
                // lifetime (12s) trước đây BẰNG NHAU — Decoy cũ hết hạn đúng lúc cooldown xong, tạo
                // nhịp "liên tục 1 Decoy" nhưng KHÔNG có khoảng trống nào buộc Player phải cẩn trọng.
                // Đặt cooldown > lifetime tạo GAP có chủ đích (~3s, KHÔNG có Decoy nào tồn tại) — tăng
                // risk thật cho giai đoạn giữa 2 lần cast, đúng tinh thần "Decoy = công cụ tạo cửa sổ
                // chiến thuật, không phải khiên vĩnh viễn". VẪN LÀ PLACEHOLDER — số liệu cuối chờ
                // Integration Test (Phase 6) xác nhận gap 3s có "cảm thấy" hợp lý trong combat thực tế.
                cooldown: 15.0          // giây — dùng chung cơ chế skillCooldownTimer hiện có (giống hydro_pressure_shot.cooldown)
            },

            // Passive/Unique Mechanic — "Overwatch" (Phase 1, spec đã chốt qua Q&A): củng cố gameplay
            // loop "Decoy -> Player reposition -> Charged Shot" — đặt Decoy xong, phát Charged Attack
            // KẾ TIẾP được tính như đã giữ lâu hơn thực tế (chargeTimeBonus cộng ẢO vào thời gian so
            // sánh Charge Level, xem getCurrentBowChargeLevel() dispatch trong combat.js), nghĩa là VỪA
            // đạt Charge Level cao hơn NHANH hơn (giảm charge time cần thiết) VỪA tự động có
            // elementIntensity cao hơn (elementIntensity đi kèm sẵn theo từng Level trong
            // bowChargedAttack.levels[] ở trên) — ĐÚNG 1 con số, KHÔNG cần field elementIntensity bonus
            // riêng, tận dụng đúng cơ chế minChargeTime/level lookup đã có, không thêm khái niệm mới.
            //
            // Data-driven: chỉ nhân vật nào có talents.passive.overwatch mới có hiệu ứng này — Engine
            // (deployDecoy()/triggerBowChargedAttack()/getCurrentBowChargeLevel()) PHẢI kiểm tra field
            // này tồn tại trước khi áp dụng, KHÔNG hard-code theo tên/id nhân vật.
            passive: {
                overwatch: {
                    duration: 4.0,        // giây — PLACEHOLDER, chưa balance. Cửa sổ hiệu lực TỪ LÚC
                                           // deploy Decoy tới khi Player bắt đầu giữ nút Charged Attack
                                           // kế tiếp (hoặc hết giây này mà chưa charge thì mất, không
                                           // tồn đọng). Decoy mới trong lúc cửa sổ còn hiệu lực -> REFRESH
                                           // về đúng giá trị này (không cộng dồn — đã chốt qua Q&A).
                    // Phase 5 — Balance (Q&A đã chốt): chargeTimeBonus TỪ 1.4 -> 0.9. Lý do: 1.4s =
                    // ĐÚNG BẰNG minChargeTime của Level 2/Full Charge (1.4s, xem bowChargedAttack.
                    // levels[] ở trên) — nghĩa là Passive cũ cho phép Full Charge TỨC THỜI ngay khi vừa
                    // bắt đầu giữ nút (0s giữ thật + 1.4s bonus = 1.4s effective = đủ ngưỡng Level 2),
                    // hiệu quả như "không cần giữ nút" — quá mạnh cho 1 Passive. 0.9s vẫn "rút ngắn
                    // đáng kể" (Player chỉ cần giữ thêm ĐÚNG 1.4 - 0.9 = 0.5s thật là đạt Full Charge,
                    // thay vì phải giữ đủ 1.4s) nhưng KHÔNG còn auto Full Charge ngay lập tức — vẫn cần
                    // 1 khoảng giữ nút tối thiểu, giữ đúng tinh thần "phần thưởng phối hợp" chứ không
                    // phải "miễn phí bỏ qua cơ chế Charge". VẪN LÀ PLACEHOLDER.
                    chargeTimeBonus: 0.9  // giây — PLACEHOLDER, chưa balance. Cộng ẢO vào thời gian đã
                                           // giữ nút lúc tra Charge Level (KHÔNG sửa player.bowAimChargeTimer
                                           // thật) — TIÊU THỤ 1 LẦN DUY NHẤT ngay tại thời điểm BẮT ĐẦU
                                           // giữ nút Charged Attack (triggerBowChargedAttack()), dù sau
                                           // đó Player thả sớm/hủy không bắn thì Passive vẫn đã mất (đã
                                           // chốt qua Q&A) — áp dụng cho TOÀN BỘ phiên charge đó (từ lúc
                                           // bắt đầu tới lúc release), không phải chỉ 1 lần đọc.
                }
            }
        },

        // visualConfig: theo ĐÚNG schema Core/Hand/Hand + weaponGrip đã có — Bow chỉ là 1 mesh khác
        // gắn vào rightHand qua weaponGrip, KHÔNG cần field mới nào ở buildCharacterMesh().
        visualConfig: {
            coreColor: 0xb45309,
            handColor: 0xb45309,
            coreRadius: 0.58,
            handRadius: 0.24,
            floatingHeight: 0,
            corePosition: { x: 0, y: 0.68, z: 0 },
            leftHandPosition: { x: 1.2, y: 0.2, z: -0.05 },
            rightHandPosition: { x: -1.3, y: 0.15, z: -0.3 },
            rightHandBaseRotation: { x: 0.1, y: -0.2, z: 0.05 },
            // weaponGrip: transform của mesh Bow so với rightHand — dùng ĐÚNG field/cơ chế hiện có
            // (getWeaponGripRotation() trong combat.js), KHÔNG cần đổi buildCharacterMesh().
            weaponGrip: {
                position: { x: 0, y: -0.1, z: -0.15 },
                rotation: { x: Math.PI / 2, y: 0, z: 0 }
            },
            climbGripRotation: { x: -Math.PI / 2, y: 0, z: Math.PI / 10 },
            // comboWindow: PLACEHOLDER — điểm khởi đầu hợp lý dựa theo recovery ngắn nhất (0.16s),
            // cần tinh chỉnh cảm giác thật trên JoiPlay (không phải số liệu cuối).
            comboWindow: 0.28,
            // animation.attack: 5 entry khớp 1-1 với talents.normalAttack.combo[] ở trên (Engine
            // đọc timing từ combo[i].timing — xem getCurrentAttackTiming() trong combat.js, ĐÃ hỗ
            // trợ sẵn animation.attack[i].timing lẫn combo[i] riêng biệt; ở đây dùng timing khai báo
            // ngay trong combo[] để 1 nguồn duy nhất, animation.attack[i] không lặp lại timing).
            // rightHand offset là POSE RÚT CUNG đơn giản, PLACEHOLDER — không phải polish hình ảnh
            // cuối cùng (ngoài phạm vi task "combat architecture", chỉ cần đủ để test).
            animation: {
                attack: [{
                    sword: { windupRotation: { x: 0, y: 0, z: 0 }, activeRotationEnd: { x: 0, y: 0, z: 0 } },
                    windup: { rightHandOffset: { x: 0.1, y: 0.05, z: 0.15 }, rightHandRotOffset: { x: -0.2, y: 0, z: 0 }, coreOffset: { x: 0, y: 0, z: -0.05 } },
                    active: {
                        rightHandOffsetStart: { x: 0.1, y: 0.05, z: 0.15 }, rightHandOffsetEnd: { x: -0.15, y: 0, z: 0.05 },
                        rightHandRotOffsetStart: { x: -0.2, y: 0, z: 0 }, rightHandRotOffsetEnd: { x: 0, y: 0, z: 0 },
                        coreOffsetStart: { x: 0, y: 0, z: -0.05 }, coreOffsetEnd: { x: 0, y: 0, z: 0 }
                    },
                    recovery: { rightHandOffsetStart: { x: -0.15, y: 0, z: 0.05 }, rightHandRotOffsetStart: { x: 0, y: 0, z: 0 }, coreOffsetStart: { x: 0, y: 0, z: 0 } }
                }, {
                    sword: { windupRotation: { x: 0, y: 0, z: 0 }, activeRotationEnd: { x: 0, y: 0, z: 0 } },
                    windup: { rightHandOffset: { x: -0.15, y: 0.1, z: 0.05 }, rightHandRotOffset: { x: 0, y: 0.4, z: 0 }, coreOffset: { x: 0, y: 0, z: 0 } },
                    active: {
                        rightHandOffsetStart: { x: -0.15, y: 0.1, z: 0.05 }, rightHandOffsetEnd: { x: -0.15, y: 0, z: 0.05 },
                        rightHandRotOffsetStart: { x: 0, y: 0.4, z: 0 }, rightHandRotOffsetEnd: { x: 0, y: 0, z: 0 },
                        coreOffsetStart: { x: 0, y: 0, z: 0 }, coreOffsetEnd: { x: 0, y: 0, z: 0 }
                    },
                    recovery: { rightHandOffsetStart: { x: -0.15, y: 0, z: 0.05 }, rightHandRotOffsetStart: { x: 0, y: 0, z: 0 }, coreOffsetStart: { x: 0, y: 0, z: 0 } }
                }, {
                    // Shot #3 — "kéo cung sang bên" — windup lệch X rõ hơn (kéo sang bên).
                    sword: { windupRotation: { x: 0, y: 0, z: 0 }, activeRotationEnd: { x: 0, y: 0, z: 0 } },
                    windup: { rightHandOffset: { x: -0.25, y: 0.08, z: 0.1 }, rightHandRotOffset: { x: 0, y: 0.2, z: 0.1 }, coreOffset: { x: -0.05, y: 0, z: 0 } },
                    active: {
                        rightHandOffsetStart: { x: -0.25, y: 0.08, z: 0.1 }, rightHandOffsetEnd: { x: -0.15, y: 0, z: 0.05 },
                        rightHandRotOffsetStart: { x: 0, y: 0.2, z: 0.1 }, rightHandRotOffsetEnd: { x: 0, y: 0, z: 0 },
                        coreOffsetStart: { x: -0.05, y: 0, z: 0 }, coreOffsetEnd: { x: 0, y: 0, z: 0 }
                    },
                    recovery: { rightHandOffsetStart: { x: -0.15, y: 0, z: 0.05 }, rightHandRotOffsetStart: { x: 0, y: 0, z: 0 }, coreOffsetStart: { x: 0, y: 0, z: 0 } }
                }, {
                    // Shot #4 — "lùi người -> bắn": windup lùi Z dương nhẹ.
                    sword: { windupRotation: { x: 0, y: 0, z: 0 }, activeRotationEnd: { x: 0, y: 0, z: 0 } },
                    windup: { rightHandOffset: { x: -0.1, y: 0.05, z: 0.25 }, rightHandRotOffset: { x: -0.1, y: 0, z: 0 }, coreOffset: { x: 0, y: 0, z: 0.1 } },
                    active: {
                        rightHandOffsetStart: { x: -0.1, y: 0.05, z: 0.25 }, rightHandOffsetEnd: { x: -0.15, y: 0, z: 0.05 },
                        rightHandRotOffsetStart: { x: -0.1, y: 0, z: 0 }, rightHandRotOffsetEnd: { x: 0, y: 0, z: 0 },
                        coreOffsetStart: { x: 0, y: 0, z: 0.1 }, coreOffsetEnd: { x: 0, y: 0, z: 0 }
                    },
                    recovery: { rightHandOffsetStart: { x: -0.15, y: 0, z: 0.05 }, rightHandRotOffsetStart: { x: 0, y: 0, z: 0 }, coreOffsetStart: { x: 0, y: 0, z: 0 } }
                }, {
                    // Shot #5 — finishing shot: windup kéo mạnh (biên độ lớn hơn hẳn 4 shot trước).
                    sword: { windupRotation: { x: 0, y: 0, z: 0 }, activeRotationEnd: { x: 0, y: 0, z: 0 } },
                    windup: { rightHandOffset: { x: -0.35, y: 0.12, z: 0.3 }, rightHandRotOffset: { x: -0.25, y: 0.3, z: 0.15 }, coreOffset: { x: -0.05, y: 0, z: 0.1 } },
                    active: {
                        rightHandOffsetStart: { x: -0.35, y: 0.12, z: 0.3 }, rightHandOffsetEnd: { x: 0, y: 0, z: 0 },
                        rightHandRotOffsetStart: { x: -0.25, y: 0.3, z: 0.15 }, rightHandRotOffsetEnd: { x: 0, y: 0, z: 0 },
                        coreOffsetStart: { x: -0.05, y: 0, z: 0.1 }, coreOffsetEnd: { x: 0, y: 0, z: 0 }
                    },
                    // Recovery #5 (đòn cuối) — xoay vòng về windup #1 (getNextAttackAnim() modulo,
                    // giữ nguyên cơ chế cũ, không cần khớp tuyệt đối — GIỐNG cách Traveler/Character#2
                    // Sword cũng có điểm "gãy" nhẹ tại vòng lặp cuối -> đầu).
                    recovery: { rightHandOffsetStart: { x: 0, y: 0, z: 0 }, rightHandRotOffsetStart: { x: 0, y: 0, z: 0 }, coreOffsetStart: { x: 0, y: 0, z: 0 } }
                }]
            }
        },
        animationConfig: {}
    },

    // ============================================================
    // CHARACTER #3 — POLEARM + ELECTRO "THUNDER WARRIOR" (polearm_test)
    // ============================================================
    // Character #3 Full Implementation Integration — viết lại HOÀN TOÀN thay thế data Weapon
    // Baseline cũ (generic thrust/sweep, chưa phản ánh combat fantasy thật). Bản này phản ánh đầy đủ
    // 12 phase thiết kế đã chốt: Lightning Spear + Thunder Warrior, Fast+Heavy, on-field DPS, Elemental
    // Skill reactive off-field (HP polling, KHÔNG phải static field), Extra Resource Thunder Charge
    // (0-3, chỉ tồn tại trong Burst State), Elemental Burst với Burst State riêng biệt hoàn toàn khỏi
    // combat thường, Passive Thunder Warrior's Resolve. TOÀN BỘ multiplier là PLACEHOLDER (đã qua
    // Phase 11 Balance nhưng vẫn chưa final — chờ balance thật khi có engine chạy).
    polearm_test: {
        id: 'polearm_test',
        name: 'Polearm Test',
        element: 'Electro',
        region: 'Inazuma',
        rarity: null,

        // Weapon Schema v2 — GIỮ NGUYÊN từ Weapon Baseline (không đổi ở lần implement này, đã đúng).
        weapon: {
            category: 'melee',
            type: 'polearm',
            visualProfile: 'polearm_baseline',
            attackProfile: {
                normalAttack: 'thunder_spear_combo',
                chargedAttack: 'spinning_thrust',
                plunge: 'standard'
            }
        },
        gameplayType: null,

        // Phase 8 — Character Stats (đã chốt qua Q&A): giữa Traveler (912/57) và archer_test
        // (620/42) về maxHp/def — "không quá bền nhưng cũng không fragile, Fast+Heavy nghĩa là di
        // chuyển/né nhiều hơn chịu đòn thuần". ATK nhỉnh nhẹ Traveler (sức mạnh chính đến từ Thunder
        // Charge/Finisher + Coordinated Attack, không dồn ATK thuần). maxEnergy tương đương Traveler
        // (Phase 10 xác nhận Coordinated Attack đã đủ nhịp, không cần tăng threshold).
        baseStats: { maxHp: 766, atk: 19, def: 50, maxEnergy: 50 },

        // Elemental Skill Validation — trỏ SKILL_LIBRARY (file 11) — Reactive Off-field Electro
        // Effect (KHÔNG PHẢI static ground field, xem SKILL_LIBRARY.polearm_electro_reactive).
        skillId: 'polearm_electro_reactive',
        burstId: 'polearm_thunder_burst',

        talents: {
            normalAttack: {
                // combo: 5-hit Fast+Heavy (Phase 2 đã chốt qua Q&A) — NA1-4 gần bằng nhau (KHÔNG leo
                // thang tuyến tính như Traveler), NA5 nhảy vọt rõ rệt (~1.9x NA1, "chậm hơn hẳn, đúng
                // vai trò finisher"). NA3 = Twin Thunder Thrust, 2 hit CÙNG 1 lunge duy nhất (spec đã
                // xác nhận rõ "ONE shared lunge movement, not one lunge per thrust"). timing ĐẶT ĐÚNG
                // Ở visualConfig.animation.attack[i].timing (Phase 9 phát hiện lỗi vị trí — bản Weapon
                // Baseline cũ đặt SAI ở đây, đã sửa) — combo[] ở đây CHỈ chứa hits[] (damage/impact),
                // KHÔNG có field timing nào (tránh tái phạm lỗi cũ).
                combo: [
                    { // NA1 — Lightning Jab: đâm thẳng ngắn, gọn, windup gần như không có.
                        hits: [
                            { time: 0, scaling: { stat: 'ATK', multiplier: 0.50 }, impact: { type: 'light' } }
                        ]
                    },
                    { // NA2 — Lightning Jab liên hoàn: lặp nhịp NA1, góc đâm lệch nhẹ.
                        hits: [
                            { time: 0, scaling: { stat: 'ATK', multiplier: 0.52 }, impact: { type: 'light' } }
                        ]
                    },
                    { // NA3 — Twin Thunder Thrust: 2 mũi đâm liên hoàn CÙNG 1 lunge (spec đã xác nhận
                      // rõ ràng — lunge chỉ xảy ra 1 lần ở đầu, KHÔNG lunge riêng cho từng hit; cơ chế
                      // lunge nằm ở Attack Lunge chung của Engine, đọc theo comboIndex chứ không theo
                      // hitIndex, nên tự nhiên đã đúng — không cần code gì đặc biệt cho việc "share
                      // lunge" này).
                        hits: [
                            { time: 0.06, scaling: { stat: 'ATK', multiplier: 0.28 }, impact: { type: 'light' } },
                            { time: 0.20, scaling: { stat: 'ATK', multiplier: 0.30 }, impact: { type: 'heavy' } }
                        ]
                    },
                    { // NA4 — Reverse Thrust: đổi hướng ngắn, chuẩn bị chuyển tư thế cho NA5.
                        hits: [
                            { time: 0, scaling: { stat: 'ATK', multiplier: 0.54 }, impact: { type: 'light' } }
                        ]
                    },
                    { // NA5 — Thunderfall Strike (Finisher thường, KHÔNG Launch — Launch dành riêng
                      // Thunder Finisher trong Burst State, đã chốt "escalation Fast → Heavy → Burst →
                      // LAUNCH"). Windup dài, chậm hơn hẳn NA1-4 — movement giảm 20-30% trong lúc
                      // windup (đã chốt qua Q&A, xem ghi chú "movement scaling" dưới visualConfig).
                        hits: [
                            { time: 0.10, scaling: { stat: 'ATK', multiplier: 0.95 }, impact: { type: 'heavy' } }
                        ]
                    }
                ],

                // chargedAttack: Spinning Thrust — object ĐƠN (KHÔNG PHẢI mảng combo[], giữ nguyên
                // schema Charged Attack chung của Engine: {staminaCost placeholder ở visualConfig,
                // hits[], animations{windup/active/recovery}}). hitShape:'circle' — AoE 360° THẬT,
                // độc lập hướng nhìn (architecture change đã implement ở resolveMeleeHitCollision()).
                // 1 hit event duy nhất (xoay 360° + đâm kết gộp thành 1 damage event, KHÔNG multi-hit
                // — đã chốt ở Phase 3 thiết kế).
                chargedAttack: {
                    hits: [
                        {
                            time: 0.20,
                            scaling: { stat: 'ATK', multiplier: 1.4 },
                            impact: { type: 'heavy' },
                            hitShape: 'circle',
                            hitRadius: 2.5
                        }
                    ],
                    animations: {
                        windup: [],
                        active: [{
                            duration: 0.32,
                            rightHandOffsetStart: { x: 0, y: 0.1, z: -0.15 }, rightHandOffsetEnd: { x: 0, y: 0.1, z: -0.15 },
                            rightHandRotOffsetStart: { x: 0, y: -Math.PI, z: 0 }, rightHandRotOffsetEnd: { x: 0, y: Math.PI, z: 0 },
                            coreOffsetStart: { x: 0, y: 0, z: 0 }, coreOffsetEnd: { x: 0, y: 0, z: 0 }
                        }],
                        recovery: []
                    }
                },

                plunge: { scaling: { stat: 'ATK', multiplier: 1.4 }, impact: { type: 'heavy' } },
                lowPlunge: { scaling: { stat: 'ATK', multiplier: 1.0 }, impact: { type: 'light' } },
                highPlunge: { scaling: { stat: 'ATK', multiplier: 2.0 }, impact: { type: 'launch' } }
            },

            // burstState: schema RIÊNG HOÀN TOÀN khỏi normalAttack ở trên (Q&A đã chốt chính thức —
            // "schema mới hoàn toàn, KHÔNG override từng field lẻ", duplication data CHẤP NHẬN ĐƯỢC).
            // Dispatch: khi player.isBurstStateActive === true, NA/CA đọc field này THAY VÌ
            // talents.normalAttack ở trên (xem updateCombat()/triggerAttack() dispatch, file 08/combat.js).
            burstState: {
                // normalAttack.combo — Burst State NA MẠNH HƠN NA thường ~25% (Phase 9 đã tính:
                // trung bình burst NA ~0.65 so NA thường trung bình ~0.52). Giữ CÙNG 5-hit structure
                // (Fast+Heavy vẫn là identity xuyên suốt, Burst State không đổi NHỊP, chỉ đổi SỨC
                // MẠNH + hiệu ứng Electro rõ rệt hơn — mô tả qua impact/scaling, KHÔNG cần field
                // "element" riêng vì Character đã là Electro thuần).
                normalAttack: {
                    combo: [
                        { hits: [{ time: 0, scaling: { stat: 'ATK', multiplier: 0.62 }, impact: { type: 'light' } }] },
                        { hits: [{ time: 0, scaling: { stat: 'ATK', multiplier: 0.64 }, impact: { type: 'light' } }] },
                        { hits: [
                            { time: 0.05, scaling: { stat: 'ATK', multiplier: 0.35 }, impact: { type: 'light' } },
                            { time: 0.18, scaling: { stat: 'ATK', multiplier: 0.38 }, impact: { type: 'heavy' } }
                        ] },
                        { hits: [{ time: 0, scaling: { stat: 'ATK', multiplier: 0.66 }, impact: { type: 'light' } }] },
                        { hits: [{ time: 0.10, scaling: { stat: 'ATK', multiplier: 1.05 }, impact: { type: 'heavy' } }] }
                    ]
                },
                // chargedAttack — GIỮ NGUYÊN object-based schema (KHÔNG chuyển combo[], Q&A đã chốt
                // rõ ràng "phải preserve cùng schema với CA gốc"). Burst State CA mạnh hơn CA thường
                // ~29% (Phase 9: 1.8 so 1.4), vẫn hitShape:circle (Spinning Thrust vẫn AoE 360° trong
                // Burst State, không đổi shape).
                chargedAttack: {
                    hits: [
                        {
                            time: 0.18,
                            scaling: { stat: 'ATK', multiplier: 1.8 },
                            impact: { type: 'heavy' },
                            hitShape: 'circle',
                            hitRadius: 2.8
                        }
                    ],
                    animations: {
                        windup: [],
                        active: [{
                            duration: 0.30,
                            rightHandOffsetStart: { x: 0, y: 0.1, z: -0.15 }, rightHandOffsetEnd: { x: 0, y: 0.1, z: -0.15 },
                            rightHandRotOffsetStart: { x: 0, y: -Math.PI, z: 0 }, rightHandRotOffsetEnd: { x: 0, y: Math.PI, z: 0 },
                            coreOffsetStart: { x: 0, y: 0, z: 0 }, coreOffsetEnd: { x: 0, y: 0, z: 0 }
                        }],
                        recovery: []
                    }
                }
            },

            // reactiveConfig — Elemental Skill Validation (Character #3): số liệu THẬT của Reactive
            // Effect, ĐÚNG PATTERN decoyConfig (Character #2) — snapshot lúc cast
            // (character.talents.reactiveConfig), dispatch qua SKILL_LIBRARY.polearm_electro_reactive
            // .cooldown = null (giống archer_decoy_bomb.cooldown = null -> đọc THẬT ở đây).
            reactiveConfig: {
                lifetime: 10,           // giây — PLACEHOLDER, Phase 4/6 đã chốt "Lifetime cố định,
                                        // KHÔNG phụ thuộc Player quay lại sân hay không"
                perEnemyCooldown: 2.0,  // giây — PLACEHOLDER, Phase 10/11 giữ nguyên KHÔNG chỉnh
                                        // arbitrarily (Task Implementation đã yêu cầu rõ)
                cooldown: 10.0          // giây — cooldown SKILL (dùng skillCooldownTimer hiện có,
                                        // KHÔNG ràng buộc với lifetime — Phase 6 đã chốt bỏ nguyên
                                        // tắc "cooldown < lifetime" cũ của Decoy). PLACEHOLDER.
            },

            // burstActivation — đòn mở màn Burst (Phase 6/9 đã chốt): Small AoE Circle quanh thân,
            // Impact HEAVY (Q&A cuối cùng đã chốt — KHÔNG Launch, Launch dành riêng Finisher). KHÔNG
            // tạo Thunder Charge (đã chốt rõ). Dùng bởi executeCharacterBurst()/state machine Burst
            // Activation MỚI (burstActivationWindup/Active — xem SKILL_LIBRARY.polearm_thunder_burst).
            burstActivation: {
                scaling: { stat: 'ATK', multiplier: 0.6 },
                impact: { type: 'heavy' },
                hitShape: 'circle',
                hitRadius: 3.0
            },

            // thunderFinisher — climax của Thunder Charge (Phase 5/6/9 đã chốt): Launch (KHÔNG
            // heavy+launch cùng lúc — Launch LÀ impact level, không phải cộng thêm). KHÔNG tạo Thunder
            // Charge (tránh loop). Dùng chung pipeline collision/damage hiện có (category riêng
            // 'thunderFinisher' trong getTalentScaling()/getTalentImpact() — xem combat.js).
            thunderFinisher: {
                scaling: { stat: 'ATK', multiplier: 2.2 },
                impact: { type: 'launch' }
            },

            // coordinatedAttack — Reactive Skill proc damage (Phase 4/11 đã chốt): multiplier TĂNG
            // từ 0.15 (Phase 4 gốc) lên 0.5 (Phase 11 Balance — đóng góp DPS solo quá thấp ~5%, tăng
            // lên ~15% để Reactive Skill "cảm nhận được" ngay cả khi đánh 1 enemy). category riêng
            // 'coordinatedAttack' trong getTalentScaling()/getTalentImpact().
            coordinatedAttack: {
                scaling: { stat: 'ATK', multiplier: 0.5 },
                impact: { type: 'light' }
            },

            // passive.thunderWarriorsResolve — Phase 7 đã chốt: cờ THUẦN TÚY (không tham số số học —
            // hành vi refresh là nhị phân, không cần balance). Khi Thunder Finisher hit ít nhất 1
            // enemy -> refresh TOÀN BỘ activeElectroEffects[] thuộc chính Character #3 về full
            // duration (KHÔNG tái tạo effect đã hết hạn, KHÔNG reset skillCooldownTimer).
            passive: {
                thunderWarriorsResolve: {}
            }
        },

        // visualConfig: ĐÚNG SCHEMA Core/Hand/Hand + weaponGrip (giữ nguyên từ Weapon Baseline —
        // visual mesh/grip KHÔNG đổi ở lần implement này).
        visualConfig: {
            coreColor: 0x7c3aed,
            handColor: 0x7c3aed,
            coreRadius: 0.6,
            handRadius: 0.24,
            floatingHeight: 0,
            corePosition: { x: 0, y: 0.7, z: 0 },
            leftHandPosition: { x: 1.2, y: 0.2, z: -0.05 },
            rightHandPosition: { x: -0.9, y: 0.1, z: 0.1 },
            rightHandBaseRotation: { x: 0, y: 0, z: 0 },
            weaponGrip: {
                position: { x: 0, y: -0.05, z: 0.1 },
                rotation: { x: -Math.PI / 2.3, y: 0, z: 0 }
            },
            climbGripRotation: { x: -Math.PI / 2, y: 0, z: Math.PI / 10 },
            comboWindow: 0.28,

            // chargedAttack — Phase 9 phát hiện lỗi vị trí: chargeTime/staminaCost PHẢI ở đây
            // (visualConfig.chargedAttack), KHÔNG phải trong talents.normalAttack.chargedAttack (đã
            // sửa — bản Weapon Baseline cũ đặt SAI, gây getChargedAttackConfig() không đọc được).
            // chargeTime RẤT NGẮN (Phase 3 đã chốt qua Q&A — "fast", gần như tức thì).
            chargedAttack: {
                chargeTime: 0.18,
                staminaCost: 20
            },

            // animation.attack: 5 entry khớp 1-1 talents.normalAttack.combo[]. MỖI entry mang field
            // `timing` (Phase 9 đã sửa vị trí — ĐÚNG CHỖ getCurrentAttackTiming() đọc, xem combat.js)
            // và `polearm` (windupRotation/activeRotationEnd — đọc bởi attackAnim[weaponCat] dispatch
            // đã implement ở Weapon Baseline). NA1-4 timing NGẮN (Fast), NA5 timing DÀI hẳn (Heavy
            // finisher, "chậm hơn hẳn 4 đòn trước" đã chốt Phase 2).
            animation: {
                attack: [{
                    // NA1 — Lightning Jab
                    timing: { windup: 0.10, active: 0.12, recovery: 0.14 },
                    polearm: { windupRotation: { x: 0.3, y: 0, z: 0 }, activeRotationEnd: { x: -0.4, y: 0, z: 0 } },
                    windup: { rightHandOffset: { x: 0, y: 0.05, z: -0.15 }, rightHandRotOffset: { x: -0.15, y: 0, z: 0 }, coreOffset: { x: 0, y: 0, z: -0.05 } },
                    active: {
                        rightHandOffsetStart: { x: 0, y: 0.05, z: -0.15 }, rightHandOffsetEnd: { x: 0, y: 0, z: 0.3 },
                        rightHandRotOffsetStart: { x: -0.15, y: 0, z: 0 }, rightHandRotOffsetEnd: { x: 0.1, y: 0, z: 0 },
                        coreOffsetStart: { x: 0, y: 0, z: -0.05 }, coreOffsetEnd: { x: 0, y: 0, z: 0.1 }
                    },
                    recovery: { rightHandOffsetStart: { x: 0, y: 0, z: 0.3 }, rightHandRotOffsetStart: { x: 0.1, y: 0, z: 0 }, coreOffsetStart: { x: 0, y: 0, z: 0.1 } }
                }, {
                    // NA2 — Lightning Jab liên hoàn
                    timing: { windup: 0.08, active: 0.10, recovery: 0.13 },
                    polearm: { windupRotation: { x: 0.2, y: 0.1, z: 0 }, activeRotationEnd: { x: -0.35, y: -0.1, z: 0 } },
                    windup: { rightHandOffset: { x: 0.05, y: 0.05, z: -0.1 }, rightHandRotOffset: { x: -0.1, y: 0.1, z: 0 }, coreOffset: { x: 0, y: 0, z: 0 } },
                    active: {
                        rightHandOffsetStart: { x: 0.05, y: 0.05, z: -0.1 }, rightHandOffsetEnd: { x: -0.05, y: 0, z: 0.25 },
                        rightHandRotOffsetStart: { x: -0.1, y: 0.1, z: 0 }, rightHandRotOffsetEnd: { x: 0.1, y: -0.1, z: 0 },
                        coreOffsetStart: { x: 0, y: 0, z: 0 }, coreOffsetEnd: { x: 0, y: 0, z: 0.08 }
                    },
                    recovery: { rightHandOffsetStart: { x: -0.05, y: 0, z: 0.25 }, rightHandRotOffsetStart: { x: 0.1, y: -0.1, z: 0 }, coreOffsetStart: { x: 0, y: 0, z: 0.08 } }
                }, {
                    // NA3 — Twin Thunder Thrust (active DÀI hơn NA1/2 để chứa đủ 2 nhịp đâm, timing
                    // khớp hits[].time đã khai báo ở talents: 0.06/0.20, active=0.28 đủ chứa cả 2).
                    timing: { windup: 0.10, active: 0.28, recovery: 0.15 },
                    polearm: { windupRotation: { x: 0.15, y: 0, z: 0 }, activeRotationEnd: { x: -0.3, y: 0, z: 0 } },
                    windup: { rightHandOffset: { x: -0.1, y: 0.06, z: -0.1 }, rightHandRotOffset: { x: -0.1, y: 0, z: 0 }, coreOffset: { x: 0, y: 0, z: -0.05 } },
                    active: {
                        rightHandOffsetStart: { x: -0.1, y: 0.06, z: -0.1 }, rightHandOffsetEnd: { x: 0, y: 0, z: 0.32 },
                        rightHandRotOffsetStart: { x: -0.1, y: 0, z: 0 }, rightHandRotOffsetEnd: { x: 0.12, y: 0, z: 0 },
                        coreOffsetStart: { x: 0, y: 0, z: -0.05 }, coreOffsetEnd: { x: 0, y: 0, z: 0.12 }
                    },
                    recovery: { rightHandOffsetStart: { x: 0, y: 0, z: 0.32 }, rightHandRotOffsetStart: { x: 0.12, y: 0, z: 0 }, coreOffsetStart: { x: 0, y: 0, z: 0.12 } }
                }, {
                    // NA4 — Reverse Thrust
                    timing: { windup: 0.09, active: 0.11, recovery: 0.14 },
                    polearm: { windupRotation: { x: -0.1, y: 0.15, z: 0 }, activeRotationEnd: { x: -0.32, y: -0.05, z: 0 } },
                    windup: { rightHandOffset: { x: -0.1, y: 0.06, z: 0.15 }, rightHandRotOffset: { x: -0.1, y: 0, z: 0 }, coreOffset: { x: 0, y: 0, z: 0.08 } },
                    active: {
                        rightHandOffsetStart: { x: -0.1, y: 0.06, z: 0.15 }, rightHandOffsetEnd: { x: 0, y: 0, z: 0.3 },
                        rightHandRotOffsetStart: { x: -0.1, y: 0, z: 0 }, rightHandRotOffsetEnd: { x: 0.1, y: 0, z: 0 },
                        coreOffsetStart: { x: 0, y: 0, z: 0.08 }, coreOffsetEnd: { x: 0, y: 0, z: 0.12 }
                    },
                    recovery: { rightHandOffsetStart: { x: 0, y: 0, z: 0.3 }, rightHandRotOffsetStart: { x: 0.1, y: 0, z: 0 }, coreOffsetStart: { x: 0, y: 0, z: 0.12 } }
                }, {
                    // NA5 — Thunderfall Strike: windup/active DÀI HẲN (Phase 2 đã chốt "chậm hơn hẳn
                    // 4 đòn trước") — ratio windup+active ~0.4s so với ~0.2s của NA1-4, đúng ~2x.
                    // movementMultiplier: 0.25 (giữa 20-30% đã chốt) — field MỚI đọc bởi input
                    // movement handler trong lúc windup (xem file 08, dòng tính targetSpeed hiện có
                    // dùng hệ số cố định 0.35 cho MỌI attackState — cần đọc field này CHỈ khi đang ở
                    // NA5 windup của Character #3, fallback về hệ số cũ 0.35 cho mọi trường hợp khác
                    // — xem implementation trong file 08).
                    timing: { windup: 0.22, active: 0.20, recovery: 0.24 },
                    movementMultiplier: 0.25,
                    polearm: { windupRotation: { x: 0.1, y: -0.5, z: 0.15 }, activeRotationEnd: { x: -0.25, y: 0.5, z: -0.15 } },
                    windup: { rightHandOffset: { x: -0.3, y: 0.1, z: 0.2 }, rightHandRotOffset: { x: -0.2, y: -0.3, z: 0.15 }, coreOffset: { x: -0.05, y: 0, z: 0.1 } },
                    active: {
                        rightHandOffsetStart: { x: -0.3, y: 0.1, z: 0.2 }, rightHandOffsetEnd: { x: 0.3, y: 0.05, z: 0 },
                        rightHandRotOffsetStart: { x: -0.2, y: -0.3, z: 0.15 }, rightHandRotOffsetEnd: { x: 0.1, y: 0.4, z: -0.15 },
                        coreOffsetStart: { x: -0.05, y: 0, z: 0.1 }, coreOffsetEnd: { x: 0.05, y: 0, z: 0 }
                    },
                    recovery: { rightHandOffsetStart: { x: 0.3, y: 0.05, z: 0 }, rightHandRotOffsetStart: { x: 0.1, y: 0.4, z: -0.15 }, coreOffsetStart: { x: 0.05, y: 0, z: 0 } }
                }]
            }
        },
        animationConfig: {}
    },


};

window.CHARACTER_ROSTER = CHARACTER_ROSTER;

