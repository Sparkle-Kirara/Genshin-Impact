            function intersectAABB(a, b) {
                return (a.minX <= b.maxX && a.maxX >= b.minX) &&
                       (a.minY <= b.maxY && a.maxY >= b.minY) &&
                       (a.minZ <= b.maxZ && a.maxZ >= b.minZ);
            }

            function detectClimbableWall() {
                let detectedNormal = null;
                let minDistance = 0.25;

                const pAABB = getPlayerAABBAt(player.position);
                const playerBottom = player.position.y - player.height / 2;

                for (let i = 0; i < obstacles.length; i++) {
                    const obs = obstacles[i];
                    
                    if (obs.aabb.maxY - playerBottom > 0.35 && obs.aabb.minY < player.position.y + player.height / 2) {
                        
                        const alignZ = pAABB.maxZ > obs.aabb.minZ && pAABB.minZ < obs.aabb.maxZ;
                        const alignX = pAABB.maxX > obs.aabb.minX && pAABB.minX < obs.aabb.maxX;

                        if (alignZ) {
                            const distToLeftFace = obs.aabb.minX - pAABB.maxX; 
                            const distToRightFace = pAABB.minX - obs.aabb.maxX; 
                            
                            if (Math.abs(distToLeftFace) < minDistance && pAABB.minX < obs.aabb.minX) {
                                minDistance = Math.abs(distToLeftFace);
                                detectedNormal = new THREE.Vector3(-1, 0, 0);
                            }
                            if (Math.abs(distToRightFace) < minDistance && pAABB.maxX > obs.aabb.maxX) {
                                minDistance = Math.abs(distToRightFace);
                                detectedNormal = new THREE.Vector3(1, 0, 0);
                            }
                        }

                        if (alignX) {
                            const distToFrontFace = obs.aabb.minZ - pAABB.maxZ; 
                            const distToBackFace = pAABB.minZ - obs.aabb.maxZ; 
                            
                            if (Math.abs(distToFrontFace) < minDistance && pAABB.minZ < obs.aabb.minZ) {
                                minDistance = Math.abs(distToFrontFace);
                                detectedNormal = new THREE.Vector3(0, 0, -1);
                            }
                            if (Math.abs(distToBackFace) < minDistance && pAABB.maxZ > obs.aabb.maxZ) {
                                minDistance = Math.abs(distToBackFace);
                                detectedNormal = new THREE.Vector3(0, 0, 1);
                            }
                        }
                    }
                }
                return { normal: detectedNormal, distance: minDistance === 0.25 ? Infinity : minDistance };
            }

            const obstacles = window.obstacles = [];
            const obstacleMeshes = [];
            // --- HỆ THỐNG MẶT NƯỚC (WATER PROTOTYPE) ---
            const waterAreas = [];
            // Export tường minh qua window: các file tách riêng (vfx.js, enemies.js, combat.js) đọc/ghi
            // các mảng state này qua window.* thay vì dựa vào global scope ngầm giữa các <script> tag.
            const enemies = window.enemies = [];
            const particles = window.particles = [];
            const ghostTrails = window.ghostTrails = [];
            const activeProjectiles = window.activeProjectiles = [];
            const energyParticles = window.energyParticles = [];
            // Hiệu ứng hình ảnh của Pressure Shot (instant beam) — KHÔNG di chuyển, chỉ fade rồi tự hủy.
            // Tách riêng khỏi activeProjectiles vì không có logic bay/va chạm, chỉ là visual thuần túy.
            const activeHydroBeamVisuals = window.activeHydroBeamVisuals = [];
            // Pre-Alpha v0.7 — Core Stats: Damage Number (số sát thương bay lên). TÁCH RIÊNG khỏi
            // mảng particles ở trên dù về khái niệm cũng là 1 loại "hiệu ứng bay lên rồi biến mất" —
            // lý do: particles/updateParticles() (cuối animate()) giả định p.mesh là THREE.Mesh
            // (dùng p.mesh.geometry.dispose(), p.mesh.scale.multiplyScalar()...), trong khi Damage
            // Number cần THREE.Sprite (billboard luôn quay mặt về camera, để số hiển thị rõ từ MỌI
            // góc nhìn thay vì bị "lật ngược" khi camera đi vòng ra sau như Mesh phẳng thường). API
            // của Sprite khác Mesh (geometry dùng chung/static giữa các Sprite theo thiết kế của
            // Three.js) nên gọi chung 1 vòng lặp dispose() như particles có rủi ro làm hỏng Sprite
            // khác — dùng vòng lặp update riêng (updateDamageNumbers(), trong vfx.js) để an toàn.
            const damageNumbers = window.damageNumbers = [];
            // nextEnemyId dùng getter/setter (thay vì gán thẳng) vì đây là số nguyên tăng dần — gán thẳng
            // window.nextEnemyId = nextEnemyId chỉ copy giá trị tại thời điểm đó, không đồng bộ về sau.
            // enemies.js (Enemy/Slime constructor) tăng giá trị này qua window.nextEnemyId++.
            let nextEnemyId = 1;
            Object.defineProperty(window, 'nextEnemyId', {
                get() { return nextEnemyId; },
                set(v) { nextEnemyId = v; },
                configurable: true
            });

            // --- HỆ THỐNG TƯƠNG TÁC (INTERACTABLE) & NHIỆM VỤ (QUEST) ---
            const interactables = window.interactables = [];
            const activeQuests = window.activeQuests = [];
            let nearbyInteractable = null; // Interactable gần nhất trong tầm tương tác hiện tại
            Object.defineProperty(window, 'nearbyInteractable', {
                get() { return nearbyInteractable; },
                set(v) { nearbyInteractable = v; },
                configurable: true
            });

            function interactWithNearbyObject() {
                if (isGamePaused || window.isDialogueOpen || player.isDrowning || player.isDead) return;
                if (window.nearbyInteractable) {
                    window.nearbyInteractable.onInteract();
                }
            }
            window.interactWithNearbyObject = interactWithNearbyObject;

            // --- CẬP NHẬT TIẾN ĐỘ QUEST KHI KẺ ĐỊCH BỊ TIÊU DIỆT ---
            // Gọi từ Enemy/Slime.takeDamage() khi hp <= 0. targetType VD: 'slime'.
            function onEnemyKilled(targetType) {
                let anyUpdated = false;
                for (let i = 0; i < activeQuests.length; i++) {
                    const q = activeQuests[i];
                    if (q.status === 'active' && q.type === 'kill' && q.targetType === targetType) {
                        q.currentCount = Math.min(q.currentCount + 1, q.targetCount);
                        if (q.currentCount >= q.targetCount) {
                            q.status = 'completed';
                        }
                        anyUpdated = true;
                    }
                }
                if (anyUpdated && window.refreshQuestTracker) window.refreshQuestTracker();
                // Infrastructure Update #1 — Save System (mục 3: "Hoàn thành Quest", bao gồm cả tiến độ
                // đang thực hiện — spec mục 2 nói rõ "tiến độ"). onItemGathered() bên dưới tự động lưu
                // qua dây chuyền Inventory.addItem() -> requestSave(), nhưng onEnemyKilled() không đi
                // qua Inventory nên cần hook trực tiếp ở đây.
                if (anyUpdated && window.requestSave) window.requestSave();
            }
            window.onEnemyKilled = onEnemyKilled;

            // --- CẬP NHẬT TIẾN ĐỘ QUEST GATHERING KHI NHẶT VẬT PHẨM (v0.6 Wilderness) ---
            // Gọi từ Inventory.addItem() MỖI LẦN có item được thêm vào túi — tương tự onEnemyKilled()
            // nhưng so khớp theo q.type === 'gather' + itemId thay vì loại quái. `quantity` (số lượng
            // vừa thêm, có thể > 1 nếu sau này có item cộng dồn theo lô) được cộng dồn đầy đủ vào
            // currentCount, không chỉ +1 mỗi lần gọi — đúng ngữ nghĩa "tiến độ theo số lượng thực tế".
            function onItemGathered(itemId, quantity) {
                let anyUpdated = false;
                for (let i = 0; i < activeQuests.length; i++) {
                    const q = activeQuests[i];
                    if (q.status === 'active' && q.type === 'gather' && q.targetType === itemId) {
                        q.currentCount = Math.min(q.currentCount + quantity, q.targetCount);
                        if (q.currentCount >= q.targetCount) {
                            q.status = 'completed';
                        }
                        anyUpdated = true;
                    }
                }
                if (anyUpdated && window.refreshQuestTracker) window.refreshQuestTracker();
            }
            window.onItemGathered = onItemGathered;

            // --- BẢNG VẬT PHẨM RƠI + EXP CỦA TỪNG LOẠI QUÁI (v0.6 Wilderness, mục 7-8) ---
            // Data-driven: key = enemyType (khớp đúng tham số targetType truyền vào onEnemyKilled() —
            // hiện tại chỉ 'slime', nhưng thêm loại quái mới sau này chỉ cần thêm 1 entry ở đây, KHÔNG
            // cần sửa onSlimeKilled()/logic gọi trong enemies.js).
            //   drops: mảng { itemId, chance, min, max } — MỘT quái có thể rơi NHIỀU loại vật phẩm khác
            //          nhau cùng lúc (mỗi entry tự roll chance độc lập), không giới hạn chỉ 1 loại.
            //          chance: xác suất (0..1) loại vật phẩm này có rơi hay không trong lần giết đó.
            //          min/max: số lượng rơi nếu chance trúng (random nguyên trong [min, max]).
            //   exp: { min, max } — lượng EXP ngẫu nhiên nhận được khi tiêu diệt loại quái này. Dùng
            //        THẲNG REWARD_HANDLERS.exp() (đã có từ hệ thống Quest/Chest) để cộng vào
            //        player.exp — không cộng trực tiếp ở đây, giữ đúng 1 đường EXP duy nhất trong toàn
            //        bộ game (xem giải thích tại định nghĩa REWARD_HANDLERS.exp).
            const ENEMY_LOOT_TABLES = {
                slime: {
                    drops: [
                        { itemId: 'slime_condensate', chance: 1.0, min: 1, max: 2 }
                    ]
                    // Pre-Alpha v0.7 — Core Stats: EXP không còn nằm ở đây (trước là random {min,max}
                    // KHÔNG phân biệt Small/Large Slime). core_stats.md mục 7 quy định EXP Reward là
                    // SỐ CỐ ĐỊNH riêng theo từng loại (Small=10, Large=30) — đọc trực tiếp từ
                    // slime.expReward (gán trong constructor, enemies.js) tại onSlimeKilled() bên dưới.
                }
            };
            window.ENEMY_LOOT_TABLES = ENEMY_LOOT_TABLES;

            // Rải các WorldItem rơi ra quanh vị trí quái vừa chết — lệch ngẫu nhiên nhẹ (bán kính nhỏ)
            // để nhiều loại/nhiều item không chồng đè lên đúng 1 điểm, vẫn đủ gần để rõ ràng "rơi ra từ
            // xác quái vừa bị tiêu diệt". yOffset thấp (0.15) vì vật phẩm rơi nên nằm sát mặt đất, khác
            // hẳn item mọc tự nhiên trên bụi cây/tán lá (yOffset 0.28-0.35 mặc định của createWorldItem).
            function spawnLootDrops(position, lootTable) {
                if (!lootTable || !lootTable.drops) return;
                const DROP_SCATTER_RADIUS = 0.6;
                lootTable.drops.forEach(drop => {
                    if (Math.random() > drop.chance) return;
                    const quantity = Math.floor(Math.random() * (drop.max - drop.min + 1)) + drop.min;
                    const angle = Math.random() * Math.PI * 2;
                    const dist = Math.random() * DROP_SCATTER_RADIUS;
                    const x = position.x + Math.cos(angle) * dist;
                    const z = position.z + Math.sin(angle) * dist;
                    createWorldItem(x, z, drop.itemId, quantity, 0.15);
                });
            }

            // --- GỌI KHI 1 SLIME BỊ TIÊU DIỆT (v0.6 Wilderness, cập nhật EXP ở v0.7 Core Stats) ---
            // Gọi từ Slime.takeDamage() trong enemies.js NGAY TRƯỚC/CÙNG LÚC với onEnemyKilled('slime')
            // (tách biệt 2 hàm: onEnemyKilled lo cập nhật quest tiến độ 'kill', onSlimeKilled lo
            // drop/exp — single-responsibility, không gộp chung để dễ mở rộng độc lập). Nhận thẳng
            // instance `slime` (không chỉ targetType string) để có vị trí chính xác cho loot rơi ra
            // VÀ để đọc đúng slime.expReward (khác nhau giữa Small/Large — xem enemies.js).
            function onSlimeKilled(slime) {
                const lootTable = ENEMY_LOOT_TABLES.slime;
                if (!lootTable) return;

                spawnLootDrops(slime.position, lootTable);

                // Pre-Alpha v0.7 — Core Stats: EXP CỐ ĐỊNH theo loại slime (core_stats.md mục 7),
                // không còn random.
                if (typeof slime.expReward === 'number') {
                    const handler = REWARD_HANDLERS.exp;
                    if (handler) handler(slime.expReward);
                }
            }
            window.onSlimeKilled = onSlimeKilled;

            // ============================================================
            // HỆ THỐNG CORE STATS (Pre-Alpha v0.7)
            // ============================================================
            // Nền tảng chỉ số + công thức sát thương DÙNG CHUNG cho Player và mọi Enemy — không nơi
            // nào khác trong codebase được tự tính damage theo cách riêng (nhân số tùy ý, trừ HP trực
            // tiếp...). Mọi combat action (melee, plunge, hydroProjectile, burst, đòn đánh của Slime)
            // đều phải đi qua ĐÚNG 1 hàm calculateFinalDamage() bên dưới.
            //
            // --- COMBAT_CONSTANTS: hằng số cân bằng, KHÔNG hard-code rải rác nơi khác ---
            //   DEFENSE_CONSTANT: hằng số trong công thức giảm sát thương theo DEF (xem bên dưới).
            //                     Giá trị càng lớn thì DEF càng "yếu" (cần nhiều DEF hơn mới giảm được
            //                     cùng % sát thương) — đây là con số DUY NHẤT cần chỉnh khi cân bằng
            //                     lại độ khó tổng thể của toàn bộ game trong tương lai.
            const COMBAT_CONSTANTS = {
                DEFENSE_CONSTANT: 100
            };
            window.COMBAT_CONSTANTS = COMBAT_CONSTANTS;

            // calculateFinalDamage(atk, def, multiplier = 1):
            //   Final Damage = (ATK × multiplier) × DEFENSE_CONSTANT / (DEFENSE_CONSTANT + DEF)
            //
            //   atk: chỉ số ATK của bên gây sát thương (player.stats.atk hoặc enemy.stats.atk).
            //   def: chỉ số DEF của bên nhận sát thương.
            //   multiplier: hệ số riêng theo LOẠI đòn đánh (VD melee=1, plunge=3, burst=4 — xem
            //               player.attack.* bên dưới) — KHÔNG phải "damage points" độc lập như trước
            //               v0.7, mà là hệ số nhân lên ATK gốc trước khi đưa vào công thức giảm theo
            //               DEF. Mặc định 1 cho các trường hợp không có multiplier riêng (VD đòn đánh
            //               thường của Enemy lên Player).
            //
            //   Phòng vệ: DEF âm (chưa từng xảy ra, nhưng debuff tương lai có thể tạo ra) được clamp
            //   về 0 để mẫu số không bao giờ <= 0 (tránh chia cho 0 hoặc âm — kết quả càng âm DEF thì
            //   sát thương càng KHUẾCH ĐẠI, ngược hẳn ý nghĩa của DEF). Kết quả cuối làm tròn TỚI SỐ
            //   NGUYÊN GẦN NHẤT (Math.round — không phải Math.floor) và không bao giờ âm (Math.max 0).
            //   Xác định qua đối chiếu ví dụ "Slime ATK=12, Player DEF=10 -> Final Damage≈11" trong
            //   core_stats.md mục 7: giá trị thô là 12×100/(100+10) = 10.909 — Math.floor cho 10 (SAI
            //   lệch với spec), chỉ Math.round mới cho đúng 11.
            function calculateFinalDamage(atk, def, multiplier = 1) {
                const safeDef = Math.max(0, def || 0);
                const safeAtk = Math.max(0, atk || 0);
                const raw = (safeAtk * multiplier) * COMBAT_CONSTANTS.DEFENSE_CONSTANT / (COMBAT_CONSTANTS.DEFENSE_CONSTANT + safeDef);
                return Math.max(0, Math.round(raw));
            }
            window.calculateFinalDamage = calculateFinalDamage;

            // Vị trí spawn/hồi sinh mặc định của player — nguồn sự thật duy nhất, dùng cho cả
            // respawn sau khi chết (combat/drown/fall) VÀ teleport khi rơi khỏi vùng chơi hợp lệ (void).
            const PLAYER_SPAWN_POSITION = new THREE.Vector3(0, 0.9, 0);

            const player = window.player = {
                mesh: null,
                width: 0.8, height: 1.8, depth: 0.8,
                position: new THREE.Vector3(0, 0.9, 0),
                velocity: new THREE.Vector3(0, 0, 0),
                inputVelocity: new THREE.Vector3(0, 0, 0), 
                
                // --- CORE STATS (Pre-Alpha v0.7) — nguồn sự thật DUY NHẤT cho chỉ số chiến đấu của
                // Player, dùng chung công thức calculateFinalDamage() với mọi Enemy. Số liệu cân bằng
                // ban đầu theo core_stats.md mục 7 (Pre-Alpha, chưa phải giá trị cuối cùng).
                // Thiết kế mở: object phẳng nên sau này thêm critRate/critDmg/elementalMastery/
                // energyRecharge/healingBonus/elementalBonus/shieldStrength... chỉ cần thêm field mới
                // vào đây, không cần đổi cấu trúc hay sửa nơi khác đang đọc stats.atk/stats.def.
                stats: { maxHp: 100, hp: 100, atk: 20, def: 10 },
                // player.hp/player.maxHp giữ nguyên là property TRUY CẬP ĐƯỢC (không phải object lồng
                // nhau) để KHÔNG phải sửa hàng chục chỗ trong game.js/combat.js/ui.js đang đọc/ghi
                // player.hp trực tiếp (VD "player.hp -= x", "player.hp <= 0") — thực chất đọc/ghi
                // xuyên qua get/set này vào đúng player.stats.hp/maxHp, đảm bảo LUÔN có đúng 1 nguồn
                // dữ liệu HP (không có 2 bản sao lệch nhau).
                get hp() { return this.stats.hp; },
                set hp(v) { this.stats.hp = v; },
                get maxHp() { return this.stats.maxHp; },
                set maxHp(v) { this.stats.maxHp = v; },
                invulnTimer: 0.0, staggerTimer: 0.0, isDead: false,
                // Hệ số nhân theo LOẠI đòn đánh (multiplier trong calculateFinalDamage) — KHÔNG còn
                // là "damage points" độc lập như trước v0.7. Final Damage thực tế của 1 đòn melee =
                // calculateFinalDamage(player.stats.atk, enemy.stats.def, player.attack.melee).
                attack: { melee: 1, plunge: 3, burst: 4, hydroProjectile: 1.5 },
                energy: 0, maxEnergy: 50, skillHitCount: 0,

                // --- EXP (v0.6 Wilderness, mục 8) — chỉ cộng dồn, CHƯA có hệ thống Level/tăng cấp.
                // Xem REWARD_HANDLERS.exp — mọi nguồn EXP (Slime kill, Quest reward...) đều cộng qua
                // ĐÚNG 1 đường này, không cộng trực tiếp vào player.exp ở nơi khác.
                exp: 0,
                // --- LEVEL (Pre-Alpha v0.8 — Character) — bắt đầu ở Level 1. Tăng lên bởi
                // checkLevelUp() (xem ngay dưới định nghĩa player) mỗi khi REWARD_HANDLERS.exp() cộng
                // đủ EXP để vượt ngưỡng LEVEL_CONFIG.expForLevel(level). KHÔNG có hệ thống Ascension ở
                // bước này (spec: "chuẩn bị giao diện và cấu trúc dữ liệu, chưa cần triển khai chức
                // năng") — level tăng vô hạn theo cùng 1 công thức, chưa có mốc chặn theo bậc.
                level: 1,
                // --- PRIMOGEM / NGUYÊN THẠCH (Infrastructure Update #1 — Save System) — trước đây
                // REWARD_HANDLERS.primogem CHỈ hiện popup, KHÔNG cộng dồn vào state nào (khác hẳn
                // player.exp đã có sẵn 1 đường cộng dồn rõ ràng). Thêm field này để Nguyên Thạch có
                // state thực sự, đủ điều kiện để Save System lưu/khôi phục đúng yêu cầu spec mục 2.
                // Xem REWARD_HANDLERS.primogem — mọi nguồn Nguyên Thạch (Quest reward, Chest...) đều
                // cộng qua ĐÚNG 1 đường này, cùng pattern với player.exp.
                primogem: 0,

                // --- SOFT TARGETING (Auto Aim hỗ trợ, v0.9.1) ---
                // softTargetLockY: góc Y (radian) mục tiêu cần xoay tới, null nếu không có hỗ trợ nào đang chạy.
                // softTargetLerpSpeed: tốc độ xoay (dùng trong công thức 1 - exp(-speed*dt)) — vùng càng gần
                // địch thì xoay càng nhanh/mạnh. Cả 2 chỉ được set 1 lần lúc bắt đầu đòn đánh (windup),
                // và tự dừng khi bước sang active hoặc hết windup — không xoay liên tục kiểu Hard Lock-On.
                softTargetLockY: null,
                softTargetLerpSpeed: 0,

                // --- ATTACK LUNGE (bước tới khi tấn công, v0.9.2) ---
                // Không phải Dash, không tự động lao thẳng vào địch — chỉ là 1 bước tiến ngắn, có
                // giới hạn khoảng cách, trải đều qua 1 khoảng thời gian ngắn (lungeTimer đếm lùi).
                // lungeDir: hướng lunge (Vector3, world space, đã normalize).
                // lungeRemainingDist: quãng đường (m) còn lại cần di chuyển, giảm dần về 0 mỗi frame.
                // lungeTimer: thời gian (giây) còn lại của lunge — hết thời gian thì dừng hẳn dù còn quãng đường.
                lungeDir: new THREE.Vector3(0, 0, 1),
                lungeRemainingDist: 0,
                lungeTimer: 0,

                // --- PRESSURE SHOT RECOIL (v0.9.7) ---
                // Cùng cơ chế với Attack Lunge (quãng đường cố định trải đều qua thời gian ngắn, cộng
                // vào velocity trong updatePhysics — KHÔNG cộng 1 lần rồi để input-movement ghi đè mất
                // tác dụng như bug cũ), nhưng theo hướng NGƯỢC LẠI hướng bắn (đẩy lùi thay vì tiến tới).
                recoilDir: new THREE.Vector3(0, 0, 1),
                recoilRemainingDist: 0,
                recoilTimer: 0,

                // --- HỆ THỐNG THỂ LỰC (v0.8.0) ---
                stamina: 60.0, maxStamina: 60.0,
                isDrowning: false, drownTimer: 0.0,

                isBursting: false, burstSphere: null, burstDir: new THREE.Vector3(),
                burstDistTraveled: 0, burstRotTimer: 0,

                isGliding: false,
                isPlunging: false,
                gliderGroup: null,

                isClimbing: false,
                climbNormal: new THREE.Vector3(),
                wallContactNormal: null,
                climbJumpTimer: 0, 
                
                isInWater: false,
                isSwimming: false,        // Hệ thống Bơi lội (Swimming state)
                swimState: 'idle',        // 'idle', 'slow', 'fast'
                swimFastTimer: 0,         // Thời gian duy trì đà Swim Fast sau dash
                swimOscillationTimer: 0,  // Phục vụ tạo Animation Procedural bơi lội

                jumpRequested: false,

                speed: 7.2,           
                sprintSpeed: 14.0,    
                walkSpeed: 3.8  ,       
                acceleration: 45.0,   
                deceleration: 18.0,   
                jumpForce: 12.5,      
                gravity: 38,         
                isGrounded: false, wasGrounded: false, landSquashTimer: 0,
                coyoteTimer: 0,     

                // --- FALL DAMAGE (v0.9.0, Pre-Alpha) ---
                // fallStartY theo dõi điểm Y CAO NHẤT nhân vật đạt được kể từ lần cuối rời mặt đất.
                // Dùng "đỉnh cao nhất" thay vì "Y lúc rời đất" để xử lý đúng các trường hợp bật nhảy
                // giữa không trung. NaN nghĩa là chưa có chu kỳ rơi nào đang theo dõi.
                fallStartY: NaN,

                walkMode: false, isSprinting: false,
                aabb: new AABB(),
                
                attackState: 'idle', attackTimer: 0, attackBuffered: false, 
                hasHitList: [], sword: null, slashWave: null,

                isDashing: false, dashTimer: 0, dashCooldownTimer: 0,
                dashDirection: new THREE.Vector3(), lastMovementDirection: new THREE.Vector3(0, 0, 1), 
                dashSpeed: 28.0,        
                dashDuration: 0.2,    
                dashCooldown: 0.4,     
                ghostSpawnTimer: 0     
            };

            // ============================================================
            // HỆ THỐNG CHARACTER (Pre-Alpha v0.8)
            // ============================================================
            // --- CHARACTER_DATA: dữ liệu ĐỊNH DANH của nhân vật hiện tại — tách biệt hoàn toàn khỏi
            // player.stats (chỉ số CHIẾN ĐẤU sống, đổi liên tục mỗi frame/mỗi trận). CHARACTER_DATA là
            // dữ liệu "hồ sơ" ổn định (tên, element, region, id) — đúng tinh thần mục 5 spec: "nền tảng
            // cho toàn bộ hệ thống Character sau này". Object phẳng, DUY NHẤT 1 entry ở Pre-Alpha (chưa
            // có Character List — mục "Chuẩn bị cho Alpha") nhưng field `id` đã có sẵn để sau này định
            // danh giữa nhiều nhân vật (window.characterRoster = [CHARACTER_DATA, ...] khi có List).
            //   weapon/artifacts/talents/constellation: để `null`/mảng rỗng — RESERVED, spec mục
            //   "Chuẩn bị cho Alpha" chỉ yêu cầu chuẩn bị cấu trúc, CHƯA triển khai chức năng thật.
            const CHARACTER_DATA = window.CHARACTER_DATA = {
                id: 'traveler_hydro',
                // Pre-Alpha v0.8 — UI adjustment: tên mặc định là 'Traveler' (KHÔNG hard-code tên cụ
                // thể nữa). Tên thật được set bởi showPlayerNamePrompt() (ui.js) lúc bắt đầu hành
                // trình mới, hoặc khôi phục từ save data (xem applySaveData() — 06-camps-save-system.js)
                // nếu người chơi đã có tiến trình trước đó.
                name: 'Traveler',
                element: 'Hydro',
                region: 'Mondstadt', // Optional theo spec — placeholder Pre-Alpha
                weapon: null,        // Reserved — Weapon System (Alpha)
                artifacts: [],       // Reserved — Artifact System (Alpha)
                talents: [],         // Reserved — Talent System (Alpha)
                constellation: 0     // Reserved — Constellation System (Alpha), 0 = chưa mở
            };

            // --- LEVEL_CONFIG: công thức EXP cần để lên level tiếp theo + mức tăng chỉ số mỗi level.
            // Tách riêng thành hàm thay vì bảng tra cứu cứng (VD { 1: 100, 2: 250, ... }) để KHÔNG giới
            // hạn số level tối đa — mục 4 spec: "Thiết kế hệ thống đủ linh hoạt để có thể mở rộng trong
            // tương lai". Tăng trưởng tuyến tính đơn giản (Pre-Alpha, chưa cân bằng) — dễ đổi công thức
            // sau này (VD hàm mũ) mà KHÔNG cần sửa checkLevelUp() hay bất kỳ nơi gọi nào khác.
            //   expForLevel(level): tổng EXP cần có để lên từ `level` -> `level + 1`.
            //   statGrowth: lượng CỘNG THÊM vào từng chỉ số mỗi lần lên 1 level (không phải % nhân).
            const LEVEL_CONFIG = {
                expForLevel(level) {
                    return 50 + (level - 1) * 25;
                },
                statGrowth: {
                    maxHp: 10,
                    atk: 2,
                    def: 1
                }
            };
            window.LEVEL_CONFIG = LEVEL_CONFIG;

            // Kiểm tra + xử lý lên level — gọi SAU MỖI LẦN player.exp thay đổi (xem REWARD_HANDLERS.exp,
            // file 01). Dùng vòng lặp while (không phải if) để xử lý đúng trường hợp nhận 1 lượng EXP
            // lớn vượt NHIỀU ngưỡng level cùng lúc (VD quest thưởng EXP khủng) — lên level liên tiếp
            // trong cùng 1 lần gọi thay vì phải đợi lần cộng EXP kế tiếp mới lên tiếp level còn thiếu.
            // Khi lên level: CỘNG THÊM (không phải đặt lại) statGrowth vào maxHp/atk/def hiện tại — giữ
            // nguyên mọi buff/thay đổi khác có thể có trên stats sau này (VD Ascension cộng thêm sau).
            // hp hiện tại cũng được cộng thêm đúng bằng phần maxHp vừa tăng (không tự động full hồi) —
            // giữ nguyên tỉ lệ % HP đang có, tránh cảm giác "heal miễn phí" mỗi lần lên cấp.
            function checkLevelUp() {
                let leveledUp = false;
                while (player.exp >= LEVEL_CONFIG.expForLevel(player.level)) {
                    player.exp -= LEVEL_CONFIG.expForLevel(player.level);
                    player.level += 1;
                    player.stats.maxHp += LEVEL_CONFIG.statGrowth.maxHp;
                    player.stats.hp += LEVEL_CONFIG.statGrowth.maxHp;
                    player.stats.atk += LEVEL_CONFIG.statGrowth.atk;
                    player.stats.def += LEVEL_CONFIG.statGrowth.def;
                    leveledUp = true;
                }
                if (leveledUp) {
                    if (window.showRewardPopup) {
                        window.showRewardPopup('fa-solid fa-arrow-up text-amber-300', `Level Up! Lv.${player.level}`);
                    }
                    if (window.renderCharacterScreen && window.activeWindow === 'character') window.renderCharacterScreen();
                    if (window.requestSave) window.requestSave(); // Save System mục 6: Level/EXP/stats vừa đổi
                }
            }
            window.checkLevelUp = checkLevelUp;

            // Đặt tên nhân vật + đồng bộ MỌI nơi hiển thị tên (Paimon Menu profile card, Character
            // Screen) — ĐÚNG 1 đường duy nhất để đổi tên, dùng chung bởi cả showPlayerNamePrompt()
            // (lần đầu chơi, ui.js) LẪN applySaveData() (khôi phục tên đã lưu, 06-camps-save-system.js)
            // để không có 2 nơi tự ý cập nhật CHARACTER_DATA.name theo cách khác nhau.
            function setCharacterName(name) {
                const trimmed = (name || '').trim();
                CHARACTER_DATA.name = trimmed || 'Traveler';
                const paimonNameEl = document.getElementById('paimon-menu-player-name');
                if (paimonNameEl) paimonNameEl.textContent = CHARACTER_DATA.name;
                if (window.renderCharacterScreen && window.activeWindow === 'character') window.renderCharacterScreen();
            }
            window.setCharacterName = setCharacterName;

            // ============================================================
            // PARTY SYSTEM (Pre-Alpha v0.8.5) — Bước 1: Party Data + Character Switching
            // ============================================================
            // Ý tưởng cốt lõi: TRƯỚC v0.8.5 chỉ có 1 CHARACTER_DATA + 1 player.stats duy nhất (đúng 1
            // nhân vật). Từ v0.8.5, có NHIỀU Character trong Party, nhưng "player" (vị trí, velocity,
            // input, physics, camera...) vẫn là ĐÚNG 1 bộ state — vì tại 1 thời điểm chỉ 1 Character
            // được điều khiển. Do đó thiết kế:
            //   - Mỗi entry trong partyState (PartyMember) lưu phần "thuộc về RIÊNG Character đó":
            //     identity (id/name/element - như CHARACTER_DATA cũ) + combat stats (level/exp/hp/maxHp/
            //     atk/def) + mesh (bộ playerGroup/sword/slashWave/gliderGroup RIÊNG, dựng sẵn từ đầu).
            //   - player.stats/player.exp/player.level/CHARACTER_DATA vẫn giữ NGUYÊN VAI TRÒ cũ (đọc/ghi
            //     trực tiếp như trước v0.8.5, KHÔNG sửa hàng chục chỗ trong combat.js/enemies.js/ui.js
            //     đang dùng player.stats.atk, player.exp, CHARACTER_DATA.name...) NHƯNG giờ chỉ là "cửa
            //     sổ" trỏ vào ĐÚNG 1 PartyMember đang active — switchToCharacter() có nhiệm vụ đồng bộ
            //     2 chiều: lưu state hiện tại của player.* vào PartyMember cũ trước khi rời, rồi nạp
            //     state của PartyMember mới vào player.*.
            //   - player.mesh/player.sword/player.slashWave/player.gliderGroup vẫn là property của
            //     player (không đổi tên, không đổi cách 08-physics-combat-camera-loop.js/combat.js truy
            //     cập) nhưng giá trị được switchToCharacter() trỏ sang đúng bộ mesh của PartyMember mới.
            //
            // PARTY_CONFIG: data-driven — định nghĩa danh sách Character trong Party (spec mục 4: Test
            // Character dùng ĐÚNG 1 model/animation với Character chính, chỉ khác identity/stats/màu để
            // phân biệt trực quan trong lúc test). 2 slot Reserved (null) — có sẵn "chỗ trống" trong
            // Party cho tương lai (VD nhận thêm Character qua Wish) mà không cần đổi cấu trúc mảng.
            const PARTY_CONFIG = [
                {
                    id: 'traveler_hydro',
                    name: 'Traveler',
                    element: 'Hydro',
                    region: 'Mondstadt',
                    bodyColor: 0x475569, // Màu gốc — giữ đúng như player Pre-Alpha trước v0.8.5
                    baseStats: { maxHp: 100, atk: 16, def: 10 }
                },
                {
                    id: 'test_character_anemo',
                    // Pre-Alpha v0.8.5 mục 4 — Test Character: tên/element khác Traveler để phân biệt rõ
                    // trong Character HUD/Character Screen (Bước 2), nhưng dùng CHUNG model (xem
                    // buildCharacterMesh trong 04-scene-init.js) — chỉ đổi bodyColor để nhận diện bằng
                    // mắt thường lúc test switch trong lúc CHƯA có Character HUD (Bước 1).
                    name: 'Test Character',
                    element: 'Anemo',
                    region: 'Mondstadt',
                    bodyColor: 0x16a34a,
                    baseStats: { maxHp: 90, atk: 12, def: 8 }
                },
                null, // Reserved slot 3 — dành cho Character nhận thêm sau này (Alpha)
                null  // Reserved slot 4
            ];
            window.PARTY_CONFIG = PARTY_CONFIG;

            // partyState: mảng PartyMember tương ứng 1-1 với PARTY_CONFIG (null giữ nguyên null cho slot
            // Reserved). Dựng bởi initParty() — gọi 1 LẦN trong initThree() (04-scene-init.js), SAU khi
            // buildCharacterMesh() đã sẵn sàng (cần hàm này để dựng mesh cho từng Character).
            const partyState = window.partyState = [];
            let activeCharacterIndex = 0;
            Object.defineProperty(window, 'activeCharacterIndex', {
                get() { return activeCharacterIndex; },
                configurable: true
            });

            // initParty(): dựng partyState từ PARTY_CONFIG — mỗi Character có mesh RIÊNG (ẩn hết trừ
            // Character active đầu tiên) + bản ghi stats RIÊNG (copy từ baseStats, level 1, exp 0, hp đầy
            // — giống hệt cách player.stats khởi tạo trước v0.8.5). Sau khi dựng xong, "nạp" Character
            // đầu tiên (index 0, Traveler) vào player.*/CHARACTER_DATA như bình thường — game khởi động
            // vẫn coi như đang điều khiển Traveler y hệt trước v0.8.5, không đổi hành vi mặc định.
            function initParty() {
                PARTY_CONFIG.forEach((config, index) => {
                    if (!config) { partyState.push(null); return; }

                    const meshRefs = window.buildCharacterMesh(config.bodyColor);
                    partyState.push({
                        id: config.id,
                        name: config.name,
                        element: config.element,
                        region: config.region,
                        weapon: null, artifacts: [], talents: [], constellation: 0,
                        level: 1,
                        exp: 0,
                        stats: { maxHp: config.baseStats.maxHp, hp: config.baseStats.maxHp, atk: config.baseStats.atk, def: config.baseStats.def },
                        mesh: meshRefs.group,
                        sword: meshRefs.sword,
                        slashWave: meshRefs.slashWave,
                        gliderGroup: meshRefs.gliderGroup
                    });
                });

                // Nạp Character đầu tiên (Traveler) làm active — KHÔNG qua switchToCharacter() (không có
                // Character "cũ" nào để lưu state lúc khởi động) mà gán trực tiếp.
                const first = partyState[activeCharacterIndex];
                CHARACTER_DATA.id = first.id;
                CHARACTER_DATA.name = first.name;
                CHARACTER_DATA.element = first.element;
                CHARACTER_DATA.region = first.region;
                player.level = first.level;
                player.exp = first.exp;
                player.stats = first.stats;
                player.mesh = first.mesh;
                player.sword = first.sword;
                player.slashWave = first.slashWave;
                player.gliderGroup = first.gliderGroup;
                player.mesh.visible = true;
                player.mesh.position.copy(player.position);
            }
            window.initParty = initParty;

            // switchToCharacter(index): chuyển Character đang điều khiển sang partyState[index].
            //   - Bỏ qua nếu index trỏ tới slot Reserved (null), trùng Character đang active, hoặc đang
            //     giữa 1 hành động không nên gián đoạn (đang chết/đang trong Camp — Bước 3 sẽ tinh chỉnh
            //     thêm điều kiện chặn; Bước 1 chỉ chặn 2 trường hợp cơ bản nhất: đã chết hoặc index rỗng).
            //   - LƯU state hiện tại (player.stats/exp/level — cùng object reference với
            //     partyState[activeCharacterIndex].stats nên thực ra đã tự động đồng bộ SẴN qua object
            //     reference; chỉ cần đồng bộ lại exp/level vì 2 field đó là number, gán = COPY giá trị
            //     chứ không share reference).
            //   - ẨN mesh Character cũ, HIỆN mesh Character mới, đặt lại vị trí/hướng mesh mới trùng vị
            //     trí hiện tại của player (position/velocity không đổi — chỉ đổi "nhân vật đang cầm",
            //     không phải teleport).
            //   - Cập nhật player.mesh/sword/slashWave/gliderGroup + CHARACTER_DATA + player.stats/exp/
            //     level sang bộ của Character mới.
            function switchToCharacter(index) {
                if (index === activeCharacterIndex) return false;
                if (!partyState[index]) return false; // Slot Reserved, chưa có Character
                if (player.isDead) return false; // Không cho đổi lúc đang chết (đợi respawn xong)

                const prev = partyState[activeCharacterIndex];
                // player.stats là CÙNG reference với prev.stats (gán bằng con trỏ ở initParty/lần switch
                // trước) nên hp/atk/def/maxHp đã tự động ghi thẳng vào prev.stats suốt quá trình chơi —
                // không cần copy tay. Chỉ level/exp là number rời, cần đồng bộ lại thủ công.
                prev.level = player.level;
                prev.exp = player.exp;

                // Ẩn mesh + dừng animation/trạng thái tức thời gắn với mesh cũ (tránh mesh cũ đứng lơ
                // lửng ở tư thế combat/swim khi biến mất — reset về idle visually).
                prev.mesh.visible = false;
                if (prev.sword) prev.sword.visible = false;
                if (prev.slashWave) prev.slashWave.visible = false;
                if (prev.gliderGroup) prev.gliderGroup.visible = false;

                const next = partyState[index];
                activeCharacterIndex = index;

                CHARACTER_DATA.id = next.id;
                CHARACTER_DATA.name = next.name;
                CHARACTER_DATA.element = next.element;
                CHARACTER_DATA.region = next.region;
                player.level = next.level;
                player.exp = next.exp;
                player.stats = next.stats; // Từ đây player.hp/maxHp (getter/setter) đọc thẳng qua next.stats

                player.mesh = next.mesh;
                player.sword = next.sword;
                player.slashWave = next.slashWave;
                player.gliderGroup = next.gliderGroup;

                // Character mới xuất hiện ĐÚNG vị trí/hướng player hiện tại (không teleport, không đổi
                // velocity/physics đang có — chỉ đổi "vỏ" đang điều khiển).
                player.mesh.position.copy(player.position);
                player.mesh.rotation.y = prev.mesh.rotation.y;
                player.mesh.visible = true;
                if (player.sword) player.sword.visible = true;
                if (player.gliderGroup) player.gliderGroup.visible = player.isGliding;

                if (window.renderCharacterScreen && window.activeWindow === 'character') window.renderCharacterScreen();
                if (window.requestSave) window.requestSave();
                return true;
            }
            window.switchToCharacter = switchToCharacter;

            const COMBAT_TIMING = {
                windup: 0.10,   
                active: 0.18,   
                recovery: 0.26  
            };
            window.COMBAT_TIMING = COMBAT_TIMING;

            // --- CẤU HÌNH SOFT TARGETING (Auto Aim hỗ trợ đòn đánh thường, v0.9.1) ---
            // Pre-Alpha: giá trị tạm thời, sẽ cân bằng lại sau. Toàn bộ ngưỡng khoảng cách/góc/tốc độ
            // xoay tập trung DUY NHẤT ở đây — không hard-code rải rác nơi khác.
            // Quy ước: mỗi tier áp dụng cho khoảng [minDist, maxDist). Mảng sắp xếp TĂNG DẦN theo
            // minDist (0-2m, 2-3m, 3-4m) — vòng lặp bên dưới duyệt tuần tự và trả về kết quả của
            // tier ĐẦU TIÊN có địch hợp lệ, nên tier gần nhất (đầu mảng) luôn được ưu tiên trước.
            //   maxAngle: nửa góc (radian) của hình nón phía trước player mà mục tiêu phải nằm trong đó
            //             mới được hỗ trợ xoay. Với vùng "trong tầm đánh" (2m trở xuống): dùng Math.PI
            //             (360°, không giới hạn góc) — ưu tiên tuyệt đối không để chém hụt khi địch đã sát.
            //   lerpSpeed: tốc độ xoay mượt (dùng trong công thức 1 - exp(-lerpSpeed*dt)) — vùng càng gần
            //              địch thì xoay càng nhanh/mạnh, mô phỏng "hỗ trợ tăng dần" theo khoảng cách.
            const SOFT_TARGETING_CONFIG = {
                tiers: [
                    { minDist: 0, maxDist: 3, maxAngle: Math.PI, lerpSpeed: 24 }, // Trong tầm đánh: xoay 360°, ưu tiên gần nhất
                    { minDist: 3, maxDist: 6, maxAngle: Math.PI / 1.5, lerpSpeed: 16 }, // 3-6m: hỗ trợ tăng, vẫn tự nhiên
                    { minDist: 6, maxDist: 9, maxAngle: Math.PI / 2.5, lerpSpeed: 8 }, // 6-9m: hỗ trợ nhẹ, góc hẹp phía trước
                ]
            };
            window.SOFT_TARGETING_CONFIG = SOFT_TARGETING_CONFIG;

            // Tìm mục tiêu và góc xoay hỗ trợ phù hợp nhất tại thời điểm bắt đầu đòn đánh.
            // Trả về { targetY, lerpSpeed, distance } nếu có hỗ trợ, hoặc null nếu không có địch nào
            // trong phạm vi (đòn đánh thực hiện đúng hướng người chơi đang nhìn, không có hỗ trợ nào).
            // distance: khoảng cách (m) thực tế tới mục tiêu — dùng để Attack Lunge tính quãng đường
            // di chuyển phù hợp, không bao giờ vượt/xuyên qua mục tiêu.
            //
            // Chọn mục tiêu: xét tuần tự từng tier từ gần -> xa (đúng thứ tự khai báo trong tiers),
            // dùng địch gần nhất TRONG tier đó (nếu có nhiều địch cùng nằm trong 1 tier). Ưu tiên
            // tuyệt đối cho tier gần nhất có ít nhất 1 địch hợp lệ — không gộp chung tất cả các vùng.
            function findSoftTargetingRotation(originPos, facingAngleY) {
                const forward = new THREE.Vector3(Math.sin(facingAngleY), 0, Math.cos(facingAngleY));

                for (const tier of SOFT_TARGETING_CONFIG.tiers) {
                    let bestEnemy = null;
                    let bestDist = Infinity;

                    for (const enemy of enemies) {
                        if (!enemy.alive) continue;
                        const toEnemy = new THREE.Vector3().subVectors(enemy.position, originPos);
                        toEnemy.y = 0;
                        const dist = toEnemy.length();
                        if (dist < tier.minDist || dist >= tier.maxDist) continue;
                        if (dist === 0) continue; // Tránh chia 0 khi normalize

                        // Kiểm tra góc: bỏ qua nếu ngoài hình nón hỗ trợ của tier này (maxAngle = PI nghĩa
                        // là không giới hạn góc — hỗ trợ toàn hướng, dùng cho tier "trong tầm đánh").
                        if (tier.maxAngle < Math.PI) {
                            const dirToEnemy = toEnemy.clone().normalize();
                            const angleTo = Math.acos(THREE.MathUtils.clamp(forward.dot(dirToEnemy), -1, 1));
                            if (angleTo > tier.maxAngle) continue;
                        }

                        if (dist < bestDist) { bestDist = dist; bestEnemy = enemy; }
                    }

                    if (bestEnemy) {
                        const toEnemy = new THREE.Vector3().subVectors(bestEnemy.position, originPos);
                        const targetY = Math.atan2(toEnemy.x, toEnemy.z);
                        return { targetY, lerpSpeed: tier.lerpSpeed, distance: bestDist };
                    }
                }

                return null; // Không có địch nào trong phạm vi -> không hỗ trợ, giữ nguyên hướng hiện tại
            }
            window.findSoftTargetingRotation = findSoftTargetingRotation;

            // --- CẤU HÌNH ATTACK LUNGE (bước tới khi tấn công, v0.9.2) ---
            // Pre-Alpha: giá trị tạm thời, sẽ cân bằng lại sau. Toàn bộ khoảng cách/thời gian lunge
            // tập trung DUY NHẤT ở đây — không hard-code rải rác nơi khác.
            //   maxDistance: quãng đường TỐI ĐA (m) mà 1 lần lunge có thể di chuyển — đây KHÔNG phải
            //                khoảng cách tới mục tiêu, chỉ là giới hạn trên của "1 bước tiến ngắn".
            //   weaponRange: khoảng cách (m) được coi là "đã vào tầm đánh" — lunge sẽ dừng lại tại đây,
            //                không tiến sát/xuyên qua mục tiêu dù maxDistance còn dư. Nên đặt NHỎ HƠN
            //                combatRange thực tế dùng để check trúng đòn trong updateCombat() (hiện là
            //                2.8m thường / 4.2m địch to) để đảm bảo lunge luôn đưa player vào đúng tầm
            //                trúng đòn, không dừng quá xa khiến hụt đòn.
            //   duration: thời gian (giây) trải đều quãng đường lunge — càng ngắn thì lunge càng dứt khoát.
            //   noTargetDistance: quãng đường lunge khi KHÔNG có soft target (đánh vào khoảng không),
            //                     giữ hành vi "bước tới nhẹ" quen thuộc như trước khi có soft targeting.
            const ATTACK_LUNGE_CONFIG = {
                maxDistance: 2.2,
                weaponRange: 1.6,
                duration: COMBAT_TIMING.active,
                noTargetDistance: 0.9
            };

            // Tính quãng đường lunge phù hợp dựa trên khoảng cách hiện tại tới mục tiêu (nếu có).
            // - Không có mục tiêu (targetDistance = null): lunge cố định noTargetDistance theo hướng
            //   đang nhìn, giữ đúng cảm giác "bước tới" quen thuộc khi chém vào khoảng không.
            // - Có mục tiêu: chỉ tiến đủ để khoảng cách còn lại bằng weaponRange, và KHÔNG BAO GIỜ vượt
            //   quá maxDistance trong 1 đòn — địch càng xa (trong phạm vi hỗ trợ) thì mỗi đòn chỉ nhích
            //   tới một đoạn ngắn, không tự động dịch chuyển hết khoảng cách trong 1 lần.
            function calculateLungeDistance(targetDistance) {
                if (targetDistance === null || targetDistance === undefined) {
                    return ATTACK_LUNGE_CONFIG.noTargetDistance;
                }
                const distanceToClose = targetDistance - ATTACK_LUNGE_CONFIG.weaponRange;
                if (distanceToClose <= 0) return 0; // Đã trong tầm đánh, không cần tiến thêm
                return Math.min(distanceToClose, ATTACK_LUNGE_CONFIG.maxDistance);
            }

            // --- CẤU HÌNH GAME FEEL CHO ĐÒN ĐÁNH THƯỜNG (Hit Stop / Enemy Recoil / Camera Shake, v0.9.3) ---
            // Pre-Alpha: giá trị tạm thời, sẽ cân bằng lại sau. Toàn bộ số liệu "cảm giác đánh trúng"
            // tập trung DUY NHẤT ở đây — không hard-code rải rác nơi khác. CHỈ áp dụng cho đòn đánh
            // thường (melee combo) khi trúng mục tiêu; không đụng tới Plunge/Burst/Fall Damage/Dash
            // (các hệ thống đó có camera shake/hiệu ứng riêng, không thuộc phạm vi này).
            //   hitStopDuration: thời gian (giây) toàn bộ game tạm dừng cực ngắn khi đánh trúng — tạo
            //                    cảm giác "khựng lại" có lực. Không áp dụng khi đánh hụt.
            //   enemyRecoilForce: lực đẩy lùi (m/s ban đầu, tự decay theo thời gian) tác động lên kẻ địch
            //                     bị trúng đòn, theo hướng đòn đánh. Tách riêng theo loại kẻ địch để dễ
            //                     cân bằng — địch nhỏ đẩy lùi rõ hơn, địch to đẩy lùi ít hơn (nặng hơn).
            //   cameraShake: biên độ/thời lượng camera rung khi đánh trúng — biên độ càng nhỏ càng ít
            //                gây khó chịu, chỉ nên đủ để tạo phản hồi "có lực" chứ không làm rối mắt.
            //   slashEffect: các con số animate của vệt chém placeholder (player.slashWave, hiện là 1
            //                RingGeometry đơn giản). Tách riêng ở đây để sau này thay bằng hiệu ứng đẹp
            //                hơn (particle/shader/sprite) chỉ cần sửa vài con số, không đụng logic.
            const COMBAT_FEEL_CONFIG = {
                hitStopDuration: 0.05,
                enemyRecoilForce: {
                    normal: 4.5,
                    large: 2.2
                },
                cameraShake: {
                    duration: 0.12,
                    intensity: 0.18
                },
                slashEffect: {
                    startScale: 0.1,
                    endScale: 1.6,
                    startOpacity: 0.9,
                    endOpacity: 0
                }
            };
            window.COMBAT_FEEL_CONFIG = COMBAT_FEEL_CONFIG;

            // --- CẤU HÌNH ELEMENTAL SKILL: TAP (Pressure Shot ngay) / HOLD (Aim State), v0.9.6 ---
            // Pre-Alpha: giá trị tạm thời, sẽ cân bằng lại sau. Toàn bộ ngưỡng/tốc độ/tần suất/camera
            // tập trung DUY NHẤT ở đây — không hard-code rải rác nơi khác.
            //   holdThreshold: thời gian (giây) giữ phím tối thiểu để tính là Hold thay vì Tap.
            //   aim.maxDuration: trần thời gian tối đa (giây) được ở trong Aim State — hết giờ thì tự
            //                    động kết thúc (bắn Pressure Shot) dù người chơi vẫn đang giữ phím.
            //   aim.fireInterval: khoảng cách thời gian (giây) giữa 2 tia nước nhỏ liên tiếp trong lúc
            //                     Aim State — càng nhỏ càng tạo cảm giác "dòng nước liên tục".
            //   aim.cameraZoomDistance: khoảng cách camera-player (targetDistance) khi đang Aim — nhỏ
            //                           hơn khoảng cách bình thường để tạo cảm giác "ngắm gần" hơn.
            //   aim.cameraSideOffset: khoảng lệch (m, world-space theo hướng "phải" của camera) áp dụng
            //                         lên điểm camera nhìn tới — dương = nhân vật lệch TRÁI màn hình.
            //   aim.cameraOffsetLerpSpeed: tốc độ lerp (dùng công thức 1-exp(-speed*dt)) khi chuyển vào/
            //                              ra offset camera — càng lớn chuyển càng nhanh/dứt khoát.
            //   smallShot: thông số tia nước nhỏ bắn liên tục trong Aim State — vẫn là đạn bay theo thời
            //              gian (activeProjectiles), không phải instant beam.
            //   pressureShot: thông số Pressure Shot — INSTANT BEAM (hitscan), không phải đạn bay. Bắn
            //                 ra là gây damage NGAY LẬP TỨC cho mọi enemy trên đường thẳng, hình ảnh chỉ
            //                 xuất hiện rồi biến mất rất nhanh (fadeDuration) để mô phỏng tốc độ cực cao.
            //     maxRange: tầm xa tối đa (m) của tia.
            //     beamRadius: bán kính (m) của hình trụ tia — cũng là bán kính va chạm (kẻ địch cách tâm
            //                 tia trong khoảng này + bán kính riêng của địch sẽ bị tính là trúng đòn).
            //     fadeDuration: thời gian (giây) hiệu ứng hình ảnh tồn tại trước khi biến mất hoàn toàn.
            const ELEMENTAL_SKILL_CONFIG = {
                holdThreshold: 0.2,
                aim: {
                    maxDuration: 3.0,
                    fireInterval: 0.24,
                    cameraZoomDistance: 5.0,
                    cameraSideOffset: 2,
                    cameraOffsetLerpSpeed: 10.0
                },
                smallShot: {
                    speed: 15.0,
                    damage: 0.2, // Hệ số nhân với player.attack.hydroProjectile
                    maxRange: 24,
                    trailChance: 0.6 // Xác suất/frame sinh hạt nước theo đường bay
                },
                pressureShot: {
                    damage: 2, // Hệ số nhân với player.attack.hydroProjectile
                    maxRange: 32,
                    beamRadius: 0.4,
                    fadeDuration: 0.3,
                    recoilDistance: 1.2, // Quãng đường (m) nhân vật bị đẩy lùi sau khi bắn — nhỏ, chỉ
                                          // tăng cảm giác lực, không làm mất kiểm soát nhân vật.
                    recoilDuration: 0.01 // Thời gian (giây) trải đều quãng đường recoil (giống Attack Lunge)
                }
            };
            window.ELEMENTAL_SKILL_CONFIG = ELEMENTAL_SKILL_CONFIG;

            // --- CẤU HÌNH ELEMENTAL BURST: thi triển NGAY khi nhấn (không Aim Mode, không crosshair) ---
            // Pre-Alpha: giá trị tạm thời, sẽ cân bằng lại sau. Toàn bộ ngưỡng/tốc độ/bán kính/lực hút
            // tập trung DUY NHẤT ở đây — không hard-code rải rác nơi khác. Water Bubble là trung tâm
            // của Burst: di chuyển liên tục theo hướng thi triển, bao quanh bởi Water Vortex tạo lực hút
            // Crowd Control (không phải hiệu ứng trang trí — vortex.radius chính là vùng gây lực hút).
            //   bubble.speed: tốc độ (m/s) Bubble di chuyển liên tục theo hướng đã chọn — KHÔNG đứng yên.
            //   bubble.lifetime: thời gian tồn tại tối đa (giây) trước khi Bubble tự tan (nếu chưa hết maxRange).
            //   bubble.maxRange: quãng đường tối đa (m) Bubble có thể đi được trước khi tự tan.
            //   bubble.radius: bán kính (m) của lõi Bubble — enemy lọt vào lõi mới nhận damage trực tiếp.
            //   bubble.pulseSpeed / pulseAmount: tốc độ/biên độ phồng-co nhẹ (sin wave) để Bubble có cảm
            //                                    giác là khối nước "sống", không phải quả cầu cứng.
            //   vortex.radius: bán kính (m) vùng lực hút bao quanh Bubble — LỚN HƠN bubble.radius.
            //   vortex.rotationSpeed: tốc độ xoay hình ảnh của vortex (rad/s) — thuần thẩm mỹ.
            //   pull.smallEnemyForce: lực hút (m/s, áp vào velocity mỗi frame) tác động lên quái nhỏ —
            //                         đủ để kéo từ từ về phía Bubble, KHÔNG dịch chuyển tức thời/teleport.
            //   pull.largeEnemySlowFactor: hệ số nhân vào tốc độ di chuyển của quái to khi trong vortex
            //                              (0..1, càng nhỏ càng khựng mạnh) — quái to KHÔNG bị hút hoàn
            //                              toàn, chỉ giảm tốc/gián đoạn chuyển động trong thời gian ngắn.
            //   pull.largeEnemyStaggerDuration: thời gian (giây) hiệu ứng khựng/giảm tốc còn áp dụng lên
            //                                   quái to SAU KHI nó rời khỏi vortex (tính từ lúc rời) —
            //                                   tránh việc quái to thoát khỏi khựng ngay lập tức khi vừa
            //                                   ra khỏi bán kính, tạo cảm giác "gián đoạn chuyển động".
            //   damage: hệ số nhân với player.attack.burst — áp dụng khi enemy ở trong bubble.radius
            //           (lõi Bubble), KHÔNG áp dụng cho enemy chỉ đang bị vortex hút (đó thuần là CC).
            //   damageTickInterval: khoảng cách (giây) tối thiểu giữa 2 lần gây damage liên tiếp lên
            //                       CÙNG MỘT enemy trong lõi Bubble — tránh damage dồn dập mỗi frame.
            const BURST_CONFIG = {
                bubble: {
                    speed: 2,
                    lifetime: 14,
                    maxRange: 12,
                    radius: 1,
                    pulseSpeed: 4.0,
                    pulseAmount: 0.06
                },
                vortex: {
                    radius: 3,
                    rotationSpeed: 10
                },
                pull: {
                    smallEnemyForce: 3,
                    largeEnemySlowFactor: 1,
                    largeEnemyStaggerDuration: 0.3
                },
                damage: 0.5, // Hệ số nhân với player.attack.burst
                damageTickInterval: 0.35
            };
            window.BURST_CONFIG = BURST_CONFIG;

            // burstAimState.phase giữ nguyên 'idle' vĩnh viễn (Burst không còn Hold/Aim Mode) — vẫn giữ
            // object này lại vì canUseBurst() và các đoạn dọn dẹp state khi chết/đuối nước còn tham chiếu
            // tới phase !== 'idle' như một lớp bảo vệ; không còn nơi nào set nó khác 'idle' nữa.
