<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import { fmtCOP, fmtDate } from '@/utils/format'
import { exportToPDF, exportToExcel } from '@/utils/export'
import type { EggCollection, Sale, ChickenMovement } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import PenSelector from '@/components/ui/PenSelector.vue'
import BaseChart, { type ChartConfig } from '@/components/charts/BaseChart.vue'

const farm = useFarmStore()
const collections = ref<EggCollection[]>([])
const sales = ref<Sale[]>([])
const movements = ref<ChickenMovement[]>([])

const range = ref<'today' | 'week' | 'month' | 'custom'>('week')
const customFrom = ref<string>('')
const customTo = ref<string>('')

function startOfRange(): Date {
  if (range.value === 'custom' && customFrom.value) {
    return new Date(customFrom.value)
  }
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (range.value === 'today') return d
  if (range.value === 'week') d.setDate(d.getDate() - 7)
  if (range.value === 'month') d.setMonth(d.getMonth() - 1)
  return d
}

function endOfRange(): Date {
  if (range.value === 'custom' && customTo.value) {
    const d = new Date(customTo.value)
    d.setHours(23, 59, 59, 999)
    return d
  }
  return new Date()
}

function inRange(dateIso: string): boolean {
  const t = new Date(dateIso).getTime()
  return t >= startOfRange().getTime() && t <= endOfRange().getTime()
}
function byPen(penId: string | undefined): boolean {
  return !farm.activePenId || penId === farm.activePenId
}

const eggs = computed(() =>
  collections.value
    .filter((c) => inRange(c.collectionAt) && byPen(c.penId))
    .reduce((s, c) => s + c.total, 0),
)

const deaths = computed(() =>
  movements.value
    .filter((m) => m.type === 'death' && inRange(m.createdAt) && byPen(m.penId))
    .reduce((s, m) => s + m.qty, 0),
)

const income = computed(() =>
  sales.value.filter((s) => inRange(s.soldAt)).reduce((s, x) => s + x.paid, 0),
)

const pendingDebt = computed(() =>
  sales.value
    .filter((s) => (s.status === 'pending' || s.status === 'partial') && inRange(s.soldAt))
    .reduce((s, x) => s + x.balance, 0),
)

const dailyEggs = computed(() => {
  const map = new Map<string, number>()
  const start = startOfRange()
  const end = endOfRange()
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10)
    map.set(key, 0)
  }
  for (const c of collections.value) {
    if (!inRange(c.collectionAt) || !byPen(c.penId)) continue
    const key = c.collectionAt.slice(0, 10)
    map.set(key, (map.get(key) ?? 0) + c.total)
  }
  const labels = [...map.keys()].map((k) => {
    const [, m, d] = k.split('-')
    return `${d}/${m}`
  })
  return { labels, values: [...map.values()] }
})

