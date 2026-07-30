<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import { fmtDateTime } from '@/utils/format'
import type { ChickenMovement } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'

const router = useRouter()
const farm = useFarmStore()
const movements = ref<ChickenMovement[]>([])

const alive = computed(() => {
  const sign = (t: string) =>
    t === 'buy' || t === 'birth' ? 1 : t === 'death' || t === 'sale' || t === 'revoke' ? -1 : 0
  return movements.value.reduce((s, m) => s + m.qty * sign(m.type), 0)
})

async function load() {
  if (!farm.farmId) return
  movements.value = await db.chickenMovements
    .where('farmId')
    .equals(farm.farmId)
    .reverse()
    .sortBy('createdAt')
}

const typeLabel: Record<string, string> = {
  buy: 'Compra',
  birth: 'Nacimiento',
  death: 'Muerte',
  sale: 'Venta',
  revoke: 'Retiro',
  transfer: 'Traslado',
  adjust: 'Ajuste',
}

onMounted(load)
</script>

<template>
  <ScreenShell title="Gallinas">
    <div class="card mb-4 bg-grass-50 text-center">
      <p class="text-base font-semibold text-slate-500">Gallinas vivas</p>
      <p class="num-big">{{ Math.max(0, alive).toLocaleString('es-CO') }}</p>
    </div>

    <h2 class="mb-2 text-lg font-bold text-slate-600">Últimos movimientos</h2>
    <div v-if="!movements.length" class="card text-center text-slate-500">
      Aún no has registrado gallinas. Usa el botón de abajo para empezar.
    </div>
    <div v-else class="flex flex-col gap-2">
      <div v-for="m in movements.slice(0, 20)" :key="m.localUuid" class="card flex items-center gap-3 py-3">
        <span
          class="rounded-full px-3 py-1 text-sm font-bold"
          :class="m.type === 'death' ? 'bg-alert-100 text-alert-600'
            : m.type === 'buy' || m.type === 'birth' ? 'bg-grass-100 text-grass-700'
            : 'bg-slate-100 text-slate-600'"
        >
          {{ typeLabel[m.type] }}
        </span>
        <span class="text-2xl font-extrabold">{{ m.qty }}</span>
        <span v-if="m.reason" class="ml-auto truncate text-base text-slate-500">{{ m.reason }}</span>
        <span class="text-xs text-slate-400">{{ fmtDateTime(m.createdAt) }}</span>
      </div>
    </div>

    <div class="mt-6 flex flex-col gap-3">
      <BigButton label="Registrar muerte" icon="skull" color="alert" size="block"
        @click="router.push('/chickens/mortality/new')" />
      <BigButton label="Registrar compra o ingreso" icon="chicken" color="grass" size="block"
        @click="router.push('/chickens/movement/new')" />
    </div>
  </ScreenShell>
</template>
