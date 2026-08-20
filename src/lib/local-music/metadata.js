const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav'])
const MAX_TAG_BYTES = 1024 * 1024

function extensionOf(name = '') {
  return String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || ''
}

export function isSupportedAudioFile(file) {
  const mime = String(file?.type || '').toLowerCase()
  return mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(extensionOf(file?.name))
}

export function createLocalTrackId(file) {
  const source = `${file?.name || ''}\0${file?.size || 0}\0${file?.lastModified || 0}`
  let hash = 2166136261
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `local:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function synchsafe(bytes, offset) {
  return ((bytes[offset] & 0x7f) << 21)
    | ((bytes[offset + 1] & 0x7f) << 14)
    | ((bytes[offset + 2] & 0x7f) << 7)
    | (bytes[offset + 3] & 0x7f)
}

function uint32(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
}

function decodeTextFrame(bytes) {
  if (!bytes?.length) return ''
  const encoding = bytes[0]
  const body = bytes.subarray(1)
  let text = ''
  try {
    if (encoding === 0) text = new TextDecoder('windows-1252').decode(body)
    else if (encoding === 3) text = new TextDecoder('utf-8').decode(body)
    else if (encoding === 2) text = new TextDecoder('utf-16be').decode(body)
    else if (body[0] === 0xfe && body[1] === 0xff) text = new TextDecoder('utf-16be').decode(body.subarray(2))
    else if (body[0] === 0xff && body[1] === 0xfe) text = new TextDecoder('utf-16le').decode(body.subarray(2))
    else text = new TextDecoder('utf-16le').decode(body)
  } catch {
    text = new TextDecoder().decode(body)
  }
  return text.replace(/\0/g, '').trim()
}

export function parseId3Metadata(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0)
  if (bytes.length < 10 || String.fromCharCode(...bytes.subarray(0, 3)) !== 'ID3') return {}
  const version = bytes[3]
  if (version < 3 || version > 4) return {}
  const tagEnd = Math.min(bytes.length, 10 + synchsafe(bytes, 6), MAX_TAG_BYTES)
  const result = {}
  const frameMap = { TIT2: 'title', TPE1: 'artist', TALB: 'album' }
  let offset = 10

  while (offset + 10 <= tagEnd) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4))
    if (!/^[A-Z0-9]{4}$/.test(id)) break
    const size = version === 4 ? synchsafe(bytes, offset + 4) : uint32(bytes, offset + 4)
    offset += 10
    if (size <= 0 || offset + size > tagEnd) break
    const key = frameMap[id]
    if (key && !result[key]) result[key] = decodeTextFrame(bytes.subarray(offset, offset + size))
    offset += size
  }
  return result
}

export function fallbackMetadata(fileName = '') {
  const base = String(fileName).replace(/\.[^.]+$/, '').trim() || '未知曲目'
  const separator = base.indexOf(' - ')
  if (separator > 0) {
    return { artist: base.slice(0, separator).trim(), title: base.slice(separator + 3).trim(), album: '' }
  }
  return { artist: '未知歌手', title: base, album: '' }
}

export async function readLocalMetadata(file) {
  const fallback = fallbackMetadata(file?.name)
  try {
    const header = await file.slice(0, MAX_TAG_BYTES).arrayBuffer()
    const id3 = parseId3Metadata(header)
    return {
      title: id3.title || fallback.title,
      artist: id3.artist || fallback.artist,
      album: id3.album || fallback.album,
    }
  } catch {
    return fallback
  }
}
