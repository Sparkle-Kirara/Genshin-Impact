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
                    const trunkH = 5.0 + rng() * 1.2;
                    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.24, trunkH, 7);
                    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1.0 });
                    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                    trunk.position.y = trunkH / 2;
                    trunk.castShadow = true; trunk.receiveShadow = true;
                    group.add(trunk);

                    const leavesColors = [0x4d7c4a, 0x5b8c52, 0x3f6b3d];
                    const leavesMat = new THREE.MeshStandardMaterial({ color: leavesColors[Math.floor(rng() * leavesColors.length)], roughness: 0.95 });
                    const leafCount = 3 + Math.floor(rng() * 2);
                    for (let i = 0; i < leafCount; i++) {
                        const r = 2.0 + rng() * 0.5 - i * 0.15;
                        const leafGeo = new THREE.SphereGeometry(Math.max(0.5, r), 8, 6);
                        const leaf = new THREE.Mesh(leafGeo, leavesMat);
                        leaf.position.set((rng() - 0.5) * 0.6, trunkH + i * 0.7, (rng() - 0.5) * 0.6);
                        leaf.castShadow = true;
                        group.add(leaf);
                    }
                    return group;
                },
                rock(rng) {
                    const scale = 0.9 + rng() * 0.9;
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
                    const clumps = 3 + Math.floor(rng() * 2);
                    for (let i = 0; i < clumps; i++) {
                        const r = 0.75 + rng() * 0.2;
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
                    const count = 30 + Math.floor(rng() * 6);
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
                    const h = 0.6 + rng() * 0.15;
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
                    const trunkH = 5.0 + rng() * 3.0; // ~2x cây thường (1.8-3.0 -> 3.4-5.2)
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
                        const r = 3.0 + rng() * 0.9 - i * 0.18;
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
                    const trunkH = 4.0 + rng() * 0.6;
                    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, trunkH, 7);
                    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1.0 });
                    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                    trunk.position.y = trunkH / 2;
                    trunk.castShadow = true; trunk.receiveShadow = true;
                    group.add(trunk);

                    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x5f9c4f, roughness: 0.9 });
                    const canopyY = trunkH + 0.6;
                    const canopyRadius = 2.1 + rng() * 0.3;
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
                    radius: 20,
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
                // Export global — save system (06-camps-save-system.js) cần truy cập questBoard.questSlots
                // để khôi phục ĐÚNG instanceId đã cấp trước lúc lưu (xem applySaveData() — bugfix "quest
                // hái lượm bị cấp lại instance mới khi reload, quest cũ dở dang không thể trả").
                window.questBoard = questBoard;

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

