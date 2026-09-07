(() => {
    'use strict';
    const api = window.ReelFolioEnvironment;
    const bg = document.getElementById('bgLayer');
    if (!api || !bg || document.getElementById('reelfolio-environment-lab')) return;
    const direct = new URLSearchParams(location.search).get('lab') === 'environment';
    const STORAGE_KEY = 'reelfolio.environment-tree-draft.v3';
    const LEGACY_STORAGE_KEY = 'reelfolio.environment-original-draft.v2';
    let state = api.normalize({ ...api.defaults, ...window.ReelFolioBackground.getState() });
    let comparing = false;
    const requestedScene = new URLSearchParams(location.search).get('scene');
    let initialPreset = 'Original scene';
    if (requestedScene && requestedScene !== 'original' && Object.hasOwn(api.scenes, requestedScene)) {
        initialPreset = api.presetGroups[api.scenes[requestedScene].label][0];
        state = api.normalize({ ...api.defaults, ...api.presets[initialPreset] });
    }
    let assetStatus = '';
    const renderer = api.mount({ onAssetState(result) {
        assetStatus = result.error ? 'Could not load this tree texture. The previous scene is still visible; try selecting it again.'
            : result.loading ? 'Loading tree shadow…' : '';
        motionNote();
    } });
    const style = document.createElement('style');
    style.textContent = `
        :root[data-environment-paused] .bg-light-texture,
        :root[data-environment-paused] .bg-light-texture::before,
        :root[data-environment-paused] .bg-light-texture::after { animation-play-state:paused !important; }
    `;
    document.head.appendChild(style);
    const host = document.createElement('div');
    host.id = 'reelfolio-environment-lab';
    const shadow = host.attachShadow({ mode: 'open' });
    // Shadow DOM retargets inputs to the host; keep reel shortcuts from consuming
    // arrow keys, space, and typing while the user adjusts this controller.
    shadow.addEventListener('keydown', event => event.stopPropagation());
    const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    const titleCase = text => text[0].toUpperCase() + text.slice(1);
    function fieldMarkup([, key, label, type, max, step, unit]) {
        const id = `env-${key}`;
        const caption = `<span data-label="${key}">${label}</span>`;
        if (type === 'boolean') return `<label class="toggle" for="${id}">${caption}<input id="${id}" data-key="${key}" type="checkbox"></label>`;
        if (type === 'color') return `<label class="toggle" for="${id}">${caption}<input id="${id}" data-key="${key}" type="color"></label>`;
        if (Array.isArray(type)) return `<label class="select-row" for="${id}">${caption}<select id="${id}" data-key="${key}">${type.map(v => `<option value="${v}">${titleCase(v.replace('-', ' '))}</option>`).join('')}</select></label>`;
        return `<div class="field"><div class="row"><label for="${id}">${caption}</label><output for="${id}" data-output="${key}" data-unit="${unit}"></output></div><input id="${id}" data-key="${key}" type="range" min="${type}" max="${max}" step="${step}"></div>`;
    }
    const groupHints = {
        Light: 'Shared softness affects both layers. Set it to 0px to use only the separate Window softness and Foliage softness controls. Reset preserves the original appearance.',
        Window: 'Window softness blurs only the light/frame layer, not the foliage. Left-edge fade softens the entire left side. Bottom-left extension stays separate and does not stretch the contents.',
        Foliage: 'Foliage softness blurs only the foliage, not the window/frame. Tree studies keep a slightly softer distant layer for depth. Tree scale is relative to the viewport.',
        Placement: 'Flip mirrors the foliage, not the window. With it on, X offsets are measured from the right edge; with it off, from the left. Bottom offsets still move each layer up.',
        Motion: 'Two independently timed shadow layers create a gentle breeze. Travel, sway, duration, easing, and phase remain adjustable.'
    };
    const treeLabels = {
        windowShadowOpacity: 'Frame shadow opacity', foliageScale: 'Canopy scale', plantWidth: 'Canopy width', plantHeight: 'Canopy height',
        foliageShadowOpacity: 'Near shadow opacity', foliageDensity: 'Distant shadow opacity', foliageColor: 'Near shadow tint', stemColor: 'Distant shadow tint',
        leftLeafX: 'Near canopy X', leftLeafY: 'Near canopy bottom offset', rightLeafX: 'Far canopy X', rightLeafY: 'Far canopy bottom offset',
        leftOpacity: 'Near layer opacity', rightOpacity: 'Far layer opacity', leftRotation: 'Near canopy tilt', rightRotation: 'Far canopy tilt',
        rightMotionRatio: 'Far layer duration multiplier', leftDelay: 'Near motion phase offset', rightDelay: 'Far motion phase offset'
    };
    shadow.innerHTML = `
        <style>
            :host { display:block; color:#eee8df; font:12px/1.5 Inter,system-ui,sans-serif; color-scheme:dark; }
            * { box-sizing:border-box; }
            .content { padding:16px; }
            .eyebrow { color:#a6c5b3; text-transform:uppercase; letter-spacing:.14em; font-size:10px; margin:0 0 6px; }
            h3 { font-size:21px; font-weight:500; letter-spacing:-.04em; margin:0 0 6px; }
            p { color:#9da89f; margin:0 0 14px; font-size:11px; }
            label { color:#d6d9d1; }
            .row,.toggle { display:flex; align-items:center; justify-content:space-between; gap:12px; }
            .toggle { min-height:32px; }
            .select-row { display:grid; gap:6px; }
            select,textarea { width:100%; border:1px solid #3b4840; border-radius:9px; background:#1c2620; color:#f0eee7; padding:9px; font:inherit; }
            input[type=range] { width:100%; height:24px; accent-color:#b9d8bf; cursor:pointer; }
            input[type=checkbox] { accent-color:#b9d8bf; width:17px; height:17px; }
            input[type=color] { border:1px solid #46554b; background:#26352c; width:44px; height:30px; border-radius:8px; padding:3px; }
            output { color:#b9d8bf; font:11px ui-monospace,monospace; }
            details { border-top:1px solid #2c3830; margin-top:14px; padding-top:12px; }
            summary { font-size:13px; font-weight:600; cursor:pointer; padding:3px 0 10px; }
            .fields { display:grid; gap:12px; }
            .actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:10px 0; }
            button { min-height:36px; padding:8px 10px; border:1px solid #42584a; border-radius:10px; color:#e8eee5; background:linear-gradient(#2d4437,#1b2c23); box-shadow:inset 0 1px #ffffff0d,0 3px 7px #0003; font:inherit; cursor:pointer; }
            button:hover { border-color:#8bac94; }
            button[aria-pressed=true] { background:#444031; border-color:#c4b27e; }
            :focus-visible { outline:2px solid #c9e0b5; outline-offset:3px; }
            .status { min-height:32px; color:#bfdbc5; margin:10px 0 0; }
            .motion-note { padding:9px 11px; border-radius:9px; background:#ffffff08; }
            .sticky { position:sticky; top:0; z-index:2; padding:10px 0; background:#0e100ff5; }
            textarea { min-height:120px; resize:vertical; font-size:11px; }
            .scene-preview { position:relative; height:100px; overflow:hidden; margin:12px 0 8px; border-radius:10px; background:#d8c8ae; }
            .scene-preview[hidden] { display:none; }
            .scene-preview::before { content:''; position:absolute; inset:-5% 0; background:#352d24a6; mask:var(--preview-mask) 0 42% / 110% auto no-repeat; filter:blur(1.3px); scale:var(--preview-flip, 1) 1; }
            .scene-preview::after { content:''; position:absolute; inset:-40% -10%; background:linear-gradient(90deg,transparent 35%,#473c3150 35% 38%,transparent 38%),linear-gradient(transparent 50%,#473c3145 50% 53%,transparent 53%); transform:rotate(-17deg); filter:blur(2px); }
            .scene-caption { margin:8px 0 0; }
        </style>
        <section class="content" aria-label="Environment controls">
            <div class="eyebrow">Tree shadows · environment study</div>
            <h3>A little life outside</h3>
            <p>Keep the original, or explore 45 looks from five tree textures and nine light treatments. Nothing is published. Mobile stays shader-free.</p>
            <label class="select-row" for="environment-preset">Scene & treatment
                <select id="environment-preset"><option value="custom">Custom adjustments</option>${Object.entries(api.presetGroups).map(([group, names]) => `<optgroup label="${escape(group)}">${names.map(name => `<option value="${escape(name)}">${escape(name)}</option>`).join('')}</optgroup>`).join('')}</select>
            </label>
            <div class="scene-preview" role="img" aria-label="Selected tree shadow on a warm wall" hidden></div>
            <p class="scene-caption" data-scene-caption></p>
            <div class="sticky"><div class="actions">
                <button type="button" data-compare aria-pressed="false">Compare original</button>
                <button type="button" data-placement-reset>Reset placement</button>
            </div></div>
            <p class="motion-note" data-motion-note></p>
            ${Object.keys(groupHints).map((group, i) => `<details ${i < 2 ? 'open' : ''}><summary>${group}</summary><p>${groupHints[group]}</p><div class="fields">${api.fields.filter(f => f[0] === group).map(fieldMarkup).join('')}</div></details>`).join('')}
            <details><summary>Save & compare</summary>
                <p>Save a draft in this browser, or copy settings to share back here. Saving does not publish anything.</p>
                <div class="actions"><button type="button" data-save>Save draft</button><button type="button" data-load>Load draft</button><button type="button" data-copy>Copy settings</button><button type="button" data-reset>Reset study</button></div>
                <label class="select-row" for="environment-json">Settings JSON<textarea id="environment-json" spellcheck="false" placeholder="Paste copied settings here to restore them"></textarea></label>
                <div class="actions"><button type="button" data-import>Apply JSON</button></div>
            </details>
            <p class="status" role="status" aria-live="polite"></p>
        </section>`;
    document.body.appendChild(host);
    const inputs = [...shadow.querySelectorAll('[data-key]')];
    const preset = shadow.getElementById('environment-preset');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = matchMedia('(max-width: 600px)');
    const status = text => { shadow.querySelector('.status').textContent = text; };
    function motionNote() {
        shadow.querySelector('[data-motion-note]').textContent = assetStatus || (mobile.matches ? 'Hidden on mobile, as before. Use a desktop-width preview to tune the environment.'
            : reduced.matches ? 'Reduced motion is enabled on this device. The environment stays still.'
            : comparing ? 'Showing the untouched original. Your adjustments are kept; switch back or edit a control to continue.'
            : !state.lightEnabled ? 'Light and foliage are hidden. Turn them on in Light to preview adjustments.'
            : state.foliageMotion ? 'Breeze is running. The two layers move at different speeds; adjust travel and sway to taste.' : 'Motion is off. Showing the shadows still.');
    }
    function sync() {
        const tree = state.scene !== 'original';
        inputs.forEach(input => {
            const key = input.dataset.key;
            const value = state[key];
            if (input.type === 'checkbox') input.checked = value;
            else input.value = String(value);
            const output = shadow.querySelector(`[data-output="${input.dataset.key}"]`);
            if (output) output.textContent = tree && key === 'foliageScale' ? `${value / 10}%` : `${value}${output.dataset.unit}`;
            shadow.querySelector(`[data-label="${key}"]`).textContent = tree && treeLabels[key] || api.fields.find(f => f[1] === key)[2];
        });
        const scene = api.scenes[comparing ? 'original' : state.scene];
        const preview = shadow.querySelector('.scene-preview');
        preview.hidden = !scene.asset;
        preview.style.setProperty('--preview-flip', !comparing && state.foliageFlip ? '-1' : '1');
        if (scene.asset) preview.style.setProperty('--preview-mask', `url("${scene.asset}")`);
        else preview.style.removeProperty('--preview-mask');
        shadow.querySelector('[data-scene-caption]').textContent = scene.description;
        preset.querySelector('[value="custom"]').textContent = `${api.scenes[state.scene].label} · Custom adjustments`;
        shadow.querySelector('[data-compare]').setAttribute('aria-pressed', String(comparing));
        shadow.querySelector('[data-compare]').textContent = comparing ? 'Back to adjustments' : 'Compare original';
        motionNote();
    }
    let frame;
    function apply() {
        state = api.normalize(state);
        sync();
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            renderer.update(comparing ? api.defaults : state);
            window.dispatchEvent(new CustomEvent('reelfolio:environment-mode', { detail: { enabled: true } }));
        });
    }
    inputs.forEach(input => input.addEventListener(input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input', () => {
        state[input.dataset.key] = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
        comparing = false;
        preset.value = 'custom';
        apply();
    }));
    preset.addEventListener('change', () => {
        if (!Object.hasOwn(api.presets, preset.value)) return;
        state = { ...api.defaults, ...api.presets[preset.value] };
        comparing = false;
        apply();
        status('Scene selected. All parameters remain editable.');
    });
    shadow.querySelector('[data-compare]').addEventListener('click', () => { comparing = !comparing; apply(); });
    shadow.querySelector('[data-placement-reset]').addEventListener('click', () => {
        const base = state.scene === 'original' ? api.defaults : { ...api.defaults, ...api.presets[api.presetGroups[api.scenes[state.scene].label][0]] };
        for (const [, key] of api.fields.filter(field => field[0] === 'Placement')) state[key] = base[key];
        comparing = false; preset.value = 'custom'; apply(); status('This scene’s starting placement restored. Lighting is unchanged.');
    });
    shadow.querySelector('[data-save]').addEventListener('click', () => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, renderer: 'window-tree', settings: state })); status('Draft saved in this browser only.'); }
        catch { status('Browser storage is unavailable. Use Copy settings instead.'); }
    });
    function restore(raw) {
        const parsed = JSON.parse(raw);
        const settings = parsed?.settings || parsed;
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)
            || !(api.fields.some(([, key]) => Object.hasOwn(settings, key)) || Object.hasOwn(settings, 'windowBottomLeftFade'))) throw new Error('Invalid settings');
        if (parsed.version != null && ![2, 3].includes(parsed.version)) throw new Error('Unsupported version');
        if (parsed.renderer != null && !['original-css', 'window-tree'].includes(parsed.renderer)) throw new Error('Different renderer');
        state = api.normalize(settings);
        comparing = false;
        preset.value = 'custom'; apply();
    }
    shadow.querySelector('[data-load]').addEventListener('click', () => {
        try { const draft = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY); if (!draft) { status('No saved draft yet.'); return; } restore(draft); status('Saved draft restored.'); }
        catch { status('Could not load the draft. Your current settings are unchanged.'); }
    });
    shadow.querySelector('[data-copy]').addEventListener('click', async () => {
        const json = JSON.stringify({ version: 3, renderer: 'window-tree', settings: state }, null, 2);
        shadow.getElementById('environment-json').value = json;
        try { await navigator.clipboard.writeText(json); status('Settings copied. You can paste them back into this chat.'); }
        catch { status('Clipboard unavailable. Copy the JSON from the box below.'); }
    });
    shadow.querySelector('[data-import]').addEventListener('click', () => {
        try { restore(shadow.getElementById('environment-json').value); status('Settings applied.'); }
        catch { status('Use tree-study settings (version 3) or your original-scene settings (version 2).'); }
    });
    shadow.querySelector('[data-reset]').addEventListener('click', () => { state = { ...api.defaults }; comparing = false; preset.value = 'Original scene'; apply(); status('Original scene restored. Saved draft is untouched.'); });
    window.addEventListener('reelfolio:background-settings', event => {
        if (event.detail.source === 'environment') return;
        cancelAnimationFrame(frame);
        state = api.normalize({ ...state, ...event.detail.state });
        comparing = false; preset.value = 'custom'; apply();
    });
    reduced.addEventListener('change', motionNote);
    mobile.addEventListener('change', motionNote);
    window.ReelFolioLab?.register({ id: 'environment', title: 'Environment', hint: 'Original scene & tree-shadow studies', width: 370, height: Math.min(860, innerHeight - 24), host, autoOpen: direct });
    preset.value = initialPreset;
    apply();
})();
