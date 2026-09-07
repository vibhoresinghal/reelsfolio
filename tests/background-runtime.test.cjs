const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const source = read('background-runtime.js');
const css = read('environment-production.css');
const html = read('index.html') + read('styles.css');
const chosen = JSON.parse(read('environment-default.json')).settings;
const tick = () => new Promise(resolve => setImmediate(resolve));

function boot({ mobile = false, hidden = false } = {}) {
    const attrs = new Set(['data-production-environment', 'data-environment-paused']);
    const rootChanges = [], events = new Map(), frames = [], images = [];
    let grid, gridWrites = 0, fullscreen = false, mutation;
    const root = {
        setAttribute(key) { attrs.add(key); rootChanges.push(key); },
        toggleAttribute(key, enabled) { enabled ? attrs.add(key) : attrs.delete(key); }
    };
    const layer = { querySelector: () => grid, appendChild: node => { grid = node; } };
    const document = {
        hidden, documentElement: root,
        body: { classList: { contains: () => fullscreen } },
        getElementById: () => layer,
        createElementNS: () => ({ classList: { add() {} }, setAttribute() {},
            set innerHTML(value) { gridWrites++; this.markup = value; } }),
        addEventListener: (name, fn) => events.set(name, fn)
    };
    const media = { matches: mobile, addEventListener: (name, fn) => events.set('media', fn) };
    const window = { innerWidth: 1440, innerHeight: 900, addEventListener: (name, fn) => events.set(name, fn) };
    const context = {
        document, window, matchMedia: () => media,
        requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
        MutationObserver: class { constructor(fn) { mutation = fn; } observe() {} },
        Image: class { decode() { return new Promise((resolve, reject) => images.push({ image: this, resolve, reject })); } }
    };
    vm.runInNewContext(source, context);
    return { attrs, rootChanges, events, images, document, media, window,
        get gridWrites() { return gridWrites; },
        flush() { const pending = frames.splice(0); pending.forEach(fn => fn()); },
        fullscreen(value) { fullscreen = value; mutation(); } };
}

