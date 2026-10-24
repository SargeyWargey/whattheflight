// Day / night toggle and the Apple TV view switcher.

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

  const tv = document.querySelector('[data-tv-screen]');
  const tabs = [...document.querySelectorAll('.tv-views [role=tab]')];
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = tabs[(i + step + tabs.length) % tabs.length];
      next.focus();
      select(next);
    });
    tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
  });

  function select(tab) {
    if (!tv || tab.getAttribute('aria-selected') === 'true') return;
    tabs.forEach((t) => { t.setAttribute('aria-selected', String(t === tab)); t.tabIndex = t === tab ? 0 : -1; });
    tv.classList.add('is-swapping');
    const next = new Image();
    next.onload = next.onerror = () => {
      tv.src = tab.dataset.src;
      tv.alt = tab.dataset.alt;
      requestAnimationFrame(() => tv.classList.remove('is-swapping'));
    };
    next.src = tab.dataset.src;
  }
})();
