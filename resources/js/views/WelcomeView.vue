<script setup lang="ts">
import { ref } from 'vue'
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

const step = ref<'intro' | 'register' | 'login'>('intro')
const ownerName = ref('')
const farmName = ref('')
const username = ref('')
const password = ref('')
const busy = ref(false)

/** Crea usuario + granja. Si hay backend, lo registra en la API; si no, modo offline local. */
async function start() {
  if (!ownerName.value.trim() || !farmName.value.trim() || !username.value.trim()) {
    toast.error('Completa todos los campos')
    return
  }
  if (password.value.length < 4) {
    toast.error('La contraseña debe tener al menos 4 caracteres')
    return
  }
  busy.value = true
  try {
    await auth.register(
      ownerName.value.trim(),
      username.value.trim(),
      password.value,
      farmName.value.trim(),
    )
    // Como el backend sembró los catálogos, arrancamos Dexie con Datos básicos
    // y luego hacemos el merge para enlazar UUIDs locales con los ids remotos.
    await farm.bootstrapFarm(ownerName.value.trim(), farmName.value.trim())
    await farm.mergeCatalogsFromBackend()
    toast.success('¡Listo! Tu granja quedó creada')
    router.replace({ name: 'home' })
  } catch (e) {
    const err = e as Error
    // Si el backend no responde (sin conexión rural), caemos a modo offline local.
    if (/connect|Network|fetch|Failed|ECONN/i.test(err.message) || !navigator.onLine) {
      auth.loginLocal(ownerName.value.trim(), 'admin')
      await farm.bootstrapFarm(ownerName.value.trim(), farmName.value.trim())
      toast.info('Sin conexión: granja creada en este dispositivo (se sincronizará después)')
      router.replace({ name: 'home' })
    } else {
      toast.error(err.message)
    }
  } finally {
    busy.value = false
  }
}

/** Login si ya tiene cuenta creada en el servidor. */
async function doLogin() {
  if (!username.value.trim() || !password.value) {
    toast.error('Escribe tu usuario y contraseña')
    return
  }
  busy.value = true
  try {
    const data = await auth.login(username.value.trim(), password.value)
    // Restauramos la granja activa desde el servidor.
    farm.setActive(String(data.farm.id), data.farm.name)
    // En sesión con backend, fusionamos catálogos para sincronizar ids.
    if (auth.hasBackendSession) {
      await farm.mergeCatalogsFromBackend()
    } else {
      await farm.loadCatalogs()
    }
    toast.success(`¡Hola de nuevo, ${auth.user?.name}!`)
    router.replace({ name: 'home' })
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    busy.value = false
  }
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
          Lleva el control de tu granja de forma muy fácil:
          huevos, gallinas, ventas y clientes.
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

        <div class="card flex w-full max-w-md flex-col gap-4 text-left">
          <label class="flex flex-col gap-1">
            <span class="text-base font-semibold text-slate-700">Tu nombre</span>
            <input v-model="ownerName" type="text" placeholder="Ej: Don José"
              class="rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-base font-semibold text-slate-700">Nombre de tu granja</span>
            <input v-model="farmName" type="text" placeholder="Ej: Granja Los Laureles"
              class="rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-base font-semibold text-slate-700">Usuario (para entrar)</span>
            <input v-model="username" type="text" placeholder="Ej: jose"
              class="rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-base font-semibold text-slate-700">Contraseña</span>
            <input v-model="password" type="password" placeholder="Mínimo 4 caracteres"
              class="rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none" />
          </label>
        </div>

        <BigButton label="Crear mi granja" icon="save" size="block" :disabled="busy" @click="start" />
        <button class="text-base font-semibold text-slate-500" @click="step = 'intro'">
          Volver
        </button>
      </template>

      <!-- Login -->
      <template v-else>
        <h1 class="text-3xl font-extrabold text-slate-800">Hola de nuevo</h1>
        <p class="text-lg text-slate-600">Entra con tu usuario y contraseña.</p>

        <div class="card flex w-full max-w-md flex-col gap-4 text-left">
          <label class="flex flex-col gap-1">
            <span class="text-base font-semibold text-slate-700">Usuario</span>
            <input v-model="username" type="text" autocomplete="username"
              class="rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-base font-semibold text-slate-700">Contraseña</span>
            <input v-model="password" type="password" autocomplete="current-password"
              class="rounded-xl2 border-2 border-slate-200 px-4 py-3 text-xl focus:border-grass-500 focus:outline-none" />
          </label>
        </div>

        <BigButton label="Entrar" icon="save" size="block" :disabled="busy" @click="doLogin" />
        <button class="text-base font-semibold text-slate-500" @click="step = 'intro'">
          Volver
        </button>
      </template>
    </div>
  </div>
</template>
