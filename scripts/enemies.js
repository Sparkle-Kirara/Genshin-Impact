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
                    this.attackDamage = 15;
                    
                    const initialY = window.getInitialGroundY(x, z, this.width, this.depth);
                    this.position = new THREE.Vector3(x, initialY + this.height / 2, z); 
                    this.velocity = new THREE.Vector3(0, 0, 0); 
                    this.maxHp = 999999; this.hp = this.maxHp;
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

            class Slime {
                constructor(x, z, isLarge = false) {
                    this.id = window.nextEnemyId++; this.isSlime = true;
                    if (isLarge) {
                        this.isLarge = true; this.width = 2.8; this.height = 2.0; this.depth = 2.8;
                        this.maxHp = 16; this.speed = 2.0; this.chaseSpeed = 4.2;
                        this.detectRadius = 15.0; this.loseRadius = 30.0; this.chaseCooldown = 0.6; this.jumpPowerY = 9.0;
                        this.minAttackDamage = 14; this.maxAttackDamage = 18;
                        this.attackRange = 2.0; // khoảng cách để bắt đầu chuẩn bị tấn công
                        this.attackTelegraphDuration = 0.5; // giây chuẩn bị trước khi lao vào
                        this.attackHitRange = 2.3; // khoảng cách tối đa để đòn đánh trúng
                    } else {
                        this.isLarge = false; this.width = 1.6; this.height = 0.8; this.depth = 1.6;
                        this.maxHp = 6; this.speed = 3.5; this.chaseSpeed = 7.0; 
                        this.detectRadius = 15.0; this.loseRadius = 30.0; this.chaseCooldown = 0.35; this.jumpPowerY = 7.2;
                        this.minAttackDamage = 6; this.maxAttackDamage = 10;
                        this.attackRange = 1.6;
                        this.attackTelegraphDuration = 0.4;
                        this.attackHitRange = 1.8;
                    }
                    this.attackTargetPos = new THREE.Vector3(); // vị trí player được "khóa" lúc bắt đầu chuẩn bị
                    this.player_hasBeenHitThisAttack = false; // tránh gây damage nhiều lần trong 1 lần lao

                    const initialY = window.getInitialGroundY(x, z, this.width, this.depth);
                    this.position = new THREE.Vector3(x, initialY + this.height / 2, z);
                    this.velocity = new THREE.Vector3(0, 0, 0);
                    this.hp = this.maxHp; 
                    this.alive = true; this.respawnTimer = 0; this.flashTimer = 0; this.knockback = new THREE.Vector3();
                    this.state = 'idle'; this.stateTimer = Math.random() * 2.0; this.wanderAngle = Math.random() * Math.PI * 2;
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
                    this.alignToGround();
                }

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

                takeDamage(amount, direction, isHydro) {
                    this.hp -= amount; this.flashTimer = 0.18;
                    this.bodyMesh.material = isHydro ? this.hydroFlashMaterial : this.flashMaterial;
                    const force = this.isLarge ? window.COMBAT_FEEL_CONFIG.enemyRecoilForce.large : window.COMBAT_FEEL_CONFIG.enemyRecoilForce.normal;
                    this.knockback.copy(direction).normalize().multiplyScalar(force);

                    // --- BÁO ĐỘNG ĐỒNG ĐỘI CÙNG CAMP ---
                    // Chạy TRƯỚC nhánh return-khi-chết bên dưới — 1 đòn đánh dù có hạ gục slime này
                    // hay không thì đồng đội cùng camp vẫn phải biết. Các slime khác CÙNG CAMP
                    // (this.camp, gán bởi createCamps() trong game.js) lập tức bị alerted — NHƯNG chỉ
                    // nếu khoảng cách của TỪNG con đó tới player không lớn hơn 35 (khác với khoảng
                    // cách của CON BỊ ĐÁNH — mỗi slime tự kiểm tra khoảng cách của chính nó, vì chúng
                    // có thể đứng rải rác quanh camp, không phải tất cả đều gần player như con vừa
                    // trúng đòn). Dùng window.player/window.enemies trực tiếp — nhất quán với cách
                    // các hàm khác trong file này truy cập state toàn cục.
                    const player = window.player;
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

                    if (this.hp <= 0) {
                        this.alive = false; this.respawnTimer = 0.2; this.mesh.visible = false;
                        if (window.onEnemyKilled) window.onEnemyKilled('slime');
                        // v0.6 Wilderness: Slime Drop (nguyên liệu) + EXP — tách riêng khỏi
                        // onEnemyKilled() (chỉ lo cập nhật tiến độ quest 'kill'), xem onSlimeKilled()
                        // trong game.js để biết chi tiết bảng vật phẩm rơi/EXP.
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

                    // Player đã vào Dead state (biến mất khỏi scene) — không còn là mục tiêu để
                    // phát hiện/tấn công MỚI. Animation/vật lý đang dở (rơi, land...) vẫn chạy
                    // tiếp bình thường để tránh treo slime giữa không trung.
                    const playerIsTargetable = !player.isDead;

                    const distToPlayer = this.position.distanceTo(player.position);

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
                            const dir = new THREE.Vector3(Math.sin(this.wanderAngle), 0, Math.cos(this.wanderAngle));
                            this.position.addScaledVector(dir, this.speed * 0.25 * dt);
                            const rotationLerp = 1 - Math.exp(-6 * dt);
                            this.mesh.rotation.y += (this.wanderAngle - this.mesh.rotation.y) * rotationLerp;
                            this.idleBobTimer += dt * 5.0;
                            const bobFactor = Math.sin(this.idleBobTimer) * 0.05;
                            this.bodyMesh.scale.y = 0.7 + bobFactor; this.bodyMesh.scale.x = 1.0 - bobFactor * 0.5; this.bodyMesh.scale.z = 1.0 - bobFactor * 0.5;

                            if (playerDetected) { this.state = 'prep'; this.stateTimer = 0.15; this.isEngagingPlayer = true; } 
                            else {
                                this.stateTimer -= dt;
                                if (this.stateTimer <= 0) { this.state = 'prep'; this.stateTimer = 0.15; this.wanderAngle += (Math.random() - 0.5) * 2; }
                            }
                        } 
                        else if (this.state === 'chase') {
                            // withinChaseRange (khai báo ở đầu khối): nếu KHÔNG isAlerted, phải nằm
                            // đúng trong detectRadius mới được tiếp tục — không có vùng khoan nhượng,
                            // ra khỏi detectRadius là hủy chase ngay. Nếu ĐANG isAlerted (vừa bị đánh),
                            // ngưỡng nới rộng ra loseRadius (xem effectiveLoseRadius phía trên).
                            if (!withinChaseRange) { this.state = 'idle'; this.stateTimer = 1.2; this.isEngagingPlayer = false; }
                            else if (distToPlayer <= this.attackRange) {
                                // Đủ gần — khóa vị trí+hướng mục tiêu và bắt đầu chuẩn bị lao vào
                                this.state = 'attack_prep';
                                this.stateTimer = this.attackTelegraphDuration;
                                this.attackTargetPos.copy(player.position);
                            } else {
                                this.stateTimer -= dt;
                                if (this.stateTimer <= 0) { this.state = 'prep'; this.stateTimer = 0.12; }
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
                                else { this.state = 'idle'; this.stateTimer = 1.2; this.isEngagingPlayer = false; }
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
                                // Random sát thương ngay tại thời điểm gây damage (mỗi lần tấn công
                                // trúng đều random lại), thay vì cố định một lần lúc spawn slime.
                                const dmg = Math.floor(Math.random() * (this.maxAttackDamage - this.minAttackDamage + 1)) + this.minAttackDamage;
                                player.hp = Math.max(0, player.hp - dmg); player.invulnTimer = 0.8;
                                window.triggerDamageFlash(); sfx.playHit();
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
                                    this.state = 'idle'; this.stateTimer = 1.0; this.isEngagingPlayer = false;
                                } else {
                                    this.position.y = groundY + (this.height / 2); this.isGrounded = true;
                                    if (this.state === 'attack_jump') {
                                        this.state = 'attack_land'; this.stateTimer = 0.15;
                                    } else {
                                        this.state = 'land'; this.stateTimer = 0.12; 
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
