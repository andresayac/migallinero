<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { usePeriodLock } from '@/composables/usePeriodLock'
import { api, apiErrorMessage } from '@/api/http'
import { dayKey, fmtDate, startOfFarmDay } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    /** ISO con la fecha/hora seleccionada. */
    modelValue: string
    /** Si el usuario es admin, puede pedir autorización fuera de ventana. */
    canOverride?: boolean
    label?: string
  }>(),
  { canOverride: false, label: 'Fecha' },
)

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const farm = useFarmStore()
const auth = useAuthStore()
const lock = usePeriodLock()

const mode = ref<'auto' | 'manual'>('auto')
const showOverflow = ref(false)
const overflowReason = ref('')
const adminPin = ref('')
const pinError = ref('')
const verifying = ref(false)
/** Fecha concreta autorizada por un admin con PIN válido. */
const authorizedIso = ref('')
const stagedIso = ref('')

const delta = computed(() => lock.diffDays(props.modelValue))
const check = computed(() => lock.check(props.modelValue))
const isAuto = computed(() => mode.value === 'auto')
const quick = computed(() => (mode.value === 'manual' ? lock.quickDates() : []))

/** Tope del input: hoy en la zona de la granja (nunca se admite futuro). */
const maxDate = computed(() => dayKey(startOfFarmDay()))
const minDate = computed(() => dayKey(lock.minAllowedDate.value))

/**
 * La fecha vale si pasa el candado o si un admin la autorizó con PIN.
 * Las vistas consultan `isValid` antes de guardar: antes ninguna lo hacía y una
 * fecha rechazada se guardaba igual si el watch no llegaba a corregirla.
 */
const isValid = computed(() => check.value.ok || authorizedIso.value === props.modelValue)

function pickQuick(iso: string) {
  emit('update:modelValue', iso)
  showOverflow.value = false
}

/**
 * Construye la fecha elegida conservando la hora actual, y la valida ANTES de
 * emitirla para no dejar nunca el modelo en un estado inválido.
 */
function onPickDate(e: Event) {
  const value = (e.target as HTMLInputElement).value
  if (!value) return

  const [y, m, d] = value.split('-').map(Number)
  const now = new Date()
  const date = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), 0, 0)
  const iso = date.toISOString()

  const result = lock.check(iso)

  if (result.ok) {
    emit('update:modelValue', iso)

    return
  }

  // El futuro no lo autoriza nadie: se corrige a hoy.
  if (!result.overridable) {
    emit('update:modelValue', new Date().toISOString())

    return
  }

  // Fuera de ventana: un admin puede autorizarla con motivo + PIN.
  if (props.canOverride && auth.hasBackendSession) {
    stagedIso.value = iso
    adminPin.value = ''
    pinError.value = ''
    showOverflow.value = true

    return
  }

  emit('update:modelValue', lock.minAllowedDate.value.toISOString())
}

/**
 * Autorización de admin: el PIN se verifica CONTRA EL SERVIDOR.
 *
 * Antes esta función sólo aceptaba la fecha, con un comentario que decía "aquí
 * admitimos PIN vacío": el candado no protegía de nada, el campo del PIN era
 * decorativo y la columna `users.pin` no se consultaba en ningún sitio.
 */
async function confirmOverride() {
  if (!overflowReason.value.trim()) {
    pinError.value = 'Escribe el motivo'

    return
  }

  if (!adminPin.value.trim()) {
    pinError.value = 'Escribe el PIN del administrador'

    return
  }

  verifying.value = true
  pinError.value = ''

  try {
    const result = await api.verifyPin(adminPin.value.trim())

    if (!result.valid) {
      pinError.value = result.message ?? 'PIN incorrecto'

      return
    }

    authorizedIso.value = stagedIso.value
    emit('update:modelValue', stagedIso.value)
    showOverflow.value = false
    adminPin.value = ''
  } catch (e) {
    pinError.value = apiErrorMessage(e, 'No se pudo verificar el PIN')
  } finally {
    verifying.value = false
  }
}

function cancelOverride() {
  showOverflow.value = false
  adminPin.value = ''
  pinError.value = ''
  emit('update:modelValue', new Date().toISOString())
}

/** Al volver a "Ahora" se descarta cualquier autorización previa. */
watch(mode, (value) => {
  if (value === 'auto') {
    authorizedIso.value = ''
    overflowReason.value = ''
    emit('update:modelValue', new Date().toISOString())
  }
})

defineExpose({
  /** entryMode a persistir en el registro. */
  entryMode: computed(() => (mode.value === 'manual' ? 'manual' : 'auto')),
  manualReason: computed(() =>
    mode.value === 'manual' && overflowReason.value.trim() ? overflowReason.value.trim() : undefined,
  ),
  /** Las vistas lo consultan antes de guardar. */
  isValid,
  validationMessage: computed(() => (isValid.value ? '' : (check.value.reason ?? ''))),
})
</script>

<template>
  <div class="card">
    <div class="mb-2 flex items-center justify-between">
      <span class="text-base font-semibold text-slate-600">{{ label }}</span>

      <!-- Toggle Ahora / Otro día -->
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

    <p v-if="isAuto" class="text-sm text-slate-500">
      🕒 Se guardará con la hora actual del celular.
    </p>

    <div v-else class="flex flex-col gap-3">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="q in quick"
          :key="q.iso"
          type="button"
          :class="[
            'rounded-xl2 border-2 px-3 py-2 text-sm font-bold',
            dayKey(modelValue) === q.key
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
        :value="dayKey(modelValue)"
        :max="maxDate"
        :min="canOverride ? undefined : minDate"
        class="w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-lg focus:border-grass-500 focus:outline-none"
        @input="onPickDate"
      />

      <div v-if="delta < 0" class="rounded-xl2 bg-brand-50 px-3 py-2 text-sm text-brand-700">
        📅 Este registro quedará marcado como <strong>fecha manual</strong>. Se guarda
        quién y cuándo lo creó para auditoría.
      </div>

      <div
        v-if="!isValid"
        class="rounded-xl2 bg-alert-50 px-3 py-2 text-sm font-semibold text-alert-700"
      >
        🔒 {{ check.reason }}
      </div>

      <div
        v-if="authorizedIso === modelValue"
        class="rounded-xl2 bg-grass-50 px-3 py-2 text-sm font-semibold text-grass-700"
      >
        ✓ Autorizado por el administrador
      </div>
    </div>

    <!-- Autorización de admin para fechas fuera del período -->
    <Teleport to="body">
      <div
        v-if="showOverflow"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      >
        <div class="card w-full max-w-md rounded-b-none sm:rounded-xl2">
          <h3 class="text-xl font-extrabold text-alert-600">🔒 Autorización requerida</h3>
          <p class="mt-1 text-base text-slate-600">
            Esta fecha está fuera del período permitido (más de
            {{ farm.periodLockDays }} días). Sólo un administrador puede autorizarla.
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
              autocomplete="off"
              class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-lg focus:border-grass-500 focus:outline-none"
              @keydown.enter="confirmOverride"
            />
          </label>

          <p v-if="pinError" class="mt-2 text-sm font-semibold text-alert-600">{{ pinError }}</p>

          <div class="mt-4 flex gap-3">
            <button
              type="button"
              class="btn-action btn-action--grass flex-1"
              :disabled="verifying || !overflowReason.trim() || !adminPin.trim()"
              @click="confirmOverride"
            >
              {{ verifying ? 'Verificando…' : 'Confirmar' }}
            </button>
            <button type="button" class="btn-action btn-action--ghost flex-1" @click="cancelOverride">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
