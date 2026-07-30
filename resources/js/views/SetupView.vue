<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFarmStore } from '@/stores/farm'
import BigButton from '@/components/ui/BigButton.vue'
import Icon from '@/components/ui/Icon.vue'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const auth = useAuthStore()
const farm = useFarmStore()
const toast = useToast()

/**
 * Asistente guiado de configuración inicial.
 *
 * Se ejecuta justo después del registro. El usuario ya tiene su granja
 * creada con catálogos por defecto; aquí puede personalizarlos antes
 * de entrar a la app. Todo lo que edite se guarda en Dexie (local) y,
 * si hay backend, se sincroniza.
 *
 * Pasos:
 *  0. Bienvenida
 *  1. Galpones
 *  2. Categorías de huevo
 *  3. Causas de mortalidad
 *  4. Presentaciones de venta
 *  5. Candado de período + moneda
 *  6. ¡Listo!
 */
const step = ref(0)
const totalSteps = 7
const busy = ref(false)

const colors = ['#16a34a', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ec4899', '#64748b', '#dc2626']

// --- Estado editable de cada paso ---
// Galpones
const pensName = ref('')
const penColor = ref(colors[0])

// Categorías de huevo
const catName = ref('')
const catShort = ref('')
const catColor = ref(colors[0])
const catSellable = ref(true)

// Causas
const causeName = ref('')

// Presentaciones
const presName = ref('')
const presUnits = ref(1)

// Candado + moneda
const lockDays = ref(7)
const currency = ref('COP')

const currencies = [
  { code: 'COP', label: 'Peso colombiano (COP)' },
  { code: 'MXN', label: 'Peso mexicano (MXN)' },
  { code: 'PEN', label: 'Sol peruano (PEN)' },
  { code: 'ARS', label: 'Peso argentino (ARS)' },
  { code: 'USD', label: 'Dólar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
]

const stepTitle = computed(() => {
  const titles = [
    '¡Bienvenido!',
    'Tus galpones',
    'Categorías de huevo',
    'Causas de muerte',
    'Presentaciones de venta',
    'Candado y moneda',
    '¡Todo listo!',
  ]
  return titles[step.value] ?? ''
})

const stepHint = computed(() => {
  const hints = [
    'Vamos a configurar tu granja en pocos pasos. Ya creamos todo con valores de ejemplo; ajústalo a tu gusto.',
    'Un galpón es cada espacio donde tienes gallinas. Puedes tener uno o varios.',
    'Estas son las clases de huevo que recolectas y vendes. Puedes agregar, quitar o cambiar colores.',
    'Cuando una gallina muere, registras la causa. Edita la lista a las que uses.',
    'Cómo vendes los huevos: por unidad, cubeta, torre… Agrega las que uses.',
    'El candado evita editar registros muy viejos. La moneda es para tus ventas.',
    'Tu granja quedó configurada. Ya puedes empezar a registrar.',
  ]
  return hints[step.value] ?? ''
})

const progress = computed(() => Math.round(((step.value + 1) / totalSteps) * 100))

// --- Acciones de cada paso ---

async function addPen() {
  if (!pensName.value.trim()) {
    toast.error('Escribe el nombre del galpón')
    return
  }
  await farm.addPen(pensName.value.trim(), penColor.value)
  toast.success(`Galpón "${pensName.value.trim()}" agregado`)
  pensName.value = ''
  penColor.value = colors[0]
}

async function removePen(id: string) {
  await farm.updatePen(id, { active: false })
  toast.info('Galpón desactivado')
}

async function addCategory() {
  if (!catName.value.trim()) {
    toast.error('Escribe el nombre de la categoría')
    return
  }
  await farm.addCatalogItem('egg_categories', {
    name: catName.value.trim(),
    short: catShort.value.trim() || catName.value.trim().slice(0, 3).toUpperCase(),
    sellable: catSellable.value,
    isBroken: false,
    color: catColor.value,
  })
  toast.success(`"${catName.value.trim()}" agregado`)
  catName.value = ''
  catShort.value = ''
  catColor.value = colors[0]
  catSellable.value = true
}

async function removeCategory(id: string) {
  await farm.updateCatalogItem('egg_categories', id, { active: false })
  toast.info('Categoría desactivada')
}

async function addCause() {
  if (!causeName.value.trim()) {
    toast.error('Escribe la causa')
    return
  }
  await farm.addCatalogItem('mortality_causes', { name: causeName.value.trim() })
  toast.success(`"${causeName.value.trim()}" agregado`)
  causeName.value = ''
}

async function removeCause(id: string) {
  await farm.updateCatalogItem('mortality_causes', id, { active: false })
  toast.info('Causa desactivada')
}

async function addPresentation() {
  if (!presName.value.trim()) {
    toast.error('Escribe el nombre')
    return
  }
  if (presUnits.value <= 0) {
    toast.error('Las unidades deben ser mayor que 0')
    return
  }
  await farm.addCatalogItem('presentations', {
    code: 'custom',
    name: presName.value.trim(),
    unitsPerPack: presUnits.value,
  })
  toast.success(`"${presName.value.trim()}" agregado`)
  presName.value = ''
  presUnits.value = 1
}

async function removePresentation(id: string) {
  await farm.updateCatalogItem('presentations', id, { active: false })
  toast.info('Presentación desactivada')
}

/** Guarda candado + moneda y finaliza el asistente. */
async function finish() {
  busy.value = true
  try {
    await farm.applySetupConfig({
      periodLockDays: lockDays.value,
      currency: currency.value,
    })
    toast.success('¡Tu granja está lista!')
    router.replace({ name: 'home' })
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    busy.value = false
  }
}

function next() {
  if (step.value < totalSteps - 1) step.value++
}

function back() {
  if (step.value > 0) step.value--
}

/** Saltar el asistente y entrar directo a la app. */
function skip() {
  router.replace({ name: 'home' })
}
</script>

<template>
  <div class="screen pt-[env(safe-area-inset-top)]">
    <!-- Barra de progreso -->
    <div class="mb-4 flex items-center gap-3">
      <button
        v-if="step > 0"
        type="button"
        class="flex min-w-touch items-center justify-center rounded-xl2 bg-white px-4 py-3 text-lg font-bold text-slate-600 active:bg-slate-100"
        aria-label="Atrás"
        @click="back"
      >
        <Icon name="back" :size="24" />
      </button>
      <div class="flex-1">
        <div class="h-3 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            class="h-full rounded-full bg-grass-500 transition-all duration-300"
            :style="{ width: `${progress}%` }"
          />
        </div>
        <p class="mt-1 text-sm font-semibold text-slate-500">
          Paso {{ step + 1 }} de {{ totalSteps }}
        </p>
      </div>
      <button
        type="button"
        class="text-sm font-bold text-slate-400 underline"
        @click="skip"
      >
        Saltar
      </button>
    </div>

    <main class="flex-1 overflow-y-auto pb-4">
      <!-- Paso 0: Bienvenida -->
      <section v-if="step === 0" class="flex flex-col items-center gap-6 text-center">
        <div class="rounded-full bg-grass-100 p-6 text-grass-600">
          <Icon name="chicken" :size="80" />
        </div>
        <div>
          <h1 class="text-3xl font-extrabold text-slate-800">{{ stepTitle }}</h1>
          <p class="mt-2 max-w-md text-lg text-slate-600">{{ stepHint }}</p>
        </div>
        <div class="card w-full max-w-md text-left">
          <p class="text-base font-bold text-slate-700">Tu granja:</p>
          <p class="text-2xl font-extrabold text-grass-700">{{ farm.farmName }}</p>
          <p class="text-sm text-slate-500">Responsable: {{ auth.user?.name }}</p>
        </div>
        <p class="max-w-md text-sm text-slate-500">
          Ya creamos galpones, categorías y causas de ejemplo. En los siguientes
          pasos puedes ajustarlos a tu granja real. Todo se puede cambiar después
          desde Ajustes.
        </p>
      </section>

      <!-- Paso 1: Galpones -->
      <section v-else-if="step === 1" class="flex flex-col gap-4">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">{{ stepTitle }}</h1>
          <p class="text-sm text-slate-600">{{ stepHint }}</p>
        </div>

        <div class="flex flex-col gap-2">
          <div
            v-for="p in farm.activePens"
            :key="p.localUuid"
            class="card flex items-center gap-3"
          >
            <span class="h-6 w-6 rounded-full" :style="{ background: p.color }" />
            <span class="flex-1 text-xl font-bold text-slate-800">{{ p.name }}</span>
            <button
              type="button"
              class="rounded-xl2 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 active:bg-slate-200"
              @click="removePen(p.localUuid)"
            >
              Quitar
            </button>
          </div>
          <p v-if="farm.activePens.length === 0" class="text-sm text-slate-400">
            No tienes galpones activos. Agrega uno abajo.
          </p>
        </div>

        <div class="card flex flex-col gap-3">
          <label class="block">
            <span class="text-base font-semibold text-slate-600">Nombre del galpón</span>
            <input
              v-model="pensName"
              type="text"
              placeholder="Ej: Galpón 2"
              class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
            />
          </label>
          <div>
            <span class="text-base font-semibold text-slate-600">Color</span>
            <div class="mt-1 flex flex-wrap gap-2">
              <button
                v-for="c in colors"
                :key="c"
                type="button"
                class="h-10 w-10 rounded-full ring-2 ring-offset-2"
                :class="penColor === c ? 'ring-slate-700' : 'ring-transparent'"
                :style="{ background: c }"
                @click="penColor = c"
              />
            </div>
          </div>
          <BigButton label="Agregar galpón" icon="plus" color="amber" size="block" @click="addPen" />
        </div>
      </section>

      <!-- Paso 2: Categorías de huevo -->
      <section v-else-if="step === 2" class="flex flex-col gap-4">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">{{ stepTitle }}</h1>
          <p class="text-sm text-slate-600">{{ stepHint }}</p>
        </div>

        <div class="flex flex-col gap-2">
          <div
            v-for="c in farm.categories.filter((x) => x.active)"
            :key="c.localUuid"
            class="card flex items-center gap-3"
            :style="{ borderLeft: `8px solid ${c.color}` }"
          >
            <div class="flex-1">
              <p class="text-xl font-bold text-slate-800">{{ c.name }}</p>
              <p class="text-xs text-slate-500">
                {{ c.short }} · {{ c.sellable ? 'Vendible' : 'No vendible' }}{{ c.isBroken ? ' · Rotos' : '' }}
              </p>
            </div>
            <button
              type="button"
              class="rounded-xl2 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 active:bg-slate-200"
              @click="removeCategory(c.localUuid)"
            >
              Quitar
            </button>
          </div>
        </div>

        <div class="card flex flex-col gap-3">
          <label class="block">
            <span class="text-base font-semibold text-slate-600">Nombre</span>
            <input
              v-model="catName"
              type="text"
              placeholder="Ej: Extra grande"
              class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
            />
          </label>
          <label class="block">
            <span class="text-base font-semibold text-slate-600">Abreviatura (opcional)</span>
            <input
              v-model="catShort"
              type="text"
              maxlength="4"
              placeholder="Ej: XL"
              class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
            />
          </label>
          <div>
            <span class="text-base font-semibold text-slate-600">Color</span>
            <div class="mt-1 flex flex-wrap gap-2">
              <button
                v-for="c in colors"
                :key="c"
                type="button"
                class="h-10 w-10 rounded-full ring-2 ring-offset-2"
                :class="catColor === c ? 'ring-slate-700' : 'ring-transparent'"
                :style="{ background: c }"
                @click="catColor = c"
              />
            </div>
          </div>
          <label class="flex items-center gap-2">
            <input
              v-model="catSellable"
              type="checkbox"
              class="h-6 w-6 rounded accent-grass-500"
            />
            <span class="text-base font-semibold text-slate-600">Se puede vender</span>
          </label>
          <BigButton label="Agregar categoría" icon="plus" color="amber" size="block" @click="addCategory" />
        </div>
      </section>

      <!-- Paso 3: Causas de mortalidad -->
      <section v-else-if="step === 3" class="flex flex-col gap-4">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">{{ stepTitle }}</h1>
          <p class="text-sm text-slate-600">{{ stepHint }}</p>
        </div>

        <div class="flex flex-col gap-2">
          <div
            v-for="c in farm.causes.filter((x) => x.active)"
            :key="c.localUuid"
            class="card flex items-center gap-3"
          >
            <span class="flex-1 text-xl font-bold text-slate-800">{{ c.name }}</span>
            <button
              type="button"
              class="rounded-xl2 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 active:bg-slate-200"
              @click="removeCause(c.localUuid)"
            >
              Quitar
            </button>
          </div>
        </div>

        <div class="card flex flex-col gap-3">
          <label class="block">
            <span class="text-base font-semibold text-slate-600">Nueva causa</span>
            <input
              v-model="causeName"
              type="text"
              placeholder="Ej: Depredador"
              class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
            />
          </label>
          <BigButton label="Agregar causa" icon="plus" color="amber" size="block" @click="addCause" />
        </div>
      </section>

      <!-- Paso 4: Presentaciones -->
      <section v-else-if="step === 4" class="flex flex-col gap-4">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">{{ stepTitle }}</h1>
          <p class="text-sm text-slate-600">{{ stepHint }}</p>
        </div>

        <div class="flex flex-col gap-2">
          <div
            v-for="p in farm.presentations.filter((x) => x.active)"
            :key="p.localUuid"
            class="card flex items-center gap-3"
          >
            <div class="flex-1">
              <p class="text-xl font-bold text-slate-800">{{ p.name }}</p>
              <p class="text-sm text-slate-500">{{ p.unitsPerPack }} huevos por unidad</p>
            </div>
            <button
              type="button"
              class="rounded-xl2 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 active:bg-slate-200"
              @click="removePresentation(p.localUuid)"
            >
              Quitar
            </button>
          </div>
        </div>

        <div class="card flex flex-col gap-3">
          <label class="block">
            <span class="text-base font-semibold text-slate-600">Nombre</span>
            <input
              v-model="presName"
              type="text"
              placeholder="Ej: Docena (12)"
              class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
            />
          </label>
          <label class="block">
            <span class="text-base font-semibold text-slate-600">¿Cuántos huevos equivalen?</span>
            <input
              v-model.number="presUnits"
              type="number"
              min="1"
              inputmode="numeric"
              class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
            />
          </label>
          <BigButton label="Agregar presentación" icon="plus" color="amber" size="block" @click="addPresentation" />
        </div>
      </section>

      <!-- Paso 5: Candado + moneda -->
      <section v-else-if="step === 5" class="flex flex-col gap-4">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">{{ stepTitle }}</h1>
          <p class="text-sm text-slate-600">{{ stepHint }}</p>
        </div>

        <div class="card bg-brand-50">
          <h2 class="mb-1 text-lg font-extrabold text-brand-700">🔒 Candado de período</h2>
          <p class="mb-3 text-sm text-slate-600">
            ¿Hasta cuántos días hacia atrás permites registrar datos? Sirve para
            impedir cambios en registros viejos.
          </p>
          <label class="block">
            <span class="text-base font-semibold text-slate-600">Días permitidos</span>
            <input
              v-model.number="lockDays"
              type="number"
              inputmode="numeric"
              min="0"
              max="365"
              class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
            />
          </label>
          <p class="mt-2 text-xs text-slate-500">
            Con {{ lockDays }} días, no se permite registrar nada anterior a esa
            ventana salvo autorización de admin.
          </p>
        </div>

        <div class="card">
          <h2 class="mb-1 text-lg font-extrabold text-slate-700">💰 Moneda</h2>
          <p class="mb-3 text-sm text-slate-600">
            Moneda en la que registras tus ventas.
          </p>
          <label class="block">
            <span class="text-base font-semibold text-slate-600">Moneda</span>
            <select
              v-model="currency"
              class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
            >
              <option v-for="c in currencies" :key="c.code" :value="c.code">
                {{ c.label }}
              </option>
            </select>
          </label>
        </div>
      </section>

      <!-- Paso 6: Listo -->
      <section v-else class="flex flex-col items-center gap-6 text-center">
        <div class="rounded-full bg-grass-100 p-6 text-grass-600">
          <Icon name="chicken" :size="80" />
        </div>
        <div>
          <h1 class="text-3xl font-extrabold text-slate-800">{{ stepTitle }}</h1>
          <p class="mt-2 max-w-md text-lg text-slate-600">{{ stepHint }}</p>
        </div>
        <div class="card w-full max-w-md text-left">
          <p class="text-base font-bold text-slate-700">Resumen:</p>
          <ul class="mt-2 space-y-1 text-sm text-slate-600">
            <li>🐔 Galpones: {{ farm.activePens.length }}</li>
            <li>🥚 Categorías de huevo: {{ farm.categories.filter((c) => c.active).length }}</li>
            <li>💀 Causas de muerte: {{ farm.causes.filter((c) => c.active).length }}</li>
            <li>📦 Presentaciones: {{ farm.presentations.filter((p) => p.active).length }}</li>
            <li>🔒 Candado: {{ lockDays }} días</li>
            <li>💰 Moneda: {{ currency }}</li>
          </ul>
        </div>
        <p class="max-w-md text-sm text-slate-500">
          Puedes cambiar todo esto después desde Ajustes.
        </p>
      </section>
    </main>

    <!-- Botones de navegación -->
    <div class="flex gap-2 pt-2">
      <BigButton
        v-if="step < totalSteps - 1"
        label="Continuar"
        icon="save"
        size="block"
        @click="next"
      />
      <BigButton
        v-else
        label="Empezar a usar"
        icon="save"
        size="block"
        :disabled="busy"
        @click="finish"
      />
    </div>
  </div>
</template>
