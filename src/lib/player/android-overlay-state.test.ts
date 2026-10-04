import assert from 'node:assert/strict'
import { androidOverlayUiState } from './android-overlay-state.ts'

const base = { connected: true, checking: false, awaitingPermission: false, permission: false, requested: false, enabled: false, visible: false }

assert.equal(androidOverlayUiState({ ...base, connected: false }), 'unavailable')
assert.equal(androidOverlayUiState({ ...base, checking: true, permission: true }), 'checking')
assert.equal(androidOverlayUiState({ ...base, awaitingPermission: true }), 'awaiting-permission')
assert.equal(androidOverlayUiState(base), 'permission-required')
assert.equal(androidOverlayUiState({ ...base, requested: true }), 'permission-revoked')
assert.equal(androidOverlayUiState({ ...base, permission: true }), 'ready')
assert.equal(androidOverlayUiState({ ...base, permission: true, requested: true, enabled: true }), 'starting')
assert.equal(androidOverlayUiState({ ...base, permission: true, requested: true, enabled: true, visible: true }), 'active')

console.log('Android overlay UI state: permission, revoked, starting and active transitions passed')
