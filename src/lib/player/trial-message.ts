import { ERROR_MESSAGES } from '../utils/constants.ts'

export interface TrialAuthState {
  isLoggedIn?: boolean
  vipInfo?: unknown
  isVip?: boolean
}

export function getTrialPlaybackMessage(authState: TrialAuthState = {}): string {
  if (!authState.isLoggedIn) return ERROR_MESSAGES.VIP_TRIAL
  if (!authState.vipInfo) return ERROR_MESSAGES.VIP_TRIAL_SYNCING
  return authState.isVip ? ERROR_MESSAGES.VIP_TRIAL_LIMITED : ERROR_MESSAGES.VIP_TRIAL_ACCOUNT
}
