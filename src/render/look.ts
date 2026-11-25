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

function dress(material: THREE.MeshStandardMaterial, wobble: number): THREE.MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWobble = { value: wobble }
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
        vAo = mix(0.55, 1.0, smoothstep(-0.55, 0.45, transformed.y));`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAo;')
      .replace('#include <dithering_fragment>', 'gl_FragColor.rgb *= mix(0.72, 1.0, vAo);\n#include <dithering_fragment>')
  }
  material.normalScale.set(1.15, 1.15)
  material.customProgramCacheKey = () => `underlord-${wobble}`
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
  const std = (maps: { color?: THREE.Texture; normal?: THREE.Texture; rough?: THREE.Texture; metal?: THREE.Texture }, extra: THREE.MeshStandardMaterialParameters, wobble: number) => dress(new THREE.MeshStandardMaterial({
    map: maps.color,
    normalMap: maps.normal,
    roughnessMap: maps.rough,
    metalnessMap: maps.metal,
    roughness: extra.roughness ?? 1,
    metalness: extra.metalness ?? 0,
    ...extra,
  }), wobble)
  return {
    rock: std({ color: rockC, normal: rockN, rough: rockR }, { roughness: 0.92, metalness: 0.04, color: 0xb7aea4 }, 0.045),
    brick: std({ color: brickC, normal: brickN, rough: brickR }, { roughness: 0.78, metalness: 0.06, color: 0xd5d8df }, 0.012),
    earth: std({ color: earthC, normal: earthN, rough: earthR }, { roughness: 1, metalness: 0, color: 0xc4a07a }, 0.03),
    gold: std({ color: metalC, normal: metalN, rough: metalR, metal: metalM }, { roughness: 0.32, metalness: 1, color: 0xffc14a, emissive: 0x5a3200, emissiveIntensity: 0.35 }, 0.02),
    gem: std({ color: rockC, normal: rockN, rough: rockR }, { roughness: 0.18, metalness: 0.15, color: 0x7dfff0, emissive: 0x0cffe0, emissiveIntensity: 0.85 }, 0.02),
    floor: std({ color: floorC, normal: floorN, rough: floorR }, { roughness: 0.86, metalness: 0.02 }, 0.008),
    water: std({ color: floorC }, { color: 0x1c5c92, roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.82, emissive: 0x062033, emissiveIntensity: 0.4 }, 0),
    lava: std({ color: earthC }, { color: 0xff6a1a, roughness: 0.45, metalness: 0.05, emissive: 0xff4a08, emissiveIntensity: 1.35 }, 0.02),
    wood: std({ color: earthC, normal: earthN, rough: earthR }, { color: 0x8a5a32, roughness: 0.8, metalness: 0 }, 0.01),
    metal: std({ color: metalC, normal: metalN, rough: metalR, metal: metalM }, { roughness: 0.4, metalness: 0.9, color: 0xd8dbe2 }, 0),
  }
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
      float vig = smoothstep(1.28, 0.28, dot(p, p));
      vec3 col = c.rgb;
      col = pow(max(col, 0.0), vec3(0.94));
      col = mix(col, col * vec3(1.08, 0.9, 0.74) + vec3(0.02, 0.0, 0.0), 0.42);
      float lift = smoothstep(0.45, 0.0, max(col.r, max(col.g, col.b)));
      col += vec3(0.015, 0.02, 0.04) * lift;
      col *= mix(0.62, 1.0, vig);
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), quality === 'low' ? 0.05 : quality === 'high' ? 0.42 : 0.28, 0.45, 0.84)
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
  thumb: THREE.Object3D
}

export function buildClaw(): Claw {
  const group = new THREE.Group()
  const skin = new THREE.MeshStandardMaterial({ color: 0xc43a2c, roughness: 0.55, metalness: 0.08 })
  const nail = new THREE.MeshStandardMaterial({ color: 0xf2d2b0, roughness: 0.35, metalness: 0.2 })
  const cuff = new THREE.MeshStandardMaterial({ color: 0x2a0c12, roughness: 0.7, metalness: 0.15 })
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), skin)
  palm.scale.set(1.35, 0.62, 1.05)
  group.add(palm)
  const wrist = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.22, 4, 8), cuff)
  wrist.rotation.x = Math.PI / 2
  wrist.position.z = -0.32
  group.add(wrist)
  const fingers: THREE.Object3D[] = []
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group()
    f.position.set(-0.22 + i * 0.15, 0.02, 0.22)
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.28, 3, 6), skin)
    seg.rotation.x = Math.PI / 2
    seg.position.z = 0.16
    f.add(seg)
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 5), nail)
    claw.rotation.x = Math.PI / 2
    claw.position.z = 0.36
    f.add(claw)
    group.add(f)
    fingers.push(f)
  }
  const thumb = new THREE.Group()
  thumb.position.set(-0.34, -0.02, 0.05)
  const tseg = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.22, 3, 6), skin)
  tseg.rotation.z = Math.PI / 2
  tseg.position.x = -0.12
  thumb.add(tseg)
  const tclaw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), nail)
  tclaw.rotation.z = Math.PI / 2
  tclaw.position.x = -0.28
  thumb.add(tclaw)
  group.add(thumb)
  group.scale.setScalar(1.35)
  group.traverse((obj) => { obj.frustumCulled = false; obj.castShadow = true })
  return { group, fingers, thumb }
}

export function poseClaw(claw: Claw, time: number, holding: number, slapping: boolean): void {
  const curl = slapping ? -0.15 : holding > 0 ? -1.05 : -0.35 + Math.sin(time * 2.2) * 0.08
  claw.fingers.forEach((f, i) => {
    f.rotation.x = curl + Math.sin(time * 3 + i) * (holding ? 0.02 : 0.05)
  })
  claw.thumb.rotation.z = holding ? 0.7 : 0.25 + Math.sin(time * 2) * 0.05
  if (slapping) claw.fingers.forEach((f) => { f.rotation.x = 0.35 })
}
