// ============================================================
// ЗАЩИТА ОТ КОПИРОВАНИЯ КОДА
// ============================================================
(function protectCode() {
    'use strict';

    // Блокировка правого клика
    document.addEventListener('contextmenu', e => { e.preventDefault(); return false; });

    // Блокировка выделения
    document.addEventListener('selectstart', e => { e.preventDefault(); return false; });
    document.addEventListener('copy', e => { e.preventDefault(); return false; });
    document.addEventListener('cut', e => { e.preventDefault(); return false; });

    // Console warning
    console.log('%c🚫', 'font-size:50px');
    console.log('%cЭтот сайт защищён. Копирование кода запрещено.', 'color:#f5a623;font-size:14px');
    console.log('%cPortal 3: Fan Edition © 2026', 'color:#666;font-size:12px');
})();

// ============================================================
// 1. КАПЧА ПРИ ЗАХОДЕ НА САЙТ (не показывается при перезагрузке)
// ============================================================
(function() {
    if (localStorage.getItem('captchaPassed') === 'true') return;

    const ALLOWED_AGENTS = [
        'Googlebot','Google-Extended','Bingbot','Slurp','DuckDuckBot',
        'YandexBot','YandexImages','YandexVideo',
        'vkShare','TelegramBot','Discordbot','Twitterbot',
        'facebookexternalhit','Instagram','TikTokBot',
        'ChatGPT-User','GPTBot','Claude-Web','PerplexityBot',
        'Kimi','DeepSeek','Ella','MailRuBot',
        'archive.org_bot','ia_archiver',
        'Applebot','LinkedInBot','Pinterestbot','Redditbot','WhatsApp',
    ];

    const BLOCKED_AGENTS = [
        'MJ12bot','AhrefsBot','SemrushBot','DotBot','DataForSeoBot',
        'SEMrush','rogerbot','Screaming Frog','BLEXBot','MegaIndex.ru',
        'serpstatbot','SiteCheckerBot','Uptimebot',
        'Python-requests','curl','wget','Go-http-client','Java/','scrapy',
    ];

    function checkUserAgent() {
        const ua = navigator.userAgent || '';
        const lowerUA = ua.toLowerCase();
        for (let bot of BLOCKED_AGENTS) {
            if (lowerUA.includes(bot.toLowerCase())) return false;
        }
        const isBot = /bot|crawler|spider|archiver/i.test(ua);
        if (isBot) {
            for (let agent of ALLOWED_AGENTS) {
                if (lowerUA.includes(agent.toLowerCase())) return true;
            }
            return false;
        }
        return true;
    }

    function checkBotBehavior() {
        if (navigator.webdriver) return false;
        if (window.outerWidth === 0 && window.outerHeight === 0) return false;
        return true;
    }

    function checkHoneypot() {
        const trap = document.querySelector('input[name="trap"]');
        return !(trap && trap.value !== '');
    }

    let mathNum1, mathNum2, mathCorrect;
    function generateMath() {
        mathNum1 = Math.floor(Math.random() * 15) + 1;
        mathNum2 = Math.floor(Math.random() * 15) + 1;
        mathCorrect = mathNum1 + mathNum2;
        return `Сколько будет ${mathNum1} + ${mathNum2}?`;
    }

    const CONFIG = { colors: { bg:'#1a1f2a', primary:'#f5a623', secondary:'#8af0ff', error:'#ff6666' }};

    const overlay = document.createElement('div');
    overlay.id = 'captchaOverlay';
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.88);backdrop-filter:blur(6px);display:flex;justify-content:center;align-items:center;z-index:9999;flex-direction:column;transition:opacity 0.5s ease;`;

    const box = document.createElement('div');
    box.style.cssText = `background:#141a24;padding:40px 30px;border-radius:24px;border:2px solid ${CONFIG.colors.primary};max-width:420px;width:90%;text-align:center;box-shadow:0 0 60px ${CONFIG.colors.primary}33;`;

    box.innerHTML = `
        <h2 style="color:${CONFIG.colors.primary};font-weight:300;letter-spacing:3px;margin-bottom:10px;">🔒 Проверка</h2>
        <p style="color:#aaa;margin-bottom:15px;">Введите ответ на задачу</p>
        <input type="text" name="trap" style="display:none" tabindex="-1" autocomplete="off">
        <div id="mathQuestion" style="background:${CONFIG.colors.bg};padding:20px;border-radius:12px;border:1px solid ${CONFIG.colors.primary}55;color:${CONFIG.colors.primary};font-size:1.5rem;font-family:'Courier New',monospace;margin-bottom:15px;">Загрузка...</div>
        <input type="number" id="mathInput" placeholder="Введите ответ" autocomplete="off" style="width:100%;padding:12px;border-radius:8px;border:1px solid ${CONFIG.colors.primary}55;background:${CONFIG.colors.bg};color:#fff;font-size:1.2rem;text-align:center;margin:15px 0;outline:none;">
        <div style="display:flex;gap:10px;justify-content:center;">
            <button id="mathRefresh" style="background:rgba(255,255,255,0.05);border:1px solid ${CONFIG.colors.primary}55;color:#ccc;padding:10px 20px;border-radius:8px;cursor:pointer;transition:0.3s;">🔄 Обновить</button>
            <button id="mathSubmit" style="background:${CONFIG.colors.primary};color:#0b0e14;border:none;padding:10px 30px;border-radius:40px;font-size:1.1rem;font-weight:600;cursor:pointer;transition:0.3s;">Войти</button>
        </div>
        <div id="mathError" style="color:${CONFIG.colors.error};margin-top:10px;font-size:0.9rem;min-height:1.5em;"></div>
    `;

    overlay.appendChild(box);
    document.body.prepend(overlay);

    const mathQuestion = document.getElementById('mathQuestion');
    const mathInput = document.getElementById('mathInput');
    const submitBtn = document.getElementById('mathSubmit');
    const refreshBtn = document.getElementById('mathRefresh');
    const errorEl = document.getElementById('mathError');

    mathQuestion.textContent = generateMath();

    function refreshMath() {
        mathQuestion.textContent = generateMath();
        mathInput.value = '';
        errorEl.textContent = '';
        mathInput.focus();
    }

    function checkMath() {
        if (!checkHoneypot()) { errorEl.textContent = '🚫 Доступ запрещён.'; return; }
        const userAnswer = parseInt(mathInput.value);
        if (isNaN(userAnswer)) { errorEl.textContent = '❌ Введите число'; return; }
        if (userAnswer !== mathCorrect) { errorEl.textContent = '❌ Неверно, попробуйте снова'; refreshMath(); return; }
        localStorage.setItem('captchaPassed', 'true');
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 500);
    }

    refreshBtn.addEventListener('click', refreshMath);
    submitBtn.addEventListener('click', checkMath);
    mathInput.addEventListener('keydown', e => { if (e.key === 'Enter') checkMath(); });
    mathInput.addEventListener('paste', e => { e.preventDefault(); errorEl.textContent = '⚠️ Вставка запрещена'; });
    overlay.addEventListener('click', e => { if (e.target === overlay) mathInput.focus(); });
    mathInput.focus();

    if (!checkUserAgent() || !checkBotBehavior()) {
        errorEl.textContent = '🚫 Доступ запрещён.';
        mathInput.disabled = true;
        submitBtn.disabled = true;
    }
})();

