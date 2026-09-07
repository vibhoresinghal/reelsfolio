const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const api = require('../environment-shader.js');
// The exploratory renderer is retained offline, not shipped on the normal page.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
    + fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8')
    + fs.readFileSync(path.join(__dirname, '..', 'environment-lab.css'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'background-grid-controller.js'), 'utf8');
const declaration = backgroundSource.slice(backgroundSource.indexOf('    const defaults ='), backgroundSource.indexOf('    const state ='));
const backgroundDefaults = JSON.parse(vm.runInNewContext(`${declaration}; JSON.stringify(defaults)`));

test('every parameter has a controller and a connection to the scene or original CSS', () => {
    assert.deepEqual(api.fields.map(f => f[1]).sort(), Object.keys(api.defaults).sort());
    assert.equal(new Set(api.fields.map(f => f[1])).size, api.fields.length);
    for (const [, key] of api.fields) {
        if (key === 'scene') assert.deepEqual(api.fields.find(f => f[1] === key)[3], Object.keys(api.scenes));
        else if (api.extras[key]) assert.ok(html.includes(api.extras[key][0]), `${key} must be used in CSS`);
        else assert.ok(Object.hasOwn(backgroundDefaults, key), `${key} must map to the original controller`);
    }
});

test('shared defaults exactly match the original scene settings', () => {
    for (const [key, value] of Object.entries(api.defaults)) {
        if (Object.hasOwn(backgroundDefaults, key)) assert.deepEqual(value, backgroundDefaults[key], key);
    }
    assert.deepEqual(api.normalize(api.defaults), api.defaults);
    const css = api.extraProperties(api.defaults);
    assert.equal(css['--bg-window-shadow-rgb'], '38 29 18');
    assert.equal(css['--bg-foliage-rgb'], '31 27 20');
    assert.equal(css['--bg-stem-rgb'], '35 29 20');
    assert.equal(css['--bg-window-bar-x'], '36%');
    assert.equal(css['--bg-window-bar-y'], '52%');
    assert.equal(css['--bg-window-skew'], '1.5deg');
    assert.equal(css['--bg-right-leaf-opacity'], '0.9');
    assert.equal(css['--bg-right-motion-ratio'], '1.17');
    assert.equal(css['--bg-motion-easing'], 'cubic-bezier(0.45, 0.05, 0.55, 0.95)');
});

test('new sizing and softness controls are identity operations at reset', () => {
    const css = api.extraProperties(api.defaults);
    for (const key of ['--bg-window-width-scale', '--bg-window-height-scale', '--bg-plant-width-scale', '--bg-plant-height-scale']) assert.equal(css[key], '1');
    assert.equal(css['--bg-plant-softness'], '0px');
    assert.equal(css['--bg-left-leaf-rotation'], '0deg');
    assert.equal(css['--bg-right-leaf-rotation'], '0deg');
    assert.equal(css['--bg-window-bottom-left-reach'], '0%');
    assert.equal(css['--bg-window-left-fade'], '0%');
    assert.equal(css['--bg-foliage-flip'], '1');
});

test('each extra controller changes its mapped CSS property', () => {
    for (const [, key, , type, max] of api.fields.filter(f => api.extras[f[1]])) {
        const value = type === 'boolean' ? !api.defaults[key] : type === 'color' ? '#abcdef' : Array.isArray(type) ? type.find(v => v !== api.defaults[key]) : api.defaults[key] === max ? type : max;
        const css = api.extraProperties({ ...api.defaults, [key]: value });
        const property = api.extras[key][0];
        assert.notEqual(css[property], api.extraProperties(api.defaults)[property], key);
    }
});

test('window and foliage softness remain independent and preserve old drafts', () => {
    const base = { lightSoftness: 0, windowSoftness: 12, leafSoftness: 3 };
    const window = api.extraProperties({ ...base, windowSoftness: 40 });
    assert.equal(window['--bg-window-softness'], '40px');
    assert.equal(window['--bg-plant-softness'], '3px');
    const foliage = api.extraProperties({ ...base, leafSoftness: 45 });
    assert.equal(foliage['--bg-window-softness'], '12px');
    assert.equal(foliage['--bg-plant-softness'], '45px');
    assert.equal(api.normalize({ lightSoftness: 14, leafSoftness: 2 }).windowSoftness, 0);
    assert.equal(api.normalize({ windowSoftness: 999 }).windowSoftness, 60);
    assert.equal(api.normalize({ leafSoftness: 999 }).leafSoftness, 60);
});

