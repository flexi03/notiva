import { Chunker, encodeWav, rms } from '../lecture/audio'

const frame = (level: number, n = 1600) => new Float32Array(n).fill(level)

describe('audio chunks', () => {
  it('encodes 16-bit mono WAV', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]))
    const text = (a: number, b: number) => String.fromCharCode(...wav.slice(a, b))
    expect(text(0, 4)).toBe('RIFF')
    expect(text(8, 12)).toBe('WAVE')
    const view = new DataView(wav.buffer)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getInt16(46, true)).toBe(32767)
    expect(view.getInt16(48, true)).toBe(-32768)
    expect(rms(frame(0.5))).toBeCloseTo(0.5)
  })

  it('cuts at the first pause after the minimum length, at the latest after the maximum', () => {
    const chunks: Array<{ start: number; end: number; silent: boolean }> = []
    const chunker = new Chunker((c) => chunks.push(c), { min: 2, max: 4, silence: 0.01, sampleRate: 16000 })
    for (let i = 0; i < 25; i++) chunker.push(frame(0.2)) // 2.5 s speech
    chunker.push(frame(0)) // pause → cut at 2.6 s
    for (let i = 0; i < 45; i++) chunker.push(frame(0.2)) // 4.5 s speech without pause → cut at 4 s
    chunker.flush()
    expect(chunks.map((c) => [c.start, Math.round(c.end * 10) / 10])).toEqual([
      [0, 2.6],
      [2.6, 6.6],
      [6.6, 7.1],
    ])
    expect(chunks.every((c) => !c.silent)).toBe(true)
  })

  it('marks silent chunks', () => {
    const chunks: Array<{ silent: boolean }> = []
    const chunker = new Chunker((c) => chunks.push(c), { min: 1, max: 2, silence: 0.01, sampleRate: 16000 })
    for (let i = 0; i < 20; i++) chunker.push(frame(0.001))
    expect(chunks[0]!.silent).toBe(true)
  })
})
