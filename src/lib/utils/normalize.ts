// 网易云接口 JSON 结构宽松且多态，统一在归一化入口收窄成 Loose 记录，不让 any 内渗。
type Loose = Record<string, unknown>

function asRecord(value: unknown): Loose {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Loose : {}
}

function asArray<T = Loose>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export interface NormalizedSong extends Loose {
  id: unknown
  name: unknown
  ar: unknown
  al: Loose
  dt: number
  picUrl: string
}

export interface NormalizedAlbum extends Loose {
  id: unknown
  name: unknown
  picUrl: string
  artistName: string
  publishTime: string
  size: number
}

export interface NormalizedPlaylist extends Loose {
  id: unknown
  name: unknown
  picUrl: string
  playCount: number
  trackCount: number
  creator: string
  description: string
  copywriter: string
  updateFrequency: string
}

export interface NormalizedRecordSong extends Loose {
  id: unknown
  name: unknown
  ar: unknown
  al: Loose
  dt: number
  picUrl: string
  playCount: number
}

export interface NormalizedLocalHistorySong extends Loose {
  id: unknown
  name: unknown
  ar: unknown
  al: Loose
  picUrl: string
  dt: number
  source?: string
  localId?: unknown
  webdavId?: unknown
  remoteUrl?: string
  webdavBaseUrl?: string
  webdavUsername?: string
  fileName?: string
  relativePath?: string
  mime?: string
  fileSize: number
}

export interface HomepageItem extends Loose {
  kind: string
}

export interface HomepageBlock {
  id: unknown
  title: string
  showType: string
  kind: string
  items: HomepageItem[]
}

export function extractCover(track: unknown): string {
  if (!track || typeof track !== 'object') return ''
  const t = track as Loose
  const album = asRecord(t.al ?? t.album)
  return asString(album.picUrl) || asString(t.coverImgUrl) || asString(t.picUrl) || ''
}

export function normalizeSong(input: unknown): NormalizedSong | null {
  if (!input) return null
  const root = asRecord(input)
  const ext = asRecord(root.resourceExtInfo)
  const song = asRecord(root.song ?? ext.songData ?? ext.song ?? root)
  const al = asRecord(song.al ?? song.album)
  return {
    ...song,
    id: song.id,
    name: song.name,
    ar: song.ar ?? song.artists ?? [],
    al,
    dt: asNumber(song.dt) || asNumber(song.duration),
    picUrl: asString(al.picUrl) || asString(song.coverImgUrl) || asString(song.picUrl) || '',
  }
}

export function normalizeAlbum(input: unknown): NormalizedAlbum | null {
  if (!input) return null
  const album = asRecord(input)
  const artist = asRecord(album.artist)
  const artists = asArray<Loose>(album.artists)
  return {
    id: album.id,
    name: album.name,
    picUrl: asString(album.picUrl) || asString(album.blurPicUrl) || asString(album.coverImgUrl) || '',
    artistName: asString(artist.name) || artists.map(a => asString(a.name)).join(' / ') || '',
    publishTime: asString(album.publishTime) || asString(album.publishTimeStr) || '',
    size: asNumber(album.size) || asNumber(album.trackCount),
  }
}

export function normalizePlaylist(input: unknown): NormalizedPlaylist | null {
  if (!input) return null
  const playlist = asRecord(input)
  const creator = asRecord(playlist.creator)
  return {
    id: playlist.id,
    name: playlist.name,
    picUrl: asString(playlist.picUrl) || asString(playlist.coverImgUrl) || asString(playlist.cover) || '',
    playCount: asNumber(playlist.playCount),
    trackCount: asNumber(playlist.trackCount) || asNumber(playlist.size),
    creator: asString(creator.nickname),
    description: asString(playlist.description) || asString(playlist.copywriter) || '',
    copywriter: asString(playlist.copywriter) || asString(playlist.description) || '',
    updateFrequency: asString(playlist.updateFrequency) || '',
  }
}

export function normalizeRecordSong(item: unknown): NormalizedRecordSong | null {
  if (!item) return null
  const source = asRecord(item)
  const song: Loose = source.song ? asRecord(source.song) : source
  return {
    id: song.id,
    name: song.name,
    ar: song.ar ?? song.artists ?? [],
    al: asRecord(song.al ?? song.album),
    dt: asNumber(song.dt) || asNumber(song.duration),
    picUrl: extractCover(song),
    playCount: asNumber(source.playCount) || asNumber(source.score),
  }
}

