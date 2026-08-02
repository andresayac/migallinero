# Indicadores avícolas y alertas predictivas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calcular porcentaje de postura, conversión alimentaria, costo de alimento por huevo e ingreso menos costo de alimento a partir de los datos que la app ya registra, y usarlos en reportes, home y alertas.

**Architecture:** Un motor de funciones puras en `resources/js/domain/metrics.ts` (sin Dexie, sin stores) consumido por tres superficies: `ReportsView`, `HomeView` y `useAlerts`. Un composable `useMetrics` carga de Dexie una vez por ventana de fechas. La fórmula de aves vivas, hoy duplicada y divergente, queda en una sola función.

**Tech Stack:** Vue 3 + TypeScript, Dexie (IndexedDB), vitest + jsdom, chart.js vía `BaseChart.vue`.

**Spec:** `docs/superpowers/specs/2026-07-31-indicadores-avicolas-design.md`

## Global Constraints

- Un indicador que no se puede calcular devuelve `null`, **nunca** `0`, `NaN` ni `Infinity`. La interfaz muestra `—` ante `null`. Una postura de 0 % y una postura desconocida son cosas distintas.
- Las fechas se comparan siempre con `startOfFarmDay` / `endOfFarmDay` / `dayKey` / `addDays` de `@/utils/format`, que respetan la zona horaria de la granja. Nunca `iso.slice(0, 10)` ni `toISOString()`.
- Las funciones de `domain/metrics.ts` son **puras**: reciben arreglos, devuelven valores. No importan `db`, ni stores de Pinia, ni `useX()`.
- Los comentarios y las etiquetas de interfaz van en español; los identificadores en inglés, siguiendo el código existente.
- Dinero en enteros de la moneda. Usa `toMoney()` al producir cualquier importe.
- Tests: `npm test` (vitest run). Tipos: `npm run type-check` (vue-tsc). Ambos deben pasar antes de cada commit.
- Ninguna tarea toca el backend PHP. Todo el cálculo es local y funciona sin conexión.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `resources/js/domain/metrics.ts` (crear) | Funciones puras de cálculo. Única fuente de verdad de las fórmulas. |
| `resources/js/domain/metrics.test.ts` (crear) | Tests de las fórmulas. Sin base de datos. |
| `resources/js/composables/useMetrics.ts` (crear) | Carga de Dexie una vez por ventana y arma `MetricsInput`. |
| `resources/js/stores/sync.ts` (modificar) | `aliveChickens` delega en la función pura. |
| `resources/js/composables/useAlerts.ts` (modificar) | Borra su copia de la fórmula; añade tres alertas. |
| `resources/js/views/reports/ReportsView.vue` (modificar) | Muestra los cinco indicadores y la gráfica de postura. |
| `resources/js/views/HomeView.vue` (modificar) | Tarjeta de ingreso menos alimento y tendencia de huevos. |

---

## Task 1: Aves vivas — una sola fórmula

Corrige un bug real: `useAlerts.ts` calcula el plantel sin sumar `transfer`, así que con un galpón seleccionado el umbral de mortalidad se compara contra un número equivocado.

**Files:**
- Create: `resources/js/domain/metrics.ts`
- Create: `resources/js/domain/metrics.test.ts`
- Modify: `resources/js/stores/sync.ts:623-643`
- Modify: `resources/js/composables/useAlerts.ts:45-56`

**Interfaces:**
- Consumes: `ChickenMovement` de `@/types/domain`.
- Produces: `aliveChickens(movements: ChickenMovement[], penId?: string): number` y `aliveChickensAt(movements: ChickenMovement[], at: Date, penId?: string): number`.

- [ ] **Step 1: Escribe el test que falla**

Crea `resources/js/domain/metrics.test.ts`:

```ts
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
      movement({ type: 'buy', qty: 30, movementAt: undefined as unknown as string, createdAt: '2026-07-05T12:00:00.000Z' }),
    ]

    expect(aliveChickensAt(movements, new Date('2026-07-01T12:00:00.000Z'))).toBe(0)
    expect(aliveChickensAt(movements, new Date('2026-07-10T12:00:00.000Z'))).toBe(30)
  })
})
```

- [ ] **Step 2: Ejecuta el test para verificar que falla**

Run: `npm test -- metrics`
Expected: FAIL — `Failed to resolve import "./metrics"`.

- [ ] **Step 3: Escribe la implementación mínima**

Crea `resources/js/domain/metrics.ts`:

```ts
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
```

- [ ] **Step 4: Ejecuta los tests para verificar que pasan**

Run: `npm test -- metrics`
Expected: PASS, 6 tests.

- [ ] **Step 5: Sustituye las dos copias de la fórmula**

En `resources/js/stores/sync.ts`, reemplaza el cuerpo de `aliveChickens` (líneas 623-643) por una delegación. Añade el import junto a los que ya existen en la cabecera del archivo:

```ts
import { aliveChickens as aliveFrom } from '@/domain/metrics'
```

```ts
export async function aliveChickens(farmId: string, penId = ''): Promise<number> {
  const mv = await db.chickenMovements.where('farmId').equals(farmId).toArray()

  // El filtro por galpón lo hace la función pura: necesita ver TODOS los
  // movimientos de la granja para tratar bien las transferencias.
  return aliveFrom(mv, penId)
}
```

