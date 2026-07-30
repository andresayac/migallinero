# 06 — Arquitectura técnica (multi-tenant)

## Visión general

```
┌─────────────────────────────────────────────────────────────────┐
│                  PWA  (Vue 3 + Vite + TS)                        │
│                                                                  │
│   ┌────────────┐  ┌────────────┐  ┌──────────────────────────┐  │
│   │  Router    │  │   Pinia    │  │  Dexie (offline-first)   │  │
│   │            │  │  farms     │  │  todas las tablas tienen │  │
│   │  /farms/   │  │  auth      │  │  farm_id como índice     │  │
│   │  /:farmId/ │  │  active    │  │                          │  │
│   │  /home     │  │  farm      │  │  sync_queue (con farm_id)│  │
│   └─────┬──────┘  └─────┬──────┘  └────────────┬─────────────┘  │
│         └────────────────┴─────────────────────┘                │
│                            │                                    │
│              ┌─────────────▼──────────────┐                     │
│              │  Axios interceptor         │                     │
│              │  Header: X-Farm-Id         │                     │
│              │  (granja activa)           │                     │
│              └─────────────┬──────────────┘                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │ HTTPS (REST/JSON)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│          Laravel 13 (API + Scheduler + Queue)                    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Middleware: EnsureFarmBelongsToUser + ResolveActiveFarm  │  │
│  │  → lee X-Farm-Id, valida acceso, setea contexto global    │  │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Modelos con trait BelongsToFarm → global scope por farm_id     │
│  Sanctum auth · Resources · Policies (por rol Y por granja)     │
│  Jobs: SyncFromClient · DailyBackup · RecomputeInventory        │
│  Scheduler: recordatorios de vacuna, alertas de mortalidad      │
└──────────────┬──────────────────────────────────────────────────┘
               │                            │
               ▼                            ▼
        ┌───────────┐                ┌──────────────┐
        │   MySQL   │                │  Redis (opc) │
        │   8.x     │                │  Queue/cache │
        └───────────┘                └──────────────┘
```

## Capas multi-tenant

### Backend (Laravel)

1. **`farms` y `users`** son globales; el acceso se define en `farm_user`.
2. **Middleware `ResolveActiveFarm`** lee la cabecera `X-Farm-Id` del cliente,
   verifica que el usuario autenticado pertenezca a esa granja y la guarda
   en `App::instance('activeFarm')`.
3. **Trait `BelongsToFarm`** en todos los modelos operativos:
   - Define relación `belongsTo(Farm::class)`.
   - Global scope que añade `WHERE farm_id = activeFarm->id` a toda consulta.
   - Al crear, rellena `farm_id` automáticamente.
4. **Policies** validan, además del rol, que el usuario tenga acceso a esa granja.
5. **API REST** bajo `/api/farms/{farm}/...` (route model binding auto-checked)
   o bien `/api/...` con la cabecera `X-Farm-Id` (preferida para URLs limpias).

### Frontend (Vue + Pinia)

1. **Store `auth`**: usuario logueado + token Sanctum.
2. **Store `farms`**: granjas a las que pertenece el usuario (traídas al login).
3. **Store `activeFarm`**: granja activa (persistida en localStorage).
4. **Interceptor Axios**: inyecta siempre la cabecera `X-Farm-Id`.
5. **Dexie**: cada tabla se indexa por `farm_id`; las consultas `liveQuery`
   filtran siempre por la granja activa.
6. **Selector de granja**: siempre visible en la barra superior. Al cambiar,
   se limpia el caché de la granja anterior y se refresca el snapshot.

## Flujo offline/sync (multi-tenant)

1. Toda mutación se guarda en Dexie con `farm_id` + `local_uuid` + `pending=true`.
2. Si hay conexión → POST inmediato con `X-Farm-Id`.
3. Si no → entra en `sync_queue` (ramificada por granja).
4. El worker procesa la cola por granja, con backoff exponencial.
5. Backend hace **UPSERT idempotente** por `(farm_id, entity, local_uuid)`.
6. Las fotos se suben como blob aparte (`/uploads`) en segundo plano.

## Seguridad y aislamiento

- HTTPS obligatorio (necesario para PWA y service worker).
- Sanctum con tokens por dispositivo y expiración.
- Ninguna query puede omitir el `farm_id` (global scope no-eludible).
- Backups diarios cifrados (spatie/laravel-backup).
- Auditoría centralizada por granja (`audit_log.farm_id`).

## Infraestructura

- **Docker Compose**: `nginx` + `php-fpm` + `mysql` + `redis` (opc).
- **HTTPS** con Let's Encrypt en producción.
- **Backups**: `php artisan backup:run` diario en cron/Scheduler.
- **Logs**: Laravel Monolog → archivos rotados por día.
