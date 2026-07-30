<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/composables/useToast'
import { useDialog } from '@/composables/useDialog'
import { fmtCOP, fmtDate, nowISO } from '@/utils/format'
import type { Sale, Customer } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'

const farm = useFarmStore()
const sync = useSyncStore()
const toast = useToast()
const dialog = useDialog()

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

const statusLabel: Record<string, { text: string; cls: string }> = {
  paid: { text: 'Pagada', cls: 'bg-grass-100 text-grass-700' },
  partial: { text: 'Parcial', cls: 'bg-brand-100 text-brand-700' },
  pending: { text: 'Pendiente', cls: 'bg-alert-100 text-alert-700' },
  void: { text: 'Anulada', cls: 'bg-slate-200 text-slate-500 line-through' },
}

function customerName(id: string): string {
  return customers.value.find((c) => c.localUuid === id)?.name ?? '—'
}

/**
 * Anula una venta: cambia estado a `void`, revierte el saldo del cliente,
 * registra snapshot en auditBefore y deja registro para sync.
 */
async function voidSale(sale: Sale) {
  if (sale.status === 'void') {
    toast.info('Esta venta ya está anulada')
    return
  }
  const ok = await dialog.confirm({
    title: 'Anular venta',
    message: `¿Seguro que quieres anular la venta de ${fmtCOP(sale.total)} a ${customerName(sale.customerId)}? Los huevos volverán al inventario y se registrará el cambio en auditoría.`,
  })
  if (!ok) return

  const ts = nowISO()
  // JSON plano para que IndexedDB pueda clonarlo (las ventas tienen arrays de líneas).
  const before = JSON.parse(JSON.stringify(sale)) as unknown
  await db.sales.update(sale.localUuid, {
    status: 'void',
    balance: 0,
    auditBefore: before,
    updatedAt: ts,
    pendingSync: true,
  })

  // Revertir saldo del cliente.
  const cust = customers.value.find((c) => c.localUuid === sale.customerId)
  if (cust) {
    await db.customers.update(cust.localUuid, {
      balance: Math.max(0, cust.balance - sale.balance),
      updatedAt: ts,
      pendingSync: true,
    })
  }

  await sync.refreshPending()
  sync.forceSync()
  await load()
  toast.success('Venta anulada. Los huevos vuelven al inventario.')
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
          <span class="rounded-full px-2 py-1 text-xs font-bold" :class="statusLabel[s.status]?.cls">
            {{ statusLabel[s.status]?.text ?? s.status }}
          </span>
        </div>
        <div class="mt-2 flex items-center justify-between">
          <div class="text-sm text-slate-600">
            <span class="font-bold">{{ fmtCOP(s.total) }}</span>
            <span v-if="s.discount > 0" class="ml-1 text-slate-400">(-{{ fmtCOP(s.discount) }})</span>
          </div>
          <div v-if="s.balance > 0 && s.status !== 'void'" class="text-sm font-bold text-alert-600">
            Debe {{ fmtCOP(s.balance) }}
          </div>
        </div>
        <div v-if="s.status !== 'void'" class="mt-2">
          <BigButton label="Anular venta" icon="close" color="alert" size="block"
            @click="voidSale(s)" />
        </div>
      </div>
    </div>

    <div class="mt-6">
      <BigButton label="Nueva venta" icon="money" color="amber" size="block"
        @click="$router.push('/sales/new')" />
    </div>
  </ScreenShell>
</template>
