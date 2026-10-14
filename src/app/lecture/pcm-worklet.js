// AudioWorklet: hands 100 ms frames of mono PCM (at the context's sample rate) to the app.
class PcmFrames extends AudioWorkletProcessor {
  constructor() {
    super()
    this.size = Math.round(sampleRate / 10)
    this.buffer = new Float32Array(this.size)
    this.filled = 0
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel) {
      let i = 0
      while (i < channel.length) {
        const n = Math.min(channel.length - i, this.size - this.filled)
        this.buffer.set(channel.subarray(i, i + n), this.filled)
        this.filled += n
        i += n
        if (this.filled === this.size) {
          this.port.postMessage(this.buffer)
          this.buffer = new Float32Array(this.size)
          this.filled = 0
        }
      }
    }
    return true
  }
}
registerProcessor('notiva-pcm-frames', PcmFrames)
