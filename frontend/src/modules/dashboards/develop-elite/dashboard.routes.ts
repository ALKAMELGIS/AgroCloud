import type { ComponentType, LazyExoticComponent } from 'react'
import { lazyWithRetry } from '@/core/routing/lazyWithRetry'

export const developEliteDashboardLazy: LazyExoticComponent<ComponentType<unknown>> = lazyWithRetry(
  () => import('./Dashboard'),
  'DevelopEliteDashboard',
)

/** Route elements for the Develop Elite dashboard (embed in management/develop gallery). */
export const developEliteDashboardRoutes = {
  element: developEliteDashboardLazy,
}
