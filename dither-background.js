/* Animated ordered dithering, with the existing olive shadow as an optional source. */
((scope) => {
    'use strict';
    const STORAGE_KEY = 'reelfolio.dither.v2';
    const ditherDefaults = Object.freeze({ ditherAmount: 100, tonalSteps: 5 });
    const foliageDefaults = Object.freeze({ leafBlur: 11, windowBlur: 14, shadowDepth: 85,
        treeSize: 95, treeX: 0, treeY: 0, windowAngle: -17, sway: 100 });
    const looks = Object.freeze({
        veil: { index: 0, label: 'Light veils', description: 'Long, softly folded light', settings: { scale: 65, distortion: 35, softness: 65, detail: 25, contrast: 50, direction: 25, speed: 72 } },
        drift: { index: 1, label: 'Soft drift', description: 'Quiet pools of diffused light', settings: { scale: 20, distortion: 43, softness: 75, detail: 20, contrast: 45, direction: 335, speed: 96 } },
        water: { index: 2, label: 'Water light', description: 'Intersecting ripples of light', settings: { scale: 55, distortion: 40, softness: 45, detail: 40, contrast: 55, direction: 20, speed: 20 } },
        contour: { index: 3, label: 'Contours', description: 'Slow, sculpted lines', settings: { scale: 60, distortion: 30, softness: 35, detail: 30, contrast: 50, direction: 315, speed: 18 } },
        fluid: { index: 4, label: 'Original fluid', description: 'The earlier cloudy treatment', settings: { scale: 50, distortion: 80, softness: 50, detail: 35, contrast: 70, direction: 0, speed: 30 } },
        foliage: { index: 5, label: 'Foliage light', description: 'One dithered light across the window and leaves', settings: { scale: 50, distortion: 0, softness: 5, detail: 0, contrast: 72, direction: 0, speed: 41, ditherAmount: 72, tonalSteps: 3 } }
    });
    const defaults = Object.freeze({ enabled: true, strength: 33, saturation: 250, matBrightness: 29, pixelSize: 2.5, grid: true, style: 'foliage', seed: 7, ...ditherDefaults, ...foliageDefaults, ...looks.foliage.settings });
    const foliageMask = 'assets/environment/olive-bough-mask.webp';
    function normalize(value) {
        const input = value && typeof value === 'object' ? value : {};
        const style = typeof input.style === 'string' && Object.hasOwn(looks, input.style) ? input.style : defaults.style;
        const base = { ...defaults, ...ditherDefaults, ...looks[style].settings };
        const number = (key, min, max) => typeof input[key] === 'number' && Number.isFinite(input[key])
            ? Math.min(max, Math.max(min, input[key])) : base[key];
        return {
            enabled: typeof input.enabled === 'boolean' ? input.enabled : defaults.enabled,
            strength: number('strength', 0, 100), speed: number('speed', 0, 100),
            saturation: number('saturation', 0, 250), matBrightness: number('matBrightness', 0, 100),
            pixelSize: number('pixelSize', 1, 5),
            grid: typeof input.grid === 'boolean' ? input.grid : defaults.grid,
            style, seed: Math.round(number('seed', 1, 9999)),
            scale: number('scale', 20, 100), distortion: number('distortion', 0, 100),
            softness: number('softness', 0, 100), detail: number('detail', 0, 100),
            contrast: number('contrast', 0, 100), direction: number('direction', 0, 360),
            ditherAmount: number('ditherAmount', 0, 100), tonalSteps: Math.round(number('tonalSteps', 2, 8)),
            leafBlur: number('leafBlur', 0, 100), windowBlur: number('windowBlur', 0, 60),
            shadowDepth: number('shadowDepth', 0, 100), treeSize: number('treeSize', 40, 180),
            treeX: number('treeX', -50, 50), treeY: number('treeY', -50, 50),
            windowAngle: number('windowAngle', -45, 45), sway: number('sway', 0, 200)
        };
    }
    function selectLook(current, style) {
        if (!Object.hasOwn(looks, style)) return normalize(current);
        return normalize({ ...current, ...ditherDefaults, ...foliageDefaults, ...looks[style].settings, style });
    }
    const lookKeys = [...Object.keys(looks.veil.settings), ...Object.keys(ditherDefaults), 'seed'];
    function lookSettings(value) {
        const safe = normalize(value);
        const keys = safe.style === 'foliage' ? [...lookKeys, ...Object.keys(foliageDefaults)] : lookKeys;
        return Object.fromEntries(keys.map(key => [key, safe[key]]));
    }
    function exportSettings(current, drafts = {}, sectionColors) {
        const settings = normalize(current);
        const savedLooks = Object.fromEntries(Object.keys(looks).map(style => [style,
            lookSettings(style === settings.style ? settings : { ...drafts?.[style], style })]));
        return JSON.stringify({ version: sectionColors ? 3 : 2, renderer: 'dither-glow', settings, looks: savedLooks,
            foliage: { scene: 'olive-bough', mask: foliageMask, placement: 'environment-default.json' },
            ...(sectionColors ? { sectionColors } : {}) }, null, 2);
    }
    // Same containing blocks and percentage offsets as environment-production.css.
    // Values are read from its CSS variables in the browser; these are mobile fallbacks.
    function foliageLayout(width, height, scene = {}, controls = {}) {
        const blur = scene.lightSoftness ?? 12;
        const stage = { width: width + blur * 2, height: height + blur * 2 };
        const window = { x: -blur + stage.width * .12, y: -blur + stage.height * .03,
            width: stage.width * .96, height: stage.height * .96 };
        const factor = (controls.treeSize ?? 100) / 100;
        const leaf = { width: width * .97222 * (scene.treeScale ?? .59) * (scene.plantWidth ?? .99) * factor,
            height: width * .97222 * (scene.treeScale ?? .59) * (scene.plantHeight ?? 1) * factor };
        leaf.x = window.width * (1 - (scene.leafX ?? -3) / 100 + (controls.treeX ?? 0) / 100) - leaf.width;
        leaf.y = window.height * (1 - (scene.leafY ?? -14) / 100 + (controls.treeY ?? 0) / 100) - leaf.height;
        return { stage, window, leaf };
    }
    function foliageSway(seconds, duration = 5) {
        // CSS alternate animation, including its middle keyframe and sine easing.
        const cycle = ((seconds / duration) % 2 + 2) % 2;
        const phase = cycle <= 1 ? cycle : 2 - cycle;
        const points = [[-.3, 0, -.55], [.12, -.16, .22], [.38, 0, .62]];
        const segment = phase < .52 ? 0 : 1;
        const x = segment === 0 ? phase / .52 : (phase - .52) / .48;
        let low = 0, high = 1;
        for (let i = 0; i < 14; i++) {
            const t = (low + high) / 2;
            const bx = 3 * (1 - t) ** 2 * t * .37 + 3 * (1 - t) * t * t * .63 + t ** 3;
            if (bx < x) low = t; else high = t;
        }
        const t = (low + high) / 2;
        const eased = t * t * (3 - 2 * t);
        return points[segment].map((start, i) => start + (points[segment + 1][i] - start) * eased);
    }
    // Work in CSS pixels, capped independently of device pixel ratio. The dots,
    // rather than retina-resolution noise, are the intended visible detail.
    function renderSize(width, height, pixelSize = defaults.pixelSize) {
        const scale = Math.min(1 / pixelSize, 1600 / Math.max(width, height), Math.sqrt(1100000 / (width * height)));
        return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { defaults, looks, normalize, selectLook, lookSettings, exportSettings, foliageLayout, foliageSway, renderSize };
    if (!scope.document) return;

    const root = document.documentElement;
    const layer = document.getElementById('bgLayer');
    if (!layer || document.getElementById('backgroundController')) return;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = matchMedia('(max-width: 600px)');
    let settings = { ...defaults };
    let lookDrafts = {};
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('reelfolio.dither.v1'));
        settings = normalize(stored);
        for (const style of Object.keys(looks)) {
            if (stored?.looks && Object.hasOwn(stored.looks, style)) {
                lookDrafts[style] = lookSettings({ ...stored.looks[style], style });
            }
        }
    } catch (_) { /* Private storage is optional. */ }

    const canvas = document.createElement('canvas');
    canvas.className = 'dither-background';
    canvas.setAttribute('aria-hidden', 'true');
    layer.prepend(canvas);
    const controller = document.createElement('aside');
    controller.id = 'backgroundController';
    controller.className = 'background-controller';
    controller.setAttribute('aria-label', 'Background controls');
    const range = (key, label, min = 0, max = 100, step = 1) => `
        <label class="background-range" for="dither-${key}"><span class="background-range-label"><span>${label}</span><output for="dither-${key}" aria-live="off"></output></span><input type="range" id="dither-${key}" data-setting="${key}" min="${min}" max="${max}" step="${step}"></label>`;
    controller.innerHTML = `
        <button class="background-launcher" type="button" aria-expanded="false" aria-controls="backgroundPanel">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1"/><circle cx="8" cy="3" r="1.5"/><circle cx="13" cy="3" r="1"/><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="2"/><circle cx="13" cy="8" r="1.5"/><circle cx="3" cy="13" r="1"/><circle cx="8" cy="13" r="1.5"/><circle cx="13" cy="13" r="1"/></svg>
            <span>Background</span><span class="background-status-dot" aria-hidden="true"></span>
        </button>
        <section class="background-panel" id="backgroundPanel" aria-labelledby="backgroundPanelTitle" hidden>
            <div class="background-panel-header">
                <div><h2 id="backgroundPanelTitle">Background studio</h2><p>Color each scene. Shape the light.</p></div>
                <button class="background-close" type="button" aria-label="Close background controls"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>
            </div>
            <div class="background-view-switch" role="group" aria-label="Background controls">
                <button type="button" data-background-view="colors" aria-pressed="true" aria-controls="backgroundColors">Section colors</button>
                <button type="button" data-background-view="light" aria-pressed="false" aria-controls="backgroundLight">Light & motion</button>
            </div>
            <div id="backgroundColors" data-background-pane="colors"></div>
            <div id="backgroundLight" data-background-pane="light" hidden>
            <p class="background-shared-note">Shared light and motion. Custom section palettes stay saved.</p>
            <div class="background-switch-row"><label for="ditherEnabled">Dither glow</label><input class="background-switch" type="checkbox" role="switch" id="ditherEnabled" data-setting="enabled"></div>
            <fieldset class="background-options" aria-label="Glow settings">
                <div class="background-look-grid" role="group" aria-label="Light style">${Object.entries(looks).map(([key, look]) => `
                    <button type="button" class="background-look" data-look="${key}" aria-pressed="false"><span class="background-look-art background-look-art-${key}" aria-hidden="true"></span><span>${look.label}</span></button>`).join('')}
                </div>
                <p class="background-look-description" id="backgroundLookDescription"></p>
                <div class="background-composition-actions"><button type="button" class="background-shuffle">New composition</button><button type="button" class="background-reset-look">Reset look</button></div>
                <figure class="background-scene-preview" hidden><figcaption>Light preview <span>Full scene</span></figcaption><canvas width="576" height="324" role="img" aria-label="Live preview of the dithered window and olive shadows"></canvas></figure>
                ${range('scale', 'Form size', 20, 100)}
                ${range('distortion', 'Distortion')}
                <div class="background-foliage-controls" hidden>
                    <h3>Window & leaves</h3><p>Lower leaf blur brings the olive shadows into focus.</p>
                    ${range('leafBlur', 'Leaf blur')}
                    ${range('shadowDepth', 'Shadow depth')}
                    ${range('windowBlur', 'Window blur', 0, 60)}
                </div>
                ${range('speed', 'Motion speed')}
                <div class="background-dither-controls"><h3>Dither & light</h3>
                ${range('ditherAmount', 'Dither amount')}
                ${range('pixelSize', 'Dot size', 1, 5, 0.5)}
                ${range('strength', 'Base glow strength')}
                ${range('saturation', 'Default glow saturation', 0, 250)}
                </div>
                <details class="background-fine-tuning"><summary>Fine tuning <span aria-hidden="true">+</span></summary>
                    <div class="background-fine-tuning-content">
                        ${range('softness', 'Softness')}
                        ${range('contrast', 'Contrast')}
                        ${range('detail', 'Fine detail')}
                        ${range('direction', 'Direction', 0, 360, 5)}
                        ${range('tonalSteps', 'Tonal steps', 2, 8)}
                    </div>
                </details>
                <details class="background-fine-tuning background-foliage-placement" hidden><summary>Placement & sway <span aria-hidden="true">+</span></summary>
                    <div class="background-fine-tuning-content">
                        ${range('treeSize', 'Tree size', 40, 180)}
                        ${range('treeX', 'Tree horizontal', -50, 50)}
                        ${range('treeY', 'Tree vertical', -50, 50)}
                        ${range('windowAngle', 'Window angle', -45, 45)}
                        ${range('sway', 'Sway amount', 0, 200)}
                    </div>
                </details>
            </fieldset>
            <fieldset class="background-mat-options" aria-label="Mat settings">
                <div class="background-switch-row"><label for="ditherGrid">Keep mat grid</label><input class="background-switch" type="checkbox" role="switch" id="ditherGrid" data-setting="grid"></div>
                ${range('matBrightness', 'Default mat brightness')}
            </fieldset>
            <p id="backgroundStatus" role="status"></p>
            <button class="background-retry" type="button" hidden>Retry foliage</button>
            </div>
            <div class="background-export"><button class="background-copy" type="button">Copy JSON</button><span class="background-copy-status" role="status">Share these settings</span></div>
            <label class="background-json" hidden>Settings JSON<textarea readonly rows="6" spellcheck="false" aria-label="Settings JSON to copy"></textarea><span>Select the text and copy it to share.</span></label>
            <div class="background-panel-footer" hidden><span>Saved on this device</span><button class="background-reset" type="button">Reset light settings</button></div>
        </section>`;
    document.body.appendChild(controller);
    const launcher = controller.querySelector('.background-launcher');
    const panel = controller.querySelector('.background-panel');
    const options = controller.querySelector('.background-options');
    const status = controller.querySelector('#backgroundStatus');
    const preview = controller.querySelector('.background-scene-preview canvas');
    const previewContext = preview.getContext('2d', { alpha: false });
    const inputs = [...controller.querySelectorAll('[data-setting]')];
    let storageAvailable = true;
    let copyTimer, copying = false;
    function save() {
        lookDrafts[settings.style] = lookSettings(settings);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, looks: lookDrafts })); } catch (_) { storageAvailable = false; }
        controller.querySelector('.background-panel-footer span').textContent = storageAvailable ? 'Saved on this device' : 'For this visit';
    }
    function setPanel(open, returnFocus = false) {
        panel.hidden = !open;
        launcher.setAttribute('aria-expanded', String(open));
        if (open) { controller.querySelector('[data-background-view][aria-pressed="true"]').focus({ preventScroll: true }); wake(); }
        else if (returnFocus) launcher.focus({ preventScroll: true });
    }
    launcher.addEventListener('click', () => setPanel(panel.hidden));
    controller.querySelector('.background-close').addEventListener('click', () => setPanel(false, true));
    document.addEventListener('pointerdown', event => {
        if (!panel.hidden && !controller.contains(event.target)) setPanel(false);
    });
    controller.addEventListener('focusout', event => {
        if (event.relatedTarget && !controller.contains(event.relatedTarget)) setPanel(false);
    });
    // Range arrows and switch Space belong to the controls, not reel navigation.
    controller.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); setPanel(false, true); }
    });
    controller.querySelector('.background-copy').addEventListener('click', async event => {
        if (copying) return;
        copying = true;
        const button = event.currentTarget;
        const feedback = controller.querySelector('.background-copy-status');
        const fallback = controller.querySelector('.background-json');
        const json = exportSettings(settings, lookDrafts, scope.ReelFolioColors?.exportSettings());
        clearTimeout(copyTimer);
        button.setAttribute('aria-busy', 'true');
        try {
            await navigator.clipboard.writeText(json);
            fallback.hidden = true;
            feedback.textContent = 'Copied — ready to paste';
        } catch (_) {
            fallback.hidden = false;
            const textarea = fallback.querySelector('textarea');
            textarea.value = json;
            textarea.focus(); textarea.select();
            feedback.textContent = 'Copy the selected JSON below';
        } finally {
            copying = false;
            button.removeAttribute('aria-busy');
            copyTimer = setTimeout(() => { feedback.textContent = 'Share these settings'; }, 5000);
        }
    });

    const vertexSource = `
        attribute vec2 aPosition;
        void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
    `;
    const fragmentSource = `
        precision highp float;
        uniform vec2 uResolution;
        uniform vec3 uColor, uGlowColor;
        uniform float uGlowOverride, uHueRotation, uMatchIntro;
        uniform float uTime, uStrength, uSaturation, uStyle, uScale, uDistortion, uSoftness, uDetail, uContrast, uDirection, uSeed;
        uniform float uDitherAmount, uTonalSteps, uStageInset;
        uniform sampler2D uFoliageMask;
        uniform mat3 uWindowFromScreen, uLeafFromWindow;
        uniform vec2 uViewport, uWindowSize, uLeafSize, uLeafPadding, uLightCenter, uLightSpread, uFramePosition;
        uniform vec4 uFoliagePaint;

        float hash(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
        }
        float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), u.x), u.y);
        }
        float fbm(vec2 p) {
            float n = 0.0, weight = 0.57;
            mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
            for (int i = 0; i < 4; i++) {
                n += weight * noise(p);
                p = turn * p * 2.03 + 17.13;
                weight *= 0.47;
            }
            return n;
        }
        float bayer2(vec2 p) {
            p = mod(floor(p), 2.0);
            return 2.0 * p.x + 3.0 * p.y - 4.0 * p.x * p.y;
        }
        float bayer8(vec2 p) {
            return (16.0 * bayer2(p) + 4.0 * bayer2(p / 2.0) + bayer2(p / 4.0) + 0.5) / 64.0;
        }
        // A stationary field carried in one direction keeps its structure as it
        // moves. Independent noise clocks made the earlier treatment "boil".
        vec2 carried(vec2 p, float t) {
            return p + vec2(t * 0.1, t * 0.026) + vec2(uSeed * 1.37, uSeed * 0.91);
        }
        float veils(vec2 p, float t) {
            vec2 q = carried(p, t);
            float bend = noise(vec2(q.y * 0.53, uSeed)) * 3.8
                       + noise(q * vec2(0.32, 0.8)) * 1.4;
            float fold = q.x * 2.5 + bend * uDistortion * 2.0;
            fold += uDetail * 0.4 * sin(q.y * 3.3 + noise(q * 0.7) * 2.0);
            float ridge = abs(sin(fold) + 0.32 * sin(fold * 0.53 + q.y * 0.3));
            float width = mix(0.1, 0.65, uSoftness);
            float light = exp(-ridge * ridge / (width * width));
            float falloff = 0.55 + 0.45 * noise(q * vec2(0.38, 0.65) + 11.0);
            return light * falloff + 0.045 * falloff;
        }
        float drift(vec2 p, float t) {
            vec2 q = carried(p * 0.8, t);
            vec2 bend = vec2(noise(q * 0.55), noise(q * 0.55 + 9.7)) - 0.5;
            q += bend * uDistortion * 2.5;
            // Low, broad spatial frequencies: diffuse light, without little
            // vortices or an endlessly inflating/deflating surface.
            float broad = noise(q * 0.8) * 0.72 + noise(q * 1.35 + 23.0) * 0.28;
            broad += (fbm(q * 2.0) - 0.5) * uDetail * 0.3;
            float width = mix(0.12, 0.48, uSoftness);
            return smoothstep(0.53 - width * 0.5, 0.53 + width, broad);
        }
        float water(vec2 p, float t) {
            vec2 q = p * 2.2 + vec2(uSeed * 0.47, uSeed * 0.71);
            q += (vec2(noise(q * 0.45), noise(q * 0.45 + 9.0)) - 0.5) * uDistortion * 1.8;
            // Curvature of intersecting waves concentrates light into fine
            // caustic lines. Unequal wavelengths avoid a repeating tile.
            vec2 a = vec2(1.8, 0.7), b = vec2(-0.8, 2.2), c = vec2(2.6, -1.8), d = vec2(3.2, 1.1);
            float wa = cos(dot(q, a) - t * 0.36) * 0.23;
            float wb = cos(dot(q, b) - t * 0.43 + 1.7) * 0.18;
            float wc = cos(dot(q, c) - t * 0.51 + 4.1) * (0.035 + uDetail * 0.065);
            float wd = cos(dot(q, d) - t * 0.57 + 2.3) * (0.02 + uDetail * 0.03);
            float xx = wa * a.x * a.x + wb * b.x * b.x + wc * c.x * c.x + wd * d.x * d.x;
            float yy = wa * a.y * a.y + wb * b.y * b.y + wc * c.y * c.y + wd * d.y * d.y;
            float xy = wa * a.x * a.y + wb * b.x * b.y + wc * c.x * c.y + wd * d.x * d.y;
            float focus = mix(0.9, 1.6, uDistortion);
            float jacobian = (1.0 + focus * xx) * (1.0 + focus * yy) - focus * focus * xy * xy;
            float caustic = exp(-abs(jacobian) * mix(12.0, 2.4, uSoftness));
            return caustic * 0.85 + 0.045;
        }
        float contours(vec2 p, float t) {
            vec2 q = carried(p * 0.75, t);
            q += (vec2(noise(q), noise(q + 17.0)) - 0.5) * uDistortion * 2.0;
            float height = fbm(q);
            float distanceToLine = abs(fract(height * mix(6.0, 20.0, uDetail)) - 0.5);
            return (1.0 - smoothstep(0.012, mix(0.045, 0.25, uSoftness), distanceToLine)) * 0.78;
        }
        float originalFluid(vec2 p, float t) {
            p += vec2((uSeed - 7.0) * 0.31);
            vec2 warp = vec2(fbm(p + vec2(t * 0.23, -t * 0.18)),
                             fbm(p + vec2(5.2 - t * 0.16, 1.3 + t * 0.21)));
            float cloud = fbm(p + warp * uDistortion * 4.0 + vec2(t * 0.12, -t * 0.09));
            float light = smoothstep(0.24, mix(0.65, 1.05, uSoftness), cloud);
            return light + 0.16 * uDetail * noise(p * 7.0 + warp * 5.0 + t * 0.08) * light;
        }
        vec3 adjustGlowSaturation(vec3 color) {
            // Preserve the hue and peak value. Above 100%, approach full
            // saturation smoothly without clipping the weaker color channels.
            float peak = max(max(color.r, color.g), color.b);
            float low = min(min(color.r, color.g), color.b);
            float saturation = (peak - low) / max(peak, 0.00001);
            float target = uSaturation <= 1.0 ? saturation * uSaturation
                : 1.0 - pow(1.0 - saturation, uSaturation);
            return mix(vec3(peak), color, target / max(saturation, 0.00001));
        }
        vec3 srgbToLinear(vec3 color) {
            return mix(color / 12.92, pow((color + .055) / 1.055, vec3(2.4)), step(vec3(.04045), color));
        }
        vec3 linearToSrgb(vec3 color) {
            color = max(color, vec3(0.0));
            return mix(color * 12.92, 1.055 * pow(color, vec3(1.0 / 2.4)) - .055, step(vec3(.0031308), color));
        }
        vec3 rgbToLab(vec3 color) {
            vec3 rgb = srgbToLinear(color);
            vec3 lms = pow(vec3(dot(rgb, vec3(.4122214708, .5363325363, .0514459929)),
                dot(rgb, vec3(.2119034982, .6806995451, .1073969566)),
                dot(rgb, vec3(.0883024619, .2817188376, .6299787005))), vec3(1.0 / 3.0));
            return vec3(dot(lms, vec3(.2104542553, .7936177850, -.0040720468)),
                dot(lms, vec3(1.9779984951, -2.4285922050, .4505937099)),
                dot(lms, vec3(.0259040371, .7827717662, -.8086757660)));
        }
        vec3 labToLinear(vec3 lab) {
            vec3 lms = vec3(lab.x + .3963377774 * lab.y + .2158037573 * lab.z,
                lab.x - .1055613458 * lab.y - .0638541728 * lab.z,
                lab.x - .0894841775 * lab.y - 1.2914855480 * lab.z);
            lms = lms * lms * lms;
            return vec3(dot(lms, vec3(4.0767416621, -3.3077115913, .2309699292)),
                dot(lms, vec3(-1.2684380046, 2.6097574011, -.3413193965)),
                dot(lms, vec3(-.0041960863, -.7034186147, 1.7076147010)));
        }
        bool inGamut(vec3 color) {
            return all(greaterThanEqual(color, vec3(0.0))) && all(lessThanEqual(color, vec3(1.0)));
        }
        vec3 matchIntroHue(vec3 color) {
            if (uMatchIntro < .00001 || abs(uHueRotation) < .00001) return color;
            vec3 lab = rgbToLab(clamp(color, 0.0, 1.0));
            float c = cos(uHueRotation), s = sin(uHueRotation);
            vec2 ab = vec2(lab.y * c - lab.z * s, lab.y * s + lab.z * c);
            vec3 rgb = labToLinear(vec3(lab.x, ab));
            if (!inGamut(rgb)) {
                float low = 0.0, high = 1.0;
                for (int i = 0; i < 8; i++) {
                    float mid = (low + high) * .5;
                    if (inGamut(labToLinear(vec3(lab.x, ab * mid)))) low = mid; else high = mid;
                }
                rgb = labToLinear(vec3(lab.x, ab * low));
            }
            return mix(color, clamp(linearToSrgb(rgb), 0.0, 1.0), uMatchIntro);
        }
        float edgeDistance(vec2 p, vec2 a, vec2 b) {
            vec2 edge = b - a;
            return (edge.x * (p.y - a.y) - edge.y * (p.x - a.x)) / length(edge);
        }
        vec2 foliageLight(vec2 screen) {
            // The original slanted window and crossbars, in their CSS coordinates.
            vec2 p = (uWindowFromScreen * vec3(screen, 1.0)).xy;
            vec2 a = vec2(.04, 0.0) * uWindowSize, b = vec2(.92, .09) * uWindowSize;
            vec2 c = vec2(1.0, .93) * uWindowSize, d = vec2(0.0, 1.0) * uWindowSize;
            float edge = min(min(edgeDistance(p, a, b), edgeDistance(p, b, c)),
                             min(edgeDistance(p, c, d), edgeDistance(p, d, a)));
            float blur = max(uFoliagePaint.x, 0.5);
            float coverage = smoothstep(-blur * 1.7, blur * 1.7, edge);
            // Window blur changes the edge, never the containing block or tree blur.
            vec2 stage = uViewport + uStageInset * 2.0;
            float radius = length(((screen + uStageInset) / stage - uLightCenter) / uLightSpread);
            float falloff = radius < .36 ? mix(1.0, .92, radius / .36)
                : radius < .68 ? mix(.92, .42, (radius - .36) / .32)
                : mix(.42, 0.0, clamp((radius - .68) / .32, 0.0, 1.0));
            coverage *= falloff;
            vec2 bars = 1.0 - smoothstep(vec2(uFoliagePaint.y - blur * 1.7),
                vec2(uFoliagePaint.y + blur * 1.7), abs(p - uFramePosition * uWindowSize));
            float light = (1.0 - bars.x * uFoliagePaint.z) * (1.0 - bars.y * uFoliagePaint.z);
            vec2 leaf = (uLeafFromWindow * vec3(p, 1.0)).xy / uLeafSize;
            vec2 samplePoint = (leaf + uLeafPadding) / (1.0 + 2.0 * uLeafPadding);
            float shadow = texture2D(uFoliageMask, samplePoint).a;
            light *= 1.0 - shadow * uFoliagePaint.w;
            return vec2(light, coverage);
        }
        void main() {
            vec2 cell = floor(gl_FragCoord.xy);
            vec2 uv = (cell + 0.5) / uResolution;
            vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * uScale;
            float angle = uDirection * 0.01745329252;
            p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
            float t = uTime * 0.13;
            float field;
            if (uStyle < 0.5) field = veils(p, t);
            else if (uStyle < 1.5) field = drift(p, t);
            else if (uStyle < 2.5) field = water(p, t);
            else if (uStyle < 3.5) field = contours(p, t);
            else if (uStyle < 4.5) field = originalFluid(p, t);
            else {
                vec2 foliage = foliageLight(vec2(uv.x, 1.0 - uv.y) * uViewport);
                // Compose light, frame, leaves, edge blur, and falloff BEFORE dithering.
                field = foliage.x * foliage.y;
            }
            float light = pow(clamp(field, 0.0, 1.0), mix(0.8, 2.8, uContrast));
            // Quiet the side columns where project titles and comments live.
            float readingArea = exp(-pow((uv.y - 0.5) * 3.8, 2.0)) * smoothstep(0.15, 0.38, abs(uv.x - 0.5));
            if (uStyle < 4.5) light *= 1.0 - 0.62 * readingArea;
            float vignette = 1.0 - 0.22 * smoothstep(0.15, 0.8, length(uv - 0.5));
            // Leave highlight headroom so even an unobstructed pane retains dots.
            if (uStyle > 4.5) light *= .86 * vignette;
            float stepped = floor(clamp(light, 0.0, 1.0) * uTonalSteps + bayer8(cell)) / uTonalSteps;
            float shade = mix(light, stepped, uDitherAmount);
            vec3 hue = pow(uColor / max(max(uColor.r, uColor.g), max(uColor.b, 0.035)), vec3(1.25));
            vec3 shadow = uColor * 0.48;
            vec3 glow = mix(hue * 0.72, uGlowColor, uGlowOverride);
            if (uStyle > 4.5) {
                vec3 lit = adjustGlowSaturation(mix(glow, vec3(.83, .9, .94), .12));
                // A zero field is the unlit mat; shadows and both window edges share
                // the same screen. There is no smooth opacity mask after this step.
                gl_FragColor = vec4(matchIntroHue(mix(uColor, lit, shade * uStrength)), 1.0);
                return;
            }
            vec3 color = mix(shadow, glow, shade);
            color = mix(color, vec3(0.83, 0.9, 0.94), pow(shade, 4.0) * 0.55);
            color = adjustGlowSaturation(color);
            // Preserve some depth at the viewport edges without a dark seam.
            gl_FragColor = vec4(matchIntroHue(mix(uColor, color * vignette, uStrength)), 1.0);
        }
    `;
    let gl = null, program = null, buffer = null, uniforms = null, foliageTexture = null;
    let lost = false, failed = false, frame = 0, time = 11, lastDraw = 0, dirty = true;
    let colorUntil = 0, size = null;
    let foliageImage = null, foliageLoading = null, foliageFailed = false;
    let scene = null, layout = null, foliageSignature = '', maskSignature = '';
    const shaders = [];
    function loadFoliage() {
        if (foliageImage || foliageLoading || foliageFailed) return;
        const image = new Image();
        image.decoding = 'async';
        image.src = foliageMask;
        foliageLoading = image.decode().then(() => {
            foliageImage = image;
        }).catch(() => { foliageFailed = true; }).finally(() => {
            foliageLoading = null;
            // Loading may finish after switching looks, disabling, or hiding the page.
            if (settings.style === 'foliage') { wake(); syncControls(); }
        });
    }
    function readScene() {
        const css = getComputedStyle(root);
        const value = (name, fallback) => {
            const number = parseFloat(css.getPropertyValue(`--bg-${name}`));
            return Number.isFinite(number) ? number : fallback;
        };
        return {
            lightSoftness: value('light-softness', 12), lightX: value('light-x', 54), lightY: value('light-y', 14),
            spreadX: value('light-spread-x', 86), spreadY: value('light-spread-y', 142),
            windowX: value('window-x', 0), windowY: value('window-y', 0), windowScale: value('window-scale', 1),
            windowWidth: value('window-width-scale', 1), windowHeight: value('window-height-scale', 1),
            skew: value('window-skew', 1.5),
            frameWidth: value('window-frame-width', 36), frameOpacity: value('window-shadow-opacity', .55),
            barX: value('window-bar-x', 47), barY: value('window-bar-y', 52),
            treeScale: value('tree-scale', .59), plantWidth: value('plant-width-scale', .99), plantHeight: value('plant-height-scale', 1),
            leafX: value('window-left-leaf-x', -3), leafY: value('window-left-leaf-y', -14),
            leafRotation: value('left-leaf-rotation', 3),
            motionAmount: value('light-motion-amount', 56), motionRotation: value('light-motion-rotation', 4.4),
            motionDuration: value('light-motion-speed', 5)
        };
    }
    function setInverse(uniform, matrix) {
        const m = matrix.inverse();
        gl.uniformMatrix3fv(uniform, false, [m.a, m.b, 0, m.c, m.d, 0, m.e, m.f, 1]);
    }
    function drawFoliage() {
        const width = window.innerWidth, height = window.innerHeight;
        const signature = [width, height, settings.treeSize, settings.treeX, settings.treeY, settings.windowAngle].join(':');
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, foliageTexture);
        if (signature !== foliageSignature) {
            scene = readScene();
            layout = foliageLayout(width, height, scene, settings);
            const { window: aperture, leaf } = layout;
            const transform = new DOMMatrix().translate(aperture.x + aperture.width / 2 + scene.windowX, aperture.y + aperture.height / 2 + scene.windowY)
                .rotate(settings.windowAngle).skewY(scene.skew).scale(scene.windowScale * scene.windowWidth, scene.windowScale * scene.windowHeight)
                .translate(-aperture.width / 2, -aperture.height / 2);
            setInverse(uniforms.uWindowFromScreen, transform);
            gl.uniform2f(uniforms.uViewport, width, height);
            gl.uniform2f(uniforms.uWindowSize, aperture.width, aperture.height);
            gl.uniform2f(uniforms.uLeafSize, leaf.width, leaf.height);
            gl.uniform2f(uniforms.uLightCenter, scene.lightX / 100, scene.lightY / 100);
            gl.uniform2f(uniforms.uLightSpread, scene.spreadX / 100, scene.spreadY / 100);
            gl.uniform2f(uniforms.uFramePosition, scene.barX / 100, 1 - scene.barY / 100);
            gl.uniform1f(uniforms.uStageInset, scene.lightSoftness);
            foliageSignature = signature;
        }
        const leaf = layout.leaf;
        gl.uniform4f(uniforms.uFoliagePaint, settings.windowBlur, scene.frameWidth, scene.frameOpacity, settings.shadowDepth / 100);
        const nextMaskSignature = [leaf.width, leaf.height, settings.leafBlur].join(':');
        if (maskSignature !== nextMaskSignature) {
            // Independent leaf blur: zero truly reveals the original silhouette.
            // No shared/window blur is added back in after this control.
            // Transparent padding prevents the silhouette from smearing at texture edges.
            const blur = settings.leafBlur;
            const padding = Math.ceil(3 * blur + 2);
            const scale = Math.min(1, 768 / Math.max(leaf.width + padding * 2, leaf.height + padding * 2));
            const mask = document.createElement('canvas');
            mask.width = Math.ceil((leaf.width + padding * 2) * scale);
            mask.height = Math.ceil((leaf.height + padding * 2) * scale);
            const ctx = mask.getContext('2d');
            if (!ctx) throw new Error('Mask canvas unavailable');
            ctx.filter = `blur(${blur * scale}px)`;
            ctx.drawImage(foliageImage, padding * scale, padding * scale, leaf.width * scale, leaf.height * scale);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
            gl.uniform2f(uniforms.uLeafPadding, padding / leaf.width, padding / leaf.height);
            maskSignature = nextMaskSignature;
        }
        const sway = foliageSway(time, scene.motionDuration);
        const motion = settings.sway / 100;
        // CSS individual rotate/scale precede the animated transform list.
        const transform = new DOMMatrix().translate(leaf.x + leaf.width / 2, leaf.y + leaf.height / 2)
            .rotate(-scene.leafRotation).scale(-1, 1)
            .translate(sway[0] * scene.motionAmount * motion, sway[1] * scene.motionAmount * motion)
            .rotate(sway[2] * scene.motionRotation * motion).translate(-leaf.width / 2, -leaf.height / 2);
        setInverse(uniforms.uLeafFromWindow, transform);
    }
    function release() {
        if (!gl || lost) return;
        if (program) gl.deleteProgram(program);
        if (buffer) gl.deleteBuffer(buffer);
        if (foliageTexture) gl.deleteTexture(foliageTexture);
        shaders.splice(0).forEach(shader => gl.deleteShader(shader));
        program = buffer = uniforms = foliageTexture = null;
        foliageSignature = maskSignature = '';
    }
    function initGL() {
        if (program || lost || failed) return !!program;
        try {
            gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
            if (!gl) throw new Error('WebGL unavailable');
            const compile = (type, source) => {
                const shader = gl.createShader(type);
                shaders.push(shader);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
                return shader;
            };
            const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision ? 'highp' : 'mediump';
            const vertex = compile(gl.VERTEX_SHADER, vertexSource);
            const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource.replace('precision highp', `precision ${precision}`));
            program = gl.createProgram();
            gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
            gl.useProgram(program);
            buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            const position = gl.getAttribLocation(program, 'aPosition');
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            uniforms = Object.fromEntries(['uResolution', 'uColor', 'uGlowColor', 'uGlowOverride', 'uHueRotation', 'uMatchIntro', 'uTime', 'uStrength', 'uSaturation', 'uStyle', 'uScale', 'uDistortion', 'uSoftness', 'uDetail', 'uContrast', 'uDirection', 'uSeed',
                'uFoliageMask', 'uWindowFromScreen', 'uLeafFromWindow', 'uViewport', 'uWindowSize', 'uLeafSize', 'uLeafPadding', 'uLightCenter', 'uLightSpread', 'uFramePosition', 'uFoliagePaint', 'uDitherAmount', 'uTonalSteps', 'uStageInset'
            ].map(key => [key, gl.getUniformLocation(program, key)]));
            foliageTexture = gl.createTexture();
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, foliageTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
            gl.uniform1i(uniforms.uFoliageMask, 0);
            foliageSignature = maskSignature = '';
            size = null;
            return true;
        } catch (_) {
            release();
            failed = true;
            return false;
        }
    }
    function suspended() {
        return document.hidden || document.body.classList.contains('desktop-fullscreen-mode') || !!document.fullscreenElement || !!document.webkitFullscreenElement;
    }
    function animated() { return settings.speed > 0 && !reducedMotion.matches && (settings.style !== 'foliage' || settings.sway > 0); }
    function draw() {
        const nextSize = renderSize(window.innerWidth, window.innerHeight, settings.pixelSize);
        if (!size || nextSize.width !== size.width || nextSize.height !== size.height) {
            canvas.width = nextSize.width; canvas.height = nextSize.height;
            gl.viewport(0, 0, canvas.width, canvas.height);
        }
        size = nextSize;
        if (settings.style === 'foliage') drawFoliage();
        // Mobile keeps the video surround black; the light and its preview still
        // use the video's assigned palette. Desktop reads the interpolated mat.
        const colorSource = mobile.matches ? getComputedStyle(canvas).color : getComputedStyle(layer).backgroundColor;
        const rgb = colorSource.match(/[\d.]+/g);
        const color = rgb && rgb.length >= 3 ? rgb.slice(0, 3).map(value => Number(value) / 255) : [9 / 255, 26 / 255, 18 / 255];
        gl.uniform2f(uniforms.uResolution, size.width, size.height);
        const palette = scope.ReelFolioColors?.sample();
        const matchIntro = palette?.[10] ?? 0;
        gl.uniform3fv(uniforms.uColor, palette ? color.map((value, i) => value + (palette[6 + i] - value) * matchIntro) : color);
        gl.uniform1f(uniforms.uHueRotation, palette?.[9] ?? 0);
        gl.uniform1f(uniforms.uMatchIntro, matchIntro);
        gl.uniform3fv(uniforms.uGlowColor, palette ? palette.slice(0, 3) : color);
        gl.uniform1f(uniforms.uGlowOverride, palette?.[3] ?? 0);
        gl.uniform1f(uniforms.uTime, time);
        gl.uniform1f(uniforms.uStrength, Math.min(1, settings.strength / 100 * (palette?.[4] ?? 1)));
        gl.uniform1f(uniforms.uSaturation, palette?.[5] ?? settings.saturation / 100);
        gl.uniform1f(uniforms.uDitherAmount, settings.ditherAmount / 100);
        gl.uniform1f(uniforms.uTonalSteps, settings.tonalSteps);
        gl.uniform1f(uniforms.uStyle, looks[settings.style].index);
        gl.uniform1f(uniforms.uScale, 3.3 * Math.pow(2, (50 - settings.scale) / 45));
        gl.uniform1f(uniforms.uDistortion, settings.distortion / 100);
        gl.uniform1f(uniforms.uSoftness, settings.softness / 100);
        gl.uniform1f(uniforms.uDetail, settings.detail / 100);
        gl.uniform1f(uniforms.uContrast, settings.contrast / 100);
        gl.uniform1f(uniforms.uDirection, settings.direction);
        // Keep shader coordinates small enough for mobile fragment precision.
        gl.uniform1f(uniforms.uSeed, settings.seed % 100 + Math.floor(settings.seed / 100) * 0.013);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        root.toggleAttribute('data-dither-active', true);
        if (settings.style === 'foliage' && !panel.hidden && !controller.querySelector('#backgroundLight').hidden && previewContext) {
            // Copy this already-rendered frame, only while the controller is open.
            // The preview has no extra animation loop or shader pass.
            const scale = Math.min(576 / canvas.width, 360 / canvas.height, 1);
            const width = Math.max(1, Math.round(canvas.width * scale));
            const height = Math.max(1, Math.round(canvas.height * scale));
            if (preview.width !== width) preview.width = width;
            if (preview.height !== height) preview.height = height;
            previewContext.drawImage(canvas, 0, 0, preview.width, preview.height);
        }
    }
    function tick(now) {
        frame = 0;
        if (!settings.enabled || suspended() || lost || failed) { lastDraw = 0; return; }
        const interval = mobile.matches ? 1000 / 24 : 1000 / 30;
        if (dirty || !lastDraw || now - lastDraw >= interval - 1) {
            if (animated() && lastDraw) time += Math.min((now - lastDraw) / 1000, 0.1) * settings.speed / 30;
            try { draw(); } catch (_) {
                if (settings.style === 'foliage') foliageFailed = true;
                else { release(); failed = true; }
                syncControls(); lastDraw = 0; return;
            }
            lastDraw = now; dirty = false;
        }
        // Still frames wake only for controls, resize, or a color transition.
        if (animated() || now < colorUntil) frame = requestAnimationFrame(tick);
        else lastDraw = 0;
    }
    function wake() {
        dirty = true;
        if (frame) cancelAnimationFrame(frame);
        frame = 0; lastDraw = 0;
        if (settings.enabled && !suspended()) {
            if (settings.style === 'foliage' && (!foliageImage || foliageFailed)) {
                loadFoliage(); syncControls(); return;
            }
            if (initGL()) frame = requestAnimationFrame(tick);
            else syncControls();
        }
    }
    function syncControls() {
        const foliage = settings.style === 'foliage';
        root.toggleAttribute('data-dither-starting', settings.enabled && foliage && !foliageImage && !foliageFailed && !failed && !lost);
        root.toggleAttribute('data-dither-grid', settings.grid);
        if (scope.ReelFolioColors?.current()) scope.ReelFolioColors.refresh();
        else layer.style.setProperty('--mat-grid-opacity', settings.matBrightness / 100);
        root.setAttribute('data-dither-style', settings.style);
        if (!settings.enabled || failed || lost || (foliage && (!foliageImage || foliageFailed))) root.removeAttribute('data-dither-active');
        inputs.forEach(input => {
            const key = input.dataset.setting;
            if (input.type === 'checkbox') input.checked = settings[key];
            else {
                input.value = settings[key];
                const label = ['pixelSize', 'leafBlur', 'windowBlur'].includes(key) ? `${settings[key]} px`
                    : ['direction', 'windowAngle'].includes(key) ? `${settings[key]}°`
                    : key === 'tonalSteps' ? `${settings[key]} steps`
                    : key === 'speed' && settings.speed === 0 ? 'Still' : `${settings[key]}%`;
                input.closest('label').querySelector('output').textContent = label;
                input.setAttribute('aria-valuetext', label);
            }
        });
        options.disabled = !settings.enabled || failed || lost;
        controller.querySelector('[data-setting="grid"]').disabled = options.disabled;
        controller.querySelector('[data-setting="matBrightness"]').disabled = !options.disabled && !settings.grid;
        controller.querySelector('#ditherEnabled').disabled = failed || lost;
        status.textContent = failed ? 'Glow is unavailable in this browser. Showing the original mat.'
            : lost ? 'Restoring the glow. Showing the original mat for now.'
            : !settings.enabled ? 'Original mat background.'
            : foliage && foliageFailed ? 'Could not load the foliage. Showing the original mat. Try again below.'
            : foliage && !foliageImage ? 'Preparing your window and olive shadows…'
            : reducedMotion.matches ? 'Still glow respects your reduced motion setting.'
            : 'Colors follow the current video automatically.';
        controller.querySelector('.background-retry').hidden = !(foliage && foliageFailed && settings.enabled && !failed && !lost);
        controller.querySelector('[data-setting="speed"]').disabled = reducedMotion.matches;
        // These controls shape procedural fields; foliage has explicit scene controls.
        for (const key of ['scale', 'distortion', 'detail', 'direction', 'softness']) {
            controller.querySelector(`[data-setting="${key}"]`).closest('label').hidden = foliage;
        }
        controller.querySelector('.background-foliage-controls').hidden = !foliage;
        controller.querySelector('.background-foliage-placement').hidden = !foliage;
        controller.querySelector('.background-scene-preview').hidden = !foliage || !settings.enabled;
        preview.style.visibility = failed || lost || foliageFailed || !foliageImage ? 'hidden' : 'visible';
        controller.querySelector('.background-shuffle').hidden = foliage;
        const json = controller.querySelector('.background-json');
        if (!json.hidden) json.querySelector('textarea').value = exportSettings(settings, lookDrafts, scope.ReelFolioColors?.exportSettings());
        controller.querySelectorAll('[data-look]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.look === settings.style)));
        controller.querySelector('#backgroundLookDescription').textContent = looks[settings.style].description;
    }
    controller.addEventListener('click', event => {
        const button = event.target.closest('[data-look], .background-shuffle, .background-reset-look');
        if (!button || options.disabled) return;
        if (button.dataset.look) {
            if (button.dataset.look === settings.style) return;
            lookDrafts[settings.style] = lookSettings(settings);
            settings = normalize({ ...selectLook(settings, button.dataset.look), ...lookDrafts[button.dataset.look] });
        } else if (button.classList.contains('background-shuffle')) {
            settings = { ...settings, seed: (settings.seed + Math.floor(Math.random() * 9998)) % 9999 + 1 };
        } else {
            settings = selectLook({ ...settings, seed: defaults.seed }, settings.style);
        }
        wake(); syncControls(); save();
    });
    controller.addEventListener('input', event => {
        const key = event.target.dataset.setting;
        if (!key) return;
        settings = normalize({ ...settings, [key]: event.target.type === 'checkbox' ? event.target.checked : Number(event.target.value) });
        wake(); syncControls();
    });
    controller.addEventListener('change', event => { if (event.target.dataset.setting) save(); });
    controller.querySelector('.background-reset').addEventListener('click', () => {
        lookDrafts = {}; settings = { ...defaults }; wake(); syncControls(); save();
    });
    controller.querySelector('.background-retry').addEventListener('click', () => {
        foliageFailed = false; foliageSignature = maskSignature = ''; wake(); syncControls();
    });
    canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault(); lost = true;
        if (frame) cancelAnimationFrame(frame);
        frame = 0; program = buffer = uniforms = foliageTexture = null; foliageSignature = maskSignature = ''; shaders.length = 0;
        syncControls();
    });
    canvas.addEventListener('webglcontextrestored', () => {
        lost = false; failed = false; wake(); syncControls();
    });
    scope.addEventListener('reelfolio:palettechange', () => {
        colorUntil = performance.now() + 800;
        wake();
        const json = controller.querySelector('.background-json');
        if (!json.hidden) json.querySelector('textarea').value = exportSettings(settings, lookDrafts, scope.ReelFolioColors?.exportSettings());
    });
    scope.ReelFolioColors?.mount(controller, () => settings);
    new MutationObserver(() => {
        colorUntil = performance.now() + 800;
        wake();
    }).observe(root, { attributes: true, attributeFilter: ['style'] });
    let wasSuspended = suspended();
    function syncVisibility() {
        const next = suspended();
        if (next === wasSuspended) return;
        wasSuspended = next;
        if (next && document.body.classList.contains('desktop-fullscreen-mode')) setPanel(false);
        wake();
    }
    new MutationObserver(syncVisibility).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', syncVisibility);
    document.addEventListener('fullscreenchange', syncVisibility);
    document.addEventListener('webkitfullscreenchange', syncVisibility);
    window.addEventListener('resize', wake, { passive: true });
    window.addEventListener('pagehide', () => { if (frame) cancelAnimationFrame(frame); frame = 0; lastDraw = 0; });
    window.addEventListener('pageshow', wake);
    reducedMotion.addEventListener('change', () => { wake(); syncControls(); });
    wake(); syncControls();
})(typeof window !== 'undefined' ? window : globalThis);
