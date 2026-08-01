<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { create as createRecord } from '@/db/repository'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/composables/useToast'
import { useSubmit } from '@/composables/useSubmit'
import { fmtMoney, fmtNumber, toMoney, uuid, nowISO } from '@/utils/format'
import type { FeedPurchase, FeedPurchaseLine } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import DateSelector from '@/components/ui/DateSelector.vue'
import NumericKeypad from '@/components/ui/NumericKeypad.vue'

const router = useRouter()
const farm = useFarmStore()
const auth = useAuthStore()
const sync = useSyncStore()
const toast = useToast()
const { busy, submit } = useSubmit()

/** Los kilos por bulto se guardan con 2 decimales, igual que el backend. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

const supplier = ref('')
const observation = ref('')
const purchasedAt = ref<string>(nowISO())
const dateSelector = ref<InstanceType<typeof DateSelector> | null>(null)

/** Bultos por tipo de alimento. */
const bagsByFeed = ref<Record<string, number>>(
  Object.fromEntries(farm.activeFeedTypes.map((f) => [f.localUuid, 0])),
)
/** Kg por bulto (tamaño del bulto: 40, 50…). Admite decimales. */
const kgPerBagByFeed = ref<Record<string, number>>(
  Object.fromEntries(farm.activeFeedTypes.map((f) => [f.localUuid, 0])),
)
/** Costo por bulto. */
const costPerBagByFeed = ref<Record<string, number>>(
  Object.fromEntries(farm.activeFeedTypes.map((f) => [f.localUuid, 0])),
)

const totalBags = computed(() =>
  farm.activeFeedTypes.reduce((sum, f) => sum + (bagsByFeed.value[f.localUuid] ?? 0), 0),
)
const totalQty = computed(() =>
  round2(
    farm.activeFeedTypes.reduce((sum, f) => {
      const bags = bagsByFeed.value[f.localUuid] ?? 0
      const kg = kgPerBagByFeed.value[f.localUuid] ?? 0

      return sum + bags * kg
    }, 0),
  ),
)
const totalCost = computed(() =>
  toMoney(
    farm.activeFeedTypes.reduce((sum, f) => {
      const bags = bagsByFeed.value[f.localUuid] ?? 0
      const cost = costPerBagByFeed.value[f.localUuid] ?? 0

      return sum + bags * cost
    }, 0),
  ),
)

onMounted(() => {
  for (const f of farm.activeFeedTypes) {
    if (bagsByFeed.value[f.localUuid] === undefined) bagsByFeed.value[f.localUuid] = 0
    if (kgPerBagByFeed.value[f.localUuid] === undefined) kgPerBagByFeed.value[f.localUuid] = 0
    if (costPerBagByFeed.value[f.localUuid] === undefined) costPerBagByFeed.value[f.localUuid] = 0
  }
})

// ── Keypad state ──────────────────────────────────────────────────
const keypadOpen = ref(false)
const keypadFeedId = ref('')
const keypadFeedName = ref('')
type KeypadField = 'bags' | 'kgPerBag' | 'costPerBag'
const keypadField = ref<KeypadField>('bags')

const keypadTitles: Record<KeypadField, string> = {
  bags: 'Bultos',
  kgPerBag: 'Kg por bulto',
  costPerBag: 'Costo por bulto',
}

const keypadColors: Record<KeypadField, string> = {
  bags: '#16a34a',
  kgPerBag: '#1d4ed8',
  costPerBag: '#dc2626',
}

function openKeypad(feedId: string, feedName: string, field: KeypadField) {
  keypadFeedId.value = feedId
  keypadFeedName.value = feedName
  keypadField.value = field
  keypadOpen.value = true
}

function onKeypadConfirm(val: number) {
  if (keypadField.value === 'bags') bagsByFeed.value[keypadFeedId.value] = val
  else if (keypadField.value === 'kgPerBag') kgPerBagByFeed.value[keypadFeedId.value] = val
  else costPerBagByFeed.value[keypadFeedId.value] = val
}

