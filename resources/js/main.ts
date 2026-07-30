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
app.use(router)

// Restaurar sesión y granja activa antes de montar (offline-first).
const auth = useAuthStore()
const farm = useFarmStore()
const sync = useSyncStore()
auth.restore()
// Validar el token contra el backend: si sigue válido, el usuario entra
// directo sin volver a loguear. Si expiró, se limpia y el router manda a
// /welcome. Si no hay red, se mantiene la sesión local (offline-first).
void auth.validateSession().finally(() => {
  void farm.init().then(() => {
    sync.setupListeners()
    sync.refreshPending()
  })
})
app.mount('#app')
