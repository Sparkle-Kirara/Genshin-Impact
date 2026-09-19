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

            // calculateFinalDamage(statValue, def, multiplier = 1):
            //   Final Damage = (statValue × multiplier) × DEFENSE_CONSTANT / (DEFENSE_CONSTANT + DEF)
            //
            //   Talent System v1 — Ý NGHĨA tham số đầu tiên MỞ RỘNG: trước đây LUÔN là ATK
            //   (player.stats.atk/enemy.stats.atk) vì mọi damage chỉ scale theo ATK. Từ Talent
            //   System v1, statValue là GIÁ TRỊ CỦA STAT ĐƯỢC SCALING (đọc qua getTalentMultiplier()
            //   trong combat.js, có thể là ATK/HP/DEF tùy khai báo talents.*.scaling.stat trong
            //   CHARACTER_ROSTER — KHÔNG hard-code luôn là ATK nữa). Enemy melee thường (Slime đánh
            //   Player) và mọi lời gọi CŨ vẫn truyền enemy.stats.atk/player.stats.atk như trước —
            //   HÀNH VI KHÔNG ĐỔI, chỉ Ý NGHĨA tên tham số tổng quát hơn. Công thức/logic bên dưới
            //   GIỮ NGUYÊN 100%, không đổi 1 dòng.
            //
            //   def: chỉ số DEF của bên nhận sát thương.
            //   multiplier: hệ số riêng theo LOẠI đòn đánh — GIỮ Ý NGHĨA CŨ (hệ số nhân lên statValue
            //               trước khi đưa vào công thức giảm theo DEF). Mặc định 1 cho các trường hợp
            //               không có multiplier riêng (VD đòn đánh thường của Enemy lên Player).
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

            // --- STAMINA CONFIG (Pre-Alpha Stabilization — Stamina System Rework, v0.9 → Alpha) ---
            // Gom TOÀN BỘ thông số Stamina vào 1 nơi duy nhất — không hardcode rải rác trong
            // updateStamina() (08-physics-combat-camera-loop.js) hay triggerDash()
            // (06-camps-save-system.js) như bản cũ (v0.8.0). Mọi việc cân bằng lại sau này (Alpha,
            // Beta, hoặc mở rộng qua Statue/Food/Talent/Passive — xem spec "Khả năng mở rộng") chỉ cần
            // sửa object này, không cần lục lại logic ở nhiều file.
            //
            // Tên field khớp chính xác với tên biến trong spec gốc (SWIM_STROKE_INTERVAL,
            // SWIM_STROKE_COST, SWIM_SPRINT_START_COST, SWIM_SPRINT_COST_PER_SECOND) để dễ đối chiếu
            // ngược lại tài liệu thiết kế.
            const STAMINA_CONFIG = window.STAMINA_CONFIG = {
                MAX_STAMINA: 100.0,
                MIN_STAMINA: 0.0,

                // Sprint (giữ nút chạy nhanh trên cạn) — tiêu hao liên tục theo dt.
                SPRINT_COST_PER_SECOND: 18.0,

                // Dash — tiêu hao tức thời 1 lần mỗi lần thực hiện, dùng chung cho cả Dash trên cạn và
                // Dash-khi-đang-bơi (triggerDash() trong 06-camps-save-system.js gọi chung 1 field này
                // cho cả 2 nhánh, thay vì 2 số hardcode riêng biệt như bản cũ — 15.0 ở cả 2 chỗ).
                DASH_COST: 18.0,

                // Climbing — tiêu hao liên tục khi đang di chuyển trên tường (không di chuyển thì
                // không trừ — xem updateStamina()).
                CLIMB_COST_PER_SECOND: 10.0,
                // Climb Jump — tiêu hao tức thời khi nhảy trong lúc leo. Không đủ thì chặn nhảy, không
                // trừ âm (giống Dash: "không đủ thì không cho thực hiện").
                CLIMB_JUMP_COST: 25.0,

                // Gliding — MỚI (trước đây Glide không tiêu hao gì, xem đối chiếu ở phần trò chuyện).
                GLIDE_COST_PER_SECOND: 3.0,

                // --- SWIM STROKE TIMER (độc lập hoàn toàn với animation timer — swimOscillationTimer
                // trong updatePhysics() chỉ phục vụ hiển thị/tilt mesh, KHÔNG được đụng vào hay dùng để
                // tính stamina). Bơi thường: cứ mỗi SWIM_STROKE_INTERVAL giây hoàn thành 1 nhịp bơi thì
                // trừ SWIM_STROKE_COST 1 lần — không trừ theo dt từng frame.
                SWIM_STROKE_INTERVAL: 0.8,
                SWIM_STROKE_COST: 4.0,

                // Swim Sprint — trừ tức thời SWIM_SPRINT_START_COST khi bắt đầu (chuyển sang
                // swimState='fast'), sau đó trừ liên tục SWIM_SPRINT_COST_PER_SECOND theo dt. Không
                // dùng Swim Stroke Timer khi đang ở trạng thái này.
                SWIM_SPRINT_START_COST: 2.0,
                SWIM_SPRINT_COST_PER_SECOND: 10.2,

                // --- HỒI PHỤC (Regen) ---
                // Chỉ bắt đầu hồi sau khi KHÔNG thực hiện bất kỳ hành động tiêu hao nào (Sprint, Dash,
                // Climb, Swim [stroke lẫn sprint], Glide) trong REGEN_DELAY_SECONDS liên tục. Sprint
                // hoặc Dash ngay trong lúc đang đếm/đang hồi sẽ HỦY hồi và RESET lại bộ đếm — xem
                // updateStamina() cho state machine đầy đủ theo từng trạng thái.
                REGEN_DELAY_SECONDS: 1.5,
                REGEN_PER_SECOND: 21.0,

                // Floating/Idle dưới nước (đứng yên, không Sprint không di chuyển) — KHÔNG tiêu hao,
                // KHÔNG hồi phục, hoàn toàn trung lập. Giữ riêng hằng số này (thay vì tái dùng
                // REGEN_PER_SECOND = 0) để ý định rõ ràng khi đọc code.
                SWIM_IDLE_REGEN_PER_SECOND: 0.0,

                // --- UI: VÒNG TRÒN THỂ LỰC (Genshin-style Stamina Wheel) ---
                // Giữ nguyên thiết kế UI hiện có (SVG ring + CSS transition-all duration-75 để mượt) —
                // chỉ gom 2 ngưỡng số vốn hardcode rải rác trong khối UI của updatePhysics() vào đây.
                UI_VISIBLE_THRESHOLD_PCT: 0.98,   // Vòng tròn chỉ hiện khi stamina/maxStamina < ngưỡng này
                UI_LOW_WARNING_THRESHOLD_PCT: 0.22, // Dưới ngưỡng này, vòng tròn đổi màu đỏ cảnh báo
            };

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
                // Alpha v1.0 — Character System: "hydroProjectile" đổi thành "skill" — hệ số nhân
                // TỔNG QUÁT cho Elemental Skill của BẤT KỲ nhân vật/nguyên tố nào (đọc bởi Character
                // Engine, xem 09-character-system.js), không còn hard-code riêng theo Hydro. Giá trị
                // giữ nguyên 1.5, chỉ đổi tên field.
                attack: { melee: 1, plunge: 2, burst: 2.5, skill: 1.5 },
                // Energy System Fix v1: energy/maxEnergy đổi thành GETTER/SETTER trỏ vào
                // partyState[activeCharacterIndex] — TRƯỚC ĐÂY là 2 field number CỐ ĐỊNH ngay trên
                // player (dùng CHUNG cho cả party, không tách theo nhân vật — bug đã xác nhận: switch
                // nhân vật vẫn giữ nguyên energy/maxEnergy của nhân vật trước, ví dụ Character #1 đầy
                // 50/50 thì Character #2 cũng hiện 50/50 dù maxEnergy thật của #2 là 80). Từ v1: ĐÚNG
                // pattern hp/maxHp phía trên — player.energy/maxEnergy đọc/ghi XUYÊN QUA vào đúng
                // partyState[activeCharacterIndex].energy/maxEnergy, tự động đổi đúng số khi
                // switchToCharacter() đổi activeCharacterIndex, KHÔNG cần copy tay ở nơi gọi
                // (activeCharacterIndex/partyState khai báo PHÍA SAU trong cùng file — AN TOÀN vì
                // getter chỉ evaluate lúc GỌI lúc gameplay, không phải lúc parse/khai báo object này).
                get energy() { return partyState[activeCharacterIndex] ? partyState[activeCharacterIndex].energy : 0; },
                set energy(v) { if (partyState[activeCharacterIndex]) partyState[activeCharacterIndex].energy = v; },
                get maxEnergy() { return partyState[activeCharacterIndex] ? partyState[activeCharacterIndex].maxEnergy : 50; },
                set maxEnergy(v) { if (partyState[activeCharacterIndex]) partyState[activeCharacterIndex].maxEnergy = v; },
                skillHitCount: 0,

                // Alpha v1.0 — Character System: nơi lưu effect Skill/Burst đang tồn tại (đạn bay,
                // quả cầu nước...), thay thế activeProjectiles (đã xóa) + các field rời burstSphere/
                // burstDir/burstDistTraveled/burstRotTimer/burstLifeTimer/burstHitCooldowns/
                // burstStaggeredEnemies/isBursting (đã xóa, xem executeCharacterSkill/
                // executeCharacterBurst trong 09-character-system.js). Mỗi slot là 1 MẢNG (không
                // phải object đơn) vì 1 nhân vật có thể có nhiều effect cùng loại tồn tại song song
                // (VD nhiều viên Small Shot bay cùng lúc trong lúc giữ Aim Mode).
                // Character #2 (Bow) Validation — slot `arrows` MỚI, TÁCH RIÊNG khỏi skill/burst
                // (Arrow không phải Skill/Burst — là Normal Attack/Charged Attack của vũ khí Bow).
                // Cùng pattern mảng như skill/burst (nhiều mũi tên bay cùng lúc, VD Shot #3 bắn 2
                // arrow gần như liên tiếp) — dùng CHUNG dispatcher updateActiveEffects() (file 09,
                // MỞ RỘNG thêm slot 'arrows' vào vòng lặp ['skill','burst'] hiện có, KHÔNG tạo game
                // loop / update function riêng).
                activeEffects: { skill: [], burst: [], arrows: [] },

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
                // Character #2 (Bow) Validation — softTargetEnemy: reference tới Enemy đã được chọn
                // bởi TargetAssist.getNearestTarget() (02-collision-and-stats-core.js) lúc bắt đầu Bow
                // Normal Attack — null nếu không có target hợp lệ. LƯU REFERENCE (không phải góc/
                // hướng đã tính sẵn) vì spec mục 5 yêu cầu origin của aim direction phải là VỊ TRÍ
                // SPAWN THẬT của từng arrow (có thể khác nhau giữa các arrow trong cùng Shot #3) —
                // applyBowArrowSpawnTick() (combat.js) gọi TargetAssist.getAimDirection(spawnPosition,
                // softTargetEnemy) MỖI LẦN spawn arrow, dùng ĐÚNG origin thật của arrow đó, nhưng vẫn
                // là CÙNG 1 target đã chọn từ đầu shot (không re-tìm target giữa chừng — đúng spec
                // mục 6 "Target Assist chỉ hỗ trợ hướng TẠI THỜI ĐIỂM attack", không homing). Set lại
                // null sau khi shot đó bắt đầu 'active' xong hoặc khi trigger shot mới — reset ở
                // triggerAttack() (combat.js), tương tự softTargetLockY.
                softTargetEnemy: null,

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

                // --- HỆ THỐNG THỂ LỰC (Pre-Alpha Stabilization — Stamina System Rework, thay v0.8.0) ---
                // maxStamina đổi từ 60 → 100 theo spec mới (STAMINA_CONFIG.MAX_STAMINA — xem đối chiếu
                // với con số cũ trong lịch sử trò chuyện). Save cũ (nếu có, thang 60) KHÔNG được migrate
                // tự động — quyết định đã chốt: pre-alpha, người chơi start new game là đủ.
                stamina: STAMINA_CONFIG.MAX_STAMINA, maxStamina: STAMINA_CONFIG.MAX_STAMINA,
                isDrowning: false, drownTimer: 0.0,

                // swimStrokeTimer: bộ đếm ĐỘC LẬP với swimOscillationTimer (animation-only, không đụng
                // tới) — đếm tới STAMINA_CONFIG.SWIM_STROKE_INTERVAL thì trừ SWIM_STROKE_COST 1 lần và
                // tự reset về 0. Chỉ chạy khi đang bơi VÀ đang di chuyển VÀ không phải Swim Sprint.
                swimStrokeTimer: 0.0,

                // staminaRegenDelayTimer: đếm NGƯỢC từ STAMINA_CONFIG.REGEN_DELAY_SECONDS mỗi frame
                // không tiêu hao gì; về 0 thì bắt đầu hồi ở REGEN_PER_SECOND. Bất kỳ hành động tiêu hao
                // nào (đặc biệt Sprint/Dash theo spec) sẽ reset timer này về REGEN_DELAY_SECONDS ngay
                // lập tức — xem updateStamina() trong 08-physics-combat-camera-loop.js.
                staminaRegenDelayTimer: 0.0,

                // isStaminaExhausted: cờ đánh dấu "vừa hết sạch Stamina trong lúc hoàn thành 1 Swim
                // Stroke" — theo đúng spec Swim Stroke: "Sau khi Stroke kết thúc, không được bắt đầu
                // Stroke tiếp theo" + "Kích hoạt trạng thái hết Stamina". Bản thân cờ này KHÔNG tự kích
                // hoạt triggerDrowningSequence() — chỉ chặn Swim Stroke mới; cơ chế chìm/thất bại đầy đủ
                // khi hết Stamina lúc bơi (kể cả ngoài Swim Sprint) đã có sẵn qua nhánh
                // "player.stamina <= 0 && player.isSwimming" trong updateStamina().
                isStaminaExhausted: false,

                // Alpha v1.0 — Character System: isBursting/burstSphere/burstDir/burstDistTraveled/
                // burstRotTimer (và burstLifeTimer/burstHitCooldowns/burstStaggeredEnemies, vốn được
                // updateBurst() cũ tự khởi tạo lười — không có dòng khai báo tường minh ở đây) đã bị
                // XÓA — state tương ứng giờ nằm trong player.activeEffects.burst[i].custom (xem
                // runWaterBubbleEffect/updateWaterBubbleEffect trong 09-character-system.js). Điều
                // kiện "đang có Burst active" giờ kiểm tra qua player.activeEffects.burst.length > 0
                // (xem canUseBurst() đã cập nhật trong combat.js).

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

                speed: 6.2,           
                sprintSpeed: 13.0,    
                walkSpeed: 2.5  ,       
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

                // Combo Attack System v1: comboIndex (1-based) — đòn ĐANG chạy trong chuỗi combo.
                // 0 = không trong combo nào (idle). KHÔNG phải state machine mới — attackState vẫn
                // mô tả đúng giai đoạn vật lý (windup/active/recovery) của BẤT KỲ đòn nào trong
                // combo; comboIndex chỉ nói "đang ở đòn thứ mấy". Reset về 0 khi Combo Window đóng
                // mà không có input tiếp theo (xem updateCombat() trong 08-physics-combat-camera-
                // loop.js). Combo progression KHÔNG phụ thuộc hit/damage — chỉ phụ thuộc timing +
                // input (yêu cầu đã xác nhận).
                comboIndex: 0,

                // Charged Attack v1 — Auto-trigger v2: state RIÊNG, hoàn toàn tách biệt khỏi
                // comboIndex/attackBuffered của Normal Attack Combo. chargeTimer đếm THỜI GIAN GIỮ
                // NÚT Attack (chỉ chạy khi attackState === 'charging' — xem handleAttackDown() trong
                // combat.js). TỪ v2: khi chargeTimer đạt chargedAttack.chargeTime (đọc qua
                // getChargedAttackConfig()), Charged Attack TỰ ĐỘNG thi triển NGAY (không cần thả nút
                // nữa — xem updateCombat() nhánh 'charging' trong file 08). chargeReady GIỮ LẠI trong
                // schema (không xoá field, tránh phá vỡ chỗ khác lỡ đọc) nhưng KHÔNG còn ý nghĩa
                // "chờ release" — chỉ còn dùng làm cờ nội bộ đánh dấu "đã tự bắn" để handleAttackUp()
                // không xử lý lại khi người chơi thả nút SAU khi đòn đã tự thi triển.
                chargeTimer: 0, chargeReady: false,
                // Charged Attack v1 — Buffer nối tiếp (Auto-trigger v2): trong lúc Charged Attack
                // đang chạy (chargedWindup/chargedActive/chargedRecovery), THẢ tay ra rồi GIỮ LẠI đủ
                // chargeTime lần nữa sẽ đánh dấu chargedAttackBuffered = true — khi chargedRecovery
                // kết thúc, nếu có buffer -> tự thi triển Charged Attack KẾ TIẾP ngay lập tức. Yêu
                // cầu đã xác nhận: giữ LIÊN TỤC không thả tay từ đầu KHÔNG được tính vào buffer — bắt
                // buộc phải có ít nhất 1 lần thả tay trước khi bắt đầu đếm lại. chargedRebuffTimer
                // đếm THỜI GIAN GIỮ LẠI này — TÁCH BIỆT hoàn toàn khỏi chargeTimer (vốn chỉ dùng cho
                // lần charge ĐẦU TIÊN từ idle, ở attackState === 'charging') vì trong lúc buffer,
                // attackState đang là chargedWindup/chargedActive/chargedRecovery, KHÔNG phải
                // 'charging'. Nếu giữ chưa đủ giờ khi chargedRecovery kết thúc -> rơi về Normal
                // Attack (yêu cầu đã xác nhận), xem updateCombat() trong file 08.
                chargedRebuffTimer: 0, chargedAttackBuffered: false,
                // chargedRebuffArmed: cờ "đã thả tay lại ít nhất 1 lần trong đòn Charged Attack hiện
                // tại, cho phép bắt đầu đếm chargedRebuffTimer nếu giữ lại". Reset về false MỖI LẦN
                // triggerChargedAttack() chạy (chu kỳ mới). Bật true ngay khi isAttackHeld chuyển
                // false trong lúc Charged Attack đang chạy — xem updateCombat() (file 08). Không có
                // field này thì KHÔNG PHÂN BIỆT được "giữ liên tục xuyên suốt" (không tính buffer,
                // theo yêu cầu) với "thả ra rồi giữ lại" (có tính buffer).
                chargedRebuffArmed: false,
                // isAttackHeld: cờ THEO DÕI nút Attack hiện có đang được giữ hay không (true từ lúc
                // handleAttackDown() tới lúc handleAttackUp() — xem combat.js). Input chỉ tới qua sự
                // kiện rời rạc (mousedown/mouseup), nhưng updateCombat() (file 08) cần biết trạng
                // thái này MỖI FRAME để tăng chargedRebuffTimer trong lúc Charged Attack đang chạy
                // (buffer nối tiếp) — không có polling nào khác cho trạng thái giữ chuột/tay.
                isAttackHeld: false,
                // heldThroughComboTimer: ĐỘ TRỄ XÁC NHẬN "giữ có chủ đích" (yêu cầu đã xác nhận) —
                // KHÔNG tự động bắt đầu charge NGAY LẬP TỨC tại thời điểm windup/active chuyển sang
                // recovery/comboGrace nữa (gây bug: tap NHANH để nối combo bình thường, tay chưa kịp
                // nhả đúng lúc frame chuyển state chạy tới, bị hiểu nhầm thành "giữ để charge", cướp
                // mất input tap #2 hợp lệ). Thay vào đó: khi vừa chuyển sang recovery/comboGrace mà
                // isAttackHeld vẫn true, bắt đầu đếm timer này — chỉ THỰC SỰ gọi lại handleAttackDown()
                // để bắt đầu charge nếu isAttackHeld vẫn còn true LIÊN TỤC sau khi đạt ngưỡng
                // HELD_THROUGH_COMBO_DELAY (xem combat.js) — đủ ngắn để không cảm nhận được độ trễ khi
                // charge thật, đủ dài để lọc bỏ tap nhanh. Reset về 0 mỗi khi isAttackHeld chuyển false
                // (mouseup) hoặc mỗi khi bắt đầu 1 đòn Normal Attack mới (windup) — xem updateCombat()
                // (file 08).
                heldThroughComboTimer: 0,
                // hasHitList RIÊNG cho Charged Attack (Charged Attack KHÔNG dùng chung
                // player.hasHitList của Normal Attack — theo đúng yêu cầu "Charged Attack phải có
                // hit tracking riêng"). Reset mỗi lần triggerChargedAttack() chạy (xem combat.js).
                //
                // Multi-Hit v2: TỪ v2, mỗi phần tử là CHUỖI "enemyId:hitIndex" (KHÔNG còn chỉ
                // enemyId) — cho phép các hit KHÁC NHAU trong CÙNG 1 Charged Attack instance trúng
                // CÙNG 1 enemy (VD hit #1 và hit #2 cùng trúng enemy X — 2 chuỗi khác nhau
                // "X:0"/"X:1"), trong khi VẪN chặn đúng 1 hit cụ thể trúng cùng enemy quá 1 lần (VD
                // enemy X đứng nguyên trong tầm suốt nhiều frame của cùng 1 hit -> chỉ trúng 1 lần
                // duy nhất cho hitIndex đó). Toàn bộ mảng reset về [] CHỈ khi triggerChargedAttack()
                // chạy (1 LẦN cho cả chuỗi multi-hit/multi-animation — "Charged Attack multi-hit vẫn
                // là MỘT instance", yêu cầu đã xác nhận) — KHÔNG reset giữa các animation segment/hit.
                chargedHasHitList: [],
                // chargedAttackElapsed: đếm XUÔI (giây) từ 0, tính từ lúc player.attackState chuyển
                // sang 'chargedActive' (reset về 0 tại thời điểm đó — xem updateCombat() file 08).
                // DÙNG DUY NHẤT để so khớp với hits[i].time (yêu cầu đã xác nhận: "hits[] tính TỪ LÚC
                // chargedActive bắt đầu", ĐỘC LẬP hoàn toàn với animations[]/chargedAnimIndex bên
                // dưới — 2 cơ chế tách biệt). KHÔNG dùng cho windup/recovery (hits chỉ xảy ra trong
                // active — theo đúng dữ liệu hiện tại đã chuyển đổi, xem 10-character-roster.js).
                chargedAttackElapsed: 0,
                // chargedHitsTriggered: mảng boolean cùng độ dài hits[] — đánh dấu hit[i] ĐÃ ĐƯỢC
                // "mở" (tới thời điểm time của nó) hay chưa, TÁCH BIỆT khỏi chargedHasHitList (vốn
                // track theo TỪNG enemy) — hit có thể "mở" (đã tới lúc) nhưng CHƯA có enemy nào trong
                // tầm để trúng; mảng này chỉ đảm bảo KHÔNG chạy lại logic "mới mở hit" (hiệu ứng SFX/
                // hitstop MỘT LẦN cho mỗi hit) nhiều lần. Reset cùng lúc với chargedAttackElapsed.
                chargedHitsTriggered: [],
                // chargedAnimIndex/chargedPhaseElapsed: theo dõi animation segment ĐANG CHẠY trong
                // PHASE HIỆN TẠI (windup/active/recovery — 3 tên attackState GIỮ NGUYÊN, yêu cầu đã
                // xác nhận "giữ 3 state cũ, nhiều segment TRONG từng state"). chargedAnimIndex là INDEX
                // trong danh sách animation segment đã được lọc theo đúng phase (0-based, reset về 0
                // mỗi khi chuyển sang phase mới — VD windup->active reset lại 0 cho danh sách segment
                // của active). chargedPhaseElapsed đếm XUÔI (giây) thời gian đã trôi qua TRONG segment
                // đang chạy (reset về 0 mỗi khi chuyển sang segment kế/phase kế) — dùng để tính prog
                // nội suy animation. HOÀN TOÀN TÁCH BIỆT khỏi chargedAttackElapsed (dùng cho hits[]).
                chargedAnimIndex: 0, chargedPhaseElapsed: 0,
                // chargedAttackForward: hướng tấn công (THREE.Vector3), TÍNH 1 LẦN DUY NHẤT lúc
                // player.attackState chuyển sang 'chargedActive' — DÙNG LẠI cho MỌI hit trong hits[]
                // xảy ra trong lần active đó (yêu cầu thiết kế Multi-Hit v2: hit sau vẫn đánh theo
                // hướng lúc BẮT ĐẦU active, KHÔNG xoay theo hướng camera/di chuyển giữa 2 hit — tránh
                // hành vi lạ nếu người chơi xoay người giữa chừng). Khởi tạo Vector3(0,0,1) vô hại,
                // GIÁ TRỊ THẬT được gán lại (.set()) mỗi lần chuyển sang chargedActive (xem
                // updateCombat() file 08) — không dùng giá trị khởi tạo này để tính damage/hit thật.
                chargedAttackForward: new THREE.Vector3(0, 0, 1),

                // Idle Animation (Character Foundation — procedural bob dùng sin()): tích lũy thời
                // gian ĐỘC LẬP với dt/FPS, chỉ tăng khi Idle bob đang thực sự chạy (attackState ===
                // 'idle' và không bơi/leo/dash/plunge/di chuyển tích cực — xem updatePhysics() trong
                // 08-physics-combat-camera-loop.js). KHÔNG phải animation state machine mới, chỉ là 1
                // bộ đếm thời gian để sin() không phụ thuộc FPS.
                idleAnimTimer: 0,

                // Arm Sway / Inertia v1 (Character Movement): vị trí Y "trễ" (lagged) của từng tay so
                // với base pose, tạo cảm giác quán tính khi di chuyển — CHỈ dùng trong nhánh Movement
                // lean hiện có (không phải state machine mới, chỉ là 2 số runtime lưu độ trễ). Nguồn
                // chính là player.inputVelocity (KHÔNG dùng sin(time) độc lập). Khởi tạo 0 = trùng
                // base pose lúc chưa di chuyển.
                leftHandSwayVelocity: 0,
                rightHandSwayVelocity: 0,
                hasHitList: [], sword: null, slashWave: null,

                // Character #2 (Bow) Validation — Normal Attack Arrow Spawn Tracking: TÁCH RIÊNG
                // khỏi hasHitList (đó là kết quả VA CHẠM của melee cone-hit, không áp dụng cho Bow —
                // xem spec mục 2 "Damage phải phụ thuộc collision thực tế", KHÔNG dùng hasHitList
                // kiểu "chạm 1 lần" cho arrow). arrowsSpawnedThisShot: mảng boolean cùng độ dài
                // combo[comboIndex-1].arrows[] của SHOT ĐANG CHẠY — đánh dấu arrow[i] đã được SPAWN
                // (chưa nói tới việc có TRÚNG hay không — trúng/không do chính projectile tự quyết
                // định qua va chạm, xem 09-character-system.js) hay chưa, để applyBowArrowSpawnTick()
                // (combat.js) không spawn trùng 1 arrow nhiều lần trong cùng 1 shot. Reset MỖI LẦN
                // triggerAttack() bắt đầu 1 shot mới (kể cả nối combo) — xem combat.js.
                arrowsSpawnedThisShot: [],

                // Character #3 (Polearm) Validation — Normal Attack Multi-Hit Tracking: TÁCH RIÊNG
                // khỏi hasHitList (melee 1-hit-per-slot của Sword, chỉ track theo enemy.id — KHÔNG hỗ
                // trợ "1 animation nhiều hit" theo spec Polearm mục 7) và arrowsSpawnedThisShot (Bow,
                // không liên quan damage event melee). ĐÚNG PATTERN chargedHitsTriggered/
                // chargedHasHitList (Sword Charged Attack, xem bên dưới) NHƯNG áp dụng cho Normal
                // Attack combo — vì mỗi combo SLOT (Attack #1/#2/#3...) của Polearm có thể tự khai báo
                // hits[] riêng (VD Attack #3 có Hit#1+Hit#2, spec mục 7), track ĐỘC LẬP theo comboIndex
                // hiện tại — RESET mỗi lần bắt đầu 1 đòn combo mới (windup), giống hasHitList/
                // arrowsSpawnedThisShot (xem combat.js, chỗ reset comboIndex).
                //
                // polearmHitsTriggered: mảng boolean, index = hitIndex trong
                // talents.normalAttack.combo[comboIndex-1].hits[] — đánh dấu hit đó đã "mở" (tới đúng
                // thời điểm trong animation) hay chưa, độc lập với việc CÓ enemy nào bị trúng không.
                polearmHitsTriggered: [],
                // polearmHasHitList: mảng string "enemyId:hitIndex" — ĐÚNG PATTERN chargedHasHitList
                // (KHÔNG PHẢI chỉ enemyId) để 1 enemy có thể trúng NHIỀU hit khác nhau trong CÙNG 1
                // đòn combo (multi-hit đúng nghĩa) nhưng không trúng lại đúng 1 hit đã ăn rồi.
                polearmHasHitList: [],

                // Character #2 (Bow) Validation — Bow Charged Attack (Aim Mode) state: TÁCH RIÊNG
                // hoàn toàn khỏi chargeTimer/chargedWindup/... của Character #1 (Sword) — Bow Charged
                // Attack KHÔNG dùng state machine chargedWindup/chargedActive/chargedRecovery (đó là
                // charge-tại-chỗ multi-hit), mà tái dùng skillAimState (file 03) làm Aim Mode, chỉ
                // kích hoạt từ input Attack (mousedown) thay vì input Skill (phím E) — xem combat.js.
                // bowAimChargeTimer: đếm XUÔI (giây) từ lúc Aim Mode (skillAimState.phase==='aiming')
                // bắt đầu do Charged Attack Bow kích hoạt — dùng để tra Charge Level hiện tại qua
                // bowChargedAttack.levels[].minChargeTime (talents, file 10). Reset về 0 mỗi lần bắt
                // đầu Aim Mode MỚI do Bow (không dùng chung/đụng skillAimState.aimTimer, vốn phục vụ
                // trần thời gian Elemental Skill Hold — 2 mục đích khác nhau dù cùng object phase).
                bowAimChargeTimer: 0,
                // isBowChargedAiming: cờ đánh dấu "Aim Mode hiện tại được kích hoạt BỞI Charged
                // Attack Bow" (khác Aim Mode do phím Skill/E kích hoạt) — CẦN THIẾT vì skillAimState
                // dùng CHUNG cho cả 2 nguồn, updateSkillAim()/endSkillAim() (combat.js) phải biết rẽ
                // nhánh đúng: kích hoạt do Skill -> executeCharacterSkill() (hành vi cũ, KHÔNG đổi);
                // kích hoạt do Bow Charged Attack -> bắn arrow theo Charge Level + trigger recovery
                // riêng của Bow (KHÔNG gọi executeCharacterSkill(), nhân vật Bow không có skillId).
                isBowChargedAiming: false,
                // Character #2 (Bow) Validation — Arrow Visual/Charge Effect (spec mục 5): tham chiếu
                // mesh MŨI TÊN ĐANG GẮN TRÊN CUNG lúc Aim Mode (KHÁC hoàn toàn arrow projectile thật
                // trong player.activeEffects.arrows — đây chỉ là visual TĨNH đặt tại shooting point,
                // không di chuyển/không va chạm, chỉ tồn tại trong lúc đang giữ Aim). null khi không
                // aim. Tạo/hủy bởi startBowArrowPreview()/clearBowArrowPreview() (combat.js), cập
                // nhật màu/scale theo Charge Level bởi updateBowArrowPreview() (combat.js) — MỖI FRAME
                // trong updateBowAimChargeTick().
                bowAimArrowPreview: null,

                // Elemental Skill Validation — isDecoyPlacing: cờ đánh dấu "Aim Mode hiện tại được
                // kích hoạt BỞI Decoy Bomb Placement Mode" — CÙNG NGUYÊN TẮC với isBowChargedAiming ở
                // trên (skillAimState dùng CHUNG cho 3 nguồn: Elemental Skill Hold của Character #1,
                // Bow Charged Attack, và giờ thêm Decoy Placement). updateSkillAim()/endSkillAim()
                // (combat.js) đọc field này để rẽ nhánh: Placement Mode -> deployDecoy() tại điểm
                // raycast (KHÔNG bắn theo hướng như executeCharacterSkill()/endBowChargedAttack()).
                isDecoyPlacing: false,

                // Passive/Unique Mechanic — "Overwatch" (Phase 1, Character #2): overwatchTimer đếm
                // NGƯỢC (giây) từ lúc deployDecoy() thành công (đúng nhân vật có talents.passive.
                // overwatch — data-driven, KHÔNG hard-code theo nhân vật/id nào ở đây). Field này KHÔNG
                // đặt trong partyState (khác skillCooldownTimer/energy — những field per-character cần
                // giữ riêng khi switch nhân vật) vì Passive/buff timing này gắn với chính THAO TÁC
                // Charged Attack sắp tới của Player, ngữ nghĩa tạm thời giống bowAimChargeTimer hơn là
                // state bền theo từng Character — nếu switch Character giữa lúc overwatchTimer > 0,
                // hành vi thực tế: Character mới (nếu không có talents.passive.overwatch) đơn giản
                // không đọc field này, cửa sổ coi như "lãng phí" (chấp nhận được, ngoài phạm vi test kỹ
                // ở Phase 1 — sẽ xem lại tại Phase 6 Integration Test nếu cần).
                overwatchTimer: 0,
                // overwatchActiveForThisCharge: cờ SNAPSHOT tại triggerBowChargedAttack() — TIÊU THỤ
                // overwatchTimer NGAY LẬP TỨC lúc đó (set về 0), rồi cờ này giữ hiệu lực buff cho SUỐT
                // phiên charge hiện tại (từ lúc bắt đầu giữ nút tới lúc release/hủy) — đọc bởi
                // getCurrentBowChargeLevel()/updateBowAimChargeTick() (combat.js) để cộng
                // chargeTimeBonus vào giá trị so sánh Charge Level. Reset về false tại
                // endBowChargedAttack() (dọn dẹp sau khi dùng, tránh rò rỉ sang phiên charge kế tiếp
                // không liên quan) — xem chi tiết đầy đủ trong combat.js.
                overwatchActiveForThisCharge: false,

                // Character #3 Validation — Burst State fields. GIỮ TRÊN player (session), KHÔNG
                // chuyển xuống partyState[i] (Q&A Integration Test đã chốt: chặn switchToCharacter()
                // trong lúc Burst State active thay vì di chuyển state — đơn giản hơn, đủ an toàn).
                isBurstStateActive: false,
                burstStateTimer: 0,
                burstStateExitPending: false,
                thunderCharge: 0,           // 0-3, CHỈ tồn tại trong Burst State — reset 0 khi bắt
                                            // đầu VÀ khi kết thúc Burst State (không carryover)
                thunderChargeCooldownTimer: 0, // đếm ngược SAU Thunder Finisher — chặn +1 Charge MỚI
                                                // trong lúc này (NA/CA vẫn damage/animate bình thường)

                isDashing: false, dashTimer: 0, dashCooldownTimer: 0,
                dashDirection: new THREE.Vector3(), lastMovementDirection: new THREE.Vector3(0, 0, 1), 
                dashSpeed: 26.0,        
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
                // thể nữa). Tên thật được set bởi Character Name Popup trong Opening/Title Screen
                // (scripts/opening.js — runBackgroundStage()) lúc bắt đầu hành trình mới, hoặc khôi
                // phục từ save data (xem applySaveData() — 06-camps-save-system.js) nếu người chơi đã
                // có tiến trình trước đó.
                name: 'Traveler',
                element: 'Hydro',
                region: 'Mondstadt', // Optional theo spec — placeholder Pre-Alpha
                weapon: null,        // Reserved — Weapon System (Alpha)
                artifacts: [],       // Reserved — Artifact System (Alpha)
                talents: [],         // Reserved — Talent System (Alpha)
                constellation: 0     // Reserved — Constellation System (Alpha), 0 = chưa mở
            };

            // --- LEVEL_CONFIG: công thức EXP cần để lên level tiếp theo.
            //   expForLevel(level): tổng EXP cần có để lên từ `level` -> `level + 1`.
            const LEVEL_CONFIG = {
                expForLevel(level) {
                    return 50 + (level - 1) * 25;
                }
            };
            window.LEVEL_CONFIG = LEVEL_CONFIG;

            // Stat Baseline Update v1 — Level Scaling kiểu Genshin: THAY THẾ hoàn toàn
            // LEVEL_CONFIG.statGrowth (cộng dồn tuyến tính CỐ ĐỊNH +10/+2/+1 mỗi level, dùng CHUNG
            // mọi nhân vật — không tương thích với baseline Genshin vốn TÍNH LẠI từ baseStats gốc
            // theo % tăng trưởng phi tuyến, khác nhau ở mỗi mốc level). Công thức chính thức
            // (Character/Level Scaling, Fandom, hệ 5-star — game hiện tại chỉ có 1 rarity nên dùng
            // chung công thức này cho MỌI nhân vật): 
            //   LevelMultiplier(L) = round( (100+9L)/109 × (1900+L)/1901, 3 )
            // Alpha v1.0 CHỈ dùng multiplier trơn — CHƯA có Ascension (giá trị cộng thêm đột biến ở
            // mốc 20/40/50/60/70/80/90, xem báo cáo) vì Ascension value phụ thuộc thiết kế riêng
            // từng nhân vật thật trong Genshin, không có công thức tổng quát để suy ra cho nhân vật
            // tự chế — ĐÃ XÁC NHẬN với người dùng "chỉ dùng LevelMultiplier trơn ở Alpha v1.0". Hàm
            // này KHÔNG giới hạn cứng level tối đa (dùng công thức, không phải bảng tra cứu) — có
            // thể mở rộng > 90 nếu cần dù chưa dùng.
            function getLevelMultiplier(level) {
                const L = level || 1;
                const base = (100 + 9 * L) / 109;
                return Math.round(base * (1900 + L) / 1901 * 1000) / 1000;
            }
            window.getLevelMultiplier = getLevelMultiplier;

            // getScaledStats(baseStats, level): {maxHp, atk, def} ĐÃ NHÂN theo level — dùng CHUNG
            // cho MỌI nhân vật, đọc baseStats TỪ CHARACTER_ROSTER (giá trị Lv.1), KHÔNG cộng dồn
            // hay lưu trạng thái trung gian nào — mỗi lần gọi TÍNH LẠI TỪ ĐẦU dựa trên level hiện
            // tại, đúng bản chất công thức nhân (khác cộng dồn tuyến tính cũ). Ở Lv.1,
            // getLevelMultiplier(1) = 1.0 CHÍNH XÁC (đã kiểm chứng: (100+9)/109 × (1901)/1901 =
            // 1.0 × 1.0 = 1.0) — nên kết quả hàm này ở Lv.1 LUÔN KHỚP TUYỆT ĐỐI với baseStats gốc,
            // không đổi hành vi khởi tạo nhân vật mới trong initParty().
            function getScaledStats(baseStats, level) {
                const mult = getLevelMultiplier(level);
                return {
                    maxHp: Math.round(baseStats.maxHp * mult),
                    atk: Math.round(baseStats.atk * mult),
                    def: Math.round(baseStats.def * mult)
                };
            }
            window.getScaledStats = getScaledStats;

            // Kiểm tra + xử lý lên level — gọi SAU MỖI LẦN player.exp thay đổi (xem REWARD_HANDLERS.exp,
            // file 01). Dùng vòng lặp while (không phải if) để xử lý đúng trường hợp nhận 1 lượng EXP
            // lớn vượt NHIỀU ngưỡng level cùng lúc (VD quest thưởng EXP khủng) — lên level liên tiếp
            // trong cùng 1 lần gọi thay vì phải đợi lần cộng EXP kế tiếp mới lên tiếp level còn thiếu.
            //
            // Stat Baseline Update v1: KHI lên level, TÍNH LẠI HOÀN TOÀN maxHp/atk/def qua
            // getScaledStats(character.baseStats, player.level) — KHÔNG còn cộng dồn statGrowth cố
            // định (đã xóa field đó khỏi LEVEL_CONFIG). hp hiện tại được scale ĐÚNG THEO TỈ LỆ %
            // đang có trước khi lên level (GIỮ NGUYÊN nguyên tắc comment gốc "không heal miễn phí
            // mỗi lần lên cấp") — nếu maxHp cũ = 0 (chưa từng xảy ra nhưng phòng vệ chia 0), coi
            // như 100% để không tạo NaN.
            function checkLevelUp() {
                let leveledUp = false;
                const character = getActiveCharacterData();
                while (player.exp >= LEVEL_CONFIG.expForLevel(player.level)) {
                    player.exp -= LEVEL_CONFIG.expForLevel(player.level);
                    player.level += 1;

                    const oldMaxHp = player.stats.maxHp;
                    const hpRatio = oldMaxHp > 0 ? (player.stats.hp / oldMaxHp) : 1;
                    const scaled = getScaledStats(character.baseStats, player.level);
                    player.stats.maxHp = scaled.maxHp;
                    player.stats.atk = scaled.atk;
                    player.stats.def = scaled.def;
                    player.stats.hp = Math.round(scaled.maxHp * hpRatio);

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
            // Screen) — ĐÚNG 1 đường duy nhất để đổi tên, dùng chung bởi cả Character Name Popup
            // (lần đầu chơi, scripts/opening.js) LẪN applySaveData() (khôi phục tên đã lưu,
            // 06-camps-save-system.js) để không có 2 nơi tự ý cập nhật CHARACTER_DATA.name theo cách
            // khác nhau.
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
            // PARTY_CONFIG: Alpha v1.0 — Character System. Chỉ còn danh sách characterId trỏ vào
            // CHARACTER_ROSTER (10-character-roster.js) — KHÔNG còn tự chứa name/element/region/
            // bodyColor/baseStats như trước (tránh trùng lặp dữ liệu ở 2 nơi). initParty()/
            // switchToCharacter() bên dưới tra cứu CHARACTER_ROSTER[characterId] để lấy dữ liệu đó,
            // HÀNH VI RUNTIME KHÔNG ĐỔI — chỉ đổi NGUỒN ĐỌC dữ liệu tĩnh.
            const PARTY_CONFIG = [
                { characterId: 'traveler_hydro' },
                { characterId: 'test_character_anemo' },
                // Character #2 (Bow) Validation — slot 3 (phím "3") giờ dùng để test archer_test.
                // Reserved slot cũ này trước đây là null — gán entry mới KHÔNG ảnh hưởng slot 1/2.
                { characterId: 'archer_test' },
                // Character #3 (Polearm) Validation — slot 4 (phím "4") giờ dùng để test polearm_test
                // (test fixture, spec mục 14: "KHÔNG được coi là playable Character #3" — chỉ để kiểm
                // tra mesh/combo/hitbox/collision/Charged Attack/Plunge). Reserved slot cũ (null) —
                // gán entry mới KHÔNG ảnh hưởng slot 1/2/3, ĐÚNG PATTERN archer_test ở slot 3.
                { characterId: 'polearm_test' }
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

                    // Alpha v1.0: tra cứu dữ liệu tĩnh (name/element/region/visualConfig/baseStats)
                    // từ CHARACTER_ROSTER qua config.characterId — GIÁ TRỊ ĐỌC RA giống hệt trước
                    // (traveler_hydro/test_character_anemo có cùng số liệu, chỉ đổi nơi lưu).
                    // Alpha v1.0 — Character Foundation: buildCharacterMesh() giờ nhận NGUYÊN
                    // visualConfig (object đầy đủ) thay vì chỉ bodyColor — đọc toàn bộ cấu hình
                    // Core/Hand/Hand/weaponGrip, xem 04-scene-init.js.
                    //
                    // Weapon Visual System (data-driven) — truyền THÊM rosterEntry.weaponType làm
                    // tham số thứ 2 để buildCharacterMesh() biết dựng hình học weapon nào (xem
                    // buildWeaponMesh() trong 04-scene-init.js). Character #1/test_character_anemo
                    // không khai báo weaponType (undefined) — buildCharacterMesh() tự fallback về
                    // 'sword' (xem default param ở 04-scene-init.js), nên GIÁ TRỊ ĐỌC RA/HÀNH VI
                    // KHÔNG ĐỔI cho 2 nhân vật này, chỉ archer_test (weaponType: 'bow') nhận Bow mesh.
                    //
                    // Character #3 (Polearm) Validation — Weapon Schema v2: đọc rosterEntry.weapon.type
                    // (schema MỚI — {category,type,visualProfile,attackProfile}, xem CHARACTER_ROSTER)
                    // TRƯỚC rosterEntry.weaponType (schema CŨ, chỉ 'bow'|null) — ĐÚNG PATTERN
                    // getActiveWeaponCategory() (combat.js) đã dùng, đảm bảo 2 nơi đọc weapon type LUÔN
                    // NHẤT QUÁN (mesh dựng lên khớp đúng dispatch combat). Sword/Bow hiện tại CHỈ khai
                    // báo weaponType cũ (chưa có field weapon mới) -> weaponResolvedType rơi về
                    // rosterEntry.weaponType như cũ, HÀNH VI KHÔNG ĐỔI. Character #3 (polearm_test) khai
                    // báo weapon.type: 'polearm' (schema mới) -> buildWeaponMesh() nhận đúng 'polearm'.
                    const rosterEntry = CHARACTER_ROSTER[config.characterId];
                    const weaponResolvedType = (rosterEntry.weapon && rosterEntry.weapon.type) || rosterEntry.weaponType;
                    const meshRefs = window.buildCharacterMesh(rosterEntry.visualConfig, weaponResolvedType);
                    partyState.push({
                        id: rosterEntry.id,
                        name: rosterEntry.name,
                        element: rosterEntry.element,
                        region: rosterEntry.region,
                        weapon: null, artifacts: [], talents: [], constellation: 0,
                        level: 1,
                        exp: 0,
                        // Stat Baseline Update v1: dùng getScaledStats(baseStats, 1) thay vì đọc
                        // trực tiếp baseStats — ĐỒNG BỘ 1 NGUỒN CÔNG THỨC DUY NHẤT với checkLevelUp()
                        // (không tính tay riêng ở đây). Kết quả GIỐNG HỆT baseStats gốc vì
                        // getLevelMultiplier(1) = 1.0 chính xác (đã kiểm chứng) — KHÔNG đổi hành vi
                        // khởi tạo nhân vật mới.
                        stats: (function() {
                            const s = getScaledStats(rosterEntry.baseStats, 1);
                            return { maxHp: s.maxHp, hp: s.maxHp, atk: s.atk, def: s.def };
                        })(),
                        mesh: meshRefs.group,
                        // Alpha v1.0 — Character Foundation: tiltRoot/core/leftHand/rightHand MỚI —
                        // xem buildCharacterMesh() (04-scene-init.js) và ghi chú hierarchy ở đó.
                        tiltRoot: meshRefs.tiltRoot,
                        core: meshRefs.core,
                        leftHand: meshRefs.leftHand,
                        rightHand: meshRefs.rightHand,
                        sword: meshRefs.sword,
                        slashWave: meshRefs.slashWave,
                        gliderGroup: meshRefs.gliderGroup,
                        // Alpha v1.0 — Character System: skillCooldownTimer chuyển từ biến cục bộ
                        // skillCooldownTimer trong combat.js sang ĐÂY, per-character, để switch nhân
                        // vật giữa combat không làm mất/lẫn cooldown giữa các nhân vật trong Party
                        // (quyết định đã chốt trước đó — CHƯA nối dây ở combat.js trong bước này).
                        skillCooldownTimer: 0,
                        // Energy System Fix v1: energy (runtime, bắt đầu = 0, TÁCH RIÊNG mỗi nhân
                        // vật) + maxEnergy (CLONE từ rosterEntry.baseStats.maxEnergy — GIỐNG cách
                        // stats.maxHp clone từ baseStats.maxHp phía trên, KHÔNG hard-code 50 ở đây).
                        // player.energy/maxEnergy (file này, phía trên) giờ là getter/setter trỏ
                        // THẲNG vào đúng field này của partyState[activeCharacterIndex] — switch nhân
                        // vật tự động đổi đúng số, không cần đồng bộ tay ở switchToCharacter().
                        energy: 0,
                        maxEnergy: (typeof rosterEntry.baseStats.maxEnergy === 'number') ? rosterEntry.baseStats.maxEnergy : 50,
                        // Core Energy + Elemental Particle System v1: energyRecharge — field RIÊNG
                        // từng nhân vật (ĐÚNG PATTERN energy/maxEnergy ở trên), đọc bởi
                        // resolveParticleEnergy() (12-energy-system.js) khi tính Energy nhận từ
                        // Particle. CHƯA có artifact/weapon/stat bonus nào ghi đè giá trị này (mục 3,
                        // 15 spec Energy System) — mặc định lấy từ ENERGY_CONFIG.defaultEnergyRecharge
                        // (1.0) nếu chưa load kịp/thiếu, KHÔNG hard-code số 1.0 trực tiếp ở đây để chỉ
                        // có 1 nguồn duy nhất định nghĩa default.
                        energyRecharge: (window.ENERGY_CONFIG && typeof window.ENERGY_CONFIG.defaultEnergyRecharge === 'number')
                            ? window.ENERGY_CONFIG.defaultEnergyRecharge
                            : 1.0
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
                player.tiltRoot = first.tiltRoot;
                player.core = first.core;
                player.leftHand = first.leftHand;
                player.rightHand = first.rightHand;
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
                // Alpha v1.0 — Character Foundation: cập nhật thêm con trỏ tiltRoot/core/leftHand/
                // rightHand — GIỮ NGUYÊN pattern cập nhật con trỏ như sword/slashWave/gliderGroup.
                player.tiltRoot = next.tiltRoot;
                player.core = next.core;
                player.leftHand = next.leftHand;
                player.rightHand = next.rightHand;
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

            // Alpha v1.0 — Character System: trả về entry CHARACTER_ROSTER của nhân vật đang active
            // (dùng bởi executeCharacterSkill/executeCharacterBurst trong 09-character-system.js để
            // biết skillId/burstId cần thực thi). KHÔNG trả về partyState[i] (đó là RUNTIME state —
            // hp/level/mesh hiện tại) mà trả về entry TĨNH trong CHARACTER_ROSTER (skillId/burstId/
            // visualConfig) — 2 khái niệm tách biệt theo đúng kiến trúc đã chốt.
            function getActiveCharacterData() {
                const active = partyState[activeCharacterIndex];
                if (!active) return null;
                return CHARACTER_ROSTER[active.id];
            }
            window.getActiveCharacterData = getActiveCharacterData;

            const COMBAT_TIMING = {
                windup: 0.10,   
                active: 0.18,   
                recovery: 0.26  
            };
            window.COMBAT_TIMING = COMBAT_TIMING;

            // Combo Window Config v1: tổng thời gian (giây, TÍNH TỪ LÚC recovery bắt đầu) mà input
            // vẫn được buffer để nối sang đòn kế tiếp — TÁCH RIÊNG khỏi recovery duration (trước đây
            // Combo Window LUÔN = đúng recovery, không cấu hình được độc lập). Nếu comboWindow >
            // recovery của đòn đang chạy, phần chênh lệch trở thành giai đoạn MỚI 'comboGrace' (xem
            // updateCombat() trong file 08): animation đã lerp xong, ĐỨNG YÊN ở pose cuối recovery,
            // vẫn nhận input, chỉ snap về idle + reset combo khi hết comboGrace. Nếu comboWindow <=
            // recovery, comboGrace có thời lượng <= 0 -> bị bỏ qua, hành vi giống hệt trước khi có
            // field này (an toàn ngược, KHÔNG bắt buộc comboWindow phải lớn hơn recovery).
            // FALLBACK toàn cục nếu nhân vật không khai báo visualConfig.comboWindow riêng — xem
            // getComboWindow() trong combat.js.
            const DEFAULT_COMBO_WINDOW = 0.26;
            window.DEFAULT_COMBO_WINDOW = DEFAULT_COMBO_WINDOW;

            // Charged Attack v1: config timing RIÊNG, TÁCH BIỆT hoàn toàn khỏi COMBAT_TIMING (vốn
            // chỉ dành cho Normal Attack Combo #1–#4). KHÔNG hard-code rải rác trong combat logic —
            // mọi nơi cần đọc chargeTime/staminaCost của Charged Attack PHẢI qua
            // getChargedAttackConfig() (xem combat.js), hàm này đọc field visualConfig.chargedAttack
            // riêng của từng nhân vật (nếu có) và fallback về DEFAULT_CHARGED_ATTACK bên dưới nếu
            // thiếu — an toàn ngược, không crash cho nhân vật/character data cũ chưa khai báo field
            // này.
            //   chargeTime: thời gian (giây) phải giữ nút Attack để Charged Attack "sẵn sàng".
            //   staminaCost: Stamina tiêu hao TỨC THỜI mỗi lần Charged Attack THỰC SỰ được kích hoạt
            //   (yêu cầu đã xác nhận — baseline lấy cảm hứng Genshin Impact: 25 Stamina/lần). Tích
            //   hợp vào ĐÚNG hệ thống Stamina đã có (STAMINA_CONFIG + player.stamina — xem
            //   updateStamina() trong 08-physics-combat-camera-loop.js), KHÔNG tạo hệ thống riêng.
            //   Dùng CHUNG pattern "tiêu hao tức thời 1 lần" đã có sẵn cho Dash/Climb Jump
            //   (STAMINA_CONFIG.DASH_COST/CLIMB_JUMP_COST: "if (stamina >= cost) { trừ } else { chặn
            //   hành động }", clamp về MIN_STAMINA, không trừ âm) — xem triggerChargedAttack() trong
            //   combat.js.
            //
            // Multi-Animation + Multi-Hit v2: windup/active/recovery (số) ĐÃ XOÁ khỏi object này —
            // KHÔNG còn ý nghĩa "duration cố định" nữa (giờ tính từ tổng duration của animation
            // segment cùng phase, xem getChargedAttackPhaseDuration() trong combat.js). Thay vào đó
            // DEFAULT_ANIMATIONS/DEFAULT_HITS bên dưới là fallback AN TOÀN NGƯỢC cho nhân vật hoàn
            // toàn chưa khai báo talents.normalAttack.chargedAttack.animations/hits — GIỮ NGUYÊN số
            // liệu windup=0.10/active=0.20/recovery=0.30 cũ dưới dạng animation segment 1 phần tử mỗi
            // phase, và multiplier=1/type='light' làm hit mặc định vô hại (KHÔNG phải 'heavy' — tránh
            // vô tình buff Reaction Level cho nhân vật thiếu data, đúng nguyên tắc fallback yếu nhất
            // đã áp dụng cho getTalentImpact()).
            const DEFAULT_CHARGED_ATTACK = {
                chargeTime: 0.25,
                staminaCost: 25.0,
                animations: [
                    { phase: 'windup', duration: 0.10, rightHandOffsetStart: { x: 0, y: 0, z: 0 }, rightHandOffsetEnd: { x: 0, y: 0, z: 0 }, rightHandRotOffsetStart: { x: 0, y: 0, z: 0 }, rightHandRotOffsetEnd: { x: 0, y: 0, z: 0 }, coreOffsetStart: { x: 0, y: 0, z: 0 }, coreOffsetEnd: { x: 0, y: 0, z: 0 } },
                    { phase: 'active', duration: 0.20, rightHandOffsetStart: { x: 0, y: 0, z: 0 }, rightHandOffsetEnd: { x: 0, y: 0, z: 0 }, rightHandRotOffsetStart: { x: 0, y: 0, z: 0 }, rightHandRotOffsetEnd: { x: 0, y: 0, z: 0 }, coreOffsetStart: { x: 0, y: 0, z: 0 }, coreOffsetEnd: { x: 0, y: 0, z: 0 } },
                    { phase: 'recovery', duration: 0.30, rightHandOffsetStart: { x: 0, y: 0, z: 0 }, rightHandOffsetEnd: { x: 0, y: 0, z: 0 }, rightHandRotOffsetStart: { x: 0, y: 0, z: 0 }, rightHandRotOffsetEnd: { x: 0, y: 0, z: 0 }, coreOffsetStart: { x: 0, y: 0, z: 0 }, coreOffsetEnd: { x: 0, y: 0, z: 0 } }
                ],
                hits: [
                    { time: 0, scaling: { stat: 'ATK', multiplier: 1.0 }, impact: { type: 'light' } }
                ]
            };
            window.DEFAULT_CHARGED_ATTACK = DEFAULT_CHARGED_ATTACK;

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
            //
            // LƯU Ý KIẾN TRÚC (Target Assist 3D Upgrade): hàm này CHỈ dành cho hỗ trợ XOAY NGANG
            // (yaw) của melee/lunge — luôn ép toEnemy.y = 0, KHÔNG xử lý chiều Y. Bow Normal Attack
            // (và mọi ranged/projectile attack tương lai) dùng module TargetAssist RIÊNG (xem bên
            // dưới, "TARGET ASSIST 3D — GENERIC MODULE") — module đó xử lý đầy đủ 3D (bao gồm Y) và
            // trả trực tiếp aim direction cho projectile, KHÔNG tái sử dụng hàm này. Tách 2 hệ thống
            // vì bản chất khác nhau: melee chỉ cần xoay THÂN NHÂN VẬT quanh trục Y (không có pitch),
            // còn ranged cần hướng BẮN đầy đủ 3D (có thể chếch lên/xuống mà không xoay thân).
            function findSoftTargetingRotation(originPos, facingAngleY, config) {
                const targetingConfig = config || SOFT_TARGETING_CONFIG;
                const forward = new THREE.Vector3(Math.sin(facingAngleY), 0, Math.cos(facingAngleY));

                for (const tier of targetingConfig.tiers) {
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

            // ============================================================
            // TARGET ASSIST 3D — GENERIC MODULE (Character #2 Bow Validation)
            // ============================================================
            // Module DÙNG CHUNG cho MỌI ranged/projectile attack (Bow hiện tại, Catalyst/Elemental
            // Skill projectile trong tương lai — spec mục 7: "Không hard-code hệ thống này chỉ dành
            // cho Bow"). TÁCH BIỆT hoàn toàn khỏi findSoftTargetingRotation() (melee, yaw-only) vì
            // ranged attack cần hướng bắn ĐẦY ĐỦ 3D (có thể chếch lên/xuống), không chỉ xoay thân.
            //
            // 3 hàm độc lập, mỗi hàm 1 trách nhiệm rõ ràng (đúng gợi ý spec mục 7 — tên hàm không cần
            // khớp tuyệt đối, chỉ cần đúng tinh thần):
            //   - getNearestTarget(origin, config): chọn địch gần nhất theo khoảng cách 3D THẬT.
            //   - getTargetPoint(enemy): điểm ngắm hợp lý trên thân địch (dùng AABB nếu có).
            //   - getAimDirection(origin, target, config): vector hướng bắn (targetPoint - origin,
            //     normalized) — ĐẦY ĐỦ 3D, không ép Y=0.
            //
            // Nguyên tắc bất biến (spec mục 6, 10): các hàm này CHỈ trả về HƯỚNG BAN ĐẦU của
            // projectile — không đụng gì tới damage, không tạo homing, không raycast thay physics.
            // Sau khi có aim direction, projectile (spawnArrow()/updateArrowEffect()) hoàn toàn tự
            // physics/collision như cũ, không còn liên hệ gì với module này.
            const TargetAssist = {};

            // getNearestTarget(origin, config): trả về enemy gần NHẤT theo khoảng cách 3D thật
            // (Vector3.distanceTo — bao gồm cả Y), hoặc null nếu không có enemy hợp lệ trong
            // config.maxRange. Không dùng tier/góc phức tạp như findSoftTargetingRotation() (đó là
            // để hỗ trợ XOAY tự nhiên cho melee) — ranged Target Assist chỉ cần "gần nhất trong tầm",
            // đúng spec mục 4 "Nearest Target + 3D": "Ưu tiên sử dụng khoảng cách 3D — distance =
            // sqrt(dx²+dy²+dz²)".
            TargetAssist.getNearestTarget = function(origin, config) {
                const maxRange = (config && typeof config.maxRange === 'number') ? config.maxRange : 20;
                let best = null;
                let bestDist = Infinity;
                for (let i = 0; i < enemies.length; i++) {
                    const enemy = enemies[i];
                    if (!enemy.alive) continue;
                    const dist = origin.distanceTo(TargetAssist.getTargetPoint(enemy));
                    if (dist > maxRange) continue;
                    if (dist < bestDist) { bestDist = dist; best = enemy; }
                }
                return best;
            };

            // getTargetPoint(enemy): điểm ngắm hợp lý trên thân enemy — spec mục 3: "Không target vào
            // origin/feet nếu khiến arrow đi qua phía trên; ưu tiên điểm gần center/mid-body; reuse
            // hitbox/collider có sẵn nếu có". REUSE enemy.aabb (đã tồn tại, cập nhật mỗi frame bởi hệ
            // thống collision hiện có — xem 03-skillstate-camera-collision-helpers.js,
            // enemy.aabb.updateFromObject()) để lấy CENTER Y THẬT của hitbox
            // ((aabb.minY + aabb.maxY) / 2) — KHÔNG cần tạo hitbox/collider mới (spec mục 3: "Không
            // tạo hitbox mới chỉ để giải quyết vấn đề này nếu không cần thiết"). Fallback về
            // enemy.position nếu enemy thiếu aabb hợp lệ (an toàn ngược, không crash).
            TargetAssist.getTargetPoint = function(enemy) {
                if (enemy.aabb && typeof enemy.aabb.minY === 'number' && typeof enemy.aabb.maxY === 'number') {
                    const centerY = (enemy.aabb.minY + enemy.aabb.maxY) / 2;
                    return new THREE.Vector3(enemy.position.x, centerY, enemy.position.z);
                }
                return enemy.position.clone();
            };

            // getAimDirection(origin, target, config): vector hướng bắn ĐẦY ĐỦ 3D từ origin (vị trí
            // spawn projectile thật — spec mục 5: "Không giả định projectile bắt đầu từ center Player
            // nếu đã có weapon/muzzle/grip position", nơi gọi PHẢI truyền origin là vị trí spawn thật)
            // tới getTargetPoint(target), normalize — KHÔNG ép Y=0 (spec mục 2, 8: "ΔY phải được tính
            // vào hướng bắn", hỗ trợ cả target thấp/cao/gần/xa). Trả về null nếu target null (không
            // có target hợp lệ) — nơi gọi TỰ QUYẾT ĐỊNH fallback về forward hiện tại (spec mục 2, Test
            // 5: "không có target -> bắn theo hướng hiện tại của Player").
            TargetAssist.getAimDirection = function(origin, target) {
                if (!target) return null;
                const targetPoint = TargetAssist.getTargetPoint(target);
                const dir = new THREE.Vector3().subVectors(targetPoint, origin);
                if (dir.lengthSq() < 0.0001) return null; // Tránh normalize vector độ dài 0
                return dir.normalize();
            };

            window.TargetAssist = TargetAssist;

            // BOW_RANGED_TARGET_ASSIST_CONFIG: config RIÊNG cho Bow (spec mục 7 — module generic,
            // nhưng MỖI loại ranged attack có tầm/hành vi khác nhau, nên config vẫn tách theo
            // character/vũ khí, không gộp chung 1 hằng số duy nhất). Chỉ có `maxRange` — module
            // TargetAssist không cần khái niệm tier/góc phức tạp như melee (spec không yêu cầu giới
            // hạn góc cho ranged, chỉ cần "gần nhất trong tầm hợp lý").
            const BOW_RANGED_TARGET_ASSIST_CONFIG = { maxRange: 22 };
            window.BOW_RANGED_TARGET_ASSIST_CONFIG = BOW_RANGED_TARGET_ASSIST_CONFIG;

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
                // Combo Attack System v2: duration KHÔNG còn được đọc ở đâu (đã thành dead field) —
                // lungeTimer giờ dùng trực tiếp getCurrentAttackTiming().active (đòn đang chạy),
                // xem 08-physics-combat-camera-loop.js windup->active transition. GIỮ field này
                // trong config (không xóa) để tương thích ngược nếu có chỗ khác trong tương lai cần
                // đọc "duration lunge mặc định" — hiện tại không có ý nghĩa runtime nào.
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

            // ============================================================
            // Hit Reaction / Poise System — Alpha v1.0
            // ============================================================
            // Nguyên tắc: KHÔNG hard-code theo cặp cụ thể (VD "Sword -> 0.1s", "Small Slime -> 0.2s").
            // Thay vào đó: Impact Strength/Type SO SÁNH với Poise Resistance/Weight Class của defender
            // -> ra Reaction Level -> Reaction Level tra bảng ra duration/knockback/interrupt. Toàn bộ
            // phép tính nằm trong resolveHitReaction() (combat.js) — 2 bảng dưới đây chỉ là DATA, không
            // chứa logic. HP/DEF/Poise/Weight Class là 4 hệ thống ĐỘC LẬP (yêu cầu đã xác nhận): HP
            // (sống/chết) và DEF (giảm damage) không đổi gì ở đây; Poise (chống gián đoạn) và Weight
            // Class (đặc tính vật lý) là bổ sung MỚI, không dùng HP để giả lập.

            // WEIGHT_CLASS_CONFIG: mỗi Weight Class có 1 "basePoise" (mốc để so sánh với Impact
            // Strength — CÀNG CAO càng khó bị gián đoạn), 1 "knockbackMult" (hệ số nhân lực đẩy vật
            // lý NGANG — entity càng nặng càng ít bị đẩy, dù cùng 1 impact.knockback), và 1
            // "launchMult" (Phase Launch weightClass — hệ số nhân lực đẩy DỌC khi bị launch, VAI TRÒ
            // TƯƠNG TỰ knockbackMult nhưng TÁCH RIÊNG modifier, KHÔNG dùng chung số với
            // knockbackMult — vì độ khó bị đẩy ngang và độ khó bị hất lên không nhất thiết cùng tỉ lệ
            // với 1 weight class, để mở đường balance riêng từng chiều sau này mà không ảnh hưởng
            // lẫn nhau). basePoise KHÔNG phải "Poise Meter" (không tích lũy/hồi theo thời gian — CHƯA
            // triển khai ở Alpha v1.0, xem ghi chú "CHƯA triển khai" trong yêu cầu) — chỉ là 1 con số
            // tĩnh dùng NGAY LÚC so sánh mỗi lần trúng đòn, nhân với defender.poise.resistance (field
            // trên entity, xem enemies.js) để ra effectiveResistance cuối cùng.
            //
            // launchMult: GIÁ TRỊ PLACEHOLDER, CHƯA BALANCE (yêu cầu đã xác nhận) — dùng trong
            // resolveHitReaction() (combat.js) theo công thức verticalForce = levelCfg.launchVertical
            // * weightCfg.launchMult, CHỈ áp dụng khi level === 'launch' (xem giải thích đầy đủ tại
            // đó). Không cần đúng tỉ lệ với knockbackMult — light/medium/heavy/massive ở đây thấp hơn
            // knockbackMult tương ứng 1 chút (0.8/0.5/0.2 so với 0.7/0.4/0.15) chỉ vì trực giác "khó
            // hất lên hơn khó đẩy ngang", SẼ tinh chỉnh ở Phase Reaction Tuning.
            const WEIGHT_CLASS_CONFIG = {
                light: { basePoise: 22, knockbackMult: 1.0, launchMult: 1.0 },
                medium: { basePoise: 65, knockbackMult: 0.7, launchMult: 0.8 },
                heavy: { basePoise: 120, knockbackMult: 0.4, launchMult: 0.5 },
                massive: { basePoise: 250, knockbackMult: 0.15, launchMult: 0.2 }
            };
            window.WEIGHT_CLASS_CONFIG = WEIGHT_CLASS_CONFIG;

            // IMPACT_TYPE_CONFIG: mỗi Impact Type có "poiseDamage" (độ mạnh gây gián đoạn — so trực
            // tiếp với basePoise*resistance của defender ở trên) và "maxReactionLevel" (TRẦN — impact
            // type nhẹ không bao giờ tạo ra phản ứng mạnh hơn trần của nó dù tỉ lệ poiseDamage/
            // resistance rất cao, đúng ví dụ "Launch -> Massive -> không launch": 'massive' weight có
            // basePoise cực cao nên tỉ lệ luôn thấp, nhưng trần vẫn there để chặn tuyệt đối trong
            // trường hợp resistance quá thấp gây lệch bảng). reactionLevelOrder dùng để so sánh
            // "level nào mạnh hơn level nào" khi áp trần — xem resolveHitReaction() (combat.js).
            const IMPACT_TYPE_CONFIG = {
                light: { poiseDamage: 22, maxReactionLevel: 'light' },
                medium: { poiseDamage: 45, maxReactionLevel: 'medium' },
                heavy: { poiseDamage: 88, maxReactionLevel: 'heavy' },
                launch: { poiseDamage: 140, maxReactionLevel: 'launch' }
            };
            window.IMPACT_TYPE_CONFIG = IMPACT_TYPE_CONFIG;

            // REACTION_LEVEL_CONFIG: ngưỡng tỉ lệ (poiseDamage / effectiveResistance) để xác định
            // Reaction Level cuối cùng, và số liệu tương ứng mỗi level — staggerDuration (giây,
            // KHÔNG hard-code theo entity, chỉ theo LEVEL), interrupt (có buộc AI hủy action hiện tại
            // hay không), knockbackScale (nhân thêm vào impact.knockback × weightClass.knockbackMult
            // ở trên — level càng mạnh đẩy càng xa). Thứ tự minRatio TĂNG DẦN, level cuối cùng đạt
            // ngưỡng là kết quả (trước khi áp trần maxReactionLevel của Impact Type). Bộ số liệu này
            // đã được kiểm chứng khớp toàn bộ 8 ví dụ hành vi mong muốn (Light/Medium/Heavy/Launch ×
            // Light/Medium/Heavy/Massive weight class) trước khi đưa vào code.
            const REACTION_LEVEL_CONFIG = {
                order: ['none', 'light', 'medium', 'heavy', 'launch'],
                none:   { minRatio: 0,    staggerDuration: 0,    interrupt: false, knockbackScale: 0.3 },
                light:  { minRatio: 0.5,  staggerDuration: 0.15, interrupt: false, knockbackScale: 1.0 },
                medium: { minRatio: 0.85, staggerDuration: 0.30, interrupt: true,  knockbackScale: 1.5 },
                heavy:  { minRatio: 1.5,  staggerDuration: 0.50, interrupt: true,  knockbackScale: 2.2 },
                // launchVertical: Phase 4 (Launch Hit Reaction) — GIÁ TRỊ PLACEHOLDER, CHƯA BALANCE.
                // Đơn vị m/s, cùng scale với jumpVelocityY/jumpPowerY hiện có của Slime (Small
                // jumpPowerY=9.0, Large=7.2 — xem enemies.js) vì cả hai đều bị player.gravity trừ dần
                // mỗi frame qua CHUNG một công thức (jumpVelocityY -= gravity*dt, xem update()). Đây
                // là số GỐC tra theo LEVEL (giống staggerDuration) — TỪ Phase Launch weightClass, số
                // gốc này còn bị nhân thêm WEIGHT_CLASS_CONFIG[weightClass].launchMult trong
                // resolveHitReaction() (combat.js) để ra verticalForce cuối cùng, nên vertical force
                // THỰC TẾ áp dụng lên từng entity ĐÃ khác nhau theo weightClass (khác thiết kế ban
                // đầu — xem lịch sử comment cũ nếu cần đối chiếu). 12.0 chỉ là điểm khởi đầu để test
                // behavior (cao hơn jumpPowerY Small ~33%) — SẼ chỉnh lại ở Phase Reaction Tuning
                // sau, không tự ý balance thêm ở Phase này.
                launch: { minRatio: 2.0,  staggerDuration: 0.65, interrupt: true,  knockbackScale: 16.0, launchVertical: 14.0 }
            };
            window.REACTION_LEVEL_CONFIG = REACTION_LEVEL_CONFIG;

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
                    maxDuration: 3.5,
                    fireInterval: 0.35,
                    cameraZoomDistance: 6.0,
                    cameraSideOffset: 2.0,
                    cameraOffsetLerpSpeed: 10.0
                },
                smallShot: {
                    speed: 15.0,
                    damage: 0.4, // Hệ số nhân với player.attack.hydroProjectile
                    maxRange: 24,
                    trailChance: 0.6 // Xác suất/frame sinh hạt nước theo đường bay
                },
                pressureShot: {
                    damage: 1.5, // Hệ số nhân với player.attack.hydroProjectile
                    maxRange: 32,
                    beamRadius: 0.4,
                    fadeDuration: 0.3,
                    recoilDistance: 1.2, // Quãng đường (m) nhân vật bị đẩy lùi sau khi bắn — nhỏ, chỉ
                                          // tăng cảm giác lực, không làm mất kiểm soát nhân vật.
                    recoilDuration: 0.01 // Thời gian (giây) trải đều quãng đường recoil (giống Attack Lunge)
                }
            };
            window.ELEMENTAL_SKILL_CONFIG = ELEMENTAL_SKILL_CONFIG;

            // Skill Aim Hardcode Fix v1 — DỌN DẸP CODE CHẾT: BURST_CONFIG (từng ở đây, chứa
            // bubble/vortex/pull/damage/damageTickInterval của Water Bubble) đã được XÓA — kiểm
            // tra xác nhận KHÔNG còn bất kỳ nơi nào trong codebase đọc BURST_CONFIG.* nữa. Toàn bộ
            // logic Water Bubble (executeCharacterBurst()/updateWaterBubbleEffect(), file 09) đã
            // refactor xong từ trước, đọc 100% qua fx.skillData (= SKILL_LIBRARY.hydro_water_bubble,
            // file 11) — số liệu ĐÃ COPY NGUYÊN VẸN sang đó, không mất mát gì khi xóa khối này.
            // Khác với ELEMENTAL_SKILL_CONFIG phía trên (VẪN GIỮ — đang là fallback thật sự đang
            // hoạt động trong getActiveSkillAimConfig(), combat.js), BURST_CONFIG không có vai trò
            // fallback nào vì Burst không có khái niệm Aim Mode cần fallback tương tự.

            // burstAimState.phase giữ nguyên 'idle' vĩnh viễn (Burst không còn Hold/Aim Mode) — vẫn giữ
            // object này lại vì canUseBurst() và các đoạn dọn dẹp state khi chết/đuối nước còn tham chiếu
            // tới phase !== 'idle' như một lớp bảo vệ; không còn nơi nào set nó khác 'idle' nữa.
