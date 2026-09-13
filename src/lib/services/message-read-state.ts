import type { SongId } from '../types/music.ts'
import { dbSettings } from '../db/settings.ts'
import { getStorageJson } from '../utils/storage.ts'

const MESSAGE_READ_STATE_KEY = 'zheting-message-read-state'

export type MessageReadState = Record<string, number>

type Loose = Record<string, unknown>

function asRecord(value: unknown): Loose {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Loose : {}
}

export function getInitialMessageReadState(): MessageReadState {
  return getStorageJson<MessageReadState>(MESSAGE_READ_STATE_KEY, {})
}

export async function loadMessageReadState(): Promise<MessageReadState | null> {
  const state = await dbSettings.getJson<MessageReadState>(MESSAGE_READ_STATE_KEY, getInitialMessageReadState())
  return state
}

export function saveMessageReadState(state: MessageReadState) {
  return dbSettings.setJson(MESSAGE_READ_STATE_KEY, state)
}

export function getMessageIdentity(msg: unknown): SongId | undefined {
  const m = asRecord(msg)
  const user = asRecord(m.fromUser || m.toUser || m.user)
  const id = m.id || m.msgId || m.userId || m.fromUserId || m.toUserId || user.userId || user.id
  return typeof id === 'string' || typeof id === 'number' ? id : undefined
}

export function getMessageTime(msg: unknown): number {
  const m = asRecord(msg)
  if (typeof m.time === 'number') return m.time
  if (typeof m.lastMsgTime === 'number') return m.lastMsgTime
  return 0
}

export function getMessageUnreadCount(msg: unknown): number {
  const m = asRecord(msg)
  return Number(m.newMsgCount || m.unreadCount || m.unread || 0)
}

export function applyMessageReadState(msg: unknown, readState: MessageReadState): unknown {
  const id = getMessageIdentity(msg)
  if (!id || Number(readState[id] || 0) < getMessageTime(msg)) return msg
  return { ...asRecord(msg), newMsgCount: 0, unreadCount: 0, unread: 0 }
}

export function countUnreadMessages(messages: unknown[], readState: MessageReadState): number {
  return messages.reduce<number>((total, msg) => {
    const id = getMessageIdentity(msg)
    if (id && Number(readState[id] || 0) >= getMessageTime(msg)) return total
    return total + getMessageUnreadCount(msg)
  }, 0)
}
