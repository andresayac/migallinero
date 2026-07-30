<script setup lang="ts">
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { severityStyles, type Alert } from '@/composables/useAlerts'

defineProps<{ alerts: Alert[] }>()
const router = useRouter()
</script>

<template>
  <div v-if="alerts.length" class="mb-4 flex flex-col gap-2">
    <button
      v-for="a in alerts"
      :key="a.id"
      type="button"
      :class="['flex items-start gap-3 rounded-xl2 p-3 text-left active:scale-[0.99]', severityStyles[a.severity].bg]"
      @click="a.to && router.push(a.to)"
    >
      <Icon :name="a.icon" :size="28" :class="severityStyles[a.severity].text" />
      <div class="min-w-0 flex-1">
        <p :class="['text-base font-extrabold', severityStyles[a.severity].text]">
          {{ severityStyles[a.severity].icon }} {{ a.title }}
        </p>
        <p class="text-sm text-slate-600">{{ a.detail }}</p>
      </div>
    </button>
  </div>
</template>
