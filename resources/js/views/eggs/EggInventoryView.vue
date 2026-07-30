<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import { useRouter } from 'vue-router'
import BigButton from '@/components/ui/BigButton.vue'
import PenSelector from '@/components/ui/PenSelector.vue'

const farm = useFarmStore()
const router = useRouter()

interface Row {
  name: string
  color: string
  available: number
  collected: number
  sold: number
  broken: number
  adjustPos: number
  adjustNeg: number
}

const rows = ref<Row[]>([])

async function load() {
  if (!farm.farmId) return
  const penId = farm.activePenId
  const [cols, sales] = await Promise.all([
    db.eggCollections
      .where('farmId')
      .equals(farm.farmId)
      .and((c) => !penId || c.penId === penId)
      .toArray(),
    db.sales.where('farmId').equals(farm.farmId).and((s) => s.status !== 'void').toArray(),
  ])

  // Huevos recolectados por categoría.
  const byCat: Record<string, { collected: number; sold: number }> = {}
  for (const c of cols) {
    for (const line of c.lines) {
      byCat[line.categoryId] ??= { collected: 0, sold: 0 }
      byCat[line.categoryId].collected += line.qty
    }
  }
  // Huevos vendidos por categoría (sólo ventas no anuladas).
  for (const s of sales) {
    for (const line of s.lines) {
      byCat[line.categoryId] ??= { collected: 0, sold: 0 }
      byCat[line.categoryId].sold += line.qtyUnits
    }
  }
  rows.value = farm.categories.map((cat) => {
    const stats = byCat[cat.localUuid] ?? { collected: 0, sold: 0 }
    // available = collected - sold (los rotos no se venden).
    const available = cat.isBroken ? 0 : Math.max(0, stats.collected - stats.sold)
    return {
      name: cat.name,
      color: cat.color,
      available,
      collected: stats.collected,
      sold: stats.sold,
      broken: cat.isBroken ? stats.collected : 0,
      adjustPos: 0,
      adjustNeg: 0,
    }
  })
}

onMounted(load)
watch(() => farm.activePenId, () => load())
</script>

<template>
  <ScreenShell title="Huevos disponibles">
    <PenSelector v-if="farm.activePens.length > 1" class="mb-4" />
    <p class="mb-4 text-lg text-slate-600">
      Estos son los huevos que tienes para vender. Los rotos no se cuentan.
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
          <p class="text-sm text-slate-500">Recogidos: {{ r.collected }}</p>
        </div>
        <p class="text-mega font-extrabold" :style="{ color: r.color }">
          {{ r.available }}
        </p>
      </div>
    </div>

    <div class="mt-6">
      <BigButton label="Registrar huevos" icon="egg" color="amber" size="block"
        @click="router.push('/eggs/new')" />
    </div>
  </ScreenShell>
</template>
