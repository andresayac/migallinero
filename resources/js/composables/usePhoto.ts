import { ref } from 'vue'

/**
 * Captura una foto desde la cámara del celular o un archivo existente,
 * la comprime a JPEG (máx 1024px) y la devuelve como Blob + URL de vista previa.
 *
 * Pensado para evidencia opcional en vacunas, muertes y novedades.
 * El Blob vive en IndexedDB (campo photoPath como ObjectURL temporal) y
 * se subiría al backend de forma diferida.
 */
export function usePhoto() {
  const previewUrl = ref<string>('')
  const blob = ref<Blob | null>(null)
  let input: HTMLInputElement | null = null

  function pick(): Promise<void> {
    return new Promise((resolve) => {
      input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      // `capture="environment"` abre la cámara trasera en Android/iOS.
      input.setAttribute('capture', 'environment')
      input.onchange = async () => {
        const file = input?.files?.[0]
        if (file) {
          await process(file)
        }
        resolve()
      }
      input.click()
    })
  }

  /** Comprime la imagen a JPEG con Canvas (máx maxWidth). */
  async function process(file: File, maxWidth = 1024): Promise<void> {
    const img = await loadImg(URL.createObjectURL(file))
    const scale = Math.min(1, maxWidth / img.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      // Sin canvas (raro): guardamos tal cual.
      blob.value = file
      previewUrl.value = URL.createObjectURL(file)
      return
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (b) => {
        if (b) {
          blob.value = b
          if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
          previewUrl.value = URL.createObjectURL(b)
        }
      },
      'image/jpeg',
      0.8,
    )
  }

  function loadImg(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = src
    })
  }

  function clear() {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
    blob.value = null
  }

  return { previewUrl, blob, pick, clear }
}
