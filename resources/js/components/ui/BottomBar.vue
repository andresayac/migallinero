<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Icon from './Icon.vue'
import { useSyncStore } from '@/stores/sync'

const sync = useSyncStore()
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-2xl items-stretch border-t border-slate-200 bg-white px-4 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
  >
    <!-- Botón Inicio SIEMPRE visible -->
    <RouterLink
      to="/"
      class="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl2 py-2 text-sm font-bold text-grass-600 active:bg-grass-50"
    >
      <Icon name="home" :size="28" />
      <span>Inicio</span>
    </RouterLink>

    <!-- Estado de sincronización -->
    <button
      type="button"
      class="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl2 py-2 text-xs font-semibold active:bg-slate-50"
      :class="sync.hasPending ? 'text-brand-600' : 'text-slate-400'"
      @click="sync.forceSync()"
    >
      <Icon name="sync" :size="24" />
      <span>{{ sync.statusText }}</span>
    </button>
  </nav>
</template>