test('import values are bounded and cannot inject CSS', () => {
    const s = api.normalize({ lightIntensity: 500, windowScale: -10, foliageMotionSpeed: Infinity, foliageColor: 'red);display:none', motionEasing: 'invalid', lightEnabled: 'false' });
    assert.equal(s.lightIntensity, 100);
    assert.equal(s.windowScale, 25);
    assert.equal(s.foliageMotionSpeed, 8);
    assert.equal(s.foliageColor, api.defaults.foliageColor);
    assert.equal(s.motionEasing, 'original');
    assert.equal(s.lightEnabled, true);
    assert.deepEqual(api.normalize(null), api.defaults);
});

test('all 45 tree looks plus the original use valid, editable parameters', () => {
    assert.equal(Object.keys(api.presets).length, 46);
    assert.equal(Object.keys(api.scenes).length, 6);
    assert.equal(new Set(Object.values(api.presets).map(p => JSON.stringify(p))).size, 46);
    assert.deepEqual(Object.values(api.presetGroups).flat(), Object.keys(api.presets));
    for (const preset of Object.values(api.presets)) {
        for (const key of Object.keys(preset)) assert.ok(Object.hasOwn(api.defaults, key));
        const settings = { ...api.defaults, ...preset };
        assert.deepEqual(api.normalize(settings), settings);
    }
});

test('tree masks are local PNGs with alpha and only trusted paths can enter CSS', () => {
    for (const [id, scene] of Object.entries(api.scenes)) {
        if (id === 'original') { assert.equal(scene.asset, undefined); continue; }
        const bytes = fs.readFileSync(path.join(__dirname, '..', scene.asset));
        assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
        assert.equal(bytes[25], 6, 'PNG must retain its alpha channel');
        assert.ok(bytes.readUInt32BE(16) >= 1024);
        assert.ok(api.treeProperties({ scene: id })['--bg-tree-mask'].includes(scene.asset));
    }
    assert.equal(api.normalize({ scene: 'url(https://example.com)' }).scene, 'original');
    assert.equal(api.treeProperties({ scene: '../outside.png' })['--bg-tree-mask'], 'none');
    assert.equal(api.treeProperties({ scene: 'airy-birch', foliageScale: 850 })['--bg-tree-scale'], '0.85');
    assert.deepEqual(api.normalize(JSON.parse(JSON.stringify(api.presets['Maple light · Golden hour']))),
        api.normalize(api.presets['Maple light · Golden hour']));
});

test('tree looks enter from the right while original and explicit draft orientations are preserved', () => {
    assert.equal(api.defaults.foliageFlip, false);
    for (const preset of Object.values(api.presets).filter(p => p.scene)) {
        assert.equal(preset.foliageFlip, true);
        assert.equal(preset.windowLeftFade, 18);
    }
    assert.equal(api.normalize({ scene: 'afternoon-branch' }).foliageFlip, true);
    assert.equal(api.normalize({ scene: 'afternoon-branch', foliageFlip: false }).foliageFlip, false);
    const draft = api.normalize({ scene: 'maple-light', foliageFlip: true, windowBottomLeftReach: 37, windowLeftFade: 24 });
    assert.deepEqual(api.normalize(JSON.parse(JSON.stringify(draft))), draft);
});

