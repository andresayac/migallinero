<script setup lang="ts">
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import BottomBar from './BottomBar.vue'

withDefaults(
  defineProps<{
    title: string
    /** si es false, no se muestra el botón volver (p.ej. home) */
    back?: boolean
  }>(),
  { back: true },
)

const router = useRouter()
</script>

<template>
  <div class="screen pt-[env(safe-area-inset-top)]">
    <header class="mb-4 flex items-center gap-3">
      <button
        v-if="back"
        type="button"
        class="flex min-w-touch items-center justify-center rounded-xl2 bg-white px-4 py-3 text-lg font-bold text-slate-600 active:bg-slate-100"
        aria-label="Volver"
        @click="router.back()"
      >
        <Icon name="back" :size="24" />
      </button>
      <h1 class="text-huge font-extrabold text-slate-800">{{ title }}</h1>
      <div class="ml-auto">
        <slot name="header" />
      </div>
    </header>

    <main class="flex-1 pb-4">
      <slot />
    </main>

    <BottomBar />
  </div>
</template>
