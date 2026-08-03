// ============================================================
// 1. ПОЛНОЦЕННАЯ КАПЧА ПРИ ЗАХОДЕ НА САЙТ
// ============================================================
(function() {
    if (sessionStorage.getItem('captchaPassed') === 'true') return;

    // ─── НАСТРОЙКИ ──────────────────────────────────────────────
    const CONFIG = {
        length: 6,              // длина кода
        width: 320,             // ширина canvas
        height: 100,            // высота canvas
        fontSize: 36,           // размер шрифта
        noiseDots: 150,         // количество шумовых точек
        noiseLines: 6,          // количество шумовых линий
        noiseRects: 80,         // количество шумовых полосок
        colors: {
            bg: '#1a1f2a',
            primary: '#f5a623',
            secondary: '#8af0ff',
            error: '#ff6666'
        }
    };

    function generateCaptcha() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz23456789';
        let result = '';
        for (let i = 0; i < CONFIG.length; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    }

    function randomColor(opacity = 'ff') {
        return Math.random() > 0.5 
            ? CONFIG.colors.primary + opacity 
            : CONFIG.colors.secondary + opacity;
    }

    function drawCaptcha(text, canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;

        // Фон
        ctx.fillStyle = CONFIG.colors.bg;
        ctx.fillRect(0, 0, w, h);

        // Шум: точки
        for (let i = 0; i < CONFIG.noiseDots; i++) {
            ctx.fillStyle = randomColor(Math.random() > 0.7 ? '' : '44');
            ctx.beginPath();
            ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 2 + 0.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Шум: линии
        for (let i = 0; i < CONFIG.noiseLines; i++) {
            ctx.strokeStyle = randomColor('44');
            ctx.lineWidth = Math.random() * 2 + 1;
            ctx.beginPath();
            ctx.moveTo(Math.random() * w, Math.random() * h);
            ctx.lineTo(Math.random() * w, Math.random() * h);
            ctx.stroke();
        }

        // Текст
        const chars = text.split('');
        ctx.font = `bold ${CONFIG.fontSize}px "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const spacing = CONFIG.fontSize + 6;
        const totalWidth = chars.length * spacing;
        const startX = (w - totalWidth) / 2 + CONFIG.fontSize / 2;

        chars.forEach((ch, i) => {
            const x = startX + i * spacing + (Math.random() - 0.5) * 8;
            const y = h / 2 + (Math.random() - 0.5) * 12;
            const angle = (Math.random() - 0.5) * 0.4;

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.fillStyle = randomColor();
            ctx.shadowColor = CONFIG.colors.primary + '44';
            ctx.shadowBlur = 10;
            ctx.fillText(ch, 0, 0);
            ctx.restore();
        });

        // Шум: полоски поверх текста
        for (let i = 0; i < CONFIG.noiseRects; i++) {
            ctx.fillStyle = randomColor('33');
            ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 4 + 1, Math.random() * 2 + 0.5);
        }
    }

    // ─── СОЗДАНИЕ DOM ─────────────────────────────────────────
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
        border: 2px solid ${CONFIG.colors.primary};
        max-width: 420px;
        width: 90%;
        text-align: center;
        box-shadow: 0 0 60px ${CONFIG.colors.primary}33;
    `;

    box.innerHTML = `
        <h2 style="color:${CONFIG.colors.primary}; font-weight:300; letter-spacing:3px; margin-bottom:10px;">🔒 Проверка</h2>
        <p style="color:#aaa; margin-bottom:15px;">Введите символы с картинки (с учётом регистра)</p>
        <canvas id="captchaCanvas" width="${CONFIG.width}" height="${CONFIG.height}" style="border-radius:12px; border:1px solid ${CONFIG.colors.primary}55; width:100%; height:auto; background:${CONFIG.colors.bg};"></canvas>
        <input type="text" id="captchaInput" placeholder="Введите код" maxlength="${CONFIG.length}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" style="
            width:100%; padding:12px; border-radius:8px; border:1px solid ${CONFIG.colors.primary}55;
            background:${CONFIG.colors.bg}; color:#fff; font-size:1.2rem; text-align:center; margin:15px 0; outline:none;
        ">
        <div style="display:flex; gap:10px; justify-content:center;">
            <button id="captchaRefresh" style="
                background:rgba(255,255,255,0.05); border:1px solid ${CONFIG.colors.primary}55; color:#ccc;
                padding:10px 20px; border-radius:8px; cursor:pointer; transition:0.3s;
            ">🔄 Обновить</button>
            <button id="captchaSubmit" style="
                background:${CONFIG.colors.primary}; color:#0b0e14; border:none; padding:10px 30px;
                border-radius:40px; font-size:1.1rem; font-weight:600; cursor:pointer; transition:0.3s;
            ">Войти</button>
        </div>
        <div id="captchaError" style="color:${CONFIG.colors.error}; margin-top:10px; font-size:0.9rem; min-height:1.5em;"></div>
    `;

    overlay.appendChild(box);
    document.body.prepend(overlay);

    // ─── ЭЛЕМЕНТЫ ─────────────────────────────────────────────
    const canvas = document.getElementById('captchaCanvas');
    const input = document.getElementById('captchaInput');
    const submitBtn = document.getElementById('captchaSubmit');
    const refreshBtn = document.getElementById('captchaRefresh');
    const errorEl = document.getElementById('captchaError');

    let currentText = generateCaptcha();
    drawCaptcha(currentText, canvas);

    // ─── ФУНКЦИИ ──────────────────────────────────────────────
    function refreshCaptcha() {
        currentText = generateCaptcha();
        drawCaptcha(currentText, canvas);
        input.value = '';
        errorEl.textContent = '';
        input.focus();
    }

    function checkCaptcha() {
        const userInput = input.value.trim();
        if (userInput === currentText) {
            sessionStorage.setItem('captchaPassed', 'true');
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 500);
        } else {
            errorEl.textContent = '❌ Неверный код, попробуйте снова.';
            refreshCaptcha();
        }
    }

    // ─── ОБРАБОТЧИКИ ──────────────────────────────────────────
    refreshBtn.addEventListener('click', refreshCaptcha);
    submitBtn.addEventListener('click', checkCaptcha);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') checkCaptcha();
    });

    // Блокировка вставки (paste) — защита от ботов
    input.addEventListener('paste', (e) => {
        e.preventDefault();
        errorEl.textContent = '⚠️ Вставка запрещена. Введите код вручную.';
    });

    // Автофокус при клике в overlay
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) input.focus();
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
    });
}
