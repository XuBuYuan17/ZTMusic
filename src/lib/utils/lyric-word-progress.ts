export function wordProgress(word: { time: number; duration: number }, now: number, reduced = false): number {
  if (!Number.isFinite(now) || !Number.isFinite(word.time)) return 0
  if (now < word.time) return 0
  if (reduced || !Number.isFinite(word.duration) || word.duration <= 0) return 100
  return Math.max(0, Math.min(100, (now - word.time) / word.duration * 100))
}
