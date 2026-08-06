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
                    0, 0, 1, 1, 0, 1,                [20.0, 10.0, 60.0, 2.0, 2.0, 2.0],

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

                // GỠ BỎ (v0.9 — dọn dẹp code chết): trước đây có gọi window.showPlayerNamePrompt() ở
                // đây (Pre-Alpha v0.8, popup nhập tên cũ #player-name-prompt-overlay) cho hành trình
                // mới. Từ v0.9, Character Name Popup ĐÃ được tích hợp vào Opening/Title Screen
                // (scripts/opening.js — runBackgroundStage(), dùng chung đúng window.setCharacterName()
                // + window.requestSave()) và chạy TRƯỚC KHI initThree() từng được gọi (enterGameplay()
                // gọi window.startGameplay() sau khi người chơi đã xác nhận tên xong ở Opening Screen).
                // Gọi lại ở đây là thừa (đường gọi cũ đã bị thay thế hoàn toàn) và từng có race
                // condition với debounce 300ms của requestSave() (initThree() chạy đồng bộ ngay sau khi
                // Confirm Name, có thể sớm hơn lúc requestSave() thực sự ghi xong localStorage — khiến
                // loadGameData() ở dòng 306 phía trên vẫn trả về null ngay cả khi tên vừa được xác nhận
                // xong). Xoá hẳn thay vì sửa timing vì luồng nhập tên chính thức giờ là Opening Screen,
                // không cần đường dự phòng này nữa.

                playtestMetrics.lastPosition.copy(player.position);
            }
            window.initThree = initThree;

            // --- FONT LƯỚI ĐIỂM 5x7 (DOT-MATRIX) + generateTextWall() ---
            // Thay cho việc gõ tay từng khối [x,y,z,w,h,d] cho mỗi chữ cái (cách cũ dùng để dựng chữ W
            // — xem lịch sử: 14 khối zigzag thủ công, không đồng bộ font, tốn công nhân bản cho từng
            // chữ). Chuẩn "dot-matrix 5x7" là bảng bit quen thuộc (kiểu LED sign/Arduino): mỗi ký tự là
            // lưới 7 hàng x 5 cột, hàng đầu tiên trong mảng là ĐỈNH chữ (duyệt xuống = Y giảm dần khi
            // build). Bit 1 = có khối đá tại ô đó, bit 0 = để trống (không tạo mesh, tiết kiệm
            // obstacles). Chỉ cần thêm ký tự mới vào FONT_5x7 là dùng được ngay, không đụng gì logic
            // generateTextWall() bên dưới.
            const FONT_5x7 = {
                'A': ["01110","10001","10001","11111","10001","10001","10001"],
                'B': ["11110","10001","10001","11110","10001","10001","11110"],
                'C': ["01111","10000","10000","10000","10000","10000","01111"],
                'D': ["11110","10001","10001","10001","10001","10001","11110"],
                'E': ["11111","10000","10000","11110","10000","10000","11111"],
                'F': ["11111","10000","10000","11110","10000","10000","10000"],
                'G': ["01111","10000","10000","10011","10001","10001","01111"],
                'H': ["10001","10001","10001","11111","10001","10001","10001"],
                'I': ["11111","00100","00100","00100","00100","00100","11111"],
                'J': ["00111","00010","00010","00010","00010","10010","01100"],
                'K': ["10001","10010","10100","11000","10100","10010","10001"],
                'L': ["10000","10000","10000","10000","10000","10000","11111"],
                'M': ["10001","11011","10101","10101","10001","10001","10001"],
                'N': ["10001","11001","10101","10101","10011","10001","10001"],
                'O': ["01110","10001","10001","10001","10001","10001","01110"],
                'P': ["11110","10001","10001","11110","10000","10000","10000"],
                'Q': ["01110","10001","10001","10001","10101","10010","01101"],
                'R': ["11110","10001","10001","11110","10100","10010","10001"],
                'S': ["01111","10000","10000","01110","00001","00001","11110"],
                'T': ["11111","00100","00100","00100","00100","00100","00100"],
                'U': ["10001","10001","10001","10001","10001","10001","01110"],
                'V': ["10001","10001","10001","10001","10001","01010","00100"],
                'W': ["10001","10001","10001","10101","10101","10101","01010"],
                'X': ["10001","10001","01010","00100","01010","10001","10001"],
                'Y': ["10001","10001","01010","00100","00100","00100","00100"],
                'Z': ["11111","00001","00010","00100","01000","10000","11111"],
                ' ': ["00000","00000","00000","00000","00000","00000","00000"],
                // --- Ký tự đặc biệt (dấu câu, ký hiệu bàn phím) — cùng lưới 5x7, dùng chung
                // generateTextWall(), không cần hàm riêng. Thêm ký tự mới chỉ cần thêm 1 dòng ở đây.
                ':': ["00000","01100","01100","00000","01100","01100","00000"],
                ',': ["00000","00000","00000","00000","00000","01100","01000"],
                '.': ["00000","00000","00000","00000","00000","01100","01100"],
                '!': ["00100","00100","00100","00100","00100","00000","00100"],
                '@': ["01110","10001","10111","10101","10111","10000","01111"],
                '#': ["01010","01010","11111","01010","11111","01010","01010"],
                '$': ["00100","01111","10100","01110","00101","11110","00100"],
                '^': ["00100","01010","10001","00000","00000","00000","00000"],
                '&': ["01100","10010","10100","01000","10101","10010","01101"],
                '*': ["00000","10101","01110","11111","01110","10101","00000"],
                '(': ["00010","00100","01000","01000","01000","00100","00010"],
                ')': ["01000","00100","00010","00010","00010","00100","01000"],
            };

            // generateTextWall(lines, opts) — sinh mảng entries [x,y,z,w,h,d] cho nhiều dòng chữ, mỗi
            // dòng center-align riêng theo dòng RỘNG NHẤT (không phải theo world gốc), để cả khối text
            // nhìn thẳng hàng ở giữa dù độ dài từng dòng khác nhau (VD "WELCOME TO" ngắn hơn "GENSHIN
            // IMPACT" — spec Hidden Update, checkpoint chữ WELCOME).
            //   lines: mảng string, VD ["WELCOME TO", "GENSHIN IMPACT"]
            //   opts.centerX/opts.topY/opts.z: tâm X, đỉnh Y của DÒNG ĐẦU TIÊN, và mặt phẳng Z cố định
            //   opts.spacing: khoảng cách tâm-tâm giữa 2 pixel liền kề (>= blockSize để có khe hở)
            //   opts.blockSize: cạnh khối lập phương (mặc định 2.0, khớp CLIMB_WALL_CONFIGS hiện có)
            //   opts.lineGap: khoảng trống Y thêm giữa 2 dòng, ngoài 7 hàng của font (mặc định = spacing)
            function generateTextWall(lines, opts) {
                const { centerX = 0, topY = 0, z = 60, spacing = 2.5, blockSize = 2.0, lineGap = spacing } = opts;
                const COLS = 5, ROWS = 7;
                const entries = [];

                // Bề rộng (số cột pixel, kể cả khoảng trắng giữa các chữ) của 1 dòng — dùng để center-align.
                function lineWidthInCols(line) {
                    // Mỗi ký tự chiếm COLS cột + 1 cột đệm ngăn cách với ký tự kế (trừ ký tự cuối).
                    return line.length * COLS + (line.length - 1);
                }
                const maxCols = Math.max(...lines.map(lineWidthInCols));

                lines.forEach((line, lineIndex) => {
                    const lineCols = lineWidthInCols(line);
                    // Căn giữa: dòng ngắn hơn dịch vào trong (maxCols - lineCols) / 2 cột so với dòng dài nhất.
                    const startCol = (maxCols - lineCols) / 2;
                    const lineTopY = topY - lineIndex * (ROWS * spacing + lineGap);

                    let col = startCol;
                    for (const ch of line) {
                        const glyph = FONT_5x7[ch.toUpperCase()];
                        if (!glyph) { col += COLS + 1; continue; } // ký tự không có trong font — bỏ qua, vẫn chừa chỗ

                        for (let row = 0; row < ROWS; row++) {
                            for (let c = 0; c < COLS; c++) {
                                if (glyph[row][c] !== '1') continue;
                                const x = centerX + (col + c - maxCols / 2) * spacing;
                                const y = lineTopY - row * spacing;
                                entries.push([x, y, z, blockSize, blockSize, blockSize]);
                            }
                        }
                        col += COLS + 1; // qua ký tự kế, +1 cột đệm
                    }
                });

                return entries;
            }

            // --- generateIconWall(grid, opts) — LƯỚI BIT TÙY Ý CHO ICON/LOGO/KÝ HIỆU ---
            // Khác generateTextWall() ở chỗ KHÔNG ép cứng lưới 5x7 theo từng ký tự — nhận thẳng 1 lưới
            // bit hình chữ nhật kích thước bất kỳ (VD 24x24 cho icon chi tiết, hay chữ nhật lệch như
            // 30x18), phù hợp logo nguyên tố, hình vẽ tự do (trái tim, ngôi sao...), hoặc bất kỳ pixel
            // art nào bạn tự phác thảo bằng chuỗi '0'/'1' viết tay theo từng hàng — cùng quy ước với
            // FONT_5x7: hàng đầu tiên trong mảng = ĐỈNH hình, bit '1' = có khối, '0' = trống.
            //   grid: mảng string, mỗi string 1 hàng, TẤT CẢ cùng độ dài (số cột phải đều nhau)
            //   opts.centerX/opts.centerY/opts.z: tâm X, tâm Y (không phải đỉnh — icon thường muốn
            //     canh giữa theo cả 2 trục thay vì theo đỉnh như dòng chữ dài)
            //   opts.targetWidth: BỀ RỘNG MONG MUỐN theo mét — hàm tự tính spacing = targetWidth / số
            //     cột, để tránh lặp lại lỗi tỉ lệ đã gặp với generateTextWall() (spacing cố định 2.5
            //     từng khiến "GENSHIN IMPACT" rộng ~210m ngoài ý muốn). Bắt buộc cung cấp, không có
            //     giá trị mặc định — buộc phải cân nhắc quy mô icon trước khi sinh khối.
            //   opts.blockSizeRatio: blockSize = spacing * blockSizeRatio (mặc định 0.85 — khối gần
            //     khít spacing nhưng vẫn có khe nhỏ phân biệt từng "pixel", đồng thời đủ lớn để leo
            //     được ở target width vừa phải theo đúng lựa chọn đã chốt — "vẫn va chạm/leo được").
            function generateIconWall(grid, opts) {
                const { centerX = 0, centerY = 0, z = 60, targetWidth, blockSizeRatio = 0.85 } = opts;
                if (!targetWidth) {
                    console.warn('generateIconWall: thiếu opts.targetWidth — bắt buộc để tránh icon sinh ra sai tỉ lệ world.');
                    return [];
                }
                const ROWS = grid.length;
                const COLS = grid[0].length;
                const spacing = targetWidth / COLS;
                const blockSize = spacing * blockSizeRatio;
                const entries = [];

                for (let row = 0; row < ROWS; row++) {
                    for (let c = 0; c < COLS; c++) {
                        if (grid[row][c] !== '1') continue;
                        const x = centerX + (c - COLS / 2) * spacing;
                        const y = centerY + (ROWS / 2 - row) * spacing; // hàng đầu = đỉnh = Y lớn nhất
                        entries.push([x, y, z, blockSize, blockSize, blockSize]);
                    }
                }
                return entries;
            }
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
                // Núi
                [41.0, 0.0, 25.0, 16.0, 25.0, 16.0],
                [36.0, 0.0, 28.0, 15.0, 31.0, 15.0],
                [45.0, 0.0, 35.0, 9.0, 38.0, 9.0],
                [40.0, 0.0, 30.0, 8.0, 50.0, 8.0],

                // Welcome (Hidden Update — checkpoint chữ WELCOME): thay toàn bộ khối gõ tay cũ (14
                // khối zigzag riêng cho chữ W, các chữ còn lại chưa làm) bằng generateTextWall() — 1
                // dòng cấu hình sinh ra cả 2 dòng chữ, đồng bộ font 5x7 cho MỌI ký tự kể cả W (không
                // còn kiểu zigzag khác biệt của bản cũ). Đổi text/vị trí/spacing chỉ cần sửa object
                // dưới đây, không đụng gì logic generateTextWall() hay createObstacles().
                // LƯU Ý TỈ LỆ: spacing 2.5 (bằng blockSize gốc 2.0 của chữ W cũ) khiến dòng dài nhất
                // "GENSHIN IMPACT" (14 ký tự, 83 cột font) rộng tới ~210m — quá khổ so với world hiện
                // tại (~±40m quanh các cụm núi). Đã hạ spacing xuống 0.9 + blockSize 0.8 (90% spacing,
                // khối vẫn đủ lớn để leo được) để dòng dài nhất còn ~75m — quy mô landmark nhìn từ xa
                // theo đúng lựa chọn đã chốt, không còn nuốt hết bản đồ.
                ...generateTextWall(["WELCOME TO", "GENSHIN IMPACT :)"], {
                    centerX: 0.0,   // tâm X ước lượng quanh vị trí chữ W cũ (30 → 12), giữ nguyên khu vực
                    topY: 25.0,      // đỉnh dòng đầu — khớp Y cao nhất của chữ W cũ
                    z: 60.0,
                    spacing: 1.25,
                    blockSize: 1.5,
                }),
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





