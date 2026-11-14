/* 主题：跟随系统 / 浅色 / 深色。必须在 <head> 里同步加载，避免闪屏。 */
(function () {
  var KEY = 'pf-theme';
  var root = document.documentElement;

  function read() {
    try {
      return localStorage.getItem(KEY) || 'auto';
    } catch (e) {
      return 'auto';
    }
  }

  function apply(mode) {
    if (mode === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
  }

  var mode = read();
  apply(mode);

  var MODES = ['auto', 'light', 'dark'];
  var LABEL = { auto: '跟随系统', light: '浅色', dark: '深色' };

  window.__pfTheme = {
    get: function () { return mode; },
    label: function () { return LABEL[mode]; },
    cycle: function () {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      try { localStorage.setItem(KEY, mode); } catch (e) {}
      apply(mode);
      return mode;
    }
  };
})();
