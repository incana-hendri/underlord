import { CAMPAIGN, levelById } from './data/campaign.ts'
import { GEAR, RESEARCH, ROOMS, SPECIES, SPELLS } from './data/content.ts'
import lines from './audio/lines.json' with { type: 'json' }
import { AudioBus } from './audio/bus.ts'
import { DungeonView } from './render/view.ts'
import {
  castSpell,
  countKind,
  countRoom,
  dropCreature,
  goldCap,
  holdCreature,
  impPrice,
  mendHeart,
  placeRoom,
  population,
  queueBuild,
  sellTile,
  setResearch,
  setScavenge,
  shiftJob,
  slap as slapCreature,
  summonImp,
  tagTiles,
} from './sim/sim.ts'
import { clearSave, hasSave, loadSave, persist } from './sim/save.ts'
import { Terrain, type LevelDef } from './sim/types.ts'
import { World } from './sim/world.ts'

const LINE_TEXT = lines as Record<string, string>
const PROG = 'underlord-progress'

type Tool = { kind: 'hand' | 'sell' } | { kind: 'room' | 'spell' | 'trap' | 'door'; id: string }

export class Game {
  private root: HTMLElement
  private world: World | null = null
  private view: DungeonView | null = null
  private audio = new AudioBus()
  private tool: Tool = { kind: 'hand' }
  private speed = 1
  private held: number[] = []
  private simAcc = 0
  private hoverKey = ''
  private hover: { x: number; y: number } | null = null
  private drag: { x: number; y: number; px: number; py: number; button: number } | null = null
  private keys = new Set<string>()
  private last = performance.now()
  private noteCursor = 0
  private uiAcc = 0
  private tab: 'rooms' | 'spells' | 'workshop' | 'creatures' = 'rooms'
  private pointer = { x: 0, y: 0 }

  constructor(root: HTMLElement) {
    this.root = root
    root.innerHTML = `
      <div id="stage" class="hidden"></div>
      <div id="title" class="screen"></div>
      <div id="help" class="screen hidden"></div>
      <div id="editor" class="screen hidden"></div>
      <div id="end" class="screen hidden"></div>
    `
    this.renderTitle()
    this.renderHelp()
    this.renderEditor()
    window.addEventListener('keydown', (e) => this.onKey(e, true))
    window.addEventListener('keyup', (e) => this.onKey(e, false))
    const autostart = new URLSearchParams(location.search).get('play')
    if (autostart) {
      const level = levelById(autostart) ?? CAMPAIGN[0]
      if (level) this.start(World.load(level, 7))
    }
    requestAnimationFrame((t) => this.frame(t))
  }

  private renderTitle(): void {
    const progress = readProgress()
    const el = this.root.querySelector('#title')!
    el.innerHTML = `
      <div class="sheet">
        <div class="kicker">A dungeon-keeping strategy game</div>
        <h1>UNDER<span>LORD</span></h1>
        <p class="lede">Dig the earth. Hoard the gold. Raise a lair of creatures and keep the heart beating. The camera is yours: pan, tilt, zoom, and orbit the dark.</p>
        <div class="levels">
          ${CAMPAIGN.map((level, i) => {
            const open = i === 0 || progress[CAMPAIGN[i - 1]!.id] === 'won'
            const mark = progress[level.id] === 'won' ? 'Won' : open ? 'Open' : 'Sealed'
            return `<button class="level" data-level="${level.id}" ${open ? '' : 'disabled'}><span><strong>${level.name}</strong><small>${level.briefing}</small></span><em>${mark}</em></button>`
          }).join('')}
        </div>
        <div class="row">
          <button class="textbtn" id="resume">Continue saved delve</button>
          <button class="textbtn" id="open-editor">Custom map</button>
          <button class="textbtn" id="open-help">How to play</button>
        </div>
      </div>`
    el.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((btn) => {
      btn.onclick = () => {
        const level = levelById(btn.dataset.level!)
        if (!level) return
        const saved = hasSave(level.id) ? loadSave(level) : null
        this.start(saved ?? World.load(level, (Math.random() * 1e9) | 0))
      }
    })
    el.querySelector('#resume')!.addEventListener('click', () => {
      for (const level of CAMPAIGN) {
        const saved = loadSave(level)
        if (saved && saved.outcome === 'playing') {
          this.start(saved)
          return
        }
      }
    })
    el.querySelector('#open-editor')!.addEventListener('click', () => this.show('editor'))
    el.querySelector('#open-help')!.addEventListener('click', () => this.show('help'))
  }

