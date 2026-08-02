import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '@/db/db'
import { onQueueChanged, tableFor } from '@/db/repository'
import { api, isNetworkError, type SyncPushItem } from '@/api/http'
import { aliveChickens as aliveFrom } from '@/domain/metrics'
import { nowISO, startOfFarmDay } from '@/utils/format'
import type { OfflineRecord, SyncEntity, SyncQueueItem, Vaccine } from '@/types/domain'
import { useFarmStore } from './farm'

/**
 * Nombres de entidad del cliente (kebab singular) → los del backend Laravel
 * (snake_case plural), que son los mismos que usan las rutas.
 *
 * Este mapa incluía entidades que el backend no aceptaba (`feed_records`,
 * `feed_purchases`, `*_lines`), así que esos items se rechazaban con 400 en cada
 * intento y la cola no drenaba nunca. Ahora está alineado con EntityRegistry:
 * las líneas viajan DENTRO de su registro padre, no como entidades sueltas.
 */
const ENTITY_MAP: Record<SyncEntity, string> = {
  pen: 'pens',
  'egg-category': 'egg_categories',
  presentation: 'presentations',
  'mortality-cause': 'mortality_causes',
  'feed-type': 'feed_types',
  customer: 'customers',
  'egg-collection': 'egg_collections',
  'chicken-movement': 'chicken_movements',
  vaccine: 'vaccines',
  incident: 'incidents',
  sale: 'sales',
  payment: 'payments',
  'feed-record': 'feed_records',
  'feed-purchase': 'feed_purchases',
}

/** Entidades del backend → tabla local, para la descarga. */
const REMOTE_TO_LOCAL: Record<string, SyncEntity> = Object.fromEntries(
  Object.entries(ENTITY_MAP).map(([local, remote]) => [remote, local as SyncEntity]),
) as Record<string, SyncEntity>

/**
 * Campos FK que el cliente guarda como localUuid y hay que traducir al id
 * numérico del backend antes de enviar.
 */
const FK_FIELDS = [
  'penId',
  'categoryId',
  'eggCategoryId',
  'presentationId',
  'customerId',
  'saleId',
  'eggCollectionId',
  'feedTypeId',
] as const

/** Espera entre intentos, en milisegundos, según el número de fallos. */
const BACKOFF_MS = [0, 30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000, 60 * 60_000]

const SYNC_INTERVAL_MS = 60_000

const LAST_PULL_KEY = 'mg_last_pull_at'

