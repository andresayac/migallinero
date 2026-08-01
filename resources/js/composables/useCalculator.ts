import { computed, ref, type Ref } from 'vue'

export type CalculatorOperator = '+' | '-' | '*' | '/'

export interface CalculatorOptions {
  /** Decimales admitidos (0 = sólo enteros). */
  decimals: Ref<number> | (() => number)
  /** Permite valores negativos. */
  allowNegative?: Ref<boolean> | (() => boolean)
  /** Máximo de dígitos que se pueden teclear. */
  maxDigits?: number
}

/**
 * Máquina de estados de la calculadora del teclado numérico.
 *
 * Vive aparte del componente para poder probarla sin montar Vue: los fallos que
 * tenía (perder el acumulado al encadenar operaciones) sólo se notan en
 * secuencias de varias pulsaciones, que es justo lo que no se puede verificar
 * mirando la interfaz una vez.
 */
export function useCalculator(options: CalculatorOptions) {
  const current = ref('')
  const prev = ref<number | null>(null)
  const op = ref<CalculatorOperator | null>(null)
  const justEvaluated = ref(false)
  /**
   * El teclado se abrió con un valor precargado y el usuario aún no ha tecleado.
   *
   * El primer dígito lo SUSTITUYE en vez de añadirse: la tarjeta dice "toca para
   * escribir", así que con 360 dentro teclear un 0 daba 3600 y multiplicaba la
   * cantidad por diez sin que se notara. Borrar sí permite corregir dígito a
   * dígito, para quien sólo quiere arreglar el último número.
   */
  const pristine = ref(false)

  const maxDigits = options.maxDigits ?? 9

  const decimals = () =>
    typeof options.decimals === 'function' ? options.decimals() : options.decimals.value

  const allowNegative = () => {
    if (!options.allowNegative) return false

    return typeof options.allowNegative === 'function'
      ? options.allowNegative()
      : options.allowNegative.value
  }

  /** Operación pendiente, para mostrarla encima del número ("12 ×"). */
  const expression = computed(() => {
    if (prev.value === null || op.value === null) return ''

    const symbol = op.value === '*' ? '×' : op.value === '/' ? '÷' : op.value

    return `${prev.value} ${symbol}`
  })

  const display = computed(() => {
    if (current.value !== '') return current.value
    // Con un operador pendiente mostramos el acumulado, no un 0: si no, al
    // pulsar "×" el número recién escrito parecía haberse borrado.
    if (prev.value !== null) return String(prev.value)

    return '0'
  })

  function reset(): void {
    current.value = ''
    prev.value = null
    op.value = null
    justEvaluated.value = false
    pristine.value = false
  }

  /** Carga el valor actual al abrir el teclado, listo para sustituirlo. */
  function load(value: number): void {
    reset()

    if (value !== 0) {
      current.value = String(value)
      pristine.value = true
    }
  }

  function press(digit: string): void {
    // Tras un "=" un dígito empieza un cálculo nuevo.
    if (justEvaluated.value) reset()

    // Primer dígito sobre un valor precargado: lo sustituye.
    if (pristine.value) {
      current.value = ''
      pristine.value = false
    }

    if (current.value.replace(/[.-]/g, '').length + digit.length > maxDigits) return

    // No superar los decimales que admite la columna de la base de datos.
    const [, decimalPart] = current.value.split('.')
    if (decimalPart !== undefined && decimalPart.length + digit.length > decimals()) return

    // El cero SÍ se puede teclear.
    //
    // Antes se descartaba cuando el campo estaba vacío, para evitar "007". El
    // efecto colateral era que el 0 no se podía escribir en absoluto: no se
    // podía poner una categoría a 0 huevos, ni un costo en 0, ni usar el 0 como
    // segundo operando ("12 ÷ 0" se quedaba a medias). Aquí se admite el valor y
    // lo que se evita es el cero a la izquierda: un dígito posterior lo sustituye.
    const zeroLike = current.value === '' || current.value === '0' || current.value === '-0'

    if (zeroLike) {
      const sign = current.value.startsWith('-') ? '-' : ''
      current.value = /^0+$/.test(digit) ? `${sign}0` : `${sign}${digit}`

      return
    }

    current.value += digit
  }

  /** Coma decimal: sólo cuando la magnitud admite decimales. */
  function pressDecimal(): void {
    if (decimals() <= 0) return
    if (justEvaluated.value) reset()

    if (pristine.value) {
      current.value = ''
      pristine.value = false
    }

    if (current.value.includes('.')) return

    current.value = current.value === '' ? '0.' : `${current.value}.`
  }

  /** Cambia el signo (ajustes de inventario que restan). */
  function toggleSign(): void {
    if (!allowNegative()) return

    pristine.value = false

    if (current.value === '' && prev.value !== null) {
      prev.value = -prev.value

      return
    }

    current.value = current.value.startsWith('-')
      ? current.value.slice(1)
      : `-${current.value || '0'}`
  }

  function pressOp(nextOp: CalculatorOperator): void {
    // Operar sobre el valor precargado lo toma como primer operando.
    pristine.value = false

    // Sin nada escrito pero con un acumulado, sólo se cambia el operador.
    //
    // Cubre dos casos que antes daban resultados incorrectos, porque se hacía
    // `prev = parseFloat('')` y el acumulado se iba a cero:
    //  - Encadenar tras "=": 12 × 30 = 360, y luego "+ 5 =" daba 5, no 365,
    //    porque "=" deja `op` en null.
    //  - Corregir el operador: en "12 ×" pulsar "÷" perdía el 12.
    if (current.value === '' && prev.value !== null) {
      op.value = nextOp
      justEvaluated.value = false

      return
    }

    const cur = parseFloat(current.value || '0')

    prev.value =
      prev.value !== null && op.value !== null ? evaluate(prev.value, cur, op.value) : cur

    op.value = nextOp
    current.value = ''
    justEvaluated.value = false
  }

  function pressEquals(): void {
    if (prev.value === null || op.value === null) {
      if (current.value !== '') justEvaluated.value = true

      return
    }

    // Sin segundo operando no hay nada que resolver: se deja pendiente. Antes se
    // usaba 0, así que "12 × =" devolvía 0 en lugar de esperar el operando.
    if (current.value === '') return

    prev.value = evaluate(prev.value, parseFloat(current.value), op.value)
    op.value = null
    current.value = ''
    justEvaluated.value = true
  }

  function backspace(): void {
    if (justEvaluated.value) {
      reset()

      return
    }

    // Borrar sobre un valor precargado lo edita, no lo descarta.
    pristine.value = false

    // Con el operando vacío, borrar cancela la operación pendiente en vez de no
    // hacer nada, que dejaba al usuario sin forma de deshacer un "×" mal dado.
    if (current.value === '' && op.value !== null) {
      op.value = null

      return
    }

    current.value = current.value.slice(0, -1)
  }

  function evaluate(a: number, b: number, operator: CalculatorOperator): number {
    switch (operator) {
      case '+':
        return a + b
      case '-':
        return a - b
      case '*':
        return a * b
      // El redondeo se aplica una sola vez, al confirmar: hacerlo aquí (con
      // Math.floor) convertía "100 ÷ 8" en 12 incluso en campos con decimales.
      case '/':
        return b !== 0 ? a / b : 0
      default:
        return b
    }
  }

  /**
   * Valor que se guarda al confirmar.
   *
   * Resuelve la operación a medias si la hay; si no, devuelve lo escrito o el
   * acumulado. Antes, con un operador pendiente y nada escrito ("12 ×"), caía en
   * `parseFloat('')` y guardaba 0: el usuario perdía el número que había teclado.
   */
  function rawValue(): number {
    if (prev.value !== null && op.value !== null && current.value !== '') {
      return evaluate(prev.value, parseFloat(current.value), op.value)
    }

    if (current.value !== '') return parseFloat(current.value)
    if (prev.value !== null) return prev.value

    return 0
  }

  /** Valor final, redondeado a los decimales admitidos y con el signo aplicado. */
  function value(): number {
    const raw = rawValue()
    const factor = 10 ** decimals()
    const rounded = Math.round((Number.isFinite(raw) ? raw : 0) * factor) / factor

    return allowNegative() ? rounded : Math.max(0, rounded)
  }

  return {
    current,
    prev,
    op,
    justEvaluated,
    pristine,
    expression,
    display,
    reset,
    load,
    press,
    pressDecimal,
    toggleSign,
    pressOp,
    pressEquals,
    backspace,
    value,
  }
}
