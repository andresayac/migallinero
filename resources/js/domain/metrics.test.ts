import { describe, expect, it } from 'vitest'
import {
  ALL_TIME,
  aliveChickens,
  aliveChickensAt,
  dayKeysBetween,
  eggsLaid,
  farmDays,
  feedConsumedKg,
  feedConversion,
  feedCostPerEgg,
  feedStockDays,
  henDays,
  incomeOverFeedCost,
  inWindow,
  kgFactor,
  layingRate,
  type MetricsInput,
} from './metrics'
import { dayKey, setRegionalConfig } from '@/utils/format'
import type {
  ChickenMovement,
  EggCollection,
  FeedPurchase,
  FeedRecord,
  FeedType,
  Payment,
  Sale,
} from '@/types/domain'

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

  it('ALL_TIME no descarta nada', () => {
    // Con `new Date(8.64e15)` como tope, startOfFarmDay reconstruía un año de
    // cinco cifras sin el prefijo `+` que exige ISO: la fecha salía inválida y
    // el filtro descartaba TODO, así que el consumo acumulado daba cero y el
    // stock de alimento parecía intacto para siempre.
    const rows = [{ at: '1990-01-01T00:00:00.000Z' }, { at: '2026-07-01T00:00:00.000Z' }]

    expect(inWindow(rows, ALL_TIME, (r) => r.at)).toHaveLength(2)
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

function collection(patch: Partial<EggCollection>): EggCollection {
  return {
    localUuid: 'c-1',
    farmId: 'f-1',
    pendingSync: false,
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
    createdBy: 'u-1',
    type: 'egg-collection',
    penId: 'pen-a',
    collectionAt: '2026-07-01T12:00:00.000Z',
    total: 0,
    lines: [],
    ...patch,
  } as EggCollection
}

/** MetricsInput vacío al que cada test añade sólo lo que necesita. */
function input(patch: Partial<MetricsInput> = {}): MetricsInput {
  return {
    collections: [],
    movements: [],
    sales: [],
    payments: [],
    feedRecords: [],
    feedPurchases: [],
    feedTypes: [],
    categories: [],
    penId: '',
    ...patch,
  }
}

describe('layingRate', () => {
  const window = {
    from: new Date('2026-07-01T12:00:00.000Z'),
    to: new Date('2026-07-02T12:00:00.000Z'),
  }

  it('divide los huevos entre las ave-día', () => {
    // 2 días × 100 aves = 200 ave-día. 160 huevos → 80 %.
    const movements = [movement({ type: 'buy', qty: 100, movementAt: '2026-06-01T10:00:00.000Z' })]
    const collections = [
      collection({ collectionAt: '2026-07-01T14:00:00.000Z', total: 80 }),
      collection({ collectionAt: '2026-07-02T14:00:00.000Z', total: 80 }),
    ]

    expect(layingRate(input({ movements, collections }), window)).toBeCloseTo(0.8, 5)
  })

  it('devuelve null cuando no hay aves, en vez de 0', () => {
    // Sin gallinas la postura es desconocida, no cero. Mostrar 0 % sería mentir.
    const collections = [collection({ collectionAt: '2026-07-01T14:00:00.000Z', total: 10 })]

    expect(layingRate(input({ collections }), window)).toBeNull()
  })

  it('cuenta también los huevos rotos: la gallina los puso', () => {
    // `total` es la suma desnormalizada de las líneas, rotos incluidos.
    const collections = [collection({ collectionAt: '2026-07-01T14:00:00.000Z', total: 200 })]

    expect(eggsLaid(collections, window)).toBe(200)
  })

  it('filtra por galpón cuando hay uno activo', () => {
    const collections = [
      collection({ collectionAt: '2026-07-01T14:00:00.000Z', total: 50, penId: 'pen-a' }),
      collection({ collectionAt: '2026-07-01T14:00:00.000Z', total: 30, penId: 'pen-b' }),
    ]

    expect(eggsLaid(collections, window, 'pen-a')).toBe(50)
    expect(eggsLaid(collections, window)).toBe(80)
  })
})

function feedType(patch: Partial<FeedType>): FeedType {
  return {
    localUuid: 'ft-1',
    farmId: 'f-1',
    pendingSync: false,
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
    createdBy: 'u-1',
    name: 'Concentrado de postura',
    unit: 'kg',
    active: true,
    sort: 1,
    ...patch,
  } as FeedType
}

function feedRecord(patch: Partial<FeedRecord>): FeedRecord {
  return {
    localUuid: 'fr-1',
    farmId: 'f-1',
    pendingSync: false,
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
    createdBy: 'u-1',
    type: 'feed-record',
    penId: 'pen-a',
    recordedAt: '2026-07-01T12:00:00.000Z',
    shift: 'morning',
    totalQty: 0,
    totalCost: 0,
    lines: [],
    ...patch,
  } as FeedRecord
}

function feedPurchase(patch: Partial<FeedPurchase>): FeedPurchase {
  return {
    localUuid: 'fp-1',
    farmId: 'f-1',
    pendingSync: false,
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
    createdBy: 'u-1',
    type: 'feed-purchase',
    purchasedAt: '2026-07-01T12:00:00.000Z',
    totalBags: 0,
    totalQty: 0,
    totalCost: 0,
    lines: [],
    ...patch,
  } as FeedPurchase
}

describe('kgFactor', () => {
  it('vale 1 cuando el tipo ya se mide en kg', () => {
    expect(kgFactor('ft-1', [feedType({ localUuid: 'ft-1', unit: 'kg' })], [])).toBe(1)
  })

  it('usa el kgPerBag más reciente cuando el tipo se mide en bultos', () => {
    const types = [feedType({ localUuid: 'ft-1', unit: 'bulto' })]
    const purchases = [
      feedPurchase({
        purchasedAt: '2026-06-01T12:00:00.000Z',
        lines: [{ feedTypeId: 'ft-1', bags: 1, kgPerBag: 40, unitCost: 0, subtotal: 0 }],
      }),
      feedPurchase({
        purchasedAt: '2026-07-01T12:00:00.000Z',
        lines: [{ feedTypeId: 'ft-1', bags: 1, kgPerBag: 40.5, unitCost: 0, subtotal: 0 }],
      }),
    ]

    expect(kgFactor('ft-1', types, purchases)).toBe(40.5)
  })

  it('devuelve null si el tipo no está en kg y nunca se ha comprado', () => {
    // Adivinar en silencio falsearía el stock. Mejor declararlo desconocido.
    expect(kgFactor('ft-1', [feedType({ localUuid: 'ft-1', unit: 'bulto' })], [])).toBeNull()
  })
})

describe('feedConsumedKg', () => {
  const window = {
    from: new Date('2026-07-01T12:00:00.000Z'),
    to: new Date('2026-07-31T12:00:00.000Z'),
  }

  it('convierte a kg y declara los tipos que no pudo convertir', () => {
    const types = [
      feedType({ localUuid: 'ft-kg', unit: 'kg', name: 'Maíz' }),
      feedType({ localUuid: 'ft-raro', unit: 'bulto', name: 'Purina' }),
    ]
    const records = [
      feedRecord({
        lines: [
          { feedTypeId: 'ft-kg', qty: 30, unitCost: 0, subtotal: 0 },
          { feedTypeId: 'ft-raro', qty: 2, unitCost: 0, subtotal: 0 },
        ],
      }),
    ]

    const result = feedConsumedKg(input({ feedRecords: records, feedTypes: types }), window)

    expect(result.kg).toBe(30)
    expect(result.excludedTypes).toEqual(['Purina'])
  })
})

describe('feedConversion y feedCostPerEgg', () => {
  const window = {
    from: new Date('2026-07-01T12:00:00.000Z'),
    to: new Date('2026-07-31T12:00:00.000Z'),
  }

  it('calcula kg de alimento por docena', () => {
    // 24 kg de alimento y 120 huevos = 10 docenas → 2.4 kg/docena.
    const types = [feedType({ localUuid: 'ft-kg', unit: 'kg' })]
    const records = [
      feedRecord({ lines: [{ feedTypeId: 'ft-kg', qty: 24, unitCost: 0, subtotal: 0 }] }),
    ]
    const collections = [collection({ collectionAt: '2026-07-05T12:00:00.000Z', total: 120 })]

    const data = input({ feedRecords: records, feedTypes: types, collections })

    expect(feedConversion(data, window)).toBeCloseTo(2.4, 5)
  })

  it('calcula el costo de alimento por huevo', () => {
    const records = [feedRecord({ totalCost: 60_000 })]
    const collections = [collection({ collectionAt: '2026-07-05T12:00:00.000Z', total: 300 })]

    expect(feedCostPerEgg(input({ feedRecords: records, collections }), window)).toBe(200)
  })

  it('devuelven null sin huevos, en vez de dividir por cero', () => {
    const records = [feedRecord({ totalCost: 60_000 })]

    expect(feedConversion(input({ feedRecords: records }), window)).toBeNull()
    expect(feedCostPerEgg(input({ feedRecords: records }), window)).toBeNull()
  })
})

function sale(patch: Partial<Sale>): Sale {
  return {
    localUuid: 's-1',
    farmId: 'f-1',
    pendingSync: false,
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
    createdBy: 'u-1',
    type: 'sale',
    customerId: 'cus-1',
    soldAt: '2026-07-01T12:00:00.000Z',
    total: 0,
    discount: 0,
    paid: 0,
    balance: 0,
    status: 'paid',
    lines: [],
    ...patch,
  } as Sale
}

function payment(patch: Partial<Payment>): Payment {
  return {
    localUuid: 'p-1',
    farmId: 'f-1',
    pendingSync: false,
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
    createdBy: 'u-1',
    customerId: 'cus-1',
    amount: 0,
    paidAt: '2026-07-01T12:00:00.000Z',
    ...patch,
  } as Payment
}

describe('incomeOverFeedCost', () => {
  const window = {
    from: new Date('2026-07-01T12:00:00.000Z'),
    to: new Date('2026-07-31T12:00:00.000Z'),
  }

  it('resta el costo del alimento a las ventas del periodo', () => {
    const sales = [sale({ total: 500_000 })]
    const records = [feedRecord({ totalCost: 180_000 })]

    const result = incomeOverFeedCost(input({ sales, feedRecords: records }), window)

    expect(result.sales).toBe(500_000)
    expect(result.feedCost).toBe(180_000)
    expect(result.iofc).toBe(320_000)
  })

  it('excluye las ventas anuladas', () => {
    const sales = [
      sale({ total: 500_000 }),
      sale({ localUuid: 's-2', total: 900_000, status: 'void' }),
    ]

    expect(incomeOverFeedCost(input({ sales }), window).sales).toBe(500_000)
  })

  it('reporta lo cobrado aparte y descarta los pagos anulados', () => {
    // Anular una venta anula sus pagos: si contaran, la plata "en mano" mentiría.
    const payments = [
      payment({ amount: 100_000 }),
      payment({ localUuid: 'p-2', amount: 70_000, voidedAt: '2026-07-05T12:00:00.000Z' }),
    ]

    expect(incomeOverFeedCost(input({ payments }), window).collected).toBe(100_000)
  })
})

describe('feedStockDays', () => {
  const today = new Date('2026-07-15T12:00:00.000Z')
  const types = [feedType({ localUuid: 'ft-kg', unit: 'kg' })]

  /** Consumo diario de `qty` kg durante los 14 días previos a hoy. */
  function dailyConsumption(qty: number, penId = 'pen-a') {
    return Array.from({ length: 14 }, (_, i) =>
      feedRecord({
        localUuid: `fr-${i}`,
        penId,
        recordedAt: new Date(today.getTime() - (i + 1) * 86_400_000).toISOString(),
        lines: [{ feedTypeId: 'ft-kg', qty, unitCost: 0, subtotal: 0 }],
      }),
    )
  }

  const purchases = [
    feedPurchase({
      lines: [{ feedTypeId: 'ft-kg', bags: 5, kgPerBag: 40, unitCost: 0, subtotal: 0 }],
    }),
  ]

  it('proyecta los días que quedan con el consumo de los últimos 14 días', () => {
    // 5 bultos de 40 kg = 200 kg. Consumidos 7 kg/día × 14 días = 98 kg.
    // Quedan 102 kg; 102 / 7 = 14.57 → 14 días.
    const result = feedStockDays(
      input({ feedPurchases: purchases, feedRecords: dailyConsumption(7), feedTypes: types }),
      today,
    )

    expect(result.stockKg).toBeCloseTo(102, 5)
    expect(result.dailyKg).toBeCloseTo(7, 5)
    expect(result.days).toBe(14)
  })

  it('devuelve null cuando no hay consumo con el que proyectar', () => {
    expect(
      feedStockDays(input({ feedPurchases: purchases, feedTypes: types }), today).days,
    ).toBeNull()
  })

  it('reporta 0 días cuando el stock sale negativo por compras sin registrar', () => {
    expect(
      feedStockDays(input({ feedRecords: dailyConsumption(10), feedTypes: types }), today).days,
    ).toBe(0)
  })

  it('ignora el galpón activo: el alimento se compra para toda la granja', () => {
    // feed_purchases no tiene penId. Filtrar el consumo por galpón contra unas
    // compras sin filtrar daría un stock inflado.
    const scoped = input({
      feedPurchases: purchases,
      feedRecords: dailyConsumption(7, 'pen-b'),
      feedTypes: types,
      penId: 'pen-a',
    })

    expect(feedStockDays(scoped, today).dailyKg).toBeCloseTo(7, 5)
  })
})
