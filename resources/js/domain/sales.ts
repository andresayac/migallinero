import { db } from '@/db/db'
import { atomically, create as createRecord, update as updateRecord } from '@/db/repository'
import { nowISO, toMoney, uuid } from '@/utils/format'
import type { Customer, Payment, Sale, SaleLine, SaleStatus } from '@/types/domain'

/**
 * Reglas de negocio de ventas, cobros y anulaciones.
 *
 * Estaban repartidas por las vistas, cada una con su propia versión: la venta
 * actualizaba el saldo del cliente pero no lo encolaba, el abono no encolaba la
 * venta modificada, y la anulación no tocaba los pagos. Al centralizarlas, las
 * tres operaciones comparten el mismo criterio contable y todas pasan por el
 * repositorio, así que todo lo que cambia se sincroniza.
 */

/** Estado derivado del total y lo pagado. Una sola definición para todos. */
export function saleStatus(total: number, paid: number): SaleStatus {
  if (paid >= total) return 'paid'

  return paid > 0 ? 'partial' : 'pending'
}

export interface NewSaleInput {
  farmId: string
  createdBy: string
  customerId?: string
  /** Nombre para crear un cliente nuevo si no se eligió uno existente. */
  newCustomerName?: string
  soldAt: string
  lines: SaleLine[]
  discount: number
  paid: number
  paymentMethod?: string
  observation?: string
  entryMode?: 'auto' | 'manual'
  manualReason?: string
}

/**
 * Registra una venta completa: crea el cliente si hace falta, guarda la venta,
 * el pago inicial y actualiza el saldo del cliente. Todo en una transacción.
 */
export async function registerSale(input: NewSaleInput): Promise<Sale> {
  const ts = nowISO()
  const subtotal = input.lines.reduce((sum, line) => sum + line.subtotal, 0)
  const discount = toMoney(Math.min(Math.max(0, input.discount), subtotal))
  const total = toMoney(Math.max(0, subtotal - discount))
  // No se puede pagar más de lo que vale la venta.
  const paid = toMoney(Math.min(Math.max(0, input.paid), total))
  const balance = toMoney(total - paid)

  return atomically(async () => {
    let customerId = input.customerId

    // El cliente nuevo se crea con `createRecord`, así que queda encolado.
    // Antes se insertaba directo en Dexie y nunca subía, por lo que en el
    // servidor todas las ventas terminaban con customer_id = NULL.
    if (!customerId && input.newCustomerName?.trim()) {
      const customer: Customer = {
        localUuid: uuid(),
        farmId: input.farmId,
        name: input.newCustomerName.trim(),
        active: true,
        balance: 0,
        pendingSync: true,
        entryMode: 'auto',
        createdAt: ts,
        updatedAt: ts,
        createdBy: input.createdBy,
      }

      await createRecord('customer', customer)
      customerId = customer.localUuid
    }

    const sale: Sale = {
      type: 'sale',
      localUuid: uuid(),
      farmId: input.farmId,
      customerId: customerId ?? '',
      soldAt: input.soldAt,
      total,
      discount,
      paid,
      balance,
      status: saleStatus(total, paid),
      paymentMethod: input.paymentMethod,
      observation: input.observation,
      lines: input.lines,
      pendingSync: true,
      entryMode: input.entryMode ?? 'auto',
      manualReason: input.manualReason,
      createdAt: ts,
      updatedAt: ts,
      createdBy: input.createdBy,
    }

    await createRecord('sale', sale)

    // El pago inicial se registra como Payment para que los ingresos se puedan
    // reconstruir por fecha de cobro, no por fecha de venta.
    if (paid > 0) {
      await createRecord<Payment>('payment', {
        localUuid: uuid(),
        farmId: input.farmId,
        saleId: sale.localUuid,
        customerId: customerId ?? '',
        amount: paid,
        method: input.paymentMethod ?? 'efectivo',
        paidAt: input.soldAt,
        pendingSync: true,
        entryMode: 'auto',
        createdAt: ts,
        updatedAt: ts,
        createdBy: input.createdBy,
      })
    }

    if (customerId) {
      await recalculateCustomerBalance(input.farmId, customerId)
    }

    return sale
  })
}

/**
 * Aplica un abono a las ventas pendientes del cliente, de la más antigua a la
 * más nueva. Devuelve el importe realmente aplicado.
 */
