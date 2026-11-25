import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/levels')

function grid(w, h, fill = 'e') {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => fill))
}
function rect(g, x0, y0, x1, y1, ch) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y]?.[x] !== undefined) g[y][x] = ch
}
function border(g, ch = '#') {
  const h = g.length
  const w = g[0].length
  for (let x = 0; x < w; x++) {
    g[0][x] = ch
    g[h - 1][x] = ch
  }
  for (let y = 0; y < h; y++) {
    g[y][0] = ch
    g[y][w - 1] = ch
  }
}
function disk(g, cx, cy, r, ch) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && g[y]?.[x] !== undefined) g[y][x] = ch
    }
  }
}
function rows(g) {
  return g.map((r) => r.join(''))
}
function findChar(g, ch) {
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) if (g[y][x] === ch) return [x, y]
  return null
}
function reachable(g, from, pass) {
  const h = g.length
  const w = g[0].length
  const seen = new Uint8Array(w * h)
  const q = [from[1] * w + from[0]]
  seen[q[0]] = 1
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  while (q.length) {
    const i = q.pop()
    const x = i % w
    const y = (i / w) | 0
    for (const [dx, dy] of dirs) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const ni = ny * w + nx
      if (seen[ni]) continue
      if (!pass(g[ny][nx])) continue
      seen[ni] = 1
      q.push(ni)
    }
  }
  return seen
}

function validate(level) {
  const g = level.map.map((r) => r.split(''))
  const count = (ch) => g.flat().filter((c) => c === ch).length
  if (count('h') !== 1 || count('p') !== 1) throw new Error(`${level.id} needs one heart and one portal`)
  if (level.enemy && count('H') !== 1) throw new Error(`${level.id} needs an enemy heart`)
  if (!level.enemy && count('H') !== 0) throw new Error(`${level.id} unexpected enemy`)
  if (count('g') + count('m') < 2) throw new Error(`${level.id} needs gold or gems`)
  const gates = new Set(level.waves.map((w) => w.gate))
  if (gates.has(1) && count('G') < 1) throw new Error(`${level.id} missing gate G`)
  if (gates.has(2) && count('A') < 1) throw new Error(`${level.id} missing gate A`)
  const heart = findChar(g, 'h')
  const seen = reachable(g, heart, (ch) => ch !== '#')
  const portal = findChar(g, 'p')
  if (!seen[portal[1] * g[0].length + portal[0]]) throw new Error(`${level.id} portal sealed`)
}

const playerBase = (rooms, spells, traps = [], doors = []) => ({
  name: 'You',
  gold: 3200,
  imps: 4,
  rooms,
  spells,
  traps,
  doors,
})

const levels = []

{
  const g = grid(40, 40, 'e')
  border(g)
  rect(g, 4, 26, 16, 36, '+')
  g[31][8] = 'h'
  g[31][12] = 'p'
  rect(g, 17, 29, 17, 33, 'g')
  rect(g, 22, 20, 25, 22, 'g')
  g[28][30] = 'm'
  g[27][30] = 'm'
  rect(g, 6, 14, 11, 18, 'w')
  disk(g, 10, 8, 3, 'l')
  rect(g, 18, 8, 22, 14, '#')
  rect(g, 26, 3, 36, 11, '.')
  g[6][31] = 'G'
  rect(g, 28, 16, 34, 18, '#')
  levels.push({
    id: '01-cradle',
    name: 'The First Vein',
    briefing: 'This is your first heart. Tag the gold in the earth, raise a treasury, a lair and a hatchery, and be ready. Heroes will come.',
    width: 40,
    height: 40,
    map: rows(g),
    payday: 85,
    research: 1.7,
    attract: 1.15,
    player: playerBase(['treasury', 'lair', 'hatchery', 'library'], ['create_imp', 'heal', 'lightning']),
    enemy: null,
    waves: [
      { at: 170, gate: 1, party: [{ id: 'thief', n: 2 }, { id: 'archer', n: 1 }], text: 'Heroes have entered the deep.', narration: 'heroes' },
      { at: 250, gate: 1, party: [{ id: 'knight', n: 1 }, { id: 'dwarf', n: 1 }, { id: 'archer', n: 1 }], text: 'A second party is digging toward your heart.', narration: 'heroes' },
    ],
    objectives: [
      { id: 'gold', text: 'Mine 1500 gold', type: 'goldMined', amount: 1500 },
      { id: 'treasury', text: 'Lay a Treasury of 9 tiles', type: 'room', room: 'treasury', tiles: 9 },
      { id: 'lair', text: 'Build a Lair of 6 tiles', type: 'room', room: 'lair', tiles: 6 },
      { id: 'hatch', text: 'Build a Hatchery of 6 tiles', type: 'room', room: 'hatchery', tiles: 6 },
      { id: 'pop', text: 'Attract 3 creatures', type: 'population', count: 3 },
      { id: 'waves', text: 'Break the hero assault', type: 'waves' },
    ],
    startTags: [{ x: 17, y: 31, kind: 'dig' }],
  })
}

