import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js'

export type Quality = 'low' | 'medium' | 'high'

export function readQuality(): Quality {
  const v = localStorage.getItem('underlord-quality')
  return v === 'low' || v === 'high' || v === 'medium' ? v : 'medium'
}

function mapTex(url: string, color: boolean): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  tex.anisotropy = 8
  return tex
}

function dress(material: THREE.MeshStandardMaterial, wobble: number, lift = 1, gamma = 1): THREE.MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWobble = { value: wobble }
    shader.uniforms.uLift = { value: lift }
    shader.uniforms.uGamma = { value: gamma }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vAo;\nuniform float uWobble;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float edge = 1.0 - abs(normal.y);
        float n = sin(ip.x * 13.1 + ip.z * 5.7) * uWobble;
        transformed.x += n * edge;
        transformed.z += sin(ip.z * 9.4 + ip.x * 3.1) * uWobble * edge;
        float top = smoothstep(0.25, 0.95, normal.y);
        vAo = mix(0.8, 1.16, top);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAo;\nuniform float uLift;\nuniform float uGamma;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(uGamma)) * uLift;`,
      )
      .replace('#include <dithering_fragment>', 'gl_FragColor.rgb *= vAo;\n#include <dithering_fragment>')
  }
  material.normalScale.set(1.15, 1.15)
  material.customProgramCacheKey = () => `underlord-${wobble}-${lift}-${gamma}`
  return material
}

export interface Surfaces {
  rock: THREE.MeshStandardMaterial
  brick: THREE.MeshStandardMaterial
  earth: THREE.MeshStandardMaterial
  gold: THREE.MeshStandardMaterial
  gem: THREE.MeshStandardMaterial
  floor: THREE.MeshStandardMaterial
  water: THREE.MeshStandardMaterial
  lava: THREE.MeshStandardMaterial
  wood: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
}

export function makeSurfaces(): Surfaces {
  const rockC = mapTex('/textures/rock_color.jpg', true)
  const rockN = mapTex('/textures/rock_normal.jpg', false)
  const rockR = mapTex('/textures/rock_rough.jpg', false)
  const earthC = mapTex('/textures/earth_color.jpg', true)
  const earthN = mapTex('/textures/earth_normal.jpg', false)
  const earthR = mapTex('/textures/earth_rough.jpg', false)
  const brickC = mapTex('/textures/brick_color.jpg', true)
  const brickN = mapTex('/textures/brick_normal.jpg', false)
  const brickR = mapTex('/textures/brick_rough.jpg', false)
  const floorC = mapTex('/textures/floor_color.jpg', true)
  const floorN = mapTex('/textures/floor_normal.jpg', false)
  const floorR = mapTex('/textures/floor_rough.jpg', false)
  const metalC = mapTex('/textures/metal_color.jpg', true)
  const metalN = mapTex('/textures/metal_normal.jpg', false)
  const metalR = mapTex('/textures/metal_rough.jpg', false)
  const metalM = mapTex('/textures/metal_metal.jpg', false)
  const std = (
    maps: { color?: THREE.Texture; normal?: THREE.Texture; rough?: THREE.Texture; metal?: THREE.Texture },
    extra: THREE.MeshStandardMaterialParameters,
    wobble: number,
    lift = 1,
    gamma = 1,
  ) => dress(new THREE.MeshStandardMaterial({
    map: maps.color,
    normalMap: maps.normal,
    roughnessMap: maps.rough,
    metalnessMap: maps.metal,
    roughness: extra.roughness ?? 1,
    metalness: extra.metalness ?? 0,
    ...extra,
  }), wobble, lift, gamma)
  return {
    rock: std({ color: rockC, normal: rockN, rough: rockR }, { roughness: 0.9, metalness: 0.04, color: 0xb7bcc6 }, 0.04, 1.22, 0.7),
    brick: std({ color: brickC, normal: brickN, rough: brickR }, { roughness: 0.78, metalness: 0.06, color: 0xb0b8c2 }, 0.01, 1.2, 0.75),
    earth: std({ color: earthC, normal: earthN, rough: earthR }, { roughness: 0.94, metalness: 0, color: 0x7a4a28 }, 0.03, 1.05, 0.85),
    gold: veinGold(rockC, rockN, rockR),
    gem: std({ color: rockC, normal: rockN, rough: rockR }, { roughness: 0.22, metalness: 0.2, color: 0xb8fff6, emissive: 0x5dfff0, emissiveIntensity: 1.6 }, 0.02, 1.4, 0.55),
    floor: std({ color: floorC, normal: floorN, rough: floorR }, { roughness: 0.86, metalness: 0.04, color: 0xd0ccc8 }, 0.004, 0.82, 0.92),
    water: std({ color: floorC }, { color: 0x1c5c92, roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.82, emissive: 0x062033, emissiveIntensity: 0.4 }, 0, 1.1, 0.85),
    lava: std({ color: earthC }, { color: 0xff6a1a, roughness: 0.45, metalness: 0.05, emissive: 0xff4a08, emissiveIntensity: 1.35 }, 0.02, 1.2, 0.8),
    wood: std({ color: earthC, normal: earthN, rough: earthR }, { color: 0xc08048, roughness: 0.8, metalness: 0 }, 0.01, 1.3, 0.7),
    metal: std({ color: metalC, normal: metalN, rough: metalR, metal: metalM }, { roughness: 0.4, metalness: 0.9, color: 0xd8dbe2 }, 0, 1.05, 0.9),
  }
}

function veinGold(color: THREE.Texture, normal: THREE.Texture, rough: THREE.Texture): THREE.MeshStandardMaterial {
  const material = dress(new THREE.MeshStandardMaterial({
    map: color,
    normalMap: normal,
    roughnessMap: rough,
    color: 0xd2cec6,
    roughness: 0.78,
    metalness: 0.22,
    emissive: 0x000000,
    emissiveIntensity: 0,
  }), 0.03, 1.25, 0.7)
  const prev = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      vec3 stone = vec3(0.3, 0.27, 0.24);
      float bands = abs(sin(vMapUv.x * 16.0) * sin(vMapUv.y * 9.0));
      float seam = smoothstep(0.38, 0.04, bands);
      float speck = step(0.9, fract(sin(dot(floor(vMapUv * vec2(28.0, 18.0)), vec2(127.1, 311.7))) * 43758.5));
      float gold = clamp(seam + speck * 0.8, 0.0, 1.0);
      diffuseColor.rgb = mix(stone, vec3(0.95, 0.62, 0.1), gold);
      totalEmissiveRadiance += vec3(0.45, 0.22, 0.03) * (seam + speck);`,
    )
  }
  material.customProgramCacheKey = () => 'underlord-gold-vein'
  return material
}

