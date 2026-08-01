<!doctype html>
<html lang="es-CO">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#fffbeb" />
    <title>Mi Gallinero</title>
    {{-- Sin fuentes de CDN: en una PWA offline no cargan, y además envían la
         IP del usuario a un tercero. Usamos la pila de fuentes del sistema
         (definida en app.css), que se ve nativa y no cuesta ninguna descarga. --}}
    @vite(['resources/css/app.css', 'resources/js/main.ts'])
    {{-- PWA: manifest + service worker registration --}}
    <link rel="manifest" href="/manifest.webmanifest" />
    {{-- `mobile-web-app-capable` es el estándar; el prefijo apple- está obsoleto
         pero se mantiene para iOS antiguos. --}}
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Mi Gallinero" />
    {{-- El nonce lo genera SecurityHeaders y lo exige la CSP: sin él, este
         script en línea queda bloqueado por `script-src 'self'`. --}}
    <script nonce="{{ Illuminate\Support\Facades\Vite::cspNonce() }}">
      // El SW se sirve desde la raíz (copy-sw.php lo mueve ahí tras el build)
      // para tener scope '/'. Sólo en producción: en desarrollo el service
      // worker sirve módulos cacheados y provoca depuraciones fantasma.
      if ('serviceWorker' in navigator && @json(app()->isProduction())) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .catch(err => console.warn('No se pudo registrar el service worker:', err));
        });
      }
    </script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>