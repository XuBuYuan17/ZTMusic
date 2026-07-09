import { dbSettings } from '../db/settings.js'
import { getStorageJson, setStorage } from '../utils/storage.js'

const MESSAGE_READ_STATE_KEY = 'zheting-message-read-state'

export function getInitialMessageReadState() {
  return getStorageJson(MESSAGE_READ_STATE_KEY, {})
}

export async function loadMessageReadState() {
  const state = await dbSettings.getJson(MESSAGE_READ_STATE_KEY, getInitialMessageReadState())
  setStorage(MESSAGE_READ_STATE_KEY, state)
  return state
}

export function saveMessageReadState(state) {
  setStorage(MESSAGE_READ_STATE_KEY, state)
  dbSettings.setJson(MESSAGE_READ_STATE_KEY, state)
}

export function getMessageIdentity(msg) {
  const user = msg?.fromUser || msg?.toUser || msg?.user || {}
  return msg?.id || msg?.msgId || msg?.userId || msg?.fromUserId || msg?.toUserId || user.userId || user.id
}

export function getMessageTime(msg) {
  return msg?.time || msg?.lastMsgTime || 0
}

export function getMessageUnreadCount(msg) {
  return Number(msg?.newMsgCount || msg?.unreadCount || msg?.unread || 0)
}

export function applyMessageReadState(msg, readState) {
  const id = getMessageIdentity(msg)
  if (!id || Number(readState[id] || 0) < getMessageTime(msg)) return msg
  return { ...msg, newMsgCount: 0, unreadCount: 0, unread: 0 }
}

export function countUnreadMessages(messages, readState) {
  return messages.reduce((total, msg) => {
    const id = getMessageIdentity(msg)
    if (id && Number(readState[id] || 0) >= getMessageTime(msg)) return total
    return total + getMessageUnreadCount(msg)
  }, 0)
}