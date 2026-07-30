<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Valor actual (se muestra en pantalla). */
    modelValue: number
    /** Título que se muestra arriba (nombre de la categoría). */
    title?: string
    /** Color del título y el botón confirmar. */
    color?: string
    /** Mostrar o no el keypad. */
    open: boolean
  }>(),
  {
    title: '',
    color: '#16a34a',
    open: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: number): void
  (e: 'confirm', v: number): void
  (e: 'close'): void
}>()

/** Lo que el usuario va escribiendo (buffer de texto). */
const buffer = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      // Al abrir, precargamos el valor actual como buffer.
      buffer.value = props.modelValue > 0 ? String(props.modelValue) : ''
    }
  },
)

/** Valor numérico actual del buffer. */
function numValue(): number {
  return parseInt(buffer.value || '0', 10)
}

/** Agrega un dígito (o "00") al buffer. */
function press(digit: string) {
  const digitsToAdd = digit.length // "00" añade 2, "5" añade 1
  if (buffer.value.length + digitsToAdd > 6) return
  // No permitir 0 como primer dígito.
  if (buffer.value === '' && digit === '0') return
  if (buffer.value === '' && digit === '00') return
  if (buffer.value === '0' && digit !== '0' && digit !== '00') {
    buffer.value = digit
  } else {
    buffer.value += digit
  }
}

/** Borra el último dígito. */
function backspace() {
  buffer.value = buffer.value.slice(0, -1)
}

/** Limpia todo el buffer. */
function clearAll() {
  buffer.value = ''
}

/** Confirma el valor y cierra. */
function confirm() {
  const val = numValue()
  emit('update:modelValue', val)
  emit('confirm', val)
  emit('close')
}

/** Cierra sin cambiar el valor. */
function cancel() {
  emit('close')
}

// Bloquear scroll del body cuando el keypad está abierto.
onMounted(() => {
  if (props.open) document.body.style.overflow = 'hidden'
})
onUnmounted(() => {
  document.body.style.overflow = ''
})

watch(
  () => props.open,
  (isOpen) => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
  },
)

/** Atajo de teclado para desktop. */
function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key >= '0' && e.key <= '9') press(e.key)
  else if (e.key === 'Backspace') backspace()
  else if (e.key === 'Enter') confirm()
  else if (e.key === 'Escape') cancel()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="keypad">
      <div
        v-if="open"
        class="keypad-overlay"
        @click.self="cancel"
      >
        <div class="keypad-sheet">
          <!-- Encabezado -->
          <div class="keypad-header">
            <button
              type="button"
              class="keypad-btn-cancel"
              @click="cancel"
            >
              Cancelar
            </button>
            <span
              class="keypad-title"
              :style="{ color: color }"
            >
              {{ title }}
            </span>
            <button
              type="button"
              class="keypad-btn-confirm"
              :style="{ background: color }"
              @click="confirm"
            >
              Listo
            </button>
          </div>

          <!-- Display -->
          <div class="keypad-display">
            <span class="keypad-digits" :style="{ color: color }">
              {{ buffer || '0' }}
            </span>
          </div>

          <!-- Teclado numérico -->
          <div class="keypad-grid">
            <button
              v-for="d in ['1', '2', '3', '4', '5', '6', '7', '8', '9']"
              :key="d"
              type="button"
              class="keypad-digit"
              @click="press(d)"
            >
              {{ d }}
            </button>

            <!-- Fila inferior: C / 0 / 00 / ← -->
            <div class="keypad-bottom-row">
              <button
                type="button"
                class="keypad-func keypad-clear"
                @click="clearAll"
              >
                C
              </button>
              <button
                type="button"
                class="keypad-digit"
                @click="press('0')"
              >
                0
              </button>
              <button
                type="button"
                class="keypad-digit keypad-double"
                @click="press('00')"
              >
                00
              </button>
              <button
                type="button"
                class="keypad-func keypad-back"
                @click="backspace"
              >
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                  <line x1="18" y1="9" x2="12" y2="15" />
                  <line x1="12" y1="9" x2="18" y2="15" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.keypad-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  -webkit-tap-highlight-color: transparent;
}

.keypad-sheet {
  width: 100%;
  max-width: 480px;
  border-radius: 1.25rem 1.25rem 0 0;
  background: #f8fafc;
  padding: 0.75rem 0.75rem calc(env(safe-area-inset-bottom, 0px) + 0.75rem);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.15);
  user-select: none;
  -webkit-user-select: none;
}

/* Header */
.keypad-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.5rem 0.75rem;
}

.keypad-title {
  font-size: 1.125rem;
  font-weight: 800;
}

.keypad-btn-cancel,
.keypad-btn-confirm {
  min-height: 2.75rem;
  min-width: 5rem;
  border-radius: 0.75rem;
  font-size: 1rem;
  font-weight: 700;
  padding: 0 1rem;
  border: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.keypad-btn-cancel {
  background: #e2e8f0;
  color: #475569;
}

.keypad-btn-confirm {
  color: white;
}

/* Display */
.keypad-display {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem 1rem;
}

.keypad-digits {
  font-size: 3.5rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  min-height: 4.5rem;
  line-height: 4.5rem;
}

/* Grid de dígitos */
.keypad-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.keypad-bottom-row {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.keypad-digit {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 4rem;
  border-radius: 0.75rem;
  background: white;
  color: #1e293b;
  font-size: 1.75rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
  -webkit-tap-highlight-color: transparent;
  transition: background 0.08s, transform 0.08s;
}

.keypad-digit:active {
  background: #e2e8f0;
  transform: scale(0.95);
}

.keypad-func {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 4rem;
  border-radius: 0.75rem;
  font-size: 1.25rem;
  font-weight: 800;
  border: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.08s, transform 0.08s;
}

.keypad-func:active {
  transform: scale(0.95);
}

.keypad-clear {
  background: #fee2e2;
  color: #dc2626;
}

.keypad-back {
  background: #e2e8f0;
  color: #475569;
}

/* Transición slide-up */
.keypad-enter-active,
.keypad-leave-active {
  transition: opacity 0.2s ease, transform 0.25s ease;
}

.keypad-enter-from,
.keypad-leave-to {
  opacity: 0;
}

.keypad-enter-from .keypad-sheet,
.keypad-leave-to .keypad-sheet {
  transform: translateY(100%);
}

.keypad-enter-active .keypad-sheet,
.keypad-leave-active .keypad-sheet {
  transition: transform 0.25s ease;
}
</style>
