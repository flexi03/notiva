/**
 * The calendar feed for the phone (Apple Kalender etc.): a tiny read-only HTTP server that answers
 * exactly one address, /cal/<secret>.ics, with the feed the app last handed over. Off unless the
 * user switches it on; a new secret makes every old subscription stop working. On Wi-Fi or
 * Tailscale (which encrypts) – nothing is sent anywhere else.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import os from 'node:os'

export const newToken = () => randomBytes(18).toString('base64url')

export class CalendarServer {
  private server: http.Server | null = null
  private feed = ''
  private token = ''

  get running(): boolean {
    return this.server !== null
  }

  setFeed(text: string): void {
    this.feed = text
  }

  async start(port: number, token: string, host = '0.0.0.0'): Promise<void> {
    this.token = token
    if (this.server) return
    const server = http.createServer((req, res) => this.answer(req, res))
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

  /** The port actually used (0 asks the system for a free one – tests). */
  get port(): number {
    const address = this.server?.address()
    return typeof address === 'object' && address ? address.port : 0
  }

  private answer(req: http.IncomingMessage, res: http.ServerResponse): void {
    const m = /^\/cal\/([A-Za-z0-9_-]+)\.ics$/.exec((req.url ?? '').split('?')[0]!)
    const given = Buffer.from(m?.[1] ?? '')
    const wanted = Buffer.from(this.token)
    const ok =
      (req.method === 'GET' || req.method === 'HEAD') &&
      this.token !== '' &&
      given.length === wanted.length &&
      timingSafeEqual(given, wanted) &&
      this.feed !== ''
    if (!ok) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
      return
    }
    res.writeHead(200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': 'inline; filename="notiva.ics"',
    })
    res.end(req.method === 'HEAD' ? undefined : this.feed)
  }
}

/** Addresses the phone can reach the Mac at: local network and Tailscale (100.x), IPv4. */
export function reachableAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address)
  // Tailscale first (works away from home too), then the local network.
  return out.sort((a, b) => Number(b.startsWith('100.')) - Number(a.startsWith('100.')))
}
