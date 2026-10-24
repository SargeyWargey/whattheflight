# What The Flight? website

A static site: no build step and no dependencies apart from the JetBrains Mono web font, which is
only used where SF Mono isn't available.

| File | What it is |
|---|---|
| `index.html` | The showcase page |
| `support.html`, `privacy.html` | Support and privacy policy (the App Store listing links to both) |
| `css/site.css` | All styles. Colors are the app's `Palette` (`UI/Theme.swift`), light and dark |
| `js/topography.js` | The contour backgrounds: the app's Metal shader (`UI/TopographyShader.swift`) ported to WebGL2. `<canvas class="topo" data-topo="survey auto live">` |
| `js/glyphs.js` | Aircraft silhouettes ported from `UI/AircraftGlyph.swift`, as `<symbol id="g-airliner">` etc. |
| `js/radar.js` | The live radar at the top of the page: simulated New York traffic, nearest plane in the center, tap a plane to bring it in, drag to turn |
| `js/site.js` | Day/night toggle and the Apple TV view picker |
| `img/` | Icon, favicon, social preview (`og.jpg`), and WebP copies of the screenshots in `AppStore/Screenshots/Raw` |

## Preview

```sh
cd Website && python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` straight from Finder works too.

## Before publishing

1. **Support email.** Replace `[your support email]` in `support.html` (once) and `privacy.html`
   (once), in both the link text and the `mailto:`.
2. **App Store link.** Until the app is live, the page shows a "Coming soon to the App Store" tag
   (in `index.html`, twice: the top and the teal section near the bottom). When it's live, swap
   each `<span class="store-pill">…</span>` for Apple's official "Download on the App Store"
   badge from https://developer.apple.com/app-store/marketing/guidelines/ linked to the app's
   App Store URL.

## Publishing on GitHub Pages

The App Store listing (`AppStore/2 Store Listing.md`) uses
`https://sargeywargey.github.io/whattheflight/` for the marketing page, plus `support.html` and
`privacy.html` there. Put the contents of this folder at the root of the `whattheflight`
repository (or its `docs/` folder) and turn on Pages in the repository settings. This replaces the
simpler pages in `AppStore/Website/`.

## Updating screenshots

The images in `img/screens/` are resized WebP copies of `AppStore/Screenshots/Raw`. After
retaking those, regenerate a file with, for example:

```sh
cwebp -q 82 -resize 660 0 "../AppStore/Screenshots/Raw/iPhone 6.3/01-radar-light.png" -o img/screens/iphone-radar-light.webp
```

iPhone screens are 660 px wide, iPad 1100, Apple TV 2000, and Apple Watch at its native size.
Frames with Planespotters photos are left out, because those photos belong to their photographers.