test('production preserves the chosen visible values and excludes study code', () => {
    const values = Object.fromEntries(Array.from(css.matchAll(/(--[\w-]+):\s*([^;\n]+);/g), m => [m[1], m[2].trim()]));
    const numeric = {
        '--bg-light-opacity': chosen.lightIntensity / 100,
        '--bg-light-softness': chosen.lightSoftness,
        '--bg-light-x': chosen.lightX, '--bg-light-y': chosen.lightY,
        '--bg-light-spread-x': chosen.lightSpreadX, '--bg-light-spread-y': chosen.lightSpreadY,
        '--bg-window-rotation': chosen.windowRotation, '--bg-window-skew': chosen.windowSkew,
        '--bg-window-x': chosen.windowX, '--bg-window-y': chosen.windowY, '--bg-window-scale': chosen.windowScale / 100,
        '--bg-window-frame-width': chosen.windowFrameWidth, '--bg-window-shadow-opacity': chosen.windowShadowOpacity / 100,
        '--bg-window-bar-x': chosen.windowBarX, '--bg-window-bar-y': chosen.windowBarY,
        '--bg-tree-scale': chosen.foliageScale / 1000, '--bg-plant-width-scale': chosen.plantWidth / 100,
        '--bg-plant-height-scale': chosen.plantHeight / 100, '--bg-plant-softness': chosen.leafSoftness,
        '--bg-foliage-shadow-opacity': chosen.foliageShadowOpacity / 100, '--bg-left-leaf-opacity': chosen.leftOpacity / 100,
        '--bg-window-left-leaf-x': chosen.leftLeafX, '--bg-window-left-leaf-y': chosen.leftLeafY,
        '--bg-left-leaf-rotation': chosen.leftRotation, '--bg-light-motion-amount': chosen.foliageMotionAmount,
        '--bg-light-motion-rotation': chosen.foliageMotionRotation, '--bg-light-motion-speed': chosen.foliageMotionSpeed
    };
    for (const [key, value] of Object.entries(numeric)) assert.equal(parseFloat(values[key]), value, key);
    for (const [key, hex] of Object.entries({ '--bg-light-rgb': chosen.lightColor, '--bg-window-shadow-rgb': chosen.windowColor, '--bg-foliage-rgb': chosen.foliageColor })) {
        assert.equal(values[key], [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(' '));
    }
    assert.equal(values['--bg-light-blend'], chosen.lightBlend);
    assert.equal(values['--bg-motion-easing'], 'cubic-bezier(0.37, 0, 0.63, 1)');
    assert.equal(chosen.scene, 'olive-bough');
    assert.equal(chosen.foliageFlip, true);
    assert.equal(chosen.foliageDensity, 0, 'only a fully transparent layer may be removed');
    assert.ok(css.includes('.bg-light-texture::before { content: none; }'));
    for (const file of ['background-grid-controller.js', 'environment-shader.js', 'environment-lab.js', 'lab-shell.js', 'experiment-controller.js', 'landing-button-lab.js']) {
        assert.ok(!html.includes(file), `${file} must not load on the site`);
    }
    assert.doesNotMatch(source, /\blocalStorage\s*[.(]/);
    assert.ok(html.includes(':not([data-environment-ready]) .bg-light-shader { visibility: hidden; }'));
    assert.ok(css.includes('(prefers-reduced-motion: reduce)'));
});

test('slow decode never reveals a bare window; readiness is set once and survives transitions', async () => {
    const app = boot();
    assert.equal(app.images.length, 1);
    assert.equal(app.images[0].image.src, 'assets/environment/olive-bough-mask.webp');
    assert.ok(!app.attrs.has('data-environment-ready'));
    assert.ok(app.attrs.has('data-environment-paused'));
    assert.equal(app.gridWrites, 1);
    app.images[0].resolve(); await tick();
    assert.ok(app.attrs.has('data-environment-ready'));
    assert.ok(!app.attrs.has('data-environment-paused'));
    app.fullscreen(true);
    assert.ok(app.attrs.has('data-environment-paused'));
    app.fullscreen(false);
    app.document.hidden = true; app.events.get('visibilitychange')();
    assert.ok(app.attrs.has('data-environment-paused'));
    app.document.hidden = false; app.events.get('visibilitychange')(); app.flush();
    app.media.matches = true; app.events.get('media')();
    app.media.matches = false; app.events.get('media')();
    assert.ok(!app.attrs.has('data-environment-paused'));
    assert.equal(app.images.length, 1);
    assert.deepEqual(app.rootChanges, ['data-environment-ready']);
    assert.equal(app.gridWrites, 1, 'visibility and playback must not replace the grid');
});

test('mobile/hidden first loads do not fetch foliage; desktop entry loads it once', async () => {
    for (const initial of [{ mobile: true }, { hidden: true }]) {
        const app = boot(initial);
        assert.equal(app.images.length, 0);
        app.media.matches = false; app.document.hidden = false;
        app.events.get('media')(); app.events.get('visibilitychange')();
        assert.equal(app.images.length, 1);
        app.images[0].resolve(); await tick();
        assert.ok(app.attrs.has('data-environment-ready'));
    }
});

test('failed decode keeps the window hidden and retries only on a meaningful event', async () => {
    const app = boot();
    app.images[0].reject(new Error('offline')); await tick();
    assert.ok(!app.attrs.has('data-environment-ready'));
    assert.equal(app.images.length, 1);
    app.events.get('online')();
    assert.equal(app.images.length, 2);
    app.images[1].resolve(); await tick();
    assert.deepEqual(app.rootChanges, ['data-environment-ready']);
});

test('resize rendering is coalesced and unchanged sizes do not replace the grid', () => {
    const app = boot({ mobile: true });
    app.events.get('resize')(); app.events.get('resize')(); app.flush();
    assert.equal(app.gridWrites, 1);
    app.window.innerWidth = 1920;
    app.events.get('resize')(); app.events.get('resize')(); app.flush();
    assert.equal(app.gridWrites, 2);
});
