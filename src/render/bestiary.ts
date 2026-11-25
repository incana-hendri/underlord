import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { Look } from '../data/content.ts'

export interface ActorRig {
  group: THREE.Group
  mixer?: THREE.AnimationMixer
  clips: THREE.AnimationClip[]
  actions: Map<string, THREE.AnimationAction>
  current: string
}

interface Cast {
  url: string
  height: number
  tint: number
  yaw: number
}

const CAST: Record<string, Cast> = {
  imp: { url: '/models/imp.glb', height: 0.95, tint: 0xd24a38, yaw: Math.PI },
  goblin: { url: '/models/human.glb', height: 0.78, tint: 0x6a9a48, yaw: Math.PI },
  warlock: { url: '/models/human.glb', height: 0.95, tint: 0x7a48a0, yaw: Math.PI },
  troll: { url: '/models/human.glb', height: 1.15, tint: 0x4e7a40, yaw: Math.PI },
  mistress: { url: '/models/human.glb', height: 1.02, tint: 0xa02848, yaw: Math.PI },
  vampire: { url: '/models/human.glb', height: 1.05, tint: 0xc8c4d8, yaw: Math.PI },
  skeleton: { url: '/models/human.glb', height: 0.95, tint: 0xd8d4c8, yaw: Math.PI },
  beetle: { url: '/models/rat.glb', height: 0.42, tint: 0x8a5a28, yaw: Math.PI },
  spider: { url: '/models/spider.glb', height: 0.48, tint: 0x2a2a32, yaw: Math.PI },
  fly: { url: '/models/wasp.glb', height: 0.46, tint: 0x8060a0, yaw: 0 },
  hellhound: { url: '/models/fox.glb', height: 0.62, tint: 0xa02818, yaw: Math.PI },
  bile: { url: '/models/frog.glb', height: 0.85, tint: 0x6a8040, yaw: Math.PI },
  dragon: { url: '/models/raptor.glb', height: 1.25, tint: 0x8a2818, yaw: Math.PI },
  reaper: { url: '/models/knight.glb', height: 1.45, tint: 0x401018, yaw: Math.PI },
  thief: { url: '/models/human.glb', height: 0.9, tint: 0x8a7848, yaw: Math.PI },
  archer: { url: '/models/human.glb', height: 0.95, tint: 0x6a7840, yaw: Math.PI },
  knight: { url: '/models/knight.glb', height: 1.05, tint: 0xd0d4dc, yaw: Math.PI },
  dwarf: { url: '/models/knight.glb', height: 0.72, tint: 0xc09050, yaw: Math.PI },
  wizard: { url: '/models/human.glb', height: 0.98, tint: 0x4060c8, yaw: Math.PI },
  barbarian: { url: '/models/knight.glb', height: 1.15, tint: 0xa04830, yaw: Math.PI },
  monk: { url: '/models/human.glb', height: 0.92, tint: 0xd8c898, yaw: Math.PI },
  fairy: { url: '/models/wasp.glb', height: 0.4, tint: 0xb0f0e0, yaw: 0 },
  giant: { url: '/models/knight.glb', height: 1.7, tint: 0x8a7a68, yaw: Math.PI },
  lord: { url: '/models/knight.glb', height: 1.38, tint: 0xf0d48a, yaw: Math.PI },
}

const cache = new Map<string, { scene: THREE.Object3D; clips: THREE.AnimationClip[] }>()
const loader = new GLTFLoader()
let started = false

export function preloadBestiary(): void {
  if (started) return
  started = true
  const urls = new Set(Object.values(CAST).map((c) => c.url))
  for (const url of urls) {
    loader.load(url, (gltf) => {
      cache.set(url, { scene: gltf.scene, clips: gltf.animations })
    })
  }
}

export function modelReady(kind: string): boolean {
  const cast = CAST[kind]
  return !!cast && cache.has(cast.url)
}

function tintMaterial(root: THREE.Object3D, tint: number): void {
  const color = new THREE.Color(tint)
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const src = mesh.material
    const list = Array.isArray(src) ? src : [src]
    mesh.material = list.map((mat) => {
      const next = mat.clone()
      if (next instanceof THREE.MeshStandardMaterial || next instanceof THREE.MeshPhongMaterial || next instanceof THREE.MeshLambertMaterial) {
        next.color.lerp(color, 0.55)
        next.emissive = new THREE.Color(tint).multiplyScalar(0.22)
      }
      return next
    })
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
  })
}

function fitHeight(model: THREE.Object3D, height: number): void {
  const box = new THREE.Box3().setFromObject(model)
  const size = new THREE.Vector3()
  box.getSize(size)
  const h = Math.max(0.001, size.y)
  const s = height / h
  model.scale.multiplyScalar(s)
  box.setFromObject(model)
  model.position.y -= box.min.y
}

function pickClip(clips: THREE.AnimationClip[], keys: string[]): THREE.AnimationClip | undefined {
  const lower = clips.map((clip) => ({ clip, name: clip.name.toLowerCase() }))
  for (const key of keys) {
    const hit = lower.find((row) => row.name.includes(key))
    if (hit) return hit.clip
  }
  return clips[0]
}

export function makeRig(kind: string, fallback: (look: Look) => THREE.Group, look: Look): ActorRig {
  const cast = CAST[kind]
  const loaded = cast ? cache.get(cast.url) : undefined
  if (!cast || !loaded) {
    const group = fallback(look)
    group.userData.fallback = true
    return { group, clips: [], actions: new Map(), current: '' }
  }
  const model = cloneSkinned(loaded.scene)
  model.rotation.y = cast.yaw
  tintMaterial(model, cast.tint)
  fitHeight(model, cast.height)
  const group = new THREE.Group()
  group.add(model)
  const sack = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffd56a, emissive: 0x8a4a00, emissiveIntensity: 0.45, metalness: 0.85, roughness: 0.28 }),
  )
  sack.name = 'loot'
  sack.position.set(0.16, cast.height * 0.55, 0.12)
  sack.visible = false
  group.add(sack)
  const mixer = new THREE.AnimationMixer(model)
  const actions = new Map<string, THREE.AnimationAction>()
  for (const slot of ['idle', 'walk', 'attack'] as const) {
    const keys = slot === 'idle' ? ['idle'] : slot === 'walk' ? ['walk', 'run', 'gallop', 'flying'] : ['attack', 'bite', 'punch', 'sword']
    const clip = pickClip(loaded.clips, keys)
    if (!clip) continue
    const action = mixer.clipAction(clip)
    action.loop = THREE.LoopRepeat
    actions.set(slot, action)
  }
  const idle = actions.get('idle') ?? actions.values().next().value
  idle?.play()
  return { group, mixer, clips: loaded.clips, actions, current: idle ? 'idle' : '' }
}

export function playRig(rig: ActorRig, slot: 'idle' | 'walk' | 'attack'): void {
  if (!rig.mixer || rig.current === slot) return
  const next = rig.actions.get(slot) ?? rig.actions.get('idle')
  if (!next) return
  const prev = rig.actions.get(rig.current)
  next.reset().fadeIn(0.12).play()
  prev?.fadeOut(0.12)
  rig.current = slot
}
