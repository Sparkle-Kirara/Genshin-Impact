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
//   spawnGliderTrailParticles, spawnPlungeTrailParticles, spawnPlungeImpactVisuals
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

            function spawnCombatSparks(position, normal) {
                const scene = window.scene;
                const particles = window.particles;
                const count = 18; 
                const geo = new THREE.BoxGeometry(0.06, 0.06, 0.5); 
                const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
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
                const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
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
