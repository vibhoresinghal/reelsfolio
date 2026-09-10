/* Production-only background: fixed grid, pointer light and one olive shadow.
   Pointer updates are frame-coalesced; there is no continuous animation loop. */
(() => {
    'use strict';
    const root = document.documentElement;
    const bgLayer = document.getElementById('bgLayer');
    if (!bgLayer || bgLayer.querySelector('.bg-grid-cutting-mat')) return;
    const cuttingMatSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cuttingMatSvg.classList.add('bg-grid-cutting-mat');
    cuttingMatSvg.setAttribute('aria-hidden', 'true');
    bgLayer.appendChild(cuttingMatSvg);
    const state = Object.freeze({
        color: '#f2dbcf', spacing: 28, thickness: 1,
        opacity: 14, majorEvery: 6, majorOpacity: 42, edgeTicks: true,
        numericGuides: true, radiusGuides: true, angleGuides: true, angleStep: 30
    });
    const gridGlowDefaults = Object.freeze({
        enabled: true, radiusPx: 88, brightness: 1, softness: 37,
        lineWidthPx: 1.15, coreColor: '#ffc98f', edgeColor: '#e6dbbc',
        followDelayMs: 90, maxLagPx: 200, fadeInMs: 220, fadeOutMs: 570
    });
    const gridGlow = { ...gridGlowDefaults };
    let hoverPreviewPinned = false, hoverHasPosition = false;
    let cuttingMatSignature = '';
    let gridHoverGradient = null;
    let hoverFrame = 0, hoverTime = 0, hoverTracking = false;
    let pointerX = 0, pointerY = 0, hoverX = -1000, hoverY = -1000;
    function renderCuttingMat() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const signature = JSON.stringify([width, height, ...[
            'color', 'spacing', 'thickness', 'opacity', 'majorEvery', 'majorOpacity',
            'edgeTicks', 'numericGuides', 'radiusGuides', 'angleGuides', 'angleStep'
        ].map(key => state[key])]);
        // Lighting controls should not rebuild hundreds of unrelated grid nodes.
        if (signature === cuttingMatSignature) return;
        cuttingMatSignature = signature;
        const margin = 24;
        const spacing = Math.max(8, state.spacing);
        const majorEvery = Math.max(2, state.majorEvery);
        const minorOpacity = state.opacity / 100;
        const majorOpacity = state.majorOpacity / 100;
        const color = state.color;
        const minorLines = [];
        const majorLines = [];
        const edgeTicks = [];
        const labels = [];

        for (let x = margin, index = 0; x <= width - margin; x += spacing, index++) {
            const isMajor = index % majorEvery === 0;
            (isMajor ? majorLines : minorLines).push(
                `<line x1="${x}" y1="${margin}" x2="${x}" y2="${height - margin}"/>`
            );
            if (state.edgeTicks) {
                const length = isMajor ? 12 : 6;
                edgeTicks.push(
                    `<line x1="${x}" y1="${margin}" x2="${x}" y2="${margin + length}"/>`,
                    `<line x1="${x}" y1="${height - margin}" x2="${x}" y2="${height - margin - length}"/>`
                );
            }
            if (state.numericGuides && isMajor && index > 0) {
                labels.push(
                    `<text x="${x}" y="${margin - 8}" text-anchor="middle">${index}</text>`,
                    `<text x="${x}" y="${height - margin + 15}" text-anchor="middle">${index}</text>`
                );
            }
        }

        for (let y = margin, index = 0; y <= height - margin; y += spacing, index++) {
            const isMajor = index % majorEvery === 0;
            (isMajor ? majorLines : minorLines).push(
                `<line x1="${margin}" y1="${y}" x2="${width - margin}" y2="${y}"/>`
            );
            if (state.edgeTicks) {
                const length = isMajor ? 12 : 6;
                edgeTicks.push(
                    `<line x1="${margin}" y1="${y}" x2="${margin + length}" y2="${y}"/>`,
                    `<line x1="${width - margin}" y1="${y}" x2="${width - margin - length}" y2="${y}"/>`
                );
            }
            if (state.numericGuides && isMajor && index > 0) {
                labels.push(
                    `<text x="${margin - 8}" y="${y + 3}" text-anchor="end">${index}</text>`,
                    `<text x="${width - margin + 8}" y="${y + 3}" text-anchor="start">${index}</text>`
                );
            }
        }

        const guidePaths = [];
        const guideLabels = [];
        const originX = margin;
        const originY = height - margin;
        const guideLimit = Math.min(width, height) * 0.72;

        if (state.radiusGuides) {
            [1, 2, 3].forEach((step, index) => {
                const radius = spacing * majorEvery * step;
                if (radius >= guideLimit) return;
                guidePaths.push(
                    `<path d="M ${originX + radius} ${originY} A ${radius} ${radius} 0 0 0 ${originX} ${originY - radius}"/>`
                );
                guideLabels.push(
                    `<text x="${originX + radius * 0.71}" y="${originY - radius * 0.71 - 5}">R${index + 1}</text>`
                );
            });
        }

        if (state.angleGuides) {
            const rayLength = guideLimit;
            const angleStep = Math.max(5, Number(state.angleStep));
            for (let angle = angleStep; angle < 90; angle += angleStep) {
                const radians = angle * Math.PI / 180;
                const endX = originX + Math.cos(radians) * rayLength;
                const endY = originY - Math.sin(radians) * rayLength;
                guidePaths.push(`<line x1="${originX}" y1="${originY}" x2="${endX}" y2="${endY}"/>`);
                guideLabels.push(
                    `<text x="${originX + Math.cos(radians) * 72}" y="${originY - Math.sin(radians) * 72 - 5}">${angle}°</text>`
                );
            }
        }

        cuttingMatSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        cuttingMatSvg.setAttribute('style', `--grid-shimmer-travel-x: ${width * 1.6}px; --grid-shimmer-travel-y: ${height * 1.6}px`);
        cuttingMatSvg.innerHTML = `
            <defs>
                <linearGradient id="grid-loading-band" gradientUnits="userSpaceOnUse" x1="${-width * 0.55}" y1="${-height * 0.55}" x2="0" y2="0">
                    <stop offset="0" stop-color="white" stop-opacity="0"/>
                    <stop offset="0.30" stop-color="white" stop-opacity="0"/>
                    <stop offset="0.48" stop-color="white" stop-opacity="0.8"/>
                    <stop offset="0.6" stop-color="white" stop-opacity="1"/>
                    <stop offset="0.70" stop-color="white" stop-opacity="0.8"/>
                    <stop offset="0.88" stop-color="white" stop-opacity="0"/>
                    <stop offset="1" stop-color="white" stop-opacity="0"/>
                </linearGradient>
                <mask id="grid-loading-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
                    <rect class="grid-loading-band" x="${-width}" y="${-height}" width="${width * 3}" height="${height * 3}" fill="url(#grid-loading-band)"/>
                </mask>
                <radialGradient id="grid-hover-light" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="168" gradientTransform="translate(${hoverX} ${hoverY})">
                    <stop offset="0" stop-color="#fff3e6" stop-opacity="1"/>
                    <stop offset="0.13" stop-color="#fff3e6" stop-opacity="0.94"/>
                    <stop offset="0.34" stop-color="${color}" stop-opacity="0.54"/>
                    <stop offset="0.62" stop-color="${color}" stop-opacity="0.17"/>
                    <stop offset="0.84" stop-color="${color}" stop-opacity="0.035"/>
                    <stop offset="1" stop-color="${color}" stop-opacity="0"/>
                </radialGradient>
                <g id="grid-highlight-lines">
                    <g stroke-opacity="0.55">${minorLines.join('')}</g>
                    <g stroke-opacity="0.85">
                        ${majorLines.join('')}
                        ${edgeTicks.join('')}
                        <rect x="${margin}" y="${margin}" width="${Math.max(0, width - margin * 2)}" height="${Math.max(0, height - margin * 2)}"/>
                    </g>
                    <g stroke-opacity="0.4" stroke-dasharray="5 5">${guidePaths.join('')}</g>
                </g>
            </defs>
            <g fill="none" stroke="${color}" stroke-width="${state.thickness}" stroke-opacity="${minorOpacity}">
                ${minorLines.join('')}
            </g>
            <g fill="none" stroke="${color}" stroke-width="${Math.max(state.thickness, 1)}" stroke-opacity="${majorOpacity}">
                ${majorLines.join('')}
                <rect x="${margin}" y="${margin}" width="${Math.max(0, width - margin * 2)}" height="${Math.max(0, height - margin * 2)}"/>
                ${edgeTicks.join('')}
            </g>
            <g fill="none" stroke="${color}" stroke-width="${state.thickness}" stroke-opacity="${majorOpacity * 0.8}" stroke-dasharray="5 5">
                ${guidePaths.join('')}
            </g>
            <g fill="${color}" fill-opacity="${majorOpacity}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="9">
                ${labels.join('')}
                ${guideLabels.join('')}
            </g>
            <g class="grid-loading-highlight" fill="none" stroke="${color}" stroke-width="${state.thickness}" mask="url(#grid-loading-mask)">
                <use href="#grid-highlight-lines"/>
            </g>
            <g class="grid-hover-highlight" fill="none" stroke="url(#grid-hover-light)" stroke-width="${state.thickness + 0.15}">
                <use href="#grid-highlight-lines"/>
            </g>
        `;
        gridHoverGradient = cuttingMatSvg.querySelector('#grid-hover-light');
        applyGridGlowStyle();
    }

    function applyGridGlowStyle() {
        cuttingMatSvg.style.setProperty('--grid-hover-strength', String(gridGlow.brightness));
        cuttingMatSvg.style.setProperty('--grid-hover-fade-in', `${gridGlow.fadeInMs}ms`);
        cuttingMatSvg.style.setProperty('--grid-hover-fade-out', `${gridGlow.fadeOutMs}ms`);
        if (!gridHoverGradient) return;
        gridHoverGradient.setAttribute('r', String(gridGlow.radiusPx));
        const offsets = [0, 0.13, 0.34, 0.62, 0.84, 1];
        const feather = 0.42 + gridGlow.softness / 65 * 0.58;
        gridHoverGradient.querySelectorAll('stop').forEach((stop, index) => {
            stop.setAttribute('offset', String(Math.pow(offsets[index], feather)));
            stop.setAttribute('stop-color', index < 2 ? gridGlow.coreColor : gridGlow.edgeColor);
        });
        cuttingMatSvg.querySelector('.grid-hover-highlight')?.setAttribute('stroke-width', String(gridGlow.lineWidthPx));
    }

    let resizeFrame = 0;
    function scheduleGrid() {
        if (document.hidden || resizeFrame) return;
        resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; renderCuttingMat(); });
    }
    // Keep the existing grid visible until its replacement is ready; never clear
    // it for a resize, foliage decode, playback transition, or visibility change.
    renderCuttingMat();
    window.addEventListener('resize', scheduleGrid, { passive: true });

    const hoverPointer = matchMedia('(min-width: 601px) and (hover: hover) and (pointer: fine)');
    const reducedGridMotion = matchMedia('(prefers-reduced-motion: reduce)');
    function canHoverGrid() {
        return gridGlow.enabled && hoverPointer.matches && !document.hidden &&
            !document.body.classList.contains('initial-media-pending') &&
            !document.body.classList.contains('desktop-fullscreen-mode');
    }
    function hideGridHover() {
        if (hoverFrame) cancelAnimationFrame(hoverFrame);
        hoverFrame = 0;
        hoverTime = 0;
        hoverTracking = false;
        cuttingMatSvg.classList.remove('is-pointer-over-grid');
    }
    function paintGridHover(time) {
        hoverFrame = 0;
        if (!canHoverGrid() || !gridHoverGradient) { hideGridHover(); return; }
        const bounds = cuttingMatSvg.getBoundingClientRect();
        if (!bounds.width || !bounds.height || pointerX < bounds.left || pointerX > bounds.right || pointerY < bounds.top || pointerY > bounds.bottom) {
            hideGridHover();
            return;
        }
        // Convert viewport coordinates so the light stays aligned with the SVG.
        const viewBox = cuttingMatSvg.viewBox.baseVal;
        const targetX = (pointerX - bounds.left) * viewBox.width / bounds.width;
        const targetY = (pointerY - bounds.top) * viewBox.height / bounds.height;
        if (!hoverTracking || reducedGridMotion.matches || gridGlow.followDelayMs === 0) {
            hoverX = targetX;
            hoverY = targetY;
        } else {
            // A short, time-based follow feels consistent on 60 Hz and 120 Hz.
            const elapsed = Math.min(48, Math.max(1, time - hoverTime));
            const follow = 1 - Math.exp(-elapsed / gridGlow.followDelayMs);
            hoverX += (targetX - hoverX) * follow;
            hoverY += (targetY - hoverY) * follow;
            // Keep fast pointer sweeps within the light instead of far ahead of it.
            const lag = Math.hypot(targetX - hoverX, targetY - hoverY);
            if (lag > gridGlow.maxLagPx) {
                hoverX = targetX - (targetX - hoverX) * gridGlow.maxLagPx / lag;
                hoverY = targetY - (targetY - hoverY) * gridGlow.maxLagPx / lag;
            }
        }
        hoverTime = time;
        hoverTracking = true;
        const settling = !reducedGridMotion.matches && Math.hypot(targetX - hoverX, targetY - hoverY) > 0.2;
        if (!settling) { hoverX = targetX; hoverY = targetY; }
        gridHoverGradient.setAttribute('gradientTransform', `translate(${hoverX.toFixed(2)} ${hoverY.toFixed(2)})`);
        cuttingMatSvg.classList.add('is-pointer-over-grid');
        if (settling) hoverFrame = requestAnimationFrame(paintGridHover);
    }
    document.addEventListener('pointermove', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (event.pointerType !== 'mouse' || !canHoverGrid()) {
            hideGridHover();
            return;
        }
        if (hoverPreviewPinned) {
            if (!cuttingMatSvg.classList.contains('is-pointer-over-grid')) requestHoverPreview();
            return;
        }
        if (target?.closest('video, button, a, input, textarea, select, [role="button"], [role="dialog"], [data-grid-glow-studio]')) {
            hideGridHover();
            return;
        }
        pointerX = event.clientX;
        pointerY = event.clientY;
        hoverHasPosition = true;
        if (!hoverFrame) {
            hoverTime = performance.now();
            hoverFrame = requestAnimationFrame(paintGridHover);
        }
    }, { passive: true });
    root.addEventListener('pointerleave', hideGridHover, { passive: true });
    document.addEventListener('pointercancel', hideGridHover, { passive: true });
    document.addEventListener('visibilitychange', hideGridHover);
    window.addEventListener('blur', hideGridHover);
    window.addEventListener('resize', hideGridHover, { passive: true });
    window.addEventListener('scroll', event => {
        if (event.target instanceof Element && event.target.closest('[data-grid-glow-studio]')) return;
        hideGridHover();
    }, { passive: true, capture: true });
    hoverPointer.addEventListener('change', hideGridHover);
    reducedGridMotion.addEventListener('change', hideGridHover);

    function requestHoverPreview() {
        if (!canHoverGrid()) { hideGridHover(); return; }
        if (!hoverHasPosition) {
            pointerX = Math.min(240, innerWidth * 0.16);
            pointerY = Math.max(100, innerHeight * 0.32);
            hoverHasPosition = true;
        }
        if (!hoverFrame) {
            hoverTime = performance.now();
            hoverFrame = requestAnimationFrame(paintGridHover);
        }
    }
    function updateGridGlow(patch = {}) {
        if (!patch || typeof patch !== 'object') return { ...gridGlow };
        const limits = {
            radiusPx: [40, 400], brightness: [0, 1], softness: [0, 100],
            lineWidthPx: [0.5, 3], followDelayMs: [0, 200], maxLagPx: [0, 200],
            fadeInMs: [0, 1200], fadeOutMs: [0, 1200]
        };
        for (const [key, [min, max]] of Object.entries(limits)) {
            if (typeof patch[key] === 'number' && Number.isFinite(patch[key])) gridGlow[key] = Math.min(max, Math.max(min, patch[key]));
        }
        for (const key of ['coreColor', 'edgeColor']) {
            if (typeof patch[key] === 'string' && /^#[0-9a-f]{6}$/i.test(patch[key])) gridGlow[key] = patch[key].toLowerCase();
        }
        if (typeof patch.enabled === 'boolean') gridGlow.enabled = patch.enabled;
        applyGridGlowStyle();
        if (!canHoverGrid()) hideGridHover();
        else if (hoverTracking || hoverPreviewPinned) requestHoverPreview();
        return { ...gridGlow };
    }
    window.ReelsfolioGridGlow = Object.freeze({
        getSettings: () => ({ ...gridGlow }),
        update: updateGridGlow,
        reset: () => updateGridGlow(gridGlowDefaults),
        setPreviewPinned(value) {
            hoverPreviewPinned = Boolean(value);
            if (hoverPreviewPinned) requestHoverPreview();
            else hideGridHover();
        }
    });

    const mobile = matchMedia('(max-width: 600px)');
    let ready = false, loading = null, paused;
    function syncPause() {
        if (!canHoverGrid()) hideGridHover();
        const next = !ready || document.hidden || mobile.matches || document.body.classList.contains('desktop-fullscreen-mode');
        if (next === paused) return;
        paused = next;
        root.toggleAttribute('data-environment-paused', paused);
    }
    function loadShadow() {
        syncPause();
        if (ready || loading || mobile.matches || document.hidden) return;
        const image = new Image();
        image.decoding = 'async';
        image.crossOrigin = 'anonymous';
        image.src = 'assets/environment/olive-bough.webp';
        loading = image.decode().then(() => {
            // Set the mask and reveal the complete window+foliage together only
            // after decode. The ready flag is never reset by navigation/resizing.
            ready = true;
            root.setAttribute('data-environment-ready', '');
            syncPause();
        }).catch(() => {
            // Leave just the grid visible on failure, not an unmasked rectangle.
            // A later online/visibility/desktop change can retry without a loop.
        }).finally(() => { loading = null; });
    }
    new MutationObserver(syncPause).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    mobile.addEventListener('change', loadShadow);
    document.addEventListener('visibilitychange', () => { scheduleGrid(); loadShadow(); });
    window.addEventListener('online', loadShadow);
    loadShadow();
})();
