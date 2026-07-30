<script setup lang="ts">
import { watch } from 'vue'
import BigButton from './BigButton.vue'
import Icon from './Icon.vue'
import { usePhoto } from '@/composables/usePhoto'

const props = defineProps<{
  /** URL/objectURL inicial si se está editando (vacío si no hay) */
  modelValue?: string
  label?: string
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const { previewUrl, blob, pick, clear } = usePhoto()

// Cuando se monta con un valor previo, lo mostramos.
watch(
  () => props.modelValue,
  (v) => {
    if (v && !previewUrl.value) previewUrl.value = v
  },
  { immediate: true },
)

// Cuando cambia la foto, emitimos el nuevo objetoURL.
watch(previewUrl, (v) => emit('update:modelValue', v))

defineExpose({ blob })
</script>

<template>
  <div class="card flex flex-col items-center gap-3">
    <span v-if="label" class="text-base font-semibold text-slate-600">{{ label }}</span>

    <div v-if="previewUrl" class="relative">
      <img :src="previewUrl" alt="Foto" class="max-h-48 rounded-xl2 object-cover" />
      <button
        type="button"
        class="absolute right-1 top-1 rounded-full bg-alert-600 p-1.5 text-white shadow"
        aria-label="Quitar foto"
        @click="clear"
      >
        <Icon name="close" :size="18" />
      </button>
    </div>

    <BigButton
      :label="previewUrl ? 'Cambiar foto' : 'Tomar foto'"
      icon="save"
      color="ghost"
      size="block"
      @click="pick"
    />
  </div>
</template>
