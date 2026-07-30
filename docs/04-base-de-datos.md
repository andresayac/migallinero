# 04 — Modelo de base de datos (multi-tenant)

## Estrategia de tenancy

- **Single database con `farm_id`** en todas las tablas operacionales.
  Es la opción más simple y barata para negocios pequeños y设备s Android,
  sin complejidad de DB-per-tenant.
- `farms` y `users` son globales; `farm_user` define el acceso (N:N) con rol.
- Aislamiento garantizado por:
  - Laravel: global scope automático por `farm_id` en todos los modelos operativos.
  - Frontend/Dexie: todas las consultas filtran por `farm_id` de la granja activa.
  - Policies: validan también que el usuario tenga acceso a esa granja.

## Esquema MySQL

```sql
-- ===================== GLOBALES (sin farm_id) =====================

farms (
  id, name, owner_name, phone, country DEFAULT 'CO',
  timezone DEFAULT 'America/Bogota', locale DEFAULT 'es-CO',
  currency DEFAULT 'COP', active, created_at, updated_at
)

users (
  id, name, username, password_hash, pin, active,
  preferred_locale, created_at, updated_at
)

farm_user (
  farm_id, user_id, role ENUM('admin','vendedor','operario'),
  active, invited_at, joined_at,
  PRIMARY KEY (farm_id, user_id)
)

-- ===================== POR GRANJA (con farm_id) =====================

pens (  -- corrales / galpones / lotes
  id, farm_id, name, active, sort
)

egg_categories (
  id, farm_id, name, short, sellable, is_broken,
  color, sort
)

presentations (  -- unidad / cubeta(30) / torre(300)
  id, farm_id, code, name, units_per_pack
)

mortality_causes (
  id, farm_id, name, active, sort
)

reminder_config (  -- días de recordatorio de vacunas, por granja
  id, farm_id, vaccine_reminder_days JSON,
  mortality_alert_threshold DECIMAL
)

-- Producción e inventario de huevos
eggs_collections (
  id, farm_id, pen_id, collection_at, user_id,
  observation, total, local_uuid UNIQUE, synced_at
)

eggs_collection_lines (
  id, farm_id, collection_id, category_id, qty
)

egg_inventory (
  id, farm_id, category_id,
  collected, sold, adjust_pos, adjust_neg, broken,
  -- available = collected + adjust_pos - sold - adjust_neg
  -- (broken nunca entra a available aunque sí a estadísticas)
  updated_at
)

egg_adjustments (
  id, farm_id, category_id, qty, reason, created_at, user_id
)

-- Gallinas
chicken_lots (
  id, farm_id, pen_id, name, opening_qty, active
)

chicken_movements (
  id, farm_id, lot_id, pen_id,
  type ENUM('buy','birth','death','sale','revoke','transfer','adjust'),
  qty, reason, observation, photo_path, created_at, user_id
)

-- Vacunas
vaccines (
  id, farm_id, name, batch, expires_at, dose,
  applied_at, next_at, pen_id, qty_chickens,
  responsible, observation, photo_path, user_id
)

-- Novedades
incidents (
  id, farm_id, type, pen_id, description,
  severity ENUM('low','med','high'),
  status ENUM('open','reviewed','solved'),
  created_at, solved_at, user_id
)

-- Clientes, ventas, pagos
customers (
  id, farm_id, name, phone, address, id_number,
  notes, active, balance  -- balance = SUM(sales.balance)
)

sales (
  id, farm_id, customer_id, sold_at, total, discount,
  paid, balance, status ENUM('paid','partial','pending','void'),
  payment_method, promised_payment_at, observation,
  user_id, local_uuid UNIQUE, synced_at
)

sale_lines (
  id, farm_id, sale_id, category_id, presentation_id,
  qty_packs, qty_units, unit_price, subtotal
)

payments (
  id, farm_id, sale_id, customer_id, amount, method,
  paid_at, observation, user_id
)

-- ===================== TRANSVERSALES =====================

audit_log (
  id, farm_id, user_id, action, entity, entity_id,
  before JSON, after JSON, created_at
)

sync_queue (
  id, farm_id, entity, action, payload JSON,
  attempts, last_error, created_at, synced_at
)

-- Deduplicación offline: local_uuid ya creado en el cliente
-- El backend aplica UPSERT por (farm_id, entity, local_uuid)
```

## Reglas de cálculo (recalculadas por Scheduler/trigger)

- `egg_inventory.available` =
  `collected + adjust_pos − sold − adjust_neg`
  (las categorías con `is_broken=true` no alimentan el inventario vendible).
- `chicken_lots.alive` =
  `opening_qty + buy + birth − death − sale − revoke`
  (vista agregada desde `chicken_movements`).
- `customers.balance` = `SUM(sales.balance)` con
  `status IN ('pending','partial')`.

## Notas multi-tenant

- `farm_id` es **obligatorio** (NOT NULL) en toda tabla operativa.
- Cada índice secundario **incluye `farm_id`** como primera columna
  para que las consultas por granja sean rápidas.
- Las migraciones de Laravel usan un trait `BelongsToFarm` + global scope
  que inyecta automáticamente el `farm_id` de la sesión.
- La API siempre retorna solo los registros de la granja activa,
  validada por middleware `EnsureFarmBelongsToUser`.
