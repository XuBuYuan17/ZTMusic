import type {
  AlbumDetail,
  ArtistDetail,
  HotSearchItem,
  LyricLine,
  PlayStream,
  PlaylistDetail,
  SearchOptions,
  SearchResult,
  Song,
  SongId,
  StreamOptions,
} from '../types/music.ts'

const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]*$/

/**
 * 能力型 Provider 契约。内置网易云 Provider 实现全部方法；
 * 第三方 Provider 只需实现 search，其余能力按需提供，由 capabilities 暴露、
 * registry.call 在运行时检查。
 */
export interface MusicProvider {
  readonly id: string
  readonly name: string
  readonly capabilities: readonly string[]

  search(query: string, options?: SearchOptions): Promise<SearchResult>
  getHotSearch(): Promise<HotSearchItem[]>
  getTopSongs(limit?: number): Promise<Song[]>
  getLyrics(id: SongId): Promise<LyricLine[]>
  getStream(id: SongId, options?: StreamOptions): Promise<PlayStream>
  getMatchedStream(id: SongId): Promise<PlayStream>
  getLegacyStream(id: SongId, bitrate?: number): Promise<PlayStream>
  getTracks(ids: SongId[]): Promise<Song[]>
  getPlaylist(id: SongId): Promise<PlaylistDetail | null>
  getAlbum(id: SongId): Promise<AlbumDetail>
  getArtist(id: SongId): Promise<ArtistDetail>
}

/**
 * register / defineMusicProvider 的输入形状。
 * 注册表是动态能力表，唯一强制的能力是 search，其余方法通过泛型保留在 T 上，
 * 返回值的精确类型由 musicService 门面保证（见 service.ts）。
 */
export interface MusicProviderDefinition {
  id: string
  name: string
  search: (query: string, options?: SearchOptions) => unknown
}

/** defineMusicProvider 冻结后的注册项 */
export interface RegisteredMusicProvider {
  readonly id: string
  readonly name: string
  readonly capabilities: readonly string[]
  readonly [method: string]: unknown
}

export function defineMusicProvider<T extends MusicProviderDefinition>(
  definition: T,
): T & { readonly capabilities: readonly string[] } {
  if (!definition || typeof definition !== 'object') throw new TypeError('Music provider must be an object')
  if (!PROVIDER_ID_PATTERN.test(definition.id || '')) throw new TypeError('Music provider requires a stable lowercase id')
  if (typeof definition.name !== 'string' || !definition.name.trim()) throw new TypeError('Music provider requires a name')
  if (typeof definition.search !== 'function') throw new TypeError(`Music provider "${definition.id}" must implement search()`)

  const capabilities = Object.entries(definition)
    .filter(([, value]) => typeof value === 'function')
    .map(([key]) => key)
    .sort()

  return Object.freeze({ ...definition, capabilities: Object.freeze(capabilities) })
}

export interface RegisterOptions {
  replace?: boolean
}

export class MusicProviderRegistry {
  #providers = new Map<string, RegisteredMusicProvider>()
  #activeId = ''

  register<T extends MusicProviderDefinition>(
    definition: T,
    { replace = false }: RegisterOptions = {},
  ): RegisteredMusicProvider {
    // 动态能力表的唯一接缝：运行时方法集合由 capabilities 暴露，超出静态契约
    const provider = defineMusicProvider(definition) as unknown as RegisteredMusicProvider
    if (!replace && this.#providers.has(provider.id)) throw new Error(`Music provider already registered: ${provider.id}`)
    this.#providers.set(provider.id, provider)
    if (!this.#activeId) this.#activeId = provider.id
    return provider
  }

  setActive(id: string): void {
    if (!this.#providers.has(id)) throw new Error(`Unknown music provider: ${id}`)
    this.#activeId = id
  }

  getActive(): RegisteredMusicProvider {
    const provider = this.#providers.get(this.#activeId)
    if (!provider) throw new Error('No music provider registered')
    return provider
  }

  list(): Array<{ id: string; name: string; capabilities: readonly string[] }> {
    return [...this.#providers.values()].map(({ id, name, capabilities }) => ({ id, name, capabilities }))
  }

  call(capability: string, ...args: unknown[]): unknown {
    const provider = this.getActive()
    const method = provider[capability]
    if (typeof method !== 'function') throw new Error(`Music provider "${provider.id}" does not support ${capability}`)
    return (method as (...callArgs: unknown[]) => unknown).apply(provider, args)
  }
}
