import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '@/db/db'
import { api } from '@/api/http'
import type { Vaccine } from '@/types/domain'
import { useFarmStore } from './farm'

/**
 * Traduce los nombres de entidad usados en el frontend (kebab singular,
 * p.ej. "egg-collection") al formato que espera el backend Laravel
 * (snake_case plural, p.ej. "egg_collections"), coherente con las rutas
 * y el SyncController.
 */
const ENTITY_MAP: Record<string, string> = {
  'egg-collection': 'egg_collections',
  'egg-collection-line': 'egg_collection_lines',
  'chicken-movement': 'chicken_movements',
  'sale': 'sales',
  'sale-line': 'sale_lines',
  'payment': 'payments',
  'customer': 'customers',
  'vaccine': 'vaccines',
  'incident': 'incidents',
  'pen': 'pens',
  'egg-category': 'egg_categories',
  'presentation': 'presentations',
  'mortality-cause': 'mortality_causes',
}

/**
 * Campos dentro del payload que referencian catálogos por localUuid del cliente
 * y que deben traducirse al id numérico (`remoteId`) del backend antes de enviar.
 * El backend ya lo resuelve vía local_uuid por si acaso, pero hacerlo acá
 * evita la mayoría de los casos de FK truncada.
 */
const FK_FIELDS = ['penId', 'categoryId', 'presentationId', 'customerId', 'saleId', 'eggCollectionId']

/**
 * Reemplaza los localUuid de FKs por los remoteId mapeados en Dexie.
 * Devuelve una copia del payload con las claves traducidas.
 */
async function translateFks(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const farm = useFarmStore()
  if (!farm.farmId) return payload

  // Tablas donde buscar los remoteId. Tipado como `any` porque cada tabla
  // de Dexie tiene un genérico distinto y sólo nos interesa el .toArray().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tablesByField: Record<string, any> = {
    penId: db.pens,
    categoryId: db.eggCategories,
    presentationId: db.presentations,
    customerId: db.customers,
    saleId: db.sales,
    eggCollectionId: db.eggCollections,
  }

  const out = { ...payload }
  for (const field of FK_FIELDS) {
    const value = out[field]
    if (typeof value !== 'string' || !value.includes('-')) continue // no es UUID
    const table = tablesByField[field]
    if (!table) continue
    const recs = await table.where('farmId').equals(farm.farmId).and((r: { localUuid: string }) => r.localUuid === value).toArray()
    const rec = recs[0]
    if (rec && typeof rec.remoteId === 'number') {
      out[field] = rec.remoteId
    }
  }

  // También en las líneas anidadas.
  if (Array.isArray(out.lines)) {
    out.lines = await Promise.all(
      (out.lines as Array<Record<string, unknown>>).map(async (line) => translateFks(line)),
    )
  }

  return out
}

/**
 * Estado de sincronización y conexión.
 *
 * - Procesa la cola local cuando vuelve la conexión.
 * - Expone un texto legible ("AL DÍA" / "3 pendientes") para el adulto mayor.
 *
 * En el MVP las escrituras son 100% locales; la subida real se activa al
 * implementar /api/sync. El mecanismo (cola por farmId + localUuid + reintentos)
 * ya está implementado y es idempotente.
 */
