export type AndroidOverlayUiState =
  | 'checking'
  | 'unavailable'
  | 'awaiting-permission'
  | 'permission-required'
  | 'permission-revoked'
  | 'ready'
  | 'starting'
  | 'active'

export interface AndroidOverlayStateInput {
  connected: boolean
  checking: boolean
  awaitingPermission: boolean
  permission: boolean
  requested: boolean
  enabled: boolean
  visible: boolean
}

export function androidOverlayUiState(input: AndroidOverlayStateInput): AndroidOverlayUiState {
  if (!input.connected) return 'unavailable'
  if (input.checking) return 'checking'
  if (input.awaitingPermission) return 'awaiting-permission'
  if (!input.permission) return input.requested ? 'permission-revoked' : 'permission-required'
  if (input.visible) return 'active'
  if (input.enabled || input.requested) return 'starting'
  return 'ready'
}
