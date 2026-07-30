<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    /** incremento/decremento */
    step?: number
    min?: number
    max?: number
    /** mostrar el valor con ceros a la izquierda (ej. 0032) */
    pad?: number
    label?: string
    /** mostrar el valor grande (modo resumen) */
    big?: boolean
    disabled?: boolean
  }>(),
  {
    step: 1,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    pad: 0,
    label: '',
    big: false,
    disabled: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: number): void
}>()

const display = computed(() => {
  if (props.pad > 0) return String(props.modelValue).padStart(props.pad, '0')
  return String(props.modelValue)
})

function add(delta: number) {
  if (props.disabled) return
  const next = Math.min(props.max, Math.max(props.min, props.modelValue + delta))
  emit('update:modelValue', next)
}

function onType(e: Event) {
  const target = e.target as HTMLInputElement
  const n = parseInt(target.value.replace(/\D/g, '') || '0', 10)
  const safe = Number.isFinite(n) ? Math.min(props.max, Math.max(props.min, n)) : props.min
  emit('update:modelValue', safe)
}
</script>

<template>
  <div class="flex flex-col">
    <span v-if="label" class="mb-1 text-base font-semibold text-slate-600">{{ label }}</span>
    <div class="flex items-stretch gap-2">
      <button
        type="button"
        class="flex min-w-[64px] items-center justify-center rounded-xl2 bg-slate-100 text-4xl font-extrabold text-slate-700 active:scale-95 active:bg-slate-200 disabled:opacity-40"
        :disabled="disabled || modelValue <= min"
        aria-label="Restar"
        @click="add(-step)"
      >
        <Icon name="minus" :size="32" />
      </button>

      <input
        inputmode="numeric"
        pattern="[0-9]*"
        :value="display"
        :disabled="disabled"
        :class="[
          'min-w-0 flex-1 rounded-xl2 border-2 border-slate-200 bg-white text-center font-extrabold tracking-tight text-slate-800 focus:border-grass-500 focus:outline-none',
          big ? 'text-mega' : 'text-3xl',
        ]"
        @input="onType"
      />

      <button
        type="button"
        class="flex min-w-[64px] items-center justify-center rounded-xl2 bg-slate-100 text-4xl font-extrabold text-slate-700 active:scale-95 active:bg-slate-200 disabled:opacity-40"
        :disabled="disabled || modelValue >= max"
        aria-label="Sumar"
        @click="add(step)"
      >
        <Icon name="plus" :size="32" />
      </button>
    </div>
  </div>
</template>
