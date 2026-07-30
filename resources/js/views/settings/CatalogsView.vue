<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFarmStore } from '@/stores/farm'
import { useToast } from '@/composables/useToast'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import { useDialog } from '@/composables/useDialog'

const farm = useFarmStore()
const toast = useToast()
const dialog = useDialog()

type Tab = 'categories' | 'causes' | 'presentations'
const tab = ref<Tab>('categories')

const colors = ['#16a34a', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ec4899', '#64748b', '#dc2626']

const showAdd = ref(false)
const newName = ref('')
const newColor = ref(colors[0])
const newUnits = ref(1)

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'categories', label: 'Categorías de huevo' },
  { id: 'causes', label: 'Causas de muerte' },
  { id: 'presentations', label: 'Presentaciones' },
]

const currentTabLabel = computed(() => tabs.find((t) => t.id === tab.value)?.label.toLowerCase() ?? '')

async function addItem() {
  if (!newName.value.trim()) {
    toast.error('Escribe un nombre')
    return
  }
  if (tab.value === 'categories') {
    await farm.addCatalogItem('egg_categories', {
      name: newName.value.trim(),
      short: newName.value.trim().slice(0, 3).toUpperCase(),
      sellable: true,
      isBroken: false,
      color: newColor.value,
    })
  } else if (tab.value === 'causes') {
    await farm.addCatalogItem('mortality_causes', { name: newName.value.trim() })
  } else {
    if (newUnits.value <= 0) {
      toast.error('Las unidades deben ser mayor que 0')
      return
    }
    await farm.addCatalogItem('presentations', {
      code: 'custom',
      name: newName.value.trim(),
      unitsPerPack: newUnits.value,
    })
  }
  toast.success(`"${newName.value.trim()}" agregado`)
  newName.value = ''
  newColor.value = colors[0]
  newUnits.value = 1
  showAdd.value = false
}

async function rename(id: string, currentName: string) {
  const name = await dialog.prompt({
    title: 'Renombrar',
    label: 'Nuevo nombre',
    defaultValue: currentName,
  })
  if (name && name !== currentName) {
    const kind = tab.value === 'categories' ? 'egg_categories' : tab.value === 'causes' ? 'mortality_causes' : 'presentations'
    await farm.updateCatalogItem(kind, id, { name })
    toast.success('Renombrado')
  }
}

async function toggleActive(id: string, active: boolean) {
  const kind = tab.value === 'categories' ? 'egg_categories' : tab.value === 'causes' ? 'mortality_causes' : 'presentations'
  await farm.updateCatalogItem(kind, id, { active: !active })
  toast.info(active ? 'Desactivado' : 'Activado')
}

async function setColor(id: string, color: string) {
  await farm.updateCatalogItem('egg_categories', id, { color })
}
</script>

<template>
  <ScreenShell title="Categorías y causas">
    <!-- Tabs -->
    <div class="mb-4 grid grid-cols-3 gap-2">
      <button v-for="t in tabs" :key="t.id" type="button"
        :class="['rounded-xl2 border-2 px-2 py-3 text-xs font-bold',
          tab === t.id ? 'border-grass-500 bg-grass-50 text-grass-700' : 'border-slate-200 bg-white text-slate-600']"
        @click="tab = t.id; showAdd = false">
        {{ t.label }}
      </button>
    </div>

    <p class="mb-3 text-sm text-slate-500">
      Aquí puedes agregar, renombrar o desactivar {{currentTabLabel}}. Los cambios se guardan
      automáticamente.
    </p>

    <!-- Lista -->
    <div class="flex flex-col gap-2">
      <!-- Categorías de huevo -->
      <template v-if="tab === 'categories'">
        <div v-for="c in farm.categories" :key="c.localUuid"
          class="card flex items-center gap-3" :style="{ borderLeft: `8px solid ${c.color}` }">
          <div class="flex-1">
            <p class="text-xl font-bold text-slate-800" :class="{ 'opacity-40 line-through': !c.active }">{{ c.name }}</p>
            <div class="mt-1 flex flex-wrap gap-1">
              <button v-for="col in colors" :key="col" type="button"
                class="h-5 w-5 rounded-full ring-1 ring-offset-1"
                :class="c.color === col ? 'ring-slate-700' : 'ring-transparent'"
                :style="{ background: col }"
                @click="setColor(c.localUuid, col)" />
            </div>
          </div>
          <button type="button" class="rounded-xl2 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 active:bg-slate-200"
            @click="rename(c.localUuid, c.name)">✎</button>
          <button type="button" class="rounded-xl2 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 active:bg-slate-200"
            @click="toggleActive(c.localUuid, c.active)">{{ c.active ? '👁' : '🚫' }}</button>
        </div>
      </template>

      <!-- Causas -->
      <template v-else-if="tab === 'causes'">
        <div v-for="c in farm.causes" :key="c.localUuid" class="card flex items-center gap-3">
          <span class="flex-1 text-xl font-bold text-slate-800" :class="{ 'opacity-40 line-through': !c.active }">{{ c.name }}</span>
          <button type="button" class="rounded-xl2 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 active:bg-slate-200"
            @click="rename(c.localUuid, c.name)">✎</button>
          <button type="button" class="rounded-xl2 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 active:bg-slate-200"
            @click="toggleActive(c.localUuid, c.active)">{{ c.active ? '👁' : '🚫' }}</button>
        </div>
      </template>

      <!-- Presentaciones -->
      <template v-else>
        <div v-for="p in farm.presentations" :key="p.localUuid" class="card flex items-center gap-3">
          <div class="flex-1">
            <p class="text-xl font-bold text-slate-800" :class="{ 'opacity-40 line-through': !p.active }">{{ p.name }}</p>
            <p class="text-sm text-slate-500">{{ p.unitsPerPack }} huevos por unidad</p>
          </div>
          <button type="button" class="rounded-xl2 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 active:bg-slate-200"
            @click="rename(p.localUuid, p.name)">✎</button>
          <button type="button" class="rounded-xl2 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 active:bg-slate-200"
            @click="toggleActive(p.localUuid, p.active)">{{ p.active ? '👁' : '🚫' }}</button>
        </div>
      </template>
    </div>

    <BigButton :label="showAdd ? 'Cancelar' : '+ Agregar'"
      :icon="showAdd ? 'close' : 'plus'"
      :color="showAdd ? 'ghost' : 'amber'"
      size="block" class="mt-4"
      @click="showAdd = !showAdd" />

    <div v-if="showAdd" class="card mt-2 flex flex-col gap-3">
      <label class="block">
        <span class="text-base font-semibold text-slate-600">Nombre</span>
        <input v-model="newName" type="text" placeholder="Ej: Extra grande"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none" />
      </label>
      <div v-if="tab === 'categories'">
        <span class="text-base font-semibold text-slate-600">Color</span>
        <div class="mt-1 flex flex-wrap gap-2">
          <button v-for="c in colors" :key="c" type="button"
            class="h-10 w-10 rounded-full ring-2 ring-offset-2"
            :class="newColor === c ? 'ring-slate-700' : 'ring-transparent'"
            :style="{ background: c }" @click="newColor = c" />
        </div>
      </div>
      <label v-if="tab === 'presentations'" class="block">
        <span class="text-base font-semibold text-slate-600">Huevos que equivalen</span>
        <input v-model.number="newUnits" type="number" min="1" inputmode="numeric"
          class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none" />
      </label>
      <BigButton label="Guardar" icon="save" size="block" @click="addItem" />
    </div>
  </ScreenShell>
</template>
