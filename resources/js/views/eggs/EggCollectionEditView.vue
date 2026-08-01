<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { create as createRecord } from '@/db/repository'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/composables/useToast'
import { useSubmit } from '@/composables/useSubmit'
import { uuid, nowISO, fmtNumber } from '@/utils/format'
import type { EggCollection, EggCollectionLine } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import DateSelector from '@/components/ui/DateSelector.vue'
import NumericKeypad from '@/components/ui/NumericKeypad.vue'

const router = useRouter()
const farm = useFarmStore()
const auth = useAuthStore()
const sync = useSyncStore()
const toast = useToast()
const { busy, submit } = useSubmit()

const selectedPenId = ref<string>('')
const observation = ref('')
/** cantidades por id de categoría (inicializadas en 0 para evitar warnings) */
const qtyByCat = ref<Record<string, number>>(
  Object.fromEntries(farm.activeCategories.map((c) => [c.localUuid, 0])),
)

/** Fecha/hora seleccionada (comienza con la actual del dispositivo). */
const selectedAt = ref<string>(nowISO())
const dateSelector = ref<InstanceType<typeof DateSelector> | null>(null)

/** Estado del teclado numérico tipo calculadora. */
const keypadOpen = ref(false)
const keypadCatId = ref<string>('')
const keypadCatName = ref('')
const keypadCatColor = ref('#16a34a')

const total = computed(() =>
  farm.activeCategories.reduce((sum, c) => sum + (qtyByCat.value[c.localUuid] ?? 0), 0),
)

/** Huevos vendibles del total (los rotos se registran pero no se venden). */
const sellableTotal = computed(() =>
  farm.activeCategories
    .filter((c) => !c.isBroken)
    .reduce((sum, c) => sum + (qtyByCat.value[c.localUuid] ?? 0), 0),
)

onMounted(() => {
  // Precarga el galpón activo del Home si existe; si no, el primero activo.
  selectedPenId.value = farm.activePenId || (farm.activePens.length ? farm.activePens[0].localUuid : '')
  // Re-asegura que cualquier categoría nueva esté en cero.
  for (const c of farm.activeCategories) {
    if (qtyByCat.value[c.localUuid] === undefined) qtyByCat.value[c.localUuid] = 0
  }
})

/** Abre el teclado numérico para una categoría. */
function openKeypad(catId: string, catName: string, catColor: string) {
  keypadCatId.value = catId
  keypadCatName.value = catName
  keypadCatColor.value = catColor
  keypadOpen.value = true
}

/** Cuando el usuario confirma en el keypad. */
function onKeypadConfirm(val: number) {
  qtyByCat.value[keypadCatId.value] = val
}

async function save() {
  if (!farm.farmId) return

  if (!selectedPenId.value) {
    toast.error('Selecciona el galpón')

    return
  }

  if (total.value === 0) {
    toast.error('Agrega al menos un huevo')

    return
  }

  // El candado de período se comprueba ANTES de guardar. Ninguna vista lo hacía:
  // si el selector no llegaba a corregir la fecha, se guardaba una inválida.
  if (dateSelector.value && !dateSelector.value.isValid) {
    toast.error(dateSelector.value.validationMessage || 'La fecha no está permitida')

    return
  }

  const ts = nowISO()
  const lineRecords: EggCollectionLine[] = farm.activeCategories
    .map((c) => ({ categoryId: c.localUuid, qty: qtyByCat.value[c.localUuid] ?? 0 }))
    .filter((l) => l.qty > 0)

  const entryMode = dateSelector.value?.entryMode ?? 'auto'
  const manualReason = dateSelector.value?.manualReason

  const collection: EggCollection = {
    type: 'egg-collection',
    localUuid: uuid(),
    farmId: farm.farmId,
    penId: selectedPenId.value,
    collectionAt: selectedAt.value,
    observation: observation.value || undefined,
    total: total.value,
    lines: lineRecords,
    pendingSync: true,
    entryMode,
    manualReason,
    createdAt: ts,
    updatedAt: ts,
    createdBy: auth.user?.id ?? 'unknown',
  }

  const saved = await submit(async () => {
    await createRecord('egg-collection', collection)

    await sync.refreshPending()
    void sync.forceSync()

    return true
  })

  if (!saved) return

  toast.success(
    entryMode === 'manual' ? 'Tanda guardada (fecha manual)' : 'Tanda guardada correctamente',
  )

  router.replace({ name: 'home' })
}
</script>

