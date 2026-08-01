<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFarmStore } from '@/stores/farm'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/composables/useToast'
import { useSubmit } from '@/composables/useSubmit'
import { apiErrorMessage, isNetworkError } from '@/api/http'
import BigButton from '@/components/ui/BigButton.vue'
import Icon from '@/components/ui/Icon.vue'

const router = useRouter()
const auth = useAuthStore()
const farm = useFarmStore()
const sync = useSyncStore()
const toast = useToast()
const { busy, submit } = useSubmit()

const step = ref<'intro' | 'register' | 'login'>('intro')
const ownerName = ref('')
const farmName = ref('')
const username = ref('')
const password = ref('')
const passwordConfirm = ref('')

const MIN_PASSWORD = 8

/**
 * Crea la granja.
 *
 * El orden importa: primero se crea SIEMPRE en local (así el asistente funciona
 * sin cobertura) y después se registra en el servidor enviándole esos mismos
 * catálogos con sus `local_uuid`. Antes se registraba primero, el servidor
 * sembraba sus propios catálogos colombianos y quedaban duplicados junto a los
 * personalizados, que además nunca conseguían un `remoteId`.
 */
async function start() {
  if (!ownerName.value.trim() || !farmName.value.trim() || !username.value.trim()) {
    toast.error('Completa todos los campos')

    return
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(username.value.trim())) {
    toast.error('El usuario sólo puede tener letras, números, punto, guion y guion bajo')

    return
  }

  if (password.value.length < MIN_PASSWORD) {
    toast.error(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`)

    return
  }

  // Confirmación de contraseña: no hay recuperación por correo, así que un error
  // de tecleo al registrarse dejaría al usuario fuera de su cuenta para siempre.
  if (password.value !== passwordConfirm.value) {
    toast.error('Las dos contraseñas no coinciden')

    return
  }

  const done = await submit(async () => {
    await farm.bootstrapFarm(ownerName.value.trim(), farmName.value.trim())

    try {
      const data = await auth.register({
        name: ownerName.value.trim(),
        username: username.value.trim(),
        password: password.value,
        farmName: farmName.value.trim(),
        currency: farm.currency,
        country: farm.country,
        timezone: farm.timezone,
        locale: farm.locale,
        periodLockDays: farm.periodLockDays,
        catalogs: farm.catalogSeed(),
      })

      farm.linkToBackend(data.farm)
      await farm.mergeCatalogsFromBackend()

      toast.success('¡Granja creada! Vamos a configurarla')
    } catch (e) {
      // Sólo caemos a modo local cuando el fallo es de RED. Antes se decidía con
      // una expresión regular sobre el texto del error, así que un 500 que
      // mencionara "connect" también creaba una granja local en silencio.
      if (!isNetworkError(e)) {
        throw new Error(apiErrorMessage(e, 'No se pudo crear la cuenta'))
      }

      auth.loginLocal(ownerName.value.trim(), 'admin')
      toast.info('Sin conexión: la granja quedó en este dispositivo y se subirá después')
    }

    return true
  })

  if (done) router.replace({ name: 'setup' })
}

/**
 * Inicio de sesión.
 *
 * Si el dispositivo no tenía granja, se adopta la del servidor (creando su
 * identidad local) y se descargan los datos. Antes se sobreescribía `farmId` con
 * el id numérico del backend, así que los registros locales quedaban huérfanos y
 * la app aparecía vacía; y como no se persistía nada, al recargar volvía al
 * inicio pidiendo la contraseña otra vez.
 */
async function doLogin() {
  if (!username.value.trim() || !password.value) {
    toast.error('Escribe tu usuario y contraseña')

    return
  }

  const done = await submit(
    async () => {
      const data = await auth.login(username.value.trim(), password.value)

      if (farm.isConfigured) {
        farm.linkToBackend(data.farm)
      } else {
        farm.adoptRemoteFarm(data.farm)
      }

      await farm.mergeCatalogsFromBackend()
      await sync.pullFromServer({ full: !farm.pens.length })
      await sync.refreshPending()
      void sync.forceSync()

      return true
    },
    { errorMessage: 'No se pudo iniciar sesión' },
  )

  if (!done) return

  toast.success(`¡Hola de nuevo, ${auth.user?.name}!`)
  router.replace({ name: 'home' })
}
</script>

<template>
  <div class="screen items-center justify-center text-center">
    <div class="flex flex-1 flex-col items-center justify-center gap-6">
      <div class="rounded-full bg-grass-100 p-6 text-grass-600">
        <Icon name="chicken" :size="80" />
      </div>

      <template v-if="step === 'intro'">
        <h1 class="text-4xl font-extrabold text-grass-700">🐔 Mi Gallinero</h1>
        <p class="max-w-md text-xl text-slate-600">
          Lleva el control de tu granja de forma muy fácil: huevos, gallinas, ventas y clientes.
        </p>
        <BigButton label="Crear mi granja" icon="egg" size="block" @click="step = 'register'" />
        <button class="text-base font-semibold text-grass-600 underline" @click="step = 'login'">
          Ya tengo cuenta
        </button>
      </template>

      <!-- Registro -->
      <template v-else-if="step === 'register'">
        <h1 class="text-3xl font-extrabold text-slate-800">Crea tu granja</h1>
        <p class="text-lg text-slate-600">
          Tus datos quedan en <strong>tu propia granja</strong>. Nadie más los verá.
        </p>

        <form class="card flex w-full max-w-md flex-col gap-4 text-left" @submit.prevent="start">
          <label class="flex flex-col gap-1">
            <span class="text-base font-semibold text-slate-700">Tu nombre</span>
            <input
              v-model="ownerName"
              type="text"
              autocomplete="name"
              placeholder="Ej: Don José"
              class="rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-base font-semibold text-slate-700">Nombre de tu granja</span>
            <input
              v-model="farmName"
              type="text"
              placeholder="Ej: Granja Los Laureles"
              class="rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-base font-semibold text-slate-700">Usuario (para entrar)</span>
            <input
              v-model="username"
              type="text"
              autocomplete="username"
              placeholder="Ej: jose"
              class="rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-base font-semibold text-slate-700">Contraseña</span>
            <input
              v-model="password"
              type="password"
              autocomplete="new-password"
              :placeholder="`Mínimo ${MIN_PASSWORD} caracteres`"
              class="rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-base font-semibold text-slate-700">Repite la contraseña</span>
            <input
              v-model="passwordConfirm"
              type="password"
              autocomplete="new-password"
              class="rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
            />
            <span class="text-sm text-slate-500">
              Apúntala en un lugar seguro: no se puede recuperar por correo.
            </span>
          </label>
        </form>

        <BigButton
          :label="busy ? 'Creando…' : 'Crear mi granja'"
          icon="save"
          size="block"
          :disabled="busy"
          @click="start"
        />
        <button class="text-base font-semibold text-slate-500" @click="step = 'intro'">
          Volver
        </button>
      </template>

      <!-- Login -->
      <template v-else>
        <h1 class="text-3xl font-extrabold text-slate-800">Hola de nuevo</h1>
        <p class="text-lg text-slate-600">Entra con tu usuario y contraseña.</p>

        <form class="card flex w-full max-w-md flex-col gap-4 text-left" @submit.prevent="doLogin">
          <label class="flex flex-col gap-1">
            <span class="text-base font-semibold text-slate-700">Usuario</span>
            <input
              v-model="username"
              type="text"
              autocomplete="username"
              class="rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-base font-semibold text-slate-700">Contraseña</span>
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              class="rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none"
            />
          </label>
        </form>

        <BigButton
          :label="busy ? 'Entrando…' : 'Entrar'"
          icon="save"
          size="block"
          :disabled="busy"
          @click="doLogin"
        />
        <button class="text-base font-semibold text-slate-500" @click="step = 'intro'">
          Volver
        </button>
      </template>
    </div>
  </div>
</template>