const keypadValue = computed(() => {
  const id = keypadFeedId.value
  if (keypadField.value === 'bags') return bagsByFeed.value[id] ?? 0
  if (keypadField.value === 'kgPerBag') return kgPerBagByFeed.value[id] ?? 0
  return costPerBagByFeed.value[id] ?? 0
})

async function save() {
  if (!farm.farmId) return

  if (totalBags.value === 0) {
    toast.error('Agrega al menos un bulto')

    return
  }

  if (dateSelector.value && !dateSelector.value.isValid) {
    toast.error(dateSelector.value.validationMessage || 'La fecha no está permitida')

    return
  }

  const ts = nowISO()

  const lineRecords: FeedPurchaseLine[] = farm.activeFeedTypes
    .map((f) => {
      const bags = bagsByFeed.value[f.localUuid] ?? 0
      const kgPerBag = round2(kgPerBagByFeed.value[f.localUuid] ?? 0)
      const unitCost = toMoney(costPerBagByFeed.value[f.localUuid] ?? 0)

      return {
        feedTypeId: f.localUuid,
        feedTypeName: f.name,
        bags,
        kgPerBag,
        unitCost,
        subtotal: toMoney(bags * unitCost),
      }
    })
    .filter((l) => l.bags > 0)

  const purchase: FeedPurchase = {
    type: 'feed-purchase',
    localUuid: uuid(),
    farmId: farm.farmId,
    purchasedAt: purchasedAt.value,
    supplier: supplier.value || undefined,
    observation: observation.value || undefined,
    totalBags: totalBags.value,
    totalQty: totalQty.value,
    totalCost: totalCost.value,
    lines: lineRecords,
    pendingSync: true,
    entryMode: dateSelector.value?.entryMode ?? 'auto',
    manualReason: dateSelector.value?.manualReason,
    createdAt: ts,
    updatedAt: ts,
    createdBy: auth.user?.id ?? 'unknown',
  }

  const saved = await submit(async () => {
    await createRecord('feed-purchase', purchase)

    await sync.refreshPending()
    void sync.forceSync()

    return true
  })

  if (!saved) return

  toast.success('Compra de alimento registrada')
  router.replace({ name: 'home' })
}
</script>

