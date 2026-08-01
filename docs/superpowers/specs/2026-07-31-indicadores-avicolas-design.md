# Indicadores avícolas y alertas predictivas

Fecha: 2026-07-31
Estado: diseño aprobado, pendiente de plan de implementación

## El problema

La app registra todos los datos necesarios para saber si el negocio gana plata y
nunca los cruza. Una búsqueda en todo el proyecto no encuentra ninguna mención a
costo, utilidad, margen, porcentaje de postura ni conversión alimentaria.

El avicultor teclea todos los días y la app no le contesta la pregunta que
importa: ¿estoy ganando o perdiendo?

Los datos que ya existen:

| Dato | Dónde |
|---|---|
| Costo del alimento comprado | `feed_purchases.total_cost` |
| Costo del alimento consumido | `feed_records.totalCost`, por línea `unitCost` |
| Producción | `egg_collections.lines[].qty` |
| Plantel | `chicken_movements` (buy, birth, death, sale, revoke, transfer, adjust) |
| Ingresos | `sales.total`, `payments.amount` |

## Dos hallazgos previos al diseño

### 1. El único costo capturado es el alimento

`chicken_movements` y `vaccines` no tienen campo de costo. La compra de aves, la
droga y la mano de obra no entran al sistema.

Esto no bloquea el diseño. **«Ingreso menos costo de alimento»** (IOFC) es el
indicador estándar en producción comercial de huevo, justamente porque el
alimento es el 65-75% del costo. Se entrega con ese nombre. No se presenta como
«utilidad neta», que sería falso.

### 2. La fórmula de aves vivas está duplicada y las copias divergieron

- `stores/sync.ts:636-641` suma `transfer` cuando hay galpón seleccionado
- `composables/useAlerts.ts:53-56` no lo suma

Con transferencias entre galpones y un galpón activo, la alerta de mortalidad
compara contra un plantel equivocado y el umbral sale mal. El diseño unifica las
dos copias en una función pura.

## Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Unidades de alimento | Convertir con el último `kgPerBag` conocido del tipo | No pide nada al usuario y acierta en el caso normal. Un tipo nunca comprado se excluye del stock y la alerta lo declara. |
| Otros gastos (droga, luz, mano de obra) | Fuera de alcance | Añade tecleo manual que nadie mantiene. Se entrega IOFC bien nombrado. Queda como fase futura si se echa en falta. |
| Visibilidad de la plata | Sin restricción de rol | La granja la opera el dueño. `FarmPermissions` ya existe: restringir después es un cambio de una línea. |

## Arquitectura

Un motor de cálculo, tres consumidores. Hoy el cálculo está repartido en tres
sitios que no se comunican: `stores/sync.ts`, `ReportsView.vue` y `useAlerts.ts`.

```
resources/js/domain/metrics.ts          funciones puras, sin Dexie
        |                |                    |
  useMetrics.ts     ReportsView          useAlerts
  (carga ventana)   (gráficas)           (umbrales)
        |
    HomeView
```

### `resources/js/domain/metrics.ts`

Funciones puras: reciben arreglos, devuelven números. Sin acceso a base de datos
ni a stores. Sigue el patrón ya establecido en `domain/sales.ts`.

Se prueban con vitest sin base de datos, igual que
`composables/useCalculator.test.ts`. Son cálculos de plata: llevan tests, no
confianza.

```ts
export interface MetricsWindow {
  from: Date
  to: Date
}

export interface MetricsInput {
  collections: EggCollection[]
  movements: ChickenMovement[]
  sales: Sale[]
  payments: Payment[]
  feedRecords: FeedRecord[]
  feedPurchases: FeedPurchase[]
  categories: EggCategory[]
  feedTypes: FeedType[]
  /** '' = todos los galpones */
  penId: string
}
```

Convención: los indicadores que no se pueden calcular devuelven `null`, no `0`.
Una postura de 0 % y una postura desconocida son cosas distintas; mostrar 0 %
cuando no hay gallinas es mentir. La interfaz muestra `—` ante `null`.

### `resources/js/composables/useMetrics.ts`

Carga de Dexie una vez por ventana de fechas y devuelve todo calculado. Evita
que cada vista relea IndexedDB. Las consultas usan el índice `farmId`, que ya
existe en las 16 tablas.

