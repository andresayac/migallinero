/**
 * Tipos de dominio del frontend (espejo del backend Laravel).
 * Todos los registros offline tienen farm_id + local_uuid para aislamiento y deduplicación.
 */

export type Role = 'admin' | 'vendedor' | 'operario'
export type SaleStatus = 'paid' | 'partial' | 'pending' | 'void'
export type IncidentSeverity = 'low' | 'med' | 'high'
export type IncidentStatus = 'open' | 'reviewed' | 'solved'
export type ChickenMovementType =
  | 'buy'
  | 'birth'
  | 'death'
  | 'sale'
  | 'revoke'
  | 'transfer'
  | 'adjust'

export interface Farm {
  id: string
  name: string
  ownerName: string
  phone?: string
  country: string
  timezone: string
  locale: string
  currency: string
  /** días hacia atrás permitidos para registrar; 0 = solo hoy. */
  periodLockDays: number
}

export interface User {
  id: string
  name: string
  username: string
  role: Role
}

/** Marca común a todo registro offline (proveniente de Dexie). */
export interface OfflineRecord {
  /** UUID generado en el cliente → deduplicación upsert en el backend */
  localUuid: string
  farmId: string
  /** true mientras no se haya sincronizado con el servidor */
  pendingSync: boolean
  /**
   * id remoto una vez sincronizado. Entero (Laravel usa `id()` autoincrement).
   * Vacío/undefined mientras el registro no se haya subido al backend.
   */
  remoteId?: number
  createdAt: string
  updatedAt: string
  createdBy: string
  /**
   * 'auto' = fecha/hora tomadas automáticamente del dispositivo.
   * 'manual' = fecha/hora elegida a mano por el usuario (día anterior, corte de energía…).
   *   Los registros manuales quedan marcados y auditados para evitar manipulación oculta.
   */
  entryMode?: 'auto' | 'manual'
  /** motivo del registro manual (obligatorio si entryMode = 'manual'). */
  manualReason?: string
  /** historial de ediciones posteriores (snapshot antes de cada cambio) */
  auditBefore?: unknown
}

export interface EggCategory extends OfflineRecord {
  name: string
  short: string
  sellable: boolean
  isBroken: boolean
  color: string
  sort: number
  active: boolean
}

export interface Pen extends OfflineRecord {
  name: string
  active: boolean
  sort: number
  /** color para distinguir el galpón en el selector y tarjetas. */
  color: string
}

export interface MortalityCause extends OfflineRecord {
  name: string
  active: boolean
  sort: number
}

export interface Presentation extends OfflineRecord {
  code: 'unit' | 'cubeta' | 'torre' | 'custom'
  name: string
  unitsPerPack: number // 1, 30, 300...
  sort: number
  active: boolean
}

export interface Customer extends OfflineRecord {
  name: string
  phone?: string
  address?: string
  idNumber?: string
  notes?: string
  active: boolean
  /** saldo pendiente = Σ sales.balance con status pending|partial */
  balance: number
}

export interface EggCollection extends OfflineRecord {
  type: 'egg-collection'
  penId: string
  collectionAt: string
  observation?: string
  total: number
  lines: EggCollectionLine[]
}

export interface EggCollectionLine {
  categoryId: string
  qty: number
}

export interface ChickenMovement extends OfflineRecord {
  lotId?: string
  penId: string
  type: ChickenMovementType
  qty: number
  reason?: string
  observation?: string
  photoPath?: string
}

export interface Vaccine extends OfflineRecord {
  name: string
  batch?: string
  expiresAt?: string
  dose?: string
  appliedAt: string
  nextAt?: string
  penId: string
  qtyChickens: number
  responsible?: string
  observation?: string
  photoPath?: string
}

export interface Incident extends OfflineRecord {
  type: string
  penId?: string
  description: string
  severity: IncidentSeverity
  status: IncidentStatus
  solvedAt?: string
}

export interface Sale extends OfflineRecord {
  type: 'sale'
  customerId: string
  soldAt: string
  total: number
  discount: number
  paid: number
  balance: number
  status: SaleStatus
  paymentMethod?: string
  promisedPaymentAt?: string
  observation?: string
  lines: SaleLine[]
}

export interface SaleLine {
  categoryId: string
  presentationId: string
  qtyPacks: number
  qtyUnits: number
  unitPrice: number
  subtotal: number
}

export interface Payment extends OfflineRecord {
  saleId: string
  customerId: string
  amount: number
  method?: string
  paidAt: string
  observation?: string
}

/** Elemento en la cola de sincronización. */
export interface SyncQueueItem {
  id?: number
  farmId: string
  entity: string
  action: 'create' | 'update' | 'delete'
  localUuid: string
  payload: unknown
  attempts: number
  lastError?: string
  createdAt: string
}
