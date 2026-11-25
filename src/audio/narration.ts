export interface NarrationLine {
  id: string
  text: string
}

export interface NarrationProvider {
  id: string
  available(): boolean
  speak(line: NarrationLine): Promise<boolean>
}

/** Tries providers in order. The first one that speaks wins. */
export class NarrationChain {
  private providers: NarrationProvider[]
  constructor(providers: NarrationProvider[]) {
    this.providers = providers
  }

  async speak(line: NarrationLine): Promise<string> {
    for (const provider of this.providers) {
      if (!provider.available()) continue
      try {
        if (await provider.speak(line)) return provider.id
      } catch {
        /* try the next voice */
      }
    }
    return 'none'
  }
}

const missing = new Set<string>()

export function fileProvider(play: (blob: Blob) => Promise<void>): NarrationProvider {
  return {
    id: 'file',
    available: () => true,
    async speak(line) {
      if (missing.has(line.id)) return false
      for (const ext of ['ogg', 'mp3', 'wav']) {
        const res = await fetch(`/audio/narration/${line.id}.${ext}`)
        if (!res.ok) continue
        const blob = await res.blob()
        if (blob.size < 400) continue
        await play(blob)
        return true
      }
      missing.add(line.id)
      return false
    },
  }
}

export function xaiProvider(play: (blob: Blob) => Promise<void>): NarrationProvider {
  const key = import.meta.env.VITE_XAI_API_KEY?.trim() ?? ''
  let warned = false
  return {
    id: 'xai',
    available: () => key.length > 0,
    async speak(line) {
      if (!warned) {
        warned = true
        console.warn('VITE_XAI_API_KEY is compiled into this page. Prefer Kokoro files for anything you ship.')
      }
      const voice = import.meta.env.VITE_XAI_TTS_VOICE?.trim() || 'rex'
      const url = import.meta.env.VITE_XAI_TTS_URL?.trim() || 'https://api.x.ai/v1/tts'
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: line.text, voice_id: voice, language: 'en', speed: 0.92 }),
      })
      if (!res.ok) return false
      const blob = await res.blob()
      if (blob.size < 400) return false
      await play(blob)
      return true
    },
  }
}

export function speechProvider(): NarrationProvider {
  return {
    id: 'speech',
    available: () => typeof window !== 'undefined' && 'speechSynthesis' in window,
    speak(line) {
      return new Promise((resolve) => {
        const utter = new SpeechSynthesisUtterance(line.text)
        utter.rate = 0.86
        utter.pitch = 0.45
        const voices = speechSynthesis.getVoices()
        const deep = voices.find((v) => /english/i.test(v.lang) && /male|daniel|david|rishi|fred/i.test(v.name))
        if (deep) utter.voice = deep
        utter.onend = () => resolve(true)
        utter.onerror = () => resolve(false)
        speechSynthesis.cancel()
        speechSynthesis.speak(utter)
      })
    },
  }
}
