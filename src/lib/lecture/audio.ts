/**
 * Audio for live transcription: 16 kHz mono PCM is cut into chunks at pauses (15–30 s, so words
 * aren't split) and encoded as WAV – the format every Whisper-style API and local server accepts.
 */

export const SAMPLE_RATE = 16_000

/** 16-bit PCM WAV of mono float samples (-1…1). */
export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const ascii = (offset: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Uint8Array(buffer)
}

export function rms(samples: Float32Array): number {
  let sum = 0
  for (const s of samples) sum += s * s
  return Math.sqrt(sum / (samples.length || 1))
}

export interface Chunk {
  samples: Float32Array
  /** Seconds since the recording started. */
  start: number
  end: number
  /** Mostly silence – not worth sending. */
  silent: boolean
}

/**
 * Collects audio frames and emits chunks: after `min` seconds at the next pause (a 100 ms frame
 * below the silence level), at the latest after `max` seconds.
 */
export class Chunker {
  private frames: Float32Array[] = []
  private length = 0
  private started = 0
  private loudFrames = 0
  private totalFrames = 0

  constructor(
    private readonly onChunk: (chunk: Chunk) => void,
    private readonly options = { min: 15, max: 30, silence: 0.012, sampleRate: SAMPLE_RATE },
  ) {}

  /** Feed ~100 ms frames. Returns the frame's level (0…1) for a meter. */
  push(frame: Float32Array): number {
    const level = rms(frame)
    this.frames.push(frame)
    this.length += frame.length
    this.totalFrames++
    if (level >= this.options.silence) this.loudFrames++
    const seconds = this.length / this.options.sampleRate
    if (seconds >= this.options.max || (seconds >= this.options.min && level < this.options.silence))
      this.flush()
    return level
  }

  /** Emits what is buffered (e.g. on stop or pause). */
  flush(): void {
    if (this.length === 0) return
    const samples = new Float32Array(this.length)
    let offset = 0
    for (const f of this.frames) {
      samples.set(f, offset)
      offset += f.length
    }
    const duration = this.length / this.options.sampleRate
    const chunk = {
      samples,
      start: this.started,
      end: this.started + duration,
      silent: this.loudFrames < Math.max(3, this.totalFrames * 0.1),
    }
    this.started += duration
    this.frames = []
    this.length = 0
    this.loudFrames = 0
    this.totalFrames = 0
    this.onChunk(chunk)
  }

  /** Time skipped while paused still counts for the timestamps. */
  skip(seconds: number): void {
    this.started += seconds
  }
}
