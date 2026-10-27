// Day / night toggle and the picture switchers.

(function () {
  'use strict';

  // Every page opens at night (data-theme="dark" on <html>); day only for the rest of a visit
  // once someone switches.
  const root = document.documentElement;
  try { localStorage.removeItem('wtf.theme'); } catch (e) { /* the old per-browser choice */ }
  const isNight = () => root.dataset.theme !== 'light';
  const themeColor = document.querySelector('meta[name="theme-color"]');

  const toggle = document.querySelector('[data-theme-toggle]');
  function label() {
    if (!toggle) return;
    toggle.setAttribute('aria-label', isNight() ? 'Switch to the day radar' : 'Switch to the night radar');
    toggle.dataset.night = isNight() ? 'true' : 'false';
    if (themeColor) themeColor.content = isNight() ? '#0A0E14' : '#E9E7E2';
  }
  if (toggle) {
    toggle.addEventListener('click', () => {
      root.dataset.theme = isNight() ? 'light' : 'dark';
      try {
        if (root.dataset.theme === 'light') sessionStorage.setItem('wtf.theme', 'light');
        else sessionStorage.removeItem('wtf.theme');
      } catch (e) { /* private mode: the choice lasts until reload */ }
      label();
      window.dispatchEvent(new Event('wtf:theme'));
    });
    label();
  }

  // Screenshots with a day and a night version show the one that matches the page:
  // <img src="…-dark" data-src-light="…" data-src-dark="…">, with data-alt-light / data-alt-dark
  // when the two pictures differ. The HTML names the night one, which is how every page opens,
  // and they're lazy, so a visitor only fetches the look they see.
  const themed = [...document.querySelectorAll('img[data-src-light][data-src-dark]')];
  function showThemed() {
    const look = isNight() ? 'Dark' : 'Light';
    themed.forEach((img) => {
      const src = img.dataset[`src${look}`];
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      const alt = img.dataset[`alt${look}`];
      if (alt) img.alt = alt;
    });
  }
  showThemed();
  window.addEventListener('wtf:theme', showThemed);

  // Picture switchers (the logbook pages, the Apple TV views): tabs under one screen. A tab
  // with data-src-dark shows that picture in the night look.
  //
  // They move on by themselves: the chosen pill fills over DWELL and, when full, the next tab
  // takes over. It holds while the switcher is off screen, the browser tab is hidden, or the
  // pointer or keyboard focus is on the screen or the tabs, and stops for good once someone picks
  // a tab. Not at all with Reduce Motion. Every tab's picture is fetched as the switcher comes
  // near, so a change never waits on the network.
  const DWELL = 6000;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  document.querySelectorAll('[data-switcher]').forEach((group) => {
    const caption = group.querySelector('[data-switcher-caption]');
    const tabs = [...group.querySelectorAll('[role=tab]')];
    const screen = group.querySelector('[data-switcher-screen]');
    if (!screen || !tabs.length) return;
    const srcOf = (tab) => (isNight() && tab.dataset.srcDark) || tab.dataset.src;
    const selected = () => tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];

    // The picture is the tabs' one panel: each tab names it, and it's labelled by the chosen tab.
    const panel = screen.closest('figure') || screen;
    if (!panel.id) panel.id = `switcher-${document.querySelectorAll('[role=tabpanel]').length + 1}`;
    panel.setAttribute('role', 'tabpanel');
    panel.tabIndex = 0;
    tabs.forEach((t, i) => {
      if (!t.id) t.id = `${panel.id}-tab-${i + 1}`;
      t.setAttribute('aria-controls', panel.id);
    });

    function show(tab) {
      tabs.forEach((t) => { t.setAttribute('aria-selected', String(t === tab)); t.tabIndex = t === tab ? 0 : -1; });
      panel.setAttribute('aria-labelledby', tab.id);
      if (caption && tab.dataset.caption) caption.textContent = tab.dataset.caption;
      const src = srcOf(tab);
      if (screen.getAttribute('src') === src) {
        screen.alt = tab.dataset.alt || screen.alt;
        return;
      }
      screen.classList.add('is-swapping');
      const next = new Image();
      next.onload = next.onerror = () => {
        screen.src = src;
        screen.alt = tab.dataset.alt || '';
        requestAnimationFrame(() => screen.classList.remove('is-swapping'));
      };
      next.src = src;
    }

    let near = false;
    const preload = () => tabs.forEach((t) => { new Image().src = srcOf(t); });
    new IntersectionObserver((entries) => {
      if (near || !entries[0].isIntersecting) return;
      near = true;
      preload();
    }, { rootMargin: '600px 0px' }).observe(screen);

    function followTheme() {
      if (near) preload();
      show(selected());
    }
    window.addEventListener('wtf:theme', followTheme);

    let playing = !reduceMotion.matches;
    const holds = new Set(['offscreen']);
    function update() {
      group.classList.toggle('is-playing', playing);
      group.classList.toggle('is-paused', holds.size > 0 || document.hidden);
    }
    function hold(reason, on) {
      if (on) holds.add(reason); else holds.delete(reason);
      update();
    }
    function stop() {
      if (!playing) return;
      playing = false;
      // Changes are only announced once they're the visitor's own.
      if (caption) caption.setAttribute('aria-live', 'polite');
      update();
    }
    if (playing && caption) caption.setAttribute('aria-live', 'off');
    group.style.setProperty('--dwell', `${DWELL}ms`);

    tabs.forEach((tab, i) => {
      const bar = document.createElement('i');
      bar.className = 'tab-progress';
      bar.setAttribute('aria-hidden', 'true');
      bar.append(document.createElement('b'));
      tab.append(bar);
      bar.addEventListener('animationend', () => {
        if (playing && tab === selected()) show(tabs[(i + 1) % tabs.length]);
      });

      tab.addEventListener('click', () => { stop(); show(tab); });
      tab.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        const jump = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
        if (!step && jump < 0) return;
        e.preventDefault();
        stop();
        const next = jump >= 0 ? tabs[jump] : tabs[(i + step + tabs.length) % tabs.length];
        next.focus();
        show(next);
      });
    });

    const tablist = tabs[0].parentElement;
    [screen.closest('figure') || screen, tablist].forEach((el) => {
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hold(`hover-${el.tagName}`, true); });
      el.addEventListener('pointerleave', () => hold(`hover-${el.tagName}`, false));
    });
    tablist.addEventListener('focusin', () => hold('focus', true));
    tablist.addEventListener('focusout', (e) => { if (!tablist.contains(e.relatedTarget)) hold('focus', false); });
    new IntersectionObserver((entries) => hold('offscreen', !entries[0].isIntersecting), { threshold: 0.5 }).observe(screen);
    document.addEventListener('visibilitychange', update);
    reduceMotion.addEventListener('change', () => { if (reduceMotion.matches) stop(); });

    update();
    followTheme();
  });
})();
