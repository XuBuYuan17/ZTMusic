import { router } from '../stores/router.svelte.ts'

// 页面组件的导航回调普遍收 unknown/SongId，router.go* 收 number|null，统一在这一层 cast
export function openPlaylistRef(id: unknown, push = true, preview?: unknown): void {
  router.goPlaylist(id as number | null, push, preview as Parameters<typeof router.goPlaylist>[2])
}
export function openArtistRef(id: unknown): void { router.goArtist(id as number | null) }
export function openAlbumRef(id: unknown): void { router.goAlbum(id as number | null) }
