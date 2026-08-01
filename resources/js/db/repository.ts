import type { Table } from 'dexie'
import { db } from './db'
import { nowISO } from '@/utils/format'
import type { OfflineRecord, SyncAction, SyncEntity, SyncQueueItem } from '@/types/domain'

/**
 * Punto ÚNICO de escritura local.
 *
 * Antes cada vista hacía `db.tabla.add(...)` y, por separado, un
 * `db.syncQueue.add(...)` copiado a mano. Varias rutas se olvidaban de encolar y
 * se conformaban con marcar `pendingSync: true`, un campo que nadie leía nunca:
 * los clientes nuevos, los saldos, las anulaciones y las ediciones de catálogo
 * jamás llegaban al servidor.
 *
 * Aquí guardar y encolar es la misma operación, dentro de una transacción, así
 * que no puede volver a pasar.
 */

/** Tabla Dexie + nombre de entidad que entiende el backend. */
interface Binding<T> {
  table: Table<T, string>
  entity: SyncEntity
}

/**
 * Aviso de "hay algo nuevo en la cola".
 *
 * El store de sync se suscribe aquí para subir en cuanto se escribe, sin esperar
 * al siguiente tick del intervalo. Es un callback y no un import directo del
 * store porque `sync` ya importa este módulo: llamarlo al revés crearía un ciclo.
 */
type QueueListener = () => void
const queueListeners = new Set<QueueListener>()

export function onQueueChanged(listener: QueueListener): () => void {
  queueListeners.add(listener)

  return () => {
    queueListeners.delete(listener)
  }
}

