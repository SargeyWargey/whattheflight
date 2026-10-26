# What The Flight? website

A static site: no build step and no dependencies apart from the JetBrains Mono web font, which is
only used where SF Mono isn't available.

| File | What it is |
|---|---|
| `index.html` | The showcase page |
| `support.html`, `privacy.html` | Support and privacy policy (the App Store listing links to both) |
| `css/site.css` | All styles. Colors are the app's `Palette` (`UI/Theme.swift`), light and dark |
| `js/topography.js` | The contour map: the app's Metal shader (`UI/TopographyShader.swift`) ported to WebGL2. Every page has one `<canvas class="backdrop">` behind it, a single map that scrolls at 0.6× the page with the app's Tide running. The page is a run of `data-band` sections; `css/site.css` gives each band its paper, an optional `--band-swell` color it rises to in its middle (Sky View, the teal close), its line color and strength, and by day a `--band-dusk` it's entered through (twilight into the teal footer on the support and privacy pages). Between the hero, Sky View's blue and the teal close, every section has a hue of its own from the app's `ChartTone`s (`data-band="violet"`, `green`, `amber`, `magenta`, `indigo`, `petrol`), all at the same OKLCH lightness at night and pale tints of them by day; only the teal close and footer stay dark in both. Neighbouring bands blend: close colors over most of a section, big changes inside the padding. `--backdrop-lines` on `:root` (0.55) scales every band's lines at once: raise it for stronger contours, lower it for fainter. Small framed pictures can still use their own `<canvas class="topo" data-topo="remaster teal">` |
| `js/glyphs.js` | Aircraft silhouettes ported from `UI/AircraftGlyph.swift`, as `<symbol id="g-airliner">` etc. |
| `js/radar.js` | The live radar at the top of the page: simulated New York traffic, nearest plane in the center, tap a plane to bring it in, drag to turn |
| `css/duo.css`, `js/duo.js` | The iPhone Duo section: the Duo in 3D (two halves on a hinge, the left one carrying the cover screen on its back) with the app running on its screens, live. Open and close it with the slider, or pick a way to hold it: like a book, landscape, portrait, closed, tabletop. Springs turn and fold it; the screens are canvases drawn every frame from the app's own layout rules (`FoldLayout`, `RadarRootView`'s panes, `RadarLayout`, `FlightHero`, `RadarControlBar`): the radar beside the system strip on the cover, radar and map either side of the fold half open, one big radar open flat, the bar along the bottom upright. Panes are placed in the screen's own coordinates and only the interface turns, so the radar keeps its place through every move. The sky is the hero's traffic plus a fringe for the map. Tap a plane to bring it in, tap the map button open flat to swap in the map, drag to turn the phone (the radar's compass follows it; the map stays north up so its labels stay upright). Contours come from `window.wtfTopography.still()` in `js/topography.js`, since a canvas in 3D can't be measured |
| `js/site.js` | Day/night toggle and the picture switchers (logbook pages, Apple TV views), which step through their tabs every 6 s while on screen: held under the pointer or keyboard focus, stopped once someone picks a tab, off with Reduce Motion. Every page opens at night (`data-theme="dark"` on `<html>`, whatever the system setting); switching to day lasts for that tab only (`sessionStorage`) |
| `img/` | Icon, favicon, social preview (`og.jpg`), WebP copies of the screenshots in `AppStore/Screenshots/Raw`, and `duo/`: the Duo's map base, light and dark |
| `tools/duo-map.swift` | Renders `img/duo/map-*.webp` with MapKit (see below) |

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

## The iPhone Duo's map

The Duo section draws its screens live rather than from screenshots, but the map under its traffic
is a MapKit render in the app's map style (standard, flat, muted, no points of interest), 96 miles
square around the demo's observer in Manhattan. To redo it (after a MapKit style change, say), run
`tools/duo-map.swift` as its header says. Keep the size at 2,100 px across: `js/duo.js` places
the map by that scale (`MAP_PX_PER_MILE`). The screen layouts follow the app's code, so when a Duo
layout changes in the app (`FoldLayout`, `RadarRootView`, `RadarLayout`, `RadarControlBar`),
change `innerLayout()` and the drawing in `js/duo.js` to match.
