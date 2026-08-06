// ============================================================
// ============================================================
// enemies.js — Tách ra từ game.js
// Chứa: class Enemy (quái cơ bản, bất tử — placeholder/testing), class Slime
// (AI đầy đủ: state machine idle/chase/attack, isAlerted khi bị đánh, va chạm,
// vật lý nhảy, animation scale).
//
// Load SAU vfx.js, TRƯỚC combat.js/game.js — Enemy/Slime dùng spawnRunTrail
// (từ vfx.js) và được combat.js/game.js khởi tạo (new Slime(...) trong
// updateSpawning, hoặc gọi enemy.takeDamage(...) khi trúng đòn).
//
// PHỤ THUỘC TỪ game.js (đọc qua window.* hoặc tên trần cùng global scope):
//   window.scene, window.player, window.obstacles, window.nextEnemyId (get/set),
//   window.AABB, window.COMBAT_FEEL_CONFIG, window.getInitialGroundY,
//   window.resolveStaticCollisions, window.getRandomPositionOnPlane,
//   window.triggerDamageFlash, window.cameraState, window.sfx,
//   window.enterDeadState, window.onEnemyKilled, window.VOID_DEPTH_Y,
//   getTerrainHeight (định nghĩa trong index.html, gọi runtime nên OK dù
//   index.html load sau — chỉ cần không gọi lúc parse)
//   spawnRunTrail (từ vfx.js, load trước file này)
//
// enemies.js EXPORT ra window để game.js/combat.js dùng:
//   Enemy, Slime
// ============================================================

            class Enemy {
                constructor(x, z) {
                    this.id = window.nextEnemyId++;
                    this.width = 0.8; this.height = 1.6; this.depth = 0.8;
                    
                    const initialY = window.getInitialGroundY(x, z, this.width, this.depth);
                    this.position = new THREE.Vector3(x, initialY + this.height / 2, z); 
                    this.velocity = new THREE.Vector3(0, 0, 0); 
                    // --- CORE STATS (v0.7) — class Enemy là quái placeholder/testing bất tử (comment
                    // đầu file), không phải đối tượng chiến đấu thật sự (spec v0.7 chỉ định nghĩa số
                    // liệu cho Player/Small Slime/Large Slime) — giữ nguyên maxHp cực cao, ATK/DEF ở
                    // mức tối thiểu chỉ để không lỗi nếu lỡ có code khác gọi calculateFinalDamage()
                    // với enemy loại này. hp/maxHp đọc/ghi xuyên qua get/set (khai báo ở class body,
                    // xem bên dưới constructor) vào đúng this.stats.hp/maxHp.
                    this.stats = { maxHp: 999999, hp: 999999, atk: 0, def: 0 };
                    this.alive = true; this.respawnTimer = 0; this.flashTimer = 0;
                    this.knockback = new THREE.Vector3();
                    this.idleTimer = Math.random() * 100;
                    
                    const group = new THREE.Group();
                    const bodyGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.6, 16);
                    
                    this.defaultMaterial = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9, metalness: 0.0 });
                    this.flashMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0 });
                    this.hydroFlashMaterial = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.2 });
                    
                    this.bodyMesh = new THREE.Mesh(bodyGeo, this.defaultMaterial);
                    this.bodyMesh.position.y = 0.8;
                    this.bodyMesh.castShadow = true; this.bodyMesh.receiveShadow = true;
                    group.add(this.bodyMesh);
                    
                    const eyeGeo = new THREE.BoxGeometry(0.5, 0.15, 0.15);
                    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); 
                    const eye = new THREE.Mesh(eyeGeo, eyeMat);
                    eye.position.set(0, 1.2, 0.35);
                    group.add(eye);
                    
                    this.mesh = group;
                    this.mesh.position.copy(this.position);
                    window.scene.add(this.mesh);
                    
                    this.aabb = new window.AABB();
                    this.aabb.updateFromObject(this.mesh, this.width, this.height, this.depth);
                    this.alignToGround();
                }

                // hp/maxHp đọc/ghi xuyên qua this.stats.hp/maxHp — giữ tương thích với mọi code cũ
                // đang dùng "enemy.hp -= x" / "enemy.hp <= 0" trực tiếp (không cần sửa lại các chỗ
                // đó), trong khi Core Stats thật sự sống trong this.stats (nguồn dữ liệu duy nhất).
                get hp() { return this.stats.hp; }
                set hp(v) { this.stats.hp = v; }
                get maxHp() { return this.stats.maxHp; }
                set maxHp(v) { this.stats.maxHp = v; }

                alignToGround() {
                    let bestGroundY = getTerrainHeight(this.position.x, this.position.z); 
                    const footInset = 0.18;
                    window.obstacles.forEach(obs => {
                        const xOver = (this.position.x + this.width/2 - footInset >= obs.aabb.minX) && 
                                      (this.position.x - this.width/2 + footInset <= obs.aabb.maxX);
                        const zOver = (this.position.z + this.depth/2 - footInset >= obs.aabb.minZ) && 
                                      (this.position.z - this.depth/2 + footInset <= obs.aabb.maxZ);
                        if (xOver && zOver) {
                            if (obs.aabb.maxY > bestGroundY) {
                                bestGroundY = obs.aabb.maxY;
                            }
                        }
                    });
                    this.position.y = bestGroundY + this.height / 2; 
                    this.velocity.y = 0;
                    this.mesh.position.copy(this.position);
                    this.aabb.updateFromObject(this.mesh, this.width, this.height, this.depth);
                }
                
                takeDamage(amount, direction, isHydro) {
                    this.flashTimer = 0.18; 
                    this.bodyMesh.material = isHydro ? this.hydroFlashMaterial : this.flashMaterial;
                    this.knockback.copy(direction).normalize().multiplyScalar(window.COMBAT_FEEL_CONFIG.enemyRecoilForce.normal); 
                }
                
                update(dt) {
                    const player = window.player;
                    if (!this.alive) {
                        this.respawnTimer -= dt;
                        if (this.respawnTimer <= 0) {
                            this.alive = true; this.hp = this.maxHp; this.mesh.visible = true;
                            this.knockback.set(0, 0, 0); this.alignToGround();
                        }
                        return;
                    }

                    this.idleTimer += dt * 3.5;
                    const scaleY = 1.0 + Math.sin(this.idleTimer) * 0.03;
                    const scaleXZ = 1.0 - Math.sin(this.idleTimer) * 0.015;
                    this.mesh.scale.set(scaleXZ, scaleY, scaleXZ);
                    
                    if (this.flashTimer > 0) {
                        this.flashTimer -= dt;
                        if (this.flashTimer <= 0) this.bodyMesh.material = this.defaultMaterial;
                    }

                    if (this.hydroSquashTimer > 0) {
                        this.hydroSquashTimer -= dt;
                    } else if (this.hydroSquashTimer <= 0 && this.hydroSquashTimer !== undefined) {
                        const r = 1 - Math.exp(-20 * dt);
                        this.mesh.scale.x += (1.0 - this.mesh.scale.x) * r;
                        this.mesh.scale.y += (1.0 - this.mesh.scale.y) * r;
                        this.mesh.scale.z += (1.0 - this.mesh.scale.z) * r;
                    }

                    this.velocity.y -= player.gravity * dt;
                    this.position.y += this.velocity.y * dt;
                    
                    let bestGroundY = getTerrainHeight(this.position.x, this.position.z);
                    const footInset = 0.18;
                    window.obstacles.forEach(obs => {
                        const xOver = (this.position.x + this.width/2 - footInset >= obs.aabb.minX) && 
                                      (this.position.x - this.width/2 + footInset <= obs.aabb.maxX);
                        const zOver = (this.position.z + this.depth/2 - footInset >= obs.aabb.minZ) && 
                                      (this.position.z - this.depth/2 + footInset <= obs.aabb.maxZ);
                        if (xOver && zOver) {
                            if (this.position.y >= obs.aabb.maxY - this.height * 0.5 - 0.2) {
                                if (obs.aabb.maxY > bestGroundY) {
                                    bestGroundY = obs.aabb.maxY;
                                }
                            }
                        }
                    });

                    const floorY = bestGroundY + this.height / 2;
                    if (this.position.y <= floorY) {
                        this.position.y = floorY;
                        this.velocity.y = 0;
                    }
                    
                    if (this.knockback.lengthSq() > 0.01) {
                        this.position.addScaledVector(this.knockback, dt);
                        this.knockback.multiplyScalar(Math.exp(-12 * dt)); 
                        window.resolveStaticCollisions(this, this.width, this.height, this.depth, dt);
                        this.position.x = Math.max(-45, Math.min(45, this.position.x));
                        this.position.z = Math.max(-45, Math.min(45, this.position.z));
                    }
                    
                    this.mesh.position.copy(this.position);
                    this.aabb.updateFromObject(this.mesh, this.width, this.height, this.depth);
                }
            }
            window.Enemy = Enemy;

            // --- SLIME WANDER CONFIG (Pre-Alpha Stabilization) ---
            // Gom range random cho các timer trạng thái lang thang (idle/prep/land) của Slime — trước
            // đây chỉ có Idle stateTimer được random hoá lúc constructor (Math.random() * 2.0), các
            // vòng lặp sau đó và toàn bộ prep/land đều dùng số cố định (1.2s / 0.15s / 0.12s), khiến
            // nhịp lang thang đều đặn dễ đoán sau vài chu kỳ đầu. Không áp dụng cho các timer liên quan
            // player (chase/attack_prep/attack_land) — phạm vi yêu cầu chỉ là hành vi lang thang thuần
            // tuý, không đụng gì tới AI chiến đấu.
            //   idleDuration: khoảng thời gian đứng yên trôi nhẹ trước khi đổi hướng/nhảy tiếp.
            //   prepDuration: khoảng "gồng mình" rất ngắn trước khi nhảy.
            //   landDuration: khoảng nghỉ rất ngắn sau khi tiếp đất, trước khi quay lại idle.
            // speed/jumpPowerY KHÔNG random — quyết định đã chốt, giữ cố định để không ảnh hưởng cảm
            // giác nhảy đã cân bằng, chỉ random thời gian chờ và hướng đi.
            const SLIME_WANDER_CONFIG = {
                idleDuration: { min: 10.0, max: 30.0 },
                prepDuration: { min: 0.10, max: 0.20 },
                landDuration: { min: 0.08, max: 0.18 },
                // --- BEHAVIOR MODE (đứng yên vs trườn khi idle) ---
                // KHÔNG gắn với vòng đời idle→prep→jump→land của state machine chính — đây là 1 timer
                // ĐỘC LẬP, tick mỗi frame bất kể slime đang ở state nào (xem updateBehaviorMode() bên
                // dưới, gọi ở ĐẦU update() trước khi vào state machine). Cứ hết behaviorModeDuration
                // giây thì "tung xúc xắc" lại xem slime bước vào "chế độ hành vi" nào — chế độ đó áp
                // dụng cho MỌI lần idle xảy ra trong suốt khoảng thời gian này, dù slime có nhảy qua
                // nhiều vòng idle→prep→jump→land khác nhau trong lúc đó. Quyết định đã chốt: không phải
                // "random 1 lần mỗi khi vào idle" (thiết kế cũ) mà là "1 tính cách tạm thời kéo dài vài
                // giây, xuyên suốt nhiều lần idle".
                behaviorModeDuration: { min: 2.0, max: 8.0 },
                stationaryChance: 0.25, // Xác suất chế độ hiện tại là "đứng yên hoàn toàn" (còn lại: trườn nhẹ như mặc định)
            };
            window.SLIME_WANDER_CONFIG = SLIME_WANDER_CONFIG;

            // Random đều đơn giản trong [range.min, range.max] — quyết định đã chốt, không dùng kỹ
            // thuật trung bình nhiều lần (gần phân phối chuẩn) để giữ code gọn, dễ đọc.
            function randomInRange(range) {
                return range.min + Math.random() * (range.max - range.min);
            }

            // updateBehaviorMode(slime, dt): tick timer BEHAVIOR MODE độc lập — xem comment đầy đủ ở
            // SLIME_WANDER_CONFIG.behaviorModeDuration phía trên. Gọi ở ĐẦU update() (trước state
            // machine), KHÔNG đặt trong nhánh 'idle' — vì hành vi phải tiếp tục đếm/random ngay cả khi
            // slime đang jump/chase/land, để khi nó QUAY LẠI idle thì chế độ đã sẵn sàng đúng lúc, không
            // bị "trễ nhịp" so với đồng hồ thực.
            function updateBehaviorMode(slime, dt) {
                slime.behaviorModeTimer -= dt;
                if (slime.behaviorModeTimer <= 0) {
                    slime.behaviorModeTimer = randomInRange(SLIME_WANDER_CONFIG.behaviorModeDuration);
                    slime.isIdleStationary = Math.random() < SLIME_WANDER_CONFIG.stationaryChance;
                }
            }

            // enterIdleState(slime): chuyển 1 slime sang state 'idle' — CHỈ còn phụ trách stateTimer
            // (thời lượng lần idle này) và state machine, KHÔNG còn tự quyết định isIdleStationary nữa
            // (đã tách sang updateBehaviorMode() độc lập, xem trên). Gói chung logic đổi state này thay
            // vì lặp lại ở 4 điểm chuyển sang idle rải rác trong update() (constructor, rời chase do mất
            // dấu địch, land xong không còn trong tầm, Void reset), để đổi công thức stateTimer sau này
            // chỉ cần sửa 1 chỗ. isEngagingPlayer do NGƯỜI GỌI tự set sau khi gọi hàm này — không gộp
            // vào đây vì không phải mọi lần đều muốn ghi đè giá trị đó.
            function enterIdleState(slime) {
                slime.state = 'idle';
                slime.stateTimer = randomInRange(SLIME_WANDER_CONFIG.idleDuration);
            }

            class Slime {
                constructor(x, z, isLarge = false) {
                    this.id = window.nextEnemyId++; this.isSlime = true;
                    if (isLarge) {
                        this.isLarge = true; this.width = 2.8; this.height = 2.0; this.depth = 2.8;
                        this.speed = 2.0; this.chaseSpeed = 4.4;
                        this.detectRadius = 15.0; this.loseRadius = 30.0; this.chaseCooldown = 0.6; this.jumpPowerY = 9.0;
                        // --- CORE STATS (v0.7) — số liệu Large Slime theo core_stats.md mục 7.
                        this.stats = { maxHp: 300, hp: 300, atk: 20, def: 14 };
                        this.expReward = 30; // dùng bởi onSlimeKilled() (game.js) khi tính EXP rơi ra
                        this.attackRange = 2.1; // khoảng cách để bắt đầu chuẩn bị tấn công
                        this.attackTelegraphDuration = 0.45; // giây chuẩn bị trước khi lao vào
                        this.attackHitRange = 2.5; // khoảng cách tối đa để đòn đánh trúng
                    } else {
                        this.isLarge = false; this.width = 1.6; this.height = 0.8; this.depth = 1.6;
                        this.speed = 3.5; this.chaseSpeed = 7.2; 
                        this.detectRadius = 15.0; this.loseRadius = 30.0; this.chaseCooldown = 0.35; this.jumpPowerY = 7.2;
                        // --- CORE STATS (v0.7) — số liệu Small Slime theo core_stats.md mục 7.
                        this.stats = { maxHp: 120, hp: 120, atk: 14, def: 8 };
                        this.expReward = 10;
                        this.attackRange = 1.7;
                        this.attackTelegraphDuration = 0.3;
                        this.attackHitRange = 2.1;
                    }
                    this.attackTargetPos = new THREE.Vector3(); // vị trí player được "khóa" lúc bắt đầu chuẩn bị
                    this.player_hasBeenHitThisAttack = false; // tránh gây damage nhiều lần trong 1 lần lao

                    const initialY = window.getInitialGroundY(x, z, this.width, this.depth);
                    this.position = new THREE.Vector3(x, initialY + this.height / 2, z);
                    this.velocity = new THREE.Vector3(0, 0, 0);
                    this.alive = true; this.respawnTimer = 0; this.flashTimer = 0; this.knockback = new THREE.Vector3();
                    // --- ENEMY HP BAR (v0.7) — hiện khi vừa bị đánh HOẶC player ở gần, ẩn sau khoảng
                    // lặng không có gì xảy ra (xem update()). Đếm NGƯỢC về 0 = còn hiện, <=0 = ẩn.
                    this.hpBarVisibleTimer = 0;
                    // Behavior Mode (đứng yên vs trườn khi idle) — random NGAY TỪ ĐẦU, không đợi
                    // updateBehaviorMode() lần đầu mới random, để nhiều slime spawn cùng lúc (VD đầu
                    // game) không bị "lệch pha" giống hệt nhau — mỗi con có đồng hồ behavior riêng ngay
                    // từ khi sinh ra, tránh cảm giác cả đàn cùng đứng yên/cùng trườn đồng loạt.
                    this.behaviorModeTimer = randomInRange(SLIME_WANDER_CONFIG.behaviorModeDuration);
                    this.isIdleStationary = Math.random() < SLIME_WANDER_CONFIG.stationaryChance;
                    enterIdleState(this);
                    this.wanderAngle = Math.random() * Math.PI * 2;
                    this.idleBobTimer = Math.random() * 50; this.jumpVelocity = new THREE.Vector3(); this.jumpVelocityY = 0;
                    this.isGrounded = true;
                    // isAlerted: true khi slime đã bị player gây sát thương (xem takeDamage).
                    // Trong khi isAlerted, slime sẽ luôn đuổi theo player bất kể detectRadius,
                    // cho tới khi khoảng cách >= loseRadius thì tự động hủy (xem update()).
                    this.isAlerted = false;
                    // isEngagingPlayer: true khi slime ĐANG THỰC SỰ nhắm vào player (đã phát hiện,
                    // đang trong chuỗi đuổi/tấn công) — KHÁC với việc state đang là 'prep'/'jump'/
                    // 'land', vì các state này cũng xảy ra khi slime đi lang thang bình thường,
                    // không liên quan gì tới player. Cờ này được set lại chính xác tại từng điểm
                    // chuyển trạng thái (xem update()) để nơi khác (VD nhạc combat trong game.js)
                    // có thể đọc thẳng, không cần tự suy luận lại bằng khoảng cách + state.
                    this.isEngagingPlayer = false;

                    const group = new THREE.Group();
                    this.defaultMaterial = new THREE.MeshStandardMaterial({ color: isLarge ? 0x64748b : 0xd1d5db, roughness: 0.8, metalness: 0.0 });
                    this.flashMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0 });
                    this.hydroFlashMaterial = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.2 });
                    
                    const bodyGeo = new THREE.SphereGeometry(this.width * 0.5, 16, 12);
                    this.bodyMesh = new THREE.Mesh(bodyGeo, this.defaultMaterial);
                    this.bodyMesh.position.y = 0; this.bodyMesh.scale.set(1, 0.7, 1);
                    this.bodyMesh.castShadow = true; this.bodyMesh.receiveShadow = true;
                    group.add(this.bodyMesh);
                    
                    const eyeSize = isLarge ? 0.3 : 0.2;
                    const eyeGeo = new THREE.BoxGeometry(eyeSize, eyeSize, eyeSize);
                    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x334155 });
                    this.leftEye = new THREE.Mesh(eyeGeo, eyeMat); this.leftEye.position.set(-this.width * 0.18, this.width * 0.06, this.width * 0.42); group.add(this.leftEye);
                    this.rightEye = this.leftEye.clone(); this.rightEye.position.x = this.width * 0.18; group.add(this.rightEye);
                    
                    this.mesh = group; this.mesh.position.copy(this.position); window.scene.add(this.mesh);
                    this.aabb = new window.AABB(); this.aabb.updateFromObject(this.mesh, this.width, this.height, this.depth);

                    // --- ENEMY HP BAR (Pre-Alpha v0.7 — Core Stats) ---
                    // 2 Sprite chồng lên nhau, làm CON của this.mesh (group) — tự động di chuyển/theo
                    // enemy mỗi frame KHÔNG cần code cập nhật vị trí thủ công, vì Three.js tự cộng dồn
                    // transform cha-con. Billboard tự quay mặt camera (đặc tính có sẵn của Sprite).
                    //   hpBarBg: nền tối, kích thước CỐ ĐỊNH — luôn full chiều rộng, đóng vai trò
                    //            "khung viền" phía sau thanh máu.
                    //   hpBarFill: thanh máu thật, co giãn theo % HP còn lại (xem updateHpBarVisual).
                    //              Sprite co giãn quanh TÂM (không phải từ 1 cạnh) nên phải dịch
                    //              position.x bù lại phần bị "ăn vào" từ bên phải khi scale nhỏ đi —
                    //              xem công thức trong updateHpBarVisual().
                    const hpBarWidth = this.isLarge ? 1.4 : 1.0;
                    const hpBarY = this.height * 0.75 + 0.35; // Phía trên đỉnh slime 1 khoảng vừa đủ

                    const hpBarBgMat = new THREE.SpriteMaterial({ color: 0x1a1a2e, transparent: true, opacity: 0.85, depthTest: false });
                    this.hpBarBg = new THREE.Sprite(hpBarBgMat);
                    this.hpBarBg.scale.set(hpBarWidth, 0.14, 1);
                    this.hpBarBg.position.set(0, hpBarY, 0);
                    this.hpBarBg.renderOrder = 998;
                    this.mesh.add(this.hpBarBg);

                    const hpBarFillMat = new THREE.SpriteMaterial({ color: 0x4ade80, transparent: true, opacity: 1.0, depthTest: false });
                    this.hpBarFill = new THREE.Sprite(hpBarFillMat);
                    this.hpBarFill.scale.set(hpBarWidth, 0.1, 1);
                    this.hpBarFill.position.set(0, hpBarY, 0.001); // Lệch Z nhẹ để không z-fighting với nền
                    this.hpBarFill.renderOrder = 999;
                    this.mesh.add(this.hpBarFill);
                    this.hpBarMaxWidth = hpBarWidth;

                    // Ẩn mặc định — chỉ hiện khi bị đánh hoặc player ở gần (xem update()), đúng hành
                    // vi HP Bar thông thường (không che khuất tầm nhìn khi enemy còn nguyên vẹn/ở xa).
                    this.hpBarBg.visible = false;
                    this.hpBarFill.visible = false;

                    this.alignToGround();
                }

                // Cập nhật độ dài thanh máu theo % HP hiện tại — gọi mỗi khi HP thay đổi (takeDamage)
                // và mỗi frame trong update() để phòng trường hợp khác làm đổi this.hp trực tiếp.
                updateHpBarVisual() {
                    const pct = Math.max(0, Math.min(1, this.stats.hp / this.stats.maxHp));
                    this.hpBarFill.scale.x = this.hpBarMaxWidth * pct;
                    // Sprite co giãn quanh TÂM — khi scale.x giảm, cạnh TRÁI và PHẢI đều thu vào đều
                    // nhau. Muốn thanh máu "vơi từ bên phải" (giống mọi HP bar chuẩn, đầy bên trái)
                    // phải dịch tâm sang trái đúng 1 nửa phần đã mất, để cạnh TRÁI của thanh máu luôn
                    // cố định tại đúng cạnh trái của khung nền.
                    const missingWidth = this.hpBarMaxWidth * (1 - pct);
                    this.hpBarFill.position.x = -missingWidth / 2;
                    // Đổi màu theo % HP còn lại — xanh (an toàn) -> vàng (cảnh báo) -> đỏ (nguy hiểm),
                    // giúp người chơi ước lượng nhanh mà không cần đọc số chính xác.
                    if (pct > 0.5) this.hpBarFill.material.color.setHex(0x4ade80);
                    else if (pct > 0.25) this.hpBarFill.material.color.setHex(0xfbbf24);
                    else this.hpBarFill.material.color.setHex(0xef4444);
                }

                // hp/maxHp đọc/ghi xuyên qua this.stats.hp/maxHp — giữ tương thích với mọi code cũ
                // đang dùng "slime.hp -= x" / "slime.hp <= 0" trực tiếp.
                get hp() { return this.stats.hp; }
                set hp(v) { this.stats.hp = v; }
                get maxHp() { return this.stats.maxHp; }
                set maxHp(v) { this.stats.maxHp = v; }

                alignToGround() {
                    this.position.y = this.getGroundY() + (this.height / 2);
                    this.mesh.position.copy(this.position);
                    this.aabb.updateFromObject(this.mesh, this.width, this.height, this.depth);
                }

                getGroundY() {
                    let bestGroundY = getTerrainHeight(this.position.x, this.position.z);
                    const footInset = 0.18;
                    window.obstacles.forEach(obs => {
                        const xOver = (this.position.x + this.width/2 - footInset >= obs.aabb.minX) && 
                                      (this.position.x - this.width/2 + footInset <= obs.aabb.maxX);
                        const zOver = (this.position.z + this.depth/2 - footInset >= obs.aabb.minZ) && 
                                      (this.position.z - this.depth/2 + footInset <= obs.aabb.maxZ);
                        if (xOver && zOver) {
                            if (this.position.y >= obs.aabb.maxY - 0.25) {
                                if (obs.aabb.maxY > bestGroundY) bestGroundY = obs.aabb.maxY;
                            }
                        }
                    });
                    return bestGroundY;
                }

                // Pre-Alpha v0.7 — Core Stats: `multiplier` (KHÔNG còn là "damage đã tính sẵn" như
                // trước) — hệ số riêng theo loại đòn đánh của player (player.attack.melee/plunge/
                // burst/hydroProjectile, xem game.js). Final Damage được tính DUY NHẤT tại đây qua
                // calculateFinalDamage(), theo đúng Combat Flow chuẩn hóa (core_stats.md mục 5):
                // lấy ATK người tấn công -> lấy DEF mục tiêu -> tính Final Damage -> trừ HP -> hiển thị
                // Damage Number -> cập nhật HP Bar -> (nếu chết) animation/drop/EXP.
                // Attacker LUÔN là player ở v0.7 (chưa có nguồn sát thương nào khác nhắm vào Enemy).
                // Pre-Alpha v0.7 — Core Stats: Combat Flow chuẩn hóa theo ĐÚNG 8 bước quy định ở
                // core_stats.md mục 5 (đánh số rõ ràng dưới đây để dễ chèn thêm Critical Hit/Buff/
                // Debuff/Elemental Damage/Elemental Reaction/Shield/Healing vào ĐÚNG bước tương ứng
                // trong tương lai, thay vì phải dò lại toàn bộ hàm). `multiplier` là hệ số riêng theo
                // loại đòn của player (KHÔNG phải damage tuyệt đối) — xem giải thích ở game.js.
                takeDamage(multiplier, direction, isHydro) {
                    // Bước 1: người tấn công gây sát thương — LUÔN là player ở v0.7 (chưa có nguồn sát
                    // thương nào khác nhắm vào Enemy).
                    const player = window.player;
                    // Bước 2+3: lấy ATK người tấn công (player.stats.atk) + DEF mục tiêu (this.stats.def).
                    // Bước 4: tính Final Damage theo công thức chuẩn.
                    const finalDamage = window.calculateFinalDamage(player.stats.atk, this.stats.def, multiplier);
                    // Bước 5: trừ HP mục tiêu (Math.max(0, ...) đảm bảo không bao giờ xuống âm).
                    this.hp = Math.max(0, this.hp - finalDamage);

                    // Bước 6: hiển thị Damage Number (v0.7 mục 3) — bay lên phía trên đầu slime, màu
                    // trắng duy nhất, không phân biệt chí mạng/nguyên tố ở phiên bản này.
                    if (window.spawnDamageNumber) {
                        const numberOrigin = this.position.clone();
                        numberOrigin.y += this.height * 0.6;
                        window.spawnDamageNumber(numberOrigin, finalDamage);
                    }

                    // Bước 7: cập nhật thanh HP (v0.7 mục 4) — hiện ngay khi bị đánh, tự đếm ngược ẩn
                    // lại sau KHOẢNG LẶNG không có gì xảy ra (xem hpBarVisibleTimer trong update()).
                    this.updateHpBarVisual();
                    this.hpBarVisibleTimer = 3.0;

                    // --- Hiệu ứng phụ không thuộc 8 bước chuẩn hóa (flash trắng, knockback) — giữ
                    // nguyên hành vi combat feel đã có từ trước v0.7, không phải 1 phần Core Stats. ---
                    this.flashTimer = 0.18;
                    this.bodyMesh.material = isHydro ? this.hydroFlashMaterial : this.flashMaterial;
                    const force = this.isLarge ? window.COMBAT_FEEL_CONFIG.enemyRecoilForce.large : window.COMBAT_FEEL_CONFIG.enemyRecoilForce.normal;
                    this.knockback.copy(direction).normalize().multiplyScalar(force);

                    // --- BÁO ĐỘNG ĐỒNG ĐỘI CÙNG CAMP (không thuộc 8 bước chuẩn hóa — hành vi AI) ---
                    // Chạy TRƯỚC bước 8 (kiểm tra chết) bên dưới — 1 đòn đánh dù có hạ gục slime này
                    // hay không thì đồng đội cùng camp vẫn phải biết. Các slime khác CÙNG CAMP
                    // (this.camp, gán bởi createCamps() trong game.js) lập tức bị alerted — NHƯNG chỉ
                    // nếu khoảng cách của TỪNG con đó tới player không lớn hơn 35 (khác với khoảng
                    // cách của CON BỊ ĐÁNH — mỗi slime tự kiểm tra khoảng cách của chính nó, vì chúng
                    // có thể đứng rải rác quanh camp, không phải tất cả đều gần player như con vừa
                    // trúng đòn). Dùng window.player/window.enemies trực tiếp — nhất quán với cách
                    // các hàm khác trong file này truy cập state toàn cục.
                    if (this.camp !== undefined && player) {
                        const ALLY_ALERT_RADIUS = 35;
                        window.enemies.forEach(e => {
                            if (e === this || !e.isSlime || !e.alive) return;
                            if (e.camp !== this.camp) return;
                            if (e.isAlerted) return; // đã alerted rồi, khỏi tính lại
                            if (player.position.distanceTo(e.position) <= ALLY_ALERT_RADIUS) {
                                e.isAlerted = true;
                            }
                        });
                    }

                    // Bước 8: nếu HP <= 0 -> animation chết + rơi vật phẩm + cộng EXP.
                    if (this.hp <= 0) {
                        this.alive = false; this.respawnTimer = 0.2; this.mesh.visible = false; // animation chết (ẩn mesh)
                        if (window.onEnemyKilled) window.onEnemyKilled('slime'); // cập nhật tiến độ quest 'kill'
                        // Rơi vật phẩm (nguyên liệu) + cộng EXP — xem onSlimeKilled() trong game.js.
                        if (window.onSlimeKilled) window.onSlimeKilled(this);
                        return;
                    }

                    // --- PHÁT HIỆN KHI BỊ TẤN CÔNG: nhận sát thương từ player -> đánh dấu alerted ---
                    // Việc thực sự chuyển state/di chuyển do update() xử lý dựa trên isAlerted,
                    // để tận dụng đúng state machine sẵn có (prep -> jump nhắm vào player) thay vì
                    // ép thẳng 'chase' (state này tự thân không di chuyển slime, chỉ đếm cooldown).
                    this.isAlerted = true;
                }

                update(dt) {
                    const player = window.player;
                    const cameraState = window.cameraState;
                    const sfx = window.sfx;

                    if (!this.alive) {
                        if (this.respawnTimer > 0) this.respawnTimer -= dt;
                        return;
                    }

                    if (this.flashTimer > 0) {
                        this.flashTimer -= dt;
                        if (this.flashTimer <= 0) this.bodyMesh.material = this.defaultMaterial;
                    }

                    // Behavior Mode (đứng yên vs trườn khi idle) — tick ở ĐÂY, TRƯỚC state machine,
                    // độc lập hoàn toàn với state hiện tại (idle/jump/chase/...). Xem comment đầy đủ ở
                    // SLIME_WANDER_CONFIG.behaviorModeDuration và updateBehaviorMode() phía trên class.
                    updateBehaviorMode(this, dt);

                    // Player đã vào Dead state (biến mất khỏi scene) — không còn là mục tiêu để
                    // phát hiện/tấn công MỚI. Animation/vật lý đang dở (rơi, land...) vẫn chạy
                    // tiếp bình thường để tránh treo slime giữa không trung.
                    const playerIsTargetable = !player.isDead;

                    const distToPlayer = this.position.distanceTo(player.position);

                    // --- ENEMY HP BAR: hiện/ẩn (v0.7) ---
                    // Hiện khi (a) vừa bị đánh gần đây (hpBarVisibleTimer > 0, set = 3.0 trong
                    // takeDamage() mỗi lần trúng đòn) HOẶC (b) player đang ở đủ gần để nhìn rõ (dùng
                    // ngưỡng nhỏ hơn detectRadius một chút — tránh HP bar bật lên từ khoảng cách quá
                    // xa, gây rối mắt khi có nhiều slime rải rác trong tầm nhìn). Tắt đếm ngược khi
                    // player đang ở gần — không cần "hết giờ" trong lúc player còn đứng cạnh nhìn.
                    const HP_BAR_NEARBY_RADIUS = 8.0;
                    const isNearbyForHpBar = distToPlayer <= HP_BAR_NEARBY_RADIUS;
                    if (!isNearbyForHpBar && this.hpBarVisibleTimer > 0) {
                        this.hpBarVisibleTimer -= dt;
                    }
                    const shouldShowHpBar = this.alive && (isNearbyForHpBar || this.hpBarVisibleTimer > 0);
                    if (this.hpBarBg.visible !== shouldShowHpBar) {
                        this.hpBarBg.visible = shouldShowHpBar;
                        this.hpBarFill.visible = shouldShowHpBar;
                    }

                    if (this.isGrounded) {
                        const currentGroundY = this.getGroundY();

                        // Khi đã bị "báo động" (isAlerted, do bị player gây sát thương — xem
                        // takeDamage), nếu khoảng cách tới player vượt quá loseRadius thì hủy báo
                        // động, slime quay lại hành vi bình thường (idle/wander). loseRadius đảm
                        // nhiệm ĐÚNG 1 vai trò duy nhất: ngưỡng bỏ cuộc khi đang trong trạng thái
                        // "nổi giận" — KHÔNG áp dụng cho phát hiện tự nhiên (xem effectiveLoseRadius).
                        if (this.isAlerted && (!playerIsTargetable || distToPlayer > this.loseRadius)) {
                            this.isAlerted = false;
                        }
                        // playerDetected: điều kiện để BẮT ĐẦU phát hiện player từ trạng thái nghỉ
                        // (idle) — dùng detectRadius (hẹp).
                        const playerDetected = playerIsTargetable && (this.isAlerted || distToPlayer < this.detectRadius);
                        // withinChaseRange: điều kiện để TIẾP TỤC nhắm vào player khi đã ở giữa
                        // một chuỗi đuổi (prep/land sau khi vừa chase).
                        // - Nếu ĐANG bị báo động (isAlerted): dùng loseRadius — cho phép đuổi dai
                        //   hơn bình thường (hysteresis CÓ chủ đích, vì slime đã "nổi giận").
                        // - Nếu KHÔNG báo động (chỉ phát hiện tự nhiên bằng mắt): bắt buộc phải
                        //   nằm trong đúng detectRadius mới được tiếp tục đuổi — KHÔNG có vùng
                        //   khoan nhượng nào cả. Ra khỏi detectRadius dù chỉ 1 chút là hủy chase
                        //   ngay, quay lại idle.
                        const effectiveLoseRadius = this.isAlerted ? this.loseRadius : this.detectRadius;
                        const withinChaseRange = playerIsTargetable && distToPlayer <= effectiveLoseRadius;
                        if (this.position.y > currentGroundY + (this.height / 2) + 0.05) {
                            this.isGrounded = false;
                            this.state = 'jump';
                            this.jumpVelocity.set(0, 0, 0);
                            this.jumpVelocityY = 0;
                        } else {
                            this.position.y = currentGroundY + (this.height / 2);
                            this.jumpVelocityY = 0;
                        }

                        if (this.state === 'idle') {
                            // Chức năng "đứng yên hoàn toàn khi idle" (Pre-Alpha Stabilization — Behavior
                            // Mode): mặc định (isIdleStationary = false, 70% trường hợp — xem
                            // SLIME_WANDER_CONFIG.stationaryChance) trườn nhẹ + xoay mặt theo wanderAngle
                            // như hành vi gốc. Khi true (30%): đứng ứ im hoàn toàn — không đổi position,
                            // không xoay rotation.y — CHỈ còn hiệu ứng bob thở (chạy vô điều kiện bên
                            // dưới cho cả 2 trường hợp, vì đây không phải "di chuyển" mà chỉ là animation
                            // tại chỗ). isIdleStationary do updateBehaviorMode() quyết định — 1 timer
                            // ĐỘC LẬP (3-6s ngẫu nhiên) chạy song song với state machine, KHÔNG phải mỗi
                            // lần vào idle mới random lại — nên chế độ này giữ nguyên xuyên suốt NHIỀU
                            // lần idle liên tiếp cho tới khi behaviorModeTimer hết hạn.
                            if (!this.isIdleStationary) {
                                const dir = new THREE.Vector3(Math.sin(this.wanderAngle), 0, Math.cos(this.wanderAngle));
                                this.position.addScaledVector(dir, this.speed * 0.25 * dt);
                                const rotationLerp = 1 - Math.exp(-6 * dt);
                                this.mesh.rotation.y += (this.wanderAngle - this.mesh.rotation.y) * rotationLerp;
                            }
                            this.idleBobTimer += dt * 5.0;
                            const bobFactor = Math.sin(this.idleBobTimer) * 0.05;
                            this.bodyMesh.scale.y = 0.7 + bobFactor; this.bodyMesh.scale.x = 1.0 - bobFactor * 0.5; this.bodyMesh.scale.z = 1.0 - bobFactor * 0.5;

                            if (playerDetected) { this.state = 'prep'; this.stateTimer = 0.15; this.isEngagingPlayer = true; } 
                            else {
                                this.stateTimer -= dt;
                                if (this.stateTimer <= 0) { this.state = 'prep'; this.stateTimer = randomInRange(SLIME_WANDER_CONFIG.prepDuration); this.wanderAngle += (Math.random() - 0.5) * 2; }
                            }
                        } 
                        else if (this.state === 'chase') {
                            // withinChaseRange (khai báo ở đầu khối): nếu KHÔNG isAlerted, phải nằm
                            // đúng trong detectRadius mới được tiếp tục — không có vùng khoan nhượng,
                            // ra khỏi detectRadius là hủy chase ngay. Nếu ĐANG isAlerted (vừa bị đánh),
                            // ngưỡng nới rộng ra loseRadius (xem effectiveLoseRadius phía trên).
                            if (!withinChaseRange) { enterIdleState(this); this.isEngagingPlayer = false; }
                            else if (distToPlayer <= this.attackRange) {
                                // Đủ gần — khóa vị trí+hướng mục tiêu và bắt đầu chuẩn bị lao vào
                                this.state = 'attack_prep';
                                this.stateTimer = this.attackTelegraphDuration;
                                this.attackTargetPos.copy(player.position);
                            } else {
                                this.stateTimer -= dt;
                                if (this.stateTimer <= 0) { this.state = 'prep'; this.stateTimer = randomInRange(SLIME_WANDER_CONFIG.prepDuration); }
                            }
                        }
                        else if (this.state === 'attack_prep') {
                            // Đứng yên tại chỗ, quay mặt về hướng mục tiêu đã khóa
                            // (phần phồng to/rung dùng chung hệ thống lerp scale bên dưới, xem targetScale)
                            const lookDir = new THREE.Vector3().subVectors(this.attackTargetPos, this.position); lookDir.y = 0;
                            if (lookDir.lengthSq() > 0.0001) {
                                const targetAngle = Math.atan2(lookDir.x, lookDir.z);
                                const rotationLerp = 1 - Math.exp(-10 * dt);
                                this.mesh.rotation.y += (targetAngle - this.mesh.rotation.y) * rotationLerp;
                            }

                            this.stateTimer -= dt;
                            if (this.stateTimer <= 0) {
                                // Lao vào theo hướng đã khóa lúc bắt đầu chuẩn bị (không nhắm lại)
                                this.state = 'attack_jump'; this.isGrounded = false;
                                this.player_hasBeenHitThisAttack = false;
                                const dir = new THREE.Vector3().subVectors(this.attackTargetPos, this.position);
                                dir.y = 0;
                                if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1); else dir.normalize();
                                this.jumpVelocity.copy(dir).multiplyScalar(this.chaseSpeed * 1.3);
                                this.jumpVelocityY = this.jumpPowerY * 0.7; // cú lao thấp và nhanh hơn nhảy di chuyển thường
                            }
                        }
                        else if (this.state === 'prep') {
                            this.stateTimer -= dt;
                            if (this.stateTimer <= 0) {
                                this.state = 'jump'; this.isGrounded = false;
                                if (withinChaseRange) {
                                    const dir = new THREE.Vector3().subVectors(player.position, this.position);
                                    dir.y = 0; dir.normalize();
                                    this.jumpVelocity.copy(dir).multiplyScalar(this.chaseSpeed); this.jumpVelocityY = this.jumpPowerY; 
                                    this.isEngagingPlayer = true;
                                } else {
                                    const dir = new THREE.Vector3(Math.sin(this.wanderAngle), 0, Math.cos(this.wanderAngle));
                                    this.jumpVelocity.copy(dir).multiplyScalar(this.speed); this.jumpVelocityY = this.jumpPowerY * 0.75;
                                    this.isEngagingPlayer = false;
                                }
                            }
                        }
                        else if (this.state === 'land') {
                            this.stateTimer -= dt;
                            if (this.stateTimer <= 0) {
                                if (withinChaseRange) { this.state = 'chase'; this.stateTimer = this.chaseCooldown; this.isEngagingPlayer = true; } 
                                else { enterIdleState(this); this.isEngagingPlayer = false; }
                            }
                        }
                        else if (this.state === 'attack_land') {
                            this.stateTimer -= dt;
                            if (this.stateTimer <= 0) {
                                this.state = 'chase'; this.stateTimer = this.chaseCooldown;
                            }
                        }
                    } else {
                        this.jumpVelocityY -= player.gravity * dt;
                        this.position.x += this.jumpVelocity.x * dt; this.position.y += this.jumpVelocityY * dt; this.position.z += this.jumpVelocity.z * dt;
                        if (this.jumpVelocity.lengthSq() > 0.01) { const angle = Math.atan2(this.jumpVelocity.x, this.jumpVelocity.z); this.mesh.rotation.y = angle; }
                        window.resolveStaticCollisions(this, this.width, this.height, this.depth, dt);

                        // Trong lúc lao vào (attack_jump), kiểm tra va chạm với player NGAY KHI ĐANG BAY,
                        // không cần đợi tiếp đất — đây chính là hành vi "tông vào" gây damage.
                        if (playerIsTargetable && this.state === 'attack_jump' && !this.player_hasBeenHitThisAttack) {
                            const distNow = this.position.distanceTo(player.position);
                            if (distNow <= this.attackHitRange && player.invulnTimer <= 0) {
                                this.player_hasBeenHitThisAttack = true;
                                // Pre-Alpha v0.7 — Core Stats: Final Damage tính qua calculateFinalDamage()
                                // (ATK của Slime, DEF của player), KHÔNG còn random thô theo khoảng
                                // minAttackDamage/maxAttackDamage như trước v0.7. multiplier=1 vì Slime
                                // chỉ có 1 loại đòn tấn công (không có hệ số riêng theo loại đòn như
                                // player.attack.melee/plunge/burst/hydroProjectile).
                                const dmg = window.calculateFinalDamage(this.stats.atk, player.stats.def);
                                player.hp = Math.max(0, player.hp - dmg); player.invulnTimer = 0.8;
                                window.triggerDamageFlash(); sfx.playHit();
                                // Damage Number khi PLAYER nhận sát thương (v0.7 mục 3) — cùng hàm
                                // dùng cho Enemy, chỉ khác điểm xuất phát (trên đầu player thay vì
                                // enemy).
                                if (window.spawnDamageNumber) {
                                    const numberOrigin = player.position.clone();
                                    numberOrigin.y += player.height * 0.75;
                                    window.spawnDamageNumber(numberOrigin, dmg);
                                }
                                cameraState.shakeTimer = 0.25; cameraState.shakeIntensity = 0.35;
                                // Stagger nhẹ ~0.1s: chỉ là hiệu ứng knockback nhẹ, không khóa input người chơi
                                const pushDir = new THREE.Vector3().subVectors(player.position, this.position); pushDir.y = 0;
                                if (pushDir.lengthSq() > 0.0001) player.velocity.add(pushDir.normalize().multiplyScalar(4.0));
                                player.staggerTimer = 0.1;
                                if (player.hp <= 0) window.enterDeadState('combat');
                            }
                        }

                        const groundY = this.getGroundY();
                        if (this.position.y <= groundY + (this.height / 2)) {
                            if (this.jumpVelocityY <= 0) {
                                // --- GIỚI HẠN VÙNG DI CHUYỂN: RƠI KHỎI PLANE (VOID) ---
                                // groundY chạm mức VOID_DEPTH_Y nghĩa là slime đã rơi ra ngoài plane
                                // hợp lệ. Khác với player, slime KHÔNG quay về vị trí spawn cố định mà
                                // dịch chuyển tới một vị trí ngẫu nhiên an toàn trên plane.
                                const isVoidFloor = groundY <= (window.VOID_DEPTH_Y ?? -100.0);
                                if (isVoidFloor) {
                                    const randomPos = window.getRandomPositionOnPlane();
                                    this.position.x = randomPos.x;
                                    this.position.z = randomPos.z;
                                    this.jumpVelocity.set(0, 0, 0);
                                    this.jumpVelocityY = 0;
                                    this.alignToGround(); // Đặt lại Y đúng theo mặt đất tại vị trí mới
                                    this.isGrounded = true;
                                    enterIdleState(this); this.isEngagingPlayer = false;
                                } else {
                                    this.position.y = groundY + (this.height / 2); this.isGrounded = true;
                                    if (this.state === 'attack_jump') {
                                        this.state = 'attack_land'; this.stateTimer = 0.15;
                                    } else {
                                        this.state = 'land'; this.stateTimer = randomInRange(SLIME_WANDER_CONFIG.landDuration); 
                                    }
                                    if (Math.random() < 0.6) window.spawnRunTrail(this.position, new THREE.Vector3(0, 0, 1));
                                }
                            }
                        }
                    }

                    if (this.knockback.lengthSq() > 0.01) {
                        this.position.addScaledVector(this.knockback, dt);
                        this.knockback.multiplyScalar(Math.exp(-12 * dt)); 
                        window.resolveStaticCollisions(this, this.width, this.height, this.depth, dt);
                        if (this.isGrounded) {
                            this.alignToGround();
                        }
                    }

                    let targetScaleX = 1.0, targetScaleY = 0.7, targetScaleZ = 1.0;
                    if (this.state === 'prep') { targetScaleX = 1.25; targetScaleY = 0.45; targetScaleZ = 1.25; } 
                    else if (this.state === 'jump') { targetScaleX = 0.8; targetScaleY = 1.2; targetScaleZ = 0.8; } 
                    else if (this.state === 'land') { targetScaleX = 1.2; targetScaleY = 0.55; targetScaleZ = 1.2; }
                    else if (this.state === 'attack_prep') { targetScaleX = 1.3; targetScaleY = 0.4; targetScaleZ = 1.3; } // phồng mạnh hơn prep thường
                    else if (this.state === 'attack_jump') { targetScaleX = 0.75; targetScaleY = 1.3; targetScaleZ = 0.75; } // thon dài hơn jump thường - cảm giác lao nhanh
                    else if (this.state === 'attack_land') { targetScaleX = 1.25; targetScaleY = 0.5; targetScaleZ = 1.25; }

                    const scaleLerp = 15.0 * dt;
                    this.bodyMesh.scale.x += (targetScaleX - this.bodyMesh.scale.x) * Math.min(scaleLerp, 1);
                    this.bodyMesh.scale.y += (targetScaleY - this.bodyMesh.scale.y) * Math.min(scaleLerp, 1);
                    this.bodyMesh.scale.z += (targetScaleZ - this.bodyMesh.scale.z) * Math.min(scaleLerp, 1);

                    const halfH = this.height / 2;
                    const sX = this.bodyMesh.scale.x;
                    const sY = this.bodyMesh.scale.y;
                    const sZ = this.bodyMesh.scale.z;
                    this.bodyMesh.position.y = -halfH + (halfH * sY);

                    const baseEyeX = this.width * 0.18;
                    const baseEyeY = this.width * 0.06;
                    const baseEyeZ = this.width * 0.42;
                    this.leftEye.position.set(-baseEyeX * sX, this.bodyMesh.position.y + baseEyeY * sY, baseEyeZ * sZ);
                    this.rightEye.position.set(baseEyeX * sX, this.bodyMesh.position.y + baseEyeY * sY, baseEyeZ * sZ);

                    this.mesh.position.copy(this.position);
                    this.aabb.updateFromObject(this.mesh, this.width, this.height, this.depth);
                }
            }
            window.Slime = Slime;


