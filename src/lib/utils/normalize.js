export function extractCover(track) {
  if (!track) return ''
  const album = track.al || track.album || {}
  return album.picUrl || track.coverImgUrl || track.picUrl || ''
}

export function normalizeSong(input) {
  if (!input) return null
  const song = input.song || input.resourceExtInfo?.songData || input.resourceExtInfo?.song || input
  return {
    ...song,
    id: song.id,
    name: song.name,
    ar: song.ar || song.artists || [],
    al: song.al || song.album || {},
    dt: song.dt || song.duration || 0,
    picUrl: song.al?.picUrl || song.album?.picUrl || song.coverImgUrl || song.picUrl || '',
  }
}

export function normalizeAlbum(album) {
  if (!album) return null
  return {
    id: album.id,
    name: album.name,
    picUrl: album.picUrl || album.blurPicUrl || album.coverImgUrl || '',
    artistName: album.artist?.name || album.artists?.map(a => a.name).join(' / ') || '',
    publishTime: album.publishTime || album.publishTimeStr || '',
    size: album.size || album.trackCount || 0,
  }
}

export function normalizePlaylist(playlist) {
  if (!playlist) return null
  return {
    id: playlist.id,
    name: playlist.name,
    picUrl: playlist.picUrl || playlist.coverImgUrl || playlist.cover || '',
    playCount: playlist.playCount || 0,
    trackCount: playlist.trackCount || playlist.size || 0,
    creator: playlist.creator?.nickname || '',
    description: playlist.description || playlist.copywriter || '',
    copywriter: playlist.copywriter || playlist.description || '',
    updateFrequency: playlist.updateFrequency || '',
  }
}

export function normalizeRecordSong(item) {
  const song = item?.song || item
  if (!song) return null
  return {
    id: song.id,
    name: song.name,
    ar: song.ar || song.artists || [],
    al: song.al || song.album || {},
    dt: song.dt || song.duration || 0,
    picUrl: extractCover(song),
    playCount: item?.playCount || item?.score || 0,
  }
}

export function normalizeLocalHistorySong(item) {
  return {
    id: item.id,
    name: item.name,
    ar: item.artists || [],
    al: item.album || {},
    picUrl: item.picUrl || extractCover(item),
    dt: item.duration || 0,
  }
}

export function parseHomepageBlocks(res) {
  const blocks = res?.data?.blocks || res?.blocks || []
  return blocks.map((block, index) => {
    const title = block.uiElement?.subTitle?.title || block.uiElement?.mainTitle?.title || block.blockCode || `推荐 ${index + 1}`
    const creatives = block.creatives || block.extInfo || []
    const rawItems = (Array.isArray(creatives) ? creatives : []).flatMap(creative => {
      const resources = creative.resources || creative.resourceExtInfo?.artists || []
      if (resources.length) {
        return resources.map(r => ({ creative, resource: r }))
      }
      return [{ creative, resource: creative }]
    }).filter(Boolean)
    const items = rawItems.map(({ creative, resource }) => normalizeHomepageResource(creative, resource)).filter(Boolean).slice(0, 12)
    const kind = items.find(item => item.kind)?.kind || ''
    return { id: block.blockCode || index, title, showType: block.showType || '', kind, items }
  }).filter(block => block.kind && block.items.length > 0).slice(0, 8)
}

function normalizeHomepageResource(creative, resource) {
  const ext = resource.resourceExtInfo || creative.resourceExtInfo || {}
  const resourceType = String(resource.resourceType || creative.creativeType || '').toLowerCase()
  const title = resource.uiElement?.mainTitle?.title || creative.uiElement?.mainTitle?.title || resource.title || creative.title || ''
  const subtitle = resource.uiElement?.subTitle?.title || creative.uiElement?.subTitle?.title || ''
  const picUrl = resource.uiElement?.image?.imageUrl || creative.uiElement?.image?.imageUrl || ''

  if (resourceType.includes('song') || ext.songData || ext.song) {
    const song = normalizeSong(ext.songData || ext.song || resource)
    if (!song?.id) return null
    return { kind: 'song', ...song, name: song.name || title, picUrl: song.picUrl || picUrl, reason: subtitle }
  }

  if (resourceType.includes('album') || ext.albumData) {
    const album = normalizeAlbum(ext.albumData || resource)
    if (!album?.id) return null
    return { kind: 'album', ...album, name: album.name || title, picUrl: album.picUrl || picUrl, artistName: album.artistName || subtitle }
  }

  if (resourceType.includes('list') || resourceType.includes('playlist') || ext.playlistData) {
    const playlist = normalizePlaylist({
      ...(ext.playlistData || resource),
      id: resource.resourceId || ext.playlistData?.id || resource.id,
      name: title || ext.playlistData?.name || resource.name,
      coverImgUrl: picUrl || ext.playlistData?.coverImgUrl,
      copywriter: subtitle,
    })
    if (!playlist?.id) return null
    return { kind: 'playlist', ...playlist }
  }

  return null
}