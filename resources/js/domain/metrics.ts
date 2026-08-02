import type {
  ChickenMovement,
  EggCategory,
  EggCollection,
  FeedPurchase,
  FeedRecord,
  FeedType,
  Payment,
  Sale,
} from '@/types/domain'
import { addDays, dayKey, endOfFarmDay, startOfFarmDay, toMoney } from '@/utils/format'

/**
 * Indicadores de producción avícola.
 *
 * Funciones puras: reciben arreglos y devuelven valores. Sin Dexie y sin
 * stores, para poder probarlas sin base de datos. `useMetrics` se encarga de
 * cargar los datos; aquí sólo se calcula.
 *
 * Regla general: lo que no se puede calcular devuelve `null`, nunca 0. Una
 * postura de 0 % y una postura desconocida son cosas distintas, y mostrar 0 %
 * cuando no hay gallinas sería mentir.
 */

/** Instante operativo de un movimiento; `createdAt` es el respaldo histórico. */
function movementTime(movement: ChickenMovement): number {
  return new Date(movement.movementAt ?? movement.createdAt).getTime()
}

/**
 * Aves vivas según los movimientos.
 *
 * `adjust` puede ser negativo (la cantidad es un entero con signo) y se suma
 * tal cual; `transfer` sólo mueve aves entre galpones de la misma granja, así
 * que altera el total de un galpón pero no el de la granja.
 *
 * @param penId '' = toda la granja.
 */
export function aliveChickens(movements: ChickenMovement[], penId = ''): number {
  const scoped = penId ? movements.filter((m) => m.penId === penId) : movements

  const sum = (type: string) =>
    scoped.filter((m) => m.type === type).reduce((total, m) => total + m.qty, 0)

  let delta =
    sum('buy') + sum('birth') + sum('adjust') - sum('death') - sum('sale') - sum('revoke')

  if (penId) {
    delta += sum('transfer')
  }

  return Math.max(0, delta)
}

/** Aves vivas al final de un instante dado. Base del cálculo de ave-día. */
export function aliveChickensAt(movements: ChickenMovement[], at: Date, penId = ''): number {
  const limit = at.getTime()

  return aliveChickens(
    movements.filter((m) => movementTime(m) <= limit),
    penId,
  )
}

/** Ventana de fechas de un cálculo. Los extremos se redondean al día operativo. */
export interface MetricsWindow {
  from: Date
  to: Date
}

/**
 * Todo el historial. Para stock acumulado, que no depende de una ventana.
 *
 * El límite superior NO es el máximo representable por Date: `startOfFarmDay`
 * reconstruye la fecha desde `dayKey`, y un año de cinco cifras necesita el
 * prefijo `+` en ISO. Sin él la fecha sale inválida, el filtro descarta TODO y
 * el consumo acumulado daba cero — el stock parecía intacto para siempre.
 */
export const ALL_TIME: MetricsWindow = {
  from: new Date(0),
  to: new Date('9999-12-31T00:00:00.000Z'),
}

/**
 * Datos que necesita el motor. Los carga `useMetrics` desde Dexie.
 * `penId` vacío significa toda la granja.
 */
export interface MetricsInput {
  collections: EggCollection[]
  movements: ChickenMovement[]
  sales: Sale[]
  payments: Payment[]
  feedRecords: FeedRecord[]
  feedPurchases: FeedPurchase[]
  feedTypes: FeedType[]
  categories: EggCategory[]
  penId: string
}

/** Un día operativo de la granja: su clave y sus instantes de inicio y fin. */
export interface FarmDay {
  /** YYYY-MM-DD en la zona de la granja. */
  key: string
  start: Date
  end: Date
}

/**
 * Días operativos de la ventana, en la zona horaria de la granja.
 *
 * Devuelve los instantes junto con la clave para que quien recorra los días no
 * tenga que reconstruir la fecha desde el texto. Reconstruirla como
 * `${key}T12:00:00Z` parece inofensivo y funciona en América, pero en una zona
 * UTC+12 o mayor el mediodía UTC cae al día siguiente local y la serie entera
 * se desplaza una jornada.
 *
 * Cada vuelta se renormaliza con `startOfFarmDay` en vez de ir sumando
 * milisegundos: así un cambio de horario de verano tampoco desplaza la serie.
 */
export function farmDays(window: MetricsWindow): FarmDay[] {
  const days: FarmDay[] = []
  const last = startOfFarmDay(window.to).getTime()
  let cursor = startOfFarmDay(window.from)

  // Tope de seguridad: una ventana absurda no debe colgar la interfaz.
  while (cursor.getTime() <= last && days.length < 4000) {
    days.push({
      key: dayKey(cursor),
      start: cursor,
      end: new Date(cursor.getTime() + 86_400_000 - 1),
    })

    cursor = startOfFarmDay(addDays(cursor, 1))
  }

  return days
}

