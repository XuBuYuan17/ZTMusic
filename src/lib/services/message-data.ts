import type { SongId } from '../types/music.ts'
import { ncm } from '../api/client.ts'
import { getMessageIdentity, getMessageTime, getMessageUnreadCount } from './message-read-state.ts'

const PRIVATE_CACHE_TTL = 30 * 1000

type Loose = Record<string, unknown>

function asRecord(value: unknown): Loose {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Loose : {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

let privateCache: unknown = null
let privateCacheTime = 0
let privateRequest: Promise<unknown> | null = null

export function extractMessageList(response: unknown): unknown[] {
  if (Array.isArray(response)) return response
  const r = asRecord(response)
  const d = asRecord(r.data)
  for (const value of [
    r.msgs,
    r.messages,
    r.data,
    d.msgs,
    d.messages,
    r.notices,
    r.forwards,
    d.notices,
    d.forwards,
  ]) {
    if (Array.isArray(value)) return value
  }
  return []
}

export function getMessageKind(msg: unknown): string {
  const kind = asRecord(msg)._messageKind
  return typeof kind === 'string' ? kind : 'private'
}

export function getMessageKindLabel(msg: unknown): string {
  const labels: Record<string, string> = {
    private: '私信',
    contact: '联系人',
    notice: '通知',
    mention: '提及',
  }
  return labels[getMessageKind(msg)] || '提醒'
}

export function isConversationMessage(msg: unknown): boolean {
  const kind = getMessageKind(msg)
  return kind === 'private' || kind === 'contact'
}

export function parseNoticePayload(msg: unknown): unknown {
  const m = asRecord(msg)
  const raw = m.notice ?? m.msg ?? m.content
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try { return JSON.parse(asString(raw)) } catch { return null }
}

export function getNoticeSummary(msg: unknown): string {
  const notice = parseNoticePayload(msg)
  if (!notice) return '新的互动通知'
  const n = asRecord(notice)
  const actionDesc = asRecord(n.generalNotice).actionDesc
  if (typeof actionDesc === 'string' && actionDesc) return actionDesc
  const comment = asString(asRecord(n.comment).content)
  if (n.type === 6) return comment ? `回复了你的评论：${comment}` : '回复了你的评论'
  if (n.type === 1) return '赞了你的动态'
  if (n.type === 2) return '转发了你的动态'
  if (n.type === 3) return '关注了你'
  const resource = asRecord(asRecord(asRecord(asRecord(n.track).info).commentThread).resourceInfo).name
  return resource ? `与你的${asString(resource)}产生了互动` : '新的互动通知'
}

function getUserId(msg: unknown): SongId | undefined {
  const m = asRecord(msg)
  const user = asRecord(m.fromUser || m.toUser || m.user)
  const id = user.userId || user.id || m.userId || m.fromUserId || m.toUserId
  return typeof id === 'string' || typeof id === 'number' ? id : undefined
}

function getRawContent(msg: unknown): unknown {
  const m = asRecord(msg)
  return m.lastMsg ?? m.msg ?? m.content ?? m.notice ?? m.json ?? ''
}

function hasUsefulContent(msg: Loose): boolean {
  return Boolean(getUserId(msg) || getMessageIdentity(msg) || getRawContent(msg))
}

function getMergeKey(msg: Loose, index: number): string {
  const kind = getMessageKind(msg)
  const userId = getUserId(msg)
  if ((kind === 'private' || kind === 'contact') && userId) return `conversation:${userId}`
  const id = getMessageIdentity(msg)
  if (id) return `${kind}:${id}`
  return `${kind}:${getMessageTime(msg)}:${String(getRawContent(msg)).slice(0, 80)}:${index}`
}

function mergePair(previous: Loose, next: Loose): Loose {
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

export interface MessageGroup {
  kind: string
  response: unknown
}

export function mergeMessageGroups(groups: ReadonlyArray<{ kind: unknown; response: unknown }>): Loose[] {
  const merged = new Map<string, Loose>()
  let index = 0
  for (const group of groups) {
    const kind = group.kind
    for (const raw of extractMessageList(group.response)) {
      const msg: Loose = { ...asRecord(raw), _messageKind: kind }
      if (!hasUsefulContent(msg)) continue
      const key = getMergeKey(msg, index++)
      const existing = merged.get(key)
      merged.set(key, existing ? mergePair(existing, msg) : msg)
    }
  }
  return [...merged.values()].sort((a, b) => getMessageTime(b) - getMessageTime(a))
}

export async function loadPrivateMessageResponse({ force = false }: { force?: boolean } = {}): Promise<unknown> {
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

export async function loadMessageGroups({ force = false }: { force?: boolean } = {}): Promise<MessageGroup[]> {
  const primary = await loadPrivateMessageResponse({ force })
  const groups: MessageGroup[] = [
    { kind: 'private', response: primary },
    ...await loadAuxiliaryMessageGroups(),
  ]
  const values = groups.map(group => group.response)
  if (groups.some(group => extractMessageList(group.response).length > 0)) return groups
  if (values.some((value) => { const code = asRecord(value).code; return code === 301 || code === 302 })) {
    const error = new Error('登录已失效，请重新登录') as Error & { code: number }
    error.code = 301
    throw error
  }
  return groups
}

export async function loadAuxiliaryMessageGroups(): Promise<MessageGroup[]> {
  const loaders: Array<[string, () => Promise<unknown>]> = [
    ['contact', () => ncm.msgRecentContact()],
    ['notice', () => ncm.msgNotices(30)],
    ['mention', () => ncm.msgForwards(30, 0)],
  ]
  const results = await Promise.allSettled(loaders.map(([, load]) => load()))
  return results.flatMap((result, index) => result.status === 'fulfilled'
    ? [{ kind: loaders[index]![0], response: result.value }]
    : [])
}
