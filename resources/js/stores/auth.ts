import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Role, User } from '@/types/domain'
import { api, apiErrorMessage, isNetworkError, onUnauthorized, type CatalogSeed } from '@/api/http'
import { uuid } from '@/utils/format'

const AUTH_KEY = 'mg_auth'

/**
 * Autenticación.
 *
 * Dos modos:
 *  - **Backend activo**: register/login llaman a `/api/auth/*` (Sanctum) y
 *    guardan el token y la granja activa para las siguientes peticiones.
 *  - **Offline**: si la API no responde (zona rural sin cobertura) se crea un
 *    usuario local y la granja vive en Dexie. Al recuperar la conexión se puede
 *    vincular con `linkAccount()`.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string>('')
  /** Rol EN LA GRANJA activa: es el que aplica los permisos en el servidor. */
  const farmRole = ref<Role | null>(null)
  /** True cuando la sesión está respaldada por el backend (Sanctum). */
  const hasBackendSession = ref<boolean>(false)

  const isLoggedIn = computed(() => !!user.value)
  const role = computed<Role | null>(() => farmRole.value ?? user.value?.role ?? null)
  const isAdmin = computed(() => role.value === 'admin')
  const canSell = computed(() => role.value === 'admin' || role.value === 'vendedor')

  /** Usuario local cuando no hay backend disponible. */
  function loginLocal(name: string, userRole: Role = 'admin') {
    user.value = {
      id: uuid(),
      name,
      username: name.toLowerCase().replace(/\s+/g, ''),
      role: userRole,
    }
    token.value = ''
    farmRole.value = userRole
    hasBackendSession.value = false
    persist()
  }

  /**
   * Registro contra el backend. `catalogs` son los catálogos que el cliente ya
   * creó en local, para que el servidor siembre exactamente los mismos y el
   * emparejamiento posterior sea por UUID y no por nombre.
   */
  async function register(payload: {
    name: string
    username: string
    password: string
    farmName: string
    currency?: string
    country?: string
    timezone?: string
    locale?: string
    periodLockDays?: number
    phone?: string
    catalogs?: CatalogSeed
  }) {
    const data = await api.register({
      name: payload.name,
      username: payload.username,
      password: payload.password,
      farm_name: payload.farmName,
      currency: payload.currency,
      country: payload.country,
      timezone: payload.timezone,
      locale: payload.locale,
      period_lock_days: payload.periodLockDays,
      phone: payload.phone,
      catalogs: payload.catalogs,
    })

    applySession(data.token, {
      id: String(data.user.id),
      name: data.user.name ?? payload.name,
      username: data.user.username ?? payload.username,
      role: (data.role as Role) ?? 'admin',
    })

    farmRole.value = (data.role as Role) ?? 'admin'
    api.setActiveFarm(data.farm.id)
    hasBackendSession.value = true
    persist()

    return data
  }

  /** Login con usuario y contraseña. */
  async function login(username: string, password: string) {
    const data = await api.login(username, password)

    applySession(data.token, {
      id: String(data.user.id),
      name: data.user.name,
      username: data.user.username,
      role: (data.role as Role) ?? 'admin',
    })

    farmRole.value = (data.role as Role) ?? 'admin'
    api.setActiveFarm(data.farm.id)
    hasBackendSession.value = true
    persist()

    return data
  }

  /** Cierra la sesión en el servidor (si la hay) y limpia el estado local. */
  async function logout() {
    if (hasBackendSession.value) {
      await api.logout()
    }

    clearSession()
  }

  function clearSession() {
    user.value = null
    token.value = ''
    farmRole.value = null
    hasBackendSession.value = false
    api.clearToken()
    api.clearActiveFarm()
    localStorage.removeItem(AUTH_KEY)
  }

  function applySession(t: string, u: User) {
    token.value = t
    user.value = u
    api.setToken(t)
  }

  function persist() {
    if (!user.value) return

    localStorage.setItem(
      AUTH_KEY,
      JSON.stringify({
        user: user.value,
        token: token.value,
        backend: hasBackendSession.value,
        farmRole: farmRole.value,
      }),
    )
  }

  function restore(): boolean {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return false

    try {
      const parsed = JSON.parse(raw) as {
        user: User
        token: string
        backend?: boolean
        farmRole?: Role
      }

      if (!parsed?.user) return false

      user.value = parsed.user
      token.value = parsed.token ?? ''
      hasBackendSession.value = parsed.backend ?? false
      farmRole.value = parsed.farmRole ?? parsed.user.role ?? null

      if (hasBackendSession.value && parsed.token) {
        api.setToken(parsed.token)
      }

      return true
    } catch {
      return false
    }
  }

  /**
   * Valida el token guardado contra `/auth/me`.
   *  - 200 → sesión válida, refresca usuario y rol.
   *  - 401 → token expirado o revocado: el interceptor ya limpió; devolvemos false.
   *  - sin red → mantiene la sesión local (offline-first).
   */
  async function validateSession(): Promise<boolean> {
    if (!hasBackendSession.value || !token.value) return !!user.value

    try {
      const data = await api.me()

      if (data.user) {
        user.value = {
          id: String(data.user.id),
          name: data.user.name,
          username: data.user.username,
          role: (data.role as Role) ?? 'admin',
        }
        farmRole.value = (data.role as Role) ?? 'admin'
        persist()
      }

      return true
    } catch (e) {
      if (isNetworkError(e)) return !!user.value

      return false
    }
  }

  /**
   * Vincula una granja creada offline con una cuenta nueva del backend.
   * Envía los catálogos locales para que no se dupliquen en el servidor.
   */
  async function linkAccount(payload: Parameters<typeof register>[0]) {
    return register(payload)
  }

  /** Mensaje legible para la interfaz a partir de un error de la API. */
  function describeError(error: unknown, fallback?: string): string {
    return apiErrorMessage(error, fallback)
  }

  // Si el token caduca a media sesión limpiamos también el estado en memoria:
  // antes el interceptor borraba `mg_token` pero el store seguía creyendo que
  // había sesión, y cada petición posterior daba 401 en bucle.
  onUnauthorized(() => {
    user.value = null
    token.value = ''
    farmRole.value = null
    hasBackendSession.value = false
  })

  return {
    user,
    token,
    farmRole,
    hasBackendSession,
    isLoggedIn,
    role,
    isAdmin,
    canSell,
    loginLocal,
    register,
    login,
    logout,
    clearSession,
    restore,
    validateSession,
    linkAccount,
    describeError,
  }
})
