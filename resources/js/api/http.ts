import axios, { type AxiosInstance } from 'axios'

/**
 * Catálogo del backend con id numérico + local_uuid opcional (para mapear).
 */
export interface BootCatalog {
  id: number
  local_uuid?: string | null
  name: string
  [key: string]: unknown
}

export interface FarmPayload {
  id: number
  name: string
  owner_name?: string | null
  phone?: string | null
  country?: string
  timezone?: string
  locale?: string
  currency?: string
  period_lock_days: number
}

export interface BootPayload {
  farm: FarmPayload
  pens: BootCatalog[]
  egg_categories: BootCatalog[]
  presentations: BootCatalog[]
  mortality_causes: BootCatalog[]
  feed_types: BootCatalog[]
}

export interface SessionPayload {
  token: string
  user: { id: number; name: string; username: string; role?: string }
  role?: string
  farm: FarmPayload
  boot: BootPayload
}

/** Catálogos locales que se envían al registrar, para que el servidor siembre los mismos. */
export interface CatalogSeed {
  pens?: Array<Record<string, unknown>>
  egg_categories?: Array<Record<string, unknown>>
  mortality_causes?: Array<Record<string, unknown>>
  presentations?: Array<Record<string, unknown>>
  feed_types?: Array<Record<string, unknown>>
}

export interface SyncPushItem {
  entity: string
  action: 'create' | 'update' | 'delete'
  local_uuid: string
  payload: Record<string, unknown>
}

export interface SyncPushResult {
  applied: Array<{ entity: string; local_uuid: string; id?: number; action: string }>
  errors: Array<{
    local_uuid: string
    entity: string
    /** true = no tiene sentido reintentarlo (el servidor rechazó los datos). */
    permanent: boolean
    message: string
  }>
}

export interface SyncPullResult {
  server_time: string
  truncated: boolean
  data: Record<string, Array<Record<string, unknown>>>
}

/**
 * Cliente HTTP de Mi Gallinero.
 *
 * - Base URL `/api` (mismo origen que la SPA).
 * - Token Sanctum en localStorage.
 * - Cabecera `X-Farm-Id` con el id REMOTO de la granja activa: el id local es
 *   un UUID y el backend espera el entero.
 */
const TOKEN_KEY = 'mg_token'
const FARMID_KEY = 'mg_active_farm_id'
const AUTH_KEY = 'mg_auth'

const http: AxiosInstance = axios.create({
  baseURL: '/api',
  headers: { Accept: 'application/json' },
  timeout: 20_000,
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const farmId = localStorage.getItem(FARMID_KEY)
  if (farmId) {
    config.headers['X-Farm-Id'] = farmId
  }
  return config
})

/**
 * Suscriptores a la expiración de sesión.
 *
 * Antes el interceptor borraba `mg_token` pero dejaba `mg_auth`, así que el
 * store seguía creyendo que había sesión y toda petición posterior daba 401 en
 * bucle. Ahora se avisa al store para que limpie su estado de una vez.
 */
type UnauthorizedHandler = () => void
const unauthorizedHandlers = new Set<UnauthorizedHandler>()

export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandlers.add(handler)

  return () => {
    unauthorizedHandlers.delete(handler)
  }
}

http.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(FARMID_KEY)
      localStorage.removeItem(AUTH_KEY)
      unauthorizedHandlers.forEach((handler) => handler())
    }
    return Promise.reject(error)
  },
)

/** True si el fallo es de red o servidor caído (reintentable), no de los datos. */
export function isNetworkError(error: unknown): boolean {
  const err = error as { response?: unknown; code?: string }

  return !err?.response || err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK'
}

/**
 * Mensaje legible de un error de la API.
 *
 * Antes cada vista improvisaba: el login convertía cualquier respuesta con
 * status (incluido un 500 o un 403) en "Usuario o contraseña incorrectos", y el
 * registro decidía si estaba offline con una expresión regular sobre el texto
 * del error.
 */
export function apiErrorMessage(error: unknown, fallback = 'Algo no salió bien'): string {
  const err = error as {
    response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]> } }
    message?: string
  }

  if (isNetworkError(error)) return 'Sin conexión con el servidor'

  if (err.response?.status === 429) {
    return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
  }

  const firstFieldError = Object.values(err.response?.data?.errors ?? {})[0]?.[0]

  return err.response?.data?.message ?? firstFieldError ?? err.message ?? fallback
}

export const api = {
  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token)
  },
  clearToken() {
    localStorage.removeItem(TOKEN_KEY)
  },
  setActiveFarm(remoteId: number | string) {
    localStorage.setItem(FARMID_KEY, String(remoteId))
  },
  clearActiveFarm() {
    localStorage.removeItem(FARMID_KEY)
  },
  hasToken(): boolean {
    return !!localStorage.getItem(TOKEN_KEY)
  },

  /** Registro: crea usuario + granja y siembra los catálogos que ya existen en local. */
  async register(payload: {
    name: string
    username: string
    password: string
    farm_name: string
    currency?: string
    country?: string
    timezone?: string
    locale?: string
    period_lock_days?: number
    phone?: string
    catalogs?: CatalogSeed
  }) {
    const { data } = await http.post('/auth/register', payload)

    return data as SessionPayload
  },

  async login(username: string, password: string) {
    const { data } = await http.post('/auth/login', { username, password })

    return data as SessionPayload
  },

  /** Actualiza la configuración de la granja activa (asistente + ajustes). */
  async updateFarm(patch: Record<string, unknown>) {
    const { data } = await http.put('/farm', patch)

    return data as { farm: FarmPayload; boot: BootPayload }
  },

  async me() {
    const { data } = await http.get('/auth/me')

    return data as { user: SessionPayload['user']; farm: FarmPayload; role?: string }
  },

  /** Snapshot de catálogos de la granja activa (mapea local_uuid → id numérico). */
  async boot() {
    const { data } = await http.get('/auth/boot')

    return data as BootPayload
  },

  async logout() {
    try {
      await http.post('/auth/logout')
    } catch {
      /* cerrar la sesión en local es lo que importa */
    }
  },

  async changePassword(currentPassword: string, password: string, passwordConfirmation: string) {
    await http.post('/auth/password', {
      current_password: currentPassword,
      password,
      password_confirmation: passwordConfirmation,
    })
  },

  async setPin(pin: string, currentPassword: string) {
    await http.post('/auth/pin', { pin, current_password: currentPassword })
  },

  /** Verifica el PIN del admin contra el servidor. */
  async verifyPin(pin: string) {
    const { data } = await http.post('/auth/pin/verify', { pin })

    return data as { valid: boolean; message?: string }
  },

  /** Resumen del Home */
  async dashboardSummary(penRemoteId?: number) {
    const { data } = await http.get('/dashboard/summary', {
      params: penRemoteId ? { pen: penRemoteId } : undefined,
    })

    return data as {
      today_eggs: number
      alive_chickens: number
      pending_debt: number
      next_vaccine: unknown
      overdue_vaccine: unknown
      timezone: string
    }
  },

  /** Subida idempotente de la cola de sincronización. */
  async syncPush(items: SyncPushItem[]) {
    const { data } = await http.post('/sync/push', { items })

    return data as SyncPushResult
  },

  /** Descarga de los datos de la granja (reconstruye la base local). */
  async syncPull(params: { since?: string; entities?: string[]; limit?: number } = {}) {
    const { data } = await http.get('/sync/pull', { params })

    return data as SyncPullResult
  },
}
