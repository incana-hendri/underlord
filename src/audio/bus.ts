import { NarrationChain, fileProvider, speechProvider, xaiProvider, type NarrationLine } from './narration.ts'

const SAMPLES: Record<string, string[]> = {
  dig: ['impactMining_000.ogg', 'impactMining_001.ogg', 'impactMining_002.ogg', 'impactPlank_medium_000.ogg'],
  hit: ['impactPunch_heavy_000.ogg', 'impactPunch_heavy_001.ogg', 'impactPunch_heavy_002.ogg', 'knifeSlice.ogg'],
  slap: ['impactPunch_heavy_003.ogg', 'impactSoft_heavy_000.ogg'],
  gold: ['handleCoins.ogg', 'handleCoins2.ogg', 'chips-stack-1.ogg', 'chip-lay-1.ogg'],
  step: ['footstep_concrete_000.ogg', 'footstep_concrete_001.ogg', 'footstep_wood_000.ogg'],
  door: ['doorOpen_1.ogg', 'doorClose_1.ogg', 'creak1.ogg'],
  ui: ['click_001.ogg', 'click_002.ogg', 'switch_001.ogg'],
  spell: ['confirmation_001.ogg', 'bookFlip1.ogg'],
  error: ['error_001.ogg', 'error_002.ogg'],
  build: ['impactPlank_medium_001.ogg', 'metalPot1.ogg', 'impactWood_heavy_000.ogg'],
  arrive: ['confirmation_002.ogg', 'cloth1.ogg'],
  drop: ['dropLeather.ogg', 'cloth2.ogg'],
  pickup: ['cloth1.ogg'],
  thunder: ['impactMetal_heavy_000.ogg', 'impactGeneric_light_000.ogg'],
  heart: ['impactSoft_heavy_001.ogg', 'impactSoft_medium_000.ogg'],
  die: ['impactSoft_heavy_000.ogg', 'drawKnife2.ogg'],
  claim: ['footstep_grass_000.ogg', 'footstep_concrete_002.ogg'],
  win: ['confirmation_001.ogg'],
  lose: ['error_002.ogg'],
}

export class AudioBus {
  sfxOn = true
  voiceOn = true
  private ctx: AudioContext | null = null
  private buffers = new Map<string, AudioBuffer>()
  private chain: NarrationChain | null = null
  private queue: NarrationLine[] = []
  private speaking = false
  private last = new Map<string, number>()

  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctx()
      const playBlob = async (blob: Blob) => {
        if (!this.ctx || !this.voiceOn) return
        const raw = await blob.arrayBuffer()
        const buffer = await this.ctx.decodeAudioData(raw.slice(0))
        const src = this.ctx.createBufferSource()
        src.buffer = buffer
        const gain = this.ctx.createGain()
        gain.gain.value = 0.9
        src.connect(gain).connect(this.ctx.destination)
        src.start()
        await new Promise<void>((resolve) => {
          src.onended = () => resolve()
        })
      }
      this.chain = new NarrationChain([fileProvider(playBlob), xaiProvider(playBlob), speechProvider()])
      void this.load()
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  private async load(): Promise<void> {
    if (!this.ctx) return
    const names = new Set<string>()
    for (const list of Object.values(SAMPLES)) for (const n of list) names.add(n)
    await Promise.all([...names].map(async (name) => {
      try {
        const res = await fetch(`/audio/sfx/kenney/${name}`)
        if (!res.ok || !this.ctx) return
        const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer())
        this.buffers.set(name, buffer)
      } catch {
        /* a missing sample just falls through to the synth */
      }
    }))
  }

  play(id: string): void {
    if (!this.sfxOn || !this.ctx) return
    const now = performance.now()
    if (now - (this.last.get(id) ?? 0) < 40) return
    this.last.set(id, now)
    const list = SAMPLES[id]
    if (list) {
      const choice = list[Math.floor(Math.random() * list.length)]!
      const buffer = this.buffers.get(choice)
      if (buffer) this.playBuffer(buffer, id === 'heart' ? 0.55 : 0.38)
    }
    this.synth(id)
  }

  private playBuffer(buffer: AudioBuffer, volume: number): void {
    if (!this.ctx) return
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = 0.92 + Math.random() * 0.16
    const gain = this.ctx.createGain()
    gain.gain.value = volume
    src.connect(gain).connect(this.ctx.destination)
    src.start()
  }

  /** Original one-shot synthesis. Creature voices live here; Kenney covers the impacts. */
  private synth(id: string): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900
    osc.connect(filter).connect(gain).connect(this.ctx.destination)
    const tone = (freq: number, dur: number, type: OscillatorType, vol: number) => {
      osc.type = type
      osc.frequency.setValueAtTime(freq, t)
      gain.gain.setValueAtTime(vol, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
      osc.start(t)
      osc.stop(t + dur + 0.02)
    }
    if (id === 'dig' || id === 'claim' || id === 'build') tone(90 + Math.random() * 40, 0.12, 'triangle', 0.08)
    else if (id === 'gold') tone(660 + Math.random() * 80, 0.18, 'sine', 0.07)
    else if (id === 'slap' || id === 'hit') tone(140 + Math.random() * 90, 0.09, 'square', 0.05)
    else if (id === 'spell' || id === 'arrive' || id === 'win') tone(420, 0.22, 'sine', 0.06)
    else if (id === 'heart' || id === 'lose') tone(70, 0.35, 'sawtooth', 0.06)
    else if (id === 'ui') tone(520, 0.05, 'sine', 0.04)
    else {
      osc.disconnect()
      gain.disconnect()
    }
  }

  say(line: NarrationLine): void {
    if (!this.voiceOn) return
    this.queue.push(line)
    if (this.queue.length > 4) this.queue.shift()
    void this.drain()
  }

  private async drain(): Promise<void> {
    if (this.speaking || !this.chain) return
    const next = this.queue.shift()
    if (!next) return
    this.speaking = true
    try {
      await this.unlock()
      await this.chain.speak(next)
    } finally {
      this.speaking = false
      if (this.queue.length) void this.drain()
    }
  }
}