export async function registerPayment(input: {
  farmId: string
  createdBy: string
  customerId: string
  amount: number
  method?: string
  paidAt?: string
}): Promise<number> {
  const ts = input.paidAt ?? nowISO()
  const requested = toMoney(input.amount)

  if (requested <= 0) return 0

  return atomically(async () => {
    const sales = (
      await db.sales.where('farmId').equals(input.farmId).toArray()
    )
      .filter((s) => s.customerId === input.customerId && s.status !== 'void' && s.balance > 0)
      .sort((a, b) => a.soldAt.localeCompare(b.soldAt))

    let remaining = requested
    let applied = 0

    for (const sale of sales) {
      if (remaining <= 0) break

      const amount = Math.min(remaining, sale.balance)
      if (amount <= 0) continue

      const newPaid = toMoney(sale.paid + amount)
      const newBalance = toMoney(sale.balance - amount)

      // La venta modificada SÍ se encola: antes sólo se marcaba pendingSync, así
      // que en el servidor el saldo se quedaba congelado en el valor original.
      await updateRecord<Sale>('sale', sale.localUuid, {
        paid: newPaid,
        balance: newBalance,
        status: saleStatus(sale.total, newPaid),
        auditBefore: snapshot(sale),
      })

      await createRecord<Payment>('payment', {
        localUuid: uuid(),
        farmId: input.farmId,
        saleId: sale.localUuid,
        customerId: input.customerId,
        amount,
        method: input.method ?? 'efectivo',
        paidAt: ts,
        pendingSync: true,
        entryMode: 'auto',
        createdAt: nowISO(),
        updatedAt: nowISO(),
        createdBy: input.createdBy,
      })

      remaining = toMoney(remaining - amount)
      applied = toMoney(applied + amount)
    }

    await recalculateCustomerBalance(input.farmId, input.customerId)

    return applied
  })
}

/**
 * Anula una venta: la marca como `void`, anula sus pagos y recalcula el saldo
 * del cliente.
 *
 * Antes dejaba los pagos intactos (seguían contando como ingreso en los
 * reportes) y ajustaba el saldo del cliente a mano, sin encolar nada.
 */
export async function voidSale(sale: Sale, reason?: string): Promise<void> {
  await atomically(async () => {
    await updateRecord<Sale>('sale', sale.localUuid, {
      status: 'void',
      balance: 0,
      paid: 0,
      observation: reason ? `${sale.observation ?? ''} [Anulada: ${reason}]`.trim() : sale.observation,
      auditBefore: snapshot(sale),
    })

    const payments = await db.payments
      .where('farmId')
      .equals(sale.farmId)
      .filter((p) => p.saleId === sale.localUuid && !p.voidedAt)
      .toArray()

    for (const payment of payments) {
      await updateRecord<Payment>('payment', payment.localUuid, { voidedAt: nowISO() })
    }

    if (sale.customerId) {
      await recalculateCustomerBalance(sale.farmId, sale.customerId)
    }
  })
}

/**
 * Recalcula el saldo del cliente a partir de sus ventas.
 *
 * El saldo se derivaba sumando y restando a mano en cada operación, así que se
 * desviaba con el uso; y como nadie lo mostraba (DebtsView lo recalcula desde
 * las ventas), el desvío pasaba desapercibido. Ahora es siempre derivado.
 */
export async function recalculateCustomerBalance(
  farmId: string,
  customerId: string,
): Promise<number> {
  const sales = await db.sales
    .where('farmId')
    .equals(farmId)
    .filter((s) => s.customerId === customerId && s.status !== 'void')
    .toArray()

  const balance = toMoney(sales.reduce((sum, s) => sum + Math.max(0, s.balance), 0))
  const customer = await db.customers.get(customerId)

  if (customer && customer.balance !== balance) {
    await updateRecord<Customer>('customer', customerId, { balance })
  }

  return balance
}

/** Copia serializable del registro, para el rastro de auditoría local. */
function snapshot(record: unknown): unknown {
  return JSON.parse(JSON.stringify(record))
}

/**
 * Huevos disponibles por categoría.
 *
 * `penId` filtra las recolecciones. Las ventas NO tienen galpón, así que al
 * filtrar sólo se muestra lo recogido: restar todas las ventas del inventario de
 * un único galpón daba cero en cualquier granja con más de uno.
 */
export async function eggStock(
  farmId: string,
  penId = '',
): Promise<Map<string, { collected: number; sold: number; available: number }>> {
  const [collections, sales] = await Promise.all([
    db.eggCollections
      .where('farmId')
      .equals(farmId)
      .and((c) => !penId || c.penId === penId)
      .toArray(),
    db.sales
      .where('farmId')
      .equals(farmId)
      .and((s) => s.status !== 'void')
      .toArray(),
  ])

  const stock = new Map<string, { collected: number; sold: number; available: number }>()
  const entry = (id: string) => {
    if (!stock.has(id)) stock.set(id, { collected: 0, sold: 0, available: 0 })

    return stock.get(id)!
  }

  for (const collection of collections) {
    for (const line of collection.lines ?? []) {
      entry(line.categoryId).collected += line.qty
    }
  }

  // Sólo se descuentan las ventas cuando se mira la granja completa.
  if (!penId) {
    for (const sale of sales) {
      for (const line of sale.lines ?? []) {
        entry(line.categoryId).sold += line.qtyUnits
      }
    }
  }

  for (const value of stock.values()) {
    value.available = Math.max(0, value.collected - value.sold)
  }

  return stock
}