En `resources/js/composables/useAlerts.ts`, borra `scopedMovements`, el helper `sum` y el cálculo de `alive` (líneas 48-56). **Conserva `inPen`** (líneas 45-46): se sigue usando más abajo para filtrar las vacunas. Sustituye lo borrado por:

```ts
const alive = aliveChickens(movements, penId)
```

Añade el import:

```ts
import { aliveChickens } from '@/domain/metrics'
```

`inPen` se sigue usando más abajo para las vacunas, así que consérvalo, pero elimina `scopedMovements` y `sum`. El filtro de muertes de hoy pasa a hacerse sobre `movements` directamente:

```ts
const deathsToday = movements
  .filter((m) => (!penId || m.penId === penId) && m.type === 'death')
  .filter((m) => new Date(m.movementAt ?? m.createdAt) >= startOfToday)
  .reduce((s, m) => s + m.qty, 0)
```

- [ ] **Step 6: Verifica tipos y tests**

Run: `npm run type-check && npm test`
Expected: sin errores de tipos; toda la suite en verde.

- [ ] **Step 7: Commit**

```bash
git add resources/js/domain/metrics.ts resources/js/domain/metrics.test.ts resources/js/stores/sync.ts resources/js/composables/useAlerts.ts
git commit -m "fix(alerts): count transfers when scoping the flock to one pen"
```

---

## Task 2: Ventana de fechas y ave-día

**Files:**
- Modify: `resources/js/domain/metrics.ts`
- Modify: `resources/js/domain/metrics.test.ts`

**Interfaces:**
- Consumes: `aliveChickensAt` de la tarea 1.
- Produces: `MetricsWindow`, `MetricsInput`, `ALL_TIME`, `dayKeysBetween(window)`, `inWindow(rows, window, at)`, `henDays(movements, window, penId?)`.

- [ ] **Step 1: Escribe el test que falla**

Añade a `resources/js/domain/metrics.test.ts`:

```ts
import { dayKeysBetween, henDays, inWindow } from './metrics'
import { setRegionalConfig } from '@/utils/format'

// Los cálculos por día dependen de la zona horaria de la granja: en Bogotá
// (UTC-5) una recolección de las 19:00 locales es del día siguiente en UTC.
setRegionalConfig({ timezone: 'America/Bogota', locale: 'es-CO', currency: 'COP' })

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
```

- [ ] **Step 2: Ejecuta el test para verificar que falla**

Run: `npm test -- metrics`
Expected: FAIL — `dayKeysBetween is not a function`.

- [ ] **Step 3: Escribe la implementación**

Añade a `resources/js/domain/metrics.ts`. Amplía el import de tipos y añade el de utilidades:

```ts
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
```

```ts
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

/**
 * Claves de día (YYYY-MM-DD) de la ventana, en la zona horaria de la granja.
 * Cada vuelta se renormaliza con `startOfFarmDay` en vez de ir sumando
 * milisegundos: así un cambio de horario de verano no desplaza la serie.
 */
export function dayKeysBetween(window: MetricsWindow): string[] {
  const keys: string[] = []
  const last = startOfFarmDay(window.to).getTime()
  let cursor = startOfFarmDay(window.from)

  // Tope de seguridad: una ventana absurda no debe colgar la interfaz.
  while (cursor.getTime() <= last && keys.length < 4000) {
    keys.push(dayKey(cursor))
    cursor = startOfFarmDay(addDays(cursor, 1))
  }

  return keys
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
  return dayKeysBetween(window).reduce((total, key) => {
    const endOfDay = endOfFarmDay(new Date(`${key}T12:00:00.000Z`))

    return total + aliveChickensAt(movements, endOfDay, penId)
  }, 0)
}
```

- [ ] **Step 4: Ejecuta los tests para verificar que pasan**

Run: `npm test -- metrics`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resources/js/domain/metrics.ts resources/js/domain/metrics.test.ts
git commit -m "feat(metrics): add date-window helpers and hen-day accumulation"
```

---

## Task 3: Porcentaje de postura

**Files:**
- Modify: `resources/js/domain/metrics.ts`
- Modify: `resources/js/domain/metrics.test.ts`

**Interfaces:**
- Consumes: `henDays`, `inWindow`, `MetricsInput`, `MetricsWindow`.
- Produces: `eggsLaid(collections, window, penId?): number` y `layingRate(input, window): number | null` (fracción 0-1, no porcentaje).

- [ ] **Step 1: Escribe el test que falla**

Añade a `resources/js/domain/metrics.test.ts`:

```ts
import { eggsLaid, layingRate, type MetricsInput } from './metrics'
import type { EggCollection } from '@/types/domain'

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
    const movements = [movement({ type: 'buy', qty: 100, movementAt: '2026-06-01T10:00:00.000Z' })]
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
```

- [ ] **Step 2: Ejecuta el test para verificar que falla**

Run: `npm test -- metrics`
Expected: FAIL — `eggsLaid is not a function`.

- [ ] **Step 3: Escribe la implementación**

Añade a `resources/js/domain/metrics.ts`:

```ts
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
```

- [ ] **Step 4: Ejecuta los tests para verificar que pasan**

Run: `npm test -- metrics`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resources/js/domain/metrics.ts resources/js/domain/metrics.test.ts
git commit -m "feat(metrics): compute hen-day laying rate"
```

