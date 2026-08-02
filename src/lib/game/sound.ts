// Procedural sound system using the Web Audio API.
// No external audio assets — all sounds are synthesized at runtime.

export class SoundSystem {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private ambientGain: GainNode | null = null
  private ambientSource: AudioBufferSourceNode | null = null
  enabled = true
  volume = 0.5

  /** Lazy init — must be triggered by a user gesture (browser policy). */
  init(): void {
    if (this.ctx) return
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.value = this.volume
      this.masterGain.connect(this.ctx.destination)
      // Pre-render 2 seconds of white noise for reuse.
      const sampleRate = this.ctx.sampleRate
      const len = sampleRate * 2
      this.noiseBuffer = this.ctx.createBuffer(1, len, sampleRate)
      const ch = this.noiseBuffer.getChannelData(0)
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1
    } catch (e) {
      console.warn('Sound init failed:', e)
    }
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') this.ctx.resume()
  }

  setVolume(v: number): void {
    this.volume = v
    if (this.masterGain) this.masterGain.gain.value = v
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    if (this.masterGain) this.masterGain.gain.value = on ? this.volume : 0
  }

  /** Generic noise-burst sound for footstep / break / place. */
  private noiseBurst(duration: number, freq: number, q: number, gain: number, type: 'lowpass' | 'highpass' | 'bandpass' = 'lowpass'): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || !this.enabled) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.Q.value = q
    const g = this.ctx.createGain()
    const now = this.ctx.currentTime
    g.gain.setValueAtTime(gain, now)
    g.gain.exponentialRampToValueAtTime(0.001, now + duration)
    src.connect(filter)
    filter.connect(g)
    g.connect(this.masterGain)
    src.start(now)
    src.stop(now + duration)
  }

  /** Pitched tone for UI / damage / collect. */
  private tone(freq: number, duration: number, type: OscillatorType, gain: number, freqEnd?: number): void {
    if (!this.ctx || !this.masterGain || !this.enabled) return
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    const now = this.ctx.currentTime
    osc.frequency.setValueAtTime(freq, now)
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + duration)
    }
    g.gain.setValueAtTime(gain, now)
    g.gain.exponentialRampToValueAtTime(0.001, now + duration)
    osc.connect(g)
    g.connect(this.masterGain)
    osc.start(now)
    osc.stop(now + duration)
  }

  // ----- Specific sounds -----

  footstep(): void {
    this.noiseBurst(0.08, 600, 1, 0.15, 'lowpass')
  }

  blockBreak(): void {
    this.noiseBurst(0.18, 800, 2, 0.35, 'lowpass')
    this.noiseBurst(0.12, 300, 1, 0.2, 'lowpass')
  }

  blockPlace(): void {
    this.noiseBurst(0.14, 500, 2, 0.3, 'lowpass')
  }

  jump(): void {
    this.tone(200, 0.1, 'square', 0.08, 320)
  }

  damage(): void {
    this.tone(180, 0.25, 'sawtooth', 0.25, 80)
  }

  collect(): void {
    this.tone(660, 0.1, 'square', 0.15, 880)
  }

  explosion(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || !this.enabled) return
    // Low rumble + noise burst
    this.noiseBurst(0.5, 200, 0.5, 0.6, 'lowpass')
    this.tone(60, 0.5, 'sine', 0.4, 30)
  }

  /** Start looping ambient wind/water noise. */
  startAmbient(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return
    if (this.ambientSource) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 400
    const g = this.ctx.createGain()
    g.gain.value = 0.04
    src.connect(filter)
    filter.connect(g)
    g.connect(this.masterGain)
    src.start()
    this.ambientSource = src
    this.ambientGain = g
  }

  /** Adjust ambient volume based on context (e.g. louder underwater). */
  setAmbientMultiplier(m: number): void {
    if (this.ambientGain) this.ambientGain.gain.value = 0.04 * m
  }

  stopAmbient(): void {
    if (this.ambientSource) {
      try { this.ambientSource.stop() } catch { /* ignore */ }
      this.ambientSource.disconnect()
      this.ambientSource = null
    }
    if (this.ambientGain) {
      this.ambientGain.disconnect()
      this.ambientGain = null
    }
  }

  dispose(): void {
    this.stopAmbient()
    if (this.ctx) {
      this.ctx.close().catch(() => {})
      this.ctx = null
    }
  }
}
