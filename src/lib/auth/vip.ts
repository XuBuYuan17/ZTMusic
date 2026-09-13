type Loose = Record<string, unknown>

export interface NormalizedVipInfo {
  vipType: number
  vipLevel: number
  isVip: boolean
  raw: Loose
}

function rec(value: unknown): Loose | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Loose : null
}

export function normalizeVipInfo(res: unknown): NormalizedVipInfo {
  const root = rec(res)
  const data: Loose = rec(root?.data) || root || {}
  const vip: Loose = rec(data.vip) || rec(data.associator) || rec(data.musicPackage) || data
  const vipType = Number(data.vipType ?? data.redVipLevel ?? vip.vipType ?? 0) || 0
  const vipLevel = Number(data.vipLevel ?? data.redVipLevel ?? vip.vipLevel ?? 0) || 0
  return {
    vipType,
    vipLevel,
    isVip: vipType > 0 || vipLevel > 0 || Boolean(data.isVip || vip.isVip),
    raw: data,
  }
}

interface VipApi {
  vipInfoV2(): Promise<unknown>
  vipInfo(): Promise<unknown>
}

export async function fetchVipInfo(api: VipApi): Promise<unknown> {
  try {
    const res = await api.vipInfoV2()
    const code = rec(res)?.code
    if (!code || code === 200) return res
  } catch {}
  return api.vipInfo()
}
