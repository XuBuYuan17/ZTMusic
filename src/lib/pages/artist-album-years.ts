export function albumReleaseYear(publishTime: unknown): number | null {
  if (typeof publishTime !== 'string' && typeof publishTime !== 'number') return null
  const value = typeof publishTime === 'string' ? publishTime.trim() : publishTime
  if (!value || value === '0') return null
  const timestamp = typeof value === 'string' && /^-?\d{5,}$/.test(value) ? Number(value) : value
  const year = new Date(timestamp).getFullYear()
  return Number.isNaN(year) ? null : year
}

export function groupArtistAlbumsByYear<T extends { publishTime?: unknown }>(albums: readonly T[]): { year: number | null; albums: T[] }[] {
  const groups = new Map<number | null, T[]>()
  for (const album of albums) {
    const year = albumReleaseYear(album.publishTime)
    const group = groups.get(year)
    if (group) group.push(album)
    else groups.set(year, [album])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (b ?? -Infinity) - (a ?? -Infinity))
    .map(([year, albums]) => ({ year, albums }))
}
