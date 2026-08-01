<script setup lang="ts">
import { computed, toRef, watch, onMounted, onUnmounted } from 'vue'
import { useCalculator, type CalculatorOperator } from '@/composables/useCalculator'

const props = withDefaults(
  defineProps<{
    modelValue: number
    title?: string
    color?: string
    open: boolean
    /**
     * Decimales admitidos. Los kilos por bulto (40,5) y las cantidades de
     * alimento son decimales en la base de datos; con 0 el teclado sólo acepta
     * enteros y oculta la tecla de coma.
     */
    decimals?: number
    /** Permite valores negativos (ajustes de inventario que restan). */
    allowNegative?: boolean
  }>(),
  {
    title: '',
    color: '#16a34a',
    open: false,
    decimals: 0,
    allowNegative: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: number): void
  (e: 'confirm', v: number): void
  (e: 'close'): void
}>()

/**
 * La máquina de estados vive en `useCalculator` para poder probarla sin montar
 * el componente: sus fallos sólo aparecen en secuencias de varias pulsaciones
 * (encadenar operaciones, corregir el operador), no en una pantalla estática.
 */
const calc = useCalculator({
  decimals: toRef(props, 'decimals'),
  allowNegative: toRef(props, 'allowNegative'),
})

const expression = calc.expression
const display = calc.display

/** Con decimales la última tecla es la coma; si no, el cambio de signo. */
const showDecimalKey = computed(() => props.decimals > 0)
const showSignKey = computed(() => !showDecimalKey.value && props.allowNegative)

watch(
  () => props.open,
  (isOpen) => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    if (isOpen) calc.load(props.modelValue)
  },
)

function confirm() {
  const val = calc.value()

  emit('update:modelValue', val)
  emit('confirm', val)
  emit('close')
}

function cancel() {
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return

  const operadores: Record<string, CalculatorOperator> = { '+': '+', '-': '-', '*': '*', '/': '/' }

  if (e.key >= '0' && e.key <= '9') calc.press(e.key)
  else if (e.key === '.' || e.key === ',') calc.pressDecimal()
  else if (operadores[e.key]) calc.pressOp(operadores[e.key])
  else if (e.key === 'Enter' || e.key === '=') calc.pressEquals()
  else if (e.key === 'Backspace') calc.backspace()
  else if (e.key === 'Escape') cancel()
  else if (e.key === 'c' || e.key === 'C') calc.reset()
}

