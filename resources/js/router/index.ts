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
    },
    {
      path: '/sales',
      name: 'sales-list',
      component: () => import('@/views/sales/SalesListView.vue'),
    },
    {
      path: '/customers/debts',
      name: 'customers-debts',
      component: () => import('@/views/customers/DebtsView.vue'),
    },
    {
      path: '/customers',
      name: 'customers',
      component: () => import('@/views/customers/CustomersView.vue'),
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
    },
    {
      path: '/settings/catalogs',
      name: 'settings-catalogs',
      component: () => import('@/views/settings/CatalogsView.vue'),
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

router.beforeEach((to) => {
  const auth = useAuthStore()
  const farm = useFarmStore()
  if (!to.meta.public && (!auth.isLoggedIn || !farm.isConfigured)) {
    return { name: 'welcome' }
  }
})

export default router
