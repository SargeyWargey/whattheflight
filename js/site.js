// Day / night toggle and the Apple TV view switcher.

(function () {
  'use strict';

  const root = document.documentElement;
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const isNight = () => root.dataset.theme ? root.dataset.theme === 'dark' : darkQuery.matches;

  const toggle = document.querySelector('[data-theme-toggle]');
  function label() {
    if (!toggle) return;
    toggle.setAttribute('aria-label', isNight() ? 'Switch to the day radar' : 'Switch to the night radar');
    toggle.dataset.night = isNight() ? 'true' : 'false';
  }
  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = isNight() ? 'light' : 'dark';
      // Back to following the system when the choice matches it.
      if ((next === 'dark') === darkQuery.matches) delete root.dataset.theme;
      else root.dataset.theme = next;
      try {
        if (root.dataset.theme) localStorage.setItem('wtf.theme', root.dataset.theme);
        else localStorage.removeItem('wtf.theme');
      } catch (e) { /* private mode: the choice lasts until reload */ }
      label();
      window.dispatchEvent(new Event('wtf:theme'));
    });
    darkQuery.addEventListener('change', label);
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
