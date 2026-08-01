// ============================================================
// OPENING / TITLE SCREEN — Pre-Alpha v0.9 (Prelude)
// ============================================================
// Toàn bộ logic dưới đây được tách từ title_screen.html (prototype độc lập, thiết kế/animation/flow
// đã THỐNG NHẤT, không thiết kế lại) sang file JS riêng theo yêu cầu tích hợp v0.9 — HTML tương ứng
// nằm trong index.html (khối #opening-root), CSS tương ứng nằm trong style/style.css (khối "OPENING /
// TITLE SCREEN"). File này PHẢI load SAU 06-camps-save-system.js (cần window.loadGameData()) và SAU
// 02-collision-and-stats-core.js (cần window.setCharacterName()), nhưng TRƯỚC khi window.startGameplay()
// được gọi lần đầu — xem thứ tự <script> trong index.html.
//
// Điểm khởi động: window.runOpeningFlow() — gọi đúng 1 lần từ index.html (thay cho
// window.addEventListener('load', ...) tự chạy như bản prototype độc lập).
// Điểm kết thúc: enterGameplay() (cuối file) gọi window.startGameplay() — hàm chứa toàn bộ logic khởi
// tạo gameplay gốc (Character, Party, Inventory, Quest, Dialogue, Combat, Save System...), KHÔNG đổi gì
// bên trong so với trước v0.9.
//
// Thay đổi so với prototype gốc (chỉ tích hợp, KHÔNG đổi thiết kế/flow):
//   1. ASSET_CONFIG: đường dẫn đổi sang assets/opening/... (đúng quy ước assets/<category>/<file> của
//      dự án — xem assets/audio/, assets/icon/). Cập nhật lại path thật nếu thư mục khác.
//   2. runBackgroundStage(): nếu ĐÃ có save data (window.loadGameData() khác null), bỏ qua Character
//      Name Popup, đi thẳng Door Intro Stage (mục 7 spec).
//   3. Nút Confirm Name: gọi window.setCharacterName() + window.requestSave() (hạ tầng Save System có
//      sẵn) — trước đây chỉ lưu vào biến nội bộ, không kết nối gì với game thật.
//   4. runLoadingOverlayStage(): sau card "Entering Game..." thoáng qua, gọi enterGameplay() ẩn
//      #opening-root và khởi động gameplay thật, thay vì dừng lại chờ bấm "Restart Prototype".
//   5. window.runOpeningFlow() thay cho window.addEventListener('load', ...) tự chạy — tránh xung đột
//      thứ tự khởi động với index.html (có luồng 2 giai đoạn: Opening rồi mới đến gameplay).
//   6. Bỏ 2 chỗ onclick="..." inline trong HTML gốc (mục 4 spec) — thay bằng addEventListener đọc
//      data-modal-id (xem cuối file, gần closeGenericModal()).
//   7. BUGFIX: background.mp3 (hoặc synth fallback) trước đây phát tiếp mãi kể cả sau khi vào gameplay
//      thật (SoundEngine không có hàm dừng nhạc nào). Thêm fadeOutBgm()/stopBgm() vào SoundEngine, gọi
//      tại runLoadingSceneStage() — nhạc giảm dần âm lượng rồi tắt hẳn đúng lúc loading_scene.mp4 bắt
//      đầu phát.

        const ASSET_CONFIG = {
            intro: {
                logo: "assets/opening/intro/logo.mp4"
            },

            title: {
                backgroundVideo: "assets/opening/title/background.mp4",
                backgroundMusic: "assets/opening/title/background.mp3"
            },

            door: {
                intro: "assets/opening/door/door_intro.mp4",
                open: "assets/opening/door/open_door.mp4"
            },

            loading: {
                scene: "assets/opening/loading/loading_scene.mp4"
            },

            ui: {
                logo: "",
                powerIcon: "",
                interactIcon: "",
                newsIcon: "",
                logoutIcon: ""
            }
        };

        class SoundEngine {
            constructor() {
                this.ctx = null;
                this.isMuted = false;
                this.bgmNode = null;
                this.audioElement = document.getElementById('bgm-audio');
                if (ASSET_CONFIG.title.backgroundMusic) {
                    this.audioElement.src = ASSET_CONFIG.title.backgroundMusic;
                }
            }

            init() {
                if (!this.ctx) {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    this.ctx = new AudioContext();
                }
                if (this.ctx.state === 'suspended') {
                    this.ctx.resume();
                }
            }

            playClick() {
                if (this.isMuted) return;
                this.init();
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, this.ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(1760, this.ctx.currentTime + 0.08);
                
                gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.08);
            }

            playHover() {
                if (this.isMuted) return;
                this.init();
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, this.ctx.currentTime);
                
                gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.05);
            }

            playDoorRumble() {
                if (this.isMuted) return;
                this.init();
                const bufferSize = this.ctx.sampleRate * 2.5;
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = Math.random() * 2 - 1;
                }

                const noise = this.ctx.createBufferSource();
                noise.buffer = buffer;

                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(120, this.ctx.currentTime);
                filter.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 2.5);

                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 2.5);

                noise.connect(filter);
                filter.connect(gain);
                gain.connect(this.ctx.destination);
                noise.start();
            }

            startBgm() {
                if (this.isMuted) return;
                
                // Attempt playing configured audio file first
                if (ASSET_CONFIG.title.backgroundMusic) {
                    this.audioElement.play().catch(() => {
                        // Fallback to WebAudio synthesizer if local file missing
                        this.startSynthBgm();
                    });
                } else {
                    this.startSynthBgm();
                }
            }

            startSynthBgm() {
                if (this.bgmNode) return;
                this.init();
                const osc1 = this.ctx.createOscillator();
                const osc2 = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc1.type = 'triangle';
                osc2.type = 'sine';

                osc1.frequency.setValueAtTime(220, this.ctx.currentTime);
                osc2.frequency.setValueAtTime(329.63, this.ctx.currentTime);

                gain.gain.setValueAtTime(0.05, this.ctx.currentTime);

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(this.ctx.destination);

                osc1.start();
                osc2.start();

                this.bgmNode = { osc1, osc2, gain };
            }

            // BUGFIX (v0.9): background.mp3 (hoặc synth fallback) vẫn phát tiếp sau khi vào gameplay
            // thật — trước đây SoundEngine không có bất kỳ hàm dừng nhạc nào (chỉ có startBgm()).
            // fadeOutBgm(durationMs): giảm dần âm lượng về 0 rồi dừng hẳn nguồn phát — xử lý CẢ 2 nhánh
            // phát nhạc (this.audioElement — thẻ <audio> HTML5 nếu ASSET_CONFIG.title.backgroundMusic
            // có file thật; this.bgmNode — WebAudio synth fallback nếu thiếu file). Gọi tại thời điểm
            // bắt đầu Loading Scene (runLoadingOverlayStage()) — đúng yêu cầu "sau khi vào
            // loading_scene.mp4 thì mở nhỏ dần âm lượng rồi tắt".
            fadeOutBgm(durationMs = 1500) {
                const steps = 30;
                const stepMs = durationMs / steps;
                const startVolumeAudioEl = this.audioElement ? this.audioElement.volume : 0;
                const startGainSynth = (this.bgmNode && this.ctx) ? this.bgmNode.gain.gain.value : 0;
                let currentStep = 0;

                const fadeInterval = setInterval(() => {
                    currentStep++;
                    const ratio = Math.max(0, 1 - currentStep / steps);

                    if (this.audioElement && !this.audioElement.paused) {
                        this.audioElement.volume = startVolumeAudioEl * ratio;
                    }
                    if (this.bgmNode && this.ctx) {
                        this.bgmNode.gain.gain.setValueAtTime(startGainSynth * ratio, this.ctx.currentTime);
                    }

                    if (currentStep >= steps) {
                        clearInterval(fadeInterval);
                        this.stopBgm();
                    }
                }, stepMs);
            }

            // Dừng hẳn nguồn phát (gọi sau khi fadeOutBgm() giảm âm lượng về 0, hoặc trực tiếp nếu cần
            // tắt ngay không cần fade). Reset lại this.audioElement.volume về giá trị gốc (1) — nếu
            // không, lần startBgm() kế tiếp (VD người chơi Quit về Title rồi Start lại — xem
            // window.confirmQuitToTitle() trong ui.js, reload trang nên thực ra SoundEngine được khởi
            // tạo lại từ đầu, volume mặc định đã đúng 1 — nhưng reset tường minh ở đây vẫn an toàn hơn
            // nếu sau này có luồng gọi lại SoundEngine mà không qua reload trang).
            stopBgm() {
                if (this.audioElement) {
                    this.audioElement.pause();
                    this.audioElement.currentTime = 0;
                    this.audioElement.volume = 1;
                }
                if (this.bgmNode) {
                    try {
                        this.bgmNode.osc1.stop();
                        this.bgmNode.osc2.stop();
                    } catch (e) {
                        // Đã stop() từ trước hoặc chưa start() — bỏ qua, không throw.
                    }
                    this.bgmNode = null;
                }
            }

            toggleMute() {
                this.isMuted = !this.isMuted;
                this.audioElement.muted = this.isMuted;
                if (this.isMuted && this.bgmNode) {
                    this.bgmNode.gain.gain.setValueAtTime(0, this.ctx.currentTime);
                } else if (!this.isMuted && this.bgmNode) {
                    this.bgmNode.gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
                }
                return this.isMuted;
            }
        }

        const audio = new SoundEngine();

        class SceneRenderer {
            constructor() {
                this.canvases = {
                    logo: document.getElementById('canvas-logo'),
                    background: document.getElementById('canvas-background'),
                    doorIntro: document.getElementById('canvas-door-intro'),
                    openDoor: document.getElementById('canvas-open-door'),
                    loadingScene: document.getElementById('canvas-loading-scene')
                };
                this.ctxs = {};
                this.animationFrames = {};
                this.time = 0;

                this.initCanvases();
                window.addEventListener('resize', () => this.resizeAll());
            }

            initCanvases() {
                for (let key in this.canvases) {
                    if (this.canvases[key]) {
                        this.ctxs[key] = this.canvases[key].getContext('2d');
                    }
                }
                this.resizeAll();
            }

            resizeAll() {
                const w = window.innerWidth;
                const h = window.innerHeight;
                for (let key in this.canvases) {
                    if (this.canvases[key]) {
                        this.canvases[key].width = w;
                        this.canvases[key].height = h;
                    }
                }
            }

            stopAll() {
                for (let key in this.animationFrames) {
                    cancelAnimationFrame(this.animationFrames[key]);
                }
            }

            // Stage 1: Logo animation
            renderLogo(onComplete) {
                this.stopAll();
                const ctx = this.ctxs.logo;
                const canvas = this.canvases.logo;
                let startTime = null;

                const draw = (now) => {
                    if (!startTime) startTime = now;
                    const elapsed = (now - startTime) / 1000;
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    ctx.fillStyle = '#05070d';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    const cx = canvas.width / 2;
                    const cy = canvas.height / 2;
                    const alpha = elapsed < 1 ? elapsed : elapsed > 2.8 ? Math.max(0, 3.5 - elapsed) : 1;

                    ctx.save();
                    ctx.globalAlpha = alpha;

                    const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 180);
                    grad.addColorStop(0, 'rgba(238, 222, 186, 0.9)');
                    grad.addColorStop(0.4, 'rgba(211, 188, 142, 0.4)');
                    grad.addColorStop(1, 'transparent');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(cx, cy, 180, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.font = "bold 28px 'Cinzel', serif";
                    ctx.fillStyle = "#ffffff";
                    ctx.textAlign = "center";
                    ctx.fillText("CELESTIAL STUDIOS", cx, cy + 10);

                    ctx.restore();

                    if (elapsed < 3.5) {
                        this.animationFrames.logo = requestAnimationFrame(draw);
                    } else {
                        if (onComplete) onComplete();
                    }
                };
                this.animationFrames.logo = requestAnimationFrame(draw);
            }

            // Stage 2: Celestial sky and clouds background loop
            renderBackground() {
                this.stopAll();
                const ctx = this.ctxs.background;
                const canvas = this.canvases.background;

                const draw = () => {
                    this.time += 0.01;
                    const w = canvas.width;
                    const h = canvas.height;

                    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
                    skyGrad.addColorStop(0, '#1c283a');
                    skyGrad.addColorStop(0.5, '#3b4b66');
                    skyGrad.addColorStop(1, '#68596b');
                    ctx.fillStyle = skyGrad;
                    ctx.fillRect(0, 0, w, h);

                    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
                    for (let i = 0; i < 5; i++) {
                        const x = ((this.time * 20 + i * w / 4) % (w + 400)) - 200;
                        const y = h * 0.3 + Math.sin(this.time + i) * 30;
                        ctx.beginPath();
                        ctx.arc(x, y, 120 + i * 20, 0, Math.PI * 2);
                        ctx.arc(x + 80, y - 40, 100, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    ctx.fillStyle = 'rgba(211, 188, 142, 0.25)';
                    const pillarX = w / 2;
                    ctx.fillRect(pillarX - 15, h * 0.2, 30, h * 0.8);

                    this.animationFrames.background = requestAnimationFrame(draw);
                };
                this.animationFrames.background = requestAnimationFrame(draw);
            }

            // Stage 3: Door Intro Camera Approach (~10s)
            renderDoorIntro(onReachedDoor) {
                this.stopAll();
                const ctx = this.ctxs.doorIntro;
                const canvas = this.canvases.doorIntro;
                let startTime = null;

                const draw = (now) => {
                    if (!startTime) startTime = now;
                    const elapsed = (now - startTime) / 1000;
                    const w = canvas.width;
                    const h = canvas.height;

                    const zoom = Math.min(1.8, 1 + elapsed * 0.08);

                    ctx.clearRect(0, 0, w, h);

                    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
                    skyGrad.addColorStop(0, '#0f1724');
                    skyGrad.addColorStop(0.7, '#2c394e');
                    skyGrad.addColorStop(1, '#544652');
                    ctx.fillStyle = skyGrad;
                    ctx.fillRect(0, 0, w, h);

                    ctx.save();
                    ctx.translate(w / 2, h / 2);
                    ctx.scale(zoom, zoom);
                    ctx.translate(-w / 2, -h / 2);

                    const doorW = 120;
                    const doorH = 240;
                    const doorX = w / 2 - doorW / 2;
                    const doorY = h / 2 - doorH / 2 + 20;

                    const archGrad = ctx.createRadialGradient(w/2, h/2, 20, w/2, h/2, 300);
                    archGrad.addColorStop(0, 'rgba(255, 245, 220, 0.8)');
                    archGrad.addColorStop(0.5, 'rgba(211, 188, 142, 0.3)');
                    archGrad.addColorStop(1, 'transparent');
                    ctx.fillStyle = archGrad;
                    ctx.beginPath();
                    ctx.arc(w/2, h/2, 300, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#d3bc8e';
                    ctx.fillRect(doorX - 25, doorY - 30, 20, doorH + 30);
                    ctx.fillRect(doorX + doorW + 5, doorY - 30, 20, doorH + 30);

                    ctx.fillStyle = '#1e2634';
                    ctx.fillRect(doorX, doorY, doorW, doorH);
                    ctx.strokeStyle = '#d3bc8e';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(doorX, doorY, doorW, doorH);

                    ctx.beginPath();
                    ctx.moveTo(w / 2, doorY);
                    ctx.lineTo(w / 2, doorY + doorH);
                    ctx.stroke();

                    ctx.restore();

                    // Reaches door after 10 seconds simulation
                    if (elapsed >= 10 && onReachedDoor) {
                        onReachedDoor();
                        onReachedDoor = null;
                    }

                    this.animationFrames.doorIntro = requestAnimationFrame(draw);
                };
                this.animationFrames.doorIntro = requestAnimationFrame(draw);
            }

            // Stage 4: Open Door transition
            renderOpenDoor(onComplete) {
                this.stopAll();
                const ctx = this.ctxs.openDoor;
                const canvas = this.canvases.openDoor;
                let startTime = null;

                audio.playDoorRumble();

                const draw = (now) => {
                    if (!startTime) startTime = now;
                    const elapsed = (now - startTime) / 1000;
                    const w = canvas.width;
                    const h = canvas.height;

                    ctx.clearRect(0, 0, w, h);

                    ctx.fillStyle = '#2c394e';
                    ctx.fillRect(0, 0, w, h);

                    const doorW = 120;
                    const doorH = 240;
                    const doorY = h / 2 - doorH / 2 + 20;

                    const splitOffset = Math.min(w / 2, elapsed * 120);

                    const lightGrad = ctx.createRadialGradient(w/2, h/2, 10, w/2, h/2, splitOffset * 2.5 + 50);
                    lightGrad.addColorStop(0, '#ffffff');
                    lightGrad.addColorStop(0.4, 'rgba(255, 235, 180, 0.9)');
                    lightGrad.addColorStop(1, 'transparent');
                    ctx.fillStyle = lightGrad;
                    ctx.fillRect(0, 0, w, h);

                    ctx.fillStyle = '#1e2634';
                    ctx.fillRect(w / 2 - doorW / 2 - splitOffset, doorY, doorW / 2, doorH);
                    ctx.fillRect(w / 2 + splitOffset, doorY, doorW / 2, doorH);

                    if (elapsed > 2.5) {
                        const whiteAlpha = Math.min(1, (elapsed - 2.5) / 1.5);
                        ctx.fillStyle = `rgba(255, 255, 255, ${whiteAlpha})`;
                        ctx.fillRect(0, 0, w, h);
                    }

                    if (elapsed < 4.0) {
                        this.animationFrames.openDoor = requestAnimationFrame(draw);
                    } else {
                        if (onComplete) onComplete();
                    }
                };
                this.animationFrames.openDoor = requestAnimationFrame(draw);
            }

            // Stage 5: Loading Scene Canvas
            renderLoadingScene(onComplete) {
                this.stopAll();
                const ctx = this.ctxs.loadingScene;
                const canvas = this.canvases.loadingScene;
                let startTime = null;

                const draw = (now) => {
                    if (!startTime) startTime = now;
                    const elapsed = (now - startTime) / 1000;
                    const w = canvas.width;
                    const h = canvas.height;

                    ctx.fillStyle = '#080b12';
                    ctx.fillRect(0, 0, w, h);

                    if (elapsed < 3.0) {
                        this.animationFrames.loadingScene = requestAnimationFrame(draw);
                    } else {
                        if (onComplete) onComplete();
                    }
                };
                this.animationFrames.loadingScene = requestAnimationFrame(draw);
            }
        }

        const sceneRenderer = new SceneRenderer();

        const state = {
            charName: '',
            isOverlayVisible: false
        };

        const DOM = {
            stageLogo: document.getElementById('stage-logo'),
            stageBg: document.getElementById('stage-background'),
            stageDoorIntro: document.getElementById('stage-door-intro'),
            stageOpenDoor: document.getElementById('stage-open-door'),
            stageLoadingScene: document.getElementById('stage-loading-scene'),
            videoLogo: document.getElementById('video-logo'),
            videoBg: document.getElementById('video-background'),
            videoDoorIntro: document.getElementById('video-door-intro'),
            videoOpenDoor: document.getElementById('video-open-door'),
            videoLoadingScene: document.getElementById('video-loading-scene'),
            popupCharName: document.getElementById('popup-character-name'),
            inputCharName: document.getElementById('input-char-name'),
            charCount: document.getElementById('char-count'),
            btnCancelName: document.getElementById('btn-cancel-name'),
            btnConfirmName: document.getElementById('btn-confirm-name'),
            startOverlay: document.getElementById('start-overlay'),
            btnStartGame: document.getElementById('btn-start-game'),
            displayUserName: document.getElementById('display-user-name'),
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingProgressBar: document.getElementById('loading-progress-bar'),
            loadingTipText: document.getElementById('loading-tip-text'),
            enteringGameCard: document.getElementById('entering-game-card'),
            welcomeTravelerLabel: document.getElementById('welcome-traveler-label'),
            btnRestartPrototype: document.getElementById('btn-restart-prototype'),
            btnNews: document.getElementById('btn-news'),
            btnLogout: document.getElementById('btn-logout'),
            audioToggleBtn: document.getElementById('audio-toggle-btn'),
            audioIcon: document.getElementById('audio-icon')
        };

        // Populate custom UI icon assets from ASSET_CONFIG if provided
        if (ASSET_CONFIG.ui.newsIcon) {
            document.getElementById('icon-news').className = '';
            document.getElementById('icon-news').style.backgroundImage = `url(${ASSET_CONFIG.ui.newsIcon})`;
        }
        if (ASSET_CONFIG.ui.logoutIcon) {
            document.getElementById('icon-logout').className = '';
            document.getElementById('icon-logout').style.backgroundImage = `url(${ASSET_CONFIG.ui.logoutIcon})`;
        }

        function setStage(activeStage) {
            [DOM.stageLogo, DOM.stageBg, DOM.stageDoorIntro, DOM.stageOpenDoor, DOM.stageLoadingScene].forEach(stage => {
                stage.classList.remove('active');
            });
            activeStage.classList.add('active');
        }

        // Helper function to handle media video playback with fallback to canvas renderer
        function playVideoOrFallback(videoElem, configPath, renderFallback, onEnded) {
            if (configPath) {
                videoElem.src = configPath;
                videoElem.play().then(() => {
                    if (onEnded) {
                        videoElem.onended = onEnded;
                    }
                }).catch(() => {
                    renderFallback();
                });
            } else {
                renderFallback();
            }
        }

        // Flow Step 1: Game Launch -> Play logo video / canvas
        function runGameLaunch() {
            setStage(DOM.stageLogo);
            playVideoOrFallback(
                DOM.videoLogo,
                ASSET_CONFIG.intro.logo,
                () => sceneRenderer.renderLogo(() => runBackgroundStage()),
                () => runBackgroundStage()
            );
        }

        // Flow Step 2: Background Video & Music + Character Name Popup
        // BUGFIX/TÍCH HỢP (v0.9 mục 7): chỉ hiện Character Name Popup nếu CHƯA có save data — nếu
        // người chơi đã có hành trình cũ (window.loadGameData() khác null — hạ tầng Save System sẵn có
        // trong 06-camps-save-system.js), bỏ qua bước nhập tên, đi thẳng sang Door Intro Stage. Giữ
        // NGUYÊN mọi bước khác của Opening Flow (Logo → Background → Door → Start → Loading) — đúng
        // yêu cầu "chạy đầy đủ từng bước, chỉ bỏ qua popup tên".
        function runBackgroundStage() {
            setStage(DOM.stageBg);

            playVideoOrFallback(
                DOM.videoBg,
                ASSET_CONFIG.title.backgroundVideo,
                () => sceneRenderer.renderBackground(),
                null
            );

            audio.startBgm();

            const hasExistingSave = !!(window.loadGameData && window.loadGameData());
            if (hasExistingSave) {
                setTimeout(() => {
                    runDoorIntroStage();
                }, 300);
            } else {
                setTimeout(() => {
                    DOM.popupCharName.classList.add('show');
                    DOM.inputCharName.focus();
                }, 300);
            }
        }

        // Character Name Popup Validation
        DOM.inputCharName.addEventListener('input', (e) => {
            const val = e.target.value;
            DOM.charCount.textContent = val.length;
            if (val.trim().length > 0 && val.length <= 16) {
                DOM.btnConfirmName.disabled = false;
            } else {
                DOM.btnConfirmName.disabled = true;
            }
        });

        // TÍCH HỢP (v0.9 mục 6-7): gọi window.setCharacterName() (hạ tầng có sẵn —
        // 02-collision-and-stats-core.js, dùng chung với popup nhập tên cũ #player-name-prompt-overlay)
        // thay vì chỉ lưu vào biến state.charName nội bộ — đây là bước THỰC SỰ ghi tên nhân vật vào
        // CHARACTER_DATA của game. requestSave() ghi lại ngay để tên không mất nếu người chơi thoát
        // giữa chừng Opening (trước khi vào gameplay).
        DOM.btnConfirmName.addEventListener('click', () => {
            audio.playClick();
            state.charName = DOM.inputCharName.value.trim();
            DOM.displayUserName.textContent = `User: ${state.charName}`;
            DOM.welcomeTravelerLabel.textContent = `Welcome, ${state.charName}!`;

            if (window.setCharacterName) window.setCharacterName(state.charName);
            if (window.requestSave) window.requestSave();

            DOM.popupCharName.classList.remove('show');

            setTimeout(() => {
                runDoorIntroStage();
            }, 600);
        });

        // Hủy: chỉ điền lại 'Traveler' vào ô input — KHÔNG xác nhận tên ngay (giữ đúng hành vi gốc:
        // Cancel chỉ reset input, người chơi vẫn cần bấm Confirm để thực sự tiếp tục Opening Flow).
        DOM.btnCancelName.addEventListener('click', () => {
            audio.playClick();
            DOM.inputCharName.value = 'Traveler';
            DOM.inputCharName.dispatchEvent(new Event('input'));
        });

        // Flow Step 3: Door Intro Stage (~10s resource loading camera zoom)
        function runDoorIntroStage() {
            setStage(DOM.stageDoorIntro);

            if (ASSET_CONFIG.door.intro) {
                DOM.videoDoorIntro.src = ASSET_CONFIG.door.intro;
                DOM.videoDoorIntro.play().then(() => {
                    const checkTime = setInterval(() => {
                        if (DOM.videoDoorIntro.currentTime >= 10 || DOM.videoDoorIntro.ended) {
                            clearInterval(checkTime);
                            showStartOverlay();
                        }
                    }, 200);
                }).catch(() => {
                    sceneRenderer.renderDoorIntro(() => showStartOverlay());
                });
            } else {
                sceneRenderer.renderDoorIntro(() => showStartOverlay());
            }
        }

        function showStartOverlay() {
            if (state.isOverlayVisible) return;
            state.isOverlayVisible = true;
            DOM.startOverlay.classList.add('show');
        }

        // Flow Step 4: Click Anywhere / Press Enter -> Open Door Stage
        DOM.btnStartGame.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!state.isOverlayVisible) return;

            audio.playClick();
            state.isOverlayVisible = false;
            DOM.startOverlay.classList.remove('show');

            setTimeout(() => {
                runOpenDoorStage();
            }, 600);
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && state.isOverlayVisible) {
                DOM.btnStartGame.click();
            }
        });

        // Flow Step 5: Open Door Stage
        function runOpenDoorStage() {
            setStage(DOM.stageOpenDoor);

            playVideoOrFallback(
                DOM.videoOpenDoor,
                ASSET_CONFIG.door.open,
                () => sceneRenderer.renderOpenDoor(() => runLoadingSceneStage()),
                () => runLoadingSceneStage()
            );
        }

        // Flow Step 6: Loading Scene Stage
        // BUGFIX (v0.9): background.mp3 phải tắt dần TỪ ĐÂY — đúng lúc loading_scene.mp4 bắt đầu phát
        // (yêu cầu: "sau khi vào loading_scene.mp4 thì mở nhỏ dần âm lượng của background.mp3, mở nhỏ
        // dần rồi tắt"). fadeOutBgm() tự xử lý cả 2 nhánh phát nhạc (audio element thật / synth
        // fallback) — xem SoundEngine.fadeOutBgm() đầu file.
        function runLoadingSceneStage() {
            setStage(DOM.stageLoadingScene);
            audio.fadeOutBgm(1500);

            playVideoOrFallback(
                DOM.videoLoadingScene,
                ASSET_CONFIG.loading.scene,
                () => sceneRenderer.renderLoadingScene(() => runLoadingOverlayStage()),
                () => runLoadingOverlayStage()
            );
        }

        const tipsList = [
            "Tip: Combining Pyro and Hydro triggers Vaporize, dealing increased damage!",
            "Tip: Use Anemo abilities to Swirl elements across multiple enemies.",
            "Tip: Elemental Resonance grants special party-wide stat buffs.",
            "Tip: Keep an eye out for Anemoculi and Geoculi while exploring Teyvat!"
        ];

        // Flow Step 7: Final Screen - "Entering Game..." -> KẾT NỐI GAMEPLAY (v0.9 mục 6)
        // Sau khi thanh loading chạy xong, hiện card "Entering Game..." đúng 1 nhịp ngắn (giữ nguyên
        // cảm giác chuyển cảnh mượt của prototype gốc), rồi ẨN TOÀN BỘ #opening-root và gọi
        // window.startGameplay() — hàm này chính là khối window.onload gốc của game (đổi tên thành
        // hàm thường, không tự chạy khi trang tải — xem cuối index.html), khởi tạo toàn bộ hệ thống
        // gameplay (Character, Party, Inventory, Quest, Dialogue, Combat, Save System...) giữ NGUYÊN
        // VẸN, không đổi gì bên trong. Nút "Restart Prototype" (chỉ có ý nghĩa lúc test độc lập
        // title_screen.html) không còn được dùng trong luồng thật — ẩn đi thay vì xoá khỏi DOM (tránh
        // ảnh hưởng các tham chiếu DOM.btnRestartPrototype khác nếu có mở rộng sau này).
        function runLoadingOverlayStage() {
            DOM.loadingOverlay.classList.add('show');

            DOM.loadingTipText.textContent = tipsList[Math.floor(Math.random() * tipsList.length)];
            const elementIcons = document.querySelectorAll('.element-icon');

            let currentIcon = 0;
            const iconInterval = setInterval(() => {
                elementIcons.forEach(icon => icon.classList.remove('active'));
                if (elementIcons[currentIcon]) {
                    elementIcons[currentIcon].classList.add('active');
                }
                currentIcon = (currentIcon + 1) % elementIcons.length;
            }, 400);

            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += 2;
                DOM.loadingProgressBar.style.width = `${progress}%`;
                if (progress >= 100) {
                    clearInterval(progressInterval);
                    clearInterval(iconInterval);

                    setTimeout(() => {
                        DOM.loadingOverlay.classList.remove('show');
                        if (DOM.btnRestartPrototype) DOM.btnRestartPrototype.classList.add('hidden');
                        DOM.enteringGameCard.classList.add('show');

                        setTimeout(() => {
                            enterGameplay();
                        }, 1200);
                    }, 500);
                }
            }, 80);
        }

        // Điểm nối Opening -> Gameplay thật (v0.9 mục 6): ẩn #opening-root, dừng nhạc/canvas Opening
        // (tránh rò rỉ requestAnimationFrame loop và audio chạy ngầm phía sau gameplay), rồi gọi
        // window.startGameplay() ĐÚNG 1 LẦN.
        function enterGameplay() {
            sceneRenderer.stopAll();
            const openingRoot = document.getElementById('opening-root');
            if (openingRoot) {
                openingRoot.style.transition = 'opacity 0.6s ease';
                openingRoot.style.opacity = '0';
                setTimeout(() => {
                    openingRoot.style.display = 'none';
                }, 600);
            }
            // Tắt guard chặn input gameplay (xem window.isOpeningActive ở đầu file + guard trong
            // 07-input-handlers.js) TRƯỚC KHI gọi startGameplay() — để initThree()/animate() và mọi
            // input WASD/chuột/phím tắt hoạt động bình thường ngay khi gameplay thật bắt đầu.
            window.isOpeningActive = false;
            if (window.startGameplay) window.startGameplay();
        }

        // Utility Modal Handlers
        DOM.btnNews.addEventListener('click', (e) => {
            e.stopPropagation();
            audio.playClick();
            document.getElementById('news-modal').classList.add('show');
        });

        DOM.btnLogout.addEventListener('click', (e) => {
            e.stopPropagation();
            audio.playClick();
            document.getElementById('logout-modal').classList.add('show');
        });

        function closeGenericModal(id) {
            audio.playClick();
            document.getElementById(id).classList.remove('show');
        }

        // TÍCH HỢP (v0.9 mục 4): thay thế onclick="closeGenericModal(...)" inline trong HTML (đã bỏ
        // khỏi index.html — "Không để JavaScript trực tiếp trong HTML") bằng addEventListener đọc
        // data-modal-id, hành vi giữ NGUYÊN VẸN như bản gốc.
        document.querySelectorAll('.js-close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                closeGenericModal(btn.dataset.modalId);
            });
        });

        DOM.audioToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isMuted = audio.toggleMute();
            DOM.audioIcon.className = isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
        });

        document.querySelectorAll('.genshin-btn, .utility-btn, .server-box').forEach(btn => {
            btn.addEventListener('mouseenter', () => audio.playHover());
        });

        // TÍCH HỢP (v0.9 mục 6): KHÔNG tự chạy bằng window.addEventListener('load', ...) như prototype
        // độc lập — index.html giờ có 2 giai đoạn khởi động tuần tự (Opening rồi mới đến gameplay), nên
        // cả 2 không thể cùng đăng ký lên sự kiện 'load' độc lập với nhau (dễ đụng thứ tự chạy tùy
        // trình duyệt). runOpeningFlow() được export ra window, gọi đúng 1 lần TỪ index.html — đây là
        // điểm khởi động DUY NHẤT của toàn bộ trang.
        window.runOpeningFlow = function () {
            runGameLaunch();
        };