  private renderHelp(): void {
    this.root.querySelector('#help')!.innerHTML = `
      <div class="sheet">
        <h2>The hand and the eye</h2>
        <p>The red hand follows the cursor. Left click tags earth, gold and gems for digging, and rock for reinforcing. Drag a rectangle to mark many. Click a creature to pick it up; click another to carry a stack. Right click drops the top creature, or slaps whatever is under an empty hand. Shift-right-click a creature onto a temple of nine tiles to sacrifice it.</p>
        <p>WASD or arrows pan. Q and E rotate. R and F tilt. The wheel zooms. Drag with the right or middle button to orbit. Home resets the isometric angle. Space pauses. 1, 2 and 3 set the speed. Esc leaves possession or opens the menu.</p>
        <p>Build rooms on claimed floor. Creatures arrive through the portal when the rooms they crave exist. Imps dig, claim, haul gold and drag the fallen to prison. Research in a library. The workshop forges doors and traps.</p>
        <div class="row"><button class="textbtn primary" id="help-back">Back</button></div>
      </div>`
    this.root.querySelector('#help-back')!.addEventListener('click', () => this.show('title'))
  }

  private renderEditor(): void {
    const sample = ['##########', '#e++h+eeG#', '#e+p++eee#', '#egg++eee#', '#eeeeeeee#', '##########'].join('\n')
    this.root.querySelector('#editor')!.innerHTML = `
      <div class="sheet">
        <h2>Custom map</h2>
        <p class="lede"># rock, e earth, g gold, m gems, w water, l lava, . open floor, + your floor, h heart, p portal, 1 rival floor, H rival heart, P rival portal, G hero gate, R reinforced rock.</p>
        <textarea id="maptext">${sample}</textarea>
        <label><input type="checkbox" id="with-rival"> Rival keeper</label>
        <label><input type="checkbox" id="with-heroes" checked> Hero gate waves</label>
        <div class="row">
          <button class="textbtn primary" id="play-custom">Dig</button>
          <button class="textbtn" id="editor-back">Back</button>
        </div>
      </div>`
    this.root.querySelector('#play-custom')!.addEventListener('click', () => {
      const text = (this.root.querySelector('#maptext') as HTMLTextAreaElement).value
      const rival = (this.root.querySelector('#with-rival') as HTMLInputElement).checked
      const heroes = (this.root.querySelector('#with-heroes') as HTMLInputElement).checked
      const level = parseCustom(text, rival, heroes)
      if (!level) return
      this.start(World.load(level, 5))
    })
    this.root.querySelector('#editor-back')!.addEventListener('click', () => this.show('title'))
  }

  private show(which: 'title' | 'help' | 'editor' | 'end' | 'play'): void {
    for (const id of ['title', 'help', 'editor', 'end']) {
      this.root.querySelector(`#${id}`)!.classList.toggle('hidden', id !== which)
    }
    this.root.querySelector('#stage')!.classList.toggle('hidden', which !== 'play')
  }

  private start(world: World): void {
    this.world = world
    this.held = []
    this.simAcc = 0
    this.hoverKey = ''
    this.tool = { kind: 'hand' }
    this.speed = 1
    this.noteCursor = 0
    const stage = this.root.querySelector('#stage')!
    stage.innerHTML = `
      <div id="view">
        <canvas id="gl"></canvas>
        <div id="vignette"></div>
        <div id="dragbox"></div>
        <div id="topline">
          <div class="chip" id="levelname"></div>
          <ul class="chip" id="objectives"></ul>
          <div class="speed">
            <button data-speed="0">Pause</button>
            <button data-speed="1">1×</button>
            <button data-speed="2">2×</button>
            <button data-speed="3">3×</button>
          </div>
        </div>
        <div id="bottomline">
          <div class="chip" id="messages"></div>
          <div class="chip" id="mentor"><div class="face"></div><div id="mentor-line"></div></div>
        </div>
      </div>
      <aside id="panel">
        <header><div class="seal"></div><div><div class="kicker">Dungeon heart</div><div id="gold">0</div><div id="goldcap"></div><div id="heartline"></div></div></header>
        <canvas id="minimap" width="280" height="132"></canvas>
        <nav id="tabs">
          <button data-tab="rooms">Rooms</button>
          <button data-tab="spells">Spells</button>
          <button data-tab="workshop">Workshop</button>
          <button data-tab="creatures">Creatures</button>
        </nav>
        <div id="tabbody"></div>
        <div id="inspector"><h3>The hand</h3><p>Tag earth to dig. The imps will do the rest.</p></div>
        <div class="row" style="padding:0 12px 12px">
          <button class="textbtn" id="to-hand">Hand</button>
          <button class="textbtn" id="to-sell">Sell</button>
          <button class="textbtn" id="mend">Mend heart</button>
          <button class="textbtn" id="save">Save</button>
          <button class="textbtn" id="menu">Menu</button>
        </div>
      </aside>`
    const canvas = stage.querySelector('#gl') as HTMLCanvasElement
    this.view = new DungeonView(canvas)
    const heart = world.keepers[1]!.heart
    this.view.focus(heart % world.width, (heart / world.width) | 0, 22)
    this.bindPlay(canvas)
    this.show('play')
    this.refreshUi(true)
    this.publish()
    void this.audio.unlock()
  }

