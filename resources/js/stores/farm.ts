import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, wipeFarmData } from '@/db/db'
import { create as createRecord, update as updateRecord } from '@/db/repository'
import { api, type BootCatalog, type BootPayload, type CatalogSeed, type FarmPayload } from '@/api/http'
import type { EggCategory, Pen, MortalityCause, Presentation, FeedType } from '@/types/domain'
import { uuid, nowISO, setRegionalConfig } from '@/utils/format'
import { useAuthStore } from './auth'

const FARM_KEY = 'mg_farm'
const ACTIVE_PEN_KEY = 'mg_active_pen'

interface StoredFarm {
  id: string
  remoteId?: number
  name: string
  ownerName: string
  periodLockDays: number
  currency: string
  country: string
  timezone: string
  locale: string
  phone?: string
}

/**
 * Granja activa + catálogos.
 *
 * `farmId` es SIEMPRE el UUID local y no cambia nunca: es la clave con la que
 * están indexados todos los registros de Dexie. El id numérico del backend vive
 * aparte en `remoteFarmId` y sólo se usa para la cabecera `X-Farm-Id`.
 *
 * Antes al iniciar sesión se sobreescribía `farmId` con el id numérico, así que
 * todas las filas locales quedaban huérfanas y la app aparecía vacía. Y
 * `setActive` no persistía nada, así que en un dispositivo nuevo la sesión no
 * sobrevivía a un refresco.
 */
