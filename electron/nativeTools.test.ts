// @vitest-environment node
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { downloadVerified, findLlamaServer, findWhisperServer, WHISPER_BUILDS } from './nativeTools'

// Only the places the installers use count here, not what is on this machine's PATH.
vi.mock('./shellPath', () => ({ which: async () => null }))

let home: string
const realHome = process.env.HOME

async function program(file: string, output: string) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `#!/bin/sh\necho "${output}"\n`, { mode: 0o755 })
}

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'notiva-tools-'))
  process.env.HOME = home
})

afterEach(async () => {
  process.env.HOME = realHome
  await fs.rm(home, { recursive: true, force: true })
})

describe.skipIf(process.platform === 'win32')('finding llama.cpp', () => {
  it("finds llama.app's `llama` in ~/.local/bin and starts it with `serve`", async () => {
    expect(await findLlamaServer()).toBeNull()
    await program(path.join(home, '.local', 'bin', 'llama'), 'b6543-1a2b3c4')
    expect(await findLlamaServer()).toEqual({
      command: path.join(home, '.local', 'bin', 'llama'),
      args: ['serve'],
    })
  })

  it('ignores another program called llama (e.g. llama-stack)', async () => {
    await program(path.join(home, '.local', 'bin', 'llama'), 'usage: llama [-h] {model,stack}')
    expect(await findLlamaServer()).toBeNull()
  })

  it('prefers a real llama-server', async () => {
    await program(path.join(home, '.local', 'bin', 'llama'), 'version: 6543 (1a2b3c4), build 6543')
    await program(path.join(home, '.local', 'bin', 'llama-server'), '')
    expect(await findLlamaServer()).toEqual({
      command: path.join(home, '.local', 'bin', 'llama-server'),
      args: [],
    })
  })
})

describe.skipIf(process.platform === 'win32')('finding whisper.cpp', () => {
  it('finds the build Notiva unpacked (Linux/Windows)', async () => {
    const build = WHISPER_BUILDS[`${process.platform}-${process.arch}`]
    expect(await findWhisperServer(home)).toBeNull()
    if (!build) return // macOS: Homebrew only
    await program(path.join(home, build.folder, 'whisper-server'), '')
    expect(await findWhisperServer(home)).toBe(path.join(home, build.folder, 'whisper-server'))
  })
})

describe('verified download', () => {
  const data = new TextEncoder().encode('whisper build')
  const sha256 = createHash('sha256').update(data).digest('hex')
  const fetchFn = async () => new Response(data)

  it('keeps the file only when size and SHA-256 match', async () => {
    const target = path.join(home, 'x', 'file.bin')
    await downloadVerified(fetchFn, 'https://x', target, { size: data.length, sha256 }, () => {})
    expect(await fs.readFile(target, 'utf8')).toBe('whisper build')
    const broken = path.join(home, 'x', 'broken.bin')
    await expect(
      downloadVerified(fetchFn, 'https://x', broken, { size: data.length, sha256: '0'.repeat(64) }, () => {}),
    ).rejects.toThrow(/Prüfsumme/)
    await expect(fs.stat(broken)).rejects.toBeTruthy()
    await expect(fs.stat(`${broken}.part`)).rejects.toBeTruthy()
  })
})
