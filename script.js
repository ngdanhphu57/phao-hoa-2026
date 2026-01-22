const canvas = document.getElementById('fireworksCanvas');
const ctx = canvas.getContext('2d');

let width, height;

function resizeCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    ctx.globalCompositeOperation = 'lighter'; // Quan trọng cho hiệu ứng sáng rực
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ==========================================
// CẤU HÌNH (SETTINGS)
// ==========================================
// Chỉnh sửa để pháo hoa trông thật nhất có thể
const SETTINGS = {
    gravity: 0.02,        // Trọng lực (Tăng lên chút để rơi nhanh hơn cho thật)
    friction: 0.98,       // Sức cản không khí cho HẠT NỔ (0.98 là mượt)
    particlesPerShell: 150, // Số lượng hạt
    autoFireDelay: 900,     // Tổng hợp bắn nhanh hơn chút
    trailLength: 15,         // Đuôi dài hơn
    simultaneousMax: 5,      // Bắn tối đa 3 quả cùng lúc
    sound: {
        openingVolume: 6.0, // Âm lượng quả mở màn (Rất to)
        normalVolume: 1   // Âm lượng pháo thường (Nhỏ hơn)
    }
};

// ==========================================
// UTILS
// ==========================================
function random(min, max) {
    return Math.random() * (max - min) + min;
}

// Hàm chọn màu ngẫu nhiên rực rỡ
function getRandomColor() {
    // 50% là màu vàng/cam (kiểu pháo hoa cổ điển)
    if (Math.random() < 0.3) return `hsl(${random(30, 50)}, 100%, 60%)`;
    // Còn lại là các màu neon
    const hue = Math.floor(random(0, 360));
    return `hsl(${hue}, 100%, 60%)`;
}

// ==========================================
// CLASSES
// ==========================================

class Particle {
    constructor(x, y, color, speed, angle, type) {
        this.x = x;
        this.y = y;
        this.color = color;

        // Tính toán vận tốc
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        this.alpha = 1;
        this.decay = random(0.008, 0.02); // Tốc độ mờ dần (ngẫu nhiên để không biến mất cùng lúc)

        this.type = type; // 'SIMPLE', 'WILLOW' (liễu rủ), 'SPARKLE' (lấp lánh)

        // Lưu vị trí cũ để vẽ vệt đuôi
        this.coordinates = [];
        this.coordinateCount = 5;
        while (this.coordinateCount--) {
            this.coordinates.push([this.x, this.y]);
        }
    }

    update() {
        // Cập nhật đuôi
        this.coordinates.pop();
        this.coordinates.unshift([this.x, this.y]);

        // Vật lý
        this.vx *= SETTINGS.friction;
        this.vy *= SETTINGS.friction;
        this.vy += SETTINGS.gravity;

        this.x += this.vx;
        this.y += this.vy;

        // Hiệu ứng riêng cho từng loại
        if (this.type === 'WILLOW') {
            // Liễu rủ thì rơi chậm hơn (nhẹ hơn) và burn lâu hơn
            this.alpha -= (this.decay * 0.5);
            // Bỏ dòng vy *= 1.02 gây méo hình
        } else {
            this.alpha -= this.decay;
        }

        // Lấp lánh (Sparkle)
        if (this.type === 'SPARKLE') {
            // Nhấp nháy alpha
            this.flash = Math.random() > 0.8;
        }
    }

    draw(ctx) {
        if (this.type === 'SPARKLE' && !this.flash) return;

        ctx.beginPath();
        ctx.moveTo(this.coordinates[this.coordinates.length - 1][0], this.coordinates[this.coordinates.length - 1][1]);
        ctx.lineTo(this.x, this.y);

        // Màu sắc theo alpha (mờ dần)
        ctx.strokeStyle = this.color.replace(')', `, ${this.alpha})`).replace('hsl', 'hsla');
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Vẽ đầu hạt sáng hơn chút
        if (this.type === 'WILLOW') {
            ctx.fillStyle = this.color.replace(')', `, ${this.alpha})`).replace('hsl', 'hsla');
            ctx.fillRect(this.x, this.y, 1, 1);
        }
    }

    isAlive() {
        return this.alpha > 0;
    }
}

