import type { SongId } from '../types/music.ts'

const PAGE_SIZE = 100
const MAX_PAGES = 100

export async function loadLibraryPlaylists(
  fetchPage: (uid: SongId, options: { limit: number; offset: number; cache: false }) => Promise<unknown>,
  uid: SongId,
  isCurrent: () => boolean = () => true,
): Promise<unknown[]> {
  const result: unknown[] = []
  const ids = new Set<string>()
  let offset = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    if (!isCurrent()) throw new Error('歌单加载已取消')
    const response = await fetchPage(uid, { limit: PAGE_SIZE, offset, cache: false })
    if (!isCurrent()) throw new Error('歌单加载已取消')
    if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('歌单响应格式异常')
    const body = response as Record<string, unknown>
    if (body.code !== undefined && body.code !== 200) throw new Error(typeof body.message === 'string' ? body.message : '加载歌单失败')
    if (!Array.isArray(body.playlist)) throw new Error('歌单列表缺失')
    const list = body.playlist
    let added = 0
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('歌单数据格式异常')
      const id = (item as Record<string, unknown>).id
      if ((typeof id !== 'number' && typeof id !== 'string') || !String(id).trim()) throw new Error('歌单缺少标识')
      const key = String(id)
      if (!ids.has(key)) { ids.add(key); result.push(item); added++ }
    }
    if (body.more === false || (body.more === undefined && list.length < PAGE_SIZE)) return result
    if (!list.length || !added) throw new Error('歌单分页没有继续推进，请重试')
    offset += list.length
  }
  throw new Error('歌单数量超出当前加载上限')
}