export function block(height: number, radius: number): RoundedBoxGeometry {
  const r = Math.min(radius, height * 0.35, 0.12)
  return new RoundedBoxGeometry(0.96, height, 0.96, 2, r)
}

export function environment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  return env
}

const GradeShader: THREE.ShaderMaterialParameters & { uniforms: { tDiffuse: { value: THREE.Texture | null } } } = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 p = vUv * 2.0 - 1.0;
      float vig = smoothstep(1.45, 0.35, dot(p, p));
      vec3 col = max(c.rgb, 0.0);
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      float shade = smoothstep(0.16, 0.0, luma);
      col = mix(col, col * vec3(0.9, 0.95, 1.08), shade * 0.28);
      float hot = smoothstep(0.55, 0.95, luma);
      col = mix(col, col * vec3(1.06, 0.96, 0.82), hot * 0.22);
      col *= mix(0.92, 1.0, vig);
      gl_FragColor = vec4(col, c.a);
    }
  `,
}

export interface Stage {
  composer: EffectComposer
  bloom: UnrealBloomPass
}

export function makeStage(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, quality: Quality): Stage {
  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(renderer.getPixelRatio())
  composer.addPass(new RenderPass(scene, camera))
  if (quality === 'high') {
    const ssao = new SSAOPass(scene, camera, 512, 512)
    ssao.kernelRadius = 8
    ssao.minDistance = 0.002
    ssao.maxDistance = 0.18
    composer.addPass(ssao)
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), quality === 'low' ? 0.02 : quality === 'high' ? 0.12 : 0.07, 0.28, 0.98)
  composer.addPass(bloom)
  composer.addPass(new ShaderPass(GradeShader))
  composer.addPass(new OutputPass())
  return { composer, bloom }
}

export class Particles {
  readonly points: THREE.Points
  private pos: Float32Array
  private vel: Float32Array
  private life: Float32Array
  private col: Float32Array
  private n: number
  private cursor = 0

  constructor(count: number) {
    this.n = count
    this.pos = new Float32Array(count * 3)
    this.vel = new Float32Array(count * 3)
    this.life = new Float32Array(count)
    this.col = new Float32Array(count * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3))
    const mat = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.9 })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
  }

  burst(x: number, y: number, z: number, color: number, count: number, speed = 1.4): void {
    const c = new THREE.Color(color)
    for (let i = 0; i < count; i++) {
      const k = this.cursor
      this.cursor = (this.cursor + 1) % this.n
      this.pos[k * 3] = x
      this.pos[k * 3 + 1] = y
      this.pos[k * 3 + 2] = z
      this.vel[k * 3] = (Math.random() - 0.5) * speed
      this.vel[k * 3 + 1] = Math.random() * speed * 0.8
      this.vel[k * 3 + 2] = (Math.random() - 0.5) * speed
      this.life[k] = 0.35 + Math.random() * 0.45
      this.col[k * 3] = c.r
      this.col[k * 3 + 1] = c.g
      this.col[k * 3 + 2] = c.b
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -10
        continue
      }
      this.life[i] -= dt
      this.vel[i * 3 + 1] -= 3.2 * dt
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
    }
    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const colors = this.points.geometry.getAttribute('color') as THREE.BufferAttribute
    attr.needsUpdate = true
    colors.needsUpdate = true
  }
}

export interface Claw {
  group: THREE.Group
  fingers: THREE.Object3D[]
  knuckles: THREE.Object3D[]
  thumb: THREE.Object3D
}

export function buildClaw(): Claw {
  const group = new THREE.Group()
  const skin = new THREE.MeshStandardMaterial({ color: 0x9a4038, roughness: 0.5, metalness: 0.14, emissive: 0x5a2218, emissiveIntensity: 0.85 })
  const nail = new THREE.MeshStandardMaterial({ color: 0xf2e6d0, roughness: 0.24, metalness: 0.35, emissive: 0x6a5840, emissiveIntensity: 0.35 })
  const cuff = new THREE.MeshStandardMaterial({ color: 0x2a2c34, roughness: 0.42, metalness: 0.55, emissive: 0x12141a, emissiveIntensity: 0.25 })
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), skin)
  palm.scale.set(1.25, 0.48, 1.45)
  palm.position.set(0, 0.02, 0.02)
  group.add(palm)
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.28, 8), cuff)
  wrist.rotation.x = Math.PI / 2
  wrist.position.set(0, 0, -0.42)
  group.add(wrist)
  const fingers: THREE.Object3D[] = []
  const knuckles: THREE.Object3D[] = []
  for (let i = 0; i < 3; i++) {
    const root = new THREE.Group()
    root.position.set(-0.24 + i * 0.24, 0.05, 0.38)
    root.rotation.y = (i - 1) * 0.38
    const prox = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.2, 4, 6), skin)
    prox.rotation.x = Math.PI / 2
    prox.position.z = 0.14
    root.add(prox)
    const mid = new THREE.Group()
    mid.position.z = 0.28
    const bone = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.12, 3, 6), skin)
    bone.rotation.x = Math.PI / 2
    bone.position.z = 0.08
    mid.add(bone)
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.11, 5), nail)
    claw.rotation.x = Math.PI / 2
    claw.position.z = 0.18
    mid.add(claw)
    root.add(mid)
    group.add(root)
    fingers.push(root)
    knuckles.push(mid)
  }
  const thumb = new THREE.Group()
  thumb.position.set(-0.48, 0.02, 0.05)
  const tbone = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.18, 3, 6), skin)
  tbone.rotation.z = Math.PI / 2
  tbone.position.x = -0.12
  thumb.add(tbone)
  const tclaw = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.12, 5), nail)
  tclaw.rotation.z = Math.PI / 2
  tclaw.position.x = -0.28
  thumb.add(tclaw)
  group.add(thumb)
  group.scale.setScalar(1.85)
  group.traverse((obj) => { obj.frustumCulled = false; obj.castShadow = true })
  return { group, fingers, knuckles, thumb }
}

export function poseClaw(claw: Claw, time: number, holding: number, slapping: boolean): void {
  const curl = slapping ? 0.2 : holding > 0 ? 0.95 : 0.18 + Math.sin(time * 2.1) * 0.05
  const tip = slapping ? 0.1 : holding > 0 ? 1.05 : 0.35
  claw.fingers.forEach((finger, i) => {
    finger.rotation.x = curl + (i - 1.5) * 0.02
  })
  claw.knuckles.forEach((knuckle, i) => {
    knuckle.rotation.x = tip + Math.sin(time * 3 + i) * (holding ? 0.02 : 0.04)
  })
  claw.thumb.rotation.y = holding ? 0.85 : 0.25
  claw.thumb.rotation.z = holding ? 0.4 : 0.1
}
