/**
 * 最近播放 / 历史日推接入共享列表的自检。
 * 跑法：node --experimental-strip-types src/lib/pages/history-shared-list.test.ts
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (file: string) => readFile(new URL(file, import.meta.url), 'utf8')
const recent = await read('./pc/Recent.svelte')
const daily = await read('./pc/DailyHistory.svelte')
const list = await read('../components/SongList.svelte')
const rowData = await read('../components/song-row.ts')
const scroll = await read('../app/scroll-viewport.ts')

// ── 1) 两个页面各自迁移到共享列表 ──
for (const [name, page] of [['recent', recent], ['dailyHistory', daily]] as const) {
  assert.ok(page.includes("import SongList from '../../components/SongList.svelte'"), `${name} uses the shared list`)
  assert.ok(page.includes('<SongList'), `${name} renders it`)
  assert.ok(page.includes('toSongRows('), `${name} normalizes its own data`)
  assert.ok(page.includes('rowActions={songActions?.bindRow ?? null}'), `${name} keeps the shared row menu`)
  assert.ok(page.includes('<SongListActions'), `${name} keeps the single menu host`)
}

// 页面不再自己渲染行
assert.ok(!recent.includes('<tr class:active'), 'recent no longer renders table rows itself')
assert.ok(!daily.includes('daily-song-row'), 'daily history no longer renders its own rows')

// ── 2) 日期与分组不丢 ──
assert.ok(daily.includes('daily-date-scroll'), 'the date chip rail is kept')
assert.ok(daily.includes('class:active={selectedDailyDate === date}'), 'the selected date stays highlighted')
assert.ok(daily.includes('selectedDailyDate = date as string'), 'picking a date still updates the selection')
assert.ok(daily.includes('selectedDate: selectedDailyDate'), 'the snapshot still remembers the selected date')
assert.ok(daily.includes('const initial = dailySnapshot?.userId === auth.user?.userId ? dailySnapshot : null'), 'the snapshot is restored per account')
assert.ok(daily.includes('const rows = $derived(toSongRows(dailyHistorySongs))'), 'rows follow the selected date')

// 最近播放的分组信息（标题 + 计数）仍在页面
assert.ok(recent.includes('共 {recentTracks.length} 首歌曲'), 'recent keeps its header summary')

// ── 3) 各自队列规则保留 ──
assert.ok(recent.includes('player.playQueue(recentTracks as unknown as CompactTrackInput[], idx)'), 'recent queues the whole recent list at the clicked index')
assert.ok(daily.includes('player.playQueue(dailyHistorySongs as unknown as CompactTrackInput[], idx)'), 'daily queues only the selected date')
assert.ok(recent.includes('onPlay={(row) => playTrack(row.source as RecentTrack)}'), 'recent plays through its own logic')
assert.ok(daily.includes('onPlay={(row) => playTrack(row.source as NormalizedSong)}'), 'daily plays through its own logic')

// ── 4) 重复歌曲可以正常呈现 ──
assert.ok(list.includes('withRowKeys(rows)'), 'the shared list keys rows by id + occurrence')
assert.ok(rowData.includes('occurrence'), 'duplicate ids get distinct keys')
assert.ok(!recent.includes('(track.id)}'), 'recent no longer keys rows by id alone')
assert.ok(!daily.includes('(track.id)}'), 'daily no longer keys rows by id alone')

// ── 5) 返回后恢复滚动位置 ──
assert.ok(scroll.includes('export function trackScrollTop'), 'a scroll memory helper exists')
assert.ok(scroll.includes('export function restoreScrollTop'), 'and a restore helper')
assert.ok(recent.includes("restoreScrollTop('recent', scrollViewport)") && recent.includes("trackScrollTop('recent', scrollViewport)"), 'recent restores its position')
assert.ok(daily.includes("restoreScrollTop('dailyHistory', scrollViewport)") && daily.includes("trackScrollTop('dailyHistory', scrollViewport)"), 'daily restores its position')

console.log('history pages: shared list, date/queue rules and restoration passed')
