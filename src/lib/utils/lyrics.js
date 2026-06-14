export function parseLRC(lrc) {
  if (!lrc) return []
  const lines = lrc.split('\n')
  const result = []
  for (const line of lines) {
    const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/)
    if (!match) continue
    const min = +match[1]
    const sec = +match[2]
    const ms = match[3].length === 3 ? +match[3] : +match[3] * 10
    const time = min * 60 + sec + ms / 1000
    const content = match[4].trim()
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
export function parseYrcLine(line) {
  if (!line || typeof line !== 'string') return null
  // 跳过 JSON 元数据行
  if (line.startsWith('{')) return null

  const headerMatch = line.match(/^\[(\d+),(\d+)\]/)
  if (!headerMatch) return null

  const lineTime = +headerMatch[1] / 1000
  const lineDuration = +headerMatch[2] / 1000

  const words = []
  const wordRegex = /\((\d+),(\d+),\d+\)([^(]*)/g
  let match
  while ((match = wordRegex.exec(line)) !== null) {
    words.push({
      time: +match[1] / 1000,
      duration: +match[2] / 1000,
      text: match[3],
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
export function parseYrc(yrcText) {
  if (!yrcText) return []
  return yrcText
    .split('\n')
    .map(parseYrcLine)
    .filter(Boolean)
    .sort((a, b) => a.time - b.time)
}

export function parseLyricResponse(data) {
  const lyric = data?.lrc?.lyric ? parseLRC(data.lrc.lyric) : []
  const tlyric = data?.tlyric?.lyric ? parseLRC(data.tlyric.lyric) : []
  const romalyric = data?.romalyric?.lyric ? parseLRC(data.romalyric.lyric) : []
  // 新版接口 /lyric/new 的逐字歌词
  const yrcLines = data?.yrc?.lyric ? parseYrc(data.yrc.lyric) : []

  // LRC 合并（传统歌词 + 翻译 + 罗马音）
  const merged = []
  const lyricMap = new Map()

  for (const l of lyric) {
    const item = { time: l.time, content: l.content, translation: '', roman: '' }
    lyricMap.set(l.time, item)
    merged.push(item)
  }

  for (const t of tlyric) {
    const existing = lyricMap.get(t.time)
    if (existing) existing.translation = t.content
    else {
      const item = { time: t.time, content: '', translation: t.content, roman: '' }
      lyricMap.set(t.time, item)
      merged.push(item)
    }
  }

  for (const r of romalyric) {
    const existing = lyricMap.get(r.time)
    if (existing) existing.roman = r.content
    else {
      const item = { time: r.time, content: '', translation: '', roman: r.content }
      lyricMap.set(r.time, item)
      merged.push(item)
    }
  }

  return {
    lines: merged.sort((a, b) => a.time - b.time),
    yrcLines,
  }
}