### Movimiento de código existente

`aliveChickens` sale de `stores/sync.ts` y pasa a `metrics.ts` como función pura
sobre un arreglo de movimientos. El envoltorio asíncrono de `sync.ts` se queda
como está por compatibilidad, pero delega. `useAlerts.ts` borra su copia y llama
a la función común: eso corrige el bug de las transferencias.

## Los indicadores

### Porcentaje de postura

```
postura = huevos puestos / ave-día
ave-día = suma de aves vivas de cada día de la ventana
```

Se usa ave-día, no aves al final del periodo. El plantel cambia dentro de la
ventana (muertes, compras) y dividir por el valor final da un número inflado. Es
el método estándar de la industria (*hen-day production*).

Cuentan **todos** los huevos, incluidos los de categorías con `isBroken`: una
gallina que puso un huevo roto puso un huevo. Para inventario e ingresos sí se
filtra por `sellable`.

Casos borde:
- `ave-día = 0` → `null`
- ventana de 0 días → `null`

### Conversión alimentaria

```
conversión = kg de alimento consumido / docenas producidas
```

Se calcula sobre `feedRecords` (consumo), no sobre compras: comprar cinco bultos
un lunes no es haberlos consumido. Referencia de la industria: 2.0-2.3 kg por
docena.

Casos borde: `docenas = 0` → `null`.

### Costo de alimento por huevo

```
costo por huevo = costo del alimento consumido / huevos puestos
```

Usa `feedRecords.totalCost`, que ya está desnormalizado. Le dice al avicultor
bajo qué precio no puede vender.

### Ingreso menos costo de alimento (IOFC)

```
iofc = ventas del periodo - costo del alimento consumido
```

`ventas` excluye las anuladas (`status === 'void'`).

Se muestra también **cobrado** (suma de `payments.amount` del periodo, excluidos
los pagos con `voidedAt`) como número aparte, para no confundir plata facturada
con plata en mano. El margen se calcula sobre ventas, que es el ingreso económico
del periodo.

### Días de alimento restantes

```
stock_kg    = kg comprados - kg consumidos   (por tipo de alimento)
consumo_día = promedio de kg/día de los últimos 14 días
días        = stock_kg / consumo_día
```

Conversión de unidades, según la decisión tomada:

- Las compras dan kg directo: `bags × kgPerBag`.
- El consumo viene en `feedType.unit`, que es texto libre. Si la unidad no es
  kg, se multiplica por el `kgPerBag` más reciente registrado para ese tipo en
  `feed_purchases`.
- Un tipo de alimento que nunca se ha comprado no tiene factor de conversión: se
  excluye del cálculo y la función devuelve su nombre en `excludedTypes`, para
  que la interfaz pueda decir de qué no está seguro. Se prohíbe adivinar en
  silencio.

**El stock es siempre de toda la granja e ignora el galpón activo.**
`feed_purchases` no tiene `penId` —el alimento se compra para la granja, no para
un galpón— mientras que `feed_records` sí lo tiene. Filtrar el consumo por galpón
contra unas compras sin filtrar daría un stock inflado. La interfaz debe
etiquetar el dato como «de toda la granja» cuando haya un galpón seleccionado.

Casos borde:
- `consumo_día = 0` → `null` (no hay con qué proyectar)
- stock negativo → se reporta `0` días: significa que faltan compras por
  registrar, y avisar es más útil que mostrar un número negativo

### Caída de postura

```
referencia = promedio de la postura de los días -17 a -4 (14 días)
sostenida  = los días -3, -2 y -1 estuvieron todos por debajo
             del 90 % de esa referencia
```

Los 14 días de referencia son **anteriores** a los 3 que se evalúan, sin
solaparse. Si se solaparan, una caída fuerte arrastraría su propia referencia
hacia abajo y se taparía sola.

Umbral explicable a propósito, en vez de desviaciones estándar: el avicultor
tiene que poder entender por qué le saltó el aviso. Es la señal temprana de
enfermedad, calor o parásitos.

Requiere 17 días de historia con al menos un día de datos en la referencia; con
menos devuelve `null` y no genera alerta. Una alerta basada en tres días de
historia sería ruido.

### Cliente moroso recurrente

```
moroso = tiene 2 o más ventas distintas con saldo pendiente
         y antigüedad de 14 días o más
```

