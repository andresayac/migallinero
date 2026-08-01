<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useFarmStore } from '@/stores/farm'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/composables/useToast'
import { useDialog } from '@/composables/useDialog'
import { useSubmit } from '@/composables/useSubmit'
import { api } from '@/api/http'
import { fmtDateTime } from '@/utils/format'
import type { SyncQueueItem } from '@/types/domain'
import ScreenShell from '@/components/ui/ScreenShell.vue'
import BigButton from '@/components/ui/BigButton.vue'
import InstallPwaCard from '@/components/feedback/InstallPwaCard.vue'

const router = useRouter()
const farm = useFarmStore()
const auth = useAuthStore()
const sync = useSyncStore()
const toast = useToast()
const dialog = useDialog()
const { busy, submit } = useSubmit()

const failed = ref<SyncQueueItem[]>([])

async function loadFailed() {
  failed.value = await sync.failedItems()
}

onMounted(async () => {
  await sync.refreshPending()
  await loadFailed()
})

/**
 * Cierra la sesión.
 *
 * Pregunta si borrar los datos del dispositivo: en un teléfono compartido
 * quedaban en IndexedDB indefinidamente y sin ninguna forma de limpiarlos. Si
 * hay registros sin subir avisa antes, para no perderlos.
 */
async function logout() {
  const pending = sync.pendingCount + sync.failedCount

  if (pending > 0) {
    const proceed = await dialog.confirm({
      title: 'Hay registros sin subir',
      message: `Tienes ${pending} registro(s) que aún no están en el servidor. Si cierras sesión y borras los datos, se perderán. ¿Continuar?`,
      confirmLabel: 'Sí, continuar',
      danger: true,
    })

    if (!proceed) return
  }

  const wipe = await dialog.confirm({
    title: '¿Borrar los datos de este dispositivo?',
    message:
      'Recomendado si el celular lo usa más gente. Tus datos siguen en el servidor y vuelven al iniciar sesión.',
    confirmLabel: 'Sí, borrar',
    danger: true,
  })

  await auth.logout()
  await farm.reset({ wipeData: wipe })

  toast.info('Sesión cerrada')
  router.replace({ name: 'welcome' })
}

/** Cambio de contraseña: única vía, porque no hay recuperación por correo. */
async function changePassword() {
  const current = await dialog.prompt({
    title: 'Cambiar contraseña',
    label: 'Escribe tu contraseña actual',
  })

  if (current === null) return

  const next = await dialog.prompt({
    title: 'Nueva contraseña',
    label: 'Mínimo 8 caracteres',
  })

  if (next === null) return

  const confirmation = await dialog.prompt({
    title: 'Repite la nueva contraseña',
    label: 'Para asegurarnos de que no hay errores de tecleo',
  })

  if (confirmation === null) return

  if (next !== confirmation) {
    toast.error('Las dos contraseñas no coinciden')

    return
  }

  await submit(
    async () => {
      await api.changePassword(current, next, confirmation)
      toast.success('Contraseña actualizada')

      return true
    },
    { errorMessage: 'No se pudo cambiar la contraseña' },
  )
}

/**
 * Define el PIN de administrador, que es lo que autoriza registrar fuera del
 * período permitido. Antes el campo del PIN existía en la interfaz pero nunca se
 * comprobaba, así que el candado no protegía de nada.
 */
async function setPin() {
  const pin = await dialog.prompt({
    title: 'PIN de administrador',
    label: 'De 4 a 8 números. Autoriza registrar fechas viejas.',
    inputMode: 'numeric',
  })

  if (pin === null) return

  if (!/^\d{4,8}$/.test(pin)) {
    toast.error('El PIN debe tener entre 4 y 8 números')

    return
  }

  const current = await dialog.prompt({
    title: 'Confirma con tu contraseña',
    label: 'Por seguridad, escribe tu contraseña actual',
  })

  if (current === null) return

  await submit(
    async () => {
      await api.setPin(pin, current)
      toast.success('PIN actualizado')

      return true
    },
    { errorMessage: 'No se pudo guardar el PIN' },
  )
}

async function retryFailed() {
  await sync.retryFailed()
  await loadFailed()
  toast.info('Reintentando subir los registros')
}

async function discard(item: SyncQueueItem) {
  const ok = await dialog.confirm({
    title: 'Descartar registro',
    message: `Este registro no se podrá recuperar. ${item.lastError ?? ''}`,
    confirmLabel: 'Sí, descartar',
    danger: true,
  })

  if (!ok || item.id === undefined) return

  await sync.discardFailed(item.id)
  await loadFailed()
}

async function forceSyncNow() {
  await submit(async () => {
    await sync.pullFromServer()
    await sync.forceSync()
    await loadFailed()

    return true
  })
}

/** Etiqueta legible del tipo de registro que falló. */
function entityLabel(entity: string): string {
  const labels: Record<string, string> = {
    sale: 'Venta',
    payment: 'Pago',
    customer: 'Cliente',
    'egg-collection': 'Tanda de huevos',
    'chicken-movement': 'Movimiento de gallinas',
    vaccine: 'Vacuna',
    incident: 'Novedad',
    'feed-record': 'Consumo de alimento',
    'feed-purchase': 'Compra de alimento',
    pen: 'Galpón',
    'egg-category': 'Categoría de huevo',
    presentation: 'Presentación',
    'mortality-cause': 'Causa de muerte',
    'feed-type': 'Tipo de alimento',
  }

  return labels[entity] ?? entity
}
</script>

