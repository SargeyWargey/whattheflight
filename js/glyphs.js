// Top-down aircraft silhouettes, ported from the app's AircraftGlyph.swift. Each sits on a
// 64 × 64 grid with the nose up. Wings, tailplanes and engines are half outlines mirrored down
// the centre line; propeller discs and rotors are a translucent layer.
//
// Adds an <svg> of <symbol id="g-<name>"> to the page, used as <svg><use href="#g-airliner"/></svg>.

(function () {
  'use strict';

  const C = 32;
  const m = (x) => 64 - x;
  const f = (n) => +n.toFixed(2);

  function Drawing() {
    this.solid = [];
    this.translucent = [];
  }

  Drawing.prototype.fuselage = function (n, t, w, l, tw, taper, sharp) {
    const d = [`M${C} ${n}`];
    if (sharp) d.push(`C${f(C + w * 0.15)} ${f(n + l * 0.35)} ${f(C + w * 0.9)} ${f(n + l * 0.75)} ${f(C + w)} ${f(n + l)}`);
    else d.push(`C${f(C + w * 0.55)} ${n} ${f(C + w)} ${f(n + l * 0.45)} ${f(C + w)} ${f(n + l)}`);
    d.push(`L${f(C + w)} ${taper}L${f(C + tw)} ${t}L${f(C - tw)} ${t}L${f(C - w)} ${taper}L${f(C - w)} ${f(n + l)}`);
    if (sharp) d.push(`C${f(C - w * 0.9)} ${f(n + l * 0.75)} ${f(C - w * 0.15)} ${f(n + l * 0.35)} ${C} ${n}`);
    else d.push(`C${f(C - w)} ${f(n + l * 0.45)} ${f(C - w * 0.55)} ${n} ${C} ${n}`);
    this.solid.push(`<path d="${d.join('')}Z"/>`);
  };

  Drawing.prototype.mirrored = function (right) {
    const pts = right.concat(right.slice().reverse().map(([x, y]) => [m(x), y]));
    this.solid.push(`<path d="M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z"/>`);
  };

  Drawing.prototype.pods = function (x, top, bottom, width) {
    for (const cx of [x, m(x)]) {
      this.solid.push(`<rect x="${f(cx - width / 2)}" y="${top}" width="${width}" height="${f(bottom - top)}" rx="${f(width / 2)}"/>`);
    }
  };

  Drawing.prototype.blocks = function (x, y, width, height) {
    for (const left of [x, m(x + width)]) {
      this.solid.push(`<rect x="${f(left)}" y="${y}" width="${width}" height="${height}" rx="0.6"/>`);
    }
  };

  Drawing.prototype.propeller = function (x, y, r) {
    for (const cx of x === C ? [x] : [x, m(x)]) {
      this.translucent.push(`<circle cx="${f(cx)}" cy="${y}" r="${r}"/>`);
      this.solid.push(`<rect x="${f(cx - r)}" y="${f(y - 0.9)}" width="${2 * r}" height="1.8" rx="0.9"/>`);
      this.solid.push(`<circle cx="${f(cx)}" cy="${y}" r="1.9"/>`);
    }
  };

  const SHAPES = {
    airliner(d) {
      d.fuselage(5, 60, 3.6, 7, 1.2, 46);
      d.mirrored([[32.5, 25], [57, 37.5], [57.5, 40.5], [32.5, 36]]);
      d.pods(42.5, 25.5, 33, 4.6);
      d.mirrored([[32.5, 51], [43, 56.5], [43.3, 59], [32.5, 57]]);
    },
    widebody(d) {
      d.fuselage(3, 61, 4.6, 8, 1.4, 46);
      d.mirrored([[32.5, 22], [61.5, 39], [62, 42.5], [32.5, 37]]);
      d.pods(44, 22.5, 33, 6.2);
      d.mirrored([[32.5, 50.5], [46, 57], [46.3, 60], [32.5, 57]]);
    },
    fourEngine(d) {
      d.fuselage(2.5, 61.5, 5, 9, 1.5, 47);
      d.mirrored([[32.5, 21], [62, 40.5], [62.5, 44], [32.5, 37]]);
      d.pods(41.5, 22.5, 31, 4.8);
      d.pods(52, 29, 37, 4.4);
      d.mirrored([[32.5, 50.5], [47, 57.5], [47.3, 60.5], [32.5, 57]]);
    },
    regional(d) {
      d.fuselage(6, 59, 3.2, 6.5, 1.1, 47);
      d.mirrored([[32.5, 28], [54, 38], [54.5, 41], [32.5, 37]]);
      d.blocks(34.5, 46, 2.6, 2.5);
      d.pods(38.3, 43, 51.5, 4.4);
      d.mirrored([[32.5, 53.5], [42, 56.5], [42.2, 59], [32.5, 59]]);
    },
    bizjet(d) {
      d.fuselage(7, 57, 2.8, 6.5, 1, 46);
      d.mirrored([[32.5, 30], [51.5, 40], [52.5, 43.5], [32.5, 38.5]]);
      d.blocks(34, 44.5, 2.2, 2);
      d.pods(37.6, 41.5, 49, 4);
      d.mirrored([[32.5, 51], [40.5, 54.5], [40.8, 57], [32.5, 56.5]]);
    },
    twinProp(d) {
      d.fuselage(6, 59, 3.3, 6, 1.1, 46);
      d.mirrored([[32.5, 27], [61, 28.2], [61, 32.5], [32.5, 34]]);
      d.pods(42, 22, 35, 4.2);
      d.propeller(42, 22, 7.5);
      d.mirrored([[32.5, 51.5], [44, 52], [44, 56], [32.5, 56.5]]);
    },
    light(d) {
      d.fuselage(9, 58, 3.8, 4, 0.9, 30);
      d.mirrored([[32.5, 21], [61, 21.3], [61, 28.5], [32.5, 28.5]]);
      d.propeller(32, 8.5, 8);
      d.mirrored([[32.5, 49.5], [42.5, 49.8], [42.5, 55], [32.5, 55.5]]);
    },
    fighter(d) {
      d.fuselage(2, 60, 3.6, 15, 2.4, 54, true);
      d.mirrored([[33, 14], [37.5, 27], [37.5, 33], [32.5, 33]]);
      d.mirrored([[34, 27], [56, 42], [56, 46.5], [34, 46.5]]);
      d.mirrored([[34, 50], [45, 57], [45, 60.5], [34, 60]]);
    },
    militaryTransport(d) {
      d.fuselage(4, 59, 5.6, 7, 1.6, 45);
      d.mirrored([[32.5, 24], [62, 32], [62, 35.5], [32.5, 34.5]]);
      d.pods(42, 19.5, 29, 4.6);
      d.pods(52.5, 22.5, 31.5, 4.2);
      d.mirrored([[32.5, 52.5], [47, 54], [47, 57.5], [32.5, 59]]);
    },
    helicopter(d) {
      for (const angle of [45, -45]) {
        d.translucent.push(`<rect x="3" y="25.3" width="58" height="3.4" rx="1.7" transform="rotate(${angle} 32 27)"/>`);
      }
      d.solid.push('<path d="M30.2 36L33.8 36L33 57L31 57Z"/>');
      d.solid.push('<rect x="25" y="49" width="14" height="3" rx="1.2"/>');
      d.solid.push('<rect x="33.6" y="52.5" width="2.6" height="9" rx="1"/>');
      d.solid.push('<ellipse cx="32" cy="27" rx="6.5" ry="11"/>');
    },
  };

  const symbols = Object.entries(SHAPES).map(([name, draw]) => {
    const d = new Drawing();
    draw(d);
    const rotor = name === 'helicopter';
    const translucent = d.translucent.length
      ? `<g class="${rotor ? 'rotor' : 'prop'}" opacity="${rotor ? 0.55 : 0.34}">${d.translucent.join('')}</g>`
      : '';
    return `<symbol id="g-${name}" viewBox="0 0 64 64">${translucent}<g>${d.solid.join('')}</g></symbol>`;
  });

  const holder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  holder.setAttribute('aria-hidden', 'true');
  holder.setAttribute('width', '0');
  holder.setAttribute('height', '0');
  holder.style.position = 'absolute';
  holder.innerHTML = `<defs>${symbols.join('')}</defs>`;
  document.body.prepend(holder);
})();