export const useFarmStore = defineStore('farm', () => {
  const farmId = ref<string>('')
  const remoteFarmId = ref<number | null>(null)
  const farmName = ref<string>('')
  const ownerName = ref<string>('')
  const periodLockDays = ref<number>(7)
  const currency = ref<string>('COP')
  const country = ref<string>('CO')
  const timezone = ref<string>('America/Bogota')
  const locale = ref<string>('es-CO')
  const phone = ref<string>('')

  const categories = ref<EggCategory[]>([])
  const pens = ref<Pen[]>([])
  const causes = ref<MortalityCause[]>([])
  const presentations = ref<Presentation[]>([])
  const feedTypes = ref<FeedType[]>([])

  /** Galpón activo para filtrar. '' = "Todos los galpones". */
  const activePenId = ref<string>('')

  const isConfigured = computed(() => !!farmId.value)
  const isLinkedToBackend = computed(() => remoteFarmId.value !== null)

  const sellableCategories = computed(() =>
    categories.value
      .filter((c) => c.active !== false && c.sellable && !c.isBroken)
      .sort(bySort),
  )
  const activeCategories = computed(() =>
    categories.value.filter((c) => c.active !== false).sort(bySort),
  )
  const activePens = computed(() => pens.value.filter((p) => p.active).sort(bySort))
  const activeCauses = computed(() => causes.value.filter((c) => c.active !== false).sort(bySort))
  const activePresentations = computed(() =>
    presentations.value.filter((p) => p.active !== false).sort(bySort),
  )
  const activeFeedTypes = computed(() => feedTypes.value.filter((f) => f.active).sort(bySort))
  const activePen = computed<Pen | undefined>(() =>
    pens.value.find((p) => p.localUuid === activePenId.value),
  )

  function bySort(a: { sort: number }, b: { sort: number }): number {
    return a.sort - b.sort
  }

  /** Carga los catálogos de la granja activa desde Dexie. */
  async function loadCatalogs() {
    if (!farmId.value) return

    const [cats, ps, cs, pres, ft] = await Promise.all([
      db.eggCategories.where('farmId').equals(farmId.value).toArray(),
      db.pens.where('farmId').equals(farmId.value).toArray(),
      db.mortalityCauses.where('farmId').equals(farmId.value).toArray(),
      db.presentations.where('farmId').equals(farmId.value).toArray(),
      db.feedTypes.where('farmId').equals(farmId.value).toArray(),
    ])

    categories.value = cats.sort(bySort)
    pens.value = ps.sort(bySort)
    causes.value = cs.sort(bySort)
    presentations.value = pres.sort(bySort)
    feedTypes.value = ft.sort(bySort)

    // Restaurar el galpón activo guardado (si sigue existiendo y activo).
    const saved = localStorage.getItem(ACTIVE_PEN_KEY)
    activePenId.value =
      saved && pens.value.some((p) => p.localUuid === saved && p.active) ? saved : ''
  }

  /**
   * Crea la granja local con sus catálogos.
   *
   * Siempre se ejecuta primero, incluso con conexión: así el asistente funciona
   * offline y el registro en el servidor puede enviar EXACTAMENTE estos
   * catálogos con sus `local_uuid`. Antes el servidor sembraba sus propios
   * catálogos colombianos y los personalizados quedaban duplicados y sin
   * `remoteId`, lo que hacía que las líneas de ventas y tandas llegaran al
   * backend con la FK en NULL.
   */
  async function bootstrapFarm(
    owner: string,
    name: string,
    catalogs?: {
      eggCategories?: Array<{ name: string; short: string; sellable: boolean; isBroken: boolean; color: string }>
      pens?: Array<{ name: string; color: string }>
      causes?: Array<{ name: string }>
      presentations?: Array<{ code: string; name: string; unitsPerPack: number }>
      feedTypes?: Array<{ name: string; unit: string }>
    },
    config?: Partial<Pick<StoredFarm, 'periodLockDays' | 'currency' | 'country' | 'timezone' | 'locale' | 'phone'>>,
  ) {
    const auth = useAuthStore()
    const fid = uuid()
    const ts = nowISO()

    const base = {
      farmId: fid,
      pendingSync: true,
      createdAt: ts,
      updatedAt: ts,
      createdBy: auth.user?.id ?? 'unknown',
      entryMode: 'auto' as const,
    }

    const eggCats: EggCategory[] = (catalogs?.eggCategories ?? [
      { name: 'Jumbo', short: 'JUM', sellable: true, isBroken: false, color: '#16a34a' },
      { name: 'EX', short: 'EX', sellable: true, isBroken: false, color: '#0ea5e9' },
      { name: 'AA', short: 'AA', sellable: true, isBroken: false, color: '#8b5cf6' },
      { name: 'A', short: 'A', sellable: true, isBroken: false, color: '#f59e0b' },
      { name: 'B', short: 'B', sellable: true, isBroken: false, color: '#ec4899' },
      { name: 'C', short: 'C', sellable: true, isBroken: false, color: '#64748b' },
      { name: 'Rotos', short: 'ROT', sellable: false, isBroken: true, color: '#dc2626' },
    ]).map((c, i) => ({ ...base, localUuid: uuid(), sort: i + 1, active: true, ...c }))

    const defaultPens: Pen[] = (catalogs?.pens ?? [{ name: 'Galpón 1', color: '#16a34a' }]).map(
      (p, i) => ({ ...base, localUuid: uuid(), sort: i + 1, active: true, ...p }),
    )

    const defaultCauses: MortalityCause[] = (catalogs?.causes ?? [
      { name: 'Enfermedad' },
      { name: 'Accidente' },
      { name: 'Ataque de animal' },
      { name: 'Calor' },
      { name: 'Frío' },
      { name: 'Causa desconocida' },
      { name: 'Otra causa' },
    ]).map((c, i) => ({ ...base, localUuid: uuid(), sort: i + 1, active: true, ...c }))

    const defaultPres: Presentation[] = (catalogs?.presentations ?? [
      { code: 'unit', name: 'Unidad', unitsPerPack: 1 },
      { code: 'cubeta', name: 'Cubeta (30)', unitsPerPack: 30 },
      { code: 'torre', name: 'Torre (300)', unitsPerPack: 300 },
    ]).map((p, i) => ({
      ...base,
      localUuid: uuid(),
      sort: i + 1,
      active: true,
      code: p.code as Presentation['code'],
      name: p.name,
      unitsPerPack: p.unitsPerPack,
    }))

    const defaultFeedTypes: FeedType[] = (catalogs?.feedTypes ?? [
      { name: 'Concentrado de inicial', unit: 'kg' },
      { name: 'Concentrado de levante', unit: 'kg' },
      { name: 'Concentrado de postura', unit: 'kg' },
      { name: 'Purina', unit: 'kg' },
      { name: 'Maíz', unit: 'kg' },
    ]).map((f, i) => ({ ...base, localUuid: uuid(), sort: i + 1, active: true, ...f }))

    await db.transaction(
      'rw',
      [db.eggCategories, db.pens, db.mortalityCauses, db.presentations, db.feedTypes],
      async () => {
        await db.eggCategories.bulkAdd(eggCats)
        await db.pens.bulkAdd(defaultPens)
        await db.mortalityCauses.bulkAdd(defaultCauses)
        await db.presentations.bulkAdd(defaultPres)
        await db.feedTypes.bulkAdd(defaultFeedTypes)
      },
    )

    applyConfig({
      id: fid,
      name,
      ownerName: owner,
      periodLockDays: config?.periodLockDays ?? 7,
      currency: config?.currency ?? 'COP',
      country: config?.country ?? 'CO',
      timezone: config?.timezone ?? guessTimezone(),
      locale: config?.locale ?? 'es-CO',
      phone: config?.phone,
    })

    persist()
    await loadCatalogs()

    return fid
  }

  /** Zona horaria del dispositivo como valor inicial razonable. */
  function guessTimezone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota'
    } catch {
      return 'America/Bogota'
    }
  }

  /**
   * Catálogos locales en el formato que espera `/auth/register`, para que el
   * servidor siembre los mismos registros con los mismos `local_uuid`.
   */
  function catalogSeed(): CatalogSeed {
    return {
      pens: pens.value.map((p) => ({
        local_uuid: p.localUuid,
        name: p.name,
        color: p.color,
        sort: p.sort,
      })),
      egg_categories: categories.value.map((c) => ({
        local_uuid: c.localUuid,
        name: c.name,
        short: c.short,
        sellable: c.sellable,
        is_broken: c.isBroken,
        color: c.color,
        sort: c.sort,
      })),
      mortality_causes: causes.value.map((c) => ({
        local_uuid: c.localUuid,
        name: c.name,
        sort: c.sort,
      })),
      presentations: presentations.value.map((p) => ({
        local_uuid: p.localUuid,
        code: p.code,
        name: p.name,
        units_per_pack: p.unitsPerPack,
        sort: p.sort,
      })),
      feed_types: feedTypes.value.map((f) => ({
        local_uuid: f.localUuid,
        name: f.name,
        unit: f.unit,
        sort: f.sort,
      })),
    }
  }

  /** Aplica la configuración de la granja al estado y al formateo global. */
  function applyConfig(stored: StoredFarm) {
    farmId.value = stored.id
    remoteFarmId.value = stored.remoteId ?? null
    farmName.value = stored.name
    ownerName.value = stored.ownerName ?? ''
    periodLockDays.value = clampLockDays(stored.periodLockDays)
    currency.value = stored.currency ?? 'COP'
    country.value = stored.country ?? 'CO'
    timezone.value = stored.timezone ?? 'America/Bogota'
    locale.value = stored.locale ?? 'es-CO'
    phone.value = stored.phone ?? ''

    setRegionalConfig({
      currency: currency.value,
      timezone: timezone.value,
      locale: locale.value,
    })

    if (remoteFarmId.value !== null) {
      api.setActiveFarm(remoteFarmId.value)
    }
  }

  function clampLockDays(days: number | undefined): number {
    if (!Number.isFinite(days)) return 7

    return Math.max(0, Math.min(365, Math.round(days as number)))
  }

  /**
   * Vincula la granja local con la del backend tras registrarse o iniciar sesión.
   * Nunca cambia `farmId`: sólo anota el id remoto y toma la configuración del
   * servidor como la buena.
   */
  function linkToBackend(remote: FarmPayload) {
    applyConfig({
      id: farmId.value || uuid(),
      remoteId: remote.id,
      name: remote.name ?? farmName.value,
      ownerName: remote.owner_name ?? ownerName.value,
      periodLockDays: remote.period_lock_days ?? periodLockDays.value,
      currency: remote.currency ?? currency.value,
      country: remote.country ?? country.value,
      timezone: remote.timezone ?? timezone.value,
      locale: remote.locale ?? locale.value,
      phone: remote.phone ?? phone.value,
    })

    persist()
  }

  /**
   * Adopta una granja del backend en un dispositivo que no la tenía (login en
   * un teléfono nuevo). Crea la identidad local y deja todo listo para que
   * `pullFromServer()` rellene los datos.
   */
  function adoptRemoteFarm(remote: FarmPayload) {
    if (!farmId.value) {
      farmId.value = uuid()
    }

    linkToBackend(remote)
  }

  function persist() {
    if (!farmId.value) return

    const stored: StoredFarm = {
      id: farmId.value,
      remoteId: remoteFarmId.value ?? undefined,
      name: farmName.value,
      ownerName: ownerName.value,
      periodLockDays: periodLockDays.value,
      currency: currency.value,
      country: country.value,
      timezone: timezone.value,
      locale: locale.value,
      phone: phone.value,
    }

    localStorage.setItem(FARM_KEY, JSON.stringify(stored))
  }

  /** Cambia el galpón activo ('' = Todos los galpones). */
  function setActivePen(penLocalUuid: string) {
    activePenId.value = penLocalUuid
    localStorage.setItem(ACTIVE_PEN_KEY, penLocalUuid)
  }

  type CatalogKind = 'egg_categories' | 'mortality_causes' | 'presentations' | 'feed_types'

  const CATALOG_ENTITY = {
    egg_categories: 'egg-category',
    mortality_causes: 'mortality-cause',
    presentations: 'presentation',
    feed_types: 'feed-type',
  } as const

  const catalogList = {
    egg_categories: () => categories.value,
    mortality_causes: () => causes.value,
    presentations: () => presentations.value,
    feed_types: () => feedTypes.value,
  } as const

  /**
   * Crea un elemento de catálogo. Pasa por el repositorio, así que queda
   * encolado para subir: antes sólo se marcaba `pendingSync: true`, un campo
   * que nadie leía, y los catálogos personalizados nunca llegaban al servidor.
   */
  async function addCatalogItem(
    kind: CatalogKind,
    data: Partial<EggCategory & MortalityCause & Presentation & FeedType>,
  ): Promise<string> {
    const auth = useAuthStore()
    const ts = nowISO()

    // El siguiente `sort` se calcula sobre el MÁXIMO, no sobre el último
    // elemento de una lista que Dexie devuelve ordenada por índice.
    const sort = nextSort(catalogList[kind]())

    const record = {
      localUuid: uuid(),
      farmId: farmId.value,
      sort,
      active: true,
      ...data,
      pendingSync: true,
      entryMode: 'auto' as const,
      createdAt: ts,
      updatedAt: ts,
      createdBy: auth.user?.id ?? 'unknown',
    } as EggCategory & MortalityCause & Presentation & FeedType

    await createRecord(CATALOG_ENTITY[kind], record)
    await loadCatalogs()

    return record.localUuid
  }

  function nextSort(list: Array<{ sort: number }>): number {
    return list.reduce((max, item) => Math.max(max, item.sort ?? 0), 0) + 1
  }

  async function updateCatalogItem(kind: CatalogKind, id: string, patch: Record<string, unknown>) {
    await updateRecord(CATALOG_ENTITY[kind], id, patch)
    await loadCatalogs()
  }

  /**
   * Reordena la lista completa.
   * Antes usaba `forEach` con un callback async, así que `loadCatalogs()` corría
   * antes de que terminaran los updates y la interfaz mostraba el orden viejo.
   */
  async function reorderCatalog(kind: CatalogKind, orderedIds: string[]) {
    await Promise.all(
      orderedIds.map((id, i) => updateRecord(CATALOG_ENTITY[kind], id, { sort: i + 1 })),
    )

    await loadCatalogs()
  }

  /** Crea un galpón en la granja activa. */
  async function addPen(name: string, color = '#16a34a'): Promise<string> {
    const auth = useAuthStore()
    const ts = nowISO()

    const pen: Pen = {
      localUuid: uuid(),
      farmId: farmId.value,
      name: name.trim(),
      active: true,
      sort: nextSort(pens.value),
      color,
      pendingSync: true,
      entryMode: 'auto',
      createdAt: ts,
      updatedAt: ts,
      createdBy: auth.user?.id ?? 'unknown',
    }

    await createRecord('pen', pen)
    await loadCatalogs()

    return pen.localUuid
  }

  async function updatePen(id: string, patch: Partial<Pick<Pen, 'name' | 'color' | 'active'>>) {
    await updateRecord('pen', id, patch)
    await loadCatalogs()
  }

  /**
   * Empareja los catálogos locales con el snapshot del backend.
   *
   * El emparejamiento es por `local_uuid`, que es exacto porque el registro le
   * envía al servidor los catálogos con sus UUID. El nombre queda sólo como
   * último recurso para granjas creadas antes de este cambio: emparejar por
   * nombre asigna el `remoteId` equivocado cuando hay nombres repetidos o el
   * usuario renombró algo.
   */
  async function mergeCatalogsFromBackend(): Promise<void> {
    if (!farmId.value) return

    let boot: BootPayload
    try {
      boot = await api.boot()
    } catch (e) {
      console.warn('[farm] no se pudo obtener boot del backend', e)

      return
    }

    linkToBackend(boot.farm)

    const pairs: Array<[CatalogKind | 'pens', BootCatalog[]]> = [
      ['pens', boot.pens ?? []],
      ['egg_categories', boot.egg_categories ?? []],
      ['presentations', boot.presentations ?? []],
      ['mortality_causes', boot.mortality_causes ?? []],
      ['feed_types', boot.feed_types ?? []],
    ]

    const tables = {
      pens: db.pens,
      egg_categories: db.eggCategories,
      presentations: db.presentations,
      mortality_causes: db.mortalityCauses,
      feed_types: db.feedTypes,
    } as const

    let matched = 0

    for (const [kind, remotes] of pairs) {
      const table = tables[kind]
      const locals = await table.where('farmId').equals(farmId.value).toArray()
      const usedRemoteIds = new Set<number>()

      for (const local of locals) {
        const byUuid = remotes.find((r) => r.local_uuid && r.local_uuid === local.localUuid)

        // El respaldo por nombre sólo considera remotos SIN local_uuid (no
        // pertenecen a ningún registro local) y aún sin emparejar, para no
        // robarle el id a otro elemento que sí coincide por UUID.
        const byName = byUuid
          ? undefined
          : remotes.find(
              (r) =>
                !r.local_uuid &&
                !usedRemoteIds.has(r.id) &&
                String(r.name).trim().toLowerCase() === String(local.name).trim().toLowerCase(),
            )

        const remote = byUuid ?? byName
        if (!remote) continue

        usedRemoteIds.add(remote.id)

        if (remote.id !== local.remoteId || local.pendingSync) {
          // Al enlazar dejamos de marcarlo como pendiente: el servidor ya tiene
          // este registro. Si no, la descarga lo trataría siempre como "con
          // cambios locales" y nunca aceptaría la versión del servidor.
          await table.update(local.localUuid, { remoteId: remote.id, pendingSync: false })
          matched++
        }
      }
    }

    await loadCatalogs()
    console.info(`[farm] merge OK: ${matched} catálogos enlazados con el backend`)
  }

  function setPeriodLockDays(days: number) {
    periodLockDays.value = clampLockDays(days)
    persist()
  }

  /**
   * Guarda la configuración elegida en el asistente o en Ajustes.
   * Actualiza el estado local + localStorage y, si hay backend, el servidor.
   */
  async function applySetupConfig(config: {
    periodLockDays?: number
    currency?: string
    country?: string
    timezone?: string
    locale?: string
    phone?: string
  }) {
    if (config.periodLockDays !== undefined) periodLockDays.value = clampLockDays(config.periodLockDays)
    if (config.currency) currency.value = config.currency
    if (config.country) country.value = config.country
    if (config.timezone) timezone.value = config.timezone
    if (config.locale) locale.value = config.locale
    if (config.phone !== undefined) phone.value = config.phone

    setRegionalConfig({
      currency: currency.value,
      timezone: timezone.value,
      locale: locale.value,
    })

    persist()

    const auth = useAuthStore()
    if (!auth.hasBackendSession) return

    try {
      const { farm } = await api.updateFarm({
        period_lock_days: periodLockDays.value,
        currency: currency.value,
        country: country.value,
        timezone: timezone.value,
        locale: locale.value,
        phone: phone.value || null,
      })

      linkToBackend(farm)
    } catch (e) {
      // Sin conexión la configuración queda local y se reenvía al volver a
      // guardar; no bloqueamos al usuario por esto.
      console.warn('[farm] no se pudo guardar la configuración en el backend', e)
    }
  }

  function restore(): boolean {
    const raw = localStorage.getItem(FARM_KEY)
    if (!raw) return false

    try {
      const parsed = JSON.parse(raw) as StoredFarm
      if (!parsed?.id) return false

      applyConfig(parsed)

      return true
    } catch {
      return false
    }
  }

  async function init() {
    const ok = restore()
    if (ok) await loadCatalogs()

    return ok
  }

  /** Limpia el estado y, opcionalmente, los datos locales de la granja. */
  async function reset(options: { wipeData?: boolean } = {}) {
    const id = farmId.value

    if (options.wipeData && id) {
      await wipeFarmData(id)
    }

    farmId.value = ''
    remoteFarmId.value = null
    farmName.value = ''
    ownerName.value = ''
    activePenId.value = ''
    categories.value = []
    pens.value = []
    causes.value = []
    presentations.value = []
    feedTypes.value = []

    localStorage.removeItem(FARM_KEY)
    localStorage.removeItem(ACTIVE_PEN_KEY)
    api.clearActiveFarm()
  }

  return {
    farmId,
    remoteFarmId,
    farmName,
    ownerName,
    periodLockDays,
    currency,
    country,
    timezone,
    locale,
    phone,
    categories,
    pens,
    activePens,
    activePenId,
    activePen,
    causes,
    presentations,
    feedTypes,
    isConfigured,
    isLinkedToBackend,
    sellableCategories,
    activeCategories,
    activeCauses,
    activePresentations,
    activeFeedTypes,
    loadCatalogs,
    bootstrapFarm,
    catalogSeed,
    linkToBackend,
    adoptRemoteFarm,
    setActivePen,
    addPen,
    updatePen,
    setPeriodLockDays,
    applySetupConfig,
    addCatalogItem,
    updateCatalogItem,
    reorderCatalog,
    mergeCatalogsFromBackend,
    restore,
    init,
    reset,
  }
})