---

## Task 4: Alimento en kg, conversión y costo por huevo

**Files:**
- Modify: `resources/js/domain/metrics.ts`
- Modify: `resources/js/domain/metrics.test.ts`

**Interfaces:**
- Consumes: `eggsLaid`, `inWindow`, `MetricsInput`, `MetricsWindow`.
- Produces: `kgFactor(feedTypeId, feedTypes, purchases): number | null`, `FeedKg { kg, excludedTypes }`, `feedConsumedKg(input, window): FeedKg`, `feedCost(input, window): number`, `feedConversion(input, window): number | null`, `feedCostPerEgg(input, window): number | null`.

- [ ] **Step 1: Escribe el test que falla**

Añade a `resources/js/domain/metrics.test.ts`:

```ts
import { feedConsumedKg, feedConversion, feedCostPerEgg, kgFactor } from './metrics'
import type { FeedPurchase, FeedRecord, FeedType } from '@/types/domain'

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
```

- [ ] **Step 2: Ejecuta el test para verificar que falla**

Run: `npm test -- metrics`
Expected: FAIL — `kgFactor is not a function`.

- [ ] **Step 3: Escribe la implementación**

Añade a `resources/js/domain/metrics.ts`:

```ts
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
  const unit = (feedTypes.find((t) => t.localUuid === feedTypeId)?.unit ?? '').trim().toLowerCase()

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
```

- [ ] **Step 4: Ejecuta los tests para verificar que pasan**

Run: `npm test -- metrics`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resources/js/domain/metrics.ts resources/js/domain/metrics.test.ts
git commit -m "feat(metrics): convert feed to kilograms and derive conversion ratio"
```

---

## Task 5: Ingreso menos costo de alimento

**Files:**
- Modify: `resources/js/domain/metrics.ts`
- Modify: `resources/js/domain/metrics.test.ts`

**Interfaces:**
- Consumes: `feedCost`, `inWindow`, `MetricsInput`, `MetricsWindow`, `toMoney` de `@/utils/format`.
- Produces: `IncomeOverFeed { sales, collected, feedCost, iofc }` y `incomeOverFeedCost(input, window): IncomeOverFeed`.

- [ ] **Step 1: Escribe el test que falla**

Añade a `resources/js/domain/metrics.test.ts`:

```ts
import { incomeOverFeedCost } from './metrics'
import type { Payment, Sale } from '@/types/domain'

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
    const sales = [sale({ total: 500_000 }), sale({ localUuid: 's-2', total: 900_000, status: 'void' })]

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
```

- [ ] **Step 2: Ejecuta el test para verificar que falla**

Run: `npm test -- metrics`
Expected: FAIL — `incomeOverFeedCost is not a function`.

- [ ] **Step 3: Escribe la implementación**

Añade a `resources/js/domain/metrics.ts`:

```ts
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
```

- [ ] **Step 4: Ejecuta los tests para verificar que pasan**

Run: `npm test -- metrics`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resources/js/domain/metrics.ts resources/js/domain/metrics.test.ts
git commit -m "feat(metrics): report income over feed cost"
```

---

## Task 6: Días de alimento restantes

**Files:**
- Modify: `resources/js/domain/metrics.ts`
- Modify: `resources/js/domain/metrics.test.ts`

**Interfaces:**
- Consumes: `feedConsumedKg`, `ALL_TIME`, `MetricsInput`, `addDays`, `startOfFarmDay`, `endOfFarmDay`.
- Produces: `FeedStock { days, stockKg, dailyKg, excludedTypes }` y `feedStockDays(input, today?): FeedStock`.

- [ ] **Step 1: Escribe el test que falla**

Añade a `resources/js/domain/metrics.test.ts`:

