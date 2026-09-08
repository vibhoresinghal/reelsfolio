# Production environment

The site uses the selected olive-bough scene with the exact settings recorded
in `environment-default.json`. This JSON is a source record for the production
regression checks, not a runtime fetch.

- `environment-production.css` contains the frozen appearance and foliage animation.
- `background-runtime.js` renders the cutting-mat grid and prepares the foliage.
- `assets/environment/olive-bough.png` is the only production foliage texture.
- `assets/environment/PROMPTS.md` records the retained texture's provenance.

Mobile does not request the foliage texture. Desktop waits for image decoding
before revealing the environment together. Hidden tabs and fullscreen pause
the sway without resetting it; reduced-motion preferences are respected. Failed
texture loading leaves the environment hidden rather than showing a bare window.

Retired lab controllers, alternate shaders, alternate textures, and their
study-only test have been removed. Old lab query strings do not enable a
different mode. The earlier experiments remain recoverable from Git history.

To run the retained regression checks: `node --test tests/*.test.cjs`.
