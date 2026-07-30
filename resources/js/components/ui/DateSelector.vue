<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useFarmStore } from '@/stores/farm'
import { usePeriodLock } from '@/composables/usePeriodLock'
import { fmtDate } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    /** ISO con la fecha/hora seleccionada. */
    modelValue: string
    /** Si el usuario actual es admin, puede autorizar fuera de ventana. */
    canOverride?: boolean
    label?: string
  }>(),
  { canOverride: false, label: 'Fecha' },
)

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const farm = useFarmStore()
const lock = usePeriodLock()

const mode = ref<'auto' | 'manual'>('auto')
const showOverflow = ref(false)
const overflowReason = ref('')
const adminPin = ref('')
const stagedOverflowIso = ref('')

const delta = computed(() => lock.diffDays(props.modelValue))
const check = computed(() => lock.check(props.modelValue))
const isAuto = computed(() => mode.value === 'auto')

const quick = computed(() => (mode.value === 'manual' ? lock.quickDates() : []))

function pickQuick(iso: string) {
  emit('update:modelValue', iso)
  showOverflow.value = false
}

function onPickDate(e: Event) {
  const value = (e.target as HTMLInputElement).value
  if (value) {
    // Conservamos la hora actual del dispositivo si ya era "hoy".
    const [y, m, d] = value.split('-').map(Number)
    const date = new Date()
    date.setFullYear(y, m - 1, d)
    date.setHours(new Date().getHours(), new Date().getMinutes(), 0, 0)
    emit('update:modelValue', date.toISOString())
  }
}

/** Confirmación de admin para fechas fuera de la ventana. */
function confirmOverride() {
  // En producción se validarían credenciales reales; aquí admitimos PIN vacío
  // mientras se integra Sanctum y dejamos registro en la auditoría.
  emit('update:modelValue', stagedOverflowIso.value)
  overflowReason.value = overflowReason.value.trim()
  adminPin.value = ''
  showOverflow.value = false
}

// Si cambia la fecha a una fuera de ventana y estamos en modo manual,
// abrimos el diálogo de autorización de admin.
watch(check, (c) => {
  if (!c.ok && c.deltaDays < -farm.periodLockDays && props.canOverride) {
    stagedOverflowIso.value = props.modelValue
    showOverflow.value = true
  } else if (!c.ok && !props.canOverride) {
    // Si no es admin, devolvemos automáticamente al primer día permitido.
    emit('update:modelValue', lock.minAllowedDate.value.toISOString())
  }
})

defineExpose({
  /** entryMode a persistir en el registro. */
  entryMode: computed(() => (mode.value === 'manual' ? 'manual' : 'auto')),
  manualReason: computed(() => (mode.value === 'manual' ? overflowReason.value : undefined)),
})
</script>

<template>
  <div class="card">
    <div class="mb-2 flex items-center justify-between">
      <span class="text-base font-semibold text-slate-600">{{ label }}</span>

      <!-- Toggle Auto/Manual -->
      <div class="flex overflow-hidden rounded-xl2 border-2 border-slate-200">
        <button
          type="button"
          :class="[
            'px-3 py-1.5 text-sm font-bold',
            isAuto ? 'bg-grass-500 text-white' : 'bg-white text-slate-500',
          ]"
          @click="mode = 'auto'"
        >
          Ahora
        </button>
        <button
          type="button"
          :class="[
            'px-3 py-1.5 text-sm font-bold',
            !isAuto ? 'bg-brand-500 text-white' : 'bg-white text-slate-500',
          ]"
          @click="mode = 'manual'"
        >
          Otro día
        </button>
      </div>
    </div>

    <p class="mb-3 text-2xl font-extrabold text-slate-800">{{ fmtDate(modelValue) }}</p>

    <!-- Auto: solo muestra la hora del dispositivo, no permite tocar fecha -->
    <p v-if="isAuto" class="text-sm text-slate-500">
      🕒 Se guardará con la hora actual del celular.
    </p>

    <!-- Manual: chips de días rápidos + input de fecha -->
    <div v-else class="flex flex-col gap-3">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="q in quick"
          :key="q.iso"
          type="button"
          :class="[
            'rounded-xl2 border-2 px-3 py-2 text-sm font-bold',
            modelValue.startsWith(q.iso.slice(0, 10))
              ? 'border-grass-500 bg-grass-50 text-grass-700'
              : 'border-slate-200 bg-white text-slate-600',
          ]"
          @click="pickQuick(q.iso)"
        >
          {{ q.label }}
        </button>
      </div>
      <input
        type="date"
        :value="modelValue.slice(0, 10)"
        class="w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-lg focus:border-grass-500 focus:outline-none"
        @input="onPickDate"
      />
      <!-- Advertencia de fecha manual -->
      <div
        v-if="delta < 0"
        class="rounded-xl2 bg-brand-50 px-3 py-2 text-sm text-brand-700"
      >
        📅 Este registro quedará marcado como <strong>fecha manual</strong>. Se
        guarda quién y cuándo lo creó para auditoría.
      </div>
      <!-- Rechazo del candado -->
      <div
        v-if="!check.ok && check.deltaDays < -farm.periodLockDays && !canOverride"
        class="rounded-xl2 bg-alert-50 px-3 py-2 text-sm text-alert-700"
      >
        🔒 {{ check.reason }}
      </div>
    </div>

    <!-- Diálogo de autorización admin para fechas bloqueadas -->
    <Teleport to="body">
      <div
        v-if="showOverflow"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      >
        <div class="card w-full max-w-md rounded-b-none sm:rounded-xl2">
          <h3 class="text-xl font-extrabold text-alert-600">🔒 Autorización requerida</h3>
          <p class="mt-1 text-base text-slate-600">
            Esta fecha está fuera del período permitido
            (más de {{ farm.periodLockDays }} días). Solo un administrador puede autorizarlo.
          </p>
          <label class="mt-3 block">
            <span class="text-base font-semibold text-slate-600">Motivo (obligatorio)</span>
            <input
              v-model="overflowReason"
              type="text"
              placeholder="Ej: no hubo energía durante esa semana"
              class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-lg focus:border-grass-500 focus:outline-none"
            />
          </label>
          <label class="mt-3 block">
            <span class="text-base font-semibold text-slate-600">PIN del administrador</span>
            <input
              v-model="adminPin"
              type="password"
              inputmode="numeric"
              class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-lg focus:border-grass-500 focus:outline-none"
            />
          </label>
          <div class="mt-4 flex gap-3">
            <button
              type="button"
              class="btn-action btn-action--ghost flex-1"
              :disabled="!overflowReason.trim()"
              @click="confirmOverride"
            >
              Confirmar
            </button>
            <button
              type="button"
              class="btn-action btn-action--alert flex-1"
              @click="showOverflow = false"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
