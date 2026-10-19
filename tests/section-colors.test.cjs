const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hexToHsv, hsvToHex, normalize, palette, readSaved, toLab, rotateHue, matchedPalette } = require('../section-colors.js');
const { defaults, exportSettings } = require('../dither-background.js');
const videos = require('../videos.json');

test('scroll palettes blend directly and retarget from the visible color without a jump', () => {
    const fs = require('node:fs'), vm = require('node:vm');
    let now = 0;
    const properties = new Map();
    const style = { getPropertyValue: key => properties.get(key), setProperty: (key, value) => properties.set(key, value) };
    const document = { documentElement: { style }, getElementById: () => ({ style: { setProperty() {} } }), querySelector: () => null };
    const window = { document, dispatchEvent() {} };
    vm.runInNewContext(fs.readFileSync(require.resolve('../section-colors.js'), 'utf8'), {
        window, document, localStorage: { getItem: () => null },
        matchMedia: () => ({ matches: false }), performance: { now: () => now },
        CustomEvent: class {}
    });
    const api = window.ReelFolioColors;
    api.register([{ id: 'landing', color: '#091a12' }, { id: 'purple', color: '#1c121e' }, { id: 'blue', color: '#05191e' }]);
    const start = Array.from(api.sample());
    api.activate('purple');
    const end = Array.from(api.sample(600));
    now = 300;
    const middle = Array.from(api.sample());
    for (const i of [9, 11]) assert.ok(Math.abs(middle[i] - (start[i] + end[i]) / 2) < 1e-12);
    assert.ok(Math.hypot(middle[9], middle[11]) < .5, 'opposing hues soften instead of sweeping through a saturated third hue');
    api.activate('blue');
    assert.deepEqual(Array.from(api.sample()), middle, 'rapid scrolling resumes at the exact visible blend');
    now += 600;
    const finished = Array.from(api.sample());
    const angle = api.current().hueRotation;
    assert.ok(Math.abs(finished[9] - Math.cos(angle)) < 1e-12);
    assert.ok(Math.abs(finished[11] - Math.sin(angle)) < 1e-12);
});

test('all existing section backgrounds round-trip exactly and inherit the approved shared light', () => {
    const colors = [videos.landingSection.bgColor, ...videos.tabs.flatMap(tab => tab.videos.map(video => video.bgColor)), '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#808080'];
    for (const color of colors) {
        assert.equal(hsvToHex(hexToHsv(color)), color.toLowerCase());
        const result = palette(color, {}, defaults);
        assert.equal(result.backgroundColor, color.toLowerCase());
        assert.equal(result.glowColor, null);
        assert.equal(result.glowBrightness, 100);
        assert.equal(result.glowSaturation, 250);
        assert.equal(result.matBrightness, 29);
        assert.equal(result.matColor, '#f2dbcf');
    }
});

test('hue, saturation and brightness are independent, including neutral and black endpoints', () => {
    const base = '#ff0000';
    assert.equal(palette(base, { hue: 120 }).backgroundColor, '#00ff00');
    assert.equal(palette(base, { hue: 240 }).backgroundColor, '#0000ff');
    assert.equal(palette(base, { hue: 360 }).backgroundColor, '#ff0000');
    assert.equal(palette(base, { saturation: 0 }).backgroundColor, '#ffffff');
    const dark = palette(base, { hue: 180, saturation: 65, brightness: 0 });
    assert.equal(dark.backgroundColor, '#000000');
    assert.equal(dark.hue, 180);
    assert.equal(dark.saturation, 65);
    assert.equal(palette(base, { brightness: 50 }).backgroundColor, '#800000');
});

test('zero values, custom glow tint and per-section overrides survive persistence without leaking to matching backgrounds', () => {
    const edits = { hue: 277, brightness: 20, matColor: '#54edff', matBrightness: 0, glowColor: '#ff8800', glowBrightness: 0, glowSaturation: 0 };
    const saved = readSaved(JSON.parse(JSON.stringify({ version: 1, sections: { one: edits, two: { hue: 40 } } })));
    assert.deepEqual(saved.one, edits);
    const one = palette('#091a12', saved.one, defaults);
    const two = palette('#091a12', saved.two, defaults);
    assert.equal(one.glowBrightness, 0);
    assert.equal(one.glowSaturation, 0);
    assert.equal(one.matBrightness, 0);
    assert.equal(two.hue, 40);
    assert.equal(two.glowBrightness, 100);
    delete saved.one;
    assert.equal(palette('#091a12', saved.one, defaults).backgroundColor, '#091a12');
    assert.equal(palette('#091a12', saved.two, defaults).hue, 40);
});

