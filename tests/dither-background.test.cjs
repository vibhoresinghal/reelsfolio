const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaults, looks, normalize, selectLook, lookSettings, exportSettings, foliageLayout, foliageSway, renderSize } = require('../dither-background.js');

test('invalid or old stored preferences cannot disable the default or corrupt the renderer', () => {
    for (const value of [null, undefined, 'invalid', [], {}, { unrelated: true }]) {
        assert.deepEqual(normalize(value), defaults);
    }
    assert.deepEqual(normalize({ enabled: 'false', grid: 1, strength: NaN, speed: Infinity, pixelSize: '2' }), defaults);
    assert.deepEqual(normalize({ enabled: false, grid: true, strength: 0, speed: 0, pixelSize: 1 }),
        { ...defaults, enabled: false, grid: true, strength: 0, speed: 0, pixelSize: 1 });
});

test('persisted settings are bounded and round-trip without dropping off/still/zero values', () => {
    assert.deepEqual(normalize({ enabled: false, grid: true, strength: -2, speed: 150, pixelSize: 0 }),
        { ...defaults, enabled: false, grid: true, strength: 0, speed: 100, pixelSize: 1 });
    assert.equal(normalize({ pixelSize: 4000 }).pixelSize, 5);
    const saved = { ...defaults, enabled: false, strength: 0, speed: 0, pixelSize: 2.5, grid: true };
    assert.deepEqual(normalize(JSON.parse(JSON.stringify(saved))), saved);
    assert.deepEqual(normalize({ ...saved, injected: 'ignored' }), saved);
    assert.equal(defaults.enabled, true);
});

test('old settings migrate to the new default look without changing saved off, still, or grid preferences', () => {
    const legacy = { enabled: false, strength: 45, speed: 0, pixelSize: 3, grid: true };
    assert.deepEqual(normalize(legacy), { ...defaults, ...legacy });
    assert.equal(normalize({ style: 'constructor' }).style, defaults.style);
    assert.equal(normalize({ style: '__proto__' }).style, defaults.style);
    assert.equal(normalize({ style: null }).style, defaults.style);
});

test('every look has complete bounded starting settings and preserves the shared treatment', () => {
    const current = { ...defaults, enabled: false, strength: 42, saturation: 175, matBrightness: 70, pixelSize: 3.5, grid: true, seed: 98 };
    assert.equal(new Set(Object.values(looks).map(look => look.index)).size, Object.keys(looks).length);
    for (const [style, look] of Object.entries(looks)) {
        const selected = selectLook(current, style);
        assert.equal(selected.style, style);
        for (const [key, value] of Object.entries(look.settings)) assert.equal(selected[key], value, `${style}: ${key}`);
        for (const key of ['enabled', 'strength', 'saturation', 'matBrightness', 'pixelSize', 'grid', 'seed']) assert.equal(selected[key], current[key]);
        assert.deepEqual(normalize(JSON.parse(JSON.stringify(selected))), selected);
    }
    assert.deepEqual(selectLook(current, 'unknown'), current);
});

test('per-look drafts store only shape and motion, and sanitize damaged saved values', () => {
    const custom = { ...selectLook(defaults, 'water'), scale: 93, speed: 0, direction: 135, seed: 542 };
    const draft = lookSettings(custom);
    for (const key of ['enabled', 'grid', 'strength', 'saturation', 'matBrightness', 'pixelSize', 'style']) assert.ok(!Object.hasOwn(draft, key));
    const restored = normalize({ ...selectLook({ ...defaults, strength: 10 }, 'water'), ...draft });
    assert.equal(restored.scale, 93);
    assert.equal(restored.speed, 0);
    assert.equal(restored.direction, 135);
    assert.equal(restored.seed, 542);
    assert.equal(restored.strength, 10);
    const damaged = lookSettings({ style: 'water', scale: -2, direction: 800, detail: Infinity, seed: NaN });
    assert.equal(damaged.scale, 20);
    assert.equal(damaged.direction, 360);
    assert.equal(damaged.detail, looks.water.settings.detail);
    assert.equal(damaged.seed, defaults.seed);
});

