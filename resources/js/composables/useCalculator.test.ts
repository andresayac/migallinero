import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useCalculator, type CalculatorOperator } from './useCalculator'

/**
 * La calculadora del teclado numérico.
 *
 * Los fallos que tenía sólo aparecían encadenando pulsaciones, así que las
 * pruebas trabajan sobre secuencias completas, como las teclearía el usuario.
 */
function calculadora(decimals = 0, allowNegative = false) {
  const calc = useCalculator({
    decimals: ref(decimals),
    allowNegative: ref(allowNegative),
  })

  /** Teclea una secuencia: dígitos, operadores, '=', ',' y 'b' (borrar). */
  const teclear = (secuencia: string) => {
    for (const tecla of secuencia.replace(/\s/g, '')) {
      if (tecla >= '0' && tecla <= '9') calc.press(tecla)
      else if (tecla === ',') calc.pressDecimal()
      else if (tecla === '=') calc.pressEquals()
      else if (tecla === 'b') calc.backspace()
      else if (tecla === 's') calc.toggleSign()
      else calc.pressOp(tecla as CalculatorOperator)
    }

    return calc
  }

  return { calc, teclear }
}

describe('useCalculator', () => {
  it('resuelve una operación simple', () => {
    const { calc, teclear } = calculadora()

    teclear('12*30=')

    expect(calc.display.value).toBe('360')
    expect(calc.value()).toBe(360)
  })

  it('encadena una operación después de "="', () => {
    // El bug original: "=" deja el operador en null, así que el siguiente
    // operador entraba por la rama que hacía `prev = parseFloat('')` y el
    // resultado acumulado se perdía. 12 × 30 = 360, + 5 = daba 5 en vez de 365.
    const { calc, teclear } = calculadora()

    teclear('12*30=')
    expect(calc.value()).toBe(360)

    teclear('+5=')
    expect(calc.value()).toBe(365)
  })

  it('encadena varias operaciones seguidas sin "="', () => {
    const { calc, teclear } = calculadora()

    teclear('2*3*4=')

    expect(calc.value()).toBe(24)
  })

  it('corregir el operador conserva el acumulado', () => {
    // "12 ×" y el usuario se equivocó: al pulsar "÷" se perdía el 12.
    const { calc, teclear } = calculadora()

    teclear('12*')
    teclear('/')
    teclear('4=')

    expect(calc.value()).toBe(3)
  })

  it('guarda el número escrito si se confirma con un operador pendiente', () => {
    // "12 ×" + Listo devolvía 0, porque se leía un operando vacío.
    const { calc, teclear } = calculadora()

    teclear('12*')

    expect(calc.value()).toBe(12)
  })

  it('deja la operación pendiente si se pulsa "=" sin segundo operando', () => {
    // "12 × =" devolvía 0 al usar 0 como segundo operando.
    const { calc, teclear } = calculadora()

    teclear('12*=')

    expect(calc.value()).toBe(12)
    expect(calc.op.value).toBe('*')
  })

  it('un dígito después de "=" empieza un cálculo nuevo', () => {
    const { calc, teclear } = calculadora()

    teclear('12*30=')
    teclear('7')

    expect(calc.display.value).toBe('7')
    expect(calc.value()).toBe(7)
  })

  it('muestra el acumulado mientras hay un operador pendiente', () => {
    // Antes mostraba "0" y parecía que el número tecleado se había borrado.
    const { calc, teclear } = calculadora()

    teclear('12*')

    expect(calc.display.value).toBe('12')
    expect(calc.expression.value).toBe('12 ×')
  })

  it('borrar cancela un operador pulsado por error', () => {
    const { calc, teclear } = calculadora()

    teclear('12*')
    teclear('b')

    expect(calc.op.value).toBeNull()
    expect(calc.value()).toBe(12)
  })

  it('borrar después de "=" limpia todo', () => {
    const { calc, teclear } = calculadora()

    teclear('12*30=')
    teclear('b')

    expect(calc.display.value).toBe('0')
    expect(calc.value()).toBe(0)
  })

  it('no divide por cero', () => {
    const { calc, teclear } = calculadora()

    teclear('12/0=')

    expect(calc.value()).toBe(0)
  })

  describe('sin decimales (huevos, gallinas, dinero)', () => {
    it('redondea el resultado de una división', () => {
      const { calc, teclear } = calculadora(0)

      teclear('100/8=')

      // 12,5 → 13. El redondeo se aplica una vez al confirmar, no en cada paso.
      expect(calc.value()).toBe(13)
    })

    it('ignora la tecla de coma', () => {
      const { calc, teclear } = calculadora(0)

      teclear('12,5')

      expect(calc.value()).toBe(125)
    })

    it('nunca devuelve un valor negativo', () => {
      const { calc, teclear } = calculadora(0)

      teclear('5-8=')

      expect(calc.value()).toBe(0)
    })
  })

  describe('con dos decimales (kilos de alimento)', () => {
    it('acepta una coma decimal', () => {
      const { calc, teclear } = calculadora(2)

      teclear('40,5')

      expect(calc.display.value).toBe('40.5')
      expect(calc.value()).toBe(40.5)
    })

    it('no admite más decimales de los que guarda la columna', () => {
      const { calc, teclear } = calculadora(2)

      teclear('1,999')

      expect(calc.value()).toBe(1.99)
    })

    it('conserva los decimales de una división', () => {
      const { calc, teclear } = calculadora(2)

      teclear('100/8=')

      expect(calc.value()).toBe(12.5)
    })

    it('sólo permite una coma', () => {
      const { calc, teclear } = calculadora(2)

      teclear('1,2,3')

      expect(calc.value()).toBe(1.23)
    })

    it('una coma al inicio arranca en cero', () => {
      const { calc, teclear } = calculadora(2)

      teclear(',5')

      expect(calc.display.value).toBe('0.5')
      expect(calc.value()).toBe(0.5)
    })
  })

  describe('con signo (ajustes de inventario)', () => {
    it('permite valores negativos', () => {
      const { calc, teclear } = calculadora(0, true)

      teclear('12s')

      expect(calc.value()).toBe(-12)
    })

    it('el cambio de signo es reversible', () => {
      const { calc, teclear } = calculadora(0, true)

      teclear('12ss')

      expect(calc.value()).toBe(12)
    })
  })

  describe('entrada de datos', () => {
    it('ignora ceros a la izquierda', () => {
      const { calc, teclear } = calculadora()

      teclear('007')

      expect(calc.display.value).toBe('7')
    })

    it('se puede escribir cero', () => {
      // La guarda contra "007" descartaba el 0 con el campo vacío, así que el
      // valor 0 no se podía teclear: ni poner una categoría a 0 huevos, ni un
      // costo en 0, ni usar el 0 como segundo operando.
      const { calc, teclear } = calculadora()

      teclear('0')

      expect(calc.display.value).toBe('0')
      expect(calc.value()).toBe(0)
    })

    it('el primer dígito sustituye el valor precargado', () => {
      // El teclado se abre con el valor actual. Si el dígito se añadiera, con
      // 360 dentro teclear un 0 daría 3600: la cantidad se multiplicaba por diez
      // sin que el usuario lo notara, y la tarjeta dice "toca para escribir".
      const { calc } = calculadora()

      calc.load(360)
      calc.press('0')

      expect(calc.display.value).toBe('0')
      expect(calc.value()).toBe(0)
    })

    it('se puede corregir el valor precargado dígito a dígito', () => {
      const { calc } = calculadora()

      calc.load(360)
      calc.backspace()
      calc.press('5')

      expect(calc.display.value).toBe('365')
    })

    it('operar sobre el valor precargado lo usa como operando', () => {
      const { calc, teclear } = calculadora()

      calc.load(360)
      teclear('+5=')

      expect(calc.value()).toBe(365)
    })

    it('el segundo dígito sí se añade', () => {
      const { calc } = calculadora()

      calc.load(360)
      calc.press('1')
      calc.press('2')

      expect(calc.display.value).toBe('12')
    })

    it('un cero como segundo operando se admite', () => {
      const { calc, teclear } = calculadora()

      teclear('5-0=')

      expect(calc.value()).toBe(5)
    })

    it('la tecla 00 con el campo vacío vale cero, no "00"', () => {
      const { calc } = calculadora()

      calc.press('00')

      expect(calc.display.value).toBe('0')
    })

    it('un dígito sustituye al cero inicial', () => {
      const { calc } = calculadora()

      calc.press('0')
      calc.press('5')

      expect(calc.display.value).toBe('5')
    })

    it('acota la cantidad de dígitos', () => {
      const { calc, teclear } = calculadora()

      teclear('1234567890123')

      expect(calc.display.value).toBe('123456789')
    })

    it('carga el valor actual al abrirse', () => {
      const { calc } = calculadora(2)

      calc.load(40.5)

      expect(calc.display.value).toBe('40.5')
    })

    it('un valor de cero deja el teclado vacío', () => {
      const { calc } = calculadora()

      calc.load(0)

      expect(calc.display.value).toBe('0')
      expect(calc.current.value).toBe('')
    })
  })
})
