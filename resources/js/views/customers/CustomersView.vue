<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '@/db/db'
import { useFarmStore } from '@/stores/farm'
import { fmtCOP } from '@/utils/format'
import type { Customer } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'

const router = useRouter()
const farm = useFarmStore()
const customers = ref<Customer[]>([])

async function load() {
  if (!farm.farmId) return
  customers.value = (
    await db.customers.where('farmId').equals(farm.farmId).toArray()
  ).sort((a, b) => a.name.localeCompare(b.name))
}
onMounted(load)
</script>

<template>
  <ScreenShell title="Clientes">
    <div v-if="!customers.length" class="card text-center text-slate-500">
      Aún no tienes clientes. Aparecerán aquí cuando registres una venta.
    </div>

    <div v-else class="flex flex-col gap-2">
      <div v-for="c in customers" :key="c.localUuid" class="card flex items-center gap-3">
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-600">
          {{ c.name.charAt(0).toUpperCase() }}
        </div>
        <div class="flex-1">
          <p class="text-xl font-bold text-slate-800">{{ c.name }}</p>
          <p v-if="c.phone" class="text-sm text-slate-500">📞 {{ c.phone }}</p>
        </div>
        <p v-if="c.balance > 0" class="text-lg font-extrabold text-alert-600">
          {{ fmtCOP(c.balance) }}
        </p>
      </div>
    </div>

    <div class="mt-6">
      <BigButton label="Nueva venta" icon="money" color="amber" size="block"
        @click="router.push('/sales/new')" />
    </div>
  </ScreenShell>
</template>
