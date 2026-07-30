<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDialog } from '@/composables/useDialog'

const { state, _answer } = useDialog()
const input = ref('')

// Cuando se abre, precargamos el valor por defecto y enfocamos.
watch(
  () => state.open,
  (open) => {
    if (open) {
      input.value = state.defaultValue
      // foco diferido para que el input ya esté montado.
      window.setTimeout(() => {
        document.getElementById('dialog-input')?.focus()
      }, 50)
    }
  },
)

const isConfirm = computed(() => state.defaultValue === '__confirm__')

function ok() {
  _answer(isConfirm.value ? '__ok__' : input.value)
}
function cancel() {
  _answer(null)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="state.open" class="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div class="card w-full max-w-md rounded-b-none sm:rounded-xl2">
        <h3 class="text-xl font-extrabold text-slate-800">{{ state.title }}</h3>
        <p class="mt-1 text-sm text-slate-600">{{ state.label }}</p>

        <input
          v-if="!isConfirm"
          id="dialog-input"
          v-model="input"
          type="text"
          class="mt-3 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
          @keydown.enter="ok"
          @keydown.escape="cancel"
        />

        <div class="mt-4 flex gap-3">
          <button type="button" class="btn-action btn-action--grass flex-1" @click="ok">
            {{ isConfirm ? 'Sí, confirmar' : 'Guardar' }}
          </button>
          <button type="button" class="btn-action btn-action--ghost flex-1" @click="cancel">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
