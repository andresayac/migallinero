import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  type: ToastType
  message: string
}

const toasts = ref<ToastItem[]>([])
let nextId = 0

/**
 * Sistema de notificaciones global (tipo toast).
 * Pensado para confirmaciones claras y grandes, en lenguaje cotidiano:
 *   "Registro guardado correctamente", "Faltan huevos disponibles", etc.
 */
export function useToast() {
  function push(message: string, type: ToastType = 'success', timeout = 2800) {
    const id = nextId++
    toasts.value.push({ id, type, message })
    window.setTimeout(() => dismiss(id), timeout)
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return {
    toasts,
    push,
    dismiss,
    success: (m: string) => push(m, 'success'),
    error: (m: string) => push(m, 'error'),
    info: (m: string) => push(m, 'info'),
  }
}
