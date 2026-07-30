<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/composables/useToast'
import { useDialog } from '@/composables/useDialog'
import { fmtCOP, daysSince, uuid, nowISO, toCOP } from '@/utils/format'
import type { Customer, Sale, Payment } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'

const farm = useFarmStore()
const auth = useAuthStore()
const sync = useSyncStore()
const toast = useToast()
const dialog = useDialog()

const customers = ref<Customer[]>([])
const sales = ref<Sale[]>([])

interface DebtRow {
  customer: Customer
  debt: number
  oldestSale?: Sale
  days: number
}

const rows = computed<DebtRow[]>(() => {
  return customers.value
    .map((c) => {
      const custSales = sales.value
        .filter((s) => s.customerId === c.localUuid && (s.status === 'pending' || s.status === 'partial'))
        .sort((a, b) => a.soldAt.localeCompare(b.soldAt))
      const debt = custSales.reduce((s, x) => s + x.balance, 0)
      const oldest = custSales[0]
      return {
        customer: c,
        debt,
        oldestSale: oldest,
        days: oldest ? daysSince(oldest.soldAt) : 0,
      }
    })
    .filter((r) => r.debt > 0)
    .sort((a, b) => b.days - a.days)
})

const totalDue = computed(() => rows.value.reduce((s, r) => s + r.debt, 0))

async function load() {
  if (!farm.farmId) return
  ;[customers.value, sales.value] = await Promise.all([
    db.customers.where('farmId').equals(farm.farmId).toArray(),
    db.sales.where('farmId').equals(farm.farmId).toArray(),
  ])
}
onMounted(load)

/**
 * Abre diálogo para registrar un abono (completo o parcial) sobre la deuda
 * del cliente. Aplica proporcionalmente a las ventas pendientes, empezando
 * por la más antigua.
 */
async function registerPayment(row: DebtRow) {
  const amountStr = await dialog.prompt({
    title: `Abono de ${row.customer.name}`,
    label: `¿Cuánto te pagó? Deuda total: ${fmtCOP(row.debt)}`,
    defaultValue: String(row.debt),
  })
  const amount = Number(amountStr)
  if (!Number.isFinite(amount) || amount <= 0) {
    if (amountStr !== null) toast.error('Escribe un monto válido')
    return
  }
  if (amount > row.debt) {
    toast.error(`No puede pagar más de lo que debe (${fmtCOP(row.debt)})`)
    return
  }

  try {
    const ts = nowISO()
    let remaining = toCOP(amount)

  // Ventas pendientes del cliente, de la más antigua a la más nueva.
  const custSales = sales.value
    .filter((s) => s.customerId === row.customer.localUuid && (s.status === 'pending' || s.status === 'partial'))
    .sort((a, b) => a.soldAt.localeCompare(b.soldAt))

  for (const sale of custSales) {
    if (remaining <= 0) break
    const apply = Math.min(remaining, sale.balance)
    if (apply <= 0) continue

    const newPaid = toCOP(sale.paid + apply)
    const newBalance = toCOP(sale.balance - apply)
    const status = newBalance <= 0 ? 'paid' : 'partial'

    // Guardamos snapshot para auditoría antes de modificar.
    // JSON.parse(JSON.stringify(...)) para asegurar estructura clonable por
    // IndexedDB (sin referencias circulares ni tipos no estructurados).
    const before = JSON.parse(JSON.stringify(sale)) as unknown
    await db.sales.update(sale.localUuid, {
      paid: newPaid,
      balance: newBalance,
      status,
      auditBefore: before,
      updatedAt: ts,
      pendingSync: true,
    })

    // Registramos el pago individual.
    const payment: Payment = {
      localUuid: uuid(),
      farmId: farm.farmId,
      saleId: sale.localUuid,
      customerId: row.customer.localUuid,
      amount: apply,
      method: 'efectivo',
      paidAt: ts,
      pendingSync: true,
      entryMode: 'auto',
      createdAt: ts,
      updatedAt: ts,
      createdBy: auth.user?.id ?? 'unknown',
    }
    await db.payments.add(payment)
    await db.syncQueue.add({
      farmId: farm.farmId,
      entity: 'payment',
      action: 'create',
      localUuid: payment.localUuid,
      payload: payment,
      attempts: 0,
      createdAt: ts,
    })

    remaining = toCOP(remaining - apply)
  }

  // Actualizamos el saldo del cliente.
  const newCustomerBalance = toCOP(row.customer.balance - amount)
  await db.customers.update(row.customer.localUuid, {
    balance: newCustomerBalance,
    updatedAt: ts,
    pendingSync: true,
  })

  await sync.refreshPending()
  sync.forceSync()
  await load()

  toast.success(
    amount >= row.debt
      ? `Pago completo registrado (${fmtCOP(amount)})`
      : `Abono de ${fmtCOP(amount)} registrado`,
  )
  } catch (e) {
    console.error('[registerPayment]', e)
    toast.error('No se pudo registrar el pago: ' + (e as Error).message)
  }
}
</script>

<template>
  <ScreenShell title="¿Quién me debe?">
    <div class="card mb-4 text-center" :class="totalDue > 0 ? 'bg-alert-50' : 'bg-grass-50'">
      <p class="text-base font-semibold text-slate-500">Total por cobrar</p>
      <p class="num-big" :class="totalDue > 0 ? 'text-alert-600' : 'text-grass-600'">
        {{ fmtCOP(totalDue) }}
      </p>
    </div>

    <div v-if="!rows.length" class="card text-center text-slate-500">
      🎉 Nadie te debe. ¡Buen trabajo!
    </div>

    <div v-else class="flex flex-col gap-2">
      <div v-for="r in rows" :key="r.customer.localUuid" class="card">
        <div class="flex items-center justify-between">
          <p class="text-xl font-extrabold text-slate-800">{{ r.customer.name }}</p>
          <p class="text-2xl font-extrabold text-alert-600">{{ fmtCOP(r.debt) }}</p>
        </div>
        <p class="text-sm text-slate-500">
          Compró hace {{ r.days }} día{{ r.days === 1 ? '' : 's' }}
          <span v-if="r.days > 7" class="font-bold text-alert-600"> · atrasado ⚠</span>
        </p>
        <div class="mt-2 flex gap-2">
          <BigButton
            label="Registrar pago"
            icon="money"
            color="amber"
            class="flex-1"
            @click="registerPayment(r)"
          />
        </div>
      </div>
    </div>

    <div class="mt-6">
      <BigButton label="Ver todos los clientes" icon="people" color="ghost" size="block"
        @click="$router.push('/customers')" />
    </div>
  </ScreenShell>
</template>
