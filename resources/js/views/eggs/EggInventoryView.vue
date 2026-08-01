<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useFarmStore } from '@/stores/farm'
import { eggStock } from '@/domain/sales'
import { fmtNumber } from '@/utils/format'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import PenSelector from '@/components/ui/PenSelector.vue'

const farm = useFarmStore()
const router = useRouter()

interface Row {
  name: string
  color: string
  isBroken: boolean
  available: number
  collected: number
  sold: number
}

const rows = ref<Row[]>([])

/**
 * Inventario por categoría.
 *
 * El cálculo vive en `domain/sales.ts`. La corrección importante: al filtrar por
 * galpón sólo se muestra lo RECOGIDO en ese galpón, sin descontar ventas, porque
 * las ventas no se registran por galpón. Antes se restaban todas las ventas de la
 * granja del inventario de un único galpón, así que en cualquier granja con más
 * de uno el disponible salía siempre en cero.
 */
async function load() {
  if (!farm.farmId) return

  const stock = await eggStock(farm.farmId, farm.activePenId)

  rows.value = farm.activeCategories.map((cat) => {
    const stats = stock.get(cat.localUuid) ?? { collected: 0, sold: 0, available: 0 }

    return {
      name: cat.name,
      color: cat.color,
      isBroken: cat.isBroken,
      // Los rotos se registran para el control, pero no son inventario vendible.
      available: cat.isBroken ? 0 : stats.available,
      collected: stats.collected,
      sold: stats.sold,
    }
  })
}

onMounted(load)
watch(() => farm.activePenId, load)
</script>

<template>
  <ScreenShell title="Huevos disponibles">
    <PenSelector v-if="farm.activePens.length > 1" class="mb-4" />

    <p class="mb-4 text-lg text-slate-600">
      Estos son los huevos que tienes para vender. Los rotos no se cuentan.
    </p>

    <p v-if="farm.activePenId" class="mb-4 rounded-xl2 bg-brand-50 px-3 py-2 text-sm text-brand-700">
      Viendo sólo lo recogido en <strong>{{ farm.activePen?.name }}</strong>. Las ventas no se
      registran por galpón, así que para ver el disponible real elige "Todos".
    </p>

    <div class="flex flex-col gap-3">
      <div
        v-for="r in rows"
        :key="r.name"
        class="card flex items-center justify-between"
        :style="{ borderLeft: `8px solid ${r.color}` }"
      >
        <div>
          <p class="text-2xl font-extrabold text-slate-800">{{ r.name }}</p>
          <p class="text-sm text-slate-500">
            Recogidos: {{ fmtNumber(r.collected) }}
            <span v-if="r.sold > 0"> · Vendidos: {{ fmtNumber(r.sold) }}</span>
          </p>
        </div>
        <p v-if="r.isBroken" class="text-lg font-bold text-slate-400">No se vende</p>
        <p v-else class="text-mega font-extrabold" :style="{ color: r.color }">
          {{ fmtNumber(r.available) }}
        </p>
      </div>
    </div>

    <div class="mt-6">
      <BigButton
        label="Registrar huevos"
        icon="egg"
        color="amber"
        size="block"
        @click="router.push('/eggs/new')"
      />
    </div>
  </ScreenShell>
</template>