{
  const g = grid(48, 48, 'e')
  border(g)
  rect(g, 4, 32, 18, 44, '+')
  g[38][8] = 'h'
  g[38][13] = 'p'
  rect(g, 20, 34, 23, 38, 'g')
  rect(g, 28, 24, 32, 27, 'g')
  rect(g, 14, 18, 16, 20, 'm')
  disk(g, 36, 40, 3, 'l')
  rect(g, 30, 4, 44, 14, '.')
  g[8][38] = 'G'
  rect(g, 10, 8, 16, 12, '#')
  rect(g, 22, 10, 26, 16, 'w')
  levels.push({
    id: '02-siege',
    name: "The Lord's Road",
    briefing: 'The surface has found you. Build an army, hold the heart, and break the Lord of the Land.',
    width: 48,
    height: 48,
    map: rows(g),
    payday: 80,
    research: 1.35,
    attract: 1.1,
    player: { ...playerBase(['treasury', 'lair', 'hatchery', 'library', 'training', 'workshop', 'bridge'], ['create_imp', 'heal', 'lightning', 'sight', 'speed', 'call_to_arms'], ['alarm'], ['wooden']), gold: 4200, imps: 5 },
    enemy: null,
    waves: [
      { at: 90, gate: 1, party: [{ id: 'thief', n: 2 }, { id: 'archer', n: 2 }, { id: 'knight', n: 1 }], text: 'A hero party marches.', narration: 'heroes' },
      { at: 160, gate: 1, party: [{ id: 'dwarf', n: 2 }, { id: 'knight', n: 2 }, { id: 'wizard', n: 1 }, { id: 'barbarian', n: 1 }], text: 'Dwarves are breaking your earth.', narration: 'heroes' },
      { at: 230, gate: 1, party: [{ id: 'giant', n: 1 }, { id: 'barbarian', n: 2 }, { id: 'wizard', n: 1 }, { id: 'knight', n: 2 }], text: 'A giant leads the third wave.', narration: 'heroes' },
      { at: 300, gate: 1, party: [{ id: 'lord', n: 1 }, { id: 'knight', n: 2 }, { id: 'wizard', n: 1 }, { id: 'monk', n: 1 }, { id: 'fairy', n: 1 }], text: 'The Lord of the Land has come for your heart.', narration: 'lord' },
    ],
    objectives: [{ id: 'lord', text: 'Defeat the Lord of the Land', type: 'lord' }],
  })
}

