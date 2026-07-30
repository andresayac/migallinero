import { computed } from 'vue'
import { useFarmStore } from '@/stores/farm'

export interface PeriodCheckResult {
  /** true si la fecha es válida (no está bloqueada por el candado). */
  ok: boolean
  /** motivo del rechazo cuando ok = false. */
  reason?: string
  /** días de diferencia respecto a hoy (negativo = pasado). */
  deltaDays: number
}

/**
 * Lógica del candado de período anti-manipulación.
 *
 * Permite registrar datos de fechas pasadas dentro de la ventana configurada
 * (`periodLockDays`, por defecto 7 días atrás). Antes de esa ventana solo un
 * administrador puede autorizar el registro con un motivo.
 */
export function usePeriodLock() {
  const farm = useFarmStore()

  /** Última fecha permitida sin autorización de admin (inclusive). */
  const minAllowedDate = computed(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - farm.periodLockDays)
    return d
  })

  function diffDays(iso: string): number {
    const target = new Date(iso)
    target.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.round((target.getTime() - today.getTime()) / 86_400_000)
  }

  /**
   * Comprueba si una fecha puede usarse para registrar.
   * - Hoy o días hacia atrás dentro de la ventana: ok.
   * - Futuro: rechazado (no se puede anticipar producción).
   * - Pasado fuera de la ventana: require autorización de admin.
   */
  function check(iso: string): PeriodCheckResult {
    const delta = diffDays(iso)
    if (delta > 0) {
      return { ok: false, reason: 'No se puede registrar una fecha futura', deltaDays: delta }
    }
    if (delta < -farm.periodLockDays) {
      return {
        ok: false,
        reason: `Hace más de ${farm.periodLockDays} días. Necesita autorización del administrador.`,
        deltaDays: delta,
      }
    }
    return { ok: true, deltaDays: delta }
  }

  /** Lista de fechas rápidas (selector del adulto mayor): hoy y últimos N días. */
  function quickDates(): { label: string; iso: string }[] {
    const fmt = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: '2-digit', month: 'short' })
    const max = Math.max(0, farm.periodLockDays)
    const out: { label: string; iso: string }[] = []
    for (let i = 0; i <= max; i++) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      const prefix = i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : `Hace ${i} días`
      out.push({ label: `${prefix} · ${fmt.format(d)}`, iso: d.toISOString() })
    }
    return out
  }

  return {
    minAllowedDate,
    periodLockDays: computed(() => farm.periodLockDays),
    check,
    diffDays,
    quickDates,
  }
}
