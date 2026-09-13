import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const queuePanel = await readFile(new URL('../components/QueuePanel.svelte', import.meta.url), 'utf8')
const playerStore = await readFile(new URL('../stores/player.svelte.ts', import.meta.url), 'utf8')

assert.doesNotMatch(queuePanel, /player\.(?:queue|queueIndex)\s*=(?!=)/, 'QueuePanel must not mutate queue state directly')
assert.match(queuePanel, /player\.moveQueueItem\(/, 'QueuePanel reorder must use the Player API')
assert.match(queuePanel, /player\.removeQueueItem\(/, 'QueuePanel remove must use the Player API')

for (const method of ['moveQueueItem', 'removeQueueItem', 'clearQueue', 'replaceQueue']) {
  assert.match(playerStore, new RegExp(`\\b${method}\\(`), `Player must expose ${method}`)
}

assert.match(playerStore, /setStorage\(STORAGE_KEYS\.PLAYER_QUEUE, this\.queue\)/, 'queue mutations must persist queue')
assert.match(playerStore, /setStorage\(STORAGE_KEYS\.PLAYER_QI, this\.queueIndex\)/, 'queue mutations must persist queueIndex')

console.log('queue API boundary: 9 assertions passed')
