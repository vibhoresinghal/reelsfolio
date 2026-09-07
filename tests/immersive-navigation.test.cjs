const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const immersive = source.slice(source.indexOf('        const IMMERSIVE_IDLE_DELAY'), source.indexOf('        function noteDesktopInteraction'));
const navigation = source.slice(source.indexOf('        let navigationTween ='), source.indexOf('        // Navigate to next/previous section'));

function setup() {
    let now = 0, id = 0, animation;
    const timers = new Map(), classes = new Set();
    const video = { paused: false, ended: false };
    const container = { scrollTop: 0, style: {}, querySelectorAll: () => [{ offsetTop: 0 }, { offsetTop: 900 }] };
    const context = {
        window: { innerWidth: 1440 }, isWarping: false, isScrolling: true, navigationTargetIndex: 1,
        document: { hidden: false, querySelector: () => null, getElementById: () => container,
            body: { classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) } } },
        getFullscreenElement: () => null, getActiveVideoForFullscreen: () => video,
        updateNavArrows() {},
        gsap: { to(target, options) { animation = options; return { kill() {} }; } },
        setTimeout(fn, delay) { timers.set(++id, { fn, due: now + delay }); return id; },
        clearTimeout(id) { timers.delete(id); }
    };
    vm.runInNewContext(immersive + navigation, context);
    return { context, video, classes,
        begin() { context.scrollToVideo(1); context.scheduleDesktopImmersiveMode(); },
        finish() { animation.onComplete(); },
        advance(ms) {
            now += ms;
            for (const [key, timer] of [...timers]) {
                if (timer.due <= now) { timers.delete(key); timer.fn(); }
            }
        }
    };
}

test('playback during navigation enters immersive only after settling and the idle delay', () => {
    const s = setup(); s.begin(); s.advance(3000);
    assert.equal(s.classes.has('desktop-immersive-mode'), false);
    s.finish(); s.advance(2499);
    assert.equal(s.classes.has('desktop-immersive-mode'), false);
    s.advance(1);
    assert.equal(s.classes.has('desktop-immersive-mode'), true);
});
test('paused destination never enters immersive after navigation', () => {
    const s = setup(); s.begin(); s.video.paused = true; s.finish(); s.advance(3000);
    assert.equal(s.classes.has('desktop-immersive-mode'), false);
});
test('pausing during the countdown prevents immersive entry', () => {
    const s = setup(); s.begin(); s.finish(); s.video.paused = true; s.advance(3000);
    assert.equal(s.classes.has('desktop-immersive-mode'), false);
});
