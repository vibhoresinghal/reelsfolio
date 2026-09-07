# Production environment

The site now uses the selected olive-bough scene and the exact settings recorded
in `environment-default.json`. `environment-production.css` contains the frozen
appearance; `background-runtime.js` renders the cutting-mat grid and prepares the
single visible foliage texture. The JSON is a source record, not a runtime fetch.

The live controller, scene picker, alternate textures, and invisible far canopy
are no longer loaded. Mobile does not request the foliage texture. Desktop waits
for image decoding before revealing the environment together; hidden tabs and
fullscreen pause the sway without resetting it. Reduced-motion preferences are
respected. Failed texture loading leaves the environment hidden rather than
showing an incomplete window.

The experimental scripts, assets, and extracted `environment-lab.css` remain as
offline source backups. Old `?lab=environment` links now show the production site;
they do not activate the old controllers. The historical notes below describe
the retired study, not the current page.

Run regression checks with `node --test tests/*.test.cjs`.

## Archived environment tree-shadow study

Open `http://localhost:8000/?lab=environment` while the local server is running.
The Environment panel opens automatically. It is also available from the design
labs menu at `?lab`.

The original CSS window and foliage remain the default. The scene dropdown also
offers **45 tree-shadow looks**: five independently generated transparent tree
textures, each with nine lighting/projection treatments. These are 45 looks, not
45 independent tree images. The discarded procedural SVG leaf designs are not used.

Start near the warm-wall reference with
`http://127.0.0.1:8000/?lab=environment&scene=afternoon-branch`.

## Tree families

- Afternoon branch: connected boughs, loose oval leaves; the reference starting point.
- Airy birch: fine cascading twigs and smaller leaves.
- Olive bough: slender foliage and more open negative space.
- Broad canopy: dense overlapping leaves and softer distant shade.
- Maple light: lobed leaves with more visible branching and varied focus.

Each offers Reference light, Soft afternoon, Close to the glass, Distant tree,
Open window, Golden hour, Cool morning, Canopy overhead, and Passing breeze.
The small warm-wall thumbnail previews the selected texture, not every live
controller adjustment. The main page renders all lighting and placement changes.

## Controls

The same panel now has 49 controls grouped into Light, Window, Foliage, Placement,
and Motion. They cover light color, falloff and blur; frame size, bars and skew;
foliage proportions, colors and opacity; each cluster's location and tilt; and
breeze travel, sway, timing, easing and relative phase. Tree controls are labelled
for near/far canopy layers; original controls keep their original labels.
For trees, the stem-tint control becomes the distant-shadow tint and secondary-leaf
opacity becomes distant-canopy opacity. Branches and leaves stay connected in each
mask. Tree size scales with viewport width, while original cluster sizes remain pixels.

### Independent softness

- **Window → Window softness** adds 0–60px blur only to the light/frame paint plane.
- **Foliage → Foliage softness** adds 0–60px blur only to the foliage masks.
- **Light → Shared softness (both)** retains the existing overall blur for backwards
  compatibility. Set it to 0px for entirely separate layer softness. The distant
  tree layer retains its existing additional 5px depth blur.

Window softness defaults to 0px, so existing scenes and drafts keep their appearance.

### Direction, window extension, and left-edge fade

- **Placement → Flip foliage horizontally** mirrors both foliage layers and their
  placement, not the window or light direction. All tree presets now enter from
  the right; the original scene keeps its original orientation. When flipped,
  the X sliders measure offsets from the right edge instead of the left.
- **Window → Bottom-left extension** moves only the bottom-left outline corner
  outward (0–80%). A separate light-paint plane fills the added area. Foliage sizes,
  positions, window rotation, and frame thickness stay fixed; frame-bar positions
  are compensated for the larger paint plane. This is not width/height stretching.
- **Window → Left-edge fade** softens the entire left side, from top to bottom
  (0–100%). The value controls how far the fade reaches horizontally into the window;
  0% disables it. The mask follows the slanted left edge even when the bottom-left
  corner is extended. Tree presets start at 18% fade and 0% extension.

These controls round-trip with version 3 drafts. Older tree drafts without an
orientation field use the new right-entry default; explicitly saved orientations
are respected. Compare original disables the flip, extension, and fade.
Drafts using the previous `windowBottomLeftFade` key migrate its amount to
`windowLeftFade`. New copies use the corrected key; the new key takes precedence.

- **Original scene** and **Reset study** restore the original settings.
- **Compare original** shows the untouched starting scene while keeping your
  adjustments. Switch back or edit a control to continue tweaking.
- **Scene & treatment** selects a tree and its starting light/placement settings.
- **Reset placement** restores only the selected family's starting layer placement.
- **Save draft / Load draft** stores one explicitly saved draft in this browser.
- **Copy settings / Apply JSON** round-trip version 3, `window-tree` settings,
  including the selected tree. Version 2 `original-css` drafts still load as original
  foliage. The new draft uses a separate storage key; older drafts are not overwritten.
  The discarded version 1 procedural experiment is not imported.

Shared controls in the Background grid panel and Environment panel stay synchronized.
Grid, grain, video layout, and playback are not changed by environment presets.
Changes are local to the lab page and saving a draft does not publish anything.
Mobile remains shader-free; reduced-motion preferences disable both leaf animations.
In the lab, animation also pauses while the page is hidden or video fullscreen is open.
Tree textures are decoded lazily and cached after selection; rapid switching cannot
allow an old load to replace a newer choice or Compare original. Failed loads retain
the previous visible scene and show a retry message. The public page does not load
the tree assets or change its default scene.

## Assets

The five alpha PNGs live in `assets/environment/`. They were created with the built-in
image-generation tool, using the supplied references as art direction, not extracting
pixels from the watermarked stock image. Full generation prompts are recorded in
[`assets/environment/PROMPTS.md`](assets/environment/PROMPTS.md).

Run checks with `node --test tests/environment.test.cjs tests/mobile-tap.test.cjs`.
