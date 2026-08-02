<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import {
  addDays,
  dayKey,
  endOfFarmDay,
  fmtDate,
  fmtMoney,
  fmtNumber,
  shortDayLabel,
  startOfFarmDay,
} from '@/utils/format'
import { exportToPDF, exportToExcel } from '@/utils/export'
import { saleStatusClass, saleStatusLabel } from '@/utils/labels'
import { useMetrics } from '@/composables/useMetrics'
import {
  dailyLayingRate,
  feedConversion,
  feedCostPerEgg,
  incomeOverFeedCost,
  layingRate,
  type MetricsInput,
} from '@/domain/metrics'
import type { ChickenMovement, EggCollection, Payment, Sale } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import PenSelector from '@/components/ui/PenSelector.vue'
import BaseChart, { type ChartConfig } from '@/components/charts/BaseChart.vue'

const farm = useFarmStore()

const collections = ref<EggCollection[]>([])
const sales = ref<Sale[]>([])
const payments = ref<Payment[]>([])
const movements = ref<ChickenMovement[]>([])

const metrics = useMetrics()
const data = ref<MetricsInput | null>(null)

const range = ref<'today' | 'week' | 'month' | 'custom'>('week')
const customFrom = ref<string>('')
const customTo = ref<string>('')

/** Tope de días que se pintan en la gráfica diaria. */
const MAX_CHART_DAYS = 92

/**
 * Ventana del reporte, calculada UNA vez por cambio de rango.
 *
 * Antes `inRange()` construía dos objetos Date por cada elemento de cada filtro,
 * y con un rango personalizado largo el bucle diario generaba cientos de
 * etiquetas sin ningún tope.
 */
const window = computed(() => {
  if (range.value === 'custom') {
    const from = customFrom.value
      ? startOfFarmDay(new Date(`${customFrom.value}T12:00:00`))
      : startOfFarmDay()
    const to = customTo.value ? endOfFarmDay(new Date(`${customTo.value}T12:00:00`)) : endOfFarmDay()

    // Si el usuario invierte las fechas las ordenamos, en vez de no mostrar nada.
    return from <= to ? { from, to } : { from: startOfFarmDay(to), to: endOfFarmDay(from) }
  }

  const to = endOfFarmDay()

  if (range.value === 'today') return { from: startOfFarmDay(), to }
  if (range.value === 'week') return { from: startOfFarmDay(addDays(new Date(), -6)), to }

  return { from: startOfFarmDay(addDays(new Date(), -29)), to }
})

function inRange(iso: string | undefined): boolean {
  if (!iso) return false

  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return false

  return time >= window.value.from.getTime() && time <= window.value.to.getTime()
}

function byPen(penId: string | undefined): boolean {
  return !farm.activePenId || penId === farm.activePenId
}

const eggs = computed(() =>
  collections.value
    .filter((c) => inRange(c.collectionAt) && byPen(c.penId))
    .reduce((sum, c) => sum + c.total, 0),
)

/**
 * Muertes por FECHA OPERATIVA (`movementAt`), no por cuándo se digitó el dato.
 * Con `createdAt` una muerte registrada con retraso caía en el período
 * equivocado y el reporte no cuadraba con lo que pasó en el corral.
 */
const deaths = computed(() =>
  movements.value
    .filter((m) => m.type === 'death' && inRange(m.movementAt ?? m.createdAt) && byPen(m.penId))
    .reduce((sum, m) => sum + m.qty, 0),
)

/**
 * Ingresos = pagos cobrados en el período, excluyendo los anulados.
 *
 * Antes se sumaba `sale.paid` de las ventas del período: un abono cobrado
 * semanas después se contaba en la fecha de la venta, y las ventas anuladas
 * seguían sumando porque al anular no se tocaba `paid`.
 */
const income = computed(() =>
  payments.value
    .filter((p) => !p.voidedAt && inRange(p.paidAt))
    .reduce((sum, p) => sum + p.amount, 0),
)

/** Deuda de las ventas del período: no anuladas y con saldo. */
const pendingDebt = computed(() =>
  sales.value
    .filter((s) => s.status !== 'void' && s.balance > 0 && inRange(s.soldAt))
    .reduce((sum, s) => sum + s.balance, 0),
)

