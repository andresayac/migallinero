<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import BigButton from './BigButton.vue'
import Icon from './Icon.vue'
import { resolvePhotoUrl, usePhoto } from '@/composables/usePhoto'

const props = defineProps<{
  /** Referencia guardada (`local:<uuid>`) si se está editando un registro. */
  modelValue?: string
  label?: string
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const { previewUrl, blob, busy, error, pick, persist, clear } = usePhoto()

let revokeStored: (() => void) | null = null

/**
 * Al montar con una referencia previa, cargamos el Blob desde IndexedDB.
 * Antes se asignaba `previewUrl = modelValue`, que era un `blob:` URL muerto de
 * una sesión anterior y se mostraba como imagen rota.
 */
watch(
  () => props.modelValue,
  async (reference) => {
    if (!reference || previewUrl.value) return

    const resolved = await resolvePhotoUrl(reference)
    if (!resolved) return

    revokeStored?.()
    revokeStored = resolved.revoke
    previewUrl.value = resolved.url
  },
  { immediate: true },
)

function onClear() {
  clear()
  revokeStored?.()
  revokeStored = null
  emit('update:modelValue', '')
}

onUnmounted(() => revokeStored?.())

/**
 * La vista llama a `persistPhoto` al guardar: escribe el Blob en la tabla
 * `photos` y devuelve la referencia estable que se guarda en el registro.
 */
defineExpose({
  blob,
  async persistPhoto(farmId: string): Promise<string | undefined> {
    const reference = await persist(farmId)
    if (reference) emit('update:modelValue', reference)

    return reference ?? props.modelValue ?? undefined
  },
})
</script>

<template>
  <div class="card flex flex-col items-center gap-3">
    <span v-if="label" class="text-base font-semibold text-slate-600">{{ label }}</span>

    <div v-if="previewUrl" class="relative">
      <img :src="previewUrl" alt="Foto del registro" class="max-h-48 rounded-xl2 object-cover" />
      <button
        type="button"
        class="absolute right-1 top-1 rounded-full bg-alert-600 p-1.5 text-white shadow"
        aria-label="Quitar foto"
        @click="onClear"
      >
        <Icon name="close" :size="18" />
      </button>
    </div>

    <p v-if="error" class="text-sm font-semibold text-alert-600">{{ error }}</p>

    <BigButton
      :label="busy ? 'Procesando…' : previewUrl ? 'Cambiar foto' : 'Tomar foto'"
      icon="save"
      color="ghost"
      size="block"
      :disabled="busy"
      @click="pick"
    />
  </div>
</template>