export const useSyncStore = defineStore('sync', () => {
  const online = ref<boolean>(navigator.onLine)
  const pendingCount = ref<number>(0)
  const syncing = ref<boolean>(false)
  const lastSyncAt = ref<string>('')

  const hasPending = computed(() => pendingCount.value > 0)
  const statusText = computed(() => {
    if (!online.value) return 'Sin conexión'
    if (syncing.value) return 'Sincronizando…'
    if (hasPending.value) return `${pendingCount.value} pendientes`
    return 'Al día'
  })

  function setupListeners() {
    window.addEventListener('online', () => {
      online.value = true
      void forceSync()
    })
    window.addEventListener('offline', () => {
      online.value = false
    })
    // Intento periódico cada 30s mientras haya conexión.
    window.setInterval(() => {
      if (online.value) void forceSync()
    }, 30_000)
  }

  /** Recalcula los registros pendientes de la granja activa. */
  async function refreshPending() {
    const farm = useFarmStore()
    if (!farm.farmId) {
      pendingCount.value = 0
      return
    }
    pendingCount.value = await db.syncQueue
      .where('farmId')
      .equals(farm.farmId)
      .count()
  }

  /**
   * Procesa la cola de sincronización.
   * En el MVP, como todavía no hay endpoint /api/sync, sólo marca los registros
   * subidos correctamente; el cuerpo real se completa en la Fase 1 (offline completo).
   */
  async function forceSync() {
    if (!online.value || syncing.value) return
    await refreshPending()
    if (!hasPending.value) return

    syncing.value = true
    try {
      const farm = useFarmStore()
      const items = await db.syncQueue.where('farmId').equals(farm.farmId).toArray()

      // Formatea la cola al payload que espera /api/sync/push.
      // Antes de enviar, traduce los UUIDs de FKs al remoteId numérico si ya
      // se hizo el merge con el backend.
      const payload = await Promise.all(
        items.map(async (it) => ({
          entity: ENTITY_MAP[it.entity] ?? it.entity,
          action: it.action,
          local_uuid: it.localUuid,
          payload: await translateFks(it.payload as Record<string, unknown>),
        })),
      )

      // Sólo intentamos subir si hay token guardado (usuario logueado con backend).
      // Si no, mantenemos la cola local: el frontend es la fuente de verdad offline.
      if (!api.hasToken()) {
        return
      }
      try {
        const result = await api.syncPush(payload)
        if (result.errors.length === 0) {
          // Éxito total: limpiamos la cola.
          await db.syncQueue.where('farmId').equals(farm.farmId).delete()
        } else {
          // Fallaron algunos: eliminamos sólo los que se aplicaron OK,
          // dejamos los fallidos para reintento con backoff.
          const appliedUuids = new Set(result.applied.map((a) => a.local_uuid))
          for (const it of items) {
            if (appliedUuids.has(it.localUuid)) {
              await db.syncQueue.delete(it.id!)
            }
          }
        }
      } catch (e) {
        // Sin conexión o error: dejamos la cola intacta para el próximo intento.
        // Marcamos el último error para diagnóstico.
        console.warn('[sync] push falló; se reintentará', e)
      }

      lastSyncAt.value = new Date().toISOString()
      await refreshPending()
    } finally {
      syncing.value = false
    }
  }

  return {
    online,
    pendingCount,
    syncing,
    lastSyncAt,
    hasPending,
    statusText,
    setupListeners,
    refreshPending,
    forceSync,
  }
})

/**
 * Helpers de consulta para el dashboard.
 * Se exponen como funciones puras para reutilizar en reportes.
 * El parámetro `penId` opcional permite filtrar por galpón ('' = todos).
 */
export async function todayEggs(farmId: string, penId = ''): Promise<number> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const cols = await db.eggCollections
    .where('farmId')
    .equals(farmId)
    .and((c) => new Date(c.collectionAt) >= start && (!penId || c.penId === penId))
    .toArray()
  return cols.reduce((sum, c) => sum + c.total, 0)
}

export async function aliveChickens(farmId: string, penId = ''): Promise<number> {
  const mv = await db.chickenMovements
    .where('farmId')
    .equals(farmId)
    .and((m) => !penId || m.penId === penId)
    .toArray()
  const delta = (t: string, sign: number) =>
    mv.filter((m) => m.type === t).reduce((s, m) => s + m.qty * sign, 0)
  const qty =
    delta('buy', 1) + delta('birth', 1) - delta('death', 1) - delta('sale', 1) - delta('revoke', 1)
  return Math.max(0, qty)
}

export async function pendingDebt(farmId: string): Promise<number> {
  const sales = await db.sales
    .where('farmId')
    .equals(farmId)
    .and((s) => s.status === 'pending' || s.status === 'partial')
    .toArray()
  return sales.reduce((s, x) => s + x.balance, 0)
}

export async function nextVaccine(farmId: string, penId = ''): Promise<Vaccine | undefined> {
  const now = Date.now()
  const list = await db.vaccines
    .where('farmId')
    .equals(farmId)
    .and((v) => !penId || v.penId === penId)
    .toArray()
  return list
    .filter((v) => v.nextAt && new Date(v.nextAt).getTime() >= now)
    .sort((a, b) => new Date(a.nextAt!).getTime() - new Date(b.nextAt!).getTime())[0]
}
