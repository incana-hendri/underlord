import * as THREE from 'three'
import { species } from '../data/content.ts'
import type { Look } from '../data/content.ts'
import { gx, gy } from '../sim/grid.ts'
import { Terrain, type Creature } from '../sim/types.ts'
import type { World } from '../sim/world.ts'

const DUMMY = new THREE.Object3D()
const COLOR = new THREE.Color()

function tex(paint: (ctx: CanvasRenderingContext2D, s: number) => void, size = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  paint(ctx, size)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.anisotropy = 4
  return t
}

function speckle(ctx: CanvasRenderingContext2D, s: number, color: string, n: number): void {
  ctx.fillStyle = color
  for (let i = 0; i < n; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2)
}

function makeTextures() {
  const rock = tex((ctx, s) => {
    ctx.fillStyle = '#3a342f'
    ctx.fillRect(0, 0, s, s)
    for (let y = 4; y < s; y += 10) {
      ctx.fillStyle = y % 20 === 4 ? '#4a433c' : '#2e2926'
      ctx.fillRect(0, y, s, 3)
    }
    speckle(ctx, s, '#6a625a', 30)
  })
  const earth = tex((ctx, s) => {
    ctx.fillStyle = '#6b4a2c'
    ctx.fillRect(0, 0, s, s)
    speckle(ctx, s, '#8a6240', 40)
    speckle(ctx, s, '#3a2818', 24)
  })
  const gold = tex((ctx, s) => {
    ctx.fillStyle = '#8a6a28'
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = '#e6c25a'
    for (let i = 0; i < 18; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 6, 4)
  })
  const gem = tex((ctx, s) => {
    ctx.fillStyle = '#1c4a48'
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = '#5ef0d0'
    for (let i = 0; i < 12; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 5, 5)
  })
  const floor = tex((ctx, s) => {
    ctx.fillStyle = '#2a2420'
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = '#4a4038'
    ctx.fillRect(3, 3, s - 6, s - 6)
    speckle(ctx, s, '#6a5c50', 16)
  })
  const water = tex((ctx, s) => {
    ctx.fillStyle = '#163e62'
    ctx.fillRect(0, 0, s, s)
    ctx.strokeStyle = '#8fd0ff'
    ctx.globalAlpha = 0.45
    for (let y = 6; y < s; y += 8) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.bezierCurveTo(s * 0.3, y - 3, s * 0.7, y + 3, s, y)
      ctx.stroke()
    }
  })
  const lava = tex((ctx, s) => {
    ctx.fillStyle = '#7a2208'
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = '#ffb03a'
    for (let i = 0; i < 20; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 10, 3)
  })
  const wood = tex((ctx, s) => {
    ctx.fillStyle = '#6a4428'
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = '#8a5c34'
    for (let x = 0; x < s; x += 8) ctx.fillRect(x, 0, 4, s)
  })
  return { rock, earth, gold, gem, floor, water, lava, wood }
}

interface Bucket {
  mesh: THREE.InstancedMesh
  base: number
}

function bucket(geo: THREE.BufferGeometry, material: THREE.Material, cap: number, base: number): Bucket {
  const mesh = new THREE.InstancedMesh(geo, material, cap)
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3)
  mesh.count = 0
  mesh.frustumCulled = false
  return { mesh, base }
}

function lam(map: THREE.Texture | null, color = 0xffffff, emissive = 0x000000): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: map ?? undefined, color, emissive })
}

