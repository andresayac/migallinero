import { reactive } from 'vue'

type DialogKind = 'prompt' | 'confirm'

interface DialogState {
  open: boolean
  kind: DialogKind
  title: string
  label: string
  defaultValue: string
  confirmLabel: string
  danger: boolean
  inputMode: 'text' | 'numeric' | 'decimal'
  resolve?: (value: string | null) => void
}

const state = reactive<DialogState>({
  open: false,
  kind: 'prompt',
  title: '',
  label: '',
  defaultValue: '',
  confirmLabel: 'Guardar',
  danger: false,
  inputMode: 'text',
})

/** Cola de diálogos pendientes, para no perder ninguna promesa. */
const queue: Array<() => void> = []

/**
 * Diálogos modales reutilizables (`prompt` y `confirm`), renderizados una sola
 * vez desde App.vue con `<DialogHost />`.
 *
 * Dos problemas corregidos:
 *  - Un `prompt` con el campo vacío se interpretaba como cancelar, porque el
 *    host convertía la cadena vacía en null.
 *  - Dos llamadas concurrentes sobreescribían `state.resolve`, así que la
 *    primera promesa nunca se resolvía y dejaba la vista esperando para
 *    siempre. Ahora se encolan.
 */
export function useDialog() {
  function open(config: Partial<DialogState>, kind: DialogKind): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      const show = () => {
        state.open = true
        state.kind = kind
        state.title = config.title ?? ''
        state.label = config.label ?? ''
        state.defaultValue = config.defaultValue ?? ''
        state.confirmLabel = config.confirmLabel ?? (kind === 'confirm' ? 'Sí, confirmar' : 'Guardar')
        state.danger = config.danger ?? false
        state.inputMode = config.inputMode ?? 'text'
        state.resolve = resolve
      }

      if (state.open) {
        queue.push(show)
      } else {
        show()
      }
    })
  }

  function prompt(opts: {
    title: string
    label: string
    defaultValue?: string
    confirmLabel?: string
    inputMode?: DialogState['inputMode']
  }): Promise<string | null> {
    return open(opts, 'prompt')
  }

  async function confirm(opts: {
    title: string
    message: string
    confirmLabel?: string
    danger?: boolean
  }): Promise<boolean> {
    const answer = await open(
      {
        title: opts.title,
        label: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Sí, confirmar',
        danger: opts.danger,
      },
      'confirm',
    )

    return answer !== null
  }

  /** Lo llama el host: `value = null` significa cancelar. */
  function _answer(value: string | null) {
    const resolve = state.resolve

    state.open = false
    state.resolve = undefined
    resolve?.(value)

    const next = queue.shift()
    if (next) next()
  }

  return { state, prompt, confirm, _answer }
}
