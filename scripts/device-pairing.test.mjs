import assert from 'node:assert/strict'
import { randomBytes, webcrypto } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createDevicePairingRelay } from './device-pairing-relay.mjs'
import {
  decodeDevicePairingCode, decryptDevicePairing, devicePairingBackend, devicePairingVerification,
  encodeDevicePairingCode, encryptDevicePairing,
} from '../src/lib/services/device-pairing.ts'

const handler = createDevicePairingRelay()
const server = createServer((req, res) => handler(req, res, () => res.writeHead(404).end()))
server.listen(0, '127.0.0.1')
await once(server, 'listening')

try {
  const base = 'http://127.0.0.1:' + server.address().port + '/device-pairing'
  const token = () => randomBytes(24).toString('base64url')
  const id = token()
  const readToken = token()
  const writeToken = token()
  const sharedSecret = token()
  const call = (method, bearer, url, body) => fetch(url, {
    method, headers: { Authorization: 'Bearer ' + bearer, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })

  const created = await call('POST', readToken, base, { id, writeToken })
  assert.equal(created.status, 201)
  const { expires } = await created.json()
  const key = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  const receiverKey = Buffer.from(await webcrypto.subtle.exportKey('raw', key.publicKey)).toString('base64url')
  const backend = await devicePairingBackend('https://example.test')
  const value = { id, writeToken, sharedSecret, receiverKey, backend, expires }
  const code = encodeDevicePairingCode(value)
  const parsed = decodeDevicePairingCode(code)
  assert.equal(await devicePairingVerification(parsed), await devicePairingVerification(value))
  assert.throws(() => decodeDevicePairingCode(encodeDevicePairingCode({ ...value, expires: Date.now() - 1 })), /过期/)
  assert.throws(() => decodeDevicePairingCode(encodeDevicePairingCode({ ...value, id: [id] })), /无效/)

  const payload = { version: 1, userId: '42', cookie: 'SYNTHETIC_TEST_CREDENTIAL', history: [{ id: 7 }] }
  const cipher = await encryptDevicePairing(parsed, payload)
  assert.ok(!code.includes(payload.cookie) && !JSON.stringify(cipher).includes(payload.cookie))
  const url = base + '/' + id
  assert.equal((await call('GET', writeToken, url)).status, 404)
  assert.equal((await call('PUT', readToken, url, cipher)).status, 404)
  assert.equal((await call('GET', readToken, url)).status, 204)
  assert.equal((await call('PUT', writeToken, url, cipher)).status, 204)
  assert.equal((await call('PUT', writeToken, url, cipher)).status, 409)
  const stored = await (await call('GET', readToken, url)).json()
  const receiver = { value, readToken, code, privateKey: key.privateKey }
  assert.deepEqual(await decryptDevicePairing(receiver, stored), payload)
  await assert.rejects(decryptDevicePairing({ ...receiver, value: { ...value, sharedSecret: token() } }, stored), /无法验证/)
  assert.equal((await call('DELETE', readToken, url)).status, 204)
  assert.equal((await call('GET', readToken, url)).status, 404)
  console.log('device pairing: code validation, isolated grants, encrypted migration, reuse prevention and cancellation passed')
} finally {
  server.close()
  await once(server, 'close')
}
