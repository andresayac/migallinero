<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    icon?: string
    /** color: grass | amber | alert | ghost | white */
    color?: 'grass' | 'amber' | 'alert' | 'ghost' | 'white'
    size?: 'normal' | 'block' | 'tile'
    disabled?: boolean
  }>(),
  {
    color: 'grass',
    size: 'normal',
    icon: '',
    disabled: false,
  },
)

const emit = defineEmits<{ (e: 'click'): void }>()

const classes = computed(() => {
  const base = [
    'relative inline-flex items-center justify-center gap-3 font-bold',
    'rounded-xl2 transition active:scale-[0.98] min-h-touch',
  ]
  if (props.size === 'block') base.push('w-full px-6 py-5 text-2xl')
  else if (props.size === 'tile')
    base.push('w-full flex-col gap-2 px-4 py-5 text-xl')
  else base.push('min-w-touch px-6 py-4 text-xl')

  if (props.disabled) {
    base.push('bg-slate-200 text-slate-400 cursor-not-allowed')
    return base
  }

  const colorMap: Record<string, string> = {
    grass: 'bg-grass-500 text-white active:bg-grass-600',
    amber: 'bg-brand-500 text-white active:bg-brand-600',
    alert: 'bg-alert-500 text-white active:bg-alert-600',
    ghost: 'bg-white border-2 border-slate-200 text-slate-700 active:bg-slate-50',
    white: 'bg-white text-grass-600 shadow-sm active:bg-slate-50',
  }
  base.push(colorMap[props.color])
  return base
})
</script>

<template>
  <button
    :class="classes"
    :disabled="disabled"
    @click="emit('click')"
  >
    <Icon v-if="icon" :name="icon" :size="size === 'tile' ? 40 : 28" />
    <span>{{ label }}</span>
    <slot />
  </button>
</template>

<script lang="ts">
import Icon from './Icon.vue'
export default { components: { Icon } }
</script>
