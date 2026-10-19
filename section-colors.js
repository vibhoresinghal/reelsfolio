/* Per-video palettes. Motion and foliage settings remain shared. */
((scope) => {
    'use strict';
    const STORAGE_KEY = 'reelfolio.section-colors.v1';
    const validHex = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    function hexToHsv(hex) {
        const rgb = (validHex(hex) ? hex : '#091a12').slice(1).match(/../g).map(n => parseInt(n, 16) / 255);
        const [r, g, b] = rgb, max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
        let hue = 0;
        if (delta) hue = (max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60;
        return { hue: (hue + 360) % 360, saturation: max ? delta / max * 100 : 0, brightness: max * 100 };
    }
    function hsvToRgb({ hue, saturation, brightness }) {
        const h = ((hue % 360) + 360) % 360 / 60, s = clamp(saturation, 0, 100) / 100, v = clamp(brightness, 0, 100) / 100;
        const c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c;
        const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h)];
        return rgb.map(n => n + m);
    }
    const hsvToHex = value => '#' + hsvToRgb(value).map(n => Math.round(n * 255).toString(16).padStart(2, '0')).join('');
    // Partial overrides let untouched sections inherit future shared adjustments.
    function normalize(value) {
        const safe = {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) return safe;
        const limits = { hue: 360, saturation: 100, brightness: 100, matBrightness: 100, glowBrightness: 200, glowSaturation: 250 };
        for (const [key, max] of Object.entries(limits)) {
            if (Object.hasOwn(value, key) && typeof value[key] === 'number' && Number.isFinite(value[key])) safe[key] = clamp(value[key], 0, max);
        }
        for (const key of ['matColor', 'glowColor']) {
            if (Object.hasOwn(value, key) && validHex(value[key])) safe[key] = value[key].toLowerCase();
        }
        if (value.glowColor === null) safe.glowColor = null;
        return safe;
    }
    function palette(baseColor, override, shared = {}) {
        const safe = normalize(override);
        const result = { ...hexToHsv(baseColor), matColor: '#f2dbcf', matBrightness: shared.matBrightness ?? 29,
            glowColor: null, glowBrightness: 100, glowSaturation: shared.saturation ?? 250, ...safe };
        return { ...result, backgroundColor: hsvToHex(result) };
    }
    function glowTint(hex) {
        const rgb = hex.slice(1).match(/../g).map(n => parseInt(n, 16) / 255);
        const peak = Math.max(...rgb, .035);
        return '#' + rgb.map(n => Math.round((n / peak) ** 1.25 * .72 * 255).toString(16).padStart(2, '0')).join('');
    }
    const hexRgb = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16) / 255);
    const rgbHex = rgb => '#' + rgb.map(n => Math.round(clamp(n, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
    const linear = n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
    const srgb = n => n <= .0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - .055;
    // OKLab keeps lightness independent of hue. Rotate the completed lighting,
    // not just its base swatch, so shadows and highlights keep the intro's balance.
    function toLab(rgb) {
        const [r, g, b] = rgb.map(linear);
        const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
        const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
        const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
        return [.2104542553 * l + .793617785 * m - .0040720468 * s,
            1.9779984951 * l - 2.428592205 * m + .4505937099 * s,
            .0259040371 * l + .7827717662 * m - .808675766 * s];
    }
    function labToLinear([L, a, b]) {
        const l = (L + .3963377774 * a + .2158037573 * b) ** 3;
        const m = (L - .1055613458 * a - .0638541728 * b) ** 3;
        const s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
        return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
            -.0041960863 * l - .7034186147 * m + 1.707614701 * s];
    }
    function rotateHue(rgb, angle) {
        if (Math.abs(angle) < .00001) return [...rgb];
        const [L, a, b] = toLab(rgb), c = Math.cos(angle), s = Math.sin(angle);
        const x = a * c - b * s, y = a * s + b * c;
        const inGamut = color => color.every(n => n >= 0 && n <= 1);
        let color = labToLinear([L, x, y]);
        if (!inGamut(color)) {
            // Reduce chroma only when the display cannot represent the new hue.
            // Channel clipping would change both hue and perceived brightness.
            let low = 0, high = 1;
            for (let i = 0; i < 8; i++) {
                const mid = (low + high) / 2;
                if (inGamut(labToLinear([L, x * mid, y * mid]))) low = mid; else high = mid;
            }
            color = labToLinear([L, x * low, y * low]);
        }
        return color.map(n => clamp(srgb(n), 0, 1));
    }
    function matchedPalette(reference, hue) {
        // Keep the existing hue slider and video hue families. Only their light
        // and dark balance changes; the intro remains an exact identity operation.
        const source = toLab(hsvToRgb(reference));
        const target = toLab(hsvToRgb({ ...reference, hue }));
        const angle = Math.atan2(Math.sin(Math.atan2(target[2], target[1]) - Math.atan2(source[2], source[1])),
            Math.cos(Math.atan2(target[2], target[1]) - Math.atan2(source[2], source[1])));
        const rotate = color => rgbHex(rotateHue(hexRgb(color), angle));
        return { ...reference, hue, backgroundColor: rotate(reference.backgroundColor), matColor: rotate(reference.matColor),
            glowColor: reference.glowColor ? rotate(reference.glowColor) : null, hueRotation: angle };
    }
    function readSaved(value) {
        if (!value || value.version !== 1 || !value.sections || typeof value.sections !== 'object') return Object.create(null);
        return Object.fromEntries(Object.entries(value.sections)
            .filter(([id]) => /^[a-z0-9_-]{1,80}$/i.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id))
            .map(([id, entry]) => [id, normalize(entry)]));
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { hexToHsv, hsvToHex, normalize, palette, readSaved, toLab, rotateHue, matchedPalette };
    if (!scope.document) return;

    const root = document.documentElement, layer = document.getElementById('bgLayer');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    // Apply saved intro colors even while videos.json is still loading. Full
    // section metadata replaces this boot record when the application is ready.
    const themeColor = document.querySelector('meta[name="theme-color"]')?.content;
    let overrides = Object.create(null), records = [{ id: 'landing', title: 'Intro', color: validHex(themeColor) ? themeColor : '#091a12' }],
        activeId = 'landing', navigate = () => {}, shared = () => ({}), matchIntro = true;
    let pane, controller, storageAvailable = true, renderFrom, renderTo, transitionStart = 0, signature = '';
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        overrides = readSaved(saved);
        matchIntro = saved?.matchIntro !== false;
    } catch (_) { /* Optional device storage. */ }
    const activeRecord = () => records.find(record => record.id === activeId);
    const introPalette = () => palette(records.find(record => record.id === 'landing')?.color || '#091a12', overrides.landing, shared());
    const sectionPalette = record => {
        const own = palette(record.color, overrides[record.id], shared());
        return matchIntro ? matchedPalette(introPalette(), own.hue) : own;
    };
    const current = () => {
        const record = activeRecord();
        return record ? sectionPalette(record) : null;
    };
    function sample(now = performance.now()) {
        if (!renderTo) return null;
        const t = reducedMotion.matches ? 1 : clamp((now - transitionStart) / 600, 0, 1);
        const ease = t * t * (3 - 2 * t);
        return renderTo.map((value, i) => renderFrom[i] + (value - renderFrom[i]) * ease);
    }
    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, matchIntro, sections: overrides })); storageAvailable = true; }
        catch (_) { storageAvailable = false; }
    }
    function apply(animate = false) {
        const value = current();
        if (!value || !layer) return;
        const nextSignature = JSON.stringify([activeId, value, matchIntro, shared().enabled, shared().grid]);
        if (nextSignature === signature) return;
        signature = nextSignature;
        if (root.style.getPropertyValue('--active-bg-color') !== value.backgroundColor) root.style.setProperty('--active-bg-color', value.backgroundColor);
        layer.style.backgroundColor = 'var(--active-bg-color)';
        layer.style.setProperty('--mat-line-color', value.matColor);
        layer.style.setProperty('--mat-grid-opacity', value.matBrightness / 100);
        const source = matchIntro ? introPalette() : value;
        const rgb = hexRgb(source.glowColor || source.backgroundColor);
        const next = [...rgb, source.glowColor ? 1 : 0, value.glowBrightness / 100, value.glowSaturation / 100,
            ...hexRgb(source.backgroundColor), value.hueRotation || 0, matchIntro ? 1 : 0];
        renderFrom = animate && renderTo ? sample() : next;
        // Follow the shorter arc when crossing the hue slider's wraparound.
        if (animate && renderTo) {
            renderFrom[9] = next[9] - Math.atan2(Math.sin(next[9] - renderFrom[9]), Math.cos(next[9] - renderFrom[9]));
        }
        renderTo = next;
        transitionStart = performance.now();
        sync();
        scope.dispatchEvent(new CustomEvent('reelfolio:palettechange'));
    }
    const ranges = [
        ['hue', 'Hue', 360, '°'], ['saturation', 'Saturation', 100, '%'], ['brightness', 'Brightness', 100, '%'],
        ['matBrightness', 'Line brightness', 100, '%'], ['glowSaturation', 'Glow saturation', 250, '%'], ['glowBrightness', 'Glow brightness', 200, '%']
    ];
    const range = key => {
        const [, label, max] = ranges.find(row => row[0] === key);
        return `<label class="background-range" for="section-${key}"><span class="background-range-label"><span>${label}</span><output for="section-${key}"></output></span><input type="range" id="section-${key}" data-color-setting="${key}" min="0" max="${max}" step="0.1"></label>`;
    };
    const swatch = (key, label) => `<label class="section-color-swatch" for="section-${key}"><span>${label}</span><span class="section-color-chip"><output for="section-${key}"></output><input type="color" id="section-${key}" data-color-setting="${key}" aria-label="${label}"></span></label>`;
    function sync() {
        if (!pane) return;
        const value = current(), fieldset = pane.querySelector('fieldset');
        fieldset.disabled = !value;
        if (!value) return;
        pane.querySelector('select').value = activeId;
        const index = records.findIndex(record => record.id === activeId);
        const linked = matchIntro && activeId !== 'landing';
        pane.querySelector('#section-matchIntro').checked = matchIntro;
        pane.querySelector('.section-color-intro').textContent = matchIntro
            ? activeId === 'landing' ? 'The reference palette. Lighting edits here update every section.' : 'Intro lighting, in this section’s hue.'
            : 'Each video keeps its own palette.';
        pane.querySelector('.section-linked-note').hidden = !linked;
        pane.querySelector('.section-edit-intro').hidden = !linked;
        for (const key of ['backgroundColor', 'saturation', 'brightness']) pane.querySelector(`[data-color-setting="${key}"]`).closest('label').hidden = linked;
        pane.querySelectorAll('[data-independent-colors]').forEach(group => { group.hidden = linked; });
        pane.querySelector('[data-section-step="-1"]').disabled = index === 0;
        pane.querySelector('[data-section-step="1"]').disabled = index === records.length - 1;
        pane.querySelector('.section-color-count').textContent = `${index + 1} / ${records.length}`;
        for (const [key, , , unit] of ranges) {
            const input = pane.querySelector(`[data-color-setting="${key}"]`);
            input.value = value[key];
            const label = `${Number(value[key].toFixed(1))}${unit}`;
            input.closest('label').querySelector('output').textContent = label;
            input.setAttribute('aria-valuetext', label);
        }
        for (const key of ['backgroundColor', 'matColor', 'glowColor']) {
            const input = pane.querySelector(`[data-color-setting="${key}"]`);
            input.value = value[key] || value.backgroundColor;
            input.closest('label').querySelector('output').textContent = input.value.toUpperCase();
        }
        pane.querySelector('[data-color-setting="followBackground"]').checked = !value.glowColor;
        pane.querySelector('.section-custom-glow').hidden = !value.glowColor;
        const lightOff = shared().enabled === false;
        pane.querySelector('.section-glow-note').textContent = lightOff ? 'Turn on Dither glow in Light & motion to see these changes.' : '100% brightness uses your shared glow strength.';
        pane.querySelector('.section-mat-note').hidden = shared().grid !== false || lightOff;
        pane.querySelector('.section-color-save').textContent = storageAvailable ? 'Saved on this device' : 'For this visit · Device storage unavailable';
        pane.querySelector('.section-color-reset').textContent = linked ? 'Reset section hue' : 'Reset this section';
        pane.querySelector('.section-color-reset').disabled = linked ? !Object.hasOwn(overrides[activeId] || {}, 'hue') : !Object.keys(overrides[activeId] || {}).length;
    }
    function choose(id) {
        if (!records.some(record => record.id === id)) return;
        activeId = id;
        apply(true);
        navigate(id);
    }
    function mount(host, getShared) {
        controller = host; shared = getShared;
        pane = controller.querySelector('[data-background-pane="colors"]');
        if (!pane) return;
        pane.innerHTML = `
            <fieldset class="section-color-settings" disabled>
                <div class="section-color-context">
                <label class="section-color-select-label" for="section-color-select">Editing section <span class="section-color-count"></span></label>
                <div class="section-color-navigation"><button type="button" data-section-step="-1" aria-label="Previous section">‹</button><select id="section-color-select" aria-label="Section to edit"></select><button type="button" data-section-step="1" aria-label="Next section">›</button></div>
                </div>
                <div class="section-color-link background-switch-row"><label for="section-matchIntro">Match intro lighting</label><input class="background-switch" type="checkbox" role="switch" id="section-matchIntro"></div>
                <p class="section-color-intro">Each video keeps its own palette.</p>
                <div class="section-color-group"><h3>Background</h3>${swatch('backgroundColor', 'Base color')}${range('hue')}${range('saturation')}${range('brightness')}</div>
                <p class="section-linked-note" hidden>Brightness, saturation, mat lines, and glow follow the intro. Only the hue changes.</p>
                <button class="section-edit-intro" type="button" hidden>Edit intro lighting</button>
                <div class="section-color-group" data-independent-colors><h3>Mat lines</h3>${swatch('matColor', 'Line color')}${range('matBrightness')}<p class="section-mat-note" hidden>Turn on Keep mat grid in Light & motion to see the lines.</p></div>
                <div class="section-color-group" data-independent-colors><h3>Dither glow</h3><div class="background-switch-row"><label for="section-followBackground">Follow background hue</label><input class="background-switch" type="checkbox" role="switch" id="section-followBackground" data-color-setting="followBackground"></div><div class="section-custom-glow">${swatch('glowColor', 'Glow tint')}</div>${range('glowSaturation')}${range('glowBrightness')}<p class="section-glow-note"></p></div>
                <button class="section-color-reset" type="button">Reset this section</button>
            </fieldset><p class="section-color-save" role="status"></p>`;
        pane.addEventListener('input', event => {
            const key = event.target.dataset.colorSetting;
            if (!key || !activeRecord()) return;
            const value = current();
            let change;
            if (key === 'backgroundColor') change = hexToHsv(event.target.value);
            else if (key === 'followBackground') change = { glowColor: event.target.checked ? null : glowTint(value.backgroundColor) };
            else change = { [key]: event.target.type === 'color' ? event.target.value : Number(event.target.value) };
            overrides[activeId] = normalize({ ...overrides[activeId], ...change });
            save(); apply();
        });
        pane.querySelector('select').addEventListener('change', event => choose(event.target.value));
        pane.querySelector('#section-matchIntro').addEventListener('change', event => { matchIntro = event.target.checked; save(); apply(); });
        pane.querySelector('.section-edit-intro').addEventListener('click', () => choose('landing'));
        pane.querySelectorAll('[data-section-step]').forEach(button => button.addEventListener('click', () => {
            const index = records.findIndex(record => record.id === activeId) + Number(button.dataset.sectionStep);
            if (records[index]) choose(records[index].id);
        }));
        pane.querySelector('.section-color-reset').addEventListener('click', () => {
            if (matchIntro && activeId !== 'landing') {
                if (overrides[activeId]) delete overrides[activeId].hue;
            } else delete overrides[activeId];
            save(); signature = ''; apply();
        });
        controller.querySelectorAll('[data-background-view]').forEach(button => button.addEventListener('click', () => {
            const view = button.dataset.backgroundView;
            controller.querySelectorAll('[data-background-view]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
            controller.querySelectorAll('[data-background-pane]').forEach(section => { section.hidden = section.dataset.backgroundPane !== view; });
            controller.querySelector('.background-panel-footer').hidden = view !== 'light';
            scope.dispatchEvent(new CustomEvent('reelfolio:palettechange'));
        }));
        populateSections();
        signature = ''; apply(); sync();
    }
    function populateSections() {
        if (pane) {
            const select = pane.querySelector('select');
            select.replaceChildren(...records.map((record, i) => {
                const option = document.createElement('option');
                option.value = record.id; option.textContent = `${i + 1}. ${record.title}`;
                return option;
            }));
        }
    }
    function register(sections, onNavigate) {
        records = sections.filter(record => record && typeof record.id === 'string' && validHex(record.color));
        navigate = onNavigate;
        populateSections();
        activeId = records[0]?.id ?? null;
        signature = ''; apply();
    }
    function activate(id) {
        if (!records.some(record => record.id === id)) return false;
        const changed = activeId !== id;
        activeId = id; apply(changed);
        return true;
    }
    function exportPalettes() {
        return { version: 2, matchIntro, referenceSection: 'landing', activeSection: activeId, sections: Object.fromEntries(records.map(record => {
            const value = sectionPalette(record);
            return [record.id, { title: record.title, ...value, overrides: { ...overrides[record.id] } }];
        })) };
    }
    scope.ReelFolioColors = { mount, register, activate, refresh: () => apply(), current, sample, exportSettings: exportPalettes };
    scope.dispatchEvent(new CustomEvent('reelfolio:colorsready'));
})(typeof window === 'undefined' ? globalThis : window);