/**
 * Producción diaria.
 *
 * Las claves se calculan con `dayKey()` (zona horaria de la granja) tanto al
 * sembrar los días como al agrupar. Antes se mezclaba `date.toISOString()` de
 * una fecha local con `iso.slice(0, 10)` (UTC), así que en Colombia los buckets
 * salían desplazados un día y las recolecciones de la tarde caían en el siguiente.
 */
const dailyEggs = computed(() => {
  const buckets = new Map<string, number>()
  const spanDays =
    Math.floor((window.value.to.getTime() - window.value.from.getTime()) / 86_400_000) + 1
  const days = Math.min(Math.max(spanDays, 1), MAX_CHART_DAYS)

  for (let i = 0; i < days; i++) {
    buckets.set(dayKey(addDays(window.value.from, i)), 0)
  }

  for (const collection of collections.value) {
    if (!inRange(collection.collectionAt) || !byPen(collection.penId)) continue

    const key = dayKey(collection.collectionAt)
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + collection.total)
  }

  return {
    labels: [...buckets.keys()].map(shortDayLabel),
    values: [...buckets.values()],
    truncated: spanDays > MAX_CHART_DAYS,
  }
})

const eggsByCategory = computed(() => {
  const buckets = new Map<string, number>()

  for (const collection of collections.value) {
    if (!inRange(collection.collectionAt) || !byPen(collection.penId)) continue

    for (const line of collection.lines ?? []) {
      const name =
        farm.categories.find((c) => c.localUuid === line.categoryId)?.name ?? 'Sin categoría'

      buckets.set(name, (buckets.get(name) ?? 0) + line.qty)
    }
  }

  return { labels: [...buckets.keys()], values: [...buckets.values()] }
})

const lineChartConfig = computed<ChartConfig>(() => ({
  type: 'line',
  labels: dailyEggs.value.labels,
  datasets: [
    {
      label: 'Huevos recogidos',
      data: dailyEggs.value.values,
      borderColor: '#16a34a',
      backgroundColor: 'rgba(22,163,74,0.15)',
      fill: true,
      tension: 0.3,
    },
  ],
}))

/** Cada porción usa el color real de su categoría, no una lista fija. */
const doughnutChartConfig = computed<ChartConfig>(() => ({
  type: 'doughnut',
  labels: eggsByCategory.value.labels,
  datasets: [
    {
      data: eggsByCategory.value.values,
      backgroundColor: eggsByCategory.value.labels.map(
        (label) => farm.categories.find((c) => c.name === label)?.color ?? '#64748b',
      ),
    },
  ],
}))

/**
 * Indicadores del periodo.
 *
 * `null` significa "no calculable", no cero: la plantilla muestra "—". Una
 * postura de 0 % y una postura desconocida son cosas distintas.
 */
const rate = computed(() => (data.value ? layingRate(data.value, window.value) : null))
const conversion = computed(() => (data.value ? feedConversion(data.value, window.value) : null))
const costPerEgg = computed(() => (data.value ? feedCostPerEgg(data.value, window.value) : null))
const margin = computed(() => (data.value ? incomeOverFeedCost(data.value, window.value) : null))

/** Serie diaria de postura, en porcentaje. Los días sin aves quedan en 0. */
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
        backgroundColor: 'rgba(22,163,74,0.15)',
        fill: true,
        tension: 0.3,
      },
    ],
  }
})

const salesRows = computed(() =>
  sales.value
    .filter((s) => inRange(s.soldAt))
    .sort((a, b) => b.soldAt.localeCompare(a.soldAt))
    .slice(0, 50),
)

const rangeLabel = computed(() => {
  if (range.value === 'today') return 'Hoy'
  if (range.value === 'week') return 'Últimos 7 días'
  if (range.value === 'month') return 'Últimos 30 días'

  return `${fmtDate(window.value.from.toISOString())} a ${fmtDate(window.value.to.toISOString())}`
})

async function load() {
  if (!farm.farmId) return

  ;[collections.value, sales.value, payments.value, movements.value] = await Promise.all([
    db.eggCollections.where('farmId').equals(farm.farmId).toArray(),
    db.sales.where('farmId').equals(farm.farmId).toArray(),
    db.payments.where('farmId').equals(farm.farmId).toArray(),
    db.chickenMovements.where('farmId').equals(farm.farmId).toArray(),
  ])

  data.value = await metrics.load()
}