// ============================================================
// 2. ПОДСВЕТКА АКТИВНОЙ СТРАНИЦЫ
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const links = document.querySelectorAll('.menu a');
    const current = window.location.pathname.split('/').pop() || 'index.html';
    links.forEach(link => { if (link.getAttribute('href') === current) link.classList.add('active'); });
});

// ============================================================
// 3. КАПЧА ФОРМЫ
// ============================================================
const FormCaptcha = (function() {
    const canvas = document.getElementById('formCaptchaCanvas');
    const input = document.getElementById('formCaptchaInput');
    const errorEl = document.getElementById('formCaptchaError');
    if (!canvas || !input) return null;

    const CFG = { length: 5, colors: { bg:'#1a1f2a', primary:'#f5a623', secondary:'#8af0ff' }};

    function gen() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let r = '';
        for (let i = 0; i < CFG.length; i++) r += chars[Math.floor(Math.random() * chars.length)];
        return r;
    }

    function randCol(a) { return (Math.random() > 0.5 ? CFG.colors.primary : CFG.colors.secondary) + a; }

    function draw(text) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.fillStyle = CFG.colors.bg; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 80; i++) {
            ctx.fillStyle = randCol('33');
            ctx.beginPath(); ctx.arc(Math.random()*w, Math.random()*h, Math.random()*1.5, 0, Math.PI*2); ctx.fill();
        }
        for (let i = 0; i < 4; i++) {
            ctx.strokeStyle = randCol('44'); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(Math.random()*w, Math.random()*h); ctx.lineTo(Math.random()*w, Math.random()*h); ctx.stroke();
        }
        const spacing = 30, startX = (w - text.length * spacing) / 2 + 15;
        text.split('').forEach((ch, i) => {
            ctx.save();
            ctx.translate(startX + i*spacing + (Math.random()-0.5)*6, h/2 + (Math.random()-0.5)*8);
            ctx.rotate((Math.random()-0.5)*0.5);
            ctx.font = `bold 28px "Courier New",monospace`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = randCol('ff');
            ctx.fillText(ch, 0, 0); ctx.restore();
        });
    }

    let current = gen(); draw(current);

    function refresh() { current = gen(); draw(current); input.value = ''; errorEl.textContent = ''; }
    canvas.addEventListener('click', refresh);
    input.addEventListener('paste', e => { e.preventDefault(); errorEl.textContent = '⚠️ Вставка запрещена'; });

    return {
        verify: function() {
            if (input.value.trim() !== current) { errorEl.textContent = '❌ Неверный код проверки'; refresh(); return false; }
            errorEl.textContent = ''; return true;
        }
    };
})();

