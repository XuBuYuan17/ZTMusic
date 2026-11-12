export const RELEASES_URL = 'https://github.com/XuBuYuan17/ZTMusic/releases'
const LATEST_URL = 'https://api.github.com/repos/XuBuYuan17/ZTMusic/releases/latest'

export type UpdateResult = { status: 'none' } | { status: 'newer' | 'same' | 'ahead' | 'unknown'; version: string }

function versionParts(value: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim())
  if (!match) return null
  const parts = match.slice(1).map(Number)
  return parts.every(Number.isSafeInteger) ? parts : null
}

export function compareVersions(current: string, latest: string): number | null {
  const left = versionParts(current), right = versionParts(latest)
  if (!left || !right) return null
  for (let i = 0; i < 3; i++) {
    if (left[i]! !== right[i]!) return left[i]! < right[i]! ? -1 : 1
  }
  return 0
}

export async function checkForUpdates(current: string, fetcher: typeof fetch = fetch): Promise<UpdateResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetcher(LATEST_URL, { headers: { Accept: 'application/vnd.github+json' }, signal: controller.signal, cache: 'no-store' })
    if (response.status === 404) return { status: 'none' }
    if (!response.ok) throw new Error(`Update check failed: ${response.status}`)
    const body: unknown = await response.json()
    const value = body && typeof body === 'object' ? (body as { tag_name?: unknown }).tag_name : null
    if (typeof value !== 'string' || !value.trim() || value.length > 80) throw new Error('Invalid release response')
    const version = value.trim()
    const compared = compareVersions(current, version)
    return { status: compared === null ? 'unknown' : compared < 0 ? 'newer' : compared > 0 ? 'ahead' : 'same', version }
  } finally { clearTimeout(timeout) }
}
