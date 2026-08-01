import { onUnmounted, ref } from 'vue'
import { db } from '@/db/db'
import { nowISO, uuid } from '@/utils/format'

/**
 * Captura una foto de la cámara (o del carrete), la comprime a JPEG y la guarda
 * como Blob REAL en IndexedDB.
 *
 * Antes se guardaba `URL.createObjectURL(blob)` dentro del registro. Un `blob:`
 * URL sólo vive mientras la página está abierta: al recargar la app la evidencia
 * quedaba como imagen rota, y el Blob no se había guardado en ningún sitio, así
 * que la foto se perdía siempre.
 *
 * Ahora el registro guarda `photoPath = "local:<uuid>"` y la tabla `photos`
 * guarda el Blob, para poder mostrarlo tras recargar y subirlo más adelante.
 */
export function usePhoto() {
  const previewUrl = ref<string>('')
  const blob = ref<Blob | null>(null)
  const busy = ref(false)
  const error = ref<string>('')

  /** ObjectURLs creados aquí, para revocarlos al desmontar (antes se filtraban). */
  const createdUrls = new Set<string>()

  /** Tope de entrada antes de comprimir: una foto de 40 MP tumba un móvil básico. */
  const MAX_INPUT_BYTES = 25 * 1024 * 1024

  function trackUrl(url: string): string {
    createdUrls.add(url)

    return url
  }

  function revoke(url: string): void {
    if (!url) return
    URL.revokeObjectURL(url)
    createdUrls.delete(url)
  }

  function pick(): Promise<void> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      // `capture="environment"` abre la cámara trasera en Android/iOS.
      input.setAttribute('capture', 'environment')

      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }

      input.onchange = async () => {
        const file = input.files?.[0]
        if (file) await process(file)
        finish()
      }

      // Si el usuario cancela, algunos navegadores no disparan `change`;
      // resolvemos al recuperar el foco para no dejar la promesa colgada.
      window.addEventListener('focus', () => window.setTimeout(finish, 500), { once: true })

      input.click()
    })
  }

  /**
   * Comprime la imagen a JPEG con Canvas.
   * `toBlob` es asíncrono: antes `process()` resolvía antes del callback, así que
   * quien hacía `await pick()` leía `blob` todavía vacío.
   */
  async function process(file: File, maxWidth = 1024): Promise<void> {
    error.value = ''

    if (!file.type.startsWith('image/')) {
      error.value = 'El archivo no es una imagen'

      return
    }

    if (file.size > MAX_INPUT_BYTES) {
      error.value = 'La imagen es demasiado grande'

      return
    }

    busy.value = true
    const sourceUrl = trackUrl(URL.createObjectURL(file))

    try {
      const img = await loadImg(sourceUrl)
      const scale = Math.min(1, maxWidth / img.width)

      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))

      const ctx = canvas.getContext('2d')

      if (!ctx) {
        setBlob(file)

        return
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      setBlob((await toBlob(canvas, 'image/jpeg', 0.8)) ?? file)
    } catch {
      error.value = 'No se pudo procesar la imagen'
    } finally {
      revoke(sourceUrl)
      busy.value = false
    }
  }

  function setBlob(value: Blob): void {
    if (previewUrl.value) revoke(previewUrl.value)

    blob.value = value
    previewUrl.value = trackUrl(URL.createObjectURL(value))
  }

  function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
  }

  function loadImg(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
  }

  /**
   * Guarda la foto capturada y devuelve la referencia a persistir en el registro
   * (`local:<uuid>`), o undefined si no hay foto.
   */
  async function persist(farmId: string): Promise<string | undefined> {
    if (!blob.value || !farmId) return undefined

    const id = uuid()

    await db.photos.put({
      localUuid: id,
      farmId,
      blob: blob.value,
      mime: blob.value.type || 'image/jpeg',
      createdAt: nowISO(),
      pendingUpload: true,
    })

    return `local:${id}`
  }

  function clear() {
    if (previewUrl.value) revoke(previewUrl.value)
    previewUrl.value = ''
    blob.value = null
    error.value = ''
  }

  onUnmounted(() => {
    createdUrls.forEach((url) => URL.revokeObjectURL(url))
    createdUrls.clear()
  })

  return { previewUrl, blob, busy, error, pick, process, persist, clear }
}

/**
 * Resuelve una referencia `local:<uuid>` a un ObjectURL mostrable.
 * Devuelve también cómo revocarlo cuando el componente se desmonte.
 */
export async function resolvePhotoUrl(
  reference: string | undefined,
): Promise<{ url: string; revoke: () => void } | null> {
  if (!reference?.startsWith('local:')) return null

  const record = await db.photos.get(reference.slice('local:'.length))
  if (!record) return null

  const url = URL.createObjectURL(record.blob)

  return { url, revoke: () => URL.revokeObjectURL(url) }
}
