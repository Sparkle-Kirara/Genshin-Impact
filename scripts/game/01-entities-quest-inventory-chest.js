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
                // BUGFIX (save/load quest hái lượm): khôi phục questSlots từ save data để instanceId
                // KHỚP LẠI đúng với activeQuests đã lưu — thay vì để constructor tự sinh instanceId mới
                // ngẫu nhiên (gốc gây bug: reload xong, quest gathering cũ trong activeQuests không còn
                // instance nào ở questSlots khớp instanceId, _findActiveEntry() trả undefined, UI hiểu
                // nhầm slot "chưa nhận" và cho nhận đè quest MỚI trong khi quest CŨ vẫn treo dở dang,
                // không bao giờ trả được nữa).
                // savedSlots: { combat: {defId, instanceId} | null, gathering: {defId, instanceId} | null }
                // — xem collectSaveData()/applySaveData() (06-camps-save-system.js). Chỉ khôi phục slot
                // nào TRÙNG defId với 1 quest definition còn tồn tại (đề phòng save cũ tham chiếu quest
                // đã bị xoá khỏi QUEST_DEFINITIONS ở bản cập nhật sau) — nếu không khớp, giữ nguyên slot
                // vừa sinh ngẫu nhiên từ constructor (coi như "cấp mới" cho slot đó, không lỗi cứng).
                restoreQuestSlots(savedSlots) {
                    if (!savedSlots) return;
                    ['combat', 'gathering'].forEach(slotKey => {
                        const saved = savedSlots[slotKey];
                        if (!saved || !saved.instanceId || !saved.defId) return;
                        const def = QUEST_DEFINITIONS.find(d => d.id === saved.defId);
                        if (!def) return;
                        // Gán LẠI instanceId đã lưu (không sinh mới) — mọi field khác lấy từ def hiện tại
                        // (đề phòng title/description/rewards đã đổi ở bản cập nhật, quest instance vẫn
                        // hiển thị nội dung MỚI NHẤT thay vì đóng băng nội dung cũ).
                        this.questSlots[slotKey] = Object.assign({}, def, { instanceId: saved.instanceId });
                    });
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
                    // Infrastructure Update #1 — Save System: lưu ngay khi NHẬN quest (không chỉ khi
                    // hoàn thành) — nếu không, người chơi nhận quest rồi reload trang trước khi hoàn
                    // thành sẽ mất luôn quest đó khỏi activeQuests.
                    if (window.requestSave) window.requestSave();
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
                    // Infrastructure Update #1 — Save System (mục 3: "Hoàn thành Quest") — hook TRỰC
                    // TIẾP ở đây, không chỉ dựa vào phản ứng dây chuyền từ reward handlers phía trên
                    // (1 quest có rewards: [] rỗng sẽ không kích hoạt requestSave() nào nếu không có
                    // dòng này, dù entry.status vừa đổi thành 'turned_in' — 1 thay đổi state cần lưu).
                    if (window.requestSave) window.requestSave();

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
                    // Infrastructure Update #1 — Save System (mục 3): "Nhặt vật phẩm" / "Inventory thay
                    // đổi" — đây là ĐIỂM TRUNG TÂM duy nhất mọi nguồn thêm item đều đi qua (WorldItem
                    // nhặt được, Chest reward material...), hook Ở ĐÂY thay vì ở từng nơi gọi addItem()
                    // để không bỏ sót nguồn item nào trong tương lai.
                    if (window.requestSave) window.requestSave();
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
                // --- PRIMOGEM (Infrastructure Update #1 — Save System) — CỘNG DỒN vào player.primogem
                // + hiện popup, cùng pattern với exp bên dưới (trước v-Save System chỉ hiện popup,
                // không có state để lưu — xem giải thích ở khai báo player.primogem).
                primogem: (amount) => {
                    player.primogem = (player.primogem || 0) + amount;
                    if (window.showRewardPopup) {
                        window.showRewardPopup('fa-solid fa-gem text-sky-300', `+${amount} Nguyên Thạch`);
                    }
                    if (window.requestSave) window.requestSave(); // Save System mục 3: "Nhận Nguyên Thạch"
                },
                // Cấp item vào Inventory — dùng cho Chest có reward dạng { type: 'material', itemId,
                // min, max }. Chưa CHEST_TYPES nào dùng loại này ở v0.6 (Inventory chỉ mới ra mắt),
                // nhưng handler đã sẵn sàng để thêm reward vật phẩm cho Chest trong tương lai mà không
                // cần sửa Chest.open()/_grantRewards(). (requestSave() không cần gọi thêm ở đây —
                // playerInventory.addItem() đã tự gọi.)
                material: (amount, reward) => {
                    if (!reward || !reward.itemId) {
                        console.warn('REWARD_HANDLERS.material: thiếu reward.itemId'); return;
                    }
                    window.playerInventory.addItem(reward.itemId, amount);
                },
                // --- EXP (v0.6 Wilderness, mục 8) — cộng dồn vào player.exp + hiện popup. Pre-Alpha
                // v0.8 (Character): sau khi cộng, gọi checkLevelUp() (định nghĩa ở file
                // 02-collision-and-stats-core.js, cùng LEVEL_CONFIG) để kiểm tra lên level ngay lập
                // tức — vẫn ĐÚNG 1 đường EXP duy nhất trong toàn bộ game, chỉ thêm bước kiểm tra ở
                // cuối, không phải sửa lại mọi nơi cấp EXP (Slime kill, Quest reward, Chest...).
                exp: (amount) => {
                    player.exp = (player.exp || 0) + amount;
                    if (window.showRewardPopup) {
                        window.showRewardPopup('fa-solid fa-star text-cyan-300', `+${amount} EXP`);
                    }
                    if (window.checkLevelUp) window.checkLevelUp();
                    if (window.requestSave) window.requestSave(); // Save System mục 3: "Nhận EXP"
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

                    // Infrastructure Update #1 — Save System (bugfix): camp vừa được dọn sạch (toàn bộ
                    // slime chết) NHƯNG rương CHƯA được mở — đây là 1 trạng thái bền vững cần lưu riêng
                    // với `phase` ('active'/'respawning'), vì phase vẫn còn là 'active' lúc này (chỉ
                    // chuyển 'respawning' khi rương thực sự được MỞ, xem startCampRespawnCycle() gọi từ
                    // _open()). Không lưu field này thì reload ở đúng lúc "đã dọn sạch nhưng chưa mở
                    // rương" sẽ khiến createCamps()/createChests() spawn lại đầy đủ slime + rương Locked
                    // mặc định — mất tiến trình đã dọn camp. Lưu ngay tại đây (thời điểm DUY NHẤT
                    // Chest chuyển Locked -> Unlocked) để applySaveData() biết cần tái tạo camp ở đúng
                    // trạng thái "sạch, rương đang chờ mở" thay vì trạng thái mặc định.
                    const state = campStates[this.campId];
                    if (state && !state.cleared) {
                        state.cleared = true;
                        if (window.requestSave) window.requestSave();
                    }
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

