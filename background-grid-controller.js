(() => {
    'use strict';

    if (document.getElementById('reelfolio-grid-controller')) return;

    const ROOT = document.documentElement;
    const STYLE_ID = 'reelfolio-grid-experiment-styles';
    const HOST_ID = 'reelfolio-grid-controller';
    const searchParams = new URLSearchParams(window.location.search);
    const showPanel = (searchParams.has('lab') || searchParams.has('controls') || searchParams.has('grid-controls'))
        && !searchParams.has('experiment-preview');
    const defaults = {
        pattern: 'cutting-mat',
        color: '#f2dbcf',
        spacing: 28,
        thickness: 1,
        opacity: 14,
        majorEvery: 6,
        majorOpacity: 42,
        edgeTicks: true,
        numericGuides: true,
        radiusGuides: true,
        angleGuides: true,
        angleStep: 30,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
        blur: 0,
        blend: 'soft-light',
        fade: false,
        grainEnabled: true,
        grainOpacity: 37,
        grainSize: 215,
        grainContrast: 105,
        grainBlend: 'soft-light',
        lightEnabled: true,
        lightPattern: 'window-foliage',
        lightColor: '#ffe0b7',
        lightIntensity: 46,
        lightAngle: 112,
        lightSlatWidth: 165,
        lightGap: 50,
        lightSoftness: 14,
        lightX: 43,
        lightY: -37,
        lightSpreadX: 63,
        lightSpreadY: 168,
        lightBlend: 'soft-light',
        foliageStyle: 'broad',
        foliageScale: 400,
        foliageDensity: 100,
        foliageMotion: true,
        foliageMotionAmount: 33,
        foliageMotionRotation: 3.9,
        foliageMotionSpeed: 8,
        windowRotation: -20,
        windowFrameWidth: 39,
        windowShadowOpacity: 77,
        windowX: 0,
        windowY: 0,
        windowScale: 100,
        leftLeafX: 48,
        leftLeafY: -18,
        rightLeafX: 31,
        rightLeafY: 37
    };
    const state = { ...defaults };

    const experimentStyle = document.createElement('style');
    experimentStyle.id = STYLE_ID;
    experimentStyle.textContent = `
        .bg-layer::after {
            content: '';
            position: absolute;
            inset: -50%;
            z-index: 1;
            pointer-events: none;
            opacity: var(--bg-grid-opacity);
            background-position: var(--bg-grid-offset-x) var(--bg-grid-offset-y);
            transform: rotate(var(--bg-grid-rotation));
            transform-origin: center;
            filter: blur(var(--bg-grid-blur));
            mix-blend-mode: var(--bg-grid-blend);
            transition: opacity 180ms ease;
            will-change: transform, background-position;
        }

        :root[data-bg-grid-pattern="none"] .bg-layer::after {
            opacity: 0;
        }

        :root[data-bg-grid-pattern="cutting-mat"] .bg-layer::after {
            opacity: 0;
        }

        :root[data-bg-grid-pattern="square"] .bg-layer::after {
            background-image:
                linear-gradient(
                    to right,
                    rgb(var(--bg-grid-rgb)) 0 var(--bg-grid-thickness),
                    transparent var(--bg-grid-thickness)
                ),
                linear-gradient(
                    to bottom,
                    rgb(var(--bg-grid-rgb)) 0 var(--bg-grid-thickness),
                    transparent var(--bg-grid-thickness)
                );
            background-size: var(--bg-grid-spacing) var(--bg-grid-spacing);
        }

        :root[data-bg-grid-pattern="dots"] .bg-layer::after {
            background-image: radial-gradient(
                circle,
                rgb(var(--bg-grid-rgb)) 0 var(--bg-grid-thickness),
                transparent calc(var(--bg-grid-thickness) + 0.6px)
            );
            background-size: var(--bg-grid-spacing) var(--bg-grid-spacing);
        }

        :root[data-bg-grid-pattern="diagonal"] .bg-layer::after {
            background-image: repeating-linear-gradient(
                45deg,
                rgb(var(--bg-grid-rgb)) 0 var(--bg-grid-thickness),
                transparent var(--bg-grid-thickness) var(--bg-grid-spacing)
            );
        }

        :root[data-bg-grid-pattern="crosshatch"] .bg-layer::after {
            background-image:
                repeating-linear-gradient(
                    45deg,
                    rgb(var(--bg-grid-rgb)) 0 var(--bg-grid-thickness),
                    transparent var(--bg-grid-thickness) var(--bg-grid-spacing)
                ),
                repeating-linear-gradient(
                    -45deg,
                    rgb(var(--bg-grid-rgb)) 0 var(--bg-grid-thickness),
                    transparent var(--bg-grid-thickness) var(--bg-grid-spacing)
                );
        }

        :root[data-bg-grid-pattern="isometric"] .bg-layer::after {
            background-image:
                linear-gradient(
                    30deg,
                    rgb(var(--bg-grid-rgb)) 0 var(--bg-grid-thickness),
                    transparent var(--bg-grid-thickness)
                ),
                linear-gradient(
                    -30deg,
                    rgb(var(--bg-grid-rgb)) 0 var(--bg-grid-thickness),
                    transparent var(--bg-grid-thickness)
                ),
                linear-gradient(
                    90deg,
                    rgb(var(--bg-grid-rgb)) 0 var(--bg-grid-thickness),
                    transparent var(--bg-grid-thickness)
                );
            background-size:
                calc(var(--bg-grid-spacing) * 2) var(--bg-grid-spacing),
                calc(var(--bg-grid-spacing) * 2) var(--bg-grid-spacing),
                calc(var(--bg-grid-spacing) * 2) var(--bg-grid-spacing);
        }

        .bg-grid-cutting-mat {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 1;
            pointer-events: none;
            transform:
                translate(var(--bg-grid-offset-x), var(--bg-grid-offset-y))
                rotate(var(--bg-grid-rotation));
            transform-origin: center;
            filter: blur(var(--bg-grid-blur));
            mix-blend-mode: var(--bg-grid-blend);
        }

        :root:not([data-bg-grid-pattern="cutting-mat"]) .bg-grid-cutting-mat {
            display: none;
        }

        :root[data-bg-grid-fade] .bg-layer::after,
        :root[data-bg-grid-fade] .bg-grid-cutting-mat {
            mask-image: radial-gradient(
                ellipse at center,
                black 20%,
                rgba(0, 0, 0, 0.75) 58%,
                transparent 82%
            );
            -webkit-mask-image: radial-gradient(
                ellipse at center,
                black 20%,
                rgba(0, 0, 0, 0.75) 58%,
                transparent 82%
            );
        }
    `;
    document.head.appendChild(experimentStyle);

    const bgLayer = document.getElementById('bgLayer');
    const cuttingMatSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cuttingMatSvg.classList.add('bg-grid-cutting-mat');
    cuttingMatSvg.setAttribute('aria-hidden', 'true');
    if (bgLayer) bgLayer.appendChild(cuttingMatSvg);

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'position:static;display:block;width:100%;';
    document.body.appendChild(host);
    if (!showPanel && !window.ReelFolioLab) host.style.display = 'none';

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
        <style>
            :host { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
            * { box-sizing: border-box; }
            :host-context(.rf-lab-window) .header,
            :host([data-lab-hosted]) .header {
                display: none;
            }
            :host-context(.rf-lab-window) .panel,
            :host([data-lab-hosted]) .panel {
                width: 100%;
                max-height: none;
                overflow: visible;
                background: transparent;
                border: 0;
                border-radius: 0;
                box-shadow: none;
                backdrop-filter: none;
            }
            .panel {
                width: 300px;
                max-height: calc(100vh - 32px);
                overflow: auto;
                color: #f6f6f8;
                background: rgba(17, 18, 23, 0.94);
                border: 1px solid rgba(255,255,255,0.13);
                border-radius: 16px;
                box-shadow: 0 18px 60px rgba(0,0,0,0.45);
                backdrop-filter: blur(18px);
            }
            .header {
                position: sticky;
                top: 0;
                z-index: 2;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 15px;
                background: rgba(17, 18, 23, 0.96);
                border-bottom: 1px solid rgba(255,255,255,0.08);
            }
            h2 { margin: 0; font-size: 14px; letter-spacing: -0.01em; }
            .collapse {
                width: 28px;
                height: 28px;
                border: 0;
                border-radius: 8px;
                color: inherit;
                background: rgba(255,255,255,0.09);
                cursor: pointer;
            }
            .content { padding: 14px; display: grid; gap: 14px; }
            .panel.collapsed { width: 190px; overflow: hidden; }
            .panel.collapsed .content { display: none; }
            label, .label { font-size: 12px; color: rgba(255,255,255,0.72); }
            .row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin-bottom: 6px;
            }
            output { font-size: 11px; color: #b8adff; font-variant-numeric: tabular-nums; }
            select, input[type="color"] {
                height: 34px;
                color: inherit;
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 9px;
            }
            select { width: 150px; padding: 0 9px; }
            input[type="color"] { width: 46px; padding: 3px; }
            input[type="range"] { width: 100%; accent-color: #8b7cff; }
            .toggle { display: flex; align-items: center; justify-content: space-between; }
            .subsection {
                display: grid;
                gap: 12px;
                padding: 12px;
                border: 1px solid rgba(255,255,255,0.09);
                border-radius: 12px;
                background: rgba(255,255,255,0.035);
            }
            .subsection[hidden] { display: none; }
            .subsection [hidden] { display: none !important; }
            .subsection-title { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.9); }
            .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .action {
                height: 36px;
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 10px;
                color: inherit;
                background: rgba(255,255,255,0.08);
                cursor: pointer;
            }
            .action.primary { background: #7667e8; border-color: #8b7cff; }
            .status { min-height: 16px; margin: 0; font-size: 11px; color: #b7efc5; }
        </style>
        <section class="panel" aria-label="Background grid experiment controller">
            <div class="header">
                <h2>Background grid lab</h2>
                <button class="collapse" type="button" aria-label="Collapse controller">−</button>
            </div>
            <div class="content">
                <div class="row">
                    <label for="grid-pattern">Pattern</label>
                    <select id="grid-pattern" data-property="pattern">
                        <option value="none">None</option>
                        <option value="cutting-mat" selected>Cutting mat</option>
                        <option value="square">Square</option>
                        <option value="dots">Dots</option>
                        <option value="diagonal">Diagonal</option>
                        <option value="crosshatch">Crosshatch</option>
                        <option value="isometric">Isometric</option>
                    </select>
                </div>
                <div class="row">
                    <label for="grid-color">Color</label>
                    <input id="grid-color" type="color" value="#ffffff" data-property="color">
                </div>
                <div>
                    <div class="row"><label for="grid-spacing">Spacing</label><output data-output="spacing">28px</output></div>
                    <input id="grid-spacing" type="range" min="8" max="120" step="1" value="28" data-property="spacing">
                </div>
                <div>
                    <div class="row"><label for="grid-thickness">Thickness</label><output data-output="thickness">1px</output></div>
                    <input id="grid-thickness" type="range" min="0.25" max="5" step="0.25" value="1" data-property="thickness">
                </div>
                <div>
                    <div class="row"><label for="grid-opacity">Minor grid opacity</label><output data-output="opacity">13%</output></div>
                    <input id="grid-opacity" type="range" min="0" max="70" step="1" value="13" data-property="opacity">
                </div>
                <div class="subsection" data-cutting-controls>
                    <span class="subsection-title">Cutting mat guides</span>
                    <div>
                        <div class="row"><label for="grid-major-every">Major line interval</label><output data-output="majorEvery">5</output></div>
                        <input id="grid-major-every" type="range" min="2" max="10" step="1" value="5" data-property="majorEvery">
                    </div>
                    <div>
                        <div class="row"><label for="grid-major-opacity">Major opacity</label><output data-output="majorOpacity">27%</output></div>
                        <input id="grid-major-opacity" type="range" min="0" max="80" step="1" value="27" data-property="majorOpacity">
                    </div>
                    <label class="toggle"><span class="label">Edge ticks</span><input type="checkbox" checked data-property="edgeTicks"></label>
                    <label class="toggle"><span class="label">Numeric guides</span><input type="checkbox" checked data-property="numericGuides"></label>
                    <label class="toggle"><span class="label">Radius guides</span><input type="checkbox" checked data-property="radiusGuides"></label>
                    <label class="toggle"><span class="label">Angle guides</span><input type="checkbox" checked data-property="angleGuides"></label>
                    <div class="row">
                        <label for="grid-angle-step">Angle spacing</label>
                        <select id="grid-angle-step" data-property="angleStep">
                            <option value="5">5°</option>
                            <option value="10">10°</option>
                            <option value="15" selected>15°</option>
                            <option value="30">30°</option>
                        </select>
                    </div>
                </div>
                <div>
                    <div class="row"><label for="grid-rotation">Rotation</label><output data-output="rotation">0°</output></div>
                    <input id="grid-rotation" type="range" min="-45" max="45" step="1" value="0" data-property="rotation">
                </div>
                <div>
                    <div class="row"><label for="grid-offset-x">Horizontal offset</label><output data-output="offsetX">0px</output></div>
                    <input id="grid-offset-x" type="range" min="-120" max="120" step="1" value="0" data-property="offsetX">
                </div>
                <div>
                    <div class="row"><label for="grid-offset-y">Vertical offset</label><output data-output="offsetY">0px</output></div>
                    <input id="grid-offset-y" type="range" min="-120" max="120" step="1" value="0" data-property="offsetY">
                </div>
                <div>
                    <div class="row"><label for="grid-blur">Blur</label><output data-output="blur">0px</output></div>
                    <input id="grid-blur" type="range" min="0" max="10" step="0.5" value="0" data-property="blur">
                </div>
                <div class="row">
                    <label for="grid-blend">Blend mode</label>
                    <select id="grid-blend" data-property="blend">
                        <option value="normal">Normal</option>
                        <option value="soft-light" selected>Soft light</option>
                        <option value="overlay">Overlay</option>
                        <option value="screen">Screen</option>
                        <option value="multiply">Multiply</option>
                    </select>
                </div>
                <label class="toggle">
                    <span class="label">Fade toward edges</span>
                    <input type="checkbox" checked data-property="fade">
                </label>
                <div class="subsection">
                    <span class="subsection-title">Grain adjustment layer</span>
                    <label class="toggle">
                        <span class="label">Enable grain</span>
                        <input type="checkbox" checked data-property="grainEnabled">
                    </label>
                    <div>
                        <div class="row"><label for="grain-opacity">Amount</label><output data-output="grainOpacity">37%</output></div>
                        <input id="grain-opacity" type="range" min="0" max="40" step="1" value="37" data-property="grainOpacity">
                    </div>
                    <div>
                        <div class="row"><label for="grain-size">Texture scale</label><output data-output="grainSize">215px</output></div>
                        <input id="grain-size" type="range" min="40" max="400" step="5" value="215" data-property="grainSize">
                    </div>
                    <div>
                        <div class="row"><label for="grain-contrast">Contrast</label><output data-output="grainContrast">105%</output></div>
                        <input id="grain-contrast" type="range" min="50" max="220" step="5" value="105" data-property="grainContrast">
                    </div>
                    <div class="row">
                        <label for="grain-blend">Blend mode</label>
                        <select id="grain-blend" data-property="grainBlend">
                            <option value="normal">Normal</option>
                            <option value="soft-light" selected>Soft light</option>
                            <option value="overlay">Overlay</option>
                            <option value="multiply">Multiply</option>
                            <option value="screen">Screen</option>
                        </select>
                    </div>
                </div>
                <div class="subsection">
                    <span class="subsection-title">Sunlight shader · Original</span>
                    <p data-environment-notice hidden style="margin:0;font-size:11px;color:#b7efc5">Choose original foliage or tree shadows in Environment. Shared lighting and placement controls stay in sync between both panels.</p>
                    <label class="toggle">
                        <span class="label">Enable light</span>
                        <input type="checkbox" checked data-property="lightEnabled">
                    </label>
                    <div class="row">
                        <label for="light-pattern">Light pattern</label>
                        <select id="light-pattern" data-property="lightPattern">
                            <option value="blinds">Blinds</option>
                            <option value="foliage" selected>Foliage</option>
                            <option value="window-foliage">Window + plant</option>
                        </select>
                    </div>
                    <div class="row">
                        <label for="light-color">Light color</label>
                        <input id="light-color" type="color" value="#ffe0b7" data-property="lightColor">
                    </div>
                    <div>
                        <div class="row"><label for="light-intensity">Intensity</label><output data-output="lightIntensity">47%</output></div>
                        <input id="light-intensity" type="range" min="0" max="100" step="1" value="47" data-property="lightIntensity">
                    </div>
                    <div data-blinds-control>
                        <div class="row"><label for="light-angle">Angle</label><output data-output="lightAngle">112°</output></div>
                        <input id="light-angle" type="range" min="0" max="180" step="1" value="112" data-property="lightAngle">
                    </div>
                    <div data-blinds-control>
                        <div class="row"><label for="light-slat-width">Beam width</label><output data-output="lightSlatWidth">165px</output></div>
                        <input id="light-slat-width" type="range" min="8" max="240" step="1" value="165" data-property="lightSlatWidth">
                    </div>
                    <div data-blinds-control>
                        <div class="row"><label for="light-gap">Blind gap</label><output data-output="lightGap">50px</output></div>
                        <input id="light-gap" type="range" min="2" max="180" step="1" value="50" data-property="lightGap">
                    </div>
                    <div data-foliage-control data-foliage-style-control hidden>
                        <div class="row">
                            <label for="foliage-style">Leaf shape</label>
                            <select id="foliage-style" data-property="foliageStyle">
                                <option value="organic" selected>Organic canopy</option>
                                <option value="fine">Fine leaves</option>
                                <option value="broad">Broad leaves</option>
                                <option value="palm">Palm fronds</option>
                            </select>
                        </div>
                    </div>
                    <div data-foliage-control hidden>
                        <div class="row"><label for="foliage-scale">Leaf scale</label><output data-output="foliageScale">380px</output></div>
                        <input id="foliage-scale" type="range" min="80" max="520" step="5" value="380" data-property="foliageScale">
                    </div>
                    <div data-foliage-control hidden>
                        <div class="row"><label for="foliage-density">Leaf density</label><output data-output="foliageDensity">100%</output></div>
                        <input id="foliage-density" type="range" min="0" max="100" step="1" value="100" data-property="foliageDensity">
                    </div>
                    <label class="toggle" data-foliage-control hidden>
                        <span class="label">Animate breeze</span>
                        <input type="checkbox" checked data-property="foliageMotion">
                    </label>
                    <div data-foliage-control hidden>
                        <div class="row"><label for="foliage-motion-amount">Breeze amount</label><output data-output="foliageMotionAmount">14px</output></div>
                        <input id="foliage-motion-amount" type="range" min="0" max="50" step="1" value="14" data-property="foliageMotionAmount">
                    </div>
                    <div data-foliage-control hidden>
                        <div class="row"><label for="foliage-motion-rotation">Leaf sway</label><output data-output="foliageMotionRotation">0.8°</output></div>
                        <input id="foliage-motion-rotation" type="range" min="0" max="4" step="0.1" value="0.8" data-property="foliageMotionRotation">
                    </div>
                    <div data-foliage-control hidden>
                        <div class="row"><label for="foliage-motion-speed">Breeze duration</label><output data-output="foliageMotionSpeed">12s</output></div>
                        <input id="foliage-motion-speed" type="range" min="3" max="30" step="1" value="12" data-property="foliageMotionSpeed">
                    </div>
                    <div data-window-control hidden>
                        <span class="subsection-title">Window placement</span>
                    </div>
                    <div data-window-control hidden>
                        <div class="row"><label for="window-x">Horizontal position</label><output data-output="windowX">0px</output></div>
                        <input id="window-x" type="range" min="-500" max="500" step="5" value="0" data-property="windowX">
                    </div>
                    <div data-window-control hidden>
                        <div class="row"><label for="window-y">Vertical position</label><output data-output="windowY">0px</output></div>
                        <input id="window-y" type="range" min="-400" max="400" step="5" value="0" data-property="windowY">
                    </div>
                    <div data-window-control hidden>
                        <div class="row"><label for="window-scale">Window scale</label><output data-output="windowScale">100%</output></div>
                        <input id="window-scale" type="range" min="50" max="160" step="1" value="100" data-property="windowScale">
                    </div>
                    <div data-window-control hidden>
                        <div class="row"><label for="window-rotation">Window rotation</label><output data-output="windowRotation">7°</output></div>
                        <input id="window-rotation" type="range" min="-20" max="20" step="1" value="7" data-property="windowRotation">
                    </div>
                    <div data-window-control hidden>
                        <div class="row"><label for="window-frame-width">Frame width</label><output data-output="windowFrameWidth">12px</output></div>
                        <input id="window-frame-width" type="range" min="2" max="40" step="1" value="12" data-property="windowFrameWidth">
                    </div>
                    <div data-window-control hidden>
                        <div class="row"><label for="window-shadow-opacity">Shadow strength</label><output data-output="windowShadowOpacity">62%</output></div>
                        <input id="window-shadow-opacity" type="range" min="0" max="100" step="1" value="62" data-property="windowShadowOpacity">
                    </div>
                    <div data-window-control hidden>
                        <span class="subsection-title">Plant placement</span>
                    </div>
                    <div data-window-control hidden>
                        <div class="row"><label for="left-leaf-x">Left leaves X</label><output data-output="leftLeafX">2%</output></div>
                        <input id="left-leaf-x" type="range" min="-40" max="100" step="1" value="2" data-property="leftLeafX">
                    </div>
                    <div data-window-control hidden>
                        <div class="row"><label for="left-leaf-y">Left leaves Y</label><output data-output="leftLeafY">-12%</output></div>
                        <input id="left-leaf-y" type="range" min="-60" max="80" step="1" value="-12" data-property="leftLeafY">
                    </div>
                    <div data-window-control hidden>
                        <div class="row"><label for="right-leaf-x">Right leaves X</label><output data-output="rightLeafX">68%</output></div>
                        <input id="right-leaf-x" type="range" min="-20" max="120" step="1" value="68" data-property="rightLeafX">
                    </div>
                    <div data-window-control hidden>
                        <div class="row"><label for="right-leaf-y">Right leaves Y</label><output data-output="rightLeafY">-5%</output></div>
                        <input id="right-leaf-y" type="range" min="-60" max="80" step="1" value="-5" data-property="rightLeafY">
                    </div>
                    <div>
                        <div class="row"><label for="light-softness">Softness</label><output data-output="lightSoftness">14px</output></div>
                        <input id="light-softness" type="range" min="0" max="60" step="1" value="14" data-property="lightSoftness">
                    </div>
                    <div>
                        <div class="row"><label for="light-x">Horizontal origin</label><output data-output="lightX">90%</output></div>
                        <input id="light-x" type="range" min="-20" max="120" step="1" value="90" data-property="lightX">
                    </div>
                    <div>
                        <div class="row"><label for="light-y">Vertical origin</label><output data-output="lightY">37%</output></div>
                        <input id="light-y" type="range" min="-40" max="120" step="1" value="37" data-property="lightY">
                    </div>
                    <div>
                        <div class="row"><label for="light-spread-x">Horizontal spread</label><output data-output="lightSpreadX">79%</output></div>
                        <input id="light-spread-x" type="range" min="10" max="150" step="1" value="79" data-property="lightSpreadX">
                    </div>
                    <div>
                        <div class="row"><label for="light-spread-y">Vertical spread</label><output data-output="lightSpreadY">82%</output></div>
                        <input id="light-spread-y" type="range" min="10" max="180" step="1" value="82" data-property="lightSpreadY">
                    </div>
                    <div class="row">
                        <label for="light-blend">Blend mode</label>
                        <select id="light-blend" data-property="lightBlend">
                            <option value="screen">Screen</option>
                            <option value="soft-light" selected>Soft light</option>
                            <option value="overlay">Overlay</option>
                            <option value="color-dodge">Color dodge</option>
                            <option value="normal">Normal</option>
                        </select>
                    </div>
                </div>
                <div class="actions">
                    <button class="action primary" type="button" data-copy>Copy values</button>
                    <button class="action" type="button" data-reset>Reset</button>
                </div>
                <p class="status" aria-live="polite"></p>
            </div>
        </section>
    `;

    if (window.ReelFolioLab) {
        window.ReelFolioLab.register({
            id: 'background',
            title: 'Background grid',
            hint: 'Mat, grain, and sunlight',
            width: 320,
            host
        });
    } else if (!showPanel) {
        host.style.display = 'none';
    }

    const panel = shadow.querySelector('.panel');
    const status = shadow.querySelector('.status');
    const inputs = [...shadow.querySelectorAll('[data-property]')];
    const cuttingControls = shadow.querySelector('[data-cutting-controls]');
    const blindsControls = [...shadow.querySelectorAll('[data-blinds-control]')];
    const foliageControls = [...shadow.querySelectorAll('[data-foliage-control]')];
    const foliageStyleControls = [...shadow.querySelectorAll('[data-foliage-style-control]')];
    const windowControls = [...shadow.querySelectorAll('[data-window-control]')];
    window.addEventListener('reelfolio:environment-mode', event => {
        shadow.querySelector('[data-environment-notice]').hidden = !event.detail.enabled;
    });

    function hexToRgbChannels(hex) {
        const value = hex.replace('#', '');
        return [
            parseInt(value.slice(0, 2), 16),
            parseInt(value.slice(2, 4), 16),
            parseInt(value.slice(4, 6), 16)
        ].join(' ');
    }

    function setStatus(message) {
        status.textContent = message;
        clearTimeout(setStatus.timer);
        setStatus.timer = setTimeout(() => { status.textContent = ''; }, 1600);
    }

    function updateOutput(property) {
        const output = shadow.querySelector(`[data-output="${property}"]`);
        if (!output) return;
        const suffix = [
            'opacity', 'majorOpacity', 'grainOpacity', 'grainContrast',
            'lightIntensity', 'lightX', 'lightY', 'lightSpreadX', 'lightSpreadY',
            'foliageDensity', 'windowShadowOpacity', 'windowScale',
            'leftLeafX', 'leftLeafY', 'rightLeafX', 'rightLeafY'
        ].includes(property)
            ? '%'
            : [
                'rotation', 'angleStep', 'lightAngle', 'foliageMotionRotation',
                'windowRotation'
            ].includes(property)
                ? '°'
                : property === 'foliageMotionSpeed'
                    ? 's'
                : [
                    'majorEvery', 'grainEnabled', 'grainBlend', 'lightEnabled',
                    'lightPattern', 'lightColor', 'lightBlend', 'foliageStyle',
                    'foliageMotion'
                ].includes(property) ? '' : 'px';
        output.textContent = `${state[property]}${suffix}`;
    }

    let cuttingMatSignature = '';
    function renderCuttingMat() {
        if (!bgLayer || state.pattern !== 'cutting-mat') {
            cuttingMatSvg.replaceChildren();
            cuttingMatSignature = '';
            return;
        }

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

    function applyState(source = 'background') {
        ROOT.dataset.bgGridPattern = state.pattern;
        ROOT.dataset.bgLightPattern = state.lightPattern;
        ROOT.dataset.bgFoliageStyle = state.foliageStyle;
        ROOT.toggleAttribute('data-bg-grid-fade', state.fade);
        ROOT.toggleAttribute('data-bg-foliage-motion', state.foliageMotion);
        ROOT.style.setProperty('--bg-grid-rgb', hexToRgbChannels(state.color));
        ROOT.style.setProperty('--bg-grid-spacing', `${state.spacing}px`);
        ROOT.style.setProperty('--bg-grid-thickness', `${state.thickness}px`);
        ROOT.style.setProperty('--bg-grid-opacity', String(state.opacity / 100));
        ROOT.style.setProperty('--bg-grid-rotation', `${state.rotation}deg`);
        ROOT.style.setProperty('--bg-grid-offset-x', `${state.offsetX}px`);
        ROOT.style.setProperty('--bg-grid-offset-y', `${state.offsetY}px`);
        ROOT.style.setProperty('--bg-grid-blur', `${state.blur}px`);
        ROOT.style.setProperty('--bg-grid-blend', state.blend);
        ROOT.style.setProperty('--bg-grain-opacity', String(state.grainEnabled ? state.grainOpacity / 100 : 0));
        ROOT.style.setProperty('--bg-grain-size', `${state.grainSize}px`);
        ROOT.style.setProperty('--bg-grain-contrast', `${state.grainContrast}%`);
        ROOT.style.setProperty('--bg-grain-blend', state.grainBlend);
        ROOT.style.setProperty('--bg-light-opacity', String(state.lightEnabled ? state.lightIntensity / 100 : 0));
        ROOT.style.setProperty('--bg-light-rgb', hexToRgbChannels(state.lightColor));
        ROOT.style.setProperty('--bg-light-angle', `${state.lightAngle}deg`);
        ROOT.style.setProperty('--bg-light-slat-width', `${state.lightSlatWidth}px`);
        ROOT.style.setProperty('--bg-light-gap', `${state.lightGap}px`);
        ROOT.style.setProperty('--bg-light-softness', `${state.lightSoftness}px`);
        ROOT.style.setProperty('--bg-light-x', `${state.lightX}%`);
        ROOT.style.setProperty('--bg-light-y', `${state.lightY}%`);
        ROOT.style.setProperty('--bg-light-spread-x', `${state.lightSpreadX}%`);
        ROOT.style.setProperty('--bg-light-spread-y', `${state.lightSpreadY}%`);
        ROOT.style.setProperty('--bg-light-blend', state.lightBlend);
        ROOT.style.setProperty('--bg-light-foliage-scale', `${state.foliageScale}px`);
        ROOT.style.setProperty('--bg-light-foliage-density', String(state.foliageDensity / 100));
        ROOT.style.setProperty('--bg-light-motion-amount', `${state.foliageMotionAmount}px`);
        ROOT.style.setProperty('--bg-light-motion-rotation', `${state.foliageMotionRotation}deg`);
        ROOT.style.setProperty('--bg-light-motion-speed', `${state.foliageMotionSpeed}s`);
        ROOT.style.setProperty('--bg-window-rotation', `${state.windowRotation}deg`);
        ROOT.style.setProperty('--bg-window-frame-width', `${state.windowFrameWidth}px`);
        ROOT.style.setProperty('--bg-window-shadow-opacity', String(state.windowShadowOpacity / 100));
        ROOT.style.setProperty('--bg-window-x', `${state.windowX}px`);
        ROOT.style.setProperty('--bg-window-y', `${state.windowY}px`);
        ROOT.style.setProperty('--bg-window-scale', String(state.windowScale / 100));
        ROOT.style.setProperty('--bg-window-left-leaf-x', `${state.leftLeafX}%`);
        ROOT.style.setProperty('--bg-window-left-leaf-y', `${state.leftLeafY}%`);
        ROOT.style.setProperty('--bg-window-right-leaf-x', `${state.rightLeafX}%`);
        ROOT.style.setProperty('--bg-window-right-leaf-y', `${state.rightLeafY}%`);
        cuttingControls.hidden = state.pattern !== 'cutting-mat';
        blindsControls.forEach(control => { control.hidden = state.lightPattern !== 'blinds'; });
        const hasPlant = state.lightPattern === 'foliage' || state.lightPattern === 'window-foliage';
        foliageControls.forEach(control => { control.hidden = !hasPlant; });
        foliageStyleControls.forEach(control => { control.hidden = state.lightPattern !== 'foliage'; });
        windowControls.forEach(control => { control.hidden = state.lightPattern !== 'window-foliage'; });
        renderCuttingMat();
        window.dispatchEvent(new CustomEvent('reelfolio:background-settings', { detail: { source, state: { ...state } } }));
    }

    function syncInputs() {
        inputs.forEach(input => {
            const property = input.dataset.property;
            if (input.type === 'checkbox') input.checked = state[property];
            else {
                if (input.type === 'range') {
                    input.min = String(Math.min(Number(input.min), Number(state[property])));
                    input.max = String(Math.max(Number(input.max), Number(state[property])));
                }
                input.value = String(state[property]);
            }
            updateOutput(property);
        });
    }

    inputs.forEach(input => {
        const eventName = input.tagName === 'SELECT' || input.type === 'checkbox' ? 'change' : 'input';
        input.addEventListener(eventName, () => {
            const property = input.dataset.property;
            if (input.type === 'checkbox') state[property] = input.checked;
            else if (input.type === 'range' || property === 'angleStep') state[property] = Number(input.value);
            else state[property] = input.value;
            updateOutput(property);
            applyState();
        });
    });

    shadow.querySelector('.collapse').addEventListener('click', event => {
        const collapsed = panel.classList.toggle('collapsed');
        event.currentTarget.textContent = collapsed ? '+' : '−';
        event.currentTarget.setAttribute('aria-label', collapsed ? 'Expand controller' : 'Collapse controller');
    });

    shadow.querySelector('[data-reset]').addEventListener('click', () => {
        Object.assign(state, defaults);
        syncInputs();
        applyState();
        setStatus('Grid reset');
    });

    shadow.querySelector('[data-copy]').addEventListener('click', async () => {
        const text = `ReelFolio background grid values:\n${JSON.stringify(state, null, 2)}`;
        try {
            await navigator.clipboard.writeText(text);
            setStatus('Values copied');
        } catch (_) {
            setStatus('Copy failed');
        }
    });

    window.ReelFolioBackground = {
        getState: () => ({ ...state }),
        applySettings(values, source = 'environment') {
            for (const key of Object.keys(defaults)) {
                if (Object.hasOwn(values, key)) state[key] = values[key];
            }
            syncInputs();
            applyState(source);
        }
    };
    syncInputs();
    applyState();
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(renderCuttingMat, 100);
    }, { passive: true });
})();