test('partial palettes inherit shared changes only for untouched fields', () => {
    const edits = { matBrightness: 0, glowSaturation: 42 };
    const changed = { matBrightness: 80, saturation: 180 };
    assert.equal(palette('#200f24', edits, changed).matBrightness, 0);
    assert.equal(palette('#200f24', edits, changed).glowSaturation, 42);
    assert.equal(palette('#200f24', {}, changed).matBrightness, 80);
    assert.equal(palette('#200f24', {}, changed).glowSaturation, 180);
});

test('damaged or foreign saved values cannot produce invalid colors or unsafe section keys', () => {
    assert.deepEqual(normalize({ hue: -20, brightness: 999, saturation: NaN, matBrightness: '50', glowBrightness: Infinity,
        matColor: 'red', glowColor: '#AbC123', glowSaturation: 999, unknown: 1 }), { hue: 0, brightness: 100, glowSaturation: 250, glowColor: '#abc123' });
    assert.deepEqual(normalize({ glowColor: null }), { glowColor: null });
    assert.deepEqual(normalize([]), {});
    assert.equal(Object.keys(readSaved({ version: 2, sections: { one: {} } })).length, 0);
    const saved = readSaved(JSON.parse('{"version":1,"sections":{"__proto__":{"hue":12},"constructor":{"hue":10},"one":{"glowColor":"url(bad)"}}}'));
    assert.deepEqual(Object.keys(saved), ['one']);
    assert.deepEqual(saved.one, {});
});

test('the shareable snapshot includes palettes and unchanged approved scene settings', () => {
    const sectionColors = { version: 1, activeSection: 't1v1', sections: { t1v1: { title: 'Example', ...palette('#09121f', { glowColor: '#d4ff00' }, defaults) } } };
    const exported = JSON.parse(exportSettings(defaults, {}, sectionColors));
    assert.equal(exported.version, 3);
    assert.deepEqual(exported.sectionColors, sectionColors);
    assert.deepEqual(exported.settings, defaults);
    assert.deepEqual(exported.looks, require('../dither-default.json').looks);
});

test('matching the intro is an identity operation, including a custom intro palette', () => {
    for (const edits of [{}, { hue: 234.7, saturation: 41, brightness: 17, matColor: '#f0d4c0', glowColor: '#fcb349', glowBrightness: 72, glowSaturation: 138 }]) {
        const reference = palette(videos.landingSection.bgColor, edits, defaults);
        assert.deepEqual(matchedPalette(reference, reference.hue), { ...reference, hueRotation: 0 });
    }
});

test('all video hues share the intro treatment and match background and mat perceptual lightness', () => {
    const rgb = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16) / 255);
    const reference = palette(videos.landingSection.bgColor, { matBrightness: 44, glowBrightness: 85 }, defaults);
    for (const video of videos.tabs.flatMap(tab => tab.videos)) {
        const hue = hexToHsv(video.bgColor).hue;
        const matched = matchedPalette(reference, hue);
        assert.equal(matched.hue, hue);
        for (const key of ['saturation', 'brightness', 'matBrightness', 'glowBrightness', 'glowSaturation']) assert.equal(matched[key], reference[key]);
        for (const key of ['backgroundColor', 'matColor']) {
            assert.ok(Math.abs(toLab(rgb(matched[key]))[0] - toLab(rgb(reference[key]))[0]) < .0025, `${video.id} ${key}: allow 8-bit rounding`);
        }
    }
});

test('hue rotation preserves every lighting tone, including colors that need gamut mapping', () => {
    const colors = [[9 / 255, 26 / 255, 18 / 255], [.03, .34, .12], [.2, .8, .4], [1, 0, 0], [0, 0, 1], [0, 0, 0], [1, 1, 1]];
    for (const rgb of colors) {
        assert.deepEqual(rotateHue(rgb, 0), rgb);
        const original = toLab(rgb);
        for (let angle = -Math.PI; angle <= Math.PI; angle += .2) {
            const rotated = rotateHue(rgb, angle), lab = toLab(rotated);
            assert.ok(rotated.every(n => Number.isFinite(n) && n >= 0 && n <= 1));
            assert.ok(Math.abs(lab[0] - original[0]) < .000001);
            assert.ok(Math.hypot(lab[1], lab[2]) <= Math.hypot(original[1], original[2]) + .000001);
        }
    }
});
