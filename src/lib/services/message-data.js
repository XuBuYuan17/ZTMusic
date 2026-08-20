import { ncm } from '../api/client.js'
import { getMessageIdentity, getMessageTime, getMessageUnreadCount } from './message-read-state.js'

const PRIVATE_CACHE_TTL = 30 * 1000

let privateCache = null
let privateCacheTime = 0
let privateRequest = null

export function extractMessageList(response) {
  if (Array.isArray(response)) return response
  for (const value of [
    response?.msgs,
    response?.messages,
    response?.data,
    response?.data?.msgs,
    response?.data?.messages,
    response?.notices,
    response?.forwards,
    response?.data?.notices,
    response?.data?.forwards,
  ]) {
    if (Array.isArray(value)) return value
  }
  return []
}

export function getMessageKind(msg) {
  return msg?._messageKind || 'private'
}

export function getMessageKindLabel(msg) {
  return {
    private: '私信',
    contact: '联系人',
    notice: '通知',
    mention: '提及',
  }[getMessageKind(msg)] || '提醒'
}

export function isConversationMessage(msg) {
  const kind = getMessageKind(msg)
  return kind === 'private' || kind === 'contact'
}

export function parseNoticePayload(msg) {
  const raw = msg?.notice ?? msg?.msg ?? msg?.content
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return null }
}

export function getNoticeSummary(msg) {
  const notice = parseNoticePayload(msg)
  if (!notice) return '新的互动通知'
  if (notice.generalNotice?.actionDesc) return notice.generalNotice.actionDesc
  const comment = notice.comment?.content
  if (notice.type === 6) return comment ? `回复了你的评论：${comment}` : '回复了你的评论'
  if (notice.type === 1) return '赞了你的动态'
  if (notice.type === 2) return '转发了你的动态'
  if (notice.type === 3) return '关注了你'
  const resource = notice.track?.info?.commentThread?.resourceInfo?.name
  return resource ? `与你的${resource}产生了互动` : '新的互动通知'
}

function getUserId(msg) {
  const user = msg?.fromUser || msg?.toUser || msg?.user || {}
  return user.userId || user.id || msg?.userId || msg?.fromUserId || msg?.toUserId
}

function getRawContent(msg) {
  return msg?.lastMsg ?? msg?.msg ?? msg?.content ?? msg?.notice ?? msg?.json ?? ''
}

function hasUsefulContent(msg) {
  return Boolean(getUserId(msg) || getMessageIdentity(msg) || getRawContent(msg))
}

function getMergeKey(msg, index) {
  const kind = getMessageKind(msg)
  const userId = getUserId(msg)
  if ((kind === 'private' || kind === 'contact') && userId) return `conversation:${userId}`
  const id = getMessageIdentity(msg)
  if (id) return `${kind}:${id}`
  return `${kind}:${getMessageTime(msg)}:${String(getRawContent(msg)).slice(0, 80)}:${index}`
}

function mergePair(previous, next) {
  const latest = getMessageTime(next) >= getMessageTime(previous) ? next : previous
  const other = latest === next ? previous : next
  const kind = getMessageKind(previous) === 'private' || getMessageKind(next) === 'private'
    ? 'private'
    : getMessageKind(latest)
  return {
    ...other,
    ...latest,
    _messageKind: kind,
    newMsgCount: Math.max(getMessageUnreadCount(previous), getMessageUnreadCount(next)),
  }
}

export function mergeMessageGroups(groups) {
  const merged = new Map()
  let index = 0
  for (const group of groups) {
    const kind = group.kind
    for (const raw of extractMessageList(group.response)) {
      const msg = { ...raw, _messageKind: kind }
      if (!hasUsefulContent(msg)) continue
      const key = getMergeKey(msg, index++)
      merged.set(key, merged.has(key) ? mergePair(merged.get(key), msg) : msg)
    }
  }
  return [...merged.values()].sort((a, b) => getMessageTime(b) - getMessageTime(a))
}

export async function loadPrivateMessageResponse({ force = false } = {}) {
  const now = Date.now()
  if (!force && privateCache && now - privateCacheTime < PRIVATE_CACHE_TTL) return privateCache
  if (!force && privateRequest) return privateRequest

  const request = ncm.msgPrivate(30, 0)
    .then((response) => {
      privateCache = response
      privateCacheTime = Date.now()
      return response
    })
    .finally(() => {
      if (privateRequest === request) privateRequest = null
    })
  privateRequest = request
  return request
}

export async function loadMessageGroups({ force = false } = {}) {
  const primary = await loadPrivateMessageResponse({ force })
  const groups = [
    { kind: 'private', response: primary },
    ...await loadAuxiliaryMessageGroups(),
  ]
  const values = groups.map(group => group.response)
  if (groups.some(group => extractMessageList(group.response).length > 0)) return groups
  if (values.some(value => value?.code === 301 || value?.code === 302)) {
    const error = new Error('登录已失效，请重新登录')
    error.code = 301
    throw error
  }
  return groups
}

export async function loadAuxiliaryMessageGroups() {
  const loaders = [
    ['contact', () => ncm.msgRecentContact()],
    ['notice', () => ncm.msgNotices(30)],
    ['mention', () => ncm.msgForwards(30, 0)],
  ]
  const results = await Promise.allSettled(loaders.map(([, load]) => load()))
  return results.flatMap((result, index) => result.status === 'fulfilled'
    ? [{ kind: loaders[index][0], response: result.value }]
    : [])
}
