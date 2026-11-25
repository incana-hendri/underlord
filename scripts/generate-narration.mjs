/**
 * Pre-generate mentor lines with Kokoro (Apache-2.0).
 *
 *   cd scripts/narration && npm install --onnxruntime-node-install-cuda=skip
 *   npm run narration
 *
 * Voice defaults to bm_fable (British male narrator) at a slightly slower speed.
 * Override with --voice am_fenrir or KOKORO_VOICE.
 * Requires ffmpeg on PATH to encode Ogg Vorbis. Falls back to wav if ffmpeg is missing.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile, access, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(root, 'src/audio/lines.json')
const outDir = path.join(root, 'public/audio/narration')
const kokoroPkg = path.join(root, 'scripts/narration/package.json')

const args = process.argv.slice(2)
const voiceFlag = args.indexOf('--voice')
const voice = voiceFlag >= 0 ? args[voiceFlag + 1] : process.env.KOKORO_VOICE || 'bm_fable'
const speed = Number(process.env.KOKORO_SPEED || '0.9')

async function loadKokoro() {
  try {
    await access(kokoroPkg)
  } catch {
    console.error('Kokoro is not installed. From the repo root:')
    console.error('  cd scripts/narration && npm install --onnxruntime-node-install-cuda=skip')
    process.exit(1)
  }
  const require = createRequire(kokoroPkg)
  const { KokoroTTS } = require('kokoro-js')
  console.log('Loading Kokoro (first run downloads the Apache-2.0 model)…')
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8',
    device: 'cpu',
  })
  return tts
}

function toOgg(wav, ogg) {
  const ff = spawnSync('ffmpeg', ['-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', ogg], { stdio: 'ignore' })
  return ff.status === 0
}

const lines = JSON.parse(await readFile(manifestPath, 'utf8'))
await mkdir(outDir, { recursive: true })
const tts = await loadKokoro()
console.log(`Voice ${voice}, speed ${speed}, ${Object.keys(lines).length} lines`)

let wrote = 0
for (const [id, text] of Object.entries(lines)) {
  const ogg = path.join(outDir, `${id}.ogg`)
  try {
    await access(ogg)
    console.log('keep', id)
    continue
  } catch {
    /* generate */
  }
  const audio = await tts.generate(text, { voice, speed })
  const wav = path.join(outDir, `${id}.wav`)
  await audio.save(wav)
  if (toOgg(wav, ogg)) {
    const { unlink } = await import('node:fs/promises')
    await unlink(wav)
    console.log('ogg ', id)
  } else {
    console.log('wav ', id, '(ffmpeg failed, left wav)')
  }
  wrote++
}
await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify({ voice, speed, engine: 'kokoro-82m', license: 'Apache-2.0' }, null, 2))
console.log(`Done. Generated ${wrote}, folder ${outDir}`)