  private bindPlay(canvas: HTMLCanvasElement): void {
    const stage = this.root.querySelector('#stage')!
    stage.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((btn) => {
      btn.onclick = () => { this.speed = Number(btn.dataset.speed); this.refreshUi(true) }
    })
    stage.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
      btn.onclick = () => { this.tab = btn.dataset.tab as typeof this.tab; this.refreshUi(true); this.audio.play('ui') }
    })
    stage.querySelector('#to-hand')!.addEventListener('click', () => { this.tool = { kind: 'hand' }; this.refreshUi(true) })
    stage.querySelector('#to-sell')!.addEventListener('click', () => { this.tool = { kind: 'sell' }; this.refreshUi(true) })
    stage.querySelector('#mend')!.addEventListener('click', () => { if (this.world) mendHeart(this.world, 1); this.audio.play('spell') })
    stage.querySelector('#save')!.addEventListener('click', () => { if (this.world) { persist(this.world); this.flash('Delve saved on this machine.') } })
    stage.querySelector('#menu')!.addEventListener('click', () => { if (this.world) persist(this.world); this.show('title'); this.renderTitle() })
    const map = stage.querySelector('#minimap') as HTMLCanvasElement
    map.addEventListener('click', (e) => {
      if (!this.world || !this.view) return
      const rect = map.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * this.world.width
      const y = ((e.clientY - rect.top) / rect.height) * this.world.height
      this.view.focus(x, y)
    })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.addEventListener('pointerdown', (e) => {
      void this.audio.unlock()
      if (e.shiftKey) this.keys.add('shift')
      this.pointer = { x: e.clientX, y: e.clientY }
      if (e.button === 0) this.keys.add('mouse0')
      try { canvas.setPointerCapture(e.pointerId) } catch { /* already released */ }
      const hit = this.view?.pick(e.clientX, e.clientY, this.world!)
      this.drag = { x: hit?.x ?? 0, y: hit?.y ?? 0, px: e.clientX, py: e.clientY, button: e.button }
    })
    canvas.addEventListener('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY }
      if (!this.drag || !this.view) return
      if (this.drag.button === 1 || this.drag.button === 2) {
        this.view.orbit((e.movementX) * 0.005, e.movementY * 0.003)
        return
      }
      const box = this.root.querySelector('#dragbox') as HTMLDivElement
      const rect = canvas.getBoundingClientRect()
      const x = Math.min(this.drag.px, e.clientX) - rect.left
      const y = Math.min(this.drag.py, e.clientY) - rect.top
      box.style.display = 'block'
      box.style.left = `${x}px`
      box.style.top = `${y}px`
      box.style.width = `${Math.abs(e.clientX - this.drag.px)}px`
      box.style.height = `${Math.abs(e.clientY - this.drag.py)}px`
    })
    canvas.addEventListener('pointerup', (e) => {
      if (!this.drag || !this.world || !this.view) return
      this.keys.delete('mouse0')
      const moved = Math.hypot(e.clientX - this.drag.px, e.clientY - this.drag.py)
      const box = this.root.querySelector('#dragbox') as HTMLDivElement
      box.style.display = 'none'
      const hit = this.view.pick(e.clientX, e.clientY, this.world)
      if (this.drag.button === 2 && moved < 6) this.rightClick(hit, e.shiftKey)
      else if (this.drag.button === 0 && moved > 8 && hit && (this.tool.kind === 'hand' || this.tool.kind === 'room' || this.tool.kind === 'sell')) {
        this.applyRect(this.drag.x, this.drag.y, hit.x, hit.y)
      } else if (this.drag.button === 0 && moved < 8) this.leftClick(hit)
      this.drag = null
      this.refreshUi(false)
    })
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      this.view?.zoom(e.deltaY > 0 ? 1.08 : 0.92)
    }, { passive: false })
    stage.querySelector('#tabbody')!.addEventListener('click', (e) => this.onPanelClick(e))
  }

  private onPanelClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]')
    if (!el || !this.world) return
    const kind = el.dataset.kind!
    const id = el.dataset.id!
    if (kind === 'spell' && id === 'create_imp') {
      castSpell(this.world, 1, id, 0, 0)
      this.tool = { kind: 'hand' }
    } else if (kind === 'room' || kind === 'spell' || kind === 'trap' || kind === 'door') {
      this.tool = { kind, id }
    } else if (kind === 'research') setResearch(this.world, 1, id)
    else if (kind === 'job') shiftJob(this.world, 1, id, (el.dataset.dir === '-1' ? -1 : 1))
    else if (kind === 'summon') summonImp(this.world, 1)
    else if (kind === 'focus') {
      const c = this.world.creatures.find((cr) => cr.kind === id && cr.owner === 1 && !cr.dead)
      if (c) this.view?.focus(c.x, c.y)
    } else if (kind === 'scavenge') setScavenge(this.world, 1, id)
    this.audio.play('ui')
    this.refreshUi(true)
  }

  private leftClick(hit: { x: number; y: number; creatureId: number } | null): void {
    const world = this.world
    if (!world || !hit) return
    if (world.possessId) {
      world.possessAtk = true
      return
    }
    if (this.tool.kind === 'hand' && hit.creatureId && this.takeCreature(hit.creatureId)) {
      this.audio.play('pickup')
      return
    }
    if (this.tool.kind === 'hand') tagTiles(world, 1, hit.x, hit.y, hit.x, hit.y, 'toggle')
    else if (this.tool.kind === 'room') placeRoom(world, 1, this.tool.id, hit.x, hit.y)
    else if (this.tool.kind === 'sell') sellTile(world, 1, hit.x, hit.y)
    else if (this.tool.kind === 'spell') castSpell(world, 1, this.tool.id, hit.x, hit.y, hit.creatureId)
    else if (this.tool.kind === 'trap' || this.tool.kind === 'door') queueBuild(world, 1, this.tool.kind, this.tool.id, hit.x, hit.y)
    this.audio.play('ui')
  }

  private takeCreature(id: number): boolean {
    const world = this.world
    if (!world || this.held.includes(id)) return false
    const before = world.creature(id)
    if (!before || before.dead || before.held) return false
    if (!(before.kind === 'imp' || before.owner === 1 || before.unconscious > 0)) return false
    holdCreature(world, id)
    if (!before.held) return false
    this.held.push(id)
    return true
  }

  private rightClick(hit: { x: number; y: number; creatureId: number } | null, shift: boolean): void {
    const world = this.world
    if (!world) return
    this.pruneHeld()
    if (this.held.length && hit) {
      const id = this.held.pop()!
      dropCreature(world, id, hit.x, hit.y, shift)
      this.audio.play('drop')
      return
    }
    if (hit?.creatureId) {
      slapCreature(world, hit.creatureId)
      this.audio.play('slap')
    } else this.tool = { kind: 'hand' }
  }

  private pruneHeld(): void {
    const world = this.world
    if (!world) return
    this.held = this.held.filter((id) => {
      const c = world.creature(id)
      return !!c && c.held && !c.dead
    })
  }

  private applyRect(x0: number, y0: number, x1: number, y1: number): void {
    const world = this.world
    if (!world) return
    if (this.tool.kind === 'hand') tagTiles(world, 1, x0, y0, x1, y1, 'set')
    else if (this.tool.kind === 'sell') {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) sellTile(world, 1, x, y)
      }
    } else if (this.tool.kind === 'room') {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) placeRoom(world, 1, this.tool.id, x, y)
      }
    }
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (down && e.target instanceof HTMLTextAreaElement) return
    this.keys[down ? 'add' : 'delete'](e.key.toLowerCase())
    if (!down || !this.world || !this.view) return
    if (e.key === ' ') { this.speed = this.speed === 0 ? 1 : 0; e.preventDefault() }
    else if (e.key === '1' || e.key === '2' || e.key === '3') this.speed = Number(e.key)
    else if (e.key === 'Home') this.view.home()
    else if (e.key === 'Escape') {
      if (this.world.possessId) {
        const c = this.world.creature(this.world.possessId)
        if (c) c.possessed = false
        this.world.possessId = 0
      } else {
        persist(this.world)
        this.show('title')
        this.renderTitle()
      }
    } else if (e.key === '?' || e.key === 'F1') this.show('help')
    this.refreshUi(false)
  }

  private frame(now: number): void {
    const dt = Math.min(0.5, Math.max(0, (now - this.last) / 1000))
    this.last = now
    const world = this.world
    const view = this.view
    if (world && view && !this.root.querySelector('#stage')!.classList.contains('hidden')) {
      const pan = (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) - (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0)
      const strafe = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0)
      if (!world.possessId) view.pan(pan, strafe, dt * view.distance * 0.7)
      if (this.keys.has('q')) view.orbit(-dt * 0.9, 0)
      if (this.keys.has('e')) view.orbit(dt * 0.9, 0)
      if (this.keys.has('r')) view.orbit(0, -dt * 0.5)
      if (this.keys.has('f')) view.orbit(0, dt * 0.5)
      if (world.possessId) {
        const yaw = view.yaw
        const fx = -Math.sin(yaw)
        const fz = -Math.cos(yaw)
        const rx = Math.cos(yaw)
        const rz = -Math.sin(yaw)
        world.possessX = fx * pan + rx * strafe
        world.possessY = fz * pan + rz * strafe
        world.possessAtk = this.keys.has('mouse0')
      }
      if (this.speed > 0 && world.outcome === 'playing') {
        this.simAcc += dt * this.speed
        let steps = 0
        while (this.simAcc >= 0.05 && steps < 36) {
          world.tick(0.05)
          this.simAcc -= 0.05
          steps++
        }
        if (steps >= 36) this.simAcc = Math.min(this.simAcc, 0.05)
      }
      this.pruneHeld()
      this.consumeSignals(world)
      const canvas = this.root.querySelector('#gl') as HTMLCanvasElement
      view.setSize(canvas.clientWidth, canvas.clientHeight)
      const rect = canvas.getBoundingClientRect()
      const inside = this.pointer.x >= rect.left && this.pointer.x <= rect.right && this.pointer.y >= rect.top && this.pointer.y <= rect.bottom
      const hit = inside ? view.pick(this.pointer.x, this.pointer.y, world) : null
      this.hover = hit ? { x: hit.x, y: hit.y } : null
      const hoverKey = `${hit ? `${hit.x},${hit.y},${hit.creatureId}` : 'none'}:${this.held.length}`
      if (hoverKey !== this.hoverKey) {
        this.hoverKey = hoverKey
        this.describe(hit)
      }
      view.update(world, dt, this.hover, this.carried())
      this.uiAcc += dt
      if (this.uiAcc > 0.25) {
        this.uiAcc = 0
        this.refreshUi(false)
        this.drawMinimap(world)
      }
      const vignette = this.root.querySelector('#vignette')
      vignette?.classList.toggle('alarm', world.heartAlarm > 0)
      if (world.outcome !== 'playing') this.showEnd(world)
    }
    requestAnimationFrame((t) => this.frame(t))
  }

  private consumeSignals(world: World): void {
    while (world.sounds.length) this.audio.play(world.sounds.shift()!)
    for (const note of world.notes) {
      if (note.id <= this.noteCursor) continue
      this.noteCursor = note.id
      if (note.narration) {
        const text = LINE_TEXT[note.narration] ?? note.text
        this.audio.say({ id: note.narration, text })
        const line = this.root.querySelector('#mentor-line')
        if (line) line.textContent = text
        this.root.querySelector('#mentor')?.classList.add('talk')
        window.setTimeout(() => this.root.querySelector('#mentor')?.classList.remove('talk'), 1600)
      }
    }
    if (world.camHint >= 0 && this.view) {
      const tile = world.camHint
      world.camHint = -1
      this.view.focus((tile % world.width) + 0.5, ((tile / world.width) | 0) + 0.5)
    }
  }

  private carried() {
    const world = this.world
    if (!world) return []
    return this.held.map((id) => world.creature(id)).filter((c): c is NonNullable<typeof c> => !!c && c.held && !c.dead)
  }

  private describe(hit: { x: number; y: number; creatureId: number } | null): void {
    const el = this.root.querySelector('#inspector')
    const world = this.world
    if (!el || !world) return
    const carrying = this.held.length ? `<p>Carrying ${this.held.length}. Right-click a tile to drop.</p>` : ''
    if (!hit) {
      el.innerHTML = `<h3>The hand</h3><p>Tag earth to dig. The imps will do the rest.</p>${carrying}`
      return
    }
    const t = world.tiles[hit.y * world.width + hit.x]
    if (!t) return
    const names = ['Rock', 'Earth', 'Gold seam', 'Gem vein', 'Water', 'Lava', 'Floor']
    const owner = t.owner === 1 ? 'Your claim' : t.owner > 1 ? 'Rival claim' : 'Unclaimed'
    const bits = [names[t.terrain] ?? 'Ground', owner]
    if (t.room) bits.push(ROOMS[t.room]?.name ?? t.room)
    if (t.heart) bits.push(t.heart === 1 ? 'Dungeon heart' : 'Rival heart')
    if (t.portal) bits.push('Portal')
    if (t.tag === 1) bits.push('Tagged to dig')
    if (t.tag === 2) bits.push('Tagged to reinforce')
    if (t.reinforced) bits.push('Reinforced')
    if (t.gold > 0) bits.push(`${Math.floor(t.gold)} gold`)
    if (t.door) bits.push(`${t.door} door`)
    if (t.trap) bits.push(t.trap.replace('_', ' '))
    let creature = ''
    const c = hit.creatureId ? world.creature(hit.creatureId) : undefined
    if (c && !c.dead) {
      const spec = SPECIES[c.kind]
      const job = c.carry === 'gold' ? 'hauling gold' : c.job || c.mode || 'idle'
      creature = `<p><strong>${spec?.name ?? c.kind}</strong> · ${Math.ceil(c.hp)}/${Math.ceil(c.maxHp)} hp · ${job}${c.kind === 'imp' ? '' : ` · hunger ${Math.round(c.hunger)} · pay anger ${Math.round(c.anger)}`}</p>`
    }
    el.innerHTML = `<h3>${hit.x}, ${hit.y}</h3><p>${bits.join(' · ')}</p>${creature}${carrying}`
  }

  private publish(): void {
    const worldOf = () => this.world
    const probeHeld = () => this.held.length
    const probe = {
      get time() { return worldOf()?.time ?? 0 },
      get gold() { return worldOf()?.keepers[1]?.gold ?? 0 },
      get held() { return probeHeld() },
      get outcome() { return worldOf()?.outcome ?? 'playing' },
      get width() { return worldOf()?.width ?? 0 },
      get height() { return worldOf()?.height ?? 0 },
      get heart() {
        const world = worldOf()
        const k = world?.keepers[1]
        if (!world || !k || k.heart < 0) return 0
        return world.tiles[k.heart]?.hp ?? 0
      },
      tile(x: number, y: number) {
        const world = worldOf()
        if (!world || x < 0 || y < 0 || x >= world.width || y >= world.height) return null
        const t = world.tiles[y * world.width + x]!
        return { terrain: t.terrain, owner: t.owner, tag: t.tag, tagOwner: t.tagOwner, gold: t.gold, room: t.room, heart: t.heart, portal: t.portal, dig: t.dig }
      },
      creatures() {
        return (worldOf()?.creatures ?? []).filter((c) => !c.dead).map((c) => ({
          id: c.id, kind: c.kind, owner: c.owner, x: c.x, y: c.y, held: c.held, carry: c.carry, job: c.job, hp: c.hp, mode: c.mode,
        }))
      },
      notes() { return (worldOf()?.notes ?? []).map((n) => n.text) },
      chickens() { return (worldOf()?.rooms ?? []).reduce((n, r) => n + (r.type === 'hatchery' ? r.chickens : 0), 0) },
      screen: (x: number, y: number, height = 0.45) => {
        const canvas = this.root.querySelector('#gl') as HTMLCanvasElement | null
        const p = this.view?.project(x, height, y)
        if (!canvas || !p) return null
        const rect = canvas.getBoundingClientRect()
        const sx = rect.left + p.x
        const sy = rect.top + p.y
        if (sx < rect.left + 6 || sy < rect.top + 6 || sx > rect.right - 6 || sy > rect.bottom - 6) return null
        return { x: sx, y: sy }
      },
    }
    Object.defineProperty(window, '__underlord', { configurable: true, value: probe })
  }

  private refreshUi(rebuild: boolean): void {
    const world = this.world
    if (!world) return
    const k = world.keepers[1]
    if (!k) return
    const gold = this.root.querySelector('#gold')
    if (gold) gold.textContent = Math.floor(k.gold).toLocaleString()
    const cap = this.root.querySelector('#goldcap')
    if (cap) cap.textContent = `Treasury ${Math.floor(k.gold).toLocaleString()} / ${goldCap(world, 1).toLocaleString()}`
    const heart = world.tiles[k.heart]
    const line = this.root.querySelector('#heartline')
    if (line && heart) line.textContent = `Heart ${Math.max(0, Math.ceil(heart.hp))} / ${heart.maxHp} · Imps ${countKind(world, 1, 'imp')} · ${population(world, 1)} creatures`
    const name = this.root.querySelector('#levelname')
    if (name) name.textContent = world.level.name
    const objs = this.root.querySelector('#objectives')
    if (objs) objs.innerHTML = world.objectives.map((o) => `<li class="${o.done ? 'done' : ''}">${o.text}</li>`).join('')
    const msgs = this.root.querySelector('#messages')
    if (msgs) {
      msgs.innerHTML = world.notes.slice(-3).map((n) => `<button data-tile="${n.tile}">${n.text}</button>`).join('')
      msgs.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tile = Number((btn as HTMLButtonElement).dataset.tile)
          if (tile >= 0 && this.view && this.world) this.view.focus(tile % this.world.width + 0.5, ((tile / this.world.width) | 0) + 0.5)
        })
      })
    }
    this.root.querySelectorAll('#stage [data-speed]').forEach((btn) => {
      btn.classList.toggle('on', Number((btn as HTMLButtonElement).dataset.speed) === this.speed)
    })
    this.root.querySelectorAll('#tabs button').forEach((btn) => {
      btn.classList.toggle('on', (btn as HTMLButtonElement).dataset.tab === this.tab)
    })
    const body = this.root.querySelector('#tabbody') as HTMLElement | null
    if (!body) return
    const html = this.tabHtml(world)
    if (rebuild || body.dataset.stamp !== html) {
      body.dataset.stamp = html
      body.innerHTML = html
    }
  }

  private tabHtml(world: World): string {
    const k = world.keepers[1]!
    if (this.tab === 'rooms') {
      return Object.values(ROOMS).map((room) => {
        const locked = !k.unlocked.includes(room.id)
        const on = this.tool.kind === 'room' && this.tool.id === room.id
        return `<button class="card ${on ? 'on' : ''}" data-kind="room" data-id="${room.id}" ${locked ? 'disabled' : ''}><b>${room.name}</b><span class="cost">${room.cost} gold</span><small>${locked ? 'Research it' : `${countRoom(world, 1, room.id)} tile${countRoom(world, 1, room.id) === 1 ? '' : 's'}`}</small></button>`
      }).join('')
    }
    if (this.tab === 'spells') {
      const spells = Object.values(SPELLS).map((spell) => {
        const locked = !k.unlocked.includes(spell.id)
        const cost = spell.id === 'create_imp' ? impPrice(world, 1) : spell.cost
        const on = this.tool.kind === 'spell' && this.tool.id === spell.id
        return `<button class="card ${on ? 'on' : ''}" data-kind="spell" data-id="${spell.id}" ${locked ? 'disabled' : ''}><b>${spell.name}</b><span class="cost">${cost || '—'} gold</span><small>${spell.blurb}</small></button>`
      }).join('')
      const research = RESEARCH.map((r) => {
        const done = k.unlocked.includes(r.id)
        const prog = Math.floor(k.research[r.id] ?? 0)
        const on = k.researchTarget === r.id
        return `<button class="card ${on ? 'on' : ''}" data-kind="research" data-id="${r.id}" ${done ? 'disabled' : ''}><b>${r.name}</b><span class="cost">${done ? 'Known' : `${prog}/${r.cost}`}</span><small>${r.blurb}</small></button>`
      }).join('')
      return spells + research
    }
    if (this.tab === 'workshop') {
      return Object.values(GEAR).map((gear) => {
        const locked = !k.unlocked.includes(gear.id)
        const on = (this.tool.kind === 'trap' || this.tool.kind === 'door') && this.tool.id === gear.id
        return `<button class="card ${on ? 'on' : ''}" data-kind="${gear.kind}" data-id="${gear.id}" ${locked ? 'disabled' : ''}><b>${gear.name}</b><span class="cost">${gear.cost}</span><small>${gear.blurb}</small></button>`
      }).join('') + `<div class="jobs">${k.orders.filter((o) => o.status !== 'done').map((o) => `<span>${o.item} ${o.status} ${Math.floor(o.progress)}</span>`).join(' ') || 'Nothing on the bench.'}</div>`
    }
    const counts = Object.values(SPECIES).filter((s) => s.side === 'keeper').map((s) => {
      const n = countKind(world, 1, s.id)
      if (!n && s.id !== 'imp') return ''
      return `<button class="card" data-kind="focus" data-id="${s.id}"><b>${s.name}</b><span class="cost">${n}</span><small>${s.blurb}</small></button>`
    }).join('')
    const jobs = k.jobs.map((job) => `<span>${job} <button data-kind="job" data-id="${job}" data-dir="-1">↑</button><button data-kind="job" data-id="${job}" data-dir="1">↓</button></span>`).join(' ')
    const scavenge = Object.values(SPECIES).filter((s) => s.side === 'keeper' && s.id !== 'imp' && s.id !== 'reaper').map((s) => `<button data-kind="scavenge" data-id="${s.id}">${s.name}</button>`).join('')
    return `<button class="card" data-kind="summon" data-id="imp"><b>Summon imp</b><span class="cost">${impPrice(world, 1)}</span><small>${countKind(world, 1, 'imp')} at work</small></button>` + counts + `<div class="jobs"><b>Imp tasks</b> ${jobs}</div><div class="jobs"><b>Scavenge</b> ${scavenge}</div>`
  }

  private drawMinimap(world: World): void {
    const canvas = this.root.querySelector('#minimap') as HTMLCanvasElement | null
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(world.width, world.height)
    for (let i = 0; i < world.tiles.length; i++) {
      const t = world.tiles[i]!
      let color = 0x070605
      if (world.revealed[i]) {
        if (t.heart) color = 0xff3050
        else if (t.portal) color = 0xc060ff
        else if (t.terrain === Terrain.Gold || (t.terrain === Terrain.Floor && t.gold > 0)) color = 0xe6c04a
        else if (t.terrain === Terrain.Gem || t.gem) color = 0x3ee0c0
        else if (t.terrain === Terrain.Lava) color = 0xff5a18
        else if (t.terrain === Terrain.Water) color = 0x2a6aaa
        else if (t.terrain === Terrain.Rock) color = t.reinforced ? 0x88909a : 0x2a2628
        else if (t.terrain === Terrain.Earth) color = 0x6a4a30
        else if (t.owner === 1) color = 0x8a3040
        else if (t.owner > 1) color = 0x304878
        else color = 0x5a5048
        if (!world.visible[i]) color = (color & 0xfefefe) >> 1
      }
      img.data[i * 4] = (color >> 16) & 255
      img.data[i * 4 + 1] = (color >> 8) & 255
      img.data[i * 4 + 2] = color & 255
      img.data[i * 4 + 3] = 255
    }
    const off = document.createElement('canvas')
    off.width = world.width
    off.height = world.height
    off.getContext('2d')!.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height)
  }

  private showEnd(world: World): void {
    if (!this.root.querySelector('#end')!.classList.contains('hidden')) return
    if (world.outcome === 'victory') {
      const progress = readProgress()
      progress[world.level.id] = 'won'
      localStorage.setItem(PROG, JSON.stringify(progress))
      clearSave(world.level.id)
    }
    const el = this.root.querySelector('#end')!
    el.classList.remove('hidden')
    el.innerHTML = `
      <div class="sheet">
        <h1>${world.outcome === 'victory' ? 'The deep is yours' : 'The heart is still'}</h1>
        <p class="lede">${world.outcome === 'victory' ? world.level.name + ' is broken to your will.' : 'Something reached the dungeon heart.'}</p>
        <div class="row">
          <button class="textbtn primary" id="end-back">Campaign</button>
          <button class="textbtn" id="end-retry">Dig again</button>
        </div>
      </div>`
    el.querySelector('#end-back')!.addEventListener('click', () => { this.show('title'); this.renderTitle() })
    el.querySelector('#end-retry')!.addEventListener('click', () => {
      clearSave(world.level.id)
      this.start(World.load(world.level, (Math.random() * 1e9) | 0))
      this.root.querySelector('#end')!.classList.add('hidden')
    })
  }

  private flash(text: string): void {
    const line = this.root.querySelector('#mentor-line')
    if (line) line.textContent = text
  }
}

