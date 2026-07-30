import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import { daysSince } from '@/utils/format'

export type AlertSeverity = 'high' | 'med' | 'low'

export interface Alert {
  id: string
  severity: AlertSeverity
  icon: string
  title: string
  detail: string
  /** ruta a la que lleva al tocarla */
  to?: string
}

/**
 * Calcula alertas operativas a partir de los datos locales de la granja:
 *  - Mortalidad anormal (diaria o semanal por encima del umbral).
 *  - Deudas viejas (saldo pendiente con muchos días de atraso).
 *  - Vacunas próximas a vencer.
 *
 * El umbral de mortalidad es por defecto 1% del plantel vivo, configurable.
 */
export function useAlerts() {
  const farm = useFarmStore()

  /** Carga sin refresco reactivo; lo llama el Home en onMounted. */
  async function compute(): Promise<Alert[]> {
    if (!farm.farmId) return []
    const alerts: Alert[] = []

    const [movements, sales, vaccines] = await Promise.all([
      db.chickenMovements.where('farmId').equals(farm.farmId).toArray(),
      db.sales.where('farmId').equals(farm.farmId).toArray(),
      db.vaccines.where('farmId').equals(farm.farmId).toArray(),
    ])

    // ----- Mortalidad -----
    const sign = (t: string) =>
      t === 'buy' || t === 'birth' ? 1 : t === 'death' || t === 'sale' || t === 'revoke' ? -1 : 0
    const alive = Math.max(
      0,
      movements.reduce((s, m) => s + m.qty * sign(m.type), 0),
    )

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const deathsToday = movements
      .filter((m) => m.type === 'death' && new Date(m.createdAt) >= today)
      .reduce((s, m) => s + m.qty, 0)

    // Umbral recomendado: el mayor de 5 aves o 1% del plantel vivo.
    // Si aún no hay gallinas registradas (alive=0), usamos sólo el mínimo
    // para que la alerta sirva desde el arranque.
    const threshold = Math.max(5, Math.round(Math.max(0, alive) * 0.01))
    if (deathsToday >= threshold) {
      alerts.push({
        id: 'mortality-today',
        severity: deathsToday >= threshold * 2 ? 'high' : 'med',
        icon: 'skull',
        title: 'Mortalidad alta hoy',
        detail: `${deathsToday} gallinas murieron hoy (umbral: ${threshold}). Revisa el corral.`,
        to: '/chickens',
      })
    }

    // ----- Deudas viejas -----
    const oldDebts = sales
      .filter((s) => (s.status === 'pending' || s.status === 'partial') && s.balance > 0)
      .map((s) => ({ sale: s, days: daysSince(s.soldAt) }))
      .filter((d) => d.days >= 14)

    if (oldDebts.length > 0) {
      const total = oldDebts.reduce((s, d) => s + d.sale.balance, 0)
      const worst = oldDebts.reduce((a, b) => (a.days > b.days ? a : b))
      alerts.push({
        id: 'old-debts',
        severity: worst.days >= 30 ? 'high' : 'med',
        icon: 'people',
        title: 'Deudas atrasadas',
        detail: `${oldDebts.length} cliente(s) deben hace ${worst.days}+ días. Total: $${total.toLocaleString('es-CO')}.`,
        to: '/customers/debts',
      })
    }

    // ----- Vacunas próximas -----
    const now = Date.now()
    const upcoming = vaccines
      .filter((v) => v.nextAt && new Date(v.nextAt).getTime() >= now)
      .sort((a, b) => new Date(a.nextAt!).getTime() - new Date(b.nextAt!).getTime())[0]

    if (upcoming?.nextAt) {
      const daysToVaccine = Math.ceil(
        (new Date(upcoming.nextAt).getTime() - now) / 86_400_000,
      )
      if (daysToVaccine <= 3) {
        alerts.push({
          id: 'vaccine-soon',
          severity: daysToVaccine <= 1 ? 'high' : 'med',
          icon: 'syringe',
          title: 'Vacuna próxima',
          detail: `"${upcoming.name}" se aplica ${daysToVaccine === 0 ? 'hoy' : `en ${daysToVaccine} día(s)`}.`,
          to: '/vaccines/new',
        })
      }
    }

    return alerts
  }

  return { compute }
}

// Pequeño helper de colores (lo usa el componente AlertBanner).
export const severityStyles: Record<AlertSeverity, { bg: string; text: string; icon: string }> = {
  high: { bg: 'bg-alert-50', text: 'text-alert-700', icon: '⚠️' },
  med: { bg: 'bg-brand-50', text: 'text-brand-700', icon: '🔔' },
  low: { bg: 'bg-grass-50', text: 'text-grass-700', icon: 'ℹ️' },
}