class Firework {
    constructor(sx, sy, tx, ty, customColor = null) {
        this.x = sx;
        this.y = sy;
        this.sx = sx;
        this.sy = sy;
        this.tx = tx;
        this.ty = ty;

        // 1. Tính toán độ cao cần đạt được (Height)
        // Canvas Y: 0 ở trên, Height ở dưới. sy luôn lớn hơn ty.
        const heightToTravel = sy - ty;

        // 2. Tính vận tốc dọc cần thiết để đạt độ cao đó (v^2 = 2gh)
        // Vì đi lên nên vận tốc âm
        // Chúng ta dùng SETTINGS.gravity nhưng cần scale một chút cho rocket nếu muốn
        // Ở đây dùng chính gravity của môi trường là chuẩn nhất.
        this.vy = -Math.sqrt(2 * SETTINGS.gravity * heightToTravel);

        // 3. Tính thời gian để đạt đỉnh (v = v0 + at => 0 = vy + gt => t = -vy/g)
        const timeToApex = -this.vy / SETTINGS.gravity;

        // 4. Tính vận tốc ngang để đến đúng đích cùng lúc đó
        const distanceX = tx - sx;
        this.vx = distanceX / timeToApex;

        this.coordinates = [];
        this.coordinateCount = 4;
        while (this.coordinateCount--) {
            this.coordinates.push([this.x, this.y]);
        }

        this.exploded = false;
        // Nếu có màu force (ví dụ quả mở màn) thì dùng, không thì random
        this.color = customColor || getRandomColor();
        this.isHuge = false; // Mặc định là pháo nhỏ

        // 10% cơ hội biến thành pháo 7 màu (RAINBOW)
        // Chỉ áp dụng nếu không bị ép màu (ví dụ quả mở màn màu đỏ thì không đổi)
        if (!customColor && Math.random() < 0.1) {
            this.color = 'RAINBOW';
        }

        // Random style
        const r = Math.random();
        if (r < 0.2) this.explosionType = 'WILLOW';
        else if (r < 0.5) this.explosionType = 'SPARKLE';
        else this.explosionType = 'SIMPLE';

        // Tạo pha dao động ngẫu nhiên cho đuôi lắc lư
        this.wobblePhase = Math.random() * Math.PI * 6;
    }

    update() {
        this.coordinates.pop();
        this.coordinates.unshift([this.x, this.y]);

        // Áp dụng trọng lực
        this.vy += SETTINGS.gravity;

        this.x += this.vx;
        this.y += this.vy;

        // HIỆU ỨNG LẮC LƯ (Wobble)
        this.x += Math.sin(this.y * 0.05 + this.wobblePhase) * 0.2;

        // Điều kiện nổ: Khi vận tốc dọc >= 0 (Đạt đỉnh)
        if (this.vy >= 0) {
            this.exploded = true;
            createExplosion(this.x, this.y, this.color, this.explosionType, this.isHuge);
        }
    }

    draw(ctx) {
        // Xử lý màu sắc: Nếu là RAINBOW thì đổi màu liên tục theo thời gian
        let currentColor = this.color;
        if (this.color === 'RAINBOW') {
            const h = (Date.now() / 2) % 360;
            currentColor = `hsl(${h}, 100%, 60%)`;
        }

        ctx.beginPath();
        // Vẽ đuôi
        ctx.moveTo(this.coordinates[this.coordinates.length - 1][0], this.coordinates[this.coordinates.length - 1][1]);
        ctx.lineTo(this.x, this.y);
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Vẽ đầu pháo hoa sáng hơn (cùng màu với pháo)
        ctx.fillStyle = currentColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ==========================================
// SOUND UI (ÂM THANH)
// ==========================================
// Sử dụng Web Audio API để tạo tiếng nổ mà không cần file mp3
const SoundManager = {
    ctx: null,

    init: function () {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    playExplosion: function (volumeMultiplier = 1) {
        if (!this.ctx) return;

        const t = this.ctx.currentTime;

        // 1. Tạo nguồn Noise (Tiếng ồn trắng)
        const bufferSize = this.ctx.sampleRate * 2; // 2 giây
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        // 2. Bộ lọc Lowpass (Để tạo tiếng nổ trầm, ầm ầm)
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, t);
        filter.frequency.exponentialRampToValueAtTime(100, t + 1); // Giảm tần số nhanh

        // 3. Gain (Âm lượng giảm dần)
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volumeMultiplier, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 1);

        // Kết nối: Noise -> Filter -> Gain -> Out
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start(t);
        noise.stop(t + 1);
    }
};

// ==========================================
// LOGIC
// ==========================================
let fireworks = [];
let particles = [];
let lastAutoFireTime = 0;
let hasOpeningShot = false; // Cờ đánh dấu đã bắn phát mở màn chưa

function createExplosion(x, y, color, type, isHuge = false) {
    // PHÁT TIẾNG NỔ
    const volume = isHuge ? SETTINGS.sound.openingVolume : SETTINGS.sound.normalVolume;
    SoundManager.playExplosion(volume);

    let count = SETTINGS.particlesPerShell;
    if (type === 'WILLOW') count = 80;

    // Nếu là quả nổ to (Opening)
    let speedMultiplier = 1.0;
    if (isHuge) {
        count = 300; // Số lượng siêu khủng
        speedMultiplier = 2.0; // Nổ bung rộng
    }

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (Math.random() * 5 + 1) * speedMultiplier;

        // Xử lý màu sắc: Nếu là pháo 7 màu, mỗi hạt sẽ có màu ngẫu nhiên khác nhau
        const pColor = (color === 'RAINBOW') ? getRandomColor() : color;

        particles.push(new Particle(x, y, pColor, speed, angle, type));
    }
}