export const useSyncStore = defineStore('sync', () => {
  const online = ref<boolean>(navigator.onLine)
  const pendingCount = ref<number>(0)
  const failedCount = ref<number>(0)
  const syncing = ref<boolean>(false)
  const lastSyncAt = ref<string>('')
  const lastError = ref<string>('')

  /** Guardamos el id del intervalo para no crear uno nuevo en cada montaje. */
  let timer: number | null = null
  let listenersReady = false
  let unsubscribeQueue: (() => void) | null = null
  /**
   * Se escribió algo mientras había una subida en curso.
   *
   * Sin esta marca el aviso se perdía (porque `forceSync` sale de inmediato si
   * ya está sincronizando) y lo nuevo esperaba hasta el siguiente tick del
   * intervalo, que es un minuto.
   */
  let queueDirty = false

  const hasPending = computed(() => pendingCount.value > 0)
  const hasFailed = computed(() => failedCount.value > 0)

  const statusText = computed(() => {
    if (!online.value) return 'Sin conexión'
    if (syncing.value) return 'Sincronizando…'
    if (failedCount.value > 0) return `${failedCount.value} con error`
    if (pendingCount.value > 0) return `${pendingCount.value} pendientes`
    return 'Al día'
  })

  /**
   * Registra los listeners una sola vez.
   *
   * Se llamaba desde `main.ts` y también desde `onMounted` del Home, así que
   * cada visita al Home añadía otro intervalo de 60s y otro par de listeners.
   */
  function setupListeners() {
    if (listenersReady) return
    listenersReady = true

    window.addEventListener('online', () => {
      online.value = true
      void forceSync()
    })
    window.addEventListener('offline', () => {
      online.value = false
    })

    timer = window.setInterval(() => {
      if (online.value) void forceSync()
    }, SYNC_INTERVAL_MS)

    // Subir en cuanto se escribe algo, sin esperar al siguiente tick: antes un
    // cambio de catálogo se quedaba en la cola hasta un minuto.
    unsubscribeQueue = onQueueChanged(() => {
      void refreshPending().then(() => forceSync())
    })
  }

  function teardownListeners() {
    if (timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
    unsubscribeQueue?.()
    unsubscribeQueue = null
    listenersReady = false
  }

  /** Recalcula los contadores de la granja activa. */
  async function refreshPending() {
    const farm = useFarmStore()
    if (!farm.farmId) {
      pendingCount.value = 0
      failedCount.value = 0

      return
    }

    const items = await db.syncQueue.where('farmId').equals(farm.farmId).toArray()

    pendingCount.value = items.filter((i) => i.status !== 'failed').length
    failedCount.value = items.filter((i) => i.status === 'failed').length
  }

  /**
   * Procesa la cola.
   *
   * Cambios respecto a la versión anterior:
   *  - Sólo borra los items que se confirmaron aplicados. Antes borraba toda la
   *    cola de la granja, así que lo encolado mientras el POST estaba en vuelo
   *    se perdía sin haberse enviado.
   *  - Los fallos permanentes se marcan y dejan de reintentarse; los de red
   *    esperan con backoff exponencial. Antes se reenviaba todo cada 30s para
   *    siempre, y el contador de pendientes nunca bajaba.
   */
  async function forceSync(): Promise<void> {
    const farm = useFarmStore()

    if (!online.value || !farm.farmId || !api.hasToken()) return

    if (syncing.value) {
      // Ya hay una subida en curso: la marcamos para volver a pasar al terminar.
      queueDirty = true

      return
    }

    syncing.value = true
    queueDirty = false

    try {
      const due = await dueItems(farm.farmId)
      if (due.length === 0) {
        await refreshPending()

        return
      }

      const payload: SyncPushItem[] = []
      const skipped: SyncQueueItem[] = []

      for (const item of due) {
        try {
          payload.push({
            entity: ENTITY_MAP[item.entity],
            action: item.action,
            local_uuid: item.localUuid,
            payload: await translateFks(item.payload),
          })
        } catch (e) {
          // Una FK que no resuelve es un problema de datos, no de red.
          await markFailed(item, (e as Error).message)
          skipped.push(item)
        }
      }

      if (payload.length === 0) {
        await refreshPending()

        return
      }

      const result = await api.syncPush(payload)

      const appliedIds = new Set(result.applied.map((a) => `${a.entity}:${a.local_uuid}`))
      const errorsByKey = new Map(
        result.errors.map((e) => [`${e.entity}:${e.local_uuid}`, e]),
      )

      for (const item of due) {
        if (skipped.includes(item)) continue

        const key = `${ENTITY_MAP[item.entity]}:${item.localUuid}`

        if (appliedIds.has(key)) {
          if (item.id !== undefined) await db.syncQueue.delete(item.id)
          continue
        }

        const error = errorsByKey.get(key)
        if (!error) continue

        if (error.permanent) {
          await markFailed(item, error.message)
        } else {
          await scheduleRetry(item, error.message)
        }
      }

      // Guardar los ids remotos permite resolver las FKs de lo que venga después.
      await applyRemoteIds(result.applied)

      lastSyncAt.value = nowISO()
      lastError.value = result.errors.find((e) => e.permanent)?.message ?? ''
    } catch (e) {
      if (isNetworkError(e)) {
        lastError.value = ''
        online.value = navigator.onLine
      } else {
        lastError.value = 'El servidor rechazó la sincronización.'
        console.warn('[sync] push falló', e)
      }
    } finally {
      syncing.value = false
      await refreshPending()

      // Si entró trabajo nuevo mientras subíamos, damos otra pasada.
      if (queueDirty) {
        queueDirty = false
        void forceSync()
      }
    }
  }

  /** Items listos para enviar (pendientes y con el backoff ya cumplido). */
  async function dueItems(farmId: string): Promise<SyncQueueItem[]> {
    const now = Date.now()

    const items = await db.syncQueue.where('farmId').equals(farmId).toArray()

    return items
      .filter((item) => item.status !== 'failed')
      .filter((item) => !item.nextAttemptAt || new Date(item.nextAttemptAt).getTime() <= now)
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      .slice(0, 500)
  }

  async function scheduleRetry(item: SyncQueueItem, message: string): Promise<void> {
    if (item.id === undefined) return

    const attempts = (item.attempts ?? 0) + 1
    const delay = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)]

    await db.syncQueue.update(item.id, {
      attempts,
      lastError: message,
      nextAttemptAt: new Date(Date.now() + delay).toISOString(),
    })
  }

  async function markFailed(item: SyncQueueItem, message: string): Promise<void> {
    if (item.id === undefined) return

    await db.syncQueue.update(item.id, {
      status: 'failed',
      attempts: (item.attempts ?? 0) + 1,
      lastError: message,
    })
  }

  /** Vuelve a poner en cola los items marcados como fallidos (acción del usuario). */
  async function retryFailed(): Promise<void> {
    const farm = useFarmStore()
    if (!farm.farmId) return

    const failed = await db.syncQueue
      .where('farmId')
      .equals(farm.farmId)
      .filter((item) => item.status === 'failed')
      .toArray()

    await Promise.all(
      failed
        .filter((item) => item.id !== undefined)
        .map((item) =>
          db.syncQueue.update(item.id!, {
            status: 'pending',
            attempts: 0,
            nextAttemptAt: undefined,
          }),
        ),
    )

    await refreshPending()
    await forceSync()
  }

  /** Descarta un item que el servidor nunca va a aceptar. */
  async function discardFailed(id: number): Promise<void> {
    await db.syncQueue.delete(id)
    await refreshPending()
  }

  async function failedItems(): Promise<SyncQueueItem[]> {
    const farm = useFarmStore()
    if (!farm.farmId) return []

    return db.syncQueue
      .where('farmId')
      .equals(farm.farmId)
      .filter((item) => item.status === 'failed')
      .toArray()
  }

  /** Anota el `remoteId` de cada registro confirmado por el servidor. */
  async function applyRemoteIds(
    applied: Array<{ entity: string; local_uuid: string; id?: number }>,
  ): Promise<void> {
    for (const row of applied) {
      const entity = REMOTE_TO_LOCAL[row.entity]
      if (!entity || row.id === undefined) continue

      await tableFor(entity)
        .update(row.local_uuid, { remoteId: row.id, pendingSync: false })
        .catch(() => undefined)
    }
  }

  /**
   * Descarga los datos del servidor y los escribe en la base local.
   *
   * Sin esto la sincronización era sólo de subida: borrar los datos del
   * navegador o cambiar de teléfono significaba perder la granja entera.
   */
  async function pullFromServer(options: { full?: boolean } = {}): Promise<number> {
    const farm = useFarmStore()
    if (!farm.farmId || !api.hasToken() || !online.value) return 0

    const since = options.full ? undefined : localStorage.getItem(LAST_PULL_KEY) ?? undefined
    let imported = 0

    try {
      const result = await api.syncPull({ since, limit: 500 })

      for (const [remoteEntity, rows] of Object.entries(result.data)) {
        const entity = REMOTE_TO_LOCAL[remoteEntity]
        if (!entity || !Array.isArray(rows)) continue

        imported += await importRows(entity, rows, farm.farmId)
      }

      // Con truncated=true quedan más registros: el siguiente pull continúa
      // desde el `updated_at` más alto que sí bajamos.
      if (!result.truncated) {
        localStorage.setItem(LAST_PULL_KEY, result.server_time)
      }

      await farm.loadCatalogs()
    } catch (e) {
      if (!isNetworkError(e)) {
        console.warn('[sync] pull falló', e)
      }

      return imported
    }

    return imported
  }

  /**
   * Convierte los registros del servidor (snake_case, ids numéricos) al formato
   * local (camelCase, localUuid) y los guarda sin pisar cambios sin sincronizar.
   */
  async function importRows(
    entity: SyncEntity,
    rows: Array<Record<string, unknown>>,
    farmId: string,
  ): Promise<number> {
    const table = tableFor(entity)
    const fkResolver = await buildRemoteIdIndex(farmId)
    let count = 0

    for (const row of rows) {
      const localUuid = typeof row.local_uuid === 'string' && row.local_uuid ? row.local_uuid : null
      const remoteId = typeof row.id === 'number' ? row.id : undefined

      // Sin local_uuid buscamos por remoteId; si tampoco hay, no podemos
      // identificar el registro y lo ignoramos.
      const existing = localUuid
        ? await table.get(localUuid)
        : remoteId !== undefined
          ? (await table.where('remoteId').equals(remoteId).first())
          : undefined

      // Un registro con cambios locales sin subir gana: la subida es la fuente
      // de verdad para lo que el usuario acaba de escribir en este dispositivo.
      if (existing?.pendingSync) continue

      const record = toLocalRecord(entity, row, farmId, existing?.localUuid ?? localUuid, fkResolver)
      if (!record) continue

      await table.put(record as unknown as OfflineRecord)
      count++
    }

    return count
  }

  /** Índice remoteId → localUuid de todas las tablas referenciables. */
  async function buildRemoteIdIndex(farmId: string): Promise<Map<string, string>> {
    const index = new Map<string, string>()

    const sources: Array<[string, SyncEntity]> = [
      ['pen', 'pen'],
      ['eggCategory', 'egg-category'],
      ['presentation', 'presentation'],
      ['feedType', 'feed-type'],
      ['customer', 'customer'],
      ['sale', 'sale'],
      ['eggCollection', 'egg-collection'],
    ]

    for (const [prefix, entity] of sources) {
      const rows = await tableFor(entity).where('farmId').equals(farmId).toArray()
      for (const row of rows) {
        if (typeof row.remoteId === 'number') {
          index.set(`${prefix}:${row.remoteId}`, row.localUuid)
        }
      }
    }

    return index
  }

  function toLocalRecord(
    entity: SyncEntity,
    row: Record<string, unknown>,
    farmId: string,
    localUuid: string | null,
    index: Map<string, string>,
  ): Record<string, unknown> | null {
    const camel = camelizeKeys(row)

    const uuid = localUuid ?? (typeof camel.localUuid === 'string' ? camel.localUuid : null)
    if (!uuid) return null

    const record: Record<string, unknown> = {
      ...camel,
      localUuid: uuid,
      farmId,
      remoteId: typeof row.id === 'number' ? row.id : undefined,
      pendingSync: false,
    }

    delete record.id
    delete record.farmId
    record.farmId = farmId

    // Los ids numéricos de las FKs se traducen a los UUID locales para que las
    // vistas (que comparan contra localUuid) sigan funcionando.
    remapForeignKey(record, 'penId', 'pen', index)
    remapForeignKey(record, 'customerId', 'customer', index)
    remapForeignKey(record, 'saleId', 'sale', index)
    remapForeignKey(record, 'eggCategoryId', 'eggCategory', index)
    remapForeignKey(record, 'presentationId', 'presentation', index)
    remapForeignKey(record, 'feedTypeId', 'feedType', index)

    if (Array.isArray(record.lines)) {
      record.lines = (record.lines as Array<Record<string, unknown>>).map((line) => {
        const localLine = camelizeKeys(line)
        delete localLine.id
        delete localLine.farmId

        remapForeignKey(localLine, 'eggCategoryId', 'eggCategory', index)
        remapForeignKey(localLine, 'presentationId', 'presentation', index)
        remapForeignKey(localLine, 'feedTypeId', 'feedType', index)

        // Las vistas leen `categoryId` en las líneas de huevos y ventas.
        if (localLine.eggCategoryId !== undefined) {
          localLine.categoryId = localLine.eggCategoryId
        }

        return localLine
      })
    } else if (entity === 'egg-collection' || entity === 'sale' || entity === 'feed-record' || entity === 'feed-purchase') {
      record.lines = []
    }

    return record
  }

  function remapForeignKey(
    record: Record<string, unknown>,
    field: string,
    prefix: string,
    index: Map<string, string>,
  ): void {
    const value = record[field]
    if (typeof value !== 'number') return

    const local = index.get(`${prefix}:${value}`)
    record[field] = local ?? undefined
  }

  function camelizeKeys(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(row)) {
      const camel = key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
      out[camel] = value
    }

    return out
  }

  /**
   * Sustituye los localUuid de las FKs por el `remoteId` ya conocido.
   *
   * Si no hay `remoteId` se deja el UUID: el backend también sabe resolverlo por
   * `local_uuid`, y si tampoco lo encuentra ahora devuelve un error explícito en
   * vez de guardar la FK en NULL en silencio.
   */
  async function translateFks(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const farm = useFarmStore()
    if (!farm.farmId) return payload

    const tables: Record<string, SyncEntity> = {
      penId: 'pen',
      categoryId: 'egg-category',
      eggCategoryId: 'egg-category',
      presentationId: 'presentation',
      customerId: 'customer',
      saleId: 'sale',
      eggCollectionId: 'egg-collection',
      feedTypeId: 'feed-type',
    }

    const out = { ...payload }

    for (const field of FK_FIELDS) {
      const value = out[field]
      if (typeof value !== 'string' || !value.includes('-')) continue

      const record = await tableFor(tables[field]).get(value)

      if (record && typeof record.remoteId === 'number') {
        out[field] = record.remoteId
      }
    }

    if (Array.isArray(out.lines)) {
      out.lines = await Promise.all(
        (out.lines as Array<Record<string, unknown>>).map((line) => translateFks(line)),
      )
    }

    return out
  }

  return {
    online,
    pendingCount,
    failedCount,
    syncing,
    lastSyncAt,
    lastError,
    hasPending,
    hasFailed,
    statusText,
    setupListeners,
    teardownListeners,
    refreshPending,
    forceSync,
    pullFromServer,
    retryFailed,
    discardFailed,
    failedItems,
  }
})

