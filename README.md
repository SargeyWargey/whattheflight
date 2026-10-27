# What The Flight? website

A static site: no build step, no dependencies and no third-party requests. JetBrains Mono, used
only where SF Mono isn't available, is served from `fonts/` (SIL Open Font License, `fonts/OFL.txt`).

| File | What it is |
|---|---|
| `index.html` | The showcase page |
| `support.html`, `privacy.html` | Support (questions grouped by topic) and privacy policy. The App Store listing links to both |
| `whats-new.html` | Release notes for each App Store version, newest first. Add a `<section class="release">` per version |
| `press.html` | Press kit: fact sheet, description, the app icon at 1024 px (`img/press/`), screenshots and credits |
| `404.html` | GitHub Pages serves it for any missing address. Its `<base href="/whattheflight/">` makes its links work at any depth; change it if the site moves to its own domain. To preview it locally, serve a folder that holds this one as `whattheflight` (`mkdir -p /tmp/p && ln -s "$PWD" /tmp/p/whattheflight && cd /tmp/p && python3 -m http.server`) |
| `sitemap.xml` | Every page, for Search Console. A project site can't have a `robots.txt` (crawlers only read one at the host's root), so none is shipped |
| `css/site.css` | Base styles. Colors are the app's `Palette` (`UI/Theme.swift`), light and dark, except where the day look darkens one for WCAG AA: `--caption`, `--chip`, `--route`, the device labels' red and the focused mile label |
| `css/features.css`, `js/features.js` | The favorites, alerts and Make it yours sections, the Watch's fourth picture, and the What's New, press and 404 pages. The alerts section's Lock Screen is drawn from the app's notification and Sky Watch Live Activity layouts (`TrafficAlerts.swift`, `SkyWatchLiveActivity.swift`), sized in points of a 402-point screen; `js/features.js` ticks its countdown. The widgets are drawn from `NearestFlightWidget.swift` at their iPhone size, and Siri's answer follows `SpokenTraffic.siriAnswer` |
| `js/topography.js` | The contour map: the app's Metal shader (`UI/TopographyShader.swift`) ported to WebGL2. Every page has one `<canvas class="backdrop">` behind it, a single map that scrolls at 0.6× the page with the app's Tide running. The page is a run of `data-band` sections; `css/site.css` gives each band its paper, an optional `--band-swell` color it rises to in its middle (Sky View, the teal close), its line color and strength, and by day a `--band-dusk` it's entered through (twilight into the teal footer on the support and privacy pages). Between the hero, Sky View's blue and the teal close, every section has a hue of its own from the app's `ChartTone`s (`data-band="violet"`, `green`, `amber`, `magenta`, `indigo`, `petrol`, plus `gold` for favorites and `coral` for alerts, defined in `css/features.css`), all at the same OKLCH lightness at night and pale tints of them by day; only the teal close and footer stay dark in both. Neighbouring bands blend: close colors over most of a section, big changes inside the padding. `--backdrop-lines` on `:root` (0.55) scales every band's lines at once: raise it for stronger contours, lower it for fainter. Small framed pictures can still use their own `<canvas class="topo" data-topo="remaster teal">` |
| `js/glyphs.js` | Aircraft silhouettes ported from `UI/AircraftGlyph.swift`, as `<symbol id="g-airliner">` etc. |
| `js/radar.js` | The live radar at the top of the page: simulated New York traffic, nearest plane in the center, tap a plane to bring it in, drag to turn |
| `css/duo.css`, `js/duo.js` | The iPhone Duo section: the Duo in 3D (two halves on a hinge, the left one carrying the cover screen on its back) with the app running on its screens, live. Open and close it with the slider, or pick a way to hold it: like a book, landscape, portrait, closed, tabletop. Springs turn and fold it; the screens are canvases drawn every frame from the app's own layout rules (`FoldLayout`, `RadarRootView`'s panes, `RadarLayout`, `FlightHero`, `RadarControlBar`): the radar beside the system strip on the cover, radar and map either side of the fold half open, one big radar open flat, the bar along the bottom upright. Panes are placed in the screen's own coordinates and only the interface turns, so the radar keeps its place through every move. The sky is the hero's traffic plus a fringe for the map. Tap a plane to bring it in, tap the map button open flat to swap in the map, drag to turn the phone (the radar's compass follows it; the map stays north up so its labels stay upright). Contours come from `window.wtfTopography.still()` in `js/topography.js`, since a canvas in 3D can't be measured |
| `js/site.js` | Day/night toggle and the picture switchers (logbook pages, Apple TV views): ARIA tabs whose picture is the one tab panel (arrow keys, Home and End), which step through their tabs every 6 s while on screen: held under the pointer or keyboard focus, stopped once someone picks a tab, off with Reduce Motion. Every page opens at night (`data-theme="dark"` on `<html>`, whatever the system setting); switching to day lasts for that tab only (`sessionStorage`) |
| `img/` | Icon (`icon-512.png`, plus 36, 72, 108 and 224 px copies for the brand marks), favicon, social preview (`og.jpg`), WebP screenshots in `screens/`, the icon picker's art in `icons/` (from the app's `IconPreview-*` images, 160 px, `-dark` for the night look), `press/` (the app icon at 1024 px, teal and night, from `AppIcon.appiconset`), and `duo/`: the Duo's map base, light and dark |
| `tools/duo-map.swift` | Renders `img/duo/map-*.webp` with MapKit (see below) |

