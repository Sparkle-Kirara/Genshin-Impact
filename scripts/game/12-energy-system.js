// ============================================================
// 12-energy-system.js — CORE ENERGY + ELEMENTAL PARTICLE SYSTEM (v1)
// ============================================================
// MỤC ĐÍCH: cho Elemental Burst có Energy thật để dùng, thay vì player.energy không bao giờ
// tăng (trạng thái hiện tại trước file này — canUseBurst() đọc player.energy nhưng KHÔNG có
// dòng code nào trong toàn bộ codebase từng cộng vào nó; player.skillHitCount trong file 09 chỉ
// gọi spawnEnergyParticles() — một hiệu ứng THUẦN VISUAL trong vfx.js, không cộng Energy).
//
// KIẾN TRÚC (đúng flow đã yêu cầu):
//   Skill hit event
//     -> EnergySystem.generateParticles(originPos, count, element)   [spawn Particle THẬT vào World]
//     -> Particle tồn tại trong World (World-space entity, có mesh Three.js riêng)
//     -> EnergySystem.updateParticles(dt) mỗi frame: lifetime, bay hút về Character active
//     -> khi Particle đủ gần Character active -> EnergySystem.collectParticle(particle)
//     -> tính Energy (same-element vs different-element, qua ENERGY_CONFIG) -> cộng vào
//        đúng partyState[i].energy của Character đã collect (KHÔNG phải toàn Party)
//     -> Particle deactivate + remove khỏi scene, KHÔNG cộng Energy lần 2.
//
// KHÔNG cộng Energy trực tiếp tại "Skill gây damage" (đúng mục 5 của spec) — mọi Energy đều đi
// qua vòng đời Particle thật ở trên. KHÔNG implement: Party-wide Energy Distribution, Enemy HP
// threshold particles, Normal/Charged Attack Energy, Weapon/Artifact/Constellation Energy Recharge
// UI, Element Reaction (mục 22 — đúng phạm vi đã chốt).
//
// REUSE, KHÔNG DUPLICATE: dùng lại partyState/activeCharacterIndex (file 02) để biết Character
// nào đang active lúc collect, dùng lại scene/enemies pattern particle rời rạc kiểu
// spawnCombatSparks() (fire-and-forget, tự update trong 1 mảng module-level) thay vì tạo hệ
// thống entity riêng biệt không cần thiết.
//
// window export: ENERGY_CONFIG, EnergySystem
// ============================================================


// ============================================================
// 1. CONFIG — DATA-DRIVEN, KHÔNG hard-code số liệu Energy vào logic bên dưới
// ============================================================
// Mọi con số trong ENERGY_CONFIG là PLACEHOLDER (mục 8, 19, 21 của spec) — dễ chỉnh sau khi
// balance thật, KHÔNG cần sửa logic EnergySystem khi đổi số.
const ENERGY_CONFIG = {
    // particle: Energy gain mỗi Particle cộng cho Character khi collect — tách theo same-element
    // (Particle cùng nguyên tố với Character collect) và different-element (khác nguyên tố),
    // ĐÚNG PATTERN Genshin (mục 8 spec: same-element luôn cao hơn different-element).
    particle: {
        sameElement: 3,       // PLACEHOLDER — Energy gain nếu Particle cùng Element với Character
        differentElement: 1   // PLACEHOLDER — Energy gain nếu Particle khác Element (bao gồm Particle không có element/neutral)
    },

    // defaultEnergyRecharge: giá trị mặc định của field energyRecharge trên Character (mục 3, 15
    // spec) — CHƯA có artifact/weapon/stat bonus nào ghi đè, chỉ là hook kiến trúc cho tương lai.
    defaultEnergyRecharge: 1.0,

    // Particle lifetime/movement/visual — PLACEHOLDER (mục 19), dễ chỉnh, không ảnh hưởng công
    // thức Energy ở trên.
    particleLifetime: 8,          // Giây — Particle tự remove nếu chưa được collect trong khoảng này
    particleCollectRadius: 0.9,   // Khoảng cách (m) tới Character active để coi là "chạm" -> collect
    particleAttractRadius: 5,     // Khoảng cách (m) bắt đầu bị hút về Character active
    particleAttractSpeed: 9,      // m/s — tốc độ bay về Character khi đã vào attractRadius
    particleFloatDrift: 0.6,      // Biên độ (m) bồng bềnh nhẹ khi CHƯA bị hút (chưa vào attractRadius)
    particleSize: 0.16,           // Bán kính (m) hình cầu Particle (placeholder debug visual, mục 18)

    // Màu placeholder theo Element (mục 18: "dễ nhìn trong quá trình test", KHÔNG cần final VFX).
    // Element nào không có trong bảng này fallback về màu trắng (elementColors.default).
    elementColors: {
        pyro: 0xff6a3d,
        hydro: 0x22d3ee,
        anemo: 0x84e8c9,
        cryo: 0xa5e8ff,
        electro: 0xc084fc,
        geo: 0xfbbf24,
        dendro: 0x8ee34d,
        default: 0xffffff
    }
};
window.ENERGY_CONFIG = ENERGY_CONFIG;