/**
 * Helpers de consulta para el dashboard y los reportes.
 *
 * `penId` opcional filtra por galpón ('' = todos).
 */
export async function todayEggs(farmId: string, penId = ''): Promise<number> {
  const start = startOfFarmDay()

  const cols = await db.eggCollections
    .where('farmId')
    .equals(farmId)
    .and((c) => new Date(c.collectionAt) >= start && (!penId || c.penId === penId))
    .toArray()

  return cols.reduce((sum, c) => sum + c.total, 0)
}

export async function aliveChickens(farmId: string, penId = ''): Promise<number> {
  const mv = await db.chickenMovements.where('farmId').equals(farmId).toArray()

  // El filtro por galpón lo hace la función pura: necesita ver TODOS los
  // movimientos de la granja para tratar bien las transferencias.
  return aliveFrom(mv, penId)
}

/**
 * Deuda pendiente: cualquier venta no anulada con saldo.
 * Antes el cliente filtraba por `status IN (pending, partial)` y el servidor por
 * `status != void AND balance > 0`, así que los dos resúmenes no coincidían.
 */
export async function pendingDebt(farmId: string): Promise<number> {
  const sales = await db.sales
    .where('farmId')
    .equals(farmId)
    .and((s) => s.status !== 'void' && s.balance > 0)
    .toArray()

  return sales.reduce((sum, s) => sum + s.balance, 0)
}

/** Próxima vacuna programada (a futuro). */
export async function nextVaccine(farmId: string, penId = ''): Promise<Vaccine | undefined> {
  const start = startOfFarmDay().getTime()

  const list = await db.vaccines
    .where('farmId')
    .equals(farmId)
    .and((v) => !penId || v.penId === penId)
    .toArray()

  return list
    .filter((v) => v.nextAt && new Date(v.nextAt).getTime() >= start)
    .sort((a, b) => new Date(a.nextAt!).getTime() - new Date(b.nextAt!).getTime())[0]
}

/**
 * Vacuna atrasada (fecha ya pasada y sin aplicar).
 * Antes sólo se miraban las futuras, así que el caso importante —se te pasó la
 * fecha— no generaba ningún aviso.
 */
export async function overdueVaccine(farmId: string, penId = ''): Promise<Vaccine | undefined> {
  const start = startOfFarmDay().getTime()

  const list = await db.vaccines
    .where('farmId')
    .equals(farmId)
    .and((v) => !penId || v.penId === penId)
    .toArray()

  return list
    .filter((v) => v.nextAt && new Date(v.nextAt).getTime() < start)
    .sort((a, b) => new Date(b.nextAt!).getTime() - new Date(a.nextAt!).getTime())[0]
}
