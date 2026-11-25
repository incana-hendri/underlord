import { describe, expect, it } from 'vitest'
import { NarrationChain, type NarrationLine, type NarrationProvider } from '../src/audio/narration.ts'

function fake(id: string, ok: boolean, calls: string[]): NarrationProvider {
  return {
    id,
    available: () => true,
    async speak() {
      calls.push(id)
      return ok
    },
  }
}

const line: NarrationLine = { id: 'hungry', text: 'Your creatures are hungry.' }

describe('narration order', () => {
  it('stops at the pre-generated file when it speaks', async () => {
    const calls: string[] = []
    const chain = new NarrationChain([fake('file', true, calls), fake('xai', true, calls), fake('speech', true, calls)])
    expect(await chain.speak(line)).toBe('file')
    expect(calls).toEqual(['file'])
  })

  it('uses Grok Voice only after files miss, then the browser voice', async () => {
    const calls: string[] = []
    const chain = new NarrationChain([fake('file', false, calls), fake('xai', true, calls), fake('speech', true, calls)])
    expect(await chain.speak(line)).toBe('xai')
    expect(calls).toEqual(['file', 'xai'])
    const browser: string[] = []
    const fall = new NarrationChain([fake('file', false, browser), fake('xai', false, browser), fake('speech', true, browser)])
    expect(await fall.speak(line)).toBe('speech')
  })
})
