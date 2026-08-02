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
    <!-- Botón Inicio SIEMPRE visible.
         `exact-active-class` y no `active-class`: la ruta '/' es prefijo de
         todas, así que Inicio saldría marcado en cada pantalla de la app. -->
    <RouterLink
      to="/"
      class="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl2 py-2 text-sm font-bold text-slate-400 active:bg-grass-50"
      exact-active-class="!text-grass-600"
    >
      <Icon name="home" :size="28" />
      <span>Inicio</span>
    </RouterLink>

    <!-- Resumen: los números de la granja, fuera del inicio para que la
         pantalla de acciones quede limpia. -->
    <RouterLink
      to="/summary"
      class="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl2 py-2 text-sm font-bold text-slate-400 active:bg-grass-50"
      exact-active-class="!text-grass-600"
    >
      <Icon name="summary" :size="28" />
      <span>Resumen</span>
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
