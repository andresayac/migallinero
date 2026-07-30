<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/composables/useToast'
import { uuid, nowISO, fmtCOP, toCOP } from '@/utils/format'
import type { Sale, SaleLine, SaleStatus } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import Stepper from '@/components/ui/Stepper.vue'
import Icon from '@/components/ui/Icon.vue'

const router = useRouter()
const farm = useFarmStore()
const auth = useAuthStore()
const sync = useSyncStore()
const toast = useToast()

// Estado del formulario paso a paso
const customerName = ref('')
const existingCustomerId = ref<string>('')
const categoryId = ref('')
const presentationId = ref('')
const qtyPacks = ref(1)
const unitPrice = ref(0)
const discount = ref(0)
const paid = ref(0)

const customers = ref<{ id: string; name: string }[]>([])

onMounted(async () => {
  if (farm.sellableCategories.length) categoryId.value = farm.sellableCategories[0].localUuid
  if (farm.presentations.length) presentationId.value = farm.presentations[0].localUuid
  if (farm.farmId) {
    const list = await db.customers.where('farmId').equals(farm.farmId).toArray()
    customers.value = list.map((c) => ({ id: c.localUuid, name: c.name }))
  }
})

const presentation = computed(() =>
  farm.presentations.find((p) => p.localUuid === presentationId.value),
)
const qtyUnits = computed(() => (presentation.value?.unitsPerPack ?? 1) * qtyPacks.value)
const subtotal = computed(() => qtyUnits.value * unitPrice.value)
const total = computed(() => toCOP(Math.max(0, subtotal.value - discount.value)))
const balance = computed(() => toCOP(Math.max(0, total.value - paid.value)))
const status = computed<SaleStatus>(() => {
  if (paid.value <= 0) return 'pending'
  if (paid.value >= total.value) return 'paid'
  return 'partial'
})

async function save() {
  if (!farm.farmId) return
  if (!customerName.value.trim() && !existingCustomerId.value) {
    toast.error('Escribe el nombre del cliente')
    return
  }
  if (qtyUnits.value <= 0) {
    toast.error('Falta la cantidad de huevos')
    return
  }

  const ts = nowISO()
  // Cliente nuevo o usar existente
  let customerId = existingCustomerId.value
  if (!customerId && customerName.value.trim()) {
    const newCustomer = {
      localUuid: uuid(),
      farmId: farm.farmId,
      name: customerName.value.trim(),
      active: true,
      balance: 0,
      pendingSync: true,
      createdAt: ts,
      updatedAt: ts,
      createdBy: auth.user?.id ?? 'unknown',
    }
    await db.customers.add(newCustomer)
    customerId = newCustomer.localUuid
  }

  const line: SaleLine = {
    categoryId: categoryId.value,
    presentationId: presentationId.value,
    qtyPacks: qtyPacks.value,
    qtyUnits: qtyUnits.value,
    unitPrice: unitPrice.value,
    subtotal: subtotal.value,
  }

  const sale: Sale = {
    type: 'sale',
    localUuid: uuid(),
    farmId: farm.farmId,
    customerId,
    soldAt: ts,
    total: total.value,
    discount: toCOP(discount.value),
    paid: toCOP(paid.value),
    balance: balance.value,
    status: status.value,
    lines: [line],
    pendingSync: true,
    createdAt: ts,
    updatedAt: ts,
    createdBy: auth.user?.id ?? 'unknown',
  }
  await db.sales.add(sale)
  await db.syncQueue.add({
    farmId: farm.farmId,
    entity: 'sale',
    action: 'create',
    localUuid: sale.localUuid,
    payload: sale,
    attempts: 0,
    createdAt: ts,
  })

  // Actualizar saldo del cliente
  const cust = await db.customers.get(customerId)
  if (cust) {
    await db.customers.update(cust.localUuid, {
      balance: cust.balance + balance.value,
      updatedAt: ts,
    })
  }

  await sync.refreshPending()
  sync.forceSync()

  const msg =
    status.value === 'paid'
      ? 'Venta registrada. Pago completo ✓'
      : status.value === 'partial'
        ? 'Venta registrada. Falta por cobrar'
        : 'Venta registrada. Pendiente de pago'
  toast.success(msg)
  router.replace({ name: 'home' })
}
</script>

