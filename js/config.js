// Settings for the Android app build (Capacitor). The web version doesn't need these.
(function () {
  const PB = window.PB = window.PB || {};
  PB.CONFIG = {
    // Online server the Android app connects to, e.g. 'power-booster-gp.onrender.com'.
    // Leave empty to type it in the "เซิร์ฟเวอร์" box on the online screen instead.
    server: '',
  };
  // true inside the installed Android app
  PB.isApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
})();
