import type { LevelDef } from '../sim/types.ts'
import cradle from '../levels/01-cradle.json' with { type: 'json' }
import siege from '../levels/02-siege.json' with { type: 'json' }
import rival from '../levels/03-rival.json' with { type: 'json' }
import cinder from '../levels/04-cinder.json' with { type: 'json' }
import last from '../levels/05-last.json' with { type: 'json' }

export const CAMPAIGN = [cradle, siege, rival, cinder, last] as LevelDef[]

export function levelById(id: string): LevelDef | undefined {
  return CAMPAIGN.find((l) => l.id === id)
}
