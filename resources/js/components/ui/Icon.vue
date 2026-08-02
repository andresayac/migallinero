<script setup lang="ts">
/**
 * Iconos SVG en línea, grandes y legibles — pensados para el adulto mayor.
 * No dependemos de una librería de iconos para mantener el bundle pequeño.
 */
withDefaults(
  defineProps<{
    name: string
    size?: number | string
  }>(),
  {
    size: 32,
  },
)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'egg'">
      <ellipse cx="12" cy="13" rx="6.5" ry="9" />
    </template>
    <template v-else-if="name === 'chicken'">
      <path
        d="M12 4c2 0 3.5 1.8 3.5 4 0 1.2-.4 2-1 2.7 2 .6 3.5 2.3 3.5 4.6 0 2.8-2.4 5-5.5 5h-1c-3.1 0-5.5-2.2-5.5-5 0-2.3 1.5-4 3.5-4.6-.6-.7-1-1.5-1-2.7 0-2.2 1.5-4 3.5-4z"
      />
      <path d="M9 13l-3 1" /><path d="M15 13l3 1" />
      <path d="M12 19v2" />
    </template>
    <template v-else-if="name === 'skull'">
      <path
        d="M12 3a8 8 0 0 0-8 8c0 2.2 1 4 2.5 5.2.3 2 1 3.8 1 3.8h9s.7-1.8 1-3.8C19 15 20 13.2 20 11a8 8 0 0 0-8-8z"
      />
      <circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
      <path d="M10 17h4" />
    </template>
    <template v-else-if="name === 'money'">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9v.01M18 15v.01" />
    </template>
    <template v-else-if="name === 'people'">
      <circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
      <circle cx="17" cy="9" r="2.5" /><path d="M15 20c0-2.4 1.5-4 4-4" />
    </template>
    <template v-else-if="name === 'syringe'">
      <path d="M18 2l4 4M14 6l4 4M9 11l4 4M5 15l4 4M3 21l6-2 8-8 2-6-6 2-8 8z" />
      <path d="M14 6l4 4" />
    </template>
    <template v-else-if="name === 'clipboard'">
      <rect x="5" y="4" width="14" height="18" rx="2" />
      <path d="M9 4h6v3H9z" />
      <path d="M8 11h8M8 15h8M8 19h4" />
    </template>
    <template v-else-if="name === 'home'">
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </template>
    <template v-else-if="name === 'back'">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </template>
    <!-- Tarjetas: el resumen del día. A propósito distinto de 'report' (barras),
         que es el análisis por periodo; si se parecieran, las dos pantallas se
         confundirían. -->
    <template v-else-if="name === 'summary'">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="M18 6L6 18M6 6l12 12" />
    </template>
    <template v-else-if="name === 'report'">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </template>
    <template v-else-if="name === 'sync'">
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 16v4h4M21 8V4h-4" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5v14M5 12h14" />
    </template>
    <template v-else-if="name === 'minus'">
      <path d="M5 12h14" />
    </template>
    <template v-else-if="name === 'save'">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </template>
    <template v-else-if="name === 'download'">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </template>
    <template v-else>
      <circle cx="12" cy="12" r="9" />
    </template>
  </svg>
</template>
