const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the real tap handler with a virtual clock; never send test likes to production.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const handler = html.slice(html.indexOf('        function initDoubleTapLike()'), html.indexOf('        let _dtTapCount'));

function setup({ started = false, paused = true, width = 390 } = {}) {
    let now = 1000;
    let nextTimer = 0;
    let listener;
    const timers = new Map();
    const classes = new Set();
    const calls = { likes: [], starts: [], toggles: [] };
    const video = { id: 'reel-a', paused, ended: false };
    const context = {
        window: { innerWidth: width },
        Date: { now: () => now },
        hasStartedExperience: started,
        isMuted: false,
        userManuallyMuted: false,
        setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, time: now + delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
        document: {
            body: { classList: { contains: name => classes.has(name) } },
            getElementById: () => video,
            addEventListener(type, callback) { if (type === 'click') listener = callback; }
        },
        getActiveVideoForFullscreen: () => video,
        hideMobilePlaybackControls: () => classes.delete('mobile-controls-visible'),
        showMobilePlaybackControls: () => classes.add('mobile-controls-visible'),
        doubleTapLike: (_, id) => calls.likes.push(id),
        toggleVideo: id => { calls.toggles.push(id); video.paused = !video.paused; },
        startExperienceWithSound: id => { calls.starts.push(id); context.hasStartedExperience = true; video.paused = false; },
        unmuteAndDismissHint() {}
    };
    vm.runInNewContext(handler + '\ninitDoubleTapLike();', context);
    return {
        calls, video,
        tap({ center = false, id = 'reel-a', button = false } = {}) {
            const frame = { getAttribute: () => id };
            listener({ target: { closest(selector) {
                if (selector === '[data-tap-video]') return frame;
                if (selector === '.play-overlay-btn') return center ? {} : null;
                return button ? {} : null;
            } } });
        },
        advance(ms) {
            const end = now + ms;
            while (true) {
                const due = [...timers].filter(([, t]) => t.time <= end).sort((a, b) => a[1].time - b[1].time)[0];
                if (!due) break;
                const [id, timer] = due;
                now = timer.time;
                timers.delete(id);
                timer.fn();
            }
            now = end;
        }
    };
}

for (const state of [{ started: false, paused: true }, { started: true, paused: true }, { started: true, paused: false }]) {
    for (const center of [false, true]) {
        test(`double tap likes without playback changes: ${JSON.stringify({ ...state, center })}`, () => {
            const app = setup(state);
            app.tap({ center });
            app.advance(100);
            app.tap({ center });
            app.advance(500);
            assert.deepEqual(app.calls, { likes: ['reel-a'], starts: [], toggles: [] });
            assert.equal(app.video.paused, state.paused);
        });
    }
}

test('single center tap starts an unstarted video after the double-tap window', () => {
    const app = setup();
    app.tap({ center: true });
    assert.deepEqual(app.calls.starts, []);
    app.advance(280);
    assert.deepEqual(app.calls.starts, ['reel-a']);
});

test('single center tap still toggles playback on mobile', () => {
    const app = setup({ started: true, paused: false });
    app.tap({ center: true });
    app.advance(280);
    assert.deepEqual(app.calls.toggles, ['reel-a']);
    assert.equal(app.video.paused, true);
});

test('single background tap never starts an unstarted video', () => {
    const app = setup();
    app.tap();
    app.advance(500);
    assert.deepEqual(app.calls, { likes: [], starts: [], toggles: [] });
});

test('navigation cancels playback from a pending center tap', () => {
    const app = setup();
    app.tap({ center: true });
    app.video.id = 'reel-b';
    app.advance(500);
    assert.deepEqual(app.calls.starts, []);
});

test('taps on separate reels do not combine into a like', () => {
    const app = setup();
    app.tap();
    app.advance(100);
    app.video.id = 'reel-b';
    app.tap({ id: 'reel-b' });
    app.advance(500);
    assert.deepEqual(app.calls.likes, []);
});

test('side buttons bypass the video double-tap gesture', () => {
    const app = setup();
    app.tap({ button: true });
    app.advance(100);
    app.tap({ button: true });
    app.advance(500);
    assert.deepEqual(app.calls.likes, []);
});

test('desktop center control remains immediate', () => {
    const app = setup({ width: 1280 });
    app.tap({ center: true });
    assert.deepEqual(app.calls.starts, ['reel-a']);
});
