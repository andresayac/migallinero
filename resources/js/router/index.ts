import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFarmStore } from '@/stores/farm'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/welcome',
      name: 'welcome',
      component: () => import('@/views/WelcomeView.vue'),
      meta: { public: true },
    },
    {
      path: '/setup',
      name: 'setup',
      component: () => import('@/views/SetupView.vue'),
    },
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/summary',
      name: 'summary',
      component: () => import('@/views/SummaryView.vue'),
    },
    {
      path: '/eggs/new',
      name: 'eggs-new',
      component: () => import('@/views/eggs/EggCollectionEditView.vue'),
    },
    {
      path: '/eggs/inventory',
      name: 'eggs-inventory',
      component: () => import('@/views/eggs/EggInventoryView.vue'),
    },
    {
      path: '/feed/new',
      name: 'feed-new',
      component: () => import('@/views/feed/FeedRecordEditView.vue'),
    },
    {
      path: '/feed/purchase',
      name: 'feed-purchase',
      component: () => import('@/views/feed/FeedPurchaseEditView.vue'),
    },
    {
      path: '/chickens',
      name: 'chickens',
      component: () => import('@/views/chickens/ChickensView.vue'),
    },
    {
      path: '/chickens/mortality/new',
      name: 'chickens-mortality-new',
      component: () => import('@/views/chickens/MortalityNewView.vue'),
    },
    {
      path: '/chickens/movement/new',
      name: 'chickens-movement-new',
      component: () => import('@/views/chickens/ChickenMovementNewView.vue'),
    },
    {
      path: '/sales/new',
      name: 'sales-new',
      component: () => import('@/views/sales/SaleNewView.vue'),
      meta: { roles: ['admin', 'vendedor'] },
    },
    {
      path: '/sales',
      name: 'sales-list',
      component: () => import('@/views/sales/SalesListView.vue'),
      meta: { roles: ['admin', 'vendedor'] },
    },
    {
      path: '/customers/debts',
      name: 'customers-debts',
      component: () => import('@/views/customers/DebtsView.vue'),
      meta: { roles: ['admin', 'vendedor'] },
    },
    {
      path: '/customers',
      name: 'customers',
      component: () => import('@/views/customers/CustomersView.vue'),
      meta: { roles: ['admin', 'vendedor'] },
    },
    {
      path: '/vaccines/new',
      name: 'vaccines-new',
      component: () => import('@/views/vaccines/VaccineNewView.vue'),
    },
    {
      path: '/incidents/new',
      name: 'incidents-new',
      component: () => import('@/views/incidents/IncidentNewView.vue'),
    },
    {
      path: '/reports',
      name: 'reports',
      component: () => import('@/views/reports/ReportsView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/settings/SettingsView.vue'),
    },
    {
      path: '/settings/pens',
      name: 'settings-pens',
      component: () => import('@/views/settings/PensView.vue'),
      meta: { roles: ['admin'] },
    },
    {
      path: '/settings/catalogs',
      name: 'settings-catalogs',
      component: () => import('@/views/settings/CatalogsView.vue'),
      meta: { roles: ['admin'] },
    },
    {
      path: '/settings/audit',
      name: 'settings-audit',
      component: () => import('@/views/settings/AuditLogView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

/**
 * Guard de acceso.
 *
 * `main.ts` restaura la sesión y la granja ANTES de instalar el router, así que
 * aquí el estado ya está cargado y no hay carrera. Además comprobamos el rol de
 * las pantallas restringidas: la interfaz debe ocultar lo que el backend va a
 * rechazar de todas formas.
 */
router.beforeEach((to) => {
  const auth = useAuthStore()
  const farm = useFarmStore()

  if (to.meta.public) {
    // Con sesión activa no tiene sentido volver a la pantalla de bienvenida.
    if (auth.isLoggedIn && farm.isConfigured) return { name: 'home' }

    return true
  }

  if (!auth.isLoggedIn || !farm.isConfigured) {
    return { name: 'welcome' }
  }

  const required = to.meta.roles as string[] | undefined

  if (required && !required.includes(auth.role ?? '')) {
    return { name: 'home' }
  }

  return true
})

export default router
