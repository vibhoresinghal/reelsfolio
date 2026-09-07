# Static site assets

Edit `app.js` and `styles.css`, then regenerate the compact files used by
`index.html` before previewing or deploying:

```powershell
npx --yes esbuild@0.28.2 app.js --minify --target=es2020 --outfile=app.min.js
npx --yes esbuild@0.28.2 styles.css --minify --target=chrome100,safari15,firefox100 --outfile=styles.min.css
node --test tests/*.test.cjs
```

Commit source and generated files together. Bump their `?v=` values in
`index.html` when changing deployed assets. The scripts are classic deferred
scripts: GSAP must precede the app to retain global inline event handlers.

Font declarations reference the same Latin WOFF2 files previously selected by
Google Fonts for this site's English content. `font-display: swap` is preserved.
The desktop environment stylesheet is nonblocking on mobile; common grid styles
live in `styles.css` so the mobile grid remains visible.

Posters beyond the first two reels use the existing video proximity loader;
nearby video buffering and entrance animation timings are unchanged.
