<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import PenSelector from '@/components/ui/PenSelector.vue'
import AlertBanner from '@/components/ui/AlertBanner.vue'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import {
  todayEggs,
  aliveChickens,
  pendingDebt,
  nextVaccine,
  overdueVaccine,
} from '@/stores/sync'
import { useAlerts, type Alert } from '@/composables/useAlerts'
import { useMetrics } from '@/composables/useMetrics'
import { eggsLaid, incomeOverFeedCost, type IncomeOverFeed } from '@/domain/metrics'
import { addDays, dayKey, endOfFarmDay, fmtMoney, fmtNumber, startOfFarmDay } from '@/utils/format'
import type { Vaccine } from '@/types/domain'

const router = useRouter()
const farm = useFarmStore()
const auth = useAuthStore()
const alerts = useAlerts()

const eggsToday = ref<number>(0)
const alive = ref<number>(0)
const debt = ref<number>(0)
const vaccine = ref<Vaccine | undefined>(undefined)
const overdue = ref<Vaccine | undefined>(undefined)
const activeAlerts = ref<Alert[]>([])

const metrics = useMetrics()
const margin = ref<IncomeOverFeed | null>(null)
/** Variación de los huevos de hoy contra el promedio de los 7 días anteriores. */
const eggsTrend = ref<number | null>(null)

/**
 * Etiqueta de la próxima vacuna.
 * Una vacuna atrasada mostraba "Hoy" por el `Math.max(0, …)`: ahora se muestra
 * como atrasada, que es la información que el granjero necesita.
 */
const vaccineLabel = computed(() => {
  if (overdue.value?.nextAt) {
    const days = Math.ceil((startOfFarmDay().getTime() - new Date(overdue.value.nextAt).getTime()) / 86_400_000)

    return `Atrasada ${days} día${days === 1 ? '' : 's'}`
  }

  if (!vaccine.value?.nextAt) return 'Sin programar'

  const days = Math.ceil(
    (new Date(vaccine.value.nextAt).getTime() - startOfFarmDay().getTime()) / 86_400_000,
  )

  return days <= 0 ? 'Hoy' : `En ${days} día${days === 1 ? '' : 's'}`
})

const vaccineName = computed(() => overdue.value?.name ?? vaccine.value?.name ?? '—')
const vaccineOverdue = computed(() => !!overdue.value)

/** Resumen filtrado por el galpón activo ('' = Todos). */
async function refresh() {
  if (!farm.farmId) return

  ;[eggsToday.value, alive.value, debt.value, vaccine.value, overdue.value, activeAlerts.value] =
    await Promise.all([
      todayEggs(farm.farmId, farm.activePenId),
      aliveChickens(farm.farmId, farm.activePenId),
      pendingDebt(farm.farmId),
      nextVaccine(farm.farmId, farm.activePenId),
      overdueVaccine(farm.farmId, farm.activePenId),
      alerts.compute(),
    ])

  await refreshMetrics()
}

/**
 * Margen del mes y tendencia de producción.
 *
 * Va aparte de `refresh` para no mezclar las consultas puntuales del resumen
 * con la carga completa que necesita el motor de indicadores.
 */
async function refreshMetrics() {
  const data = await metrics.load()
  const today = new Date()

  const monthStart = new Date(today)
  monthStart.setDate(1)

  margin.value = incomeOverFeedCost(data, {
    from: startOfFarmDay(monthStart),
    to: endOfFarmDay(today),
  })

  // Tendencia: hoy contra el promedio diario de los 7 días anteriores. Con
  // menos de 3 días de historia no se muestra: un porcentaje calculado sobre
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

        return (
          at >= previous.from.getTime() &&
          at <= previous.to.getTime() &&
          (!farm.activePenId || c.penId === farm.activePenId)
        )
      })
      .map((c) => dayKey(c.collectionAt)),
  ).size

  const average = daysWithData >= 3 ? previousEggs / daysWithData : 0

  eggsTrend.value = average > 0 ? (eggsToday.value - average) / average : null
}

// `setupListeners()` ya se llama una vez en main.ts y es idempotente. Antes se
// invocaba también aquí sin guarda, así que cada visita al Home añadía otro
// intervalo de sincronización y otro par de listeners.
onMounted(refresh)

// Reaccionar al cambio de galpón: refresca los números del resumen.
watch(() => farm.activePenId, () => refresh())

