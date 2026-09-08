/* Production-only background: fixed grid + one decoded olive shadow.
   No controllers, preset parsing, localStorage, per-frame JS, or scene swapping. */
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
    let cuttingMatSignature = '';
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
        cuttingMatSvg.innerHTML = `
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
        `;
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

    const mobile = matchMedia('(max-width: 600px)');
    let ready = false, loading = null, paused;
    function syncPause() {
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
        image.src = 'assets/environment/olive-bough.png';
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
