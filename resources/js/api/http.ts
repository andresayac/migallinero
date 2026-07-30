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

/**
 * Cliente HTTP para la API de Mi Gallinero.
 *
 * - Base URL: `/api` (Vite proxy → http://localhost:8000 en dev; en Laragon
 *   producción se sirve desde el mismo dominio).
 * - Token Sanctum persistido en localStorage.
 * - Cabecera `X-Farm-Id` con la granja activa.
 */
const TOKEN_KEY = 'mg_token'
const FARMID_KEY = 'mg_active_farm_id'

const http: AxiosInstance = axios.create({
  baseURL: '/api',
  headers: { Accept: 'application/json' },
  timeout: 20_000,
})

// Inyectar token y granja activa en cada petición.
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

// Si recibimos 401, limpiamos sesión (el router redirige a /welcome).
http.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
    }
    return Promise.reject(error)
  },
)

export const api = {
  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token)
  },
  clearToken() {
    localStorage.removeItem(TOKEN_KEY)
  },
  setActiveFarm(id: number | string) {
    localStorage.setItem(FARMID_KEY, String(id))
  },
  clearActiveFarm() {
    localStorage.removeItem(FARMID_KEY)
  },
  hasToken(): boolean {
    return !!localStorage.getItem(TOKEN_KEY)
  },

  /** Auth registro (crea granja). `setup` = configuración del asistente guiado. */
  async register(
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
    const { data } = await http.post('/auth/register', {
      name,
      username,
      password,
      farm_name: farmName,
      ...setup,
    })
    return data as { token: string; user: unknown; farm: { id: number; name: string } }
  },

  /** Actualiza la configuración de la granja activa (asistente + ajustes). */
  async updateFarm(patch: Record<string, unknown>) {
    const { data } = await http.put('/farm', patch)
    return data as {
      farm: { id: number; name: string; period_lock_days: number; currency: string }
      boot: unknown
    }
  },

  async login(username: string, password: string) {
    const { data } = await http.post('/auth/login', { username, password })
    return data as { token: string; user: unknown; farm: { id: number; name: string } }
  },

  async me() {
    const { data } = await http.get('/auth/me')
    return data
  },

  /**
   * Snapshot de catálogos de la granja activa.
   * Permite al cliente mapear UUIDs locales → ids numéricos del backend.
   */
  async boot() {
    const { data } = await http.get('/auth/boot')
    return data as {
      farm: {
        id: number
        name: string
        owner_name?: string
        phone?: string | null
        country?: string
        timezone?: string
        locale?: string
        currency?: string
        period_lock_days: number
      }
      pens: BootCatalog[]
      egg_categories: BootCatalog[]
      presentations: BootCatalog[]
      mortality_causes: BootCatalog[]
    }
  },

  async logout() {
    try {
      await http.post('/auth/logout')
    } catch {
      /* noop */
    }
  },

  /** Resumen del Home */
  async dashboardSummary(penId?: string) {
    const params = penId ? { pen: penId } : undefined
    const { data } = await http.get('/dashboard/summary', { params })
    return data as {
      today_eggs: number
      alive_chickens: number
      pending_debt: number
      next_vaccine: unknown
    }
  },

  /** Subida bulk idempotente de la cola de sincronización */
  async syncPush(
    items: Array<{
      entity: string
      action: 'create' | 'update' | 'delete'
      local_uuid: string
      payload: Record<string, unknown>
    }>,
  ) {
    const { data } = await http.post('/sync/push', { items })
    return data as {
      applied: Array<{ entity: string; local_uuid: string; id?: number; action: string }>
      errors: Array<{ local_uuid: string; entity: string; error: string }>
    }
  },

  /** Pull de catálogos/registros para llenar Dexie al login. */
  async listEntity(entity: string, perPage = 500) {
    const { data } = await http.get(`/${entity}`, { params: { per_page: perPage } })
    return data as { data: unknown[] }
  },
}