// ============================================================
// 2. ELEMENTAL PARTICLE — entity thực tế trong scene
// ============================================================
// Mảng module-level chứa mọi Particle đang tồn tại trong World — ĐÚNG PATTERN các mảng entity
// tạm thời khác của project (particles/energyParticles/damageNumbers ở 02-collision-and-stats-
// core.js dòng 61-76) — export qua window để các file khác (nếu cần đọc/debug) truy cập nhất
// quán với cách project đã làm.
const elementalParticles = window.elementalParticles = [];

// buildParticleVisual(element): mesh debug đơn giản — quả cầu phát sáng màu theo Element (mục 18).
// Tách riêng thành hàm nhỏ để generateParticles() không lặp code dựng mesh nhiều lần.
function buildParticleVisual(element) {
    const color = (element && ENERGY_CONFIG.elementColors[element]) || ENERGY_CONFIG.elementColors.default;
    const geo = new THREE.SphereGeometry(ENERGY_CONFIG.particleSize, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);

    // Glow phụ — quả cầu ngoài lớn hơn, mờ hơn, tạo cảm giác "phát sáng" dễ nhận diện khi test,
    // KHÔNG phải final-quality VFX (mục 18 xác nhận không cần).
    const glowGeo = new THREE.SphereGeometry(ENERGY_CONFIG.particleSize * 1.8, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.28 });
    mesh.add(new THREE.Mesh(glowGeo, glowMat));

    return mesh;
}

// spawnParticle(position, element): tạo 1 Elemental Particle THẬT trong World tại vị trí cho
// trước. KHÔNG cộng Energy ở đây (mục 5 — Particle phải tồn tại trong World trước, Energy chỉ
// cộng lúc collect).
function spawnParticle(position, element) {
    const mesh = buildParticleVisual(element);
    mesh.position.copy(position);
    scene.add(mesh);

    elementalParticles.push({
        type: 'elementalParticle',
        element: element || null,
        position: mesh.position, // cùng reference với mesh.position — di chuyển mesh = di chuyển particle
        mesh: mesh,
        lifetime: ENERGY_CONFIG.particleLifetime,
        lifeTimer: 0,
        active: true,
        // driftSeed: lệch pha ngẫu nhiên cho hiệu ứng bồng bềnh, tránh mọi Particle nhấp nhô đồng
        // bộ trông giả tạo khi spawn nhiều Particle cùng lúc.
        driftSeed: Math.random() * Math.PI * 2,
        collected: false // chặn collect 2 lần trong cùng 1 frame (mục 6: mỗi Particle chỉ collect 1 lần)
    });
}

// removeParticle(particle): dọn dẹp mesh khỏi scene — ĐÚNG PATTERN cleanupEffect() (file 09),
// particle ở đây luôn là 1 Mesh đơn (không phải Group), không cần nhánh isGroup.
function removeParticle(particle) {
    scene.remove(particle.mesh);
    particle.mesh.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); });
    particle.mesh.geometry.dispose();
    particle.mesh.material.dispose();
    particle.active = false;
}


