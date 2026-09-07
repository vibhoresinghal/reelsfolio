const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const handler = source.slice(source.indexOf('        function initDesktopMouseWheel('), source.indexOf('        // Block horizontal scroll'));

function setup(platform = 'Win32') {
    let listener, now = 1000;
    const calls = [];
    const container = { addEventListener(type, fn, options) {
        assert.equal(type, 'wheel');
        assert.equal(options.passive, false);
        listener = fn;
    } };
    const context = {
        navigator: { platform }, window: { innerWidth: 1440 },
        document: { body: { classList: { contains: () => false } } },
        performance: { now: () => now }, getComputedStyle: () => ({ overflowY: 'auto' }),
        navigationTween: null, isScrolling: false,
        navigate: direction => { calls.push(direction); context.navigationTween = {}; }
    };
    vm.runInNewContext(handler + '\nthis.init = initDesktopMouseWheel;', context);
    context.init(container);
    return { context, calls, installed: !!listener,
        advance(ms) { now += ms; },
        wheel(overrides = {}) {
            let prevented = false;
            listener?.({ deltaMode: 0, deltaY: 100, deltaX: 0, cancelable: true,
                target: { closest: () => null, parentElement: container },
                preventDefault() { prevented = true; }, ...overrides });
            return prevented;
        }
    };
}

test('MacBook input never installs the new wheel listener', () => {
    assert.equal(setup('MacIntel').installed, false);
});
test('one Windows wheel burst navigates once, then accepts a fresh gesture', () => {
    const s = setup();
    assert.equal(s.wheel(), true);
    s.advance(50); s.wheel();
    s.advance(500); s.wheel();
    assert.deepEqual(s.calls, [1]);
    s.context.navigationTween = null;
    s.advance(200); s.wheel({ deltaY: -120 });
    assert.deepEqual(s.calls, [1, -1]);
});
test('wheel ticks cannot retarget an active arrow animation', () => {
    const s = setup(); s.context.navigationTween = {};
    assert.equal(s.wheel(), true);
    assert.deepEqual(s.calls, []);
});
test('fine trackpad input and larger deltas in the same gesture stay native', () => {
    const s = setup();
    assert.equal(s.wheel({ deltaY: 2.5 }), false);
    s.advance(20);
    assert.equal(s.wheel(), false);
    assert.deepEqual(s.calls, []);
});
test('line and page wheel units use the shared navigator', () => {
    for (const mode of [1, 2]) {
        const s = setup(); s.wheel({ deltaMode: mode, deltaY: -3 });
        assert.deepEqual(s.calls, [-1]);
    }
});
test('zoom, horizontal, modified and non-cancelable events stay untouched', () => {
    for (const override of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true },
        { altKey: true }, { deltaX: 12 }, { cancelable: false }, { defaultPrevented: true }, { deltaY: 0 }]) {
        const s = setup(); assert.equal(s.wheel(override), false); assert.deepEqual(s.calls, []);
    }
});
test('mobile, fullscreen and open details retain existing input', () => {
    for (const change of [s => s.context.window.innerWidth = 390,
        s => s.context.document.fullscreenElement = {},
        s => s.context.document.body.classList.contains = () => true]) {
        const s = setup(); change(s); assert.equal(s.wheel(), false);
    }
});
test('forms and nested scrolling regions retain wheel input', () => {
    const s = setup();
    assert.equal(s.wheel({ target: { closest: () => ({}) } }), false);
    assert.equal(s.wheel({ target: { closest: () => null, scrollHeight: 500, clientHeight: 100 } }), false);
});
test('arrow animation implementation keeps its existing timing and easing', () => {
    const navigation = source.slice(source.indexOf('        function scrollToVideo(index'), source.indexOf('        function initDesktopMouseWheel('));
    assert.match(navigation, /Math\.min\(0\.72, Math\.max\(0\.45, distance \/ 1400\)\)/);
    assert.match(navigation, /ease: 'power3.inOut'/);
});