{
  const g = grid(52, 52, 'e')
  border(g)
  rect(g, 4, 36, 16, 48, '+')
  g[42][8] = 'h'
  g[42][12] = 'p'
  rect(g, 34, 4, 48, 16, '1')
  g[8][42] = 'H'
  g[8][38] = 'P'
  rect(g, 22, 22, 30, 28, 'g')
  rect(g, 18, 30, 20, 33, 'm')
  rect(g, 32, 18, 34, 21, 'm')
  disk(g, 26, 40, 2, 'w')
  rect(g, 24, 8, 28, 14, '#')
  levels.push({
    id: '03-rival',
    name: 'The Other Heart',
    briefing: 'Another keeper shares this rock. Take the gold between you, then dig until their heart is dust.',
    width: 52,
    height: 52,
    map: rows(g),
    payday: 75,
    research: 1.2,
    attract: 1,
    player: { ...playerBase(['treasury', 'lair', 'hatchery', 'library', 'training', 'workshop', 'prison'], ['create_imp', 'heal', 'lightning', 'sight', 'call_to_arms'], ['alarm', 'boulder'], ['wooden']), gold: 3800, imps: 5 },
    enemy: {
      name: 'The Rival',
      gold: 4600,
      imps: 5,
      rooms: ['treasury', 'lair', 'hatchery', 'library', 'training', 'workshop', 'guard'],
      spells: ['create_imp', 'heal', 'lightning', 'sight', 'call_to_arms'],
      traps: ['alarm'],
      doors: ['wooden'],
    },
    waves: [],
    objectives: [{ id: 'heart', text: 'Destroy the rival dungeon heart', type: 'heart' }],
  })
}

{
  const g = grid(56, 56, 'e')
  border(g)
  rect(g, 4, 40, 18, 52, '+')
  g[46][8] = 'h'
  g[46][13] = 'p'
  rect(g, 36, 4, 50, 16, '1')
  g[8][44] = 'H'
  g[8][40] = 'P'
  rect(g, 1, 26, 54, 28, 'l')
  rect(g, 8, 34, 12, 37, 'g')
  rect(g, 40, 18, 44, 21, 'm')
  rect(g, 42, 36, 52, 44, '.')
  g[40][48] = 'G'
  disk(g, 24, 48, 2, 'w')
  levels.push({
    id: '04-cinder',
    name: 'Cinder Crossing',
    briefing: 'A river of fire splits the deep. Bridge it, survive the heroes at your gate, and end the rival beyond the lava.',
    width: 56,
    height: 56,
    map: rows(g),
    payday: 75,
    research: 1.15,
    attract: 1,
    player: { ...playerBase(['treasury', 'lair', 'hatchery', 'library', 'training', 'workshop', 'bridge', 'guard'], ['create_imp', 'heal', 'lightning', 'sight', 'speed', 'call_to_arms'], ['alarm', 'boulder'], ['wooden', 'braced']), gold: 4500, imps: 5 },
    enemy: {
      name: 'Ash Keeper',
      gold: 5000,
      imps: 5,
      rooms: ['treasury', 'lair', 'hatchery', 'library', 'training', 'workshop', 'bridge', 'barracks'],
      spells: ['create_imp', 'heal', 'lightning', 'sight', 'call_to_arms', 'speed'],
      traps: ['alarm', 'poison'],
      doors: ['wooden', 'braced'],
    },
    waves: [
      { at: 120, gate: 1, party: [{ id: 'knight', n: 2 }, { id: 'archer', n: 2 }, { id: 'dwarf', n: 1 }], text: 'Heroes attack from the near caves.', narration: 'heroes' },
      { at: 220, gate: 1, party: [{ id: 'lord', n: 1 }, { id: 'knight', n: 2 }, { id: 'wizard', n: 1 }, { id: 'monk', n: 1 }], text: 'The Lord of the Land crosses your threshold.', narration: 'lord' },
    ],
    objectives: [
      { id: 'heart', text: 'Destroy the rival dungeon heart', type: 'heart' },
      { id: 'lord', text: 'Defeat the Lord of the Land', type: 'lord' },
    ],
  })
}