```ts
import { feedStockDays } from './metrics'

describe('feedStockDays', () => {
  const today = new Date('2026-07-15T12:00:00.000Z')
  const types = [feedType({ localUuid: 'ft-kg', unit: 'kg' })]

  it('proyecta los días que quedan con el consumo de los últimos 14 días', () => {
    // Compradas 5 bolsas de 40 kg = 200 kg.
    // Consumidos 7 kg/día durante los 14 días previos = 98 kg. Quedan 102 kg.
    // 102 / 7 = 14.57 → 14 días.
    const purchases = [
      feedPurchase({
        lines: [{ feedTypeId: 'ft-kg', bags: 5, kgPerBag: 40, unitCost: 0, subtotal: 0 }],
      }),
    ]

    const records = Array.from({ length: 14 }, (_, i) =>
      feedRecord({
        localUuid: `fr-${i}`,
        recordedAt: new Date(today.getTime() - (i + 1) * 86_400_000).toISOString(),
        lines: [{ feedTypeId: 'ft-kg', qty: 7, unitCost: 0, subtotal: 0 }],
      }),
    )

    const result = feedStockDays(
      input({ feedPurchases: purchases, feedRecords: records, feedTypes: types }),
      today,
    )

    expect(result.stockKg).toBeCloseTo(102, 5)
    expect(result.dailyKg).toBeCloseTo(7, 5)
    expect(result.days).toBe(14)
  })

  it('devuelve null cuando no hay consumo con el que proyectar', () => {
    const purchases = [
      feedPurchase({
        lines: [{ feedTypeId: 'ft-kg', bags: 5, kgPerBag: 40, unitCost: 0, subtotal: 0 }],
      }),
    ]

    expect(feedStockDays(input({ feedPurchases: purchases, feedTypes: types }), today).days).toBeNull()
  })

  it('reporta 0 días cuando el stock sale negativo por compras sin registrar', () => {
    const records = Array.from({ length: 14 }, (_, i) =>
      feedRecord({
        localUuid: `fr-${i}`,
        recordedAt: new Date(today.getTime() - (i + 1) * 86_400_000).toISOString(),
        lines: [{ feedTypeId: 'ft-kg', qty: 10, unitCost: 0, subtotal: 0 }],
      }),
    )

    expect(feedStockDays(input({ feedRecords: records, feedTypes: types }), today).days).toBe(0)
  })

  it('ignora el galpón activo: el alimento se compra para toda la granja', () => {
    // feed_purchases no tiene penId. Filtrar el consumo por galpón contra unas
    // compras sin filtrar daría un stock inflado.
    const purchases = [
      feedPurchase({
        lines: [{ feedTypeId: 'ft-kg', bags: 5, kgPerBag: 40, unitCost: 0, subtotal: 0 }],
      }),
    ]

    const records = Array.from({ length: 14 }, (_, i) =>
      feedRecord({
        localUuid: `fr-${i}`,
        penId: 'pen-b',
        recordedAt: new Date(today.getTime() - (i + 1) * 86_400_000).toISOString(),
        lines: [{ feedTypeId: 'ft-kg', qty: 7, unitCost: 0, subtotal: 0 }],
      }),
    )

    const scoped = input({
      feedPurchases: purchases,
      feedRecords: records,
      feedTypes: types,
      penId: 'pen-a',
    })

    // Aunque el galpón activo sea 'pen-a' y todo el consumo sea de 'pen-b',
    // el consumo cuenta igual.
    expect(feedStockDays(scoped, today).dailyKg).toBeCloseTo(7, 5)
  })
})
```

- [ ] **Step 2: Ejecuta el test para verificar que falla**

Run: `npm test -- metrics`
Expected: FAIL — `feedStockDays is not a function`.

- [ ] **Step 3: Escribe la implementación**

Añade a `resources/js/domain/metrics.ts`:

```ts
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
```

- [ ] **Step 4: Ejecuta los tests para verificar que pasan**

Run: `npm test -- metrics`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resources/js/domain/metrics.ts resources/js/domain/metrics.test.ts
git commit -m "feat(metrics): project how many days of feed are left"
```

---

## Task 7: Serie diaria de postura y caída sostenida

**Files:**
- Modify: `resources/js/domain/metrics.ts`
- Modify: `resources/js/domain/metrics.test.ts`

**Interfaces:**
- Consumes: `dayKeysBetween`, `aliveChickensAt`, `eggsLaid`, `MetricsInput`, `MetricsWindow`.
- Produces: `DailyRate { day, eggs, hens, rate }`, `dailyLayingRate(input, window): DailyRate[]`, `LayingDrop { dropping, reference, recent }`, `layingDrop(input, today?): LayingDrop | null`.

- [ ] **Step 1: Escribe el test que falla**

Añade a `resources/js/domain/metrics.test.ts`:

```ts
import { dailyLayingRate, layingDrop } from './metrics'

describe('dailyLayingRate', () => {
  it('devuelve un punto por día con su postura', () => {
    const movements = [movement({ type: 'buy', qty: 100, movementAt: '2026-06-01T10:00:00.000Z' })]
    const collections = [
      collection({ collectionAt: '2026-07-01T14:00:00.000Z', total: 90 }),
      collection({ collectionAt: '2026-07-02T14:00:00.000Z', total: 80 }),
    ]

    const series = dailyLayingRate(input({ movements, collections }), {
      from: new Date('2026-07-01T12:00:00.000Z'),
      to: new Date('2026-07-02T12:00:00.000Z'),
    })

    expect(series).toHaveLength(2)
    expect(series[0].day).toBe('2026-07-01')
    expect(series[0].rate).toBeCloseTo(0.9, 5)
    expect(series[1].rate).toBeCloseTo(0.8, 5)
  })

  it('marca el día como null si no había aves', () => {
    const series = dailyLayingRate(input(), {
      from: new Date('2026-07-01T12:00:00.000Z'),
      to: new Date('2026-07-01T12:00:00.000Z'),
    })

    expect(series[0].rate).toBeNull()
  })
})

