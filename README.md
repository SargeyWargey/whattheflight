# What The Flight? website

A static site: no build step and no dependencies apart from the JetBrains Mono web font, which is
only used where SF Mono isn't available.

| File | What it is |
|---|---|
| `index.html` | The showcase page |
| `support.html`, `privacy.html` | Support and privacy policy (the App Store listing links to both) |
| `css/site.css` | All styles. Colors are the app's `Palette` (`UI/Theme.swift`), light and dark |
| `js/topography.js` | The contour map: the app's Metal shader (`UI/TopographyShader.swift`) ported to WebGL2. Every page has one `<canvas class="backdrop">` behind it, a single map that scrolls at 0.6× the page with the app's Tide running. The page is a run of `data-band` sections; `css/site.css` gives each band its paper, an optional `--band-swell` color it rises to in its middle (Sky View, the teal close), its line color and strength, and by day a `--band-dusk` it's entered through (twilight into the Watch and TV night). Neighbouring bands blend: close colors over most of a section, big changes inside the padding. Small framed pictures (the Lock Screen) still use `<canvas class="topo" data-topo="remaster teal">` |
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

## Publishing

This folder is its own git repository, https://github.com/SargeyWargey/whattheflight (public),
served by GitHub Pages from `main` at https://sargeywargey.github.io/whattheflight/. That's the
address the App Store listing (`AppStore/2 Store Listing.md`) uses, with `support.html` and
`privacy.html` beside it. The app's repository ignores this folder.

To publish a change, run:

```sh
./publish.sh "Describe the change"
```

It stamps the CSS and JS links in every page with a new `?v=` version, then commits and pushes.
The live site updates a minute or so later. Use it rather than a plain `git push`: GitHub Pages
lets browsers keep files for 10 minutes, and without a new version a visitor can get the new page
with an old script.

**While it's a preview**, every page has `<meta name="robots" content="noindex, nofollow">` so search
engines don't list it. Delete that line (and the comment above it) from `index.html`,
`support.html` and `privacy.html` when the app launches.

## Updating screenshots

The images in `img/screens/` are resized WebP copies of `AppStore/Screenshots/Raw`. After
retaking those, regenerate a file with, for example:

```sh
cwebp -q 82 -resize 660 0 "../AppStore/Screenshots/Raw/iPhone 6.3/01-radar-light.png" -o img/screens/iphone-radar-light.webp
```

iPhone screens are 660 px wide, iPad 1100, Apple TV 2000, and Apple Watch at its native size.
Frames with Planespotters photos are left out, because those photos belong to their photographers.

The logbook pages (`logbook-overview|stats|badges-ipad-light|dark.webp`) come from a DEBUG build
on the iPad Pro 11-inch simulator in landscape (`xcrun devicectl device orientation set --device
<udid> landscapeLeft`), which holds a generated multi-week logbook. Each was launched with
`-wtf.hasSeenWelcome YES -wtf.iCloudLogbook NO -wtf.demoTraffic YES -wtf.mapView NO
-wtf.debugSheet logbook -wtf.debugLogbookTab overview` (or `stats`, `badges`), in light and in
dark appearance, with the status bar at 9:41 (`xcrun simctl status_bar <udid> override --time
9:41`). The generated sightings end on the day they were made, so to retake them on a later day,
shift every `firstSeen` / `lastSeen` in its `Logbook.json` forward by whole days (seconds since
2001) first, or Today comes up empty; keep a copy and put it back afterwards. The Sightings tab
is left out because it names the places you watched from.
