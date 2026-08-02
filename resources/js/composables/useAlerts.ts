import { db } from '@/db/db'
import { aliveChickens, feedStockDays, layingDrop, slowPayers } from '@/domain/metrics'
import { useMetrics } from '@/composables/useMetrics'
import { useFarmStore } from '@/stores/farm'
import { daysSince, fmtMoney, fmtNumber, startOfFarmDay } from '@/utils/format'

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
 * Alertas operativas calculadas a partir de los datos locales:
 *  - Mortalidad anormal del día.
 *  - Deudas viejas.
 *  - Vacunas próximas Y atrasadas.
 *  - Registros que no lograron subir al servidor.
 */
export function useAlerts() {
  const farm = useFarmStore()
  const metrics = useMetrics()

  async function compute(): Promise<Alert[]> {
    if (!farm.farmId) return []

    const alerts: Alert[] = []
    const penId = farm.activePenId
    const data = await metrics.load()

    const [movements, sales, vaccines, failedSync] = await Promise.all([
      db.chickenMovements.where('farmId').equals(farm.farmId).toArray(),
      db.sales.where('farmId').equals(farm.farmId).toArray(),
      db.vaccines.where('farmId').equals(farm.farmId).toArray(),
      db.syncQueue
        .where('farmId')
        .equals(farm.farmId)
        .filter((item) => item.status === 'failed')
        .count(),
    ])

    // ----- Mortalidad -----
    const inPen = <T extends { penId?: string }>(rows: T[]) =>
      rows.filter((r) => !penId || r.penId === penId)

    // La fórmula vive en `domain/metrics`. Aquí había una copia que NO sumaba
    // las transferencias, así que con un galpón activo el umbral de mortalidad
    // se comparaba contra un plantel equivocado.
    const alive = aliveChickens(movements, penId)

    // Por FECHA OPERATIVA: una muerte de ayer digitada hoy no es mortalidad de hoy.
    const startOfToday = startOfFarmDay()

    const deathsToday = inPen(movements)
      .filter((m) => m.type === 'death' && new Date(m.movementAt ?? m.createdAt) >= startOfToday)
      .reduce((s, m) => s + m.qty, 0)

    // Umbral: el mayor entre 5 aves y el 1 % del plantel vivo.
    const threshold = Math.max(5, Math.round(alive * 0.01))

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

    // ----- Alimento por acabarse -----
    // Quedarse sin alimento un domingo tumba la postura una semana entera. El
    // dato es de TODA la granja: el alimento no se compra por galpón.
    const stock = feedStockDays(data)

    if (stock.days !== null && stock.days <= 7) {
      const scope = farm.activePens.length > 1 ? ' (toda la granja)' : ''
      const unsure =
        stock.excludedTypes.length > 0
          ? ` No se pudo contar: ${stock.excludedTypes.join(', ')}.`
          : ''

      alerts.push({
        id: 'feed-low',
        severity: stock.days <= 3 ? 'high' : 'med',
        icon: 'chicken',
        title: 'Alimento por acabarse',
        detail: `Queda alimento para ${stock.days} día(s)${scope}. Consumo: ${fmtNumber(stock.dailyKg, 1)} kg/día.${unsure}`,
        to: '/feed/purchase',
      })
    }

    // ----- Caída de postura -----
    // Es la señal temprana de enfermedad, calor o parásitos: los huevos bajan
    // antes de que se note nada más.
    const drop = layingDrop(data)

    if (drop?.dropping) {
      const last = drop.recent[drop.recent.length - 1]

      alerts.push({
        id: 'laying-drop',
        severity: 'high',
        icon: 'egg',
        title: 'La postura viene cayendo',
        detail: `Tres días seguidos por debajo de lo normal: ${fmtNumber(last * 100, 0)} % frente a ${fmtNumber(drop.reference * 100, 0)} % habitual. Revisa agua, alimento y calor.`,
        to: '/reports',
      })
    }

    // ----- Deudas viejas -----
    const oldDebts = sales
      .filter((s) => s.status !== 'void' && s.balance > 0)
      .map((s) => ({ sale: s, days: daysSince(s.soldAt) }))
      .filter((d) => d.days >= 14)

    if (oldDebts.length > 0) {
      const total = oldDebts.reduce((s, d) => s + d.sale.balance, 0)
      const worst = oldDebts.reduce((a, b) => (a.days > b.days ? a : b))
      const clients = new Set(oldDebts.map((d) => d.sale.customerId)).size

      alerts.push({
        id: 'old-debts',
        severity: worst.days >= 30 ? 'high' : 'med',
        icon: 'people',
        title: 'Deudas atrasadas',
        detail: `${clients} cliente(s) deben hace ${worst.days}+ días. Total: ${fmtMoney(total)}.`,
        to: '/customers/debts',
      })
    }

    // ----- Clientes con retraso recurrente -----
    // Distinto de "deudas viejas": aquí no importa una venta atrasada suelta,
    // sino el cliente que se atrasa una y otra vez.
    const slow = slowPayers(sales)

    if (slow.length > 0) {
      const total = slow.reduce((sum, payer) => sum + payer.total, 0)

      alerts.push({
        id: 'slow-payers',
        severity: 'med',
        icon: 'people',
        title: 'Clientes que se atrasan seguido',
        detail: `${slow.length} cliente(s) tienen 2 o más ventas vencidas. Total: ${fmtMoney(total)}.`,
        to: '/customers/debts',
      })
    }

    // ----- Vacunas -----
    const scopedVaccines = inPen(vaccines).filter((v) => v.nextAt)
    const now = startOfToday.getTime()

    // Atrasadas: es EL caso que hay que avisar, y antes no generaba ninguna
    // alerta porque el filtro sólo miraba las fechas futuras.
    const overdue = scopedVaccines
      .filter((v) => new Date(v.nextAt!).getTime() < now)
      .sort((a, b) => new Date(a.nextAt!).getTime() - new Date(b.nextAt!).getTime())[0]

    if (overdue) {
      alerts.push({
        id: 'vaccine-overdue',
        severity: 'high',
        icon: 'syringe',
        title: 'Vacuna atrasada',
        detail: `"${overdue.name}" estaba prevista hace ${daysSince(overdue.nextAt!)} día(s).`,
        to: '/vaccines/new',
      })
    }

    const upcoming = scopedVaccines
      .filter((v) => new Date(v.nextAt!).getTime() >= now)
      .sort((a, b) => new Date(a.nextAt!).getTime() - new Date(b.nextAt!).getTime())[0]

    if (upcoming) {
      const daysToVaccine = Math.max(
        0,
        Math.ceil((new Date(upcoming.nextAt!).getTime() - now) / 86_400_000),
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

    // ----- Sincronización -----
    // Si algo quedó rechazado por el servidor hay que decirlo: antes la cola
    // acumulaba errores en silencio y el contador de pendientes no bajaba nunca.
    if (failedSync > 0) {
      alerts.push({
        id: 'sync-failed',
        severity: 'med',
        icon: 'clipboard',
        title: 'Registros sin subir',
        detail: `${failedSync} registro(s) no se pudieron guardar en el servidor. Revísalos en Ajustes.`,
        to: '/settings',
      })
    }

    return alerts
  }

  return { compute }
}

/** Colores por severidad (los usa AlertBanner). */
export const severityStyles: Record<AlertSeverity, { bg: string; text: string; icon: string }> = {
  high: { bg: 'bg-alert-50', text: 'text-alert-700', icon: '⚠️' },
  med: { bg: 'bg-brand-50', text: 'text-brand-700', icon: '🔔' },
  low: { bg: 'bg-grass-50', text: 'text-grass-700', icon: 'ℹ️' },
}
