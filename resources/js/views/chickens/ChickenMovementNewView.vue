<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/composables/useToast'
import { uuid, nowISO } from '@/utils/format'
import type { ChickenMovement, ChickenMovementType } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import Stepper from '@/components/ui/Stepper.vue'
import DateSelector from '@/components/ui/DateSelector.vue'

const router = useRouter()
const farm = useFarmStore()
const auth = useAuthStore()
const sync = useSyncStore()
const toast = useToast()

const qty = ref(1)
const type = ref<ChickenMovementType>('buy')
const penId = ref('')
const reason = ref('')
const observation = ref('')
const selectedAt = ref<string>(nowISO())
const dateSelector = ref<InstanceType<typeof DateSelector> | null>(null)

const types: Array<{ value: ChickenMovementType; label: string; icon: string; color: 'grass' | 'amber' | 'alert' | 'ghost' }> = [
  { value: 'buy', label: 'Compra', icon: 'chicken', color: 'grass' },
  { value: 'birth', label: 'Nacimiento', icon: 'chicken', color: 'grass' },
  { value: 'death', label: 'Muerte', icon: 'skull', color: 'alert' },
  { value: 'sale', label: 'Venta', icon: 'money', color: 'amber' },
  { value: 'revoke', label: 'Retiro', icon: 'close', color: 'ghost' },
  { value: 'adjust', label: 'Ajuste', icon: 'report', color: 'ghost' },
]

const currentType = computed(() => types.find((t) => t.value === type.value))
const isAddition = computed(() => type.value === 'buy' || type.value === 'birth')

onMounted(() => {
  penId.value = farm.activePenId || (farm.pens.length ? farm.pens[0].localUuid : '')
})

async function save() {
  if (!farm.farmId) return
  if (!penId.value) {
    toast.error('Selecciona el galpón')
    return
  }
  if (!reason.value.trim()) {
    toast.error('Escribe una breve descripción (de dónde, por qué)')
    return
  }
  const ts = nowISO()
  const entryMode = dateSelector.value?.entryMode ?? 'auto'
  const m: ChickenMovement = {
    localUuid: uuid(),
    farmId: farm.farmId,
    penId: penId.value,
    type: type.value,
    qty: qty.value,
    reason: reason.value.trim(),
    observation: observation.value || undefined,
    pendingSync: true,
    entryMode,
    manualReason: dateSelector.value?.manualReason,
    createdAt: selectedAt.value,
    updatedAt: ts,
    createdBy: auth.user?.id ?? 'unknown',
  }
  await db.chickenMovements.add(m)
  await db.syncQueue.add({
    farmId: farm.farmId,
    entity: 'chicken-movement',
    action: 'create',
    localUuid: m.localUuid,
    payload: m,
    attempts: 0,
    createdAt: ts,
  })
  await sync.refreshPending()
  sync.forceSync()

  toast.success(`${currentType.value?.label} registrada`)
  router.replace({ name: 'home' })
}
</script>

<template>
  <ScreenShell title="Movimiento de gallinas">
    <!-- Tipo de movimiento (selector grande) -->
    <p class="mb-2 text-base font-semibold text-slate-600">¿Qué hiciste?</p>
    <div class="mb-4 grid grid-cols-3 gap-2">
      <button
        v-for="t in types"
        :key="t.value"
        type="button"
        :class="[
          'flex flex-col items-center gap-1 rounded-xl2 border-2 px-2 py-3 text-sm font-bold',
          type === t.value
            ? 'border-grass-500 bg-grass-50 text-grass-700'
            : 'border-slate-200 bg-white text-slate-600',
        ]"
        @click="type = t.value"
      >
        {{ t.label }}
      </button>
    </div>

    <div class="card mb-4">
      <Stepper v-model="qty" :step="1" :min="0" big :label="isAddition ? '¿Cuántas entraron?' : '¿Cuántas salieron?'" />
    </div>

    <DateSelector ref="dateSelector" v-model="selectedAt" :can-override="auth.isAdmin"
      label="¿Cuándo?" class="mb-4" />

    <label class="mb-4 block">
      <span class="text-base font-semibold text-slate-600">Galpón</span>
      <select v-model="penId"
        class="mt-1 w-full rounded-xl2 border-2 border-slate-200 bg-white px-4 py-3 text-xl focus:border-grass-500 focus:outline-none">
        <option v-for="p in farm.activePens" :key="p.localUuid" :value="p.localUuid">{{ p.name }}</option>
      </select>
    </label>

    <label class="mb-4 block">
      <span class="text-base font-semibold text-slate-600">{{ isAddition ? '¿De dónde?' : '¿Por qué?' }}</span>
      <input v-model="reason" type="text"
        :placeholder="isAddition ? 'Ej: compra a granja vecina' : 'Ej: envejecimiento'"
        class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-lg focus:border-grass-500 focus:outline-none" />
    </label>

    <label class="mb-4 block">
      <span class="text-base font-semibold text-slate-600">Observación (opcional)</span>
      <textarea v-model="observation" rows="2"
        class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-lg focus:border-grass-500 focus:outline-none" />
    </label>

    <BigButton label="Guardar" icon="save" :color="currentType?.color ?? 'grass'" size="block" @click="save" />
  </ScreenShell>
</template>
