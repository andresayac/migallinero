<!doctype html>
<html lang="es-CO">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#16a34a" />
    <title>Mi Gallinero</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
    @vite(['resources/css/app.css', 'resources/js/main.ts'])
    {{-- PWA: manifest + service worker registration --}}
    <link rel="manifest" href="/build/manifest.webmanifest" />
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js')
            .catch(err => console.warn('SW registration failed:', err));
        });
      }
    </script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>