// ============================================================
// 3. ENERGY CALCULATION — same-element vs different-element, qua ENERGY_CONFIG (mục 8, 21)
// ============================================================
// resolveParticleEnergy(particle, character): character ở đây là entry CHARACTER_ROSTER (có
// field .element tĩnh) của Character sẽ nhận Energy — ĐÚNG PATTERN getActiveCharacterData().
function resolveParticleEnergy(particle, character) {
    const isSameElement = !!(particle.element && character && character.element &&
        particle.element.toLowerCase() === character.element.toLowerCase());
    const baseEnergy = isSameElement ? ENERGY_CONFIG.particle.sameElement : ENERGY_CONFIG.particle.differentElement;

    // energyRecharge: đọc từ partyState runtime (mục 3, 15) — field CHƯA có nguồn nào ghi đè khác
    // 1.0 trong phase này (chưa có artifact/weapon/stat bonus), nhưng multiplier ĐƯỢC áp dụng ở
    // đây sẵn để kiến trúc mở cho sau này, KHÔNG cần sửa lại công thức khi ER thật được thêm vào.
    // Nhân ĐÚNG 1 LẦN (mục 15: "không nhân ER nhiều lần") — chỉ ở bước cuối cùng này.
    const runtimeState = (typeof partyState !== 'undefined') ? partyState[activeCharacterIndex] : null;
    const energyRecharge = (runtimeState && typeof runtimeState.energyRecharge === 'number')
        ? runtimeState.energyRecharge
        : ENERGY_CONFIG.defaultEnergyRecharge;

    return baseEnergy * energyRecharge;
}


// ============================================================
// 4. ENERGYSYSTEM API — mục 13: EnergySystem.generateParticle(...)/.addEnergy(...)/.collectParticle(...)
// ============================================================
const EnergySystem = {

    // generateParticles(originPos, count, element): API chính Skill/Talent gọi khi cần tạo
    // Particle (mục 11: mỗi Skill tự cấu hình số particle qua skillData.energyGeneration —
    // KHÔNG hard-code "mọi Skill đều tạo N particle" ở đây). Nếu count <= 0 -> no-op (mục 11:
    // "Nếu Skill không tạo Particle: particles = 0").
    // originPos: THREE.Vector3 — tâm phát sinh (VD vị trí enemy vừa trúng đòn, vị trí Decoy nổ...).
    // Particle spawn RẢI NHẸ quanh originPos (không chồng lên đúng 1 điểm) để dễ nhìn khi test
    // (mục 18) và tạo cảm giác "bắn ra" tự nhiên hơn khi count > 1.
    generateParticles(originPos, count, element) {
        if (!originPos || !count || count <= 0) return;
        for (let i = 0; i < count; i++) {
            const scatter = new THREE.Vector3(
                (Math.random() - 0.5) * 0.6,
                0.3 + Math.random() * 0.4,
                (Math.random() - 0.5) * 0.6
            );
            spawnParticle(originPos.clone().add(scatter), element);
        }
    },

    // collectParticle(particle): xác định Character active nhận Energy (mục 9 — phase v1 CHƯA
    // chia Party-wide, Character nào đang active lúc collect thì Character đó nhận, kiến trúc để
    // mở cho sau này qua chính hàm này — muốn đổi logic "ai nhận Energy" chỉ cần sửa Ở ĐÂY, không
    // đụng updateParticles()/generateParticles()), tính Energy, cộng vào currentEnergy, rồi
    // deactivate + remove Particle. Có early-return particle.collected để đảm bảo mục 6: "Particle
    // không được cộng Energy nhiều lần / mỗi Particle chỉ collect 1 lần".
    collectParticle(particle) {
        if (!particle || !particle.active || particle.collected) return;
        particle.collected = true;

        const character = (typeof getActiveCharacterData === 'function') ? getActiveCharacterData() : null;
        const runtimeState = (typeof partyState !== 'undefined') ? partyState[activeCharacterIndex] : null;
        if (character && runtimeState) {
            const energyGain = resolveParticleEnergy(particle, character);
            EnergySystem.addEnergy(runtimeState, energyGain);
        }

        removeParticle(particle);
    },

    // addEnergy(characterState, amount): cộng thẳng vào ĐÚNG partyState[i] của Character được
    // truyền vào (characterState = 1 phần tử của partyState, KHÔNG phải CHARACTER_ROSTER entry) —
    // tách riêng thành API độc lập (mục 13) để tương lai có thể gọi trực tiếp từ nguồn Energy khác
    // (Normal Attack, weapon effect...) mà không cần đi qua Particle. Tự clamp 0 <= energy <=
    // maxEnergy (mục 2: "Không cho Energy vượt maxEnergy").
    addEnergy(characterState, amount) {
        if (!characterState || typeof amount !== 'number') return;
        const max = (typeof characterState.maxEnergy === 'number') ? characterState.maxEnergy : 0;
        characterState.energy = Math.min(max, Math.max(0, characterState.energy + amount));
    },

    // updateParticles(dt): gọi mỗi frame từ game loop (file 08, ĐÚNG PATTERN updateActiveEffects/
    // updateEnergyParticles đã có) — xử lý lifetime, hút về Character active, và tự collect khi đủ
    // gần. KHÔNG mô phỏng vật lý phức tạp (mục 10 xác nhận không cần) — chỉ lerp/attraction đơn
    // giản theo attractRadius/attractSpeed từ ENERGY_CONFIG.
    updateParticles(dt) {
        for (let i = elementalParticles.length - 1; i >= 0; i--) {
            const particle = elementalParticles[i];
            if (!particle.active) { elementalParticles.splice(i, 1); continue; }

            particle.lifeTimer += dt;
            if (particle.lifeTimer >= particle.lifetime) {
                // Mục 19: hết lifetime mà chưa được collect -> remove/deactivate, KHÔNG cộng Energy.
                removeParticle(particle);
                elementalParticles.splice(i, 1);
                continue;
            }

            const toPlayer = new THREE.Vector3().subVectors(player.position, particle.position);
            const dist = toPlayer.length();

            if (dist <= ENERGY_CONFIG.particleCollectRadius) {
                // Đủ gần Character active -> collect ngay (mục 6, 10: "được collect khi chạm
                // Character"). Character THỰC TẾ collect là Character active TẠI THỜI ĐIỂM NÀY
                // (mục 9/Test 5 — nếu người chơi switch nhân vật trước khi Particle được collect,
                // Character mới đang active mới là người nhận, vì collectParticle() tự đọc lại
                // getActiveCharacterData() tại đúng lúc gọi, KHÔNG snapshot lúc spawn).
                EnergySystem.collectParticle(particle);
                elementalParticles.splice(i, 1);
                continue;
            }

            if (dist <= ENERGY_CONFIG.particleAttractRadius && dist > 0.0001) {
                // Bị hút — di chuyển thẳng về phía Character active với tốc độ cố định (mục 10:
                // "attraction radius, movement speed" — KHÔNG cần lực gia tốc/spring phức tạp).
                toPlayer.normalize();
                const step = Math.min(dist, ENERGY_CONFIG.particleAttractSpeed * dt);
                particle.mesh.position.addScaledVector(toPlayer, step);
            } else {
                // Chưa vào attractRadius — bồng bềnh nhẹ tại chỗ (thuần visual, không di chuyển vị
                // trí gốc) để Particle không đứng yên cứng nhắc trong lúc chờ (mục 18: dễ nhìn khi test).
                const bob = Math.sin((particle.lifeTimer + particle.driftSeed) * 2.2) * ENERGY_CONFIG.particleFloatDrift * dt;
                particle.mesh.position.y += bob;
            }

            // Fade nhẹ trong 1 giây cuối trước khi hết lifetime — feedback trực quan "sắp biến mất"
            // (ĐÚNG TINH THẦN decoy.coreMat.emissiveIntensity urgency ở updateDecoyEntity(), file 09).
            const timeLeft = particle.lifetime - particle.lifeTimer;
            const fadeOpacity = timeLeft < 1 ? Math.max(0.15, timeLeft) : 0.9;
            particle.mesh.material.opacity = fadeOpacity;
        }
    }
};
window.EnergySystem = EnergySystem;


