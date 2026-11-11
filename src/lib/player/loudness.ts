export interface LoudnessMeasurement {
  integratedLufs: number
  truePeakDbfs: number
}

export function loudnessAttenuationDb(measurement: LoudnessMeasurement | null): number | null {
  if (!measurement) return null
  const { integratedLufs, truePeakDbfs } = measurement
  if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDbfs)) return null
  if (integratedLufs < -70 || integratedLufs > 0 || truePeakDbfs < -100 || truePeakDbfs > 20) return null
  const targetDb = -14 - integratedLufs
  const peakLimitDb = -1 - truePeakDbfs
  return Math.max(-24, Math.min(0, targetDb, peakLimitDb))
}

export function attenuationFactor(db: number): number {
  if (!Number.isFinite(db)) return 1
  return 10 ** (Math.max(-24, Math.min(0, db)) / 20)
}

export function neteaseAttenuationDb(gain: unknown, peak: unknown, trial = false): number | null {
  if (trial || typeof gain !== 'number' || typeof peak !== 'number') return null
  if (!Number.isFinite(gain) || !Number.isFinite(peak) || gain < -24 || gain > 24 || peak <= 0 || peak > 2) return null
  const peakLimitDb = -1 - 20 * Math.log10(peak)
  return Math.max(-24, Math.min(0, gain, peakLimitDb))
}