/** Sólo las claves de día. Para etiquetas de gráficas. */
export function dayKeysBetween(window: MetricsWindow): string[] {
  return farmDays(window).map((day) => day.key)
}

/** Filtra por ventana usando la fecha operativa que indique `at`. */
export function inWindow<T>(rows: T[], window: MetricsWindow, at: (row: T) => string): T[] {
  const from = startOfFarmDay(window.from).getTime()
  const to = endOfFarmDay(window.to).getTime()

  return rows.filter((row) => {
    const time = new Date(at(row)).getTime()

    return !Number.isNaN(time) && time >= from && time <= to
  })
}

/**
 * Ave-día: suma de las aves vivas de cada día de la ventana.
 *
 * Es el denominador estándar del porcentaje de postura. Dividir por el plantel
 * al final del periodo daría un número inflado, porque el plantel baja con las
 * muertes que ocurren dentro de la propia ventana.
 */
export function henDays(
  movements: ChickenMovement[],
  window: MetricsWindow,
  penId = '',
): number {
  return farmDays(window).reduce(
    (total, day) => total + aliveChickensAt(movements, day.end, penId),
    0,
  )
}

/**
 * Huevos puestos en la ventana.
 *
 * Cuenta `total`, que es la suma desnormalizada de las líneas y es lo mismo que
 * usa la tarjeta "Huevos hoy" del inicio: así los dos números coinciden. Entran
 * todas las categorías, rotos incluidos — una gallina que puso un huevo roto
 * puso un huevo. El filtro por `sellable` es cosa del inventario y las ventas.
 */
export function eggsLaid(
  collections: EggCollection[],
  window: MetricsWindow,
  penId = '',
): number {
  return inWindow(collections, window, (c) => c.collectionAt)
    .filter((c) => !penId || c.penId === penId)
    .reduce((total, c) => total + c.total, 0)
}

/**
 * Porcentaje de postura como fracción (0.82 = 82 %).
 *
 * Devuelve `null` si no hay ave-día: sin gallinas la postura es desconocida,
 * no cero.
 */
export function layingRate(input: MetricsInput, window: MetricsWindow): number | null {
  const days = henDays(input.movements, window, input.penId)

  if (days <= 0) return null

  return eggsLaid(input.collections, window, input.penId) / days
}

/**
 * Factor para pasar la unidad de un tipo de alimento a kilogramos.
 *
 * Las compras siempre dan kg (`bags × kgPerBag`), pero el consumo se registra
 * en la unidad del tipo, que es texto libre. Si esa unidad no es kg, se usa el
 * `kgPerBag` más reciente registrado para ese tipo.
 *
 * Devuelve `null` cuando no hay forma de saberlo: el tipo no se mide en kg y
 * nunca se ha comprado. Adivinar en silencio falsearía el stock.
 */
export function kgFactor(
  feedTypeId: string,
  feedTypes: FeedType[],
  purchases: FeedPurchase[],
): number | null {
  const type = feedTypes.find((t) => t.localUuid === feedTypeId)

  // Tipo desconocido: no está en el catálogo de esta granja. Sin unidad no hay
  // conversión posible. Antes caía en la rama de los bultos y multiplicaba por
  // el kgPerBag de una compra cualquiera: 24 kg de consumo se reportaban como
  // 960 kg/día, y la alerta lo afirmaba como un hecho.
  if (!type) return null

  const unit = (type.unit ?? '').trim().toLowerCase()

  if (unit === 'kg') return 1

  const candidates = purchases
    .flatMap((purchase) =>
      (purchase.lines ?? [])
        .filter((line) => line.feedTypeId === feedTypeId && line.kgPerBag > 0)
        .map((line) => ({ kgPerBag: line.kgPerBag, at: new Date(purchase.purchasedAt).getTime() })),
    )
    .sort((a, b) => b.at - a.at)

  return candidates[0]?.kgPerBag ?? null
}

export interface FeedKg {
  kg: number
  /** Nombres de los tipos que no se pudieron convertir; la interfaz los declara. */
  excludedTypes: string[]
}

/** Alimento consumido en la ventana, convertido a kg. */
export function feedConsumedKg(input: MetricsInput, window: MetricsWindow): FeedKg {
  const records = inWindow(input.feedRecords, window, (r) => r.recordedAt).filter(
    (r) => !input.penId || r.penId === input.penId,
  )

  const excluded = new Set<string>()
  let kg = 0

  for (const record of records) {
    for (const line of record.lines ?? []) {
      const factor = kgFactor(line.feedTypeId, input.feedTypes, input.feedPurchases)

      if (factor === null) {
        const name =
          line.feedTypeName ??
          input.feedTypes.find((t) => t.localUuid === line.feedTypeId)?.name ??
          'Sin nombre'

        excluded.add(name)
        continue
      }

      kg += line.qty * factor
    }
  }

  return { kg, excludedTypes: [...excluded] }
}

