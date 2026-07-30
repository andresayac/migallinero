import { ref, onMounted, type Ref } from 'vue'

/**
 * Composable para gestionar la instalación de la PWA como app nativa.
 *
 * - En Android/Chrome: captura el evento `beforeinstallprompt` y expone
 *   `canInstall` + `promptInstall()` para mostrar un botón "Instalar app".
 * - En iOS Safari: no hay API de instalación programática, así que se
 *   detecta el entorno y se guía al usuario (Compartir → "Añadir a pantalla
 *   de inicio").
 * - Si ya está instalada (`display-mode: standalone`), no se muestra nada.
 */

export interface PwaInstallState {
  canInstall: Ref<boolean>
  isInstalled: Ref<boolean>
  isIos: Ref<boolean>
  promptInstall: () => Promise<boolean>
}

let deferredPrompt: any = null
const canInstall = ref(false)
const isInstalled = ref(false)
const isIos = ref(false)

function detectInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  )
}

function detectIos() {
  const ua = window.navigator.userAgent
  const isIosDevice = /iPad|iPhone|iPod/.test(ua)
  // Excluir iPad en modo escritorio (reporta Mac)
  const isMacWithTouch = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 0
  return isIosDevice || isMacWithTouch
}

let initialized = false

function init() {
  if (initialized) return
  initialized = true

  isInstalled.value = detectInstalled()
  isIos.value = detectIos()

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    deferredPrompt = e
    canInstall.value = true
  })

  window.addEventListener('appinstalled', () => {
    canInstall.value = false
    isInstalled.value = true
    deferredPrompt = null
  })

  // Detectar si el usuario sale del modo standalone (desinstala)
  window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    isInstalled.value = e.matches
  })
}

export function usePwaInstall(): PwaInstallState {
  onMounted(init)

  async function promptInstall(): Promise<boolean> {
    if (!deferredPrompt) return false
    deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    deferredPrompt = null
    canInstall.value = false
    return choice.outcome === 'accepted'
  }

  return { canInstall, isInstalled, isIos, promptInstall }
}
