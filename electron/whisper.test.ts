// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { spawnTied } from './whisper'

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe.skipIf(process.platform === 'win32')('spawnTied', () => {
  it('stops the program when our end of stdin closes (e.g. Notiva crashed)', async () => {
    const child = spawnTied('/bin/sleep', ['60'])
    await new Promise((r) => setTimeout(r, 300))
    const sleeper = Number(
      execFileSync('pgrep', ['-P', String(child.pid), 'sleep'])
        .toString()
        .trim(),
    )
    expect(alive(sleeper)).toBe(true)
    const exited = new Promise((r) => child.on('exit', r))
    child.stdin!.end()
    await exited
    await new Promise((r) => setTimeout(r, 200))
    expect(alive(sleeper)).toBe(false)
  })

  it('exits together with the program', async () => {
    const child = spawnTied('/bin/sh', ['-c', 'exit 3'])
    const code = await new Promise((r) => child.on('exit', r))
    expect(code).toBe(3)
    child.stdin!.end()
  })
})
