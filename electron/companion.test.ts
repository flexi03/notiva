import { randomBytes } from 'node:crypto'
import { CompanionServer, companionCall, newDevice, seal, unseal, type Device } from './companion'

describe('companion crypto', () => {
  it('seals and opens; any change to key, data or content is refused', () => {
    const key = randomBytes(32)
    const data = Buffer.from('notiva/v1|req|d|1')
    const sealed = seal(key, data, Buffer.from('hallo'))
    expect(unseal(key, data, sealed)?.toString()).toBe('hallo')
    expect(unseal(randomBytes(32), data, sealed)).toBeNull()
    expect(unseal(key, Buffer.from('notiva/v1|res|d|1'), sealed)).toBeNull()
    const tampered = Buffer.from(sealed.c, 'base64')
    tampered[0] = tampered[0]! ^ 1
    expect(unseal(key, data, { ...sealed, c: tampered.toString('base64') })).toBeNull()
  })
})

describe('CompanionServer', () => {
  const device: Device = { ...newDevice('Test-iPhone'), paired: true }
  let server: CompanionServer
  let url: string
  const seen: string[] = []

  beforeAll(async () => {
    server = new CompanionServer(
      () => [device],
      async (_d, method, params) => {
        if (method === 'echo') return params
        throw Object.assign(new Error('Unbekannte Anfrage'), { code: 'unknown' })
      },
      (d) => seen.push(d.id),
    )
    await server.start(0, '127.0.0.1')
    url = `http://127.0.0.1:${server.port}`
  })
  afterAll(() => server.stop())

  it('answers a sealed request of a paired device', async () => {
    expect(await companionCall(url, device, 'echo', { a: 1 })).toEqual({ ok: true, r: { a: 1 } })
    expect(await companionCall(url, device, 'nope')).toEqual({
      ok: false,
      e: 'Unbekannte Anfrage',
      code: 'unknown',
    })
    expect(seen).toContain(device.id)
  })

  it('refuses unknown devices, wrong keys, old times and replays with a plain 404', async () => {
    const stranger = newDevice('x')
    await expect(companionCall(url, stranger, 'echo')).rejects.toThrow('HTTP 404')
    await expect(companionCall(url, { ...device, key: stranger.key }, 'echo')).rejects.toThrow('HTTP 404')
    await expect(companionCall(url, device, 'echo', {}, Date.now() - 10 * 60_000)).rejects.toThrow('HTTP 404')
    expect((await fetch(`${url}/`)).status).toBe(404)
    // The same request twice: the second one is a replay.
    const t = Date.now()
    const fixed = JSON.stringify({
      d: device.id,
      t,
      ...seal(
        Buffer.from(device.key, 'base64'),
        Buffer.from(`notiva/v1|req|${device.id}|${t}`),
        Buffer.from('{"m":"echo","p":1}'),
      ),
    })
    expect((await fetch(`${url}/v1`, { method: 'POST', body: fixed })).status).toBe(200)
    expect((await fetch(`${url}/v1`, { method: 'POST', body: fixed })).status).toBe(404)
  })
})
