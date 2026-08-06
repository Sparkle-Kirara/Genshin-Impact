// ============================================================
// comic.js — Tách ra từ index.html (Devlog Case Archive)
// Chứa: dữ liệu COMIC_CASES (nội dung từng "vụ án") và hàm render
// danh sách bookcase động, để thêm case mới chỉ cần thêm 1 entry
// vào COMIC_CASES bên dưới — KHÔNG cần sửa HTML ở đâu khác.
//
// PHỤ THUỘC: không phụ thuộc file nào khác. Được index.html load
// TRƯỚC ui.js (vì openStoryReader() trong ui.js đọc COMIC_CASES).
//
// CÁCH THÊM CASE MỚI:
//   1. Thêm 1 entry vào COMIC_CASES với key số tăng dần (vd: 5).
//   2. Điền đủ 6 field: caseId, tag, tagColor, title, listTitle, summary, content.
//      (title = tiêu đề đầy đủ hiện trong trang đọc truyện,
//       listTitle = tiêu đề rút gọn hiện trên thẻ bookcase)
//   3. Xong — bookcase sẽ tự hiện case mới, không cần đụng index.html.
// ============================================================

const COMIC_CASES = {
    1: {
        caseId: "CASE: CL-001 (Climbing Arc)",
        tag: "RESOLVED • CL-001",
        tagColor: "text-emerald-400",
        title: "🕵️‍♂️ VỤ ÁN #1: “THE CLIMBING BUG INCIDENT”",
        listTitle: "🕵️‍♂️ CASE 1: Climbing Bug Incident",
        summary: "How physical boundary collisions triggered infinite recoil loops.",
        content: `
            <div class="space-y-4">
                <div class="bg-amber-950/20 p-4 border-l-4 border-amber-500 rounded font-serif">
                    <strong class="text-amber-300">PROLOGUE:</strong><br>
                    Một thế giới được xây dựng từ các khối tĩnh. Nơi mà mọi bước đi đều tuân theo luật vật lý... cho đến khi một kẻ lạ mặt xuất hiện: <strong class="text-amber-100">"Climbing System"</strong>.
                    <br><br>
                    Ban đầu, nó chỉ là một cơ chế đơn giản: Bám tường, di chuyển ngang, không rơi xuống. Nhưng rồi... thực tại bắt đầu nứt.
                </div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-location-dot text-red-400"></i> Hiện trường (The Incident)</strong>
                    <p class="text-stone-400">Hiện tượng đầu tiên được ghi nhận: Player bị “hút” mạnh về góc block khi leo tường. Ban đầu chỉ là rung lắc nhẹ, sau đó là trượt, rồi... dịch chuyển (teleport) cực nhanh giữa các cạnh. Như thể thế giới đang cố “đẩy” nhân vật ra khỏi chính logic của nó.</p>
                </div>

                <div class="rpg-divider my-4"></div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-people-group text-purple-400"></i> Thám tử AI điều tra</strong>
                    <div class="space-y-3 mt-2">
                        <div class="bg-[#2a2420] p-3 rounded border border-amber-900/30">
                            <span class="text-emerald-400 font-bold text-xs"><i class="fa-solid fa-robot"></i> ChatGPT - "The Analyzer":</span>
                            <p class="italic text-stone-300 mt-1">"Có dấu hiệu collision resolution vẫn chạy trong trạng thái climbing."</p>
                            <p class="text-xs text-stone-400 mt-1"><strong>Phát hiện:</strong> resolveStaticCollisions() vẫn active liên tục, tọa độ position bị tính toán đẩy lùi mỗi frame, không hề có điều kiện guard để bẻ khóa khi đang leo.</p>
                        </div>
                        <div class="bg-[#2a2420] p-3 rounded border border-amber-900/30">
                            <span class="text-orange-400 font-bold text-xs"><i class="fa-solid fa-microchip"></i> Claude - "The Code Excavator":</span>
                            <p class="italic text-stone-300 mt-1">"Không phải movement bug. Đây là conflict giữa velocity system và AABB separation."</p>
                            <p class="text-xs text-stone-400 mt-1"><strong>Phát hiện:</strong> Velocity đã hướng ngang chính xác, nhưng static collision solver lại đang override position trực tiếp, tạo ra một lực đẩy văng cưỡng bức tại trục có min-overlap.</p>
                        </div>
                        <div class="bg-[#2a2420] p-3 rounded border border-amber-900/30">
                            <span class="text-blue-400 font-bold text-xs"><i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i> Gemini - "The Pattern Seer":</span>
                            <p class="italic text-stone-300 mt-1">"Góc block tạo overlap kép X/Z → hệ thống chọn sai trục push-out liên tục."</p>
                            <p class="text-xs text-stone-400 mt-1"><strong>Phát hiện:</strong> Biến minOverlap lật liên tiếp (oscillate) giữa X và Z tại các đỉnh góc vuông. Khiến player bị khóa cứng rồi snap nhảy cóc liên tục giữa 2 bề mặt vách ngăn.</p>
                        </div>
                    </div>
                </div>

                <div class="rpg-divider my-4"></div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-file-code text-emerald-400"></i> Bằng chứng kỹ thuật</strong>
                    <pre class="bg-black/60 p-3 rounded font-mono text-xs text-emerald-300 border border-amber-950/40"><code>resolveStaticCollisions(player, ...);
// Tọa độ bị thay đổi đột ngột ngoài tầm kiểm soát của Climbing logic:
player.position.x += pushX;
player.position.z += pushZ;</code></pre>
                </div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-scale-balanced text-amber-500"></i> Kết luận (Root Cause)</strong>
                    <p class="text-stone-400">Hai lực đối nghịch tồn tại cùng lúc: <strong class="text-amber-200">Climbing System</strong> (ép player dính sát vào tường để bám vách) xung đột trực tiếp với <strong class="text-amber-200">Collision System</strong> (đẩy player ra khỏi bề mặt hộp). Tại góc block, hai hệ thống tranh đoạt quyền sửa tọa độ khiến thế giới bắt đầu rung lắc dữ dội.</p>
                </div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-wrench text-sky-400"></i> Bản Vá (The Fix v0.6.9)</strong>
                    <p class="text-stone-400">Ban hành dòng luật mới: Khi player đang ở trạng thái leo trèo vách, hệ thống sẽ bỏ qua hoàn toàn cơ chế Static Collision Resolution chuẩn trên cạn, ủy thác việc bám dính an toàn cho Climbing logic tự động.</p>
                    <pre class="bg-black/60 p-3 rounded font-mono text-xs text-sky-300 border border-amber-950/40 mt-2"><code>if (!player.isClimbing) {
    resolveStaticCollisions(player, ...);
}</code></pre>
                </div>

                <div class="bg-stone-950 p-4 rounded-lg border border-amber-900/30 italic text-stone-400">
                    "Không phải bức tường kéo người chơi. Đó là câu chuyện về hai hệ thống đang tranh quyền điều khiển cùng một cơ thể."
                </div>
            </div>
        `
    },
    2: {
        caseId: "CASE: SW-002 (Hydro Dynamics)",
        tag: "RESOLVED • SW-002",
        tagColor: "text-cyan-400",
        title: "🌊 VỤ ÁN #2: “THE SWIMMING INCIDENT”",
        listTitle: "🌊 CASE 2: Swimming Fluid Incident",
        summary: "Resolving priority overlap conflicts inside Deep Water volumes.",
        content: `
            <div class="space-y-4">
                <div class="bg-amber-950/20 p-4 border-l-4 border-amber-500 rounded font-serif">
                    <strong class="text-amber-300">PROLOGUE:</strong><br>
                    Sau khi hệ thống bám tường leo núi hoạt động mượt mà... người chơi tưởng rằng thế giới sandbox đã yên bình hoàn toàn. Nhưng họ quên mất một chân lý: <strong class="text-amber-100">Nước không bao giờ đơn giản</strong>.
                </div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-triangle-exclamation text-red-400"></i> Hiện trường (The Incident)</strong>
                    <p class="text-stone-400">Hiện tượng được ghi nhận ở phiên bản thử nghiệm: Người chơi nhảy xuống nước sâu nhưng vẫn có thể thực hiện nhảy cao không trung (Jump), kích hoạt dù lượn (Gliding), hoặc nghiêm trọng nhất là tiếp tục thực hiện tấn công plunge xuyên suốt đáy hồ. Chuyển động không phân tầng trạng thái vật lý rõ rệt, chỉ có một dòng chảy hỗn loạn.</p>
                </div>

                <div class="rpg-divider my-4"></div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-people-group text-purple-400"></i> Báo cáo phân tích</strong>
                    <div class="space-y-3 mt-2">
                        <div class="bg-[#2a2420] p-3 rounded border border-amber-900/30">
                            <span class="text-emerald-400 font-bold text-xs"><i class="fa-solid fa-robot"></i> Claude - "The Code Excavator":</span>
                            <p class="italic text-stone-300 mt-1">"Swimming đang bị override hoặc chồng lấn không kiểm soát bởi các input state trên không trung."</p>
                            <p class="text-xs text-stone-400 mt-1"><strong>Phát hiện:</strong> Nhảy hoặc plunge cần phải có sự ưu tiên rõ rệt. Khi chìm sâu, lực cản và lực nâng của nước phải triệt tiêu lực gia tốc rơi tự do.</p>
                        </div>
                        <div class="bg-[#2a2420] p-3 rounded border border-amber-900/30">
                            <span class="text-blue-400 font-bold text-xs"><i class="fa-solid fa-star text-[10px]"></i> Gemini - "The Pattern Seer":</span>
                            <p class="italic text-stone-300 mt-1">"Water state cần trở thành một thể thống nhất, bẻ khóa các hành vi aerial actions."</p>
                            <p class="text-xs text-stone-400 mt-1"><strong>Phát hiện:</strong> Khi đã chìm sâu hơn 70% cơ thể, Swimming mode phải áp đặt quyền kiểm soát tuyệt đối, ngăn chặn xung đột của glider và đòn Plunge.</p>
                        </div>
                        <div class="bg-[#2a2420] p-3 rounded border border-amber-900/30">
                            <span class="text-orange-400 font-bold text-xs"><i class="fa-solid fa-robot"></i> ChatGPT - "The Analyzer":</span>
                            <p class="italic text-stone-300 mt-1">"Bạn không thể vừa nhảy lướt trên không khi đang phải đập nước sinh tồn... bạn phải bơi."</p>
                            <p class="text-xs text-stone-400 mt-1"><strong>Phát hiện:</strong> Sự phân tầng giữa trạng thái bơi thong thả (Breaststroke style) và bơi tốc độ cao (Swim Fast sải nước) cần được định nghĩa rõ ràng.</p>
                        </div>
                    </div>
                </div>

                <div class="rpg-divider my-4"></div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-scale-balanced text-amber-500"></i> Phân tích cốt lõi (Core Issue)</strong>
                    <p class="text-stone-400">Khi <code class="text-amber-300 bg-stone-900 px-1 rounded">player.isSwimming === true</code>, các aerial action và jump phải bị vô hiệu hóa hoàn toàn, thay thế bằng cơ chế bơi sải lực nổi mượt mà. Hệ thống cũ thiếu phân tầng ưu tiên (State Priority): <br><strong class="text-amber-100">Swimming > Glide</strong>, <strong class="text-amber-100">Swimming > Plunge</strong>, <strong class="text-amber-100">Swimming > Jump</strong>.</p>
                </div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-wrench text-sky-400"></i> Bản Vá (The Fix v0.7.0)</strong>
                    <p class="text-stone-400">Áp dụng một nguyên tắc cưỡng chế trạng thái mới:</p>
                    <pre class="bg-black/60 p-3 rounded font-mono text-xs text-sky-300 border border-amber-950/40 mt-2"><code>if (player.isSwimming) {
    disableJump();
    disableGlide();
    disablePlunge();
    applySwimPhysicsOnly(); // Thể thức bơi ếch / bơi sải tự do
}</code></pre>
                    <p class="text-stone-400 mt-3">Giờ đây khi rơi từ đỉnh núi cao bằng Plunge Attack rớt thẳng xuống lòng hồ, thám tử sẽ dập tắt lực cắm kiếm ngay lập tức khi chạm mặt nước sâu, chuyển đổi nhịp nhàng sang động tác bơi lội mát mẻ.</p>
                </div>

                <div class="bg-stone-950 p-4 rounded-lg border border-amber-900/30 italic text-stone-400">
                    "Nước giải phóng chúng ta khỏi trọng lực, nhưng nó cũng tước đi đôi cánh. Khi xuống nước sâu, hãy học cách hòa mình làm một với nó."
                </div>
            </div>
        `
    },
    3: {
        caseId: "CASE: ST-003 (Stamina Resolution)",
        tag: "NEW • ST-003",
        tagColor: "text-amber-500",
        title: "⚡ VỤ ÁN #3: “THE STAMINA CRISIS”",
        listTitle: "⚡ CASE 3: Stamina Crisis",
        summary: "Resolving constraints between sprint metrics and survival locks.",
        content: `
            <div class="space-y-4">
                <div class="bg-amber-950/20 p-4 border-l-4 border-amber-500 rounded font-serif">
                    <strong class="text-amber-300">PROLOGUE:</strong><br>
                    Sự tự do tuyệt đối của cơ chế leo núi tự do và bơi nước tốc độ cao đã dẫn tới một vấn đề mất cân bằng: <strong class="text-amber-100">Player có thể bơi vô tận và leo tường vô hạn</strong>.<br>
                    Thám tử <strong class="text-emerald-400">Nguyễn Ngọc Hưởng</strong> đã được giao chuyên án thiết lập trật tự vật lý: <strong class="text-amber-300">Hệ Thống Thể Lực (Stamina System)</strong>.
                </div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-battery-quarter text-red-400"></i> Hiện trường (The Core Design)</strong>
                    <p class="text-stone-400">Khi thể lực cạn kiệt, hệ thống phải kích hoạt chuỗi phản ứng liên hoàn bảo đảm tính logic:</p>
                    <ul class="list-disc pl-5 text-xs text-stone-300 space-y-1.5 mt-2">
                        <li><strong>Khi leo núi:</strong> Rơi tự do ngay lập tức (Force Drop).</li>
                        <li><strong>Khi bơi sải nhanh:</strong> Bị cưỡng chế giảm tốc về bơi chậm (Decel to slow).</li>
                        <li><strong>Khi bơi sâu cạn Stamina:</strong> Đuối nước! Player ngất đi, màn hình tối dần, trừ 25 HP và hồi sinh trên đất liền gần nhất.</li>
                    </ul>
                </div>

                <div class="rpg-divider my-4"></div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-people-group text-purple-400"></i> Giải pháp Kiến trúc của Thám tử Hưởng</strong>
                    <div class="space-y-3 mt-2">
                        <div class="bg-[#2a2420] p-3 rounded border border-amber-900/30">
                            <span class="text-[#ebdcb9] font-bold text-xs"><i class="fa-solid fa-circle-nodes"></i> UI/UX: Floating Stamina Ring</span>
                            <p class="text-xs text-stone-300 mt-1">Vòng tròn thể lực hổ phách dạng SVG nổi, chiếu mượt mà từ tọa độ 3D của Player lên tọa độ 2D của màn hình phẳng, chỉ xuất hiện khi thể lực bắt đầu sụt giảm.</p>
                        </div>
                        <div class="bg-[#2a2420] p-3 rounded border border-amber-900/30">
                            <span class="text-cyan-400 font-bold text-xs"><i class="fa-solid fa-wave-square"></i> State Transition Guard</span>
                            <p class="text-xs text-stone-300 mt-1">Cơ chế quản lý tiêu thụ stamina chặt chẽ: Sprint tiêu hao <span class="text-amber-400">-10/s</span>, Swim Fast tiêu hao <span class="text-amber-400">-12/s</span>, Climbing di chuyển <span class="text-amber-400">-8/s</span>, Climbing Jump tiêu hao cực đại <span class="text-amber-400">-22</span> thể lực.</p>
                        </div>
                    </div>
                </div>

                <div class="rpg-divider my-4"></div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-wrench text-sky-400"></i> Code Bản Vá v0.8.0</strong>
                    <p class="text-stone-400">Tích hợp thành công cấu trúc kiểm tra trong vòng lặp vật lý chính:</p>
                    <pre class="bg-black/60 p-3 rounded font-mono text-xs text-amber-300 border border-amber-950/40"><code>if (player.isClimbing && player.stamina <= 0) {
    player.isClimbing = false; // Ngã!
    sfx.playBlockedSound();
}
if (player.isSwimming && player.stamina <= 0) {
    triggerDrowningSequence(); // Đuối nước!
}</code></pre>
                </div>

                <div class="bg-stone-950 p-4 rounded-lg border border-amber-900/30 italic text-stone-400">
                    "Thể lực không phải xiềng xích, mà là thước đo cho những quyết định chiến thuật thông minh."
                </div>
            </div>
        `
    },
    4: {
        caseId: "CASE: RT-004 (Project Revival)",
        tag: "RESOLVED • RT-004",
        tagColor: "text-violet-400",
        title: "📂 VỤ ÁN #4: “THE RETURN OF THE ARCHIVE”",
        listTitle: "📂 CASE 4: The Return of the Archive",
        summary: "Trở lại sau khoảng lặng: tách file, tái cấu trúc, và những hệ thống mới đưa dự án tới Pre-Alpha v0.1.",
        content: `
            <div class="space-y-4">
                <div class="bg-amber-950/20 p-4 border-l-4 border-amber-500 rounded font-serif">
                    <strong class="text-amber-300">PROLOGUE:</strong><br>
                    Hồ sơ điều tra từng bị đóng lại trong một khoảng lặng. Không ai biết dự án có còn được mở lại hay không. Nhưng rồi một ngày, thám tử <strong class="text-emerald-400">Nguyễn Ngọc Hưởng</strong> quay trở lại văn phòng, bật lại chiếc máy tính cũ (lần này là trên điện thoại), và tuyên bố: <strong class="text-amber-100">"Chuyên án vẫn còn dang dở."</strong>
                </div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-box-archive text-red-400"></i> Hiện trường (The Situation)</strong>
                    <p class="text-stone-400">Toàn bộ mã nguồn từng nằm gói gọn trong một tệp <code class="text-amber-300 bg-stone-900 px-1 rounded">index.html</code> duy nhất — vật lý, chiến đấu, UI, HUD, tất cả chen chúc trong cùng một căn phòng chật hẹp. Không có Git, không có máy tính, chỉ có một chiếc điện thoại và một GitHub Pages để triển khai. Thám tử cần một cộng sự mới đủ kiên nhẫn để lục lại từng dòng code cũ mà không làm sập cả hiện trường.</p>
                </div>

                <div class="rpg-divider my-4"></div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-people-group text-purple-400"></i> Thám tử AI điều tra</strong>
                    <div class="space-y-3 mt-2">
                        <div class="bg-[#2a2420] p-3 rounded border border-amber-900/30">
                            <span class="text-orange-400 font-bold text-xs"><i class="fa-solid fa-microchip"></i> Claude - "The Code Excavator":</span>
                            <p class="italic text-stone-300 mt-1">"Trước khi thêm bất cứ điều gì mới, chúng ta cần một căn phòng có tổ chức. Bốn bức tường, bốn chức năng riêng biệt."</p>
                            <p class="text-xs text-stone-400 mt-1"><strong>Phát hiện:</strong> Tách <code class="text-sky-300 bg-stone-900 px-1 rounded">game.js</code> (vật lý, combat, VFX, enemy AI, game loop), <code class="text-sky-300 bg-stone-900 px-1 rounded">ui.js</code> (menu, HUD, touch controls), và giữ <code class="text-sky-300 bg-stone-900 px-1 rounded">index.html</code> làm nơi khởi tạo và chia sẻ biến toàn cục qua <code class="text-sky-300 bg-stone-900 px-1 rounded">window.*</code>. Không có module bundler, không có build step — chỉ có <code class="text-sky-300 bg-stone-900 px-1 rounded">&lt;script&gt;</code> tag load tuần tự và kỷ luật khai báo phụ thuộc rõ ràng ở đầu mỗi file.</p>
                        </div>
                    </div>
                </div>

                <div class="rpg-divider my-4"></div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-scale-balanced text-amber-500"></i> Chuỗi hồ sơ đã giải quyết (Case Log tới Pre-Alpha v0.1)</strong>
                    <p class="text-stone-400 mb-2">Sau khi văn phòng được dọn dẹp gọn gàng, hàng loạt chuyên án mới lần lượt được thụ lý:</p>
                    <ul class="list-disc pl-5 text-xs text-stone-300 space-y-1.5 mt-2">
                        <li><strong class="text-amber-200">Fall Damage:</strong> Hệ thống sát thương rơi theo bậc thang độ cao (an toàn / nhẹ / nặng / tử vong), có cả cơ hội "hấp hối" 1 HP hiếm hoi khi rơi từ độ cao chí mạng.</li>
                        <li><strong class="text-amber-200">Dead State chuẩn hóa:</strong> Một cổng duy nhất <code class="text-sky-300 bg-stone-900 px-1 rounded">enterDeadState()</code> xử lý mọi nguyên nhân tử vong — combat, đuối nước, hay rơi — kèm màn hình Defeated theo phong cách Genshin.</li>
                        <li><strong class="text-amber-200">Slime Spawner có cấu hình:</strong> Tối đa 15 slime cùng lúc, xuất hiện ngẫu nhiên mỗi 8–16 giây, với 1/3 cơ hội là loại slime to.</li>
                        <li><strong class="text-amber-200">Void Boundary:</strong> Ra khỏi ranh giới bản đồ không còn là rơi tự do vô tận — Player được đưa về điểm hồi sinh, Slime được đưa về một vị trí ngẫu nhiên trên bản đồ.</li>
                        <li><strong class="text-amber-200">Music Manager:</strong> Hệ thống nhạc nền động — phát hiện combat qua bán kính dò tìm của Slime (có độ trễ chống giật), fade-in/fade-out mượt mà, resume đúng vị trí nếu combat quay lại trong 10 giây, và random bài hát từ danh sách mở rộng được (bg_ost 1-3, combat_ost 1-3). Nhạc cũng bị cắt ngay khi Player gục ngã.</li>
                        <li><strong class="text-amber-200">Tái cấu trúc triển khai:</strong> Toàn bộ đường dẫn (favicon, script, audio) được đưa về dạng phẳng — một thư mục duy nhất, không thư mục con — để phù hợp với việc triển khai thủ công qua điện thoại, không cần Git.</li>
                        <li><strong class="text-amber-200">Comic Archive tự thân vận động:</strong> Và đúng vào lúc này, chính hồ sơ vụ án mà bạn đang đọc đây cũng được tách ra thành <code class="text-sky-300 bg-stone-900 px-1 rounded">comic.js</code> riêng biệt — để những chuyên án tiếp theo chỉ cần được "thêm vào tủ hồ sơ", không cần phải sửa lại cả căn phòng.</li>
                    </ul>
                </div>

                <div class="rpg-divider my-4"></div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-wrench text-sky-400"></i> Bản Vá (The Fix — Pre-Alpha v0.1)</strong>
                    <p class="text-stone-400">Danh mục hồ sơ giờ đây tự vận hành, không còn cần thám tử phải viết tay từng tấm thẻ hồ sơ trên tường:</p>
                    <pre class="bg-black/60 p-3 rounded font-mono text-xs text-sky-300 border border-amber-950/40 mt-2"><code>// Thêm vụ án mới chỉ cần một dòng dữ liệu:
COMIC_CASES[5] = { caseId, tag, tagColor, title, summary, content };
// renderComicBookcase() sẽ tự động vẽ lại toàn bộ tủ hồ sơ.</code></pre>
                </div>

                <div class="bg-stone-950 p-4 rounded-lg border border-amber-900/30 italic text-stone-400">
                    "Một dự án không chết khi nó dừng lại — nó chỉ thực sự kết thúc khi không ai còn quay lại mở cánh cửa văn phòng cũ. Cánh cửa ấy vừa được mở lại."
                </div>
            </div>
        `
    },
    5: {
        caseId: "CASE: PA-005 (Ascension)",
        tag: "NEW • PA-005",
        tagColor: "text-amber-400",
        title: "🎉 PRE-ALPHA COMPLETE: v0.9.5 “Ascension”",
        listTitle: "🌅 CASE 5: Ascension",
        summary: "After months of development, the project has finally reached the end of its Pre-Alpha stage. This is the end of the first chapter.",
        content: `
            <div class="space-y-4">
                <div class="bg-amber-950/20 p-4 border-l-4 border-amber-500 rounded font-serif">
                    <strong class="text-amber-300">PROLOGUE:</strong><br>
                    Sau nhiều tháng phát triển, dự án Genshin Impact (fan-made) đã hoàn thành toàn bộ mục tiêu của giai đoạn Pre-Alpha.
                    <br><br>
                    Từ những dòng code đầu tiên, dự án dần hình thành nên một nền tảng gameplay hoàn chỉnh và đủ ổn định để bước sang giai đoạn phát triển tiếp theo.
                </div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-trophy text-amber-400"></i> Major Milestones (Cột Mốc Đã Đạt)</strong>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 font-mono text-xs">
                        <div class="bg-[#2a2420] p-2 rounded border border-amber-900/30 text-amber-200 flex items-center gap-2"><i class="fa-solid fa-check text-emerald-400"></i> Gameplay Foundation</div>
                        <div class="bg-[#2a2420] p-2 rounded border border-amber-900/30 text-amber-200 flex items-center gap-2"><i class="fa-solid fa-check text-emerald-400"></i> Combat System</div>
                        <div class="bg-[#2a2420] p-2 rounded border border-amber-900/30 text-amber-200 flex items-center gap-2"><i class="fa-solid fa-check text-emerald-400"></i> Character System</div>
                        <div class="bg-[#2a2420] p-2 rounded border border-amber-900/30 text-amber-200 flex items-center gap-2"><i class="fa-solid fa-check text-emerald-400"></i> Party System</div>
                        <div class="bg-[#2a2420] p-2 rounded border border-amber-900/30 text-amber-200 flex items-center gap-2"><i class="fa-solid fa-check text-emerald-400"></i> Mobile & PC HUD</div>
                        <div class="bg-[#2a2420] p-2 rounded border border-amber-900/30 text-amber-200 flex items-center gap-2"><i class="fa-solid fa-check text-emerald-400"></i> Inventory</div>
                        <div class="bg-[#2a2420] p-2 rounded border border-amber-900/30 text-amber-200 flex items-center gap-2"><i class="fa-solid fa-check text-emerald-400"></i> Dialogue</div>
                        <div class="bg-[#2a2420] p-2 rounded border border-amber-900/30 text-amber-200 flex items-center gap-2"><i class="fa-solid fa-check text-emerald-400"></i> Opening / Title Screen</div>
                        <div class="bg-[#2a2420] p-2 rounded border border-amber-900/30 text-amber-200 flex items-center gap-2"><i class="fa-solid fa-check text-emerald-400"></i> Auto Save</div>
                        <div class="bg-[#2a2420] p-2 rounded border border-amber-900/30 text-amber-200 flex items-center gap-2"><i class="fa-solid fa-check text-emerald-400"></i> Session Resume</div>
                        <div class="bg-[#2a2420] p-2 rounded border border-amber-900/30 text-amber-200 flex items-center gap-2"><i class="fa-solid fa-check text-emerald-400"></i> Aim Mode</div>
                        <div class="bg-[#2a2420] p-2 rounded border border-amber-900/30 text-amber-200 flex items-center gap-2"><i class="fa-solid fa-check text-emerald-400"></i> Stamina System</div>
                        <div class="bg-[#2a2420] p-2 rounded border border-amber-900/30 text-amber-200 flex items-center gap-2"><i class="fa-solid fa-check text-emerald-400"></i> Character Switching</div>
                        <div class="bg-[#2a2420] p-2 rounded border border-amber-900/30 text-amber-200 flex items-center gap-2"><i class="fa-solid fa-check text-emerald-400"></i> Numerous Bug Fixes</div>
                        <div class="bg-[#2a2420] p-2 rounded border border-amber-900/30 text-amber-200 flex items-center gap-2"><i class="fa-solid fa-check text-emerald-400"></i> UI/UX Improvements</div>
                    </div>
                </div>

                <div class="rpg-divider my-4"></div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-sun text-yellow-400"></i> Ascension – Trọng Tâm v0.9.5</strong>
                    <p class="text-stone-400">Phiên bản <strong class="text-amber-200">v0.9.5 – Ascension</strong> tập trung vào việc cô đọng và hoàn thiện tối đa chất lượng nền tảng:</p>
                    <ul class="list-disc pl-5 text-xs text-stone-300 space-y-1 mt-2">
                        <li>Hoàn thiện các hệ thống cốt lõi và sửa triệt để các lỗi còn tồn đọng.</li>
                        <li>Cân bằng gameplay và nâng cấp trải nghiệm người dùng (UI/UX).</li>
                        <li>Tối ưu & hoàn thiện các cơ chế: Aim Mode, Stamina System.</li>
                        <li>Bổ sung tính năng Skip Opening giúp rút ngắn thời gian vào game.</li>
                        <li>Đánh bóng toàn bộ nền tảng trước khi bước vào giai đoạn Alpha.</li>
                    </ul>
                    <p class="text-xs italic text-amber-300/80 mt-2">* Phiên bản này không bổ sung các hệ thống lớn mới với mục tiêu tạo ra một bản dựng ổn định nhất có thể.</p>
                </div>

                <div class="rpg-divider my-4"></div>

                <div>
                    <strong class="text-[#f1e6d0] text-sm uppercase tracking-wider block mb-2"><i class="fa-solid fa-flag-checkered text-emerald-400"></i> Result (Kết Quả & Định Hướng Mới)</strong>
                    <p class="text-stone-400">Giai đoạn Pre-Alpha chính thức khép lại. Toàn bộ nền móng của dự án hiện đã đủ vững chắc để chuyển mình bước sang giai đoạn phát triển Alpha.</p>
                    <div class="bg-black/40 border border-amber-900/40 rounded-lg p-3 mt-3 text-center">
                        <span class="text-stone-400 text-[11px] uppercase tracking-widest block font-mono">Chuyển đổi trọng tâm phát triển</span>
                        <div class="flex items-center justify-center gap-3 mt-2 font-bold font-mono text-xs sm:text-sm">
                            <span class="text-stone-300 bg-stone-900 px-3 py-1.5 rounded border border-stone-800">Xây nền móng</span>
                            <span class="text-amber-400"><i class="fa-solid fa-arrow-right"></i></span>
                            <span class="text-emerald-400 bg-emerald-950/40 px-3 py-1.5 rounded border border-emerald-900/50">Mở rộng thế giới game</span>
                        </div>
                    </div>
                </div>

                <div class="bg-stone-950 p-4 rounded-lg border border-amber-900/30 text-stone-300 text-center space-y-2">
                    <p class="font-serif text-amber-200 text-sm leading-relaxed">
                        « "Every great journey begins with a single step.<br>
                        Pre-Alpha was the first step.<br>
                        Alpha is where the adventure truly begins." »
                    </p>
                </div>

                <!-- UPDATED FOOTER -->
                <div class="bg-[#12101f] rounded-xl border border-amber-500/30 p-4 space-y-3 font-mono">
                    <div class="flex items-center justify-between border-b border-stone-800 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-stone-400 uppercase tracking-widest">CASE STATUS</span>
                        </div>
                        <span class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2.5 py-0.5 rounded text-xs font-bold flex items-center gap-1.5">
                            <i class="fa-solid fa-check text-[10px]"></i> CLOSED
                        </span>
                    </div>

                    <div class="grid grid-cols-2 gap-3 text-xs pt-1">
                        <div>
                            <span class="text-stone-500 text-[10px] block uppercase tracking-wider">Released</span>
                            <span class="text-amber-200 font-medium">07 August 2026</span>
                        </div>
                        <div class="text-right">
                            <span class="text-stone-500 text-[10px] block uppercase tracking-wider">Milestone</span>
                            <span class="text-emerald-300 font-bold">Pre-Alpha Complete</span>
                        </div>
                    </div>

                    <div class="flex items-center justify-between bg-black/40 p-2.5 rounded-lg border border-amber-900/20 text-xs mt-1">
                        <span class="text-stone-400 font-serif italic">v0.9.5 — Ascension</span>
                        <div class="flex items-center gap-1.5 text-amber-400 font-bold">
                            <span>Next Chapter</span>
                            <span class="text-emerald-400">→ Alpha v1.0</span>
                        </div>
                    </div>
                </div>
            </div>
        `
    }
};
window.COMIC_CASES = COMIC_CASES;

