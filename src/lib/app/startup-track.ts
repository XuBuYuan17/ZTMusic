import type { CompactTrack } from '../player/queue.ts'
import type { SongId } from '../types/music.ts'

export const STARTUP_TRACK: CompactTrack = {
  id: 2709782550,
  name: '下等马',
  ar: [{ id: 906118, name: '洛天依Official' }, { id: 34477557, name: 'ChiliChill乐团' }],
  al: { id: 285961225, name: '闪耀', picUrl: 'https://p1.music.126.net/cVnYnnHwjXj9xN5ymz6dsw==/109951172051500248.jpg' },
  picUrl: 'https://p1.music.126.net/cVnYnnHwjXj9xN5ymz6dsw==/109951172051500248.jpg',
  dt: 186944,
}

export function getStartupTrack(player: { id: SongId; currentTrack: unknown; queue: readonly unknown[] }): CompactTrack | null {
  return !player.id && !player.currentTrack && player.queue.length === 0 ? STARTUP_TRACK : null
}
