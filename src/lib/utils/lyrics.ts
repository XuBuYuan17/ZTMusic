export interface LrcLine {
  /** 秒 */
  time: number
  content: string
  rawTime: string
}

export interface YrcWord {
  /** 秒 */
  time: number
  duration: number
  text: string
}

export interface YrcLine {
  /** 秒 */
  time: number
  duration: number
  text: string
  words?: YrcWord[]
}

export interface ParsedLyricLine {
  /** 秒，与 LRC 时间轴一致 */
  time: number
  content: string
  translation: string
  roman: string
}

export interface ParsedLyric {
  lines: ParsedLyricLine[]
  yrcLines: YrcLine[]
}

const LRC_TIME_RE = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/
const YRC_HEADER_RE = /^\[(\d+),(\d+)\]/
// /g 带 lastIndex：parseYrcLine 调用均同步串行，入口处复位即可安全共享
const YRC_WORD_RE = /\((\d+),(\d+),\d+\)([^(]*)/g

export function parseLRC(lrc: unknown): LrcLine[] {
  if (typeof lrc !== 'string' || !lrc) return []
  const lines = lrc.split('\n')
  const result: LrcLine[] = []
  for (const line of lines) {
    const match = line.match(LRC_TIME_RE)
    if (!match) continue
    const min = Number(match[1])
    const sec = Number(match[2])
    // 毫秒字段可缺省（[mm:ss]），位数也不定：补零到 3 位统一成毫秒（.45 → 450）
    const ms = match[3] ? Number(match[3].padEnd(3, '0')) : 0
    const time = min * 60 + sec + ms / 1000
    const content = (match[4] ?? '').trim()
    if (content) result.push({ time, content, rawTime: match[0] })
  }
  return result.sort((a, b) => a.time - b.time)
}

/**
 * 解析逐字歌词 (yrc) 的单行格式
 * 格式: [lineStartMs, lineDurationMs](wordStartMs, wordDurationMs, flag)text(...)text
 *
 * 返回: { time, duration, text, words: [{ time, duration, text }] }
 */
export function parseYrcLine(line: unknown): YrcLine | null {
  if (!line || typeof line !== 'string') return null
  // 跳过 JSON 元数据行
  if (line.startsWith('{')) return null

  const headerMatch = line.match(YRC_HEADER_RE)
  if (!headerMatch) return null

  const lineTime = Number(headerMatch[1]) / 1000
  const lineDuration = Number(headerMatch[2]) / 1000

  const words: YrcWord[] = []
  YRC_WORD_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = YRC_WORD_RE.exec(line)) !== null) {
    words.push({
      time: Number(match[1]) / 1000,
      duration: Number(match[2]) / 1000,
      text: match[3] ?? '',
    })
  }

  const fullText = words.map((w) => w.text).join('')

  return {
    time: lineTime,
    duration: lineDuration,
    text: fullText,
    words: words.length > 0 ? words : undefined,
  }
}

/**
 * 解析 yrc 完整响应文本，过滤掉 JSON 元数据行
 */
export function parseYrc(yrcText: unknown): YrcLine[] {
  if (typeof yrcText !== 'string' || !yrcText) return []
  return yrcText
    .split('\n')
    .map(parseYrcLine)
    .filter((line): line is YrcLine => line !== null)
    .sort((a, b) => a.time - b.time)
}

export function parseLyricResponse(data: unknown): ParsedLyric {
  const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  const lrcField = payload.lrc
  const tlyricField = payload.tlyric
  const romalrcField = payload.romalyric
  const yrcField = payload.yrc
  const lyricText = lrcField && typeof lrcField === 'object' ? (lrcField as Record<string, unknown>).lyric : undefined
  const tlyricText = tlyricField && typeof tlyricField === 'object' ? (tlyricField as Record<string, unknown>).lyric : undefined
  const romalrcText = romalrcField && typeof romalrcField === 'object' ? (romalrcField as Record<string, unknown>).lyric : undefined
  const yrcText = yrcField && typeof yrcField === 'object' ? (yrcField as Record<string, unknown>).lyric : undefined

  const lyric = lyricText ? parseLRC(lyricText) : []
  const tlyric = tlyricText ? parseLRC(tlyricText) : []
  const romalyric = romalrcText ? parseLRC(romalrcText) : []
  // 新版接口 /lyric/new 的逐字歌词
  const yrcLines = yrcText ? parseYrc(yrcText) : []

  // LRC 合并（传统歌词 + 翻译 + 罗马音）
  const merged: ParsedLyricLine[] = []
  const lyricMap = new Map<number, ParsedLyricLine>()

  for (const l of lyric) {
    const item: ParsedLyricLine = { time: l.time, content: l.content, translation: '', roman: '' }
    lyricMap.set(l.time, item)
    merged.push(item)
  }

  for (const t of tlyric) {
    const existing = lyricMap.get(t.time)
    if (existing) existing.translation = t.content
    else {
      const item: ParsedLyricLine = { time: t.time, content: '', translation: t.content, roman: '' }
      lyricMap.set(t.time, item)
      merged.push(item)
    }
  }

  for (const r of romalyric) {
    const existing = lyricMap.get(r.time)
    if (existing) existing.roman = r.content
    else {
      const item: ParsedLyricLine = { time: r.time, content: '', translation: '', roman: r.content }
      lyricMap.set(r.time, item)
      merged.push(item)
    }
  }

  return {
    lines: merged.sort((a, b) => a.time - b.time),
    yrcLines,
  }
}
