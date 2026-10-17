/**
 * Sync service for the iPhone/iPad app (docs/COMPANION.md): transport and cryptography only.
 *
 * - Pairing: every device gets its own random 256-bit key, shown once as a QR code; it never
 *   travels over the network.
 * - Every request and answer is AES-256-GCM sealed. The additional data binds them to the device,
 *   the direction and the request time; requests older than 5 minutes or seen before are refused.
 * - Anything that is not a valid request for a known device gets a plain 404 – the port reveals
 *   nothing. The answers themselves are built by the app window (same logic as "Heute").
 */
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import http from 'node:http'

export const PROTOCOL = 'notiva/v1'
const MAX_SKEW = 5 * 60_000
const MAX_BODY = 8_000_000

export interface Device {
  id: string
  name: string
  /** base64, 32 bytes */
  key: string
  created: string
  lastSeen?: string
  /** paired (the QR code was used) – pending ones expire */
  paired: boolean
}

export interface Sealed {
  /** base64 nonce (12 bytes) */
  n: string
  /** base64 ciphertext + 16-byte tag */
  c: string
}

const aad = (direction: 'req' | 'res', device: string, time: number) =>
  Buffer.from(`${PROTOCOL}|${direction}|${device}|${time}`)

export function seal(key: Buffer, data: Buffer, plaintext: Buffer): Sealed {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(data)
  const body = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
  return { n: nonce.toString('base64'), c: body.toString('base64') }
}

/** null when the key, the additional data or the content do not match. */
export function unseal(key: Buffer, data: Buffer, sealed: Sealed): Buffer | null {
  try {
    const nonce = Buffer.from(sealed.n, 'base64')
    const body = Buffer.from(sealed.c, 'base64')
    if (nonce.length !== 12 || body.length < 16) return null
    const decipher = createDecipheriv('aes-256-gcm', key, nonce)
    decipher.setAAD(data)
    decipher.setAuthTag(body.subarray(body.length - 16))
    return Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()])
  } catch {
    return null
  }
}

export const newDevice = (name: string, now = new Date()): Device => ({
  id: randomUUID(),
  name: name.slice(0, 60) || 'iPhone',
  key: randomBytes(32).toString('base64'),
  created: now.toISOString(),
  paired: false,
})

/** What the app does with a request: method + params → result (throws for an error). */
export type Handler = (device: Device, method: string, params: unknown) => Promise<unknown>

export class CompanionServer {
  private server: http.Server | null = null
  /** nonces seen per device in the last minutes (replays are refused) */
  private seen = new Map<string, Map<string, number>>()

  constructor(
    private devices: () => Device[],
    private handler: Handler,
    private onSeen: (device: Device) => void = () => undefined,
    private now: () => number = Date.now,
  ) {}

  get running(): boolean {
    return this.server !== null
  }

  get port(): number {
    const address = this.server?.address()
    return typeof address === 'object' && address ? address.port : 0
  }

  async start(port: number, host = '0.0.0.0'): Promise<void> {
    if (this.server) return
    const server = http.createServer((req, res) => void this.answer(req, res))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => resolve())
    })
    this.server = server
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private async answer(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const nothing = () => {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
    }
    if (req.method !== 'POST' || req.url !== '/v1') return nothing()
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      size += (chunk as Buffer).length
      if (size > MAX_BODY) return nothing()
      chunks.push(chunk as Buffer)
    }
    let envelope: { d?: unknown; t?: unknown; n?: unknown; c?: unknown }
    try {
      envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')) as typeof envelope
    } catch {
      return nothing()
    }
    const { d, t, n, c } = envelope
    if (typeof d !== 'string' || typeof t !== 'number' || typeof n !== 'string' || typeof c !== 'string')
      return nothing()
    const device = this.devices().find((x) => x.id === d)
    if (!device || Math.abs(this.now() - t) > MAX_SKEW) return nothing()
    const key = Buffer.from(device.key, 'base64')
    const plain = unseal(key, aad('req', d, t), { n, c })
    if (!plain || !this.fresh(d, n)) return nothing()
    let request: { m?: unknown; p?: unknown }
    try {
      request = JSON.parse(plain.toString('utf8')) as typeof request
    } catch {
      return nothing()
    }
    this.onSeen(device)
    let reply: unknown
    try {
      const method = typeof request.m === 'string' ? request.m : ''
      reply = { ok: true, r: await this.handler(device, method, request.p) }
    } catch (e) {
      const err = e as { code?: string; detail?: unknown }
      reply = {
        ok: false,
        e: e instanceof Error ? e.message : String(e),
        ...(err.code ? { code: err.code } : {}),
        ...(err.detail !== undefined ? { detail: err.detail } : {}),
      }
    }
    const sealed = seal(key, aad('res', d, t), Buffer.from(JSON.stringify(reply)))
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(sealed))
  }

  /** A nonce is accepted once within the time window. */
  private fresh(device: string, nonce: string): boolean {
    const now = this.now()
    const seen = this.seen.get(device) ?? new Map<string, number>()
    for (const [k, at] of seen) if (now - at > 2 * MAX_SKEW) seen.delete(k)
    if (seen.has(nonce)) return false
    seen.set(nonce, now)
    this.seen.set(device, seen)
    return true
  }
}

/** The client side (used by the tests – the iPhone app does the same in Swift with CryptoKit). */
export async function companionCall(
  url: string,
  device: Pick<Device, 'id' | 'key'>,
  method: string,
  params: unknown = {},
  time = Date.now(),
): Promise<{ ok: boolean; r?: unknown; e?: string; code?: string }> {
  const key = Buffer.from(device.key, 'base64')
  const body = {
    d: device.id,
    t: time,
    ...seal(key, aad('req', device.id, time), Buffer.from(JSON.stringify({ m: method, p: params }))),
  }
  const res = await fetch(`${url}/v1`, { method: 'POST', body: JSON.stringify(body) })
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
  const sealed = (await res.json()) as Sealed
  const plain = unseal(key, aad('res', device.id, time), sealed)
  if (!plain) throw new Error('Antwort ließ sich nicht entschlüsseln')
  return JSON.parse(plain.toString('utf8')) as { ok: boolean; r?: unknown; e?: string; code?: string }
}
