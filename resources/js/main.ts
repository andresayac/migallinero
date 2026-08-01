import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useFarmStore } from './stores/farm'
import { useSyncStore } from './stores/sync'

// El CSS se carga vía @vite en resources/views/app.blade.php
// (resources/css/app.css = Tailwind + estilos de Mi Gallinero).

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

const auth = useAuthStore()
const farm = useFarmStore()
const sync = useSyncStore()

/**
 * Restaura la sesión ANTES de montar y de instalar el router.
 *
 * `restore()` e `init()` sólo leen localStorage e IndexedDB, así que son
 * rápidos. Antes la app se montaba de inmediato y `farm.init()` corría dentro
 * de un `.finally()` asíncrono: en el primer render `farm.isConfigured` aún era
 * false y el guard del router mandaba a `/welcome` a un usuario con sesión válida.
 */
async function bootstrap() {
  auth.restore()
  await farm.init()

  app.use(router)
  await router.isReady()
  app.mount('#app')

  // Lo que necesita red va después de montar: la app ya es usable sin conexión.
  const stillValid = await auth.validateSession()

  if (stillValid && auth.hasBackendSession && farm.isConfigured) {
    // Enlaza los catálogos locales con los ids del backend y baja lo que falte.
    await farm.mergeCatalogsFromBackend()
    await sync.pullFromServer()
  }

  sync.setupListeners()
  await sync.refreshPending()
  void sync.forceSync()
}

void bootstrap()