<template>
  <ScreenShell title="Registrar huevos">
    <div class="mb-4 flex flex-col gap-1">
      <label class="text-base font-semibold text-slate-600">Galpón</label>
      <select
        v-model="selectedPenId"
        class="rounded-xl2 border-2 border-slate-200 bg-white px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
      >
        <option v-for="p in farm.activePens" :key="p.localUuid" :value="p.localUuid">{{ p.name }}</option>
      </select>
    </div>

    <!-- Fecha: automática o manual con candado de período -->
    <DateSelector
      ref="dateSelector"
      v-model="selectedAt"
      :can-override="auth.isAdmin"
      label="Fecha y hora de la tanda"
      class="mb-4"
    />

    <!-- Tarjetas de categoría: toca para abrir el teclado numérico -->
    <div class="flex flex-col gap-3">
      <button
        v-for="cat in farm.activeCategories"
        :key="cat.localUuid"
        type="button"
        class="card cat-card"
        :style="{ borderLeft: `8px solid ${cat.color}` }"
        @click="openKeypad(cat.localUuid, cat.name, cat.color)"
      >
        <div class="flex items-center justify-between">
          <div class="flex flex-col items-start">
            <span class="text-2xl font-extrabold" :style="{ color: cat.color }">{{ cat.name }}</span>
            <span v-if="cat.isBroken" class="mt-1 rounded-full bg-alert-100 px-2 py-0.5 text-xs font-bold text-alert-600">
              No se vende
            </span>
          </div>
          <div class="flex items-baseline gap-1">
            <span
              class="text-mega font-extrabold tabular-nums"
              :class="qtyByCat[cat.localUuid] > 0 ? 'text-slate-800' : 'text-slate-300'"
            >
              {{ qtyByCat[cat.localUuid] > 0 ? qtyByCat[cat.localUuid] : '—' }}
            </span>
            <span v-if="qtyByCat[cat.localUuid] > 0" class="text-lg font-semibold text-slate-400">
              und
            </span>
          </div>
        </div>
        <p class="mt-1 text-right text-sm text-slate-400">Toca para escribir</p>
      </button>
    </div>

    <label class="mt-4 block">
      <span class="text-base font-semibold text-slate-600">¿Algo para recordar? (opcional)</span>
      <textarea
        v-model="observation"
        rows="2"
        placeholder="Ej: muchas gallinas en el nido 3"
        class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-lg focus:border-grass-500 focus:outline-none"
      />
    </label>

    <!-- TOTAL de la tanda en grande -->
    <div class="card mt-4 bg-grass-50">
      <div class="flex items-center justify-between">
        <span class="text-lg font-bold text-slate-600">Total de la tanda</span>
        <span class="text-mega font-extrabold text-grass-600">{{ fmtNumber(total) }}</span>
      </div>
      <div
        v-if="sellableTotal !== total"
        class="mt-1 flex items-center justify-between border-t border-grass-200 pt-1 text-sm"
      >
        <span class="font-semibold text-slate-500">Para vender</span>
        <span class="font-bold text-slate-700">{{ fmtNumber(sellableTotal) }}</span>
      </div>
    </div>

    <div class="mt-6">
      <BigButton
        :label="busy ? 'Guardando…' : 'Guardar tanda'"
        icon="save"
        size="block"
        :disabled="busy"
        @click="save"
      />
    </div>

    <!-- Teclado numérico tipo calculadora -->
    <NumericKeypad
      :open="keypadOpen"
      :model-value="qtyByCat[keypadCatId] ?? 0"
      :title="keypadCatName"
      :color="keypadCatColor"
      @update:model-value="onKeypadConfirm"
      @close="keypadOpen = false"
    />
  </ScreenShell>
</template>

<style scoped>
.cat-card {
  cursor: pointer;
  transition: transform 0.08s, box-shadow 0.08s;
}
.cat-card:active {
  transform: scale(0.98);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
</style>
