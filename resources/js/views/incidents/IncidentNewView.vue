<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { create as createRecord } from '@/db/repository'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/composables/useToast'
import { useSubmit } from '@/composables/useSubmit'
import { uuid, nowISO } from '@/utils/format'
import type { Incident, IncidentSeverity } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'

const router = useRouter()
const farm = useFarmStore()
const auth = useAuthStore()
const sync = useSyncStore()
const toast = useToast()
const { busy, submit } = useSubmit()

const types = ['Salud', 'Alimentación', 'Agua', 'Infraestructura', 'Seguridad', 'Comportamiento', 'Producción', 'Otra']
const type = ref('Salud')
const description = ref('')
const severity = ref<IncidentSeverity>('med')

async function save() {
  if (!farm.farmId) return
  if (!description.value.trim()) {
    toast.error('Escribe qué pasó')
    return
  }
  const ts = nowISO()

  const incident: Incident = {
    localUuid: uuid(),
    farmId: farm.farmId,
    type: type.value,
    // El galpón activo da contexto a la novedad; antes se perdía.
    penId: farm.activePenId || undefined,
    description: description.value.trim(),
    severity: severity.value,
    status: 'open',
    pendingSync: true,
    entryMode: 'auto',
    createdAt: ts,
    updatedAt: ts,
    createdBy: auth.user?.id ?? 'unknown',
  }

  const saved = await submit(async () => {
    await createRecord('incident', incident)

    await sync.refreshPending()
    void sync.forceSync()

    return true
  })

  if (!saved) return

  toast.success('Novedad registrada')
  router.replace({ name: 'home' })
}
</script>

<template>
  <ScreenShell title="Registrar novedad">
    <label class="mb-4 block">
      <span class="text-base font-semibold text-slate-600">Tipo</span>
      <select v-model="type"
        class="mt-1 w-full rounded-xl2 border-2 border-slate-200 bg-white px-4 py-3 text-xl focus:border-grass-500 focus:outline-none">
        <option v-for="t in types" :key="t" :value="t">{{ t }}</option>
      </select>
    </label>

    <label class="mb-4 block">
      <span class="text-base font-semibold text-slate-600">¿Qué pasó?</span>
      <textarea v-model="description" rows="3"
        placeholder="Ej: se rompió el comedero del corral norte"
        class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-lg focus:border-grass-500 focus:outline-none" />
    </label>

    <div class="mb-6">
      <span class="text-base font-semibold text-slate-600">Importancia</span>
      <div class="mt-1 grid grid-cols-3 gap-2">
        <button v-for="opt in (['low','med','high'] as IncidentSeverity[])"
          :key="opt" type="button"
          :class="['rounded-xl2 border-2 px-2 py-3 text-base font-bold',
            severity === opt ? 'border-grass-500 bg-grass-50 text-grass-700' : 'border-slate-200 bg-white text-slate-600']"
          @click="severity = opt">
          {{ opt === 'low' ? 'Baja' : opt === 'med' ? 'Media' : 'Alta' }}
        </button>
      </div>
    </div>

    <BigButton
      :label="busy ? 'Guardando…' : 'Guardar'"
      icon="save"
      color="amber"
      size="block"
      :disabled="busy"
      @click="save"
    />
  </ScreenShell>
</template>
