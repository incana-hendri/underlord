# Credits

Underlord is an original game inspired by the dungeon-keeping genre. It does not include Dungeon Keeper assets, proprietary art filenames, or ripped audio.

## Code, geometry, and synthesis

All gameplay code, tile geometry, creature meshes, user-interface art, and the small synthesizer in `src/audio/bus.ts` are original to this project. The synthesizer is a short original oscillator (not a copy of sfxr). Those sounds are the project's own.

The clawed hand, creature silhouettes, room props, torch meshes, particle sprites, and interface icons are original geometry in `src/render/`. They are not ripped from another game.

## Textures — ambientCG (CC0)

Surface maps in `public/textures/` are 1K JPGs from [ambientCG](https://ambientcg.com/), which publishes them under Creative Commons Zero (CC0 1.0). Normal maps are the OpenGL (`NormalGL`) variants. Only color, normal, roughness, and (for metal) metalness were kept.

| Files | ambientCG id |
| --- | --- |
| `rock_color.jpg`, `rock_normal.jpg`, `rock_rough.jpg` | Rock035 |
| `earth_color.jpg`, `earth_normal.jpg`, `earth_rough.jpg` | Ground037 |
| `brick_color.jpg`, `brick_normal.jpg`, `brick_rough.jpg` | Bricks059 |
| `floor_color.jpg`, `floor_normal.jpg`, `floor_rough.jpg` | PavingStones130 |
| `metal_color.jpg`, `metal_normal.jpg`, `metal_rough.jpg`, `metal_metal.jpg` | Metal034 |

## Creatures — Quaternius (CC0)

Rigged, animated glTF models in `public/models/` are by [Quaternius](https://quaternius.com) and were taken from the CC0 packs mirrored by the [Quaternius showcase](https://github.com/trebeljahr/quaternius-showcase) (models only; that repo's code license does not apply). Each pack page states CC0 1.0.

| File | Pack | Used for |
| --- | --- | --- |
| `imp.glb` | [Platformer Game Kit](https://quaternius.com/packs/ultimateplatformer.html) enemy | Imps |
| `human.glb` | Platformer Game Kit character | Goblins, warlocks, heroes without plate |
| `knight.glb` | [Animated Knight](https://quaternius.com/packs/knightcharacter.html) | Knights, dwarves, the Lord, the reaper |
| `rat.glb`, `spider.glb`, `frog.glb`, `wasp.glb` | [Easy Enemies](https://quaternius.com/packs/easyenemy.html) | Beetle, spider, bile demon, fly and fairy |
| `fox.glb` | [Ultimate Animated Animals](https://quaternius.com/packs/ultimateanimatedanimals.html) | Hellhound |
| `raptor.glb` | [Animated Dinosaurs](https://quaternius.com/packs/animateddinosaurs.html) | Dragon |

Walk, idle, and attack clips play through three.js `AnimationMixer`. The clawed hand, torches, heart, and portal are still original meshes.

## Type — Cinzel (OFL)

`public/fonts/cinzel-latin-500.woff2` is Cinzel, designed by Natanael Gama, under the SIL Open Font License 1.1. The file is the Latin 500-weight subset published by [Fontsource](https://fontsource.org/fonts/cinzel). Panel titles use it. Body text stays a system serif so the log stays readable.

## Narration — Kokoro

Mentor lines in `public/audio/narration/*.ogg` were generated locally with [Kokoro](https://github.com/hexgrad/kokoro) (`kokoro-js`, model `onnx-community/Kokoro-82M-v1.0-ONNX`).

- Model and library license: Apache-2.0
- Voice: `bm_fable` (British male), speed `0.9`
- Source text: `src/audio/lines.json`
- Generator: `scripts/generate-narration.mjs`

Regenerate with `npm run narration` after `cd scripts/narration && npm install --onnxruntime-node-install-cuda=skip`.

Optional live narration uses the xAI Text-to-Speech API (`POST https://api.x.ai/v1/tts`) only when `VITE_XAI_API_KEY` is set. No key is committed. If both files and the API are unavailable, the browser Web Speech API speaks the line.

## Sound effects — Kenney (CC0)

The following packs are Creative Commons Zero (CC0 1.0). Attribution is not required; it is given here anyway. Each pack's original `License.txt` states CC0 and links to https://creativecommons.org/publicdomain/zero/1.0/.

| Pack | Page | Files used |
| --- | --- | --- |
| Impact Sounds 1.0 | https://kenney.nl/assets/impact-sounds | `impactMining_000`–`003`, `impactPunch_heavy_000`–`003`, `impactSoft_heavy_000`–`001`, `impactSoft_medium_000`, `impactPlank_medium_000`–`001`, `impactWood_heavy_000`, `impactMetal_heavy_000`, `impactGeneric_light_000`, `footstep_concrete_000`–`002`, `footstep_wood_000`–`001`, `footstep_grass_000` |
| RPG Audio | https://kenney.nl/assets/rpg-audio | `handleCoins`, `handleCoins2`, `doorOpen_1`, `doorClose_1`, `doorClose_2`, `drawKnife1`, `drawKnife2`, `knifeSlice`, `knifeSlice2`, `creak1`, `creak2`, `bookOpen`, `bookClose`, `bookFlip1`, `cloth1`, `cloth2`, `metalLatch`, `metalPot1`, `dropLeather` |
| Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | `click_001`, `click_002`, `confirmation_001`, `confirmation_002`, `error_001`, `error_002`, `switch_001`, `question_001` |
| Casino Audio 1.1 | https://kenney.nl/assets/casino-audio | `chips-stack-1`, `chips-stack-2`, `chips-handle-1`, `chip-lay-1`, `chips-collide-1` |

Copies live in `public/audio/sfx/kenney/`. Hits, digging, doors, coins, and UI clicks play these samples. Creature squeaks, slaps, and spell tones are the original synthesizer, often layered under a Kenney impact.

No Freesound downloads are included. Anything that could not be confirmed CC0 was left out.
