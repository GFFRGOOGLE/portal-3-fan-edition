// ============================================================
// 1. ПОЛНОЦЕННАЯ КАПЧА ПРИ ЗАХОДЕ НА САЙТ
// ============================================================
(function() {
    if (sessionStorage.getItem('captchaPassed') === 'true') return;

    function generateCaptcha(length = 6) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    }

    function drawCaptcha(text, canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.fillStyle = '#1a1f2a';
        ctx.fillRect(0, 0, w, h);

        for (let i = 0; i < 150; i++) {
            ctx.fillStyle = Math.random() > 0.7 ? '#f5a623' : '#8af0ff';
            ctx.beginPath();
            ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 2 + 0.5, 0, Math.PI * 2);
            ctx.fill();
        }

        for (let i = 0; i < 6; i++) {
            ctx.strokeStyle = Math.random() > 0.5 ? '#f5a62344' : '#8af0ff44';
            ctx.lineWidth = Math.random() * 2 + 1;
            ctx.beginPath();
            ctx.moveTo(Math.random() * w, Math.random() * h);
            ctx.lineTo(Math.random() * w, Math.random() * h);
            ctx.stroke();
        }

        const chars = text.split('');
        const fontSize = 36;
        ctx.font = `bold ${fontSize}px "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const totalWidth = chars.length * (fontSize + 6);
        const startX = (w - totalWidth) / 2 + fontSize / 2;

        chars.forEach((ch, i) => {
            const x = startX + i * (fontSize + 6) + (Math.random() - 0.5) * 8;
            const y = h / 2 + (Math.random() - 0.5) * 12;
            const angle = (Math.random() - 0.5) * 0.4;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.fillStyle = Math.random() > 0.5 ? '#f5a623' : '#8af0ff';
            ctx.shadowColor = '#f5a62344';
            ctx.shadowBlur = 10;
            ctx.fillText(ch, 0, 0);
            ctx.restore();
        });

        for (let i = 0; i < 80; i++) {
            ctx.fillStyle = Math.random() > 0.8 ? '#f5a62333' : '#8af0ff33';
            ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 4 + 1, Math.random() * 2 + 0.5);
        }
    }

    const overlay = document.createElement('div');
    overlay.id = 'captchaOverlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.88);
        backdrop-filter: blur(6px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        flex-direction: column;
        transition: opacity 0.5s ease;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
        background: #141a24;
        padding: 40px 30px;
        border-radius: 24px;
        border: 2px solid #f5a623;
        max-width: 420px;
        width: 90%;
        text-align: center;
        box-shadow: 0 0 60px #f5a62333;
    `;

    box.innerHTML = `
        <h2 style="color:#f5a623; font-weight:300; letter-spacing:3px; margin-bottom:10px;">🔒 Проверка</h2>
        <p style="color:#aaa; margin-bottom:15px;">Введите символы с картинки</p>
        <canvas id="captchaCanvas" width="320" height="100" style="border-radius:12px; border:1px solid #f5a62355; width:100%; height:auto; background:#1a1f2a;"></canvas>
        <input type="text" id="captchaInput" placeholder="Введите код" autofocus style="
            width:100%; padding:12px; border-radius:8px; border:1px solid #f5a62355;
            background:#1a1f2a; color:#fff; font-size:1.2rem; text-align:center; margin:15px 0; outline:none;
        ">
        <div style="display:flex; gap:10px; justify-content:center;">
            <button id="captchaRefresh" style="
                background:rgba(255,255,255,0.05); border:1px solid #f5a62355; color:#ccc;
                padding:10px 20px; border-radius:8px; cursor:pointer; transition:0.3s;
            ">🔄 Обновить</button>
            <button id="captchaSubmit" style="
                background:#f5a623; color:#0b0e14; border:none; padding:10px 30px;
                border-radius:40px; font-size:1.1rem; font-weight:600; cursor:pointer; transition:0.3s;
            ">Войти</button>
        </div>
        <div id="captchaError" style="color:#ff6666; margin-top:10px; font-size:0.9rem; min-height:1.5em;"></div>
    `;

    overlay.appendChild(box);
    document.body.prepend(overlay);

    const canvas = document.getElementById('captchaCanvas');
    const input = document.getElementById('captchaInput');
    const submitBtn = document.getElementById('captchaSubmit');
    const refreshBtn = document.getElementById('captchaRefresh');
    const errorEl = document.getElementById('captchaError');

    let currentText = generateCaptcha(6);
    drawCaptcha(currentText, canvas);

    function refreshCaptcha() {
        currentText = generateCaptcha(6);
        drawCaptcha(currentText, canvas);
        input.value = '';
        errorEl.textContent = '';
        input.focus();
    }

    function checkCaptcha() {
        const userInput = input.value.trim().toUpperCase();
        if (userInput === currentText) {
            sessionStorage.setItem('captchaPassed', 'true');
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 500);
        } else {
            errorEl.textContent = '❌ Неверный код, попробуйте снова.';
            refreshCaptcha();
        }
    }

    refreshBtn.addEventListener('click', refreshCaptcha);
    submitBtn.addEventListener('click', checkCaptcha);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') checkCaptcha();
    });

    input.focus();
})();

// ============================================================
// 2. ПОДСВЕТКА АКТИВНОЙ СТРАНИЦЫ
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const links = document.querySelectorAll('.menu a');
    const current = window.location.pathname.split('/').pop() || 'index.html';
    links.forEach(link => {
        if (link.getAttribute('href') === current) {
            link.classList.add('active');
        }
    });
});

// ============================================================
// 3. ФОРМА ОБРАТНОЙ СВЯЗИ (БЕЗ КАПЧИ)
// ============================================================
const supportForm = document.getElementById('supportForm');
if (supportForm) {
    supportForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const formMessage = document.getElementById('formMessage');
        formMessage.textContent = '✅ Сообщение отправлено (демо-режим). Спасибо!';
        formMessage.style.color = '#44ddff';
        // Здесь можно добавить реальную отправку
    });
}
