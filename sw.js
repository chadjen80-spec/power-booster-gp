// Service worker: makes the game installable and lets solo races run offline.
// Game files are fetched fresh when online; bump VERSION when the CORE list changes.
const VERSION = 'pb-v6';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.147.0/';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/config.js', 'js/fx.js', 'js/optimize.js', 'js/audio.js', 'js/net.js', 'js/chibi.js', 'js/shop.js', 'js/pass.js', 'js/pay.js', 'js/track.js', 'js/game.js', 'js/touch.js', 'js/pwa.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png',
  CDN + 'build/three.min.js',
  CDN + 'examples/js/shaders/CopyShader.js',
  CDN + 'examples/js/shaders/LuminosityHighPassShader.js',
  CDN + 'examples/js/postprocessing/EffectComposer.js',
  CDN + 'examples/js/postprocessing/RenderPass.js',
  CDN + 'examples/js/postprocessing/ShaderPass.js',
  CDN + 'examples/js/postprocessing/MaskPass.js',
  CDN + 'examples/js/postprocessing/UnrealBloomPass.js',
  CDN + 'examples/js/utils/BufferGeometryUtils.js',
  CDN + 'examples/js/loaders/GLTFLoader.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const cdn = url.href.startsWith(CDN);
  if (!sameOrigin && !fonts && !cdn) return;
  if (sameOrigin && url.pathname.startsWith('/api/')) return;   // purchases and accounts: always live, never cached

  if (cdn || url.hostname === 'fonts.gstatic.com') {
    // versioned libraries and font files never change: cache first
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') caches.open(VERSION).then(c => c.put(req, res.clone()));
      return res;
    })));
    return;
  }
  // game files and font CSS: network first so edits show up right away; the cache is the offline fallback
  e.respondWith(fetch(req).then(res => {
    if (res.ok) caches.open(VERSION).then(c => c.put(req, res.clone()));
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: sameOrigin }).then(hit => hit || caches.match('index.html'))));
});
