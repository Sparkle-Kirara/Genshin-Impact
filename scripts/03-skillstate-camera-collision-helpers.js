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
