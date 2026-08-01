<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/composables/useToast'
import { useDialog } from '@/composables/useDialog'
import { useSubmit } from '@/composables/useSubmit'
import { registerPayment } from '@/domain/sales'
import { fmtMoney, daysSince, toMoney } from '@/utils/format'
import type { Customer, Sale } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'

const farm = useFarmStore()
const auth = useAuthStore()
const sync = useSyncStore()
const toast = useToast()
const dialog = useDialog()
const { busy, submit } = useSubmit()

const customers = ref<Customer[]>([])
const sales = ref<Sale[]>([])

interface DebtRow {
  customer: Customer
  debt: number
  oldestSale?: Sale
  days: number
}

/**
 * Deuda por cliente con el mismo criterio que el resto de la app: venta no
 * anulada con saldo pendiente, en vez de `status IN (pending, partial)`.
 */
const rows = computed<DebtRow[]>(() =>
  customers.value
    .map((customer) => {
      const custSales = sales.value
        .filter((s) => s.customerId === customer.localUuid && s.status !== 'void' && s.balance > 0)
        .sort((a, b) => a.soldAt.localeCompare(b.soldAt))

      const oldest = custSales[0]

      return {
        customer,
        debt: custSales.reduce((sum, s) => sum + s.balance, 0),
        oldestSale: oldest,
        days: oldest ? daysSince(oldest.soldAt) : 0,
      }
    })
    .filter((r) => r.debt > 0)
    .sort((a, b) => b.days - a.days),
)

const totalDue = computed(() => rows.value.reduce((sum, r) => sum + r.debt, 0))

async function load() {
  if (!farm.farmId) return

  ;[customers.value, sales.value] = await Promise.all([
    db.customers.where('farmId').equals(farm.farmId).toArray(),
    db.sales.where('farmId').equals(farm.farmId).toArray(),
  ])
}

onMounted(load)

/**
 * Registra un abono (total o parcial) sobre la deuda del cliente.
 *
 * La lógica vive en `domain/sales.ts`: la venta modificada, el pago y el saldo
 * del cliente se guardan en una sola transacción y los tres se encolan. Antes
 * sólo se encolaba el pago, así que en el servidor el saldo de la venta se
 * quedaba congelado en el valor original para siempre.
 */
async function onRegisterPayment(row: DebtRow) {
  const answer = await dialog.prompt({
    title: `Abono de ${row.customer.name}`,
    label: `¿Cuánto te pagó? Deuda total: ${fmtMoney(row.debt)}`,
    defaultValue: String(row.debt),
    inputMode: 'numeric',
  })

  // null = canceló. Una cadena vacía sí llega aquí y se valida como monto.
  if (answer === null) return

  const amount = toMoney(Number(answer.replace(/[^\d.,-]/g, '').replace(',', '.')))

  if (!Number.isFinite(amount) || amount <= 0) {
    toast.error('Escribe un monto válido')

    return
  }

  if (amount > row.debt) {
    toast.error(`No puede pagar más de lo que debe (${fmtMoney(row.debt)})`)

    return
  }

  const applied = await submit(
    async () => {
      const result = await registerPayment({
        farmId: farm.farmId,
        createdBy: auth.user?.id ?? 'unknown',
        customerId: row.customer.localUuid,
        amount,
      })

      await sync.refreshPending()
      void sync.forceSync()
      await load()

      return result
    },
    { errorMessage: 'No se pudo registrar el pago' },
  )

  if (applied === undefined) return

  toast.success(
    applied >= row.debt
      ? `Pago completo registrado (${fmtMoney(applied)})`
      : `Abono de ${fmtMoney(applied)} registrado`,
  )
}
</script>

<template>
  <ScreenShell title="¿Quién me debe?">
    <div class="card mb-4 text-center" :class="totalDue > 0 ? 'bg-alert-50' : 'bg-grass-50'">
      <p class="text-base font-semibold text-slate-500">Total por cobrar</p>
      <p class="num-big" :class="totalDue > 0 ? 'text-alert-600' : 'text-grass-600'">
        {{ fmtMoney(totalDue) }}
      </p>
    </div>

    <div v-if="!rows.length" class="card text-center text-slate-500">
      🎉 Nadie te debe. ¡Buen trabajo!
    </div>

    <div v-else class="flex flex-col gap-2">
      <div v-for="r in rows" :key="r.customer.localUuid" class="card">
        <div class="flex items-center justify-between">
          <p class="text-xl font-extrabold text-slate-800">{{ r.customer.name }}</p>
          <p class="text-2xl font-extrabold text-alert-600">{{ fmtMoney(r.debt) }}</p>
        </div>
        <p class="text-sm text-slate-500">
          Compró hace {{ r.days }} día{{ r.days === 1 ? '' : 's' }}
          <span v-if="r.days > farm.periodLockDays" class="font-bold text-alert-600">
            · atrasado ⚠</span
          >
        </p>
        <div class="mt-2 flex gap-2">
          <BigButton
            :label="busy ? 'Guardando…' : 'Registrar pago'"
            icon="money"
            color="amber"
            class="flex-1"
            :disabled="busy"
            @click="onRegisterPayment(r)"
          />
        </div>
      </div>
    </div>

    <div class="mt-6">
      <BigButton
        label="Ver todos los clientes"
        icon="people"
        color="ghost"
        size="block"
        @click="$router.push('/customers')"
      />
    </div>
  </ScreenShell>
</template>
