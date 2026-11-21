import assert from 'node:assert/strict'
import {
  extractMessageList,
  extractChatHistory,
  getNoticeSummary,
  getMessageKindLabel,
  isConversationMessage,
  mergeMessageGroups,
} from './message-data.ts'

assert.deepEqual(extractMessageList({ data: { notices: [{ id: 1 }] } }), [{ id: 1 }])

const messages = mergeMessageGroups([
  {
    kind: 'contact',
    response: { data: [{ userId: 7, lastMsgTime: 100, lastMsg: '{"msg":"旧消息"}' }] },
  },
  {
    kind: 'private',
    response: { msgs: [{ fromUserId: 7, lastMsgTime: 200, lastMsg: '{"msg":"新消息"}', newMsgCount: 2 }] },
  },
  {
    kind: 'notice',
    response: { notices: [{ id: 9, time: 300, notice: '系统通知' }, {}] },
  },
])

assert.equal(messages.length, 2, 'same conversation should be merged and empty records ignored')
assert.equal(messages[0]?.id, 9, 'messages should be sorted newest first')
assert.equal(messages[1]?.newMsgCount, 2, 'unread state should survive conversation merging')
assert.equal(getMessageKindLabel(messages[0]), '通知')
assert.equal(isConversationMessage(messages[0]), false)
assert.equal(isConversationMessage(messages[1]), true)
assert.equal(getNoticeSummary({ notice: JSON.stringify({ type: 6, comment: { content: '收到' } }) }), '回复了你的评论：收到')
assert.equal(getNoticeSummary({ notice: '{invalid' }), '新的互动通知')

const history = [{ time: '1970-01-01T00:00:00.300Z', id: 'recent' }, { time: 100, id: 'old' }, { lastMsgTime: '200', id: 'middle' }, null]
assert.deepEqual(extractChatHistory({ msgs: history }).map(item => item.id), ['old', 'middle', 'recent'])
assert.equal(history[0]?.id, 'recent', 'sorting the conversation leaves the API response untouched')
console.log('message data self-check: 11 assertions passed')
