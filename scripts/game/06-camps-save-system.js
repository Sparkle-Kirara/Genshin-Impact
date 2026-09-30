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
            // Alpha M5 (Save v2): TÊN KHOÁ giữ nguyên — '..._v1' chỉ là tên ô lưu có từ trước (quy ước sẵn có của dự án);
            // phiên bản SCHEMA nằm ở field `version` bên trong dữ liệu. Save v1 được nâng cấp (migrate) lên v2 lúc đọc và
            // được ghi lại thành v2 ở lần lưu kế tiếp (bản v1 gốc được sao lưu 1 lần vào SAVE_KEY + '_v1_backup').
            const SAVE_KEY = 'genshinFanGame_saveData_v1';
            const SAVE_SCHEMA_VERSION = 2; // Tăng khi cấu trúc save data đổi không tương thích ngược
            const SAVE_OLDEST_SUPPORTED_VERSION = 1;

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
                    // Alpha M5 — thông tin schema (không phải tiến trình): migratedFrom = 1 nếu phiên chơi này bắt đầu từ save v1.
                    meta: { schema: SAVE_SCHEMA_VERSION, migratedFrom: saveRuntime.migratedFrom },
                    player: {
                        position: { x: player.position.x, y: player.position.y, z: player.position.z },
                        rotationY: player.mesh ? player.mesh.rotation.y : 0,
                        primogem: player.primogem || 0,
                        // --- Tên nhân vật (Pre-Alpha v0.8 — UI adjustment) — nhập lần đầu qua Character
                        // Name Popup trong Opening/Title Screen (scripts/opening.js) hoặc giữ mặc định
                        // 'Traveler' nếu người chơi bấm Hủy. Lưu ở đây để applySaveData() khôi phục
                        // đúng tên đã chọn, tránh hiện lại popup nhập tên mỗi lần tải game (chỉ hiện
                        // đúng 1 lần lúc chưa có save — xem runBackgroundStage() trong opening.js).
                        // Alpha M1 (BUG-01): key giữ nguyên 'characterName' (save schema v1) nhưng nội dung là
                        // TÊN NGƯỜI CHƠI (player.playerName) — trước M1 ghi CHARACTER_DATA.name, tức tên nhân
                        // vật đang active lúc lưu (sai sau lần đổi nhân vật đầu tiên).
                        characterName: player.playerName || 'Traveler'
                    },
                    // Party System Save Fix v1 — BUG FIX QUAN TRỌNG: TRƯỚC ĐÂY (Pre-Alpha v0.8, trước
                    // khi Party System đa nhân vật ra đời) save data chỉ lưu 1 BỘ level/maxHp/atk/def/hp
                    // DUY NHẤT dưới player.* — đại diện cho BẤT KỲ nhân vật nào đang active LÚC BẤM
                    // SAVE, không phân biệt theo từng thành viên. Khi load lại, applySaveData() luôn
                    // ghi bộ số đó vào partyState[0] (Traveler, vì initParty() luôn khởi động lại ở
                    // activeCharacterIndex=0) — BUG ĐÃ XÁC NHẬN: save lúc đang cầm Character #2 rồi
                    // chuyển về #1 trước khi thoát, Traveler vẫn bị ghi ĐÈ nhầm bằng atk/def của #2 sau
                    // khi load lại (đã kiểm chứng qua sát thương gây ra sai). Từ v1: lưu ĐẦY ĐỦ mảng
                    // party (mọi thành viên, không chỉ người active) + activeCharacterIndex riêng biệt
                    // — mỗi nhân vật giữ ĐÚNG level/exp/stats(hp/maxHp/atk/def)/energy của chính họ,
                    // không lẫn nhau dù có switch qua lại bao nhiêu lần trước khi save.
                    //
                    // KHÔNG lưu: name/element/region (tĩnh, luôn đọc lại từ CHARACTER_ROSTER qua id —
                    // tránh save data cũ "đóng băng" data tĩnh nếu roster được cập nhật sau này),
                    // mesh/tiltRoot/core/leftHand/rightHand/sword/slashWave/gliderGroup (THREE.js
                    // object runtime, không serialize được — buildCharacterMesh() dựng lại từ đầu lúc
                    // initParty()), skillCooldownTimer (runtime combat, reset về 0 hợp lý khi load —
                    // KHÔNG như energy, cooldown giữa các phiên chơi không có ý nghĩa cần bảo toàn),
                    // maxEnergy (không đổi theo thời gian, luôn CLONE lại từ
                    // CHARACTER_ROSTER[id].baseStats.maxEnergy lúc initParty() — lưu ra sẽ dư thừa và
                    // có nguy cơ "đóng băng" giá trị cũ nếu balance sau này đổi maxEnergy của nhân vật).
                    // Party Foundation (Task 74821): đội hình người chơi chọn (id theo slot, null = trống).
                    // Chỉ save CÓ field này mới được áp đội hình khi load; save cũ giữ PARTY_CONFIG mặc định.
                    partySlots: partyState.map(function(member) { return member ? member.id : null; }),
                    // Tiến trình của nhân vật đã rời party (level/exp/hp/energy) — không mất khi gỡ khỏi đội.
                    partyBench: (window.Party ? window.Party.getBenchedMembers() : []).map(function(member) {
                        return {
                            id: member.id,
                            weapon: member.weapon, artifacts: member.artifacts, talents: member.talents, constellation: member.constellation,
                            level: member.level, exp: member.exp,
                            stats: { maxHp: member.stats.maxHp, hp: member.stats.hp, atk: member.stats.atk, def: member.stats.def },
                            energy: member.energy
                        };
                    }),
                    party: partyState.map(function(member, idx) {
                        if (!member) return null; // Slot Reserved, chưa có Character — giữ nguyên null
                        // Alpha M0.1 — BUGFIX: level/exp của nhân vật ĐANG active sống ở player.level/exp
                        // (chỉ chép ngược vào member khi switchToCharacter) -> trước đây bị lưu giá trị cũ.
                        const isActiveMember = idx === activeCharacterIndex;
                        return {
                            id: member.id,
                            weapon: member.weapon, artifacts: member.artifacts, talents: member.talents, constellation: member.constellation,
                            level: isActiveMember ? player.level : member.level,
                            exp: isActiveMember ? player.exp : member.exp,
                            stats: { maxHp: member.stats.maxHp, hp: member.stats.hp, atk: member.stats.atk, def: member.stats.def },
                            energy: member.energy
                        };
                    }),
                    activeCharacterIndex: activeCharacterIndex,
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
                    // Alpha M3 — encounter: CHỈ cờ bền { firstClearClaimed, clears } theo id (thưởng lần đầu không nhận
                    // lại sau reload). Key TUỲ CHỌN, save schema vẫn v1: save cũ không có key -> mặc định; bản cũ đọc save
                    // mới thì bỏ qua key lạ. Quái/trạng thái lượt đang đánh KHÔNG lưu (như Enemy, xem đầu module Save).
                    encounters: window.collectEncounterSaveData ? window.collectEncounterSaveData() : {},
                    // Alpha M4 — tiến trình thế giới (nguồn sự thật: WorldState, 16-world-state.js): vùng đã khám phá, vật thể đã
                    // kích hoạt (bia đá đã đọc), rương thế giới đã mở. Chỉ id — không lưu mesh/vị trí.
                    world: window.WorldState ? window.WorldState.collect() : { discovered: [], activated: [], opened: [] },
                    // Alpha M6 — nhiệm vụ chính (nguồn sự thật: StoryQuest, 18-story-quest.js): trạng thái + chỉ số mục tiêu +
                    // cờ đã nhận thưởng. Nhiệm vụ Bảng (lặp lại) vẫn ở activeQuests/questSlots như v1.
                    story: window.collectStorySaveData ? window.collectStorySaveData() : {},
                    // Settings (mục 2/5 spec: "chuẩn bị cho tương lai") — hiện tại chỉ có Camera
                    // Sensitivity, nhưng cấu trúc object phẳng này cho phép thêm bất kỳ setting nào sau
                    // này (âm lượng, đồ hoạ...) chỉ bằng cách thêm 1 field mới ở đây + field tương ứng
                    // trong applySaveData(), không cần đổi cấu trúc save data.
                    // cameraSensitivityMultiplier (window.*, khai báo trong index.html) là giá trị ĐÃ
                    // chia 100 (0.1 - 3.0) dùng trực tiếp trong công thức xoay camera — lưu lại dạng %
                    // gốc (10-300, nhân lại *100) để khớp trực tiếp với giá trị hiển thị trên UI slider
                    // (dễ đọc khi debug JSON, không cần quy đổi ngược khi xem).
                    settings: {
                        cameraSensitivity: Math.round((window.cameraSensitivityMultiplier || 1.0) * 100),
                        // Skip Opening (mục 1, chuẩn bị Alpha) — người chơi bật để bỏ qua toàn bộ Opening
                        // Flow (Logo/Title/Door Intro/Loading) ở lần khởi động TIẾP THEO, đi thẳng vào
                        // gameplay. Mặc định false (giữ nguyên trải nghiệm Opening cho người chơi mới/
                        // chưa từng bật). Xem runGameLaunch() (scripts/opening.js) — nơi đọc field này.
                        skipOpening: window.skipOpeningEnabled === true,
                        // Fullscreen (Immersive Mode toggle) — mặc định TRUE (khác skipOpening ở trên,
                        // mặc định false) vì hành vi GỐC của game trước khi có toggle này LUÔN bật
                        // Fullscreen + Landscape lock lúc bấm Start — người chơi CHƯA từng vào Settings
                        // đổi gì phải giữ nguyên hành vi cũ, không bị tắt ngầm. Landscape lock PHỤ THUỘC
                        // Fullscreen (yêu cầu kỹ thuật của Screen Orientation API trên hầu hết trình
                        // duyệt di động, xem requestImmersiveMode() — scripts/opening.js) nên KHÔNG có
                        // field riêng cho Landscape — tắt field này tắt luôn cả 2, đúng theo yêu cầu.
                        fullscreenEnabled: window.fullscreenEnabled !== false
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
                    // Alpha M0.1 — chỉ áp vị trí hợp lệ (số hữu hạn), tránh NaN/undefined làm hỏng physics.
                    const sp = data.player.position;
                    if (sp && isFinite(sp.x) && isFinite(sp.y) && isFinite(sp.z)
                        && typeof sp.x === 'number' && typeof sp.y === 'number' && typeof sp.z === 'number') {
                        player.position.set(sp.x, sp.y, sp.z);
                    }
                    if (player.mesh) {
                        player.mesh.position.copy(player.position); // initThree() đã copy 1 lần TRƯỚC
                        // khi save data được áp — đồng bộ lại đúng vị trí đã khôi phục, tránh mesh hiển
                        // thị sai chỗ dù state vật lý (player.position) đã đúng.
                        if (typeof data.player.rotationY === 'number') player.mesh.rotation.y = data.player.rotationY;
                    }
                    if (typeof data.player.primogem === 'number') player.primogem = data.player.primogem;
                    // --- Tên nhân vật (Pre-Alpha v0.8) — khôi phục qua setCharacterName() (không gán
                    // trực tiếp CHARACTER_DATA.name) để đồng bộ luôn cả Paimon Menu profile card ngay
                    // khi world vừa dựng xong, không cần đợi người chơi mở menu lần đầu mới thấy đúng.
                    // Alpha M1 (BUG-01) — save v1 cũ có thể đã bị lỗi ghi TÊN NHÂN VẬT (tên trong roster, vd
                    // 'Windstep') thay cho tên người chơi; tên gốc không còn khôi phục được -> dùng tên mặc
                    // định thay vì biến tên nhân vật thành tên người chơi. Tên không phải chuỗi -> mặc định.
                    if (window.setCharacterName) {
                        const savedName = (typeof data.player.characterName === 'string') ? data.player.characterName.trim() : '';
                        const rosterNames = Object.keys(window.CHARACTER_ROSTER || {}).map(function (id) { return window.CHARACTER_ROSTER[id] && window.CHARACTER_ROSTER[id].name; });
                        const looksCorrupted = savedName !== '' && savedName !== 'Traveler' && rosterNames.indexOf(savedName) !== -1;
                        if (looksCorrupted) console.warn('Save System: tên người chơi trong save trùng tên nhân vật "' + savedName + '" (lỗi BUG-01 của bản cũ) — dùng tên mặc định.');
                        window.setCharacterName(looksCorrupted ? '' : savedName);
                    }
                }

                // Party System Save Fix v1 — khôi phục ĐÚNG từng thành viên party theo id (KHÔNG còn
                // ghi đè "bộ số chung" vào bất kỳ ai đang active như bug cũ — xem giải thích đầy đủ ở
                // collectSaveData()). Chạy SAU initParty() (đã tạo sẵn đủ 4 slot partyState với mesh
                // build xong, activeCharacterIndex mặc định = 0) — ở đây chỉ GHI ĐÈ đúng field runtime
                // (level/exp/stats/energy) vào đúng slot theo id, KHÔNG đụng mesh/tiltRoot/core/...
                //
                // Tương thích ngược save CŨ (trước v1, chưa có field "party"): nếu data.party không
                // tồn tại, giữ nguyên toàn bộ partyState như initParty() vừa khởi tạo (Level 1, full
                // HP, energy 0 cho MỌI nhân vật) — CHẤP NHẬN mất tiến trình cũ của save trước Party
                // System Save Fix v1 (không có cách khôi phục đúng vì save cũ không phân biệt theo
                // nhân vật) thay vì cố gán nhầm vào 1 nhân vật cụ thể — an toàn hơn là tiếp tục lẫn số.
                if (Array.isArray(data.party)) {
                    // Party Foundation (Task 74821): áp đội hình đã lưu TRƯỚC khi khôi phục chỉ số theo id.
                    // lenient: id lạ/trùng -> slot trống; không còn ai hợp lệ -> PARTY_CONFIG mặc định.
                    // Alpha M8 (kiểm tra console): bản lưu ghi lúc xác nhận tên ở Opening có partySlots RỖNG (đội hình chưa
                    // được dựng) — trước đây mỗi ván mới đều in cảnh báo "đội hình ... không hợp lệ" dù chẳng có gì sai. Mảng
                    // rỗng = chưa lưu đội hình -> giữ đội hình mặc định, không cảnh báo (kết quả y hệt trước).
                    if (Array.isArray(data.partySlots) && data.partySlots.some(Boolean) && window.Party) {
                        const partyResult = window.Party.commit(data.partySlots, { lenient: true, fromLoad: true });
                        if (partyResult.errors && partyResult.errors.length) {
                            console.warn('Save System: đội hình đã lưu có mục không hợp lệ, đã chuẩn hoá.', partyResult.errors);
                        }
                    }
                    const savedMembers = data.party.concat(Array.isArray(data.partyBench) ? data.partyBench : []);
                    savedMembers.forEach(function(savedMember) {
                        if (!savedMember || !savedMember.id) return;
                        const member = partyState.find(function(m) { return m && m.id === savedMember.id; })
                            || (window.Party ? window.Party.getBenchedMember(savedMember.id) : null);
                        if (!member) return; // Nhân vật trong save không còn tồn tại trong roster hiện tại — bỏ qua an toàn
                        if (savedMember.weapon !== undefined) member.weapon = savedMember.weapon;
                        if (Array.isArray(savedMember.artifacts)) member.artifacts = savedMember.artifacts;
                        if (Array.isArray(savedMember.talents)) member.talents = savedMember.talents;
                        if (typeof savedMember.constellation === 'number') member.constellation = savedMember.constellation;
                        if (typeof savedMember.level === 'number') member.level = savedMember.level;
                        if (typeof savedMember.exp === 'number') member.exp = savedMember.exp;
                        if (savedMember.stats) {
                            if (typeof savedMember.stats.maxHp === 'number') member.stats.maxHp = savedMember.stats.maxHp;
                            if (typeof savedMember.stats.hp === 'number') member.stats.hp = savedMember.stats.hp;
                            if (typeof savedMember.stats.atk === 'number') member.stats.atk = savedMember.stats.atk;
                            if (typeof savedMember.stats.def === 'number') member.stats.def = savedMember.stats.def;
                        }
                        if (typeof savedMember.energy === 'number') member.energy = savedMember.energy;
                    });

                    // Khôi phục activeCharacterIndex — GỌI switchToCharacter() thay vì gán biến trực
                    // tiếp, để player.mesh/stats/tiltRoot/core/... (con trỏ) được đồng bộ đúng CHUẨN
                    // giống hệt lúc người chơi tự bấm đổi nhân vật trong lúc chơi, không viết logic
                    // đồng bộ trùng lặp ở đây. Chỉ gọi nếu KHÁC 0 (mặc định initParty() đã để đúng ở
                    // Traveler/slot 0 rồi — switchToCharacter(0) sẽ tự return false do
                    // "index === activeCharacterIndex", không cần né riêng).
                    // Cleanup (gỡ test_character_anemo): vị trí slot trong party đã dịch chuyển (archer
                    // 2->1, polearm 3->2) — save CŨ lưu activeCharacterIndex theo vị trí cũ. Quy đổi qua
                    // ID nhân vật (data.party[index].id, luôn đúng) sang vị trí MỚI trong partyState. Nếu
                    // nhân vật đó không còn trong party (VD save đang cầm nhân vật test đã gỡ) -> giữ
                    // Traveler (slot 0), không crash.
                    // Alpha M0.1 — BUGFIX: player.level/exp là "cửa sổ" của nhân vật active (slot hiện tại,
                    // luôn 0 lúc này). Nạp đúng giá trị vừa khôi phục của slot đó vào player TRƯỚC khi
                    // switchToCharacter() chép ngược player.level/exp vào slot cũ — nếu không slot 0 bị ghi
                    // đè bằng Lv.1/0 EXP mặc định.
                    const currentMember = partyState[activeCharacterIndex];
                    if (currentMember) {
                        player.level = currentMember.level;
                        player.exp = currentMember.exp;
                    }
                    let restoreIndex = data.activeCharacterIndex;
                    const savedActive = (typeof restoreIndex === 'number') ? data.party[restoreIndex] : null;
                    if (savedActive && savedActive.id) {
                        restoreIndex = partyState.findIndex(function(m) { return m && m.id === savedActive.id; });
                    }
                    // Task 74821: >= 0 (không phải > 0) — sau khi áp đội hình đã lưu, nhân vật active hiện tại có thể KHÔNG ở
                    // slot 0 nữa; switchToCharacter() tự bỏ qua nếu trùng index hiện tại.
                    if (typeof restoreIndex === 'number' && restoreIndex >= 0 && window.switchToCharacter) {
                        window.switchToCharacter(restoreIndex);
                    }
                } else if (typeof data.player === 'object' && data.player && typeof data.player.level === 'number') {
                    // Tương thích ngược save data TRƯỚC v1 (Pre-Alpha v0.8, chỉ có player.level/maxHp/
                    // atk/def/hp/exp "chung") — áp dụng đúng như hành vi CŨ, ghi vào nhân vật ĐANG
                    // active tại thời điểm này (luôn là slot 0/Traveler do initParty() vừa khởi tạo) —
                    // GIỮ NGUYÊN hành vi cũ CHỈ cho trường hợp save thật sự cũ, không phải bug mới.
                    if (typeof data.player.hp === 'number') player.hp = data.player.hp;
                    if (typeof data.player.exp === 'number') player.exp = data.player.exp;
                    if (typeof data.player.level === 'number') player.level = data.player.level;
                    if (typeof data.player.maxHp === 'number') player.maxHp = data.player.maxHp;
                    if (typeof data.player.atk === 'number') player.stats.atk = data.player.atk;
                    if (typeof data.player.def === 'number') player.stats.def = data.player.def;
                }

                if (Array.isArray(data.inventory)) {
                    // Alpha M0.1 — lọc entry hỏng: id phải có trong ITEM_DATABASE, số lượng là số nguyên > 0.
                    const itemDb = window.ITEM_DATABASE || {};
                    const cleanEntries = data.inventory.filter(function(entry) {
                        return Array.isArray(entry) && entry.length >= 2
                            && typeof entry[0] === 'string' && itemDb[entry[0]]
                            && typeof entry[1] === 'number' && isFinite(entry[1]) && entry[1] > 0;
                    }).map(function(entry) { return [entry[0], Math.floor(entry[1])]; });
                    if (cleanEntries.length !== data.inventory.length) {
                        console.warn('Save System: bỏ qua', data.inventory.length - cleanEntries.length, 'mục inventory không hợp lệ.');
                    }
                    playerInventory.items = new Map(cleanEntries);
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
                            enemy.dispose(); // Alpha M1 (BUG-12): gỡ khỏi scene + giải phóng đủ tài nguyên (xem Slime.dispose)
                            enemies.splice(i, 1);
                        }

                        if (state.phase === 'respawning') {
                            // Alpha M0.1 — BUGFIX: slime đã hồi sinh DỞ trước khi reload không được lưu, nhưng
                            // spawnQueue đã lưu chỉ còn phần CHƯA spawn -> camp thiếu quái cả chu kỳ. Vì toàn bộ
                            // slime của camp vừa bị xoá ở trên, dựng lại hàng đợi ĐẦY ĐỦ theo composition.
                            const campCfg = CAMP_CONFIGS_BY_ID[campId];
                            if (campCfg) {
                                state.spawnQueue = [];
                                campCfg.composition.forEach(group => {
                                    for (let k = 0; k < group.count; k++) state.spawnQueue.push({ isLarge: group.isLarge });
                                });
                            }
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

                // Alpha M3 — cờ thưởng lần đầu của encounter (key tuỳ chọn, kiểm tra kiểu trong restoreEncounterSaveData).
                if (data.encounters && window.restoreEncounterSaveData) window.restoreEncounterSaveData(data.encounters);

                // Alpha M4/M6 (Save v2) — thế giới trước, nhiệm vụ sau (nhiệm vụ có thể đọc trạng thái thế giới khi hiển thị).
                // Save v1 đã được migrate nên luôn có 2 phần này (rỗng = chưa có tiến trình).
                if (window.WorldState) window.WorldState.restore(data.world || {});
                if (window.restoreStorySaveData) window.restoreStorySaveData(data.story || {});

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
                // Skip Opening (mục 1, chuẩn bị Alpha) — chỉ đọc lại đúng field boolean, KHÔNG có bước
                // chuyển đổi nào (khác cameraSensitivity phải chia 100). window.skipOpeningEnabled được
                // opening.js ĐỌC TRỰC TIẾP ngay khi trang vừa load (runGameLaunch()) — nhưng
                // applySaveData() chỉ chạy BÊN TRONG initThree() (SAU KHI opening.js đã quyết định xong
                // có Skip Opening hay không cho LẦN NÀY). Dòng này vì vậy không ảnh hưởng gì tới quyết
                // định Skip Opening của lần chạy hiện tại — chỉ đảm bảo window.skipOpeningEnabled luôn
                // đồng bộ đúng, để lần collectSaveData() TIẾP THEO (VD người chơi vừa tắt/bật lại toggle
                // trong Settings) không bị ghi đè nhầm bởi giá trị cũ. Xem window.onSettingsRestored
                // (index.html) — nơi đồng bộ UI checkbox theo giá trị này.
                if (data.settings && typeof data.settings.skipOpening === 'boolean') {
                    window.skipOpeningEnabled = data.settings.skipOpening;
                }
                // Fullscreen (Immersive Mode toggle) — cùng lý do timing với skipOpening ở trên:
                // window.fullscreenEnabled PHẢI được đọc bởi requestImmersiveMode() (scripts/opening.js)
                // NGAY lúc bấm nút Start — thời điểm đó XẢY RA TRƯỚC applySaveData() (hàm này chỉ chạy
                // bên trong initThree(), sau khi enterGameplay() đã gọi startGameplay()). Dòng dưới đây
                // vì vậy không ảnh hưởng gì tới quyết định Fullscreen của lần bấm Start VỪA XẢY RA —
                // opening.js đã tự đọc thẳng từ save data lúc đó rồi (xem requestImmersiveMode()) — chỉ
                // đảm bảo biến luôn đồng bộ đúng cho lần collectSaveData() tiếp theo.
                if (data.settings && typeof data.settings.fullscreenEnabled === 'boolean') {
                    window.fullscreenEnabled = data.settings.fullscreenEnabled;
                }
                if (window.onSettingsRestored) window.onSettingsRestored(data.settings || {});
            }
            window.applySaveData = applySaveData;

            // ============================================================
            // SAVE v2 (Alpha M5) — đọc / nâng cấp / kiểm tra / ghi
            // ============================================================
            // SaveSchema: hàm THUẦN (không đụng localStorage, không đụng state game) để test/đọc lại dễ:
            //   parse(raw)      -> { data } | { issue: 'malformed'|'invalid_structure'|'unsupported_version'|'future_version', version }
            //   migrate(data)   -> bản v2 (v1 -> v2: thêm meta/world/story rỗng, giữ nguyên MỌI field v1). Tất định: cùng
            //                      đầu vào -> cùng đầu ra; áp lên v2 thì trả bản sao y nguyên.
            //   sanitize(data)  -> { data, warnings } — chỉ giữ giá trị hợp lệ (kiểu + khoảng + id có thật), bỏ phần hỏng thay
            //                      vì tin mù quáng. Không bịa tiến trình: thiếu/hỏng -> giá trị mặc định của game.
            const SaveSchema = (function () {
                const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
                const num = (v, min, max) => typeof v === 'number' && isFinite(v) && v >= min && v <= max;
                const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
                const clone = (v) => JSON.parse(JSON.stringify(v));

                function parse(raw) {
                    let data;
                    try { data = JSON.parse(raw); } catch (e) { return { issue: 'malformed' }; }
                    if (!isObj(data)) return { issue: 'invalid_structure' };
                    const v = data.version;
                    if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v) return { issue: 'unsupported_version', version: v };
                    if (v > SAVE_SCHEMA_VERSION) return { issue: 'future_version', version: v };
                    if (v < SAVE_OLDEST_SUPPORTED_VERSION) return { issue: 'unsupported_version', version: v };
                    return { data: data, version: v };
                }

                function migrate(data) {
                    const out = clone(data);
                    if (out.version === 1) {
                        out.version = 2;
                        out.meta = { schema: 2, migratedFrom: 1 };
                        out.world = { discovered: [], activated: [], opened: [] };
                        out.story = {};
                    }
                    return out;
                }

                function cleanMember(m) {
                    if (!isObj(m) || !str(m.id, 64)) return null;
                    const c = { id: m.id };
                    if (m.weapon === null || typeof m.weapon === 'string' || isObj(m.weapon)) c.weapon = m.weapon;
                    if (Array.isArray(m.artifacts) && m.artifacts.length <= 50) c.artifacts = m.artifacts;
                    if (Array.isArray(m.talents) && m.talents.length <= 50) c.talents = m.talents;
                    if (num(m.constellation, 0, 6)) c.constellation = Math.floor(m.constellation);
                    if (num(m.level, 1, 90)) c.level = Math.floor(m.level);
                    if (num(m.exp, 0, 1e9)) c.exp = m.exp;
                    if (isObj(m.stats)) {
                        const s = {};
                        if (num(m.stats.maxHp, 1, 1e7)) s.maxHp = m.stats.maxHp;
                        if (num(m.stats.hp, 0, 1e7)) s.hp = (s.maxHp !== undefined) ? Math.min(m.stats.hp, s.maxHp) : m.stats.hp;
                        if (num(m.stats.atk, 0, 1e6)) s.atk = m.stats.atk;
                        if (num(m.stats.def, 0, 1e6)) s.def = m.stats.def;
                        c.stats = s;
                    }
                    if (num(m.energy, 0, 1000)) c.energy = m.energy;
                    return c;
                }

                function cleanReward(r) {
                    if (!isObj(r) || !str(r.type, 32) || !(window.REWARD_HANDLERS && window.REWARD_HANDLERS[r.type])) return null;
                    if (!num(r.amount, 0, 1e6)) return null;
                    const c = { type: r.type, amount: r.amount };
                    if (r.itemId !== undefined) { if (!str(r.itemId, 64)) return null; c.itemId = r.itemId; }
                    return c;
                }

                function cleanBoardQuest(q) {
                    if (!isObj(q) || !str(q.id, 96)) return null;
                    if (q.type !== 'kill' && q.type !== 'gather') return null;
                    if (!str(q.targetType, 64) || !num(q.targetCount, 1, 1e6) || !num(q.currentCount, 0, 1e6)) return null;
                    if (['active', 'completed', 'turned_in'].indexOf(q.status) === -1) return null;
                    const targetCount = Math.floor(q.targetCount);
                    const currentCount = Math.min(Math.floor(q.currentCount), targetCount);
                    return {
                        id: q.id,
                        title: typeof q.title === 'string' ? q.title.slice(0, 160) : '',
                        description: typeof q.description === 'string' ? q.description.slice(0, 400) : '',
                        type: q.type, targetType: q.targetType, targetCount: targetCount,
                        currentCount: currentCount,
                        // Đủ số lượng mà vẫn 'active' (mâu thuẫn) -> 'completed', đúng như lúc đạt đủ trong khi chơi (onEnemyKilled).
                        status: (q.status === 'active' && currentCount >= targetCount) ? 'completed' : q.status,
                        rewards: Array.isArray(q.rewards) ? q.rewards.map(cleanReward).filter(Boolean) : []
                    };
                }

                function cleanIdList(list, max) {
                    if (!Array.isArray(list)) return [];
                    return list.filter(id => str(id, 64)).slice(0, max);
                }

                function sanitize(input) {
                    const w = [];
                    const d = isObj(input) ? input : {};
                    const out = {
                        version: SAVE_SCHEMA_VERSION,
                        savedAt: num(d.savedAt, 0, 1e15) ? d.savedAt : 0,
                        meta: { schema: SAVE_SCHEMA_VERSION, migratedFrom: (isObj(d.meta) && d.meta.migratedFrom === 1) ? 1 : null }
                    };
                    // --- player
                    if (isObj(d.player)) {
                        const p = {}, sp = d.player.position;
                        if (isObj(sp) && num(sp.x, -50, 50) && num(sp.y, -20, 80) && num(sp.z, -50, 50)) p.position = { x: sp.x, y: sp.y, z: sp.z };
                        else if (sp !== undefined) w.push('player.position');
                        if (num(d.player.rotationY, -1e4, 1e4)) p.rotationY = d.player.rotationY;
                        if (num(d.player.primogem, 0, 1e9)) p.primogem = Math.floor(d.player.primogem);
                        else if (d.player.primogem !== undefined) w.push('player.primogem');
                        if (typeof d.player.characterName === 'string') p.characterName = d.player.characterName.slice(0, 40);   // kiểu sai -> bỏ (tên mặc định)
                        // Save rất cũ (trước Party System): chỉ số chung dưới player.* — giữ khi hợp lệ cho nhánh tương thích ngược.
                        ['hp', 'exp', 'level', 'maxHp', 'atk', 'def'].forEach(k => { if (num(d.player[k], 0, 1e9)) p[k] = d.player[k]; });
                        out.player = p;
                    }
                    // --- party
                    if (Array.isArray(d.party)) {
                        out.party = d.party.slice(0, 4).map(m => m === null ? null : cleanMember(m));
                        if (out.party.some((m, i) => m === null && d.party[i] !== null)) w.push('party.member');
                    }
                    if (Array.isArray(d.partySlots)) out.partySlots = d.partySlots.slice(0, 4).map(id => (id === null || str(id, 64)) ? id : null);
                    if (Array.isArray(d.partyBench)) out.partyBench = d.partyBench.slice(0, 16).map(cleanMember).filter(Boolean);
                    if (num(d.activeCharacterIndex, 0, 3)) out.activeCharacterIndex = Math.floor(d.activeCharacterIndex);
                    // --- inventory (id phải có trong ITEM_DATABASE, số lượng nguyên > 0)
                    if (Array.isArray(d.inventory)) {
                        const db = window.ITEM_DATABASE || {};
                        const seen = new Set();
                        out.inventory = d.inventory.filter(e => Array.isArray(e) && e.length >= 2 && str(e[0], 64)
                            && Object.prototype.hasOwnProperty.call(db, e[0]) && num(e[1], 1, 1e6) && !seen.has(e[0]) && seen.add(e[0]))
                            .map(e => [e[0], Math.floor(e[1])]);
                        if (out.inventory.length !== d.inventory.length) w.push('inventory');
                    }
                    // --- nhiệm vụ Bảng (lặp lại)
                    if (Array.isArray(d.activeQuests)) {
                        const ids = new Set();
                        out.activeQuests = d.activeQuests.map(cleanBoardQuest).filter(q => q && !ids.has(q.id) && ids.add(q.id));
                        if (out.activeQuests.length !== d.activeQuests.length) w.push('activeQuests');
                    }
                    if (isObj(d.questSlots)) {
                        const slot = (s) => (isObj(s) && str(s.defId, 64) && str(s.instanceId, 96)) ? { defId: s.defId, instanceId: s.instanceId } : null;
                        out.questSlots = { combat: slot(d.questSlots.combat), gathering: slot(d.questSlots.gathering) };
                    }
                    // --- camp (chu kỳ rương/hồi sinh) — chỉ camp có thật, chỉ field hợp lệ
                    if (isObj(d.campStates)) {
                        out.campStates = {};
                        (window.CAMP_CONFIGS || []).forEach(camp => {
                            const s = d.campStates[camp.id];
                            if (!isObj(s)) return;
                            const c = {};
                            if (s.phase === 'active' || s.phase === 'respawning') c.phase = s.phase;
                            if (num(s.respawnCountdown, 0, 3600)) c.respawnCountdown = s.respawnCountdown;
                            if (Array.isArray(s.spawnQueue) && s.spawnQueue.length <= 32) c.spawnQueue = s.spawnQueue.filter(x => isObj(x) && typeof x.isLarge === 'boolean').map(x => ({ isLarge: x.isLarge }));
                            if (num(s.spawnIntervalTimer, 0, 600)) c.spawnIntervalTimer = s.spawnIntervalTimer;
                            if (typeof s.cleared === 'boolean') c.cleared = s.cleared;
                            out.campStates[camp.id] = c;
                        });
                    }
                    // --- encounter M3 / thế giới M4 / nhiệm vụ chính M6: kiểm tra id sâu hơn nằm ở module sở hữu
                    if (isObj(d.encounters)) out.encounters = d.encounters;
                    out.world = isObj(d.world)
                        ? { discovered: cleanIdList(d.world.discovered, 200), activated: cleanIdList(d.world.activated, 200), opened: cleanIdList(d.world.opened, 200) }
                        : { discovered: [], activated: [], opened: [] };
                    out.story = isObj(d.story) ? d.story : {};
                    // --- settings
                    if (isObj(d.settings)) {
                        const s = {};
                        if (num(d.settings.cameraSensitivity, 10, 300)) s.cameraSensitivity = d.settings.cameraSensitivity;
                        if (typeof d.settings.skipOpening === 'boolean') s.skipOpening = d.settings.skipOpening;
                        if (typeof d.settings.fullscreenEnabled === 'boolean') s.fullscreenEnabled = d.settings.fullscreenEnabled;
                        out.settings = s;
                    }
                    return { data: out, warnings: w };
                }

                return { parse: parse, migrate: migrate, sanitize: sanitize };
            })();
            window.SaveSchema = SaveSchema;

            // Trạng thái vận hành của Save (không phải dữ liệu lưu): lần đọc/ghi gần nhất, lỗi, có đang chặn ghi hay không.
            const saveRuntime = {
                migratedFrom: null,       // 1 nếu phiên chơi này bắt đầu từ save v1 (ghi vào meta của các lần lưu sau)
                loadIssue: null,          // { code, version, backupKey } khi save hiện có KHÔNG đọc được
                blocked: false,           // true = save thuộc phiên bản MỚI HƠN -> không ghi đè cho tới khi người chơi chọn
                lastBody: null, lastJson: null, lastOkAt: 0, writes: 0, skippedUnchanged: 0, lastBytes: 0,
                failures: 0, failing: false, lastError: null, lastBlockedToastAt: 0,
                // notice = vấn đề của save có sẵn LÚC PHIÊN CHƠI BẮT ĐẦU, giữ tới khi đã báo cho người chơi (người chơi mới có
                // thể đã ghi save mới ở popup nhập tên TRƯỚC khi thế giới dựng xong -> loadIssue lúc đó đã về null).
                reported: false, notice: null, seenRaw: new Set()
            };

            function saveToast(icon, text) { if (window.showRewardPopup) window.showRewardPopup(icon, text); }

            // Alpha M0.1 — save không đọc được sẽ bị ghi đè sau đó -> giữ 1 bản sao thô để khôi phục/migrate thủ công.
            // Alpha M5 — chỉ ghi khi nội dung KHÁC bản đang giữ (loadGameData() chạy nhiều lần mỗi lần khởi động).
            function backupUnreadableSave(raw) {
                if (!raw) return null;
                const key = SAVE_KEY + '_unreadable_backup';
                try { if (localStorage.getItem(key) !== raw) localStorage.setItem(key, raw); } catch (e) { return null; }
                return key;
            }

            // Ghi nhận 1 lần/1 nội dung save (loadGameData() được opening.js gọi 3 lần + initThree() 1 lần).
            function recordLoadIssue(code, raw, version) {
                const backupKey = raw ? backupUnreadableSave(raw) : null;
                saveRuntime.loadIssue = { code: code, version: (version === undefined ? null : version), backupKey: backupKey };
                if (!saveRuntime.reported && !saveRuntime.notice) saveRuntime.notice = saveRuntime.loadIssue;
                // KHÔNG ghi đè ô lưu khi: save thuộc phiên bản mới hơn, HOẶC save hỏng mà không sao lưu được (bộ nhớ đầy/bị
                // chặn) — người chơi quyết định qua thông báo (reportLoadIssue). Save hỏng đã sao lưu được: chơi mới bình thường.
                if (code === 'future_version' || (raw && !backupKey)) saveRuntime.blocked = true;
                const tag = code + '|' + (raw ? raw.length + ':' + raw.slice(0, 64) : '');
                if (saveRuntime.seenRaw.has(tag)) return;
                saveRuntime.seenRaw.add(tag);
                if (code === 'future_version') {
                    console.warn('Save System: dữ liệu lưu không đúng phiên bản (v' + version + ' mới hơn v' + SAVE_SCHEMA_VERSION + ') — bỏ qua, giữ nguyên bản gốc và TẠM KHÔNG ghi đè.');
                } else if (code === 'storage_unavailable') {
                    console.warn('Save System: lỗi đọc bộ nhớ trình duyệt (localStorage bị chặn) — bỏ qua, chơi không lưu.');
                } else {
                    console.warn('Save System: lỗi đọc dữ liệu lưu (' + code + ') — bỏ qua, đã sao lưu bản gốc vào', backupKey, 'và bắt đầu hành trình mới.');
                }
            }

            // Đọc save: null khi chưa có / không dùng được (KHÔNG throw — save hỏng không được làm crash game, mục 1 spec gốc).
            // Được gọi nhiều lần mỗi lần khởi động -> mọi tác dụng phụ (sao lưu, log) đều idempotent.
            function loadGameData() {
                let raw = null;
                try { raw = localStorage.getItem(SAVE_KEY); }
                catch (e) { recordLoadIssue('storage_unavailable', null); return null; }
                if (!raw) { saveRuntime.loadIssue = null; return null; }
                const parsed = SaveSchema.parse(raw);
                if (parsed.issue) { recordLoadIssue(parsed.issue, raw, parsed.version); return null; }
                saveRuntime.loadIssue = null;
                let data = parsed.data;
                if (data.version < SAVE_SCHEMA_VERSION) {
                    // Nâng cấp tất định trong bộ nhớ; bản v1 gốc được sao lưu 1 lần (không ghi đè bản sao lưu đã có).
                    try { if (localStorage.getItem(SAVE_KEY + '_v1_backup') === null) localStorage.setItem(SAVE_KEY + '_v1_backup', raw); } catch (e) { /* chỉ là bản sao lưu phụ */ }
                    data = SaveSchema.migrate(data);
                    saveRuntime.migratedFrom = 1;
                    if (!saveRuntime.seenRaw.has('migrated')) { saveRuntime.seenRaw.add('migrated'); console.info('Save System: đã nâng cấp dữ liệu lưu v1 -> v' + SAVE_SCHEMA_VERSION + ' (bản gốc: ' + SAVE_KEY + '_v1_backup).'); }
                } else if (data.meta && data.meta.migratedFrom === 1) {
                    saveRuntime.migratedFrom = 1;
                }
                const res = SaveSchema.sanitize(data);
                if (res.warnings.length && !saveRuntime.seenRaw.has('warn:' + res.warnings.join(','))) {
                    saveRuntime.seenRaw.add('warn:' + res.warnings.join(','));
                    console.warn('Save System: bỏ qua dữ liệu lưu không hợp lệ ở', res.warnings.join(', '), '— dùng giá trị mặc định cho phần đó.');
                }
                return res.data;
            }
            window.loadGameData = loadGameData;

            function onSaveFailure(e) {
                saveRuntime.failures++;
                saveRuntime.lastError = (e && (e.name || e.message)) || 'unknown';
                console.warn('Save System: không thể ghi dữ liệu lưu.', e);
                if (!saveRuntime.failing) {
                    saveRuntime.failing = true;
                    saveToast('fa-solid fa-triangle-exclamation text-red-400', 'Không lưu được tiến trình (bộ nhớ trình duyệt đầy hoặc bị chặn)');
                }
            }

            // Ghi ngay xuống localStorage (cấp thấp, không debounce). Trả { ok, … } — KHÔNG báo thành công khi ghi hỏng.
            //   - Đang reset / đang chặn (save của phiên bản mới hơn) -> không ghi.
            //   - Nội dung KHÔNG đổi so với lần ghi trước (bỏ qua savedAt) và ô lưu vẫn đúng bản đó -> bỏ qua (autosave 10 s
            //     không còn ghi lặp dữ liệu y hệt khi người chơi đứng yên).
            function saveGameNow() {
                // Đang trong quá trình reset (đã xoá xong, chờ reload()) — TUYỆT ĐỐI không ghi lại (xem resetSaveData()).
                if (isResettingSave) return { ok: false, skipped: 'resetting' };
                if (saveRuntime.blocked) {
                    const now = Date.now();
                    if (now - saveRuntime.lastBlockedToastAt > 60000) {
                        saveRuntime.lastBlockedToastAt = now;
                        saveToast('fa-solid fa-lock text-amber-300', 'Tiến trình chưa được lưu — đang giữ nguyên dữ liệu lưu không đọc được');
                    }
                    return { ok: false, skipped: 'blocked' };
                }
                let data;
                try { data = collectSaveData(); }
                catch (e) { onSaveFailure(e); return { ok: false, error: 'collect_failed' }; }
                const body = JSON.stringify(Object.assign({}, data, { savedAt: 0 }));
                if (body === saveRuntime.lastBody) {
                    let current = null;
                    try { current = localStorage.getItem(SAVE_KEY); } catch (e) { current = null; }
                    if (current !== null && current === saveRuntime.lastJson) { saveRuntime.skippedUnchanged++; return { ok: true, unchanged: true }; }
                }
                const json = JSON.stringify(data);
                try {
                    localStorage.setItem(SAVE_KEY, json);
                } catch (e) {
                    // localStorage đầy hoặc bị chặn — không throw (game vẫn chơi được), nhưng báo rõ cho người chơi 1 lần/chuỗi lỗi.
                    onSaveFailure(e);
                    return { ok: false, error: saveRuntime.lastError };
                }
                saveRuntime.lastBody = body;
                saveRuntime.lastJson = json;
                saveRuntime.lastOkAt = Date.now();
                saveRuntime.writes++;
                saveRuntime.lastBytes = json.length;
                if (saveRuntime.failing) {
                    saveRuntime.failing = false;
                    saveToast('fa-solid fa-floppy-disk text-emerald-300', 'Đã lưu lại được tiến trình');
                }
                return { ok: true };
            }
            window.saveGameNow = saveGameNow;

            // Thông báo vấn đề khi đọc save — gọi 1 lần sau applySaveData() (initThree, 04). Đang chặn ghi (phiên bản mới hơn /
            // hỏng mà không sao lưu được): hỏi người chơi (giữ nguyên + chơi không lưu, hoặc ghi đè bằng hành trình mới).
            // Save hỏng đã sao lưu bản gốc: chỉ báo.
            function reportLoadIssue() {
                const issue = saveRuntime.notice || saveRuntime.loadIssue;
                if (!issue || saveRuntime.reported) return;
                saveRuntime.reported = true;
                if (saveRuntime.blocked) { showLoadIssueNotice(issue); return; }
                if (issue.code === 'storage_unavailable') { saveToast('fa-solid fa-triangle-exclamation text-red-400', 'Trình duyệt chặn bộ nhớ lưu — tiến trình sẽ không được lưu'); return; }
                saveToast('fa-solid fa-triangle-exclamation text-amber-300', 'Dữ liệu lưu cũ bị hỏng — đã sao lưu bản gốc, bắt đầu hành trình mới');
            }

            function showLoadIssueNotice(issue) {
                if (document.getElementById('save-issue-overlay')) return;
                const ov = document.createElement('div');
                ov.id = 'save-issue-overlay';
                ov.setAttribute('role', 'dialog');
                ov.style.cssText = 'position:fixed;inset:0;z-index:95;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);padding:16px;pointer-events:auto';
                ov.innerHTML = '<div style="background:rgba(18,16,30,.97);border:1px solid rgba(235,220,185,.4);border-radius:16px;padding:20px;max-width:380px;width:100%;color:#f7e8cf;font-family:inherit;display:flex;flex-direction:column;gap:12px">' +
                    '<div style="font-size:17px;font-weight:700;color:#fde68a">Không thể đọc dữ liệu lưu</div>' +
                    '<div style="font-size:13px;line-height:1.5;color:#d6d3d1">' + (issue.code === 'future_version'
                        ? 'Dữ liệu lưu thuộc phiên bản mới hơn của trò chơi (v' + Number(issue.version) + '). Bản này không đọc được nó. '
                        : 'Dữ liệu lưu bị hỏng và không sao lưu được (bộ nhớ trình duyệt đầy hoặc bị chặn). ') +
                    'Bản gốc được <b>giữ nguyên</b> và trò chơi sẽ <b>không ghi đè</b> cho tới khi bạn chọn.</div>' +
                    '<button id="save-issue-keep" style="padding:10px;border-radius:10px;border:1px solid rgba(156,148,192,.5);background:transparent;color:#d6d3d1;font-size:14px;font-weight:600;cursor:pointer">Chơi tiếp, không lưu</button>' +
                    '<button id="save-issue-overwrite" style="padding:10px;border-radius:10px;border:0;background:#f59e0b;color:#12101e;font-size:14px;font-weight:700;cursor:pointer">Bắt đầu hành trình mới (ghi đè)</button></div>';
                document.body.appendChild(ov);
                const close = () => { if (ov.parentNode) ov.parentNode.removeChild(ov); };
                ov.querySelector('#save-issue-keep').addEventListener('click', close);
                ov.querySelector('#save-issue-overwrite').addEventListener('click', () => { close(); allowOverwrite(); });
            }

            // Người chơi chọn ghi đè: bỏ chặn và lưu ngay (bản gốc vẫn còn trong SAVE_KEY + '_unreadable_backup').
            function allowOverwrite() {
                saveRuntime.blocked = false;
                const r = saveGameNow();
                if (r.ok) saveToast('fa-solid fa-floppy-disk text-emerald-300', 'Đã bắt đầu lưu hành trình mới');
                return r;
            }

            window.SaveSystem = {
                KEY: SAVE_KEY,
                VERSION: SAVE_SCHEMA_VERSION,
                schema: SaveSchema,
                reportLoadIssue: reportLoadIssue,
                allowOverwrite: allowOverwrite,
                getStatus() {
                    return {
                        version: SAVE_SCHEMA_VERSION, blocked: saveRuntime.blocked, loadIssue: saveRuntime.loadIssue ? Object.assign({}, saveRuntime.loadIssue) : null,
                        migratedFrom: saveRuntime.migratedFrom, lastOkAt: saveRuntime.lastOkAt, writes: saveRuntime.writes,
                        skippedUnchanged: saveRuntime.skippedUnchanged, lastBytes: saveRuntime.lastBytes,
                        failures: saveRuntime.failures, failing: saveRuntime.failing, lastError: saveRuntime.lastError,
                        notice: saveRuntime.notice ? Object.assign({}, saveRuntime.notice) : null, noticeShown: saveRuntime.reported
                    };
                }
            };

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
            //
            // BUGFIX (v0.9): setInterval này chạy TOP-LEVEL ngay khi file load — TRƯỚC KHI Opening Flow
            // (scripts/opening.js) kịp kiểm tra loadGameData() để quyết định hiện Character Name Popup.
            // Nếu Opening mất hơn 10 giây để tới bước kiểm tra (logo.mp4 dài, hoặc người chơi xem lâu ở
            // màn Background), interval này ĐÃ KỊP chạy ít nhất 1 lần và ghi 1 bản save "mặc định" (tên
            // nhân vật hard-code sẵn trong CHARACTER_DATA, VD "Traveler" hoặc tên còn sót trong bộ nhớ
            // từ code) vào localStorage — khiến loadGameData() trả về KHÁC null dù người chơi vừa xoá
            // save xong, làm Opening tưởng nhầm "đã có save" và bỏ qua popup nhập tên (dù thực ra chưa
            // ai nhập gì). Guard bằng window.isOpeningActive — cờ này mặc định true (đặt tại đầu
            // 07-input-handlers.js, tắt = false trong enterGameplay() khi Opening kết thúc) — không ghi
            // gì xuống localStorage cho tới khi gameplay THẬT SỰ bắt đầu.
            const POSITION_AUTOSAVE_INTERVAL_MS = 10000;
            setInterval(() => {
                if (window.isOpeningActive) return;
                saveGameNow();
            }, POSITION_AUTOSAVE_INTERVAL_MS);

            // Lưu ngay lập tức (KHÔNG debounce) khi người chơi rời trang/đóng tab — cơ hội cuối cùng để
            // ghi trạng thái mới nhất, vì setTimeout của requestSave() có thể không kịp chạy nếu trang
            // đóng ngay sau đó. Guard tương tự — nếu người chơi đóng tab ngay TRONG LÚC Opening đang
            // chạy (chưa từng nhập tên/vào gameplay), không được phép ghi save "rỗng" đè lên bất kỳ save
            // cũ nào (hoặc tạo save mới không mong muốn khi lẽ ra phải là "chưa có save").
            window.addEventListener('beforeunload', () => {
                if (window.isOpeningActive) return;
                saveGameNow();
            });

            // --- SESSION RESUME: AUTOSAVE KHI TAB BỊ ẨN (Hidden Update — Session Resume) ---
            // Khác 'beforeunload' (trang THỰC SỰ đóng) — 'visibilitychange' bắn khi người chơi chuyển
            // app khác, khoá màn hình, hoặc đổi tab, nhưng trang KHÔNG đóng và KHÔNG reload. Gameplay
            // vẫn sống nguyên trong RAM (scene 3D/state JS không bị huỷ) — đây KHÔNG phải Return to
            // Title Flow (runReturnToTitleFlow(), scripts/opening.js) nên KHÔNG đóng băng
            // window.isGamePaused hay hiện lại #opening-root, chỉ ghi 1 bản save phòng trường hợp
            // trình duyệt/hệ điều hành giải phóng RAM và kill tab thật sự trong lúc ẩn — nếu Session
            // Resume trong RAM không còn khả thi (tab bị kill thật), Cold Start sau đó vẫn khôi phục
            // được gần đúng tiến trình qua loadGameData(), thay vì mất sạch từ lần autosave định kỳ
            // 10s trước đó. Guard bằng isOpeningActive giống các điểm ghi khác — không ghi save "rỗng"
            // nếu người chơi ẩn tab ngay trong lúc Opening đang chạy (chưa vào gameplay thật).
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState !== 'hidden') return;
                if (window.isOpeningActive) return;
                saveGameNow();
            });

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

                // Alpha M7: huỷ Attack đang giữ / đang charge, Aim (kể cả cờ cung #2 + mũi tên xem trước) và Held Skill #5/#6
                // — mouseup/touchend bị bỏ qua khi đã gục nên cờ "đang giữ" từng kẹt sang lúc hồi sinh. Cùng đường huỷ như mất
                // focus / mở Paimon Menu (M1): không ra đòn, không cooldown. Chạy TRƯỚC khối reset phase bên dưới (giữ nguyên).
                if (window.cancelHeldCombatInput) window.cancelHeldCombatInput('dead');
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

                // --- FALL DAMAGE BUGFIX (Pre-Alpha Stabilization) ---
                // Trước đây fallStartY (đỉnh cao nhất được theo dõi — xem updatePhysics(), khối "FALL
                // DAMAGE: theo dõi đỉnh cao nhất của chu kỳ rơi hiện tại") không phân biệt "đang rơi tự
                // do" với "đang Gliding" — nó chỉ reset khi player.isGrounded. Hệ quả: quãng đường đã
                // LƯỢN êm ái (Gliding chủ động giảm tốc rơi xuống velocity.y cố định -1.35, gần như
                // không gây nguy hiểm) vẫn bị cộng dồn vào fallHeight khi hạ cánh, gây sát thương sai.
                //
                // Fix: NGAY khi thoát Gliding (dù do bấm Jump lần 2, hết Stamina, hay bất kỳ lý do nào
                // khác — deactivateGlider() là điểm thoát DUY NHẤT, sửa ở đây fix được mọi trường hợp),
                // reset fallStartY về đúng độ cao hiện tại. Điều này coi mỗi lần thoát Glide là khởi đầu
                // 1 chu kỳ rơi MỚI — đúng quyết định đã chốt: "chỉ tính quãng đường SAU khi thoát Glide,
                // bỏ qua cả quãng rơi trước khi vào Glide lẫn quãng đã lượn".
                player.fallStartY = player.position.y;
            }
            window.deactivateGlider = deactivateGlider;

            // Plunge Attack, Melee Attack, Elemental Skill, Elemental Burst đã tách sang combat.js
            // (load SAU file này — xem giải thích thứ tự load ở đầu combat.js).

            function triggerDash() {
                if (player.isDrowning || skillAimState.phase === 'aiming') return;

                // Tích hợp Hành vi Swim Fast nếu đang bơi
                if (player.isSwimming) {
                    // --- STAMINA GUARD: bấm Dash trong lúc bơi = 1 con đường khác để vào Swim Sprint
                    // (kết quả cuối là swimState='fast', giống hệt nhánh giữ-nút-dash trong
                    // updatePhysics()) — dùng SWIM_SPRINT_START_COST (-2), KHÔNG dùng DASH_COST (-18),
                    // vì đây không phải Dash trên cạn (đã chốt trong lịch sử trò chuyện).
                    if (player.stamina < STAMINA_CONFIG.SWIM_SPRINT_START_COST) {
                        sfx.playBlockedSound();
                        return;
                    }

                    const wasAlreadySprinting = player.swimState === 'fast';
                    player.swimState = 'fast';
                    player.swimFastTimer = 1.2; // Thời gian burst duy trì sau khi dash
                    if (!wasAlreadySprinting) {
                        // Chỉ trừ chi phí KHỞI ĐỘNG nếu chưa đang ở Swim Sprint — tránh trừ lặp nếu
                        // người chơi bấm Dash liên tiếp trong lúc đã đang giữ Sprint bơi.
                        player.stamina = Math.max(STAMINA_CONFIG.MIN_STAMINA, player.stamina - STAMINA_CONFIG.SWIM_SPRINT_START_COST);
                    }
                    player.swimStrokeTimer = 0.0; // đồng bộ với nhánh updateStamina() — Swim Sprint không dùng Stroke Timer

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

                // --- STAMINA GUARD: Dash trên cạn tiêu DASH_COST (18.0) — không đủ thì không cho Dash. ---
                if (player.stamina < STAMINA_CONFIG.DASH_COST) {
                    sfx.playBlockedSound();
                    return;
                }

                player.isDashing = true;
                player.dashTimer = player.dashDuration;
                player.ghostSpawnTimer = 0; 
                player.stamina = Math.max(STAMINA_CONFIG.MIN_STAMINA, player.stamina - STAMINA_CONFIG.DASH_COST);

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

