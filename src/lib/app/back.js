export function getAppBackAction(state) {
  if (state.showMobileDrawer) return 'mobileDrawer'
  if (state.showSheet) return 'sheet'
  if (state.showQueuePanel) return 'queue'
  if (state.showSearch) return 'search'
  if (state.showLogin) return 'login'
  if (state.showFollowDialog) return 'followDialog'
  if ((state.routeStackLength || 0) > 0) return 'routeBack'

  const homeView = state.isMobile ? 'explore' : 'home'
  if (state.activeView !== homeView) return 'homeView'

  return null
}