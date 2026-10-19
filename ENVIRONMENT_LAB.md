# Production environment

## Dither glow trial

The **Background** button in the top-right corner opens the glow controller.
**Section colors** edits the current video's palette. The section picker and its
previous/next buttons navigate directly to the video; ordinary scrolling and reel
navigation also keep the picker in sync. It stays visible while editing lower controls.
**Match intro lighting** is enabled by default, including for existing saved palettes.
The intro's current palette is the reference for all ten sections. Each other section
retains its hue family, with a single **Hue** slider and **Edit intro lighting** shortcut.
Changes to the intro's saturation, brightness, mat lines, and glow propagate to every
linked section. **Reset section hue** restores that video's original hue only.

Hue rotation operates in OKLab on the completed shader color, preserving perceptual
lightness at every dither tone, highlight, and shadow. The mat lines receive the same
rotation. Out-of-gamut hues reduce chroma only as needed instead of clipping channels;
the intro itself bypasses the rotation and remains pixel-identical. Hue transitions
take the shorter arc, preserving the light/dark balance throughout the transition.
The exported saturation/brightness values describe the intro reference in linked mode;
the final background hex is the perceptually matched output, not a separate HSV edit.

Turning off **Match intro lighting** restores independent editing and earlier saved
palettes: background HSV/base color, mat-line color and brightness, and glow tint,
saturation and brightness. Glow brightness ranges from 0–200%; 100% retains the
shared glow strength. The match preference is stored with the section overrides.

Section overrides are saved by stable video ID in `reelfolio.section-colors.v1`.
Independent fields inherit the original video's background and shared mat/glow defaults.
**Reset this section** removes only that section's color overrides. Linked mode ignores
non-hue overrides on other sections without deleting them. The intro remains unchanged.
Color math and persistence live
in `section-colors.js`; the application in `index.html` supplies section identities for every navigation path.
Mat colors are applied to the existing SVG, preserving its minor/major line hierarchy.
Glow tint, saturation, and brightness enter the same dither shader and transition
between sections without an additional render loop. Edits also repaint still scenes.

The initial loader uses the same intro palette and dithered scene. Its grid-line
shimmer keeps its gradient mask, and the grid entrance fades to the selected mat
brightness instead of overriding it with full opacity. Palette recoloring only
targets painted SVG groups, preserving the loader mask and pointer-light gradient.
While the dither foliage decodes, the original smooth window stays hidden to avoid
a flash of the previous treatment; failures still restore the original fallback.
The Background controller joins the other controls after the first video frame.
Palette registration works whether the video data or deferred background scripts
finish first. The approved dither alpha mask is retained alongside the original
environment's WebP texture.

**Light & motion** contains the shared dither and foliage controls below. Its
default saturation and mat brightness affect sections without overrides for those
fields. **Reset light settings** restores the approved shared setup while preserving
all per-section palettes.

The effect starts enabled, with the approved **Foliage light** settings as the default. Choose between
Light veils (long folds), Soft drift (diffused pools), Water light (intersecting
wave caustics), Contours (moving topographic lines), Original fluid (the earlier
cloudy treatment), and **Foliage light** (the production window and olive shadows).
Each look uses a different field, with its own starting values.

Form size, distortion, and motion speed (0 is still) shape the procedural looks.
**Dither & light** brings dither amount, dot size, glow strength, and saturation
together. **Fine tuning** expands softness, contrast, fine detail, direction, and
tonal steps (2–8; fewer gives stronger separation). Dither amount 0 is smooth light;
100% applies the complete ordered screen. **New composition** changes the pattern seed without changing the
controls. **Reset look** restores the selected look's shape, motion, and composition;
**Reset light settings** restores the complete shared trial defaults. Each look remembers its own
shape/motion adjustments when switching, including across reloads. Glow strength,
saturation, pixel size, mat brightness, grid visibility, and the on/off switch are
shared between looks. Glow saturation ranges from 0–250%: 100% reproduces the earlier
palette, 0% makes the glow neutral, and higher values increase saturation while
preserving hue and peak brightness. The approved default is 250%.

**Copy JSON** copies a version 3 snapshot of all current settings, including hidden
fine tuning, composition seed, remembered looks, foliage adjustments, the source reference,
and every section palette. The `sectionColors` object includes the active section,
readable titles, effective colors, and explicit overrides so inherited values remain
distinguishable. Its version 2 schema records `matchIntro`, `referenceSection`, and
the applied hue rotation. The original version 2 default fixture stays unchanged.
Paste it into chat to share a look. If clipboard access is unavailable, a selected,
read-only text field provides the same JSON for manual copying.