function notifyQueueChanged(): void {
  queueListeners.forEach((listener) => listener())
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BINDINGS: Record<SyncEntity, Binding<any>> = {
  pen: { table: db.pens, entity: 'pen' },
  'egg-category': { table: db.eggCategories, entity: 'egg-category' },
  presentation: { table: db.presentations, entity: 'presentation' },
  'mortality-cause': { table: db.mortalityCauses, entity: 'mortality-cause' },
  'feed-type': { table: db.feedTypes, entity: 'feed-type' },
  customer: { table: db.customers, entity: 'customer' },
  'egg-collection': { table: db.eggCollections, entity: 'egg-collection' },
  'chicken-movement': { table: db.chickenMovements, entity: 'chicken-movement' },
  vaccine: { table: db.vaccines, entity: 'vaccine' },
  incident: { table: db.incidents, entity: 'incident' },
  sale: { table: db.sales, entity: 'sale' },
  payment: { table: db.payments, entity: 'payment' },
  'feed-record': { table: db.feedRecords, entity: 'feed-record' },
  'feed-purchase': { table: db.feedPurchases, entity: 'feed-purchase' },
}

export function tableFor(entity: SyncEntity): Table<OfflineRecord, string> {
  return BINDINGS[entity].table as Table<OfflineRecord, string>
}

/**
 * Estructuras que IndexedDB no puede clonar (Proxies reactivos de Vue, refs,
 * funciones) rompen el `add`. Serializar es la forma más simple y segura de
 * garantizar un objeto plano.
 */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Guarda un registro nuevo y lo encola para subir, en una sola transacción.
 * Si algo falla, no queda ni el registro ni la entrada en la cola.
 */
export async function create<T extends OfflineRecord>(
  entity: SyncEntity,
  record: T,
): Promise<T> {
  const table = tableFor(entity)
  const payload = plain({ ...record, pendingSync: true })

  await db.transaction('rw', [table, db.syncQueue], async () => {
    await table.add(payload)
    await pushQueue(entity, 'create', payload.localUuid, payload.farmId, asPayload(payload))
  })

  notifyQueueChanged()

  return payload as T
}

/** La cola guarda el registro como objeto plano, sin su tipo de dominio. */
function asPayload(record: OfflineRecord): Record<string, unknown> {
  return record as unknown as Record<string, unknown>
}

/**
 * Aplica un parche a un registro existente y encola la actualización.
 * Se encola el registro COMPLETO ya actualizado: el backend hace UPSERT por
 * local_uuid y así el reintento es idempotente aunque se pierda el orden.
 */
export async function update<T extends OfflineRecord = OfflineRecord>(
  entity: SyncEntity,
  localUuid: string,
  patch: Record<string, unknown>,
): Promise<T | undefined> {
  const table = tableFor(entity)
  let merged: T | undefined

  await db.transaction('rw', [table, db.syncQueue], async () => {
    const current = (await table.get(localUuid)) as T | undefined
    if (!current) return

    merged = plain({
      ...current,
      ...patch,
      updatedAt: nowISO(),
      pendingSync: true,
    }) as T

    await table.put(merged)
    await pushQueue(entity, 'update', localUuid, merged.farmId, asPayload(merged))
  })

  notifyQueueChanged()

  return merged
}

/** Marca un registro como borrado local y encola el borrado remoto. */
export async function remove(entity: SyncEntity, localUuid: string): Promise<void> {
  const table = tableFor(entity)

  await db.transaction('rw', [table, db.syncQueue], async () => {
    const current = await table.get(localUuid)
    if (!current) return

    await table.delete(localUuid)
    await pushQueue(entity, 'delete', localUuid, current.farmId, {})
  })

  notifyQueueChanged()
}

/**
 * Ejecuta varias escrituras como una sola unidad atómica.
 *
 * Necesario en operaciones como registrar un abono, que toca la venta, crea el
 * pago y actualiza el saldo del cliente: antes eran awaits sueltos y un fallo a
 * mitad dejaba el pago guardado con la venta sin actualizar.
 */
export async function atomically<T>(work: () => Promise<T>): Promise<T> {
  const tables = [...new Set(Object.values(BINDINGS).map((b) => b.table))]

  const result = await db.transaction('rw', [...tables, db.syncQueue], work)

  notifyQueueChanged()

  return result
}

/**
 * Encola un item deduplicando: si ya hay una entrada pendiente para el mismo
 * (entidad, localUuid, acción), se reemplaza su payload en vez de acumular diez
 * versiones del mismo registro editado offline.
 */
async function pushQueue(
  entity: SyncEntity,
  action: SyncAction,
  localUuid: string,
  farmId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const existing = await db.syncQueue
    .where('localUuid')
    .equals(localUuid)
    .filter((item) => item.entity === entity && item.status !== 'failed')
    .toArray()

  // Un borrado invalida cualquier creación/actualización pendiente del mismo
  // registro: enviarlas sólo generaría trabajo y errores en el servidor.
  if (action === 'delete') {
    const created = existing.some((item) => item.action === 'create')
    await db.syncQueue.bulkDelete(existing.map((item) => item.id!).filter(Boolean))

    // Si nunca se subió, no hay nada que borrar en el servidor.
    if (created) return
  } else {
    const reusable = existing.find((item) => item.action === action)
    if (reusable?.id) {
      await db.syncQueue.update(reusable.id, {
        payload,
        attempts: 0,
        status: 'pending',
        nextAttemptAt: undefined,
        lastError: undefined,
      })

      return
    }

    // Un `update` sobre algo que aún no se ha creado en el servidor se fusiona
    // con la creación pendiente: el backend hace UPSERT de todas formas.
    const pendingCreate = existing.find((item) => item.action === 'create')
    if (action === 'update' && pendingCreate?.id) {
      await db.syncQueue.update(pendingCreate.id, {
        payload,
        attempts: 0,
        status: 'pending',
        nextAttemptAt: undefined,
        lastError: undefined,
      })

      return
    }
  }

  const item: SyncQueueItem = {
    farmId,
    entity,
    action,
    localUuid,
    payload,
    attempts: 0,
    status: 'pending',
    createdAt: nowISO(),
  }

  await db.syncQueue.add(item)
}
