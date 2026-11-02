// PWA: register the service worker and offer an "install as app" button where the browser supports it
(function () {
  // service workers only run on HTTPS or localhost
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(e => console.warn('service worker not registered', e));
    });
  }

  const btn = document.getElementById('btn-install');
  let deferred = null;
  // Chrome / Edge / Android: the browser hands us the install prompt to show from our own button
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    btn.classList.remove('hidden');
  });
  btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    btn.classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => btn.classList.add('hidden'));

  // iPhone/iPad Safari has no install prompt: show a hint for "Share > Add to Home Screen" instead
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  if (ios && !standalone) {
    btn.textContent = '📲 ติดตั้ง: กด แชร์ → เพิ่มไปยังหน้าจอโฮม';
    btn.classList.remove('hidden');
    btn.addEventListener('click', () => btn.classList.add('hidden'));
  }
})();
