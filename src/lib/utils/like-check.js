/**
 * parseLikeCheck — normalise the many shapes NCM's like-check endpoint returns
 * into a plain boolean for a given track id.
 *
 * Kept pure (no runes / store imports) so it can be unit-tested under node.
 */
export function parseLikeCheck(res, id) {
  const data = res?.data ?? res?.result ?? res
  if (typeof data === 'boolean') return data
  if (Array.isArray(data)) {
    const item = data.find(value => value?.id === id || value?.songId === id) ?? data[0]
    if (typeof item === 'boolean') return item
    return !!(item?.liked ?? item?.like ?? item?.isLike ?? item?.success)
  }
  if (data && typeof data === 'object') {
    if (id in data) return !!data[id]
    return !!(data.liked ?? data.like ?? data.isLike ?? data.success)
  }
  return false
}
