<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import PenSelector from '@/components/ui/PenSelector.vue'
import AlertBanner from '@/components/ui/AlertBanner.vue'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore, todayEggs, aliveChickens, pendingDebt, nextVaccine } from '@/stores/sync'
import { useAlerts, type Alert } from '@/composables/useAlerts'
import { fmtCOP } from '@/utils/format'
import type { Vaccine } from '@/types/domain'

const router = useRouter()
const farm = useFarmStore()
const auth = useAuthStore()
const sync = useSyncStore()
const alerts = useAlerts()

const eggsToday = ref<number>(0)
const alive = ref<number>(0)
const debt = ref<number>(0)
const vaccine = ref<Vaccine | undefined>(undefined)
const activeAlerts = ref<Alert[]>([])

const vaccineLabel = computed(() => {
  if (!vaccine.value?.nextAt) return 'Sin programar'
  const future = Math.max(0, Math.ceil((new Date(vaccine.value.nextAt).getTime() - Date.now()) / 86_400_000))
  return future === 0 ? 'Hoy' : `En ${future} días`
})

/** Resumen filtrado por el galpón activo ('' = Todos). */
async function refresh() {
  if (!farm.farmId) return
  ;[eggsToday.value, alive.value, debt.value, vaccine.value, activeAlerts.value] = await Promise.all([
    todayEggs(farm.farmId, farm.activePenId),
    aliveChickens(farm.farmId, farm.activePenId),
    pendingDebt(farm.farmId),
    nextVaccine(farm.farmId, farm.activePenId),
    alerts.compute(),
  ])
}

onMounted(async () => {
  await refresh()
  sync.setupListeners()
})

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
      </div>
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">
          Gallinas vivas
          <span v-if="farm.activePen" class="ml-1 text-xs text-slate-400">
            · {{ farm.activePen.name }}
          </span>
          <span v-else-if="farm.activePens.length > 1" class="ml-1 text-xs text-slate-400">· Todos</span>
        </p>
        <p class="num-big">{{ alive.toLocaleString('es-CO') }}</p>
      </div>
      <div class="card">
        <p class="text-sm font-semibold text-slate-500">Próxima vacuna</p>
        <p class="text-2xl font-bold text-grass-600">{{ vaccine?.name ?? '—' }}</p>
        <p class="text-base text-slate-500">{{ vaccineLabel }}</p>
      </div>
      <div class="card" :class="{ 'ring-2 ring-alert-300': debt > 0 }">
        <p class="text-sm font-semibold text-slate-500">Por cobrar</p>
        <p class="text-2xl font-bold" :class="debt > 0 ? 'text-alert-600' : 'text-slate-800'">
          {{ fmtCOP(debt) }}
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
