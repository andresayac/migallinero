/**
 * Utilidades comunes.
 */

/** crypto.randomUUID con fallback (navegadores viejos). */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const LOCALE = 'es-CO'
const TIMEZONE = 'America/Bogota'

/** Fecha y hora actual ISO (se persiste automáticamente en cada registro). */
export function nowISO(): string {
  return new Date().toISOString()
}

/** Formatea una fecha en formato Colombia: "mié 29 jul 2026". */
export function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: TIMEZONE,
  }).format(new Date(iso))
}

/** Formatea fecha + hora: "mié 29 jul 2026 10:24". */
export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE,
  }).format(new Date(iso))
}

/** Formatea como hora: "10:24 AM". */
export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE,
  }).format(new Date(iso))
}

/**
 * Formatea pesos colombianos.
 * Sin decimales y con separador de miles: 240000 → "$ 240.000"
 */
export function fmtCOP(value: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

/** Días transcurridos desde una fecha. */
export function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/**
 * Redondea a entero COP (sin centavos).
 * Las operaciones de dinero se mantienen como enteros.
 */
export function toCOP(value: number): number {
  return Math.round(value)
}
