// iPhone Duo: the folding iPhone in 3D, with the app running on it, live.
//
// Two halves on a hinge (the left one folds over the right and carries the cover screen on its
// back), turned and folded by springs toward each way you can hold it, or by the slider. The
// screens are drawn into canvases every frame from the app's own layout rules (FoldLayout,
// RadarRootView's panes, RadarLayout, FlightHero, RadarControlBar): shut, the radar runs on the
// cover screen beside the system's strip; half open as a book, the radar takes the left page and
// the map the right; open flat, one big radar with the strip down the edge; upright, the bar
// along the bottom; on a table, the radar on the standing half and the map on the half lying
// down. Panes are placed in the screen's own coordinates and only the interface turns, so the
// radar keeps its place through every move and the planes glide to their new spots. The sky is
// the hero's: simulated New York traffic, dead-reckoned every frame. Tap a plane to bring it to
// the center; open flat, tap the map button to swap the radar for the map.
//
// The map underneath is a MapKit render of the app's map style (img/duo/map-*.webp: 96 miles
// square around the observer, 21.875 px a mile). Contours come from js/topography.js.

(function () {
  'use strict';

  const figure = document.getElementById('duo-demo');
  if (!figure) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;

  // ---------------------------------------------------------------------------------------
  // The Duo, in points (measured on the simulator)

  const INNER = { w: 951, h: 669 };      // the inner screen, held as a book
  const FOLD = 475.5;                    // the crease; the system's strip is 20 pt either side
  const GUTTER = 20;
  const COVER = { w: 466, h: 678 };      // the cover screen, portrait
  const STRIP = 84;                      // the vertical bar strip, inner screen and cover
  const STATUS = 50;                     // the status bar, inner screen upright
  const BAR_HEIGHT = 56;                 // RadarControlBar

  // ---------------------------------------------------------------------------------------
  // Traffic: the hero's sky (js/radar.js), with a fringe out to 1.5× the radius for the map.

  const RADIUS = 12;
  const FRINGE = RADIUS * 1.5;
  const TIME_SCALE = 1.5;
  const MPS_PER_KT = 1.15078 / 3600;
  const TRAIL_EVERY = 5;                 // seconds between trail points
  const TRAIL_KEEP = 600;                // ten minutes, fading all the way

  // [ident, operator, from, fromCity, to, toCity, typeCode, typeName, glyph, feet, fpm, kts, tag]
  const POOL = [
    ['AC718', 'Air Canada', 'YYZ', 'Toronto', 'LGA', 'New York', 'BCS3', 'Airbus A220-300', 'airliner', 3575, -700, 205],
    ['B6371', 'JetBlue', 'LGA', 'New York', 'FLL', 'Fort Lauderdale', 'A321', 'Airbus A321', 'airliner', 2400, 3000, 190],
    ['AA1136', 'American Airlines', 'MIA', 'Miami', 'LGA', 'New York', 'A321', 'Airbus A321', 'airliner', 5300, -1000, 240],
    ['UA598', 'United Airlines', 'LGA', 'New York', 'ORD', 'Chicago', 'B38M', 'Boeing 737 MAX 8', 'airliner', 10400, 1900, 285],
    ['UA70', 'United Airlines', 'EWR', 'Newark', 'AMS', 'Amsterdam', 'B764', 'Boeing 767-400', 'widebody', 7900, 1900, 266],
    ['BA117', 'British Airways', 'LHR', 'London', 'JFK', 'New York', 'A35K', 'Airbus A350-1000', 'widebody', 11250, -1400, 290],
    ['UA994', 'United Airlines', 'EWR', 'Newark', 'BRU', 'Brussels', 'B78X', 'Boeing 787-10', 'widebody', 7200, 2100, 260],
    ['LH403', 'Lufthansa', 'EWR', 'Newark', 'FRA', 'Frankfurt', 'B748', 'Boeing 747-8', 'fourEngine', 7325, 2200, 281, 'rare'],
    ['5Y855', 'Atlas Air', 'ORD', 'Chicago', 'JFK', 'New York', 'B744', 'Boeing 747-400', 'fourEngine', 15950, -1500, 300, 'rare'],
    ['DL5721', 'Delta Air Lines', 'BOS', 'Boston', 'LGA', 'New York', 'E75L', 'Embraer E175', 'regional', 3575, -650, 255],
    ['AA4607', 'American Eagle', 'ATL', 'Atlanta', 'LGA', 'New York', 'E170', 'Embraer E170', 'regional', 4200, -900, 230],
    ['DL5809', 'Delta Connection', 'PWM', 'Portland', 'LGA', 'New York', 'E170', 'Embraer E170', 'regional', 3575, -700, 251],
    ['N407LH', 'Liberty Helicopters', null, null, null, null, 'B407', 'Bell 407', 'helicopter', 1000, 0, 105],
    ['N350NY', 'HeliNY', null, null, null, null, 'AS50', 'Airbus H125', 'helicopter', 1200, 0, 110],
  ];
  // [ident, miles, bearing, track]: Air Canada on approach just overhead, the rest spread round.
  const OPENING = [
    ['AC718', 1.6, 212, 60], ['N407LH', 3.4, 150, 20], ['DL5721', 5.5, 105, 250],
    ['LH403', 8.5, 20, 65], ['UA70', 7.5, 290, 75], ['B6371', 10.4, 330, 175],
    ['AA4607', 9.6, 228, 38], ['UA598', 14.5, 70, 245], ['BA117', 16.5, 128, 300],
  ];
  // Miles east and north of the observer, for the map's airport pins.
  const AIRPORTS = { LGA: [5.84, 1.3], JFK: [10.86, -8.05], EWR: [-9.9, -4.73] };

  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const norm = (d) => ((d % 360) + 360) % 360;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  let seed = 11;
  function random() {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const byIdent = Object.fromEntries(POOL.map((row) => [row[0], row]));
  let clock = 0;

  function make(row, x, y, track) {
    const [ident, operator, from, fromCity, to, toCity, type, typeName, glyph, feet, fpm, kts, tag] = row;
    const plane = { ident, operator, from, fromCity, to, toCity, type, typeName, glyph, feet, fpm, kts, tag, x, y, track, trail: [] };
    // Where it's been: straight back along its track, so trails show from the start.
    const v = kts * MPS_PER_KT;
    for (let ago = 150; ago > 0; ago -= 15) {
      plane.trail.push([x - v * ago * Math.sin(rad(track)), y - v * ago * Math.cos(rad(track)), clock - ago]);
    }
    return plane;
  }

  let traffic = OPENING.map(([id, miles, bearing, track]) =>
    make(byIdent[id], miles * Math.sin(rad(bearing)), miles * Math.cos(rad(bearing)), track));

  function respawn(old) {
    const used = new Set(traffic.map((t) => t.ident));
    const free = POOL.filter((row) => row[8] === old.glyph && !used.has(row[0]));
    const row = free[Math.floor(random() * free.length)] || byIdent[old.ident];
    const bearing = random() * 360;
    const miles = FRINGE * (0.96 + random() * 0.03);
    const track = norm(bearing + 180 + (random() - 0.5) * 90);
    return make(row, miles * Math.sin(rad(bearing)), miles * Math.cos(rad(bearing)), track);
  }

  const distance = (p) => Math.hypot(p.x, p.y);
  const bearingOf = (p) => norm(deg(Math.atan2(p.x, p.y)));

  function simulate(dt) {
    clock += dt;
    traffic = traffic.map((p) => {
      const v = p.kts * MPS_PER_KT * dt;
      p.x += v * Math.sin(rad(p.track));
      p.y += v * Math.cos(rad(p.track));
      p.feet = Math.max(p.fpm < 0 ? 1200 : 0, Math.min(38000, p.feet + (p.fpm * dt) / 60));
      if ((p.fpm < 0 && p.feet <= 1200) || (p.fpm > 0 && p.feet >= 38000)) p.fpm = 0;
      const last = p.trail[p.trail.length - 1];
      if (!last || clock - last[2] >= TRAIL_EVERY) p.trail.push([p.x, p.y, clock]);
      while (p.trail.length && clock - p.trail[0][2] > TRAIL_KEEP) p.trail.shift();
      if (distance(p) > FRINGE * 1.02) {
        if (focusIdent === p.ident) focusIdent = null;
        return respawn(p);
      }
      return p;
    });
  }

  // The nearest aircraft takes the centre and keeps it until it leaves the radius or another
  // is picked.
  let focusIdent = 'AC718';
  function focused() {
    const inRange = traffic.filter((p) => distance(p) <= RADIUS);
    let f = inRange.find((p) => p.ident === focusIdent);
    if (!f) {
      f = inRange.reduce((best, p) => (!best || distance(p) < distance(best) ? p : best), null);
      focusIdent = f && f.ident;
    }
    return f;
  }

  // Closest approach, from the aircraft's own track and speed.
  function approach(p) {
    const v = p.kts * MPS_PER_KT;
    const vx = v * Math.sin(rad(p.track)), vy = v * Math.cos(rad(p.track));
    const t = -(p.x * vx + p.y * vy) / (v * v || 1);
    if (t <= 1 || t > 900) return null;
    return { miles: Math.hypot(p.x + vx * t, p.y + vy * t), seconds: t / TIME_SCALE };
  }

  // ---------------------------------------------------------------------------------------
  // Colors: the app's Palette, read from the page (css/site.css) so day and night follow it.

  const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace';
  const font = (weight, size) => `${weight} ${size}px ${MONO}`;
  let C = {};
  let dark = true;

  function readPalette() {
    const cs = getComputedStyle(root);
    const v = (name) => cs.getPropertyValue(name).trim();
    dark = root.dataset.theme !== 'light';
    C = {
      paper: v('--paper'), paperShade: v('--paper-shade'), ink: v('--ink'), route: v('--route'),
      signal: v('--signal'), caption: v('--caption'), value: v('--value'), faint: v('--faint'),
      blip: v('--blip'), chip: v('--chip'), live: v('--live'), warning: v('--warning'),
      notable: v('--notable'), military: v('--military'),
      sweep: dark ? '#4CF0C0' : '#3A33D6',
    };
  }

  const rgbCache = new Map();
  function alpha(color, a) {
    let rgb = rgbCache.get(color);
    if (!rgb) {
      const hex = color.replace('#', '');
      const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
      rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(', ');
      rgbCache.set(color, rgb);
    }
    return `rgba(${rgb}, ${a})`;
  }

  // ---------------------------------------------------------------------------------------
  // Drawing helpers

  // Aircraft silhouettes from js/glyphs.js, as canvas paths. Rotor and propeller discs are the
  // translucent layer; the rotor spins.
  const glyphs = {};
  function glyph(name) {
    if (glyphs[name] !== undefined) return glyphs[name];
    const symbol = document.getElementById(`g-${name}`);
    if (!symbol) return null;
    const solid = new Path2D(), soft = new Path2D();
    let spins = false;
    symbol.querySelectorAll('path, rect, circle, ellipse').forEach((el) => {
      const layer = el.closest('.rotor, .prop');
      if (layer && layer.classList.contains('rotor')) spins = true;
      const n = (a) => parseFloat(el.getAttribute(a)) || 0;
      const shape = new Path2D();
      switch (el.tagName) {
        case 'path': shape.addPath(new Path2D(el.getAttribute('d'))); break;
        case 'rect': roundRect(shape, n('x'), n('y'), n('width'), n('height'), n('rx')); break;
        case 'circle': shape.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2); break;
        case 'ellipse': shape.ellipse(n('cx'), n('cy'), n('rx'), n('ry'), 0, 0, Math.PI * 2); break;
      }
      const turn = /rotate\(([-\d.]+) ([-\d.]+) ([-\d.]+)\)/.exec(el.getAttribute('transform') || '');
      const m = turn ? new DOMMatrix().translate(+turn[2], +turn[3]).rotate(+turn[1]).translate(-turn[2], -turn[3]) : undefined;
      (layer ? soft : solid).addPath(shape, m);
    });
    glyphs[name] = { solid, soft, spins, softAlpha: spins ? 0.55 : 0.34 };
    return glyphs[name];
  }

  function roundRect(path, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    path.moveTo(x + r, y);
    path.arcTo(x + w, y, x + w, y + h, r);
    path.arcTo(x + w, y + h, x, y + h, r);
    path.arcTo(x, y + h, x, y, r);
    path.arcTo(x, y, x + w, y, r);
    path.closePath();
  }

  function drawGlyph(ctx, name, x, y, size, track, color, time) {
    const g = glyph(name);
    if (!g) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rad(track));
    ctx.scale(size / 64, size / 64);
    ctx.translate(-32, -32);
    ctx.fillStyle = color;
    if (g.soft) {
      ctx.save();
      ctx.globalAlpha *= g.softAlpha;
      if (g.spins && !reduceMotion.matches) {
        ctx.translate(32, 27);
        ctx.rotate((time / 1.2) * Math.PI * 2);
        ctx.translate(-32, -27);
      }
      ctx.fill(g.soft);
      ctx.restore();
    }
    ctx.fill(g.solid);
    ctx.restore();
  }

  // SF Symbols the screens use, drawn on a 24 pt grid.
  const SYMBOLS = {
    map: 'M2.5 5.6 8.3 3.4v15l-5.8 2.2zM9.9 3.4l4.2 2.2v15l-4.2-2.2zM15.7 5.6l5.8-2.2v15l-5.8 2.2z',
    scope: null,
    viewfinder: null,
    book: 'M6.2 2.6h11.6c1 0 1.7.7 1.7 1.7v14.2c0 .5-.4.9-.9.9H7.3a1.2 1.2 0 0 0 0 2.4h11.3a.9.9 0 0 1 0 1.8H7.3a3 3 0 0 1-3-3V4.5c0-1 .9-1.9 1.9-1.9z',
    gear: null,
    north: 'M12 2.5 19 21 12 17 5 21z',
    star: 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z',
    location: 'M20.5 3.5 3.5 10.6l7.4 2.5 2.5 7.4z',
  };
  const symbolPaths = {};
  function symbol(name) {
    if (symbolPaths[name]) return symbolPaths[name];
    let p;
    if (name === 'gear') {
      p = new Path2D();
      const teeth = 8;
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2 - Math.PI / 2;
        const r1 = i % 2 ? 7.9 : 10.4;
        const half = (Math.PI / (teeth * 2)) * 0.62;
        p[i ? 'lineTo' : 'moveTo'](12 + r1 * Math.cos(a - half), 12 + r1 * Math.sin(a - half));
        p.lineTo(12 + r1 * Math.cos(a + half), 12 + r1 * Math.sin(a + half));
      }
      p.closePath();
      p.moveTo(15.4, 12);
      p.arc(12, 12, 3.4, 0, Math.PI * 2, true);
    } else if (name === 'scope') {
      p = new Path2D();
      p.arc(12, 12, 7.2, 0, Math.PI * 2);
      p.moveTo(12, 1.8); p.lineTo(12, 7.2); p.moveTo(12, 16.8); p.lineTo(12, 22.2);
      p.moveTo(1.8, 12); p.lineTo(7.2, 12); p.moveTo(16.8, 12); p.lineTo(22.2, 12);
      p.stroke = true;
    } else if (name === 'viewfinder') {
      p = new Path2D('M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16');
      p.stroke = true;
      p.inner = new Path2D('M7.2 9.6h2.2l1-1.4h3.2l1 1.4h2.2c.6 0 1 .4 1 1v4.6c0 .6-.4 1-1 1H7.2c-.6 0-1-.4-1-1v-4.6c0-.6.4-1 1-1zM12 11.2a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z');
    } else {
      p = new Path2D(SYMBOLS[name]);
    }
    symbolPaths[name] = p;
    return p;
  }

  function drawSymbol(ctx, name, x, y, size, color, rotation = 0) {
    const p = symbol(name);
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rad(rotation));
    ctx.scale(size / 24, size / 24);
    ctx.translate(-12, -12);
    if (p.stroke) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(p);
      if (p.inner) { ctx.fillStyle = color; ctx.fill(p.inner, 'evenodd'); }
    } else {
      ctx.fillStyle = color;
      ctx.fill(p, 'evenodd');
    }
    ctx.restore();
  }

  // A small arrow: up-right climbing, down-right descending, right for routes.
  function drawArrow(ctx, x, y, size, angle, color, weight) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rad(angle));
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const h = size / 2;
    ctx.beginPath();
    ctx.moveTo(-h, 0); ctx.lineTo(h, 0);
    ctx.moveTo(h * 0.15, -h * 0.8); ctx.lineTo(h, 0); ctx.lineTo(h * 0.15, h * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  const hasLetterSpacing = 'letterSpacing' in CanvasRenderingContext2D.prototype;

  /// Text with tracking, centred, left or right aligned at x. Returns its width.
  function text(ctx, value, x, y, { size, weight = 600, color, tracking = 0, align = 'center', baseline = 'alphabetic' }) {
    ctx.font = font(weight, size);
    ctx.fillStyle = color;
    ctx.textBaseline = baseline;
    if (!tracking) {
      ctx.textAlign = align;
      ctx.fillText(value, x, y);
      return ctx.measureText(value).width;
    }
    if (hasLetterSpacing) {
      ctx.letterSpacing = `${tracking}px`;
      const w = ctx.measureText(value).width - tracking;
      ctx.textAlign = 'left';
      const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      ctx.fillText(value, left, y);
      ctx.letterSpacing = '0px';
      return w;
    }
    ctx.textAlign = 'left';
    const chars = [...value];
    const widths = chars.map((c) => ctx.measureText(c).width);
    const w = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
    let left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    chars.forEach((c, i) => { ctx.fillText(c, left, y); left += widths[i] + tracking; });
    return w;
  }

  function textWidth(ctx, value, size, weight, tracking = 0) {
    ctx.font = font(weight, size);
    if (hasLetterSpacing) ctx.letterSpacing = '0px';
    return ctx.measureText(value).width + tracking * Math.max(0, [...value].length - 1);
  }

  function capsule(ctx, x, y, w, h) {
    const p = new Path2D();
    roundRect(p, x, y, w, h, h / 2);
    return p;
  }

  /// A glass surface: the app's Liquid Glass, as a tinted pane with a light rim.
  function glass(ctx, path) {
    ctx.save();
    ctx.shadowColor = dark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(30, 28, 40, 0.16)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = dark ? 'rgba(46, 52, 66, 0.78)' : 'rgba(250, 249, 246, 0.8)';
    ctx.fill(path);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.13)' : 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1;
    ctx.stroke(path);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------
  // The perimeter: a rounded rectangle sampled clockwise from the top middle, as the app's
  // PerimeterTrack (and the hero's). Cheap enough to rebuild as panes change size.

  function Track(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    const cx = x + w / 2, cy = y + h / 2;
    const pts = [];
    const add = (px, py) => pts.push([px, py]);
    const arc = (ox, oy, from) => { for (let i = 0; i <= 12; i++) { const a = rad(from + (i / 12) * 90); add(ox + r * Math.cos(a), oy + r * Math.sin(a)); } };
    const line = (x0, y0, x1, y1) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 10)); for (let i = 0; i <= n; i++) add(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n); };
    line(cx, y, x + w - r, y);
    arc(x + w - r, y + r, -90);
    line(x + w, y + r, x + w, y + h - r);
    arc(x + w - r, y + h - r, 0);
    line(x + w - r, y + h, x + r, y + h);
    arc(x + r, y + h - r, 90);
    line(x, y + h - r, x, y + r);
    arc(x + r, y + r, 180);
    line(x + r, y, cx, y);
    const s = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const angle = pts.map(([px, py]) => norm(deg(Math.atan2(px - cx, cy - py))));
    angle[0] = 0;
    angle[angle.length - 1] = 360;
    // Angles only rise along the walk; a sample that rounds backwards keeps the search sound.
    for (let i = 1; i < angle.length; i++) if (angle[i] < angle[i - 1]) angle[i] = angle[i - 1];
    const length = s[s.length - 1];

    function sAtAngle(a) {
      a = norm(a);
      let lo = 0, hi = angle.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (angle[mid] <= a) lo = mid; else hi = mid; }
      const span = angle[hi] - angle[lo] || 1;
      return s[lo] + ((a - angle[lo]) / span) * (s[hi] - s[lo]);
    }

    /// The point at arc length v, with the inward normal there.
    function at(v) {
      v = ((v % length) + length) % length;
      let lo = 0, hi = s.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid] <= v) lo = mid; else hi = mid; }
      const k = (v - s[lo]) / (s[hi] - s[lo] || 1);
      const px = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * k;
      const py = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * k;
      const tx = pts[hi][0] - pts[lo][0], ty = pts[hi][1] - pts[lo][1];
      const tl = Math.hypot(tx, ty) || 1;
      return { x: px, y: py, nx: -ty / tl, ny: tx / tl };
    }

    return { sAtAngle, at, length };
  }

  /// Pushes icons apart along the edge until none are closer than `gap`.
  function spread(items, gap, length) {
    items.sort((a, b) => a.s - b.s);
    const room = Math.min(gap, length / Math.max(1, items.length));
    for (let pass = 0; pass < 14; pass++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        const a = items[i], b = items[(i + 1) % items.length];
        if (a === b) break;
        let d = b.s - a.s;
        if (i === items.length - 1) d += length;
        if (d < room - 0.01) {
          const push = (room - d) / 2;
          a.s -= push;
          b.s += push;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  // ---------------------------------------------------------------------------------------
  // The hero: FlightHero, measured then drawn, centred on (cx, cy).

  const milesText = (d) => (d < 0.95 ? '<1' : String(Math.round(d)));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const badgeText = (f) => `RARE · ${f.typeName.replace(/^Boeing /, '')}`;

  function statBlock(ctx, title, value, unit, accessory) {
    const valueW = textWidth(ctx, value, 22, 600) + 3 + textWidth(ctx, unit, 12, 500) + (accessory ? 4 + 13 : 0);
    const titleW = textWidth(ctx, title.toUpperCase(), 11, 600, 1.6);
    return { title, value, unit, accessory, w: Math.max(valueW, titleW), valueW };
  }

  function drawStat(ctx, b, cx, top, heading, f) {
    text(ctx, b.title.toUpperCase(), cx, top + 11, { size: 11, weight: 600, color: C.caption, tracking: 1.6 });
    const base = top + 14 + 3 + 21;
    let x = cx - b.valueW / 2;
    x += text(ctx, b.value, x, base, { size: 22, weight: 600, color: C.value, align: 'left' }) + 3;
    x += text(ctx, b.unit, x, base, { size: 12, weight: 500, color: C.caption, align: 'left' });
    if (b.accessory === 'up') drawArrow(ctx, x + 10, base - 7, 11, -45, C.live, 2.4);
    if (b.accessory === 'down') drawArrow(ctx, x + 10, base - 6, 11, 45, C.warning, 2.4);
    if (b.accessory === 'pointer') drawSymbol(ctx, 'north', x + 10, base - 7, 13, C.signal, bearingOf(f) - heading);
  }

  function heroLayout(ctx, f, { wide, compact, maxWidth }) {
    const L = { items: [], h: 0 };
    const push = (gap, h, draw) => { L.h += L.items.length ? gap : 0; L.items.push({ top: L.h, h, draw }); L.h += h; };
    if (f.tag) push(0, 30, 'badge');
    push(8, 14, 'operator');
    push(4, 66, 'ident');
    if (f.from) push(2, 50, 'route');
    if (!compact) push(12, 44, 'type');
    const alt = statBlock(ctx, 'Altitude', fmt(Math.round(f.feet / 25) * 25), 'ft', f.fpm > 300 ? 'up' : f.fpm < -300 ? 'down' : null);
    const spd = statBlock(ctx, 'Speed', fmt(f.kts), 'kts', null);
    const dst = statBlock(ctx, 'Distance', milesText(distance(f)), 'mi', 'pointer');
    L.stats = { alt, spd, dst };
    push(compact ? 18 : 26, wide ? 43 : 104, wide ? 'statsWide' : 'stats');
    if (!compact) push(18, 26, 'approach');
    L.maxWidth = maxWidth;
    return L;
  }

  function drawHero(ctx, f, L, cx, cy, heading) {
    let top = cy - L.h / 2;
    for (const item of L.items) {
      const y = top + item.top;
      switch (item.draw) {
        case 'badge': {
          const label = badgeText(f);
          const w = textWidth(ctx, label, 13, 800, 2) + 28 + 18;
          const p = capsule(ctx, cx - w / 2, y, w, 30);
          ctx.fillStyle = alpha(C.notable, 0.1);
          ctx.fill(p);
          ctx.strokeStyle = alpha(C.notable, 0.75);
          ctx.lineWidth = 1.5;
          ctx.stroke(p);
          drawSymbol(ctx, 'star', cx - w / 2 + 14 + 7, y + 15, 14, C.notable);
          text(ctx, label, cx - w / 2 + 14 + 18, y + 20, { size: 13, weight: 800, color: C.notable, tracking: 2, align: 'left' });
          break;
        }
        case 'operator':
          text(ctx, f.operator.toUpperCase(), cx, y + 11, { size: 11, weight: 600, color: C.caption, tracking: 2.6 });
          break;
        case 'ident': {
          const natural = textWidth(ctx, f.ident, 64, 800);
          const size = 64 * clamp(L.maxWidth / natural, 0.45, 1);
          ctx.save();
          ctx.shadowColor = C.paper;
          ctx.shadowBlur = 6;
          text(ctx, f.ident, cx, y + 33 + size * 0.36, { size, weight: 800, color: C.ink });
          ctx.restore();
          break;
        }
        case 'route': {
          const codeW = Math.max(textWidth(ctx, f.from, 32, 700), textWidth(ctx, f.to, 32, 700));
          const gap = 10 + 22 + 10;
          const left = cx - gap / 2 - codeW / 2, right = cx + gap / 2 + codeW / 2;
          text(ctx, f.from, left, y + 29, { size: 32, weight: 700, color: C.route });
          text(ctx, f.to, right, y + 29, { size: 32, weight: 700, color: C.route });
          text(ctx, f.fromCity, left, y + 47, { size: 10, weight: 500, color: C.caption });
          text(ctx, f.toCity, right, y + 47, { size: 10, weight: 500, color: C.caption });
          drawArrow(ctx, cx, y + 17, 20, 0, C.signal, 3);
          break;
        }
        case 'type': {
          const w = textWidth(ctx, f.type, 15, 700) + 20;
          ctx.fillStyle = C.chip;
          ctx.fill(capsule(ctx, cx - w / 2, y, w, 24));
          text(ctx, f.type, cx, y + 17, { size: 15, weight: 700, color: '#FFFFFF' });
          text(ctx, f.typeName, cx, y + 41, { size: 12, weight: 500, color: C.caption });
          break;
        }
        case 'stats': {
          const { alt, spd, dst } = L.stats;
          const rowW = alt.w + 30 + spd.w;
          drawStat(ctx, alt, cx - rowW / 2 + alt.w / 2, y, heading, f);
          drawStat(ctx, spd, cx + rowW / 2 - spd.w / 2, y, heading, f);
          drawStat(ctx, dst, cx, y + 43 + 18, heading, f);
          break;
        }
        case 'statsWide': {
          const { alt, spd, dst } = L.stats;
          const rowW = alt.w + spd.w + dst.w + 88;
          let x = cx - rowW / 2;
          for (const b of [alt, spd, dst]) { drawStat(ctx, b, x + b.w / 2, y, heading, f); x += b.w + 44; }
          break;
        }
        case 'approach': {
          const pass = approach(f);
          const label = pass ? `Closest pass ${milesText(pass.miles)} mi in ${Math.floor(pass.seconds / 60)}:${String(Math.floor(pass.seconds % 60)).padStart(2, '0')}` : 'Moving away';
          const w = textWidth(ctx, label, 12, pass ? 600 : 500) + 24 + 18;
          ctx.fillStyle = alpha(C.ink, pass ? 0.12 : 0.05);
          ctx.fill(capsule(ctx, cx - w / 2, y, w, 26));
          const color = pass ? C.ink : C.caption;
          if (pass) drawSymbol(ctx, 'scope', cx - w / 2 + 12 + 6, y + 13, 13, color);
          else drawArrow(ctx, cx - w / 2 + 12 + 6, y + 13, 10, -45, color, 2);
          text(ctx, label, cx - w / 2 + 12 + 18, y + 17, { size: 12, weight: pass ? 600 : 500, color, align: 'left' });
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------------------
  // A radar pane (RadarScreen) in a box of its own: w × h, the face below `safeTop` and above
  // the bar when there is one.

  const Hit = { regions: [] };

  function hitPoint(ctx, x, y) {
    const m = ctx.getTransform();
    return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
  }

  function addHit(ctx, kind, x, y, r, value) {
    const [px, py] = hitPoint(ctx, x, y);
    const m = ctx.getTransform();
    Hit.regions.push({ kind, x: px, y: py, r: r * Math.hypot(m.a, m.b), value });
  }

  // RadarBackdrop over a pane, in the screen's own space: range rings, the sweep and the
  // vignette are round, so they stay put while the interface inside turns.
  function drawRadarBackdrop(ctx, [x, y, w, h], time) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const cx = x + w / 2, cy = y + h / 2;
    const unit = Math.min(w, h) / 2;
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = alpha(C.ink, dark ? 0.1 : 0.07);
    ctx.lineWidth = 1;
    for (const k of [0.42, 0.72, 1.02, 1.32]) { ctx.beginPath(); ctx.arc(cx, cy, unit * k, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([]);
    const side = Math.max(w, h);
    if (!reduceMotion.matches && ctx.createConicGradient) {
      const a = ((time / 7) % 1) * Math.PI * 2;
      const g = ctx.createConicGradient(a - Math.PI / 2, cx, cy);
      const strength = dark ? 0.1 : 0.05;
      g.addColorStop(0, alpha(C.sweep, 0));
      g.addColorStop(0.82, alpha(C.sweep, 0));
      g.addColorStop(0.995, alpha(C.sweep, strength));
      g.addColorStop(1, alpha(C.sweep, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, side * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
    const vignette = ctx.createRadialGradient(cx, cy, side * 0.25, cx, cy, side * 0.75);
    vignette.addColorStop(0, alpha(C.paperShade, 0));
    vignette.addColorStop(1, alpha(C.paperShade, dark ? 0.85 : 0.45));
    ctx.fillStyle = vignette;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  function drawRadarPane(ctx, w, h, o, frame) {
    const { heading, time, hero } = frame;
    const faceTop = o.safeTop;
    const barSpace = o.bar > 0.01 ? (o.barGap + BAR_HEIGHT + 8) * o.bar : 0;
    const faceH = h - faceTop - barSpace;

    const cx = w / 2;

    // CompassBezel: ticks every 5°, heavier every 30°, N / E / S / W.
    const bezel = Track(5, faceTop + 5, w - 10, faceH - 10, 40);
    ctx.save();
    ctx.lineCap = 'round';
    for (let b = 0; b < 360; b += 5) {
      if (b % 90 === 0) continue;
      const major = b % 30 === 0;
      const p = bezel.at(bezel.sAtAngle(b - heading));
      const len = major ? 8 : 4;
      ctx.strokeStyle = alpha(C.caption, major ? 0.75 : 0.4);
      ctx.lineWidth = major ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.nx * len, p.y + p.ny * len);
      ctx.stroke();
    }
    ctx.restore();
    for (const [b, letter] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
      const p = bezel.at(bezel.sAtAngle(b - heading));
      text(ctx, letter, p.x + p.nx * 6, p.y + p.ny * 6, { size: 11, weight: 700, color: b ? C.caption : C.signal, baseline: 'middle' });
    }

    // PerimeterLayer: the aircraft in range at their bearing, nose along their track.
    const icons = Track(27, faceTop + 27, w - 54, faceH - 54, 34);
    const inRange = traffic.filter((p) => distance(p) <= RADIUS);
    const items = inRange.map((p) => ({ p, s: icons.sAtAngle(bearingOf(p) - heading) }));
    if (items.length) spread(items, 40, icons.length);
    items.sort((a, b) => (a.p.ident === focusIdent) - (b.p.ident === focusIdent));
    for (const { p, s } of items) {
      const at = icons.at(s);
      const isFocus = p.ident === focusIdent;
      const fade = isFocus ? 1 : 1 - 0.4 * Math.min(1, distance(p) / RADIUS);
      const tint = isFocus ? C.signal : C.blip;
      ctx.save();
      ctx.globalAlpha *= fade;
      if (isFocus) {
        const pulse = reduceMotion.matches ? 0 : (time % 1.6) / 1.6;
        ctx.fillStyle = alpha(C.signal, 0.16);
        ctx.beginPath(); ctx.arc(at.x, at.y, 20, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = alpha(C.signal, 0.55 * (1 - pulse));
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(at.x, at.y, 20 * (0.85 + 0.5 * pulse), 0, Math.PI * 2); ctx.stroke();
      }
      drawGlyph(ctx, p.glyph, at.x, at.y, isFocus ? 34 : 30, p.track - heading, tint, time);
      if (p.tag) {
        ctx.fillStyle = C.notable;
        ctx.strokeStyle = C.paper;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(at.x + 13, at.y - 13, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.save();
      ctx.shadowColor = C.paper;
      ctx.shadowBlur = 4;
      text(ctx, milesText(distance(p)), at.x + at.nx * 30, at.y + at.ny * 30, { size: isFocus ? 15 : 13, weight: 700, color: tint, baseline: 'middle' });
      ctx.restore();
      ctx.restore();
      addHit(ctx, 'plane', at.x, at.y, 24, p.ident);
    }

    // The hero, as big as the room allows (RadarLayout.heroScale(fitting:room:)).
    const f = traffic.find((p) => p.ident === hero.ident);
    if (f && distance(f) <= RADIUS * 1.05) {
      const wide = w > faceH && faceH < 560;
      const compact = faceH < 420;
      const base = Math.min(1.7, Math.max(1, Math.min(w, faceH) / 430));
      const L = heroLayout(ctx, f, { wide, compact, maxWidth: Math.max(200, w - 144) / base });
      const room = faceH - 128;
      const scale = Math.max(0.75, Math.min(base, Math.floor((room / L.h) * 20) / 20));
      L.maxWidth = Math.max(200, w - 144) / scale;
      ctx.save();
      ctx.globalAlpha *= hero.alpha;
      ctx.translate(cx, faceTop + faceH / 2 + hero.lift);
      ctx.scale(scale, scale);
      drawHero(ctx, f, L, 0, 0, heading);
      ctx.restore();
    }

    if (o.bar > 0.01) drawBar(ctx, w, h - o.barGap - BAR_HEIGHT, o.bar, o.offersMap, frame);
  }

  // RadarControlBar along the bottom: Map, Sky View | the count, Logbook, Settings.
  function drawBar(ctx, w, top, a, offersMap, frame) {
    const buttons = [];
    if (offersMap) buttons.push(['map', 'Map']);
    buttons.push(['viewfinder', 'Sky View'], ['divider'], ['count', 'Aircraft'], ['book', 'Logbook'], ['gear', 'Settings']);
    const widths = buttons.map(([kind, title]) => (kind === 'divider' ? 5 : Math.max(60, textWidth(ctx, title.toUpperCase(), 9, 700, 0.9) + 14)));
    const total = widths.reduce((s, v) => s + v, 0) + 10;
    const left = w / 2 - total / 2;
    ctx.save();
    ctx.globalAlpha *= a;
    glass(ctx, capsule(ctx, left, top, total, BAR_HEIGHT));
    let x = left + 5;
    buttons.forEach(([kind, title], i) => {
      const bw = widths[i];
      const mid = x + bw / 2;
      if (kind === 'divider') {
        ctx.fillStyle = alpha(C.faint, 0.5);
        ctx.fillRect(mid - 0.5, top + 15, 1, 26);
      } else {
        if (kind === 'count') {
          const n = String(frame.count);
          const nw = textWidth(ctx, n, 15, 700);
          ctx.fillStyle = C.live;
          ctx.beginPath(); ctx.arc(mid - nw / 2 - 5, top + 20, 3.5, 0, Math.PI * 2); ctx.fill();
          text(ctx, n, mid + 5, top + 25.5, { size: 15, weight: 700, color: C.value });
        } else {
          drawSymbol(ctx, kind, mid, top + 20, 19, C.ink);
        }
        text(ctx, title.toUpperCase(), mid, top + 44, { size: 9, weight: 700, color: C.caption, tracking: 0.9 });
        if (kind === 'map') addHit(ctx, 'map', mid, top + BAR_HEIGHT / 2, 28);
      }
      x += bw;
    });
    ctx.restore();
  }

  // The vertical bar strip (landscape and the cover): the status bar on end at the top, then
  // round glass buttons, then the count, Logbook and Settings in one glass capsule.
  function drawRail(ctx, x0, o) {
    const { a, offersMap, mapShown, firstTop, groupBottom, cover, count } = o;
    const mid = x0 + STRIP / 2;
    ctx.save();
    ctx.globalAlpha *= a;
    const top = cover ? 80 : 30;
    drawSymbol(ctx, 'location', mid, top, 15, C.value);
    text(ctx, '9:41', mid, top + 26, { size: 17, weight: 700, color: C.value });
    // Battery as a ring round the Wi-Fi symbol, as the strip draws it.
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = alpha(C.value, 0.25);
    ctx.beginPath(); ctx.arc(mid, top + 54, 14, rad(125), rad(415)); ctx.stroke();
    ctx.strokeStyle = C.live;
    ctx.beginPath(); ctx.arc(mid, top + 54, 14, rad(125), rad(395)); ctx.stroke();
    ctx.strokeStyle = C.value;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const r of [3, 6.5, 10]) { ctx.beginPath(); ctx.arc(mid, top + 60, r, rad(-135), rad(-45)); ctx.stroke(); }

    const size = 48;
    let y = firstTop;
    const round = [];
    if (offersMap) round.push(mapShown ? 'scope' : 'map');
    round.push('viewfinder');
    for (const kind of round) {
      const p = new Path2D();
      p.arc(mid, y + size / 2, size / 2, 0, Math.PI * 2);
      glass(ctx, p);
      drawSymbol(ctx, kind, mid, y + size / 2, 19, C.ink);
      if (kind !== 'viewfinder') addHit(ctx, 'map', mid, y + size / 2, size / 2 + 4);
      y += size + 10;
    }
    const groupH = size * 3 + 2 * 2 + 4;
    const gTop = groupBottom - groupH;
    glass(ctx, capsule(ctx, mid - size / 2, gTop, size, groupH));
    const n = String(count);
    ctx.fillStyle = C.live;
    ctx.beginPath(); ctx.arc(mid, gTop + 2 + 15, 3.5, 0, Math.PI * 2); ctx.fill();
    text(ctx, n, mid, gTop + 2 + 37, { size: 14, weight: 700, color: C.value });
    drawSymbol(ctx, 'book', mid, gTop + 2 + size + 2 + size / 2, 19, C.ink);
    drawSymbol(ctx, 'gear', mid, gTop + 2 + (size + 2) * 2 + size / 2, 19, C.ink);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------
  // A map pane (TrafficMap) in a box of its own.

  const MAP_PX_PER_MILE = 2100 / 96;
  const mapImages = {};
  function mapImage() {
    const key = dark ? 'dark' : 'light';
    if (!mapImages[key]) {
      const img = new Image();
      img.decoding = 'async';
      img.src = `img/duo/map-${key}.webp`;
      mapImages[key] = img;
    }
    const img = mapImages[key];
    return img.complete && img.naturalWidth ? img : null;
  }

  function drawMapPane(ctx, w, h, o, frame) {
    const { time } = frame;
    const usable = { x: 0, y: o.insetTop, w: w - o.insetRight, h: h - o.insetTop - o.insetBottom };
    const ringR = Math.max(60, Math.min(usable.w, usable.h) / 2 * 0.86);
    const cx = usable.x + usable.w / 2, cy = usable.y + usable.h / 2;
    const ptPerMile = ringR / RADIUS;
    const toMap = (p) => [cx + p[0] * ptPerMile, cy - p[1] * ptPerMile];

    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, w, h);
    const img = mapImage();
    if (img) {
      ctx.save();
      ctx.translate(cx, cy);
      const k = ptPerMile / MAP_PX_PER_MILE;
      ctx.drawImage(img, -img.naturalWidth / 2 * k, -img.naturalHeight / 2 * k, img.naturalWidth * k, img.naturalHeight * k);
      ctx.restore();
    }
    // The paper wash: .muted alone barely quietens the map.
    ctx.fillStyle = alpha(C.paper, 0.45);
    ctx.fillRect(0, 0, w, h);

    // RadiusRings, with the half and quarter echoes.
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = alpha(C.ink, 0.16);
    for (const k of [0.25, 0.5]) { ctx.beginPath(); ctx.arc(cx, cy, ringR * k, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([4, 4]);
    ctx.fillStyle = alpha(C.ink, 0.06);
    ctx.strokeStyle = alpha(C.ink, 0.35);
    ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();

    // Trails, fading with age, a band of points at a time (the app's trailBands).
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.6;
    for (const p of traffic) {
      const pts = p.trail.concat([[p.x, p.y, clock]]);
      const fringe = distance(p) > RADIUS ? 0.4 : 1;
      for (let start = 0; start < pts.length - 1; start += 8) {
        const end = Math.min(pts.length - 1, start + 8);
        const age = clock - pts[(start + end) >> 1][2];
        const a = Math.max(0, 1 - age / TRAIL_KEEP) ** 1.6 * 0.6 * fringe;
        if (a < 0.02) continue;
        ctx.strokeStyle = alpha(C.blip, a);
        ctx.beginPath();
        for (let i = start; i <= end; i++) {
          const [x, y] = toMap(pts[i]);
          if (i === start) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    // The focused aircraft's next ten minutes.
    const f = traffic.find((p) => p.ident === focusIdent);
    if (f) {
      const v = f.kts * MPS_PER_KT;
      const [x0, y0] = toMap([f.x, f.y]);
      const [x1, y1] = toMap([f.x + v * 600 * Math.sin(rad(f.track)), f.y + v * 600 * Math.cos(rad(f.track))]);
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.lineCap = 'round';
      ctx.strokeStyle = alpha(C.signal, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.restore();
    }

    // Airport pins for where the drawn flights come from and go to.
    const departing = new Set(traffic.map((p) => p.from));
    const used = new Set(traffic.flatMap((p) => [p.from, p.to]));
    for (const [code, at] of Object.entries(AIRPORTS)) {
      if (!used.has(code)) continue;
      const [x, y] = toMap(at);
      if (x < -40 || y < -40 || x > w + 40 || y > h + 40) continue;
      ctx.fillStyle = departing.has(code) ? C.route : '#FFFFFF';
      ctx.strokeStyle = C.route;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const tw = textWidth(ctx, code, 12, 800) + 14;
      ctx.fillStyle = C.route;
      ctx.fill(capsule(ctx, x - tw / 2, y - 31, tw, 20));
      text(ctx, code, x, y - 17, { size: 12, weight: 800, color: '#FFFFFF' });
    }

    // The aircraft: in range at full strength, the fringe out to 1.5× the radius at 40 %.
    const order = traffic.slice().sort((a, b) => (a.ident === focusIdent) - (b.ident === focusIdent));
    for (const p of order) {
      const [x, y] = toMap([p.x, p.y]);
      if (x < -30 || y < -30 || x > w + 30 || y > h + 30) continue;
      const isFocus = p.ident === focusIdent;
      ctx.save();
      ctx.globalAlpha *= isFocus || distance(p) <= RADIUS ? 1 : 0.4;
      if (isFocus) {
        ctx.fillStyle = alpha(C.signal, 0.16);
        ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = alpha(C.signal, 0.4);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      drawGlyph(ctx, p.glyph, x, y, isFocus ? 30 : 26, p.track, isFocus ? C.signal : C.blip, time);
      ctx.restore();
      addHit(ctx, 'plane', x, y, 20, p.ident);
    }

    // ObserverDot.
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 3;
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();

    // MapKit's attribution, bottom left.
    const legalY = h - 22 - o.insetBottom;
    const apple = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const mark = apple ? ' Maps' : 'Maps';
    ctx.save();
    ctx.globalAlpha *= 0.9;
    const mw = text(ctx, mark, 14, legalY, { size: 13, weight: 600, color: dark ? '#FFFFFF' : '#1D1D1F', align: 'left' });
    text(ctx, 'Legal', 14 + mw + 8, legalY, { size: 9, weight: 500, color: dark ? 'rgba(255,255,255,0.75)' : 'rgba(29,29,31,0.7)', align: 'left' });
    ctx.restore();

    // The flight on a glass card (the map screen only): one row of stats, no type line.
    if (o.card > 0.01 && f && distance(f) <= RADIUS * 1.05) {
      const L = heroLayout(ctx, f, { wide: true, compact: true, maxWidth: o.cardW - 28 });
      const cardH = L.h + 32;
      const x = o.cardX, y = o.cardBottom - cardH;
      ctx.save();
      ctx.globalAlpha *= o.card;
      const shape = new Path2D();
      roundRect(shape, x, y, o.cardW, cardH, 28);
      glass(ctx, shape);
      ctx.globalAlpha *= frame.hero.alpha;
      drawHero(ctx, f, L, x + o.cardW / 2, y + cardH / 2 + frame.hero.lift, frame.heading);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------------------
  // Layouts: where the radar, the fold and the map go for each way of holding it, in the inner
  // screen's own coordinates (951 × 669, held as a book). Upright, the interface turns a
  // quarter (`turn`): its u runs down the screen's height, so a rect in it maps to
  // x = v, y = 669 − u − width.

  const upright = (u, v, w, h) => [v, INNER.h - u - w, h, w];

  function innerLayout(pose, mapScreen) {
    const L = {
      radar: [0, 0, INNER.w - STRIP, INNER.h], map: [INNER.w, 0, INNER.w / 2, INNER.h],
      mapAlpha: 0, gutter: 0, rail: 1, bar: 0, status: 0, safeTop: 0, barGap: 22,
      insetTop: 0, insetRight: 0, insetBottom: 0, card: 0, cardX: 0, cardW: 364, cardBottom: INNER.h - 16,
      offersMap: 1,
    };
    const half = FOLD - GUTTER;
    switch (pose) {
      case 'book':
      case 'closed':
        // Radar on the left page, the map on the right, the strip over the map's edge.
        Object.assign(L, { radar: [0, 0, half, INNER.h], map: [FOLD + GUTTER, 0, half, INNER.h], mapAlpha: 1, gutter: 1, insetRight: STRIP, offersMap: 0 });
        break;
      case 'flat':
        if (mapScreen) {
          // The map screen: the card bottom-right, the ring left of it.
          const w = INNER.w - STRIP;
          const cardW = Math.min(400, w * 0.42);
          Object.assign(L, { map: [0, 0, INNER.w, INNER.h], mapAlpha: 1, insetRight: STRIP + cardW + 24, card: 1, cardX: w - 12 - cardW, cardW, cardBottom: INNER.h - 20 });
        }
        break;
      case 'tall': {
        // Upright: the status bar along the top and the bar along the bottom.
        Object.assign(L, { radar: upright(0, 0, INNER.h, INNER.w), rail: 0, bar: 1, status: 1, safeTop: STATUS, barGap: 22 });
        if (mapScreen) {
          const cardW = Math.min(520, INNER.h - 24);
          Object.assign(L, { map: upright(0, 0, INNER.h, INNER.w), mapAlpha: 1, insetTop: STATUS, insetBottom: 22 + BAR_HEIGHT + 12 + 150, card: 1, cardX: (INNER.h - cardW) / 2, cardW, cardBottom: INNER.w - 22 - BAR_HEIGHT - 12 });
        } else {
          L.map = upright(0, INNER.w, INNER.h, half);
        }
        break;
      }
      case 'table':
        // Radar on the half standing up, the map on the half lying on the table.
        Object.assign(L, { radar: upright(0, 0, INNER.h, half), map: upright(0, FOLD + GUTTER, INNER.h, half), mapAlpha: 1, gutter: 1, rail: 0, bar: 1, status: 1, safeTop: STATUS, barGap: 10, offersMap: 0 });
        break;
    }
    return L;
  }

  // The layout springs toward its target number by number, so panes slide and resize rather
  // than jump. Flags (offersMap) switch at once and fade with the chrome.
  const LAYOUT_KEYS = ['mapAlpha', 'gutter', 'rail', 'bar', 'status', 'safeTop', 'barGap', 'insetTop', 'insetRight', 'insetBottom', 'card', 'cardX', 'cardW', 'cardBottom'];
  const flatten = (L) => [...L.radar, ...L.map, ...LAYOUT_KEYS.map((k) => L[k])];
  const unflatten = (v, flags) => {
    const L = { radar: v.slice(0, 4), map: v.slice(4, 8), ...flags };
    LAYOUT_KEYS.forEach((k, i) => { L[k] = v[8 + i]; });
    return L;
  };

  // ---------------------------------------------------------------------------------------
  // Painting the screens

  let topo = null;           // the contours, 1200 pt square, for the current theme
  let topoTheme = '';
  function contours() {
    const theme = dark ? 'night' : 'paper';
    if (topoTheme !== theme && window.wtfTopography) {
      topo = window.wtfTopography.still({ style: 'survey', theme, width: 1200, height: 1200, scale: 1.4, feature: 340 });
      topoTheme = theme;
    }
    return topo;
  }

  function background(ctx, cx, cy, turn) {
    ctx.fillStyle = C.paper;
    ctx.fillRect(cx - 700, cy - 700, 1400, 1400);
    const t = contours();
    if (!t) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rad(-turn));
    ctx.drawImage(t, -600, -600, 1200, 1200);
    ctx.restore();
  }

  /// Sets up a pane's box: its interface turned by `turn` and, partway round, shrunk to fit.
  function enterPane(ctx, rect, turn) {
    const [x, y, W, H] = rect;
    const t = turn / 90;
    const w = lerp(W, H, t), h = lerp(H, W, t);
    const a = rad(turn);
    const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    const fit = Math.min(1, W / (w * c + h * s || 1), H / (w * s + h * c || 1));
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, W, H);
    ctx.clip();
    ctx.translate(x + W / 2, y + H / 2);
    ctx.rotate(-a);
    ctx.scale(fit, fit);
    ctx.translate(-w / 2, -h / 2);
    return { w, h };
  }

  function paintInner(ctx, L, turn, frame) {
    background(ctx, INNER.w / 2, INNER.h / 2, turn);
    const t = turn / 90;
    drawRadarBackdrop(ctx, L.radar, frame.time);
    const radarBox = enterPane(ctx, L.radar, turn);
    drawRadarPane(ctx, radarBox.w, radarBox.h, { safeTop: L.safeTop, bar: L.bar, barGap: L.barGap, offersMap: L.offersMap }, frame);
    ctx.restore();

    if (L.mapAlpha > 0.01 && L.map[0] < INNER.w - 1 && L.map[2] > 1) {
      const mapBox = enterPane(ctx, L.map, turn);
      ctx.globalAlpha = Math.min(1, L.mapAlpha);
      drawMapPane(ctx, mapBox.w, mapBox.h, { insetTop: L.insetTop, insetRight: L.insetRight, insetBottom: L.insetBottom, card: L.card, cardX: L.cardX, cardW: L.cardW, cardBottom: L.cardBottom }, frame);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // FoldGutter: paper, shaded to a hairline at the crease, like the gutter of a book.
    if (L.gutter > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, L.gutter);
      const x = FOLD - GUTTER;
      ctx.fillStyle = C.paper;
      ctx.fillRect(x, 0, GUTTER * 2, INNER.h);
      const g = ctx.createLinearGradient(x, 0, x + GUTTER * 2, 0);
      g.addColorStop(0, alpha(C.paperShade, 0));
      g.addColorStop(0.5, alpha(C.paperShade, 0.7));
      g.addColorStop(1, alpha(C.paperShade, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, GUTTER * 2, INNER.h);
      ctx.fillStyle = alpha(C.faint, 0.45);
      ctx.fillRect(FOLD - 0.5, 0, 1, INNER.h);
      ctx.restore();
    }

    // Upright: the status bar along the top of the interface.
    if (L.status > 0.01 && t > 0.5) {
      const box = enterPane(ctx, [0, 0, INNER.w, INNER.h], turn);
      ctx.globalAlpha = Math.min(1, L.status) * (t - 0.5) * 2;
      text(ctx, '9:41', 44, 32, { size: 16, weight: 700, color: C.value });
      const right = box.w - 34;
      for (let i = 0; i < 4; i++) { ctx.fillStyle = C.value; ctx.fillRect(right - 62 + i * 5, 32 - 4 - i * 2.4, 3, 4 + i * 2.4); }
      ctx.strokeStyle = alpha(C.value, 0.5);
      ctx.lineWidth = 1;
      const battery = new Path2D();
      roundRect(battery, right - 26, 21, 24, 12, 3.5);
      ctx.stroke(battery);
      ctx.fillStyle = C.value;
      ctx.fill(capsule(ctx, right - 24, 23, 20, 8));
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    if (L.rail > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, L.rail) * (1 - t);
      drawRail(ctx, INNER.w - STRIP, { a: 1, offersMap: L.offersMap, mapShown: frame.mapScreen && L.mapAlpha > 0.5, firstTop: 120, groupBottom: INNER.h - 27, count: frame.count });
      ctx.restore();
    }
  }

  function paintCover(ctx, frame) {
    background(ctx, COVER.w / 2, COVER.h / 2, 0);
    drawRadarBackdrop(ctx, [0, 0, COVER.w - STRIP, COVER.h], frame.time);
    const box = enterPane(ctx, [0, 0, COVER.w - STRIP, COVER.h], 0);
    drawRadarPane(ctx, box.w, box.h, { safeTop: 0, bar: 0, barGap: 0, offersMap: 1 }, frame);
    ctx.restore();
    drawRail(ctx, COVER.w - STRIP, { a: 1, offersMap: 1, mapShown: false, firstTop: 167, groupBottom: COVER.h - 39, cover: true, count: frame.count });
  }

  // ---------------------------------------------------------------------------------------
  // The device, in 3D

  const items = [...figure.querySelectorAll('.duo-item')];
  const [stepUp, stepDown] = figure.querySelectorAll('.duo-step');
  const slider = figure.querySelector('.duo-slider');
  const stage = figure.querySelector('.duo-stage');
  const rig = figure.querySelector('.duo-rig');
  const hinged = figure.querySelector('.duo-half--a');
  const fixed = figure.querySelector('.duo-half--b');
  const spine = [...figure.querySelectorAll('.duo-spine i')];
  const faces = {
    inA: hinged.querySelector('.duo-face--in'),
    outer: hinged.querySelector('.duo-face--out'),
    inB: fixed.querySelector('.duo-face--in'),
    back: fixed.querySelector('.duo-face--back'),
  };
  const canvases = {
    a: hinged.querySelector('.duo-face--in canvas'),
    b: fixed.querySelector('.duo-face--in canvas'),
    cover: hinged.querySelector('.duo-face--out canvas'),
  };
  const inner = document.createElement('canvas');
  const innerCtx = inner.getContext('2d');
  const ctxA = canvases.a.getContext('2d');
  const ctxB = canvases.b.getContext('2d');
  const coverCtx = canvases.cover.getContext('2d');

  // Each way to hold it: where the Duo sits (in its open width), how it's turned (degrees, CSS's
  // axes: y down, z toward you), and how far the left half is folded over (180 is shut).
  const POSES = {
    book:   { x: 0, y: 0.02, s: 1, rx: 12, ry: -24, rz: 0, fold: 54 },
    flat:   { x: 0, y: 0, s: 1, rx: 6, ry: -7, rz: 0, fold: 0 },
    tall:   { x: 0, y: 0, s: 1, rx: 5, ry: 7, rz: 90, fold: 0 },
    closed: { x: -0.25, y: 0, s: 1.06, rx: 4, ry: 18, rz: 0, fold: 180 },
    table:  { x: 0, y: 0.16, s: 1.02, rx: 60, ry: 0, rz: 90, fold: 62 },
  };
  // The slider: shut at 0, flat at 1, kept in the middle as it opens. Partway, it's a book.
  const sliding = (v) => {
    const angle = 180 * (1 - v);
    const middle = angle >= 90 ? 0.25 : 0.25 * (1 - Math.cos(rad(angle)));
    return { x: -middle, y: 0, s: 1, rx: 4 * (1 - v) + 6 * v, ry: 18 * (1 - v) - 7 * v, rz: 0, fold: angle };
  };
  const slidingLayout = (v) => (v <= 0.04 ? 'closed' : v >= 0.96 ? 'flat' : 'book');

  // Light from the top left: how much a face darkens as it turns away from it.
  const light = [-0.3, -0.45, 1].map((c, _, v) => c / Math.hypot(...v));
  function turned([x, y, z], p) {
    // rotateZ, then rotateY, then rotateX: the order CSS applies them in.
    const [cz, sz] = [Math.cos(rad(p.rz)), Math.sin(rad(p.rz))];
    const [cy, sy] = [Math.cos(rad(p.ry)), Math.sin(rad(p.ry))];
    const [cx, sx] = [Math.cos(rad(p.rx)), Math.sin(rad(p.rx))];
    [x, y] = [x * cz - y * sz, x * sz + y * cz];
    [x, z] = [x * cy + z * sy, z * cy - x * sy];
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    return [x, y, z];
  }
  const lit = (n) => n[0] * light[0] + n[1] * light[1] + n[2] * light[2];
  const shade = (n) => Math.min(0.55, Math.max(0, (1 - lit(n) / light[2]) * 0.42));

  // Where the Duo is, springing toward where it's going: a critically damped spring for each
  // number, so every move eases in and out and the slider is followed closely but smoothly.
  const KEYS = ['x', 'y', 's', 'rx', 'ry', 'rz', 'fold'];
  let now = sliding(0), target = sliding(0), stiffness = 7;
  const speed = Object.fromEntries(KEYS.map((k) => [k, 0]));
  const orbit = { ry: 0, rx: 0 };     // a drag's turn, on top of the pose

  let layoutName = 'closed', mapScreen = false;
  let layoutNow = flatten(innerLayout('closed', false));
  let layoutTarget = layoutNow.slice();
  let layoutSpeed = layoutNow.map(() => 0);
  let layoutFlags = { offersMap: 0 };

  function setLayout(name) {
    layoutName = name;
    const L = innerLayout(name, mapScreen);
    layoutTarget = flatten(L);
    layoutFlags = { offersMap: L.offersMap };
    // Without motion, it's there at once.
    if (reduceMotion.matches) { layoutNow = layoutTarget.slice(); layoutSpeed = layoutSpeed.map(() => 0); }
    wake();
  }

  // The hero cross-fades when the aircraft in the centre changes.
  const hero = { ident: focusIdent, alpha: 1, lift: 0, swapAt: 0 };
  function followHero(dtReal) {
    const want = focusIdent;
    if (want !== hero.ident && !hero.swapAt) hero.swapAt = performance.now();
    if (hero.swapAt) {
      const k = (performance.now() - hero.swapAt) / 180;
      if (k < 1 && !reduceMotion.matches) { hero.alpha = 1 - k; hero.lift = 5 * k; }
      else { hero.ident = want; hero.swapAt = 0; hero.alpha = 0; hero.lift = 5; }
    } else if (hero.alpha < 1) {
      hero.alpha = Math.min(1, hero.alpha + dtReal / 0.22);
      hero.lift = 5 * (1 - hero.alpha);
    }
  }

  // Sizes follow the stage; the Duo's moves are in its own width.
  let width = 0, scale = 1;
  function measure() {
    width = fixed.offsetWidth * 2;
    const screen = faces.inB.querySelector('.duo-screen');
    const ptCss = (screen.clientWidth * 2) / INNER.w;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = Math.min(2.6, Math.max(0.6, ptCss * dpr * 1.2));
    inner.width = Math.round(INNER.w * scale);
    inner.height = Math.round(INNER.h * scale);
    canvases.a.width = canvases.b.width = Math.round((INNER.w / 2) * scale);
    canvases.a.height = canvases.b.height = inner.height;
    canvases.cover.width = Math.round(COVER.w * scale);
    canvases.cover.height = Math.round(COVER.h * scale);
  }

  function applyRig() {
    const p = { ...now, ry: now.ry + orbit.ry, rx: now.rx + orbit.rx };
    rig.style.transform = `translate3d(${(p.x * width).toFixed(2)}px, ${(p.y * width).toFixed(2)}px, 0) scale(${p.s.toFixed(4)}) rotateX(${p.rx.toFixed(3)}deg) rotateY(${p.ry.toFixed(3)}deg) rotateZ(${p.rz.toFixed(3)}deg)`;
    hinged.style.transform = `rotateY(${p.fold.toFixed(3)}deg)`;
    const f = rad(p.fold);
    const nA = turned([Math.sin(f), 0, Math.cos(f)], p);
    const nOut = turned([-Math.sin(f), 0, -Math.cos(f)], p);
    const nB = turned([0, 0, 1], p);
    const nBack = turned([0, 0, -1], p);
    faces.inA.style.setProperty('--shade', shade(nA).toFixed(3));
    faces.outer.style.setProperty('--shade', shade(nOut).toFixed(3));
    faces.inB.style.setProperty('--shade', shade(nB).toFixed(3));
    faces.back.style.setProperty('--shade', shade(nBack).toFixed(3));
    // The frame's polish catches the light as it turns.
    hinged.style.setProperty('--edge', (0.15 + shade(nA) * 0.9).toFixed(3));
    fixed.style.setProperty('--edge', (0.15 + shade(nB) * 0.9).toFixed(3));
    const sheen = (p.ry * 1.6 + p.rx * 0.8).toFixed(1);
    figure.style.setProperty('--sheen', `${sheen}%`);
    figure.style.setProperty('--crease', (0.08 + 0.3 * Math.sin(Math.min(f, Math.PI / 2))).toFixed(3));
    // The spine: a rounded hinge between the backs, as wide as the fold is far.
    const t = fixed.offsetWidth ? width * 0.026 : 0;
    const step = p.fold / spine.length;
    const sw = 2 * t * Math.tan(rad(step / 2)) + 1.2;
    spine.forEach((el, i) => {
      const a = (i + 0.5) * step;
      el.style.width = `${sw.toFixed(2)}px`;
      el.style.transform = `rotateY(${a.toFixed(2)}deg) translateZ(${(-t).toFixed(2)}px)`;
      el.style.setProperty('--shade', shade(turned([-Math.sin(rad(a)), 0, -Math.cos(rad(a))], p)).toFixed(3));
      if (el.hidden !== p.fold < 2) el.hidden = p.fold < 2;
    });
    return { innerVisible: nB[2] > -0.05 && p.fold < 179, coverVisible: nOut[2] > -0.05 && p.fold > 60, p };
  }

  // ---------------------------------------------------------------------------------------
  // The loop

  let frame = 0, last = 0, visible = false, lastPaint = 0;
  let rigState = null;

  function wake() {
    if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); }
  }

  function springs(dt) {
    const n = Math.ceil(dt * 240), h = dt / n;
    let moving = false;
    for (const k of KEYS) {
      for (let i = 0; i < n; i++) {
        speed[k] += (stiffness * stiffness * (target[k] - now[k]) - 2 * stiffness * speed[k]) * h;
        now[k] += speed[k] * h;
      }
      const near = k === 'x' || k === 'y' || k === 's' ? 1e-4 : 0.02;
      if (Math.abs(target[k] - now[k]) > near || Math.abs(speed[k]) > near) moving = true;
      else { now[k] = target[k]; speed[k] = 0; }
    }
    const ls = 6.5;
    for (let j = 0; j < layoutNow.length; j++) {
      for (let i = 0; i < n; i++) {
        layoutSpeed[j] += (ls * ls * (layoutTarget[j] - layoutNow[j]) - 2 * ls * layoutSpeed[j]) * h;
        layoutNow[j] += layoutSpeed[j] * h;
      }
      if (Math.abs(layoutTarget[j] - layoutNow[j]) > 0.01 || Math.abs(layoutSpeed[j]) > 0.01) moving = true;
      else { layoutNow[j] = layoutTarget[j]; layoutSpeed[j] = 0; }
    }
    return moving;
  }

  function tick(t) {
    frame = 0;
    const dtReal = Math.min(0.064, last ? (t - last) / 1000 : 1 / 60);
    last = t;
    if (reduceMotion.matches) { Object.assign(now, target); layoutNow = layoutTarget.slice(); }
    const moving = reduceMotion.matches ? false : springs(dtReal);
    simulate(dtReal * TIME_SCALE);
    followHero(dtReal);

    // The compass follows the phone: turn it and the planes slide round the edge. The map stays
    // north up (the app's Map north up), which keeps MapKit's labels upright.
    const heading = norm(-(now.ry + orbit.ry));

    // Nothing moving: the rig keeps its styles, and the screens keep last frame's visibility.
    if (moving || dragging || !rigState) rigState = applyRig();
    const state = rigState;
    // Moving: every frame. Still: 30 a second is plenty for planes crossing the sky.
    const busy = moving || dragging;
    if (busy || t - lastPaint > 32) {
      lastPaint = t;
      paint(state, t / 1000, heading);
    }
    if (visible && !document.hidden) frame = requestAnimationFrame(tick);
  }

  function paint(state, time, heading) {
    focused();
    const count = traffic.filter((p) => distance(p) <= RADIUS).length;
    const base = { heading, time, hero, count, mapScreen };
    Hit.regions = [];
    if (state.innerVisible) {
      const L = unflatten(layoutNow, layoutFlags);
      const turn = clamp(state.p.rz, 0, 90);
      innerCtx.setTransform(scale, 0, 0, scale, 0, 0);
      paintInner(innerCtx, L, turn, base);
      const halfW = canvases.a.width;
      ctxA.drawImage(inner, 0, 0, halfW, inner.height, 0, 0, halfW, inner.height);
      ctxB.drawImage(inner, inner.width - halfW, 0, halfW, inner.height, 0, 0, halfW, inner.height);
    }
    Hit.inner = Hit.regions;
    Hit.regions = [];
    if (state.coverVisible) {
      coverCtx.setTransform(scale, 0, 0, scale, 0, 0);
      paintCover(coverCtx, base);
    }
    Hit.cover = Hit.regions;
    Hit.regions = [];
  }

  // ---------------------------------------------------------------------------------------
  // Poses, the list and the slider

  // A pose picked after a drag eases back from wherever the drag left it.
  function releaseOrbit() {
    now.ry += orbit.ry;
    now.rx += orbit.rx;
    orbit.ry = 0;
    orbit.rx = 0;
  }

  const go = (pose) => {
    releaseOrbit();
    if (pose === 'fold') {
      stiffness = 8;
      const v = slider.value / 1000;
      target = sliding(v);
      setLayout(slidingLayout(v));
    } else {
      stiffness = 6;
      target = POSES[pose];
      setLayout(pose);
    }
    wake();
  };

  // The list: the one picked opens into its card, the one before closes back to a pill.
  let at = 0, touched = false;
  function pick(i) {
    if (i < 0 || i >= items.length || i === at) return;
    const before = items.map((li) => li.getBoundingClientRect());
    const hadFocus = items[i].contains(document.activeElement);
    items.forEach((li, j) => {
      const open = j === i;
      li.classList.toggle('is-open', open);
      li.querySelector('.duo-pill').setAttribute('aria-expanded', String(open));
      li.querySelector('.duo-card').hidden = !open;
    });
    if (!reduceMotion.matches) {
      items.forEach((li, j) => {
        const a = before[j], b = li.getBoundingClientRect();
        if (Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1) return;
        li.animate([{ width: `${a.width}px`, height: `${a.height}px` }, { width: `${b.width}px`, height: `${b.height}px` }],
          { duration: 560, easing: 'cubic-bezier(.3, .7, .2, 1)' });
        const inside = li.querySelector(li.classList.contains('is-open') ? '.duo-card' : '.duo-pill');
        inside.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
          { duration: 380, delay: 160, easing: 'ease', fill: 'backwards' });
      });
    }
    // The pill pressed is gone: keep the keyboard where it was, on the card that replaced it.
    if (hadFocus) items[i].querySelector('.duo-card').focus({ preventScroll: true });
    at = i;
    stepUp.disabled = i === 0;
    stepDown.disabled = i === items.length - 1;
    mapScreen = false;
    go(items[i].dataset.pose);
  }
  items.forEach((li, i) => {
    li.querySelector('.duo-card').tabIndex = -1;
    li.querySelector('.duo-pill').addEventListener('click', () => { touched = true; pick(i); });
  });
  stepUp.addEventListener('click', () => { touched = true; pick(at - 1); });
  stepDown.addEventListener('click', () => { touched = true; pick(at + 1); });

  function slide() {
    const v = slider.value / 1000;
    slider.setAttribute('aria-valuetext', v <= 0 ? 'Closed' : v >= 1 ? 'Open flat' : `${Math.round(v * 100)}% open`);
    slider.style.setProperty('--fill', `${(v * 100).toFixed(1)}%`);
    if (items[at].dataset.pose !== 'fold') return;
    stiffness = 11;
    target = sliding(v);
    const name = slidingLayout(v);
    if (name !== layoutName) { mapScreen = false; setLayout(name); }
    wake();
  }
  slider.addEventListener('input', () => { touched = true; slide(); });

  // ---------------------------------------------------------------------------------------
  // Touch: drag the Duo round to look at it; tap a plane to bring it in, or the map button.

  let dragging = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = { x: e.clientX, y: e.clientY, ry: orbit.ry, rx: orbit.rx, id: e.pointerId, moved: false, touch: e.pointerType === 'touch' };
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
    if (!dragging.moved && Math.hypot(dx, dy) > 6) {
      dragging.moved = true;
      touched = true;
      stage.classList.add('is-dragging');
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
    }
    if (!dragging.moved) return;
    orbit.ry = clamp(dragging.ry + dx * 0.35, -70, 70);
    if (!dragging.touch) orbit.rx = clamp(dragging.rx - dy * 0.25, -30, 30);
    wake();
  });
  const endDrag = (e) => {
    if (!dragging || (e && e.pointerId !== dragging.id)) return;
    const wasDrag = dragging.moved;
    dragging = null;
    stage.classList.remove('is-dragging');
    if (wasDrag) return;
    if (e && e.type === 'pointerup') tap(e);
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', () => { dragging = null; stage.classList.remove('is-dragging'); });

  function tap(e) {
    const canvas = e.target.closest && e.target.closest('canvas');
    if (!canvas) return;
    const rect = { w: canvas.clientWidth, h: canvas.clientHeight };
    if (!rect.w) return;
    // offsetX / offsetY are in the canvas's own (untransformed) space.
    let x = (e.offsetX / rect.w) * canvas.width;
    const y = (e.offsetY / rect.h) * canvas.height;
    let regions;
    if (canvas === canvases.cover) regions = Hit.cover;
    else { regions = Hit.inner; if (canvas === canvases.b) x += inner.width - canvas.width; }
    if (!regions) return;
    let best = null;
    for (const r of regions) {
      const d = Math.hypot(r.x - x, r.y - y);
      if (d <= r.r && (!best || d < best.d)) best = { ...r, d };
    }
    if (!best) return;
    if (best.kind === 'plane') { focusIdent = best.value; wake(); }
    if (best.kind === 'map' && (layoutName === 'flat' || layoutName === 'tall')) {
      mapScreen = !mapScreen;
      setLayout(layoutName);
    }
  }

  // ---------------------------------------------------------------------------------------
  // Start

  readPalette();
  window.addEventListener('wtf:theme', () => { readPalette(); topoTheme = ''; wake(); });
  new ResizeObserver(() => { measure(); rigState = applyRig(); wake(); }).observe(stage);
  measure();
  rigState = applyRig();

  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) { mapImage(); wake(); }
  }, { rootMargin: '200px 0px' }).observe(stage);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });

  // A first look, once it's on screen: it opens partway, into a book.
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    if (reduceMotion.matches) { slider.value = '620'; slide(); return; }
    setTimeout(() => {
      if (touched || at !== 0) return;
      const start = performance.now();
      const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
      const step = (t) => {
        if (touched || at !== 0) return;
        const k = Math.min(1, (t - start) / 1900);
        slider.value = String(Math.round(620 * ease(k)));
        slide();
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, 450);
  }, { threshold: 0.45 });
  io.observe(stage);
})();
