/**
 * A stand-in for the Mac in the iOS UI tests: the real sync server (electron/companion.ts) with a
 * fixed test device, answering from a small fixed folder. `npx tsx ios/scripts/fake-mac.ts`
 */
import { CompanionServer, type Device } from '../../electron/companion'

export const TEST_DEVICE: Device = {
  id: 'uitest-device',
  name: 'UI-Test',
  key: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
  created: new Date().toISOString(),
  paired: true,
}

const server = new CompanionServer(
  () => [TEST_DEVICE],
  async (_device, method) => {
    if (method === 'hello') return { protocol: 1, vault: 'Studium', version: 'test' }
    throw Object.assign(new Error(`Unbekannte Anfrage: ${method}`), { code: 'unknown' })
  },
)
await server.start(Number(process.env.PORT ?? 47_999), '127.0.0.1')
console.log(`fake mac on ${server.port}`)
