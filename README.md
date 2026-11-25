# Underlord

A browser dungeon keeper. Dig earth, bank gold, lay rooms, attract creatures, research spells, and hold the heart against heroes, a rival keeper, or both. The view is fully 3D: it opens on a classic isometric angle, and you can pan, tilt, zoom, and orbit freely.

```bash
npm install
npm run dev
```

Open the URL Vite prints (it uses port **41773**). No account and no API key are required.

## Controls

| Input | Action |
| --- | --- |
| Left click | Tag earth, gold, or gems to dig. Tag rock to reinforce. Pick up a creature. |
| Left drag | Mark a rectangle (dig, room, or sell, depending on the tool). |
| Right click | Slap the creature under the cursor, or the one you are holding. |
| Drop | Left click a tile while holding a creature. |
| Shift + drop on a Temple | Sacrifice. A temple of 9 or more tiles can call a Horned Reaper. |
| WASD / arrows | Pan |
| Q / E | Rotate |
| R / F | Tilt |
| Mouse wheel | Zoom |
| Right drag or middle drag | Orbit and tilt |
| Home | Reset the isometric angle |
| Space | Pause |
| 1 / 2 / 3 | Speed |
| Esc | Leave possession, or save and return to the campaign |

The right-hand panel is Rooms, Spells, Workshop, and Creatures. Gold, heart health, the minimap, and the objective list stay visible. Click a message to look at where it happened. Save writes to this browser's localStorage.

Build rooms on your claimed floor. Imps claim new floor as they dig. A Treasury stores gold beyond the heart's vault. A Lair is a bed per tile. A Hatchery grows chickens. Creatures who are not fed, rested, or paid will sulk and eventually leave through the portal. Research happens in a Library (slowly even before a warlock arrives). The Workshop forges the door or trap you place; an imp carries it.

## Campaign

| Level | Map | Opposition | Aim |
| --- | --- | --- | --- |
| The First Vein | 40×40 | Hero parties | Mine, build a lair and hatchery, break the assault |
| The Lord's Road | 48×48 | Escalating heroes, then the Lord of the Land | Defeat the Lord |
| The Other Heart | 52×52 | Rival keeper | Destroy the rival heart |
| Cinder Crossing | 56×56 | Lava river, rival, heroes, Lord | Bridge the fire, take the heart, slay the Lord |
| The Last Keep | 84×84 | Reinforced rival keep, two gates, Lord | Destroy the heart and defeat the Lord |

The title screen also accepts a text map. Legend: `#` rock, `R` reinforced rock, `e` earth, `g` gold, `m` gems, `w` water, `l` lava, `.` open floor, `+` your floor, `h` your heart, `p` your portal, `1` rival floor, `H` rival heart, `P` rival portal, `G` / `A` hero gates.

`?play=01-cradle` (or `02-siege`, `03-rival`, `04-cinder`, `05-last`) skips the title and loads that level.

## Feature status

| Feature | Status |
| --- | --- |
| Tile map: rock, earth, gold, gems, water, lava, claimed and open floor, reinforced walls, rooms, heart, portal | Done |
| Instanced terrain, fog of war, memory of explored ground | Done |
| Hand: click and drag dig, pickup, drop, slap | Done |
| Imps: dig, mine, claim, reinforce, haul gold, drag bodies, deliver traps and doors | Done |
| Job priority list | Done |
| Gold, treasury capacity, wages, infinite gem veins | Done |
| All 14 rooms, with size and enclosure efficiency | Done |
| Portal attraction from the rooms you have built | Done |
| Hunger, sleep, pay, happiness, anger, leaving | Done |
| Training, library research, workshop manufacture | Done |
| Melee and ranged combat, unconscious, prison, torture conversion | Done |
| Spell list from Create Imp through Armageddon | Done |
| Traps and doors, carried by imps | Done |
| Hero parties, thieves, Lord of the Land | Done |
| Rival keeper that digs, builds, attracts, and attacks | Done |
| Five JSON levels, level select, text-map custom game | Done |
| Side panel, minimap, messages, pause, speed, save/load | Done |
| Free pan, tilt, zoom, and orbit, clamped above the floor | Done |
| Torch-style point lights, lava glow, pulsing heart | Done |
| Kokoro mentor lines, optional Grok Voice, Web Speech fallback | Done |
| Kenney CC0 impacts mixed with original synthesis | Done |
| Possess (first person on one creature) | Partial — researched spell, WASD and click, no separate weapon view |
| Scavenger room | Partial — pays gold to steal or conjure one chosen species |
| Level editor | Partial — text map, not a painted editor |
| Flow-field pathfinding | Not used — A* is enough for these army sizes |
| Music | Not included, on purpose |

## Tests

```bash
npm test
npm run lint
```

Vitest covers pathfinding (including blocked corners), digging, gold haul, room merge and sale, payday anger, attraction, combat, lightning, narration provider order, and a smoke tick of every campaign map.

## Narration

Spoken lines are chosen in this order:

1. **Pre-generated files** in `public/audio/narration/<id>.ogg`. These already ship in the repo. They were rendered with Kokoro (`bm_fable`, a British male voice, slightly slowed) from `src/audio/lines.json`. Kokoro and its weights are Apache-2.0. See [CREDITS.md](CREDITS.md).
2. **Grok Voice**, only if you set a key. Copy `.env.example` to `.env.local` and set `VITE_XAI_API_KEY`. Optional: `VITE_XAI_TTS_VOICE` (default `rex`) and `VITE_XAI_TTS_URL` (default `https://api.x.ai/v1/tts`). The browser posts `{ text, voice_id, language: "en", speed: 0.92 }` and plays the audio bytes. **A `VITE_` key is visible in the page.** Prefer the Kokoro files, and do not commit a key.
3. **Web Speech**, if the file is missing and no key is set. Pitch is pushed down so it still sounds like a mentor.

To re-render the files:

```bash
cd scripts/narration
npm install --onnxruntime-node-install-cuda=skip
cd ../..
npm run narration
```

The first run downloads the Kokoro model. `ffmpeg` encodes Ogg Vorbis. Existing `.ogg` files are left in place.

## Maps and architecture

`scripts/generate-levels.mjs` writes `src/levels/*.json`. `DESIGN.md` explains the tick, the camera clamp, pathfinding, and why the rival is a priority script rather than a search.
