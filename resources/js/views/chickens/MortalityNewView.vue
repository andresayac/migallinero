<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { create as createRecord } from '@/db/repository'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/composables/useToast'
import { useSubmit } from '@/composables/useSubmit'
import { uuid, nowISO } from '@/utils/format'
import type { ChickenMovement } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import Stepper from '@/components/ui/Stepper.vue'
import DateSelector from '@/components/ui/DateSelector.vue'
import PhotoInput from '@/components/ui/PhotoInput.vue'

const router = useRouter()
const farm = useFarmStore()
const auth = useAuthStore()
const sync = useSyncStore()
const toast = useToast()
const { busy, submit } = useSubmit()

const qty = ref(1)
const penId = ref('')
const causeId = ref('')
const observation = ref('')
const photoPath = ref('')
const photoInput = ref<InstanceType<typeof PhotoInput> | null>(null)
const selectedAt = ref<string>(nowISO())
const dateSelector = ref<InstanceType<typeof DateSelector> | null>(null)

onMounted(() => {
  penId.value = farm.activePenId || (farm.activePens.length ? farm.activePens[0].localUuid : '')
  if (farm.activeCauses.length) causeId.value = farm.activeCauses[0].localUuid
})

async function save() {
  if (!farm.farmId) return

  if (!penId.value) {
    toast.error('Selecciona el galpón')

    return
  }

  if (qty.value <= 0) {
    toast.error('Indica cuántas gallinas murieron')

    return
  }

  if (dateSelector.value && !dateSelector.value.isValid) {
    toast.error(dateSelector.value.validationMessage || 'La fecha no está permitida')

    return
  }

  const cause = farm.activeCauses.find((c) => c.localUuid === causeId.value)
  const ts = nowISO()
  const entryMode = dateSelector.value?.entryMode ?? 'auto'

  const saved = await submit(async () => {
    // La foto se guarda como Blob en IndexedDB y el registro conserva su
    // referencia. Antes se metía un `blob:` ObjectURL, que muere al recargar.
    const photoReference = await photoInput.value?.persistPhoto(farm.farmId)

    const movement: ChickenMovement = {
      localUuid: uuid(),
      farmId: farm.farmId,
      penId: penId.value,
      type: 'death',
      qty: qty.value,
      // `movementAt` es la fecha operativa y la columna del backend es NOT NULL:
      // sin ella la sincronización fallaba con error de SQL en cada intento.
      movementAt: selectedAt.value,
      reason: cause?.name,
      observation: observation.value || undefined,
      photoPath: photoReference || photoPath.value || undefined,
      pendingSync: true,
      entryMode,
      manualReason: dateSelector.value?.manualReason,
      createdAt: ts,
      updatedAt: ts,
      createdBy: auth.user?.id ?? 'unknown',
    }

    await createRecord('chicken-movement', movement)

    await sync.refreshPending()
    void sync.forceSync()

    return true
  })

  if (!saved) return

  toast.success(entryMode === 'manual' ? 'Muerte registrada (fecha manual)' : 'Muerte registrada')
  router.replace({ name: 'home' })
}
</script>

<template>
  <ScreenShell title="Registrar muerte">
    <p class="mb-4 text-lg text-slate-600">
      Lo sentimos. Vamos a anotarlo rápido.
    </p>

    <div class="card mb-4 flex flex-col gap-4">
      <Stepper v-model="qty" :step="1" :min="0" big label="¿Cuántas gallinas murieron?" />
    </div>

    <DateSelector
      ref="dateSelector"
      v-model="selectedAt"
      :can-override="auth.isAdmin"
      label="¿Cuándo pasó?"
      class="mb-4"
    />

    <label class="mb-4 block">
      <span class="text-base font-semibold text-slate-600">Galpón</span>
      <select v-model="penId"
        class="mt-1 w-full rounded-xl2 border-2 border-slate-200 bg-white px-4 py-3 text-xl focus:border-grass-500 focus:outline-none">
        <option v-for="p in farm.activePens" :key="p.localUuid" :value="p.localUuid">{{ p.name }}</option>
      </select>
    </label>

    <label class="mb-4 block">
      <span class="text-base font-semibold text-slate-600">Causa</span>
      <select v-model="causeId"
        class="mt-1 w-full rounded-xl2 border-2 border-slate-200 bg-white px-4 py-3 text-xl focus:border-grass-500 focus:outline-none">
        <option v-for="c in farm.activeCauses" :key="c.localUuid" :value="c.localUuid">{{ c.name }}</option>
      </select>
    </label>

    <label class="mb-4 block">
      <span class="text-base font-semibold text-slate-600">¿Algo para contar? (opcional)</span>
      <textarea v-model="observation" rows="2"
        class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-lg focus:border-grass-500 focus:outline-none" />
    </label>

    <PhotoInput
      ref="photoInput"
      v-model="photoPath"
      label="Foto del caso (opcional)"
      class="mb-4"
    />

    <BigButton
      :label="busy ? 'Guardando…' : 'Guardar'"
      icon="save"
      color="alert"
      size="block"
      :disabled="busy"
      @click="save"
    />
  </ScreenShell>
</template>
