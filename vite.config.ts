import { defineConfig } from 'vite'
import laravel from 'laravel-vite-plugin'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    laravel({
      input: ['resources/css/app.css', 'resources/js/main.ts'],
      refresh: true,
    }),
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        id: '/',
        name: 'Mi Gallinero',
        short_name: 'Gallinero',
        description:
          'Lleva el registro sencillo de tu granja avícola: huevos, gallinas, ventas y más.',
        theme_color: '#fffbeb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'es-CO',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Laravel sirve la SPA desde una vista Blade, así que NO existe ningún
        // `index.html` en el precache: apuntar el fallback ahí dejaba la
        // navegación offline sin funcionar al recargar una ruta directa.
        // En su lugar cacheamos el documento en tiempo de ejecución.
        navigateFallback: null,
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // El HTML de la app: red primero, cache como respaldo offline.
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mg-documentos',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Las respuestas de la API nunca se sirven de caché: los datos
            // offline viven en IndexedDB, que es la fuente de verdad local.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
      // En desarrollo el service worker sólo estorba: sirve versiones cacheadas
      // de los módulos y provoca depuraciones fantasma.
      devOptions: {
        enabled: false,
      },
      injectRegister: false, // Lo inyectamos manualmente en app.blade.php
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./resources/js', import.meta.url)),
    },
  },
  test: {
    // Las pruebas del frontend cubren la lógica que no se puede verificar
    // mirando la interfaz: la calculadora del teclado numérico, el formateo de
    // fechas por zona horaria y los cálculos de dinero.
    environment: 'jsdom',
    include: ['resources/js/**/*.test.ts'],
    restoreMocks: true,
  },
})