describe('layingDrop', () => {
  const today = new Date('2026-07-25T12:00:00.000Z')
  const movements = [movement({ type: 'buy', qty: 100, movementAt: '2026-06-01T10:00:00.000Z' })]

  /** Recolecciones diarias de `total` huevos entre los días -offset indicados. */
  function daily(fromOffset: number, toOffset: number, total: number) {
    const rows = []

    for (let offset = fromOffset; offset >= toOffset; offset--) {
      rows.push(
        collection({
          localUuid: `c-${offset}`,
          collectionAt: new Date(today.getTime() - offset * 86_400_000).toISOString(),
          total,
        }),
      )
    }

    return rows
  }

  it('detecta tres días seguidos por debajo del 90 % de la referencia', () => {
    const collections = [
      ...daily(17, 4, 90), // referencia: 90 %
      ...daily(3, 1, 70), // últimos tres días: 70 % < 81 %
    ]

    const result = layingDrop(input({ movements, collections }), today)

    expect(result?.dropping).toBe(true)
    expect(result?.reference).toBeCloseTo(0.9, 5)
  })

  it('no dispara si sólo uno de los tres días bajó', () => {
    const collections = [...daily(17, 4, 90), ...daily(3, 3, 70), ...daily(2, 1, 89)]

    expect(layingDrop(input({ movements, collections }), today)?.dropping).toBe(false)
  })

  it('la referencia no se solapa con los días evaluados', () => {
    // Si la referencia incluyera los días de la caída, se arrastraría hacia
    // abajo y la alerta se taparía sola justo cuando más importa.
    const collections = [...daily(17, 4, 90), ...daily(3, 1, 10)]
    const result = layingDrop(input({ movements, collections }), today)

    expect(result?.reference).toBeCloseTo(0.9, 5)
    expect(result?.dropping).toBe(true)
  })

  it('devuelve null sin historia suficiente', () => {
    expect(layingDrop(input({ movements }), today)).toBeNull()
  })
})
```

- [ ] **Step 2: Ejecuta el test para verificar que falla**

Run: `npm test -- metrics`
Expected: FAIL — `dailyLayingRate is not a function`.

- [ ] **Step 3: Escribe la implementación**

Añade a `resources/js/domain/metrics.ts`:

```ts
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
  return dayKeysBetween(window).map((day) => {
    const noon = new Date(`${day}T12:00:00.000Z`)
    const dayWindow = { from: startOfFarmDay(noon), to: endOfFarmDay(noon) }

    const eggs = eggsLaid(input.collections, dayWindow, input.penId)
    const hens = aliveChickensAt(input.movements, endOfFarmDay(noon), input.penId)

    return { day, eggs, hens, rate: hens > 0 ? eggs / hens : null }
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
  }).filter((d) => d.rate !== null)

  if (reference.length === 0) return null

  const recent = dailyLayingRate(input, {
    from: startOfFarmDay(addDays(today, -DROP_RECENT_DAYS)),
    to: endOfFarmDay(addDays(today, -1)),
  })

  if (recent.length < DROP_RECENT_DAYS || recent.some((d) => d.rate === null)) return null

  const average = reference.reduce((sum, d) => sum + (d.rate ?? 0), 0) / reference.length
  const rates = recent.map((d) => d.rate as number)

  return {
    dropping: average > 0 && rates.every((rate) => rate < average * DROP_THRESHOLD),
    reference: average,
    recent: rates,
  }
}
```

- [ ] **Step 4: Ejecuta los tests para verificar que pasan**

Run: `npm test -- metrics`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resources/js/domain/metrics.ts resources/js/domain/metrics.test.ts
git commit -m "feat(metrics): detect a sustained drop in laying rate"
```

---

## Task 8: Clientes morosos recurrentes

**Files:**
- Modify: `resources/js/domain/metrics.ts`
- Modify: `resources/js/domain/metrics.test.ts`

**Interfaces:**
- Consumes: `Sale` de `@/types/domain`.
- Produces: `SlowPayer { customerId, overdueSales, total, oldestDays }` y `slowPayers(sales, today?): SlowPayer[]`.

- [ ] **Step 1: Escribe el test que falla**

Añade a `resources/js/domain/metrics.test.ts`:

```ts
import { slowPayers } from './metrics'

describe('slowPayers', () => {
  const today = new Date('2026-07-31T12:00:00.000Z')

  /** Venta con saldo, hecha hace `days` días. */
  function debt(id: string, customerId: string, days: number, balance: number): Sale {
    return sale({
      localUuid: id,
      customerId,
      soldAt: new Date(today.getTime() - days * 86_400_000).toISOString(),
      total: balance,
      balance,
      status: 'pending',
    })
  }

  it('marca al cliente con dos o más ventas vencidas', () => {
    const sales = [debt('s-1', 'cus-1', 20, 50_000), debt('s-2', 'cus-1', 30, 30_000)]

    const result = slowPayers(sales, today)

    expect(result).toHaveLength(1)
    expect(result[0].customerId).toBe('cus-1')
    expect(result[0].overdueSales).toBe(2)
    expect(result[0].total).toBe(80_000)
    expect(result[0].oldestDays).toBe(30)
  })

  it('no marca al cliente con una sola venta vencida', () => {
    expect(slowPayers([debt('s-1', 'cus-1', 20, 50_000)], today)).toEqual([])
  })

  it('no cuenta las ventas recientes ni las anuladas ni las pagadas', () => {
    const sales = [
      debt('s-1', 'cus-1', 20, 50_000),
      debt('s-2', 'cus-1', 3, 30_000), // reciente
      { ...debt('s-3', 'cus-1', 40, 20_000), status: 'void' as const },
      { ...debt('s-4', 'cus-1', 40, 0), balance: 0 },
    ]

    expect(slowPayers(sales, today)).toEqual([])
  })
})
```

- [ ] **Step 2: Ejecuta el test para verificar que falla**

Run: `npm test -- metrics`
Expected: FAIL — `slowPayers is not a function`.

- [ ] **Step 3: Escribe la implementación**

Añade a `resources/js/domain/metrics.ts`:

```ts
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
```

- [ ] **Step 4: Ejecuta los tests y los tipos**

