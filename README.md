# 🐔 Mi Gallinero

PWA **offline-first** para administrar granjas avícolas en Colombia.
Pensada para que un adulto mayor registre en segundos la producción de huevos,
muertes de gallinas, vacunas, ventas, clientes y pagos.

La app se distribuye a **muchas personas**; **cada quien crea y configura SU propia
granja** (1 usuario ↔ 1 granja en el MVP). Cada granja queda **aislada** por `farm_id`.
La arquitectura ya está preparada para el caso avanzado de una **empresa con varios
galpones y empleados asignados** (multi-granja con roles).

## 📦 Estructura del proyecto

```
migallinero/
├── app/                    ← Laravel (models, controllers, middleware)
├── database/migrations/    ← Schema multi-tenant
├── docs/                    ← Documentación del proyecto
├── public/                 ← Assets compilados (build/) + SW
├── resources/
│   ├── css/app.css          ← Tailwind 3 + estilos Mi Gallinero
│   ├── js/                  ← App Vue 3 (componentes, stores, views…)
│   └── views/app.blade.php  ← Entry point SPA
├── routes/
│   ├── api.php              ← REST API (Sanctum + multi-tenant)
│   └── web.php              ← Catch-all SPA
├── .env
├── artisan
├── composer.json
├── package.json             ← Deps JS (Vue, Vite, Pinia, Dexie, Chart.js…)
├── vite.config.ts           ← Vite 7 + Vue + PWA + Laravel plugin
├── tailwind.config.js       ← Tailwind 3
├── tsconfig.json            ← TypeScript con @/* alias
└── copy-sw.php              ← Copia SW a public/ tras build
```

## 🚀 Inicio rápido

### Requisitos
- PHP 8.3+ y Composer 2
- Node 20+ y pnpm 11+
- MySQL 8 (Laragon lo trae)

### Instalación

```bash
composer install
pnpm install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
pnpm build
```

### Arrancar

```bash
php artisan serve --port=8000
```

La app completa (API + SPA + PWA) está en **http://localhost:8000**

### Desarrollo con hot-reload

```bash
# Terminal 1: backend
php artisan serve --port=8000

# Terminal 2: Vite dev server (hot-reload)
pnpm dev
```

## 🧭 Documentación

- [`docs/01-resumen.md`](docs/01-resumen.md) — Resumen funcional del proyecto.
- [`docs/04-base-de-datos.md`](docs/04-base-de-datos.md) — Modelo de datos.
- [`docs/06-arquitectura.md`](docs/06-arquitectura.md) — Arquitectura técnica.
- [`docs/07-offline.md`](docs/07-offline.md) — Estrategia offline-first.
- [`docs/08-ux-adulto-mayor.md`](docs/08-ux-adulto-mayor.md) — Propuesta de interfaz.

## 📜 Licencia

Privado — Uso interno del negocio.