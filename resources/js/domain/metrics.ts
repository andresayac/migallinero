import type { ChickenMovement } from '@/types/domain'

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
