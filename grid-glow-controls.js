/* Local tuning only. Export settings to make a chosen look permanent. */
(() => {
    'use strict';
    const host = location.hostname;
    const local = location.protocol === 'file:' || host === 'localhost' || host.endsWith('.localhost') ||
        host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local') ||
        /^192\.168\./.test(host) || /^10\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    const api = window.ReelsfolioGridGlow;
    if (!local || !api || document.getElementById('grid-glow-studio')) return;

    const storageKey = 'reelsfolio:grid-glow-studio:v1';
    try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
        if (saved) api.update(saved);
    } catch (_) { /* Storage is optional, including in private browsing. */ }

    const lightFields = [
        ['radiusPx', 'Radius', 40, 400, 2, 'px', 1],
        ['brightness', 'Brightness', 0, 100, 1, '%', 100],
        ['softness', 'Feathering', 0, 100, 1, '%', 1],
        ['lineWidthPx', 'Line thickness', 0.5, 3, 0.05, 'px', 1]
    ];
    const motionFields = [
        ['followDelayMs', 'Follow delay', 0, 200, 5, 'ms', 1],
        ['maxLagPx', 'Maximum trail', 0, 200, 2, 'px', 1],
        ['fadeInMs', 'Fade in', 0, 1200, 10, 'ms', 1],
        ['fadeOutMs', 'Fade out', 0, 1200, 10, 'ms', 1]
    ];
    const fields = [...lightFields, ...motionFields];
    const fieldMap = new Map(fields.map(field => [field[0], field]));
    const row = ([key, label, min, max, step, unit]) => `
        <div class="gg-field">
            <label for="gg-${key}">${label}</label>
            <div class="gg-field-inputs">
                <input id="gg-${key}" type="range" min="${min}" max="${max}" step="${step}" data-setting="${key}">
                <input type="number" min="${min}" max="${max}" step="${step}" data-number="${key}" aria-label="${label} in ${unit}">
                <span class="gg-unit">${unit}</span>
            </div>
        </div>`;

    const style = document.createElement('style');
    style.textContent = `
        #grid-glow-studio {
            position: fixed; left: 16px; bottom: 16px; z-index: 30000;
            width: min(308px, calc(100vw - 32px)); color: #e5e3db;
            font-family: 'Inter', sans-serif; font-size: 12px; line-height: 1.4;
            text-align: left; letter-spacing: normal; pointer-events: auto;
        }
        #grid-glow-studio * { box-sizing: border-box; }
        #grid-glow-studio [hidden] { display: none !important; }
        #grid-glow-studio button, #grid-glow-studio input, #grid-glow-studio textarea { font: inherit; }
        #grid-glow-studio button {
            border: 1px solid #ffffff16; border-radius: 9px; padding: 8px 11px;
            background: #30312c; color: #e5e3db; cursor: pointer; min-height: 34px;
            box-shadow: inset 0 1px 0 #ffffff08;
        }
        #grid-glow-studio button:hover { background: #3c3c34; }
        #grid-glow-studio button:active { transform: translateY(1px); background: #232520; }
        #grid-glow-studio :focus-visible { outline: 2px solid #c9b88d; outline-offset: 3px; }
        #grid-glow-studio .gg-panel {
            overflow: hidden; border-radius: 16px; border: 1px solid #ffffff16;
            background: linear-gradient(150deg, #292b28, #191c19 65%);
            box-shadow: 0 18px 52px #0006, inset 0 1px 0 #ffffff08;
        }
        #grid-glow-studio .gg-header {
            display: flex; align-items: center; justify-content: space-between;
            gap: 12px; padding: 13px 14px 11px; border-bottom: 1px solid #ffffff0c;
        }
        #grid-glow-studio h2 { margin: 0; font-size: 14px; line-height: 1.3; font-weight: 600; color: #f0eee7; }
        #grid-glow-studio .gg-eyebrow { margin-top: 3px; color: #9c9e93; font-size: 10px; }
        #grid-glow-studio .gg-close { padding: 0; width: 30px; min-height: 30px; display: grid; place-items: center; }
        #grid-glow-studio .gg-body {
            max-height: min(570px, calc(100svh - 190px)); overflow-y: auto;
            overscroll-behavior: contain; scrollbar-width: thin;
            scrollbar-color: #5d6053 transparent; padding: 12px 14px 4px;
            touch-action: pan-y;
        }
        #grid-glow-studio .gg-toggles { display: flex; flex-wrap: wrap; gap: 10px 14px; margin-bottom: 13px; }
        #grid-glow-studio .gg-toggle { display: flex; gap: 6px; align-items: center; cursor: pointer; color: #c7c9be; font-size: 11px; }
        #grid-glow-studio input[type="checkbox"] { accent-color: #c6b78e; width: 13px; height: 13px; margin: 0; }
        #grid-glow-studio h3 { margin: 11px 0 9px; color: #b8b099; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.1px; }
        #grid-glow-studio .gg-field { margin-bottom: 10px; }
        #grid-glow-studio .gg-field > label { color: #c9cbc3; font-size: 11px; display: block; margin-bottom: 3px; }
        #grid-glow-studio .gg-field-inputs { display: grid; grid-template-columns: minmax(0, 1fr) 49px 19px; align-items: center; gap: 8px; }
        #grid-glow-studio input[type="range"] {
            appearance: none; width: 100%; height: 20px; padding: 0; margin: 0;
            background: transparent; cursor: ew-resize; accent-color: #c6b78e;
        }
        #grid-glow-studio input[type="range"]::-webkit-slider-runnable-track { height: 3px; background: #4a4d42; border-radius: 3px; }
        #grid-glow-studio input[type="range"]::-webkit-slider-thumb {
            appearance: none; width: 12px; height: 12px; margin-top: -4.5px;
            background: #d7c9a6; border: 1px solid #ece3ca; border-radius: 50%; box-shadow: 0 1px 4px #0005;
        }
        #grid-glow-studio input[type="range"]::-moz-range-track { height: 3px; background: #4a4d42; border-radius: 3px; }
        #grid-glow-studio input[type="range"]::-moz-range-thumb { width: 11px; height: 11px; background: #d7c9a6; border: 1px solid #ece3ca; border-radius: 50%; }
        #grid-glow-studio input[type="number"] {
            width: 49px; min-width: 0; height: 24px; padding: 3px 4px; text-align: right;
            background: #121612; color: #deded3; border: 1px solid #ffffff12;
            border-radius: 5px; font-size: 10px; font-variant-numeric: tabular-nums;
            appearance: textfield; user-select: text; -webkit-user-select: text;
        }
        #grid-glow-studio input[type="number"]::-webkit-inner-spin-button,
        #grid-glow-studio input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        #grid-glow-studio .gg-unit { color: #858a7e; font-size: 10px; }
        #grid-glow-studio .gg-colors { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 5px 0 14px; }
        #grid-glow-studio .gg-color { display: flex; align-items: center; gap: 7px; font-size: 11px; color: #c9cbc3; cursor: pointer; }
        #grid-glow-studio input[type="color"] { width: 28px; height: 28px; padding: 2px; border: 1px solid #ffffff20; background: #1c201b; border-radius: 7px; cursor: pointer; }
        #grid-glow-studio .gg-color small { display: block; color: #8e9587; font-size: 9px; font-variant-numeric: tabular-nums; }
        #grid-glow-studio .gg-hint { margin: 3px 0 10px; color: #959b8e; font-size: 10px; line-height: 1.5; }
        #grid-glow-studio .gg-footer { padding: 10px 14px 12px; border-top: 1px solid #ffffff0c; }
        #grid-glow-studio .gg-actions { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
        #grid-glow-studio .gg-copy { color: #f0e5c9; background: #494536; border-color: #c1ad772f; }
        #grid-glow-studio .gg-copy:hover { background: #56503d; }
        #grid-glow-studio .gg-status { color: #a3a89a; font-size: 10px; margin: 8px 0 0; min-height: 14px; }
        #grid-glow-studio textarea { width: 100%; height: 120px; margin-top: 10px; padding: 8px; background: #101510; color: #deded3; border: 1px solid #ffffff20; border-radius: 7px; user-select: text; -webkit-user-select: text; resize: vertical; font-size: 10px; }
        #grid-glow-studio .gg-launcher { box-shadow: 0 4px 20px #0004; }
        @media (max-width: 600px) { #grid-glow-studio { display: none; } }
    `;
    document.head.appendChild(style);

    const root = document.createElement('aside');
    root.id = 'grid-glow-studio';
    root.setAttribute('data-grid-glow-studio', '');
    root.setAttribute('aria-label', 'Grid glow controller');
    root.innerHTML = `
        <button class="gg-launcher" type="button" aria-expanded="true" aria-controls="gg-panel" hidden>Grid glow</button>
        <section class="gg-panel" id="gg-panel" aria-labelledby="gg-title">
            <header class="gg-header">
                <div><h2 id="gg-title">Grid glow</h2><p class="gg-eyebrow">Local preview controls</p></div>
                <button class="gg-close" type="button" aria-label="Minimize grid glow controller"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m2 2 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>
            </header>
            <div class="gg-body">
                <div class="gg-toggles">
                    <label class="gg-toggle"><input type="checkbox" data-enabled>Glow enabled</label>
                    <label class="gg-toggle"><input type="checkbox" data-pin>Keep preview pinned</label>
                </div>
                <p class="gg-hint">Move over the mat to preview. The light holds while you adjust these controls.</p>
                <h3>Light</h3>
                ${lightFields.map(row).join('')}
                <div class="gg-colors">
                    <label class="gg-color"><input type="color" data-color="coreColor"><span>Center<small data-hex="coreColor"></small></span></label>
                    <label class="gg-color"><input type="color" data-color="edgeColor"><span>Outer glow<small data-hex="edgeColor"></small></span></label>
                </div>
                <h3>Motion</h3>
                ${motionFields.map(row).join('')}
                <p class="gg-hint">Zero follow delay tracks directly. Reduced-motion preferences still take priority.</p>
            </div>
            <footer class="gg-footer">
                <div class="gg-actions"><button class="gg-copy" type="button">Copy settings</button><button class="gg-reset" type="button">Reset</button></div>
                <p class="gg-status" role="status" aria-live="polite">Your preview is remembered in this tab.</p>
                <textarea class="gg-export" aria-label="Grid glow settings to copy" readonly hidden></textarea>
            </footer>
        </section>`;
    document.body.appendChild(root);

    const panel = root.querySelector('.gg-panel');
    const launcher = root.querySelector('.gg-launcher');
    const pin = root.querySelector('[data-pin]');
    const enabled = root.querySelector('[data-enabled]');
    const status = root.querySelector('.gg-status');
    const exportBox = root.querySelector('.gg-export');

    function sync(settings = api.getSettings()) {
        for (const [key, , , , , , scale] of fields) {
            const value = Number((settings[key] * scale).toFixed(2));
            root.querySelector(`[data-setting="${key}"]`).value = value;
            root.querySelector(`[data-number="${key}"]`).value = value;
        }
        for (const key of ['coreColor', 'edgeColor']) {
            root.querySelector(`[data-color="${key}"]`).value = settings[key];
            root.querySelector(`[data-hex="${key}"]`).textContent = settings[key];
        }
        enabled.checked = settings.enabled;
    }
    function update(patch) {
        const settings = api.update(patch);
        sync(settings);
        exportBox.hidden = true;
        try { sessionStorage.setItem(storageKey, JSON.stringify(settings)); } catch (_) {}
    }
    function setOpen(open) {
        panel.hidden = !open;
        launcher.hidden = open;
        launcher.setAttribute('aria-expanded', String(open));
        if (!open) { pin.checked = false; api.setPreviewPinned(false); launcher.focus({ preventScroll: true }); }
        else { api.setPreviewPinned(true); root.querySelector('.gg-close').focus({ preventScroll: true }); }
    }
    panel.addEventListener('pointerenter', () => api.setPreviewPinned(true));
    panel.addEventListener('pointerleave', () => api.setPreviewPinned(pin.checked));
    panel.addEventListener('focusin', () => api.setPreviewPinned(true));
    panel.addEventListener('focusout', event => {
        if (!panel.contains(event.relatedTarget) && !panel.matches(':hover')) api.setPreviewPinned(pin.checked);
    });
    root.querySelector('.gg-close').addEventListener('click', () => setOpen(false));
    launcher.addEventListener('click', () => setOpen(true));
    pin.addEventListener('change', () => api.setPreviewPinned(pin.checked || panel.matches(':hover')));
    enabled.addEventListener('change', () => update({ enabled: enabled.checked }));
    root.addEventListener('input', event => {
        const target = event.target;
        const key = target.dataset.setting;
        if (key && fieldMap.has(key)) update({ [key]: Number(target.value) / fieldMap.get(key)[6] });
        if (target.dataset.color) update({ [target.dataset.color]: target.value });
    });
    root.addEventListener('change', event => {
        const key = event.target.dataset.number;
        if (!key || !fieldMap.has(key)) return;
        if (event.target.value === '' || !Number.isFinite(Number(event.target.value))) { sync(); return; }
        update({ [key]: Number(event.target.value) / fieldMap.get(key)[6] });
    });
    root.querySelector('.gg-reset').addEventListener('click', () => {
        sync(api.reset());
        exportBox.hidden = true;
        try { sessionStorage.removeItem(storageKey); } catch (_) {}
        status.textContent = 'Original glow settings restored.';
    });
    root.querySelector('.gg-copy').addEventListener('click', async () => {
        const payload = JSON.stringify({ gridGlow: api.getSettings() }, null, 2);
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(payload);
            exportBox.hidden = true;
            status.textContent = 'Copied. Paste the settings into our chat.';
        } catch (_) {
            exportBox.hidden = false;
            exportBox.value = payload;
            exportBox.focus({ preventScroll: true });
            exportBox.select();
            status.textContent = 'Settings selected below. Copy and paste them into our chat.';
        }
    });
    // Keep sliders, text fields and panel scrolling out of reel navigation.
    for (const type of ['pointerdown', 'pointerup', 'pointermove', 'click', 'dblclick', 'keydown', 'keyup', 'wheel', 'touchstart', 'touchmove', 'touchend']) {
        root.addEventListener(type, event => event.stopPropagation(), { passive: true });
    }
    sync();
})();
