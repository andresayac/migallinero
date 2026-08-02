<script setup lang="ts">
/**
 * Inicio: las acciones de la granja.
 *
 * Sólo botones y avisos. Los números viven en la pestaña Resumen: esta pantalla
 * se abre para registrar algo, y las tarjetas empujaban las acciones fuera de
 * la primera pantalla.
 */
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import PenSelector from '@/components/ui/PenSelector.vue'
import AlertBanner from '@/components/ui/AlertBanner.vue'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { useAlerts, type Alert } from '@/composables/useAlerts'

const router = useRouter()
const farm = useFarmStore()
const auth = useAuthStore()
const alerts = useAlerts()

const activeAlerts = ref<Alert[]>([])

async function refresh() {
  if (!farm.farmId) return

  activeAlerts.value = await alerts.compute()
}

// `setupListeners()` ya se llama una vez en main.ts y es idempotente. Antes se
// invocaba también aquí sin guarda, así que cada visita al Home añadía otro
// intervalo de sincronización y otro par de listeners.
onMounted(refresh)

// Las alertas se calculan por galpón: al cambiarlo hay que recalcularlas.
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

    <!-- Alertas operativas, DEBAJO de los botones: el inicio se abre para
         registrar algo, y una pila de avisos arriba empujaba las acciones
         fuera de la pantalla. Aquí no estorban y siguen estando a la vista. -->
    <section v-if="activeAlerts.length" class="mt-6">
      <h2 class="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
        Avisos ({{ activeAlerts.length }})
      </h2>
      <AlertBanner :alerts="activeAlerts" />
    </section>

    <p v-if="farm.farmName" class="mt-6 text-center text-sm text-slate-400">
      🐔 {{ farm.farmName }}
    </p>
  </ScreenShell>
</template>
