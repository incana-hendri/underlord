# Design

Underlord is a tick-based dungeon keeper. The simulation does not import three.js. The renderer and the DOM panel read the world after each tick.

## Decisions

- **Name.** The game is called Underlord so it is not shipping under the Dungeon Keeper trademark. Creature and room names follow the genre, as requested.
- **Camera.** A perspective camera orbits a point on the map. The default is about 55° off vertical and 45° yaw, which reads as the classic isometric view. Phi is clamped to roughly 13°–69° from vertical so the lens cannot go under the floor or flatten into a pure top-down. Pan, orbit, tilt, and zoom are smoothed with an exponential lerp. Keyboard and mouse both drive the same desired pose.
- **Simulation rate.** Fixed steps of 50 ms, independent of the frame. Speed 2 and 3 run more steps per frame, capped so a hitch cannot spiral. Pause stops steps but still allows the camera and, while paused, new orders.
- **Map.** Tiles are a flat array. Terrain is rock, earth, gold, gems, water, lava, or floor. Ownership, rooms, tags, doors, traps, bridges, hearts, portals, and gates are fields on the tile. Impenetrable rock is not tagged for digging. Reinforced rock (imp work, or `R` on a map) has more hit points. Gems become a permanent floor vein once dug.
- **Rendering.** One instanced mesh per terrain bucket, plus overlays for rooms, gold piles, tags, doors, and traps. Unrevealed tiles draw as dark rock, so the fog hides gold. Explored but currently unseen tiles stay dim. Visibility is a breadth-first search from owned floors and your creatures, refreshed a few times a second. Ten point lights, no shadows: the heart, the portal, and lava near the camera. Everything else is emissive or painted so the dungeon still reads when a light is not nearby. 84×84 is the largest shipped map (7,056 tiles), which is in the neighborhood of the original's large levels.
- **Pathfinding.** A* on the 8-neighbor grid. Diagonal steps are rejected when either adjacent cardinal is blocked, so creatures do not cut rock corners. Imps only path on their own floor and unclaimed floor. Fighters may walk enemy floor and, if no walk exists, follow a more expensive attack path and bash the first wall or door. Searches are limited to the map size. Flow fields were skipped: a level has dozens of agents, not thousands, and A* from each idle imp a few times a second is enough.
- **Jobs.** Each keeper has an ordered task list (rescue, gold, dig, mine, claim, reinforce, haul). Idle imps take the highest priority reachable task. Claim and gold piles are implicit; dig and reinforce are tags. The player can move priorities from the Creatures tab. The rival keeper uses the same queue.
- **Rooms.** Painting a tile spends gold and merges orthogonally with the same room. Efficiency is size versus an ideal footprint, times how enclosed the room is. Hatcheries grow chickens from efficiency. Libraries research even before a warlock arrives, slowly, so the tree is not stuck. Workshops forge the oldest queued door or trap; an imp carries it.
- **Creatures.** A data table in `src/data/content.ts` holds stats, attraction rules, and a silhouette description. Needs are hunger, fatigue, happiness, and anger. They eat, sleep, train, research, manufacture, or fight. Unpaid or starving creatures eventually walk back to the portal and leave. Slap speeds them and makes them angry. Shift-drop on a temple of at least nine tiles is a sacrifice and can call a Horned Reaper.
- **Combat.** Melee and ranged strikes use attack, level, defense, and a seeded roll. Ranged attacks need line of sight. At zero health, ordinary creatures fall unconscious and can be dragged to a prison; torture converts them. Imps, bosses, and chickens die outright. Heroes tunnel by damaging tiles. Thieves stand on a treasury and steal. The Lord of the Land is a boss immune to Chicken.
- **Rival.** A keeper with `ai: true` thinks every 1.5 seconds: summon imps, pick research, grow rooms one tile at a time, tag a path toward gold or the enemy heart, and rally creatures at the dig face. Lava on that path is bridged if Bridge is unlocked. It is a priority script, not a search over every possible dungeon.
- **Levels.** JSON maps. Characters are documented in the custom-map screen and the README. Five campaign maps ship, from a 40×40 tutorial to an 84×84 keep with a rival, two hero gates, and the Lord. A text map can be played from the title screen. Opponents are per level: heroes, a rival, or both.
- **RNG.** Mulberry32. The state is stored in the save, so a loaded game continues the same sequence.
- **Audio.** Runtime order is pre-generated Kokoro Ogg, then optional xAI TTS if `VITE_XAI_API_KEY` is set, then `speechSynthesis`. The key is never written into the repo. xAI is called as `POST /v1/tts` with `voice_id` (default `rex`), `language: en`, and a slightly slow `speed`, matching the current docs. Kenney CC0 impacts are mixed with an original synth. There is no music.
- **Possession.** Researched spell. The creature takes WASD in camera space and attacks on click for a short time. It is a stretch-goal version: no separate first-person weapon model.

## Layout

- `src/sim` — world, ticks, commands, save. Tests import this only.
- `src/data` — species, rooms, spells, gear, research, campaign index.
- `src/levels` — JSON maps produced by `scripts/generate-levels.mjs`.
- `src/render` — three.js view and the free camera.
- `src/audio` — sample bus, synth, narration providers.
- `src/game.ts` — input, HUD, campaign shell.
- `tests` — pathfinding, economy, rooms, jobs, combat, attraction, campaign load, narration order.
