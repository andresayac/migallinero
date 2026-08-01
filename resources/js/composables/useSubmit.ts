import { ref } from 'vue'
import { useToast } from './useToast'

/**
 * Envoltorio para las acciones de guardado.
 *
 * Ninguna pantalla tenía protección contra el doble toque: en un teléfono lento
 * pulsar dos veces "Guardar" creaba dos registros distintos (cada uno con su
 * propio UUID, así que la deduplicación del backend no los detectaba).
 *
 * Además centraliza el manejo de errores: antes un fallo dejaba a la vista sin
 * avisar y con el botón habilitado.
 */
export function useSubmit() {
  const busy = ref(false)
  const toast = useToast()

  async function submit<T>(
    action: () => Promise<T>,
    options: { errorMessage?: string } = {},
  ): Promise<T | undefined> {
    if (busy.value) return undefined

    busy.value = true

    try {
      return await action()
    } catch (e) {
      console.error('[submit]', e)
      toast.error(options.errorMessage ?? `No se pudo guardar: ${(e as Error).message}`)

      return undefined
    } finally {
      busy.value = false
    }
  }

  return { busy, submit }
}