{
  const g = grid(84, 84, 'e')
  border(g)
  rect(g, 4, 64, 20, 78, '+')
  g[71][10] = 'h'
  g[71][15] = 'p'
  rect(g, 58, 6, 76, 22, '1')
  for (let y = 5; y <= 23; y++) for (let x = 57; x <= 77; x++) {
    if (y === 5 || y === 23 || x === 57 || x === 77) g[y][x] = 'R'
  }
  rect(g, 62, 10, 72, 18, '1')
  g[14][68] = 'H'
  g[14][64] = 'P'
  rect(g, 30, 36, 40, 44, 'g')
  rect(g, 48, 50, 52, 54, 'm')
  rect(g, 22, 20, 26, 24, 'm')
  rect(g, 8, 8, 18, 12, 'w')
  rect(g, 40, 60, 70, 62, 'l')
  rect(g, 6, 40, 16, 50, '.')
  g[44][10] = 'G'
  rect(g, 64, 40, 78, 52, '.')
  g[46][72] = 'A'
  disk(g, 36, 70, 3, '#')
  levels.push({
    id: '05-last',
    name: 'The Last Keep',
    briefing: 'The last keep is walled in living rock. The Lord of the Land and a rival keeper both want your heart. Take theirs first.',
    width: 84,
    height: 84,
    map: rows(g),
    payday: 70,
    research: 1.05,
    attract: 1,
    player: { ...playerBase(
      ['treasury', 'lair', 'hatchery', 'library', 'training', 'workshop', 'prison', 'torture', 'barracks', 'guard', 'bridge', 'temple'],
      ['create_imp', 'heal', 'lightning', 'sight', 'speed', 'call_to_arms', 'protect', 'cave_in', 'destroy_walls'],
      ['alarm', 'poison', 'boulder', 'lightning_trap'],
      ['wooden', 'braced', 'iron'],
    ), gold: 6000, imps: 6 },
    enemy: {
      name: 'The Last Keeper',
      gold: 8000,
      imps: 7,
      rooms: ['treasury', 'lair', 'hatchery', 'library', 'training', 'workshop', 'prison', 'torture', 'barracks', 'guard', 'bridge', 'temple', 'graveyard'],
      spells: ['create_imp', 'heal', 'lightning', 'sight', 'speed', 'call_to_arms', 'protect', 'cave_in'],
      traps: ['alarm', 'poison', 'boulder', 'lightning_trap'],
      doors: ['wooden', 'braced', 'iron'],
    },
    waves: [
      { at: 150, gate: 1, party: [{ id: 'knight', n: 2 }, { id: 'dwarf', n: 2 }, { id: 'archer', n: 2 }], text: 'Heroes breach the west caves.', narration: 'heroes' },
      { at: 240, gate: 2, party: [{ id: 'barbarian', n: 2 }, { id: 'wizard', n: 2 }, { id: 'giant', n: 1 }], text: 'A second gate opens in the east.', narration: 'heroes' },
      { at: 340, gate: 1, party: [{ id: 'lord', n: 1 }, { id: 'knight', n: 3 }, { id: 'wizard', n: 1 }, { id: 'monk', n: 1 }, { id: 'fairy', n: 2 }], text: 'The Lord of the Land has come for your heart.', narration: 'lord' },
    ],
    objectives: [
      { id: 'heart', text: 'Destroy the rival dungeon heart', type: 'heart' },
      { id: 'lord', text: 'Defeat the Lord of the Land', type: 'lord' },
    ],
  })
}

await mkdir(outDir, { recursive: true })
for (const level of levels) {
  if (level.map.length !== level.height) throw new Error('height')
  if (level.map.some((r) => r.length !== level.width)) throw new Error(`${level.id} width`)
  validate(level)
  const file = path.join(outDir, `${level.id}.json`)
  await writeFile(file, JSON.stringify(level))
  console.log('wrote', level.id, level.width + 'x' + level.height)
}