export class DungeonView {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  theta = Math.PI / 4
  phi = 0.96
  dist = 24
  private aimTheta = this.theta
  private aimPhi = this.phi
  private aimDist = this.dist
  private target = new THREE.Vector3()
  private aimTarget = new THREE.Vector3()
  private buckets: Record<string, Bucket> = {}
  private roomMesh!: THREE.InstancedMesh
  private nuggetMesh!: THREE.InstancedMesh
  private markMesh!: THREE.InstancedMesh
  private doorMesh!: THREE.InstancedMesh
  private trapMesh!: THREE.InstancedMesh
  private actors = new Map<number, THREE.Group>()
  private hearts: THREE.Group[] = []
  private lights: THREE.PointLight[] = []
  private hover = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.5, 4),
    new THREE.MeshBasicMaterial({ color: 0xe6c878, side: THREE.DoubleSide }),
  )
  private banner = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.7, 4),
    new THREE.MeshBasicMaterial({ color: 0xc62838 }),
  )
  private clock = 0
  private lastMap = -1
  private lastVis = -1
  private animAcc = 0
  private ray = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private cap = 1

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.12
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400)
    this.scene.background = new THREE.Color(0x07060a)
    this.scene.fog = new THREE.FogExp2(0x07060a, 0.012)
    this.scene.add(new THREE.AmbientLight(0x6a5a68, 0.55))
    this.scene.add(new THREE.HemisphereLight(0x8aa0c8, 0x3a2018, 0.45))
    const sun = new THREE.DirectionalLight(0xffe2c0, 0.55)
    sun.position.set(40, 70, 20)
    this.scene.add(sun)
    for (let i = 0; i < 10; i++) {
      const light = new THREE.PointLight(0xffaa66, 0, 14, 2)
      this.lights.push(light)
      this.scene.add(light)
    }
    this.hover.rotation.x = -Math.PI / 2
    this.hover.visible = false
    this.scene.add(this.hover)
    this.banner.visible = false
    this.scene.add(this.banner)
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / Math.max(1, height)
    this.camera.updateProjectionMatrix()
  }

  focus(x: number, z: number, distance?: number): void {
    this.aimTarget.set(x, 0, z)
    if (distance) this.aimDist = distance
  }

  home(): void {
    this.aimTheta = Math.PI / 4
    this.aimPhi = 0.96
  }

  pan(forward: number, strafe: number, scale: number): void {
    const fx = -Math.sin(this.theta)
    const fz = -Math.cos(this.theta)
    const rx = Math.cos(this.theta)
    const rz = -Math.sin(this.theta)
    this.aimTarget.x += (fx * forward + rx * strafe) * scale
    this.aimTarget.z += (fz * forward + rz * strafe) * scale
  }

  orbit(dTheta: number, dPhi: number): void {
    this.aimTheta += dTheta
    this.aimPhi = Math.min(1.2, Math.max(0.22, this.aimPhi + dPhi))
  }

  zoom(mult: number): void {
    this.aimDist = Math.min(120, Math.max(7, this.aimDist * mult))
  }

  get yaw(): number {
    return this.theta
  }

  get distance(): number {
    return this.dist
  }

  update(world: World, dt: number, hover: { x: number; y: number } | null, held: Creature | null): void {
    this.ensure(world)
    this.clock += dt
    this.animAcc += dt
    if (world.mapRevision !== this.lastMap || world.visRevision !== this.lastVis || (world.animDirty && this.animAcc > 0.1)) {
      this.syncMap(world)
      world.animDirty = false
      this.animAcc = 0
      this.lastMap = world.mapRevision
      this.lastVis = world.visRevision
    }
    this.syncActors(world, dt, held, hover)
    this.syncLights(world)
    this.hover.visible = !!hover
    if (hover) this.hover.position.set(hover.x + 0.5, 0.22, hover.y + 0.5)
    const k = world.keepers[1]
    if (k && k.rallyT > 0) {
      this.banner.visible = true
      this.banner.position.set(k.rallyX + 0.5, 0.7 + Math.sin(this.clock * 4) * 0.06, k.rallyY + 0.5)
    } else this.banner.visible = false
    const water = this.buckets.water?.mesh.material
    const lava = this.buckets.lava?.mesh.material
    if (water instanceof THREE.MeshLambertMaterial && water.map) water.map.offset.y = this.clock * 0.04
    if (lava instanceof THREE.MeshLambertMaterial && lava.map) {
      lava.map.offset.x = this.clock * 0.05
      lava.emissiveIntensity = 0.7 + Math.sin(this.clock * 6) * 0.2
    }
    for (const heart of this.hearts) {
      heart.rotation.y += dt * 0.6
      const s = 1 + Math.sin(this.clock * 3) * 0.06
      heart.scale.setScalar(s)
    }
    this.smooth(dt, world)
    this.renderer.render(this.scene, this.camera)
  }

  pick(clientX: number, clientY: number, world: World): { x: number; y: number; creatureId: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this.ray.setFromCamera(this.pointer, this.camera)
    const actors = [...this.actors.values()].filter((g) => g.visible)
    const hits = this.ray.intersectObjects(actors, true)
    let creatureId = 0
    let creatureDist = Infinity
    if (hits[0]) {
      let obj: THREE.Object3D | null = hits[0].object
      while (obj && !obj.userData.creatureId) obj = obj.parent
      if (obj?.userData.creatureId) {
        creatureId = obj.userData.creatureId as number
        creatureDist = hits[0].distance
      }
    }
    const tile = this.pickTile(this.ray.ray, world)
    if (!tile && !creatureId) return null
    if (creatureId && (!tile || creatureDist < 80)) return { x: tile?.x ?? 0, y: tile?.y ?? 0, creatureId }
    return tile ? { ...tile, creatureId: 0 } : null
  }

  project(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = new THREE.Vector3(x, y, z).project(this.camera)
    if (v.z > 1) return null
    const rect = this.renderer.domElement.getBoundingClientRect()
    return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height }
  }

  private ensure(world: World): void {
    const cap = world.width * world.height
    if (this.cap === cap && this.buckets.rock) return
    this.cap = cap
    for (const b of Object.values(this.buckets)) this.scene.remove(b.mesh)
    const maps = makeTextures()
    const box = (h: number) => new THREE.BoxGeometry(1, h, 1)
    this.buckets = {
      rock: bucket(box(2.05), lam(maps.rock), cap, 2.05),
      earth: bucket(box(1.62), lam(maps.earth), cap, 1.62),
      gold: bucket(box(1.62), lam(maps.gold, 0xffffff, 0x3a2800), cap, 1.62),
      gem: bucket(box(1.62), lam(maps.gem, 0xffffff, 0x043830), cap, 1.62),
      floorYou: bucket(box(0.16), lam(maps.floor, 0xc05060), cap, 0.16),
      floorFoe: bucket(box(0.16), lam(maps.floor, 0x5060b0), cap, 0.16),
      floorOpen: bucket(box(0.16), lam(maps.floor, 0x8a7564), cap, 0.16),
      water: bucket(new THREE.BoxGeometry(1, 0.1, 1), lam(maps.water, 0xffffff, 0x062030), cap, 0.1),
      lava: bucket(new THREE.BoxGeometry(1, 0.12, 1), lam(maps.lava, 0xffffff, 0xff5a10), cap, 0.12),
      bridge: bucket(box(0.18), lam(maps.wood), cap, 0.18),
    }
    for (const b of Object.values(this.buckets)) this.scene.add(b.mesh)
    this.roomMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.92, 0.05, 0.92), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x221108 }), cap)
    this.roomMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3)
    this.roomMesh.frustumCulled = false
    this.nuggetMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshLambertMaterial({ color: 0xffd56a, emissive: 0x5a3a00 }), cap)
    this.markMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.38, 4), new THREE.MeshBasicMaterial({ color: 0xff4040 }), cap)
    this.doorMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 1.15, 0.9), lam(maps.wood), Math.min(cap, 400))
    this.doorMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.min(cap, 400) * 3), 3)
    this.trapMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.18, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.min(cap, 400))
    this.trapMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.min(cap, 400) * 3), 3)
    for (const m of [this.roomMesh, this.nuggetMesh, this.markMesh, this.doorMesh, this.trapMesh]) {
      m.frustumCulled = false
      m.count = 0
      this.scene.add(m)
    }
    this.lastMap = -1
  }

  private column(world: World, x: number, y: number): number {
    if (x < 0 || y < 0 || x >= world.width || y >= world.height) return -1
    const i = y * world.width + x
    const t = world.tiles[i]!
    if (!world.revealed[i]) return 2.05
    if (t.terrain === Terrain.Rock) return (t.reinforced ? 2.25 : 2.05) * (1 - t.dig * 0.2)
    if (t.terrain === Terrain.Earth || t.terrain === Terrain.Gold || t.terrain === Terrain.Gem) return 1.62 * (1 - t.dig * 0.85)
    if (t.bridge) return 0.2
    if (t.terrain === Terrain.Water || t.terrain === Terrain.Lava) return 0.12
    return 0.16
  }

  private pickTile(ray: THREE.Ray, world: World): { x: number; y: number } | null {
    let x = Math.floor(ray.origin.x)
    let z = Math.floor(ray.origin.z)
    const stepX = ray.direction.x >= 0 ? 1 : -1
    const stepZ = ray.direction.z >= 0 ? 1 : -1
    const tDeltaX = ray.direction.x === 0 ? 1e9 : Math.abs(1 / ray.direction.x)
    const tDeltaZ = ray.direction.z === 0 ? 1e9 : Math.abs(1 / ray.direction.z)
    let tMaxX = ray.direction.x === 0 ? 1e9 : (stepX > 0 ? x + 1 - ray.origin.x : ray.origin.x - x) * tDeltaX
    let tMaxZ = ray.direction.z === 0 ? 1e9 : (stepZ > 0 ? z + 1 - ray.origin.z : ray.origin.z - z) * tDeltaZ
    let t = 0
    for (let n = 0; n < 240; n++) {
      const tNext = Math.min(tMaxX, tMaxZ)
      const y0 = ray.origin.y + ray.direction.y * t
      const y1 = ray.origin.y + ray.direction.y * tNext
      const h = this.column(world, x, z)
      if (h >= 0 && Math.max(y0, y1) >= 0 && Math.min(y0, y1) <= h) return { x, y: z }
      if (tNext > 220) return null
      if (tMaxX < tMaxZ) {
        t = tMaxX
        tMaxX += tDeltaX
        x += stepX
      } else {
        t = tMaxZ
        tMaxZ += tDeltaZ
        z += stepZ
      }
    }
    return null
  }

  private put(b: Bucket, n: number, x: number, z: number, scaleY: number, color: number): number {
    const h = b.base * scaleY
    DUMMY.position.set(x + 0.5, h / 2, z + 0.5)
    DUMMY.scale.set(1, Math.max(0.04, scaleY), 1)
    DUMMY.rotation.set(0, 0, 0)
    DUMMY.updateMatrix()
    b.mesh.setMatrixAt(n, DUMMY.matrix)
    COLOR.setHex(color)
    b.mesh.setColorAt(n, COLOR)
    return n + 1
  }

  private syncMap(world: World): void {
    const counts: Record<string, number> = {}
    for (const key of Object.keys(this.buckets)) counts[key] = 0
    let rooms = 0
    let nuggets = 0
    let marks = 0
    let doors = 0
    let traps = 0
    const roomColors: Record<string, number> = {
      treasury: 0xc6a15a, lair: 0x8a5040, hatchery: 0xd8c060, training: 0xb45040, library: 0x6070c0,
      workshop: 0xc07838, prison: 0x808890, torture: 0xa02840, barracks: 0x803030, guard: 0xd0d4dc,
      bridge: 0xa07848, temple: 0x7040a0, graveyard: 0x687058, scavenger: 0x3a7878,
    }
    for (let i = 0; i < world.tiles.length; i++) {
      const t = world.tiles[i]!
      const x = gx(world.width, i)
      const z = gy(world.width, i)
      const revealed = world.revealed[i] === 1
      const dim = revealed && world.visible[i] === 0
      const shade = dim ? 0x3a3438 : 0xffffff
      if (!revealed) {
        counts.rock = this.put(this.buckets.rock!, counts.rock!, x, z, 1, 0x121014)
        continue
      }
      if (t.terrain === Terrain.Rock) counts.rock = this.put(this.buckets.rock!, counts.rock!, x, z, (t.reinforced ? 1.08 : 1) * (1 - t.dig * 0.15), t.reinforced ? 0x9aa4b0 : shade)
      else if (t.terrain === Terrain.Earth) counts.earth = this.put(this.buckets.earth!, counts.earth!, x, z, 1 - t.dig * 0.85, shade)
      else if (t.terrain === Terrain.Gold) counts.gold = this.put(this.buckets.gold!, counts.gold!, x, z, 1 - t.dig * 0.85, shade)
      else if (t.terrain === Terrain.Gem) counts.gem = this.put(this.buckets.gem!, counts.gem!, x, z, 1 - t.dig * 0.85, shade)
      else if (t.terrain === Terrain.Water && !t.bridge) counts.water = this.put(this.buckets.water!, counts.water!, x, z, 1, shade)
      else if (t.terrain === Terrain.Lava && !t.bridge) counts.lava = this.put(this.buckets.lava!, counts.lava!, x, z, 1, shade)
      else if (t.bridge) counts.bridge = this.put(this.buckets.bridge!, counts.bridge!, x, z, 1, shade)
      else if (t.owner === 1) counts.floorYou = this.put(this.buckets.floorYou!, counts.floorYou!, x, z, 1, shade)
      else if (t.owner > 1) counts.floorFoe = this.put(this.buckets.floorFoe!, counts.floorFoe!, x, z, 1, shade)
      else counts.floorOpen = this.put(this.buckets.floorOpen!, counts.floorOpen!, x, z, 1, shade)
      if (t.room && t.terrain === Terrain.Floor) {
        DUMMY.position.set(x + 0.5, 0.2, z + 0.5)
        DUMMY.scale.set(1, 1, 1)
        DUMMY.rotation.set(0, 0, 0)
        DUMMY.updateMatrix()
        this.roomMesh.setMatrixAt(rooms, DUMMY.matrix)
        COLOR.setHex(roomColors[t.room] ?? 0x888888)
        this.roomMesh.setColorAt(rooms, COLOR)
        rooms++
      }
      if (t.terrain === Terrain.Floor && t.gold > 0) {
        DUMMY.position.set(x + 0.5, 0.32, z + 0.5)
        DUMMY.scale.setScalar(0.6 + Math.min(1.4, t.gold / 800))
        DUMMY.updateMatrix()
        this.nuggetMesh.setMatrixAt(nuggets++, DUMMY.matrix)
      }
      if (t.tag) {
        DUMMY.position.set(x + 0.5, (t.terrain === Terrain.Rock ? 2.2 : 1.7), z + 0.5)
        DUMMY.scale.set(1, 1, 1)
        DUMMY.rotation.set(0, Math.PI / 4, 0)
        DUMMY.updateMatrix()
        this.markMesh.setMatrixAt(marks++, DUMMY.matrix)
      }
      if (t.door && doors < this.doorMesh.count + 1000 && doors < (this.doorMesh.instanceColor?.count ?? 0)) {
        DUMMY.position.set(x + 0.5, 0.7, z + 0.5)
        DUMMY.scale.set(1, 1, 1)
        DUMMY.rotation.y = (x + z) % 2 === 0 ? 0 : Math.PI / 2
        DUMMY.updateMatrix()
        this.doorMesh.setMatrixAt(doors, DUMMY.matrix)
        const doorColor = t.door === 'magic' ? 0x70a0ff : t.door === 'iron' ? 0xb0b6c0 : t.door === 'braced' ? 0x8a5a32 : 0xa06a3a
        COLOR.setHex(doorColor)
        this.doorMesh.setColorAt(doors, COLOR)
        doors++
      }
      if (t.trap && traps < (this.trapMesh.instanceColor?.count ?? 0)) {
        DUMMY.position.set(x + 0.5, 0.28, z + 0.5)
        DUMMY.scale.set(1, 1, 1)
        DUMMY.rotation.set(0, 0, 0)
        DUMMY.updateMatrix()
        this.trapMesh.setMatrixAt(traps, DUMMY.matrix)
        COLOR.setHex(t.trap === 'lava_trap' ? 0xff6a20 : t.trap === 'word' ? 0xd0c0ff : t.trap === 'poison' ? 0x70c040 : 0xf0d060)
        this.trapMesh.setColorAt(traps, COLOR)
        traps++
      }
    }
    for (const [key, b] of Object.entries(this.buckets)) {
      b.mesh.count = counts[key] ?? 0
      b.mesh.instanceMatrix.needsUpdate = true
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true
    }
    this.roomMesh.count = rooms
    this.nuggetMesh.count = nuggets
    this.markMesh.count = marks
    this.doorMesh.count = doors
    this.trapMesh.count = traps
    for (const m of [this.roomMesh, this.nuggetMesh, this.markMesh, this.doorMesh, this.trapMesh]) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    this.syncHearts(world)
  }

  private syncHearts(world: World): void {
    for (const h of this.hearts) this.scene.remove(h)
    this.hearts = []
    for (let i = 0; i < world.tiles.length; i++) {
      const t = world.tiles[i]!
      if (!t.heart && !t.portal) continue
      if (!world.revealed[i]) continue
      const g = new THREE.Group()
      if (t.heart) {
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshLambertMaterial({ color: t.heart === 1 ? 0xff3355 : 0x6688ff, emissive: t.heart === 1 ? 0x6a0018 : 0x102060 }))
        crystal.position.y = 0.7
        g.add(crystal)
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.2, 6), new THREE.MeshLambertMaterial({ color: 0x2a1818 }))
        base.position.y = 0.2
        g.add(base)
      } else {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 8, 16), new THREE.MeshLambertMaterial({ color: 0xb060ff, emissive: 0x301050 }))
        ring.rotation.x = Math.PI / 2
        ring.position.y = 0.55
        g.add(ring)
      }
      g.position.set(gx(world.width, i) + 0.5, 0, gy(world.width, i) + 0.5)
      this.scene.add(g)
      this.hearts.push(g)
    }
  }

  private syncLights(world: World): void {
    const spots: { x: number; z: number; color: number; intensity: number }[] = []
    const k = world.keepers[1]
    if (k && k.heart >= 0) spots.push({ x: gx(world.width, k.heart) + 0.5, z: gy(world.width, k.heart) + 0.5, color: 0xff4455, intensity: 2.4 })
    if (k && k.portal >= 0) spots.push({ x: gx(world.width, k.portal) + 0.5, z: gy(world.width, k.portal) + 0.5, color: 0xc070ff, intensity: 1.8 })
    const cx = this.target.x
    const cz = this.target.z
    let lava = 0
    for (let i = 0; i < world.tiles.length && lava < 4; i++) {
      const t = world.tiles[i]!
      if (t.terrain !== Terrain.Lava || !world.visible[i]) continue
      const x = gx(world.width, i) + 0.5
      const z = gy(world.width, i) + 0.5
      if (Math.hypot(x - cx, z - cz) < 22) {
        spots.push({ x, z, color: 0xff6a22, intensity: 1.5 })
        lava++
      }
    }
    const flicker = 0.85 + Math.sin(this.clock * 9) * 0.15
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i]!
      const spot = spots[i]
      if (!spot) {
        light.intensity = 0
        continue
      }
      light.position.set(spot.x, 1.6, spot.z)
      light.color.setHex(spot.color)
      light.intensity = spot.intensity * flicker
    }
  }

  private syncActors(world: World, dt: number, held: Creature | null, hover: { x: number; y: number } | null): void {
    const live = new Set<number>()
    for (const c of world.creatures) {
      if (c.dead) continue
      live.add(c.id)
      let group = this.actors.get(c.id)
      if (!group) {
        group = buildCreature(species(c.kind).look)
        group.userData.creatureId = c.id
        this.actors.set(c.id, group)
        this.scene.add(group)
      }
      const ox = ((c.id * 17) % 7 - 3) * 0.03
      const oz = ((c.id * 13) % 7 - 3) * 0.03
      let x = c.x + ox
      let z = c.y + oz
      let y = 0.16
      if (c.held && held && hover) {
        x = hover.x + 0.5
        z = hover.y + 0.5
        y = 1.15 + Math.sin(this.clock * 6) * 0.04
      }
      if (c.unconscious > 0 || c.carried) y = 0.08
      group.position.set(x, y, z)
      group.visible = true
      const moving = c.path.length > c.pathI && c.unconscious <= 0 && !c.held
      const swing = moving ? Math.sin(this.clock * 10 * (0.6 + species(c.kind).speed * 0.15)) : 0
      const parts = group.userData.parts as Parts
      if (parts.legL) parts.legL.rotation.x = swing * 0.7
      if (parts.legR) parts.legR.rotation.x = -swing * 0.7
      if (parts.armL) parts.armL.rotation.x = -swing * 0.5
      if (parts.armR) parts.armR.rotation.x = c.cool < 0.18 && c.mode === 'fight' ? -1.2 : swing * 0.4
      if (parts.body) parts.body.position.y = parts.bodyBase + (moving ? Math.abs(swing) * 0.04 : Math.sin(this.clock * 2 + c.id) * 0.02)
      group.rotation.y = -c.facing
      group.rotation.z = c.unconscious > 0 || c.carried ? Math.PI / 2.4 : 0
      const chick = group.getObjectByName('chick')
      if (chick) chick.visible = c.chicken > 0
      group.scale.setScalar(c.chicken > 0 ? 0.45 : 1)
      void dt
    }
    for (const [id, group] of this.actors) {
      if (!live.has(id)) {
        group.visible = false
      }
    }
  }

  private smooth(dt: number, world: World): void {
    const k = 1 - Math.exp(-8 * dt)
    this.theta += (this.aimTheta - this.theta) * k
    this.phi += (this.aimPhi - this.phi) * k
    this.dist += (this.aimDist - this.dist) * k
    this.aimTarget.x = Math.max(0, Math.min(world.width, this.aimTarget.x))
    this.aimTarget.z = Math.max(0, Math.min(world.height, this.aimTarget.z))
    this.target.lerp(this.aimTarget, k)
    const lift = Math.cos(this.phi) * this.dist
    this.camera.position.set(
      this.target.x + Math.sin(this.phi) * Math.sin(this.theta) * this.dist,
      Math.max(0.8, this.target.y + lift),
      this.target.z + Math.sin(this.phi) * Math.cos(this.theta) * this.dist,
    )
    this.camera.lookAt(this.target)
  }
}