<template>
  <ScreenShell title="Comprar alimento">
    <p class="mb-4 text-sm text-slate-500">
      Registra los bultos de alimento que compraste. Así sabrás cuánto tienes y cuánto gastaste.
    </p>

    <!-- Proveedor -->
    <label class="mb-4 block">
      <span class="text-base font-semibold text-slate-600">¿Dónde lo compraste? (opcional)</span>
      <input
        v-model="supplier"
        type="text"
        placeholder="Ej: Agroinsumos del Valle"
        class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
      />
    </label>

    <!-- Fecha de la compra: antes estaba fija a "ahora" y no se podía cambiar -->
    <DateSelector
      ref="dateSelector"
      v-model="purchasedAt"
      :can-override="auth.isAdmin"
      label="¿Cuándo la compraste?"
      class="mb-4"
    />

    <!-- Tarjetas de tipo de alimento -->
    <div class="flex flex-col gap-3">
      <div
        v-for="ft in farm.activeFeedTypes"
        :key="ft.localUuid"
        class="card"
      >
        <div class="mb-2 flex items-center justify-between">
          <span class="text-xl font-extrabold text-slate-800">{{ ft.name }}</span>
        </div>

        <!-- Bultos -->
        <button
          type="button"
          class="flex w-full items-center justify-between rounded-xl2 border-2 border-slate-200 px-4 py-3 active:border-grass-500"
          @click="openKeypad(ft.localUuid, ft.name, 'bags')"
        >
          <span class="text-base font-semibold text-slate-500">Bultos</span>
          <span
            class="text-2xl font-extrabold tabular-nums"
            :class="bagsByFeed[ft.localUuid] > 0 ? 'text-slate-800' : 'text-slate-300'"
          >
            {{ bagsByFeed[ft.localUuid] > 0 ? bagsByFeed[ft.localUuid] : '—' }}
          </span>
        </button>

        <!-- Kg por bulto -->
        <button
          type="button"
          class="mt-2 flex w-full items-center justify-between rounded-xl2 border-2 border-slate-200 px-4 py-3 active:border-grass-500"
          @click="openKeypad(ft.localUuid, ft.name, 'kgPerBag')"
        >
          <span class="text-base font-semibold text-slate-500">Kg por bulto</span>
          <span
            class="text-2xl font-extrabold tabular-nums"
            :class="kgPerBagByFeed[ft.localUuid] > 0 ? 'text-slate-800' : 'text-slate-300'"
          >
            {{ kgPerBagByFeed[ft.localUuid] > 0 ? fmtNumber(kgPerBagByFeed[ft.localUuid], 2) + ' kg' : '—' }}
          </span>
        </button>

        <!-- Costo por bulto -->
        <button
          type="button"
          class="mt-2 flex w-full items-center justify-between rounded-xl2 border-2 border-slate-200 px-4 py-3 active:border-grass-500"
          @click="openKeypad(ft.localUuid, ft.name, 'costPerBag')"
        >
          <span class="text-base font-semibold text-slate-500">Costo / bulto</span>
          <span
            class="text-2xl font-extrabold tabular-nums"
            :class="costPerBagByFeed[ft.localUuid] > 0 ? 'text-slate-800' : 'text-slate-300'"
          >
            {{ costPerBagByFeed[ft.localUuid] > 0 ? fmtMoney(costPerBagByFeed[ft.localUuid]) : '—' }}
          </span>
        </button>

        <!-- Subtotal de esta línea -->
        <p
          v-if="bagsByFeed[ft.localUuid] > 0 && costPerBagByFeed[ft.localUuid] > 0"
          class="mt-2 text-right text-sm font-bold text-grass-600"
        >
          Subtotal: {{ fmtMoney(bagsByFeed[ft.localUuid] * costPerBagByFeed[ft.localUuid]) }}
          <span v-if="kgPerBagByFeed[ft.localUuid] > 0">
            · {{ fmtNumber(bagsByFeed[ft.localUuid] * kgPerBagByFeed[ft.localUuid], 2) }} kg
          </span>
        </p>
      </div>
    </div>

    <!-- Observación -->
    <label class="mt-4 block">
      <span class="text-base font-semibold text-slate-600">¿Algo para recordar? (opcional)</span>
      <textarea
        v-model="observation"
        rows="2"
        placeholder="Ej: compré a crédito, pago el viernes"
        class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-lg focus:border-grass-500 focus:outline-none"
      />
    </label>

    <!-- Totales -->
    <div class="card mt-4 bg-grass-50">
      <div class="flex items-center justify-between">
        <span class="text-lg font-bold text-slate-600">Total bultos</span>
        <span class="text-mega font-extrabold text-grass-600">{{ totalBags }}</span>
      </div>
      <div v-if="totalQty > 0" class="mt-1 flex items-center justify-between">
        <span class="text-base font-semibold text-slate-500">Total kilos</span>
        <span class="text-2xl font-bold text-slate-700">{{ fmtNumber(totalQty, 2) }} kg</span>
      </div>
      <div v-if="totalCost > 0" class="mt-2 flex items-center justify-between border-t border-grass-200 pt-2">
        <span class="text-lg font-bold text-slate-600">Total gastado</span>
        <span class="text-3xl font-extrabold text-grass-700">{{ fmtMoney(totalCost) }}</span>
      </div>
    </div>

    <div class="mt-6">
      <BigButton
        :label="busy ? 'Guardando…' : 'Guardar compra'"
        icon="save"
        size="block"
        :disabled="busy"
        @click="save"
      />
    </div>

    <!-- Keypad -->
    <!-- Los kg por bulto admiten 2 decimales (40,5 kg es un tamaño común):
         antes el teclado forzaba enteros y no se podía registrar. -->
    <NumericKeypad
      :open="keypadOpen"
      :model-value="keypadValue"
      :decimals="keypadField === 'kgPerBag' ? 2 : 0"
      :title="`${keypadFeedName} — ${keypadTitles[keypadField]}`"
      :color="keypadColors[keypadField]"
      @update:model-value="onKeypadConfirm"
      @close="keypadOpen = false"
    />
  </ScreenShell>
</template>