**Foliage light** uses the real `olive-bough-mask.webp` alpha texture. Window placement,
clip shape, crossbars, flipped tree placement, radial falloff, and sway are derived
from the frozen production scene. Only that window footprint lights the mat.
The combined **Window & leaves** controls expose leaf blur (0–100px), shadow depth,
and independent window blur (0–60px). Leaf blur starts at 11px, with no hidden shared
blur added to it; window blur starts at 14px and shadow depth at 85%. The old
`softness` field remains in saved data for compatibility but no longer blurs foliage.
The window, frame bars, leaves, edge blur, and radial falloff form one scalar light
field before dithering. Highlight headroom keeps dots visible in the clear left pane;
there is no smooth opacity fade after the dither step. Outside the light the mat
color is unchanged. Foliage starts with three tonal steps; procedural looks keep five.

The foliage has its own speed (30% matches the original five-second alternate sway)
and contrast. **Placement & sway** adds tree size, horizontal/vertical offsets,
window angle, and sway amount. At 100% size, zero offsets, −17° window angle, and
100% sway the original scene placement and motion are retained. Zero sway or speed
stops animation. Procedural form size, distortion, softness, detail, direction, and
random composition are hidden for this source. Switching back restores each look's
scene and dither controls; existing shared color/grid choices are preserved.

A **Light preview** (sticky on desktop, in the scroll flow on mobile) shows the entire scene while adjusting controls, including
shadows obscured by the video or controller. It copies the already-rendered frame
only while the foliage panel is open, with a maximum 576 × 360 backing canvas and
no additional animation loop. On mobile the glow and preview use the video's assigned
palette even though the underlying video surround is black. The mask is decoded lazily once and padded/blurred
only on changes to leaf size or leaf blur. Window blur, placement, depth, and dither
controls do not re-upload the texture. Decode failures show the original mat with a Retry foliage
button; late loads cannot override a newer selection or an off/hidden state.

Switch **Dither glow** off to restore the original mat and olive shadow.
**Keep mat grid** combines the grid with the glow. Version 2 preferences use a
separate storage key and migrate the earlier brightness, speed, pixels, grid, and
on/off preferences without overwriting the version 1 record. The glow reads the
existing interpolated `--active-bg-color`, so every video keeps its assigned color
and the existing transition timing.

**Mat brightness** controls grid opacity independently of glow strength. The grid
now uses normal blending to remain legible on dark palettes, at 29% overall opacity
by default; its internal minor/major line hierarchy is retained. The slider remains
available with the glow off. Existing saved settings, including fine tuning and
composition seeds, are preserved; the new color controls only fill missing values.

`dither-background.js` and `dither-background.css` are isolated from playback and
the archived labs. The WebGL renderer uses a fixed Bayer screen over the selected
light field, at one render sample per visible dither pixel. Veils, drift, and
contours carry a stable field through space instead of independently animating
multiple noise fields; water light uses the curvature of intersecting waves.
It caps rendering
at 30 fps (24 on mobile), 1.1 million samples, and 1600 pixels per side. Off, hidden,
and fullscreen states stop rendering. Reduced motion and Motion = 0 hold a still
pattern, while video color transitions continue to update it. A missing/lost WebGL
context restores the original mat, and a restored context rebuilds the effect.

The exact approved configuration is recorded in `dither-default.json`, including
all six looks. It is a source record, not an extra runtime fetch; a regression check
compares the complete shared default JSON export against it. Fresh visits and **Reset light settings**
use Foliage light: 33% glow, 41% motion, 250% saturation, 2.5px dots, 72% dither,
three tonal steps, 72% contrast, 11px leaf blur, 14px window blur, 85% shadow depth,
95% tree size, and mat grid on at 29% brightness. Light veils now starts at 72%
motion; Soft drift retains its approved 20% size, 43% distortion, and 96% motion.
Existing device preferences continue to take precedence until reset.
Run `node --test tests/*.test.cjs` for the regression checks.

## Original mat treatment

The site uses the selected olive-bough scene with the exact settings recorded
in `environment-default.json`. This JSON is a source record for the production
regression checks, not a runtime fetch.

- `environment-production.css` contains the frozen appearance and foliage animation.
- `background-runtime.js` renders the cutting-mat grid and prepares the foliage.
- `assets/environment/olive-bough.webp` supplies the original environment; `olive-bough-mask.webp` supplies the approved dither silhouette.
- `assets/environment/PROMPTS.md` records the retained texture's provenance.

Mobile does not request the foliage texture. Desktop waits for image decoding
before revealing the environment together. Hidden tabs and fullscreen pause
the sway without resetting it; reduced-motion preferences are respected. Failed
texture loading leaves the environment hidden rather than showing a bare window.

Retired lab controllers, alternate shaders, alternate textures, and their
study-only test have been removed. Old lab query strings do not enable a
different mode. The earlier experiments remain recoverable from Git history.

To run the retained regression checks: `node --test tests/*.test.cjs`.
