/**
 * 喜欢页接入共享列表的自检：共享组件、次数刷新、失败不丢行。
 * 跑法：node --experimental-strip-types src/lib/pages/liked-shared-list.test.ts
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (file: string) => readFile(new URL(file, import.meta.url), 'utf8')
const liked = await read('./pc/Liked.svelte')
const menu = await read('../components/SongContextMenu.svelte')
const likes = await read('../services/likes.ts')

// ── 1) 复用共享列表与菜单 ──
assert.ok(liked.includes("import SongList from '../../components/SongList.svelte'"), 'uses the shared list')
assert.ok(liked.includes('<SongList'), 'renders the shared list')
assert.ok(liked.includes('toSongRows(songs)'), 'normalizes its own data into shared rows')
assert.ok(liked.includes('rowActions={songActions?.bindRow ?? null}'), 'keeps the shared row menu')
assert.ok(liked.includes('<SongListActions'), 'keeps the single menu host')
assert.ok(!liked.includes('liked-song-row'), 'the page no longer renders its own row markup')
assert.ok(!liked.includes('.liked-song-list'), 'the page no longer owns row styles')

// ── 2) 保留自己的数据与取消喜欢逻辑 ──
assert.ok(liked.includes('ncm.likelist(uid)'), 'still loads the liked ids itself')
assert.ok(liked.includes('musicService.getTracks'), 'still resolves tracks through the service')
assert.ok(liked.includes('function playTrack('), 'still owns its play-by-index behavior')
assert.ok(!liked.includes('ncm.like('), 'unliking stays in the menu, not in the page')

// ── 3) 取消喜欢成功后列表与计数更新 ──
assert.ok(menu.includes('notifyLikeChange(trackId as SongId)'), 'the menu announces a like change after success')
assert.ok(menu.includes('showToast(nextLiked ?'), 'success toast is unchanged')
assert.ok(likes.includes("export const LIKE_CHANGE = 'local-like-change'"), 'a single event name')
assert.ok(liked.includes('window.addEventListener(LIKE_CHANGE, refresh)'), 'the page refreshes on that event')
assert.ok(liked.includes('void loadLiked()'), 'refresh reloads from the source of truth')
assert.ok(liked.includes('{songs.length} 首歌曲'), 'the hero count follows the reloaded list')

// ── 4) 失败不永久丢行 ──
const catchBlock = liked.slice(liked.indexOf('} catch (e) {'), liked.indexOf('} catch (e) {') + 120)
assert.ok(!/songs = \[\]/.test(catchBlock), 'a failed load must not clear the rows')
assert.ok(catchBlock.includes("error = '加载失败'"), 'a failed load reports instead')
assert.ok(liked.includes('{:else if error && !songs.length}'), 'the error state only takes over when there is nothing to show')
assert.ok(menu.lastIndexOf('notifyLikeChange') > menu.indexOf('await ncm.like'), 'the event only fires after the request succeeds')

// ── 5) 两端播放与菜单一致 ──
assert.ok(liked.includes('currentId={player.id}'), 'the shared list highlights the playing row')
assert.ok(liked.includes('onPlay={(row) => playTrack(row.source as NormalizedSong)}'), 'row click plays through the page logic')
assert.ok(liked.includes('{onOpenArtist}') && liked.includes('{onOpenAlbum}'), 'artist/album links are wired the same on both ends')
assert.ok(liked.includes("emptyText=\"还没有喜欢的歌曲\""), 'empty state is preserved through the shared list')

console.log('liked page: shared list, like-change refresh and safe failure passed')