## Preview

```sh
cd Website && python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` straight from Finder works too.

## Before publishing

1. **Support email.** Replace `[your support email]` in `support.html`, `privacy.html` and
   `press.html` (once each), in both the link text and the `mailto:`.
2. **App Store link.** Until the app is live, the page shows a "Coming soon to the App Store" tag
   (in `index.html`, twice: the top and the teal section near the bottom). When it's live, swap
   each `<span class="store-pill">…</span>` for Apple's official "Download on the App Store"
   badge from https://developer.apple.com/app-store/marketing/guidelines/ linked to the app's
   App Store URL. Then:
   - uncomment the `apple-itunes-app` line in `index.html`'s head and put in the app's ID (the
     number in its App Store URL), which turns on Safari's Smart App Banner;
   - add `"installUrl": "<the App Store URL>"` to the JSON-LD block under it;
   - in `whats-new.html`, swap 1.0's "Coming soon" tag for its release date, and in `press.html`
     the Release row.
3. **Search engines.** Remove the `noindex` line (and its comment) from `index.html`,
   `support.html`, `privacy.html`, `whats-new.html` and `press.html`; `404.html` keeps its own.
   Then submit `sitemap.xml` in Google Search Console and Bing Webmaster Tools.
4. **Data source.** If the app moves off Flightradar24 (`Flight Data Sources Spec.md`), update the
   credits in every page's footer, the privacy policy's "Your location" and "Searching for an
   aircraft" sections, the support answers that name Flightradar24, and the press credits. adsb.lol
   data is ODbL and needs the same kind of credit as OpenFlights.

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
engines don't list it. See "Before publishing" for when it launches.

## Updating screenshots

The images in `img/screens/` are resized WebP copies of `AppStore/Screenshots/Raw`. After
retaking those, regenerate a file with, for example:

```sh
cwebp -q 82 -resize 660 0 "../AppStore/Screenshots/Raw/iPhone 6.3/01-radar-light.png" -o img/screens/iphone-radar-light.webp
```

iPhone screens are 660 px wide, iPad 1100, Apple TV 2000, and Apple Watch at its native size.
Frames with Planespotters photos are left out, because those photos belong to their photographers.

