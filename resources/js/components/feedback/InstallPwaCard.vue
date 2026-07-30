<script setup lang="ts">
import { computed } from 'vue'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { useToast } from '@/composables/useToast'
import BigButton from '@/components/ui/BigButton.vue'

const { canInstall, isInstalled, isIos, promptInstall } = usePwaInstall()
const toast = useToast()

const showCard = computed(() => !isInstalled.value && (canInstall.value || isIos.value))

async function install() {
  const accepted = await promptInstall()
  if (accepted) {
    toast.success('¡App instalada! Ábrela desde tu pantalla de inicio')
  }
}
</script>

<template>
  <div v-if="showCard" class="card mb-3 border-2 border-dashed border-grass-500 bg-grass-50">
    <p class="text-base font-bold text-grass-700">📱 Instalar como app</p>

    <!-- Android / Chrome: botón directo -->
    <template v-if="canInstall">
      <p class="mt-1 text-sm text-slate-600">
        Instala Mi Gallinero en tu celular para usarla sin navegador, como una app normal.
      </p>
      <div class="mt-2">
        <BigButton label="Instalar app" icon="download" color="grass" size="block" @click="install" />
      </div>
    </template>

    <!-- iOS: instrucciones manuales -->
    <template v-else-if="isIos">
      <p class="mt-1 text-sm text-slate-600">
        En iPhone/iPad: toca el botón <strong>Compartir</strong>
        <span class="inline-block px-1 text-lg">⎋</span> y luego
        <strong>"Añadir a pantalla de inicio"</strong>.
      </p>
    </template>
  </div>
</template>
