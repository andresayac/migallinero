import { reactive } from 'vue'

interface PromptState {
  open: boolean
  title: string
  label: string
  defaultValue: string
  resolve?: (value: string | null) => void
}

const state = reactive<PromptState>({
  open: false,
  title: '',
  label: '',
  defaultValue: '',
})

/**
 * Diálogo modal simple para inputs text (renombrar, confirmar texto, etc.).
 * Se renderiza una sola vez desde el root App.vue mediante el componente
 * <DialogHost /> para evitar duplicar lógica en cada pantalla.
 */
export function useDialog() {
  function prompt(opts: { title: string; label: string; defaultValue?: string }): Promise<string | null> {
    state.open = true
    state.title = opts.title
    state.label = opts.label
    state.defaultValue = opts.defaultValue ?? ''
    return new Promise<string | null>((resolve) => {
      state.resolve = resolve
    })
  }

  function confirm(opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
    // Para confirm usamos prompt con marca especial; lo resolvemos en el host.
    state.open = true
    state.title = opts.title
    state.label = opts.message
    state.defaultValue = '__confirm__'
    return new Promise<boolean>((resolve) => {
      state.resolve = (val) => {
        // confirm devuelve true/false; aquí invertimosnull a false.
        resolve(val !== null)
      }
    })
  }

  function _answer(value: string | null) {
    state.open = false
    state.resolve?.(value === '' ? null : value)
    state.resolve = undefined
  }

  return { state, prompt, confirm, _answer }
}