function launchFirework() {
    // START X
    let startX;
    if (Math.random() < 0.3) {
        startX = Math.random() * width;
    } else {
        startX = (Math.random() + Math.random()) * 0.5 * width;
    }

    const startY = height;

    // Đích đến
    const deviation = (Math.random() - 0.5) * 40;
    const targetX = startX + deviation;

    const targetY = random(height * 0.1, height * 0.5);

    fireworks.push(new Firework(startX, startY, targetX, targetY));
}

// Hàm riêng cho quả khai màn
function launchOpening() {
    // Bắn từ chính giữa
    const startX = width / 2;
    const startY = height;
    const targetX = width / 2;
    const targetY = height * 0.2; // Bay rất cao (20% từ trên xuống)

    // Màu đỏ rực (Hue 0)
    const bigRed = new Firework(startX, startY, targetX, targetY, `hsl(0, 100%, 60%)`);
    bigRed.isHuge = true; // Đánh dấu là quả to
    fireworks.push(bigRed);
}

// ==========================================
// INTRO SEQUENCE
// ==========================================
let introComplete = false;

function startIntroSequence() {
    // 1. Click phát là bay luôn (không chờ nữa)
    document.querySelector('.old-five').classList.add('fly-away');
    document.querySelector('.balloon-container').classList.add('float-up');

    // 2. Đợi bóng bay lên tới nơi (5 giây sau) -> XÓA INTRO TRƯỚC
    setTimeout(() => {
        document.getElementById('intro').classList.add('hidden');
    }, 4000);

    // 3. Sau khi xóa xong (chờ thêm 1s cho tắt hẳn) -> PHÁO TO MỚI BAY LÊN
    setTimeout(() => {
        launchOpening();
    }, 4500);

    // 4. Đợi pháo nổ (khoảng 1.5s bay lên) -> Bắt đầu chương trình chính
    setTimeout(() => {
        introComplete = true;
        // 2s sau pháo dàn mới bắt đầu bay lên
        lastAutoFireTime = Date.now() + 2000;
    }, 5500); // 6000 + 1600
}

// Thay vì tự chạy, giờ phải CLICK mới chạy
let hasStarted = false;
document.addEventListener('click', () => {
    if (!hasStarted) {
        hasStarted = true;
        SoundManager.init();

        // Bật nhạc Tết
        const audio = document.getElementById('bgMusic');
        if (audio) {
            audio.play().catch(e => console.log("Chưa có file nhạc hoặc lỗi autoplay:", e));
        }

        startIntroSequence();
    }
});


function loop() {
    requestAnimationFrame(loop);

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'lighter';

    // Auto fire CHỈ CHẠY KHI INTRO XONG
    if (introComplete && Date.now() > lastAutoFireTime && (Date.now() - lastAutoFireTime > SETTINGS.autoFireDelay)) {
        // Bắn đồng loạt ngẫu nhiên từ 1 đến simultaneousMax quả
        const count = Math.floor(random(1, SETTINGS.simultaneousMax + 1));
        for (let k = 0; k < count; k++) {
            launchFirework();
        }
        lastAutoFireTime = Date.now() + (Math.random() - 0.5) * 500;
    }

    // Update fireworks
    let i = fireworks.length;
    while (i--) {
        fireworks[i].draw(ctx);
        fireworks[i].update();
        if (fireworks[i].exploded) fireworks.splice(i, 1);
    }

    // Update particles
    let j = particles.length;
    while (j--) {
        particles[j].draw(ctx);
        particles[j].update();
        if (!particles[j].isAlive()) particles.splice(j, 1);
    }
}

loop();