onMounted(load)
watch(() => farm.activePenId, load)

const salesColumns = [
  { key: 'soldAt', label: 'Fecha', format: 'date' as const },
  { key: 'total', label: 'Total', format: 'money' as const },
  { key: 'paid', label: 'Pagado', format: 'money' as const },
  { key: 'balance', label: 'Saldo', format: 'money' as const },
  { key: 'status', label: 'Estado', translate: (v: unknown) => saleStatusLabel(String(v)) },
]

function exportSalesPDF() {
  void exportToPDF({
    title: 'Ventas',
    subtitle: rangeLabel.value,
    farmName: farm.farmName,
    fileName: `ventas-${range.value}-${dayKey(new Date())}`,
    columns: salesColumns,
    rows: salesRows.value as unknown as Array<Record<string, unknown>>,
  })
}

function exportSalesExcel() {
  void exportToExcel({
    title: 'Ventas',
    fileName: `ventas-${range.value}-${dayKey(new Date())}`,
    columns: salesColumns,
    rows: salesRows.value as unknown as Array<Record<string, unknown>>,
  })
}

function exportProductionPDF() {
  const rows = dailyEggs.value.labels.map((label, i) => ({
    day: label,
    eggs: dailyEggs.value.values[i],
  }))

  void exportToPDF({
    title: 'Producción de huevos',
    subtitle: rangeLabel.value,
    farmName: farm.farmName,
    fileName: `produccion-${range.value}-${dayKey(new Date())}`,
    columns: [
      { key: 'day', label: 'Día', format: 'text' },
      { key: 'eggs', label: 'Huevos', format: 'number' },
    ],
    rows,
  })
}
</script>

