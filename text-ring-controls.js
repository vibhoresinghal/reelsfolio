(() => {
    'use strict';
    if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && location.protocol !== 'file:') return;

    const defaults = { font: 'Inter', weight: '600', italic: false, size: 8.4, spacing: 2.4, blur: 0.4, speed: 36, reverse: false };
    const fonts = {
        Inter: "'Inter', sans-serif",
        Momo: "'Momo Trust Display', sans-serif",
        Georgia: 'Georgia, serif',
        Courier: "'Courier New', monospace",
        Trebuchet: "'Trebuchet MS', sans-serif"
    };
    const key = 'rf_ring_studio';
    let state = { ...defaults };
    try {
        const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
        if (saved) {
            if (Object.hasOwn(fonts, saved.font)) state.font = saved.font;
            if (['300', '400', '500', '600', '700'].includes(saved.weight)) state.weight = saved.weight;
            for (const [name, min, max] of [['size', 6, 14], ['spacing', 0, 5], ['blur', 0, 3], ['speed', 0, 90]]) {
                if (typeof saved[name] === 'number' && Number.isFinite(saved[name])) state[name] = Math.max(min, Math.min(max, saved[name]));
            }
            state.italic = saved.italic === true;
            state.reverse = saved.reverse === true;
        }
    } catch (_) {}

    const uiStyle = document.createElement('style');
    uiStyle.textContent = `
        #ring-studio { position: fixed; left: max(12px, env(safe-area-inset-left)); bottom: calc(84px + env(safe-area-inset-bottom)); z-index: 20000; color: #eeede8; font: 12px/1.4 Inter, sans-serif; text-align: left; }
        #ring-studio *, #ring-studio *::before { box-sizing: border-box; }
        #ring-studio [hidden] { display: none !important; }
        #ring-studio button, #ring-studio select, #ring-studio input { font: inherit; color: inherit; touch-action: manipulation; }
        #ring-studio button { min-height: 44px; padding: 8px 12px; background: #292b2d; border: 1px solid #454749; border-radius: 9px; cursor: pointer; }
        #ring-studio button:hover { background: #36383a; }
        #ring-studio :focus-visible { outline: 2px solid #ddc59f; outline-offset: 2px; }
        #ring-studio-panel { width: min(330px, calc(100vw - 24px)); max-height: min(580px, 65svh); overflow-y: auto; overscroll-behavior: contain; padding: 14px; margin-bottom: 8px; background: #1b1d1ff7; border: 1px solid #ffffff20; border-radius: 14px; box-shadow: 0 12px 40px #0008; }
        #ring-studio header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
        #ring-studio strong { font-size: 15px; font-weight: 600; }
        #ring-studio p { margin: 0 0 12px; color: #b6b8ba; }
        #ring-studio .rs-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
        #ring-studio label { display: block; color: #c4c5c6; }
        #ring-studio select { width: 100%; min-height: 44px; margin-top: 5px; padding: 8px; border: 1px solid #454749; border-radius: 8px; background: #242628; font-size: 16px; }
        #ring-studio .rs-slider { margin-top: 4px; }
        #ring-studio .rs-label { display: flex; justify-content: space-between; gap: 8px; }
        #ring-studio output { color: #ddc59f; font-variant-numeric: tabular-nums; }
        #ring-studio input[type=range] { width: 100%; height: 36px; margin: 0; accent-color: #ddc59f; }
        #ring-studio .rs-check { display: flex; gap: 8px; align-items: center; min-height: 44px; }
        #ring-studio input[type=checkbox] { width: 17px; height: 17px; accent-color: #ddc59f; }
        #ring-studio .rs-actions { display: flex; gap: 8px; margin-top: 10px; }
        #ring-studio .rs-actions button { flex: 1; }
        #ring-studio #rs-status { margin: 8px 0 0; font-size: 11px; }
        body.ring-studio-preview .play-overlay-btn .play-with-sound-ring { display: block !important; }
    `;
    const previewStyle = document.createElement('style');
    document.head.append(uiStyle, previewStyle);

    const host = document.createElement('aside');
    host.id = 'ring-studio';
    host.setAttribute('aria-label', 'Text ring design controls');
    const slider = (name, label, min, max, step) => `<label class="rs-slider" for="rs-${name}"><span class="rs-label">${label}<output id="rs-${name}-value" for="rs-${name}"></output></span><input id="rs-${name}" data-setting="${name}" type="range" min="${min}" max="${max}" step="${step}"></label>`;
    host.innerHTML = `
        <section id="ring-studio-panel" aria-label="Ring studio settings" hidden>
            <header><strong>Ring studio</strong><button type="button" id="rs-close" aria-label="Close ring studio">Close</button></header>
            <p>Local preview only. Pause the video to see the ring while tuning.</p>
            <div class="rs-row">
                <label for="rs-font">Font<select id="rs-font" data-setting="font"><option value="Inter">Inter</option><option value="Momo">Momo Display</option><option value="Georgia">Georgia</option><option value="Courier">Courier</option><option value="Trebuchet">Trebuchet</option></select></label>
                <label for="rs-weight">Weight<select id="rs-weight" data-setting="weight"><option value="300">Light</option><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option></select></label>
            </div>
            <div class="rs-row"><label class="rs-check"><input type="checkbox" data-setting="italic">Italic</label><label class="rs-check"><input type="checkbox" data-setting="reverse">Reverse rotation</label></div>
            ${slider('size', 'Letter size', 6, 14, 0.1)}
            ${slider('spacing', 'Letter spacing', 0, 5, 0.1)}
            ${slider('blur', 'Text blur', 0, 3, 0.1)}
            ${slider('speed', 'Seconds per rotation', 0, 90, 1)}
            <p>Higher seconds = slower. Zero pauses rotation. Fonts depend on what is installed; some weights may be simulated.</p>
            <div class="rs-actions"><button type="button" id="rs-reset">Reset</button><button type="button" id="rs-copy">Copy CSS</button></div>
            <p id="rs-status" role="status">Changes stay in this browser tab, not in the saved design.</p>
        </section>
        <button type="button" id="rs-toggle" aria-expanded="false" aria-controls="ring-studio-panel">Ring studio</button>`;
    document.body.append(host);
    const panel = host.querySelector('#ring-studio-panel');
    const toggle = host.querySelector('#rs-toggle');
    const status = host.querySelector('#rs-status');

    function css() {
        return `.play-overlay-btn .play-with-sound-ring text {
    font-family: ${fonts[state.font]};
    font-weight: ${state.weight};
    font-style: ${state.italic ? 'italic' : 'normal'};
    font-size: ${state.size}px;
    letter-spacing: ${state.spacing}px;
}
.play-overlay-btn .play-with-sound-ring {
    filter: blur(${state.blur}px);
    animation-duration: ${state.speed || 36}s;
    animation-direction: ${state.reverse ? 'reverse' : 'normal'};
    animation-play-state: ${state.speed === 0 ? 'paused' : 'running'};
}`;
    }
    function apply() {
        previewStyle.textContent = css();
        for (const name of ['size', 'spacing', 'blur', 'speed']) {
            host.querySelector('#rs-' + name + '-value').textContent = name === 'speed' ? (state.speed === 0 ? 'Paused' : state.speed + ' s') : state[name] + ' px';
        }
        try { sessionStorage.setItem(key, JSON.stringify(state)); } catch (_) {}
    }
    function populate() {
        for (const input of host.querySelectorAll('[data-setting]')) {
            if (input.type === 'checkbox') input.checked = state[input.dataset.setting];
            else input.value = state[input.dataset.setting];
        }
        apply();
    }
    function setOpen(open) {
        panel.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('ring-studio-preview', open);
        (open ? host.querySelector('#rs-font') : toggle).focus({ preventScroll: true });
    }
    toggle.onclick = () => setOpen(panel.hidden);
    host.querySelector('#rs-close').onclick = () => setOpen(false);
    host.addEventListener('input', event => {
        const input = event.target;
        if (!input.dataset.setting) return;
        state[input.dataset.setting] = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
        apply();
        status.textContent = 'Preview updated. The saved design is unchanged.';
    });
    // Keep tuning gestures from reaching the reel navigation handlers.
    for (const type of ['click', 'pointerdown', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'wheel']) host.addEventListener(type, event => event.stopPropagation());
    host.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); setOpen(false); }
    });
    host.querySelector('#rs-reset').onclick = () => {
        state = { ...defaults };
        populate();
        status.textContent = 'Original ring settings restored.';
    };
    host.querySelector('#rs-copy').onclick = async () => {
        try { await navigator.clipboard.writeText(css()); status.textContent = 'CSS copied. These settings have not been applied to the saved design.'; }
        catch (_) { status.textContent = 'Clipboard unavailable. You can share the values shown here instead.'; }
    };
    populate();
})();
