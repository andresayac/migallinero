import Dexie, { type Table } from 'dexie'
import type {
  EggCategory,
  Pen,
  MortalityCause,
  Presentation,
  FeedType,
  FeedRecord,
  FeedPurchase,
  Customer,
  EggCollection,
  ChickenMovement,
  Vaccine,
  Incident,
  Sale,
  Payment,
  PhotoRecord,
  SyncQueueItem,
} from '@/types/domain'

/**
 * Base de datos local (offline-first).
 * Todas las tablas se indexan por farmId para aislar los datos de cada granja,
 * y por localUuid para la deduplicación al sincronizar.
 *
 * En el MVP cada usuario tiene una sola granja; el farmId se obtiene del store
 * `farm` y es SIEMPRE el UUID local, nunca el id numérico del backend (ese vive
 * en `remoteFarmId`). Mezclar ambos hacía que al iniciar sesión en un
 * dispositivo con datos la app apareciera vacía.
 */
export class MiGallineroDB extends Dexie {
  eggCategories!: Table<EggCategory, string>
  pens!: Table<Pen, string>
  mortalityCauses!: Table<MortalityCause, string>
  presentations!: Table<Presentation, string>
  feedTypes!: Table<FeedType, string>
  feedRecords!: Table<FeedRecord, string>
  feedPurchases!: Table<FeedPurchase, string>
  customers!: Table<Customer, string>
  eggCollections!: Table<EggCollection, string>
  chickenMovements!: Table<ChickenMovement, string>
  vaccines!: Table<Vaccine, string>
  incidents!: Table<Incident, string>
  sales!: Table<Sale, string>
  payments!: Table<Payment, string>
  photos!: Table<PhotoRecord, string>
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

    this.version(2).stores({
      feedTypes: 'localUuid, farmId, remoteId, sort, active',
      feedRecords: 'localUuid, farmId, remoteId, penId, recordedAt, shift, pendingSync',
      feedPurchases: 'localUuid, farmId, remoteId, purchasedAt, pendingSync',
    })

    this.version(3)
      .stores({
        // `movementAt` (fecha operativa) pasa a ser un índice consultable: los
        // reportes filtraban por createdAt, que es cuándo se digitó el dato.
        chickenMovements: 'localUuid, farmId, remoteId, penId, type, movementAt',
        // La cola necesita índices para el backoff y para separar los fallos
        // permanentes de los pendientes.
        syncQueue: '++id, farmId, entity, localUuid, createdAt, status, nextAttemptAt, [farmId+status]',
        // Fotos como Blob real: antes se guardaba un blob: ObjectURL, que muere
        // al recargar la página, así que la evidencia se perdía siempre.
        photos: 'localUuid, farmId, pendingUpload',
      })
      .upgrade(async (tx) => {
        // Los movimientos existentes guardaban la fecha operativa en createdAt.
        await tx
          .table('chickenMovements')
          .toCollection()
          .modify((m: Record<string, unknown>) => {
            m.movementAt ??= m.createdAt
          })

        // Los ObjectURL guardados ya no son recuperables: los limpiamos para no
        // dejar imágenes rotas en la interfaz.
        for (const table of ['chickenMovements', 'vaccines']) {
          await tx
            .table(table)
            .toCollection()
            .modify((r: Record<string, unknown>) => {
              if (typeof r.photoPath === 'string' && r.photoPath.startsWith('blob:')) {
                delete r.photoPath
              }
            })
        }

        await tx
          .table('syncQueue')
          .toCollection()
          .modify((item: Record<string, unknown>) => {
            item.status ??= 'pending'
            item.attempts ??= 0
          })
      })
  }
}

export const db = new MiGallineroDB()

/** Todas las tablas de datos de granja (para limpiar al cerrar sesión). */
export const farmDataTables = [
  db.eggCategories,
  db.pens,
  db.mortalityCauses,
  db.presentations,
  db.feedTypes,
  db.feedRecords,
  db.feedPurchases,
  db.customers,
  db.eggCollections,
  db.chickenMovements,
  db.vaccines,
  db.incidents,
  db.sales,
  db.payments,
  db.photos,
  db.syncQueue,
]

/**
 * Borra todos los datos locales de una granja.
 * Se usa al cerrar sesión en un dispositivo compartido: antes los datos de la
 * granja quedaban en IndexedDB indefinidamente y sin forma de limpiarlos.
 */
export async function wipeFarmData(farmId: string): Promise<void> {
  await db.transaction('rw', farmDataTables, async () => {
    for (const table of farmDataTables) {
      await table.where('farmId').equals(farmId).delete()
    }
  })
}
