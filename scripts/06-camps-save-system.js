            const CAMP_CONFIGS = [
                {
                    id: 'camp_a',
                    x: 20, z: -6,
                    spawnRadius: 5.5,
                    composition: [{ isLarge: false, count: 5 }],
                    chestType: 'common'
                },
                {
                    id: 'camp_b',
                    x: -22, z: 12,
                    spawnRadius: 6.5,
                    composition: [{ isLarge: false, count: 3 }, {isLarge: true, count: 1}],
                    chestType: 'exquisite'
                },
                {
                    id: 'camp_c',
                    x: 8, z: 26,
                    spawnRadius: 8.0,
                    composition: [{ isLarge: false, count: 4 }, { isLarge: true, count: 2 }],
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
                // `cleared`: true khi camp đã hết sạch slime nhưng rương CHƯA được mở (xem
                // Chest._enterUnlocked()) — độc lập với `phase` (vẫn là 'active' lúc này). Cần lưu
                // riêng field này để khôi phục đúng trạng thái "sạch, rương đang chờ mở" sau reload,
                // xem applySaveData() và _enterUnlocked().
                campStates[camp.id] = { phase: 'active', respawnCountdown: 0, spawnQueue: [], spawnIntervalTimer: 0, cleared: false };
            });
            window.campStates = campStates;

            // ============================================================
            // HỆ THỐNG SAVE (Infrastructure Update #1 — Save System)
            // ============================================================
            // Hoạt động HOÀN TOÀN TỰ ĐỘNG, độc lập với gameplay: game.js chỉ đọc/ghi state của CHÍNH
            // NÓ (player, playerInventory, activeQuests, campStates...) — không có logic gameplay nào
            // phải "biết" về việc mình đang được lưu. Pre-Alpha: KHÔNG có tài khoản, lưu trực tiếp vào
            // localStorage của trình duyệt (mục 1 spec).
            //
            // --- PHẠM VI LƯU (đối chiếu mục 2 spec) ---
            //   Player:    position, rotation (mesh.rotation.y), hp, exp, primogem.
            //   Inventory: toàn bộ vật phẩm + số lượng (playerInventory.items, Map -> Array để
            //              JSON-serializable).
            //   Quest:     activeQuests (đang thực hiện/đã hoàn thành/tiến độ — mảng này VỐN ĐÃ chứa
            //              đủ 3 trạng thái đó qua field `status`: 'active'|'completed'|'turned_it').
            //              CÓ lưu questSlots (chỉ defId + instanceId mỗi slot combat/gathering) — bắt
            //              buộc phải lưu để khôi phục ĐÚNG instanceId đã cấp, nếu không quest hái
            //              lượm đang dở dang sẽ bị "mồ côi" sau reload (Quest Board tự sinh instanceId
            //              MỚI, không còn khớp activeQuests cũ) — xem QuestBoard.restoreQuestSlots().
            //   Chest:     campStates (phase/respawnCountdown/spawnQueue/spawnIntervalTimer). ĐÂY LÀ
            //              QUYẾT ĐỊNH THIẾT KẾ QUAN TRỌNG: Chest thực tế chỉ ở trạng thái 'opened' vỏn
            //              vẹn ~0.9s rồi tự biến mất + camp chuyển 'respawning' (xem Chest._open()) —
            //              nên "trạng thái Chest" bền vững cần lưu THỰC CHẤT LÀ campStates (chu kỳ
            //              Locked/Unlocked/Respawning), không phải 1 cờ tĩnh "đã mở hay chưa". Coi đây
            //              là phạm vi "Chest" của spec (không phải "Enemy") vì nó mô tả trạng thái của
            //              RƯƠNG/CAMP, không phải máu/vị trí của TỪNG CON slime cụ thể.
            //   Enemy:     KHÔNG lưu gì (đúng spec mục 2) — Slime nào đang sống/chết/ở đâu lúc reload
            //              không quan trọng, world tự spawn lại đầy đủ qua createCamps() như bình
            //              thường, campStates (ở trên) mới là thứ quyết định camp nào có/không có slime.
            //   Settings:  CHƯA có hệ thống Settings thực tế nào tồn tại (âm lượng/đồ họa/điều khiển) ở
            //              Pre-Alpha này — chừa sẵn key rỗng {} trong save data (mục 2 "chuẩn bị cho
            //              tương lai") để không phải đổi cấu trúc save data khi Settings ra đời sau này.
            const SAVE_KEY = 'genshinFanGame_saveData_v1';
            const SAVE_SCHEMA_VERSION = 1; // Tăng khi cấu trúc save data đổi không tương thích ngược

            // Cờ chặn auto-save trong lúc đang reset — nếu không có cờ này, resetSaveData() xoá xong
            // localStorage rồi gọi reload(), nhưng reload() kích hoạt sự kiện 'beforeunload' NGAY SAU
            // ĐÓ, và handler tương ứng sẽ tự động saveGameNow() — VÔ TÌNH GHI LẠI TOÀN BỘ STATE CŨ VÀO
            // ĐÚNG LÚC VỪA XOÁ XONG, khiến reset "không có tác dụng gì" (dữ liệu cũ tái xuất hiện ngay
            // lập tức). Đây là bug đã xảy ra thực tế — sửa bằng cách kiểm tra cờ này trong saveGameNow()
            // (điểm ghi cấp thấp nhất, chặn được mọi đường gọi chỉ bằng 1 chỗ).
            let isResettingSave = false;

            // Gom TOÀN BỘ state cần lưu thành 1 object JSON-serializable — hàm THUẦN TÚY (không side
            // effect), chỉ ĐỌC state hiện tại, không sửa gì. Tách riêng khỏi saveGame() để dễ test/dùng
            // lại (VD sau này thêm "export save file" chỉ cần gọi hàm này rồi tải xuống).
            function collectSaveData() {
                return {
                    version: SAVE_SCHEMA_VERSION,
                    savedAt: Date.now(),
                    player: {
                        position: { x: player.position.x, y: player.position.y, z: player.position.z },
                        rotationY: player.mesh ? player.mesh.rotation.y : 0,
                        hp: player.hp,
                        exp: player.exp || 0,
                        // --- Character (Pre-Alpha v0.8) — level + stats hiện tại (đã cộng dồn qua
                        // checkLevelUp(), xem 02-collision-and-stats-core.js). Lưu maxHp/atk/def (không
                        // chỉ level/exp) vì statGrowth CỘNG DỒN vào player.stats trực tiếp — không có
                        // công thức "tính lại từ level" độc lập, nên đây là NGUỒN SỰ THẬT DUY NHẤT cần
                        // lưu để khôi phục đúng chỉ số sau khi tải lại (spec mục 6: "giữ nguyên tiến
                        // trình"). Chỉ lưu 3 field cần thiết (đúng yêu cầu "giảm dung lượng"), KHÔNG lưu
                        // cả object stats (có thể có field khác không cần persist trong tương lai).
                        level: player.level || 1,
                        maxHp: player.maxHp,
                        atk: player.stats.atk,
                        def: player.stats.def,
                        primogem: player.primogem || 0,
                        // --- Tên nhân vật (Pre-Alpha v0.8 — UI adjustment) — nhập lần đầu qua
                        // showPlayerNamePrompt() (ui.js) hoặc giữ mặc định 'Traveler' nếu người chơi
                        // bấm Hủy. Lưu ở đây để applySaveData() khôi phục đúng tên đã chọn, tránh hiện
                        // lại prompt nhập tên mỗi lần tải game (chỉ hiện đúng 1 lần lúc chưa có save).
                        characterName: window.CHARACTER_DATA ? window.CHARACTER_DATA.name : 'Traveler'
                    },
                    // Map không tự serialize qua JSON.stringify (ra "{}") — chuyển thành mảng cặp
                    // [itemId, quantity] rồi khôi phục ngược lại bằng new Map(...) ở loadGameData().
                    inventory: Array.from(playerInventory.items.entries()),
                    // activeQuests đã là mảng object thuần (không có THREE.Vector3/class instance nào
                    // lồng bên trong — kiểm tra lại cấu trúc ở QuestBoard.acceptQuest()) nên copy nông
                    // là đủ an toàn, không cần deep clone thủ công.
                    activeQuests: activeQuests.map(q => Object.assign({}, q)),
                    // BUGFIX (quest hái lượm bị cấp lại khi reload) — trước đây KHÔNG lưu questSlots vì
                    // nghĩ đây chỉ là "dữ liệu hiển thị tạm thời, tự sinh lại ngẫu nhiên". Nhưng
                    // activeQuests tham chiếu tới quest ĐANG DỞ qua đúng instanceId mà questSlots đã cấp
                    // — nếu questSlots sinh instanceId MỚI sau reload, quest cũ trong activeQuests không
                    // còn khớp được với slot nào ở Quest Board nữa (xem QuestBoard.restoreQuestSlots() —
                    // 01-entities-quest-inventory-chest.js). Chỉ lưu defId (id mẫu gốc) + instanceId cho
                    // từng slot — đủ để khôi phục lại ĐÚNG instance đã cấp, không lưu cả object quest đầy
                    // đủ (title/description/rewards... luôn lấy MỚI NHẤT từ QUEST_DEFINITIONS lúc khôi
                    // phục, xem restoreQuestSlots()).
                    questSlots: window.questBoard ? {
                        combat: window.questBoard.questSlots.combat
                            ? { defId: window.questBoard.questSlots.combat.id, instanceId: window.questBoard.questSlots.combat.instanceId }
                            : null,
                        gathering: window.questBoard.questSlots.gathering
                            ? { defId: window.questBoard.questSlots.gathering.id, instanceId: window.questBoard.questSlots.gathering.instanceId }
                            : null
                    } : null,
                    // campStates: copy nông từng camp — object con (spawnQueue) là mảng phẳng {isLarge},
                    // không có tham chiếu vòng nào, JSON.stringify xử lý đúng khi thực sự ghi xuống.
                    campStates: JSON.parse(JSON.stringify(campStates)),
                    // Settings (mục 2/5 spec: "chuẩn bị cho tương lai") — hiện tại chỉ có Camera
                    // Sensitivity, nhưng cấu trúc object phẳng này cho phép thêm bất kỳ setting nào sau
                    // này (âm lượng, đồ hoạ...) chỉ bằng cách thêm 1 field mới ở đây + field tương ứng
                    // trong applySaveData(), không cần đổi cấu trúc save data.
                    // cameraSensitivityMultiplier (window.*, khai báo trong index.html) là giá trị ĐÃ
                    // chia 100 (0.1 - 3.0) dùng trực tiếp trong công thức xoay camera — lưu lại dạng %
                    // gốc (10-300, nhân lại *100) để khớp trực tiếp với giá trị hiển thị trên UI slider
                    // (dễ đọc khi debug JSON, không cần quy đổi ngược khi xem).
                    settings: {
                        cameraSensitivity: Math.round((window.cameraSensitivityMultiplier || 1.0) * 100)
                    }
                };
            }
            window.collectSaveData = collectSaveData;

            // Áp dụng save data đã đọc được NGƯỢC LẠI vào state hiện tại của game — gọi ĐÚNG 1 LẦN lúc
            // khởi tạo (initThree(), SAU KHI toàn bộ world — slime, chest, quest board — đã được tạo
            // xong), không gọi giữa chừng lúc đang chơi.
            function applySaveData(data) {
                if (!data) return;

                if (data.player) {
                    if (data.player.position) player.position.set(data.player.position.x, data.player.position.y, data.player.position.z);
                    if (player.mesh) {
                        player.mesh.position.copy(player.position); // initThree() đã copy 1 lần TRƯỚC
                        // khi save data được áp — đồng bộ lại đúng vị trí đã khôi phục, tránh mesh hiển
                        // thị sai chỗ dù state vật lý (player.position) đã đúng.
                        if (typeof data.player.rotationY === 'number') player.mesh.rotation.y = data.player.rotationY;
                    }
                    if (typeof data.player.hp === 'number') player.hp = data.player.hp;
                    if (typeof data.player.exp === 'number') player.exp = data.player.exp;
                    // --- Character (Pre-Alpha v0.8) — khôi phục level + stats TRƯỚC KHI dòng hp ở trên
                    // đã set xong (thứ tự khai báo không quan trọng ở đây vì player.hp là setter độc
                    // lập, không phụ thuộc maxHp lúc gán — nhưng đặt sau để rõ ràng: đây là state MỚI
                    // hơn v0.6, khôi phục theo đúng nhóm field liên quan tới Character). Nếu file save
                    // cũ (trước v0.8) không có các field này, giữ nguyên giá trị mặc định Level 1 /
                    // stats gốc mà initThree() đã khởi tạo — không có field nào bị NaN/undefined.
                    if (typeof data.player.level === 'number') player.level = data.player.level;
                    if (typeof data.player.maxHp === 'number') player.maxHp = data.player.maxHp;
                    if (typeof data.player.atk === 'number') player.stats.atk = data.player.atk;
                    if (typeof data.player.def === 'number') player.stats.def = data.player.def;
                    if (typeof data.player.primogem === 'number') player.primogem = data.player.primogem;
                    // --- Tên nhân vật (Pre-Alpha v0.8) — khôi phục qua setCharacterName() (không gán
                    // trực tiếp CHARACTER_DATA.name) để đồng bộ luôn cả Paimon Menu profile card ngay
                    // khi world vừa dựng xong, không cần đợi người chơi mở menu lần đầu mới thấy đúng.
                    if (typeof data.player.characterName === 'string' && window.setCharacterName) {
                        window.setCharacterName(data.player.characterName);
                    }
                }

                if (Array.isArray(data.inventory)) {
                    playerInventory.items = new Map(data.inventory);
                }

                if (Array.isArray(data.activeQuests)) {
                    activeQuests.length = 0; // Xoá sạch mảng hiện tại (rỗng, vì vừa khởi tạo) TẠI CHỖ —
                    // giữ nguyên tham chiếu mảng gốc (window.activeQuests trỏ đúng mảng này) thay vì
                    // gán activeQuests = data.activeQuests (sẽ làm window.activeQuests trỏ sai mảng).
                    data.activeQuests.forEach(q => activeQuests.push(q));

                    // BUGFIX (quest hái lượm bị cấp lại khi reload) — khôi phục ĐÚNG instanceId đã cấp
                    // cho questBoard.questSlots TRƯỚC khi người chơi mở lại Quest Board, để
                    // _findActiveEntry() khớp lại được với activeQuests vừa restore ở trên. Phải gọi ở
                    // đây (không phải trong createInteractables()) vì questBoard đã được tạo xong (mesh,
                    // slot ngẫu nhiên ban đầu) trước applySaveData(), giờ chỉ "sửa lại" instanceId của
                    // slot đã có, không tạo lại object.
                    if (window.questBoard && data.questSlots) {
                        window.questBoard.restoreQuestSlots(data.questSlots);
                    }

                    // Infrastructure Update #1 — Save System (bugfix): applySaveData() chỉ điền lại dữ
                    // liệu vào mảng activeQuests, nhưng KHÔNG tự vẽ lại quest-tracker HUD (div
                    // #quest-tracker mặc định ở class 'hidden', chỉ hiện ra khi refreshQuestTracker()
                    // được gọi — xem ui.js). Trước bugfix này, refreshQuestTracker() chỉ được gọi lại
                    // từ các sự kiện gameplay VỀ SAU (nhận quest mới, giết quái, nhặt đồ...), nên quest
                    // đang nhận dở bị "biến mất" khỏi màn hình cho tới khi có sự kiện tiếp theo, dù
                    // activeQuests đã khôi phục đúng — gọi ngay tại đây để tracker hiện lại NGAY LÚC
                    // reload, khớp với state vừa khôi phục.
                    if (window.refreshQuestTracker) window.refreshQuestTracker();
                }

                if (data.campStates) {
                    Object.keys(data.campStates).forEach(campId => {
                        if (campStates[campId]) {
                            Object.assign(campStates[campId], data.campStates[campId]);
                        }
                    });

                    // --- ĐỒNG BỘ WORLD VỚI campStates VỪA KHÔI PHỤC ---
                    // createCamps()/createChests() (gọi TRƯỚC applySaveData() trong initThree()) LUÔN
                    // spawn đầy đủ slime + tạo Chest Locked cho MỌI camp ở trạng thái mặc định, không
                    // biết gì về save data. Nếu save data cho biết 1 camp đang 'respawning' (rương vừa
                    // được mở trước khi reload), phải XOÁ sạch slime + chest vừa được tạo mặc định cho
                    // đúng camp đó — nếu không, world sẽ hiển thị sai (có slime dù đáng lẽ đang trống
                    // chờ respawn, có chest dù đáng lẽ chưa xuất hiện lại).
                    Object.keys(campStates).forEach(campId => {
                        const state = campStates[campId];
                        // Cả 2 trường hợp dưới đây đều cần "camp này KHÔNG được có slime sống mặc
                        // định" — 'respawning' (đang chờ hồi sinh) VÀ 'cleared' (đã dọn sạch, rương
                        // đang chờ mở, xem Chest._enterUnlocked()) — nên gộp điều kiện xoá slime chung,
                        // chỉ tách riêng phần xử lý Chest bên dưới vì 2 trường hợp cần Chest khác nhau
                        // (respawning: không có chest nào cả; cleared: có chest nhưng phải ở thẳng
                        // trạng thái 'unlocked', không phải 'locked' mặc định).
                        if (state.phase !== 'respawning' && !state.cleared) return;

                        // Xoá toàn bộ slime đang sống thuộc camp này (enemy.camp gán bởi
                        // spawnCampSlime(), xem game.js) — dispose đúng chuẩn (mesh, bodyMesh, HP bar
                        // sprite) giống hệt pattern dọn dẹp slime chết trong animate(), CHỈ khác là
                        // slime này vẫn đang alive=true (mới spawn mặc định, chưa từng bị đánh).
                        for (let i = enemies.length - 1; i >= 0; i--) {
                            const enemy = enemies[i];
                            if (!enemy.isSlime || enemy.camp !== campId) continue;
                            scene.remove(enemy.mesh);
                            if (enemy.bodyMesh) { enemy.bodyMesh.geometry.dispose(); enemy.bodyMesh.material.dispose(); }
                            if (enemy.hpBarBg) enemy.hpBarBg.material.dispose();
                            if (enemy.hpBarFill) enemy.hpBarFill.material.dispose();
                            enemies.splice(i, 1);
                        }

                        if (state.phase === 'respawning') {
                            // Xoá Chest thuộc camp này (nếu có) — camp đang respawning thì KHÔNG được có
                            // chest hiển thị (chest chỉ xuất hiện lại khi phase quay về 'active', xem
                            // updateCampRespawns()). Chest dùng this.meshGroup (không phải this.mesh như
                            // Interactable base class), xem createChestForCamp().
                            for (let i = interactables.length - 1; i >= 0; i--) {
                                const obj = interactables[i];
                                if (!(obj instanceof Chest) || obj.campId !== campId) continue;
                                if (obj.meshGroup) scene.remove(obj.meshGroup);
                                interactables.splice(i, 1);
                                if (window.nearbyInteractable === obj) window.nearbyInteractable = null;
                            }
                            return;
                        }

                        // state.cleared === true (và phase vẫn 'active'): camp đã dọn sạch trước khi
                        // reload nhưng rương CHƯA được mở — createChests() (gọi trước applySaveData())
                        // đã tạo sẵn 1 Chest mặc định ở state 'locked' cho camp này (đúng ra vì lúc đó
                        // world chưa biết gì về save data). Slime mặc định vừa bị xoá ở trên rồi, nên
                        // giờ _campHasAliveSlimes() của chest đó sẽ trả về false ngay ở frame update()
                        // đầu tiên -> tự chuyển 'locked' -> 'unlocking' -> 'unlocked' bình thường qua
                        // đúng animation Unlock. Không cần ép thẳng state = 'unlocked' (tránh bỏ qua
                        // animation, cũng tránh trùng lặp logic của update()) — chỉ cần đảm bảo KHÔNG
                        // xoá Chest này (khác với nhánh 'respawning' ở trên).
                    });
                }

                // Settings — hiện tại chỉ có Camera Sensitivity (xem collectSaveData). Chuyển ngược từ
                // dạng % lưu trữ (10-300) về hệ số nhân dùng trực tiếp trong công thức xoay camera
                // (0.1-3.0). Chỉ ghi window.cameraSensitivityMultiplier (biến logic) — KHÔNG tự đụng
                // vào DOM slider ở đây (module này ở game.js, không có tham chiếu tới các phần tử
                // slider được khai báo cục bộ trong index.html) — thay vào đó gọi callback
                // window.onSettingsRestored(settings) để index.html tự đồng bộ UI slider/text hiển thị
                // của chính nó, cùng pattern với window.onInventoryItemAdded/window.onItemGathered đã
                // dùng xuyên suốt dự án.
                if (data.settings && typeof data.settings.cameraSensitivity === 'number') {
                    window.cameraSensitivityMultiplier = data.settings.cameraSensitivity / 100;
                }
                if (window.onSettingsRestored) window.onSettingsRestored(data.settings || {});
            }
            window.applySaveData = applySaveData;

            // Đọc save data thô từ localStorage — trả về object đã parse, hoặc null nếu chưa có/lỗi
            // (JSON hỏng, phiên bản không tương thích...). KHÔNG throw ra ngoài — 1 save data hỏng
            // không được phép làm crash toàn bộ game, chỉ nên coi như "chưa có dữ liệu" (mục 1 spec:
            // "Nếu chưa có dữ liệu lưu: Game sẽ tự động bắt đầu một hành trình mới").
            function loadGameData() {
                try {
                    const raw = localStorage.getItem(SAVE_KEY);
                    if (!raw) return null;
                    const data = JSON.parse(raw);
                    if (!data || data.version !== SAVE_SCHEMA_VERSION) {
                        console.warn('Save System: dữ liệu lưu không đúng phiên bản hoặc rỗng, bỏ qua.');
                        return null;
                    }
                    return data;
                } catch (e) {
                    console.warn('Save System: lỗi đọc dữ liệu lưu, bỏ qua và bắt đầu hành trình mới.', e);
                    return null;
                }
            }
            window.loadGameData = loadGameData;

            // Ghi ngay lập tức xuống localStorage — hàm CẤP THẤP, không debounce/throttle (đó là việc
            // của requestSave() bên dưới). Gọi trực tiếp hàm này chỉ khi CHẮC CHẮN muốn ghi ngay (VD
            // saveGameImmediately() khi đóng tab/reset).
            function saveGameNow() {
                // Đang trong quá trình reset (đã xoá xong, chờ reload()) — TUYỆT ĐỐI không ghi lại,
                // dù được gọi từ đâu (requestSave() debounce đang chờ, setInterval định kỳ, hay chính
                // 'beforeunload' bị kích hoạt bởi window.location.reload() trong resetSaveData()).
                // Đây là điểm ghi CẤP THẤP NHẤT — mọi đường lưu khác đều đi qua đây, nên chặn ở đây là
                // đủ để bảo vệ toàn bộ hệ thống, không cần rải cờ kiểm tra ở từng nơi gọi.
                if (isResettingSave) return;
                try {
                    localStorage.setItem(SAVE_KEY, JSON.stringify(collectSaveData()));
                } catch (e) {
                    // localStorage đầy hoặc bị chặn (chế độ ẩn danh nghiêm ngặt...) — không throw, chỉ
                    // cảnh báo. Game vẫn phải chơi được bình thường dù không lưu được (mất tính năng
                    // "phụ", không phải lỗi chặn toàn bộ trải nghiệm).
                    console.warn('Save System: không thể ghi dữ liệu lưu.', e);
                }
            }
            window.saveGameNow = saveGameNow;

            // --- AUTO SAVE THEO SỰ KIỆN (mục 3 spec) ---
            // Debounce nhẹ (300ms) — nhiều sự kiện có thể bắn dồn dập trong cùng 1 frame/vài frame liên
            // tiếp (VD: mở rương vừa cấp Nguyên Thạch vừa có thể cấp thêm reward khác cùng lúc trong
            // tương lai) — gộp lại thành 1 lần ghi localStorage thay vì ghi lặp lại ngay sát nhau,
            // tránh tốn hiệu năng không cần thiết mà vẫn đảm bảo lưu gần như ngay lập tức theo cảm nhận
            // người chơi (spec: "game sẽ lưu ngay lập tức" — 300ms là vô hình với người chơi).
            let saveDebounceTimer = null;
            function requestSave() {
                if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
                saveDebounceTimer = setTimeout(() => {
                    saveDebounceTimer = null;
                    saveGameNow();
                }, 300);
            }
            window.requestSave = requestSave;

            // --- AUTO SAVE ĐỊNH KỲ CHO DỮ LIỆU THAY ĐỔI LIÊN TỤC (vị trí/góc quay) ---
            // Spec mục 3: "đối với dữ liệu thay đổi liên tục như vị trí/góc quay, nên lưu theo khoảng
            // thời gian hợp lý" — KHÔNG lưu mỗi frame (quá tốn), dùng interval riêng độc lập với
            // requestSave() (không debounce theo sự kiện, vì di chuyển không phải "sự kiện" mà là liên
            // tục). 10 giây là đủ để không mất nhiều tiến trình di chuyển nếu tab bị đóng đột ngột,
            // trong khi không ghi localStorage quá thường xuyên khi người chơi chỉ đang đi lại bình
            // thường (không có sự kiện quan trọng nào khác kích hoạt requestSave()).
            const POSITION_AUTOSAVE_INTERVAL_MS = 10000;
            setInterval(() => { saveGameNow(); }, POSITION_AUTOSAVE_INTERVAL_MS);

            // Lưu ngay lập tức (KHÔNG debounce) khi người chơi rời trang/đóng tab — cơ hội cuối cùng để
            // ghi trạng thái mới nhất, vì setTimeout của requestSave() có thể không kịp chạy nếu trang
            // đóng ngay sau đó.
            window.addEventListener('beforeunload', () => { saveGameNow(); });

            // --- RESET SAVE DATA (mục 4 spec) ---
            // Chỉ xoá localStorage rồi reload trang — KHÔNG tự dựng lại state trong bộ nhớ (phức tạp,
            // dễ sót 1 biến nào đó không reset đúng). Reload là cách chắc chắn 100% mọi state (kể cả
            // các biến không nằm trong phạm vi Save System, VD combo counter, timer combat...) đều về
            // đúng giá trị ban đầu — đơn giản và an toàn hơn nhiều so với viết logic "reset thủ công".
            function resetSaveData() {
                isResettingSave = true;
                try {
                    localStorage.removeItem(SAVE_KEY);
                } catch (e) {
                    console.warn('Save System: không thể xoá dữ liệu lưu.', e);
                }
                window.location.reload();
            }
            window.resetSaveData = resetSaveData;

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
                // Infrastructure Update #1 — Save System (mục 3: "Mở rương") — đây chính là thời điểm
                // campStates chuyển sang 'respawning' (trạng thái bền vững của Chest/Camp — xem giải
                // thích chi tiết ở khai báo module Save System), cần lưu ngay để khôi phục đúng chu kỳ
                // nếu người chơi reload trang ngay sau khi mở rương.
                if (window.requestSave) window.requestSave();
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
                        // Rương mới luôn bắt đầu Locked (slime vừa respawn đầy đủ) — reset `cleared` về
                        // false để đúng với trạng thái thật, tránh applySaveData() hiểu nhầm camp này
                        // "đã dọn sạch" nếu người chơi reload ngay sau khi chu kỳ respawn vừa xong.
                        state.cleared = false;
                        // Infrastructure Update #1 — Save System: campStates vừa đổi bền vững (respawning
                        // -> active) — lưu lại để tránh "kẹt" ở respawning nếu reload ngay sau khi chu
                        // kỳ vừa hoàn tất xong (dùng requestSave() có debounce, an toàn dù hàm này chạy
                        // mỗi frame — không spam ghi localStorage).
                        if (window.requestSave) window.requestSave();
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

