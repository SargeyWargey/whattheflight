// Day / night toggle and the picture switchers.

(function () {
  'use strict';

  // Night by default (set in each page's <head>); day once someone switches.
  const root = document.documentElement;
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
        if (root.dataset.theme === 'light') localStorage.setItem('wtf.theme', 'light');
        else localStorage.removeItem('wtf.theme');
      } catch (e) { /* private mode: the choice lasts until reload */ }
      label();
      window.dispatchEvent(new Event('wtf:theme'));
    });
    label();
  }

  // Picture switchers (the logbook pages, the Apple TV views): tabs under one screen. A tab
  // with data-src-dark shows that picture in the night look.
  document.querySelectorAll('[data-switcher]').forEach((group) => {
    const screen = group.querySelector('[data-switcher-screen]');
    const caption = group.querySelector('[data-switcher-caption]');
    const tabs = [...group.querySelectorAll('[role=tab]')];
    if (!screen || !tabs.length) return;
    const srcOf = (tab) => (isNight() && tab.dataset.srcDark) || tab.dataset.src;
    const selected = () => tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];

    function show(tab) {
      tabs.forEach((t) => { t.setAttribute('aria-selected', String(t === tab)); t.tabIndex = t === tab ? 0 : -1; });
      if (caption && tab.dataset.caption) caption.textContent = tab.dataset.caption;
      const src = srcOf(tab);
      if (screen.getAttribute('src') === src) return;
      screen.classList.add('is-swapping');
      const next = new Image();
      next.onload = next.onerror = () => {
        screen.src = src;
        screen.alt = tab.dataset.alt || '';
        requestAnimationFrame(() => screen.classList.remove('is-swapping'));
      };
      next.src = src;
    }

    function followTheme() {
      tabs.forEach((t) => {
        const thumb = t.querySelector('img');
        if (thumb && t.dataset.srcDark && thumb.getAttribute('src') !== srcOf(t)) thumb.src = srcOf(t);
      });
      show(selected());
    }
    window.addEventListener('wtf:theme', followTheme);

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => show(tab));
      tab.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = tabs[(i + step + tabs.length) % tabs.length];
        next.focus();
        show(next);
      });
    });

    followTheme();
  });
})();
