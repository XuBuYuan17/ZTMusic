import { ERROR_MESSAGES } from '../utils/constants.js'

export function getTrialPlaybackMessage(authState = {}) {
  if (!authState.isLoggedIn) return ERROR_MESSAGES.VIP_TRIAL
  if (!authState.vipInfo) return ERROR_MESSAGES.VIP_TRIAL_SYNCING
  return authState.isVip ? ERROR_MESSAGES.VIP_TRIAL_LIMITED : ERROR_MESSAGES.VIP_TRIAL_ACCOUNT
}