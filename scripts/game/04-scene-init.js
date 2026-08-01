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

                // ============================================================
                // PARTY SYSTEM (Pre-Alpha v0.8.5) — dựng mesh cho TỪNG Character trong Party
                // ============================================================
                // buildCharacterMesh(bodyColor): dựng 1 bộ mesh HOÀN CHỈNH (body, visor, sword,
                // slashWave, gliderGroup) — TÁCH RA từ khối code dựng playerGroup cũ (trước v0.8.5 chỉ
                // dựng đúng 1 lần cho player duy nhất) để mỗi Character trong Party có bộ mesh RIÊNG,
                // độc lập hoàn toàn (không dùng chung 1 THREE.Group) — đúng quyết định thiết kế Party:
                // "mỗi Character có mesh riêng, ẩn/hiện khi switch". Thứ tự add() vào group PHẢI giữ
                // NGUYÊN VẸN (body=children[0], visor=children[1]) vì rất nhiều nơi trong
                // 08-physics-combat-camera-loop.js/combat.js truy cập player.mesh.children[0]/[1] trực
                // tiếp theo thứ tự này (không tra theo tên) — đổi thứ tự sẽ làm sai animation.
                // Trả về { group, sword, slashWave, gliderGroup } — switchToCharacter() dùng để cập
                // nhật lại các con trỏ player.mesh/player.sword/player.slashWave/player.gliderGroup mỗi
                // khi đổi Character đang điều khiển.
                function buildCharacterMesh(bodyColor) {
                    const playerGroup = new THREE.Group();
                    const bodyGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.8, 16);
                    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 1.0, metalness: 0.0 });
                    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
                    bodyMesh.position.y = 0; bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
                    playerGroup.add(bodyMesh); // children[0] — KHÔNG đổi thứ tự

                    const visorGeo = new THREE.BoxGeometry(0.5, 0.2, 0.3);
                    const visorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 1.0, metalness: 0.0 });
                    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
                    visorMesh.position.set(0, 0.5, 0.35); visorMesh.castShadow = true;
                    playerGroup.add(visorMesh); // children[1] — KHÔNG đổi thứ tự

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

                    const slashGeo = new THREE.RingGeometry(0.8, 1.6, 32, 1, 0, Math.PI);
                    const slashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
                    const slash = new THREE.Mesh(slashGeo, slashMat);
                    slash.rotation.x = Math.PI / 2; slash.position.set(0, 0.2, 0.9); slash.visible = false;
                    playerGroup.add(slash);

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

                    playerGroup.visible = false; // Mặc định ẩn — initParty() sẽ hiện đúng 1 mesh (active)
                    scene.add(playerGroup);

                    return { group: playerGroup, sword, slashWave: slash, gliderGroup };
                }
                window.buildCharacterMesh = buildCharacterMesh;

                initParty(); // Dựng partyState + mesh cho từng Character, active mesh đầu tiên = Traveler

                cameraState.currentFocus.set(player.position.x, player.position.y + cameraState.targetYOffset, player.position.z);
                cameraState.targetFocus.copy(cameraState.currentFocus);

                createObstacles();
                createEnvironmentProps();
                createWaterAreas();
                createCamps();
                createChests();
                createTestEnemies();
                createInteractables();

                // Infrastructure Update #1 — Save System: áp dụng dữ liệu đã lưu (nếu có) NGAY SAU KHI
                // toàn bộ world (slime, chest, quest board...) đã được tạo xong ở trạng thái mặc định —
                // applySaveData() sẽ ghi đè lên đúng những gì cần khôi phục (vị trí player, inventory,
                // quest, chu kỳ camp/chest...). Nếu chưa từng lưu (loadGameData() trả về null),
                // applySaveData() no-op, game giữ nguyên trạng thái mặc định vừa khởi tạo — tự động là
                // "hành trình mới" đúng yêu cầu mục 1 spec, không cần logic New Game riêng.
                const existingSaveData = loadGameData();
                applySaveData(existingSaveData);

                // Pre-Alpha v0.8 (Character, UI adjustment) — hành trình MỚI (chưa từng có save data)
                // thì hiện popup yêu cầu nhập tên nhân vật NGAY LÚC BẮT ĐẦU, đúng 1 lần duy nhất (từ
                // lần chơi kế tiếp trở đi, characterName đã có trong save data — xem applySaveData()
                // ở trên — nên existingSaveData sẽ khác null và nhánh này không chạy nữa). Gọi SAU
                // applySaveData() (không phải trước) để chắc chắn đây thực sự là hành trình mới chứ
                // không phải save data lỗi/thiếu field characterName (save cũ trước v0.8 vẫn có
                // existingSaveData khác null, không nên hiện lại prompt dù thiếu characterName).
                if (!existingSaveData && window.showPlayerNamePrompt) {
                    window.showPlayerNamePrompt();
                }

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
                [-30.0, 6.6, 21.6, 1.8, 1.8, 2.0],    // đỉnh (lệch về phía trái, không đối xứng)
                // --- Cụm C
                [40.0, 0.0, 20.0, 20.0, 3.0, 20.0],
                [40.0, 3.0, 20.0, 15.0, 2.0, 15.0],
                [40.0, 6.0, 20.0, 10.0, 2.0, 10.0],
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

