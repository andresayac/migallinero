<script setup lang="ts">
import { computed } from 'vue'
import { useToast } from '@/composables/useToast'

interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

const { toasts } = useToast()

const icons = {
  success: '✓',
  error: '✕',
  info: '!',
}

const styles = computed(() => (t: Toast) =>
  ({
    success: 'bg-grass-600 text-white',
    error: 'bg-alert-600 text-white',
    info: 'bg-slate-800 text-white',
  })[t.type],
)
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      <transition-group name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          :class="[
            'pointer-events-auto flex w-full max-w-md items-center gap-4 rounded-xl2 px-6 py-4 text-xl font-bold shadow-lg',
            styles(t),
          ]"
        >
          <span class="text-3xl">{{ icons[t.type] }}</span>
          <span>{{ t.message }}</span>
        </div>
      </transition-group>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
</style>
