import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, Role } from '@/types/domain'
import { api } from '@/api/http'

/**
 * Autenticación.
 *
 * Hay dos modos:
 *  - **Backend activo**: register/login llaman a `/api/auth/*` (Sanctum),
 *    guardan el token y la granja activa para futuras peticiones.
 *  - **Offline / sin backend**: si la API no responde (modo demo rural sin
 *    servidor), se crea un usuario local y la granja queda en Dexie. Todo
 *    funciona offline-first y la sync subirá los datos cuando haya backend.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string>('')
  /** True cuando el login se hizo contra el backend real (Sanctum). */
  const hasBackendSession = ref<boolean>(false)

  const isLoggedIn = computed(() => !!user.value)
  const role = computed<Role | null>(() => user.value?.role ?? null)
  const isAdmin = computed(() => role.value === 'admin')

  /** Usuario demo local cuando no hay backend disponible. */
  function loginLocal(name: string, role: Role = 'admin') {
    user.value = {
      id: uuid(),
      name,
      username: name.toLowerCase().replace(/\s+/g, ''),
      role,
    }
    token.value = 'local-demo-token'
    hasBackendSession.value = false
    persist()
  }

  /**
   * Registro real: crea usuario + granja en el backend y guarda la sesión.
   * Lanza error con `message` legible si falla (lo captura el componente).
   *
   * `setup` es la configuración opcional del asistente guiado (moneda, candado…).
   */
  async function register(
    name: string,
    username: string,
    password: string,
    farmName: string,
    setup?: {
      currency?: string
      country?: string
      timezone?: string
      locale?: string
      period_lock_days?: number
      phone?: string
    },
  ) {
    try {
      const data = await api.register(name, username, password, farmName, setup)
      applySession(data.token, {
        id: String((data.user as { id: number }).id),
        name,
        username,
        role: 'admin',
      })
      api.setActiveFarm(data.farm.id)
      hasBackendSession.value = true
      return data
    } catch (e) {
      const err = e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } }; message?: string }
      const msg = err.response?.data?.message
        ?? Object.values(err.response?.data?.errors ?? {})[0]?.[0]
        ?? err.message
        ?? 'No se pudo conectar con el servidor'
      throw new Error(msg)
    }
  }

  /** Login real con username/contraseña. */
  async function login(username: string, password: string) {
    try {
      const data = await api.login(username, password)
      const u = data.user as { id: number; name: string; username: string; role: Role }
      applySession(data.token, {
        id: String(u.id),
        name: u.name,
        username: u.username,
        role: u.role ?? 'admin',
      })
      api.setActiveFarm(data.farm.id)
      hasBackendSession.value = true
      return data
    } catch (e) {
      // Si el backend responde 401/422, no es un problema de red: relanzamos.
      const err = e as { response?: { status?: number }; message?: string }
      if (err.response?.status) {
        throw new Error('Usuario o contraseña incorrectos')
      }
      // Sin backend: caemos a login local (modo rural).
      throw new Error(err.message ?? 'No se pudo conectar con el servidor')
    }
  }

  async function logout() {
    if (hasBackendSession.value) {
      await api.logout()
      api.clearToken()
      api.clearActiveFarm()
    }
    user.value = null
    token.value = ''
    hasBackendSession.value = false
    localStorage.removeItem('mg_auth')
  }

  function applySession(t: string, u: User) {
    token.value = t
    user.value = u
    api.setToken(t)
    persist()
  }

  function persist() {
    if (user.value) {
      localStorage.setItem('mg_auth', JSON.stringify({
        user: user.value,
        token: token.value,
        backend: hasBackendSession.value,
      }))
    }
  }

  function restore(): boolean {
    const raw = localStorage.getItem('mg_auth')
    if (!raw) return false
    try {
      const parsed = JSON.parse(raw) as { user: User; token: string; backend?: boolean }
      user.value = parsed.user
      token.value = parsed.token
      hasBackendSession.value = parsed.backend ?? false
      if (hasBackendSession.value && parsed.token) api.setToken(parsed.token)
      return !!user.value
    } catch {
      return false
    }
  }

  /**
   * Valida el token guardado contra el backend (/auth/me).
   * - Si responde 200 → la sesión sigue válida, refresca datos del usuario.
   * - Si responde 401 → el token expiró o se revocó: limpia y devuelve false.
   * - Si no hay red → mantiene la sesión local (offline-first) para que
   *   pueda seguir trabajando y sincronizar después.
   *
   * Devuelve true si el usuario puede entrar sin volver a loguear.
   */
  async function validateSession(): Promise<boolean> {
    if (!hasBackendSession.value || !token.value) return !!user.value
    try {
      const data = await api.me()
      // Refrescar datos del usuario por si cambiaron en el backend.
      const u = data.user as { id: number; name: string; username: string; role: Role }
      if (u) {
        user.value = {
          id: String(u.id),
          name: u.name,
          username: u.username,
          role: u.role ?? 'admin',
        }
        persist()
      }
      return true
    } catch (e) {
      const err = e as { response?: { status?: number }; message?: string }
      // 401 = token inválido/expirado → cerrar sesión silenciosamente.
      if (err.response?.status === 401) {
        user.value = null
        token.value = ''
        hasBackendSession.value = false
        api.clearToken()
        localStorage.removeItem('mg_auth')
        return false
      }
      // Error de red (sin conexión) → mantener sesión local para offline.
      return !!user.value
    }
  }

  return {
    user,
    token,
    hasBackendSession,
    isLoggedIn,
    role,
    isAdmin,
    loginLocal,
    register,
    login,
    logout,
    restore,
    validateSession,
  }
})

function uuid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
}
