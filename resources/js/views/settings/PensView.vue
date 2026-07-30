<script setup lang="ts">
import { ref } from 'vue'
import { useFarmStore } from '@/stores/farm'
import { useToast } from '@/composables/useToast'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'

const farm = useFarmStore()
const toast = useToast()

const showAdd = ref(false)
const newName = ref('')
const newColor = ref('#16a34a')

const colors = ['#16a34a', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ec4899', '#64748b', '#dc2626']

async function addPen() {
  if (!newName.value.trim()) {
    toast.error('Escribe el nombre del galpón')
    return
  }
  await farm.addPen(newName.value.trim(), newColor.value)
  toast.success(`Galpón "${newName.value.trim()}" creado`)
  newName.value = ''
  newColor.value = '#16a34a'
  showAdd.value = false
}

async function toggleActive(id: string, active: boolean) {
  await farm.updatePen(id, { active: !active })
  toast.info(active ? 'Galpón desactivado' : 'Galpón activado')
}

/** Editar candado de período. */
const lockInput = ref<string>(String(farm.periodLockDays))
function saveLock() {
  const days = parseInt(lockInput.value, 10)
  if (!Number.isFinite(days) || days < 0) {
    toast.error('Escribe un número de días válido')
    return
  }
  farm.setPeriodLockDays(days)
  toast.success(`Candado configurado: ${days} días`)
}
</script>

<template>
  <ScreenShell title="Galpones">
    <section class="mb-6">
      <h2 class="mb-2 text-lg font-bold text-slate-600">Mis galpones</h2>
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
            @click="toggleActive(p.localUuid, true)"
          >
            Desactivar
          </button>
        </div>
      </div>

      <!-- Añadir galpón (modo sencillo para adulto mayor) -->
      <BigButton
        :label="showAdd ? 'Cancelar' : '+ Agregar galpón'"
        :icon="showAdd ? 'close' : 'plus'"
        :color="showAdd ? 'ghost' : 'amber'"
        size="block"
        class="mt-3"
        @click="showAdd = !showAdd"
      />

      <div v-if="showAdd" class="card mt-2 flex flex-col gap-3">
        <label class="block">
          <span class="text-base font-semibold text-slate-600">Nombre del galpón</span>
          <input
            v-model="newName"
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
              :class="newColor === c ? 'ring-slate-700' : 'ring-transparent'"
              :style="{ background: c }"
              @click="newColor = c"
            />
          </div>
        </div>
        <BigButton label="Crear galpón" icon="save" size="block" @click="addPen" />
      </div>
    </section>

    <!-- Candado de período -->
    <section class="card bg-brand-50">
      <h2 class="mb-1 text-lg font-extrabold text-brand-700">🔒 Candado de período</h2>
      <p class="mb-3 text-sm text-slate-600">
        ¿Hasta cuántos días hacia atrás permites registrar datos? Sirve para impedir
        cambios en registros viejos (un administrador siempre puede autorizar fechas
        anteriores con un motivo).
      </p>
      <div class="flex items-end gap-2">
        <label class="flex-1">
          <span class="text-base font-semibold text-slate-600">Días permitidos</span>
          <input
            v-model="lockInput"
            type="number"
            inputmode="numeric"
            min="0"
            max="365"
            class="mt-1 w-full rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
          />
        </label>
        <BigButton label="Guardar" icon="save" @click="saveLock" />
      </div>
      <p class="mt-2 text-xs text-slate-500">
        Actual: {{ farm.periodLockDays }} días · Ejemplo: con 7 días, no se permite
        registrar nada anterior a esa semana salvo autorización.
      </p>
    </section>
  </ScreenShell>
</template>
