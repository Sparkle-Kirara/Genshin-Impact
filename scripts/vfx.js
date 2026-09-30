// ============================================================
// ============================================================
// vfx.js — Tách ra từ game.js
// Chứa: toàn bộ hàm spawn particle/VFX (death, combat sparks, dash trail,
// energy particles, hydro trail/splash, burst trail, glider/plunge trail,
// plunge impact) + updateEnergyParticles (logic hút năng lượng về player).
//
// Load SAU game.js — cần các mảng state (particles, energyParticles,
// ghostTrails) và helper (getGroundYForPosition) đã được game.js export qua
// window trước khi file này chạy.
//
// PHỤ THUỘC TỪ game.js (đọc qua window.*):
//   window.scene, window.player, window.particles, window.energyParticles,
//   window.ghostTrails, window.getGroundYForPosition
//
// vfx.js EXPORT ra window để game.js/enemies.js/combat.js dùng:
//   spawnDeathParticles, spawnCombatSparks, spawnDashWindTrail,
//   spawnEnergyParticles, spawnHydroTrail, spawnHydroSplash, triggerHydroFlash,
//   spawnBurstTrail, updateEnergyParticles, spawnPlayerGhost, spawnRunTrail,
//   spawnGliderTrailParticles, spawnPlungeTrailParticles, spawnPlungeImpactVisuals,
//   spawnDamageNumber, updateDamageNumbers (Pre-Alpha v0.7 — Core Stats)
// ============================================================

            function spawnDeathParticles(position) {
                const scene = window.scene;
                const particles = window.particles;
                const count = 25;
                const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
                const mat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9, metalness: 0.1 }); 
                for (let i = 0; i < count; i++) {
                    const p = new THREE.Mesh(geo, mat);
                    p.position.copy(position);
                    p.position.y += Math.random() * 0.9;
                    scene.add(p);
                    particles.push({
                        mesh: p,
                        velocity: new THREE.Vector3((Math.random() - 0.5) * 11, Math.random() * 8 + 5, (Math.random() - 0.5) * 11),
                        life: 0.6, maxLife: 0.6, gravity: 24, scaleDown: true, drag: 2.0 
                    });
                }
            }
            window.spawnDeathParticles = spawnDeathParticles;

            // Readability Batch (Character #3) — tham số `color` MỚI, optional: mặc định trắng (0xffffff)
            // y hệt trước -> mọi lời gọi cũ không truyền color giữ nguyên 100% hình ảnh.
            function spawnCombatSparks(position, normal, color) {
                const scene = window.scene;
                const particles = window.particles;
                const count = 18;
                const geo = new THREE.BoxGeometry(0.06, 0.06, 0.5);
                const mat = new THREE.MeshBasicMaterial({ color: (typeof color === 'number') ? color : 0xffffff, transparent: true, opacity: 0.95 });
                for (let i = 0; i < count; i++) {
                    const p = new THREE.Mesh(geo, mat);
                    p.position.copy(position);
                    p.position.y += (Math.random() - 0.5) * 0.5;
                    
                    const scatter = new THREE.Vector3(
                        (Math.random() - 0.5) * 20,
                        Math.random() * 12 + 2,
                        (Math.random() - 0.5) * 20
                    );
                    p.lookAt(p.position.clone().add(scatter));
                    scene.add(p);

                    particles.push({
                        mesh: p, velocity: scatter, life: 0.35, maxLife: 0.35, gravity: 8, scaleDown: true, drag: 12.0 
                    });
                }

                const ringGeo = new THREE.RingGeometry(0.2, 0.4, 16);
                const ringMat = new THREE.MeshBasicMaterial({ color: (typeof color === 'number') ? color : 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.position.copy(position);
                ring.position.y += 0.3;
                ring.rotation.x = Math.PI / 2;
                scene.add(ring);

                particles.push({ mesh: ring, velocity: new THREE.Vector3(0, 0, 0), life: 0.15, maxLife: 0.15, scaleUp: true, growthRate: 18 });
            }
            window.spawnCombatSparks = spawnCombatSparks;

            function spawnDashWindTrail(position, direction) {
                const scene = window.scene;
                const particles = window.particles;
                const count = 4;
                const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
                const mat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.6 });
                for (let i = 0; i < count; i++) {
                    const p = new THREE.Mesh(geo, mat);
                    p.position.copy(position);
                    p.position.x += (Math.random() - 0.5) * 0.8;
                    p.position.y += (Math.random() - 0.5) * 0.8;
                    p.position.z += (Math.random() - 0.5) * 0.8;
                    scene.add(p);
                    particles.push({
                        mesh: p,
                        velocity: direction.clone().negate().multiplyScalar(8).add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4)),
                        life: 0.22, maxLife: 0.22, scaleDown: true, drag: 5.0
                    });
                }
            }
            window.spawnDashWindTrail = spawnDashWindTrail;

            function spawnEnergyParticles(originPos) {
                const scene = window.scene;
                const energyParticles = window.energyParticles;
                for(let i=0; i<5; i++) {
                    const mesh = new THREE.Mesh(
                        new THREE.SphereGeometry(0.12, 6, 6),
                        new THREE.MeshBasicMaterial({ color: 0x22d3ee })
                    );
                    mesh.position.copy(originPos);
                    mesh.position.y += Math.random() * 0.5;
                    scene.add(mesh);
                    energyParticles.push({
                        mesh: mesh,
                        velocity: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3),
                        life: 2.0
                    });
                }
            }
            window.spawnEnergyParticles = spawnEnergyParticles;

            function spawnHydroTrail(position) {
                const scene = window.scene;
                const particles = window.particles;
                const geo = new THREE.SphereGeometry(0.07, 4, 4);
                const mat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.65 });
                const p = new THREE.Mesh(geo, mat);
                p.position.copy(position);
                p.position.x += (Math.random() - 0.5) * 0.12; p.position.y += (Math.random() - 0.5) * 0.12; p.position.z += (Math.random() - 0.5) * 0.12;
                scene.add(p);
                particles.push({
                    mesh: p, velocity: new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6),
                    life: 0.14, maxLife: 0.14, scaleDown: true
                });
            }
            window.spawnHydroTrail = spawnHydroTrail;

            function spawnHydroSplash(position, normal, isFinal) {
                const scene = window.scene;
                const particles = window.particles;
                const count = isFinal ? 14 : 7;
                const speed  = isFinal ? 7.0 : 4.5;
                for (let i = 0; i < count; i++) {
                    const geo = new THREE.SphereGeometry(isFinal ? 0.1 : 0.07, 4, 4);
                    const mat = new THREE.MeshBasicMaterial({ color: isFinal ? 0x67e8f9 : 0x22d3ee, transparent: true, opacity: 0.9 });
                    const p = new THREE.Mesh(geo, mat);
                    p.position.copy(position);
                    p.position.y += Math.random() * 0.3;
                    scene.add(p);
                    const scatter = new THREE.Vector3(
                        normal.x * speed * (0.4 + Math.random() * 0.6) + (Math.random() - 0.5) * speed,
                        Math.random() * speed * 0.8 + 1.5,
                        normal.z * speed * (0.4 + Math.random() * 0.6) + (Math.random() - 0.5) * speed
                    );
                    particles.push({ mesh: p, velocity: scatter, life: isFinal ? 0.32 : 0.22, maxLife: isFinal ? 0.32 : 0.22, gravity: 16, scaleDown: true });
                }

                const rSize = isFinal ? 0.55 : 0.3;
                const ringGeo = new THREE.RingGeometry(rSize * 0.4, rSize * 0.65, isFinal ? 20 : 14);
                const ringMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide, transparent: true, opacity: isFinal ? 0.75 : 0.55 });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.position.copy(position);
                ring.rotation.x = Math.PI / 2;
                scene.add(ring);
                particles.push({ mesh: ring, velocity: new THREE.Vector3(0, 0, 0), life: isFinal ? 0.3 : 0.18, maxLife: isFinal ? 0.3 : 0.18, scaleUp: true, growthRate: isFinal ? 12 : 8 });
            }
            window.spawnHydroSplash = spawnHydroSplash;

            let hydroFlashActive = false;
            function triggerHydroFlash() {
                const el = document.getElementById('hydro-flash');
                if (!el) return;
                el.classList.remove('active');
                void el.offsetWidth; 
                el.classList.add('active');
            }
            window.triggerHydroFlash = triggerHydroFlash;

            function spawnBurstTrail(position) {
                const scene = window.scene;
                const particles = window.particles;
                const geo = new THREE.SphereGeometry(0.13, 4, 4);
                const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5 });
                const p = new THREE.Mesh(geo, mat);
                p.position.copy(position);
                p.position.x += (Math.random() - 0.5) * 0.5; p.position.y += (Math.random() - 0.5) * 0.4; p.position.z += (Math.random() - 0.5) * 0.5;
                scene.add(p);
                particles.push({ mesh: p, velocity: new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.8 + 0.2, (Math.random() - 0.5) * 1.2), life: 0.28, maxLife: 0.28, scaleDown: true });
            }
            window.spawnBurstTrail = spawnBurstTrail;

            function updateEnergyParticles(dt) {
                const player = window.player;
                const scene = window.scene;
                const energyParticles = window.energyParticles;
                for(let i = energyParticles.length - 1; i >= 0; i--) {
                    let p = energyParticles[i];
                    p.life -= dt;
                    let dir = new THREE.Vector3().subVectors(player.position, p.mesh.position);
                    let dist = dir.length();
                    
                    if (dist < 0.6 || p.life <= 0) {
                        player.energy = Math.min(player.maxEnergy, player.energy + 1);
                        scene.remove(p.mesh);
                        p.mesh.geometry.dispose();
                        p.mesh.material.dispose();
                        energyParticles.splice(i, 1);
                        continue;
                    }
                    
                    dir.normalize();
                    p.velocity.lerp(dir.multiplyScalar(10.0), dt * 4.0); 
                    p.mesh.position.addScaledVector(p.velocity, dt);
                }
            }
            window.updateEnergyParticles = updateEnergyParticles;

            function spawnPlayerGhost(playerMesh) {
                const scene = window.scene;
                const ghostTrails = window.ghostTrails;
                const ghostGroup = new THREE.Group();
                ghostGroup.position.copy(playerMesh.position);
                ghostGroup.rotation.copy(playerMesh.rotation);

                const bodyGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.8, 8);
                const ghostMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.35, depthWrite: false });
                const bodyClone = new THREE.Mesh(bodyGeo, ghostMat);
                ghostGroup.add(bodyClone);

                scene.add(ghostGroup);
                ghostTrails.push({ mesh: ghostGroup, life: 0.35, maxLife: 0.35 });
            }
            window.spawnPlayerGhost = spawnPlayerGhost;

            function spawnRunTrail(position, direction) {
                const scene = window.scene;
                const particles = window.particles;
                const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
                const mat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.4 });
                const p = new THREE.Mesh(geo, mat);
                p.position.copy(position);
                p.position.y -= 0.8; 
                p.position.x += (Math.random() - 0.5) * 0.3; p.position.z += (Math.random() - 0.5) * 0.3;
                scene.add(p);
                
                particles.push({
                    mesh: p,
                    velocity: direction.clone().negate().multiplyScalar(2.2).add(new THREE.Vector3((Math.random() - 0.5) * 1, Math.random() * 0.8 + 0.2, (Math.random() - 0.5) * 1)),
                    life: 0.24, maxLife: 0.24, scaleDown: true
                });
            }
            window.spawnRunTrail = spawnRunTrail;

            function spawnGliderTrailParticles() {
                const scene = window.scene;
                const particles = window.particles;
                const player = window.player;
                const geo = new THREE.SphereGeometry(0.08, 4, 4);
                const mat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.55 });
                const p = new THREE.Mesh(geo, mat);
                p.position.copy(player.position);
                p.position.y += 0.1;
                p.position.x += (Math.random() - 0.5) * 1.6;
                p.position.z += (Math.random() - 0.5) * 1.6;
                scene.add(p);
                particles.push({
                    mesh: p,
                    velocity: new THREE.Vector3((Math.random() - 0.5) * 1.0, -0.6, (Math.random() - 0.5) * 1.0),
                    life: 0.25, maxLife: 0.25, scaleDown: true
                });
            }
            window.spawnGliderTrailParticles = spawnGliderTrailParticles;

            function spawnPlungeTrailParticles() {
                const scene = window.scene;
                const particles = window.particles;
                const player = window.player;
                const geo = new THREE.CylinderGeometry(0.12, 0.12, 1.8, 4);
                const mat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.35 });
                const p = new THREE.Mesh(geo, mat);
                p.position.copy(player.position);
                p.position.x += (Math.random() - 0.5) * 0.8;
                p.position.z += (Math.random() - 0.5) * 0.8;
                p.position.y += 1.2;
                scene.add(p);
                particles.push({
                    mesh: p,
                    velocity: new THREE.Vector3(0, 15.0, 0),
                    life: 0.15, maxLife: 0.15, scaleDown: true
                });
            }
            window.spawnPlungeTrailParticles = spawnPlungeTrailParticles;

            function spawnPlungeImpactVisuals(pos) {
                const scene = window.scene;
                const particles = window.particles;
                const getGroundYForPosition = window.getGroundYForPosition;
                const ringGeo = new THREE.RingGeometry(0.15, 0.5, 24);
                const ringMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.position.copy(pos);
                ring.position.y = getGroundYForPosition(pos) + 0.05;
                ring.rotation.x = Math.PI / 2;
                scene.add(ring);
                
                particles.push({
                    mesh: ring,
                    velocity: new THREE.Vector3(0, 0, 0),
                    life: 0.38, maxLife: 0.38,
                    scaleUp: true, growthRate: 20.0
                });
                
                const count = 22;
                const boxGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
                const boxMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.88, metalness: 0.12 });
                for (let i = 0; i < count; i++) {
                    const mesh = new THREE.Mesh(boxGeo, boxMat);
                    mesh.position.copy(pos);
                    mesh.position.y = getGroundYForPosition(pos) + 0.15;
                    scene.add(mesh);
                    
                    const angle = Math.random() * Math.PI * 2;
                    const speed = Math.random() * 9.0 + 5.0;
                    const velocity = new THREE.Vector3(
                        Math.cos(angle) * speed,
                        Math.random() * 9.0 + 5.5,
                        Math.sin(angle) * speed
                    );
                    
                    particles.push({
                        mesh: mesh,
                        velocity: velocity,
                        gravity: 30,
                        life: 0.55, maxLife: 0.55,
                        scaleDown: true,
                        drag: 3.5
                    });
                }
            }
            window.spawnPlungeImpactVisuals = spawnPlungeImpactVisuals;

            // ============================================================
            // DAMAGE NUMBER (Pre-Alpha v0.7 — Core Stats)
            // ============================================================
            // Vẽ số sát thương lên 1 CanvasTexture nhỏ rồi gán vào THREE.Sprite — Sprite luôn tự quay
            // mặt về camera (billboard), nên số hiển thị rõ ràng từ MỌI góc nhìn, khác với việc vẽ số
            // lên 1 mặt phẳng Mesh thường (sẽ bị "lật ngược"/biến mất khi nhìn từ sau).
            //
            // BUGFIX (Readability Batch): TRƯỚC ĐÂY dùng 1 canvas DÙNG CHUNG cho mọi damage number.
            // THREE.CanvasTexture chỉ upload nội dung canvas lên GPU ở LẦN RENDER KẾ TIẾP, không phải
            // lúc tạo texture — nên nếu nhiều số được spawn TRONG CÙNG 1 FRAME (AoE trúng nhiều enemy:
            // Charged Attack circle, Burst Activation, Water Bubble...), TẤT CẢ đều hiện nội dung vẽ
            // CUỐI CÙNG (số/màu của enemy cuối vòng lặp) — đã tái hiện bằng test thực tế. Giờ mỗi số có
            // canvas RIÊNG (256x128, giải phóng cùng texture khi số biến mất — xem updateDamageNumbers).
            // 256x128 (thay 128x64, CÙNG tỉ lệ 2:1): đủ chỗ cho cỡ chữ lớn hơn của style heavy/launch,
            // chữ nét hơn trên màn hình mobile mật độ điểm ảnh cao.
            function getDamageNumberCanvas() {
                const canvas = document.createElement('canvas');
                canvas.width = 256;
                canvas.height = 128;
                return { canvas: canvas, ctx: canvas.getContext('2d') };
            }

            // spawnDamageNumber(position, amount): position là điểm world-space bắt đầu (đã tính sẵn
            // offset lên trên đầu enemy/player ở nơi gọi — xem enemies.js/game.js), amount là số
            // nguyên đã tính xong bởi calculateFinalDamage() (KHÔNG tính toán gì thêm ở đây, hàm này
            // thuần là hiển thị).
            // ============================================================
            // Readability Batch (Character #3) — DAMAGE NUMBER STYLES (data-driven)
            // ============================================================
            // Style CHỈ quyết định HÌNH THỨC hiển thị (màu/cỡ/thời gian sống) — KHÔNG tính toán damage
            // nào ở đây. Con số luôn là `amount` do enemy.takeDamage() truyền vào (đúng giá trị vừa trừ
            // HP), style suy ra từ CHÍNH object `impact` đã đi kèm damage event đó (impact.type +
            // impact.source) — không đoán từ animation, không có đường tính damage riêng cho UI.
            const DAMAGE_NUMBER_STYLES = {
                normal:      { fill: '#ffffff', stroke: 'rgba(0,0,0,0.85)', font: 72, scale: 1.0,  life: 0.8, rise: 1.8 },
                heavy:       { fill: '#fbbf24', stroke: 'rgba(60,30,0,0.9)',  font: 76, scale: 1.2, life: 0.9, rise: 2.0 },
                launch:      { fill: '#fde047', stroke: '#6d28d9',            font: 80, scale: 1.45,  life: 1.2, rise: 2.6 },
                electro:     { fill: '#e9d5ff', stroke: '#581c87',            font: 72, scale: 1.0, life: 0.9, rise: 1.5 },
                incoming:    { fill: '#f87171', stroke: 'rgba(40,0,0,0.9)',   font: 72, scale: 1.0,  life: 0.8, rise: 1.6 },
                // Character #5 — nhãn chữ Counter (font nhỏ hơn để chữ dài không bị cắt trên canvas 256px)
                counter:     { fill: '#f3f4f6', stroke: '#78350f',            font: 46, scale: 1.15, life: 0.9, rise: 1.3 },
                perfect:     { fill: '#fde047', stroke: '#92400e',            font: 46, scale: 1.4,  life: 1.1, rise: 1.5 }
            };
            window.DAMAGE_NUMBER_STYLES = DAMAGE_NUMBER_STYLES;
            // DAMAGE_NUMBER_SIZE — kích thước hiển thị (playtest: số quá nhỏ, cỡ giữa các loại chênh
            // lệch quá nhiều). Chỉnh 1 chỗ duy nhất tại đây:
            //   baseWidth/baseHeight: cỡ world-space ở khoảng cách tham chiếu (style.scale nhân thêm).
            //   referenceDistance: khoảng cách camera mà tại đó số có đúng cỡ base (camera mặc định ~7m).
            //   minDistanceScale/maxDistanceScale: bù theo khoảng cách — số ở XA được phóng to để giữ cỡ
            //     trên màn hình gần như không đổi (không bị nhỏ xíu khi đánh quái ở xa/zoom out), số ở
            //     GẦN không co quá nhỏ.
            //   mobileMultiplier: màn hình điện thoại nhỏ hơn -> số to thêm.
            const DAMAGE_NUMBER_SIZE = window.DAMAGE_NUMBER_SIZE = {
                baseWidth: 1.7, baseHeight: 0.85,
                referenceDistance: 7,
                minDistanceScale: 0.85, maxDistanceScale: 2.2,
                mobileMultiplier: 1.25
            };
            function getDamageNumberSizeFactor(sprite) {
                let f = window.isMobile ? DAMAGE_NUMBER_SIZE.mobileMultiplier : 1;
                const cam = window.camera;
                if (cam && sprite) {
                    const k = cam.position.distanceTo(sprite.position) / DAMAGE_NUMBER_SIZE.referenceDistance;
                    f *= Math.min(DAMAGE_NUMBER_SIZE.maxDistanceScale, Math.max(DAMAGE_NUMBER_SIZE.minDistanceScale, k));
                }
                return f;
            }
            function applyDamageNumberScale(d) {
                const s = (d.baseScale || 1) * (1 + (d.pop || 0)) * getDamageNumberSizeFactor(d.sprite);
                d.sprite.scale.set(DAMAGE_NUMBER_SIZE.baseWidth * s, DAMAGE_NUMBER_SIZE.baseHeight * s, 1);
            }

            // getDamageNumberStyle(impact): map impact đi kèm damage event -> tên style.
            //   - Coordinated Attack (source.sourceType 'coordinated_skill') -> 'electro' (tím Electro,
            //     tách biệt khỏi đòn đánh trực tiếp của nhân vật đang active).
            //   - impact.type 'launch' (Thunder Finisher, High Plunge...) -> 'launch' (to nhất).
            //   - impact.type 'heavy' -> 'heavy'. Còn lại (light/medium/không có impact) -> 'normal'.
            function getDamageNumberStyle(impact) {
                if (!impact) return 'normal';
                if (impact.source && impact.source.sourceType === 'coordinated_skill') return 'electro';
                if (impact.type === 'launch') return 'launch';
                if (impact.type === 'heavy') return 'heavy';
                return 'normal';
            }
            window.getDamageNumberStyle = getDamageNumberStyle;

            function spawnDamageNumber(position, amount, styleName) {
                const scene = window.scene;
                const damageNumbers = window.damageNumbers;
                if (!scene || !damageNumbers) return;
                const style = DAMAGE_NUMBER_STYLES[styleName] || DAMAGE_NUMBER_STYLES.normal;

                const { canvas, ctx } = getDamageNumberCanvas();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.font = 'bold ' + style.font + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // Viền quanh chữ để số luôn đọc được dù nền sáng hay tối phía sau (đồng cỏ, nước, đá,
                // bầu trời) — viền dày hơn bản cũ (tỉ lệ theo canvas 256 mới) để tăng tương phản.
                const text = String(amount);
                ctx.lineJoin = 'round';
                ctx.lineWidth = 12;
                ctx.strokeStyle = style.stroke;
                ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
                ctx.fillStyle = style.fill;
                ctx.fillText(text, canvas.width / 2, canvas.height / 2);

                // Texture mới mỗi lần (nội dung số khác nhau) — canvas element được tái sử dụng ở
                // trên, chỉ phần upload lên GPU (texture) là tốn kém, không tránh được vì nội dung
                // hình ảnh thực sự khác nhau mỗi lần.
                const texture = new THREE.CanvasTexture(canvas);
                const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
                const sprite = new THREE.Sprite(material);
                sprite.position.copy(position);
                // Kích thước world-space cố định (không phụ thuộc độ dài chuỗi số) — đủ đọc rõ ở
                // khoảng cách combat thông thường, không quá to gây rối mắt khi nhiều số chồng nhau.
                sprite.scale.set(DAMAGE_NUMBER_SIZE.baseWidth * style.scale, DAMAGE_NUMBER_SIZE.baseHeight * style.scale, 1);
                sprite.renderOrder = 999; // Luôn vẽ đè lên particle/enemy phía sau, tránh bị che khuất
                // Chống chồng số: đòn nhiều hit liên tiếp (NA3, Coordinated Attack cùng frame) lệch
                // ngang ngẫu nhiên rộng hơn một chút; số 'electro' lệch sẵn sang 1 bên để không đè đúng
                // lên số của đòn đánh trực tiếp đã kích hoạt nó.
                sprite.position.x += (Math.random() - 0.5) * 0.5 + (styleName === 'electro' ? 0.45 : 0);
                sprite.position.z += (Math.random() - 0.5) * 0.5;
                scene.add(sprite);

                damageNumbers.push({
                    sprite: sprite,
                    material: material,
                    texture: texture,
                    baseScale: style.scale,
                    // "Pop": số lớn hơn 35% ở khung hình đầu rồi co về cỡ chuẩn trong ~0.12s — mắt bắt
                    // được ĐÚNG thời điểm hit connect, rõ hơn nhiều so với hiện ra tĩnh.
                    pop: (styleName === 'launch' || styleName === 'heavy') ? 0.35 : 0.25,
                    // Bay lên + trôi ngang nhẹ (ngẫu nhiên trái/phải) để nhiều số liên tiếp không đè
                    // thẳng hàng lên nhau, dễ đọc hơn khi combat dồn dập (nhiều đòn liên tục).
                    velocity: new THREE.Vector3((Math.random() - 0.5) * 0.6, style.rise, (Math.random() - 0.5) * 0.6),
                    life: style.life, maxLife: style.life
                });
                applyDamageNumberScale(damageNumbers[damageNumbers.length - 1]);
            }
            window.spawnDamageNumber = spawnDamageNumber;

            // updateDamageNumbers(dt): gọi mỗi frame từ animate() (game.js), TÁCH RIÊNG khỏi vòng lặp
            // updateParticles chính — xem giải thích lý do ở khai báo window.damageNumbers (game.js).
            function updateDamageNumbers(dt) {
                const scene = window.scene;
                const damageNumbers = window.damageNumbers;
                if (!scene || !damageNumbers) return;

                for (let i = damageNumbers.length - 1; i >= 0; i--) {
                    const d = damageNumbers[i];
                    d.life -= dt;

                    d.sprite.position.addScaledVector(d.velocity, dt);
                    // Chậm dần theo thời gian (giống trọng lực ngược nhẹ) — số bay chậm lại về cuối
                    // vòng đời thay vì bay đều tốc độ, cảm giác tự nhiên hơn.
                    d.velocity.y -= 1.2 * dt;

                    // Readability Batch: giữ ĐỦ độ đậm trong 60% đầu vòng đời, chỉ mờ dần ở 40% cuối —
                    // bản cũ mờ tuyến tính ngay từ frame đầu nên số đã nhạt đi một nửa trước khi kịp đọc.
                    const lifeRatio = Math.max(0, d.life / d.maxLife);
                    d.material.opacity = Math.min(1, lifeRatio / 0.4);

                    // Pop-in scale (xem spawnDamageNumber) — co dần về baseScale.
                    if (d.pop > 0) d.pop = Math.max(0, d.pop - dt * 4);
                    applyDamageNumberScale(d); // pop + bù khoảng cách camera + mobile (xem DAMAGE_NUMBER_SIZE)

                    if (d.life <= 0) {
                        scene.remove(d.sprite);
                        // Chỉ dispose material/texture RIÊNG của sprite này (mỗi damage number có
                        // SpriteMaterial + CanvasTexture RIÊNG, không dùng chung) — an toàn tuyệt đối,
                        // không ảnh hưởng sprite khác. KHÔNG gọi d.sprite.geometry.dispose(): geometry
                        // của THREE.Sprite là 1 PlaneGeometry TĨNH DÙNG CHUNG cho mọi Sprite trong toàn
                        // bộ ứng dụng (Sprite.prototype hoặc tương đương nội bộ three.js) — dispose()
                        // nó sẽ phá hỏng MỌI Sprite khác đang tồn tại, kể cả những cái được tạo sau
                        // này.
                        d.material.dispose();
                        d.texture.dispose();
                        damageNumbers.splice(i, 1);
                    }
                }
            }
            window.updateDamageNumbers = updateDamageNumbers;


            // ============================================================
            // Readability Batch (Character #3) — COMBAT FX (lightweight, reusable)
            // ============================================================
            // Hệ thống VFX nhỏ, TÁCH RIÊNG khỏi window.particles (particles dùng physics velocity/gravity
            // — không hợp với vòng tròn mặt đất mở rộng hay tia sét đứng yên). Mỗi entry: { mesh, life,
            // maxLife, kind, ... } — updateCombatFx(dt) gọi mỗi frame từ animate() (file 08, cạnh
            // updateDamageNumbers). CHỈ hiển thị: không có hàm nào ở đây gây damage hay đọc/ghi HP.
            //
            // Hiệu năng mobile: MeshBasicMaterial (không cần ánh sáng), geometry đơn giản (ring 32
            // segment, box), không post-processing/shader riêng, mỗi hiệu ứng tự dispose khi hết hạn.
            const combatFx = window.combatFx = [];

            // Màu dùng chung — 1 nơi duy nhất để chỉnh tông Electro cho mọi hiệu ứng.
            const FX_COLORS = window.FX_COLORS = {
                electro: 0xa855f7,
                electroBright: 0xc084fc, // đủ bão hoà để nổi trên nền trời sáng (bản nhạt hơn bị chìm)
                gold: 0xfacc15,
                white: 0xffffff
            };

            function addCombatFx(mesh, life, extra) {
                window.scene.add(mesh);
                combatFx.push(Object.assign({ mesh: mesh, life: life, maxLife: life }, extra || {}));
            }

            // spawnGroundRing(center, radius, color, opts): vòng tròn phẳng trên mặt đất, mở rộng từ
            // ~35% tới ĐÚNG `radius` rồi mờ dần. Dùng để HIỂN THỊ VÙNG ĐÁNH THẬT của đòn AoE (radius
            // truyền vào là hitRadius đọc từ data — không phải số đẹp mắt tự đặt), nên người chơi nhìn
            // vòng tròn là biết con nào trong tầm.
            function spawnGroundRing(center, radius, color, opts) {
                opts = opts || {};
                const thickness = opts.thickness || 0.12;
                const geo = new THREE.RingGeometry(Math.max(0.01, 1 - thickness), 1, 40);
                const mat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: opts.opacity || 0.85, depthWrite: false });
                const ring = new THREE.Mesh(geo, mat);
                ring.rotation.x = -Math.PI / 2;
                ring.position.set(center.x, center.y + (opts.yOffset !== undefined ? opts.yOffset : 0.08), center.z);
                const startR = radius * (opts.startRatio !== undefined ? opts.startRatio : 0.35);
                ring.scale.set(startR, startR, startR);
                addCombatFx(ring, opts.life || 0.35, { kind: 'ring', startR: startR, endR: radius, baseOpacity: mat.opacity });

                // Đĩa mờ bên trong (fill) — vùng AoE đọc được rõ hơn chỉ có viền.
                if (opts.fill) {
                    const discMat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: 0.22, depthWrite: false });
                    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), discMat);
                    disc.rotation.x = -Math.PI / 2;
                    disc.position.copy(ring.position); disc.position.y -= 0.01;
                    disc.scale.set(radius, radius, radius);
                    addCombatFx(disc, (opts.life || 0.35) * 0.8, { kind: 'fade', baseOpacity: 0.22 });
                }
            }
            window.spawnGroundRing = spawnGroundRing;

            // spawnElectroStrike(target, opts): tia sét gấp khúc đánh từ trên xuống điểm `target` +
            // tia lửa tím + vòng chớp nhỏ dưới chân. opts.big = true cho Thunder Finisher (tia dày/cao
            // hơn, sống lâu hơn). Tia gồm vài đoạn BoxGeometry mảnh (WebGL không hỗ trợ linewidth > 1
            // nên không dùng THREE.Line) — 7 mesh/tia, rẻ.
            function spawnElectroStrike(target, opts) {
                opts = opts || {};
                const big = !!opts.big;
                const height = big ? 7 : 4.5;
                const width = big ? 0.2 : 0.12;
                const segments = 6;
                const color = opts.color || FX_COLORS.electroBright;
                const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1, depthWrite: false });
                const group = new THREE.Group();
                let prev = new THREE.Vector3(target.x + (Math.random() - 0.5) * 0.6, target.y + height, target.z + (Math.random() - 0.5) * 0.6);
                for (let i = 1; i <= segments; i++) {
                    const t = i / segments;
                    const jitter = (i === segments) ? 0 : (big ? 0.7 : 0.45);
                    const next = new THREE.Vector3(
                        target.x + (Math.random() - 0.5) * jitter,
                        target.y + height * (1 - t) + 0.2,
                        target.z + (Math.random() - 0.5) * jitter
                    );
                    const len = prev.distanceTo(next);
                    const seg = new THREE.Mesh(new THREE.BoxGeometry(width, len, width), mat);
                    seg.position.copy(prev).add(next).multiplyScalar(0.5);
                    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), next.clone().sub(prev).normalize());
                    group.add(seg);
                    prev = next;
                }
                addCombatFx(group, big ? 0.32 : 0.22, { kind: 'strike', material: mat });

                // Tia lửa TÍM (tái dùng spawnCombatSparks — chỉ đổi màu) + vòng chớp nhỏ dưới chân.
                if (window.spawnCombatSparks) window.spawnCombatSparks(new THREE.Vector3(target.x, target.y + 0.4, target.z), new THREE.Vector3(0, 1, 0), FX_COLORS.electro);
                spawnGroundRing({ x: target.x, y: target.y - 0.5, z: target.z }, big ? 2.2 : 1.1, FX_COLORS.electro, { life: big ? 0.4 : 0.25, startRatio: 0.2 });
            }
            window.spawnElectroStrike = spawnElectroStrike;

            // ============================================================
            // Task 3 (Combat VFX Upgrade) — SHARED STANDARDS
            // ============================================================
            // ELEMENT_VFX: bảng màu + "phong cách" hiệu ứng theo NGUYÊN TỐ thật của nhân vật
            // (character.element trong roster). Mỗi nguyên tố khác nhau ở HÌNH DẠNG chuyển động, không
            // chỉ màu (không truyền đạt thông tin chỉ bằng màu sắc):
            //   water  (Hydro)   — gợn sóng tròn + giọt nước rơi theo đường cong trọng lực
            //   fire   (Pyro)    — tàn lửa bay LÊN + chớp sáng
            //   spark  (Electro) — tia lửa sắc + vòng chớp (Character #3 giữ bộ hiệu ứng riêng của nó)
            //   plain  (vật lý / không nguyên tố) — tia lửa trắng như trước
            const ELEMENT_VFX = window.ELEMENT_VFX = {
                hydro:   { main: 0x22d3ee, light: 0xa5f3fc, core: 0xe0fbff, style: 'water' },
                pyro:    { main: 0xf97316, light: 0xfbbf24, core: 0xfff1e0, style: 'fire' },
                electro: { main: 0xa855f7, light: 0xc084fc, core: 0xf3e8ff, style: 'spark' },
                // Character #4 — Anemo: teal / xanh ngọc / cyan nhạt / trắng mềm; hình dạng = XOÁY (hạt bay
                // theo quỹ đạo tiếp tuyến quanh điểm trúng), khác hẳn gợn nước (Hydro) và tàn lửa (Pyro).
                anemo:   { main: 0x2dd4bf, light: 0x99f6e4, core: 0xf0fdfa, style: 'wind' },
                physical:{ main: 0xe5e7eb, light: 0xffffff, core: 0xffffff, style: 'plain' },
                // Character #5 (Claymore) — hồ sơ VFX 'steel': va chạm vật lý nặng, vàng hổ phách/thép (KHÔNG phải
                // nguyên tố gameplay — chỉ là bảng màu hiệu ứng). Character #6 (Catalyst) — 'rose': Electro sắc
                // hồng-tím hoa hồng, tách biệt tia tím #3 (electro) và teal #4 (anemo).
                steel:   { main: 0xf59e0b, light: 0xfde68a, core: 0xfffbeb, style: 'plain' },
                rose:    { main: 0xf472b6, light: 0xfbcfe8, core: 0xfff1f7, style: 'spark' }
            };
            function getElementVfx(element) {
                const key = (typeof element === 'string') ? element.toLowerCase() : 'physical';
                return ELEMENT_VFX[key] || ELEMENT_VFX.physical;
            }
            window.getElementVfx = getElementVfx;

            // ------------------------------------------------------------
            // DOT POOL — particle nhỏ dùng lại (vệt vũ khí, vệt mũi tên, giọt nước, tàn lửa, mảnh
            // định hướng khi trúng đòn). Số lượng CỐ ĐỊNH (DOT_POOL_SIZE): tạo sẵn 1 lần, không bao
            // giờ tạo/huỷ mesh trong lúc chơi -> không phình bộ nhớ, không áp lực GC trên mobile. Hết
            // chỗ trong pool -> bỏ qua hạt mới (hiệu ứng phụ, không ảnh hưởng gameplay).
            // ------------------------------------------------------------
            const DOT_POOL_SIZE = 180;
            const dotGeo = new THREE.SphereGeometry(0.09, 6, 4);
            const dotPool = [];
            let dotPoolReady = false;
            function ensureDotPool() {
                if (dotPoolReady || !window.scene) return;
                for (let i = 0; i < DOT_POOL_SIZE; i++) {
                    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
                    const mesh = new THREE.Mesh(dotGeo, mat);
                    mesh.visible = false;
                    mesh.frustumCulled = false;
                    window.scene.add(mesh);
                    dotPool.push({ mesh: mesh, mat: mat, active: false, life: 0, maxLife: 1, vel: new THREE.Vector3(), gravity: 0, drag: 0, s0: 1, s1: 0, a0: 0.8 });
                }
                dotPoolReady = true;
            }
            // spawnDot(pos, opts): opts { color, life, vel, gravity (dương = rơi, âm = bay lên), drag,
            // size (hệ số so với 0.09), endSize, opacity }
            let dotCursor = 0;
            function spawnDot(pos, opts) {
                ensureDotPool();
                if (!dotPoolReady) return;
                let d = null;
                for (let n = 0; n < DOT_POOL_SIZE; n++) {
                    const c = dotPool[(dotCursor + n) % DOT_POOL_SIZE];
                    if (!c.active) { d = c; dotCursor = (dotCursor + n + 1) % DOT_POOL_SIZE; break; }
                }
                if (!d) return; // pool đầy — bỏ qua
                d.active = true;
                d.life = d.maxLife = opts.life || 0.2;
                d.mesh.position.copy(pos);
                if (opts.vel) d.vel.copy(opts.vel); else d.vel.set(0, 0, 0);
                d.gravity = opts.gravity || 0;
                d.drag = opts.drag || 0;
                d.s0 = opts.size || 1;
                d.s1 = (opts.endSize !== undefined) ? opts.endSize : d.s0 * 0.35;
                d.a0 = (opts.opacity !== undefined) ? opts.opacity : 0.85;
                d.mat.color.setHex(opts.color !== undefined ? opts.color : 0xffffff);
                d.mat.opacity = d.a0;
                d.mesh.scale.setScalar(d.s0);
                d.mesh.visible = true;
            }
            window.spawnDot = spawnDot;
            // Alpha M7-P0: chỉ ĐỌC — số hạt dot đang chạy, cho bảng đo ?perf=1 (scripts/perf-hud.js).
            window.countActiveDots = function () {
                let n = 0;
                for (let i = 0; i < dotPool.length; i++) if (dotPool[i].active) n++;
                return n;
            };
            function updateDots(dt) {
                for (let i = 0; i < dotPool.length; i++) {
                    const d = dotPool[i];
                    if (!d.active) continue;
                    d.life -= dt;
                    if (d.life <= 0) { d.active = false; d.mesh.visible = false; continue; }
                    const t = d.life / d.maxLife; // 1 -> 0
                    if (d.gravity) d.vel.y -= d.gravity * dt;
                    if (d.drag) d.vel.multiplyScalar(Math.max(0, 1 - d.drag * dt));
                    d.mesh.position.addScaledVector(d.vel, dt);
                    d.mesh.scale.setScalar(d.s1 + (d.s0 - d.s1) * t);
                    d.mat.opacity = d.a0 * Math.min(1, t * 1.6);
                }
            }

            // spawnWeaponTrail(worldPos, color, size): 1 "vệt" nhỏ tại mũi vũ khí/mũi tên, mờ trong
            // ~0.14s. Gọi mỗi frame trong active phase -> thành vệt sáng theo quỹ đạo. Dùng DOT POOL
            // (trước đây mỗi lần gọi tạo 1 mesh + material mới).
            const _trailZero = new THREE.Vector3();
            function spawnWeaponTrail(worldPos, color, size) {
                spawnDot(worldPos, { color: color, life: 0.14, vel: _trailZero, size: size || 1, endSize: (size || 1) * 0.4, opacity: 0.8 });
            }
            window.spawnWeaponTrail = spawnWeaponTrail;

            // spawnFacingRing(center, radius, color, opts): vòng tròn QUAY MẶT VỀ CAMERA (tại thời điểm
            // spawn) — "chớp va chạm" tại điểm trúng đòn, đọc rõ từ mọi góc camera (vòng nằm ngang dưới
            // đất sẽ bị che khi trúng giữa thân quái).
            function spawnFacingRing(center, radius, color, opts) {
                opts = opts || {};
                const thickness = opts.thickness || 0.22;
                const mat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: opts.opacity || 0.9, depthWrite: false });
                const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.01, 1 - thickness), 1, 24), mat);
                ring.position.set(center.x, center.y, center.z);
                if (window.camera) ring.quaternion.copy(window.camera.quaternion);
                const startR = radius * (opts.startRatio !== undefined ? opts.startRatio : 0.3);
                ring.scale.setScalar(startR);
                ring.renderOrder = 5;
                addCombatFx(ring, opts.life || 0.18, { kind: 'ring', startR: startR, endR: radius, baseOpacity: mat.opacity });
            }
            window.spawnFacingRing = spawnFacingRing;

            // spawnHitImpact(position, dir, opts): phản hồi TRÚNG ĐÒN dùng chung — CHỈ gọi tại nơi đã
            // xác nhận va chạm thật (sau enemy.takeDamage), không bao giờ gọi khi đòn trượt.
            //   opts.element: nguyên tố hiệu ứng ('hydro'/'pyro'/'electro'/null = vật lý)
            //   opts.weight:  'light' | 'heavy' | 'launch' (lấy từ impact.type của damage event)
            // Gồm: tia lửa gốc (spawnCombatSparks, tô màu nhạt theo nguyên tố) + mảnh định hướng bay
            // theo hướng đòn + hoa văn nguyên tố (gợn nước/tàn lửa/chớp) + vòng chớp. Đòn heavy/launch:
            // nhiều mảnh hơn, vòng to hơn, thêm vòng thứ 2 — khác biệt rõ nhưng không che quái.
            function spawnHitImpact(position, dir, opts) {
                opts = opts || {};
                const prof = getElementVfx(opts.element);
                const weight = opts.weight || 'light';
                const heavy = weight === 'heavy' || weight === 'launch';
                const big = weight === 'launch';
                const pos = new THREE.Vector3(position.x, position.y, position.z);
                const d = (dir && dir.lengthSq && dir.lengthSq() > 0.0001) ? dir.clone().normalize() : new THREE.Vector3(0, 0, 1);

                if (window.spawnCombatSparks) window.spawnCombatSparks(pos, d, prof.core);

                // Mảnh định hướng — cho thấy HƯỚNG đòn đánh.
                const shardCount = big ? 10 : heavy ? 7 : 4;
                for (let i = 0; i < shardCount; i++) {
                    const v = d.clone().multiplyScalar(6 + Math.random() * 5);
                    v.x += (Math.random() - 0.5) * 4; v.y += Math.random() * 3; v.z += (Math.random() - 0.5) * 4;
                    spawnDot(pos, { color: i % 2 ? prof.main : prof.light, life: 0.22, vel: v, drag: 6, size: heavy ? 1.1 : 0.8, endSize: 0.2 });
                }

                // Hoa văn theo nguyên tố.
                if (prof.style === 'water') {
                    for (let i = 0; i < (heavy ? 8 : 5); i++) {
                        const a = Math.random() * Math.PI * 2;
                        spawnDot(pos, { color: i % 2 ? prof.main : prof.light, life: 0.45, vel: new THREE.Vector3(Math.cos(a) * 2.4, 3 + Math.random() * 2.5, Math.sin(a) * 2.4), gravity: 14, size: 0.9, endSize: 0.5 });
                    }
                    spawnGroundRing(groundPointUnder(pos), heavy ? 1.6 : 1.0, prof.main, { life: 0.4, startRatio: 0.3, thickness: 0.18, opacity: 0.7 });
                } else if (prof.style === 'wind') {
                    // Xoáy gió: hạt bay vòng tiếp tuyến quanh điểm trúng + nhẹ lên trên (lá/luồng khí cuộn).
                    const n = heavy ? 9 : 6;
                    for (let i = 0; i < n; i++) {
                        const a = (i / n) * Math.PI * 2;
                        const r = 0.5;
                        const p0 = new THREE.Vector3(pos.x + Math.cos(a) * r, pos.y + (Math.random() - 0.3) * 0.5, pos.z + Math.sin(a) * r);
                        spawnDot(p0, { color: i % 2 ? prof.main : prof.light, life: 0.4, vel: new THREE.Vector3(-Math.sin(a) * 4.5, 1.2 + Math.random(), Math.cos(a) * 4.5), drag: 3, size: 0.75, endSize: 0.2 });
                    }
                } else if (prof.style === 'fire') {
                    for (let i = 0; i < (heavy ? 9 : 6); i++) {
                        spawnDot(pos, { color: i % 3 === 0 ? prof.light : prof.main, life: 0.5 + Math.random() * 0.25, vel: new THREE.Vector3((Math.random() - 0.5) * 2.2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2.2), gravity: -2.5, drag: 1.5, size: 0.9, endSize: 0.15 });
                    }
                }

                spawnFacingRing(pos, big ? 1.5 : heavy ? 1.1 : 0.7, heavy ? prof.light : prof.core, { life: heavy ? 0.22 : 0.16 });
                if (heavy) spawnFacingRing(pos, big ? 2.3 : 1.6, prof.main, { life: big ? 0.34 : 0.26, thickness: 0.12, opacity: 0.7 });
            }
            window.spawnHitImpact = spawnHitImpact;

            // impactWeight(impact): impact.type của damage event -> weight hiển thị.
            function impactWeight(impact) {
                const t = impact && impact.type;
                return (t === 'launch') ? 'launch' : (t === 'heavy') ? 'heavy' : 'light';
            }
            window.impactWeight = impactWeight;

            // spawnConeFlash(origin, dir, range, coneDot, color, opts): quạt sáng lan ra theo ĐÚNG
            // range/coneDot của hit AoE hình quạt (Burst Pyro) — hiện đúng khoảnh khắc hit event xảy ra.
            function spawnConeFlash(origin, dir, range, coneDot, color, opts) {
                opts = opts || {};
                const coneAngle = Math.acos(THREE.MathUtils.clamp(coneDot, -1, 1)) * 2;
                const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opts.opacity || 0.55, side: THREE.DoubleSide, depthWrite: false });
                const mesh = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 28, 1, -coneAngle / 2, coneAngle), mat);
                mesh.rotation.x = -Math.PI / 2;
                mesh.rotation.z = -(Math.atan2(dir.x, dir.z) - Math.PI / 2);
                mesh.position.set(origin.x, origin.y + 0.1, origin.z);
                mesh.scale.setScalar(range * 0.25);
                addCombatFx(mesh, opts.life || 0.3, { kind: 'ring', startR: range * 0.25, endR: range, baseOpacity: mat.opacity });
            }
            window.spawnConeFlash = spawnConeFlash;

            // spawnMuzzlePuff(pos, dir, color): chớp nhỏ ở điểm phóng (mũi tên / tia nước) — cho thấy
            // KHOẢNH KHẮC phóng, tách biệt với khoảnh khắc trúng.
            function spawnMuzzlePuff(pos, dir, color) {
                const d = dir.clone().normalize();
                for (let i = 0; i < 5; i++) {
                    const v = d.clone().multiplyScalar(3 + Math.random() * 2);
                    v.x += (Math.random() - 0.5) * 1.5; v.y += (Math.random() - 0.5) * 1.5; v.z += (Math.random() - 0.5) * 1.5;
                    spawnDot(pos, { color: color, life: 0.16, vel: v, drag: 8, size: 0.7, endSize: 0.1 });
                }
                spawnFacingRing(pos, 0.45, color, { life: 0.12, thickness: 0.35 });
            }
            window.spawnMuzzlePuff = spawnMuzzlePuff;

            // spawnDustPuff(pos): vật bay cắm vào vật cản/đất (TRƯỢT) — bụi xám, KHÔNG màu nguyên tố,
            // KHÔNG vòng chớp -> không thể nhầm với trúng đòn.
            function spawnDustPuff(pos) {
                for (let i = 0; i < 5; i++) {
                    const a = Math.random() * Math.PI * 2;
                    spawnDot(pos, { color: 0x9ca3af, life: 0.35, vel: new THREE.Vector3(Math.cos(a) * 1.2, 0.8 + Math.random(), Math.sin(a) * 1.2), gravity: 3, size: 0.8, endSize: 1.2, opacity: 0.55 });
                }
            }
            window.spawnDustPuff = spawnDustPuff;

            // Giới hạn số hiệu ứng ring/strike đồng thời (tránh bùng nổ khi AoE trúng nhiều quái cùng lúc).
            const MAX_COMBAT_FX = 160;

            function updateCombatFx(dt) {
                updateDots(dt);
                // Quá giới hạn -> kết thúc sớm các hiệu ứng CŨ NHẤT (đầu mảng) để giữ ổn định trên mobile.
                if (combatFx.length > MAX_COMBAT_FX) {
                    for (let i = 0; i < combatFx.length - MAX_COMBAT_FX; i++) combatFx[i].life = 0;
                }
                for (let i = combatFx.length - 1; i >= 0; i--) {
                    const fx = combatFx[i];
                    fx.life -= dt;
                    const t = Math.max(0, fx.life / fx.maxLife); // 1 -> 0
                    if (fx.kind === 'ring') {
                        const k = 1 - t;
                        const eased = 1 - (1 - k) * (1 - k); // ease-out: mở nhanh rồi chậm lại tại radius thật
                        const r = fx.startR + (fx.endR - fx.startR) * eased;
                        fx.mesh.scale.set(r, r, r);
                        fx.mesh.material.opacity = fx.baseOpacity * Math.min(1, t * 2.2);
                    } else if (fx.kind === 'fade') {
                        fx.mesh.material.opacity = fx.baseOpacity * t;
                    } else if (fx.kind === 'strike') {
                        // Nhấp nháy mạnh 2 lần rồi tắt — đặc trưng tia sét.
                        fx.material.opacity = (t > 0.6 || (t > 0.3 && t < 0.45)) ? 1 : 0.25 * t;
                    }
                    if (fx.life <= 0) {
                        window.scene.remove(fx.mesh);
                        fx.mesh.traverse(o => {
                            if (o.geometry && !fx.sharedGeo) o.geometry.dispose();
                            if (o.material) o.material.dispose();
                        });
                        combatFx.splice(i, 1);
                    }
                }
            }
            window.updateCombatFx = updateCombatFx;

            // groundPointUnder(pos): điểm trên mặt đất/obstacle ngay dưới pos — để vòng AoE nằm đúng
            // trên nền (không lơ lửng ngang hông nhân vật). Fallback pos.y - 0.9 nếu helper chưa có.
            function groundPointUnder(pos) {
                const out = new THREE.Vector3(pos.x, pos.y - 0.9, pos.z);
                if (window.getGroundYForPosition) out.y = window.getGroundYForPosition(pos);
                return out;
            }
            window.groundPointUnder = groundPointUnder;
