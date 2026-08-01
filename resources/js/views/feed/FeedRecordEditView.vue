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
import type { FeedRecord, FeedRecordLine } from '@/types/domain'
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

const selectedPenId = ref<string>('')
const observation = ref('')
const shift = ref<'morning' | 'afternoon'>('morning')

/** Cantidades (kg) por tipo de alimento. Admiten decimales. */
const qtyByFeed = ref<Record<string, number>>(
  Object.fromEntries(farm.activeFeedTypes.map((f) => [f.localUuid, 0])),
)
/** Costo unitario por unidad de alimento. */
const costByFeed = ref<Record<string, number>>(
  Object.fromEntries(farm.activeFeedTypes.map((f) => [f.localUuid, 0])),
)

const selectedAt = ref<string>(nowISO())
const dateSelector = ref<InstanceType<typeof DateSelector> | null>(null)

const totalQty = computed(() =>
  round2(farm.activeFeedTypes.reduce((sum, f) => sum + (qtyByFeed.value[f.localUuid] ?? 0), 0)),
)
const totalCost = computed(() =>
  toMoney(
    farm.activeFeedTypes.reduce((sum, f) => {
      const qty = qtyByFeed.value[f.localUuid] ?? 0
      const cost = costByFeed.value[f.localUuid] ?? 0

      return sum + qty * cost
    }, 0),
  ),
)