// Menú grande — una sola tarea principal por botón.
const menu = computed(() => [
  { to: '/eggs/new', icon: 'egg', color: 'amber', label: 'Huevos' },
  { to: '/feed/purchase', icon: 'money', color: 'amber', label: 'Comprar alimento' },
  { to: '/feed/new', icon: 'chicken', color: 'grass', label: 'Consumo alimento' },
  { to: '/chickens', icon: 'chicken', color: 'grass', label: 'Gallinas' },
  { to: '/chickens/mortality/new', icon: 'skull', color: 'alert', label: 'Muerte' },
  { to: '/sales/new', icon: 'money', color: 'grass', label: 'Vender' },
  { to: '/customers/debts', icon: 'people', color: 'amber', label: '¿Quién me debe?' },
  { to: '/vaccines/new', icon: 'syringe', color: 'grass', label: 'Vacuna' },
  { to: '/incidents/new', icon: 'clipboard', color: 'amber', label: 'Novedad' },
  { to: '/reports', icon: 'report', color: 'grass', label: 'Reportes' },
])
</script>

<template>
  <ScreenShell :title="`Hola, ${auth.user?.name ?? ''}`" :back="false">
    <template #header>
      <button
        class="rounded-xl2 bg-white px-3 py-2 text-sm font-bold text-slate-500 active:bg-slate-100"
        @click="router.push('/settings')"
      >
        ⚙
      </button>
    </template>

    <!-- Selector de galpón (multi-galpón) -->
    <PenSelector v-if="farm.activePens.length > 1" class="mb-4" />

    <!-- Alertas operativas automáticas -->
    <AlertBanner :alerts="activeAlerts" />

    <!-- Resumen del día con NÚMEROS GRANDES -->
    <section class="mb-6 grid grid-cols-2 gap-3">
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">
          Huevos hoy
          <span v-if="farm.activePen" class="ml-1 text-xs text-slate-400">
            · {{ farm.activePen.name }}
          </span>
          <span v-else-if="farm.activePens.length > 1" class="ml-1 text-xs text-slate-400">· Todos</span>
        </p>
        <p class="num-big">{{ eggsToday }}</p>
        <p
          v-if="eggsTrend !== null"
          class="text-xs font-semibold"
          :class="eggsTrend >= 0 ? 'text-grass-600' : 'text-alert-600'"
        >
          {{ eggsTrend >= 0 ? '▲' : '▼' }} {{ fmtNumber(Math.abs(eggsTrend) * 100, 0) }} % vs.
          promedio
        </p>
      </div>
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">
          Gallinas vivas
          <span v-if="farm.activePen" class="ml-1 text-xs text-slate-400">
            · {{ farm.activePen.name }}
          </span>
          <span v-else-if="farm.activePens.length > 1" class="ml-1 text-xs text-slate-400">· Todos</span>
        </p>
        <p class="num-big">{{ fmtNumber(alive) }}</p>
      </div>
      <div class="card" :class="{ 'ring-2 ring-alert-300': vaccineOverdue }">
        <p class="text-sm font-semibold text-slate-500">Próxima vacuna</p>
        <p class="text-2xl font-bold" :class="vaccineOverdue ? 'text-alert-600' : 'text-grass-600'">
          {{ vaccineName }}
        </p>
        <p class="text-base" :class="vaccineOverdue ? 'font-bold text-alert-600' : 'text-slate-500'">
          {{ vaccineLabel }}
        </p>
      </div>
      <div class="card" :class="{ 'ring-2 ring-alert-300': debt > 0 }">
        <p class="text-sm font-semibold text-slate-500">Por cobrar</p>
        <p class="text-2xl font-bold" :class="debt > 0 ? 'text-alert-600' : 'text-slate-800'">
          {{ fmtMoney(debt) }}
        </p>
      </div>

      <!-- Ingreso menos alimento: NO es utilidad neta. La app no captura droga,
           luz ni mano de obra, y llamarlo utilidad sería mentir. -->
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
    </section>

    <!-- Botones grandes del menú principal -->
    <section class="grid grid-cols-2 gap-3">
      <BigButton
        v-for="item in menu"
        :key="item.to"
        :label="item.label"
        :icon="item.icon"
        :color="item.color as 'grass' | 'amber' | 'alert'"
        size="tile"
        @click="router.push(item.to)"
      />
    </section>

    <p v-if="farm.farmName" class="mt-6 text-center text-sm text-slate-400">
      🐔 {{ farm.farmName }}
    </p>
  </ScreenShell>
</template>
