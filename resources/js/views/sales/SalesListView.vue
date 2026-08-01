<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/composables/useToast'
import { useDialog } from '@/composables/useDialog'
import { useSubmit } from '@/composables/useSubmit'
import { voidSale as voidSaleOperation } from '@/domain/sales'
import { fmtMoney, fmtDate } from '@/utils/format'
import { saleStatusClass, saleStatusLabel } from '@/utils/labels'
import type { Sale, Customer } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'

const farm = useFarmStore()
const auth = useAuthStore()
const sync = useSyncStore()
const toast = useToast()
const dialog = useDialog()
const { busy, submit } = useSubmit()

const sales = ref<Sale[]>([])
const customers = ref<Customer[]>([])

async function load() {
  if (!farm.farmId) return
  ;[sales.value, customers.value] = await Promise.all([
    db.sales.where('farmId').equals(farm.farmId).reverse().sortBy('soldAt'),
    db.customers.where('farmId').equals(farm.farmId).toArray(),
  ])
}
onMounted(load)

function customerName(id: string): string {
  return customers.value.find((c) => c.localUuid === id)?.name ?? '—'
}

/**
 * Anula una venta.
 *
 * La operación completa (marcar `void`, anular los pagos asociados y recalcular
 * el saldo del cliente) vive en `domain/sales.ts`. Antes se hacía aquí a mano y
 * dejaba los pagos intactos, así que una venta anulada seguía contando como
 * ingreso en los reportes; y nada de lo que cambiaba se encolaba para subir.
 *
 * Sólo el admin puede anular: es la misma regla que aplica el backend.
 */
async function voidSale(sale: Sale) {
  if (sale.status === 'void') {
    toast.info('Esta venta ya está anulada')

    return
  }

  if (!auth.isAdmin) {
    toast.error('Sólo el administrador puede anular ventas')

    return
  }

  const ok = await dialog.confirm({
    title: 'Anular venta',
    message: `¿Seguro que quieres anular la venta de ${fmtMoney(sale.total)} a ${customerName(sale.customerId)}? Los huevos vuelven al inventario, los pagos se anulan y queda registrado en la auditoría.`,
    confirmLabel: 'Sí, anular',
    danger: true,
  })

  if (!ok) return

  const done = await submit(
    async () => {
      await voidSaleOperation(sale)

      await sync.refreshPending()
      void sync.forceSync()
      await load()

      return true
    },
    { errorMessage: 'No se pudo anular la venta' },
  )

  if (done) toast.success('Venta anulada. Los huevos vuelven al inventario.')
}
</script>

<template>
  <ScreenShell title="Ventas">
    <div v-if="!sales.length" class="card text-center text-slate-500">
      Aún no has registrado ventas.
    </div>

    <div v-else class="flex flex-col gap-2">
      <div v-for="s in sales" :key="s.localUuid" class="card"
        :class="{ 'opacity-60': s.status === 'void' }">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-lg font-bold text-slate-800">{{ customerName(s.customerId) }}</p>
            <p class="text-sm text-slate-500">{{ fmtDate(s.soldAt) }}</p>
          </div>
          <span class="rounded-full px-2 py-1 text-xs font-bold" :class="saleStatusClass(s.status)">
            {{ saleStatusLabel(s.status) }}
          </span>
        </div>
        <div class="mt-2 flex items-center justify-between">
          <div class="text-sm text-slate-600">
            <span class="font-bold">{{ fmtMoney(s.total) }}</span>
            <span v-if="s.discount > 0" class="ml-1 text-slate-400">(-{{ fmtMoney(s.discount) }})</span>
          </div>
          <div v-if="s.balance > 0 && s.status !== 'void'" class="text-sm font-bold text-alert-600">
            Debe {{ fmtMoney(s.balance) }}
          </div>
        </div>
        <div v-if="s.status !== 'void' && auth.isAdmin" class="mt-2">
          <BigButton
            :label="busy ? 'Anulando…' : 'Anular venta'"
            icon="close"
            color="alert"
            size="block"
            :disabled="busy"
            @click="voidSale(s)"
          />
        </div>
      </div>
    </div>

    <div class="mt-6">
      <BigButton label="Nueva venta" icon="money" color="amber" size="block"
        @click="$router.push('/sales/new')" />
    </div>
  </ScreenShell>
</template>