export function normalizeLocalHistorySong(item: Loose): NormalizedLocalHistorySong {
  return {
    id: item.id,
    name: item.name,
    ar: item.artists ?? [],
    al: asRecord(item.album),
    picUrl: asString(item.picUrl) || extractCover(item),
    dt: asNumber(item.duration),
    source: asString(item.source) || undefined,
    localId: item.localId,
    webdavId: item.webdavId,
    remoteUrl: asString(item.remoteUrl) || undefined,
    webdavBaseUrl: asString(item.webdavBaseUrl) || undefined,
    webdavUsername: asString(item.webdavUsername) || undefined,
    fileName: asString(item.fileName) || undefined,
    relativePath: asString(item.relativePath) || undefined,
    mime: asString(item.mime) || undefined,
    fileSize: asNumber(item.fileSize),
  }
}

export function parseHomepageBlocks(res: unknown): HomepageBlock[] {
  const root = asRecord(res)
  const data = asRecord(root.data)
  const blocks = asArray<Loose>(data.blocks ?? root.blocks)
  return blocks.map((block, index): HomepageBlock => {
    const ui = asRecord(block.uiElement)
    const title = asString(asRecord(ui.subTitle).title)
      || asString(asRecord(ui.mainTitle).title)
      || asString(block.blockCode)
      || `推荐 ${index + 1}`
    const creatives = asArray<Loose>(block.creatives ?? block.extInfo)
    const rawItems = creatives.flatMap((creative) => {
      const ext = asRecord(creative.resourceExtInfo)
      const resources = asArray<Loose>(creative.resources ?? ext.artists)
      if (resources.length) {
        return resources.map(resource => ({ creative, resource }))
      }
      return [{ creative, resource: creative }]
    })
    const items = rawItems
      .map(({ creative, resource }) => normalizeHomepageResource(creative, resource))
      .filter((item): item is HomepageItem => item !== null)
      .slice(0, 12)
    const kind = items.find(item => item.kind)?.kind || ''
    return { id: block.blockCode || index, title, showType: asString(block.showType) || '', kind, items }
  }).filter(block => block.kind && block.items.length > 0).slice(0, 8)
}

function normalizeHomepageResource(creative: Loose, resource: Loose): HomepageItem | null {
  const ext = asRecord(resource.resourceExtInfo ?? creative.resourceExtInfo)
  const resourceType = String(resource.resourceType ?? creative.creativeType ?? '').toLowerCase()
  const resourceUi = asRecord(resource.uiElement)
  const creativeUi = asRecord(creative.uiElement)
  const title = asString(asRecord(resourceUi.mainTitle).title)
    || asString(asRecord(creativeUi.mainTitle).title)
    || asString(resource.title)
    || asString(creative.title)
    || ''
  const subtitle = asString(asRecord(resourceUi.subTitle).title)
    || asString(asRecord(creativeUi.subTitle).title)
    || ''
  const picUrl = asString(asRecord(resourceUi.image).imageUrl)
    || asString(asRecord(creativeUi.image).imageUrl)
    || ''

  if (resourceType.includes('song') || ext.songData || ext.song) {
    const song = normalizeSong(ext.songData ?? ext.song ?? resource)
    if (!song?.id) return null
    return { kind: 'song', ...song, name: asString(song.name) || title, picUrl: song.picUrl || picUrl, reason: subtitle }
  }

  if (resourceType.includes('album') || ext.albumData) {
    const album = normalizeAlbum(ext.albumData ?? resource)
    if (!album?.id) return null
    return { kind: 'album', ...album, name: asString(album.name) || title, picUrl: album.picUrl || picUrl, artistName: album.artistName || subtitle }
  }

  if (resourceType.includes('list') || resourceType.includes('playlist') || ext.playlistData) {
    const playlistData = asRecord(ext.playlistData)
    const base = ext.playlistData ? playlistData : resource
    const playlist = normalizePlaylist({
      ...base,
      id: resource.resourceId ?? playlistData.id ?? resource.id,
      name: title || asString(playlistData.name) || asString(resource.name),
      coverImgUrl: picUrl || asString(playlistData.coverImgUrl),
      copywriter: subtitle,
    })
    if (!playlist?.id) return null
    return { kind: 'playlist', ...playlist }
  }

  return null
}