Run: `npm run type-check && npm test`
Expected: sin errores; toda la suite en verde.

- [ ] **Step 5: Commit**

```bash
git add resources/js/domain/metrics.ts resources/js/domain/metrics.test.ts
git commit -m "feat(metrics): flag customers with repeated overdue sales"
```

---

## Task 9: Composable que carga los datos

**Files:**
- Create: `resources/js/composables/useMetrics.ts`

**Interfaces:**
- Consumes: `MetricsInput` de `@/domain/metrics`, `db` de `@/db/db`, `useFarmStore` de `@/stores/farm`.
- Produces: `useMetrics()` con `load(): Promise<MetricsInput>`.

- [ ] **Step 1: Escribe el composable**

Crea `resources/js/composables/useMetrics.ts`:

```ts
import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import type { MetricsInput } from '@/domain/metrics'

/**
 * Carga de Dexie todo lo que necesita el motor de indicadores, de una sola vez.
 *
 * Sin esto cada vista releería IndexedDB por su cuenta y el mismo dato se
 * cargaría cuatro veces por pantalla. Las consultas usan el índice `farmId`,
 * que existe en todas las tablas.
 *
 * Se carga la granja COMPLETA aunque haya un galpón activo: el filtro por
 * galpón lo aplican las funciones puras, que necesitan ver todos los
 * movimientos para tratar bien las transferencias.
 */
export function useMetrics() {
  const farm = useFarmStore()

  async function load(): Promise<MetricsInput> {
    const farmId = farm.farmId

    if (!farmId) {
      return {
        collections: [],
        movements: [],
        sales: [],
        payments: [],
        feedRecords: [],
        feedPurchases: [],
        feedTypes: [],
        categories: [],
        penId: farm.activePenId,
      }
    }

    const [collections, movements, sales, payments, feedRecords, feedPurchases] = await Promise.all([
      db.eggCollections.where('farmId').equals(farmId).toArray(),
      db.chickenMovements.where('farmId').equals(farmId).toArray(),
      db.sales.where('farmId').equals(farmId).toArray(),
      db.payments.where('farmId').equals(farmId).toArray(),
      db.feedRecords.where('farmId').equals(farmId).toArray(),
      db.feedPurchases.where('farmId').equals(farmId).toArray(),
    ])

    return {
      collections,
      movements,
      sales,
      payments,
      feedRecords,
      feedPurchases,
      // Los catálogos ya están en memoria en el store: no hace falta releerlos.
      feedTypes: farm.feedTypes,
      categories: farm.categories,
      penId: farm.activePenId,
    }
  }

  return { load }
}
```

- [ ] **Step 2: Verifica los tipos**

Run: `npm run type-check`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add resources/js/composables/useMetrics.ts
git commit -m "feat(metrics): load metric inputs from the local database once"
```

---

## Task 10: Indicadores en Reportes

**Files:**
- Modify: `resources/js/views/reports/ReportsView.vue`

**Interfaces:**
- Consumes: `useMetrics`, `layingRate`, `feedConversion`, `feedCostPerEgg`, `incomeOverFeedCost`, `dailyLayingRate`, `ChartConfig` de `@/components/charts/BaseChart.vue`.
- Produces: nada para tareas posteriores.

- [ ] **Step 1: Carga los datos del motor**

En el `<script setup>` de `ReportsView.vue`, junto a los `ref` que ya existen (`collections`, `sales`, `payments`, `movements`), añade:

```ts
import { useMetrics } from '@/composables/useMetrics'
import {
  dailyLayingRate,
  feedConversion,
  feedCostPerEgg,
  incomeOverFeedCost,
  layingRate,
  type MetricsInput,
} from '@/domain/metrics'

const metrics = useMetrics()
const data = ref<MetricsInput | null>(null)
```

En la función que ya carga los datos al montar la vista (la que rellena `collections`, `sales`, `payments` y `movements`), añade al final:

```ts
data.value = await metrics.load()
```

- [ ] **Step 2: Calcula los indicadores**

Añade después de los `computed` existentes:

```ts
/** Indicadores del periodo. `null` = no calculable; la interfaz muestra "—". */
const rate = computed(() => (data.value ? layingRate(data.value, window.value) : null))
const conversion = computed(() => (data.value ? feedConversion(data.value, window.value) : null))
const costPerEgg = computed(() => (data.value ? feedCostPerEgg(data.value, window.value) : null))
const margin = computed(() =>
  data.value ? incomeOverFeedCost(data.value, window.value) : null,
)

