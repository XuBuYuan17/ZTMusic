const tokenPattern = /^[A-Za-z0-9_-]{32}$/
const keyPattern = /^[A-Za-z0-9_-]{87}$/
const ivPattern = /^[A-Za-z0-9_-]{16}$/
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const prefix = 'zheting-pair:v1:'
const context = encoder.encode('zheting-device-pairing-v1')
const maxCiphertext = 510 * 1024

export interface DevicePairingCode {
  id: string
  writeToken: string
  sharedSecret: string
  receiverKey: string
  backend: string
  expires: number
}

interface PairingEnvelope { senderKey: string; iv: string; ciphertext: string }

export interface DevicePairingReceiver {
  value: DevicePairingCode
  code: string
  readToken: string
  privateKey: CryptoKey
}

export const devicePairingConfigured = Boolean(import.meta.env?.DEV || import.meta.env?.VITE_DEVICE_PAIRING_URL)

function relayUrl(): string {
  const configured = import.meta.env?.VITE_DEVICE_PAIRING_URL?.trim()
  if (!configured && import.meta.env?.DEV) return '/device-pairing'
  if (!configured) throw new Error('此版本尚未配置设备配对服务')
  const url = new URL(configured)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('设备配对服务必须使用 HTTPS')
  }
  return url.href.replace(/\/$/, '')
}

function encode(value: Uint8Array): string {
  let result = ''
  for (let offset = 0; offset < value.length; offset += 8192) result += String.fromCharCode(...value.subarray(offset, offset + 8192))
  return btoa(result).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
}

function randomToken(): string {
  return encode(crypto.getRandomValues(new Uint8Array(24)))
}

function requireCrypto(): void {
  if (!globalThis.crypto?.subtle) throw new Error('配对需要支持加密的安全界面，请使用 HTTPS 或应用内窗口')
}

export function encodeDevicePairingCode(value: DevicePairingCode): string {
  return prefix + encode(encoder.encode(JSON.stringify(value)))
}

export function decodeDevicePairingCode(code: string): DevicePairingCode {
  const raw = code.trim()
  if (!raw.startsWith(prefix) || raw.length > 1024) throw new Error('请扫描哲听的设备配对二维码')
  let value: DevicePairingCode
  try { value = JSON.parse(decoder.decode(decode(raw.slice(prefix.length)))) }
  catch { throw new Error('配对二维码无法读取') }
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !tokenPattern.test(value.id)
    || typeof value.writeToken !== 'string' || !tokenPattern.test(value.writeToken)
    || typeof value.sharedSecret !== 'string' || !tokenPattern.test(value.sharedSecret)
    || typeof value.receiverKey !== 'string' || !keyPattern.test(value.receiverKey)
    || typeof value.backend !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.backend)
    || !Number.isFinite(value.expires) || value.expires <= Date.now() || value.expires > Date.now() + 6 * 60_000) {
    throw new Error('配对二维码无效或已过期，请重新生成')
  }
  return value
}

export async function devicePairingBackend(backend: string): Promise<string> {
  requireCrypto()
  const url = new URL(backend)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('设备配对要求使用无嵌入凭据的 HTTPS 网易云 API 地址')
  return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(url.href.replace(/\/$/, '')))))
}

export async function devicePairingVerification(value: DevicePairingCode): Promise<string> {
  requireCrypto()
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value.id + value.receiverKey + value.sharedSecret))
  return String(new DataView(bytes).getUint32(0) % 1_000_000).padStart(6, '0')
}

async function makeKeys(): Promise<{ privateKey: CryptoKey; publicKey: string }> {
  requireCrypto()
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  return { privateKey: keys.privateKey, publicKey: encode(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))) }
}

async function encryptionKey(privateKey: CryptoKey, publicKey: string, value: DevicePairingCode): Promise<CryptoKey> {
  const peer = await crypto.subtle.importKey('raw', decode(publicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256)
  const material = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: decode(value.sharedSecret), info: context },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

function authenticationData(value: DevicePairingCode): Uint8Array<ArrayBuffer> {
  return encoder.encode(value.id + value.backend + value.receiverKey)
}

export async function encryptDevicePairing(value: DevicePairingCode, payload: unknown): Promise<PairingEnvelope> {
  const sender = await makeKeys()
  const key = await encryptionKey(sender.privateKey, value.receiverKey, value)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = encode(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: authenticationData(value) }, key,
    encoder.encode(JSON.stringify(payload)))))
  if (ciphertext.length > maxCiphertext) throw new Error('迁移数据过多，请减少选中的项目后重试')
  return { senderKey: sender.publicKey, iv: encode(iv), ciphertext }
}

export async function decryptDevicePairing(receiver: DevicePairingReceiver, envelope: PairingEnvelope): Promise<unknown> {
  if (!envelope || !keyPattern.test(envelope.senderKey) || !ivPattern.test(envelope.iv)
    || typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > maxCiphertext) throw new Error('配对数据格式无效')
  try {
    const key = await encryptionKey(receiver.privateKey, envelope.senderKey, receiver.value)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.iv), additionalData: authenticationData(receiver.value) },
      key, decode(envelope.ciphertext))
    return JSON.parse(decoder.decode(plain))
  } catch { throw new Error('配对数据无法验证，请重新生成二维码') }
}

async function relay(method: string, secret: string, id = '', body?: unknown, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(relayUrl() + (id ? '/' + id : ''), {
    method, signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
    headers: { Authorization: 'Bearer ' + secret, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (response.status === 404) throw new Error('配对已过期、取消或服务地址不匹配')
  if (response.status === 409) throw new Error('该二维码已经使用，请重新生成')
  if (!response.ok) throw new Error('设备配对服务暂不可用')
  return response
}

export async function startDevicePairing(backend: string, signal?: AbortSignal): Promise<DevicePairingReceiver> {
  const keys = await makeKeys()
  const id = randomToken()
  const readToken = randomToken()
  const writeToken = randomToken()
  const sharedSecret = randomToken()
  const fingerprint = await devicePairingBackend(backend)
  const response = await relay('POST', readToken, '', { id, writeToken }, signal)
  const { expires } = await response.json() as { expires: number }
  const value = { id, writeToken, sharedSecret, receiverKey: keys.publicKey, backend: fingerprint, expires }
  return { value, code: encodeDevicePairingCode(value), readToken, privateKey: keys.privateKey }
}

export async function readDevicePairing(receiver: DevicePairingReceiver, signal?: AbortSignal): Promise<unknown | null> {
  const result = await relay('GET', receiver.readToken, receiver.value.id, undefined, signal)
  if (result.status === 204) return null
  return decryptDevicePairing(receiver, await result.json() as PairingEnvelope)
}

export async function submitDevicePairing(value: DevicePairingCode, payload: unknown, signal?: AbortSignal): Promise<void> {
  const envelope = await encryptDevicePairing(value, payload)
  await relay('PUT', value.writeToken, value.id, envelope, signal)
}

export async function closeDevicePairing(receiver: DevicePairingReceiver): Promise<void> {
  await relay('DELETE', receiver.readToken, receiver.value.id)
}
