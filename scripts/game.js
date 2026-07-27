// ============================================================
// ============================================================
// game.js — Tách ra từ index.html
// Chứa: terrain/collision, particles/VFX, scene setup, player abilities/combat,
// enemy classes (Enemy, Slime), game loop chính (updatePhysics, updateCombat,
// updateProjectiles, updateCamera, animate)
//
// PHỤ THUỘC TỪ index.html (đã export qua window trước khi game.js cần dùng):
//   sfx, player, keys, cameraState, container, isGamePaused,
//   cameraSensitivityMultiplier, isMobile, closeMenuBtn, gameMenu, leftPanel,
//   backdropClose, altPressed, scene, camera, renderer, groundMat, clock,
//   VOID_DEPTH_Y (độ sâu Y của đáy vực, dùng cho cơ chế rơi khỏi vùng chơi hợp lệ)
//   (5 biến cuối dùng getter/setter vì initThree() trong file này gán giá trị
//   cho chúng lần đầu — index.html chỉ khai báo rỗng ban đầu)
//
// game.js EXPORT ra window để index.html/ui.js dùng:
//   getGroundYForPosition, activateGlider, deactivateGlider, handleAttackInput,
//   triggerElementalSkill, handleBurstKeyDown, handleBurstKeyUp, triggerDash, animate, initThree,
//   triggerDrowningSequence (+ player, cameraState qua window.X = X tại chỗ khai báo)
// ============================================================

            class AABB {
                constructor(minX, minY, minZ, maxX, maxY, maxZ) {
                    this.minX = minX || 0; this.minY = minY || 0; this.minZ = minZ || 0;
                    this.maxX = maxX || 0; this.maxY = maxY || 0; this.maxZ = maxZ || 0;
                }
                updateFromObject(mesh, width, height, depth) {
                    const pos = mesh.position;
                    this.minX = pos.x - width / 2; this.maxX = pos.x + width / 2;
                    this.minY = pos.y - height / 2; this.maxY = pos.y + height / 2;
                    this.minZ = pos.z - depth / 2; this.maxZ = pos.z + depth / 2;
                }
            }
            window.AABB = AABB;

            // --- HỆ THỐNG TƯƠNG TÁC (INTERACTABLE) DÙNG CHUNG ---
            // Base class cho mọi vật thể trong world mà người chơi có thể tương tác
            // (bảng nhiệm vụ, NPC, rương đồ...). Mở rộng bằng cách kế thừa và
            // override onInteract().
            class Interactable {
                constructor(position, promptText, interactionRadius = 2.5) {
                    this.position = position; // THREE.Vector3 — vị trí trong world
                    this.promptText = promptText; // Text mặc định khi đủ gần
                    this.interactionRadius = interactionRadius;
                    this.mesh = null; // Gán bởi lớp con sau khi tạo mesh 3D
                }
                // Trả về khoảng cách (bình phương, để tránh sqrt không cần thiết) tới người chơi
                distanceSqTo(playerPos) {
                    const dx = this.position.x - playerPos.x;
                    const dz = this.position.z - playerPos.z;
                    return dx * dx + dz * dz;
                }
                // Text hiện ở prompt "Nhấn F" — lớp con có thể override để text đổi động
                // theo trạng thái (VD: quest đã hoàn thành thì đổi thành "Trả nhiệm vụ").
                getPromptText() {
                    return this.promptText;
                }
                // Lớp con PHẢI override hàm này — được gọi khi người chơi bấm tương tác
                onInteract() {
                    console.warn('Interactable.onInteract() chưa được override:', this);
                }
            }

            // ============================================================
            // HỆ THỐNG QUEST (v0.6 Wilderness — mở rộng từ v0.3, hỗ trợ NHIỀU quest cùng lúc)
            // ============================================================
            // --- QUEST_DEFINITIONS (data-driven) ---
            // Danh sách MẪU quest có thể xuất hiện tại Quest Board. Mỗi entry:
            //   id: định danh mẫu (KHÔNG phải id instance — QuestBoard tự sinh id instance khi cấp quest
            //       thực tế, xem _instantiateQuest(), để hỗ trợ cấp lại nhiều lần cùng 1 mẫu).
            //   slot: 'combat' | 'gathering' — QuestBoard có ĐÚNG 1 slot mỗi loại tại một thời điểm:
            //         slot 'combat' luôn là quest tiêu diệt Slime (mục 5 spec); slot 'gathering' được
            //         chọn NGẪU NHIÊN từ các mẫu type='gather' mỗi khi cần cấp mới (mục 6: "ngẫu nhiên
            //         tạo một nhiệm vụ thu thập mới từ danh sách vật phẩm hiện có").
            //   type: 'kill' | 'gather' — quyết định cách onEnemyKilled()/onItemGathered() cập nhật
            //         currentCount (so khớp qua targetType).
            //   targetType: 'slime' (kill) hoặc itemId trong ITEM_DATABASE (gather).
            //   rewards: mảng { type, amount } — dùng THẲNG REWARD_HANDLERS (không random min-max như
            //            hệ thống Gold/EXP cũ) vì spec v0.6 quy định SỐ CỤ THỂ (100/60 Nguyên Thạch).
            // Thêm mẫu quest mới (VD: escort, thu thập vật phẩm khác) chỉ cần thêm 1 entry vào đây —
            // KHÔNG cần sửa QuestBoard/onEnemyKilled/onItemGathered.
            const QUEST_DEFINITIONS = [
                {
                    id: 'combat_slime_10', slot: 'combat',
                    title: 'Defeat 10 Slimes',
                    description: 'Tiêu diệt Slime tại các khu vực quái quanh đây',
                    type: 'kill', targetType: 'slime', targetCount: 10,
                    rewards: [{ type: 'primogem', amount: 100 }]
                },
                {
                    id: 'gather_berry_10', slot: 'gathering',
                    title: 'Thu thập 10 Berry',
                    description: 'Hái Berry từ các bụi cây ven đường hoặc trong rừng',
                    type: 'gather', targetType: 'berry', targetCount: 10,
                    rewards: [{ type: 'primogem', amount: 60 }]
                },
                {
                    id: 'gather_mushroom_10', slot: 'gathering',
                    title: 'Thu thập 10 Mushroom',
                    description: 'Tìm Mushroom mọc dưới tán cây trong rừng',
                    type: 'gather', targetType: 'mushroom', targetCount: 10,
                    rewards: [{ type: 'primogem', amount: 60 }]
                },
                {
                    id: 'gather_apple_10', slot: 'gathering',
                    title: 'Thu thập 10 Apple',
                    description: 'Hái Táo trực tiếp từ những cây táo trong rừng',
                    type: 'gather', targetType: 'apple', targetCount: 10,
                    rewards: [{ type: 'primogem', amount: 60 }]
                },
                {
                    id: 'gather_sweet_flower_10', slot: 'gathering',
                    title: 'Thu thập 10 Sweet Flower',
                    description: 'Thu thập Sweet Flower mọc trên đồng cỏ nhiều ánh sáng',
                    type: 'gather', targetType: 'sweet_flower', targetCount: 10,
                    rewards: [{ type: 'primogem', amount: 60 }]
                }
            ];
            window.QUEST_DEFINITIONS = QUEST_DEFINITIONS;

            const QUEST_DEFINITIONS_BY_SLOT = {};
            QUEST_DEFINITIONS.forEach(def => {
                (QUEST_DEFINITIONS_BY_SLOT[def.slot] = QUEST_DEFINITIONS_BY_SLOT[def.slot] || []).push(def);
            });

            // Chọn ngẫu nhiên 1 mẫu quest 'gathering' — dùng khi QuestBoard cần cấp slot gathering mới
            // (lúc khởi tạo, hoặc sau khi người chơi trả xong quest gathering trước đó, đúng mục 6 spec).
            function pickRandomGatheringQuestDef() {
                const pool = QUEST_DEFINITIONS_BY_SLOT['gathering'] || [];
                if (pool.length === 0) return null;
                return pool[Math.floor(Math.random() * pool.length)];
            }

            let questInstanceCounter = 1;

            // --- CLASS QuestBoard (v0.6) — quản lý NHIỀU slot quest cùng lúc thay vì 1 quest duy nhất.
            // Mỗi slot ('combat', 'gathering') có ĐÚNG 1 quest instance hiện diện tại 1 thời điểm.
            // questSlots: { combat: questInstance, gathering: questInstance } — questInstance là object
            // độc lập với entry trong activeQuests cho tới khi người chơi BẤM NHẬN (giữ đúng hành vi cũ:
            // "hiển thị nhưng chưa vào activeQuests cho tới khi accept").
            class QuestBoard extends Interactable {
                constructor(position) {
                    super(position, 'Nhấn F để xem nhiệm vụ', 2.5);
                    this.questSlots = {
                        combat: this._instantiateQuest(QUEST_DEFINITIONS_BY_SLOT['combat'][0]),
                        gathering: this._instantiateQuest(pickRandomGatheringQuestDef())
                    };
                }
                // Tạo 1 "quest instance" (bản sao dữ liệu mẫu + id RIÊNG cho lần cấp này) — KHÔNG phải
                // entry trong activeQuests (đó chỉ được tạo khi người chơi bấm Nhận, xem _acceptQuest()).
                _instantiateQuest(def) {
                    if (!def) return null;
                    return Object.assign({}, def, { instanceId: def.id + '_i' + (questInstanceCounter++) });
                }
                // Tất cả quest instance hiện có tại board này (bỏ qua slot null) — dùng để hiển thị danh
                // sách UI (mục 4 spec) và để tìm quest theo instanceId khi người chơi tương tác.
                getAllQuestInstances() {
                    return Object.values(this.questSlots).filter(Boolean);
                }
                // Tìm entry TƯƠNG ỨNG trong activeQuests (nếu người chơi đã bấm Nhận) cho 1 quest
                // instance — so khớp qua instanceId (activeQuests entry.id = instanceId lúc accept).
                _findActiveEntry(instanceId) {
                    return activeQuests.find(q => q.id === instanceId);
                }
                getPromptText() {
                    return this.promptText;
                }
                onInteract() {
                    if (window.openQuestListPopup) window.openQuestListPopup(this);
                }
                // Gọi bởi ui.js khi người chơi bấm "Nhận" 1 quest instance cụ thể trong danh sách.
                acceptQuest(instanceId) {
                    const instance = this.getAllQuestInstances().find(q => q.instanceId === instanceId);
                    if (!instance) return;
                    if (this._findActiveEntry(instanceId)) return; // Đã nhận rồi, tránh trùng

                    activeQuests.push({
                        id: instance.instanceId,
                        title: instance.title,
                        description: instance.description,
                        type: instance.type,
                        targetType: instance.targetType,
                        targetCount: instance.targetCount,
                        currentCount: 0,
                        status: 'active',
                        rewards: instance.rewards
                    });
                    if (window.refreshQuestTracker) window.refreshQuestTracker();
                }
                // Gọi bởi ui.js khi người chơi bấm "Trả nhiệm vụ" cho 1 quest instance đã completed.
                // Sau khi trả: phát reward, đánh dấu entry activeQuests là 'turned_in', rồi CẤP LẠI slot
                // tương ứng bằng 1 quest instance MỚI (combat: luôn cùng mẫu; gathering: random lại mẫu
                // khác — đúng mục 6 spec) để Quest Board không bao giờ "hết việc để làm".
                turnInQuest(instanceId) {
                    const entry = this._findActiveEntry(instanceId);
                    if (!entry || entry.status !== 'completed') return;

                    entry.status = 'turned_in';
                    (entry.rewards || []).forEach(reward => {
                        const handler = REWARD_HANDLERS[reward.type];
                        if (handler) handler(reward.amount, reward);
                        else console.warn('QuestBoard.turnInQuest: không có REWARD_HANDLERS cho type', reward.type);
                    });
                    if (window.refreshQuestTracker) window.refreshQuestTracker();
                    if (window.showQuestCompletePopup) window.showQuestCompletePopup();

                    // Xác định slot của instance vừa trả (combat hay gathering) để cấp lại đúng loại.
                    const slotKey = this.questSlots.combat && this.questSlots.combat.instanceId === instanceId
                        ? 'combat' : 'gathering';
                    const nextDef = slotKey === 'combat'
                        ? QUEST_DEFINITIONS_BY_SLOT['combat'][0]
                        : pickRandomGatheringQuestDef();
                    this.questSlots[slotKey] = this._instantiateQuest(nextDef);
                }
            }
            window.QuestBoard = QuestBoard;

            // ============================================================
            // HỆ THỐNG DIALOGUE (Pre-Alpha v0.5) — DỮ LIỆU + CLASS NPC
            // ============================================================
            // Kiến trúc tách làm 3 lớp, mỗi lớp 1 việc, giống hệt pattern Quest/Chest đã có:
            //   1. DATA (NPC_DIALOGUE_DATA, ở đây)      — nội dung hội thoại, KHÔNG hard-code
            //      cho 1 NPC cụ thể, thêm NPC mới = thêm 1 entry, không sửa logic.
            //   2. WORLD/STATE (class NPC, ở đây)       — 1 NPC cụ thể trong world, biết vị trí,
            //      biết TRẠNG THÁI hội thoại hiện tại của chính nó (getDialogueState()), và biết
            //      xử lý riêng khi người chơi chọn 1 lựa chọn (onDialogueAction()).
            //   3. ENGINE/UI (window.openDialogue..., trong ui.js) — hoàn toàn không biết gì về
            //      NPC cụ thể nào, chỉ nhận vào 1 mảng "node" (xem cấu trúc bên dưới) và hiển thị.
            //
            // Cấu trúc dữ liệu — NPC_DIALOGUE_DATA[npcId][scriptKey] = mảng "node":
            //   node = {
            //     speaker: string,       // tên hiển thị ở đầu khung thoại
            //     text: string,          // nội dung, chạy hiệu ứng typewriter
            //     choices?: [{           // CHỈ node cuối 1 nhánh hội thoại mới cần choices
            //         text: string,      // label nút bấm
            //         action: string,    // định danh hành động, engine không tự hiểu — xem dưới
            //         jumpTo?: string    // (tùy chọn) nhảy sang script khác trong CÙNG NPC này
            //                            // (branching) — không có thì mặc định kết thúc hội thoại
            //     }],
            //     // --- CÁC TRƯỜNG DÀNH RIÊNG CHO TƯƠNG LAI (mục 9 trong đề bài), engine hiện
            //     // KHÔNG xử lý gì cả nếu thiếu — chỉ cần thêm vào node là dùng được sau này,
            //     // không cần sửa lại cấu trúc dữ liệu hay engine:
            //     portrait: undefined,   // đường dẫn ảnh chân dung
            //     expression: undefined, // biểu cảm (VD: 'happy', 'angry')
            //     voice: undefined,      // id file voice
            //     camera: undefined,     // config camera hội thoại riêng cho node này
            //     animation: undefined,  // animation nhân vật/NPC khi nói dòng này
            //   }
            //
            // "action" của mỗi choice được xử lý bởi CHÍNH NPC (qua onDialogueAction(action, choice)
            // — lớp con override), KHÔNG xử lý trong engine dùng chung — đây là điểm mấu chốt để
            // không phải hard-code Quest/Shop/... vào trong hệ thống Dialogue nền tảng. Engine chỉ
            // biết 2 việc: có `jumpTo` thì nhảy script, không có thì kết thúc hội thoại (trừ khi
            // onDialogueAction() trả về true — nghĩa là "tôi tự lo phần đóng/tiếp tục rồi, đừng làm
            // gì thêm", dành cho các NPC cần logic đặc biệt, VD: mở popup khác rồi mới đóng dialogue).
            const NPC_DIALOGUE_DATA = {
                katheryne: {
                    // state 'default': người chơi CHƯA nhận quest nào tại Quest Board (xem
                    // Katheryne.getDialogueState() — v0.6: kiểm tra TẤT CẢ quest tại board, không chỉ
                    // 1 quest_001 cố định như trước).
                    default: [
                        { speaker: 'Katheryne', text: 'Chào mừng đến với Hiệp hội Mạo hiểm giả.' },
                        { speaker: 'Katheryne', text: 'Chúng tôi luôn có nhiệm vụ dành cho các mạo hiểm giả — bạn có thể xem tại Bảng Nhiệm Vụ phía sau tôi, hoặc hỏi trực tiếp tôi.',
                          choices: [
                              { text: 'Xem nhiệm vụ', action: 'view_quests' },
                              { text: 'Hỏi thêm về Hiệp hội', action: 'lore', jumpTo: 'lore_intro' },
                              { text: 'Tạm biệt', action: 'end' }
                          ]
                        }
                    ],
                    lore_intro: [
                        { speaker: 'Katheryne', text: 'Hiệp hội Mạo hiểm giả ghi nhận và khen thưởng những ai truy quét quái vật, hộ tống người dân, và khám phá vùng đất mới.' },
                        { speaker: 'Katheryne', text: 'Mỗi nhiệm vụ hoàn thành đều được ghi vào hồ sơ mạo hiểm giả của bạn.',
                          choices: [
                              { text: 'Xem nhiệm vụ', action: 'view_quests' },
                              { text: 'Đã hiểu, cảm ơn', action: 'end' }
                          ]
                        }
                    ],
                    // state 'quest_active': đang làm ít nhất 1 quest tại board, chưa có quest nào sẵn sàng trả
                    quest_active: [
                        { speaker: 'Katheryne', text: 'Bạn vẫn đang thực hiện nhiệm vụ à? Cố lên nhé, mạo hiểm giả.',
                          choices: [
                              { text: 'Xem nhiệm vụ', action: 'view_quests' },
                              { text: 'Tạm biệt', action: 'end' }
                          ]
                        }
                    ],
                    // state 'quest_completed': có ít nhất 1 quest đã đủ điều kiện, chưa trả
                    quest_completed: [
                        { speaker: 'Katheryne', text: 'Có vẻ bạn đã hoàn thành một nhiệm vụ! Hãy quay lại Bảng Nhiệm Vụ (hoặc hỏi tôi) để nhận thưởng nhé.',
                          choices: [
                              { text: 'Xem nhiệm vụ', action: 'view_quests' },
                              { text: 'Tạm biệt', action: 'end' }
                          ]
                        }
                    ]
                }
            };
            window.NPC_DIALOGUE_DATA = NPC_DIALOGUE_DATA;

            class NPC extends Interactable {
                constructor(position, npcId, promptText = 'Nhấn F để nói chuyện') {
                    super(position, promptText, 2.5);
                    this.npcId = npcId; // Khoá vào NPC_DIALOGUE_DATA[npcId]
                }
                // Lớp con override để trả về 1 key trong NPC_DIALOGUE_DATA[npcId] tuỳ trạng thái
                // game hiện tại (VD: quest đã nhận/hoàn thành hay chưa) — mặc định luôn 'default'.
                getDialogueState() {
                    return 'default';
                }
                onInteract() {
                    if (window.openDialogue) window.openDialogue(this);
                }
                // Lớp con override để xử lý riêng 1 action cụ thể (ngoài các action chung như 'end').
                // Trả về true nghĩa là "đã tự xử lý xong, engine không cần làm gì thêm" (VD: đã tự
                // đóng dialogue). Trả về false/undefined nghĩa là để engine tự lo tiếp (jumpTo/end).
                onDialogueAction(action, choice) {
                    return false;
                }
            }
            window.NPC = NPC;

            // --- NPC mẫu: Katheryne (Hiệp hội Mạo hiểm giả) ---
            // Trạng thái hội thoại của Katheryne phản ánh ĐÚNG tiến độ các quest tại Quest Board mà cô
            // đứng cạnh (this.questBoard, gán sau khi cả 2 được tạo — xem createInteractables()) —
            // thuần hiển thị/tham khảo, KHÔNG tự cấp/trả quest thay QuestBoard (tránh 2 nguồn cùng
            // thao túng cùng dữ liệu). Đây là minh hoạ cho mục 7 (trạng thái hội thoại) gắn với dữ liệu
            // game thật, thay vì hard-code 1 đoạn thoại tĩnh.
            class Katheryne extends NPC {
                constructor(position) {
                    super(position, 'katheryne', 'Nhấn F để nói chuyện với Katheryne');
                    this.questBoard = null; // Gán bởi createInteractables() sau khi QuestBoard được tạo
                }
                getDialogueState() {
                    if (!this.questBoard) return 'default';
                    const instances = this.questBoard.getAllQuestInstances();
                    let anyActive = false;
                    for (const inst of instances) {
                        const entry = this.questBoard._findActiveEntry(inst.instanceId);
                        if (entry && entry.status === 'completed') return 'quest_completed';
                        if (entry && entry.status === 'active') anyActive = true;
                    }
                    return anyActive ? 'quest_active' : 'default';
                }
                // 'view_quests': mở CÙNG danh sách quest UI như bấm F trực tiếp vào Quest Board (đúng
                // yêu cầu "khi tương tác Katheryne và chọn nhận nhiệm vụ... giống cách mở bằng Quest
                // Board"). Trả về true để engine dialogue tự lo — không jumpTo/end thêm gì (dialogue đã
                // được đóng bởi openQuestListPopup thông qua closeDialogue() gọi kèm, xem ui.js).
                onDialogueAction(action) {
                    if (action === 'view_quests') {
                        if (window.closeDialogue) window.closeDialogue();
                        if (window.openQuestListPopup && this.questBoard) window.openQuestListPopup(this.questBoard);
                        return true;
                    }
                    return false;
                }
            }
            window.Katheryne = Katheryne;

            // ============================================================
            // HỆ THỐNG INVENTORY (Pre-Alpha v0.6)
            // ============================================================
            // Kiến trúc theo đúng 3-layer pattern đã dùng cho Quest/Dialogue/Chest:
            //   1. DATA (ITEM_CATEGORIES, ITEM_DATABASE, ở đây) — định nghĩa TĨNH mọi loại danh mục
            //      và mọi item, KHÔNG hard-code tên/icon/mô tả rải rác nơi khác.
            //   2. WORLD/STATE (class Inventory, class WorldItem, ở đây) — Inventory là kho lưu trữ
            //      số lượng thực tế của người chơi (state), WorldItem là 1 vật phẩm cụ thể nằm trong
            //      thế giới 3D mà người chơi có thể nhặt.
            //   3. ENGINE/UI (renderInventoryGrid, openMenuSubSection('inventory')..., trong ui.js) —
            //      không biết gì về item cụ thể, chỉ đọc ITEM_DATABASE + Inventory rồi vẽ ra DOM.
            //
            // --- ITEM_CATEGORIES: danh mục vật phẩm, dùng cho tab lọc trong UI Inventory ---
            // Chỉ 'material' được coi là "triển khai đầy đủ" ở v0.6 (có item thật, có thể nhặt được
            // ngoài thế giới) — các danh mục còn lại đã khai báo sẵn (kiến trúc mở, mục 3/9 trong đề
            // bài) nhưng CHƯA có item nào thuộc chúng; thêm item mới cho các danh mục này sau này chỉ
            // cần thêm entry vào ITEM_DATABASE, không cần sửa UI hay logic Inventory.
            const ITEM_CATEGORIES = {
                material:    { label: 'Material',    icon: 'fa-solid fa-leaf' },
                food:        { label: 'Food',        icon: 'fa-solid fa-drumstick-bite' },
                quest_item:  { label: 'Quest Item',  icon: 'fa-solid fa-scroll' },
                weapon:      { label: 'Weapon',      icon: 'fa-solid fa-khanda' },
                artifact:    { label: 'Artifact',    icon: 'fa-solid fa-crown' },
                special_item:{ label: 'Special Item',icon: 'fa-solid fa-gem' }
            };
            window.ITEM_CATEGORIES = ITEM_CATEGORIES;

            // --- ITEM_DATABASE: định nghĩa TĨNH của từng loại item (không phải số lượng người chơi
            // đang có — đó là việc của class Inventory bên dưới). Thêm item mới = thêm 1 entry ở đây.
            //   id: khoá duy nhất, dùng xuyên suốt (Inventory Map key, WorldItem tham chiếu tới, v.v.)
            //   name: tên hiển thị
            //   icon: emoji hoặc class Font Awesome (UI tự nhận diện: bắt đầu bằng 'fa-' -> icon FA,
            //         ngược lại hiển thị trực tiếp như text/emoji) — cho phép icon "thật" (ảnh vật
            //         phẩm) sau này chỉ cần đổi giá trị này thành đường dẫn ảnh + UI thêm 1 nhánh nhận
            //         diện (không cần sửa cấu trúc dữ liệu).
            //   description: mô tả hiển thị trong panel chi tiết khi chọn item.
            //   category: khoá tra vào ITEM_CATEGORIES.
            //   stackable: có cộng dồn số lượng vào chung 1 ô hay không (mục 4/8 trong đề bài).
            //   maxStack: số lượng tối đa mỗi stack — CHƯA được Inventory.addItem() enforce cứng ở
            //             v0.6 (vì chưa có giới hạn túi đồ / nhiều stack cùng loại), nhưng đã có sẵn
            //             trong dữ liệu để các phiên bản sau (chia stack, giới hạn túi) dùng ngay mà
            //             không cần đổi schema.
            const ITEM_DATABASE = {
                sweet_flower: {
                    id: 'sweet_flower', name: 'Sweet Flower', icon: '🌸',
                    description: 'Một loài hoa dại mọc quanh các thảo nguyên, có vị ngọt nhẹ. Nguyên liệu nấu ăn cơ bản.',
                    category: 'material', stackable: true, maxStack: 99
                },
                berry: {
                    id: 'berry', name: 'Berry', icon: '🍒',
                    description: 'Quả mọng đỏ mọng nước, thường thấy ven các con đường mòn. Có thể ăn trực tiếp hoặc dùng để chế biến.',
                    category: 'material', stackable: true, maxStack: 99
                },
                mushroom: {
                    id: 'mushroom', name: 'Mushroom', icon: '🍄',
                    description: 'Nấm mọc trong bóng râm dưới các tán cây lớn. Nguyên liệu phổ biến trong nấu ăn.',
                    category: 'material', stackable: true, maxStack: 99
                },
                slime_condensate: {
                    id: 'slime_condensate', name: 'Slime Condensate', icon: '💧',
                    description: 'Phần cô đặc còn sót lại sau khi tiêu diệt Slime. Dùng để rèn và nâng cấp vũ khí.',
                    category: 'material', stackable: true, maxStack: 99
                },
                apple: {
                    id: 'apple', name: 'Apple', icon: '🍎',
                    description: 'Táo chín mọng hái trực tiếp từ cây. Có thể ăn ngay hoặc dùng để chế biến món ăn.',
                    category: 'material', stackable: true, maxStack: 99
                }
            };
            window.ITEM_DATABASE = ITEM_DATABASE;

            // --- CLASS Inventory: kho lưu trữ số lượng THỰC TẾ của người chơi ---
            // State thuần túy — không biết gì về DOM/UI. Dùng Map (không phải object) để tránh mọi vấn
            // đề liên quan prototype chain khi itemId trùng tên thuộc tính có sẵn của Object.
            class Inventory {
                constructor() {
                    this.items = new Map(); // itemId -> quantity (số nguyên > 0)
                }

                // Thêm `quantity` đơn vị của `itemId` vào túi. Nếu item đã tồn tại (và stackable —
                // luôn true với mọi item hiện tại, nhưng vẫn kiểm tra để tôn trọng dữ liệu tương lai)
                // thì cộng dồn; nếu chưa có thì tạo entry mới. Trả về false nếu itemId không tồn tại
                // trong ITEM_DATABASE (tránh rác dữ liệu từ lỗi gõ id).
                addItem(itemId, quantity = 1) {
                    const def = ITEM_DATABASE[itemId];
                    if (!def) {
                        console.warn('Inventory.addItem: itemId không tồn tại trong ITEM_DATABASE:', itemId);
                        return false;
                    }
                    if (quantity <= 0) return false;

                    const current = this.items.get(itemId) || 0;
                    this.items.set(itemId, current + quantity);

                    if (window.onInventoryItemAdded) window.onInventoryItemAdded(itemId, quantity, this.items.get(itemId));
                    if (window.onItemGathered) window.onItemGathered(itemId, quantity);
                    return true;
                }

                getQuantity(itemId) {
                    return this.items.get(itemId) || 0;
                }

                // Trả về mảng [{ id, quantity, ...def }] đã sắp xếp — dùng trực tiếp cho UI render,
                // để ui.js không cần tự tra ITEM_DATABASE lại lần nữa.
                getAllItems() {
                    const result = [];
                    this.items.forEach((quantity, itemId) => {
                        const def = ITEM_DATABASE[itemId];
                        if (!def) return; // Phòng vệ: bỏ qua id rác nếu có
                        result.push(Object.assign({ quantity }, def));
                    });
                    // Sắp theo category rồi theo tên — grid hiển thị có trật tự thay vì thứ tự thêm
                    // ngẫu nhiên (Map giữ thứ tự insertion, không phải thứ tự mong muốn cho UI).
                    result.sort((a, b) => {
                        if (a.category !== b.category) return a.category.localeCompare(b.category);
                        return a.name.localeCompare(b.name);
                    });
                    return result;
                }

                // Lọc theo 1 category cụ thể — dùng cho tab lọc trong UI.
                getItemsByCategory(category) {
                    return this.getAllItems().filter(item => item.category === category);
                }
            }
            window.Inventory = Inventory;

            // Instance DUY NHẤT cho người chơi hiện tại — Pre-Alpha chưa có hệ thống save/load, nên
            // Inventory reset khi tải lại trang (giống mọi state khác của player hiện nay).
            const playerInventory = window.playerInventory = new Inventory();

            // --- CẤU HÌNH RESPAWN WORLD COLLECTIBLE (v0.6 Wilderness) ---
            // Thời gian cố định (giây) cho MỌI loại collectible — đơn giản, dễ chỉnh 1 chỗ duy nhất.
            // Không data-driven theo từng item ở bước này (spec chỉ yêu cầu "sau một khoảng thời gian
            // có thể xuất hiện lại", chưa yêu cầu khác nhau theo loại) — nhưng đặt thành hằng số riêng
            // (không hard-code số trực tiếp trong class) để dễ tách theo item sau này nếu cần.
            const WORLD_ITEM_RESPAWN_SECONDS = 60;

            // --- CLASS WorldItem: 1 vật phẩm CỤ THỂ nằm trong thế giới 3D mà người chơi có thể nhặt.
            // Kế thừa Interactable giống Chest/NPC/QuestBoard. Sau khi nhặt, mesh biến mất NGAY (đúng
            // spec mục 1) nhưng bản thân instance KHÔNG bị huỷ hoàn toàn — nó tự đếm ngược
            // WORLD_ITEM_RESPAWN_SECONDS rồi tự dựng lại mesh + đăng ký lại vào interactables tại ĐÚNG
            // vị trí/loại/số lượng ban đầu (respawn tại chỗ, không phải spawn ngẫu nhiên chỗ khác).
            class WorldItem extends Interactable {
                constructor(position, itemId, quantity = 1, meshBuilder = null) {
                    const def = ITEM_DATABASE[itemId];
                    super(position, def ? `Nhấn F để nhặt ${def.name}` : 'Nhấn F để nhặt', 2.0);
                    this.itemId = itemId;
                    this.quantity = quantity;
                    this.collected = false; // true sau khi đã nhặt, TRONG lúc đang chờ respawn
                    this.respawnTimer = 0;  // giây còn lại trước khi respawn — chỉ đếm khi collected=true
                    // Hàm dựng mesh riêng cho item này — lưu lại để respawn() gọi đúng cách tạo hình dạng
                    // ban đầu (VD: quả táo dùng mesh khác icosahedron mặc định của createWorldItem).
                    this._meshBuilder = meshBuilder;
                }
                onInteract() {
                    if (this.collected) return;
                    this.collected = true;
                    this.respawnTimer = WORLD_ITEM_RESPAWN_SECONDS;

                    playerInventory.addItem(this.itemId, this.quantity);

                    // Dọn mesh khỏi scene — KHÔNG splice khỏi interactables ở đây nữa (khác bản trước):
                    // vẫn cần được update(dt) gọi mỗi frame để đếm respawnTimer. interactionRadius = 0
                    // trong lúc collected để không bao giờ được chọn làm nearbyInteractable (giống cơ
                    // chế Chest.Locked) — khôi phục lại khi respawn() xong.
                    if (this.mesh) {
                        scene.remove(this.mesh);
                        this.mesh.traverse(obj => {
                            if (obj.geometry) obj.geometry.dispose();
                            if (obj.material) obj.material.dispose();
                        });
                        this.mesh = null;
                    }
                    this._collectedInteractionRadius = this.interactionRadius;
                    this.interactionRadius = 0;
                }
                // Gọi mỗi frame (giống pattern update() của QuestBoard/Chest) — chỉ làm việc khi đang
                // trong lúc chờ respawn (collected=true), ngược lại không làm gì (item đang hiện diện
                // bình thường trong world, không cần logic gì thêm mỗi frame).
                update(dt) {
                    if (!this.collected) return;
                    this.respawnTimer -= dt;
                    if (this.respawnTimer <= 0) this._respawn();
                }
                _respawn() {
                    this.collected = false;
                    this.interactionRadius = this._collectedInteractionRadius;

                    // Dựng lại mesh tại ĐÚNG vị trí ban đầu (this.position không đổi trong suốt vòng
                    // đời) — dùng _meshBuilder nếu có (VD apple gắn trên cây), ngược lại fallback về
                    // hình dạng icosahedron mặc định giống createWorldItem() gốc.
                    const mesh = this._meshBuilder ? this._meshBuilder() : buildDefaultWorldItemMesh();
                    mesh.position.copy(this.position);
                    mesh.castShadow = true;
                    scene.add(mesh);
                    this.mesh = mesh;
                }
            }
            window.WorldItem = WorldItem;

            // Hình dạng mặc định cho WorldItem không có meshBuilder riêng — icosahedron phát sáng nhẹ,
            // giữ nguyên placeholder Pre-Alpha đã dùng từ trước.
            function buildDefaultWorldItemMesh() {
                const geo = new THREE.IcosahedronGeometry(0.22, 0);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x86efac, roughness: 0.4, metalness: 0.1,
                    emissive: 0x22c55e, emissiveIntensity: 0.35
                });
                return new THREE.Mesh(geo, mat);
            }

            // Tạo 1 WorldItem hoàn chỉnh (data + mesh 3D + đăng ký vào interactables) tại vị trí mặt
            // đất (x, z) — dùng cho Berry/Mushroom/Sweet Flower rải trong môi trường. `yOffset` (m) cho
            // phép nhấc item lên cao hơn mặt đất 1 chút (VD gắn trên bụi cây) — mặc định 0.35 giống
            // hành vi cũ. Không dùng hàm này cho Apple (xem createAppleOnTree() — cần meshBuilder riêng
            // và vị trí neo theo tán cây thay vì theo getTerrainHeight thẳng).
            function createWorldItem(x, z, itemId, quantity = 1, yOffset = 0.35) {
                const y = getTerrainHeight(x, z);
                const pos = new THREE.Vector3(x, y + yOffset, z);
                const item = new WorldItem(pos, itemId, quantity);

                const mesh = buildDefaultWorldItemMesh();
                mesh.position.copy(pos);
                mesh.castShadow = true;
                scene.add(mesh);
                item.mesh = mesh;

                interactables.push(item);
                return item;
            }
            window.createWorldItem = createWorldItem;


            // --- CẤU HÌNH LOẠI CHEST (CHEST_TYPES, data-driven) ---
            // Mỗi loại Chest là 1 entry độc lập — muốn thêm loại Chest mới (VD: "Remarkable Chest")
            // chỉ cần thêm 1 entry vào đây, KHÔNG cần sửa class Chest hay bất kỳ logic nào khác.
            //   color: màu chủ đạo của nắp/thân Chest (phân biệt trực quan giữa các loại).
            //   sealColor: màu vòng phong ấn lúc Locked (mặc định đỏ theo spec, nhưng để riêng theo
            //              từng loại để sau này có thể tùy biến — VD Chest sự kiện phong ấn màu khác).
            //   rewards: MẢNG phần thưởng (không phải object đơn) — mỗi entry { type, min, max } cho
            //            phép 1 Chest trả về NHIỀU loại phần thưởng cùng lúc (VD sau này: Nguyên Thạch
            //            + Mora + EXP). Hiện tại mỗi loại Chest chỉ có 1 entry 'primogem', nhưng cấu
            //            trúc mảng đã sẵn sàng mở rộng mà không cần đổi shape dữ liệu.
            const CHEST_TYPES = {
                common: {
                    label: 'Common Chest',
                    color: 0x8a6a45,
                    sealColor: 0xdc2626,
                    rewards: [{ type: 'primogem', min: 10, max: 20 }]
                },
                exquisite: {
                    label: 'Exquisite Chest',
                    color: 0x6d8ac9,
                    sealColor: 0xdc2626,
                    rewards: [{ type: 'primogem', min: 20, max: 40 }]
                },
                precious: {
                    label: 'Precious Chest',
                    color: 0x7c5ec9,
                    sealColor: 0xdc2626,
                    rewards: [{ type: 'primogem', min: 40, max: 80 }]
                },
                luxurious: {
                    label: 'Luxurious Chest',
                    color: 0xc9a13b,
                    sealColor: 0xdc2626,
                    rewards: [{ type: 'primogem', min: 80, max: 160 }]
                }
            };
            window.CHEST_TYPES = CHEST_TYPES;

            // --- REWARD HANDLERS (mở rộng theo type, v0.4, bổ sung 'exp' ở v0.6) ---
            // Mỗi handler nhận (amount) và chịu trách nhiệm áp dụng phần thưởng đó vào state thật của
            // người chơi + hiện popup tương ứng. Thêm loại phần thưởng mới (mora, exp, material...) chỉ
            // cần thêm 1 entry vào map này — Chest.open()/Quest turn-in không cần biết chi tiết từng loại.
            const REWARD_HANDLERS = {
                primogem: (amount) => {
                    if (window.showRewardPopup) {
                        window.showRewardPopup('fa-solid fa-gem text-sky-300', `+${amount} Nguyên Thạch`);
                    }
                },
                // Cấp item vào Inventory — dùng cho Chest có reward dạng { type: 'material', itemId,
                // min, max }. Chưa CHEST_TYPES nào dùng loại này ở v0.6 (Inventory chỉ mới ra mắt),
                // nhưng handler đã sẵn sàng để thêm reward vật phẩm cho Chest trong tương lai mà không
                // cần sửa Chest.open()/_grantRewards().
                material: (amount, reward) => {
                    if (!reward || !reward.itemId) {
                        console.warn('REWARD_HANDLERS.material: thiếu reward.itemId'); return;
                    }
                    window.playerInventory.addItem(reward.itemId, amount);
                },
                // --- EXP (v0.6 Wilderness, mục 8) — CHỈ cộng dồn vào player.exp + hiện popup, KHÔNG có
                // hệ thống Level/tăng cấp ở bước này (đúng yêu cầu spec "hiện tại chỉ cần cộng EXP").
                // Thiết kế tách riêng thành handler độc lập (thay vì cộng trực tiếp trong nơi gọi) để
                // sau này thêm logic Level (kiểm tra ngưỡng, levelUp event...) chỉ cần sửa ĐÚNG 1 chỗ
                // này, không phải sửa lại mọi nơi cấp EXP (Slime kill, Quest reward, Chest...).
                exp: (amount) => {
                    player.exp = (player.exp || 0) + amount;
                    if (window.showRewardPopup) {
                        window.showRewardPopup('fa-solid fa-star text-cyan-300', `+${amount} EXP`);
                    }
                }
                // Ví dụ mở rộng sau này:
                // mora: (amount) => { ... },
            };
            window.REWARD_HANDLERS = REWARD_HANDLERS;

            // Tạo Chest 3D — thân hộp gỗ + nắp riêng biệt (để sau này animate mở nắp xoay quanh bản
            // lề), cùng vòng phong ấn (torus) bao quanh dùng cho hiệu ứng Locked. Trả về object gồm các
            // mesh cần thiết để Chest class giữ tham chiếu và animate riêng từng phần.
            function buildChestMeshes(chestColor, sealColor) {
                const group = new THREE.Group();

                const bodyMat = new THREE.MeshStandardMaterial({ color: chestColor, roughness: 0.85, metalness: 0.1 });
                const bodyGeo = new THREE.BoxGeometry(0.9, 0.55, 0.6);
                const body = new THREE.Mesh(bodyGeo, bodyMat);
                body.position.y = 0.275;
                body.castShadow = true; body.receiveShadow = true;
                group.add(body);

                // Nắp: pivot riêng đặt tại mép sau (trục bản lề), để mở animation chỉ cần xoay pivot.
                const lidPivot = new THREE.Group();
                lidPivot.position.set(0, 0.55, -0.3);
                const lidGeo = new THREE.BoxGeometry(0.9, 0.3, 0.6);
                const lid = new THREE.Mesh(lidGeo, bodyMat);
                lid.position.set(0, 0.15, 0.3); // Offset để hình khối nằm đúng vị trí tương đối so với pivot
                lid.castShadow = true;
                lidPivot.add(lid);
                group.add(lidPivot);

                // Viền kim loại trang trí đơn giản quanh mép thân — thuần thẩm mỹ.
                const trimMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.4, metalness: 0.7 });
                const trimGeo = new THREE.BoxGeometry(0.94, 0.08, 0.64);
                const trim = new THREE.Mesh(trimGeo, trimMat);
                trim.position.y = 0.55;
                group.add(trim);

                // Vòng phong ấn (Locked) — torus xoay quanh trục Y, bao quanh Chest theo chiều ngang.
                const sealMat = new THREE.MeshBasicMaterial({ color: sealColor, transparent: true, opacity: 0.85 });
                const sealGeo = new THREE.TorusGeometry(0.75, 0.035, 8, 32);
                const seal = new THREE.Mesh(sealGeo, sealMat);
                seal.rotation.x = Math.PI / 2;
                seal.position.y = 0.4;
                group.add(seal);

                // Vòng ký tự cổ (placeholder Pre-Alpha) — 6 mảnh nhỏ rải quanh vòng phong ấn, xoay
                // NGƯỢC chiều với seal để tạo cảm giác 2 lớp chuyển động khác tốc độ.
                const runeGroup = new THREE.Group();
                const runeMat = new THREE.MeshBasicMaterial({ color: sealColor, transparent: true, opacity: 0.9 });
                const runeCount = 6;
                for (let i = 0; i < runeCount; i++) {
                    const angle = (i / runeCount) * Math.PI * 2;
                    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.02), runeMat);
                    rune.position.set(Math.cos(angle) * 0.75, 0.4, Math.sin(angle) * 0.75);
                    rune.rotation.y = -angle;
                    runeGroup.add(rune);
                }
                group.add(runeGroup);

                return { group, body, lidPivot, trim, seal, runeGroup };
            }

            // --- CẤU HÌNH HIỆU ỨNG CHEST (v0.4) ---
            // Toàn bộ tốc độ/thời lượng animation tập trung ở đây — không hard-code rải rác trong class.
            const CHEST_FX_CONFIG = {
                lockedSealRotSpeed: 0.6,     // rad/s — tốc độ xoay phong ấn lúc Locked
                lockedRuneRotSpeed: -0.9,    // rad/s — tốc độ xoay ngược của vòng ký tự cổ
                unlockDuration: 1.1,         // giây — thời gian toàn bộ animation Unlock (tăng tốc -> tan biến)
                unlockSpinBoost: 10.0,       // rad/s — tốc độ xoay tối đa đạt được lúc sắp tan biến
                particleColorLocked: 0xdc2626,
                particleColorUnlock: 0xfca5a5,
                particleColorOpen: 0xfacc15,
                lidOpenAngle: -Math.PI * 0.75,
                lidOpenDuration: 0.5
            };

            class Chest extends Interactable {
                constructor(position, campId, chestTypeKey) {
                    super(position, '', 2.2);
                    this.campId = campId;
                    this.chestTypeKey = chestTypeKey;
                    this.chestType = CHEST_TYPES[chestTypeKey] || CHEST_TYPES.common;

                    // 3 trạng thái: 'locked' -> 'unlocked' -> 'opened'. Bắt đầu luôn ở 'locked'.
                    this.state = 'locked';
                    this.isOpened = false; // Cờ vĩnh viễn — 1 khi đã mở, KHÔNG BAO GIỜ reset dù slime hồi sinh.

                    this.unlockTimer = 0;   // Đếm tiến trong lúc animation Unlock đang chạy
                    this.idleTimer = Math.random() * 10; // Lệch pha giữa các Chest cho tự nhiên hơn

                    const meshes = buildChestMeshes(this.chestType.color, this.chestType.sealColor);
                    this.meshGroup = meshes.group;
                    this.bodyMesh = meshes.body;
                    this.lidPivot = meshes.lidPivot;
                    this.sealMesh = meshes.seal;
                    this.runeGroup = meshes.runeGroup;
                    this.mesh = this.meshGroup; // Quy ước chung: Interactable.mesh trỏ tới root mesh

                    // Locked: interactionRadius = 0 để KHÔNG BAO GIỜ được chọn làm nearbyInteractable
                    // (spec: "Không hiển thị bất kỳ nút Mở hay Tương tác" khi Locked) — khôi phục về giá
                    // trị thật ngay khi chuyển sang Unlocked (xem _enterUnlocked()).
                    this._unlockedInteractionRadius = 2.2;
                    this.interactionRadius = 0;
                }

                // Camp còn slime sống hay không — dùng `enemies` (mảng toàn cục) + campId, đúng pattern
                // đã dùng ở hệ thống Camp cũ (aliveInCamp). Tách thành hàm riêng để dễ đọc/tái sử dụng.
                _campHasAliveSlimes() {
                    return enemies.some(e => e.isSlime && e.alive && e.camp === this.campId);
                }

                getPromptText() {
                    // Locked không bao giờ tới đây (interactionRadius = 0 nên không thể là nearbyInteractable),
                    // nhưng vẫn thủ sẵn cho an toàn/rõ ràng nếu logic gọi thay đổi sau này.
                    if (this.state !== 'unlocked') return '';
                    return 'Mở';
                }

                onInteract() {
                    if (this.state !== 'unlocked') return;
                    this._open();
                }

                // Gọi mỗi frame (giống pattern QuestBoard.update) — theo dõi camp để tự chuyển Locked
                // -> Unlocked, và animate theo đúng state hiện tại.
                update(dt) {
                    this.idleTimer += dt;

                    if (this.state === 'locked') {
                        // Nếu Chest đã từng mở trước đây (không thể xảy ra khi vẫn đang 'locked', nhưng
                        // kiểm tra tường minh cho rõ ràng/an toàn) thì không bao giờ tính lại điều kiện —
                        // spec: "Slime hồi sinh không được khóa lại Chest đã mở".
                        if (!this._campHasAliveSlimes()) {
                            this._enterUnlocked();
                        } else {
                            this._updateLockedAnimation(dt);
                        }
                        return;
                    }

                    if (this.state === 'unlocking') {
                        this._updateUnlockingAnimation(dt);
                        return;
                    }

                    if (this.state === 'unlocked') {
                        this._updateUnlockedIdleAnimation(dt);
                        return;
                    }

                    // 'opened': không còn animation lặp lại, giữ nguyên hình dạng cuối (nắp mở).
                }

                _updateLockedAnimation(dt) {
                    this.sealMesh.rotation.z += CHEST_FX_CONFIG.lockedSealRotSpeed * dt;
                    this.runeGroup.rotation.y += CHEST_FX_CONFIG.lockedRuneRotSpeed * dt;
                    const pulse = 0.75 + Math.sin(this.idleTimer * 2.0) * 0.15;
                    this.sealMesh.material.opacity = pulse;

                    if (Math.random() < 0.08) {
                        spawnChestParticle(this.position, CHEST_FX_CONFIG.particleColorLocked, 0.4);
                    }
                }

                // Bắt đầu animation Unlock (phong ấn phát sáng mạnh -> tăng tốc xoay -> tan thành hạt
                // sáng -> biến mất). Trong lúc animation chạy, Chest ở state trung gian 'unlocking' —
                // vẫn CHƯA cho tương tác (interactionRadius = 0) cho tới khi animation hoàn tất hẳn.
                _enterUnlocked() {
                    this.state = 'unlocking';
                    this.unlockTimer = 0;
                    sfx.playHydroSplash(); // Placeholder Pre-Alpha — chưa có SFX riêng cho Chest
                }

                _updateUnlockingAnimation(dt) {
                    this.unlockTimer += dt;
                    const t = Math.min(1, this.unlockTimer / CHEST_FX_CONFIG.unlockDuration);

                    const spinSpeed = CHEST_FX_CONFIG.lockedSealRotSpeed + t * (CHEST_FX_CONFIG.unlockSpinBoost - CHEST_FX_CONFIG.lockedSealRotSpeed);
                    this.sealMesh.rotation.z += spinSpeed * dt;
                    this.runeGroup.rotation.y += CHEST_FX_CONFIG.lockedRuneRotSpeed * (1 + t * 6) * dt;

                    // Phát sáng mạnh dần rồi tan biến (opacity tăng nửa đầu, giảm về 0 nửa sau).
                    const glow = t < 0.5 ? (t / 0.5) : (1 - (t - 0.5) / 0.5);
                    this.sealMesh.material.opacity = glow;
                    this.runeGroup.children.forEach(r => { r.material.opacity = glow; });

                    if (Math.random() < 0.5) {
                        spawnChestParticle(this.position, CHEST_FX_CONFIG.particleColorUnlock, 0.6);
                    }

                    if (t >= 1) {
                        this.sealMesh.visible = false;
                        this.runeGroup.visible = false;
                        this.state = 'unlocked';
                        this.interactionRadius = this._unlockedInteractionRadius; // Giờ mới cho phép tương tác
                    }
                }

                _updateUnlockedIdleAnimation(dt) {
                    // Ánh sáng vàng nhẹ hắt ra từ thân Chest — mô phỏng đơn giản bằng cách nhấp nháy
                    // emissive-ish qua việc dao động scale nhẹ (placeholder Pre-Alpha, chưa cần shader).
                    const pulse = 1.0 + Math.sin(this.idleTimer * 2.5) * 0.03;
                    this.trimScale = pulse;
                    if (Math.random() < 0.05) {
                        spawnChestParticle(this.position, CHEST_FX_CONFIG.particleColorUnlock, 0.3);
                    }
                }

                _open() {
                    if (this.isOpened) return; // An toàn tuyệt đối — không mở 2 lần dù bị gọi lại
                    this.isOpened = true;
                    this.state = 'opened';
                    this.interactionRadius = 0; // Không còn là nearbyInteractable nữa sau khi đã mở

                    this._playOpenAnimation();
                    this._grantRewards();

                    sfx.playBurst(); // Placeholder Pre-Alpha

                    // Rương biến mất khỏi scene SAU KHI animation mở nắp + burst hạt sáng chạy xong —
                    // KHÔNG xóa ngay lập tức để người chơi còn kịp thấy hiệu ứng mở. Đồng thời báo cho
                    // hệ thống Camp biết để bắt đầu đếm 120s hồi sinh (xem startCampRespawnCycle) —
                    // CHỈ bắt đầu đếm từ đúng thời điểm này (lúc mở rương thật sự), không phải lúc
                    // slime cuối cùng chết — nếu người chơi không mở rương thì không có gì đếm giờ cả.
                    const disappearDelay = Math.max(CHEST_FX_CONFIG.lidOpenDuration, 0.9) * 1000;
                    setTimeout(() => {
                        this._removeFromScene();
                        if (window.startCampRespawnCycle) window.startCampRespawnCycle(this.campId);
                    }, disappearDelay);
                }

                // Gỡ hoàn toàn khỏi scene + khỏi mảng interactables — rương "biến mất" đúng nghĩa đen,
                // không chỉ ẩn hình. Camp sẽ tự tạo Chest MỚI (instance khác) khi hoàn tất chu kỳ hồi
                // sinh — instance Chest hiện tại coi như đã hoàn thành vòng đời của nó.
                _removeFromScene() {
                    if (this.meshGroup && this.meshGroup.parent) scene.remove(this.meshGroup);
                    const idx = interactables.indexOf(this);
                    if (idx !== -1) interactables.splice(idx, 1);
                    if (window.nearbyInteractable === this) window.nearbyInteractable = null;
                }

                _playOpenAnimation() {
                    // Animate mở nắp: xoay lidPivot từ 0 -> lidOpenAngle qua lidOpenDuration giây, dùng
                    // vòng lặp requestAnimationFrame nhẹ độc lập với animate() chính — Pre-Alpha, chấp
                    // nhận cách đơn giản này thay vì tích hợp vào 1 hệ thống tween tổng quát.
                    const startTime = performance.now();
                    const duration = CHEST_FX_CONFIG.lidOpenDuration * 1000;
                    const animateLid = () => {
                        const elapsed = performance.now() - startTime;
                        const t = Math.min(1, elapsed / duration);
                        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
                        this.lidPivot.rotation.x = CHEST_FX_CONFIG.lidOpenAngle * eased;
                        if (t < 1) requestAnimationFrame(animateLid);
                    };
                    animateLid();

                    // Burst ánh sáng vàng + particle bay lên tại vị trí Chest.
                    for (let i = 0; i < 24; i++) {
                        spawnChestParticle(this.position, CHEST_FX_CONFIG.particleColorOpen, 1.4, true);
                    }
                    triggerHydroFlash(); // Placeholder Pre-Alpha — dùng lại hiệu ứng flash sẵn có
                }

                // Tính toán + áp dụng toàn bộ phần thưởng của Chest này. Data-driven qua
                // this.chestType.rewards — không hard-code loại/khoảng giá trị ở đây.
                _grantRewards() {
                    this.chestType.rewards.forEach(reward => {
                        const amount = Math.floor(Math.random() * (reward.max - reward.min + 1)) + reward.min;
                        const handler = REWARD_HANDLERS[reward.type];
                        if (handler) handler(amount, reward);
                        else console.warn('Chest: không có REWARD_HANDLERS cho type', reward.type);
                    });
                }
            }
            window.Chest = Chest;

            // Particle placeholder cho Chest (đỏ lúc Locked/Unlock, vàng lúc Open) — tận dụng hệ thống
            // particles[] chung sẵn có (xem spawnHydroTrail/spawnCombatSparks để tham khảo pattern),
            // KHÔNG tạo hệ thống particle riêng cho Chest.
            function spawnChestParticle(position, color, life, isBurst) {
                const geo = new THREE.SphereGeometry(isBurst ? 0.08 : 0.05, 5, 4);
                const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
                const p = new THREE.Mesh(geo, mat);
                p.position.copy(position);
                p.position.y += 0.4 + Math.random() * 0.6;
                p.position.x += (Math.random() - 0.5) * 0.9;
                p.position.z += (Math.random() - 0.5) * 0.9;
                scene.add(p);

                const velocity = isBurst
                    ? new THREE.Vector3((Math.random() - 0.5) * 3.5, Math.random() * 5.5 + 2.5, (Math.random() - 0.5) * 3.5)
                    : new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 1.2 + 0.4, (Math.random() - 0.5) * 0.6);

                particles.push({
                    mesh: p, velocity, life: life || 0.5, maxLife: life || 0.5,
                    gravity: isBurst ? 9 : 0, scaleDown: true
                });
            }

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
                    ],
                    exp: { min: 5, max: 10 }
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

            // --- GỌI KHI 1 SLIME BỊ TIÊU DIỆT (v0.6 Wilderness) — xử lý Drop + EXP ---
            // Gọi từ Slime.takeDamage() trong enemies.js NGAY TRƯỚC/CÙNG LÚC với onEnemyKilled('slime')
            // (tách biệt 2 hàm: onEnemyKilled lo cập nhật quest tiến độ 'kill', onSlimeKilled lo
            // drop/exp — single-responsibility, không gộp chung để dễ mở rộng độc lập). Nhận thẳng
            // instance `slime` (không chỉ targetType string) để có vị trí chính xác cho loot rơi ra.
            function onSlimeKilled(slime) {
                const lootTable = ENEMY_LOOT_TABLES.slime;
                if (!lootTable) return;

                spawnLootDrops(slime.position, lootTable);

                if (lootTable.exp) {
                    const expAmount = Math.floor(Math.random() * (lootTable.exp.max - lootTable.exp.min + 1)) + lootTable.exp.min;
                    const handler = REWARD_HANDLERS.exp;
                    if (handler) handler(expAmount);
                }
            }
            window.onSlimeKilled = onSlimeKilled;


            // Vị trí spawn/hồi sinh mặc định của player — nguồn sự thật duy nhất, dùng cho cả
            // respawn sau khi chết (combat/drown/fall) VÀ teleport khi rơi khỏi vùng chơi hợp lệ (void).
            const PLAYER_SPAWN_POSITION = new THREE.Vector3(0, 0.9, 0);

            const player = window.player = {
                mesh: null,
                width: 0.8, height: 1.8, depth: 0.8,
                position: new THREE.Vector3(0, 0.9, 0),
                velocity: new THREE.Vector3(0, 0, 0),
                inputVelocity: new THREE.Vector3(0, 0, 0), 
                
                hp: 100, maxHp: 100, invulnTimer: 0.0, staggerTimer: 0.0, isDead: false,
                // Chỉ số sát thương tập trung — mỗi loại đòn đọc từ đây thay vì hard-code.
                attack: { melee: 1, plunge: 3, burst: 4, hydroProjectile: 1.5 },
                energy: 0, maxEnergy: 40, skillHitCount: 0,

                // --- EXP (v0.6 Wilderness, mục 8) — chỉ cộng dồn, CHƯA có hệ thống Level/tăng cấp.
                // Xem REWARD_HANDLERS.exp — mọi nguồn EXP (Slime kill, Quest reward...) đều cộng qua
                // ĐÚNG 1 đường này, không cộng trực tiếp vào player.exp ở nơi khác.
                exp: 0,

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
                stamina: 80.0, maxStamina: 80.0,
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
                    maxRange: 16,
                    trailChance: 0.6 // Xác suất/frame sinh hạt nước theo đường bay
                },
                pressureShot: {
                    damage: 2, // Hệ số nhân với player.attack.hydroProjectile
                    maxRange: 24,
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
            const burstAimState = {
                phase: 'idle'
            };
            window.burstAimState = burstAimState;

            // ============================================================
            // SKILL AIM STATE — state machine cho Elemental Skill Tap/Hold (v0.9.6)
            // ============================================================
            // Gom toàn bộ trạng thái Tap/Hold/Aim vào 1 object duy nhất thay vì rải nhiều field rời rạc
            // trên player. 3 giai đoạn (phase):
            //   'idle'    — không có gì đang diễn ra (mặc định).
            //   'holding' — phím vừa được nhấn xuống, đang đếm thời gian giữ để phân biệt Tap/Hold.
            //   'aiming'  — đã vượt ngưỡng holdThreshold, đang trong Aim State thực sự (chặn di chuyển,
            //               camera zoom + lệch, bắn tia nhỏ liên tục theo hướng crosshair).
            // Dùng 3 hàm enter/update/exit theo đúng phong cách state hiện có của dự án (không cần OOP
            // class riêng) — startSkillAim(), updateSkillAim(dt), endSkillAim().
            const skillAimState = {
                phase: 'idle',
                heldTime: 0,      // Thời gian (giây) đã giữ phím, dùng ở phase 'holding'
                aimTimer: 0,      // Thời gian (giây) đã ở phase 'aiming', dùng để check aim.maxDuration
                fireTimer: 0,     // Đếm lùi (giây) tới lần bắn tia nhỏ kế tiếp, dùng ở phase 'aiming'
                cameraOffsetT: 0  // 0..1 — tiến độ lerp offset camera (0 = bình thường, 1 = full aim offset)
            };
            window.skillAimState = skillAimState;



            // --- CẤU HÌNH SÁT THƯƠNG RƠI (FALL DAMAGE) ---
            // Pre-Alpha: giá trị tạm thời, sẽ cân bằng lại sau. Toàn bộ ngưỡng/độ lớn sát thương
            // tập trung DUY NHẤT ở đây — không hard-code rải rác nơi khác. Muốn chỉnh cân bằng
            // sau này chỉ cần sửa mảng "tiers" bên dưới.
            // Quy ước: mỗi tier áp dụng cho khoảng [minHeight, maxHeight). Sắp xếp tăng dần theo minHeight.
            // lethal: true nghĩa là tier này có thể gây tử vong (trừ toàn bộ HP còn lại).
            // reprieveChance: chỉ áp dụng khi lethal=true — xác suất (0..1) nhân vật "hấp hối"
            // (còn lại 1 HP) thay vì tử vong hẳn. VD 0.1 = 10% cơ hội sống sót với 1 HP.
            const FALL_DAMAGE_CONFIG = {
                tiers: [
                    { minHeight: 0,  maxHeight: 9,        damage: 0,  lethal: false }, // An toàn, không mất HP
                    { minHeight: 9,  maxHeight: 18,       damage: 15, lethal: false }, // Mất một lượng HP nhỏ
                    { minHeight: 18, maxHeight: 27,       damage: 45, lethal: false }, // Mất nhiều HP
                    { minHeight: 27, maxHeight: Infinity, damage: Infinity, lethal: true, reprieveChance: 0.10 } // Có thể tử vong, 10% hấp hối còn 1 HP
                ]
            };

            // Hàm thuần (pure function): độ cao rơi (m) -> { damage, lethal, reprieveChance }.
            // Tách riêng khỏi logic physics để dễ test/điều chỉnh độc lập.
            function calculateFallDamage(fallHeight) {
                const tiers = FALL_DAMAGE_CONFIG.tiers;
                for (let i = 0; i < tiers.length; i++) {
                    const tier = tiers[i];
                    if (fallHeight >= tier.minHeight && fallHeight < tier.maxHeight) {
                        return { damage: tier.damage, lethal: tier.lethal, reprieveChance: tier.reprieveChance || 0 };
                    }
                }
                // Fallback an toàn: nếu vì lý do gì đó không khớp tier nào (VD số âm do sai số),
                // không gây sát thương thay vì crash hoặc gây tử vong ngoài ý muốn.
                return { damage: 0, lethal: false, reprieveChance: 0 };
            }

            // Áp dụng sát thương rơi lên player khi vừa tiếp đất sau một cú rơi tự do.
            // Được gọi từ updatePhysics() đúng thời điểm groundedNow chuyển từ false -> true.
            function applyFallDamage(fallHeight) {
                if (!(fallHeight > 0)) return; // NaN hoặc <= 0: không phải rơi tự do, bỏ qua

                const result = calculateFallDamage(fallHeight);
                if (result.damage <= 0 && !result.lethal) return; // Trong ngưỡng an toàn

                if (player.invulnTimer > 0) return; // Đang bất tử (vừa trúng đòn khác), bỏ qua để tránh chồng sát thương

                if (result.lethal) {
                    // "Hấp hối": có xác suất reprieveChance sống sót với đúng 1 HP thay vì tử vong hẳn.
                    const survives = Math.random() < result.reprieveChance;
                    player.hp = survives ? 1 : 0;
                } else {
                    player.hp = Math.max(0, player.hp - result.damage);
                }
                player.invulnTimer = 0.8;
                triggerDamageFlash();
                sfx.playHit();
                cameraState.shakeTimer = 0.3;
                cameraState.shakeIntensity = 0.4;

                if (player.hp <= 0) enterDeadState('fall');
            }


            function getPlayerAABBAt(pos) {
                return new AABB(
                    pos.x - player.width / 2, pos.y - player.height / 2, pos.z - player.depth / 2,
                    pos.x + player.width / 2, pos.y + player.height / 2, pos.z + player.depth / 2
                );
            }

            const cameraState = window.cameraState = {
                targetTheta: Math.PI / 4, targetPhi: Math.PI / 6,   
                currentTheta: Math.PI / 4, currentPhi: Math.PI / 6,
                distance: 9, targetDistance: 9, minDistance: 4, maxDistance: 12,    
                targetYOffset: 0.6, 
                targetFocus: new THREE.Vector3(0, 0.9, 0), currentFocus: new THREE.Vector3(0, 0.9, 0),
                minPhi: -Math.PI / 3, maxPhi: Math.PI / 2.3, 
                sensitivity: 0.0024, zoomSensitivity: 0.05,
                
                rotationDamping: 14.0, 
                followDamping: 4.8,    
                zoomDamping: 5.0,     

                shakeTimer: 0, shakeIntensity: 0, shakeOffset: new THREE.Vector3(0, 0, 0)
            };

            let hitstopTimer = 0;

            function getGroundYForPosition(pos) {
                let bestGroundY = getTerrainHeight(pos.x, pos.z);
                const footInset = 0.18; 
                obstacles.forEach(obs => {
                    const xOver = (pos.x + player.width/2 - footInset >= obs.aabb.minX) && 
                                  (pos.x - player.width/2 + footInset <= obs.aabb.maxX);
                    const zOver = (pos.z + player.depth/2 - footInset >= obs.aabb.minZ) && 
                                  (pos.z - player.depth/2 + footInset <= obs.aabb.maxZ);
                    if (xOver && zOver) {
                        if (pos.y >= obs.aabb.maxY - 0.25) {
                            if (obs.aabb.maxY > bestGroundY) bestGroundY = obs.aabb.maxY;
                        }
                    }
                });
                return bestGroundY;
            }
            window.getGroundYForPosition = getGroundYForPosition;

            function getInitialGroundY(x, z, width, depth) {
                let bestGroundY = getTerrainHeight(x, z);
                const footInset = 0.18;
                obstacles.forEach(obs => {
                    const xOver = (x + width/2 - footInset >= obs.aabb.minX) && 
                                  (x - width/2 + footInset <= obs.aabb.maxX);
                    const zOver = (z + depth/2 - footInset >= obs.aabb.minZ) && 
                                  (z - depth/2 + footInset <= obs.aabb.maxZ);
                    if (xOver && zOver) {
                        if (obs.aabb.maxY > bestGroundY) {
                            bestGroundY = obs.aabb.maxY;
                        }
                    }
                });
                return bestGroundY;
            }
            window.getInitialGroundY = getInitialGroundY;

            function resolveStaticCollisions(entity, width, height, depth, dt) {
                const halfW = width / 2, halfH = height / 2, halfD = depth / 2;
                const eps = 0.001;
                let currentAABB = new AABB();
                currentAABB.updateFromObject(entity.mesh, width, height, depth);
                const entityBottom = entity.position.y - halfH;

                const maxPushStep = 0.28;
                if (entity === player) player.wallContactNormal = null;

                for (let i = 0; i < obstacles.length; i++) {
                    const obs = obstacles[i];
                    if (intersectAABB(currentAABB, obs.aabb)) {
                        const stepDiff = obs.aabb.maxY - entityBottom;
                        const isWall = stepDiff > 0.35; 
                        if (isWall) {
                            const overlapX1 = currentAABB.maxX - obs.aabb.minX;
                            const overlapX2 = obs.aabb.maxX - currentAABB.minX;
                            const minOverlapX = Math.min(overlapX1, overlapX2);
                            
                            const overlapZ1 = currentAABB.maxZ - obs.aabb.minZ;
                            const overlapZ2 = obs.aabb.maxZ - currentAABB.minZ;
                            const minOverlapZ = Math.min(overlapZ1, overlapZ2);
                            
                            if (minOverlapX < minOverlapZ && minOverlapX < 0.6) {
                                let pushX = 0;
                                let normal = new THREE.Vector3();
                                if (overlapX1 < overlapX2) {
                                    pushX = -Math.min(overlapX1, maxPushStep);
                                    normal.set(-1, 0, 0);
                                } else {
                                    pushX = Math.min(overlapX2, maxPushStep);
                                    normal.set(1, 0, 0);
                                }
                                entity.position.x += pushX;
                                if (entity === player) player.wallContactNormal = normal;

                                if (entity.velocity && !entity.isClimbing) {
                                    entity.velocity.x *= 0.15;
                                }
                                if (entity.knockback) entity.knockback.x = 0;
                                entity.mesh.position.copy(entity.position);
                                currentAABB.updateFromObject(entity.mesh, width, height, depth);
                            }
                        }
                    }
                }

                for (let i = 0; i < obstacles.length; i++) {
                    const obs = obstacles[i];
                    if (intersectAABB(currentAABB, obs.aabb)) {
                        const stepDiff = obs.aabb.maxY - entityBottom;
                        const isWall = stepDiff > 0.35;
                        if (isWall) {
                            const overlapX1 = currentAABB.maxX - obs.aabb.minX;
                            const overlapX2 = obs.aabb.maxX - currentAABB.minX;
                            const minOverlapX = Math.min(overlapX1, overlapX2);
                            
                            const overlapZ1 = currentAABB.maxZ - obs.aabb.minZ;
                            const overlapZ2 = obs.aabb.maxZ - currentAABB.minZ;
                            const minOverlapZ = Math.min(overlapZ1, overlapZ2);
                            
                            if (minOverlapZ <= minOverlapX && minOverlapZ < 0.6) {
                                let pushZ = 0;
                                let normal = new THREE.Vector3();
                                if (overlapZ1 < overlapZ2) {
                                    pushZ = -Math.min(overlapZ1, maxPushStep);
                                    normal.set(0, 0, -1);
                                } else {
                                    pushZ = Math.min(overlapZ2, maxPushStep);
                                    normal.set(0, 0, 1);
                                }
                                entity.position.z += pushZ;
                                if (entity === player && !player.wallContactNormal) player.wallContactNormal = normal;

                                if (entity.velocity && !entity.isClimbing) {
                                    entity.velocity.z *= 0.15;
                                }
                                if (entity.knockback) entity.knockback.z = 0;
                                entity.mesh.position.copy(entity.position);
                                currentAABB.updateFromObject(entity.mesh, width, height, depth);
                            }
                        }
                    }
                }
            }
            window.resolveStaticCollisions = resolveStaticCollisions;

            function resolveDynamicCollisions() {
                const pAABB = getPlayerAABBAt(player.position);
                enemies.forEach(enemy => {
                    if (!enemy.alive) return;
                    if (intersectAABB(pAABB, enemy.aabb)) {
                        const overlapX1 = pAABB.maxX - enemy.aabb.minX, overlapX2 = enemy.aabb.maxX - pAABB.minX;
                        const overlapZ1 = pAABB.maxZ - enemy.aabb.minZ, overlapZ2 = enemy.aabb.maxZ - pAABB.minZ;
                        const minOverlapX = overlapX1 < overlapX2 ? overlapX1 : -overlapX2;
                        const minOverlapZ = overlapZ1 < overlapZ2 ? overlapZ1 : -overlapZ2;

                        const pushVec = new THREE.Vector3();
                        if (Math.abs(minOverlapX) < Math.abs(minOverlapZ)) pushVec.x = minOverlapX;
                        else pushVec.z = minOverlapZ;

                        const pMass = 1.0;
                        const eMass = enemy.isLarge ? 2.5 : (enemy.isSlime ? 0.5 : 1.5);
                        const totalMass = pMass + eMass;

                        player.position.addScaledVector(pushVec, -eMass / totalMass);
                        enemy.position.addScaledVector(pushVec, pMass / totalMass);

                        if (enemy.isSlime && !enemy.isGrounded) {
                            const pushBack = new THREE.Vector3().subVectors(player.position, enemy.position);
                            pushBack.y = 0;
                            if (pushBack.lengthSq() > 0.01) {
                                pushBack.normalize().multiplyScalar(1.2);
                                player.velocity.add(pushBack);
                                player.inputVelocity.multiplyScalar(0.72); 
                            }
                        } else {
                            if (player.velocity.lengthSq() > 0.1) player.velocity.multiplyScalar(0.96); 
                        }

                        pAABB.updateFromObject(player.mesh, player.width, player.height, player.depth);
                        enemy.mesh.position.copy(enemy.position);
                        enemy.aabb.updateFromObject(enemy.mesh, enemy.width, enemy.height, enemy.depth);
                    }
                });
            }

            // class Enemy, class Slime đã tách sang enemies.js (load trước file này).

            // Tạo geometry 1 "cọng cỏ" dạng cross-quad (2 mặt phẳng vuông góc nhau) thủ công bằng
            // BufferGeometry thuần — KHÔNG dùng THREE.BufferGeometryUtils.mergeGeometries() vì bundle
            // Three.js r128 (core only, xem index.html) không có addon đó. Pivot ở gốc (chân cỏ, y=0).
            function createGrassBladeCrossGeometry() {
                const w = 0.22, h = 0.5;
                // 2 mặt phẳng: mặt A dọc trục Z (song song mặt phẳng XZ nhìn theo X), mặt B xoay 90°
                // quanh Y (song song mặt phẳng XZ nhìn theo Z) — tạo hình chữ thập nhìn từ trên xuống.
                const positions = new Float32Array([
                    // Mặt A (nằm trong mặt phẳng XY, độ dày theo X=0)
                    -w / 2, 0, 0,   w / 2, 0, 0,   w / 2, h, 0,
                    -w / 2, 0, 0,   w / 2, h, 0,   -w / 2, h, 0,
                    // Mặt B (xoay 90° quanh Y — nằm trong mặt phẳng ZY, độ dày theo Z=0)
                    0, 0, -w / 2,   0, 0, w / 2,   0, h, w / 2,
                    0, 0, -w / 2,   0, h, w / 2,   0, h, -w / 2
                ]);
                const uvs = new Float32Array([
                    0, 0, 1, 0, 1, 1,
                    0, 0, 1, 1, 0, 1,
                    0, 0, 1, 0, 1, 1,
                    0, 0, 1, 1, 0, 1
                ]);
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
                geo.computeVertexNormals();
                return geo;
            }

            // --- LỚP CỎ THẤP (GRASS BLADES, v0.3 Frontier) ---
            // InstancedMesh (1 draw call cho hàng nghìn cọng cỏ) — phủ thêm 1 lớp hình khối đơn giản
            // (2 mặt phẳng chéo nhau kiểu "cross-quad", quen thuộc trong game 3D nhẹ) lên trên vùng đất
            // đã tô màu cỏ, tạo cảm giác có thực vật mọc lên thay vì chỉ là mặt phẳng tô màu. Né vùng
            // dốc, vùng gần nước, spawn clearing, và structureZones — chỉ mọc trên đồng cỏ bằng phẳng.
            function createGrassBlades() {
                const crossGeo = createGrassBladeCrossGeometry();

                const bladeMat = new THREE.MeshStandardMaterial({
                    color: 0x6f9c55, roughness: 1.0, metalness: 0.0,
                    side: THREE.DoubleSide, transparent: true, alphaTest: 0.5
                });

                const maxBlades = 9000;
                const grassMesh = new THREE.InstancedMesh(crossGeo, bladeMat, maxBlades);
                grassMesh.castShadow = false; grassMesh.receiveShadow = true;

                const dummy = new THREE.Object3D();
                const rng = createSeededRng(777);
                let count = 0;
                const half = 48; // Chừa 2m lùi vào so với rìa Void (±50) để tránh mọc cỏ sát mép

                for (let i = 0; i < maxBlades && count < maxBlades; i++) {
                    const x = (rng() * 2 - 1) * half;
                    const z = (rng() * 2 - 1) * half;

                    if (Math.hypot(x, z) < SPAWN_CLEARING_RADIUS + 1.0) continue; // Né spawn clearing (+ chút đệm)

                    const h = getTerrainHeight(x, z);
                    if (h <= (window.VOID_DEPTH_Y ?? -100.0) + 1) continue; // Né Void
                    if (h < -0.5) continue; // Né gần/trong lòng hồ (đất bùn, không mọc cỏ)

                    // Ước lượng độ dốc cục bộ bằng sai phân hữu hạn — né sườn dốc (chỉ mọc trên đất bằng).
                    const dHdx = getTerrainHeight(x + 0.5, z) - getTerrainHeight(x - 0.5, z);
                    const dHdz = getTerrainHeight(x, z + 0.5) - getTerrainHeight(x, z - 0.5);
                    const slope = Math.hypot(dHdx, dHdz);
                    if (slope > 0.35) continue;

                    dummy.position.set(x, h, z);
                    dummy.rotation.y = rng() * Math.PI * 2;
                    const scale = 0.7 + rng() * 0.7;
                    dummy.scale.set(scale, scale * (0.8 + rng() * 0.4), scale);
                    dummy.updateMatrix();
                    grassMesh.setMatrixAt(count, dummy.matrix);
                    count++;
                }

                grassMesh.count = count;
                grassMesh.instanceMatrix.needsUpdate = true;
                scene.add(grassMesh);
            }

            function initThree() {
                scene = new THREE.Scene();
                scene.background = new THREE.Color('#cbd5e1'); 
                scene.fog = new THREE.FogExp2('#cbd5e1', 0.01); 

                camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

                renderer = new THREE.WebGLRenderer({ antialias: true });
                renderer.setSize(window.innerWidth, window.innerHeight);
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                container.appendChild(renderer.domElement);

                const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
                scene.add(ambientLight);

                const sunLight = new THREE.DirectionalLight(0xffffff, 0.5); 
                sunLight.position.set(15, 30, 10); 
                sunLight.castShadow = true;
                sunLight.shadow.mapSize.width = 1024; sunLight.shadow.mapSize.height = 1024;
                sunLight.shadow.camera.near = 0.5; sunLight.shadow.camera.far = 100;
                const d = 35;
                sunLight.shadow.camera.left = -d; sunLight.shadow.camera.right = d; sunLight.shadow.camera.top = d; sunLight.shadow.camera.bottom = -d;
                scene.add(sunLight);

                const groundSize = 100;
                // Sử dụng Segment cao (120x120) để thể hiện đường cong mượt mà của lòng hồ
                const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, 120, 120);
                
                // Thay đổi cao độ các Vertex của Plane để khớp với hàm getTerrainHeight
                const posAttr = groundGeo.attributes.position;
                for (let i = 0; i < posAttr.count; i++) {
                    const vx = posAttr.getX(i);
                    const vy = posAttr.getY(i);
                    // Sau khi Plane được xoay -90 độ quanh trục X, local X giữ nguyên, local Y trở thành world Z
                    const height = getTerrainHeight(vx, vy);
                    posAttr.setZ(i, height); // Z chính là cao độ (elevation) trước khi xoay Plane
                }
                groundGeo.computeVertexNormals();

                // --- TÔ MÀU ĐẤT + CỎ (VERTEX COLOR, v0.3 Frontier) ---
                // Pre-Alpha: chưa dùng texture ảnh ngoài — tô màu trực tiếp từng vertex dựa trên cao độ
                // + độ dốc cục bộ (ước lượng qua vertex normal đã computeVertexNormals() ở trên), rồi
                // dùng vertexColors trên material để nhân với màu base. 3 quy tắc pha màu:
                //   - Vùng LÕM SÂU (gần/trong lòng hồ, height < lakeShoreline): đất bùn sẫm màu hơn.
                //   - Vùng DỐC (normal.y thấp, tức mặt nghiêng nhiều — sườn đồi/bờ hồ): đất nâu lộ ra,
                //     cỏ không bám được trên dốc đứng — mô phỏng tự nhiên đơn giản.
                //   - Vùng CÒN LẠI (bằng phẳng, không quá thấp): cỏ xanh, có dao động màu nhẹ theo vị
                //     trí (2 sóng sin lệch tần số) để tránh cảm giác 1 màu xanh đồng nhất, phẳng lì.
                const grassColorA = new THREE.Color(0x5f8a4a);
                const grassColorB = new THREE.Color(0x6f9c55);
                const dirtColor = new THREE.Color(0x8a6a45);
                const mudColor = new THREE.Color(0x5c4a35);
                const colors = new Float32Array(posAttr.count * 3);
                const normalAttr = groundGeo.attributes.normal;
                const tmpColor = new THREE.Color();
                for (let i = 0; i < posAttr.count; i++) {
                    const vx = posAttr.getX(i);
                    const vy = posAttr.getY(i);
                    const elevation = posAttr.getZ(i);
                    const normalY = normalAttr.getZ(i); // Trước khi xoay Plane, "lên" cục bộ là trục Z local

                    const slopeFactor = 1 - THREE.MathUtils.clamp(normalY, 0, 1); // 0 = phẳng, 1 = rất dốc
                    const isNearWater = elevation < -0.6;

                    if (isNearWater) {
                        const t = THREE.MathUtils.clamp((-elevation - 0.6) / 1.2, 0, 1);
                        tmpColor.copy(dirtColor).lerp(mudColor, t);
                    } else {
                        const noise = Math.sin(vx * 0.18 + vy * 0.11) * 0.5 + Math.sin(vx * 0.07 - vy * 0.15) * 0.5;
                        tmpColor.copy(grassColorA).lerp(grassColorB, (noise + 1) * 0.5);
                        // Dốc đủ mạnh thì trộn dần sang màu đất — sườn đồi/bờ hồ lộ đất thay vì cỏ phủ kín.
                        if (slopeFactor > 0.15) {
                            const dirtT = THREE.MathUtils.clamp((slopeFactor - 0.15) / 0.45, 0, 1);
                            tmpColor.lerp(dirtColor, dirtT);
                        }
                    }

                    colors[i * 3] = tmpColor.r;
                    colors[i * 3 + 1] = tmpColor.g;
                    colors[i * 3 + 2] = tmpColor.b;
                }
                groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

                groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide });
                const ground = new THREE.Mesh(groundGeo, groundMat);
                ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; 
                scene.add(ground);

                createGrassBlades();

                const playerGroup = new THREE.Group();
                const bodyGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.8, 16);
                const bodyMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 1.0, metalness: 0.0 });
                const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
                bodyMesh.position.y = 0; bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
                playerGroup.add(bodyMesh); 

                const visorGeo = new THREE.BoxGeometry(0.5, 0.2, 0.3);
                const visorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 1.0, metalness: 0.0 });
                const visorMesh = new THREE.Mesh(visorGeo, visorMat);
                visorMesh.position.set(0, 0.5, 0.35); visorMesh.castShadow = true;
                playerGroup.add(visorMesh); 

                const swordGeo = new THREE.BoxGeometry(0.16, 0.04, 1.45, 1, 1, 6);
                const posAttrSword = swordGeo.attributes.position;
                for (let i = 0; i < posAttrSword.count; i++) {
                    const z = posAttrSword.getZ(i);
                    let wScale = 1.0;
                    if (z > 0.4) wScale = 1.0 - (z - 0.4) * 0.75;
                    const curveX = z * z * 0.08;
                    posAttrSword.setX(i, posAttrSword.getX(i) * wScale - curveX);
                }
                swordGeo.computeVertexNormals();

                const swordMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 1.0, metalness: 0.0 });
                const sword = new THREE.Mesh(swordGeo, swordMat);
                
                sword.position.set(0.6, -0.15, 0.15); 
                sword.rotation.set(-Math.PI / 3, 0, Math.PI / 10); 
                playerGroup.add(sword); 
                player.sword = sword;

                const slashGeo = new THREE.RingGeometry(0.8, 1.6, 32, 1, 0, Math.PI);
                const slashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
                const slash = new THREE.Mesh(slashGeo, slashMat);
                slash.rotation.x = Math.PI / 2; slash.position.set(0, 0.2, 0.9); slash.visible = false;
                playerGroup.add(slash); 
                player.slashWave = slash;

                const gliderGroup = new THREE.Group();
                const wingMat = new THREE.MeshBasicMaterial({
                    color: 0x22d3ee,
                    transparent: true,
                    opacity: 0.75,
                    side: THREE.DoubleSide
                });

                const leftWingGeo = new THREE.BufferGeometry();
                const leftVertices = new Float32Array([
                    0, 0, 0,          
                    -2.4, 0.35, -0.6,  
                    -1.8, -0.6, -0.4,  
                    0, -0.5, -0.1      
                ]);
                const indices = [
                    0, 1, 2,
                    0, 2, 3
                ];
                leftWingGeo.setAttribute('position', new THREE.BufferAttribute(leftVertices, 3));
                leftWingGeo.setIndex(indices);
                leftWingGeo.computeVertexNormals();
                const leftWingMesh = new THREE.Mesh(leftWingGeo, wingMat);
                leftWingMesh.position.set(-0.35, 0.4, -0.22);
                gliderGroup.add(leftWingMesh);

                const rightWingGeo = new THREE.BufferGeometry();
                const rightVertices = new Float32Array([
                    0, 0, 0,
                    2.4, 0.35, -0.6,
                    1.8, -0.6, -0.4,
                    0, -0.5, -0.1
                ]);
                rightWingGeo.setAttribute('position', new THREE.BufferAttribute(rightVertices, 3));
                rightWingGeo.setIndex(indices);
                rightWingGeo.computeVertexNormals();
                const rightWingMesh = new THREE.Mesh(rightWingGeo, wingMat);
                rightWingMesh.position.set(0.35, 0.4, -0.22);
                gliderGroup.add(rightWingMesh);

                const ribMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.9 });
                const ribGeo = new THREE.BoxGeometry(0.04, 0.04, 1.1);
                
                const leftRib = new THREE.Mesh(ribGeo, ribMat);
                leftRib.position.set(-0.9, 0.15, -0.4);
                leftRib.rotation.set(0.2, 0.38, -0.28);
                gliderGroup.add(leftRib);
                
                const rightRib = new THREE.Mesh(ribGeo, ribMat);
                rightRib.position.set(0.9, 0.15, -0.4);
                rightRib.rotation.set(0.2, -0.38, 0.28);
                gliderGroup.add(rightRib);

                gliderGroup.position.set(0, 0, 0);
                gliderGroup.visible = false;
                playerGroup.add(gliderGroup);
                player.gliderGroup = gliderGroup;

                scene.add(playerGroup);
                player.mesh = playerGroup;
                player.mesh.position.copy(player.position);

                cameraState.currentFocus.set(player.position.x, player.position.y + cameraState.targetYOffset, player.position.z);
                cameraState.targetFocus.copy(cameraState.currentFocus);

                createObstacles();
                createEnvironmentProps();
                createWaterAreas();
                createCamps();
                createChests();
                createTestEnemies();
                createInteractables();

                playtestMetrics.lastPosition.copy(player.position);
            }
            window.initThree = initThree;

            // --- CẤU HÌNH VÁCH ĐÁ (CLIMB WALLS, Pre-Alpha v0.3 — Frontier, Iteration 2) ---
            // Mỗi cụm núi giờ là NHIỀU khối hộp chữ nhật xếp lệch/chồng tầng (không còn 1 box đơn to
            // trơ trọi) — vẫn là AABB thẳng trục (bắt buộc, detectClimbableWall chỉ nhận diện đúng mặt
            // phẳng vuông góc X/Z) nhưng bố trí lệch tâm + kích thước giảm dần theo tầng để nhìn như
            // núi đá tự nhiên xếp chồng, đồng thời người chơi thực sự leo được nhiều mặt khác nhau tùy
            // vị trí tiếp cận (không phải lớp vỏ trang trí bọc ngoài 1 lõi ẩn) — detectClimbableWall
            // KHÔNG cần sửa gì vì nó vốn đã duyệt + chọn mặt gần nhất trong TOÀN BỘ obstacles.
            // Data-driven: mỗi entry [x, y, z, w, h, d] — muốn thêm/bớt khối chỉ cần sửa mảng.
            //   CLUSTER_A (Camp A, Đông): 6 khối, 3 tầng (đế/giữa/đỉnh), đỉnh cao ~7.4m.
            //   CLUSTER_B (Camp B, Tây Bắc): 7 khối, 3 tầng, dàn dài theo trục X (vai trò chắn lối đi
            //   như bản gốc), đỉnh cao ~7.5m.
            const CLIMB_WALL_CONFIGS = [
                // --- Cụm núi đá Camp A ---
                [29.0, 2.0, -19.5, 4.5, 4.0, 5.0],   // đế lớn phía sau
                [31.5, 1.6, -16.5, 3.6, 3.2, 4.2],   // đế phải phía trước
                [27.2, 1.3, -15.8, 2.8, 2.6, 3.2],   // đế trái phía trước (nhỏ, thấp hơn — bất đối xứng)
                [29.8, 4.2, -19.0, 3.2, 3.0, 3.6],   // tầng giữa sau
                [30.5, 3.4, -16.8, 2.6, 2.4, 2.8],   // tầng giữa trước-phải
                [29.5, 6.3, -18.5, 2.0, 2.2, 2.2],   // đỉnh
                // --- Cụm núi đá Camp B (chắn lối đi, dàn dài theo X như bản gốc) ---
                [-31.0, 2.2, 21.5, 3.2, 4.4, 3.6],   // đế trái
                [-28.5, 1.8, 22.8, 3.0, 3.6, 3.0],   // đế giữa (lệch Z ra trước)
                [-26.2, 2.0, 21.2, 2.8, 4.0, 3.2],   // đế phải
                [-24.0, 1.5, 22.5, 2.4, 3.0, 2.6],   // đế cực phải (nhỏ, thấp hơn — thoải dần ra rìa)
                [-30.5, 4.6, 21.8, 2.6, 2.8, 2.8],   // tầng giữa trái
                [-27.0, 4.4, 21.5, 2.4, 2.6, 2.6],   // tầng giữa phải
                [-30.0, 6.6, 21.6, 1.8, 1.8, 2.0]    // đỉnh (lệch về phía trái, không đối xứng)
            ];

            function createObstacles() {
                const rockMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 1.0, metalness: 0.0 });
                // Vật liệu phụ hơi lệch tông (sẫm/sáng hơn nhẹ) — xen kẽ theo index để mỗi khối trong
                // cụm không dùng chung 1 material tuyệt đối giống hệt nhau, tránh cảm giác "copy-paste"
                // của các mặt phẳng liền kề, dù hình khối vẫn là box.
                const rockMatDark = new THREE.MeshStandardMaterial({ color: 0x6b665c, roughness: 1.0, metalness: 0.0 });
                const rockMatLight = new THREE.MeshStandardMaterial({ color: 0x8f8a7d, roughness: 0.95, metalness: 0.0 });
                const rockMats = [rockMat, rockMatDark, rockMatLight];

                CLIMB_WALL_CONFIGS.forEach(([x, y, z, w, h, d], i) => {
                    const geo = new THREE.BoxGeometry(w, h, d);
                    const mesh = new THREE.Mesh(geo, rockMats[i % rockMats.length]);
                    mesh.position.set(x, y, z);
                    // LƯU Ý: KHÔNG xoay mesh.rotation.y ở đây — AABB.updateFromObject() bên dưới bỏ
                    // qua rotation hoàn toàn (chỉ dùng position + w/h/d thẳng trục world-space), nên
                    // xoay mesh sẽ khiến hình ảnh lệch khỏi vùng va chạm thực tế (visual xoay nhưng
                    // player vẫn va vào hộp vô hình thẳng trục cũ) — đúng loại lỗi "va chạm với
                    // khoảng không" cần tránh (spec mục 4). Phá vỡ cảm giác khối hộp đơn thuần bằng
                    // cách xếp lệch tâm + kích thước giảm dần theo tầng (đã đủ hiệu quả hình ảnh) thay
                    // vì xoay.
                    mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
                    const aabb = new AABB(); aabb.updateFromObject(mesh, w, h, d);
                    obstacles.push({ mesh, aabb }); obstacleMeshes.push(mesh);
                });
            }

            // ============================================================
            // ENVIRONMENT PROPS (Pre-Alpha v0.3 — Frontier)
            // ============================================================
            // Mục tiêu: "không để bản đồ quá trống" (mục 3 spec) — cây, đá, bụi cỏ, hoa, gốc cây,
            // hàng rào, biển chỉ đường. Toàn bộ data-driven qua PROP_CLUSTER_CONFIGS: mỗi cluster là 1
            // vùng tròn (x, z, radius) + loại prop + số lượng — muốn thêm/bớt/di chuyển mảng cây chỉ
            // cần sửa data, KHÔNG cần đụng vào hàm dựng mesh. Props THUẦN TRANG TRÍ (không AABB/collision)
            // trừ hàng rào (fence) — hàng rào có thể chặn đường nhẹ nên vẫn dùng AABB như obstacle thường
            // nhưng KHÔNG push vào mảng obstacles chính (dùng mảng riêng propObstacles) để không ảnh
            // hưởng logic climbableWall vốn chỉ nên áp dụng cho vách đá thật sự.
            const propObstacles = [];

            // Mỗi prop type có 1 hàm factory riêng, trả về 1 THREE.Group đã dựng xong (chưa add vào
            // scene, chưa set position) — cluster placement gọi factory rồi mới định vị + add scene.
            const PROP_FACTORIES = {
                tree(rng) {
                    const group = new THREE.Group();
                    const trunkH = 1.8 + rng() * 1.2;
                    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.24, trunkH, 7);
                    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1.0 });
                    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                    trunk.position.y = trunkH / 2;
                    trunk.castShadow = true; trunk.receiveShadow = true;
                    group.add(trunk);

                    const leavesColors = [0x4d7c4a, 0x5b8c52, 0x3f6b3d];
                    const leavesMat = new THREE.MeshStandardMaterial({ color: leavesColors[Math.floor(rng() * leavesColors.length)], roughness: 0.95 });
                    const leafCount = 2 + Math.floor(rng() * 2);
                    for (let i = 0; i < leafCount; i++) {
                        const r = 1.0 + rng() * 0.5 - i * 0.15;
                        const leafGeo = new THREE.SphereGeometry(Math.max(0.5, r), 8, 6);
                        const leaf = new THREE.Mesh(leafGeo, leavesMat);
                        leaf.position.set((rng() - 0.5) * 0.6, trunkH + i * 0.7, (rng() - 0.5) * 0.6);
                        leaf.castShadow = true;
                        group.add(leaf);
                    }
                    return group;
                },
                rock(rng) {
                    const scale = 0.4 + rng() * 0.7;
                    const geo = new THREE.DodecahedronGeometry(scale, 0);
                    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 1.0 });
                    const rock = new THREE.Mesh(geo, mat);
                    rock.position.y = scale * 0.4;
                    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
                    rock.castShadow = true; rock.receiveShadow = true;
                    const group = new THREE.Group();
                    group.add(rock);
                    return group;
                },
                bush(rng) {
                    const group = new THREE.Group();
                    const mat = new THREE.MeshStandardMaterial({ color: 0x5a8a4e, roughness: 0.95 });
                    const clumps = 2 + Math.floor(rng() * 2);
                    for (let i = 0; i < clumps; i++) {
                        const r = 0.32 + rng() * 0.2;
                        const geo = new THREE.SphereGeometry(r, 7, 5);
                        const mesh = new THREE.Mesh(geo, mat);
                        mesh.position.set((rng() - 0.5) * 0.5, r * 0.75, (rng() - 0.5) * 0.5);
                        mesh.castShadow = true; mesh.receiveShadow = true;
                        group.add(mesh);
                    }
                    return group;
                },
                flowerPatch(rng) {
                    const group = new THREE.Group();
                    const petalColors = [0xf472b6, 0xfbbf24, 0xf87171, 0xa78bfa];
                    const count = 4 + Math.floor(rng() * 4);
                    for (let i = 0; i < count; i++) {
                        const color = petalColors[Math.floor(rng() * petalColors.length)];
                        const stemMat = new THREE.MeshStandardMaterial({ color: 0x4d7c4a, roughness: 1.0 });
                        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 4), stemMat);
                        stem.position.set((rng() - 0.5) * 0.8, 0.14, (rng() - 0.5) * 0.8);
                        group.add(stem);

                        const bloomMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
                        const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), bloomMat);
                        bloom.position.set(stem.position.x, 0.3, stem.position.z);
                        group.add(bloom);
                    }
                    return group;
                },
                stump(rng) {
                    const group = new THREE.Group();
                    const h = 0.35 + rng() * 0.15;
                    const geo = new THREE.CylinderGeometry(0.32, 0.36, h, 10);
                    const mat = new THREE.MeshStandardMaterial({ color: 0x7a5738, roughness: 1.0 });
                    const stump = new THREE.Mesh(geo, mat);
                    stump.position.y = h / 2;
                    stump.castShadow = true; stump.receiveShadow = true;
                    group.add(stump);

                    const ringMat = new THREE.MeshStandardMaterial({ color: 0x9c7a52, roughness: 0.9 });
                    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.02, 10), ringMat);
                    ring.position.y = h + 0.01;
                    group.add(ring);
                    return group;
                },
                // --- FOREST TREE (v0.6 Wilderness) — cây rừng: CAO HƠN, tán LỚN HƠN, dày hơn hẳn cây
                // 'tree' thường (mục 3 spec: "Cây cao hơn hiện tại, tán cây lớn"). Màu lá đậm/tối hơn
                // (ít phản chiếu ánh sáng hơn — roughness cao + màu xanh rêu sẫm) để góp phần tạo cảm
                // giác "không gian bên trong rừng tối hơn". castShadow TRÊN CẢ THÂN LẪN TÁN — với mật
                // độ trồng dày (xem FOREST_CONFIGS bên dưới), các cây đổ bóng chồng lên nhau và lên mặt
                // đất/cây khác thông qua sunLight.castShadow đã có sẵn, tạo hiệu ứng "ánh sáng bị che
                // bởi tán lá" một cách TỰ NHIÊN qua shadow map thật — không cần shader/vùng tối riêng
                // (ngoài khả năng của Pre-Alpha, và không cần thiết để đạt đúng tinh thần yêu cầu).
                forestTree(rng) {
                    const group = new THREE.Group();
                    const trunkH = 3.4 + rng() * 1.8; // ~2x cây thường (1.8-3.0 -> 3.4-5.2)
                    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.38, trunkH, 8);
                    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3f26, roughness: 1.0 });
                    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                    trunk.position.y = trunkH / 2;
                    trunk.castShadow = true; trunk.receiveShadow = true;
                    group.add(trunk);

                    // Tán nhiều lớp lớn, đậm màu, xếp chồng để dày đặc hơn nhiều so với cây thường.
                    const leavesColors = [0x2f4f2e, 0x3a5c37, 0x264a26];
                    const leavesMat = new THREE.MeshStandardMaterial({ color: leavesColors[Math.floor(rng() * leavesColors.length)], roughness: 1.0 });
                    const leafCount = 4 + Math.floor(rng() * 3);
                    for (let i = 0; i < leafCount; i++) {
                        const r = 1.9 + rng() * 0.9 - i * 0.18;
                        const leafGeo = new THREE.SphereGeometry(Math.max(1.0, r), 8, 6);
                        const leaf = new THREE.Mesh(leafGeo, leavesMat);
                        leaf.position.set((rng() - 0.5) * 1.1, trunkH + i * 1.05, (rng() - 0.5) * 1.1);
                        leaf.castShadow = true; leaf.receiveShadow = true;
                        group.add(leaf);
                    }
                    return group;
                },
                // --- APPLE TREE (v0.6 Wilderness) — cây táo: kích thước gần với cây thường (không cao
                // như forestTree, đây là cây ăn quả thấp hơn cây rừng tự nhiên), tán màu xanh sáng hơn
                // để phân biệt trực quan với forestTree xung quanh. `anchors` (mảng Vector3 local-space,
                // tương đối so với gốc cây) đánh dấu vị trí các quả táo tiềm năng — createAppleTree()
                // dùng mảng này để đặt từng WorldItem táo đúng vị trí "lệch trên tán lá" thay vì rải
                // ngẫu nhiên không liên quan tới hình dạng cây.
                appleTree(rng) {
                    const group = new THREE.Group();
                    const trunkH = 1.6 + rng() * 0.6;
                    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, trunkH, 7);
                    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1.0 });
                    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                    trunk.position.y = trunkH / 2;
                    trunk.castShadow = true; trunk.receiveShadow = true;
                    group.add(trunk);

                    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x5f9c4f, roughness: 0.9 });
                    const canopyY = trunkH + 0.6;
                    const canopyRadius = 1.1 + rng() * 0.3;
                    const canopy = new THREE.Mesh(new THREE.SphereGeometry(canopyRadius, 10, 8), leavesMat);
                    canopy.position.y = canopyY;
                    canopy.castShadow = true; canopy.receiveShadow = true;
                    group.add(canopy);

                    // Neo vị trí quả táo: rải quanh mặt ngoài tán lá (bán kính ~canopyRadius) theo góc
                    // đều nhau + lệch ngẫu nhiên nhẹ — để quả "mọc" đúng trên bề mặt tán, không lơ lửng
                    // xa cây hoặc chìm vào trong.
                    const anchorCount = 3 + Math.floor(rng() * 3);
                    const anchors = [];
                    for (let i = 0; i < anchorCount; i++) {
                        const angle = (i / anchorCount) * Math.PI * 2 + rng() * 0.6;
                        const heightT = 0.3 + rng() * 0.5; // 0..1 theo chiều cao tán (tránh đỉnh/đáy quá sát)
                        const ay = canopyY - canopyRadius * 0.3 + heightT * canopyRadius * 0.9;
                        const ar = canopyRadius * 0.85;
                        anchors.push(new THREE.Vector3(Math.cos(angle) * ar, ay, Math.sin(angle) * ar));
                    }
                    return { group, anchors };
                }
            };

            // Gerador determinístico simples (mulberry32) — cluster dùng seed cố định theo index để
            // props luôn sinh ra giống nhau mỗi lần load game (không lệch giữa các lần chơi/debug).
            function createSeededRng(seed) {
                let a = seed >>> 0;
                return function () {
                    a |= 0; a = (a + 0x6D2B79F5) | 0;
                    let t = Math.imul(a ^ (a >>> 15), 1 | a);
                    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                };
            }

            // --- CẤU HÌNH CỤM PROP (PROP_CLUSTER_CONFIGS, v0.3 Frontier) ---
            // Data-driven: mỗi cluster rải `count` prop cùng loại `type` ngẫu nhiên trong vùng tròn tâm
            // (x, z) bán kính `radius`. Đặt tránh xa structureZone/trail/spawn area (đã né thủ công khi
            // chọn tọa độ) — props chỉ trang trí, KHÔNG kiểm tra va chạm với obstacle khác (Pre-Alpha,
            // chấp nhận chồng lấn nhẹ). Muốn thêm khu vực cây mới chỉ cần thêm 1 entry vào mảng này.
            const PROP_CLUSTER_CONFIGS = [
                // Rừng thưa quanh Camp B (Tây Bắc) — che chắn tự nhiên cho khu quái đông nhất.
                { type: 'tree', x: -22, z: 12, radius: 9, count: 14, seed: 1 },
                { type: 'bush', x: -22, z: 12, radius: 10, count: 10, seed: 2 },
                // Cụm đá quanh Camp A (Đông) và vách leo núi gần đó.
                { type: 'rock', x: 22, z: -8, radius: 8, count: 10, seed: 3 },
                { type: 'tree', x: 24, z: -4, radius: 7, count: 6, seed: 4 },
                // Rừng quanh Camp C (Bắc) — khu vực có slime lớn, cây dày hơn tạo cảm giác nguy hiểm.
                { type: 'tree', x: 8, z: 26, radius: 10, count: 16, seed: 5 },
                { type: 'rock', x: 8, z: 26, radius: 11, count: 6, seed: 6 },
                // Đồng cỏ hoa dọc đường mòn dẫn tới hồ — tạo điểm nhấn thị giác trên đường khám phá.
                { type: 'flowerPatch', x: -14, z: 25, radius: 10, count: 12, seed: 7 },
                { type: 'flowerPatch', x: 4, z: 8, radius: 12, count: 10, seed: 8 },
                // Bụi cỏ rải rác quanh spawn (nhưng ngoài bán kính đất trống — xem SPAWN_CLEARING_RADIUS).
                { type: 'bush', x: 0, z: 0, radius: 16, count: 14, seed: 9 },
                // Gốc cây rải rác — dấu tích khai phá, đặt gần trail và rìa rừng.
                { type: 'stump', x: -10, z: 22, radius: 12, count: 5, seed: 10 },
                { type: 'stump', x: 14, z: 4, radius: 14, count: 4, seed: 11 },
                // Cây/đá rải rác xa hơn về phía Tây và Nam để tránh cảm giác trống trải ở rìa map.
                { type: 'tree', x: -30, z: -10, radius: 14, count: 10, seed: 12 },
                { type: 'rock', x: 18, z: 18, radius: 10, count: 6, seed: 13 },
                // Đá trang trí ÁP SÁT CHÂN 2 cụm núi leo trèo (CLIMB_WALL_CONFIGS, v0.3 Frontier
                // Iteration 2) — che bớt các góc vuông của box collision mà KHÔNG ảnh hưởng vật lý
                // (props type 'rock' không có AABB/collision, thuần trang trí). Bán kính nhỏ + tâm đặt
                // ngay rìa cụm núi để đá tụ sát chân, không lan ra xa như cluster đá quanh Camp A cũ.
                { type: 'rock', x: 29, z: -18, radius: 5, count: 8, seed: 14 },
                { type: 'rock', x: -28, z: 22, radius: 6, count: 9, seed: 15 }
            ];

            // Bán kính (m) quanh spawn PHẢI giữ trống hoàn toàn — không prop nào được đặt trong vùng
            // này, đảm bảo "không gian đủ rộng để người chơi làm quen điều khiển" (mục 4 spec).
            const SPAWN_CLEARING_RADIUS = 7.0;

            // --- CẤU HÌNH KHU RỪNG (FOREST_CONFIGS, v0.6 Wilderness) ---
            // Data-driven: mỗi khu rừng là 1 vùng tròn tâm (x, z) bán kính `radius`, mật độ cây rừng
            // (forestTree) DÀY hơn hẳn các cluster 'tree' thường hiện có (mục 3 spec: "nhiều cây tập
            // trung tạo thành một khu rừng"). Đặt tại khu Tây Nam map — vùng DUY NHẤT chưa được dùng
            // bởi Camp/hồ/structureZones hiện có (Camp A ở Đông (20,-6), Camp B ở Tây Bắc (-22,12),
            // Camp C ở Bắc (8,26), hồ ở Tây Bắc xa (-36,40)) — đảm bảo khu rừng mới không chồng lấn bất
            // kỳ khu vực nào đã tồn tại, đồng thời đủ xa spawn (~35m) để khuyến khích khám phá.
            //   treeDensity: số cây rừng trên toàn vùng — CAO hơn nhiều so với cluster 'tree' thường
            //                (VD 14-16 cây/cluster hiện có) để tạo cảm giác rừng thật, không phải vài
            //                cây rải rác.
            //   collectibleCounts: số lượng TỪNG loại collectible rải bên trong rừng — Mushroom (dưới
            //                      tán, nơi tối/ẩm) và Berry (ven rừng) theo đúng mục 2/3 spec. Sweet
            //                      Flower KHÔNG xuất hiện trong rừng (spec: "đồng cỏ, nhiều ánh sáng"
            //                      — ngược hẳn với đặc điểm rừng tối) nên không có ở đây.
            //   appleTreeCount: số cây táo mọc rải rác trong rừng (spec mục 3: "một số cây táo").
            const FOREST_CONFIGS = [
                {
                    id: 'forest_west',
                    x: -22, z: -28,
                    radius: 17,
                    treeDensity: 42,
                    collectibleCounts: { mushroom: 10, berry: 6 },
                    appleTreeCount: 4,
                    seed: 200
                }
            ];
            window.FOREST_CONFIGS = FOREST_CONFIGS;

            // Tạo 1 cây táo hoàn chỉnh tại (x, z): dựng mesh cây (PROP_FACTORIES.appleTree trả về
            // {group, anchors} — khác các factory khác, nên xử lý riêng ở đây thay vì qua vòng lặp
            // cluster chung của createEnvironmentProps()), rồi gắn 1 WorldItem 'apple' tại MỖI anchor
            // (vị trí neo trên tán lá, world-space = vị trí cây + anchor local đã xoay theo rotation
            // cây). Mỗi quả táo là 1 WorldItem ĐỘC LẬP (tự respawn riêng sau khi hái, xem WorldItem)
            // — đúng lựa chọn thiết kế đã chọn cho v0.6 (không phải "hái cả cây 1 lần").
            function createSingleAppleTree(x, z, rng) {
                const built = PROP_FACTORIES.appleTree(rng);
                const { group, anchors } = built;
                const baseY = getTerrainHeight(x, z);
                const rotationY = rng() * Math.PI * 2;

                group.position.set(x, baseY, z);
                group.rotation.y = rotationY;
                scene.add(group);

                const cosR = Math.cos(rotationY), sinR = Math.sin(rotationY);
                anchors.forEach(anchor => {
                    // Xoay anchor local theo rotationY của cây (quanh trục Y) rồi cộng vào vị trí gốc —
                    // đảm bảo quả táo bám đúng vị trí trên tán lá dù cây bị xoay ngẫu nhiên.
                    const worldX = x + (anchor.x * cosR - anchor.z * sinR);
                    const worldZ = z + (anchor.x * sinR + anchor.z * cosR);
                    const worldY = baseY + anchor.y;

                    const pos = new THREE.Vector3(worldX, worldY, worldZ);
                    const meshBuilder = () => {
                        const geo = new THREE.SphereGeometry(0.13, 8, 6);
                        const mat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5, metalness: 0.05, emissive: 0x7f1d1d, emissiveIntensity: 0.15 });
                        return new THREE.Mesh(geo, mat);
                    };

                    const item = new WorldItem(pos, 'apple', 1, meshBuilder);
                    const mesh = meshBuilder();
                    mesh.position.copy(pos);
                    mesh.castShadow = true;
                    scene.add(mesh);
                    item.mesh = mesh;

                    interactables.push(item);
                });
            }

            // Tạo toàn bộ khu rừng theo FOREST_CONFIGS: mật độ cây rừng dày, collectible rải bên trong
            // theo đúng "hệ sinh thái" (Mushroom dưới tán cây bất kỳ trong rừng, Berry ven rìa rừng gần
            // biên ngoài, Apple Tree rải rác). RNG DÙNG CHUNG 1 SEED THEO TỪNG FOREST (không tách riêng
            // seed cho từng loại như PROP_CLUSTER_CONFIGS) — chấp nhận được ở Pre-Alpha vì thứ tự gọi
            // luôn cố định (cây trước, rồi mushroom, rồi berry, rồi apple) nên kết quả vẫn deterministic
            // giữa các lần chạy.
            function createForests() {
                FOREST_CONFIGS.forEach(forest => {
                    const rng = createSeededRng(forest.seed);

                    // 1. Cây rừng dày đặc, phân bố đều theo diện tích (sqrt) trên toàn bán kính.
                    for (let i = 0; i < forest.treeDensity; i++) {
                        const angle = rng() * Math.PI * 2;
                        const dist = Math.sqrt(rng()) * forest.radius;
                        const x = forest.x + Math.cos(angle) * dist;
                        const z = forest.z + Math.sin(angle) * dist;
                        const propGroup = PROP_FACTORIES.forestTree(rng);
                        propGroup.position.set(x, getTerrainHeight(x, z), z);
                        propGroup.rotation.y = rng() * Math.PI * 2;
                        scene.add(propGroup);
                    }

                    // 2. Mushroom: "mọc dưới tán cây... nơi râm mát" — rải khắp TOÀN BỘ vùng rừng
                    // (trong bán kính đầy đủ), vì cây rừng đã phủ dày toàn vùng nên bất kỳ điểm nào bên
                    // trong forest.radius đều hợp lý là "dưới tán cây".
                    const mushroomCount = (forest.collectibleCounts && forest.collectibleCounts.mushroom) || 0;
                    for (let i = 0; i < mushroomCount; i++) {
                        const angle = rng() * Math.PI * 2;
                        const dist = Math.sqrt(rng()) * forest.radius * 0.85; // Hơi lùi vào trong, tránh rìa rừng
                        const x = forest.x + Math.cos(angle) * dist;
                        const z = forest.z + Math.sin(angle) * dist;
                        createWorldItem(x, z, 'mushroom', 1, 0.12); // yOffset thấp — nấm mọc sát đất
                    }

                    // 3. Berry: "ven đường, ven rừng, gần bãi cỏ" — rải quanh RÌA NGOÀI của rừng (vành
                    // khuyên gần forest.radius), không phải sâu bên trong như Mushroom.
                    const berryCount = (forest.collectibleCounts && forest.collectibleCounts.berry) || 0;
                    for (let i = 0; i < berryCount; i++) {
                        const angle = rng() * Math.PI * 2;
                        const dist = forest.radius * (0.88 + rng() * 0.22); // Vành đai quanh rìa (88%-110% bán kính)
                        const x = forest.x + Math.cos(angle) * dist;
                        const z = forest.z + Math.sin(angle) * dist;
                        createWorldItem(x, z, 'berry', 1, 0.35);
                    }

                    // 4. Apple Tree: rải rác trong rừng, cách nhau tương đối để không chồng lấn tán lá.
                    const appleTreeCount = forest.appleTreeCount || 0;
                    for (let i = 0; i < appleTreeCount; i++) {
                        const angle = rng() * Math.PI * 2;
                        const dist = Math.sqrt(rng()) * forest.radius * 0.7;
                        const x = forest.x + Math.cos(angle) * dist;
                        const z = forest.z + Math.sin(angle) * dist;
                        createSingleAppleTree(x, z, rng);
                    }
                });
            }
            window.createForests = createForests;

            function createEnvironmentProps() {
                PROP_CLUSTER_CONFIGS.forEach(cluster => {
                    const rng = createSeededRng(cluster.seed);
                    const factory = PROP_FACTORIES[cluster.type];
                    if (!factory) return;

                    for (let i = 0; i < cluster.count; i++) {
                        const angle = rng() * Math.PI * 2;
                        const dist = Math.sqrt(rng()) * cluster.radius; // sqrt để phân bố đều theo diện tích, không dồn vào tâm
                        const x = cluster.x + Math.cos(angle) * dist;
                        const z = cluster.z + Math.sin(angle) * dist;

                        // Né vùng đất trống quanh spawn tuyệt đối, kể cả khi cluster crop vào gần đó.
                        if (Math.hypot(x, z) < SPAWN_CLEARING_RADIUS) continue;

                        const propGroup = factory(rng);
                        propGroup.position.set(x, getTerrainHeight(x, z), z);
                        propGroup.rotation.y = rng() * Math.PI * 2;
                        scene.add(propGroup);
                    }
                });

                createSignposts();
                createSpawnFence();
                createForests();
            }

            // --- BIỂN CHỈ ĐƯỜNG (SIGNPOSTS, v0.3 Frontier) ---
            // Data-driven: mỗi entry là 1 vị trí + hướng gợi ý (chỉ mang tính trang trí/định hướng thị
            // giác — không có logic quest/tooltip gắn kèm, đúng tinh thần "Pre-Alpha, chưa cần UI cuối
            // cùng"). Đặt tại các điểm rẽ nhánh chính dọc trail để khuyến khích khám phá.
            const SIGNPOST_CONFIGS = [
                { x: -6, z: 16, rotationY: Math.PI * 0.15 },   // Gần lối rẽ vào trail chính hướng Tây Bắc
                { x: 14, z: -2, rotationY: -Math.PI * 0.3 },    // Hướng về Camp A / vách đá phía Đông
                { x: -4, z: 10, rotationY: Math.PI * 0.6 }      // Hướng về Camp C / hồ nước phía Bắc
            ];

            function createSignpost(x, z, rotationY) {
                const group = new THREE.Group();
                const postMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1.0 });
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.8, 8), postMat);
                post.position.y = 0.9;
                post.castShadow = true;
                group.add(post);

                const plankMat = new THREE.MeshStandardMaterial({ color: 0x9c7a52, roughness: 0.9 });
                [0.35, 0.05].forEach((yOff, i) => {
                    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.06), plankMat);
                    plank.position.set(0, 1.35 - yOff, 0);
                    plank.rotation.y = (i === 0 ? 0.15 : -0.2);
                    plank.castShadow = true;
                    group.add(plank);
                });

                group.position.set(x, getTerrainHeight(x, z), z);
                group.rotation.y = rotationY;
                scene.add(group);
            }

            function createSignposts() {
                SIGNPOST_CONFIGS.forEach(s => createSignpost(s.x, s.z, s.rotationY));
            }

            // --- HÀNG RÀO QUANH SPAWN (SPAWN FENCE, v0.3 Frontier) ---
            // Vòng hàng rào gỗ thấp, hở (không khép kín — chỉ mang tính gợi ý ranh giới khu spawn, đúng
            // tinh thần "một khoảng đất trống" chứ không phải khu vực bị rào kín). Thuần trang trí,
            // KHÔNG có AABB/collision — người chơi có thể đi xuyên qua bình thường.
            function createSpawnFence() {
                const postMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1.0 });
                const railMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.95 });
                const fenceRadius = SPAWN_CLEARING_RADIUS + 1.5;
                const gapAngleStart = Math.PI * 0.15; // Khoảng hở hướng Đông Bắc, phía Quest Board
                const gapAngleEnd = Math.PI * 0.55;
                const segments = 18;

                for (let i = 0; i < segments; i++) {
                    const angle = (i / segments) * Math.PI * 2;
                    if (angle > gapAngleStart && angle < gapAngleEnd) continue; // Chừa lối ra vào

                    const x = Math.cos(angle) * fenceRadius;
                    const z = Math.sin(angle) * fenceRadius;
                    const groundY = getTerrainHeight(x, z);

                    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 6), postMat);
                    post.position.set(x, groundY + 0.35, z);
                    post.castShadow = true;
                    scene.add(post);

                    const nextAngle = ((i + 1) / segments) * Math.PI * 2;
                    if (nextAngle > gapAngleStart && nextAngle < gapAngleEnd) continue; // Không nối rail vào khoảng hở

                    const nx = Math.cos(nextAngle) * fenceRadius, nz = Math.sin(nextAngle) * fenceRadius;
                    const midX = (x + nx) / 2, midZ = (z + nz) / 2;
                    const railLength = Math.hypot(nx - x, nz - z) * 1.05;
                    const rail = new THREE.Mesh(new THREE.BoxGeometry(railLength, 0.08, 0.06), railMat);
                    rail.position.set(midX, groundY + 0.55, midZ);
                    rail.rotation.y = Math.atan2(nz - z, nx - x);
                    rail.castShadow = true;
                    scene.add(rail);
                }
            }

            // Tạo 1 Chest MỚI cho đúng 1 camp — dùng chung cho cả lúc khởi tạo map (createChests(), gọi
            // cho mọi camp) LẪN lúc 1 camp vừa hoàn tất chu trình respawn (updateCampRespawns(), gọi lại
            // đúng camp đó để tái tạo rương ở trạng thái Locked). Vị trí Chest lệch nhẹ khỏi đúng tâm
            // camp (offset cố định theo hướng Đông Nam) để không chồng lấn hình ảnh với slime tụ tập
            // ngay tại tâm — vẫn đủ gần để rõ ràng "thuộc về" camp đó.
            function createChestForCamp(camp) {
                const chestX = camp.x + 1.8;
                const chestZ = camp.z + 1.2;
                const chestPos = new THREE.Vector3(chestX, getTerrainHeight(chestX, chestZ), chestZ);

                const chest = new Chest(chestPos, camp.id, camp.chestType || 'common');
                chest.meshGroup.position.copy(chestPos);
                scene.add(chest.meshGroup);

                interactables.push(chest);
                return chest;
            }
            window.createChestForCamp = createChestForCamp;

            // Tạo Chest cho từng Camp theo CAMP_CONFIGS — gọi 1 lần lúc khởi tạo map, SAU createCamps().
            function createChests() {
                CAMP_CONFIGS.forEach(camp => createChestForCamp(camp));
            }
            window.createChests = createChests;

            // --- THIẾT LẬP CÁC VẬT THỂ TƯƠNG TÁC (QUEST BOARD, NPC...) ---
            function createInteractables() {
                // Bảng nhiệm vụ đầu tiên: cách điểm xuất phát (0, 0.9, 0) khoảng ~5m
                // về hướng Đông Bắc (Đông = +X, Bắc = -Z theo quy ước hiện có của map).
                const boardX = 3.5, boardZ = -3.5;
                const boardPos = new THREE.Vector3(boardX, getTerrainHeight(boardX, boardZ), boardZ);

                // v0.6: QuestBoard tự quản lý nhiều slot quest (combat + gathering) — không cần truyền
                // questTemplate nữa, xem class QuestBoard.constructor().
                const questBoard = new QuestBoard(boardPos);

                // Mesh 3D đơn giản cho bảng nhiệm vụ — dùng box đứng, giống phong cách
                // các obstacle hiện có, tạm thời chưa cần model chi tiết.
                const boardGeo = new THREE.BoxGeometry(1.2, 1.6, 0.15);
                const boardMat = new THREE.MeshStandardMaterial({ color: 0x8b5e34, roughness: 0.85, metalness: 0.05 });
                const boardMesh = new THREE.Mesh(boardGeo, boardMat);
                boardMesh.position.set(boardPos.x, boardPos.y + 0.9, boardPos.z);
                boardMesh.castShadow = true; boardMesh.receiveShadow = true;
                scene.add(boardMesh);

                // Chân đỡ đơn giản (2 cột nhỏ) để trông giống 1 bảng thông báo đứng
                const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8);
                const legMat = new THREE.MeshStandardMaterial({ color: 0x5c4326, roughness: 0.9 });
                [-0.45, 0.45].forEach(offsetX => {
                    const leg = new THREE.Mesh(legGeo, legMat);
                    leg.position.set(boardPos.x + offsetX, boardPos.y + 0.45, boardPos.z);
                    leg.castShadow = true;
                    scene.add(leg);
                });

                questBoard.mesh = boardMesh;
                interactables.push(questBoard);

                // --- Katheryne: đứng lệch sang 1 bên bảng nhiệm vụ ~1.6m, quay mặt về phía board ---
                const katheryneX = boardX + 1.6, katheryneZ = boardZ + 0.3;
                const katherynePos = new THREE.Vector3(katheryneX, getTerrainHeight(katheryneX, katheryneZ), katheryneZ);
                const katheryne = new Katheryne(katherynePos);
                katheryne.questBoard = questBoard; // Liên kết để getDialogueState()/onDialogueAction() đọc đúng dữ liệu quest thật

                // Mesh placeholder đơn giản (Pre-Alpha, chưa cần model nhân vật thật): thân dạng
                // "capsule" ghép thủ công (cylinder + 2 sphere nắp trên/dưới) — KHÔNG dùng
                // THREE.CapsuleGeometry vì dự án đang ở Three.js r128, capsule chỉ có từ r142+
                // (đúng lý do đã tránh dùng nó cho Burst trước đây, lần này lỡ quên áp dụng lại).
                const npcGroup = new THREE.Group();
                const bodyRadius = 0.32, bodyCylinderHeight = 1.05;
                const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc4915c, roughness: 0.75 });

                const bodyGeo = new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyCylinderHeight, 8);
                const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
                bodyMesh.position.y = bodyRadius + bodyCylinderHeight / 2;
                bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
                npcGroup.add(bodyMesh);

                // Nắp trên/dưới bo tròn cho thân — dùng nửa sphere (SphereGeometry hỗ trợ giới hạn
                // phiSegments/thetaStart-thetaLength) đặt khớp 2 đầu cylinder để trông liền mạch.
                const capGeo = new THREE.SphereGeometry(bodyRadius, 8, 6);
                const bottomCap = new THREE.Mesh(capGeo, bodyMat);
                bottomCap.position.y = bodyRadius;
                bottomCap.castShadow = true;
                npcGroup.add(bottomCap);
                const topCap = new THREE.Mesh(capGeo, bodyMat);
                topCap.position.y = bodyRadius + bodyCylinderHeight;
                topCap.castShadow = true;
                npcGroup.add(topCap);

                const headGeo = new THREE.SphereGeometry(0.22, 12, 10);
                const headMat = new THREE.MeshStandardMaterial({ color: 0xf3d3ae, roughness: 0.7 });
                const headMesh = new THREE.Mesh(headGeo, headMat);
                headMesh.position.y = bodyRadius + bodyCylinderHeight + 0.22;
                headMesh.castShadow = true;
                npcGroup.add(headMesh);

                npcGroup.position.copy(katherynePos);
                // Quay mặt về phía Quest Board
                npcGroup.rotation.y = Math.atan2(boardX - katheryneX, boardZ - katheryneZ);
                scene.add(npcGroup);

                katheryne.mesh = npcGroup;
                interactables.push(katheryne);

                // --- SWEET FLOWER (v0.6 Wilderness) — "đồng cỏ hoặc khu vực nhiều ánh sáng" (mục 2
                // spec) — rải ngẫu nhiên trên đồng cỏ mở QUANH khu spawn (ngoài SPAWN_CLEARING_RADIUS,
                // trong bán kính đủ gần để người chơi sớm gặp), tránh hẳn khu rừng (nơi tối, không phù
                // hợp Sweet Flower theo đúng mô tả spec).
                createMeadowCollectibles();

                // --- BERRY VEN ĐƯỜNG (v0.6 Wilderness) — bổ sung thêm vài cụm Berry dọc trail chính
                // dẫn ra Camp A/C (không chỉ trong rừng) — đúng mô tả spec mục 2 "ven đường, ven rừng,
                // hoặc gần bãi cỏ". Berry trong rừng (ven rìa) đã được tạo bởi createForests().
                createTrailsideBerries();
            }
            window.createInteractables = createInteractables;

            // --- CẤU HÌNH SWEET FLOWER TRÊN ĐỒNG CỎ (v0.6 Wilderness) ---
            // Data-driven: 1 vùng tròn quanh khu vực đồng cỏ mở gần spawn (không phải trong rừng/gần
            // camp) — bán kính đủ rộng để rải tự nhiên, né SPAWN_CLEARING_RADIUS.
            const MEADOW_COLLECTIBLE_CONFIG = { x: 0, z: 0, radius: 22, count: 14, seed: 300 };

            function createMeadowCollectibles() {
                const rng = createSeededRng(MEADOW_COLLECTIBLE_CONFIG.seed);
                const cfg = MEADOW_COLLECTIBLE_CONFIG;
                let placed = 0;
                let attempts = 0;
                while (placed < cfg.count && attempts < cfg.count * 10) {
                    attempts++;
                    const angle = rng() * Math.PI * 2;
                    const dist = Math.sqrt(rng()) * cfg.radius;
                    const x = cfg.x + Math.cos(angle) * dist;
                    const z = cfg.z + Math.sin(angle) * dist;
                    if (Math.hypot(x, z) < SPAWN_CLEARING_RADIUS + 1.5) continue; // Né đất trống spawn
                    createWorldItem(x, z, 'sweet_flower', 1, 0.28);
                    placed++;
                }
            }

            // --- CẤU HÌNH BERRY VEN TRAIL (v0.6 Wilderness) ---
            // Data-driven: mỗi entry là 1 điểm gần trail chính (lệch nhẹ sang 1 bên, không nằm chính
            // giữa đường đi) — mô phỏng "bụi berry ven đường mòn".
            const TRAILSIDE_BERRY_CONFIGS = [
                { x: 9, z: -4.5 },   // Ven trail hướng Camp A
                { x: 15.5, z: -6.5 },
                { x: 2.8, z: 11 },   // Ven trail hướng Camp C
                { x: 5.5, z: 18 }
            ];

            function createTrailsideBerries() {
                TRAILSIDE_BERRY_CONFIGS.forEach(p => createWorldItem(p.x, p.z, 'berry', 1, 0.35));
            }

            // --- THIẾT LẬP HỒ NƯỚC MỚI (LAKE INTEGRATION) ---
            // --- THIẾT LẬP HỒ NƯỚC MỚI (LAKE INTEGRATION) ---
            function createWaterAreas() {
                // Vị trí/kích thước hồ lấy trực tiếp từ TERRAIN_CONFIG.lake (định nghĩa ở index.html,
                // dùng chung để khoét lòng hồ trong getTerrainHeight) — tránh 2 nơi có 2 con số lệch
                // nhau nếu sau này chỉnh lại vị trí/bán kính hồ.
                const lakeCfg = window.TERRAIN_CONFIG.lake;

                // Mặt nước đặt ngang đúng cao độ "bờ hồ" (cao độ NỀN tại tâm hồ, TRƯỚC khi khoét) —
                // lấy qua getTerrainBaseHeight thay vì hard-code 0, vì quanh hồ hiện có đồi nên rim
                // không nằm ở Y=0 tuyệt đối.
                const rimY = window.getTerrainBaseHeight(lakeCfg.x, lakeCfg.z);

                // FIX (v0.3 Frontier QA): lòng hồ được khoét TRÒN (applyLakeBasin dùng Math.hypot,
                // bán kính = lakeCfg.radius), nhưng mặt nước trước đây dùng BoxGeometry (vuông) —
                // 4 góc box nhô ra ~2m NGOÀI rim tròn (nước tràn lên cỏ ở 4 góc chéo), đồng thời hở
                // ~0.5m đất giữa rim thật và cạnh box tại 4 điểm giữa cạnh. Đổi sang CylinderGeometry
                // (tròn, khớp tuyệt đối theo cùng công thức bán kính với applyLakeBasin) để không còn
                // hở mép ở bất kỳ góc nào quanh chu vi hồ.
                // Nhỏ hơn 1 chút so với bán kính lòng chảo thực tế để chừa 1 viền đất/bờ hồ mỏng
                // trước khi vào vùng nước (đất ẩm/mud color đã tô ở mesh terrain ngay sát mép này).
                const waterRadius = lakeCfg.radius * 0.94;
                const wHeight = lakeCfg.depth + 1.0; // dư ra để đáy trụ luôn thấp hơn điểm sâu nhất của lòng hồ
                const wX = lakeCfg.x;
                const wZ = lakeCfg.z;
                const wY = rimY - wHeight / 2; // mặt trên của trụ đúng bằng rimY (center + height/2 = rimY)

                // 32 cạnh đủ mượt để không lộ góc cạnh ở khoảng cách chơi bình thường, vẫn rất nhẹ
                // cho hiệu năng mobile (chỉ 1 mesh tĩnh, không đổi mỗi frame).
                const waterGeo = new THREE.CylinderGeometry(waterRadius, waterRadius, wHeight, 32);
                const waterMat = new THREE.MeshBasicMaterial({ 
                    color: 0x3b82f6, 
                    transparent: true, 
                    opacity: 0.55, 
                    side: THREE.DoubleSide,
                    depthWrite: false 
                });
                const waterMesh = new THREE.Mesh(waterGeo, waterMat);
                waterMesh.position.set(wX, wY, wZ);
                scene.add(waterMesh);

                const aabb = new AABB();
                aabb.updateFromObject(waterMesh, waterRadius * 2, wHeight, waterRadius * 2);
                // Vùng nước CHỈ được push vào mảng waterAreas độc lập (Trigger Volume).
                // KHÔNG THÊM VÀO obstacles dưới bất kỳ hình thức nào.
                waterAreas.push({ mesh: waterMesh, aabb: aabb });
            }

            // --- CẤU HÌNH ENEMY CAMP (Pre-Alpha v0.3 — Frontier, cập nhật v0.4.1) ---
            // Data-driven: mỗi Camp là 1 điểm trung tâm + danh sách slime rải quanh đó trong bán kính
            // nhỏ (spawnRadius) — KHÔNG spawn ngẫu nhiên khắp map nữa (đúng tinh thần mục 6 của spec:
            // "Không để Slime xuất hiện ngẫu nhiên"). Muốn thêm Camp mới chỉ cần thêm 1 entry vào mảng
            // này — không cần sửa logic ở bất kỳ đâu khác.
            //   id: định danh duy nhất, gắn vào từng slime (slime.camp) để biết nó thuộc camp nào.
            //   x, z: tâm camp (world space).
            //   spawnRadius: bán kính (m) rải slime quanh tâm — mỗi slime lệch ngẫu nhiên trong vùng
            //                này để không đứng xếp hàng cứng nhắc, vẫn trông như 1 nhóm quái tụ lại.
            //                Dùng LẠI cho cả spawn ban đầu LẪN vị trí hồi sinh sau chu trình respawn.
            //   composition: danh sách { isLarge, count } — số lượng + loại slime GỐC của camp. Toàn bộ
            //                chu trình hồi sinh (xem CAMP_RESPAWN_CONFIG/startCampRespawnCycle) luôn xây
            //                lại ĐÚNG composition này mỗi lần — không có khái niệm "loại slime hồi sinh
            //                độc lập" nữa, cả camp reset về đúng thành phần ban đầu mỗi chu kỳ.
            //   chestType: key tra vào CHEST_TYPES — quyết định loại Chest của camp này. Trường ĐỘC LẬP,
            //              KHÔNG được tính toán tự động từ composition lúc runtime (đúng yêu cầu "mỗi
            //              Camp có thể tự cấu hình loại Chest mà không phụ thuộc số lượng/loại quái") —
            //              hiện tại được gán thủ công dựa trên quy mô camp cho hợp lý, nhưng có thể đổi
            //              tùy ý cho từng camp mà không ảnh hưởng gì tới slime/spawn logic.
            const CAMP_CONFIGS = [
                {
                    id: 'camp_a',
                    x: 20, z: -6,
                    spawnRadius: 4.5,
                    composition: [{ isLarge: false, count: 3 }],
                    chestType: 'common'
                },
                {
                    id: 'camp_b',
                    x: -22, z: 12,
                    spawnRadius: 5.5,
                    composition: [{ isLarge: false, count: 5 }],
                    chestType: 'exquisite'
                },
                {
                    id: 'camp_c',
                    x: 8, z: 26,
                    spawnRadius: 6.0,
                    composition: [{ isLarge: false, count: 4 }, { isLarge: true, count: 1 }],
                    chestType: 'precious'
                }
            ];
            window.CAMP_CONFIGS = CAMP_CONFIGS;

            // Tra cứu nhanh CAMP_CONFIGS theo id — dùng khi hồi sinh 1 slime để biết x/z/spawnRadius
            // của đúng camp gốc, tránh phải Array.find() lặp lại nhiều nơi.
            const CAMP_CONFIGS_BY_ID = {};
            CAMP_CONFIGS.forEach(c => { CAMP_CONFIGS_BY_ID[c.id] = c; });

            // --- CHU TRÌNH HỒI SINH THEO CAMP (v0.4.1) ---
            // Thay hoàn toàn cơ chế "mỗi slime respawn độc lập 30s" (v0.3.1) — giờ CẢ CAMP dùng chung
            // 1 chu trình gắn liền với Chest:
            //   'active'     — camp có slime, hoạt động bình thường. Khi slime cuối cùng chết, Chest
            //                  của camp tự chuyển Unlocked (xem Chest._campHasAliveSlimes trong
            //                  update() của chính nó) — CAMP KHÔNG ĐẾM GIỜ GÌ Ở BƯỚC NÀY, có thể đứng
            //                  yên vô thời hạn nếu người chơi chưa mở rương.
            //   'respawning' — CHỈ bắt đầu khi người chơi thực sự bấm "Mở" trên Chest (xem
            //                  Chest._open() -> window.startCampRespawnCycle()). Đếm ngược
            //                  respawnDelaySeconds (2 phút), sau đó lần lượt spawn từng slime trong
            //                  respawnQueue (KHÔNG đồng loạt) cách nhau spawnIntervalSeconds. Khi hàng
            //                  đợi rỗng, tạo Chest MỚI (Locked) và quay lại 'active'.
            // Nếu người chơi không mở rương, camp mãi mãi ở 'active' với 0 slime sống — không có gì tự
            // động hồi sinh, đúng yêu cầu "không mở rương thì slime không xuất hiện".
            const CAMP_RESPAWN_CONFIG = {
                respawnDelaySeconds: 90,   // 2 phút, chỉ bắt đầu đếm SAU KHI mở rương
                spawnIntervalSeconds: 2   // Khoảng cách giữa mỗi lần 1 slime lần lượt xuất hiện
            };

            // Trạng thái runtime của từng camp — key = camp.id. KHÔNG phải data cấu hình (đó là
            // CAMP_CONFIGS), đây là state thay đổi liên tục trong lúc chơi.
            //   phase: 'active' | 'respawning'
            //   respawnCountdown: giây còn lại trước khi bắt đầu lần lượt spawn (đếm 120s ban đầu)
            //   spawnQueue: mảng { isLarge } — các slime CÒN CẦN spawn, theo đúng thứ tự composition
            //   spawnIntervalTimer: giây còn lại trước khi spawn phần tử tiếp theo trong spawnQueue
            const campStates = {};
            CAMP_CONFIGS.forEach(camp => {
                campStates[camp.id] = { phase: 'active', respawnCountdown: 0, spawnQueue: [], spawnIntervalTimer: 0 };
            });
            window.campStates = campStates;

            // Rải `count` slime quanh tâm (cx, cz) trong bán kính `radius`, dùng góc + khoảng cách
            // ngẫu nhiên (không phải lưới cứng) để trông tự nhiên như 1 nhóm quái tụ lại quanh camp.
            // Mỗi slime được gắn `camp = campId` để biết nó thuộc camp nào (Chest dùng để theo dõi).
            function spawnCampSlime(campId, cx, cz, radius, isLarge) {
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * radius;
                const x = cx + Math.cos(angle) * dist;
                const z = cz + Math.sin(angle) * dist;
                const slime = new Slime(x, z, isLarge);
                slime.camp = campId;
                enemies.push(slime);
                return slime;
            }

            // Tạo toàn bộ Camp theo CAMP_CONFIGS — gọi 1 lần lúc khởi tạo map.
            function createCamps() {
                CAMP_CONFIGS.forEach(camp => {
                    camp.composition.forEach(group => {
                        for (let i = 0; i < group.count; i++) {
                            spawnCampSlime(camp.id, camp.x, camp.z, camp.spawnRadius, group.isLarge);
                        }
                    });
                });
            }

            // Giữ lại vài Enemy bất tử (placeholder/testing dame, không liên quan quest/camp) rải gần
            // khu khám phá — tách biệt hoàn toàn khỏi hệ thống Camp/respawn của Slime.
            function createTestEnemies() {
                const coordinates = [
                    [-6, -18],
                    [16, 22]
                ];
                coordinates.forEach(([x, z]) => { enemies.push(new Enemy(x, z)); });
            }

            // --- TRẦN AN TOÀN TỔNG THỂ ---
            // Phòng trường hợp nhiều camp cùng lúc trong pha 'respawning' cộng dồn khiến tổng số slime
            // tăng vọt — nếu chạm trần, slime kế tiếp trong spawnQueue vẫn CHỜ (không mất suất, chỉ trì
            // hoãn tới khi có chỗ trống), xem updateCampRespawns().
            const SLIME_SPAWN_CONFIG = {
                maxSlimes: 40
            };

            // Trả về một vị trí {x, z} ngẫu nhiên nằm an toàn bên trong plane hợp lệ (100x100,
            // margin lùi vào 5m để tránh spawn sát mép rồi lại rơi ra ngoài lần nữa).
            // Dùng cho teleport slime khi rơi khỏi vùng chơi (void) — KHÔNG liên quan tới spawn camp.
            function getRandomPositionOnPlane() {
                const margin = 5;
                const half = 50 - margin; // Plane giới hạn -50..50 theo cả X lẫn Z
                return {
                    x: (Math.random() * 2 - 1) * half,
                    z: (Math.random() * 2 - 1) * half
                };
            }
            window.getRandomPositionOnPlane = getRandomPositionOnPlane;

            // --- BẮT ĐẦU CHU TRÌNH HỒI SINH CỦA 1 CAMP ---
            // Gọi DUY NHẤT 1 LẦN từ Chest._open() ngay sau khi rương biến mất khỏi scene — đây là điểm
            // KÍCH HOẠT duy nhất của toàn bộ chu trình respawn. Xây spawnQueue LẠI TỪ ĐẦU theo đúng
            // composition gốc của camp (không quan tâm lúc này còn sót slime nào sống hay không — thực
            // tế luôn là 0 vì rương chỉ mở được khi camp đã sạch, nhưng xây từ composition cho tường
            // minh/an toàn thay vì tính toán số lượng còn thiếu).
            function startCampRespawnCycle(campId) {
                const state = campStates[campId];
                const camp = CAMP_CONFIGS_BY_ID[campId];
                if (!state || !camp) return;
                if (state.phase === 'respawning') return; // Đã đang trong chu trình, tránh khởi động chồng lấn

                state.phase = 'respawning';
                state.respawnCountdown = CAMP_RESPAWN_CONFIG.respawnDelaySeconds;
                state.spawnQueue = [];
                camp.composition.forEach(group => {
                    for (let i = 0; i < group.count; i++) state.spawnQueue.push({ isLarge: group.isLarge });
                });
                state.spawnIntervalTimer = 0;
            }
            window.startCampRespawnCycle = startCampRespawnCycle;

            // Mỗi frame: với từng camp đang ở pha 'respawning' — trước tiên đếm ngược respawnCountdown
            // (2 phút). Hết giờ thì bắt đầu rút dần từng phần tử trong spawnQueue, cách nhau đúng
            // spawnIntervalSeconds (LẦN LƯỢT, không đồng loạt). Khi spawnQueue rỗng: tạo Chest MỚI
            // (Locked) tại đúng vị trí camp, rồi chuyển camp về phase 'active'.
            function updateCampRespawns(dt) {
                CAMP_CONFIGS.forEach(camp => {
                    const state = campStates[camp.id];
                    if (state.phase !== 'respawning') return;

                    if (state.respawnCountdown > 0) {
                        state.respawnCountdown -= dt;
                        if (state.respawnCountdown > 0) return; // Vẫn còn thời gian chờ — dừng ở đây
                        // Countdown vừa chạm 0 đúng trong lần gọi này — rơi tiếp xuống logic spawn bên
                        // dưới NGAY TRONG CÙNG LẦN GỌI, không đợi thêm 1 lần updateCampRespawns() nữa.
                    }

                    if (state.spawnQueue.length === 0) {
                        // Toàn bộ slime đã lần lượt xuất hiện xong ở lần gọi trước — tạo Chest mới rồi
                        // chuyển hẳn về 'active'. Kiểm tra tách biệt khỏi nhánh spawn bên dưới để đảm
                        // bảo Chest mới chỉ tạo ĐÚNG 1 LẦN ngay khi hàng đợi vừa rỗng.
                        createChestForCamp(camp);
                        state.phase = 'active';
                        return;
                    }

                    state.spawnIntervalTimer -= dt;
                    if (state.spawnIntervalTimer > 0) return;

                    const totalSlimes = enemies.filter(e => e.isSlime && e.alive).length;
                    if (totalSlimes >= SLIME_SPAWN_CONFIG.maxSlimes) return; // Chờ tới khi có chỗ trống, không bỏ suất

                    const next = state.spawnQueue.shift();
                    const s = spawnCampSlime(camp.id, camp.x, camp.z, camp.spawnRadius, next.isLarge);
                    spawnRunTrail(s.position, new THREE.Vector3(0, 0, 1));
                    state.spawnIntervalTimer = CAMP_RESPAWN_CONFIG.spawnIntervalSeconds;
                });
            }
            window.updateCampRespawns = updateCampRespawns;

            function triggerDamageFlash() {
                const flash = document.getElementById('damage-flash');
                if (flash) {
                    flash.style.opacity = '1';
                    setTimeout(() => { flash.style.opacity = '0'; }, 150);
                }
            }
            window.triggerDamageFlash = triggerDamageFlash;

            function playerRespawn() {
                spawnDeathParticles(player.position);
                player.hp = player.maxHp; player.position.copy(PLAYER_SPAWN_POSITION);
                player.stamina = player.maxStamina; // Reset thể lực
                player.velocity.set(0, 0, 0); player.inputVelocity.set(0, 0, 0);
                sfx.playHit(); cameraState.shakeTimer = 0.5; cameraState.shakeIntensity = 0.5;
                deactivateGlider();
                player.isPlunging = false;
                player.isSwimming = false;
                player.isClimbing = false;
                player.isDrowning = false;
                player.fallStartY = player.position.y; // Reset theo dõi Fall Damage sau khi hồi sinh
                player.wasGrounded = true; // Tránh bị tính rơi giả ở frame respawn đầu tiên
                player.lungeTimer = 0; player.lungeRemainingDist = 0; // Hủy Attack Lunge dở dang (nếu có)
                player.recoilTimer = 0; player.recoilRemainingDist = 0; // Hủy Pressure Shot Recoil dở dang (nếu có)
                player.softTargetLockY = null; // Hủy Soft Targeting dở dang (nếu có)
            }

            // --- HỆ THỐNG DEAD STATE (MÀN HÌNH TỬ VONG + HỒI SINH THỦ CÔNG) ---
            // Gọi khi HP về 0 vì bất kỳ lý do gì (combat, drown, fall sau này).
            // deathType: 'combat' | 'drown' | 'fall' — quyết định nội dung UI hiển thị.
            function enterDeadState(deathType) {
                if (player.isDead) return; // đã đang chết, tránh gọi lại chồng lấn
                player.isDead = true;

                // Hủy nhạc ngay lập tức: dừng hẳn combat_ost (nếu đang phát) và reset lại chu kỳ
                // afterCombat/bg_ost như vừa mới bắt đầu game.
                if (window.music) window.music.onPlayerDeath();

                // Dừng hoàn toàn chuyển động và mọi trạng thái hành động đang dở
                player.velocity.set(0, 0, 0);
                player.inputVelocity.set(0, 0, 0);
                player.isDashing = false;
                player.isPlunging = false;
                player.isGliding = false;
                deactivateGlider();

                // Hủy Skill Aim State dở dang (nếu có) — vì keyup có thể không chạy tới handleSkillKeyUp()
                // khi player.isDead vừa được set true (guard sớm ở đầu keyup handler), cần reset tường
                // minh ở đây để tránh skillAimState bị kẹt mãi mãi ở phase 'holding'/'aiming'.
                skillAimState.phase = 'idle';
                skillAimState.heldTime = 0;
                skillAimState.aimTimer = 0;
                skillAimState.fireTimer = 0;
                burstAimState.phase = 'idle';
                if (window.setSkillAimUIVisible) window.setSkillAimUIVisible(false);
                if (player.isBursting) endBurstBubble();

                // Ẩn nhân vật khỏi scene — kẻ địch không còn mục tiêu để phát hiện/tấn công
                if (player.mesh) player.mesh.visible = false;

                if (window.showDeathScreen) window.showDeathScreen(deathType);
            }
            window.enterDeadState = enterDeadState;

            // Gọi khi người chơi bấm nút "Revive" trên UI — đây là lúc thực sự hồi sinh.
            function confirmRevive() {
                if (!player.isDead) return;
                player.isDead = false;
                player.isDrowning = false; // lớp an toàn: đảm bảo không kẹt state cũ dù nguồn gây chết là gì
                playerRespawn();
                if (player.mesh) player.mesh.visible = true;
                if (window.hideDeathScreen) window.hideDeathScreen();
            }
            window.confirmRevive = confirmRevive;

            // --- CHUỖI XỬ LÝ ĐUỐI NƯỚC (DROWNING SEQUENCE v0.8.0) ---
            function triggerDrowningSequence() {
                if (player.isDrowning) return;
                player.isDrowning = true;
                player.drownTimer = 1.0; // Thời gian hiệu ứng chìm trước khi vào Dead state

                // Hủy Skill Aim State dở dang (nếu có) — đề phòng edge case, xem giải thích tương tự ở enterDeadState().
                skillAimState.phase = 'idle';
                burstAimState.phase = 'idle';
                if (window.setSkillAimUIVisible) window.setSkillAimUIVisible(false);
                if (player.isBursting) endBurstBubble();
                
                // Vô hiệu hóa điều khiển tạm thời trong lúc chìm
                player.velocity.set(0, -2.0, 0); 
                player.inputVelocity.set(0, 0, 0);
                
                // Kích hoạt splash nước và âm thanh chìm
                spawnHydroSplash(player.position, new THREE.Vector3(0, 1, 0), true);
                sfx.playHydroSplash();
                sfx.playBlockedSound();

                setTimeout(() => {
                    player.hp = 0;
                    player.isDrowning = false;
                    player.isSwimming = false;
                    player.isClimbing = false;
                    enterDeadState('drown');
                }, 1000);
            }
            window.triggerDrowningSequence = triggerDrowningSequence;

            function activateGlider() {
                if (player.isPlunging || player.isGrounded || player.isSwimming) return;
                player.isGliding = true;
                player.isSprinting = false;
                if (player.gliderGroup) player.gliderGroup.visible = true;
                player.velocity.y = -1.35; 
            }
            window.activateGlider = activateGlider;

            function deactivateGlider() {
                player.isGliding = false;
                if (player.gliderGroup) player.gliderGroup.visible = false;
            }
            window.deactivateGlider = deactivateGlider;

            // Plunge Attack, Melee Attack, Elemental Skill, Elemental Burst đã tách sang combat.js
            // (load SAU file này — xem giải thích thứ tự load ở đầu combat.js).

            function triggerDash() {
                if (player.isDrowning || skillAimState.phase === 'aiming') return;

                // --- STAMINA GUARD: Dash tiêu thụ thể lực ---
                if (player.stamina < 15.0) {
                    sfx.playBlockedSound();
                    return; 
                }

                // Tích hợp Hành vi Swim Fast nếu đang bơi
                if (player.isSwimming) {
                    player.swimState = 'fast';
                    player.swimFastTimer = 1.2; // Thời gian burst duy trì sau khi dash
                    player.stamina = Math.max(0, player.stamina - 15.0); // Trừ 15 thể lực khi dash bơi

                    // Lực nảy nhẹ lên khi lướt (Burst out of water feel)
                    player.velocity.y = Math.max(player.velocity.y, 3.5); 

                    let moveX = 0, moveZ = 0;
                    if (joystickActive) { moveX = joystickDelta.x; moveZ = joystickDelta.y; } 
                    else {
                        if (keys.w) moveZ = -1; if (keys.s) moveZ = 1;
                        if (keys.a) moveX = -1; if (keys.d) moveX = 1;
                    }

                    const camForward = new THREE.Vector3(); camera.getWorldDirection(camForward); camForward.y = 0; camForward.normalize();
                    const camRight = new THREE.Vector3(); camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();
                    const direction = new THREE.Vector3(); direction.addScaledVector(camForward, -moveZ); direction.addScaledVector(camRight, moveX);   

                    if (direction.lengthSq() > 0.01) {
                        direction.normalize();
                        player.dashDirection.copy(direction);
                        player.lastMovementDirection.copy(direction); 
                    } else {
                        player.dashDirection.copy(new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)).normalize());
                    }

                    // Impulse bơi tốc độ cao
                    player.inputVelocity.copy(player.dashDirection).multiplyScalar(14.0);

                    spawnHydroSplash(player.position, player.dashDirection, false);
                    sfx.playHydroSplash();
                    return;
                }

                // Chạy logic Dash truyền thống trên cạn
                if (player.isDashing || player.dashCooldownTimer > 0) return;
                if (!player.isGrounded) return;
                if (player.isGliding) return; 
                if (player.isClimbing) return;

                player.isDashing = true;
                player.dashTimer = player.dashDuration;
                player.ghostSpawnTimer = 0; 
                player.stamina = Math.max(0, player.stamina - 15.0); // Trừ 15 thể lực khi dash trên cạn

                player.mesh.scale.set(0.68, 1.35, 0.68);

                let moveX = 0, moveZ = 0;
                if (joystickActive) { moveX = joystickDelta.x; moveZ = joystickDelta.y; } 
                else {
                    if (keys.w) moveZ = -1; if (keys.s) moveZ = 1;
                    if (keys.a) moveX = -1; if (keys.d) moveX = 1;
                }

                const camForward = new THREE.Vector3();
                camera.getWorldDirection(camForward);
                camForward.y = 0; camForward.normalize();
                const camRight = new THREE.Vector3();
                camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

                const direction = new THREE.Vector3();
                direction.addScaledVector(camForward, -moveZ); 
                direction.addScaledVector(camRight, moveX);   

                if (direction.lengthSq() > 0.01) {
                    direction.normalize();
                    player.dashDirection.copy(direction);
                    player.lastMovementDirection.copy(direction); 
                } else {
                    if (player.lastMovementDirection.lengthSq() > 0.01) player.dashDirection.copy(player.lastMovementDirection);
                    else {
                        player.dashDirection.copy(new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)).normalize());
                    }
                }

                player.velocity.y = 0; 
                sfx.playDashWhoosh();
                spawnPlayerGhost(player.mesh);
            }
            window.triggerDash = triggerDash;

            const keys = window.keys = { w: false, a: false, s: false, d: false, space: false, dash: false, ctrl: false, dashJustPressed: false };
            let altPressed = false;
            Object.defineProperty(window, 'altPressed', {
                get() { return altPressed; },
                set(v) { altPressed = v; },
                configurable: true
            });

            window.addEventListener('contextmenu', (e) => { e.preventDefault(); });

            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (window.isDialogueOpen) {
                        if (window.closeDialogue) window.closeDialogue();
                        return;
                    }
                    if (isGamePaused) {
                        // Close both subwindow and pause menu
                        closeSubWindow();
                        togglePauseMenu(false);
                    } else {
                        togglePauseMenu(true);
                    }
                    return;
                }

                if (e.key === 'Alt') {
                    e.preventDefault();
                    if (!altPressed) { altPressed = true; if (document.pointerLockElement === container) document.exitPointerLock(); }
                    return;
                }

                if (isGamePaused || window.isDialogueOpen || player.isDrowning || player.isDead) return;

                const k = e.key.toLowerCase();
                if (k === 'w' || k === "ư"|| e.key === 'ArrowUp') keys.w = true;
                if (k === 's' || e.key === 'ArrowDown') keys.s = true;
                if (k === 'a' || e.key === 'ArrowLeft') keys.a = true;
                if (k === 'd' || e.key === 'ArrowRight') keys.d = true;
                if (k === 'e' && !e.repeat) handleSkillKeyDown();
                if (k === 'f') interactWithNearbyObject();
                if (k === 'q' && !e.repeat) handleBurstKeyDown();
                
                if (k === 'x' && player.isClimbing) {
                    player.isClimbing = false;
                    player.velocity.set(0, 0, 0);
                    player.velocity.addScaledVector(player.climbNormal, 2.0); 
                }

                if (e.key === 'Control' && !e.repeat) {
                    e.preventDefault(); player.walkMode = !player.walkMode;
                    if (player.walkMode) player.isSprinting = false;
                    const mWalkBtn = document.getElementById('mobile-walk-toggle');
                    if (mWalkBtn) mWalkBtn.classList.toggle('walk-active', player.walkMode);
                    const icon = document.getElementById('mobile-walk-icon');
                    const label = document.getElementById('mobile-walk-label');
                    if (icon) icon.className = player.walkMode ? 'fa-solid fa-person-walking text-sm' : 'fa-solid fa-person-running text-sm';
                    if (label) label.textContent = player.walkMode ? 'WALK' : 'RUN';
                }
                
                if (e.key === 'Shift') {
                    if (!keys.dash) {
                        keys.dashJustPressed = true;
                    }
                    keys.dash = true;
                    if (keys.dashJustPressed) {
                        triggerDash();
                        keys.dashJustPressed = false;
                    }
                }
                if (e.key === ' ' && !e.repeat) { 
                    e.preventDefault(); 
                    if (!keys.space && skillAimState.phase !== 'aiming') {
                        keys.space = true;
                        player.jumpRequested = true;
                        
                        // Disable Glide Activation in Swimming
                        if (!player.isGrounded && !player.isClimbing && !player.isSwimming) {
                            const heightAboveGround = player.position.y - (player.height / 2) - getGroundYForPosition(player.position);
                            if (heightAboveGround > 2.1) {
                                if (player.isGliding) {
                                    deactivateGlider();
                                } else if (player.velocity.y < 3.0 && !player.isPlunging) {
                                    activateGlider();
                                }
                            }
                        }
                    }
                }
            });

            window.addEventListener('keyup', (e) => {
                if (isGamePaused || window.isDialogueOpen || player.isDrowning || player.isDead) return;

                if (e.key === 'Alt') {
                    e.preventDefault();
                    if (altPressed) { altPressed = false; if (!isMobile && document.pointerLockElement !== container && !isGamePaused) container.requestPointerLock().catch(() => {}); }
                    return;
                }
                const k = e.key.toLowerCase();
                if (k === 'w' || e.key === 'ArrowUp') keys.w = false;
                if (k === 's' || e.key === 'ArrowDown') keys.s = false;
                if (k === 'a' || e.key === 'ArrowLeft') keys.a = false;
                if (k === 'd' || e.key === 'ArrowRight') keys.d = false;
                if (e.key === 'Shift') {
                    keys.dash = false;
                    keys.dashJustPressed = false; 
                    player.isSprinting = false;
                }
                if (e.key === ' ') {
                    keys.space = false;
                }
                if (k === 'e') handleSkillKeyUp();
                if (k === 'q') handleBurstKeyUp();
            });

            window.addEventListener('blur', () => { 
                for (let k in keys) keys[k] = false; 
                altPressed = false; 
            });

            window.addEventListener('mousedown', (e) => {
                if (isGamePaused || window.isDialogueOpen || player.isDrowning || player.isDead) return;
                if (isMobile || altPressed || e.target.closest('button') || e.target.closest('.joystick-zone') || e.target.closest('.combat-btn') || e.target.closest('#desktop-skill-btn') || e.target.closest('#game-menu')) return;
                
                if (document.pointerLockElement !== container) { container.requestPointerLock().catch(() => {}); return; }
                if (document.pointerLockElement === container) {
                    if (e.button === 0) handleAttackInput(); 
                    else if (e.button === 2) { 
                        keys.dash = true; 
                        triggerDash(); 
                    }
                }
            });

            window.addEventListener('mouseup', (e) => { 
                if (isGamePaused || window.isDialogueOpen || player.isDrowning || player.isDead) return;
                if (!isMobile && !altPressed && e.button === 2) {
                    keys.dash = false; 
                    player.isSprinting = false;
                }
            });

            window.addEventListener('mousemove', (e) => {
                if (isMobile || isGamePaused || window.isDialogueOpen) return;
                if (document.pointerLockElement === container && !altPressed) {
                    cameraState.targetTheta -= e.movementX * cameraState.sensitivity * cameraSensitivityMultiplier;
                    cameraState.targetPhi += e.movementY * cameraState.sensitivity * cameraSensitivityMultiplier;
                    cameraState.targetPhi = Math.max(cameraState.minPhi, Math.min(cameraState.maxPhi, cameraState.targetPhi));
                }
            });

            document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== container && !altPressed && !isGamePaused) altPressed = false; });

            window.addEventListener('wheel', (e) => {
                if (isGamePaused || window.isDialogueOpen) return;
                cameraState.targetDistance += e.deltaY * cameraState.zoomSensitivity * 0.1;
                cameraState.targetDistance = Math.max(cameraState.minDistance, Math.min(cameraState.maxDistance, cameraState.targetDistance));
            }, { passive: true });

            window.addEventListener('resize', () => {
                camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            });

            // Desktop skill/burst button wiring và joystick refs đã chuyển sang ui.js
            // (xem initDesktopButtons() trong ui.js).

            function startClimbing(normal) {
                // Stamina Guard: Không cho leo nếu kiệt sức
                if (player.stamina <= 0) return;

                player.isClimbing = true;
                player.climbNormal.copy(normal);
                player.velocity.set(0, 0, 0);
                player.inputVelocity.set(0, 0, 0);
                player.isDashing = false;
                player.isSprinting = false;
                player.climbJumpTimer = 0;
                if (player.isGliding) deactivateGlider();
                player.isPlunging = false;
                player.jumpRequested = false;
                
                const targetAngle = Math.atan2(-normal.x, -normal.z);
                player.mesh.rotation.y = targetAngle;
            }

            // syncHUDVariables() đã chuyển sang ui.js

            function updatePhysics(dt) {
                if (dt > 0.1) dt = 0.1;
                const playerHalfW = player.width / 2, playerHalfH = player.height / 2, playerHalfD = player.depth / 2, eps = 0.001;

                if (player.invulnTimer > 0) player.invulnTimer -= dt;
                if (player.staggerTimer > 0) player.staggerTimer -= dt;

                if (player.isDead) {
                    // Dừng hoàn toàn input/physics cho đến khi người chơi bấm Revive
                    return;
                }

                if (player.isDrowning) {
                    // Chặn tất cả logic vật lý khác khi đang đuối nước
                    return;
                }

                // --- PHÁT HIỆN MẶT NƯỚC & CHUYỂN TRẠNG THÁI SWIMMING (PURE DETECTION VOLUME) ---
                let inWaterNow = false;
                let waterSurfaceY = -1.0;
                const pAABBForWater = getPlayerAABBAt(player.position);
                for (let i = 0; i < waterAreas.length; i++) {
                    if (intersectAABB(pAABBForWater, waterAreas[i].aabb)) {
                        inWaterNow = true;
                        waterSurfaceY = waterAreas[i].aabb.maxY;
                        break;
                    }
                }
                player.isInWater = inWaterNow;

                // Tính toán tỷ lệ chìm dưới nước: Độ sâu / Chiều cao nhân vật
                let depthRatio = inWaterNow ? (waterSurfaceY - (player.position.y - playerHalfH)) / player.height : 0;

                // Vào chế độ Bơi nếu ngập hơn 70% cơ thể
                if (inWaterNow && depthRatio > 0.7) {
                    
                    // State Priority: Huỷ bỏ Plunge Attack ngay lập tức nếu đáp xuống vùng nước sâu
                    if (player.isPlunging) {
                        player.isPlunging = false;
                        player.attackState = 'idle';
                        player.sword.rotation.set((-Math.PI / 3) + player.mesh.children[0].rotation.x, 0, Math.PI / 10);
                        spawnHydroSplash(player.position, new THREE.Vector3(0, 1, 0), true);
                        sfx.playHydroSplash();
                    }

                    // State Priority: Huỷ bỏ Gliding nếu đáp xuống nước
                    if (player.isGliding) {
                        deactivateGlider();
                    }

                    if (!player.isSwimming && !player.isClimbing) {
                        player.isSwimming = true;
                        player.swimState = 'idle';
                        player.isDashing = false;
                        player.isSprinting = false;
                        player.velocity.y = Math.max(player.velocity.y, -4.0); // Giảm lực rơi khi chạm mặt nước
                        spawnHydroSplash(player.position, new THREE.Vector3(0, 1, 0), true);
                        sfx.playHydroSplash();
                    }
                } 
                // Thoát chế độ bơi nếu lùi vào vùng nước cạn (hoặc lên bờ)
                else if (!inWaterNow || depthRatio < 0.5) {
                    if (player.isSwimming) {
                        player.isSwimming = false;
                        player.swimState = 'idle';
                        player.sword.visible = true;
                        // Phục hồi lại trục rotation bị nghiêng khi bơi
                        player.mesh.children[0].rotation.z = 0;
                        player.mesh.children[1].rotation.z = 0;
                        
                        // Cung cấp một lực đẩy nhỏ (Hop) giúp người chơi dễ dàng leo ra khỏi vùng nước mép bờ
                        const movingForward = keys.w || (joystickActive && joystickDelta.y < -0.3);
                        if (movingForward) player.velocity.y = 5.5; 
                    }
                }

                // --- TIÊU HAO VÀ HỒI PHỤC THỂ LỰC (v0.8.0) ---
                let staminaCost = 0;
                let isConsumingStamina = false;

                if (player.isClimbing) {
                    let isMovingOnWall = false;
                    if (joystickActive && (Math.abs(joystickDelta.x) > 0.1 || Math.abs(joystickDelta.y) > 0.1)) {
                        isMovingOnWall = true;
                    } else if (keys.w || keys.s || keys.a || keys.d) {
                        isMovingOnWall = true;
                    }
                    
                    if (player.climbJumpTimer > 0) {
                        // Nhảy leo núi (tiêu tốn stamina nhảy tức thời đã tính khi nhấn nút, không nhân liên tục)
                    } else if (isMovingOnWall) {
                        staminaCost = 8.0 * dt; // Di chuyển trên tường: -8/giây
                        isConsumingStamina = true;
                    }
                } else if (player.isSwimming) {
                    if (player.swimState === 'fast') {
                        staminaCost = 12.0 * dt; // Bơi nhanh: -12/giây
                        isConsumingStamina = true;
                    }
                } else {
                    if (player.isSprinting) {
                        staminaCost = 10.0 * dt; // Chạy nhanh trên cạn: -10/giây
                        isConsumingStamina = true;
                    }
                }

                if (isConsumingStamina) {
                    player.stamina = Math.max(0, player.stamina - staminaCost);
                } else {
                    // Hồi phục thể lực khi không tiêu hao
                    let regenRate = 25.0 * dt; // Hồi phục bình thường trên cạn: +25/giây
                    if (player.isSwimming) {
                        regenRate = 5.0 * dt; // Bơi thong thả/idle dưới nước hồi cực chậm: +5/giây
                    }
                    player.stamina = Math.min(player.maxStamina, player.stamina + regenRate);
                }

                // --- STAMINA RESOLUTION TRIGGER ---
                if (player.stamina <= 0) {
                    if (player.isClimbing) {
                        // Kiệt sức khi đang leo núi: Buông tay ngã tự do!
                        player.isClimbing = false;
                        player.velocity.set(0, -3.0, 0); 
                        sfx.playBlockedSound();
                    } else if (player.isSwimming) {
                        // Kiệt sức khi đang bơi sâu: Kích hoạt Đuối Nước!
                        triggerDrowningSequence();
                        return; // Ngắt update vật lý hiện tại
                    } else if (player.isSprinting) {
                        // Kiệt sức khi chạy nhanh: Cưỡng chế đi bộ/chạy thường
                        player.isSprinting = false;
                    }
                    
                    if (player.swimState === 'fast') {
                        player.swimState = 'slow'; // Ép giảm tốc bơi
                    }
                }

                // --- CẬP NHẬT GIAO DIỆN VÒNG THỂ LỰC DI ĐỘNG ---
                if (staminaContainer && staminaRing) {
                    const pct = player.stamina / player.maxStamina;
                    
                    // Chỉ hiển thị khi stamina sụt giảm dưới 98%
                    if (pct < 0.98) {
                        staminaContainer.style.opacity = '1';
                        // Chiếu tọa độ 3D nhân vật sang 2D màn hình phẳng
                        const tempV = new THREE.Vector3();
                        player.mesh.getWorldPosition(tempV);
                        tempV.y += 0.8; // Đưa vòng thể lực lên ngang hông/vai nhân vật
                        tempV.project(camera);
                        
                        const sx = (tempV.x * 0.5 + 0.5) * window.innerWidth;
                        const sy = (tempV.y * -0.5 + 0.5) * window.innerHeight;
                        
                        staminaContainer.style.left = `${sx}px`;
                        staminaContainer.style.top = `${sy}px`;
                        
                        // Cập nhật dash-offset của SVG Path
                        const dashOffset = 100 - (pct * 100);
                        staminaRing.style.strokeDashoffset = dashOffset;
                        
                        // Đổi màu đỏ khi thể lực cực thấp (dưới 20%)
                        if (pct < 0.22) {
                            staminaRing.className.baseVal = "text-red-500 transition-all duration-75";
                        } else {
                            staminaRing.className.baseVal = "text-amber-400 transition-all duration-75";
                        }
                    } else {
                        staminaContainer.style.opacity = '0';
                    }
                }

                // --- XỬ LÝ LỰC (Trọng lực / Lực nổi) ---
                if (player.isClimbing) {
                    if (player.climbJumpTimer > 0) {
                        player.climbJumpTimer -= dt;
                        player.velocity.y = player.jumpForce * 0.8;
                        player.velocity.x = 0;
                        player.velocity.z = 0;
                    } else {
                        let climbInputY = 0;
                        let climbInputX = 0;
                        if (joystickActive) { 
                            climbInputY = -joystickDelta.y; 
                            climbInputX = joystickDelta.x;
                        } 
                        else {
                            if (keys.w) climbInputY = 1;
                            if (keys.s) climbInputY = -1;
                            if (keys.a) climbInputX = -1;
                            if (keys.d) climbInputX = 1;
                        }
                        
                        const up = new THREE.Vector3(0, 1, 0);
                        const right = new THREE.Vector3().crossVectors(up, player.climbNormal).normalize();
                        
                        const climbSpeed = 4.0;
                        player.velocity.x = climbInputX * right.x * climbSpeed;
                        player.velocity.y = climbInputY * climbSpeed;
                        player.velocity.z = climbInputX * right.z * climbSpeed;
                    }
                } 
                else if (player.isSwimming) {
                    // SWIMMING BUOYANCY - Thay thế trọng lực bằng lực nổi hướng tới mục tiêu
                    const floatTargetY = waterSurfaceY - player.height * 0.25; // 75% cơ thể ở dưới nước, 25% nổi lên trên
                    const buoyancy = (floatTargetY - player.position.y) * 15.0;
                    player.velocity.y += buoyancy * dt;
                    player.velocity.y *= Math.exp(-5.0 * dt); // Lực cản mạnh của nước chiều dọc (Damping)
                }
                else if (!player.isDashing) {
                    if (player.isGliding) {
                        player.velocity.y = -1.35; 
                    } else if (player.isPlunging) {
                        player.velocity.y -= 45.0 * dt; 
                        if (player.velocity.y < -45) player.velocity.y = -45;
                    } else {
                        player.velocity.y -= player.gravity * dt;
                    }
                    if (player.velocity.y < -30 && !player.isPlunging) player.velocity.y = -30; 
                }

                // --- XỬ LÝ DI CHUYỂN NGANG (X, Z) ---
                if (player.isDashing) {
                    const progress = player.dashTimer / player.dashDuration; 
                    const currentDashSpeed = player.dashSpeed * Math.pow(progress, 1.2); 

                    player.velocity.x = player.dashDirection.x * currentDashSpeed;
                    player.velocity.z = player.dashDirection.z * currentDashSpeed;

                    spawnDashWindTrail(player.position, player.dashDirection);

                    player.ghostSpawnTimer += dt;
                    if (player.ghostSpawnTimer >= 0.04) { spawnPlayerGhost(player.mesh); player.ghostSpawnTimer = 0; }

                    player.dashTimer -= dt;
                    if (player.dashTimer <= 0) {
                        player.isDashing = false; 
                        player.dashCooldownTimer = player.dashCooldown;
                        
                        if (keys.dash && player.stamina > 0) {
                            player.isSprinting = true;
                            player.inputVelocity.copy(player.dashDirection).multiplyScalar(player.sprintSpeed);
                        } else {
                            const dashExitMomentum = player.dashSpeed * 0.55; 
                            player.inputVelocity.copy(player.dashDirection).multiplyScalar(dashExitMomentum);
                        }
                    }
                } else {
                    if (player.dashCooldownTimer > 0) {
                        player.dashCooldownTimer -= dt;
                        if (player.dashCooldownTimer < 0) player.dashCooldownTimer = 0;
                    }
                }

                if (player.isPlunging) {
                    player.velocity.x = 0;
                    player.velocity.z = 0;
                    player.inputVelocity.set(0, 0, 0);

                    if (Math.random() < 0.45) spawnPlungeTrailParticles();
                } 
                else if (player.isSwimming) {
                    // SWIMMING MOVEMENT LOGIC
                    let moveX = 0, moveZ = 0;
                    if (joystickActive) { moveX = joystickDelta.x; moveZ = joystickDelta.y; } 
                    else {
                        if (keys.w) moveZ = -1; if (keys.s) moveZ = 1;
                        if (keys.a) moveX = -1; if (keys.d) moveX = 1;
                    }

                    const camForward = new THREE.Vector3(); camera.getWorldDirection(camForward); camForward.y = 0; camForward.normalize();
                    const camRight = new THREE.Vector3(); camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();
                    const moveDirection = new THREE.Vector3(); moveDirection.addScaledVector(camForward, -moveZ); moveDirection.addScaledVector(camRight, moveX);   

                    const hasMovementInput = moveDirection.lengthSq() > 0.01;
                    if (hasMovementInput) { moveDirection.normalize(); player.lastMovementDirection.copy(moveDirection); }

                    // Quản lý trạng thái Bơi (Fast dần decay về Slow nếu không còn giữ Input hoặc hết Timer)
                    if (player.swimState === 'fast') {
                        if (player.stamina <= 0) {
                            player.swimState = 'slow';
                        } else if (player.swimFastTimer > 0) {
                            player.swimFastTimer -= dt;
                        } else if (!keys.dash) { // if timer ended and not holding sprint
                            player.swimState = hasMovementInput ? 'slow' : 'idle';
                        }
                        
                        // Fallback to idle if totally stopped
                        if (!hasMovementInput) {
                            player.swimState = 'idle';
                        }
                    } else {
                        if (hasMovementInput) {
                            player.swimState = (keys.dash && player.stamina > 0) ? 'fast' : 'slow';
                        } else {
                            player.swimState = 'idle';
                        }
                    }

                    let targetSpeed = 0;
                    if (player.swimState === 'fast') targetSpeed = 11.0; // Swim Fast
                    else if (player.swimState === 'slow') targetSpeed = 4.5; // Swim Slow (Breaststroke speed)

                    // Lực cản của nước (Drag/Lerp Factor)
                    const lerpFactor = targetSpeed > 0 ? (3.5 * dt) : (6.0 * dt); 
                    const desiredVelocity = moveDirection.clone().multiplyScalar(targetSpeed);
                    player.inputVelocity.lerp(desiredVelocity, Math.min(lerpFactor, 1));

                    player.velocity.x = player.inputVelocity.x; 
                    player.velocity.z = player.inputVelocity.z;

                    // Procedural Bobbing/Oscillation Timer Updates
                    player.swimOscillationTimer += dt;
                    if (player.swimState === 'idle') {
                        // Nhấp nhô trục Y nhẹ khi treading water
                        player.velocity.y += Math.sin(player.swimOscillationTimer * 3.0) * 0.8 * dt;
                    }

                    // Particles nước văng ra khi đang bơi
                    if (player.swimState === 'fast' && Math.random() < 0.25) {
                        spawnHydroTrail(player.position);
                    } else if (player.swimState === 'slow' && Math.random() < 0.08) {
                        spawnHydroTrail(player.position);
                    }
                }
                else if (!player.isDashing && !player.isClimbing) {
                    // GROUNDED / AIRBORNE MOVEMENT LOGIC
                    let moveX = 0, moveZ = 0;
                    if (joystickActive) { moveX = joystickDelta.x; moveZ = joystickDelta.y; } 
                    else {
                        if (keys.w) moveZ = -1; if (keys.s) moveZ = 1;
                        if (keys.a) moveX = -1; if (keys.d) moveX = 1;
                    }

                    const camForward = new THREE.Vector3(); camera.getWorldDirection(camForward); camForward.y = 0; camForward.normalize();
                    const camRight = new THREE.Vector3(); camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();
                    const moveDirection = new THREE.Vector3(); moveDirection.addScaledVector(camForward, -moveZ); moveDirection.addScaledVector(camRight, moveX);   

                    const hasMovementInput = moveDirection.lengthSq() > 0.01;
                    if (hasMovementInput) { moveDirection.normalize(); player.lastMovementDirection.copy(moveDirection); }

                    if (!keys.dash || !hasMovementInput || player.walkMode || player.isGliding || player.stamina <= 0) {
                        player.isSprinting = false;
                    } else if (player.isGrounded && !player.isDashing) {
                        player.isSprinting = true;
                    }

                    let activeMaxSpeed = player.speed;
                    if (player.isGliding) activeMaxSpeed = 9.2; 
                    else if (player.walkMode) activeMaxSpeed = player.walkSpeed;
                    else if (player.isSprinting) activeMaxSpeed = player.sprintSpeed;

                    // Aim Mode của Elemental Skill: chặn hoàn toàn di chuyển (targetSpeed = 0), giống
                    // cách Genshin khóa chân nhân vật khi giương cung — nhưng KHÔNG chặn camera, người
                    // chơi vẫn xoay hướng ngắm tự do (xử lý riêng trong updateCamera, không đụng ở đây).
                    const targetSpeed = skillAimState.phase === 'aiming' ? 0 : (hasMovementInput ? (player.attackState !== 'idle' ? activeMaxSpeed * 0.35 : activeMaxSpeed) : 0);
                    
                    const lerpFactor = targetSpeed > 0 ? (player.acceleration * dt) : (player.deceleration * dt);
                    const desiredVelocity = moveDirection.clone().multiplyScalar(targetSpeed);
                    player.inputVelocity.lerp(desiredVelocity, Math.min(lerpFactor, 1));

                    player.velocity.x = player.inputVelocity.x; 
                    player.velocity.z = player.inputVelocity.z;

                    if (player.isSprinting && hasMovementInput && player.isGrounded && Math.random() < 0.3) {
                        spawnRunTrail(player.position, player.lastMovementDirection);
                    } else if (hasMovementInput && player.isGrounded && !player.walkMode && Math.random() < 0.15) {
                        spawnRunTrail(player.position, player.lastMovementDirection);
                    }
                }

                // --- ATTACK LUNGE: cộng THÊM vào velocity (không ghi đè) sau khi mọi logic di chuyển
                // khác đã finalize trong frame này — tránh đúng bug của lunge cũ (bị input-movement ghi
                // đè mất tác dụng ở frame kế). Quãng đường trải đều qua lungeTimer, giảm dần mỗi frame,
                // dừng hẳn khi hết quãng đường hoặc hết thời gian — không phải Dash, không tự lao vào địch.
                if (player.lungeTimer > 0 && player.lungeRemainingDist > 0) {
                    const lungeStep = Math.min(player.lungeRemainingDist, (player.lungeRemainingDist / player.lungeTimer) * dt);
                    player.velocity.x += player.lungeDir.x * (lungeStep / dt);
                    player.velocity.z += player.lungeDir.z * (lungeStep / dt);
                    player.lungeRemainingDist -= lungeStep;
                    player.lungeTimer -= dt;
                    if (player.lungeTimer <= 0 || player.lungeRemainingDist <= 0.001) {
                        player.lungeTimer = 0;
                        player.lungeRemainingDist = 0;
                    }
                } else {
                    player.lungeTimer = 0;
                    player.lungeRemainingDist = 0;
                }

                // --- PRESSURE SHOT RECOIL: cùng cơ chế với Attack Lunge ở trên (cộng THÊM vào velocity,
                // trải đều qua recoilTimer) — đẩy lùi nhẹ theo hướng ngược lại hướng bắn, không làm mất
                // kiểm soát nhân vật (chỉ là 1 lực đẩy ngắn, người chơi vẫn di chuyển bình thường ngay
                // sau đó nếu muốn, vì đây chỉ cộng thêm chứ không ghi đè input-movement).
                // LƯU Ý: chỉ áp dụng recoilDir.x/z (phương ngang) — CHỦ Ý bỏ qua recoilDir.y dù hướng bắn
                // giờ có thể nghiêng lên/xuống (Aim 3D). Đẩy nhân vật theo trục dọc dễ gây cảm giác khó
                // chịu (bị hất lên/ấn xuống đất) và phức tạp hóa tương tác với gravity/grounded — giữ
                // recoil thuần ngang cho cảm giác nhất quán, dễ đoán.
                if (player.recoilTimer > 0 && player.recoilRemainingDist > 0) {
                    const recoilStep = Math.min(player.recoilRemainingDist, (player.recoilRemainingDist / player.recoilTimer) * dt);
                    player.velocity.x += player.recoilDir.x * (recoilStep / dt);
                    player.velocity.z += player.recoilDir.z * (recoilStep / dt);
                    player.recoilRemainingDist -= recoilStep;
                    player.recoilTimer -= dt;
                    if (player.recoilTimer <= 0 || player.recoilRemainingDist <= 0.001) {
                        player.recoilTimer = 0;
                        player.recoilRemainingDist = 0;
                    }
                } else {
                    player.recoilTimer = 0;
                    player.recoilRemainingDist = 0;
                }

                // Nhảy (Jump)
                if (player.jumpRequested) {
                    if (player.isSwimming) {
                        // Chặn nhảy từ trong nước
                    } else if (player.isClimbing) {
                        // STAMINA JUMP COST: Tiêu hao 22 thể lực khi nhảy leo núi
                        if (player.stamina >= 22.0) {
                            player.climbJumpTimer = 0.25; 
                            player.stamina = Math.max(0, player.stamina - 22.0);
                            playtestMetrics.jumps++;
                        } else {
                            sfx.playBlockedSound();
                        }
                    } else if (player.isGrounded) {
                        player.velocity.y = player.jumpForce; 
                        player.isGrounded = false; 
                        playtestMetrics.jumps++; 

                        if (player.isDashing) {
                            player.isDashing = false;
                            player.dashCooldownTimer = player.dashCooldown;
                            player.inputVelocity.copy(player.dashDirection).multiplyScalar(player.sprintSpeed);
                        }
                    }
                    player.jumpRequested = false; 
                }

                // --- FALL DAMAGE: theo dõi đỉnh cao nhất của chu kỳ rơi hiện tại ---
                // Khi đang đứng trên đất: reset điểm bắt đầu theo dõi (chưa rơi).
                // Khi đang ở trên không: cập nhật lên giá trị Y cao nhất đã đạt được.
                // Nhờ dựa vào "đỉnh cao nhất" thay vì Y lúc rời đất, các trường hợp bật nhảy
                // liên tiếp trên không (VD nhảy leo tường) vẫn được tính đúng độ cao rơi thực tế.
                if (player.isGrounded) {
                    player.fallStartY = player.position.y;
                } else if (!Number.isNaN(player.fallStartY)) {
                    player.fallStartY = Math.max(player.fallStartY, player.position.y);
                } else {
                    player.fallStartY = player.position.y;
                }

                // Cập nhật vị trí Y và Va chạm mặt đất / vật cản
                player.position.y += player.velocity.y * dt;
                let currentAABB = getPlayerAABBAt(player.position);
                let groundedNow = false;

                const terrainFloorY = getTerrainHeight(player.position.x, player.position.z);

                // --- GIỚI HẠN VÙNG DI CHUYỂN: RƠI KHỎI PLANE/WATER (VOID) ---
                // terrainFloorY chạm mức VOID_DEPTH_Y nghĩa là X/Z hiện tại nằm ngoài plane hợp lệ.
                // Loại trừ trường hợp đang ở trong một water area (Trigger Volume riêng, có thể nằm
                // ngoài phạm vi plane một cách hợp lệ, ví dụ Water Test Zone) để không phá vỡ bơi lội.
                const isVoidFloor = terrainFloorY <= (window.VOID_DEPTH_Y ?? -100.0);
                if (isVoidFloor && !inWaterNow && player.position.y <= playerHalfH + terrainFloorY) {
                    player.position.copy(PLAYER_SPAWN_POSITION);
                    player.velocity.set(0, 0, 0);
                    player.fallStartY = player.position.y; // Tránh fall damage giả sau teleport
                    player.wasGrounded = true;
                    currentAABB = getPlayerAABBAt(player.position);
                } else if (player.position.y <= playerHalfH + terrainFloorY) {
                    player.position.y = playerHalfH + terrainFloorY; 
                    player.velocity.y = 0; 
                    groundedNow = true; 
                    currentAABB = getPlayerAABBAt(player.position);
                }

                for (let i = 0; i < obstacles.length; i++) {
                    const block = obstacles[i];
                    if (intersectAABB(currentAABB, block.aabb)) {
                        const prevBottom = (player.position.y - playerHalfH) - player.velocity.y * dt;
                        if (player.velocity.y <= 0) {
                            if (prevBottom >= block.aabb.maxY - 0.25) {
                                player.position.y = block.aabb.maxY + playerHalfH; 
                                player.velocity.y = 0; 
                                groundedNow = true; 
                                currentAABB = getPlayerAABBAt(player.position);
                            }
                        } else if (player.velocity.y > 0) {
                            const prevTop = player.position.y - player.velocity.y * dt + playerHalfH;
                            if (prevTop <= block.aabb.minY + 0.15) {
                                player.position.y = block.aabb.minY - playerHalfH - eps; 
                                player.velocity.y = 0; 
                                currentAABB = getPlayerAABBAt(player.position);
                            }
                        }
                    }
                }

                if (groundedNow) {
                    player.coyoteTimer = 0.08; 
                } else if (player.coyoteTimer > 0) {
                    player.coyoteTimer -= dt;
                    if (player.coyoteTimer < 0) player.coyoteTimer = 0;
                }
                player.isGrounded = groundedNow || player.coyoteTimer > 0;

                // Lưu lại trước khi triggerPlungeImpact() có thể set isPlunging = false bên dưới —
                // Fall Damage cần biết cú tiếp đất này có phải do Plunge Attack chủ động hay không.
                const wasPlungingBeforeLanding = player.isPlunging;

                if (groundedNow) {
                    if (player.isClimbing && player.velocity.y <= 0) player.isClimbing = false;
                    if (player.isGliding) deactivateGlider();
                    if (player.isPlunging) triggerPlungeImpact();
                    if (player.velocity.y < 0) player.velocity.y = 0;
                    currentAABB = getPlayerAABBAt(player.position);
                }

                player.position.x += player.velocity.x * dt;
                currentAABB = getPlayerAABBAt(player.position);
                const playerBottom = player.position.y - playerHalfH;

                // --- CHỈ XỬ LÝ COLLISION KHI KHÔNG CLIMBING ---
                if (!player.isClimbing) {
                    for (let i = 0; i < obstacles.length; i++) {
                        const block = obstacles[i];
                        if (intersectAABB(currentAABB, block.aabb)) {
                            const stepDiff = block.aabb.maxY - playerBottom;
                            if (stepDiff > 0.15) {
                                if (player.velocity.x > 0) player.position.x = block.aabb.minX - playerHalfW - eps;
                                else if (player.velocity.x < 0) player.position.x = block.aabb.maxX + playerHalfW + eps;
                                player.velocity.x = 0; 
                                if (player.isDashing) player.isDashing = false; 
                                currentAABB = getPlayerAABBAt(player.position);
                            }
                        }
                    }
                }

                player.position.z += player.velocity.z * dt;
                currentAABB = getPlayerAABBAt(player.position);
                const playerBottomZ = player.position.y - playerHalfH; 

                // --- CHỈ XỬ LÝ COLLISION KHI KHÔNG CLIMBING ---
                if (!player.isClimbing) {
                    for (let i = 0; i < obstacles.length; i++) {
                        const block = obstacles[i];
                        if (intersectAABB(currentAABB, block.aabb)) {
                            const stepDiffZ = block.aabb.maxY - playerBottomZ; 
                            if (stepDiffZ > 0.15) {
                                if (player.velocity.z > 0) player.position.z = block.aabb.minZ - playerHalfD - eps;
                                else if (player.velocity.z < 0) player.position.z = block.aabb.maxZ + playerHalfD + eps;
                                player.velocity.z = 0; 
                                if (player.isDashing) player.isDashing = false; 
                                currentAABB = getPlayerAABBAt(player.position);
                            }
                        }
                    }
                }

                // --- SNAP-TO-TERRAIN SAU KHI DI CHUYỂN NGANG (v0.3 Frontier) ---
                // Terrain giờ có đồi/dốc thật (không còn phẳng tuyệt đối như trước v0.3) — cao độ Y
                // được tính ở ĐẦU frame (dòng trên) dựa trên vị trí X/Z TRƯỚC khi player di chuyển
                // ngang. Nếu không snap lại, khi chạy ngang qua sườn dốc, Y bị "trễ" 1 frame so với
                // terrain thực tế tại vị trí MỚI — trên dốc đủ dốc/tốc độ đủ nhanh, điều này khiến
                // player "bay" lơ lửng phía trên mặt đất trong chốc lát (terrain tụt xuống nhanh hơn Y
                // rơi tự nhiên) hoặc bị lún xuống dưới mặt đất (terrain nhô lên nhanh hơn). CHỈ áp dụng
                // khi đang isGrounded (không đụng tới nhảy/rơi tự do/plunge/climbing/swimming — những
                // state đó có logic Y riêng, không nên bị ghi đè ở đây).
                if (player.isGrounded && !player.isClimbing && !player.isSwimming && !player.isPlunging && player.velocity.y <= 0) {
                    const terrainAtNewPos = getTerrainHeight(player.position.x, player.position.z);
                    // Bỏ qua nếu vị trí mới rơi vào Void (ngoài plane hợp lệ) — nhánh Void ở đầu frame
                    // (dựa trên vị trí CŨ) sẽ xử lý teleport về spawn ở frame kế tiếp như bình thường,
                    // không cần snap vào giá trị -100 ở đây.
                    if (terrainAtNewPos > (window.VOID_DEPTH_Y ?? -100.0)) {
                        // Chỉ snap nếu KHÔNG đang đứng trên 1 obstacle (box) cao hơn terrain tại đó —
                        // so sánh với floorY hiện tại (đã được set đúng bởi vòng lặp obstacle phía trên
                        // nếu player đang đứng trên box) để tránh việc snap kéo player tụt khỏi bề mặt
                        // box xuống lại mặt đất bên dưới.
                        const currentFloorY = player.position.y - playerHalfH;
                        const standingOnObstacle = currentFloorY > terrainAtNewPos + 0.05;
                        if (!standingOnObstacle) {
                            player.position.y = terrainAtNewPos + playerHalfH;
                            currentAABB = getPlayerAABBAt(player.position);
                        }
                    }
                }

                // Sát ranh giới bám tường mượt mà hơn khi đang di chuyển ngang tự do
                if (player.isClimbing) {
                    player.position.addScaledVector(player.climbNormal, -0.15); 
                }

                if (!player.wasGrounded && groundedNow && player.velocity.y >= -2.0) {
                    // Soft landing
                } else if (!player.wasGrounded && groundedNow) {
                    const impactSpeed = Math.abs(player.velocity.y);
                    const squashAmt = Math.min(impactSpeed / 20, 0.38);
                    player.mesh.scale.set(1.0 + squashAmt, 1.0 - squashAmt * 0.85, 1.0 + squashAmt);
                    player.landSquashTimer = 0.15;
                }

                // --- FALL DAMAGE: chỉ tính khi VỪA tiếp đất sau một chu kỳ trên không ---
                // Loại trừ Plunge Attack: đó là hành động chủ động của người chơi, không phải ngã.
                // Đi xuống dốc/bậc thang không kích hoạt được nhánh này vì isGrounded luôn true
                // liên tục trong lúc đó, nên fallStartY được reset mỗi frame và fallHeight ~ 0.
                if (!player.wasGrounded && groundedNow && !wasPlungingBeforeLanding) {
                    const fallHeight = player.fallStartY - player.position.y;
                    applyFallDamage(fallHeight);
                }
                player.wasGrounded = groundedNow;

                if (!player.isDashing && !player.isPlunging && !player.isClimbing) {
                    const scaleRecovery = 1 - Math.exp(-18 * dt);
                    player.mesh.scale.x += (1.0 - player.mesh.scale.x) * scaleRecovery;
                    player.mesh.scale.y += (1.0 - player.mesh.scale.y) * scaleRecovery;
                    player.mesh.scale.z += (1.0 - player.mesh.scale.z) * scaleRecovery;
                }

                player.mesh.position.copy(player.position);

                resolveDynamicCollisions();
                resolveStaticCollisions(player, player.width, player.height, player.depth, dt);
                enemies.forEach(enemy => { if (enemy.alive) resolveStaticCollisions(enemy, enemy.width, enemy.height, enemy.depth, dt); });

                const wallDetection = detectClimbableWall();
                
                if (player.isClimbing) {
                    if (!wallDetection.normal) {
                        player.isClimbing = false;
                        if (player.velocity.y > 0) {
                            player.velocity.y = 5.0;
                            player.velocity.addScaledVector(player.climbNormal, -3.5); 
                        }
                    } else {
                        player.climbNormal.copy(wallDetection.normal);
                    }
                } else {
                    if (wallDetection.normal) {
                        const movingIntoWall = player.inputVelocity.dot(wallDetection.normal) < -0.1 ||
                                               player.velocity.dot(wallDetection.normal) < -0.1;
                        
                        if (!player.isGrounded && !player.isPlunging && movingIntoWall) {
                            startClimbing(wallDetection.normal);
                            if (player.isSwimming) { 
                                player.isSwimming = false; 
                                player.sword.visible = true; 
                            } // Chuyển từ bơi sang leo tường liền mạch
                        } else if (player.isGrounded && movingIntoWall && (keys.w || (joystickActive && joystickDelta.y < -0.5))) {
                            startClimbing(wallDetection.normal);
                        }
                    }
                }

                enemies.forEach(enemy => {
                    if (!enemy.alive || enemy.isSlime) return; // Slime dùng cơ chế attack telegraph riêng (xem Slime.update)
                    if (player.position.distanceTo(enemy.position) < ((player.width + enemy.width) * 0.45) && player.invulnTimer <= 0) {
                        const dmg = enemy.attackDamage || 10;
                        player.hp = Math.max(0, player.hp - dmg); player.invulnTimer = 0.8; 
                        triggerDamageFlash(); sfx.playHit();
                        cameraState.shakeTimer = 0.25; cameraState.shakeIntensity = 0.35;
                        const pushDir = new THREE.Vector3().subVectors(player.position, enemy.position); pushDir.y = 0;
                        player.velocity.add(pushDir.normalize().multiplyScalar(5.0));
                        if (player.hp <= 0) enterDeadState('combat');
                    }
                });

                const distanceMoved = player.position.distanceTo(playtestMetrics.lastPosition);
                if (distanceMoved > 0.001 && distanceMoved < 10) playtestMetrics.totalDistance += distanceMoved;
                playtestMetrics.lastPosition.copy(player.position);

                // --- HỆ THỐNG PROCEDURAL ANIMATION TÁCH BIỆT (XOAY VÀ LẮC CƠ THỂ) ---

                // --- SOFT TARGETING: override tạm thời rotation.y trong lúc windup của đòn đánh,
                // KHÔNG khóa mục tiêu liên tục (chỉ set 1 lần lúc bắt đầu đòn, tự tắt khi xong).
                // Không đụng inputVelocity/camera — sau khi softTargetLockY về null, quyền điều khiển
                // hướng quay trả lại hoàn toàn cho logic di chuyển/camera bên dưới như bình thường.
                let softTargetingActiveThisFrame = false;
                if (player.softTargetLockY !== null) {
                    softTargetingActiveThisFrame = true;
                    let angleDiff = player.softTargetLockY - player.mesh.rotation.y;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    player.mesh.rotation.y += angleDiff * (1 - Math.exp(-player.softTargetLerpSpeed * dt));

                    // Tắt hỗ trợ khi: đã xoay đủ gần góc đích, HOẶC đòn đánh không còn ở windup/plunge nữa
                    // (bước sang active/recovery/idle) — đảm bảo hướng đã ổn định trước lúc hitbox kiểm tra
                    // trúng đòn, và không xoay kéo dài suốt cả animation kiểu Hard Lock-On.
                    const stillWindingUp = (player.attackState === 'windup') || player.isPlunging;
                    if (Math.abs(angleDiff) < 0.01 || !stillWindingUp) {
                        player.softTargetLockY = null;
                    }
                }

                if (player.isSwimming) {
                    const targetAngle = Math.atan2(player.inputVelocity.x, player.inputVelocity.z);
                    if (player.swimState !== 'idle' && player.inputVelocity.lengthSq() > 0.1) {
                        let angleDiff = targetAngle - player.mesh.rotation.y;
                        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                        player.mesh.rotation.y += angleDiff * (1 - Math.exp(-12 * dt)); // Xoay mượt khi bơi
                    }

                    let targetTiltX = 0;
                    let targetTiltZ = 0;

                    if (player.swimState === 'fast') {
                        targetTiltX = 0.65; // Đổ người về trước nhiều hơn để bơi sải
                        targetTiltZ = Math.sin(player.swimOscillationTimer * 12.0) * 0.35; // Lắc vai liên tục (Freestyle roll)
                    } else if (player.swimState === 'slow') {
                        targetTiltX = 0.35 + Math.sin(player.swimOscillationTimer * 5.0) * 0.08; // Cúi nhẹ & nhấp nhô theo nhịp (Breaststroke bob)
                        targetTiltZ = 0; // Trục trái phải ổn định
                    } else {
                        targetTiltX = 0.05; // Đứng thẳng
                        targetTiltZ = Math.sin(player.swimOscillationTimer * 2.0) * 0.03; // Lắc lư cực nhẹ (Treading sway)
                    }

                    player.mesh.children[0].rotation.x += (targetTiltX - player.mesh.children[0].rotation.x) * (1 - Math.exp(-8 * dt));
                    player.mesh.children[1].rotation.x += (targetTiltX - player.mesh.children[1].rotation.x) * (1 - Math.exp(-8 * dt));
                    player.mesh.children[0].rotation.z += (targetTiltZ - player.mesh.children[0].rotation.z) * (1 - Math.exp(-12 * dt));
                    player.mesh.children[1].rotation.z += (targetTiltZ - player.mesh.children[1].rotation.z) * (1 - Math.exp(-12 * dt));
                    
                    player.sword.visible = false; // Giấu kiếm khi đang bơi
                } 
                else if (player.isClimbing) {
                    const targetAngle = Math.atan2(-player.climbNormal.x, -player.climbNormal.z);
                    let angleDiff = targetAngle - player.mesh.rotation.y;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    player.mesh.rotation.y += angleDiff * (1 - Math.exp(-20 * dt));

                    player.mesh.children[0].rotation.x = -0.1; 
                    player.mesh.children[1].rotation.x = -0.1; 
                    if (player.gliderGroup) player.gliderGroup.rotation.x = -0.1;

                    if (player.attackState === 'idle') {
                        player.sword.rotation.set(-Math.PI / 2, 0, Math.PI / 10);
                    }
                    player.sword.visible = true;
                } else if (!softTargetingActiveThisFrame && player.inputVelocity.lengthSq() > 0.01 && !player.isDashing && !player.isPlunging) {
                    const targetAngle = Math.atan2(player.inputVelocity.x, player.inputVelocity.z);
                    let angleDiff = targetAngle - player.mesh.rotation.y;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    player.mesh.rotation.y += angleDiff * (1 - Math.exp(-14 * dt));

                    const targetTiltX = Math.min(player.inputVelocity.length() * 0.012, 0.18);
                    player.mesh.children[0].rotation.x += (targetTiltX - player.mesh.children[0].rotation.x) * (1 - Math.exp(-12 * dt)); 
                    player.mesh.children[1].rotation.x += (targetTiltX - player.mesh.children[1].rotation.x) * (1 - Math.exp(-12 * dt)); 
                    
                    // Phục hồi lại trục nghiêng thân (nếu trước đó đã nghiêng ngả do bơi lội)
                    player.mesh.children[0].rotation.z += (0 - player.mesh.children[0].rotation.z) * (1 - Math.exp(-12 * dt));
                    player.mesh.children[1].rotation.z += (0 - player.mesh.children[1].rotation.z) * (1 - Math.exp(-12 * dt));

                    if (player.attackState === 'idle') {
                        player.sword.rotation.set((-Math.PI / 3) + player.mesh.children[0].rotation.x, 0, Math.PI / 10);
                    }
                    player.sword.visible = true;
                } else if (!player.isPlunging) {
                    player.mesh.children[0].rotation.x += (0 - player.mesh.children[0].rotation.x) * (1 - Math.exp(-15 * dt));
                    player.mesh.children[1].rotation.x += (0 - player.mesh.children[1].rotation.x) * (1 - Math.exp(-15 * dt));
                    
                    player.mesh.children[0].rotation.z += (0 - player.mesh.children[0].rotation.z) * (1 - Math.exp(-15 * dt));
                    player.mesh.children[1].rotation.z += (0 - player.mesh.children[1].rotation.z) * (1 - Math.exp(-15 * dt));

                    if (player.attackState === 'idle') {
                        player.sword.rotation.set((-Math.PI / 3) + player.mesh.children[0].rotation.x, 0, Math.PI / 10);
                    }
                    player.sword.visible = true;
                }

                // --- CẬP NHẬT VẬT THỂ TƯƠNG TÁC GẦN NHẤT ---
                for (let i = 0; i < interactables.length; i++) {
                    if (typeof interactables[i].update === 'function') interactables[i].update(dt);
                }
                let closestInteractable = null;
                let closestDistSq = Infinity;
                for (let i = 0; i < interactables.length; i++) {
                    const obj = interactables[i];
                    const distSq = obj.distanceSqTo(player.position);
                    const radiusSq = obj.interactionRadius * obj.interactionRadius;
                    if (distSq <= radiusSq && distSq < closestDistSq) {
                        closestDistSq = distSq;
                        closestInteractable = obj;
                    }
                }
                window.nearbyInteractable = closestInteractable;
                // Gọi mỗi frame khi có vật trong tầm (không chỉ lúc đổi object) để prompt text
                // luôn phản ánh đúng trạng thái hiện tại (VD: quest vừa hoàn thành lúc đang đứng gần).
                if (window.updateInteractPrompt) window.updateInteractPrompt(closestInteractable);

                syncHUDVariables();
            }

            function updateCombat(dt) {
                updateSkillAim(dt);

                const combatStateTag = document.getElementById('combat-state-tag');
                if (player.isPlunging) {
                    if (combatStateTag) {
                        combatStateTag.textContent = 'PLUNGE';
                        combatStateTag.className = 'text-right text-red-500 font-bold animate-pulse';
                    }
                    return;
                }

                if (player.attackState === 'idle') {
                    player.sword.material.emissive.setHex(0x000000); 
                    return; 
                }

                player.attackTimer -= dt;

                if (player.attackState === 'windup') {
                    if (player.attackTimer <= 0) {
                        player.attackState = 'active'; 
                        player.attackTimer = COMBAT_TIMING.active;
                        
                        if (combatStateTag) { combatStateTag.textContent = 'ACTIVE'; combatStateTag.className = 'text-right text-amber-400 font-bold animate-pulse'; }
                        
                        player.mesh.scale.set(0.82, 1.18, 0.82);

                        if (player.isGrounded) {
                            // --- ATTACK LUNGE: tính lại mục tiêu ngay tại thời điểm active bắt đầu (dùng
                            // vị trí/khoảng cách mới nhất, sau khi soft targeting đã xoay xong trong lúc
                            // windup) — không phải Dash, không lao thẳng tới địch. Quãng đường di chuyển
                            // được trải đều qua ATTACK_LUNGE_CONFIG.duration trong updatePhysics(), có
                            // collision-check đầy đủ như di chuyển thường, không cộng thẳng vào velocity
                            // (velocity bị input-movement ghi đè lại mỗi frame nên lunge kiểu cũ mất tác dụng).
                            const lungeTarget = findSoftTargetingRotation(player.position, player.mesh.rotation.y);
                            const lungeDistance = calculateLungeDistance(lungeTarget ? lungeTarget.distance : null);

                            player.lungeDir.set(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)).normalize();
                            player.lungeRemainingDist = lungeDistance;
                            player.lungeTimer = ATTACK_LUNGE_CONFIG.duration;
                        }

                        player.sword.material.emissive.setHex(0x94a3b8);
                        player.slashWave.visible = true;
                        player.slashWave.scale.setScalar(COMBAT_FEEL_CONFIG.slashEffect.startScale);
                        player.slashWave.material.opacity = COMBAT_FEEL_CONFIG.slashEffect.startOpacity;
                        
                        player.slashWave.rotation.set(Math.PI / 2 - 0.3, -0.3, Math.PI / 6); 
                        
                        player.sword.rotation.set(-Math.PI / 2.2, -Math.PI / 6, Math.PI / 6); 
                    }
                } 
                else if (player.attackState === 'active') {
                    const prog = (COMBAT_TIMING.active - player.attackTimer) / COMBAT_TIMING.active;
                    const se = COMBAT_FEEL_CONFIG.slashEffect;
                    const slashScale = se.startScale + (se.endScale - se.startScale) * prog;
                    player.slashWave.scale.setScalar(slashScale);
                    player.slashWave.material.opacity = se.startOpacity + (se.endOpacity - se.startOpacity) * prog;
                    
                    const startX = -Math.PI / 2.2, startY = -Math.PI / 6, startZ = Math.PI / 6;
                    const endX = Math.PI / 3.5, endY = Math.PI / 2, endZ = -Math.PI / 6;
                    player.sword.rotation.x = startX + (endX - startX) * prog;
                    player.sword.rotation.y = startY + (endY - startY) * prog;
                    player.sword.rotation.z = startZ + (endZ - startZ) * prog;

                    const forward = new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)).normalize();

                    enemies.forEach(enemy => {
                        if (!enemy.alive || player.hasHitList.includes(enemy.id)) return; 

                        const toEnemy = new THREE.Vector3().subVectors(enemy.position, player.position);
                        const combatRange = enemy.isLarge ? 4.2 : 2.8; 
                        
                        if (toEnemy.length() < combatRange) { 
                            toEnemy.normalize();
                            if (forward.dot(toEnemy) > 0.45) { 
                                enemy.takeDamage(player.attack.melee, forward);
                                player.hasHitList.push(enemy.id); 

                                hitstopTimer = COMBAT_FEEL_CONFIG.hitStopDuration;
                                sfx.playHit();
                                cameraState.shakeTimer = COMBAT_FEEL_CONFIG.cameraShake.duration;
                                cameraState.shakeIntensity = COMBAT_FEEL_CONFIG.cameraShake.intensity;

                                const hitPoint = enemy.position.clone().addScaledVector(toEnemy, -0.4);
                                spawnCombatSparks(hitPoint, toEnemy);

                                if (!enemy.alive) spawnDeathParticles(enemy.position);
                            }
                        }
                    });

                    if (player.attackTimer <= 0) {
                        player.attackState = 'recovery'; player.attackTimer = COMBAT_TIMING.recovery;
                        if (combatStateTag) { combatStateTag.textContent = 'RECOVERY'; combatStateTag.className = 'text-right text-sky-500 font-bold'; }
                        player.slashWave.visible = false;
                        player.sword.material.emissive.setHex(0x000000);
                    }
                } 
                else if (player.attackState === 'recovery') {
                    const prog = (COMBAT_TIMING.recovery - player.attackTimer) / COMBAT_TIMING.recovery;
                    
                    const endActiveX = Math.PI / 3.5, endActiveY = Math.PI / 2, endActiveZ = -Math.PI / 6;
                    const idleX = (-Math.PI / 3) + player.mesh.children[0].rotation.x, idleY = 0, idleZ = Math.PI / 10;
                    
                    player.sword.rotation.x = endActiveX + (idleX - endActiveX) * prog;
                    player.sword.rotation.y = endActiveY + (idleY - endActiveY) * prog;
                    player.sword.rotation.z = endActiveZ + (idleZ - endActiveZ) * prog;

                    if (player.attackTimer <= 0) {
                        player.attackState = 'idle';
                        if (combatStateTag) { combatStateTag.textContent = 'IDLE'; combatStateTag.className = 'text-right text-slate-500 font-bold'; }
                        player.sword.rotation.set((-Math.PI / 3) + player.mesh.children[0].rotation.x, 0, Math.PI / 10);
                        if (player.attackBuffered) { player.attackBuffered = false; handleAttackInput(); }
                    }
                }
            }

            function updateProjectiles(dt) {
                for (let i = activeProjectiles.length - 1; i >= 0; i--) {
                    const proj = activeProjectiles[i];
                    proj.mesh.position.addScaledVector(proj.dir, proj.speed * dt);
                    proj.distanceTraveled += proj.speed * dt;
                    
                    if (proj.type === 'hydro_small') {
                        proj.mesh.rotation.y += dt * 12.0;
                        proj.mesh.rotation.x += dt * 7.0;
                        if (Math.random() < ELEMENTAL_SKILL_CONFIG.smallShot.trailChance) {
                            spawnHydroTrail(proj.mesh.position);
                        }
                    } else {
                        proj.mesh.rotation.y += dt * 10.0;
                        if (Math.random() < 0.3) {
                            spawnRunTrail(proj.mesh.position, proj.dir);
                        }
                    }

                    let hitSucceeded = false;
                    const pAABB = new AABB();
                    let projWidth = 0.4;
                    pAABB.updateFromObject(proj.mesh, projWidth, projWidth, projWidth);

                    for (let j = 0; j < enemies.length; j++) {
                        const enemy = enemies[j];
                        if (enemy.alive && intersectAABB(pAABB, enemy.aabb)) {
                            const isHydroProj = proj.type === 'hydro_small';
                            enemy.takeDamage(proj.damage, proj.dir, isHydroProj);

                            if (isHydroProj) {
                                spawnHydroSplash(proj.mesh.position, proj.dir, false);
                                triggerHydroFlash();
                                sfx.playHydroSplash();
                                if (enemy.bodyMesh) {
                                    enemy.mesh.scale.set(1.28, 0.72, 1.28);
                                    enemy.hydroSquashTimer = 0.12;
                                }
                            } else {
                                spawnCombatSparks(proj.mesh.position, proj.dir);
                                sfx.playHit();
                            }
                            
                            player.skillHitCount++;
                            if (player.skillHitCount >= 3) {
                                player.skillHitCount = 0;
                                spawnEnergyParticles(enemy.position);
                            }
                            
                            if (!enemy.alive) spawnDeathParticles(enemy.position);
                            hitSucceeded = true;
                            break;
                        }
                    }

                    if (!hitSucceeded) {
                        for (let k = 0; k < obstacles.length; k++) {
                            const block = obstacles[k];
                            if (intersectAABB(pAABB, block.aabb)) {
                                if (proj.type === 'hydro_small') {
                                    spawnHydroSplash(proj.mesh.position, proj.dir, false);
                                    sfx.playHydroSplash();
                                } else {
                                    spawnCombatSparks(proj.mesh.position, proj.dir);
                                    sfx.playHit();
                                }
                                hitSucceeded = true;
                                break;
                            }
                        }
                    }

                    if (proj.distanceTraveled >= proj.maxRange || hitSucceeded) {
                        if (!hitSucceeded && proj.type === 'hydro_small') {
                            spawnHydroSplash(proj.mesh.position, proj.dir, false);
                        }
                        scene.remove(proj.mesh);
                        if (proj.mesh.isGroup) {
                            proj.mesh.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); });
                        } else {
                            proj.mesh.geometry.dispose();
                            proj.mesh.material.dispose();
                        }
                        activeProjectiles.splice(i, 1);
                    }
                }
            }

            // Cập nhật hiệu ứng hình ảnh Pressure Shot (instant beam) — chỉ fade opacity theo thời gian
            // rồi tự hủy, KHÔNG di chuyển, không va chạm (damage đã được tính ngay lúc bắn trong fireHydroBeam).
            function updateHydroBeamVisuals(dt) {
                for (let i = activeHydroBeamVisuals.length - 1; i >= 0; i--) {
                    const visual = activeHydroBeamVisuals[i];
                    visual.timer -= dt;
                    const t = Math.max(0, visual.timer / visual.maxTimer);
                    visual.mesh.material.opacity = 0.85 * t;

                    if (visual.timer <= 0) {
                        scene.remove(visual.mesh);
                        visual.mesh.geometry.dispose();
                        visual.mesh.material.dispose();
                        activeHydroBeamVisuals.splice(i, 1);
                    }
                }
            }

            function updateCamera(dt) {
                const targetX = player.position.x;
                const targetY = player.position.y + cameraState.targetYOffset;
                const targetZ = player.position.z;
                cameraState.targetFocus.set(targetX, targetY, targetZ);

                // --- SKILL AIM STATE: offset camera lệch sang phải (world-space, theo trục "right" của
                // chính camera tại theta hiện tại) để nhân vật hiển thị lệch TRÁI màn hình, tạo khoảng
                // trống quan sát phía trước — giống chế độ ngắm cung trong Genshin Impact. cameraOffsetT
                // (0..1) được lerp mượt trong updateSkillAim(), không snap cứng.
                if (skillAimState.cameraOffsetT > 0) {
                    const rightX = Math.cos(cameraState.currentTheta);
                    const rightZ = -Math.sin(cameraState.currentTheta);
                    const offsetAmount = ELEMENTAL_SKILL_CONFIG.aim.cameraSideOffset * skillAimState.cameraOffsetT;
                    cameraState.targetFocus.x += rightX * offsetAmount;
                    cameraState.targetFocus.z += rightZ * offsetAmount;
                }

                const followLerpFactor = 1 - Math.exp(-cameraState.followDamping * dt);
                const rotationLerpFactor = 1 - Math.exp(-cameraState.rotationDamping * dt);
                const zoomLerpFactor = 1 - Math.exp(-cameraState.zoomDamping * dt);

                cameraState.currentFocus.lerp(cameraState.targetFocus, followLerpFactor);

                cameraState.currentTheta += (cameraState.targetTheta - cameraState.currentTheta) * rotationLerpFactor;
                cameraState.currentPhi += (cameraState.targetPhi - cameraState.currentPhi) * rotationLerpFactor;

                // Zoom gần hơn khi đang Skill Aim State — nội suy giữa targetDistance bình thường và
                // aim.cameraZoomDistance theo cameraOffsetT, để zoom in/out mượt cùng nhịp với offset lệch.
                // (Burst không còn Aim Mode nên không còn tham gia vào phép tính này.)
                const activeAimOffsetT = skillAimState.cameraOffsetT;
                const activeAimZoomDistance = ELEMENTAL_SKILL_CONFIG.aim.cameraZoomDistance;
                const desiredDistance = activeAimOffsetT > 0
                    ? cameraState.targetDistance + (activeAimZoomDistance - cameraState.targetDistance) * activeAimOffsetT
                    : cameraState.targetDistance;
                cameraState.distance += (desiredDistance - cameraState.distance) * zoomLerpFactor;

                const horizontalDistance = cameraState.distance * Math.cos(cameraState.currentPhi);
                
                const baseCamPos = new THREE.Vector3(
                    cameraState.currentFocus.x + horizontalDistance * Math.sin(cameraState.currentTheta),
                    cameraState.currentFocus.y + cameraState.distance * Math.sin(cameraState.currentPhi),
                    cameraState.currentFocus.z + horizontalDistance * Math.cos(cameraState.currentTheta)
                );

                if (cameraState.shakeTimer > 0) {
                    const intensity = cameraState.shakeTimer * cameraState.shakeIntensity;
                    cameraState.shakeOffset.set(
                        (Math.random() - 0.5) * intensity,
                        (Math.random() - 0.5) * intensity,
                        (Math.random() - 0.5) * intensity
                    );
                } else {
                    cameraState.shakeOffset.set(0, 0, 0);
                }

                camera.position.copy(baseCamPos).add(cameraState.shakeOffset);
                camera.lookAt(cameraState.currentFocus);

                let targetFov = 60;
                if (player.isDashing) {
                    targetFov = 72; 
                } else if (player.isGliding) {
                    targetFov = 74; 
                } else if (player.isSprinting) {
                    targetFov = 68;   
                } else if (player.walkMode) {
                    targetFov = 56;   
                } else if (player.velocity.length() > 6) {
                    targetFov = 63; 
                }
                
                if (player.attackState === 'active') {
                    targetFov -= 4;
                }

                if (hitstopTimer > 0) {
                    targetFov -= 3;
                }

                // Skill Aim State: FOV hẹp hơn nhẹ (giống ống ngắm) — áp dụng SAU cùng, đè lên mọi state
                // FOV khác, vì đang aim thì player.isGrounded/không dashing/gliding nên các nhánh trên
                // hiếm khi xung đột, nhưng vẫn ưu tiên tuyệt đối để đảm bảo cảm giác ngắm nhất quán.
                if (skillAimState.cameraOffsetT > 0) {
                    targetFov -= 6 * skillAimState.cameraOffsetT;
                }

                camera.fov += (targetFov - camera.fov) * 8 * dt;
                camera.updateProjectionMatrix();

                if (camera.position.y < 0) {
                    groundMat.transparent = true;
                    groundMat.opacity = 0.35; 
                } else {
                    groundMat.transparent = false;
                    groundMat.opacity = 1.0;  
                }
            }

            function animate() {
                requestAnimationFrame(animate);

                let dt = clock.getDelta();

                if (!window.isGamePaused && !window.isDialogueOpen) {
                    if (hitstopTimer > 0) {
                        hitstopTimer -= dt;
                        dt = 0; 
                    }

                    if (cameraState.shakeTimer > 0) {
                        cameraState.shakeTimer -= (dt === 0 ? clock.getDelta() : dt);
                    }

                    const actualDt = (dt === 0) ? clock.getDelta() : dt;

                    if (skillCooldownTimer > 0) {
                        skillCooldownTimer -= actualDt;
                        if (skillCooldownTimer < 0) skillCooldownTimer = 0;
                    }
                    updateSkillCooldown(actualDt);
                    updateBurstUI();

                    if (player.isGliding && player.gliderGroup) {
                        const flap = Math.sin(clock.getElapsedTime() * 7.5) * 0.08;
                        player.gliderGroup.children[0].rotation.z = flap;     
                        player.gliderGroup.children[1].rotation.z = -flap;    
                        
                        if (Math.random() < 0.35) {
                            spawnGliderTrailParticles();
                        }
                    }

                    if (dt > 0) {
                        updatePhysics(dt);
                        updateCombat(dt);
                        updateProjectiles(dt);
                        updateHydroBeamVisuals(dt);
                        updateBurst(dt);
                        updateEnergyParticles(dt);
                        updateCampRespawns(dt);

                        for (let i = enemies.length - 1; i >= 0; i--) {
                            const enemy = enemies[i];
                            enemy.update(dt);
                            
                            if (enemy.isSlime && !enemy.alive && enemy.respawnTimer <= 0) {
                                scene.remove(enemy.mesh);
                                if (enemy.bodyMesh) {
                                    enemy.bodyMesh.geometry.dispose();
                                    enemy.bodyMesh.material.dispose();
                                }
                                enemies.splice(i, 1);
                            }
                        }

                        // --- MUSIC: xác định in_combat dựa TRỰC TIẾP vào isEngagingPlayer của Slime —
                        // cờ này phản ánh đúng chính xác việc slime có đang thực sự nhắm vào player hay
                        // không (được set lại tại từng điểm chuyển trạng thái trong enemies.js), nên
                        // nhạc combat bật/tắt khớp 100% với việc slime "phát hiện" / "hết phát hiện"
                        // player — không tự suy luận lại bằng khoảng cách + field riêng ở đây nữa.
                        const inCombatNow = enemies.some(e => e.isSlime && e.alive && e.isEngagingPlayer);
                        if (window.music) window.music.update(dt, inCombatNow);

                        for (let i = ghostTrails.length - 1; i >= 0; i--) {
                            const trail = ghostTrails[i];
                            trail.life -= dt;
                            const progress = trail.life / trail.maxLife;

                            trail.mesh.children.forEach(mesh => {
                                mesh.material.opacity = 0.35 * progress;
                            });

                            if (trail.life <= 0) {
                                scene.remove(trail.mesh);
                                trail.mesh.children.forEach(child => {
                                    child.geometry.dispose();
                                    child.material.dispose();
                                });
                                ghostTrails.splice(i, 1);
                            }
                        }

                        for (let i = particles.length - 1; i >= 0; i--) {
                            const p = particles[i];
                            p.life -= dt;

                            if (p.scaleUp) {
                                const growth = p.growthRate * dt;
                                p.mesh.scale.x += growth;
                                p.mesh.scale.y += growth;
                                p.mesh.scale.z += growth;
                            }

                            if (p.gravity) {
                                p.velocity.y -= p.gravity * dt;
                            }

                            p.mesh.position.addScaledVector(p.velocity, dt);

                            if (p.scaleDown) {
                                p.mesh.scale.multiplyScalar(Math.max(0, 0.95 - (dt * 2)));
                            }

                            if (p.mesh.material && typeof p.mesh.material.opacity !== 'undefined') {
                                p.mesh.material.transparent = true;
                                p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
                            }

                            if (p.life <= 0) {
                                scene.remove(p.mesh);
                                p.mesh.geometry.dispose();
                                p.mesh.material.dispose();
                                particles.splice(i, 1);
                            }
                        }
                    }

                    updateCamera(actualDt);
                } else {
                    updateCamera(dt);
                }

                renderer.render(scene, camera);
            }
            window.animate = animate;