Se calcula sólo con `sales`, sin cruzar pagos. Motivo: un `payment` puede no
estar atado a una venta (abono al saldo global, `sale_id` nullable), así que
«cuántos días tardó en pagar» no es calculable de forma fiable. Esta definición
sí lo es.

## Fases

Cada fase se despliega sola. Si el trabajo se detiene en la 3, lo entregado
sirve por sí mismo.

Las fases 1 a 4 son una sola pieza: el motor de indicadores y las tres
superficies que lo consumen. Las fases 5 y 6 son trabajo de usabilidad
independiente, sin relación técnica con el motor. Merecen su propio plan de
implementación y pueden hacerse en cualquier orden respecto a las anteriores.

### Fase 1 — Motor

- `domain/metrics.ts` con todas las funciones puras
- `domain/metrics.test.ts` con vitest, un caso por indicador y por caso borde
- `aliveChickens` unificada; `useAlerts.ts` deja de tener su propia copia
- Corrige el bug de transferencias

Sin cambios visibles. Es la base de las fases 2, 3 y 4.

### Fase 2 — Reportes

- Los cinco indicadores en `views/reports/ReportsView.vue`
- Gráfica de postura diaria, reutilizando `BaseChart.vue`
- Respeta la ventana de fechas y el galpón activo que ya existen

### Fase 3 — Home

- Tarjeta de «Ingreso menos alimento» del mes en curso
- Tendencia **sólo en la tarjeta «Huevos hoy»**: huevos de hoy contra el promedio
  diario de los 7 días anteriores, como `▲ 4 %`. Las otras tres tarjetas no la
  llevan: en «Gallinas vivas» y «Por cobrar» un porcentaje diario no significa
  nada, y «Próxima vacuna» no es una cantidad.
- Con menos de 3 días de historia la tendencia se oculta en vez de mostrar un
  número sin sentido

### Fase 4 — Alertas predictivas

Tres alertas nuevas en `useAlerts.ts`, sobre el motor de la fase 1:

- Días de alimento restantes (severidad alta si quedan 3 días o menos)
- Caída de postura sostenida
- Cliente moroso recurrente

### Fase 5 — Menos tecleo

- Memoria de precios: `unitPrice` arranca en 0 en cada venta
  (`views/sales/SaleNewView.vue:32`). Recordar el último precio por categoría +
  presentación, y por cliente cuando lo haya.
- «Repetir la recolección de ayer»: precarga las cantidades del día anterior
  para ajustar lo que cambió.

### Fase 6 — Jerarquía en la home

`views/HomeView.vue:82-91` tiene diez botones del mismo tamaño y color. El
avicultor entra muchas veces al día a hacer una sola cosa y la busca entre diez
mosaicos idénticos.

- Tres acciones grandes arriba: Huevos, Vender, Muerte
- El resto en un cajón «Más»

## Manejo de errores

- Indicador no calculable → `null` → la interfaz muestra `—`. Nunca `NaN`,
  `Infinity` ni un `0` engañoso.
- Tipo de alimento sin factor de conversión → excluido y declarado en
  `excludedTypes`.
- Las fechas usan `startOfFarmDay` / `endOfFarmDay` de `utils/format`, que ya
  respetan la zona horaria de la granja. Un indicador desplazado por zona
  horaria sería un error silencioso.
- Todo se calcula sobre datos locales de Dexie: funciona sin conexión, como el
  resto de la app.

## Pruebas

`domain/metrics.test.ts`, vitest, sin base de datos:

- Un caso por indicador con valores conocidos calculados a mano
- Un caso por caso borde: cero aves, cero huevos, ventana vacía, tipo de
  alimento sin comprar, stock negativo, historia insuficiente para la caída de
  postura
- Ave-día con plantel cambiante: verifica que no se use el valor final
- Ventas anuladas excluidas del IOFC
- Transferencias entre galpones: con galpón activo suman, sin galpón activo no
  alteran el total de la granja (el bug que se corrige)

## Fuera de alcance

- Entidad de otros gastos (droga, luz, mano de obra) y utilidad neta
- Costo en la compra de aves y en las vacunas
- Restricción por rol de los indicadores de plata
- Precio sugerido automático a partir del costo
- Comparación entre granjas o referencias externas del sector
