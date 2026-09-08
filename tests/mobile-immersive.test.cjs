const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sync = html.slice(html.indexOf('        function syncMobileImmersiveMode()'),
    html.indexOf('        const scheduleMobileImmersiveSync'));

function setup() {
    const classes = new Set(['mobile-immersive-mode']);
    let activeVideo = { id: 'landing-video', paused: false, ended: false };
    const context = {
        window: { innerWidth: 390 },
        hasStartedExperience: true,
        isPlaying: true,
        mobileNavigationControlsTarget: null,
        getActiveVideoForFullscreen: () => activeVideo,
        hideMobilePlaybackControls: () => classes.delete('mobile-controls-visible'),
        showMobilePlaybackControls: () => classes.add('mobile-controls-visible'),
        document: { body: { classList: {
            remove: name => classes.delete(name),
            toggle: (name, on) => on ? classes.add(name) : classes.delete(name)
        } } }
    };
    vm.runInNewContext(sync, context);
    return { classes, context, sync: () => context.syncMobileImmersiveMode(),
        setVideo: video => { activeVideo = video; } };
}

test('controls remain immersive throughout an outgoing pause, incoming wait, and playback', () => {
    const app = setup();
    for (const video of [
        { id: 'landing-video', paused: true },
        { id: 'reel-a', paused: true },
        { id: 'reel-a', paused: false }
    ]) {
        app.setVideo(video);
        app.sync();
        assert.ok(app.classes.has('mobile-immersive-mode'));
        assert.ok(!app.classes.has('mobile-controls-visible'));
    }
});

test('an intentional pause restores controls', () => {
    const app = setup();
    app.context.isPlaying = false;
    app.setVideo({ paused: true });
    app.sync();
    assert.ok(!app.classes.has('mobile-immersive-mode'));
});

test('initial preview, playback rejection, media error, and ended video restore controls', () => {
    for (const state of ['initial', 'blocked', 'error', 'ended']) {
        const app = setup();
        const video = { paused: true };
        if (state === 'initial') app.context.hasStartedExperience = false;
        if (state === 'blocked') video._playbackBlocked = true;
        if (state === 'error') video.error = {};
        if (state === 'ended') video.ended = true;
        app.setVideo(video);
        app.sync();
        assert.ok(!app.classes.has('mobile-immersive-mode'), state);
    }
});

test('arrow navigation still reveals controls when its destination starts playing', () => {
    const app = setup();
    app.context.mobileNavigationControlsTarget = 'reel-a';
    app.setVideo({ id: 'reel-a', paused: false });
    app.sync();
    assert.ok(app.classes.has('mobile-controls-visible'));
    assert.equal(app.context.mobileNavigationControlsTarget, null);
});

test('desktop clears mobile immersive state', () => {
    const app = setup();
    app.context.window.innerWidth = 1440;
    app.sync();
    assert.ok(!app.classes.has('mobile-immersive-mode'));
});