const eggsByCategory = computed(() => {
  const map = new Map<string, number>()
  for (const c of collections.value) {
    if (!inRange(c.collectionAt) || !byPen(c.penId)) continue
    for (const line of c.lines) {
      const cat = farm.categories.find((x) => x.localUuid === line.categoryId)
      const name = cat?.name ?? 'Sin categoría'
      map.set(name, (map.get(name) ?? 0) + line.qty)
    }
  }
  return { labels: [...map.keys()], values: [...map.values()] }
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

const doughnutChartConfig = computed<ChartConfig>(() => ({
  type: 'doughnut',
  labels: eggsByCategory.value.labels,
  datasets: [
    {
      data: eggsByCategory.value.values,
      backgroundColor: ['#16a34a', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ec4899', '#64748b', '#dc2626'],
    },
  ],
}))

const salesRows = computed(() =>
  sales.value.filter((s) => inRange(s.soldAt)).sort((a, b) => b.soldAt.localeCompare(a.soldAt)).slice(0, 50),
)

const rangeLabel = computed(() => {
  if (range.value === 'today') return 'Hoy'
  if (range.value === 'week') return 'Últimos 7 días'
  if (range.value === 'month') return 'Últimos 30 días'
  return `${fmtDate(startOfRange().toISOString())} a ${fmtDate(endOfRange().toISOString())}`
})

async function load() {
  if (!farm.farmId) return
  ;[collections.value, sales.value, movements.value] = await Promise.all([
    db.eggCollections.where('farmId').equals(farm.farmId).toArray(),
    db.sales.where('farmId').equals(farm.farmId).toArray(),
    db.chickenMovements.where('farmId').equals(farm.farmId).toArray(),
  ])
}

onMounted(load)
watch(() => farm.activePenId, load)

function exportSalesPDF() {
  exportToPDF({
    title: 'Ventas',
    subtitle: rangeLabel.value,
    farmName: farm.farmName,
    fileName: `ventas-${range.value}-${Date.now()}`,
    columns: [
      { key: 'soldAt', label: 'Fecha', format: 'date' },
      { key: 'total', label: 'Total', format: 'cop' },
      { key: 'paid', label: 'Pagado', format: 'cop' },
      { key: 'balance', label: 'Saldo', format: 'cop' },
      { key: 'status', label: 'Estado', format: 'text' },
    ],
    rows: salesRows.value as Array<Record<string, unknown>>,
  })
}

function exportSalesExcel() {
  exportToExcel({
    title: 'Ventas',
    fileName: `ventas-${range.value}-${Date.now()}`,
    columns: [
      { key: 'soldAt', label: 'Fecha', format: 'date' },
      { key: 'total', label: 'Total', format: 'cop' },
      { key: 'paid', label: 'Pagado', format: 'cop' },
      { key: 'balance', label: 'Saldo', format: 'cop' },
      { key: 'status', label: 'Estado', format: 'text' },
    ],
    rows: salesRows.value as Array<Record<string, unknown>>,
  })
}

function exportProductionPDF() {
  const rows = dailyEggs.value.labels.map((lbl, i) => ({
    day: lbl,
    eggs: dailyEggs.value.values[i],
  }))
  exportToPDF({
    title: 'Producción de huevos',
    subtitle: rangeLabel.value,
    farmName: farm.farmName,
    fileName: `produccion-${range.value}-${Date.now()}`,
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
          range === r ? 'border-grass-500 bg-grass-50 text-grass-700' : 'border-slate-200 bg-white text-slate-600',
        ]"
        @click="range = r"
      >
        {{ r === 'today' ? 'Hoy' : r === 'week' ? 'Semana' : r === 'month' ? 'Mes' : 'Fechas' }}
      </button>
    </div>

    <div v-if="range === 'custom'" class="card mb-4 grid grid-cols-2 gap-3">
      <label class="block">
        <span class="text-sm font-semibold text-slate-600">Desde</span>
        <input v-model="customFrom" type="date"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-3 py-2 text-base focus:border-grass-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-sm font-semibold text-slate-600">Hasta</span>
        <input v-model="customTo" type="date"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-3 py-2 text-base focus:border-grass-500 focus:outline-none" />
      </label>
    </div>

    <p class="mb-4 text-sm text-slate-500">
      {{ rangeLabel }}<span v-if="farm.activePen"> · {{ farm.activePen.name }}</span>
    </p>

    <section class="mb-6 grid grid-cols-2 gap-3">
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">Huevos recogidos</p>
        <p class="num-big">{{ eggs.toLocaleString('es-CO') }}</p>
      </div>
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">Ingresos</p>
        <p class="text-2xl font-extrabold text-grass-600">{{ fmtCOP(income) }}</p>
      </div>
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">Muertes</p>
        <p class="num-big text-alert-600">{{ deaths }}</p>
      </div>
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">Por cobrar</p>
        <p class="text-2xl font-extrabold" :class="pendingDebt > 0 ? 'text-alert-600' : 'text-slate-800'">
          {{ fmtCOP(pendingDebt) }}
        </p>
      </div>
    </section>

    <section v-if="dailyEggs.values.some((v) => v > 0)" class="card mb-6">
      <h2 class="mb-3 text-lg font-bold text-slate-700">Producción de huevos</h2>
      <BaseChart :config="lineChartConfig" :height="220" />
      <BigButton label="Exportar a PDF" icon="save" color="ghost" size="block" class="mt-3"
        @click="exportProductionPDF" />
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
            <tr v-for="s in salesRows" :key="s.localUuid" class="border-t border-slate-100">
              <td class="px-3 py-2">{{ fmtDate(s.soldAt) }}</td>
              <td class="px-3 py-2 text-right font-semibold">{{ fmtCOP(s.total) }}</td>
              <td class="px-3 py-2 text-right">{{ fmtCOP(s.paid) }}</td>
              <td class="px-3 py-2 text-right" :class="s.balance > 0 ? 'text-alert-600 font-bold' : ''">
                {{ fmtCOP(s.balance) }}
              </td>
              <td class="px-3 py-2 capitalize">{{ s.status }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-3 flex gap-2">
        <BigButton label="PDF" icon="save" color="ghost" class="flex-1" @click="exportSalesPDF" />
        <BigButton label="Excel" icon="save" color="ghost" class="flex-1" @click="exportSalesExcel" />
      </div>
    </section>

    <p v-else class="text-center text-slate-400">Aún no hay ventas en este período.</p>
  </ScreenShell>
</template>
