// ============================================================
// CONFIG READER — читает настройки из config.json
// ============================================================

const ConfigReader = (function() {
    const CONFIG_URL = 'https://gffrgoogle.github.io/portal-3-fan-edition/config.json';
    let config = null;
    let lastFetch = 0;
    const CACHE_TIME = 60000; // 1 минута

    async function loadConfig(force = false) {
        const now = Date.now();
        if (!force && config && (now - lastFetch) < CACHE_TIME) {
            return config;
        }

        try {
            const response = await fetch(CONFIG_URL + '?t=' + now, {
                cache: 'no-store'
            });
            if (!response.ok) throw new Error('Config load failed');

            config = await response.json();
            lastFetch = now;

            // Сохраняем в localStorage для офлайн-режима
            localStorage.setItem('p3_config_cache', JSON.stringify(config));
            localStorage.setItem('p3_config_time', now.toString());

            return config;
        } catch (e) {
            console.warn('Config fetch failed, using cache:', e);
            // Пробуем загрузить из кэша
            const cached = localStorage.getItem('p3_config_cache');
            if (cached) {
                config = JSON.parse(cached);
                return config;
            }
            return null;
        }
    }

    function getConfig() {
        return config;
    }

    function applySecuritySettings(cfg) {
        if (!cfg || !cfg.security) return;

        const sec = cfg.security;

        // Применяем настройки безопасности
        window.P3_SECURITY = {
            captchaEnabled: sec.captchaEnabled,
            mathCaptcha: sec.mathCaptcha,
            honeypotEnabled: sec.honeypotEnabled,
            devToolsBlock: sec.devToolsBlock,
            rightClickBlock: sec.rightClickBlock,
            copyBlock: sec.copyBlock,
            whiteList: sec.whiteList || [],
            blackList: sec.blackList || []
        };

        console.log('🔒 Security config applied');
    }

    function applyContentSettings(cfg) {
        if (!cfg || !cfg.content) return;

        const content = cfg.content;

        // Обновляем объявление
        const announcement = document.querySelector('.announcement');
        if (announcement && content.announcement) {
            announcement.textContent = content.announcement;
            announcement.style.color = content.announcementColor || '#ff4444';
        }

        // Обновляем версию
        const versionEl = document.querySelector('.version');
        if (versionEl && content.version) {
            versionEl.textContent = content.version;
        }

        // Обновляем ссылки
        const downloadBtn = document.querySelector('a[href="download.html"]');
        if (downloadBtn && content.downloadLink) {
            downloadBtn.href = content.downloadLink;
        }

        console.log('📝 Content config applied');
    }

    function applyThemeSettings(cfg) {
        if (!cfg || !cfg.theme) return;

        const theme = cfg.theme;
        const root = document.documentElement;

        if (theme.primaryColor) {
            root.style.setProperty('--primary', theme.primaryColor);
        }
        if (theme.bgColor) {
            root.style.setProperty('--bg', theme.bgColor);
        }
        if (theme.cardColor) {
            root.style.setProperty('--bg-card', theme.cardColor);
        }

        console.log('🎨 Theme config applied');
    }

    function incrementStat(statName) {
        if (!config || !config.stats) return;
        config.stats[statName] = (config.stats[statName] || 0) + 1;
        // Здесь можно добавить отправку на сервер
    }

    function addLog(message, type = 'info') {
        if (!config) return;
        if (!config.logs) config.logs = [];

        config.logs.unshift({
            time: new Date().toISOString(),
            message: message,
            type: type
        });

        // Ограничиваем до 100 записей
        if (config.logs.length > 100) {
            config.logs = config.logs.slice(0, 100);
        }
    }

    // Инициализация
    async function init() {
        await loadConfig();
        if (config) {
            applySecuritySettings(config);
            applyContentSettings(config);
            applyThemeSettings(config);
            incrementStat('visits');
            addLog('Страница загружена', 'success');
        }
    }

    return {
        init,
        loadConfig,
        getConfig,
        applySecuritySettings,
        applyContentSettings,
        applyThemeSettings,
        incrementStat,
        addLog
    };
})();

// Автозапуск
document.addEventListener('DOMContentLoaded', () => {
    ConfigReader.init();
});
