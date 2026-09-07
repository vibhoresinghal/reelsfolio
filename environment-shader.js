/* Original window projector, with optional photographic tree-shadow masks. */
((scope) => {
    'use strict';
    const scenes = {
        original: { label: 'Original scene', description: 'The original window, leaf gradients, and sway. Nothing replaced.' },
        'afternoon-branch': { label: 'Afternoon branch', description: 'Connected boughs and loose oval leaves. The closest starting point to the warm-wall reference.' },
        'airy-birch': { label: 'Airy birch', description: 'Fine cascading twigs, small leaves, and more breathing room between shadows.' },
        'olive-bough': { label: 'Olive bough', description: 'Slender leaves and open branching, for a lighter Mediterranean feel.' },
        'broad-canopy': { label: 'Broad canopy', description: 'Overlapping broad leaves and deeper shade, softened like a more distant tree.' },
        'maple-light': { label: 'Maple light', description: 'Recognizable maple leaves, visible branches, and a mix of focused and diffuse shadows.' }
    };
    for (const [id, scene] of Object.entries(scenes)) {
        if (id !== 'original') scene.asset = `assets/environment/${id}.png`;
    }
    const defaults = {
        scene: 'original',
        lightEnabled: true, lightIntensity: 46, lightColor: '#ffe0b7', lightBlend: 'soft-light',
        lightSoftness: 14, lightX: 43, lightY: -37, lightSpreadX: 63, lightSpreadY: 168,
        windowX: 0, windowY: 0, windowScale: 100, windowRotation: -20, windowFrameWidth: 39,
        windowShadowOpacity: 77, windowSkew: 1.5, windowWidth: 100, windowHeight: 100,
        windowBarX: 36, windowBarY: 52, windowColor: '#261d12', windowBottomLeftReach: 0, windowLeftFade: 0, windowSoftness: 0,
        foliageScale: 400, foliageDensity: 100, foliageShadowOpacity: 77,
        foliageColor: '#1f1b14', stemColor: '#231d14', plantWidth: 100, plantHeight: 100, leafSoftness: 0,
        leftLeafX: 48, leftLeafY: -18, rightLeafX: 31, rightLeafY: 37,
        leftOpacity: 100, rightOpacity: 90, leftRotation: 0, rightRotation: 0, foliageFlip: false,
        foliageMotion: true, foliageMotionAmount: 33, foliageMotionRotation: 3.9, foliageMotionSpeed: 8,
        rightMotionRatio: 1.17, leftDelay: 0, rightDelay: 0, motionEasing: 'original'
    };
    const fields = [
        // Rendered by the scene dropdown rather than the grouped sliders.
        ['Scene', 'scene', 'Foliage source', Object.keys(scenes)],
        ['Light', 'lightEnabled', 'Show light & foliage', 'boolean'],
        ['Light', 'lightIntensity', 'Light strength', 0, 100, 1, '%'],
        ['Light', 'lightColor', 'Sunlight color', 'color'],
        ['Light', 'lightBlend', 'Blend with background', ['soft-light', 'normal', 'overlay', 'screen', 'multiply', 'color-dodge']],
        ['Light', 'lightSoftness', 'Shared softness (both)', 0, 60, 1, 'px'],
        ['Light', 'lightX', 'Light source X', -50, 150, 1, '%'],
        ['Light', 'lightY', 'Light source Y', -80, 150, 1, '%'],
        ['Light', 'lightSpreadX', 'Horizontal light spread', 10, 200, 1, '%'],
        ['Light', 'lightSpreadY', 'Vertical light spread', 10, 240, 1, '%'],
        ['Window', 'windowX', 'Horizontal position', -800, 800, 5, 'px'],
        ['Window', 'windowY', 'Vertical position', -600, 600, 5, 'px'],
        ['Window', 'windowScale', 'Window scale', 25, 200, 1, '%'],
        ['Window', 'windowRotation', 'Window rotation', -65, 65, 1, '°'],
        ['Window', 'windowSkew', 'Window skew', -30, 30, 0.5, '°'],
        ['Window', 'windowWidth', 'Width stretch', 40, 180, 1, '%'],
        ['Window', 'windowHeight', 'Height stretch', 40, 180, 1, '%'],
        ['Window', 'windowBottomLeftReach', 'Bottom-left extension', 0, 80, 1, '%'],
        ['Window', 'windowLeftFade', 'Left-edge fade', 0, 100, 1, '%'],
        ['Window', 'windowSoftness', 'Window softness', 0, 60, 0.5, 'px'],
        ['Window', 'windowFrameWidth', 'Frame thickness', 2, 80, 1, 'px'],
        ['Window', 'windowBarX', 'Vertical bar position', 5, 95, 1, '%'],
        ['Window', 'windowBarY', 'Horizontal bar position', 5, 95, 1, '%'],
        ['Window', 'windowShadowOpacity', 'Frame & stem shadow', 0, 100, 1, '%'],
        ['Window', 'windowColor', 'Frame shadow tint', 'color'],
        ['Foliage', 'foliageScale', 'Cluster size', 80, 2200, 5, 'px'],
        ['Foliage', 'plantWidth', 'Cluster width', 30, 200, 1, '%'],
        ['Foliage', 'plantHeight', 'Cluster height', 30, 200, 1, '%'],
        ['Foliage', 'foliageShadowOpacity', 'Main leaf shadow', 0, 100, 1, '%'],
        ['Foliage', 'foliageDensity', 'Secondary leaf shadow', 0, 100, 1, '%'],
        ['Foliage', 'leafSoftness', 'Foliage softness', 0, 60, 0.5, 'px'],
        ['Foliage', 'foliageColor', 'Leaf shadow tint', 'color'],
        ['Foliage', 'stemColor', 'Stem shadow tint', 'color'],
        ['Placement', 'foliageFlip', 'Flip foliage horizontally', 'boolean'],
        ['Placement', 'leftLeafX', 'Left cluster X', -60, 140, 1, '%'],
        ['Placement', 'leftLeafY', 'Left cluster bottom offset', -80, 100, 1, '%'],
        ['Placement', 'rightLeafX', 'Right cluster X', -60, 140, 1, '%'],
        ['Placement', 'rightLeafY', 'Right cluster bottom offset', -80, 100, 1, '%'],
        ['Placement', 'leftOpacity', 'Left cluster opacity', 0, 100, 1, '%'],
        ['Placement', 'rightOpacity', 'Right cluster opacity', 0, 100, 1, '%'],
        ['Placement', 'leftRotation', 'Left cluster tilt', -90, 90, 1, '°'],
        ['Placement', 'rightRotation', 'Right cluster tilt', -90, 90, 1, '°'],
        ['Motion', 'foliageMotion', 'Animate foliage', 'boolean'],
        ['Motion', 'foliageMotionAmount', 'Breeze travel', 0, 100, 1, 'px'],
        ['Motion', 'foliageMotionRotation', 'Foliage sway', 0, 15, 0.1, '°'],
        ['Motion', 'foliageMotionSpeed', 'Sway duration', 2, 30, 0.5, 's'],
        ['Motion', 'rightMotionRatio', 'Right cluster duration multiplier', 0.5, 2, 0.01, '×'],
        ['Motion', 'leftDelay', 'Left motion phase offset', -30, 0, 0.5, 's'],
        ['Motion', 'rightDelay', 'Right motion phase offset', -30, 0, 0.5, 's'],
        ['Motion', 'motionEasing', 'Sway easing', ['original', 'sine', 'linear']]
    ];
    // Five original assets × nine projection/lighting treatments = 45 tree looks.
    // These are intentionally labelled as treatments, not 45 different tree images.
    const treeBase = {
        foliageFlip: true, windowLeftFade: 18,
        lightIntensity: 63, lightSoftness: 9, lightX: 39, lightY: 14,
        lightSpreadX: 86, lightSpreadY: 142, windowFrameWidth: 17,
        windowShadowOpacity: 63, windowRotation: -17, windowBarX: 42,
        foliageScale: 900, foliageShadowOpacity: 83, foliageDensity: 60,
        leftLeafX: -9, leftLeafY: -24, rightLeafX: 40, rightLeafY: 9,
        leftOpacity: 100, rightOpacity: 48, leftRotation: 3, rightRotation: -13,
        foliageMotionAmount: 26, foliageMotionRotation: 2.4, foliageMotionSpeed: 7,
        rightMotionRatio: 1.31, rightDelay: -3.5, motionEasing: 'sine'
    };
    const treatments = {
        'Reference light': {},
        'Soft afternoon': { lightSoftness: 17, leafSoftness: 3, lightIntensity: 57, lightColor: '#ffe4c3' },
        'Close to the glass': { lightSoftness: 3, leafSoftness: 0, foliageScale: 680, windowShadowOpacity: 76, foliageShadowOpacity: 92 },
        'Distant tree': { lightSoftness: 22, leafSoftness: 4, foliageScale: 590, plantWidth: 120, rightOpacity: 66 },
        'Open window': { windowFrameWidth: 5, windowShadowOpacity: 28, lightSpreadX: 120, lightSpreadY: 180, rightOpacity: 24 },
        'Golden hour': { lightColor: '#ffd08d', lightIntensity: 74, windowRotation: -31, windowSkew: 7, windowBarX: 58, windowShadowOpacity: 70, plantWidth: 130, leftRotation: -12 },
        'Cool morning': { lightColor: '#e0ecf7', lightIntensity: 66, windowRotation: -9, lightX: 60, lightY: -10, lightSoftness: 7, rightOpacity: 63, foliageColor: '#222b38', stemColor: '#28343c' },
        'Canopy overhead': { foliageScale: 1130, leftLeafY: -6, leftLeafX: -20, rightLeafY: 34, rightLeafX: 54, leftRotation: 19, rightRotation: -29, rightOpacity: 61 },
        'Passing breeze': { foliageMotionAmount: 57, foliageMotionRotation: 4.5, foliageMotionSpeed: 4.5, rightMotionRatio: 1.43, rightDelay: -1.5, leftDelay: -0.5 }
    };
    const familySettings = {
        'afternoon-branch': {},
        'airy-birch': { leftLeafY: -33, leftRotation: -5, foliageScale: 850, rightOpacity: 35 },
        'olive-bough': { foliageScale: 760, leftLeafX: -3, leftLeafY: -14, rightLeafX: 45, rightOpacity: 38 },
        'broad-canopy': { foliageScale: 1080, leftLeafX: -22, leftLeafY: -35, leafSoftness: 2, rightOpacity: 38 },
        'maple-light': { foliageScale: 850, leftLeafY: -24, rightLeafY: 18, rightOpacity: 42 }
    };
    const presets = { 'Original scene': {} };
    const presetGroups = { 'Original scene': ['Original scene'] };
    for (const [id, family] of Object.entries(familySettings)) {
        presetGroups[scenes[id].label] = [];
        for (const [name, treatment] of Object.entries(treatments)) {
            const label = `${scenes[id].label} · ${name}`;
            presets[label] = { ...treeBase, ...family, ...treatment, scene: id };
            presetGroups[scenes[id].label].push(label);
        }
    }
    const easing = { original: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)', sine: 'cubic-bezier(0.37, 0, 0.63, 1)', linear: 'linear' };
    const extras = {
        windowSkew: ['--bg-window-skew', 'deg'], windowWidth: ['--bg-window-width-scale', 'ratio'],
        windowHeight: ['--bg-window-height-scale', 'ratio'], windowBarX: ['--bg-window-bar-x', '%'],
        windowBarY: ['--bg-window-bar-y', '%'], windowColor: ['--bg-window-shadow-rgb', 'rgb'],
        windowBottomLeftReach: ['--bg-window-bottom-left-reach', '%'], windowLeftFade: ['--bg-window-left-fade', '%'],
        windowSoftness: ['--bg-window-softness', 'px'],
        foliageFlip: ['--bg-foliage-flip', 'sign'],
        foliageColor: ['--bg-foliage-rgb', 'rgb'], stemColor: ['--bg-stem-rgb', 'rgb'],
        foliageShadowOpacity: ['--bg-foliage-shadow-opacity', 'ratio'], plantWidth: ['--bg-plant-width-scale', 'ratio'],
        plantHeight: ['--bg-plant-height-scale', 'ratio'], leafSoftness: ['--bg-plant-softness', 'px'],
        leftOpacity: ['--bg-left-leaf-opacity', 'ratio'], rightOpacity: ['--bg-right-leaf-opacity', 'ratio'],
        leftRotation: ['--bg-left-leaf-rotation', 'deg'], rightRotation: ['--bg-right-leaf-rotation', 'deg'],
        rightMotionRatio: ['--bg-right-motion-ratio', ''], leftDelay: ['--bg-left-motion-delay', 's'],
        rightDelay: ['--bg-right-motion-delay', 's'], motionEasing: ['--bg-motion-easing', 'easing']
    };
    function normalize(input = {}) {
        const result = { ...defaults };
        for (const [, key, , type, max] of fields) {
            // Preserve saved drafts from before the corner-fade correction.
            const value = key === 'windowLeftFade' && input?.[key] === undefined
                ? input?.windowBottomLeftFade : input?.[key];
            if (type === 'boolean' && typeof value === 'boolean') result[key] = value;
            else if (type === 'color' && typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) result[key] = value;
            else if (Array.isArray(type) && type.includes(value)) result[key] = value;
            else if (typeof type === 'number' && typeof value === 'number' && Number.isFinite(value)) result[key] = Math.max(type, Math.min(max, value));
        }
        // Earlier tree drafts predate the flip control; use the new right-entry
        // default unless a saved draft explicitly chooses its own orientation.
        if (result.scene !== 'original' && typeof input?.foliageFlip !== 'boolean') result.foliageFlip = true;
        return result;
    }
    function extraProperties(input) {
        const s = normalize(input);
        return Object.fromEntries(Object.entries(extras).map(([key, [css, unit]]) => {
            const value = unit === 'ratio' ? String(s[key] / 100) : unit === 'rgb'
                ? [1, 3, 5].map(i => parseInt(s[key].slice(i, i + 2), 16)).join(' ')
                : unit === 'easing' ? easing[s[key]] : unit === 'sign' ? (s[key] ? '-1' : '1') : `${s[key]}${unit}`;
            return [css, value];
        }));
    }
    function treeProperties(input) {
        const s = normalize(input);
        return {
            '--bg-tree-mask': scenes[s.scene].asset ? `url("${scenes[s.scene].asset}")` : 'none',
            '--bg-tree-scale': String(s.foliageScale / 1000)
        };
    }
    function apertureProperties(input) {
        const s = normalize(input);
        const reach = s.windowBottomLeftReach;
        // The expanded aperture's left edge runs from this top X to 0 at
        // the bottom. Shear the fade with that edge, so extending the corner
        // cannot leave the upper half harsh or make only the corner fade.
        const edgeTop = (4 + reach) / (100 + reach) * 100;
        const mask = s.windowLeftFade === 0 ? 'none' : `url("data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${s.windowLeftFade}" y2="0" gradientTransform="matrix(1 0 ${-edgeTop / 100} 1 ${edgeTop} 0)"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset=".25" stop-color="white" stop-opacity=".15625"/><stop offset=".5" stop-color="white" stop-opacity=".5"/><stop offset=".75" stop-color="white" stop-opacity=".84375"/><stop offset="1" stop-color="white"/></linearGradient></defs><path d="M0 0H100V100H0Z" fill="url(#fade)"/></svg>`
        )}")`;
        // The paint plane grows left/down, but the frame bars stay at exactly
        // the same coordinates in the original window box (and keep their px width).
        return {
            '--bg-window-extended-bar-x': `${(s.windowBarX + reach) / (100 + reach) * 100}%`,
            '--bg-window-extended-bar-y': `${(s.windowBarY + reach) / (100 + reach) * 100}%`,
            '--bg-window-left-fade-mask': mask
        };
    }
    function mount({ onAssetState = () => {} } = {}) {
        const bridge = scope.ReelFolioBackground;
        if (!bridge) throw new Error('Original background controller is not loaded');
        const root = document.documentElement;
        const original = bridge.getState();
        const originalExtras = [...Object.values(extras).map(([key]) => key), ...Object.keys(treeProperties(defaults)), ...Object.keys(apertureProperties(defaults))]
            .map(key => [key, root.style.getPropertyValue(key), root.style.getPropertyPriority(key)]);
        const originalAttributes = ['data-environment-tree', 'data-environment-foliage-flipped', 'data-environment-aperture']
            .map(key => [key, root.hasAttribute(key)]);
        let paintPlane;
        const decoded = new Map();
        let revision = 0, destroyed = false;
        function loadAsset(scene) {
            if (!decoded.has(scene)) {
                const img = new Image();
                img.src = scenes[scene].asset;
                decoded.set(scene, img.decode().catch(error => { decoded.delete(scene); throw error; }));
            }
            return decoded.get(scene);
        }
        const mobile = matchMedia('(max-width: 600px)');
        const syncPause = () => root.toggleAttribute('data-environment-paused', document.hidden || mobile.matches || document.body.classList.contains('desktop-fullscreen-mode'));
        const observer = new MutationObserver(syncPause);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        document.addEventListener('visibilitychange', syncPause);
        mobile.addEventListener('change', syncPause);
        syncPause();
        return {
            async update(input) {
                if (destroyed) return;
                const request = ++revision;
                const s = normalize(input);
                if (s.scene !== 'original') {
                    onAssetState({ scene: s.scene, loading: true });
                    try { await loadAsset(s.scene); }
                    catch {
                        if (request === revision) onAssetState({ scene: s.scene, error: true });
                        return; // Keep the previous scene intact if the asset cannot load.
                    }
                }
                if (request !== revision || destroyed) return;
                const aperture = s.windowBottomLeftReach > 0 || s.windowLeftFade > 0 || s.windowSoftness > 0;
                if (aperture && !paintPlane) {
                    const texture = document.querySelector('.bg-light-texture');
                    if (texture) {
                        paintPlane = document.createElement('div');
                        paintPlane.className = 'bg-window-light-plane';
                        paintPlane.setAttribute('aria-hidden', 'true');
                        texture.appendChild(paintPlane);
                    }
                }
                for (const [property, value] of Object.entries({ ...extraProperties(s), ...treeProperties(s), ...apertureProperties(s) })) root.style.setProperty(property, value);
                root.toggleAttribute('data-environment-tree', s.scene !== 'original');
                root.toggleAttribute('data-environment-foliage-flipped', s.foliageFlip);
                root.toggleAttribute('data-environment-aperture', aperture);
                bridge.applySettings({ ...s, lightPattern: 'window-foliage' }, 'environment');
                onAssetState({ scene: s.scene, loading: false });
            },
            destroy() {
                destroyed = true; revision++;
                observer.disconnect(); document.removeEventListener('visibilitychange', syncPause); mobile.removeEventListener('change', syncPause);
                for (const [key, value, priority] of originalExtras) {
                    if (value) root.style.setProperty(key, value, priority); else root.style.removeProperty(key);
                }
                root.removeAttribute('data-environment-paused');
                for (const [key, enabled] of originalAttributes) root.toggleAttribute(key, enabled);
                paintPlane?.remove();
                bridge.applySettings(original, 'environment');
            }
        };
    }
    const api = { defaults, fields, scenes, treatments, presets, presetGroups, extras, normalize, extraProperties, treeProperties, apertureProperties, mount };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else scope.ReelFolioEnvironment = api;
})(typeof window !== 'undefined' ? window : globalThis);