test('new color controls fill in missing values without replacing existing look adjustments', () => {
    const prior = { style: 'drift', enabled: true, scale: 23, distortion: 15, speed: 96, strength: 39, grid: true, softness: 82, detail: 17, contrast: 51, direction: 145, seed: 432, pixelSize: 3 };
    assert.deepEqual(normalize(prior), { ...selectLook(defaults, 'drift'), ...prior });
    const zero = normalize({ ...prior, saturation: 0, matBrightness: 0 });
    assert.equal(zero.saturation, 0);
    assert.equal(zero.matBrightness, 0);
    assert.deepEqual(normalize(JSON.parse(JSON.stringify(zero))), zero);
    assert.equal(normalize({ saturation: 999 }).saturation, 250);
    assert.equal(normalize({ matBrightness: -1 }).matBrightness, 0);
    assert.equal(normalize({ saturation: '200', matBrightness: NaN }).saturation, defaults.saturation);
});

test('fresh and reset defaults export the entire approved JSON, including every saved look', () => {
    const approved = require('../dither-default.json');
    assert.deepEqual(defaults, approved.settings);
    assert.deepEqual(normalize(null), defaults);
    assert.deepEqual(JSON.parse(exportSettings(defaults)), approved);
    for (const [style, expected] of Object.entries(approved.looks)) {
        assert.deepEqual(lookSettings(selectLook(defaults, style)), expected, style);
    }
});

test('JSON exports the current unsaved controls, hidden fine tuning, and other look drafts', () => {
    const current = { ...selectLook(defaults, 'foliage'), softness: 17, speed: 0, grid: false, seed: 42, pixelSize: 2.5 };
    const drafts = { drift: { ...looks.drift.settings, seed: 174, detail: 78 }, foliage: { softness: 90 }, unknown: { injected: true } };
    const before = JSON.stringify(drafts);
    const exported = JSON.parse(exportSettings(current, drafts));
    assert.equal(exported.version, 2);
    assert.equal(exported.renderer, 'dither-glow');
    assert.deepEqual(normalize(exported.settings), current);
    assert.deepEqual(exported.looks.foliage, lookSettings(current));
    assert.equal(exported.looks.drift.seed, 174);
    assert.equal(exported.looks.drift.detail, 78);
    assert.deepEqual(exported.looks.water, lookSettings({ style: 'water' }));
    assert.ok(!Object.hasOwn(exported.looks, 'unknown'));
    assert.equal(exported.foliage.mask, 'assets/environment/olive-bough-mask.webp');
    assert.equal(JSON.stringify(drafts), before, 'export must not mutate remembered looks');
    assert.deepEqual(JSON.parse(exportSettings(null, null)).settings, defaults);
});

test('combined controls bound old or damaged drafts and preserve true sharp, smooth, and still values', () => {
    const legacy = normalize({ style: 'foliage', softness: 100, strength: 33, saturation: 218 });
    assert.equal(legacy.leafBlur, 11, 'legacy shared blur must not replace the approved leaf blur');
    assert.equal(legacy.windowBlur, 14);
    assert.equal(legacy.tonalSteps, 3);
    const zero = normalize({ ...legacy, leafBlur: 0, windowBlur: 0, shadowDepth: 0, ditherAmount: 0, sway: 0 });
    for (const key of ['leafBlur', 'windowBlur', 'shadowDepth', 'ditherAmount', 'sway']) assert.equal(zero[key], 0);
    assert.deepEqual(normalize(JSON.parse(JSON.stringify(zero))), zero);
    const bad = normalize({ leafBlur: -5, windowBlur: 999, shadowDepth: Infinity, treeSize: 0,
        treeX: -999, treeY: 999, windowAngle: 90, sway: 999, ditherAmount: '70', tonalSteps: 99 });
    assert.deepEqual([bad.leafBlur, bad.windowBlur, bad.shadowDepth, bad.treeSize, bad.treeX, bad.treeY,
        bad.windowAngle, bad.sway, bad.ditherAmount, bad.tonalSteps], [0, 60, 85, 40, -50, 50, 45, 200, 72, 8]);
});

test('foliage scene and dithering round-trip together without changing other looks or shared color', () => {
    const current = { ...selectLook(defaults, 'foliage'), leafBlur: 0, windowBlur: 40, shadowDepth: 98,
        treeX: -15, treeY: 8, treeSize: 120, windowAngle: -25, sway: 0, ditherAmount: 65, tonalSteps: 2 };
    const draft = lookSettings(current);
    const drift = selectLook(current, 'drift');
    assert.equal(drift.ditherAmount, 100);
    assert.equal(drift.tonalSteps, 5);
    const restored = normalize({ ...selectLook(drift, 'foliage'), ...draft });
    assert.deepEqual(restored, current);
    const exported = JSON.parse(exportSettings(current));
    assert.deepEqual(exported.looks.foliage, draft);
    assert.equal(exported.settings.leafBlur, 0);
    assert.ok(!Object.hasOwn(exported.looks.drift, 'leafBlur'));
    const reset = selectLook(current, 'foliage');
    assert.equal(reset.leafBlur, 11);
    assert.equal(reset.treeX, 0);
    assert.equal(reset.tonalSteps, 3);
    for (const key of ['strength', 'saturation', 'matBrightness', 'pixelSize']) assert.equal(reset[key], current[key]);
});