/** Los kilos se guardan con dos decimales, igual que la columna del backend. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

onMounted(() => {
  selectedPenId.value = farm.activePenId || (farm.activePens.length ? farm.activePens[0].localUuid : '')

  for (const f of farm.activeFeedTypes) {
    if (qtyByFeed.value[f.localUuid] === undefined) qtyByFeed.value[f.localUuid] = 0
    if (costByFeed.value[f.localUuid] === undefined) costByFeed.value[f.localUuid] = 0
  }

  // Turno automático según la hora del dispositivo.
  shift.value = new Date().getHours() < 12 ? 'morning' : 'afternoon'
})

// ── Keypad state ──────────────────────────────────────────────────
const keypadOpen = ref(false)
const keypadFeedId = ref('')
const keypadFeedName = ref('')
const keypadField = ref<'qty' | 'cost'>('qty')

function openQtyKeypad(feedId: string, feedName: string) {
  keypadFeedId.value = feedId
  keypadFeedName.value = feedName
  keypadField.value = 'qty'
  keypadOpen.value = true
}

function openCostKeypad(feedId: string, feedName: string) {
  keypadFeedId.value = feedId
  keypadFeedName.value = feedName
  keypadField.value = 'cost'
  keypadOpen.value = true
}

function onKeypadConfirm(val: number) {
  if (keypadField.value === 'qty') {
    qtyByFeed.value[keypadFeedId.value] = val
  } else {
    costByFeed.value[keypadFeedId.value] = val
  }
}

const keypadValue = computed(() => {
  if (keypadField.value === 'qty') return qtyByFeed.value[keypadFeedId.value] ?? 0
  return costByFeed.value[keypadFeedId.value] ?? 0
})

async function save() {
  if (!farm.farmId) return

  if (!selectedPenId.value) {
    toast.error('Selecciona el galpón')

    return
  }

  if (totalQty.value === 0) {
    toast.error('Agrega al menos un tipo de alimento')

    return
  }

  if (dateSelector.value && !dateSelector.value.isValid) {
    toast.error(dateSelector.value.validationMessage || 'La fecha no está permitida')

    return
  }

  const ts = nowISO()

  const lineRecords: FeedRecordLine[] = farm.activeFeedTypes
    .map((f) => {
      const qty = round2(qtyByFeed.value[f.localUuid] ?? 0)
      const unitCost = toMoney(costByFeed.value[f.localUuid] ?? 0)

      return {
        feedTypeId: f.localUuid,
        feedTypeName: f.name,
        qty,
        unitCost,
        subtotal: toMoney(qty * unitCost),
      }
    })
    .filter((l) => l.qty > 0)

  const record: FeedRecord = {
    type: 'feed-record',
    localUuid: uuid(),
    farmId: farm.farmId,
    penId: selectedPenId.value,
    recordedAt: selectedAt.value,
    shift: shift.value,
    observation: observation.value || undefined,
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
    await createRecord('feed-record', record)

    await sync.refreshPending()
    void sync.forceSync()

    return true
  })

  if (!saved) return

  toast.success('Registro de alimento guardado')
  router.replace({ name: 'home' })
}
</script>

<template>
  <ScreenShell title="Consumo de alimento">
    <p class="mb-4 text-sm text-slate-500">
      ¿Cuánto alimento usaste hoy? Registra por turno (mañana/tarde) para llevar el control.
    </p>

    <!-- Galpón -->
    <div class="mb-3 flex flex-col gap-1">
      <label class="text-base font-semibold text-slate-600">Galpón</label>
      <select
        v-model="selectedPenId"
        class="rounded-xl2 border-2 border-slate-200 bg-white px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
      >
        <option v-for="p in farm.activePens" :key="p.localUuid" :value="p.localUuid">{{ p.name }}</option>
      </select>
    </div>

    <!-- Fecha del consumo: antes estaba fija a "ahora" y no se podía cambiar -->
    <DateSelector
      ref="dateSelector"
      v-model="selectedAt"
      :can-override="auth.isAdmin"
      label="¿Cuándo se dio el alimento?"
      class="mb-3"
    />

    <!-- Turno -->
    <div class="mb-3 flex gap-2">
      <button
        type="button"
        class="flex-1 rounded-xl2 border-2 px-4 py-3 text-lg font-bold transition"
        :class="shift === 'morning' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-500'"
        @click="shift = 'morning'"
      >
        🌅 Mañana
      </button>
      <button
        type="button"
        class="flex-1 rounded-xl2 border-2 px-4 py-3 text-lg font-bold transition"
        :class="shift === 'afternoon' ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'"
        @click="shift = 'afternoon'"
      >
        🌇 Tarde
      </button>
    </div>

    <!-- Tarjetas de tipo de alimento -->
    <div class="flex flex-col gap-3">
      <div
        v-for="ft in farm.activeFeedTypes"
        :key="ft.localUuid"
        class="card"
      >
        <div class="mb-2 flex items-center justify-between">
          <span class="text-xl font-extrabold text-slate-800">{{ ft.name }}</span>
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{{ ft.unit }}</span>
        </div>

        <!-- Fila de cantidad -->
        <button
          type="button"
          class="flex w-full items-center justify-between rounded-xl2 border-2 border-slate-200 px-4 py-3 active:border-grass-500"
          @click="openQtyKeypad(ft.localUuid, ft.name)"
        >
          <span class="text-base font-semibold text-slate-500">Cantidad ({{ ft.unit }})</span>
          <span
            class="text-2xl font-extrabold tabular-nums"
            :class="qtyByFeed[ft.localUuid] > 0 ? 'text-slate-800' : 'text-slate-300'"
          >
            {{ qtyByFeed[ft.localUuid] > 0 ? fmtNumber(qtyByFeed[ft.localUuid], 2) : '—' }}
          </span>
        </button>

        <!-- Fila de costo unitario -->
        <button
          type="button"
          class="mt-2 flex w-full items-center justify-between rounded-xl2 border-2 border-slate-200 px-4 py-3 active:border-grass-500"
          @click="openCostKeypad(ft.localUuid, ft.name)"
        >
          <span class="text-base font-semibold text-slate-500">Costo / {{ ft.unit }}</span>
          <span
            class="text-2xl font-extrabold tabular-nums"
            :class="costByFeed[ft.localUuid] > 0 ? 'text-slate-800' : 'text-slate-300'"
          >
            {{ costByFeed[ft.localUuid] > 0 ? fmtMoney(costByFeed[ft.localUuid]) : '—' }}
          </span>
        </button>

        <!-- Subtotal de esta línea -->
        <p
          v-if="qtyByFeed[ft.localUuid] > 0 && costByFeed[ft.localUuid] > 0"
          class="mt-2 text-right text-sm font-bold text-grass-600"
        >
          Subtotal: {{ fmtMoney(qtyByFeed[ft.localUuid] * costByFeed[ft.localUuid]) }}
        </p>
      </div>
    </div>

    <!-- Observación -->
    <label class="mt-4 block">
      <span class="text-base font-semibold text-slate-600">¿Algo para recordar? (opcional)</span>
      <textarea
        v-model="observation"
        rows="2"
        placeholder="Ej: se cambió de marca de concentrado"
        class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-lg focus:border-grass-500 focus:outline-none"
      />
    </label>

    <!-- Totales -->
    <div class="card mt-4 bg-grass-50">
      <div class="flex items-center justify-between">
        <span class="text-lg font-bold text-slate-600">Total alimento</span>
        <span class="text-mega font-extrabold text-grass-600">{{ fmtNumber(totalQty, 2) }}</span>
      </div>
      <div v-if="totalCost > 0" class="mt-2 flex items-center justify-between border-t border-grass-200 pt-2">
        <span class="text-lg font-bold text-slate-600">Total costo</span>
        <span class="text-3xl font-extrabold text-grass-700">{{ fmtMoney(totalCost) }}</span>
      </div>
    </div>

    <div class="mt-6">
      <BigButton
        :label="busy ? 'Guardando…' : 'Guardar registro'"
        icon="save"
        size="block"
        :disabled="busy"
        @click="save"
      />
    </div>

    <!-- Keypad (reutilizado para cantidad y costo).
         La cantidad admite 2 decimales, igual que la columna `qty` del backend:
         antes el teclado forzaba enteros y no se podían registrar 12,5 kg. -->
    <NumericKeypad
      :open="keypadOpen"
      :model-value="keypadValue"
      :decimals="keypadField === 'qty' ? 2 : 0"
      :title="keypadField === 'qty' ? `${keypadFeedName} — Cantidad` : `${keypadFeedName} — Costo por unidad`"
      :color="keypadField === 'qty' ? '#16a34a' : '#1d4ed8'"
      @update:model-value="onKeypadConfirm"
      @close="keypadOpen = false"
    />
  </ScreenShell>
</template>