onMounted(() => {
  if (props.open) document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="keypad">
      <div v-if="open" class="kp-overlay" @click.self="cancel">
        <div class="kp-sheet">
          <!-- Header -->
          <div class="kp-header">
            <button type="button" class="kp-btn kp-btn-cancel" @click="cancel">Cancelar</button>
            <span class="kp-title" :style="{ color }">{{ title }}</span>
            <button type="button" class="kp-btn kp-btn-ok" :style="{ background: color }" @click="confirm">Listo</button>
          </div>

          <!-- Display -->
          <div class="kp-display">
            <span v-if="expression" class="kp-expr">{{ expression }}</span>
            <span class="kp-value" :style="{ color }">{{ display }}</span>
          </div>

          <!-- Grid 4×5 -->
          <div class="kp-grid">
            <button type="button" class="kp-fn kp-clear" @click="calc.reset()">C</button>
            <button type="button" class="kp-op" @click="calc.pressOp('/')">÷</button>
            <button type="button" class="kp-op" @click="calc.pressOp('*')">×</button>
            <button type="button" class="kp-fn kp-back" @click="calc.backspace()">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                <line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
              </svg>
            </button>

            <button type="button" class="kp-num" @click="calc.press('7')">7</button>
            <button type="button" class="kp-num" @click="calc.press('8')">8</button>
            <button type="button" class="kp-num" @click="calc.press('9')">9</button>
            <button type="button" class="kp-op" @click="calc.pressOp('-')">−</button>

            <button type="button" class="kp-num" @click="calc.press('4')">4</button>
            <button type="button" class="kp-num" @click="calc.press('5')">5</button>
            <button type="button" class="kp-num" @click="calc.press('6')">6</button>
            <button type="button" class="kp-op" @click="calc.pressOp('+')">+</button>

            <button type="button" class="kp-num" @click="calc.press('1')">1</button>
            <button type="button" class="kp-num" @click="calc.press('2')">2</button>
            <button type="button" class="kp-num" @click="calc.press('3')">3</button>
            <button type="button" class="kp-eq kp-eq-tall" :style="{ background: color }" @click="calc.pressEquals()">=</button>

            <button type="button" class="kp-num" :class="{ 'kp-wide': !showDecimalKey && !showSignKey }"
              @click="calc.press('0')">0</button>
            <button type="button" class="kp-num" @click="calc.press('00')">00</button>

            <!-- La coma y el cambio de signo comparten hueco: con decimales manda
                 la coma, y si no hay ninguno de los dos el 0 ocupa dos columnas. -->
            <button v-if="showDecimalKey" type="button" class="kp-num" aria-label="Coma decimal"
              @click="calc.pressDecimal()">,</button>
            <button v-else-if="showSignKey" type="button" class="kp-num" aria-label="Cambiar signo"
              @click="calc.toggleSign()">±</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Overlay ───────────────────────────────────── */
.kp-overlay {
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
.kp-sheet {
  width: 100%;
  max-width: 480px;
  border-radius: 1.25rem 1.25rem 0 0;
  background: #f1f5f9;
  padding: 0.6rem 0.6rem calc(env(safe-area-inset-bottom, 0px) + 0.6rem);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.15);
  user-select: none;
  -webkit-user-select: none;
}

/* ── Header ────────────────────────────────────── */
.kp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.15rem 0.25rem 0.5rem;
}
.kp-title { font-size: 1.05rem; font-weight: 800; }
.kp-btn {
  min-height: 2.5rem;
  min-width: 4.5rem;
  border-radius: 0.7rem;
  font-size: 0.95rem;
  font-weight: 700;
  padding: 0 0.85rem;
  border: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.kp-btn-cancel { background: #e2e8f0; color: #475569; }
.kp-btn-ok { color: #fff; }

/* ── Display ───────────────────────────────────── */
.kp-display {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 0.25rem 0.75rem 0.5rem;
  min-height: 5rem;
}
.kp-expr {
  font-size: 1.05rem;
  font-weight: 600;
  color: #94a3b8;
  letter-spacing: 0.02em;
  min-height: 1.4rem;
}
.kp-value {
  font-size: 3rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

/* ── Grid 4 columnas ──────────────────────────── */
.kp-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4rem;
}

/* ── Botones base ──────────────────────────────── */
.kp-grid button {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.7rem;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.06s, transform 0.06s;
}
.kp-grid button:active { transform: scale(0.94); }

/* Números */
.kp-num {
  height: 3.6rem;
  background: #fff;
  color: #1e293b;
  font-size: 1.5rem;
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.kp-num:active { background: #e2e8f0; }
.kp-wide { grid-column: span 2; }

/* Operadores */
.kp-op {
  height: 3.6rem;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 1.5rem;
  font-weight: 800;
}
.kp-op:active { background: #bfdbfe; }

/* Funciones */
.kp-fn { height: 3.6rem; font-size: 1.15rem; font-weight: 800; }
.kp-clear { background: #fee2e2; color: #dc2626; }
.kp-clear:active { background: #fecaca; }
.kp-back { background: #e2e8f0; color: #475569; }
.kp-back:active { background: #cbd5e1; }

/* = alto (2 filas) */
.kp-eq { color: #fff; font-size: 1.6rem; font-weight: 900; }
.kp-eq-tall { grid-row: span 2; }
.kp-eq:active { filter: brightness(0.9); }

/* ── Transición ────────────────────────────────── */
.keypad-enter-active, .keypad-leave-active { transition: opacity 0.2s ease; }
.keypad-enter-active .kp-sheet, .keypad-leave-active .kp-sheet { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.keypad-enter-from, .keypad-leave-to { opacity: 0; }
.keypad-enter-from .kp-sheet, .keypad-leave-to .kp-sheet { transform: translateY(100%); }
</style>