/** Costo del alimento consumido en la ventana. Ya viene desnormalizado. */
export function feedCost(input: MetricsInput, window: MetricsWindow): number {
  return inWindow(input.feedRecords, window, (r) => r.recordedAt)
    .filter((r) => !input.penId || r.penId === input.penId)
    .reduce((total, record) => total + record.totalCost, 0)
}

/**
 * Conversión alimentaria: kg de alimento por docena producida.
 * Referencia de la industria: 2.0 a 2.3 kg por docena.
 */
export function feedConversion(input: MetricsInput, window: MetricsWindow): number | null {
  const eggs = eggsLaid(input.collections, window, input.penId)

  if (eggs <= 0) return null

  return feedConsumedKg(input, window).kg / (eggs / 12)
}

/** Costo de alimento por huevo. Marca el precio bajo el cual no se puede vender. */
export function feedCostPerEgg(input: MetricsInput, window: MetricsWindow): number | null {
  const eggs = eggsLaid(input.collections, window, input.penId)

  if (eggs <= 0) return null

  return feedCost(input, window) / eggs
}

export interface IncomeOverFeed {
  /** Ventas del periodo, sin las anuladas. */
  sales: number
  /** Pagos recibidos en el periodo, sin los anulados. Plata en mano. */
  collected: number
  feedCost: number
  /** Ventas menos costo del alimento consumido. */
  iofc: number
}

/**
 * Ingreso menos costo de alimento.
 *
 * Es el indicador estándar en producción comercial de huevo, porque el alimento
 * es el 65-75 % del costo. NO es utilidad neta: la app no captura droga, luz ni
 * mano de obra, y llamarlo utilidad sería falso.
 *
 * Las ventas no se filtran por galpón: una venta no pertenece a ninguno. El
 * costo del alimento sí respeta `penId`.
 */
export function incomeOverFeedCost(input: MetricsInput, window: MetricsWindow): IncomeOverFeed {
  const sales = inWindow(input.sales, window, (s) => s.soldAt)
    .filter((s) => s.status !== 'void')
    .reduce((total, s) => total + s.total, 0)

  const collected = inWindow(input.payments, window, (p) => p.paidAt)
    .filter((p) => !p.voidedAt)
    .reduce((total, p) => total + p.amount, 0)

  const cost = feedCost(input, window)

  return {
    sales: toMoney(sales),
    collected: toMoney(collected),
    feedCost: toMoney(cost),
    iofc: toMoney(sales - cost),
  }
}

export interface FeedStock {
  /** Días que dura el stock al ritmo actual. `null` si no hay con qué proyectar. */
  days: number | null
  stockKg: number
  dailyKg: number
  excludedTypes: string[]
}

/** Días de consumo con los que se estima el ritmo diario. */
const FEED_RATE_DAYS = 14

/**
 * Días de alimento restantes.
 *
 * SIEMPRE de toda la granja: se ignora `penId` a propósito. `feed_purchases` no
 * tiene galpón —el alimento se compra para la granja— mientras que
 * `feed_records` sí lo tiene. Filtrar el consumo por galpón contra unas compras
 * sin filtrar daría un stock inflado. La interfaz debe etiquetarlo como dato de
 * toda la granja cuando haya un galpón seleccionado.
 */
export function feedStockDays(input: MetricsInput, today: Date = new Date()): FeedStock {
  const farmWide: MetricsInput = { ...input, penId: '' }

  const purchasedKg = input.feedPurchases.reduce(
    (total, purchase) =>
      total + (purchase.lines ?? []).reduce((sum, line) => sum + line.bags * line.kgPerBag, 0),
    0,
  )

  const consumed = feedConsumedKg(farmWide, ALL_TIME)
  const stockKg = purchasedKg - consumed.kg

  const recent = feedConsumedKg(farmWide, {
    from: startOfFarmDay(addDays(today, -FEED_RATE_DAYS)),
    to: endOfFarmDay(addDays(today, -1)),
  })

  const dailyKg = recent.kg / FEED_RATE_DAYS
  const excludedTypes = [...new Set([...consumed.excludedTypes, ...recent.excludedTypes])]

  if (dailyKg <= 0) {
    return { days: null, stockKg, dailyKg: 0, excludedTypes }
  }

  return {
    // Stock negativo significa que faltan compras por registrar. Avisar de que
    // no queda alimento es más útil que mostrar un número negativo.
    days: Math.max(0, Math.floor(stockKg / dailyKg)),
    stockKg,
    dailyKg,
    excludedTypes,
  }
}

