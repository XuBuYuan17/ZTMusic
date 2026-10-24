export const QUALITY_OPTIONS = [
  { value: 'lossless', label: '无损', labelKey: 'quality.lossless' },
  { value: 'exhigh', label: '极高', labelKey: 'quality.exhigh' },
  { value: 'higher', label: '较高', labelKey: 'quality.higher' },
  { value: 'standard', label: '标准', labelKey: 'quality.standard' },
] as const

// Playback can also report derived levels such as standard+unblock.
export const QUALITY_ORDER: string[] = QUALITY_OPTIONS.map(option => option.value)
export const QUALITY_LABELS: Record<string, string> = Object.fromEntries(QUALITY_OPTIONS.map(option => [option.value, option.label]))
