import { describe, expect, it } from 'vitest'
import { aliveChickens, aliveChickensAt } from './metrics'
import type { ChickenMovement } from '@/types/domain'

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