test('bottom-left aperture expansion keeps frame bars fixed without scaling content', () => {
    for (const reach of [0, 18, 50, 80]) {
        for (const bar of [5, 36, 52, 95]) {
            const s = api.normalize({ windowBottomLeftReach: reach, windowBarX: bar, windowBarY: bar });
            const props = api.apertureProperties(s);
            for (const axis of ['x', 'y']) {
                // Map the expanded plane coordinate back to the original window.
                const mapped = parseFloat(props[`--bg-window-extended-bar-${axis}`]) / 100 * (100 + reach) - reach;
                assert.ok(Math.abs(mapped - bar) < 1e-10);
            }
            assert.equal(s.windowScale, api.defaults.windowScale);
            assert.equal(s.windowFrameWidth, api.defaults.windowFrameWidth);
            assert.equal(s.foliageScale, api.defaults.foliageScale);
        }
    }
    assert.equal(api.normalize({ windowBottomLeftReach: 999 }).windowBottomLeftReach, 80);
    assert.equal(api.normalize({ windowLeftFade: -10 }).windowLeftFade, 0);
});

test('left fade covers the entire slanted edge at every extension without a corner-only gradient', () => {
    for (const reach of [0, 20, 50, 80]) {
        const mask = api.apertureProperties({ windowBottomLeftReach: reach, windowLeftFade: 35 })['--bg-window-left-fade-mask'];
        const svg = decodeURIComponent(mask.slice(mask.indexOf(',') + 1, -2));
        assert.ok(svg.includes('preserveAspectRatio="none"'));
        assert.ok(svg.includes('x2="35" y2="0"'));
        const [, shearText, startText] = svg.match(/gradientTransform="matrix\(1 0 ([\d.-]+) 1 ([\d.-]+) 0\)"/);
        const shear = Number(shearText), start = Number(startText);
        for (const y of [0, 25, 50, 75, 100]) {
            const boundaryX = (4 + reach) / (100 + reach) * 100 * (1 - y / 100);
            assert.ok(Math.abs(start + shear * y - boundaryX) < 1e-10, `fade must start on the left edge at y=${y}`);
        }
        assert.ok(!svg.includes('to top right'));
    }
    assert.equal(api.apertureProperties({ windowBottomLeftReach: 50, windowLeftFade: 0 })['--bg-window-left-fade-mask'], 'none');
    assert.equal(api.normalize({ windowLeftFade: 999 }).windowLeftFade, 100);
    assert.equal(api.normalize({ windowBottomLeftFade: 24 }).windowLeftFade, 24);
    assert.equal(api.normalize({ windowBottomLeftFade: 24, windowLeftFade: 0 }).windowLeftFade, 0);
    assert.ok(!Object.hasOwn(api.normalize({ windowBottomLeftFade: 24 }), 'windowBottomLeftFade'));
});

