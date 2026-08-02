import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import type { MetricsInput } from '@/domain/metrics'

/**
 * Carga de Dexie todo lo que necesita el motor de indicadores, de una sola vez.
 *
 * Sin esto cada vista releería IndexedDB por su cuenta y el mismo dato se
 * cargaría cuatro veces por pantalla. Las consultas usan el índice `farmId`,
 * que existe en todas las tablas.
 *
 * Se carga la granja COMPLETA aunque haya un galpón activo: el filtro por
 * galpón lo aplican las funciones puras, que necesitan ver todos los
 * movimientos para tratar bien las transferencias.
 */
export function useMetrics() {
  const farm = useFarmStore()

  async function load(): Promise<MetricsInput> {
    const farmId = farm.farmId

    const empty: MetricsInput = {
      collections: [],
      movements: [],
      sales: [],
      payments: [],
      feedRecords: [],
      feedPurchases: [],
      feedTypes: farm.feedTypes,
      categories: farm.categories,
      penId: farm.activePenId,
    }

    if (!farmId) return empty

    const [collections, movements, sales, payments, feedRecords, feedPurchases] = await Promise.all([
      db.eggCollections.where('farmId').equals(farmId).toArray(),
      db.chickenMovements.where('farmId').equals(farmId).toArray(),
      db.sales.where('farmId').equals(farmId).toArray(),
      db.payments.where('farmId').equals(farmId).toArray(),
      db.feedRecords.where('farmId').equals(farmId).toArray(),
      db.feedPurchases.where('farmId').equals(farmId).toArray(),
    ])

    return {
      ...empty,
      collections,
      movements,
      sales,
      payments,
      feedRecords,
      feedPurchases,
    }
  }

  return { load }
}
