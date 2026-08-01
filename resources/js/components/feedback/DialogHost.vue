<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDialog } from '@/composables/useDialog'

const { state, _answer } = useDialog()
const input = ref('')

watch(
  () => state.open,
  (open) => {
    if (!open) return

    input.value = state.defaultValue
    // Foco diferido para que el input ya esté montado.
    window.setTimeout(() => document.getElementById('dialog-input')?.focus(), 50)
  },
)

/**
 * Confirmar devuelve el texto tal cual, incluso vacío: quien llamó decide si un
 * valor vacío es válido. Antes el composable traducía "" a null, así que borrar
 * el campo se comportaba como cancelar.
 */
function ok() {
  _answer(state.kind === 'confirm' ? '__ok__' : input.value)
}

function cancel() {
  _answer(null)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="state.open"
      class="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center"
      @click.self="cancel"
      @keydown.escape="cancel"
    >
      <div class="card w-full max-w-md rounded-b-none sm:rounded-xl2" role="dialog" aria-modal="true">
        <h3 class="text-xl font-extrabold text-slate-800">{{ state.title }}</h3>
        <p class="mt-1 text-sm text-slate-600">{{ state.label }}</p>

        <input
          v-if="state.kind === 'prompt'"
          id="dialog-input"
          v-model="input"
          type="text"
          :inputmode="state.inputMode"
          class="mt-3 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
          @keydown.enter="ok"
          @keydown.escape="cancel"
        />

        <div class="mt-4 flex gap-3">
          <button
            type="button"
            class="btn-action flex-1"
            :class="state.danger ? 'btn-action--alert' : 'btn-action--grass'"
            @click="ok"
          >
            {{ state.confirmLabel }}
          </button>
          <button type="button" class="btn-action btn-action--ghost flex-1" @click="cancel">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
