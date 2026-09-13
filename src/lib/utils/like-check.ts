/**
 * parseLikeCheck — normalise the many shapes NCM's like-check endpoint returns
 * into a plain boolean for a given track id.
 *
 * Kept pure (no runes / store imports) so it can be unit-tested under node.
 */
export function parseLikeCheck(res: unknown, id: string | number): boolean {
  const root = res !== null && typeof res === 'object' && !Array.isArray(res)
    ? res as Record<string, unknown>
    : null
  const data: unknown = root ? (root.data ?? root.result ?? res) : res
  if (typeof data === 'boolean') return data
  if (Array.isArray(data)) {
    const item = data.find((value) => {
      const record = value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
      return !!record && (record.id === id || record.songId === id)
    }) ?? data[0]
    if (typeof item === 'boolean') return item
    const flags = item !== null && typeof item === 'object' ? item as Record<string, unknown> : null
    return Boolean(flags?.liked ?? flags?.like ?? flags?.isLike ?? flags?.success)
  }
  if (data !== null && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (id in record) return Boolean(record[id])
    return Boolean(record.liked ?? record.like ?? record.isLike ?? record.success)
  }
  return false
}
