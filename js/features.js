// The Lock Screen in the alerts section: the Sky Watch Live Activity counts down to the closest
// pass, as Text(timerInterval:) does in the app, and starts over once it reaches it. It only runs
// while it's on screen, and not at all with Reduce Motion.

(function () {
  'use strict';

  const clocks = [...document.querySelectorAll('[data-countdown]')];
  if (!clocks.length) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const START = 102;
  let left = START;
  let timer = 0;
  let visible = false;

  const format = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  function tick() {
    left = left > 0 ? left - 1 : START;
    clocks.forEach((el) => { el.textContent = format(left); });
  }

  function update() {
    const run = visible && !reduceMotion.matches && !document.hidden;
    if (run && !timer) timer = setInterval(tick, 1000);
    if (!run && timer) { clearInterval(timer); timer = 0; }
  }

  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; update(); })
    .observe(clocks[0].closest('figure') || clocks[0]);
  document.addEventListener('visibilitychange', update);
  reduceMotion.addEventListener('change', update);
})();