// ============================================================
// 4. ФОРМА ОБРАТНОЙ СВЯЗИ (EmailJS)
// ============================================================
const EMAILJS_CONFIG = {
    publicKey: 'RAhvhHKbPdcnskHlX',
    serviceId: 'service_wusoujo',
    templateId: 'template_pcgdl8o'
};

(function loadEmailJS() {
    if (window.emailjs) return;
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    s.onload = () => emailjs.init(EMAILJS_CONFIG.publicKey);
    document.head.appendChild(s);
})();

const supportForm = document.getElementById('supportForm');
if (supportForm) {
    supportForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const btn = document.getElementById('submitBtn');
        const formMessage = document.getElementById('formMessage');

        if (FormCaptcha && !FormCaptcha.verify()) { formMessage.textContent = ''; return; }
        if (typeof emailjs === 'undefined') {
            formMessage.textContent = '❌ Сервис временно недоступен. Обновите страницу.';
            formMessage.style.color = '#ff6666'; return;
        }

        btn.disabled = true; btn.textContent = 'Отправка...'; formMessage.textContent = '';
        const templateParams = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            message: document.getElementById('msg').value
        };

        emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, templateParams)
            .then(() => {
                formMessage.textContent = '✅ Сообщение отправлено! Мы ответим вам на почту.';
                formMessage.style.color = '#44ddff';
                supportForm.reset();
                if (FormCaptcha) FormCaptcha.refresh && FormCaptcha.refresh();
            })
            .catch((err) => {
                formMessage.textContent = '❌ Ошибка отправки. Попробуйте позже.';
                formMessage.style.color = '#ff6666'; console.error('EmailJS error:', err);
            })
            .finally(() => { btn.disabled = false; btn.textContent = 'Отправить'; });
    });
}
