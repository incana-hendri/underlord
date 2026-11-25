# Credits

Underlord is an original game inspired by the dungeon-keeping genre. It does not include Dungeon Keeper assets, proprietary art filenames, or ripped audio.

## Code, geometry, and synthesis

All gameplay code, tile geometry, creature meshes, user-interface art, and the small synthesizer in `src/audio/bus.ts` are original to this project. The synthesizer is a short original oscillator (not a copy of sfxr). Those sounds are the project's own.

Procedural canvas textures (rock, earth, gold, gems, floors, water, lava, wood) are generated at runtime in `src/render/view.ts`. No texture files are vendored.

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