// ============================================================
// RENDER BOOKCASE — sinh danh sách case tự động từ COMIC_CASES
// ============================================================
// Được gọi 1 lần lúc khởi tạo game (index.html, window.onload).
// Duyệt COMIC_CASES theo thứ tự khóa số tăng dần và vẽ list button
// vào #comic-case-list (bên trong #menu-content-comic) — thêm case mới KHÔNG cần sửa gì ở index.html.
function renderComicBookcase() {
    const listContainer = document.getElementById('comic-case-list');
    if (!listContainer) return;

    // Sắp xếp theo khóa số tăng dần để thứ tự hiển thị luôn nhất quán,
    // bất kể thứ tự khai báo trong object COMIC_CASES.
    const caseNumbers = Object.keys(COMIC_CASES).map(Number).sort((a, b) => a - b);

    listContainer.innerHTML = caseNumbers.map(num => {
        const c = COMIC_CASES[num];
        return `
            <button onclick="openStoryReader(${num})" class="text-left bg-[#141224]/80 hover:bg-[#25203d] border border-[#2d284f]/50 hover:border-amber-400/60 rounded-xl p-4 transition-all flex flex-col relative overflow-hidden group">
                <span class="text-[9px] ${c.tagColor} font-mono font-bold tracking-wider">${c.tag}</span>
                <h4 class="text-sm font-bold text-stone-100 group-hover:text-amber-200 transition-colors mt-0.5 font-serif">${c.listTitle}</h4>
                <p class="text-[11px] text-stone-400 mt-1 line-clamp-2">${c.summary}</p>
            </button>
        `;
    }).join('');
}
window.renderComicBookcase = renderComicBookcase;