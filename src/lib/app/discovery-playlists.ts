import daily from '../../assets/discovery/daily.svg'
import heart from '../../assets/discovery/heart.svg'
import roaming from '../../assets/discovery/roaming.svg'
import radar from '../../assets/discovery/radar.svg'

export const discoveryPlaylists = [
  { key: 'daily', routeId: -1, name: '每日推荐', coverImgUrl: daily, description: '每天为你更新的歌曲推荐' },
  { key: 'heart', routeId: -2, name: '心动模式', coverImgUrl: heart, description: '从喜欢的音乐出发，遇见更多心动歌曲' },
  { key: 'roaming', routeId: -3, name: '漫游模式', coverImgUrl: roaming, description: '跟随音乐漫游，连续发现新的歌曲' },
  { key: 'radar', routeId: -4, name: '私人雷达', coverImgUrl: radar, description: '发现你可能喜欢的音乐' },
] as const
export type DiscoveryPlaylistKey = typeof discoveryPlaylists[number]['key']
