<script setup lang="ts">
import { computed } from 'vue'
import { useFarmStore } from '@/stores/farm'
import Icon from './Icon.vue'

const farm = useFarmStore()

const options = computed(() => [
  { id: '', name: 'Todos', color: '#64748b' },
  ...farm.activePens.map((p) => ({ id: p.localUuid, name: p.name, color: p.color })),
])
</script>

<template>
  <!-- Selector horizontal scrolleable; "Todos" a la izquierda, galpones a la derecha -->
  <div class="flex gap-2 overflow-x-auto rounded-xl2 bg-white p-1 ring-1 ring-slate-100">
    <button
      v-for="opt in options"
      :key="opt.id"
      type="button"
      :class="[
        'flex shrink-0 items-center gap-2 rounded-xl2 px-4 py-2 text-base font-bold transition',
        farm.activePenId === opt.id
          ? 'bg-grass-500 text-white shadow-sm'
          : 'text-slate-600 active:bg-slate-50',
      ]"
      @click="farm.setActivePen(opt.id)"
    >
      <span
        class="h-3 w-3 rounded-full"
        :style="{ background: opt.color }"
        :aria-hidden="true"
      />
      <span>{{ opt.name }}</span>
      <!-- Indicador de galpón -->
      <Icon v-if="opt.id" name="chicken" :size="18" />
    </button>
  </div>
</template>