<template>
  <ScreenShell title="Ajustes">
    <InstallPwaCard />

    <div class="card mb-3">
      <p class="text-base font-semibold text-slate-500">Granja</p>
      <p class="text-2xl font-extrabold text-slate-800">{{ farm.farmName || '—' }}</p>
      <p class="text-sm text-slate-500">
        Responsable: {{ auth.user?.name }}
        <span v-if="auth.role" class="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">
          {{ auth.role }}
        </span>
      </p>
      <p class="mt-1 text-xs text-slate-400">
        {{ farm.currency }} · {{ farm.timezone }} · candado {{ farm.periodLockDays }} días
      </p>
    </div>

    <div class="flex flex-col gap-2">
      <BigButton
        v-if="auth.isAdmin"
        label="Galpones y período"
        icon="chicken"
        color="ghost"
        size="block"
        @click="router.push('/settings/pens')"
      />
      <BigButton
        v-if="auth.isAdmin"
        label="Categorías, causas y alimento"
        icon="egg"
        color="ghost"
        size="block"
        @click="router.push('/settings/catalogs')"
      />
      <BigButton
        v-if="auth.canSell"
        label="Ventas"
        icon="money"
        color="ghost"
        size="block"
        @click="router.push('/sales')"
      />
      <BigButton
        label="Historial de cambios"
        icon="clipboard"
        color="ghost"
        size="block"
        @click="router.push('/settings/audit')"
      />
      <BigButton
        label="Huevos disponibles"
        icon="egg"
        color="ghost"
        size="block"
        @click="router.push('/eggs/inventory')"
      />
      <BigButton
        v-if="auth.canSell"
        label="Clientes"
        icon="people"
        color="ghost"
        size="block"
        @click="router.push('/customers')"
      />
      <BigButton
        label="Reportes"
        icon="report"
        color="ghost"
        size="block"
        @click="router.push('/reports')"
      />
    </div>

    <!-- Seguridad -->
    <div v-if="auth.hasBackendSession" class="mt-6 flex flex-col gap-2">
      <p class="text-base font-semibold text-slate-500">Seguridad</p>
      <BigButton
        label="Cambiar contraseña"
        icon="save"
        color="ghost"
        size="block"
        :disabled="busy"
        @click="changePassword"
      />
      <BigButton
        v-if="auth.isAdmin"
        label="PIN de administrador"
        icon="save"
        color="ghost"
        size="block"
        :disabled="busy"
        @click="setPin"
      />
    </div>

    <!-- Sincronización -->
    <div class="card mt-6">
      <p class="text-base font-semibold text-slate-500">Sincronización</p>
      <p
        class="text-lg font-bold"
        :class="
          sync.hasFailed ? 'text-alert-600' : sync.hasPending ? 'text-brand-600' : 'text-grass-600'
        "
      >
        {{ sync.statusText }}
      </p>
      <p v-if="sync.lastSyncAt" class="text-xs text-slate-400">
        Última: {{ fmtDateTime(sync.lastSyncAt) }}
      </p>
      <p v-if="!auth.hasBackendSession" class="mt-1 text-sm text-brand-700">
        Esta granja sólo está en el dispositivo. Inicia sesión para respaldarla en el servidor.
      </p>

      <BigButton
        v-if="auth.hasBackendSession"
        :label="busy || sync.syncing ? 'Sincronizando…' : 'Sincronizar ahora'"
        icon="save"
        color="ghost"
        size="block"
        class="mt-3"
        :disabled="busy || sync.syncing"
        @click="forceSyncNow"
      />
    </div>

    <!-- Registros rechazados por el servidor -->
    <div v-if="failed.length" class="card mt-3 bg-alert-50">
      <p class="text-base font-extrabold text-alert-700">Registros sin subir</p>
      <p class="text-sm text-alert-700">
        El servidor rechazó estos registros. Corrige el dato o descártalos.
      </p>

      <div class="mt-3 flex flex-col gap-2">
        <div
          v-for="item in failed"
          :key="item.id"
          class="rounded-xl2 bg-white px-3 py-2 text-left text-sm"
        >
          <p class="font-bold text-slate-700">{{ entityLabel(item.entity) }}</p>
          <p class="text-slate-500">{{ item.lastError }}</p>
          <button
            type="button"
            class="mt-1 text-xs font-bold text-alert-600 underline"
            @click="discard(item)"
          >
            Descartar
          </button>
        </div>
      </div>

      <BigButton
        label="Reintentar todo"
        icon="save"
        color="amber"
        size="block"
        class="mt-3"
        @click="retryFailed"
      />
    </div>

    <div class="mt-auto pt-6">
      <BigButton label="Cerrar sesión" icon="close" color="alert" size="block" @click="logout" />
    </div>

    <p class="mt-4 text-center text-xs text-slate-400">Mi Gallinero · v0.2.0</p>
  </ScreenShell>
</template>
