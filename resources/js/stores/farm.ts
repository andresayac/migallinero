import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '@/db/db'
import { api, type BootCatalog } from '@/api/http'
import type { EggCategory, Pen, MortalityCause, Presentation } from '@/types/domain'
import { uuid, nowISO } from '@/utils/format'
import { useAuthStore } from './auth'

/**
 * Granja activa + catálogos.
 *
 * MVP: el usuario tiene UNA sola granja. Al "registrarse" la creamos acá
 * (configurada con valores por defecto para Colombia). El modelo ya está
 * preparado para que en el futuro un usuario pueda gestionar varias.
 *
 * Los catálogos (corrales, categorías, causas, presentaciones) son POR GRANJA
 * y viven en Dexie con farmId.
 */
export const useFarmStore = defineStore('farm', () => {
  const farmId = ref<string>('')
  const farmName = ref<string>('')
  /** Días hacia atrás permitidos para registrar (candado de período). */
  const periodLockDays = ref<number>(7)

  const categories = ref<EggCategory[]>([])
  const pens = ref<Pen[]>([])
  const causes = ref<MortalityCause[]>([])
  const presentations = ref<Presentation[]>([])

  /** Galpón activo para filtrar. '' = "Todos los galpones". */
  const activePenId = ref<string>('')

  const isConfigured = computed(() => !!farmId.value)
  const sellableCategories = computed(() =>
    categories.value.filter((c) => c.sellable && !c.isBroken).sort((a, b) => a.sort - b.sort),
  )
  const activePens = computed(() => pens.value.filter((p) => p.active).sort((a, b) => a.sort - b.sort))
  const activePen = computed<Pen | undefined>(() =>
    pens.value.find((p) => p.localUuid === activePenId.value),
  )

  /** Recolecta los catálogos de la granja activa desde Dexie. */
  async function loadCatalogs() {
    if (!farmId.value) return
    const [cats, ps, cs, pres] = await Promise.all([
      db.eggCategories.where('farmId').equals(farmId.value).toArray(),
      db.pens.where('farmId').equals(farmId.value).toArray(),
      db.mortalityCauses.where('farmId').equals(farmId.value).toArray(),
      db.presentations.where('farmId').equals(farmId.value).toArray(),
    ])
    categories.value = cats.sort((a, b) => a.sort - b.sort)
    pens.value = ps.sort((a, b) => a.sort - b.sort)
    causes.value = cs.sort((a, b) => a.sort - b.sort)
    presentations.value = pres.sort((a, b) => a.sort - b.sort)

    // Restaurar galpón activo guardado (si sigue existiendo).
    const saved = localStorage.getItem('mg_active_pen')
    if (saved && pens.value.some((p) => p.localUuid === saved)) {
      activePenId.value = saved
    } else {
      activePenId.value = ''
    }
  }

  /**
   * Crea una granja nueva para el usuario con los catálogos por defecto de Colombia.
   * Se llama al "registrarse". El usuario queda como admin.
   */
  async function bootstrapFarm(ownerName: string, farmName: string) {
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

    // Categorías iniciales de huevo (configurables después desde Ajustes).
    const eggCats: EggCategory[] = [
      { ...base, localUuid: uuid(), name: 'Jumbo', short: 'JUM', sellable: true, isBroken: false, color: '#16a34a', sort: 1, active: true },
      { ...base, localUuid: uuid(), name: 'EX', short: 'EX', sellable: true, isBroken: false, color: '#0ea5e9', sort: 2, active: true },
      { ...base, localUuid: uuid(), name: 'AA', short: 'AA', sellable: true, isBroken: false, color: '#8b5cf6', sort: 3, active: true },
      { ...base, localUuid: uuid(), name: 'A', short: 'A', sellable: true, isBroken: false, color: '#f59e0b', sort: 4, active: true },
      { ...base, localUuid: uuid(), name: 'B', short: 'B', sellable: true, isBroken: false, color: '#ec4899', sort: 5, active: true },
      { ...base, localUuid: uuid(), name: 'C', short: 'C', sellable: true, isBroken: false, color: '#64748b', sort: 6, active: true },
      { ...base, localUuid: uuid(), name: 'Rotos', short: 'ROT', sellable: false, isBroken: true, color: '#dc2626', sort: 7, active: true },
    ]

    // Un galpón por defecto que el admin puede luego editar/agregar.
    const defaultPens: Pen[] = [
      { ...base, localUuid: uuid(), name: 'Galpón 1', active: true, sort: 1, color: '#16a34a' },
    ]

    // Causas de mortalidad típicas (configurables).
    const defaultCauses: MortalityCause[] = [
      { ...base, localUuid: uuid(), name: 'Enfermedad', active: true, sort: 1 },
      { ...base, localUuid: uuid(), name: 'Accidente', active: true, sort: 2 },
      { ...base, localUuid: uuid(), name: 'Ataque de animal', active: true, sort: 3 },
      { ...base, localUuid: uuid(), name: 'Calor', active: true, sort: 4 },
      { ...base, localUuid: uuid(), name: 'Frío', active: true, sort: 5 },
      { ...base, localUuid: uuid(), name: 'Causa desconocida', active: true, sort: 6 },
      { ...base, localUuid: uuid(), name: 'Otra causa', active: true, sort: 7 },
    ]

    // Presentaciones de venta (configurables): unidad, cubeta, torre.
    const defaultPres: Presentation[] = [
      { ...base, localUuid: uuid(), code: 'unit', name: 'Unidad', unitsPerPack: 1, sort: 1, active: true },
      { ...base, localUuid: uuid(), code: 'cubeta', name: 'Cubeta (30)', unitsPerPack: 30, sort: 2, active: true },
      { ...base, localUuid: uuid(), code: 'torre', name: 'Torre (300)', unitsPerPack: 300, sort: 3, active: true },
    ]

    await db.transaction('rw', [db.eggCategories, db.pens, db.mortalityCauses, db.presentations], async () => {
      await db.eggCategories.bulkAdd(eggCats)
      await db.pens.bulkAdd(defaultPens)
      await db.mortalityCauses.bulkAdd(defaultCauses)
      await db.presentations.bulkAdd(defaultPres)
    })

    setActive(fid, farmName, 7)
    await loadCatalogs()

    // Persistimos la granja activa (MVP: una sola).
    localStorage.setItem(
      'mg_farm',
      JSON.stringify({ id: fid, name: farmName, ownerName, periodLockDays: 7 }),
    )
    return fid
  }

  function setActive(id: string, name: string, lockDays?: number) {
    farmId.value = id
    farmName.value = name
    if (lockDays !== undefined) periodLockDays.value = lockDays
  }

  /** Cambia el galpón activo ('' = Todos los galpones). */
  function setActivePen(penLocalUuid: string) {
    activePenId.value = penLocalUuid
    localStorage.setItem('mg_active_pen', penLocalUuid)
  }

  /**
   * Crea, renombra u ordena cualquier catálogo de la granja.
   * Pensado para que el admin ajuste categorías de huevo, causas de
   * mortalidad y presentaciones sin tocar código.
   *
   * `kind` define qué tabla usar; cada registro queda con pendingSync=true
   * para que viaje con la siguiente sincronización.
   */
  type CatalogKind = 'egg_categories' | 'mortality_causes' | 'presentations'
  // Tipado como any porque cada tabla Dexie tiene un genérico distinto y
  // aquí sólo nos interesa una operación CRUD uniforme.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catalogTable: Record<CatalogKind, any> = {
    egg_categories: db.eggCategories,
    mortality_causes: db.mortalityCauses,
    presentations: db.presentations,
  }

  async function addCatalogItem(kind: CatalogKind, data: Partial<EggCategory & MortalityCause & Presentation>): Promise<string> {
    const auth = useAuthStore()
    const ts = nowISO()
    const table = catalogTable[kind]
    const list = (await table.where('farmId').equals(farmId.value).toArray()) as Array<{ sort: number }>
    const sort = (list.at(-1)?.sort ?? 0) + 1
    const id = uuid()
    await table.add({
      localUuid: id,
      farmId: farmId.value,
      sort,
      active: true,
      ...data,
      pendingSync: true,
      entryMode: 'auto',
      createdAt: ts,
      updatedAt: ts,
      createdBy: auth.user?.id ?? 'unknown',
    } as EggCategory & MortalityCause & Presentation)
    await loadCatalogs()
    return id
  }

  async function updateCatalogItem(kind: CatalogKind, id: string, patch: Record<string, unknown>) {
    await catalogTable[kind].update(id, { ...patch, updatedAt: nowISO(), pendingSync: true })
    await loadCatalogs()
  }

  /** Reordena lista completa (array de ids en nuevo orden). */
  async function reorderCatalog(kind: CatalogKind, orderedIds: string[]) {
    const table = catalogTable[kind]
    orderedIds.forEach(async (id, i) => {
      await table.update(id, { sort: i + 1, updatedAt: nowISO(), pendingSync: true })
    })
    await loadCatalogs()
  }

  /** Crea un nuevo galpón en la granja activa. */
  async function addPen(name: string, color = '#16a34a'): Promise<string> {
    const auth = useAuthStore()
    const ts = nowISO()
    const sort = (pens.value.at(-1)?.sort ?? 0) + 1
    const pen: Pen = {
      localUuid: uuid(),
      farmId: farmId.value,
      name: name.trim(),
      active: true,
      sort,
      color,
      pendingSync: true,
      entryMode: 'auto',
      createdAt: ts,
      updatedAt: ts,
      createdBy: auth.user?.id ?? 'unknown',
    }
    await db.pens.add(pen)
    await loadCatalogs()
    return pen.localUuid
  }

  /** Edita nombre/color de un galpón (admin). */
  async function updatePen(id: string, patch: Partial<Pick<Pen, 'name' | 'color' | 'active'>>) {
    await db.pens.update(id, { ...patch, updatedAt: nowISO(), pendingSync: true })
    await loadCatalogs()
  }

  /**
   * Sincroniza los catálogos locales con el snapshot del backend tras login.
   *
   * Como tanto el backend como el cliente siembran los mismos catálogos por
   * defecto con los mismos nombres, hacemos matching por `name` (más simple
   * y robusto que por local_uuid porque el backend genera ids distintos).
   *
   * Tras el merge, cada registro local queda con su `remoteId` asignado, así
   * cuando se generan ventas/tandas las FKs apuntan al id correcto y el
   * backend las resuelve sin truncar.
   */
  async function mergeCatalogsFromBackend(): Promise<void> {
    if (!farmId.value) return
    let boot
    try {
      boot = await api.boot()
    } catch (e) {
      console.warn('[farm] no se pudo obtener boot del backend', e)
      return
    }

    // Sincronizamos el período de candado con el del backend.
    if (typeof boot.farm.period_lock_days === 'number') {
      periodLockDays.value = boot.farm.period_lock_days
      persistFarmMeta()
    }

    const matchByName = (locals: { localUuid: string; name: string; remoteId?: number }[], remotes: BootCatalog[]) => {
      const out: { localUuid: string; remoteId: number }[] = []
      for (const loc of locals) {
        // 1) por local_uuid si el backend lo trae y coincide
        const byUuid = remotes.find((r) => r.local_uuid && r.local_uuid === (loc as unknown as { localUuid?: string }).localUuid)
        // 2) por nombre normalizado
        const byName = remotes.find(
          (r) => String(r.name).trim().toLowerCase() === String(loc.name).trim().toLowerCase(),
        )
        const remote = byUuid ?? byName
        if (remote && remote.id !== loc.remoteId) {
          out.push({ localUuid: loc.localUuid, remoteId: remote.id })
        }
      }
      return out
    }

    type WithUuid = { localUuid: string; name: string; remoteId?: number }
    const pens = (await db.pens.where('farmId').equals(farmId.value).toArray()) as WithUuid[]
    const cats = (await db.eggCategories.where('farmId').equals(farmId.value).toArray()) as WithUuid[]
    const pres = (await db.presentations.where('farmId').equals(farmId.value).toArray()) as WithUuid[]
    const causes = (await db.mortalityCauses.where('farmId').equals(farmId.value).toArray()) as WithUuid[]

    const matches = [
      ...matchByName(pens, boot.pens).map((m) => ({ store: db.pens, ...m })),
      ...matchByName(cats, boot.egg_categories).map((m) => ({ store: db.eggCategories, ...m })),
      ...matchByName(pres, boot.presentations).map((m) => ({ store: db.presentations, ...m })),
      ...matchByName(causes, boot.mortality_causes).map((m) => ({ store: db.mortalityCauses, ...m })),
    ]

    for (const m of matches) {
      await m.store.update(m.localUuid, { remoteId: m.remoteId } as Partial<Pen> & Record<string, unknown>)
    }

    await loadCatalogs()
    console.info(`[farm] merge OK: ${matches.length} catálogos sincronizados con el backend`)
  }

  /** Cambia la ventana de días permitidos hacia atrás (candado de período). */
  function setPeriodLockDays(days: number) {
    periodLockDays.value = Math.max(0, Math.min(365, Math.round(days)))
    persistFarmMeta()
  }

  function persistFarmMeta() {
    const raw = localStorage.getItem('mg_farm')
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      parsed.periodLockDays = periodLockDays.value
      localStorage.setItem('mg_farm', JSON.stringify(parsed))
    } catch {
      /* noop */
    }
  }

  function restore(): boolean {
    const raw = localStorage.getItem('mg_farm')
    if (!raw) return false
    try {
      const parsed = JSON.parse(raw) as {
        id: string
        name: string
        ownerName: string
        periodLockDays?: number
      }
      farmId.value = parsed.id
      farmName.value = parsed.name
      periodLockDays.value = parsed.periodLockDays ?? 7
      return !!farmId.value
    } catch {
      return false
    }
  }

  async function init() {
    const ok = restore()
    if (ok) await loadCatalogs()
    return ok
  }

  return {
    farmId,
    farmName,
    periodLockDays,
    categories,
    pens,
    activePens,
    activePenId,
    activePen,
    causes,
    presentations,
    isConfigured,
    sellableCategories,
    loadCatalogs,
    bootstrapFarm,
    setActive,
    setActivePen,
    addPen,
    updatePen,
    setPeriodLockDays,
    addCatalogItem,
    updateCatalogItem,
    reorderCatalog,
    mergeCatalogsFromBackend,
    restore,
    init,
  }
})