interface Parts { legL?: THREE.Group; legR?: THREE.Group; armL?: THREE.Group; armR?: THREE.Group; body?: THREE.Object3D; bodyBase: number }

function buildCreature(look: Look): THREE.Group {
  const root = new THREE.Group()
  root.scale.setScalar(look.scale)
  const bodyMat = new THREE.MeshLambertMaterial({ color: look.color })
  const accent = new THREE.MeshLambertMaterial({ color: look.accent })
  const skin = new THREE.MeshLambertMaterial({ color: look.skin })
  const parts: Parts = { bodyBase: 0.46 }
  const leg = (x: number) => {
    const p = new THREE.Group()
    p.position.set(x, 0.28, 0)
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.1), bodyMat)
    m.position.y = -0.13
    p.add(m)
    root.add(p)
    return p
  }
  const arm = (x: number) => {
    const p = new THREE.Group()
    p.position.set(x, 0.58, 0)
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.08), skin)
    m.position.y = -0.12
    p.add(m)
    root.add(p)
    return p
  }
  if (look.body === 'beetle') {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), bodyMat)
    shell.scale.set(1.3, 0.7, 1)
    shell.position.y = 0.28
    root.add(shell)
    parts.body = shell
    parts.bodyBase = 0.28
    for (const x of [-0.16, 0.16]) for (const z of [-0.08, 0.08]) leg(x).position.z = z
  } else if (look.body === 'fly') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), bodyMat)
    b.position.y = 0.4
    root.add(b)
    parts.body = b
    parts.bodyBase = 0.4
  } else if (look.body === 'spider') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bodyMat)
    b.scale.y = 0.6
    b.position.y = 0.28
    root.add(b)
    parts.body = b
    parts.bodyBase = 0.28
    for (let i = 0; i < 4; i++) {
      leg(-0.2).position.z = -0.12 + i * 0.08
      leg(0.2).position.z = -0.12 + i * 0.08
    }
  } else if (look.body === 'blob') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), bodyMat)
    b.position.y = 0.36
    root.add(b)
    parts.body = b
    parts.bodyBase = 0.36
    parts.armL = arm(-0.28)
    parts.armR = arm(0.28)
  } else if (look.body === 'quad' || look.body === 'dragon') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(look.body === 'dragon' ? 0.7 : 0.46, 0.22, 0.24), bodyMat)
    b.position.set(look.body === 'dragon' ? 0.1 : 0, 0.36, 0)
    root.add(b)
    parts.body = b
    parts.bodyBase = 0.36
    parts.legL = leg(-0.12)
    parts.legR = leg(0.12)
    leg(-0.12).position.z = 0.16
    leg(0.12).position.z = 0.16
    if (look.body === 'dragon') {
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.12), accent)
      neck.position.set(0.48, 0.5, 0)
      root.add(neck)
    }
  } else if (look.body === 'skeleton') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.12), skin)
    b.position.y = 0.5
    root.add(b)
    parts.body = b
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.14), skin)
    head.position.y = 0.76
    root.add(head)
    parts.legL = leg(-0.07)
    parts.legR = leg(0.07)
    parts.armL = arm(-0.18)
    parts.armR = arm(0.18)
  } else {
    const b = new THREE.Mesh(new THREE.BoxGeometry(look.body === 'lord' || look.body === 'reaper' ? 0.36 : 0.26, 0.34, 0.16), bodyMat)
    b.position.y = 0.5
    root.add(b)
    parts.body = b
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.16), skin)
    head.position.y = 0.78
    root.add(head)
    parts.legL = leg(-0.08)
    parts.legR = leg(0.08)
    parts.armL = arm(-0.2)
    parts.armR = arm(0.2)
    if (look.body === 'imp') {
      head.scale.setScalar(1.2)
    }
    if (look.body === 'reaper') {
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.28, 5), accent)
      hood.position.y = 0.98
      root.add(hood)
    }
    if (look.body === 'lord') {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.12, 5), accent)
      crown.position.y = 0.96
      root.add(crown)
    }
  }
  if (look.horns) {
    for (const x of [-0.08, 0.08]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), accent)
      horn.position.set(x, look.body === 'beetle' ? 0.42 : 0.92, 0)
      root.add(horn)
    }
  }
  if (look.wings) {
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.22), accent)
      wing.position.set(s * 0.28, 0.55, 0)
      wing.rotation.y = s * 0.6
      root.add(wing)
    }
  }
  if (look.weapon !== 'none' && parts.armR) {
    const weapon = new THREE.Mesh(
      new THREE.BoxGeometry(look.weapon === 'staff' || look.weapon === 'scythe' ? 0.05 : 0.08, look.weapon === 'bow' ? 0.34 : 0.42, 0.05),
      accent,
    )
    weapon.position.set(0, -0.2, 0.08)
    parts.armR.add(weapon)
  }
  const chick = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 4), new THREE.MeshLambertMaterial({ color: 0xfff2c8 }))
  chick.name = 'chick'
  chick.position.y = 0.2
  chick.visible = false
  root.add(chick)
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe6a0 }))
  eye.position.set(0.06, look.body === 'beetle' || look.body === 'spider' || look.body === 'quad' ? 0.36 : 0.8, 0.1)
  root.add(eye)
  root.userData.parts = parts
  return root
}
