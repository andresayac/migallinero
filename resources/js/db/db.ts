import Dexie, { type Table } from 'dexie'
import type {
  EggCategory,
  Pen,
  MortalityCause,
  Presentation,
  Customer,
  EggCollection,
  ChickenMovement,
  Vaccine,
  Incident,
  Sale,
  Payment,
  SyncQueueItem,
} from '@/types/domain'

/**
 * Base de datos local (offline-first).
 * Todas las tablas se indexan por farmId para aislar los datos de cada granja,
 * y por localUuid para la deduplicación al sincronizar.
 *
 * En el MVP cada usuario tiene una sola granja; el farmId se obtiene del store `farm`.
 * El modelo ya soporta tener varias granjas en el mismo dispositivo sin cambiar esquema.
 */
export class MiGallineroDB extends Dexie {
  eggCategories!: Table<EggCategory, string>
  pens!: Table<Pen, string>
  mortalityCauses!: Table<MortalityCause, string>
  presentations!: Table<Presentation, string>
  customers!: Table<Customer, string>
  eggCollections!: Table<EggCollection, string>
  chickenMovements!: Table<ChickenMovement, string>
  vaccines!: Table<Vaccine, string>
  incidents!: Table<Incident, string>
  sales!: Table<Sale, string>
  payments!: Table<Payment, string>
  syncQueue!: Table<SyncQueueItem, number>

  constructor() {
    super('migallinero')

    this.version(1).stores({
      // [localUuid] es la PK; farmId y remoteId son índices de búsqueda
      eggCategories:
        'localUuid, farmId, remoteId, sort, active',
      pens: 'localUuid, farmId, remoteId, sort, active',
      mortalityCauses: 'localUuid, farmId, remoteId, sort, active',
      presentations: 'localUuid, farmId, remoteId, code',
      customers: 'localUuid, farmId, remoteId, name, active',
      eggCollections:
        'localUuid, farmId, remoteId, penId, collectionAt, pendingSync',
      chickenMovements:
        'localUuid, farmId, remoteId, penId, type',
      vaccines:
        'localUuid, farmId, remoteId, penId, appliedAt, nextAt, pendingSync',
      incidents: 'localUuid, farmId, remoteId, status, severity',
      sales: 'localUuid, farmId, remoteId, customerId, soldAt, status, pendingSync',
      payments: 'localUuid, farmId, remoteId, saleId, customerId, paidAt',
      syncQueue: '++id, farmId, entity, localUuid, createdAt',
    })
  }
}

export const db = new MiGallineroDB()
