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

export function parseLyricResponse(data) {
  const lyric = data?.lrc?.lyric ? parseLRC(data.lrc.lyric) : []
  const tlyric = data?.tlyric?.lyric ? parseLRC(data.tlyric.lyric) : []
  const romalyric = data?.romalyric?.lyric ? parseLRC(data.romalyric.lyric) : []

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

  return merged.sort((a, b) => a.time - b.time)
}