function readProgress(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PROG) || '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function parseCustom(text: string, rival: boolean, heroes: boolean): LevelDef | null {
  const map = text.split('\n').map((r) => r.trim()).filter(Boolean)
  if (map.length < 6 || map.some((r) => r.length !== map[0]!.length)) return null
  const flat = map.join('')
  if (!flat.includes('h') || !flat.includes('p')) return null
  return {
    id: 'custom',
    name: 'Custom delve',
    briefing: 'A map of your own making. Keep the heart, and take what you came for.',
    width: map[0]!.length,
    height: map.length,
    map,
    payday: 80,
    research: 1.4,
    attract: 1.1,
    player: {
      name: 'You',
      gold: 4000,
      imps: 4,
      rooms: ['treasury', 'lair', 'hatchery', 'library', 'training', 'workshop', 'bridge', 'prison'],
      spells: ['create_imp', 'heal', 'lightning', 'sight', 'call_to_arms'],
      traps: ['alarm', 'boulder'],
      doors: ['wooden'],
    },
    enemy: rival && flat.includes('H') ? {
      name: 'Rival',
      gold: 4000,
      imps: 4,
      rooms: ['treasury', 'lair', 'hatchery', 'library', 'training'],
      spells: ['create_imp', 'heal', 'lightning', 'sight'],
      traps: [],
      doors: ['wooden'],
    } : null,
    waves: heroes && flat.includes('G') ? [
      { at: 18, gate: 1, party: [{ id: 'thief', n: 1 }, { id: 'knight', n: 1 }, { id: 'archer', n: 1 }], text: 'Heroes have found your gate.', narration: 'heroes' },
    ] : [],
    objectives: rival && flat.includes('H')
      ? [{ id: 'heart', text: 'Destroy the rival heart', type: 'heart' }]
      : [{ id: 'gold', text: 'Mine 2000 gold', type: 'goldMined', amount: 2000 }, { id: 'pop', text: 'Attract 4 creatures', type: 'population', count: 4 }],
  }
}
