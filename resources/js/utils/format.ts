/**
 * Utilidades de formato.
 *
 * La configuración regional (moneda, idioma, zona horaria) es POR GRANJA y la
 * elige el usuario en el asistente. Antes estaba fija en COP / es-CO /
 * America/Bogota, así que el selector de moneda del asistente no hacía nada.
 *
 * El store `farm` llama a `setRegionalConfig()` cuando carga o cambia la
 * configuración. Vive en un módulo (no en el store) para poder usarse desde
 * cualquier sitio sin crear dependencias circulares.
 */

export interface RegionalConfig {
  locale: string
  timezone: string
  currency: string
}

const FALLBACK: RegionalConfig = {
  locale: 'es-CO',
  timezone: 'America/Bogota',
  currency: 'COP',
}

let config: RegionalConfig = { ...FALLBACK }

/** Aplica la configuración regional de la granja activa. */
export function setRegionalConfig(patch: Partial<RegionalConfig>): void {
  const next = { ...config, ...patch }

  config = {
    locale: isValidLocale(next.locale) ? next.locale : FALLBACK.locale,
    timezone: isValidTimezone(next.timezone) ? next.timezone : FALLBACK.timezone,
    currency: /^[A-Za-z]{3}$/.test(next.currency) ? next.currency.toUpperCase() : FALLBACK.currency,
  }
}

export function regionalConfig(): RegionalConfig {
  return { ...config }
}

function isValidLocale(locale: string): boolean {
  try {
    return new Intl.Locale(locale).language.length > 0
  } catch {
    return false
  }
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/**
 * UUID v4.
 *
 * `crypto.randomUUID` sólo existe en contextos seguros (HTTPS o localhost); en
 * una red rural por HTTP plano no está disponible. Antes se caía directo a
 * Math.random, que no es adecuado para una clave de deduplicación: aquí usamos
 * `crypto.getRandomValues` como paso intermedio.
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'))

    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join(''),
    ].join('-')
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Fecha y hora actual ISO (se persiste automáticamente en cada registro). */
export function nowISO(): string {
  return new Date().toISOString()
}

/** Formatea una fecha según la configuración de la granja: "mié 29 jul 2026". */
export function fmtDate(iso: string): string {
  return safeFormat(iso, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Formatea fecha + hora: "mié 29 jul 2026 10:24". */
export function fmtDateTime(iso: string): string {
  return safeFormat(iso, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Formatea como hora: "10:24 AM". */
export function fmtTime(iso: string): string {
  return safeFormat(iso, { hour: '2-digit', minute: '2-digit' })
}

function safeFormat(iso: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(iso)

  // Mostrar "Invalid Date" a un usuario no dice nada; un guion sí.
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat(config.locale, {
    ...options,
    timeZone: config.timezone,
  }).format(date)
}

/**
 * Formatea dinero en la moneda de la granja, sin decimales.
 * 240000 → "$ 240.000" (COP), "$240,000" (USD), etc.
 */
export function fmtMoney(value: number): string {
  const amount = Number.isFinite(value) ? value : 0

  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Alias histórico de `fmtMoney`.
 * @deprecated El nombre da a entender que siempre son pesos colombianos.
 */
export const fmtCOP = fmtMoney

/** Formatea una cantidad (huevos, gallinas, kg) con separador de miles. */
export function fmtNumber(value: number, maximumFractionDigits = 0): string {
  const amount = Number.isFinite(value) ? value : 0

  return new Intl.NumberFormat(config.locale, { maximumFractionDigits }).format(amount)
}

/** Días transcurridos desde una fecha. */
export function daysSince(iso: string): number {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return 0

  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000))
}

/**
 * Redondea a entero de la moneda (sin centavos).
 * El dinero se mantiene como entero para no acumular error de coma flotante al
 * sumar cientos de líneas.
 */
export function toMoney(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0
}

/** @deprecated Usa toMoney. */
export const toCOP = toMoney

/**
 * Clave de día (YYYY-MM-DD) de un instante, EN LA ZONA HORARIA DE LA GRANJA.
 *
 * Es la pieza que faltaba en los reportes: se mezclaba `date.toISOString()` de
 * una fecha local con `iso.slice(0, 10)` (que es UTC), así que en Colombia
 * (UTC-5) los buckets diarios salían desfasados un día y las recolecciones de
 * la tarde caían en el día siguiente.
 */
export function dayKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''

  // en-CA produce YYYY-MM-DD directamente.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Desplazamiento de la zona de la granja respecto a UTC, en milisegundos. */
function farmOffsetMs(at: Date): number {
  const asUtc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }))
  const asFarm = new Date(at.toLocaleString('en-US', { timeZone: config.timezone }))

  return asUtc.getTime() - asFarm.getTime()
}

/**
 * Instante de las 00:00 (hora de la granja) del día en que cae `reference`.
 * Sirve para comparar "hoy" contra timestamps guardados en UTC.
 */
export function startOfFarmDay(reference: Date = new Date()): Date {
  const midnightUtc = new Date(`${dayKey(reference)}T00:00:00Z`)

  return new Date(midnightUtc.getTime() + farmOffsetMs(midnightUtc))
}

/** Instante de las 23:59:59.999 (hora de la granja) del día de `reference`. */
export function endOfFarmDay(reference: Date = new Date()): Date {
  return new Date(startOfFarmDay(reference).getTime() + 86_400_000 - 1)
}

/** Suma (o resta) días conservando la hora local de la granja. */
export function addDays(reference: Date, days: number): Date {
  return new Date(reference.getTime() + days * 86_400_000)
}

/** Etiqueta corta de día para los ejes de las gráficas: "29/07". */
export function shortDayLabel(key: string): string {
  const [, month, day] = key.split('-')

  return month && day ? `${day}/${month}` : key
}
