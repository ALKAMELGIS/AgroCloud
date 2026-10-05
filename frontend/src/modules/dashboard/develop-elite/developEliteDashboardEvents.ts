export const DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT = 'develop-elite-dashboard-refresh'

export function dispatchDevelopEliteDashboardRefresh(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT))
}