/** Serie diaria de postura para la gráfica, en porcentaje. */
const layingChartConfig = computed<ChartConfig>(() => {
  const series = data.value ? dailyLayingRate(data.value, window.value) : []

  return {
    type: 'line',
    labels: series.map((point) => shortDayLabel(point.day)),
    datasets: [
      {
        label: 'Postura (%)',
        data: series.map((point) => (point.rate === null ? 0 : Math.round(point.rate * 100))),
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22, 163, 74, 0.15)',
        fill: true,
      },
    ],
  }
})
```

- [ ] **Step 3: Muéstralos**

Añade en el `<template>`, encima de la tabla de ventas:

```html
<section class="mb-6 grid grid-cols-2 gap-3">
  <div class="card">
    <p class="text-sm font-semibold text-slate-500">Postura</p>
    <p class="text-2xl font-bold text-grass-600">
      {{ rate === null ? '—' : `${fmtNumber(rate * 100, 1)} %` }}
    </p>
  </div>
  <div class="card">
    <p class="text-sm font-semibold text-slate-500">Alimento por docena</p>
    <p class="text-2xl font-bold text-slate-800">
      {{ conversion === null ? '—' : `${fmtNumber(conversion, 2)} kg` }}
    </p>
  </div>
  <div class="card">
    <p class="text-sm font-semibold text-slate-500">Costo por huevo</p>
    <p class="text-2xl font-bold text-slate-800">
      {{ costPerEgg === null ? '—' : fmtMoney(costPerEgg) }}
    </p>
  </div>
  <div class="card">
    <p class="text-sm font-semibold text-slate-500">Ingreso menos alimento</p>
    <p
      class="text-2xl font-bold"
      :class="(margin?.iofc ?? 0) >= 0 ? 'text-grass-600' : 'text-alert-600'"
    >
      {{ margin === null ? '—' : fmtMoney(margin.iofc) }}
    </p>
    <p class="text-xs text-slate-400">Cobrado: {{ margin === null ? '—' : fmtMoney(margin.collected) }}</p>
  </div>
</section>

<section class="card mb-6">
  <p class="mb-2 text-sm font-semibold text-slate-500">Postura por día</p>
  <BaseChart :config="layingChartConfig" />
</section>
```

Comprueba que `fmtMoney`, `fmtNumber` y `shortDayLabel` estén importados de `@/utils/format` en este archivo; añade los que falten.

- [ ] **Step 4: Verifica tipos y build**

Run: `npm run type-check && npm test`
Expected: sin errores; suite en verde.

- [ ] **Step 5: Commit**

```bash
git add resources/js/views/reports/ReportsView.vue
git commit -m "feat(reports): show laying rate, feed conversion and margin"
```

---

## Task 11: Home — margen del mes y tendencia de huevos

**Files:**
- Modify: `resources/js/views/HomeView.vue`

**Interfaces:**
- Consumes: `useMetrics`, `incomeOverFeedCost`, `eggsLaid`, `IncomeOverFeed` y los helpers de fecha de `@/utils/format`.
- Produces: nada para tareas posteriores.

- [ ] **Step 1: Calcula el margen del mes y la tendencia**

En el `<script setup>` de `HomeView.vue` añade los imports:

```ts
import { useMetrics } from '@/composables/useMetrics'
import { incomeOverFeedCost, eggsLaid, type IncomeOverFeed } from '@/domain/metrics'
import { addDays, dayKey, endOfFarmDay, startOfFarmDay } from '@/utils/format'
```

`fmtMoney` y `fmtNumber` ya están importados de `@/utils/format` en este archivo: añade los nuevos nombres a ese import en vez de escribir una segunda línea.

Y los `ref`:

```ts
const metrics = useMetrics()
const margin = ref<IncomeOverFeed | null>(null)
/** Variación de los huevos de hoy contra el promedio de los 7 días anteriores. */
const eggsTrend = ref<number | null>(null)
```

Dentro de `refresh()`, después del `Promise.all` existente:

```ts
const data = await metrics.load()
const today = new Date()

// Margen del mes en curso.
const monthStart = new Date(today)
monthStart.setDate(1)
margin.value = incomeOverFeedCost(data, {
  from: startOfFarmDay(monthStart),
  to: endOfFarmDay(today),
})

// Tendencia: hoy contra el promedio diario de los 7 días anteriores.
// Con menos de 3 días de historia no se muestra: un porcentaje calculado sobre
// uno o dos días no dice nada y sólo genera desconfianza.
const previous = {
  from: startOfFarmDay(addDays(today, -7)),
  to: endOfFarmDay(addDays(today, -1)),
}
const previousEggs = eggsLaid(data.collections, previous, farm.activePenId)
// `dayKey` y no `slice(0, 10)`: el ISO está en UTC y en Bogotá (UTC-5) una
// recolección de la tarde caería en el día siguiente, inflando el divisor.
const daysWithData = new Set(
  data.collections
    .filter((c) => {
      const at = new Date(c.collectionAt).getTime()

      return at >= previous.from.getTime() && at <= previous.to.getTime()
    })
    .map((c) => dayKey(c.collectionAt)),
).size

const average = daysWithData >= 3 ? previousEggs / daysWithData : 0
eggsTrend.value = average > 0 ? (eggsToday.value - average) / average : null
```

- [ ] **Step 2: Muéstralo**

En la tarjeta «Huevos hoy» del `<template>`, debajo de `<p class="num-big">{{ eggsToday }}</p>`:

```html
<p
  v-if="eggsTrend !== null"
  class="text-xs font-semibold"
  :class="eggsTrend >= 0 ? 'text-grass-600' : 'text-alert-600'"
>
  {{ eggsTrend >= 0 ? '▲' : '▼' }} {{ fmtNumber(Math.abs(eggsTrend) * 100, 0) }} % vs. promedio