<template>
  <ScreenShell title="Reportes">
    <PenSelector v-if="farm.activePens.length > 1" class="mb-4" />

    <div class="mb-4 grid grid-cols-4 gap-2">
      <button
        v-for="r in (['today', 'week', 'month', 'custom'] as const)"
        :key="r"
        type="button"
        :class="[
          'rounded-xl2 border-2 px-2 py-3 text-sm font-bold',
          range === r
            ? 'border-grass-500 bg-grass-50 text-grass-700'
            : 'border-slate-200 bg-white text-slate-600',
        ]"
        @click="range = r"
      >
        {{ r === 'today' ? 'Hoy' : r === 'week' ? 'Semana' : r === 'month' ? 'Mes' : 'Fechas' }}
      </button>
    </div>

    <div v-if="range === 'custom'" class="card mb-4 grid grid-cols-2 gap-3">
      <label class="block">
        <span class="text-sm font-semibold text-slate-600">Desde</span>
        <input
          v-model="customFrom"
          type="date"
          :max="customTo || undefined"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-3 py-2 text-base focus:border-grass-500 focus:outline-none"
        />
      </label>
      <label class="block">
        <span class="text-sm font-semibold text-slate-600">Hasta</span>
        <input
          v-model="customTo"
          type="date"
          :min="customFrom || undefined"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-3 py-2 text-base focus:border-grass-500 focus:outline-none"
        />
      </label>
    </div>

    <p class="mb-4 text-sm text-slate-500">
      {{ rangeLabel }}<span v-if="farm.activePen"> · {{ farm.activePen.name }}</span>
    </p>

    <section class="mb-6 grid grid-cols-2 gap-3">
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">Huevos recogidos</p>
        <p class="num-big">{{ fmtNumber(eggs) }}</p>
      </div>
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">Ingresos cobrados</p>
        <p class="text-2xl font-extrabold text-grass-600">{{ fmtMoney(income) }}</p>
      </div>
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">Muertes</p>
        <p class="num-big text-alert-600">{{ fmtNumber(deaths) }}</p>
      </div>
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">Por cobrar</p>
        <p
          class="text-2xl font-extrabold"
          :class="pendingDebt > 0 ? 'text-alert-600' : 'text-slate-800'"
        >
          {{ fmtMoney(pendingDebt) }}
        </p>
      </div>
    </section>

    <!-- Indicadores del oficio. "—" cuando el dato no se puede calcular. -->
    <h2 class="mb-3 text-lg font-bold text-slate-700">Indicadores</h2>
    <section class="mb-6 grid grid-cols-2 gap-3">
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">Postura</p>
        <p class="text-2xl font-extrabold text-grass-600">
          {{ rate === null ? '—' : `${fmtNumber(rate * 100, 1)} %` }}
        </p>
      </div>
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">Alimento por docena</p>
        <p class="text-2xl font-extrabold text-slate-800">
          {{ conversion === null ? '—' : `${fmtNumber(conversion, 2)} kg` }}
        </p>
      </div>
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">Costo por huevo</p>
        <p class="text-2xl font-extrabold text-slate-800">
          {{ costPerEgg === null ? '—' : fmtMoney(costPerEgg) }}
        </p>
        <p class="text-xs text-slate-400">Sólo alimento</p>
      </div>
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">Ingreso menos alimento</p>
        <p
          class="text-2xl font-extrabold"
          :class="(margin?.iofc ?? 0) >= 0 ? 'text-grass-600' : 'text-alert-600'"
        >
          {{ margin === null ? '—' : fmtMoney(margin.iofc) }}
        </p>
        <p class="text-xs text-slate-400">
          Ventas {{ margin === null ? '—' : fmtMoney(margin.sales) }}
        </p>
      </div>
    </section>

    <section v-if="rate !== null" class="card mb-6">
      <h2 class="mb-3 text-lg font-bold text-slate-700">Postura por día</h2>
      <BaseChart :config="layingChartConfig" :height="220" />
      <p class="mt-2 text-xs text-slate-400">
        Huevos por gallina y día. Una caída sostenida avisa antes que cualquier otra señal.
      </p>
    </section>

    <section v-if="dailyEggs.values.some((v) => v > 0)" class="card mb-6">
      <h2 class="mb-3 text-lg font-bold text-slate-700">Producción de huevos</h2>
      <BaseChart :config="lineChartConfig" :height="220" />
      <p v-if="dailyEggs.truncated" class="mt-2 text-xs text-slate-400">
        Se muestran los primeros {{ MAX_CHART_DAYS }} días del rango elegido.
      </p>
      <BigButton
        label="Exportar a PDF"
        icon="save"
        color="ghost"
        size="block"
        class="mt-3"
        @click="exportProductionPDF"
      />
    </section>

    <section v-if="eggsByCategory.values.length" class="card mb-6">
      <h2 class="mb-3 text-lg font-bold text-slate-700">Por categoría</h2>
      <BaseChart :config="doughnutChartConfig" :height="240" />
    </section>

    <section v-if="salesRows.length" class="mb-6">
      <h2 class="mb-2 text-lg font-bold text-slate-700">Ventas</h2>
      <div class="card overflow-x-auto p-0">
        <table class="w-full text-sm">
          <thead class="bg-grass-50 text-slate-600">
            <tr>
              <th class="px-3 py-2 text-left">Fecha</th>
              <th class="px-3 py-2 text-right">Total</th>
              <th class="px-3 py-2 text-right">Pagado</th>
              <th class="px-3 py-2 text-right">Saldo</th>
              <th class="px-3 py-2 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in salesRows"
              :key="s.localUuid"
              class="border-t border-slate-100"
              :class="{ 'text-slate-400 line-through': s.status === 'void' }"
            >
              <td class="px-3 py-2">{{ fmtDate(s.soldAt) }}</td>
              <td class="px-3 py-2 text-right font-semibold">{{ fmtMoney(s.total) }}</td>
              <td class="px-3 py-2 text-right">{{ fmtMoney(s.paid) }}</td>
              <td
                class="px-3 py-2 text-right"
                :class="s.balance > 0 && s.status !== 'void' ? 'font-bold text-alert-600' : ''"
              >
                {{ fmtMoney(s.balance) }}
              </td>
              <td class="px-3 py-2">
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-bold"
                  :class="saleStatusClass(s.status)"
                >
                  {{ saleStatusLabel(s.status) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-3 flex gap-2">
        <BigButton label="PDF" icon="save" color="ghost" class="flex-1" @click="exportSalesPDF" />
        <BigButton
          label="Excel"
          icon="save"
          color="ghost"
          class="flex-1"
          @click="exportSalesExcel"
        />
      </div>
    </section>

    <p v-else class="text-center text-slate-400">Aún no hay ventas en este período.</p>
  </ScreenShell>
</template>
