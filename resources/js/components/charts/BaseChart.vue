<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import {
  Chart,
  LineController,
  BarController,
  DoughnutController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  type ChartType,
  type ChartData,
  type ChartOptions,
} from 'chart.js'

Chart.register(
  LineController,
  BarController,
  DoughnutController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
)

export interface ChartDataset {
  label?: string
  /**
   * `null` deja un hueco en la línea, que es lo correcto para un dato que no se
   * puede calcular. Dibujarlo como 0 diría que ese día la postura fue del 0 %,
   * cuando lo cierto es que no se sabe.
   */
  data: (number | null)[]
  borderColor?: string
  backgroundColor?: string | string[]
  fill?: boolean
  tension?: number
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'doughnut' | 'pie'
  labels: string[]
  datasets: ChartDataset[]
}

const props = withDefaults(
  defineProps<{
    config: ChartConfig
    height?: number
  }>(),
  { height: 200 },
)

const canvasRef = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

function buildData(): ChartData {
  return {
    labels: props.config.labels,
    datasets: props.config.datasets.map((d) => ({ ...d })),
  } as ChartData
}

function buildOptions(): ChartOptions {
  const isPieLike = props.config.type === 'doughnut' || props.config.type === 'pie'
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: isPieLike,
        position: 'bottom',
        labels: { font: { size: 12 }, boxWidth: 14 },
      },
    },
    scales: isPieLike
      ? {}
      : {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
        },
  } as ChartOptions
}

function render() {
  if (!canvasRef.value) return
  chart?.destroy()
  chart = new Chart(canvasRef.value, {
    type: props.config.type as ChartType,
    data: buildData(),
    options: buildOptions(),
  })
}

onMounted(render)
onBeforeUnmount(() => chart?.destroy())
watch(() => props.config, render, { deep: true })
</script>

<template>
  <div :style="{ height: `${height}px` }">
    <canvas ref="canvasRef" />
  </div>
</template>
