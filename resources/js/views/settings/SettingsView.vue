<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/composables/useToast'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import InstallPwaCard from '@/components/feedback/InstallPwaCard.vue'

const router = useRouter()
const farm = useFarmStore()
const auth = useAuthStore()
const sync = useSyncStore()
const toast = useToast()

function logout() {
  auth.logout()
  toast.info('Sesión cerrada')
  router.replace({ name: 'welcome' })
}
</script>

<template>
  <ScreenShell title="Ajustes">
    <InstallPwaCard />

    <div class="card mb-3">
      <p class="text-base font-semibold text-slate-500">Granja</p>
      <p class="text-2xl font-extrabold text-slate-800">{{ farm.farmName || '—' }}</p>
      <p class="text-sm text-slate-500">Responsable: {{ auth.user?.name }}</p>
    </div>

    <div class="flex flex-col gap-2">
      <BigButton label="Galpones y período" icon="chicken" color="ghost" size="block"
        @click="router.push('/settings/pens')" />
      <BigButton label="Categorías y causas" icon="egg" color="ghost" size="block"
        @click="router.push('/settings/catalogs')" />
      <BigButton label="Ventas" icon="money" color="ghost" size="block"
        @click="router.push('/sales')" />
      <BigButton label="Historial de cambios" icon="clipboard" color="ghost" size="block"
        @click="router.push('/settings/audit')" />
      <BigButton label="Huevos disponibles" icon="egg" color="ghost" size="block"
        @click="router.push('/eggs/inventory')" />
      <BigButton label="Clientes" icon="people" color="ghost" size="block"
        @click="router.push('/customers')" />
      <BigButton label="Reportes" icon="report" color="ghost" size="block"
        @click="router.push('/reports')" />
    </div>

    <div class="card mt-6">
      <p class="text-base font-semibold text-slate-500">Sincronización</p>
      <p class="text-lg font-bold" :class="sync.hasPending ? 'text-brand-600' : 'text-grass-600'">
        {{ sync.statusText }}
      </p>
      <p v-if="sync.lastSyncAt" class="text-xs text-slate-400">
        Última: {{ new Date(sync.lastSyncAt).toLocaleString('es-CO') }}
      </p>
    </div>

    <div class="mt-auto pt-6">
      <BigButton label="Cerrar sesión" icon="close" color="alert" size="block" @click="logout" />
    </div>

    <p class="mt-4 text-center text-xs text-slate-400">
      Mi Gallinero · v0.1.0 (MVP)
    </p>
  </ScreenShell>
</template>
