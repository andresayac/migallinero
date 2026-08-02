import { describe, expect, it } from 'vitest'
import {
  aliveChickens,
  aliveChickensAt,
  dayKeysBetween,
  farmDays,
  henDays,
  inWindow,
} from './metrics'
import { dayKey, setRegionalConfig } from '@/utils/format'
import type { ChickenMovement } from '@/types/domain'

// Los cálculos por día dependen de la zona horaria de la granja: en Bogotá
// (UTC-5) una recolección de las 19:00 locales es del día siguiente en UTC.
setRegionalConfig({ timezone: 'America/Bogota', locale: 'es-CO', currency: 'COP' })

/** Movimiento mínimo: sólo importan type, qty, penId y movementAt. */
function movement(patch: Partial<ChickenMovement>): ChickenMovement {
  return {
    localUuid: 'm-1',
    farmId: 'f-1',
    pendingSync: false,
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
    createdBy: 'u-1',
    penId: 'pen-a',
    type: 'buy',
    qty: 0,
    movementAt: '2026-07-01T12:00:00.000Z',
    ...patch,
  } as ChickenMovement
}

describe('aliveChickens', () => {
  it('suma entradas y resta salidas', () => {
    const movements = [
      movement({ type: 'buy', qty: 100 }),
      movement({ type: 'birth', qty: 10 }),
      movement({ type: 'death', qty: 5 }),
      movement({ type: 'sale', qty: 20 }),
      movement({ type: 'revoke', qty: 2 }),
    ]

    expect(aliveChickens(movements)).toBe(83)
  })

  it('suma los ajustes con su signo', () => {
    const movements = [movement({ type: 'buy', qty: 50 }), movement({ type: 'adjust', qty: -8 })]

    expect(aliveChickens(movements)).toBe(42)
  })

  it('nunca devuelve un plantel negativo', () => {
    expect(aliveChickens([movement({ type: 'death', qty: 5 })])).toBe(0)
  })

  it('una transferencia mueve aves entre galpones pero no cambia el total de la granja', () => {
    // Es el bug que useAlerts tenía: sin este caso, el umbral de mortalidad de
    // un galpón se calculaba sobre un plantel equivocado.
    const movements = [
      movement({ type: 'buy', qty: 100, penId: 'pen-a' }),
      movement({ type: 'transfer', qty: -30, penId: 'pen-a' }),
      movement({ type: 'transfer', qty: 30, penId: 'pen-b' }),
    ]

    expect(aliveChickens(movements, 'pen-a')).toBe(70)
    expect(aliveChickens(movements, 'pen-b')).toBe(30)
    expect(aliveChickens(movements)).toBe(100)
  })

  it('aliveChickensAt ignora los movimientos posteriores a la fecha', () => {
    const movements = [
      movement({ type: 'buy', qty: 100, movementAt: '2026-07-01T12:00:00.000Z' }),
      movement({ type: 'death', qty: 40, movementAt: '2026-07-20T12:00:00.000Z' }),
    ]

    expect(aliveChickensAt(movements, new Date('2026-07-10T12:00:00.000Z'))).toBe(100)
    expect(aliveChickensAt(movements, new Date('2026-07-25T12:00:00.000Z'))).toBe(60)
  })

  it('aliveChickensAt usa createdAt cuando falta movementAt', () => {
    const movements = [
      movement({
        type: 'buy',
        qty: 30,
        movementAt: undefined as unknown as string,
        createdAt: '2026-07-05T12:00:00.000Z',
      }),
    ]

    expect(aliveChickensAt(movements, new Date('2026-07-01T12:00:00.000Z'))).toBe(0)
    expect(aliveChickensAt(movements, new Date('2026-07-10T12:00:00.000Z'))).toBe(30)
  })
})

describe('dayKeysBetween', () => {
  it('devuelve un día por cada jornada de la ventana, extremos incluidos', () => {
    const keys = dayKeysBetween({
      from: new Date('2026-07-01T05:00:00.000Z'),
      to: new Date('2026-07-03T23:00:00.000Z'),
    })

    expect(keys).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
  })

  it('devuelve vacío cuando la ventana está invertida', () => {
    const keys = dayKeysBetween({
      from: new Date('2026-07-10T12:00:00.000Z'),
      to: new Date('2026-07-01T12:00:00.000Z'),
    })

    expect(keys).toEqual([])
  })

  it('no se desplaza en zonas horarias muy adelantadas', () => {
    // Reconstruir el día como `${key}T12:00:00Z` funciona en América pero en
    // UTC+13 el mediodía UTC ya es el día siguiente local: la serie entera se
    // corría una jornada. Por eso farmDays lleva sus propias fechas.
    setRegionalConfig({ timezone: 'Pacific/Apia', locale: 'es-CO', currency: 'COP' })

    const days = farmDays({
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-02T00:00:00.000Z'),
    })

    for (const day of days) {
      expect(dayKey(day.start)).toBe(day.key)
      expect(dayKey(day.end)).toBe(day.key)
    }

    setRegionalConfig({ timezone: 'America/Bogota', locale: 'es-CO', currency: 'COP' })
  })
})

describe('inWindow', () => {
  it('incluye los registros de los días extremos', () => {
    const rows = [
      { at: '2026-07-01T06:00:00.000Z' },
      { at: '2026-07-02T12:00:00.000Z' },
      { at: '2026-07-09T12:00:00.000Z' },
    ]

    const kept = inWindow(
      rows,
      { from: new Date('2026-07-01T12:00:00.000Z'), to: new Date('2026-07-02T12:00:00.000Z') },
      (r) => r.at,
    )

    expect(kept).toHaveLength(2)
  })
})

describe('henDays', () => {
  it('suma las aves vivas de cada día, no las del final del periodo', () => {
    // 100 aves el día 1; mueren 50 al empezar el día 3.
    // Ave-día del 1 al 4 = 100 + 100 + 50 + 50 = 300.
    // Usar el plantel final (50) daría 200 e inflaría la postura.
    const movements = [
      movement({ type: 'buy', qty: 100, movementAt: '2026-07-01T10:00:00.000Z' }),
      movement({ type: 'death', qty: 50, movementAt: '2026-07-03T10:00:00.000Z' }),
    ]

    const days = henDays(movements, {
      from: new Date('2026-07-01T12:00:00.000Z'),
      to: new Date('2026-07-04T12:00:00.000Z'),
    })

    expect(days).toBe(300)
  })

  it('devuelve 0 cuando no hay aves', () => {
    expect(
      henDays([], {
        from: new Date('2026-07-01T12:00:00.000Z'),
        to: new Date('2026-07-03T12:00:00.000Z'),
      }),
    ).toBe(0)
  })
})
