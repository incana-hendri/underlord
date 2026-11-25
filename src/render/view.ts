import * as THREE from 'three'
import { species } from '../data/content.ts'
import type { Look } from '../data/content.ts'
import { gx, gy } from '../sim/grid.ts'
import { Terrain, type Creature } from '../sim/types.ts'
import type { World } from '../sim/world.ts'
import {
  block,
  buildClaw,
  environment,
  makeStage,
  makeSurfaces,
  Particles,
  poseClaw,
  readQuality,
  type Quality,
  type Stage,
  type Surfaces,
} from './look.ts'

const DUMMY = new THREE.Object3D()
const COLOR = new THREE.Color()

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
    new THREE.RingGeometry(0.42, 0.52, 24),
    new THREE.MeshBasicMaterial({ color: 0xe6c878, side: THREE.DoubleSide }),
  )
  private claw = buildClaw()
  private surfaces: Surfaces = makeSurfaces()
  private quality: Quality = readQuality()
  private direct = false
  private sun!: THREE.DirectionalLight
  private stage!: Stage
  private fx!: Particles
  private handShadow!: THREE.Mesh
  private propMesh!: THREE.InstancedMesh
  private torchMesh!: THREE.InstancedMesh
  private flameMesh!: THREE.InstancedMesh
  private digState: Float32Array | null = null
  private propN = 0
  private torchN = 0
  private torchSpots: { x: number; z: number }[] = []
  private tagMesh!: THREE.InstancedMesh
  private chickenMesh!: THREE.InstancedMesh
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
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.15, 280)
    this.scene.background = new THREE.Color(0x07060e)
    this.scene.fog = new THREE.FogExp2(0x100c16, 0.02)
    this.scene.environment = environment(this.renderer)
    this.scene.add(new THREE.AmbientLight(0x3a3048, 0.38))
    this.scene.add(new THREE.HemisphereLight(0x8aa0c8, 0x2a1410, 0.28))
    this.sun = new THREE.DirectionalLight(0xffd2a8, 1.35)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.camera.near = 2
    this.sun.shadow.camera.far = 70
    this.sun.shadow.camera.left = -18
    this.sun.shadow.camera.right = 18
    this.sun.shadow.camera.top = 18
    this.sun.shadow.camera.bottom = -18
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.03
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)
    for (let i = 0; i < 6; i++) {
      const light = new THREE.PointLight(0xffaa66, 0, 12, 2)
      light.castShadow = false
      this.lights.push(light)
      this.scene.add(light)
    }
    this.hover.rotation.x = -Math.PI / 2
    this.hover.visible = false
    this.scene.add(this.hover)
    this.claw.group.visible = false
    this.scene.add(this.claw.group)
    this.handShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }),
    )
    this.handShadow.rotation.x = -Math.PI / 2
    this.handShadow.visible = false
    this.scene.add(this.handShadow)
    this.fx = new Particles(this.quality === 'low' ? 180 : 520)
    this.scene.add(this.fx.points)
    this.banner.visible = false
    this.scene.add(this.banner)
    this.setQuality(this.quality)
  }

  setQuality(q: Quality): void {
    this.quality = q
    const dpr = window.devicePixelRatio || 1
    const pr = q === 'high' ? Math.min(1.6, dpr) : q === 'low' ? 1 : Math.min(1.25, dpr)
    this.renderer.setPixelRatio(pr)
    this.direct = q === 'low'
    this.renderer.shadowMap.enabled = q === 'high'
    const map = q === 'high' ? 1024 : 512
    this.sun.shadow.mapSize.set(map, map)
    this.sun.castShadow = q === 'high'
    const budget = q === 'high' ? 4 : q === 'low' ? 2 : 3
    this.lights.forEach((light, i) => { light.visible = i < budget })
    this.stage = makeStage(this.renderer, this.scene, this.camera, q)
    const canvas = this.renderer.domElement
    this.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1)
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / Math.max(1, height)
    this.camera.updateProjectionMatrix()
    this.stage?.composer.setSize(width, height)
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

  update(world: World, dt: number, hover: { x: number; y: number } | null, held: Creature[]): void {
    this.ensure(world)
    this.clock += dt
    this.animAcc += dt
    if (world.mapRevision !== this.lastMap || world.visRevision !== this.lastVis || (world.animDirty && this.animAcc > 0.08)) {
      this.syncMap(world)
      world.animDirty = false
      this.animAcc = 0
      this.lastMap = world.mapRevision
      this.lastVis = world.visRevision
    }
    this.syncActors(world, dt, held, hover)
    this.syncChickens(world)
    this.syncLights(world)
    this.hover.visible = !!hover
    if (hover) this.hover.position.set(hover.x + 0.5, 0.22, hover.y + 0.5)
    const slapping = world.creatures.some((c) => c.slap > 7.15)
    this.placeHand(world, hover, slapping, held.length)
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
      if (heart.userData.spin) {
        const ring = heart.children[0]
        const ring2 = heart.children[1]
        if (ring) ring.rotation.z += dt * 1.6
        if (ring2) ring2.rotation.z -= dt * 2.1
      } else {
        heart.rotation.y += dt * 0.45
        const s = 1 + Math.sin(this.clock * 3) * 0.07
        heart.scale.setScalar(s)
      }
    }
    this.sun.position.set(this.target.x + 12, 26, this.target.z + 7)
    this.sun.target.position.set(this.target.x, 0, this.target.z)
    this.surfaces.gem.emissiveIntensity = 0.7 + Math.sin(this.clock * 5) * 0.28
    this.surfaces.lava.emissiveIntensity = 1.15 + Math.sin(this.clock * 6) * 0.35
    this.fx.update(dt)
    this.smooth(dt, world)
    if (this.direct) this.renderer.render(this.scene, this.camera)
    else this.stage.composer.render()
  }

  pick(clientX: number, clientY: number, world: World): { x: number; y: number; creatureId: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return null
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this.camera.updateMatrixWorld(true)
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
    if (tile && creatureId && creatureDist + 0.2 < tile.dist) return { x: tile.x, y: tile.y, creatureId }
    if (tile) {
      const near = this.creatureNear(world, tile.x, tile.y, clientX, clientY)
      return { x: tile.x, y: tile.y, creatureId: near || (creatureId && creatureDist < tile.dist ? creatureId : 0) }
    }
    if (!creatureId) return null
    const c = world.creatures.find((cr) => cr.id === creatureId)
    if (!c) return null
    return { x: Math.floor(c.x), y: Math.floor(c.y), creatureId }
  }

  private creatureNear(world: World, x: number, y: number, clientX: number, clientY: number): number {
    const rect = this.renderer.domElement.getBoundingClientRect()
    let best = 0
    let bestD = 36
    for (const c of world.creatures) {
      if (c.dead || c.held || c.carried) continue
      if (Math.abs(c.x - (x + 0.5)) > 1.2 || Math.abs(c.y - (y + 0.5)) > 1.2) continue
      const p = this.project(c.x, 0.55, c.y)
      if (!p) continue
      const d = Math.hypot(rect.left + p.x - clientX, rect.top + p.y - clientY)
      if (d < bestD) {
        bestD = d
        best = c.id
      }
    }
    return best
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
    const s = this.surfaces
    const stone = (h: number, r: number) => block(h, r)
    this.buckets = {
      rock: bucket(stone(2.05, 0.09), s.rock, cap, 2.05),
      brick: bucket(stone(2.15, 0.05), s.brick, cap, 2.15),
      earth: bucket(stone(1.62, 0.07), s.earth, cap, 1.62),
      gold: bucket(stone(1.62, 0.07), s.gold, cap, 1.62),
      gem: bucket(stone(1.62, 0.06), s.gem, cap, 1.62),
      floorYou: bucket(stone(0.16, 0.03), s.floor, cap, 0.16),
      floorFoe: bucket(stone(0.16, 0.03), s.floor, cap, 0.16),
      floorOpen: bucket(stone(0.16, 0.03), s.floor, cap, 0.16),
      water: bucket(new THREE.BoxGeometry(0.98, 0.1, 0.98), s.water, cap, 0.1),
      lava: bucket(new THREE.BoxGeometry(0.98, 0.12, 0.98), s.lava, cap, 0.12),
      bridge: bucket(stone(0.18, 0.02), s.wood, cap, 0.18),
    }
    for (const b of Object.values(this.buckets)) {
      b.mesh.castShadow = false
      b.mesh.receiveShadow = true
      this.scene.add(b.mesh)
    }
    this.digState = new Float32Array(cap)
    this.roomMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.92, 0.05, 0.92), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x221108 }), cap)
    this.roomMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3)
    this.roomMesh.frustumCulled = false
    this.nuggetMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ color: 0xffd56a, emissive: 0x8a4a00, emissiveIntensity: 0.6, metalness: 1, roughness: 0.28 }), cap)
    this.markMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 0.72, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), cap)
    this.markMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3)
    this.tagMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.94, 0.07, 0.94),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.78, depthWrite: false }),
      cap,
    )
    this.tagMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3)
    this.tagMesh.renderOrder = 2
    this.chickenMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.22, 5), new THREE.MeshLambertMaterial({ color: 0xfff0b0, emissive: 0x5a4010 }), 200)
    this.chickenMesh.frustumCulled = false
    this.chickenMesh.count = 0
    const propCap = Math.min(cap, 900)
    this.propMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.05 }), propCap)
    this.propMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(propCap * 3), 3)
    this.torchMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 5), new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.8 }), 80)
    this.flameMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 0.26, 6), new THREE.MeshBasicMaterial({ color: 0xffe090 }), 80)
    this.doorMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 1.15, 0.9), this.surfaces.wood, Math.min(cap, 400))
    this.doorMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.min(cap, 400) * 3), 3)
    this.trapMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.18, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.min(cap, 400))
    this.trapMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.min(cap, 400) * 3), 3)
    for (const m of [this.roomMesh, this.nuggetMesh, this.markMesh, this.tagMesh, this.doorMesh, this.trapMesh, this.chickenMesh, this.propMesh, this.torchMesh, this.flameMesh]) {
      m.frustumCulled = false
      m.count = 0
      m.castShadow = m !== this.tagMesh && m !== this.flameMesh
      m.receiveShadow = m !== this.tagMesh && m !== this.flameMesh
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

  private pickTile(ray: THREE.Ray, world: World): { x: number; y: number; dist: number } | null {
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
      if (h >= 0 && Math.max(y0, y1) >= 0 && Math.min(y0, y1) <= h) {
        let dist = t
        if (Math.abs(ray.direction.y) > 1e-6) {
          const th = (Math.min(h, Math.max(y0, y1)) - ray.origin.y) / ray.direction.y
          if (th >= t - 1e-4 && th <= tNext + 1e-4) dist = th
        }
        return { x, y: z, dist: Math.max(0, dist) }
      }
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
    this.propN = 0
    this.torchN = 0
    this.torchSpots = []
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
      if (t.terrain === Terrain.Rock) {
        if (t.reinforced) counts.brick = this.put(this.buckets.brick!, counts.brick!, x, z, 1, dim ? 0x6a7078 : 0xd5dbe4)
        else counts.rock = this.put(this.buckets.rock!, counts.rock!, x, z, 1 - t.dig * 0.15, dim ? 0x5a5450 : 0xc8beb4)
      } else if (t.terrain === Terrain.Earth) counts.earth = this.put(this.buckets.earth!, counts.earth!, x, z, 1 - t.dig * 0.85, shade)
      else if (t.terrain === Terrain.Gold) counts.gold = this.put(this.buckets.gold!, counts.gold!, x, z, 1 - t.dig * 0.85, shade)
      else if (t.terrain === Terrain.Gem) counts.gem = this.put(this.buckets.gem!, counts.gem!, x, z, 1 - t.dig * 0.85, shade)
      else if (t.terrain === Terrain.Water && !t.bridge) counts.water = this.put(this.buckets.water!, counts.water!, x, z, 1, shade)
      else if (t.terrain === Terrain.Lava && !t.bridge) counts.lava = this.put(this.buckets.lava!, counts.lava!, x, z, 1, shade)
      else if (t.bridge) counts.bridge = this.put(this.buckets.bridge!, counts.bridge!, x, z, 1, shade)
      else if (t.owner === 1) counts.floorYou = this.put(this.buckets.floorYou!, counts.floorYou!, x, z, 1, dim ? 0x6a4038 : 0xd8a090)
      else if (t.owner > 1) counts.floorFoe = this.put(this.buckets.floorFoe!, counts.floorFoe!, x, z, 1, dim ? 0x303848 : 0x6a78c8)
      else counts.floorOpen = this.put(this.buckets.floorOpen!, counts.floorOpen!, x, z, 1, dim ? 0x4a4440 : 0xa09080)
      if (t.room && t.terrain === Terrain.Floor) {
        DUMMY.position.set(x + 0.5, 0.2, z + 0.5)
        DUMMY.scale.set(1, 1, 1)
        DUMMY.rotation.set(0, 0, 0)
        DUMMY.updateMatrix()
        this.roomMesh.setMatrixAt(rooms, DUMMY.matrix)
        COLOR.setHex(roomColors[t.room] ?? 0x888888)
        this.roomMesh.setColorAt(rooms, COLOR)
        rooms++
        this.decorate(world, t.room, t.owner, x, z)
      }
      if (this.digState && revealed && t.dig > (this.digState[i] ?? 0) + 0.06 && this.quality !== 'low') {
        const crumb = t.terrain === Terrain.Gold ? 0xffd56a : t.terrain === Terrain.Gem ? 0x7dfff0 : 0x8a5a32
        this.fx.burst(x + 0.5, 1.15, z + 0.5, crumb, 6, 1.8)
      }
      if (this.digState) this.digState[i] = t.dig
      if (t.owner > 0 && t.terrain === Terrain.Floor && (i % 6) === 0 && this.torchN < 64) {
        const w = world.width
        const nb = [i - 1, i + 1, i - w, i + w]
        const walled = nb.some((j) => {
          const n = world.tiles[j]
          return n && (n.terrain === Terrain.Rock || n.terrain === Terrain.Earth || n.terrain === Terrain.Gold)
        })
        if (walled) {
          DUMMY.position.set(x + 0.62, 0.42, z + 0.62)
          DUMMY.scale.set(1.4, 1.3, 1.4)
          DUMMY.rotation.set(0, 0, 0)
          DUMMY.updateMatrix()
          this.torchMesh.setMatrixAt(this.torchN, DUMMY.matrix)
          DUMMY.position.set(x + 0.62, 0.78, z + 0.62)
          DUMMY.scale.set(1.8, 2.1, 1.8)
          DUMMY.updateMatrix()
          this.flameMesh.setMatrixAt(this.torchN, DUMMY.matrix)
          this.torchSpots.push({ x: x + 0.62, z: z + 0.62 })
          this.torchN++
        }
      }
      if (t.terrain === Terrain.Floor && t.gold > 0) {
        DUMMY.position.set(x + 0.5, 0.32, z + 0.5)
        DUMMY.scale.setScalar(0.6 + Math.min(1.4, t.gold / 800))
        DUMMY.updateMatrix()
        this.nuggetMesh.setMatrixAt(nuggets++, DUMMY.matrix)
      }
      if (t.tag) {
        const top = t.terrain === Terrain.Rock ? 2.15 : t.terrain === Terrain.Floor ? 0.2 : 1.55 * (1 - t.dig * 0.7)
        DUMMY.position.set(x + 0.5, top + 0.08, z + 0.5)
        DUMMY.scale.set(1, 1, 1)
        DUMMY.rotation.set(0, 0, 0)
        DUMMY.updateMatrix()
        this.tagMesh.setMatrixAt(marks, DUMMY.matrix)
        COLOR.setHex(t.tag === 2 ? 0x69c4ff : 0xff3a3a)
        this.tagMesh.setColorAt(marks, COLOR)
        DUMMY.position.set(x + 0.5, top + 0.55, z + 0.5)
        DUMMY.rotation.set(0, Math.PI / 5, 0)
        DUMMY.updateMatrix()
        this.markMesh.setMatrixAt(marks, DUMMY.matrix)
        COLOR.setHex(t.tag === 2 ? 0x9ad4ff : 0xffe14a)
        this.markMesh.setColorAt(marks, COLOR)
        marks++
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
    this.tagMesh.count = marks
    this.doorMesh.count = doors
    this.trapMesh.count = traps
    this.propMesh.count = this.propN
    this.torchMesh.count = this.torchN
    this.flameMesh.count = this.torchN
    for (const m of [this.roomMesh, this.nuggetMesh, this.markMesh, this.tagMesh, this.doorMesh, this.trapMesh, this.propMesh, this.torchMesh, this.flameMesh]) {
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
        const mat = new THREE.MeshStandardMaterial({
          color: t.heart === 1 ? 0xff2438 : 0x6688ff,
          emissive: t.heart === 1 ? 0xff1028 : 0x2244cc,
          emissiveIntensity: 0.9,
          roughness: 0.42,
        })
        const lobes: [number, number, number, number, number, number][] = [
          [1.1, 0.85, 0.8, -0.12, 0.72, 0],
          [1.1, 0.85, 0.8, 0.12, 0.72, 0],
          [0.7, 1.15, 0.7, 0, 0.48, 0.02],
        ]
        for (const [sx, sy, sz, px, py, pz] of lobes) {
          const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat)
          lobe.scale.set(sx, sy, sz)
          lobe.position.set(px, py, pz)
          lobe.castShadow = true
          g.add(lobe)
        }
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0x2a1818, roughness: 0.8 }))
        base.position.y = 0.16
        g.add(base)
      } else {
        g.userData.spin = true
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 24), new THREE.MeshStandardMaterial({ color: 0xd090ff, emissive: 0x7020c0, emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.3 }))
        ring.rotation.x = Math.PI / 2
        ring.position.y = 0.62
        g.add(ring)
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 20), new THREE.MeshStandardMaterial({ color: 0x88e0ff, emissive: 0x2060ff, emissiveIntensity: 1.2, roughness: 0.2 }))
        ring2.rotation.x = Math.PI / 2
        ring2.position.y = 0.62
        g.add(ring2)
        const well = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.16, 10), new THREE.MeshStandardMaterial({ color: 0x1a1020, roughness: 0.7 }))
        well.position.y = 0.12
        g.add(well)
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
    const nearTorches = [...this.torchSpots].sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz)).slice(0, 6)
    for (const torch of nearTorches) spots.push({ x: torch.x, z: torch.z, color: 0xffaa55, intensity: 1.15 })
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

  private syncActors(world: World, dt: number, held: Creature[], hover: { x: number; y: number } | null): void {
    const live = new Set<number>()
    const stack = new Map(held.map((c, i) => [c.id, i]))
    for (const c of world.creatures) {
      if (c.dead) continue
      live.add(c.id)
      let group = this.actors.get(c.id)
      if (!group) {
        group = buildCreature(species(c.kind).look)
        group.traverse((obj) => { obj.castShadow = true; obj.receiveShadow = true })
        group.userData.creatureId = c.id
        group.userData.hp = c.hp
        group.userData.hit = 0
        this.actors.set(c.id, group)
        this.scene.add(group)
      }
      const prevHp = group.userData.hp as number
      if (c.hp < prevHp - 0.4) group.userData.hit = 0.28
      group.userData.hp = c.hp
      if ((group.userData.hit as number) > 0) group.userData.hit = Math.max(0, (group.userData.hit as number) - dt)
      const ox = ((c.id * 17) % 7 - 3) * 0.03
      const oz = ((c.id * 13) % 7 - 3) * 0.03
      let x = c.x + ox
      let z = c.y + oz
      let y = 0.16
      const slot = stack.get(c.id)
      if (c.held && hover && slot !== undefined) {
        const palm = this.cursorPoint(world, hover)
        x = palm.x
        z = palm.z
        y = palm.y + 0.28 + slot * 0.42
      }
      const sleeping = c.mode === 'sleep'
      if (c.unconscious > 0 || c.carried || sleeping) y = sleeping ? 0.2 : 0.08
      group.position.set(x, y, z)
      group.visible = true
      const working = !!c.job && c.pathI >= c.path.length && c.unconscious <= 0 && !c.held
      const moving = c.path.length > c.pathI && c.unconscious <= 0 && !c.held && !sleeping
      const swing = moving || working ? Math.sin(this.clock * (working ? 16 : 10) * (0.6 + species(c.kind).speed * 0.15)) : 0
      const fighting = c.mode === 'fight' && c.cool < 0.28
      const parts = group.userData.parts as Parts
      if (parts.legL) parts.legL.rotation.x = swing * 0.7
      if (parts.legR) parts.legR.rotation.x = -swing * 0.7
      if (parts.armL) parts.armL.rotation.x = working ? -1.1 : -swing * 0.5
      if (parts.armR) parts.armR.rotation.x = fighting ? -1.45 : working ? 0.9 : swing * 0.4
      if (parts.body) parts.body.position.y = parts.bodyBase + (moving || working ? Math.abs(swing) * 0.05 : Math.sin(this.clock * 2 + c.id) * 0.02)
      if (working && c.jobTile >= 0) {
        const jx = gx(world.width, c.jobTile) + 0.5
        const jz = gy(world.width, c.jobTile) + 0.5
        group.rotation.y = -Math.atan2(jx - c.x, jz - c.y)
      } else group.rotation.y = -c.facing
      group.rotation.z = c.unconscious > 0 || c.carried || sleeping ? Math.PI / 2.3 : 0
      const chick = group.getObjectByName('chick')
      if (chick) chick.visible = c.chicken > 0
      const loot = group.getObjectByName('loot')
      if (loot) loot.visible = c.carry === 'gold' || c.carry === 'crate'
      if ((c.carry === 'gold' || c.carry === 'crate') && group.userData.wasCarry !== c.carry && this.quality !== 'low') {
        this.fx.burst(c.x, 0.7, c.y, c.carry === 'gold' ? 0xffd56a : 0xc08040, 8, 1.3)
      }
      group.userData.wasCarry = c.carry
      if (c.slap > 7.35 && !group.userData.slapped && this.quality !== 'low') {
        this.fx.burst(c.x, 0.55, c.y, 0xffe0a0, 7, 2.2)
        group.userData.slapped = true
      }
      if (c.slap < 1) group.userData.slapped = false
      const bar = group.getObjectByName('hp') as THREE.Mesh | null
      if (bar) {
        const ratio = Math.max(0.05, Math.min(1, c.hp / Math.max(1, c.maxHp)))
        bar.scale.x = ratio
        bar.position.x = (ratio - 1) * 0.22
        const mat = bar.material as THREE.MeshBasicMaterial
        mat.color.setHex(ratio > 0.55 ? 0x3dcc66 : ratio > 0.28 ? 0xe0b040 : 0xe04040)
      }
      const burst = group.getObjectByName('burst')
      if (burst) {
        burst.visible = c.slap > 6 || (group.userData.hit as number) > 0.02
        burst.scale.setScalar(c.slap > 6 ? 1.1 + (8 - c.slap) * 0.35 : 1.4)
      }
      const hitScale = (group.userData.hit as number) > 0.05 ? 1.18 : 1
      group.scale.setScalar((c.chicken > 0 ? 0.45 : 1) * hitScale * (c.slap > 7 ? 1.12 : 1))
    }
    for (const [id, group] of this.actors) {
      if (!live.has(id)) group.visible = false
    }
  }

  private cursorPoint(world: World, hover: { x: number; y: number }): THREE.Vector3 {
    const h = Math.max(0.25, this.column(world, hover.x, hover.y))
    return new THREE.Vector3(
      hover.x + 0.5,
      h + 0.72 + Math.sin(this.clock * 3.2) * 0.04,
      hover.y + 0.5,
    )
  }

  private placeHand(world: World, hover: { x: number; y: number } | null, slapping: boolean, holding: number): void {
    if (!hover) {
      this.claw.group.visible = false
      this.handShadow.visible = false
      return
    }
    this.claw.group.visible = true
    const palm = this.cursorPoint(world, hover)
    this.claw.group.position.copy(palm)
    if (slapping) this.claw.group.position.y -= 0.45
    this.claw.group.rotation.set(slapping ? -1.25 : -0.7, this.theta, slapping ? 0.35 : 0.06 + Math.sin(this.clock * 2) * 0.03)
    poseClaw(this.claw, this.clock, holding, slapping)
    const floorY = Math.max(0.18, this.column(world, hover.x, hover.y)) + 0.03
    this.handShadow.visible = true
    this.handShadow.position.set(hover.x + 0.5, floorY, hover.y + 0.5)
    const lift = Math.max(0.35, palm.y - floorY)
    const mat = this.handShadow.material as THREE.MeshBasicMaterial
    mat.opacity = Math.max(0.12, 0.45 - lift * 0.12)
    this.handShadow.scale.setScalar(0.7 + lift * 0.15)
  }

  private decorate(world: World, room: string, owner: number, x: number, z: number): void {
    const px = x + 0.5
    const pz = z + 0.5
    const gold = world.keepers[owner]?.gold ?? 0
    if (room === 'lair') this.placeProp(px, 0.18, pz, 0.55, 0.1, 0.32, 0x6a3828)
    else if (room === 'library') this.placeProp(px, 0.42, pz, 0.46, 0.62, 0.16, 0x3d2c22, 0.15)
    else if (room === 'training') this.placeProp(px, 0.42, pz, 0.16, 0.72, 0.16, 0xd8c4a0)
    else if (room === 'workshop') this.placeProp(px, 0.24, pz, 0.38, 0.22, 0.24, 0x5a5e68)
    else if (room === 'prison') this.placeProp(px, 0.48, pz, 0.08, 0.82, 0.62, 0xa8b0b8)
    else if (room === 'torture') this.placeProp(px, 0.28, pz, 0.62, 0.14, 0.28, 0x6a3030)
    else if (room === 'temple') this.placeProp(px, 0.14, pz, 0.5, 0.06, 0.5, 0x4068c8)
    else if (room === 'graveyard') this.placeProp(px, 0.34, pz, 0.16, 0.5, 0.08, 0xc8ccd0)
    else if (room === 'hatchery') this.placeProp(px, 0.12, pz, 0.42, 0.08, 0.42, 0xe0c888)
    else if (room === 'treasury') this.placeProp(px, 0.2, pz, 0.26, 0.14 + Math.min(0.34, gold / 18000), 0.22, 0xffd56a)
    else if (room === 'barracks') this.placeProp(px, 0.2, pz, 0.42, 0.12, 0.18, 0x8a3030)
    else if (room === 'guard') this.placeProp(px, 0.36, pz, 0.12, 0.62, 0.12, 0xe4e8ee)
    else if (room === 'scavenger') this.placeProp(px, 0.28, pz, 0.3, 0.36, 0.3, 0x2a6868)
  }

  private placeProp(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, rot = 0): void {
    if (this.propN >= (this.propMesh.instanceColor?.count ?? 0)) return
    DUMMY.position.set(x, y, z)
    DUMMY.scale.set(sx, sy, sz)
    DUMMY.rotation.set(0, rot, 0)
    DUMMY.updateMatrix()
    this.propMesh.setMatrixAt(this.propN, DUMMY.matrix)
    COLOR.setHex(color)
    this.propMesh.setColorAt(this.propN, COLOR)
    this.propN++
  }

  private syncChickens(world: World): void {
    if (!this.chickenMesh) return
    let n = 0
    for (const room of world.rooms) {
      if (room.type !== 'hatchery' || room.chickens <= 0) continue
      for (let i = 0; i < room.chickens && n < 200; i++) {
        const tile = room.tiles[i % room.tiles.length]!
        const x = gx(world.width, tile)
        const z = gy(world.width, tile)
        DUMMY.position.set(x + 0.22 + (i % 3) * 0.26, 0.28, z + 0.28 + ((i / 3) | 0) % 3 * 0.22)
        DUMMY.rotation.set(0, i, 0)
        DUMMY.scale.set(1, 1, 1)
        DUMMY.updateMatrix()
        this.chickenMesh.setMatrixAt(n++, DUMMY.matrix)
      }
    }
    this.chickenMesh.count = n
    this.chickenMesh.instanceMatrix.needsUpdate = true
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
  const bodyMat = new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.62, metalness: 0.08 })
  const accent = new THREE.MeshStandardMaterial({ color: look.accent, roughness: 0.45, metalness: 0.22 })
  const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.7, metalness: 0.02 })
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
      head.scale.setScalar(1.25)
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), skin)
        ear.position.set(side * 0.14, 0.86, 0)
        ear.rotation.z = side * 0.8
        root.add(ear)
      }
      const pick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.06), accent)
      pick.position.set(0.22, 0.42, 0.12)
      pick.rotation.z = 0.6
      root.add(pick)
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
  const loot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd56a, emissive: 0x8a4a00, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.3 }))
  loot.name = 'loot'
  loot.position.set(0.16, 0.95, 0.1)
  loot.visible = false
  root.add(loot)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: 0x3dcc66 }))
  bar.name = 'hp'
  bar.position.y = 1.12
  root.add(bar)
  const burst = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.34, 16), new THREE.MeshBasicMaterial({ color: 0xffe08a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }))
  burst.name = 'burst'
  burst.rotation.x = -Math.PI / 2
  burst.position.y = 0.05
  burst.visible = false
  root.add(burst)
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe6a0 }))
  eye.position.set(0.06, look.body === 'beetle' || look.body === 'spider' || look.body === 'quad' ? 0.36 : 0.8, 0.1)
  root.add(eye)
  root.userData.parts = parts
  return root
}