<template>
  <ScreenShell title="Nueva venta">
    <!-- CLIENTE -->
    <section class="mb-6">
      <h2 class="mb-2 text-lg font-bold text-slate-600">1. ¿A quién?</h2>
      <input
        v-model="customerName"
        type="text"
        list="customers-list"
        placeholder="Nombre del cliente"
        class="w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
      />
      <datalist id="customers-list">
        <option v-for="c in customers" :key="c.id" :value="c.name" />
      </datalist>
    </section>

    <!-- PRODUCTO -->
    <section class="mb-6">
      <h2 class="mb-2 text-lg font-bold text-slate-600">2. ¿Qué vendiste?</h2>
      <label class="mb-3 block">
        <span class="text-base font-semibold text-slate-600">Categoría</span>
        <select v-model="categoryId"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 bg-white px-4 py-3 text-xl focus:border-grass-500 focus:outline-none">
          <option v-for="c in farm.sellableCategories" :key="c.localUuid" :value="c.localUuid">
            {{ c.name }}
          </option>
        </select>
      </label>
      <label class="mb-3 block">
        <span class="text-base font-semibold text-slate-600">Presentación</span>
        <div class="mt-1 grid grid-cols-3 gap-2">
          <button
            v-for="p in farm.presentations"
            :key="p.localUuid"
            type="button"
            :class="[
              'rounded-xl2 border-2 px-2 py-3 text-base font-bold',
              presentationId === p.localUuid
                ? 'border-grass-500 bg-grass-50 text-grass-700'
                : 'border-slate-200 bg-white text-slate-600',
            ]"
            @click="presentationId = p.localUuid"
          >
            {{ p.name }}
          </button>
        </div>
      </label>
      <Stepper v-model="qtyPacks" :min="0" label="Cantidad" />
      <p class="mt-2 text-right text-sm text-slate-500">
        = {{ qtyUnits }} huevos
      </p>
    </section>

    <!-- MONTO -->
    <section class="mb-6">
      <h2 class="mb-2 text-lg font-bold text-slate-600">3. ¿Cuánto?</h2>
      <label class="mb-3 block">
        <span class="text-base font-semibold text-slate-600">Precio por unidad (COP)</span>
        <input v-model.number="unitPrice" type="number" inputmode="numeric" min="0"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none" />
      </label>
      <label class="mb-3 block">
        <span class="text-base font-semibold text-slate-600">Descuento (opcional)</span>
        <input v-model.number="discount" type="number" inputmode="numeric" min="0"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none" />
      </label>
      <label class="mb-3 block">
        <span class="text-base font-semibold text-slate-600">Cuánto te pagaron</span>
        <input v-model.number="paid" type="number" inputmode="numeric" min="0"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none" />
      </label>
    </section>

    <!-- RESUMEN -->
    <section class="card mb-6 bg-grass-50">
      <div class="flex items-center justify-between text-lg">
        <span class="text-slate-600">Total</span>
        <span class="text-2xl font-extrabold text-slate-800">{{ fmtCOP(total) }}</span>
      </div>
      <div v-if="balance > 0" class="mt-1 flex items-center justify-between text-lg">
        <span class="font-bold text-alert-600">Falta cobrar</span>
        <span class="text-2xl font-extrabold text-alert-600">{{ fmtCOP(balance) }}</span>
      </div>
      <div v-else class="mt-1 flex items-center gap-2 text-grass-700">
        <Icon name="save" :size="20" /> <span class="font-bold">Pago completo ✓</span>
      </div>
    </section>

    <BigButton label="Confirmar venta" icon="money" size="block" :disabled="total <= 0" @click="save" />
  </ScreenShell>
</template>
