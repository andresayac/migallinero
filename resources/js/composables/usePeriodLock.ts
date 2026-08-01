import { computed } from 'vue'
import { useFarmStore } from '@/stores/farm'
import { addDays, dayKey, startOfFarmDay } from '@/utils/format'

export interface PeriodCheckResult {
  /** true si la fecha es válida (no bloqueada por el candado). */
  ok: boolean
  /** motivo del rechazo cuando ok = false. */
  reason?: string
  /** días de diferencia respecto a hoy (negativo = pasado). */
  deltaDays: number
  /** true cuando un admin puede autorizarla con PIN y motivo. */
  overridable: boolean
}

/**
 * Candado de período anti-manipulación (lado cliente).
 *
 * IMPORTANTE: esto es sólo interfaz. La validación que cuenta está en el
 * servidor (`App\Tenancy\PeriodLock`), porque cualquiera puede llamar a la API
 * directamente. Aquí sólo avisamos al usuario antes de que escriba.
 *
 * Todos los cálculos usan la zona horaria de la granja, no la del dispositivo:
 * un teléfono con la hora mal puesta no debe cambiar qué día es "hoy".
 */
export function usePeriodLock() {
  const farm = useFarmStore()

  /** Primer día permitido sin autorización de admin (inclusive). */
  const minAllowedDate = computed(() => addDays(startOfFarmDay(), -farm.periodLockDays))

  /** Diferencia en días respecto a hoy, en días de la granja. */
  function diffDays(iso: string): number {
    const target = new Date(iso)
    if (Number.isNaN(target.getTime())) return 0

    const targetDay = startOfFarmDay(target).getTime()
    const today = startOfFarmDay().getTime()

    return Math.round((targetDay - today) / 86_400_000)
  }

  /**
   * Comprueba si una fecha puede usarse para registrar.
   *  - Hoy o hacia atrás dentro de la ventana: ok.
   *  - Futuro: rechazado, y NO autorizable ni por un admin (no se anticipa
   *    producción). Antes un admin sí podía guardar fechas futuras, porque el
   *    watch del selector no cubría ese caso.
   *  - Pasado fuera de la ventana: requiere autorización de admin.
   */
  function check(iso: string): PeriodCheckResult {
    const delta = diffDays(iso)

    if (delta > 0) {
      return {
        ok: false,
        reason: 'No se puede registrar una fecha futura',
        deltaDays: delta,
        overridable: false,
      }
    }

    if (delta < -farm.periodLockDays) {
      return {
        ok: false,
        reason: `Hace más de ${farm.periodLockDays} días. Necesita autorización del administrador.`,
        deltaDays: delta,
        overridable: true,
      }
    }

    return { ok: true, deltaDays: delta, overridable: false }
  }

  /** Fechas rápidas: hoy y los últimos N días permitidos (máx. 30 chips). */
  function quickDates(): { label: string; iso: string; key: string }[] {
    const max = Math.max(0, Math.min(farm.periodLockDays, 30))
    const out: { label: string; iso: string; key: string }[] = []

    for (let i = 0; i <= max; i++) {
      const date = addDays(startOfFarmDay(), -i)
      const prefix = i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : `Hace ${i} días`

      out.push({
        label: `${prefix} · ${shortLabel(date)}`,
        iso: date.toISOString(),
        key: dayKey(date),
      })
    }

    return out
  }

  function shortLabel(date: Date): string {
    return new Intl.DateTimeFormat(farm.locale || 'es-CO', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      timeZone: farm.timezone || 'America/Bogota',
    }).format(date)
  }

  return {
    minAllowedDate,
    periodLockDays: computed(() => farm.periodLockDays),
    check,
    diffDays,
    quickDates,
  }
}
