import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const path = '/device-pairing'
const token = /^[A-Za-z0-9_-]{32}$/
const encodedKey = /^[A-Za-z0-9_-]{87}$/
const encodedIv = /^[A-Za-z0-9_-]{16}$/
const maxBytes = 512 * 1024
const lifetime = 3 * 60_000
const digest = value => createHash('sha256').update(value).digest()

async function readJson(req, limit) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) throw new Error('json')
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function createDevicePairingRelay() {
  const rooms = new Map()

  return async (req, res, next) => {
    const pathname = req.url?.split('?', 1)[0] || ''
    if (pathname !== path && !pathname.startsWith(path + '/')) return next?.()
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, GET, DELETE, OPTIONS')
    const send = (status, value) => {
      res.statusCode = status
      if (value !== undefined) {
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify(value))
      }
      res.end()
    }

    if (req.method === 'OPTIONS') return send(204)
    const secret = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{32})$/)?.[1]
    if (!secret) return send(401)
    const now = Date.now()
    for (const [id, room] of rooms) if (room.expires <= now) { clearTimeout(room.eviction); rooms.delete(id) }

    try {
      if (pathname === path && req.method === 'POST') {
        if (rooms.size >= 128) return send(429)
        const { id, writeToken } = await readJson(req, 1024)
        if (typeof id !== 'string' || !token.test(id) || typeof writeToken !== 'string' || !token.test(writeToken) || secret === writeToken) return send(400)
        if (rooms.has(id)) return send(409)
        if (rooms.size >= 128) return send(429)
        const expires = now + lifetime
        const eviction = setTimeout(() => rooms.delete(id), lifetime)
        eviction.unref()
        rooms.set(id, { read: digest(secret), write: digest(writeToken), expires, envelope: null, eviction })
        return send(201, { expires })
      }
      const id = pathname.slice(path.length + 1)
      const room = rooms.get(id)
      if (!token.test(id) || !room) return send(404)
      const claim = digest(secret)
      if (req.method === 'PUT') {
        if (!timingSafeEqual(room.write, claim)) return send(404)
        if (room.envelope) return send(409)
        const { senderKey, iv, ciphertext } = await readJson(req, maxBytes)
        if (room.expires <= Date.now() || rooms.get(id) !== room) return send(404)
        if (room.envelope) return send(409)
        if (!encodedKey.test(senderKey ?? '') || !encodedIv.test(iv ?? '')
          || typeof ciphertext !== 'string' || !/^[A-Za-z0-9_-]+$/.test(ciphertext)) return send(400)
        room.envelope = { senderKey, iv, ciphertext }
        return send(204)
      }
      if (!timingSafeEqual(room.read, claim)) return send(404)
      if (req.method === 'GET') return room.envelope ? send(200, room.envelope) : send(204)
      if (req.method === 'DELETE') { clearTimeout(room.eviction); rooms.delete(id); return send(204) }
      return send(405)
    } catch { return send(400) }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const relay = createDevicePairingRelay()
  const port = Number(process.env.ZHETING_PAIRING_PORT || '5714')
  createServer((req, res) => relay(req, res, () => {
    res.statusCode = 404
    res.end()
  })).listen(port, '127.0.0.1', () => console.log('Device pairing relay listening on 127.0.0.1:' + port))
}
