<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/composables/useToast'
import { uuid, nowISO } from '@/utils/format'
import type { Vaccine } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import Stepper from '@/components/ui/Stepper.vue'
import PhotoInput from '@/components/ui/PhotoInput.vue'

const router = useRouter()
const farm = useFarmStore()
const auth = useAuthStore()
const sync = useSyncStore()
const toast = useToast()

const name = ref('')
const penId = ref('')
const appliedAt = ref(new Date().toISOString().slice(0, 10))
const nextAt = ref('')
const qtyChickens = ref(0)
const responsible = ref('')
const observation = ref('')
const photoPath = ref('')
const photoInput = ref<InstanceType<typeof PhotoInput> | null>(null)

onMounted(() => {
  penId.value = farm.activePenId || (farm.pens.length ? farm.pens[0].localUuid : '')
})

async function save() {
  if (!farm.farmId) return
  if (!name.value.trim()) {
    toast.error('Escribe el nombre de la vacuna')
    return
  }
  const ts = nowISO()
  const blobUrl = photoInput.value?.blob ? URL.createObjectURL(photoInput.value.blob) : (photoPath.value || undefined)
  const v: Vaccine = {
    localUuid: uuid(),
    farmId: farm.farmId,
    name: name.value.trim(),
    penId: penId.value,
    appliedAt: new Date(appliedAt.value).toISOString(),
    nextAt: nextAt.value ? new Date(nextAt.value).toISOString() : undefined,
    qtyChickens: qtyChickens.value,
    responsible: responsible.value || undefined,
    observation: observation.value || undefined,
    photoPath: blobUrl,
    pendingSync: true,
    createdAt: ts,
    updatedAt: ts,
    createdBy: auth.user?.id ?? 'unknown',
  }
  await db.vaccines.add(v)
  await db.syncQueue.add({
    farmId: farm.farmId,
    entity: 'vaccine',
    action: 'create',
    localUuid: v.localUuid,
    payload: v,
    attempts: 0,
    createdAt: ts,
  })
  await sync.refreshPending()
  sync.forceSync()

  toast.success('Vacuna registrada')
  router.replace({ name: 'home' })
}
</script>

<template>
  <ScreenShell title="Registrar vacuna">
    <label class="mb-4 block">
      <span class="text-base font-semibold text-slate-600">Nombre de la vacuna</span>
      <input v-model="name" type="text" placeholder="Ej: Newcastle"
        class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none" />
    </label>

    <label class="mb-4 block">
      <span class="text-base font-semibold text-slate-600">Galpón</span>
      <select v-model="penId"
        class="mt-1 w-full rounded-xl2 border-2 border-slate-200 bg-white px-4 py-3 text-xl focus:border-grass-500 focus:outline-none">
        <option v-for="p in farm.activePens" :key="p.localUuid" :value="p.localUuid">{{ p.name }}</option>
      </select>
    </label>

    <div class="mb-4 grid grid-cols-2 gap-3">
      <label class="block">
        <span class="text-base font-semibold text-slate-600">Fecha aplicada</span>
        <input v-model="appliedAt" type="date"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-lg focus:border-grass-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-base font-semibold text-slate-600">Próxima fecha</span>
        <input v-model="nextAt" type="date"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-lg focus:border-grass-500 focus:outline-none" />
      </label>
    </div>

    <div class="mb-4">
      <Stepper v-model="qtyChickens" :min="0" label="Gallinas vacunadas" />
    </div>

    <label class="mb-4 block">
      <span class="text-base font-semibold text-slate-600">Responsable (opcional)</span>
      <input v-model="responsible" type="text"
        class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-lg focus:border-grass-500 focus:outline-none" />
    </label>

    <PhotoInput
      ref="photoInput"
      v-model="photoPath"
      label="Foto del comprobante (opcional)"
      class="mb-4"
    />

    <BigButton label="Guardar vacuna" icon="syringe" size="block" @click="save" />
  </ScreenShell>
</template>