**Day and night.** Every iPhone, iPad and Apple TV screenshot has a light and a dark version, and
the page shows the one that matches its look: `<img src="…dark…" data-src-light="…"
data-src-dark="…">` (`js/site.js`; add `data-alt-light` / `data-alt-dark` when the two pictures
differ), or `data-src` plus `data-src-dark` on a switcher's tab. iPhone pictures are named
`<name>.webp` (light) and `<name>-dark.webp`; the iPad radar `ipad-radar-light|dark.webp`; Apple TV
`tv-<view>.webp` (dark) and `tv-<view>-light.webp`. The radar pair at the top puts the page's look in
front. Apple Watch has no light mode, so its pictures are the same in both. Take each pair from the
same moment: on iPhone and iPad, screenshot, then `xcrun simctl ui <udid> appearance dark` and
screenshot again a second later (the app follows the system live); in a UI test,
`XCUIDevice.shared.appearance = .dark`. The tvOS simulator can't change appearance, so launch the TV
twice with `-wtf.appearance light` and `-wtf.appearance dark`. The iPhone and iPad pictures from
2026-10-26 are live Central Park traffic; `-wtf.debugFocus <flight>` picks the aircraft in the
center (and pins it).

The favorites pictures (`iphone-favorite`, `iphone-favorites-list`, `iphone-where.webp`) are live
traffic at Central Park on an iPhone 17 simulator (`simctl location set 40.7812,-73.9665`), with
`wtf.favoriteAircraft` written as JSON data (`simctl spawn … defaults write … -data <hex>`) for
two aircraft that were overhead, plus a few elsewhere. The radar used `-wtf.debugFocus <flight>`,
the list `-wtf.debugSheet search -wtf.debugLargeSheet YES`, and Where Is It Now? needs a tap, so a
throwaway XCUITest tapped a favorite that had just left LaGuardia. Launch with
`-wtf.showHelicopters NO -wtf.iCloudLogbook NO`. A real Sky View picture needs a device: the
simulator has no camera or motion sensors.

`watch-complications.webp` is composed from `-wtf.debugScreen complications` on an Apple Watch
Ultra simulator (`-wtf.debugComplications nearest|radar|next|identify`): the Nearest Aircraft and
Next Overhead cards and three round complications cropped from the gallery and set on a black
422 × 514 face with the date and time.

The logbook pages (`logbook-overview|stats|badges-ipad-light|dark.webp`) come from a DEBUG build
on the iPad Pro 11-inch simulator in landscape (`xcrun devicectl device orientation set --device
<udid> landscapeLeft`), which holds a generated multi-week logbook. Each was launched with
`-wtf.hasSeenWelcome YES -wtf.iCloudLogbook NO -wtf.demoTraffic YES -wtf.mapView NO
-wtf.debugSheet logbook -wtf.debugLogbookTab overview` (or `stats`, `badges`), in light and in
dark appearance, with the status bar at 9:41 (`xcrun simctl status_bar <udid> override --time
9:41`). The generated sightings end on the day they were made, so to retake them on a later day,
shift every `firstSeen` / `lastSeen` in its `Logbook.json` forward by whole days (seconds since
2001) first, or Today comes up empty; keep a copy and put it back afterwards. The Sightings tab
is left out because it names the places you watched from, and Stats is taken with
`-wtf.debugSkyScope all` for the same reason (its "Your sky" header otherwise names a place).

## The iPhone Duo's map

The Duo section draws its screens live rather than from screenshots, but the map under its traffic
is a MapKit render in the app's map style (standard, flat, muted, no points of interest), 96 miles
square around the demo's observer in Manhattan. To redo it (after a MapKit style change, say), run
`tools/duo-map.swift` as its header says. Keep the size at 2,100 px across: `js/duo.js` places
the map by that scale (`MAP_PX_PER_MILE`). The screen layouts follow the app's code, so when a Duo
layout changes in the app (`FoldLayout`, `RadarRootView`, `RadarLayout`, `RadarControlBar`),
change `innerLayout()` and the drawing in `js/duo.js` to match.
