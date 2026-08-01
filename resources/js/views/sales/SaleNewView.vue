<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/composables/useToast'
import { useDialog } from '@/composables/useDialog'
import { useSubmit } from '@/composables/useSubmit'
import { eggStock, registerSale, saleStatus } from '@/domain/sales'
import { fmtMoney, fmtNumber, nowISO, toMoney } from '@/utils/format'
import type { SaleLine } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import Stepper from '@/components/ui/Stepper.vue'
import Icon from '@/components/ui/Icon.vue'

const router = useRouter()
const farm = useFarmStore()
const auth = useAuthStore()
const sync = useSyncStore()
const toast = useToast()
const dialog = useDialog()
const { busy, submit } = useSubmit()

const customerName = ref('')
const existingCustomerId = ref<string>('')
const categoryId = ref('')
const presentationId = ref('')
const qtyPacks = ref(1)
const unitPrice = ref(0)
const discount = ref(0)
const paid = ref(0)

const customers = ref<{ id: string; name: string }[]>([])
/** Huevos disponibles por categoría, para no vender más de lo que hay. */
const available = ref<Map<string, { available: number }>>(new Map())

onMounted(async () => {
  if (farm.sellableCategories.length) categoryId.value = farm.sellableCategories[0].localUuid
  if (farm.activePresentations.length) presentationId.value = farm.activePresentations[0].localUuid

  if (!farm.farmId) return

  const list = await db.customers.where('farmId').equals(farm.farmId).toArray()
  customers.value = list
    .filter((c) => c.active !== false)
    .map((c) => ({ id: c.localUuid, name: c.name }))

  available.value = await eggStock(farm.farmId)
})

const presentation = computed(() =>
  farm.activePresentations.find((p) => p.localUuid === presentationId.value),
)
const qtyUnits = computed(() => (presentation.value?.unitsPerPack ?? 1) * qtyPacks.value)
const subtotal = computed(() => toMoney(qtyUnits.value * Math.max(0, unitPrice.value)))

/** El descuento no puede superar el subtotal. */
const appliedDiscount = computed(() =>
  toMoney(Math.min(Math.max(0, discount.value), subtotal.value)),
)
const total = computed(() => toMoney(Math.max(0, subtotal.value - appliedDiscount.value)))
/** Tampoco se puede cobrar más de lo que vale la venta. */
const appliedPaid = computed(() => toMoney(Math.min(Math.max(0, paid.value), total.value)))
const balance = computed(() => toMoney(total.value - appliedPaid.value))
const status = computed(() => saleStatus(total.value, appliedPaid.value))

const stockForCategory = computed(() => available.value.get(categoryId.value)?.available ?? 0)
const exceedsStock = computed(() => qtyUnits.value > stockForCategory.value)

