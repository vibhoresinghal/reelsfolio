/* Pause decorative loops without resetting their phase or touching playback,
   scrolling, GSAP entrances, the grid glow, or the foliage animation. */
(() => {
    'use strict';
    if (!('IntersectionObserver' in window) || !('MutationObserver' in window)) return;
    const root = document.documentElement;
    if (root.hasAttribute('data-ambient-lifecycle')) return;

    const selector = '.play-overlay-btn .play-with-sound-ring, .comment-pill, .video-buffering-ring';
    const scrollRoot = document.getElementById('mainScrollContainer');
    const targets = new Map();
    const frames = new Map();
    const nearbyAttribute = 'data-ambient-nearby';
    const managedAttribute = 'data-ambient-managed';
    const bufferingAttribute = 'data-ambient-buffer-visible';

    const style = document.createElement('style');
    style.textContent = `
        :root[data-ambient-lifecycle] .play-overlay-btn .play-with-sound-ring[data-ambient-managed],
        :root[data-ambient-lifecycle] .comment-pill[data-ambient-managed],
        :root[data-ambient-lifecycle] .video-buffering-ring[data-ambient-managed] {
            animation-play-state: paused;
        }
        :root[data-ambient-lifecycle] .play-overlay-btn .play-with-sound-ring[data-ambient-managed][data-ambient-nearby],
        :root[data-ambient-lifecycle] .comment-pill[data-ambient-managed][data-ambient-nearby],
        :root[data-ambient-lifecycle] [data-ambient-buffer-visible] .video-buffering-ring[data-ambient-managed][data-ambient-nearby] {
            animation-play-state: running;
        }
        :root[data-ambient-lifecycle][data-ambient-page-hidden] .play-overlay-btn .play-with-sound-ring[data-ambient-managed],
        :root[data-ambient-lifecycle][data-ambient-page-hidden] .comment-pill[data-ambient-managed],
        :root[data-ambient-lifecycle][data-ambient-page-hidden] .video-buffering-ring[data-ambient-managed][data-ambient-nearby] {
            animation-play-state: paused;
        }
    `;

    function onIntersection(entries, observer) {
        for (const entry of entries) {
            const record = targets.get(entry.target);
            // Ignore a queued callback from a previous root after reparenting.
            if (!record || record.observer !== observer) continue;
            const nearby = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
            if (record.nearby === nearby) continue;
            record.nearby = nearby;
            entry.target.toggleAttribute(nearbyAttribute, nearby);
        }
    }

    // The actual animated element, rather than its whole section, enters this
    // warm-up zone before it is seen and leaves it only after it is offscreen.
    const options = { rootMargin: '220px 0px', threshold: 0 };
    const viewportObserver = new IntersectionObserver(onIntersection, options);
    const scrollObserver = scrollRoot
        ? new IntersectionObserver(onIntersection, { ...options, root: scrollRoot })
        : viewportObserver;

    function watchBufferFrame(frame) {
        if (frames.has(frame)) return;
        const state = { buffering: null, timer: 0, observer: null };
        function syncBuffering() {
            const buffering = frame.classList.contains('is-buffering');
            if (state.buffering === buffering) return;
            const wasBuffering = state.buffering;
            state.buffering = buffering;
            clearTimeout(state.timer);
            state.timer = 0;
            if (buffering) {
                frame.setAttribute(bufferingAttribute, '');
            } else if (wasBuffering) {
                // Existing spinner visibility fades out over 200ms. Keep it
                // rotating through that fade instead of freezing in plain view.
                state.timer = setTimeout(() => {
                    state.timer = 0;
                    if (!frame.classList.contains('is-buffering')) frame.removeAttribute(bufferingAttribute);
                }, 250);
            } else {
                frame.removeAttribute(bufferingAttribute);
            }
        }
        state.observer = new MutationObserver(syncBuffering);
        state.observer.observe(frame, { attributes: true, attributeFilter: ['class'] });
        frames.set(frame, state);
        syncBuffering();
    }

    function register(element) {
        if (!element.isConnected) return;
        if (element.matches('.video-buffering-ring')) {
            const frame = element.closest('.video-frame, .landing-video-frame');
            // Unknown spinner components retain their original behavior.
            if (!frame) return;
            watchBufferFrame(frame);
        }
        const observer = scrollRoot?.contains(element) ? scrollObserver : viewportObserver;
        const existing = targets.get(element);
        if (existing?.observer === observer) return;
        if (existing) existing.observer.unobserve(element);
        // Preserve an already-visible element's state during fullscreen moves;
        // the new observer will supply its position in the new coordinate root.
        targets.set(element, { observer, nearby: existing?.nearby ?? null });
        element.setAttribute(managedAttribute, '');
        observer.observe(element);
    }

    function discover(node) {
        if (!(node instanceof Element)) return;
        if (node.matches(selector)) register(node);
        node.querySelectorAll(selector).forEach(register);
    }

    function forgetDetached() {
        for (const [element, record] of targets) {
            if (element.isConnected) continue;
            record.observer.unobserve(element);
            element.removeAttribute(nearbyAttribute);
            element.removeAttribute(managedAttribute);
            targets.delete(element);
        }
        for (const [frame, state] of frames) {
            if (frame.isConnected) continue;
            clearTimeout(state.timer);
            state.observer.disconnect();
            frame.removeAttribute(bufferingAttribute);
            frames.delete(frame);
        }
    }

    // Sections are populated asynchronously. Also cover fullscreen reparenting
    // and later content without a polling loop or a new scroll handler.
    const contentObserver = new MutationObserver(records => {
        let removed = false;
        for (const record of records) {
            record.addedNodes.forEach(discover);
            removed ||= record.removedNodes.length > 0;
        }
        if (removed) forgetDetached();
    });
    contentObserver.observe(document.body, { childList: true, subtree: true });
    discover(document.body);
    document.head.appendChild(style);
    function syncVisibility() {
        root.toggleAttribute('data-ambient-page-hidden', document.hidden);
    }
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    window.addEventListener('pageshow', syncVisibility);
    root.setAttribute('data-ambient-lifecycle', '');
})();
