// The hero: a working copy of the app's radar, with the browser window as the screen.
// Simulated traffic around New York is dead-reckoned every frame. The nearest aircraft takes
// the center and stays there until it leaves the radius or you pick another; the rest sit on
// the edge at their compass bearing, nose along their track, with whole-mile labels.

(function () {
  'use strict';

  const hero = document.querySelector('[data-radar]');
  if (!hero) return;

  const edge = hero.querySelector('.radar-edge');
  const bezel = hero.querySelector('.radar-bezel');
  const flightEl = hero.querySelector('.flight');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const RADIUS = 12;        // miles
  const TIME_SCALE = 1.5;   // the sky runs a little fast, so there's something to watch
  const MPS_PER_KT = 1.15078 / 3600;

  // [ident, operator, from, fromCity, to, toCity, typeCode, typeName, glyph, feet, fpm, kts, tag]
  // Five on screen at once, one of each kind; a plane that leaves is replaced by another of its kind.
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

  const BADGES = { rare: (f) => `Rare · ${f.typeName.replace(/^Boeing /, '')}` };

  // ---------------------------------------------------------------------------------------
  // Traffic

  const rand = mulberry32(7);
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const norm = (d) => ((d % 360) + 360) % 360;

  function make(row, x, y, track) {
    const [ident, operator, from, fromCity, to, toCity, type, typeName, glyph, feet, fpm, kts, tag] = row;
    return { ident, operator, from, fromCity, to, toCity, type, typeName, glyph, feet, fpm, kts, tag, x, y, track, el: null };
  }

  // A fixed opening scene: Air Canada on approach to LaGuardia just overhead, the rest spread round.
  const OPENING = [
    ['AC718', 1.6, 212, 60], ['N407LH', 3.4, 150, 20], ['DL5721', 5.5, 105, 250],
    ['LH403', 8.5, 20, 65], ['UA70', 7.5, 290, 75],
  ];

  const byIdent = Object.fromEntries(POOL.map((row) => [row[0], row]));
  let traffic = OPENING.map(([id, miles, bearing, track]) =>
    make(byIdent[id], miles * Math.sin(rad(bearing)), miles * Math.cos(rad(bearing)), track));

  function respawn(old) {
    const used = new Set(traffic.map((t) => t.ident));
    const free = POOL.filter((row) => row[8] === old.glyph && !used.has(row[0]));
    const row = free[Math.floor(rand() * free.length)] || byIdent[old.ident];
    const bearing = rand() * 360;
    const miles = RADIUS * (0.98 + rand() * 0.04);
    const track = norm(bearing + 180 + (rand() - 0.5) * 100);
    const plane = make(row, miles * Math.sin(rad(bearing)), miles * Math.cos(rad(bearing)), track);
    plane.el = old.el;
    plane.el.querySelector('use').setAttribute('href', `#g-${plane.glyph}`);
    plane.el.dataset.tag = plane.tag || '';
    return plane;
  }

  const distance = (p) => Math.hypot(p.x, p.y);
  const bearingOf = (p) => norm(deg(Math.atan2(p.x, p.y)));

  function step(dt) {
    traffic = traffic.map((p) => {
      const v = p.kts * MPS_PER_KT * dt;
      p.x += v * Math.sin(rad(p.track));
      p.y += v * Math.cos(rad(p.track));
      p.feet = Math.max(p.fpm < 0 ? 1200 : 0, Math.min(38000, p.feet + (p.fpm * dt) / 60));
      if ((p.fpm < 0 && p.feet <= 1200) || (p.fpm > 0 && p.feet >= 38000)) p.fpm = 0;
      if (distance(p) > RADIUS * 1.04) {
        const next = respawn(p);
        if (focusIdent === p.ident) focusIdent = null;
        return next;
      }
      return p;
    });
  }

  // ---------------------------------------------------------------------------------------
  // Focus

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

  function focus(ident) {
    if (ident === focusIdent) return;
    focusIdent = ident;
    renderFlight(true);
  }

  // ---------------------------------------------------------------------------------------
  // Heading: sways gently, the way a phone in a hand does, and follows a drag.

  let headingBase = 0;
  let drag = null;
  const start = performance.now();

  function heading(now) {
    const sway = reduceMotion.matches ? 0 : 14 * Math.sin(((now - start) / 1000) * (2 * Math.PI / 46));
    return norm(headingBase + sway);
  }

  hero.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('a, button')) return;
    drag = { x: e.clientX, base: headingBase, id: e.pointerId, moved: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    if (drag.moved) {
      headingBase = drag.base - dx * 0.35;
      hero.classList.add('is-turning');
    }
  });
  const endDrag = () => { drag = null; hero.classList.remove('is-turning'); };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // ---------------------------------------------------------------------------------------
  // Perimeter: a rounded rectangle just inside the hero, sampled once per size (the app's
  // PerimeterTrack caches 1,440 samples the same way).

  let track = null;

  function buildTrack() {
    const w = hero.clientWidth;
    const h = hero.clientHeight;
    const narrow = w < 640;
    const header = hero.querySelector('.site-header');
    const top = (header ? header.offsetTop + header.offsetHeight : 0) + (narrow ? 18 : 26);
    const inset = narrow ? 20 : 36;
    const rect = { l: inset, r: w - inset, t: top, b: h - inset };
    const radius = Math.min(narrow ? 40 : 64, (rect.r - rect.l) / 2, (rect.b - rect.t) / 2);
    const cx = (rect.l + rect.r) / 2;
    const cy = (rect.t + rect.b) / 2;

    // Walk the rounded rectangle clockwise from the top middle.
    const pts = [];
    const add = (x, y) => pts.push([x, y]);
    const arc = (ox, oy, from) => { for (let i = 0; i <= 24; i++) { const a = rad(from + (i / 24) * 90); add(ox + radius * Math.cos(a), oy + radius * Math.sin(a)); } };
    const line = (x0, y0, x1, y1) => { const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6)); for (let i = 0; i <= n; i++) add(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n); };
    line(cx, rect.t, rect.r - radius, rect.t);
    arc(rect.r - radius, rect.t + radius, -90);
    line(rect.r, rect.t + radius, rect.r, rect.b - radius);
    arc(rect.r - radius, rect.b - radius, 0);
    line(rect.r - radius, rect.b, rect.l + radius, rect.b);
    arc(rect.l + radius, rect.b - radius, 90);
    line(rect.l, rect.b - radius, rect.l, rect.t + radius);
    arc(rect.l + radius, rect.t + radius, 180);
    line(rect.l + radius, rect.t, cx, rect.t);

    const s = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const angle = pts.map(([x, y]) => norm(deg(Math.atan2(x - cx, cy - y))));
    angle[angle.length - 1] = 360;
    track = { pts, s, angle, length: s[s.length - 1], cx, cy, narrow, rect, radius, w, h };
    drawBezel();
  }

  function sAtAngle(a) {
    const { angle, s } = track;
    let lo = 0, hi = angle.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (angle[mid] <= a) lo = mid; else hi = mid; }
    const span = angle[hi] - angle[lo] || 1;
    return s[lo] + ((a - angle[lo]) / span) * (s[hi] - s[lo]);
  }

  function pointAtS(v) {
    const { s, pts, length } = track;
    v = ((v % length) + length) % length;
    let lo = 0, hi = s.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid] <= v) lo = mid; else hi = mid; }
    const k = (v - s[lo]) / (s[hi] - s[lo] || 1);
    return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * k, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * k];
  }

  /// Pushes icons apart along the edge until none are closer than `gap`.
  function spread(items, gap) {
    const L = track.length;
    items.sort((a, b) => a.s - b.s);
    for (let pass = 0; pass < 12; pass++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        const a = items[i];
        const b = items[(i + 1) % items.length];
        if (a === b) break;
        let d = b.s - a.s;
        if (i === items.length - 1) d += L;
        if (d < gap) {
          const push = (gap - d) / 2;
          a.s -= push;
          b.s += push;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  // Ticks every 10°, heavier every 30°, and the compass letters, on a line just outside the icons.
  const ticksPath = bezel.querySelector('.ticks');
  const letters = [...bezel.querySelectorAll('text')];

  function drawBezel() {
    bezel.setAttribute('viewBox', `0 0 ${track.w} ${track.h}`);
  }

  function bezelFrame(h) {
    const out = track.narrow ? 13 : 20;
    let d = '';
    for (let b = 0; b < 360; b += 10) {
      const rel = norm(b - h);
      const [x, y] = pointAtS(sAtAngle(rel));
      const ux = (x - track.cx), uy = (y - track.cy);
      const len = Math.hypot(ux, uy) || 1;
      // Outward along the perimeter normal, approximated by the ray from the centre.
      const nx = ux / len, ny = uy / len;
      const major = b % 30 === 0;
      if (b % 90 === 0) continue;
      const r0 = out - (major ? 6 : 3), r1 = out;
      d += `M${(x + nx * r0).toFixed(1)} ${(y + ny * r0).toFixed(1)}L${(x + nx * r1).toFixed(1)} ${(y + ny * r1).toFixed(1)}`;
    }
    ticksPath.setAttribute('d', d);
    letters.forEach((t) => {
      const b = +t.dataset.bearing;
      const [x, y] = pointAtS(sAtAngle(norm(b - h)));
      const ux = x - track.cx, uy = y - track.cy;
      const len = Math.hypot(ux, uy) || 1;
      t.setAttribute('x', (x + (ux / len) * (out - 3)).toFixed(1));
      t.setAttribute('y', (y + (uy / len) * (out - 3)).toFixed(1));
    });
  }

  // ---------------------------------------------------------------------------------------
  // Blips

  function element(p) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'blip';
    button.innerHTML = `<svg class="glyph" viewBox="0 0 64 64"><use href="#g-${p.glyph}"/></svg><span class="mi"></span>`;
    button.addEventListener('click', () => {
      const plane = traffic.find((t) => t.el === button);
      if (plane) focus(plane.ident);
    });
    edge.appendChild(button);
    return button;
  }

  traffic.forEach((p) => { p.el = element(p); p.el.dataset.tag = p.tag || ''; });

  const compass = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const cardinal = (b) => compass[Math.round(b / 45) % 8];
  const milesText = (d) => (d < 0.95 ? '<1' : String(Math.round(d)));
  const milesSpoken = (d) => (d < 0.95 ? 'under a mile' : Math.round(d) === 1 ? '1 mile' : `${Math.round(d)} miles`);

  function layout(now) {
    if (!track) buildTrack();
    const h = heading(now);
    const inRange = traffic.filter((p) => distance(p) <= RADIUS);
    const gap = track.narrow ? 30 : 38;
    const items = inRange.map((p) => ({ p, s: sAtAngle(norm(bearingOf(p) - h)) }));
    if (items.length) spread(items, gap);
    const labelOffset = track.narrow ? 22 : 28;

    for (const p of traffic) p.el.hidden = !inRange.includes(p);
    for (const { p, s } of items) {
      const [x, y] = pointAtS(s);
      const ux = track.cx - x, uy = track.cy - y;
      const len = Math.hypot(ux, uy) || 1;
      p.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      p.el.querySelector('.glyph').style.transform = `rotate(${norm(p.track - h).toFixed(1)}deg)`;
      const mi = p.el.querySelector('.mi');
      mi.style.transform = `translate(${((ux / len) * labelOffset).toFixed(1)}px, ${((uy / len) * labelOffset).toFixed(1)}px)`;
      p.el.classList.toggle('is-focus', p.ident === focusIdent);
    }
    bezelFrame(h);
    return h;
  }

  // Labels and accessible names change once a second, like the app's tick.
  function labels() {
    const inRange = traffic.filter((p) => distance(p) <= RADIUS);
    for (const p of inRange) {
      const d = distance(p);
      const mi = p.el.querySelector('.mi');
      const text = milesText(d);
      if (mi.textContent !== text) mi.textContent = text;
      p.el.setAttribute('aria-label', `${p.ident}, ${p.operator}, ${milesSpoken(d)} ${cardinal(bearingOf(p))}. Bring to the center.`);
    }
  }

  // ---------------------------------------------------------------------------------------
  // The flight in the center

  const q = (sel) => flightEl.querySelector(sel);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  let shownIdent = null;

  function renderFlight(animate) {
    const f = focused();
    if (!f) return;
    const changed = f.ident !== shownIdent;
    const apply = () => {
      const d = distance(f);
      q('[data-f=operator]').textContent = f.operator;
      q('[data-f=ident]').textContent = f.ident;
      const route = q('.flight-route');
      route.hidden = !f.from;
      if (f.from) {
        q('[data-f=from]').textContent = f.from;
        q('[data-f=fromCity]').textContent = f.fromCity;
        q('[data-f=to]').textContent = f.to;
        q('[data-f=toCity]').textContent = f.toCity;
      }
      q('[data-f=type]').textContent = f.type;
      q('[data-f=typeName]').textContent = f.typeName;
      const badge = q('[data-f=badge]');
      badge.hidden = !f.tag;
      if (f.tag) { badge.textContent = BADGES[f.tag](f); badge.dataset.tag = f.tag; }
      q('[data-f=feet]').textContent = fmt(Math.round(f.feet / 25) * 25);
      const trend = q('[data-f=trend]');
      trend.dataset.trend = f.fpm > 300 ? 'up' : f.fpm < -300 ? 'down' : '';
      q('[data-f=kts]').textContent = fmt(f.kts);
      q('[data-f=miles]').textContent = milesText(d);
      flightEl.setAttribute('aria-label', `${f.operator} ${f.ident}${f.from ? `, ${f.fromCity} to ${f.toCity}` : ''}, ${f.typeName}, ${fmt(f.feet)} feet, ${milesSpoken(d)} ${cardinal(bearingOf(f))}`);
      shownIdent = f.ident;
    };
    if (changed && animate && !reduceMotion.matches) {
      flightEl.classList.add('is-swapping');
      setTimeout(() => { apply(); flightEl.classList.remove('is-swapping'); }, 180);
    } else {
      apply();
    }
  }

  // The distance arrow points at the aircraft, relative to the top of the screen.
  function pointArrow(h) {
    const f = traffic.find((p) => p.ident === focusIdent);
    if (!f) return;
    q('[data-f=pointer]').style.transform = `rotate(${norm(bearingOf(f) - h).toFixed(1)}deg)`;
  }

  // ---------------------------------------------------------------------------------------

  let last = performance.now();
  let lastTick = 0;
  let visible = true;

  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(hero);

  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000) * TIME_SCALE;
    last = now;
    if (visible && !document.hidden) {
      step(dt);
      const h = layout(now);
      pointArrow(h);
      if (now - lastTick > 1000) {
        lastTick = now;
        labels();
        renderFlight(true);
      }
    }
    requestAnimationFrame(frame);
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { track = null; }, 100);
  });
  if (document.fonts) document.fonts.ready.then(() => { track = null; });

  hero.classList.add('is-live');
  labels();
  renderFlight(false);
  requestAnimationFrame(frame);
})();
