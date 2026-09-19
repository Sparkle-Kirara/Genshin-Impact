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
                    // Character #3 (Polearm) Validation — Damage Source Metadata: lastDamageSource
                    // ghi lại impact.source của lần takeDamage() GẦN NHẤT (null nếu chưa từng bị đánh
                    // hoặc lần gần nhất không mang metadata source) — dùng bởi Reactive Skill (HP
                    // polling, xem 09-character-system.js/combat.js) để biết damage vừa xảy ra có
                    // "canTriggerReactiveEffects" hay không, KHÔNG đổi chữ ký takeDamage().
                    this.lastDamageSource = null;
                    this.knockback = new THREE.Vector3();
                    // Hit Reaction / Poise System v1 — yêu cầu đã xác nhận: class Enemy (placeholder/
                    // testing bất tử) CHỈ cần field poise để hệ thống không crash nếu lỡ có code khác
                    // gọi resolveHitReaction()/đọc enemy.poise — KHÔNG triển khai Interrupt/Stagger
                    // behavior thật cho class này (không có AI state machine đáng kể để interrupt).
                    this.poise = { current: 100, max: 100 };
                    this.weightClass = 'heavy';
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
                
                // Hit Reaction / Poise System v1 — yêu cầu đã xác nhận: class Enemy (placeholder)
                // KHÔNG cần Interrupt/Stagger behavior thật, chỉ cần field poise tồn tại (xem
                // constructor) để không crash nếu code khác lỡ đọc/gọi resolveHitReaction(). Tham số
                // `impact` (thứ 4) được CHẤP NHẬN nhưng CỐ Ý KHÔNG dùng — giữ nguyên hành vi knockback
                // cũ (enemyRecoilForce.normal) 100%, không thêm logic gì.
                takeDamage(amount, direction, isHydro, impact) {
                    // Character #3 (Polearm) Validation — Damage Source Metadata: ghi lại NGAY ĐẦU
                    // hàm, TRƯỚC bất kỳ xử lý nào khác (đúng yêu cầu — dù class Enemy này KHÔNG thật
                    // sự trừ HP thấp qua field stats.hp theo cách Slime làm, vẫn ghi nhận nhất quán để
                    // không có nhánh nào bị bỏ sót nếu sau này có code khác dùng class Enemy để test).
                    this.lastDamageSource = (impact && impact.source) ? impact.source : null;

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

            // enterHitReactionState(slime, reaction, direction): Hit Reaction / Poise System v1 —
            // Phase 4 — helper TẬP TRUNG việc chuyển 1 slime sang state 'hitReaction' khi
            // resolveHitReaction() (combat.js) trả về interrupt=true. Tái dùng ĐÚNG pattern
            // enterIdleState() ở trên (1 hàm, gọi từ nhiều điểm trong takeDamage() thay vì lặp lại
            // logic gán state/timer rải rác).
            //
            // CHỦ ĐÍCH KHÔNG làm ở đây (đúng scope Phase 4 đã chốt — "sửa behavior, không balance"):
            //   - KHÔNG tự tính lại staggerDuration/knockbackForce — 2 giá trị này đã có sẵn trong
            //     `reaction` (do resolveHitReaction() tính), hàm này CHỈ áp dụng, không tính toán.
            //   - KHÔNG đổi this.knockback — takeDamage() đã set knockback TRƯỚC khi gọi hàm này
            //     (giữ nguyên vị trí code cũ, xem takeDamage() bên dưới), tránh trùng trách nhiệm.
            //
            // "Không tạo thêm timer nếu hitReactionTimer đã đủ" (yêu cầu đã chốt): nếu slime đang
            // stagger dở (hitReactionTimer > 0 từ đòn TRƯỚC) và ăn thêm 1 đòn interrupt MỚI, hàm này
            // vẫn ghi đè bằng staggerDuration MỚI (không cộng dồn 2 timer) — vì reaction MỚI luôn đại
            // diện đúng nhất cho đòn vừa xảy ra, cộng dồn sẽ gây stagger-lock kéo dài ngoài ý muốn
            // (rủi ro đã nêu ở mục M báo cáo Phase 3).
            //
            // Hủy jump velocity khi đang airborne (yêu cầu bước 3 đã chốt): reset jumpVelocity/
            // jumpVelocityY về 0 NHƯNG giữ nguyên isGrounded hiện tại — nếu slime đang bay
            // (isGrounded === false), KHÔNG ép isGrounded = true (sẽ = teleport xuống đất ngay lập
            // tức, vi phạm yêu cầu "không teleport"). Khối physics ở update() (nhánh `else` khi
            // !isGrounded, xem enemies.js update()) sẽ tự tiếp tục áp dụng trọng lực
            // (jumpVelocityY -= gravity*dt) cho slime rơi tự nhiên xuống đất — vì jumpVelocityY lúc
            // này = 0, slime rơi thẳng đứng từ vị trí hiện tại, không còn trôi theo hướng jump cũ.
            // Khi chạm đất, code landing SẴN CÓ (xem update()) sẽ tự chuyển sang 'attack_land' (nếu
            // this.state vẫn đang === 'attack_jump' lúc chạm đất) hoặc 'land' (mọi state khác, bao
            // gồm 'hitReaction') — ĐÂY LÀ LÝ DO hàm này phải đổi this.state SANG 'hitReaction' NGAY,
            // để logic landing có sẵn tự động chọn nhánh 'land' đúng ý "chuyển sang trạng thái phù
            // hợp để rơi/land" mà không cần thêm code riêng ở khối physics.
            //
            // Phase 4 — Launch Hit Reaction: khi reaction.level === 'launch', 2 điểm khác biệt so với
            // stagger/heavy thường:
            //   1. isGrounded ĐƯỢC ép = false (thay vì giữ nguyên như các level khác) — BẮT BUỘC, vì
            //      jumpVelocityY chỉ bị trừ dần bởi gravity trong nhánh airborne của update() (khối
            //      "else { this.jumpVelocityY -= player.gravity * dt; ... }") — nếu giữ isGrounded =
            //      true (VD slime đang 'prep'/'chase' lúc bị launch), jumpVelocityY sẽ KHÔNG bao giờ
            //      được gravity xử lý, slime "launch" nhưng không thực sự bay lên được. Điều này vẫn
            //      tuân thủ "không teleport" — không đổi position.y trực tiếp, chỉ đổi velocity, y hệt
            //      cách state 'jump' bình thường tự nhấc slime lên khỏi đất.
            //   2. jumpVelocityY được SET (không phải reset về 0) bằng reaction.verticalForce — ĐÚNG
            //      yêu cầu "reset/set giá trị launch mới, KHÔNG cộng dồn" (this.jumpVelocityY +=
            //      SẼ SAI, biến Launch thành juggle cộng dồn ngoài ý muốn). Nếu slime đang airborne từ
            //      1 Launch TRƯỚC (case "hitReaction → bị Launch lần nữa", mục 4/8 yêu cầu) và ăn thêm
            //      Launch #2, dòng set thẳng bên dưới TỰ ĐỘNG ghi đè jumpVelocityY cũ bằng giá trị mới
            //      — không cần code riêng cho case "multiple launch hits", vì phép gán "=" (không phải
            //      "+=") đã đúng ý muốn ở mọi trường hợp gọi lại hàm này.
            //   3. jumpVelocity (ngang, dùng cho di chuyển ngang lúc jump) VẪN reset về 0 như bình
            //      thường — Launch dùng this.knockback (kênh horizontal riêng, xem takeDamage()) để
            //      đẩy ngang, KHÔNG dùng jumpVelocity — đúng yêu cầu "Horizontal vẫn dùng this.knockback".
            function enterHitReactionState(slime, reaction, direction) {
                slime.state = 'hitReaction';
                slime.hitReactionTimer = reaction.staggerDuration;
                // Lưu hướng bị đẩy — CHƯA dùng cho animation recoil ở Phase 4 (thuộc phạm vi Phase
                // Reaction Tuning sau này), chỉ lưu sẵn field để Phase sau đọc thẳng, không cần sửa
                // lại chữ ký hàm/thêm tham số khi cần.
                if (direction && direction.lengthSq() > 0.0001) {
                    slime.hitReactionDirection.copy(direction).normalize();
                }
                slime.jumpVelocity.set(0, 0, 0);
                if (reaction.level === 'launch' && reaction.verticalForce > 0) {
                    slime.jumpVelocityY = reaction.verticalForce; // SET, không cộng dồn — xem giải thích ở trên
                    slime.isGrounded = false; // bắt buộc để gravity (nhánh airborne update()) xử lý
                    // Reaction Tuning — Launch Trajectory Consistency: decay rate NGANG (knockback)
                    // được làm CHẬM lại riêng cho 'launch', để khớp thời lượng bay THẬT (staggerDuration
                    // launch = 0.65s) thay vì dùng chung hằng số 12 (tắt gần hết chỉ sau ~0.3s, xem
                    // giải thích đầy đủ tại field knockbackDecayRate ở constructor). GIÁ TRỊ PLACEHOLDER
                    // — 3 chọn sao cho ở cuối staggerDuration (0.65s) vẫn còn ~15% lực đẩy ngang
                    // (exp(-3*0.65) ≈ 0.14), thay vì gần như bằng 0 như decay=12 cũ — để enemy vẫn còn
                    // trôi ngang nhẹ lúc chạm đất, tạo cảm giác đường vòng liền mạch thay vì rơi thẳng
                    // đứng ở nửa sau quỹ đạo. SẼ tinh chỉnh số chính xác ở Phase Reaction Tuning kế
                    // tiếp sau khi test trên device — đây chỉ là ước lượng toán học ban đầu, chưa qua
                    // kiểm chứng cảm giác thực tế.
                    slime.knockbackDecayRate = 3;
                    // Debug log tối thiểu (yêu cầu mục 11) — CHỈ để kiểm tra implementation lúc test
                    // trên device, có thể tắt/xóa ở Phase Reaction Tuning sau.
                    if (window.DEBUG_HIT_REACTION) {
                        console.log('[HitReaction] launch');
                        console.log('[HitReaction] horizontal force:', reaction.knockbackForce);
                        console.log('[HitReaction] vertical force:', reaction.verticalForce);
                    }
                } else {
                    slime.jumpVelocityY = 0;
                    // knockbackDecayRate RESET về mặc định (12) cho mọi reaction KHÔNG phải launch —
                    // đảm bảo nếu 1 slime từng bị launch trước đó (decayRate=3 còn sót lại) rồi ăn tiếp
                    // 1 đòn light/medium/heavy thường, hành vi decay quay lại ĐÚNG như cũ, không bị
                    // "dính" decay chậm của lần launch trước.
                    slime.knockbackDecayRate = 12;
                    // isGrounded KHÔNG bị đổi ở đây với reaction không phải launch — giữ nguyên giá
                    // trị hiện tại của slime (true nếu đang chase/prep lúc bị đánh, false nếu đang
                    // jump/attack_jump) — đúng yêu cầu "giữ trạng thái airborne nếu đang ở trên không".
                }
                slime.isEngagingPlayer = false;
            }

            class Slime {
                constructor(x, z, isLarge = false, level = 1) {
                    this.id = window.nextEnemyId++; this.isSlime = true;
                    // Stat Baseline Update v1 — level: field MỚI, dùng cho DEF mitigation kiểu
                    // Genshin ở chiều Player -> Enemy (xem calculatePlayerToEnemyDamage(), combat.js
                    // — CÔNG THỨC phụ thuộc CHÊNH LỆCH LEVEL giữa attacker/enemy, KHÔNG dùng
                    // this.stats.def nữa). Mặc định = 1 (AN TOÀN NGƯỢC — mọi lời gọi `new Slime(x,z,
                    // isLarge)` hiện tại không truyền level vẫn hoạt động đúng, enemy luôn Lv.1).
                    this.level = level;
                    if (isLarge) {
                        this.isLarge = true; this.width = 2.8; this.height = 2.0; this.depth = 2.8;
                        this.speed = 2.0; this.chaseSpeed = 4.4;
                        this.detectRadius = 15.0; this.loseRadius = 30.0; this.chaseCooldown = 0.6; this.jumpPowerY = 9.0;
                        // Stat Baseline Update v1 — HP/ATK Lv.1 TÍNH TỪ Genshin Enemy/Level Scaling
                        // chính thức (Base HP 27.168 × Type1 HP Mult Lv1 5.367859 ≈ 146; Base ATK
                        // "Large Hydro/Anemo/Dendro Slime" 35.168 × Type1 ATK Mult Lv1 2.02052 ≈ 71
                        // — game không phân biệt nguyên tố Large Slime nên dùng nhóm Hydro/Anemo/
                        // Dendro làm đại diện, KHÔNG phải nhóm Electro/Cryo/Pyro/Geo cao hơn).
                        // def: 14 GIỮ NGUYÊN số cũ — KHÔNG còn dùng cho DEF mitigation Player->Enemy
                        // (đã chốt đổi sang công thức theo level), field này giữ lại phòng khi hữu
                        // ích cho hệ thống khác sau này (yêu cầu đã xác nhận, không xóa).
                        this.stats = { maxHp: 146, hp: 146, atk: 71, def: 14 };
                        this.expReward = 30; // dùng bởi onSlimeKilled() (game.js) khi tính EXP rơi ra
                        this.attackRange = 2.1; // khoảng cách để bắt đầu chuẩn bị tấn công
                        this.attackTelegraphDuration = 0.45; // giây chuẩn bị trước khi lao vào
                        this.attackHitRange = 2.5; // khoảng cách tối đa để đòn đánh trúng
                        // Hit Reaction / Poise System v1 — yêu cầu đã xác nhận: Large Slime =
                        // weightClass "heavy" (tham chiếu Genshin: Large Slime weight 100 vs Small
                        // Slime weight 60, thuộc nhóm poise khác nhau) — Normal/Light impact khó/không
                        // stagger được, chỉ Heavy/Charged impact mới có khả năng. resistance=1.0
                        // (baseline, chưa có buff/debuff nào ở Alpha v1.0). Đọc qua
                        // resolveHitReaction() (combat.js) trong takeDamage() bên dưới — KHÔNG dùng
                        // HP để giả lập Poise (2 hệ thống độc lập hoàn toàn).
                        this.poise = { weightClass: 'heavy', resistance: 1.0 };
                    } else {
                        this.isLarge = false; this.width = 1.6; this.height = 0.8; this.depth = 1.6;
                        this.speed = 3.5; this.chaseSpeed = 7.2; 
                        this.detectRadius = 15.0; this.loseRadius = 30.0; this.chaseCooldown = 0.35; this.jumpPowerY = 7.2;
                        // Stat Baseline Update v1 — HP/ATK Lv.1 TÍNH TỪ Genshin Enemy/Level Scaling
                        // chính thức (Base HP "Slime (Small)" 10.8672 × Type1 HP Mult Lv1 5.367859 ≈
                        // 58; Base ATK "Slime (Small, Most)" 7.536 × Type1 ATK Mult Lv1 2.02052 ≈ 15).
                        // def: 8 GIỮ NGUYÊN số cũ — cùng lý do như Large Slime ở trên.
                        this.stats = { maxHp: 58, hp: 58, atk: 15, def: 8 };
                        this.expReward = 10;
                        this.attackRange = 1.7;
                        this.attackTelegraphDuration = 0.3;
                        this.attackHitRange = 2.1;
                        // Hit Reaction / Poise System v1 — yêu cầu đã xác nhận: Small Slime =
                        // weightClass "light".
                        this.poise = { weightClass: 'light', resistance: 1.0 };
                    }
                    // hitReactionTimer: đếm ngược Stagger Duration hiện tại (giây) — TÁCH BIỆT hoàn
                    // toàn khỏi player.staggerTimer (field khác, thuộc hướng Enemy->Player, ngoài
                    // phạm vi Alpha v1.0 này). Alpha v1.0 CHỈ dùng để hiển thị/debug + làm điều kiện
                    // hiệu ứng phụ (flash lâu hơn khi stagger mạnh) — KHÔNG khoá thêm hành vi AI nào
                    // ngoài Interrupt tức thời (xem takeDamage()/update() bên dưới) — đúng phạm vi đã
                    // chốt "chưa triển khai Poise meter/Resistance buildup phức tạp".
                    this.hitReactionTimer = 0;
                    // hitReactionDirection: Phase 4 — hướng bị đẩy lúc interrupt xảy ra (xem
                    // enterHitReactionState()). CHƯA dùng cho animation recoil ở Phase 4 (thuộc
                    // phạm vi Phase Reaction Tuning sau này) — chỉ lưu sẵn để không phải sửa chữ ký
                    // hàm khi cần dùng tới.
                    this.hitReactionDirection = new THREE.Vector3();
                    // knockbackDecayRate: Reaction Tuning — Launch Trajectory Consistency. Trước đây
                    // MỌI reaction level dùng CHUNG 1 hằng số decay cứng (Math.exp(-12*dt), xem
                    // update()) cho this.knockback (thành phần NGANG). Vấn đề: với 'launch', thành
                    // phần DỌC (jumpVelocityY) chịu gravity nên kéo dài suốt cả staggerDuration
                    // (0.65s, xem REACTION_LEVEL_CONFIG), trong khi decay=12 khiến knockback ngang tắt
                    // gần hết chỉ sau ~0.3s — kết quả 2 thành phần lệch timeline: nửa đầu quỹ đạo bay
                    // CÓ di chuyển ngang lẫn dọc (đúng ý đường vòng tự nhiên), nhưng nửa sau CHỈ còn
                    // rơi thẳng đứng (ngang đã tắt), tạo cảm giác "đẩy ngang trước, rơi dọc sau" dù về
                    // bản chất cả 2 vẫn cộng dồn cùng frame. Field này cho phép enterHitReactionState()
                    // ĐẶT RIÊNG decay rate mỗi lần reaction xảy ra — mặc định vẫn = 12 (giữ NGUYÊN
                    // hành vi cũ cho none/light/medium/heavy, KHÔNG đổi cảm giác stagger hiện có), CHỈ
                    // 'launch' được set thấp hơn để khớp đúng thời lượng bay. Đọc trong khối áp dụng
                    // knockback ở update() (dòng ~972) thay vì hard-code 12 tại đó.
                    this.knockbackDecayRate = 12;
                    this.attackTargetPos = new THREE.Vector3(); // vị trí player được "khóa" lúc bắt đầu chuẩn bị
                    this.player_hasBeenHitThisAttack = false; // tránh gây damage nhiều lần trong 1 lần lao

                    const initialY = window.getInitialGroundY(x, z, this.width, this.depth);
                    this.position = new THREE.Vector3(x, initialY + this.height / 2, z);
                    this.velocity = new THREE.Vector3(0, 0, 0);
                    this.alive = true; this.respawnTimer = 0; this.flashTimer = 0; this.knockback = new THREE.Vector3();
                    // Character #3 (Polearm) Validation — Damage Source Metadata: ĐÚNG PATTERN class
                    // Enemy ở trên (xem constructor đó) — lastDamageSource ghi lại impact.source của
                    // lần takeDamage() GẦN NHẤT, dùng bởi Reactive Skill (HP polling) để biết damage
                    // vừa xảy ra có canTriggerReactiveEffects hay không.
                    this.lastDamageSource = null;
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
                // Talent System v2 — BUG FIX QUAN TRỌNG: comment cũ (Pre-Alpha v0.7) mô tả tham số
                // đầu là "multiplier" và hàm này TỰ tính Final Damage qua calculateFinalDamage() —
                // ĐÚNG với kiến trúc CŨ, nhưng đã LỖI THỜI từ khi Talent System v2 đổi kiến trúc
                // (đã xác nhận với người dùng): mọi nơi gọi (file 08 melee, combat.js plunge, file
                // 09 skill/burst) giờ tự tính ĐẦY ĐỦ Final Damage qua calculatePlayerToEnemyDamage()
                // (combat.js) TRƯỚC KHI gọi takeDamage() — nhưng code bên dưới VẪN CÒN nguyên logic
                // cũ, tự nhân THÊM 1 lớp (player.stats.atk × DEF mitigation kiểu cũ) lên trên Final
                // Damage đã tính sẵn -> BUG NHÂN CHỒNG (sát thương cao bất thường đã xác nhận, VD
                // đòn Normal #1 lẽ ra ~4 nhưng ra ~70 vì bị nhân thêm atk=18 và chia lại DEF).
                //
                // Từ v2: tham số đầu là `damage` — Final Damage ĐÃ TÍNH SẴN ở tầng attacker (đúng
                // pipeline Character Stats -> Talent Scaling -> Raw Damage -> DEF Mitigation, xem
                // combat.js) — hàm này CHỈ trừ HP + hiệu ứng phụ, KHÔNG tính toán gì thêm. Enemy
                // KHÔNG cần biết nhân vật đang scale bằng ATK/HP/DEF hay Talent% bao nhiêu (đúng
                // nguyên tắc tách trách nhiệm đã chốt).
                //
                // Hit Reaction / Poise System v1 — tham số MỚI `impact` (thứ 4, optional — mặc định
                // null nếu không truyền, AN TOÀN NGƯỢC cho bất kỳ lời gọi cũ nào chưa cập nhật): data
                // thuần { strength, type, knockback } của đòn đánh, đưa qua resolveHitReaction()
                // (combat.js) CÙNG this.poise (weightClass/resistance, xem constructor) để ra Reaction
                // Level/Stagger/Interrupt/Knockback — HOÀN TOÀN ĐỘC LẬP với finalDamage/HP ở trên
                // (không dùng HP để giả lập Poise, đúng yêu cầu đã xác nhận). Nếu impact không được
                // truyền (null/undefined), fallback về hành vi knockback CŨ (enemyRecoilForce) để
                // không phá bất kỳ lời gọi takeDamage() nào chưa cập nhật impact.
                takeDamage(damage, direction, isHydro, impact) {
                    // Character #3 (Polearm) Validation — Damage Source Metadata: ghi lại NGAY ĐẦU
                    // hàm, TRƯỚC khi trừ HP (đúng yêu cầu implementation — Reactive Skill polling
                    // enemy.hp ở FRAME SAU cần đọc đúng lastDamageSource của lần damage này).
                    this.lastDamageSource = (impact && impact.source) ? impact.source : null;

                    // `player` vẫn cần cho phần "báo động đồng đội cùng camp" bên dưới (kiểm tra
                    // khoảng cách) — KHÔNG còn dùng để tính damage (xem giải thích Talent System v2
                    // ở comment phía trên).
                    const player = window.player;
                    const finalDamage = Math.max(0, Math.round(damage || 0));
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

                    // --- Hiệu ứng phụ không thuộc 8 bước chuẩn hóa (flash trắng, knockback, hit
                    // reaction) — giữ nguyên hành vi combat feel đã có từ trước v0.7, không phải 1
                    // phần Core Stats. ---
                    this.flashTimer = 0.18;
                    this.bodyMesh.material = isHydro ? this.hydroFlashMaterial : this.flashMaterial;

                    // Hit Reaction / Poise System v1: nếu impact được truyền -> dùng resolveHitReaction()
                    // (combat.js) để tính knockback + stagger + interrupt, THAY THẾ hoàn toàn
                    // enemyRecoilForce.normal/large hard-code cũ. Nếu KHÔNG truyền impact (lời gọi cũ
                    // chưa cập nhật) -> giữ NGUYÊN hành vi knockback cũ, không stagger/interrupt gì cả
                    // (an toàn ngược tuyệt đối).
                    if (impact && window.resolveHitReaction) {
                        const reaction = window.resolveHitReaction(impact, this.poise);
                        this.knockback.copy(direction).normalize().multiplyScalar(reaction.knockbackForce);

                        // Interrupt — Phase 4 (Combat Hit Reaction 2.0): MỞ RỘNG whitelist so với
                        // bản trước (trước đây CHỈ attack_prep/attack_jump). Yêu cầu đã chốt: thêm
                        // 'prep' và 'jump' — 2 state của hành vi nhảy LANG THANG bình thường (KHÔNG
                        // nhắm vào player) cũng phải bị gián đoạn được nếu impact đủ mạnh, đúng ví dụ
                        // gốc "Slime đang jump mà nhận impact đủ mạnh, không được tiếp tục jump như
                        // chưa có gì xảy ra". 'chase' CỐ Ý KHÔNG nằm trong whitelist (yêu cầu đã chốt
                        // "không bắt buộc interrupt chase; chase chỉ nhận knockback/recoil") — vì
                        // 'chase' tự thân không di chuyển slime (chỉ đếm cooldown chờ chuyển sang
                        // prep/attack_prep, xem update()), gián đoạn state này không có ý nghĩa hành
                        // vi rõ rệt, chỉ cần knockback là đủ cảm nhận được.
                        //
                        // enterHitReactionState() (helper mới, xem định nghĩa cạnh enterIdleState())
                        // THAY THẾ hoàn toàn enterIdleState() ở nhánh này — chuyển sang state
                        // 'hitReaction' riêng (KHÔNG phải 'idle' như bản cũ) để update() có thể khóa
                        // state machine đúng suốt staggerDuration (xem khối xử lý 'hitReaction' mới
                        // trong update() bên dưới) — bản cũ nhảy thẳng về 'idle' khiến slime có thể
                        // NGAY LẬP TỨC tái phát hiện player và chuyển sang 'prep' ở đúng frame kế
                        // tiếp, không thực sự "bị khựng lại" trong lúc stagger. Khi interrupt xảy ra,
                        // enterHitReactionState() TỰ set hitReactionTimer (không set trùng ở đây); khi
                        // KHÔNG interrupt (VD đang 'chase', hoặc impact chưa đủ mạnh), timer vẫn được
                        // set ở nhánh else bên dưới để giữ nguyên mục đích hiển thị/debug ban đầu.
                        //
                        // Phase 4 — Launch Hit Reaction: thêm 'hitReaction' vào whitelist, NHƯNG CHỈ
                        // khi reaction.level === 'launch' (điều kiện riêng, tách khỏi whitelist chung ở
                        // trên bằng toán tử ||) — đúng yêu cầu đã chốt "Cho phép hitReaction → launch
                        // interrupt. Không cho stagger thường liên tục override nhau." Nghĩa là: nếu
                        // slime đang stagger (state 'hitReaction') vì 1 đòn light/medium/heavy TRƯỚC,
                        // và ăn tiếp 1 đòn light/medium/heavy KHÁC trong lúc đang stagger, đòn mới
                        // KHÔNG được phép ngắt lại (rơi vào nhánh else, chỉ cập nhật hitReactionTimer
                        // hiển thị, không gọi lại enterHitReactionState — tránh 'hitReaction' bị
                        // stagger-lock liên hoàn vô thời hạn bởi các đòn yếu). CHỈ đòn tiếp theo đạt
                        // đúng level 'launch' mới được phép ngắt 1 slime đang 'hitReaction' — khớp
                        // đúng ví dụ "Launch #1 → airborne → Launch #2 → vertical velocity = Launch
                        // #2" trong yêu cầu, và enterHitReactionState() (xem định nghĩa ở trên) đã tự
                        // xử lý đúng việc SET (không cộng dồn) jumpVelocityY cho case gọi lại này.
                        const canInterruptState =
                            this.state === 'attack_prep' || this.state === 'attack_jump' ||
                            this.state === 'prep' || this.state === 'jump' ||
                            (this.state === 'hitReaction' && reaction.level === 'launch');

                        if (reaction.interrupt && canInterruptState) {
                            enterHitReactionState(this, reaction, direction);
                        } else {
                            this.hitReactionTimer = reaction.staggerDuration;
                        }
                    } else {
                        const force = this.isLarge ? window.COMBAT_FEEL_CONFIG.enemyRecoilForce.large : window.COMBAT_FEEL_CONFIG.enemyRecoilForce.normal;
                        this.knockback.copy(direction).normalize().multiplyScalar(force);
                    }

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

                    // Hit Reaction / Poise System v1 — Phase 4 (Combat Hit Reaction 2.0): khác bản
                    // trước (comment cũ nói "KHÔNG khoá thêm hành vi AI nào"), TỪ PHASE 4 timer này
                    // THỰC SỰ khóa state machine trong lúc this.state === 'hitReaction' (xem khối xử
                    // lý riêng bên dưới, đặt TRƯỚC state machine grounded/airborne chính — giống cách
                    // updateBehaviorMode() đã đặt trước, để đếm ngược luôn đúng nhịp mỗi frame bất kể
                    // nhánh nào chạy sau đó).
                    if (this.hitReactionTimer > 0) this.hitReactionTimer -= dt;

                    // Behavior Mode (đứng yên vs trườn khi idle) — tick ở ĐÂY, TRƯỚC state machine,
                    // độc lập hoàn toàn với state hiện tại (idle/jump/chase/...). Xem comment đầy đủ ở
                    // SLIME_WANDER_CONFIG.behaviorModeDuration và updateBehaviorMode() phía trên class.
                    updateBehaviorMode(this, dt);

                    // Player đã vào Dead state (biến mất khỏi scene) — không còn là mục tiêu để
                    // phát hiện/tấn công MỚI. Animation/vật lý đang dở (rơi, land...) vẫn chạy
                    // tiếp bình thường để tránh treo slime giữa không trung.
                    const playerIsTargetable = !player.isDead;

                    const distToPlayer = this.position.distanceTo(player.position);

                    // ============================================================
                    // Elemental Skill Validation — DECOY TARGET PRIORITY (spec mục 3-5)
                    // ============================================================
                    // LIMITATION KIẾN TRÚC ĐÃ XÁC NHẬN VỚI NGƯỜI DÙNG: state machine của Slime hard-
                    // code `player`/`player.position` trực tiếp ở nhiều điểm (không có field
                    // `this.target` trừu tượng) — thay vì viết lại toàn bộ state machine, patch TỐI
                    // THIỂU: tính 1 LẦN DUY NHẤT "mục tiêu hiệu lực" (targetPos/targetIsDecoy) ngay ở
                    // đây, TRƯỚC mọi logic playerDetected/withinChaseRange bên dưới — các điểm dùng
                    // player.position để QUYẾT ĐỊNH HƯỚNG DI CHUYỂN/TẤN CÔNG (không phải hiển thị HP
                    // bar, vốn luôn phải theo player thật) đọc qua targetPos thay vì player.position
                    // trực tiếp. distToPlayer (dòng trên) GIỮ NGUYÊN Ý NGHĨA GỐC (chỉ dùng cho HP bar
                    // + isAlerted/loseRadius — logic đó vẫn nói về player thật, spec không yêu cầu đổi).
                    //
                    // Taunt/Attraction (spec mục 3): "Enemy nằm trong phạm vi hợp lệ sẽ ưu tiên Decoy
                    // — KHÔNG teleport, KHÔNG kéo bằng physics/force, Enemy vẫn dùng movement/AI bình
                    // thường để di chuyển tới Decoy" — đạt được TỰ NHIÊN bằng cách chỉ đổi "vị trí mà
                    // AI nhắm tới" (targetPos), state machine di chuyển/tấn công phía dưới HOÀN TOÀN
                    // KHÔNG ĐỔI logic (vẫn chase/prep/jump y hệt cũ, chỉ là bây giờ hướng tới
                    // targetPos thay vì player.position).
                    //
                    // Spec mục 5: "Nếu Player tấn công Enemy trong lúc bị thu hút -> Enemy vẫn tiếp
                    // tục ưu tiên Decoy" — ĐẠT ĐƯỢC TỰ NHIÊN vì điều kiện dưới đây CHỈ phụ thuộc
                    // distance-to-Decoy, KHÔNG có logic nào "quay lại player khi bị player đánh" — bị
                    // đánh chỉ set isAlerted (nếu trước đó chưa alert), không ảnh hưởng targetIsDecoy.
                    let targetPos = player.position;
                    let targetIsDecoy = false;
                    const decoy = window.activeDecoy;
                    if (decoy && decoy.active && this.position.distanceTo(decoy.position) <= decoy.attractionRadius) {
                        targetPos = decoy.position;
                        targetIsDecoy = true;
                    }
                    const distToTarget = this.position.distanceTo(targetPos);

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
                        //
                        // Elemental Skill Validation — targetIsDecoy === true nghĩa là slime đang nằm
                        // trong attractionRadius của Decoy (đã tính ở trên) — Taunt LUÔN "phát hiện"
                        // ngay lập tức, KHÔNG cần qua detectRadius/isAlerted (đó là điều kiện phát
                        // hiện PLAYER bằng "giác quan" tự nhiên, khác bản chất với việc bị Decoy chủ
                        // động thu hút sự chú ý — spec mục 3 "Enemy trong phạm vi -> ưu tiên Decoy",
                        // không có điều kiện "phải phát hiện trước").
                        const playerDetected = targetIsDecoy || (playerIsTargetable && (this.isAlerted || distToPlayer < this.detectRadius));
                        // withinChaseRange: điều kiện để TIẾP TỤC nhắm vào player khi đã ở giữa
                        // một chuỗi đuổi (prep/land sau khi vừa chase).
                        // - Nếu ĐANG bị báo động (isAlerted): dùng loseRadius — cho phép đuổi dai
                        //   hơn bình thường (hysteresis CÓ chủ đích, vì slime đã "nổi giận").
                        // - Nếu KHÔNG báo động (chỉ phát hiện tự nhiên bằng mắt): bắt buộc phải
                        //   nằm trong đúng detectRadius mới được tiếp tục đuổi — KHÔNG có vùng
                        //   khoan nhượng nào cả. Ra khỏi detectRadius dù chỉ 1 chút là hủy chase
                        //   ngay, quay lại idle.
                        const effectiveLoseRadius = this.isAlerted ? this.loseRadius : this.detectRadius;
                        // Elemental Skill Validation — targetIsDecoy === true: tiếp tục đuổi Decoy MIỄN
                        // LÀ còn trong attractionRadius (đã đảm bảo bởi chính điều kiện gán targetIsDecoy
                        // ở trên, tính LẠI mỗi frame) — không áp effectiveLoseRadius (đó là ngưỡng riêng
                        // cho việc "bỏ cuộc đuổi player", không áp dụng cho Decoy).
                        const withinChaseRange = targetIsDecoy || (playerIsTargetable && distToPlayer <= effectiveLoseRadius);
                        // Hit Reaction / Poise System v1 — Phase 4: BẢO VỆ this.state === 'hitReaction'
                        // khỏi bị khối detection bên dưới ghi đè thành 'jump'. Khối gốc (else nhánh
                        // dưới) tự ý set this.state = 'jump' bất cứ khi nào position.y cao hơn ground
                        // + 0.05 (VD do vừa bị đẩy lên nhẹ bởi knockback theo phương ngang gây chênh Y
                        // khi resolveStaticCollisions chạy) — nếu để lọt qua, slime đang stagger sẽ bị
                        // đổi nhầm sang 'jump' giữa chừng, phá khóa state machine mà Phase 4 yêu cầu
                        // ("trong thời gian hitReactionTimer > 0, enemy không được tự chuyển sang
                        // prep/chase/attack_*"). Nhánh này SKIP HẲN khối detection y-position gốc khi
                        // đang hitReaction — giữ nguyên isGrounded hiện tại (đã chốt đúng lúc
                        // enterHitReactionState() được gọi), không có tác dụng phụ nào khác.
                        if (this.state === 'hitReaction') {
                            // Không làm gì thêm ở đây — chỉ đảm bảo state/isGrounded không bị đổi bởi
                            // khối detection phía trên. Toàn bộ xử lý đếm ngược + chuyển state khi hết
                            // hitReactionTimer nằm ở khối riêng ngay bên dưới (sau chuỗi if/else state
                            // machine chính) để dùng chung được cho cả trường hợp grounded lẫn airborne
                            // mà không phải viết trùng logic 2 lần.
                        } else if (this.position.y > currentGroundY + (this.height / 2) + 0.05) {
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
                            else if (distToTarget <= this.attackRange) {
                                // Đủ gần — khóa vị trí+hướng mục tiêu và bắt đầu chuẩn bị lao vào
                                this.state = 'attack_prep';
                                this.stateTimer = this.attackTelegraphDuration;
                                // Elemental Skill Validation — targetPos (Decoy hoặc player, tính ở đầu
                                // update()) thay vì player.position trực tiếp — đây là 1 trong các điểm
                                // "quyết định AI behavior" cần patch theo limitation đã xác nhận.
                                this.attackTargetPos.copy(targetPos);
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
                                    // Elemental Skill Validation — targetPos thay vì player.position.
                                    const dir = new THREE.Vector3().subVectors(targetPos, this.position);
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
                        else if (this.state === 'hitReaction') {
                            // Hit Reaction / Poise System v1 — Phase 4: nhánh xử lý khi slime bị
                            // interrupt LÚC ĐANG GROUNDED (đến từ state 'prep', xem whitelist trong
                            // takeDamage()). Trường hợp interrupt lúc ĐANG AIRBORNE ('jump'/
                            // 'attack_jump') KHÔNG cần xử lý ở đây — enterHitReactionState() giữ
                            // isGrounded=false, nên slime rơi vào nhánh airborne (khối `else` ở đầu
                            // update(), physics gravity) chứ không lọt vào khối `if (this.isGrounded)`
                            // này; landing logic CÓ SẴN ở đó (xem "if (this.position.y <= groundY...")
                            // sẽ tự chuyển 'hitReaction' -> 'land' khi chạm đất (vì chỉ check riêng
                            // this.state === 'attack_jump' để vào 'attack_land', mọi state khác kể cả
                            // 'hitReaction' đều rơi vào nhánh else -> 'land') — đúng ý "chuyển sang
                            // trạng thái phù hợp để rơi/land", không cần sửa thêm gì ở khối physics.
                            //
                            // Ở đây CHỈ xử lý case grounded: đếm hitReactionTimer (đã đếm ở khối đầu
                            // update(), xem "if (this.hitReactionTimer > 0) this.hitReactionTimer -=
                            // dt;"), khi hết hạn -> tái dùng ĐÚNG logic chuyển tiếp đã có ở 'land'
                            // (dòng ngay phía trên: withinChaseRange ? 'chase' : enterIdleState) thay
                            // vì bịa ra rule mới — giữ nguyên tinh thần "tái sử dụng transition hiện
                            // có thay vì tạo state machine thứ hai" đã chốt.
                            if (this.hitReactionTimer <= 0) {
                                if (withinChaseRange) { this.state = 'chase'; this.stateTimer = this.chaseCooldown; this.isEngagingPlayer = true; }
                                else { enterIdleState(this); this.isEngagingPlayer = false; }
                            }
                        }
                    } else {
                        this.jumpVelocityY -= player.gravity * dt;
                        this.position.x += this.jumpVelocity.x * dt; this.position.y += this.jumpVelocityY * dt; this.position.z += this.jumpVelocity.z * dt;
                        if (this.jumpVelocity.lengthSq() > 0.01) { const angle = Math.atan2(this.jumpVelocity.x, this.jumpVelocity.z); this.mesh.rotation.y = angle; }
                        window.resolveStaticCollisions(this, this.width, this.height, this.depth, dt);

                        // Trong lúc lao vào (attack_jump), kiểm tra va chạm với TARGET (player hoặc
                        // Decoy nếu đang bị taunt) NGAY KHI ĐANG BAY, không cần đợi tiếp đất — đây
                        // chính là hành vi "tông vào" gây damage.
                        //
                        // Elemental Skill Validation — DISPATCH theo targetIsDecoy (spec mục 6: "Decoy
                        // có HP riêng, Enemy có thể tấn công Decoy; khi HP<=0 -> Explosion"). Khi đang
                        // bị Decoy taunt, va chạm gây damage vào Decoy.takeDamage() THAY VÌ player.hp
                        // — nhánh player HOÀN TOÀN KHÔNG CHẠY trong trường hợp này (đúng spec mục 5:
                        // "Enemy vẫn tiếp tục ưu tiên Decoy" — không có logic nào lỡ tay gây damage cả
                        // 2 phía cùng lúc). player_hasBeenHitThisAttack DÙNG CHUNG cho cả 2 nhánh (đúng
                        // ý nghĩa gốc: "đã trúng mục tiêu trong lượt lao vào này", không quan trọng
                        // mục tiêu là ai).
                        if (this.state === 'attack_jump' && !this.player_hasBeenHitThisAttack) {
                            if (targetIsDecoy) {
                                const distNow = this.position.distanceTo(decoy.position);
                                if (distNow <= this.attackHitRange) {
                                    this.player_hasBeenHitThisAttack = true;
                                    // Spec mục 6: Decoy HP tuyến tính, KHÔNG qua calculateFinalDamage()/DEF
                                    // (Decoy không có stats.def — spec không yêu cầu Decoy có DEF mitigation,
                                    // chỉ cần "HP riêng, configurable"). Dùng THẲNG this.stats.atk làm damage.
                                    decoy.takeDamage(this.stats.atk);
                                    sfx.playHit();
                                    cameraState.shakeTimer = 0.15; cameraState.shakeIntensity = 0.2;
                                }
                            } else if (playerIsTargetable) {
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
                        // Reaction Tuning — Launch Trajectory Consistency: dùng this.knockbackDecayRate
                        // (mặc định 12, riêng 'launch' = 3, set tại enterHitReactionState()) thay vì
                        // hằng số cứng 12 — để thành phần NGANG (knockback) decay đồng bộ với thành
                        // phần DỌC (jumpVelocityY, chịu gravity xuyên suốt staggerDuration) khi đang
                        // launch, tránh cảm giác "đẩy ngang trước, rơi dọc sau" (xem giải thích đầy đủ
                        // tại field knockbackDecayRate ở constructor). Với mọi reaction khác
                        // (none/light/medium/heavy), knockbackDecayRate luôn = 12 → hành vi decay
                        // GIỮ NGUYÊN 100% như trước, không đổi cảm giác stagger hiện có.
                        this.knockback.multiplyScalar(Math.exp(-this.knockbackDecayRate * dt));
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


