export function normalizeVipInfo(res) {
  const data = res?.data || res || {}
  const vip = data.vip || data.associator || data.musicPackage || data
  const vipType = Number(data.vipType ?? data.redVipLevel ?? vip.vipType ?? 0) || 0
  const vipLevel = Number(data.vipLevel ?? data.redVipLevel ?? vip.vipLevel ?? 0) || 0
  return {
    vipType,
    vipLevel,
    isVip: vipType > 0 || vipLevel > 0 || Boolean(data.isVip || vip.isVip),
    raw: data,
  }
}

export async function fetchVipInfo(api) {
  try {
    const res = await api.vipInfoV2()
    if (!res?.code || res.code === 200) return res
  } catch {}
  return api.vipInfo()
}