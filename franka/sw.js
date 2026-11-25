/* Franka — network-first service worker for offline use. */
var CACHE = "ejz-franka-v10";
var ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/franka.js",
  "./assets/franka.css",
  "./assets/franka-atlas.json",
  "./assets/franka-sprites.webp",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-192-maskable.png",
  "./assets/icon-512-maskable.png",
  "./assets/apple-touch-icon.png",
  "../assets/engine.js",
  "../assets/style.css"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k.indexOf("ejz-franka-") === 0; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* Netwerk eerst (zodat updates direct binnenkomen), cache als je offline bent. */
self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (cached) {
        if (cached) return cached;
        if (req.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      });
    })
  );
});