test('adapter preserves the original, loads trees atomically, handles races/failures, and cleans up', async () => {
    const keys = ['document', 'ReelFolioBackground', 'matchMedia', 'MutationObserver', 'Image'];
    const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const props = new Map([['--bg-window-skew', '2deg']]), attrs = new Set(), handlers = new Map(), calls = [], loads = [], statuses = [], planes = [];
    const mobile = { matches: false, addEventListener: (key, fn) => handlers.set('mobile', fn), removeEventListener() {} };
    try {
        globalThis.document = { hidden: false, body: { classList: { contains: () => false } }, documentElement: {
            style: { getPropertyValue: key => props.get(key) || '', getPropertyPriority: () => '', setProperty: (key, value) => props.set(key, value), removeProperty: key => props.delete(key) },
            hasAttribute: key => attrs.has(key), toggleAttribute: (key, value) => value ? attrs.add(key) : attrs.delete(key), removeAttribute: key => attrs.delete(key)
        }, addEventListener: (key, fn) => handlers.set(key, fn), removeEventListener() {},
        querySelector: () => ({ appendChild: plane => planes.push(plane) }),
        createElement: () => ({ setAttribute() {}, remove() { this.removed = true; } }) };
        globalThis.ReelFolioBackground = { getState: () => ({ ...backgroundDefaults }), applySettings: (s, source) => calls.push({ s, source }) };
        globalThis.matchMedia = () => mobile;
        globalThis.MutationObserver = class { observe() {} disconnect() {} };
        globalThis.Image = class { decode() { return new Promise((resolve, reject) => loads.push({ src: this.src, resolve, reject })); } };
        const renderer = api.mount({ onAssetState: s => statuses.push(s) });
        await renderer.update({ ...api.defaults, foliageScale: 600, windowBarX: 45 });
        assert.equal(calls.at(-1).s.lightPattern, 'window-foliage');
        assert.equal(calls.at(-1).s.foliageScale, 600);
        assert.equal(calls.at(-1).source, 'environment');
        assert.equal(props.get('--bg-window-bar-x'), '45%');
        await renderer.update(api.defaults);
        assert.equal(calls.at(-1).s.foliageScale, 400);
        assert.equal(loads.length, 0, 'original must not download tree images');
        await renderer.update({ windowSoftness: 20, lightSoftness: 0, leafSoftness: 4 });
        assert.ok(attrs.has('data-environment-aperture'), 'window softness alone must activate its separate paint plane');
        assert.equal(props.get('--bg-window-softness'), '20px');
        assert.equal(props.get('--bg-plant-softness'), '4px');
        await renderer.update(api.defaults);
        assert.ok(!attrs.has('data-environment-aperture'));
        const firstTree = renderer.update({ scene: 'afternoon-branch' });
        assert.ok(!attrs.has('data-environment-tree'), 'keep old scene visible until decode succeeds');
        loads[0].resolve(); await firstTree;
        assert.ok(attrs.has('data-environment-tree'));
        assert.ok(attrs.has('data-environment-foliage-flipped'));
        assert.ok(props.get('--bg-tree-mask').includes('afternoon-branch.png'));
        await renderer.update({ scene: 'afternoon-branch', foliageScale: 800 });
        assert.equal(loads.length, 1, 'slider edits reuse the decoded asset');
        assert.equal(props.get('--bg-tree-scale'), '0.8');
        await renderer.update({ scene: 'afternoon-branch', windowBottomLeftReach: 35, windowLeftFade: 20 });
        assert.ok(attrs.has('data-environment-aperture'));
        assert.equal(planes.length, 1);
        assert.equal(planes[0].className, 'bg-window-light-plane');
        await renderer.update({ scene: 'afternoon-branch', windowBottomLeftReach: 50 });
        assert.equal(planes.length, 1, 'reuse one paint plane while adjusting controls');
        const slowTree = renderer.update({ scene: 'olive-bough' });
        await renderer.update(api.defaults);
        loads[1].resolve(); await slowTree;
        assert.ok(!attrs.has('data-environment-tree'), 'late loads cannot replace Compare original');
        assert.ok(!attrs.has('data-environment-foliage-flipped'));
        assert.ok(!attrs.has('data-environment-aperture'));
        assert.equal(props.get('--bg-tree-mask'), 'none');
        const failTree = renderer.update({ scene: 'airy-birch' });
        loads[2].reject(new Error('offline')); await failTree;
        assert.ok(statuses.at(-1).error);
        assert.ok(!attrs.has('data-environment-tree'));
        assert.ok(!attrs.has('data-environment-foliage-flipped'));
        assert.ok(!attrs.has('data-environment-aperture'));
        const retry = renderer.update({ scene: 'airy-birch' });
        loads[3].resolve(); await retry;
        assert.ok(attrs.has('data-environment-tree'));
        document.hidden = true; handlers.get('visibilitychange')();
        assert.ok(attrs.has('data-environment-paused'));
        document.hidden = false; mobile.matches = true; handlers.get('mobile')();
        assert.ok(attrs.has('data-environment-paused'));
        mobile.matches = false; handlers.get('mobile')();
        assert.ok(!attrs.has('data-environment-paused'));
        const interrupted = renderer.update({ scene: 'maple-light' });
        renderer.destroy();
        loads[4].resolve(); await interrupted;
        assert.deepEqual(calls.at(-1).s, backgroundDefaults);
        assert.equal(props.get('--bg-window-skew'), '2deg');
        assert.ok(!props.has('--bg-window-bar-x'));
        assert.ok(!props.has('--bg-tree-mask'));
        assert.ok(!attrs.has('data-environment-tree'));
        assert.ok(!attrs.has('data-environment-foliage-flipped'));
        assert.ok(!attrs.has('data-environment-aperture'));
        assert.equal(planes[0].removed, true);
    } finally {
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
        }
    }
});
