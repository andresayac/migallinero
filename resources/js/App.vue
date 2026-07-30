<script setup lang="ts">
import { RouterView } from 'vue-router'
import Toaster from '@/components/feedback/Toaster.vue'
import DialogHost from '@/components/feedback/DialogHost.vue'
</script>

<template>
  <RouterView v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </RouterView>

  <!-- Toasts globales: mensajes de confirmación grandes y visibles -->
  <Toaster />

  <!-- Diálogo modal global (prompt/confirm reutilizables) -->
  <DialogHost />
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
