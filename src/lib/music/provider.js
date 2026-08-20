const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]*$/

export function defineMusicProvider(definition) {
  if (!definition || typeof definition !== 'object') throw new TypeError('Music provider must be an object')
  if (!PROVIDER_ID_PATTERN.test(definition.id || '')) throw new TypeError('Music provider requires a stable lowercase id')
  if (typeof definition.name !== 'string' || !definition.name.trim()) throw new TypeError('Music provider requires a name')
  if (typeof definition.search !== 'function') throw new TypeError(`Music provider "${definition.id}" must implement search()`)

  const capabilities = Object.keys(definition)
    .filter((key) => typeof definition[key] === 'function')
    .sort()

  return Object.freeze({ ...definition, capabilities: Object.freeze(capabilities) })
}

export class MusicProviderRegistry {
  #providers = new Map()
  #activeId = ''

  register(definition, { replace = false } = {}) {
    const provider = defineMusicProvider(definition)
    if (!replace && this.#providers.has(provider.id)) throw new Error(`Music provider already registered: ${provider.id}`)
    this.#providers.set(provider.id, provider)
    if (!this.#activeId) this.#activeId = provider.id
    return provider
  }

  setActive(id) {
    if (!this.#providers.has(id)) throw new Error(`Unknown music provider: ${id}`)
    this.#activeId = id
  }

  getActive() {
    const provider = this.#providers.get(this.#activeId)
    if (!provider) throw new Error('No music provider registered')
    return provider
  }

  list() {
    return [...this.#providers.values()].map(({ id, name, capabilities }) => ({ id, name, capabilities }))
  }

  call(capability, ...args) {
    const provider = this.getActive()
    const method = provider[capability]
    if (typeof method !== 'function') throw new Error(`Music provider "${provider.id}" does not support ${capability}`)
    return method.apply(provider, args)
  }
}