</p>
```

Añade una tarjeta nueva al final de la sección del resumen, después de la de «Por cobrar»:

```html
<div class="card col-span-2">
  <p class="text-sm font-semibold text-slate-500">Ingreso menos alimento (mes)</p>
  <p
    class="num-big"
    :class="(margin?.iofc ?? 0) >= 0 ? 'text-grass-600' : 'text-alert-600'"
  >
    {{ margin === null ? '—' : fmtMoney(margin.iofc) }}
  </p>
  <p class="text-xs text-slate-400">
    Ventas {{ margin === null ? '—' : fmtMoney(margin.sales) }} · Alimento
    {{ margin === null ? '—' : fmtMoney(margin.feedCost) }}
  </p>
</div>
```

La clase `num-big` ya existe en `resources/css/app.css` y aplica `text-grass-600`; la clase dinámica la sobreescribe cuando el margen es negativo.

- [ ] **Step 3: Verifica tipos y tests**

Run: `npm run type-check && npm test`
Expected: sin errores; suite en verde.

- [ ] **Step 4: Commit**

```bash
git add resources/js/views/HomeView.vue
git commit -m "feat(home): surface monthly feed margin and egg trend"
```

---

## Task 12: Tres alertas predictivas

**Files:**
- Modify: `resources/js/composables/useAlerts.ts`

**Interfaces:**
- Consumes: `feedStockDays`, `layingDrop`, `slowPayers`, `MetricsInput` de `@/domain/metrics`; `useMetrics`.
- Produces: nada para tareas posteriores.

- [ ] **Step 1: Carga los datos del motor**

En `useAlerts.ts`, añade los imports:

```ts
import { useMetrics } from '@/composables/useMetrics'
import { aliveChickens, feedStockDays, layingDrop, slowPayers } from '@/domain/metrics'
import { fmtNumber } from '@/utils/format'
```

Dentro de `useAlerts()`, junto a `const farm = useFarmStore()`:

```ts
const metrics = useMetrics()
```

Y dentro de `compute()`, después del `Promise.all` existente:

```ts
const data = await metrics.load()
```

- [ ] **Step 2: Añade la alerta de alimento**

Después del bloque de mortalidad:

```ts
// ----- Alimento por acabarse -----
// Quedarse sin alimento un domingo tumba la postura una semana entera. El dato
// es de TODA la granja: el alimento no se compra por galpón.
const stock = feedStockDays(data)

if (stock.days !== null && stock.days <= 7) {
  const scope = farm.activePens.length > 1 ? ' (toda la granja)' : ''
  const unsure = stock.excludedTypes.length > 0
    ? ` No se pudo contar: ${stock.excludedTypes.join(', ')}.`
    : ''

  alerts.push({
    id: 'feed-low',
    severity: stock.days <= 3 ? 'high' : 'med',
    icon: 'chicken',
    title: 'Alimento por acabarse',
    detail: `Queda alimento para ${stock.days} día(s)${scope}. Consumo: ${fmtNumber(stock.dailyKg, 1)} kg/día.${unsure}`,
    to: '/feed/purchase',
  })
}
```

- [ ] **Step 3: Añade la alerta de caída de postura**

```ts
// ----- Caída de postura -----
// Es la señal temprana de enfermedad, calor o parásitos: los huevos bajan antes
// de que se note nada más.
const drop = layingDrop(data)

if (drop?.dropping) {
  const last = drop.recent[drop.recent.length - 1]

  alerts.push({
    id: 'laying-drop',
    severity: 'high',
    icon: 'egg',
    title: 'La postura viene cayendo',
    detail: `Tres días seguidos por debajo de lo normal: ${fmtNumber(last * 100, 0)} % frente a ${fmtNumber(drop.reference * 100, 0)} % habitual. Revisa agua, alimento y calor.`,
    to: '/reports',
  })
}
```

- [ ] **Step 4: Añade la alerta de clientes morosos**

```ts
// ----- Clientes con retraso recurrente -----
const slow = slowPayers(sales)

if (slow.length > 0) {
  const total = slow.reduce((sum, payer) => sum + payer.total, 0)

  alerts.push({
    id: 'slow-payers',
    severity: 'med',
    icon: 'people',
    title: 'Clientes que se atrasan seguido',
    detail: `${slow.length} cliente(s) tienen 2 o más ventas vencidas. Total: ${fmtMoney(total)}.`,
    to: '/customers/debts',
  })
}
```

- [ ] **Step 5: Verifica tipos y tests**

Run: `npm run type-check && npm test`
Expected: sin errores; suite en verde.

- [ ] **Step 6: Prueba en el navegador**

Run: `npm run dev` y abre la app. Registra una compra de alimento y varios consumos diarios; comprueba que la alerta de alimento aparece cuando el stock baja de 7 días.

Verifica también que el número de «Gallinas vivas» del inicio y el umbral de la alerta de mortalidad coinciden cuando hay un galpón seleccionado y transferencias registradas: es el bug de la tarea 1.

- [ ] **Step 7: Commit**

```bash
git add resources/js/composables/useAlerts.ts
git commit -m "feat(alerts): warn about low feed, falling laying rate and slow payers"
```

---

## Verificación final

- [ ] `npm run type-check` sin errores
- [ ] `npm test` en verde (33 tests de la calculadora + los nuevos de metrics)
- [ ] `npm run build` termina bien
- [ ] `php artisan test` sigue en verde (48 tests): ninguna tarea toca el backend, así que debe seguir igual
- [ ] En el navegador: reportes muestran los cuatro indicadores y la gráfica de postura; el inicio muestra el margen del mes
