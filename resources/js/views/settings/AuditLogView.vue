<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import { fmtDateTime } from '@/utils/format'
import ScreenShell from '@/components/ui/ScreenShell.vue'

const farm = useFarmStore()

interface ChangeEntry {
  entity: string
  localUuid: string
  updatedAt: string
  createdBy: string
  entryMode?: string
  diff: Array<{ field: string; from: string; to: string }>
}

const entries = ref<ChangeEntry[]>([])

const entityLabel: Record<string, string> = {
  sale: 'Venta',
  'egg-collection': 'Tanda de huevos',
  'chicken-movement': 'Gallinas',
  customer: 'Cliente',
  vaccine: 'Vacuna',
  incident: 'Novedad',
  payment: 'Pago',
}

/** Tablas a barrer en busca de cambios auditados (con auditBefore). */
const auditTables = [
  { entity: 'sale', table: db.sales },
  { entity: 'egg-collection', table: db.eggCollections },
  { entity: 'chicken-movement', table: db.chickenMovements },
  { entity: 'customer', table: db.customers },
  { entity: 'vaccine', table: db.vaccines },
  { entity: 'incident', table: db.incidents },
  { entity: 'payment', table: db.payments },
]

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return v.toLocaleString('es-CO')
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60)
  return String(v)
}

async function load() {
  if (!farm.farmId) return
  const out: ChangeEntry[] = []
  for (const { entity, table } of auditTables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recs = (await table.where('farmId').equals(farm.farmId).toArray()) as any[]
    for (const r of recs) {
      if (!r.auditBefore || typeof r.auditBefore !== 'object') continue
      const before = r.auditBefore as Record<string, unknown>
      // Detectar los campos que cambiaron entre el snapshot y el registro actual.
      const diff: ChangeEntry['diff'] = []
      for (const [key, oldVal] of Object.entries(before)) {
        const newVal = r[key]
        // Sólo reportar cambios relevantes (no timestamps ni snapshot anidado).
        if (['updatedAt', 'auditBefore'].includes(key)) continue
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          diff.push({ field: key, from: formatVal(oldVal), to: formatVal(newVal) })
        }
      }
      if (diff.length) {
        out.push({
          entity,
          localUuid: r.localUuid,
          updatedAt: r.updatedAt,
          createdBy: r.createdBy,
          entryMode: r.entryMode,
          diff,
        })
      }
    }
  }
  entries.value = out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100)
}

onMounted(load)
</script>

<template>
  <ScreenShell title="Historial de cambios">
    <p class="mb-4 text-sm text-slate-500">
      Aquí se registran todas las correcciones y anulaciones. Cada cambio guarda
      quién, cuándo y qué valor tenía antes.
    </p>

    <div v-if="!entries.length" class="card text-center text-slate-500">
      No hay cambios auditados todavía.
    </div>

    <div v-else class="flex flex-col gap-2">
      <div v-for="(e, i) in entries" :key="e.localUuid + i" class="card">
        <div class="flex items-center justify-between">
          <p class="text-base font-bold text-slate-800">
            {{ entityLabel[e.entity] ?? e.entity }}
            <span v-if="e.entryMode === 'manual'" class="ml-1 text-xs text-brand-600">📅 fecha manual</span>
          </p>
          <span class="text-xs text-slate-400">{{ fmtDateTime(e.updatedAt) }}</span>
        </div>
        <p class="text-xs text-slate-500">
          Por: <span class="font-semibold">{{ e.createdBy }}</span>
        </p>
        <ul class="mt-2 flex flex-col gap-1">
          <li v-for="d in e.diff" :key="d.field" class="text-sm">
            <span class="font-mono text-slate-600">{{ d.field }}:</span>
            <span class="text-alert-600 line-through">{{ d.from }}</span>
            <span class="mx-1 text-slate-400">→</span>
            <span class="font-semibold text-grass-700">{{ d.to }}</span>
          </li>
        </ul>
      </div>
    </div>
  </ScreenShell>
</template>
