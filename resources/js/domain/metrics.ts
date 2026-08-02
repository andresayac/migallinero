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
import { addDays, dayKey, endOfFarmDay, startOfFarmDay } from '@/utils/format'

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

/** Todo el historial. Para stock acumulado, que no depende de una ventana. */
export const ALL_TIME: MetricsWindow = {
  from: new Date(0),
  to: new Date(8_640_000_000_000_000),
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