test('tree placement and blur adjustments leave the window geometry independent', () => {
    const base = foliageLayout(1440, 900);
    const changed = foliageLayout(1440, 900, {}, { treeSize: 150, treeX: -10, treeY: 20, leafBlur: 100, windowBlur: 60 });
    assert.deepEqual(changed.window, base.window);
    assert.deepEqual(changed.stage, base.stage);
    assert.ok(Math.abs(changed.leaf.width / base.leaf.width - 1.5) < .0001);
    assert.ok(Math.abs(changed.leaf.height / base.leaf.height - 1.5) < .0001);
    assert.ok(Math.abs(changed.leaf.x + changed.leaf.width - base.leaf.x - base.leaf.width + base.window.width * .1) < .0001);
    assert.ok(Math.abs(changed.leaf.y + changed.leaf.height - base.leaf.y - base.leaf.height - base.window.height * .2) < .0001);
});

test('foliage keeps the production window and tree placement across viewport shapes', () => {
    const chosen = require('../environment-default.json').settings;
    const scene = { lightSoftness: chosen.lightSoftness, treeScale: chosen.foliageScale / 1000,
        plantWidth: chosen.plantWidth / 100, plantHeight: chosen.plantHeight / 100,
        leafX: chosen.leftLeafX, leafY: chosen.leftLeafY };
    for (const [width, height] of [[1440, 900], [1920, 1080], [768, 1024], [390, 844]]) {
        const layout = foliageLayout(width, height, scene);
        assert.deepEqual(layout, foliageLayout(width, height), 'mobile fallback matches the approved scene');
        const { stage, window, leaf } = layout;
        assert.equal(stage.width, width + 24);
        assert.equal(stage.height, height + 24);
        assert.ok(Math.abs(window.x + 12 - stage.width * .12) < .0001);
        assert.ok(Math.abs(window.y + 12 - stage.height * .03) < .0001);
        assert.ok(Math.abs(leaf.width / leaf.height - .99) < .0001, 'viewport aspect must not stretch the tree');
        assert.ok(Math.abs(window.width - leaf.x - leaf.width - window.width * -.03) < .0001);
        assert.ok(Math.abs(window.height - leaf.y - leaf.height - window.height * -.14) < .0001);
    }
});

test('foliage sway retains the original keyframes and continuous alternate motion', () => {
    const near = (actual, expected) => actual.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) < .0001));
    near(foliageSway(0), [-.3, 0, -.55]);
    near(foliageSway(2.6), [.12, -.16, .22]);
    near(foliageSway(5), [.38, 0, .62]);
    near(foliageSway(7.4), [.12, -.16, .22]);
    near(foliageSway(10), [-.3, 0, -.55]);
    near(foliageSway(3), foliageSway(13));
    near(foliageSway(3), foliageSway(6, 10));
    near(foliageSway(5 - .00001), foliageSway(5 + .00001));
    near(foliageSway(10 - .00001), foliageSway(10 + .00001));
});

test('rendering respects the pixel size and bounds GPU allocation even on large displays', () => {
    assert.deepEqual(renderSize(1440, 900, 2), { width: 720, height: 450, scale: 0.5 });
    assert.deepEqual(renderSize(390, 844, 2), { width: 195, height: 422, scale: 0.5 });
    for (const [width, height] of [[320, 568], [1440, 900], [3840, 2160], [7680, 4320], [900, 6000]]) {
        for (const pixelSize of [1, 2, 2.5, 5]) {
            const size = renderSize(width, height, pixelSize);
            assert.ok(size.width > 0 && size.height > 0);
            assert.ok(size.width <= 1600 && size.height <= 1600);
            assert.ok(size.width * size.height <= 1102000, 'pixel budget, allowing integer rounding');
            assert.ok(Math.abs(size.width / size.height - width / height) < 0.01);
        }
    }
});