// ============================================================
// GHI CHÚ — CÁC PHẦN CHƯA IMPLEMENT (mục 22, giữ nguyên phạm vi đã chốt)
// ============================================================
// KHÔNG có trong file này (để dành cho task sau, kiến trúc đã mở sẵn qua EnergySystem.*):
//   - Full Energy Funnel System / Party-wide Energy Distribution (mục 9 — hiện chỉ Character
//     active lúc collect nhận Energy, xem collectParticle()).
//   - Enemy HP threshold particles / Enemy death particles.
//   - Normal Attack Energy / Charged Attack Energy (mục 14 — kiến trúc KHÔNG chặn việc thêm sau
//     này: chỉ cần gọi EnergySystem.generateParticles() hoặc EnergySystem.addEnergy() trực tiếp
//     từ đúng chỗ xử lý Normal/Charged Attack trong combat.js).
//   - Weapon/Artifact/Constellation Energy effects.
//   - Elemental Reaction (particle.element hiện chỉ dùng để tính same/different-element Energy).
//   - Advanced Particle generation rules (VD nhiều Particle theo Enemy type/size).
//   - Energy Recharge stat UI/build system (field energyRecharge đã có hook tính toán ở
//     resolveParticleEnergy(), nhưng CHƯA có nguồn nào ghi đè 1.0 và CHƯA có UI hiển thị ER).
