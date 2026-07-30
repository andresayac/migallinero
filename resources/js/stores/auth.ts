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
   */
  async function register(name: string, username: string, password: string, farmName: string) {
    try {
      const data = await api.register(name, username, password, farmName)
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
  }
})

function uuid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
}