const canSave = computed(
  () =>
    !busy.value &&
    total.value > 0 &&
    qtyUnits.value > 0 &&
    (!!customerName.value.trim() || !!existingCustomerId.value),
)

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

  if (!categoryId.value || !presentationId.value) {
    toast.error('Elige la categoría y la presentación')

    return
  }

  // Aviso de inventario: no bloquea (pueden faltar recolecciones por registrar),
  // pero antes no había ninguna comprobación y se podía vender de la nada.
  if (exceedsStock.value) {
    const proceed = await dialog.confirm({
      title: 'Más de lo disponible',
      message: `Sólo tienes ${fmtNumber(stockForCategory.value)} huevos de esa categoría. ¿Registrar la venta igual?`,
      confirmLabel: 'Sí, registrar',
    })

    if (!proceed) return
  }

  const line: SaleLine = {
    categoryId: categoryId.value,
    presentationId: presentationId.value,
    qtyPacks: qtyPacks.value,
    qtyUnits: qtyUnits.value,
    unitPrice: toMoney(unitPrice.value),
    subtotal: subtotal.value,
  }

  // Si el nombre escrito coincide con un cliente existente lo reutilizamos, para
  // no crear un duplicado cada vez que se le vende a la misma persona.
  const matched = customers.value.find(
    (c) => c.name.trim().toLowerCase() === customerName.value.trim().toLowerCase(),
  )

  const saved = await submit(async () => {
    await registerSale({
      farmId: farm.farmId,
      createdBy: auth.user?.id ?? 'unknown',
      customerId: existingCustomerId.value || matched?.id,
      newCustomerName: existingCustomerId.value || matched ? undefined : customerName.value,
      soldAt: nowISO(),
      lines: [line],
      discount: appliedDiscount.value,
      paid: appliedPaid.value,
      paymentMethod: 'efectivo',
    })

    await sync.refreshPending()
    void sync.forceSync()

    return true
  })

  if (!saved) return

  toast.success(
    status.value === 'paid'
      ? 'Venta registrada. Pago completo ✓'
      : status.value === 'partial'
        ? 'Venta registrada. Falta por cobrar'
        : 'Venta registrada. Pendiente de pago',
  )

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
        <select
          v-model="categoryId"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 bg-white px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
        >
          <option v-for="c in farm.sellableCategories" :key="c.localUuid" :value="c.localUuid">
            {{ c.name }}
          </option>
        </select>
      </label>

      <p class="mb-3 text-sm text-slate-500">
        Disponibles: <strong>{{ fmtNumber(stockForCategory) }}</strong> huevos
      </p>

      <label class="mb-3 block">
        <span class="text-base font-semibold text-slate-600">Presentación</span>
        <div class="mt-1 grid grid-cols-3 gap-2">
          <button
            v-for="p in farm.activePresentations"
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
      <p
        class="mt-2 text-right text-sm"
        :class="exceedsStock ? 'font-bold text-alert-600' : 'text-slate-500'"
      >
        = {{ fmtNumber(qtyUnits) }} huevos
        <span v-if="exceedsStock"> · más de lo disponible ⚠</span>
      </p>
    </section>

    <!-- MONTO -->
    <section class="mb-6">
      <h2 class="mb-2 text-lg font-bold text-slate-600">3. ¿Cuánto?</h2>
      <label class="mb-3 block">
        <span class="text-base font-semibold text-slate-600">Precio por unidad</span>
        <input
          v-model.number="unitPrice"
          type="number"
          inputmode="numeric"
          min="0"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
        />
      </label>
      <label class="mb-3 block">
        <span class="text-base font-semibold text-slate-600">Descuento (opcional)</span>
        <input
          v-model.number="discount"
          type="number"
          inputmode="numeric"
          min="0"
          :max="subtotal"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
        />
      </label>
      <label class="mb-3 block">
        <span class="text-base font-semibold text-slate-600">Cuánto te pagaron</span>
        <input
          v-model.number="paid"
          type="number"
          inputmode="numeric"
          min="0"
          :max="total"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
        />
        <span v-if="paid > total" class="mt-1 block text-sm font-semibold text-brand-600">
          Se registrará {{ fmtMoney(total) }}: no se puede pagar más de lo que vale la venta.
        </span>
      </label>
    </section>

    <!-- RESUMEN -->
    <section class="card mb-6 bg-grass-50">
      <div class="flex items-center justify-between text-lg">
        <span class="text-slate-600">Total</span>
        <span class="text-2xl font-extrabold text-slate-800">{{ fmtMoney(total) }}</span>
      </div>
      <div v-if="balance > 0" class="mt-1 flex items-center justify-between text-lg">
        <span class="font-bold text-alert-600">Falta cobrar</span>
        <span class="text-2xl font-extrabold text-alert-600">{{ fmtMoney(balance) }}</span>
      </div>
      <div v-else class="mt-1 flex items-center gap-2 text-grass-700">
        <Icon name="save" :size="20" /> <span class="font-bold">Pago completo ✓</span>
      </div>
    </section>

    <BigButton
      :label="busy ? 'Guardando…' : 'Confirmar venta'"
      icon="money"
      size="block"
      :disabled="!canSave"
      @click="save"
    />
  </ScreenShell>
</template>
