/* Event-driven placement and volume UI; no permanent animation loop. */
(() => {
    'use strict';
    const control = document.getElementById('volumeControl');
    const rail = document.getElementById('fixedNavArrows');
    const button = document.getElementById('soundBtn');
    const slider = document.getElementById('videoVolume');
    const scroller = document.getElementById('mainScrollContainer');
    if (!control || !rail || !button || !slider) return;

    let scheduled = 0;
    let dragging = false;
    let closeTimer = 0;
    let observedFrame = null;
    const hover = matchMedia('(hover: hover) and (pointer: fine)');

    function syncVolume() {
        const value = isMuted ? 0 : Math.round(playbackVolume * 100);
        slider.value = String(value);
        slider.style.setProperty('--volume-fill', value + '%');
        slider.setAttribute('aria-valuetext', isMuted ? 'Muted' : value + '%');
        button.setAttribute('aria-pressed', String(isMuted));
    }

    function expanded(open) {
        clearTimeout(closeTimer);
        if (!open && document.activeElement === slider) button.focus();
        clearTimeout(closeTimer);
        control.classList.toggle('is-expanded', open);
        slider.tabIndex = open ? 0 : -1;
        if (open) armCollapse(2000);
    }

    function armCollapse(delay) {
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => {
            if (!dragging && !(hover.matches && control.matches(':hover'))) expanded(false);
        }, delay);
    }

    function deferClose() {
        armCollapse(600);
    }

    function keepMobileControls() {
        if (typeof showMobilePlaybackControls === 'function') showMobilePlaybackControls();
    }

    control.addEventListener('pointerenter', () => { if (hover.matches) expanded(true); });
    control.addEventListener('pointerleave', deferClose);
    control.addEventListener('pointermove', () => {
        if (control.classList.contains('is-expanded') && !dragging) armCollapse(2000);
    }, { passive: true });
    control.addEventListener('focusin', () => expanded(true));
    control.addEventListener('focusout', deferClose);
    control.addEventListener('pointerdown', event => {
        event.stopPropagation();
        keepMobileControls();
        if (event.pointerType !== 'mouse') expanded(true);
        else if (control.classList.contains('is-expanded')) armCollapse(2000);
    });
    control.addEventListener('click', event => event.stopPropagation());
    control.addEventListener('keydown', event => {
        event.stopPropagation();
        if (control.classList.contains('is-expanded')) armCollapse(2000);
        if (event.key === 'Escape') {
            button.focus();
            expanded(false);
        }
    });
    document.addEventListener('pointerdown', event => {
        if (!control.contains(event.target)) expanded(false);
    }, { passive: true });

    slider.addEventListener('pointerdown', event => {
        dragging = true;
        slider.setPointerCapture(event.pointerId);
        keepMobileControls();
        clearTimeout(mobileControlsTimer);
    });
    const endDrag = () => {
        dragging = false;
        keepMobileControls();
        deferClose();
    };
    slider.addEventListener('pointerup', endDrag);
    slider.addEventListener('pointercancel', endDrag);
    slider.addEventListener('lostpointercapture', endDrag);
    slider.addEventListener('input', () => {
        setPlaybackVolume(Number(slider.value) / 100);
        armCollapse(2000);
        keepMobileControls();
        if (dragging) clearTimeout(mobileControlsTimer);
    });
    window.addEventListener('reelsfolio:volumechange', syncVolume);

    function place() {
        scheduled = 0;
        if (document.hidden) return;
        const section = document.querySelector('.video-section.active, .landing-section.active');
        const frame = section?.querySelector('.video-frame, .landing-video-frame');
        if (!frame) return;
        if (frame !== observedFrame) {
            if (observedFrame) resizeObserver?.unobserve(observedFrame);
            observedFrame = frame;
            resizeObserver?.observe(frame);
            expanded(false);
        }
        // The settled frame is centred in its section. Ignore its scroll/entry
        // transform so the sound control does not bounce between reel entrances.
        const safeTop = window.innerWidth <= 600 ? 16 : 12;
        const frameTop = Math.max(safeTop, (section.clientHeight - frame.offsetHeight) / 2);
        // The rail is vertically centred with translateY(-50%). Use layout
        // coordinates rather than its animated rectangle: intro transforms
        // must not be baked into the sound control's permanent offset.
        const railTop = rail.offsetTop - rail.offsetHeight / 2;
        const top = Math.min(frameTop, railTop - 48 - 24);
        control.style.setProperty('--volume-offset', (Math.max(safeTop, top) - railTop) + 'px');
        control.setAttribute('data-positioned', '');
        control.toggleAttribute('data-frame-pending', !frame.classList.contains('has-first-frame'));
    }

    function schedule() {
        if (!scheduled) scheduled = requestAnimationFrame(place);
    }
    const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(schedule) : null;
    resizeObserver?.observe(rail);
    new MutationObserver(records => {
        if (records.some(record => record.target === document.body && record.attributeName === 'class')) {
            const body = document.body.classList;
            const immersive = body.contains('desktop-immersive-mode') ||
                body.contains('fullscreen-cursor-hidden') ||
                (body.contains('mobile-immersive-mode') && !body.contains('mobile-controls-visible'));
            if (immersive && control.classList.contains('is-expanded')) expanded(false);
        }
        if (records.some(record => record.type === 'childList' ||
            record.target === document.body || record.target === rail ||
            record.target.matches?.('.video-section, .landing-section, .video-frame, .landing-video-frame'))) schedule();
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    // Newly inserted videos inherit the chosen level before playback starts.
    document.addEventListener('play', event => {
        if (event.target instanceof HTMLVideoElement) event.target.volume = playbackVolume;
    }, true);
    scroller?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    document.addEventListener('visibilitychange', schedule);
    rail.addEventListener('transitionend', schedule);
    syncVolume();
    schedule();
})();