export interface DailyRate {
  /** Clave YYYY-MM-DD en la zona de la granja. */
  day: string
  eggs: number
  hens: number
  /** Fracción 0-1, o `null` si ese día no había aves. */
  rate: number | null
}

/** Serie diaria de postura, para la gráfica y para detectar caídas. */
export function dailyLayingRate(input: MetricsInput, window: MetricsWindow): DailyRate[] {
  return farmDays(window).map((day) => {
    const eggs = eggsLaid(input.collections, { from: day.start, to: day.end }, input.penId)
    const hens = aliveChickensAt(input.movements, day.end, input.penId)

    return { day: day.key, eggs, hens, rate: hens > 0 ? eggs / hens : null }
  })
}

export interface LayingDrop {
  dropping: boolean
  /** Postura media de referencia, fracción 0-1. */
  reference: number
  /** Postura de los tres días evaluados, del más antiguo al más reciente. */
  recent: number[]
}

/** Días de referencia y días evaluados. No se solapan, a propósito. */
const DROP_REFERENCE_FROM = 17
const DROP_REFERENCE_TO = 4
const DROP_RECENT_DAYS = 3
const DROP_THRESHOLD = 0.9

/**
 * Caída de postura sostenida.
 *
 * Compara los tres últimos días cerrados contra el promedio de los 14 días
 * anteriores. Los dos tramos NO se solapan: si la referencia incluyera los días
 * de la caída, se arrastraría hacia abajo y la alerta se taparía sola justo
 * cuando más importa.
 *
 * El día de hoy queda fuera porque está incompleto: todavía se están recogiendo
 * huevos y su postura parecería baja siempre.
 *
 * Umbral fijo del 90 % en vez de desviaciones estándar: el avicultor tiene que
 * poder entender por qué le saltó el aviso.
 */
export function layingDrop(input: MetricsInput, today: Date = new Date()): LayingDrop | null {
  const reference = dailyLayingRate(input, {
    from: startOfFarmDay(addDays(today, -DROP_REFERENCE_FROM)),
    to: endOfFarmDay(addDays(today, -DROP_REFERENCE_TO)),
  }).filter((day) => day.rate !== null)

  if (reference.length === 0) return null

  const average = reference.reduce((sum, day) => sum + (day.rate ?? 0), 0) / reference.length

  // Una referencia de cero no sirve para comparar: significa que hay gallinas
  // pero nadie ha registrado recolecciones, no que la postura se haya caído.
  if (average <= 0) return null

  const recent = dailyLayingRate(input, {
    from: startOfFarmDay(addDays(today, -DROP_RECENT_DAYS)),
    to: endOfFarmDay(addDays(today, -1)),
  })

  if (recent.length < DROP_RECENT_DAYS || recent.some((day) => day.rate === null)) return null

  const rates = recent.map((day) => day.rate as number)

  return {
    dropping: rates.every((rate) => rate < average * DROP_THRESHOLD),
    reference: average,
    recent: rates,
  }
}

export interface SlowPayer {
  customerId: string
  overdueSales: number
  total: number
  oldestDays: number
}

const OVERDUE_DAYS = 14
const OVERDUE_SALES = 2

/**
 * Clientes con retraso recurrente.
 *
 * Se calcula sólo con las ventas, sin cruzar pagos: un `payment` puede no estar
 * atado a una venta (abono al saldo global del cliente, `saleId` opcional), así
 * que "cuántos días tardó en pagar" no es calculable de forma fiable. "Tiene dos
 * o más ventas vencidas" sí lo es.
 */
export function slowPayers(sales: Sale[], today: Date = new Date()): SlowPayer[] {
  const byCustomer = new Map<string, { total: number; count: number; oldestDays: number }>()

  for (const sale of sales) {
    if (sale.status === 'void' || sale.balance <= 0 || !sale.customerId) continue

    const soldAt = new Date(sale.soldAt).getTime()
    if (Number.isNaN(soldAt)) continue

    const days = Math.floor((today.getTime() - soldAt) / 86_400_000)
    if (days < OVERDUE_DAYS) continue

    const entry = byCustomer.get(sale.customerId) ?? { total: 0, count: 0, oldestDays: 0 }

    entry.total += sale.balance
    entry.count += 1
    entry.oldestDays = Math.max(entry.oldestDays, days)

    byCustomer.set(sale.customerId, entry)
  }

  return [...byCustomer.entries()]
    .filter(([, entry]) => entry.count >= OVERDUE_SALES)
    .map(([customerId, entry]) => ({
      customerId,
      overdueSales: entry.count,
      total: entry.total,
      oldestDays: entry.oldestDays,
    }))
    .sort((a, b) => b.total - a.total)
}
