import '@fontsource-variable/inter'
import './style.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const R = 0.11
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
const MOBILE = matchMedia('(max-width: 640px)')
const ACCENT = new THREE.Color('#c8ff45')

// ------------------------------------------------------------ render
const canvas = document.querySelector('#escena')
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
})
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE.matches ? 1.5 : 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.AgXToneMapping
renderer.toneMappingExposure = 1.15
renderer.outputColorSpace = THREE.SRGBColorSpace

const scene = new THREE.Scene()
scene.background = new THREE.Color('#030b09')
scene.fog = new THREE.FogExp2('#06120e', 0.0065)

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 700)

// Cielo degradado: da profundidad sin cargar otra textura.
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(320, 32, 18),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color('#020708') },
      horizonColor: { value: new THREE.Color('#183329') },
    },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vPos; uniform vec3 topColor; uniform vec3 horizonColor; void main(){ float h = smoothstep(-0.1, 0.55, normalize(vPos).y); gl_FragColor = vec4(mix(horizonColor, topColor, h), 1.0); }`,
  }),
)
scene.add(sky)

scene.add(new THREE.HemisphereLight('#9fb9c8', '#102511', 1.65))
const sun = new THREE.DirectionalLight('#d8e8ff', 3.7)
sun.castShadow = true
sun.shadow.mapSize.set(MOBILE.matches ? 1024 : 2048, MOBILE.matches ? 1024 : 2048)
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 220 })
sun.shadow.bias = -0.00035
sun.shadow.normalBias = 0.025
const SUN_OFFSET = new THREE.Vector3(-0.5, 1, 0.35).normalize().multiplyScalar(90)
scene.add(sun, sun.target)

// ------------------------------------------------------------ estadio procedural
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(260, 96),
  new THREE.MeshStandardMaterial({ color: '#07170f', roughness: 1 }),
)
ground.rotation.x = -Math.PI / 2
ground.position.y = -0.045
ground.receiveShadow = true
scene.add(ground)

// Microrelieve generado en el navegador. Se reutiliza como bump map sobre la
// textura horneada de Blender para que el césped responda a los focos de cerca.
function makeGrassBump() {
  const size = 192
  const surface = document.createElement('canvas')
  surface.width = surface.height = size
  const ctx = surface.getContext('2d')
  ctx.fillStyle = '#777'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 4800; i++) {
    const value = 65 + Math.floor(Math.random() * 125)
    ctx.strokeStyle = `rgb(${value},${value},${value})`
    ctx.globalAlpha = 0.28 + Math.random() * 0.38
    ctx.lineWidth = Math.random() < 0.82 ? 0.45 : 0.8
    const x = Math.random() * size
    const y = Math.random() * size
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (Math.random() - 0.5) * 1.5, y - 2 - Math.random() * 5)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  const texture = new THREE.CanvasTexture(surface)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(74, 48)
  texture.colorSpace = THREE.NoColorSpace
  return texture
}
const grassBump = makeGrassBump()
const grassAlbedo = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/cesped-realista-v2.jpg`)
grassAlbedo.wrapS = grassAlbedo.wrapT = THREE.MirroredRepeatWrapping
grassAlbedo.repeat.set(18, 12)
grassAlbedo.colorSpace = THREE.SRGBColorSpace
grassAlbedo.anisotropy = 8

// Briznas geométricas instanciadas: un solo draw call y detalle visible en
// los planos bajos, sin penalizar el desplazamiento en móvil.
const bladeCount = MOBILE.matches ? 2800 : 7000
const bladeGeometry = new THREE.ConeGeometry(0.0045, 0.052, 3, 1)
const bladeMaterial = new THREE.MeshStandardMaterial({ color: '#3b7740', roughness: 1, vertexColors: true })
const blades = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, bladeCount)
const bladeMatrix = new THREE.Matrix4()
const bladeQuaternion = new THREE.Quaternion()
const bladeScale = new THREE.Vector3()
const bladeColor = new THREE.Color()
const bladeUp = new THREE.Vector3(0, 1, 0)
const rand = (i, seed) => {
  const value = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453
  return value - Math.floor(value)
}
for (let i = 0; i < bladeCount; i++) {
  const x = (rand(i, 1) - 0.5) * 104
  const z = (rand(i, 2) - 0.5) * 67
  const height = 0.65 + rand(i, 3) * 0.72
  bladeQuaternion.setFromAxisAngle(bladeUp, rand(i, 4) * Math.PI * 2)
  bladeScale.set(0.75 + rand(i, 5) * 0.6, height, 0.75 + rand(i, 6) * 0.6)
  bladeMatrix.compose(new THREE.Vector3(x, 0.026 * height, z), bladeQuaternion, bladeScale)
  blades.setMatrixAt(i, bladeMatrix)
  bladeColor.setHSL(0.29 + rand(i, 7) * 0.035, 0.42 + rand(i, 8) * 0.2, 0.3 + rand(i, 9) * 0.1)
  blades.setColorAt(i, bladeColor)
}
blades.instanceMatrix.needsUpdate = true
if (blades.instanceColor) blades.instanceColor.needsUpdate = true
blades.receiveShadow = true
scene.add(blades)

const standDark = new THREE.MeshStandardMaterial({ color: '#101a18', roughness: 0.92 })
const standMid = new THREE.MeshStandardMaterial({ color: '#17251f', roughness: 0.88 })
const ledMat = new THREE.MeshStandardMaterial({ color: '#4a6b28', emissive: '#a8ee36', emissiveIntensity: 2.4 })
const metalMat = new THREE.MeshStandardMaterial({ color: '#596762', metalness: 0.72, roughness: 0.32 })
const lampMat = new THREE.MeshBasicMaterial({ color: '#eaf7ff', toneMapped: false })

function box(size, position, material, rotationY = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...position)
  mesh.rotation.y = rotationY
  mesh.receiveShadow = true
  mesh.castShadow = true
  scene.add(mesh)
  return mesh
}

// Gradas escalonadas: geometría simple, pero suficiente para cerrar el campo.
for (const side of [-1, 1]) {
  for (let tier = 0; tier < 5; tier++) {
    box([128, 1.65 + tier * 0.2, 4.7], [0, 0.75 + tier * 1.45, side * (44 + tier * 3.1)], tier % 2 ? standMid : standDark)
  }
  box([124, 0.32, 0.34], [0, 2.15, side * 42.3], ledMat)
}
for (const end of [-1, 1]) {
  for (let tier = 0; tier < 5; tier++) {
    box([4.7, 1.65 + tier * 0.2, 88], [end * (61 + tier * 3.1), 0.75 + tier * 1.45, 0], tier % 2 ? standMid : standDark)
  }
  box([0.34, 0.32, 84], [end * 59.3, 2.15, 0], ledMat)
}

// Público abstracto instanciado: da escala sin multiplicar llamadas de render.
const crowdGeometry = new THREE.BoxGeometry(0.42, 0.42, 0.42)
const crowdMaterial = new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true })
const crowdCount = 1560
const crowd = new THREE.InstancedMesh(crowdGeometry, crowdMaterial, crowdCount)
const crowdMatrix = new THREE.Matrix4()
const crowdColor = new THREE.Color()
const crowdPalette = ['#d9e0d8', '#9db29d', '#384d43', '#b6e34b', '#73817a']
let crowdIndex = 0
for (const side of [-1, 1]) {
  for (let row = 0; row < 6; row++) {
    for (let i = 0; i < 80; i++) {
      const x = -57.3 + i * 1.45
      const z = side * (44 + row * 2.5)
      const y = 1.65 + row * 1.2 + Math.sin(i * 2.17 + row) * 0.12
      crowdMatrix.makeTranslation(x, y, z)
      crowd.setMatrixAt(crowdIndex, crowdMatrix)
      crowdColor.set(crowdPalette[(i * 7 + row * 3) % crowdPalette.length])
      crowd.setColorAt(crowdIndex++, crowdColor)
    }
  }
}
for (const end of [-1, 1]) {
  for (let row = 0; row < 6; row++) {
    for (let i = 0; i < 50; i++) {
      const x = end * (61 + row * 2.5)
      const z = -39.2 + i * 1.6
      const y = 1.65 + row * 1.2 + Math.cos(i * 1.73 + row) * 0.12
      crowdMatrix.makeTranslation(x, y, z)
      crowd.setMatrixAt(crowdIndex, crowdMatrix)
      crowdColor.set(crowdPalette[(i * 5 + row * 2 + 1) % crowdPalette.length])
      crowd.setColorAt(crowdIndex++, crowdColor)
    }
  }
}
crowd.instanceMatrix.needsUpdate = true
if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true
scene.add(crowd)

// Torres de iluminación.
const poleGeometry = new THREE.CylinderGeometry(0.13, 0.22, 24, 8)
const panelGeometry = new THREE.BoxGeometry(7.2, 2.1, 0.28)
for (const x of [-48, 48]) {
  for (const z of [-43, 43]) {
    const pole = new THREE.Mesh(poleGeometry, metalMat)
    pole.position.set(x, 12, z)
    scene.add(pole)
    const panel = new THREE.Mesh(panelGeometry, lampMat)
    panel.position.set(x, 24, z)
    panel.lookAt(0, 0, 0)
    scene.add(panel)
    const light = new THREE.PointLight('#dbeeff', 170, 92, 1.7)
    light.position.set(x, 23, z)
    scene.add(light)
  }
}

// ------------------------------------------------------------ jugada
// Coordenadas Blender (x, y, z) -> Three.js (x, z, -y).
const B = (x, y, h = 0) => new THREE.Vector3(x, R + h, -y)
const path = new THREE.CatmullRomCurve3([
  B(0, 0), B(4, -2, 0.12), B(10, -7, 0.62), B(16, -12, 0), // primer pase
  B(20, -16, 0.08), B(27, -22, 0.52), B(35, -27, 0),       // pase a la banda
  B(40, -27), B(45, -22), B(44, -14), B(42, -6),             // conducción y recorte
  B(46, -3.5, 0.8), B(50, -0.5, 1.7), B(53.3, 2.4, 2.0),
  B(54.1, 2.7, 0.6), B(54.4, 2.8, 0),
], false, 'centripetal')

const STEPS = 2400
const UP = new THREE.Vector3(0, 1, 0)
const rolls = [new THREE.Quaternion()]
{
  let prev = path.getPointAt(0)
  const d = new THREE.Vector3(), axis = new THREE.Vector3(), q = new THREE.Quaternion()
  for (let i = 1; i <= STEPS; i++) {
    const p = path.getPointAt(i / STEPS)
    d.subVectors(p, prev).setY(0)
    const next = rolls[i - 1].clone()
    const dist = d.length()
    if (dist > 1e-6) {
      axis.crossVectors(UP, d).normalize()
      next.premultiply(q.setFromAxisAngle(axis, dist / R))
    }
    rolls.push(next)
    prev = p
  }
}

// Rastro sutil para que el recorrido se lea incluso en planos amplios.
const trailPoints = path.getPoints(220)
const trailGeometry = new THREE.BufferGeometry().setFromPoints(trailPoints)
trailGeometry.setDrawRange(0, 0)
const trail = new THREE.Line(
  trailGeometry,
  new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }),
)
scene.add(trail)

// ------------------------------------------------------------ futbolistas
// Futbolistas articulados con proporciones humanas, dos segmentos por
// extremidad, equipación completa y dorsales legibles en planos cercanos.
const skinMaterials = ['#955737', '#d7986b', '#6b3d2c'].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.74 }))
const hairMaterials = ['#15110e', '#3b261a', '#241a16'].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.92 }))
const bootMaterial = new THREE.MeshStandardMaterial({ color: '#070b09', metalness: 0.05, roughness: 0.36 })
const homeJersey = new THREE.MeshStandardMaterial({ color: '#c8ff45', roughness: 0.58 })
const homeShorts = new THREE.MeshStandardMaterial({ color: '#0a1812', roughness: 0.76 })
const homeSocks = new THREE.MeshStandardMaterial({ color: '#b7ee37', roughness: 0.78 })
const awayJersey = new THREE.MeshStandardMaterial({ color: '#f0f3f1', roughness: 0.6 })
const awayShorts = new THREE.MeshStandardMaterial({ color: '#ad302c', roughness: 0.75 })
const awaySocks = new THREE.MeshStandardMaterial({ color: '#f2f4f3', roughness: 0.78 })
const keeperJersey = new THREE.MeshStandardMaterial({ color: '#2d7fe8', emissive: '#0c2d5f', emissiveIntensity: 0.22, roughness: 0.56 })
const keeperShorts = new THREE.MeshStandardMaterial({ color: '#132745', roughness: 0.74 })
const keeperSocks = new THREE.MeshStandardMaterial({ color: '#245b9c', roughness: 0.78 })

function playerPart(geometry, material, position, parent, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(...position)
  if (rotation) mesh.rotation.set(...rotation)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function numberMaterial(number, color) {
  const surface = document.createElement('canvas')
  surface.width = 64
  surface.height = 80
  const ctx = surface.getContext('2d')
  ctx.clearRect(0, 0, 64, 80)
  ctx.fillStyle = color
  ctx.font = '900 58px Inter, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(number), 32, 42)
  const map = new THREE.CanvasTexture(surface)
  map.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false })
}

function createPlayer(jersey, shorts, socks, skinIndex = 0, number = 10, numberColor = '#101d12') {
  const root = new THREE.Group()
  const skin = skinMaterials[skinIndex % skinMaterials.length]
  const hair = hairMaterials[skinIndex % hairMaterials.length]

  const torso = new THREE.Group()
  torso.position.y = 0.94
  root.add(torso)
  playerPart(new THREE.CylinderGeometry(0.275, 0.195, 0.57, 12), jersey, [0, 0.31, 0], torso)
  playerPart(new THREE.CylinderGeometry(0.075, 0.082, 0.09, 10), skin, [0, 0.64, 0], torso)
  playerPart(new THREE.BoxGeometry(0.43, 0.24, 0.3), shorts, [0, -0.05, 0], torso)

  // Hombros redondeados y mangas separadas evitan la silueta de cápsula.
  for (const side of [-1, 1]) {
    playerPart(new THREE.SphereGeometry(0.125, 10, 7), jersey, [side * 0.255, 0.51, 0], torso)
    playerPart(new THREE.CylinderGeometry(0.094, 0.084, 0.16, 9), jersey, [side * 0.285, 0.4, 0], torso, [0, 0, side * 0.1])
  }

  const head = new THREE.Group()
  head.position.set(0, 0.86, 0)
  torso.add(head)
  const skull = playerPart(new THREE.SphereGeometry(0.165, 16, 11), skin, [0, 0, 0], head)
  skull.scale.set(0.91, 1.08, 0.93)
  const hairCap = playerPart(new THREE.SphereGeometry(0.168, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, [0, 0.055, 0], head)
  hairCap.scale.set(0.94, 0.78, 0.96)
  playerPart(new THREE.SphereGeometry(0.032, 8, 6), skin, [0, 0, 0.158], head).scale.set(0.72, 0.72, 1.15)
  for (const side of [-1, 1]) playerPart(new THREE.SphereGeometry(0.025, 7, 5), skin, [side * 0.158, 0, 0], head)

  const dorsalMaterial = numberMaterial(number, numberColor)
  playerPart(new THREE.PlaneGeometry(0.18, 0.23), dorsalMaterial, [0, 0.33, 0.254], torso)
  playerPart(new THREE.PlaneGeometry(0.18, 0.23), dorsalMaterial, [0, 0.33, -0.254], torso, [0, Math.PI, 0])

  const makeLeg = (side) => {
    const thigh = new THREE.Group()
    thigh.position.set(side * 0.13, -0.14, 0)
    torso.add(thigh)
    playerPart(new THREE.CylinderGeometry(0.073, 0.085, 0.42, 10), skin, [0, -0.21, 0], thigh)
    playerPart(new THREE.CylinderGeometry(0.097, 0.082, 0.2, 10), shorts, [0, -0.08, 0], thigh)

    const knee = new THREE.Group()
    knee.position.y = -0.42
    thigh.add(knee)
    playerPart(new THREE.SphereGeometry(0.068, 9, 7), skin, [0, 0, 0], knee)
    playerPart(new THREE.CylinderGeometry(0.052, 0.066, 0.37, 9), socks, [0, -0.205, 0], knee)
    const foot = playerPart(new THREE.BoxGeometry(0.13, 0.085, 0.29), bootMaterial, [0, -0.42, 0.085], knee)
    foot.geometry.translate(0, 0, 0.025)
    return { thigh, knee, foot }
  }

  const makeArm = (side) => {
    const upper = new THREE.Group()
    upper.position.set(side * 0.31, 0.48, 0)
    torso.add(upper)
    playerPart(new THREE.CylinderGeometry(0.052, 0.064, 0.31, 9), skin, [0, -0.17, 0], upper)

    const elbow = new THREE.Group()
    elbow.position.y = -0.32
    upper.add(elbow)
    playerPart(new THREE.SphereGeometry(0.052, 8, 6), skin, [0, 0, 0], elbow)
    playerPart(new THREE.CylinderGeometry(0.043, 0.052, 0.28, 9), skin, [0, -0.15, 0], elbow)
    playerPart(new THREE.SphereGeometry(0.056, 8, 6), skin, [0, -0.31, 0], elbow).scale.set(0.82, 1.08, 0.82)
    upper.rotation.z = side * -0.13
    elbow.rotation.x = -0.5
    return { upper, elbow }
  }

  root.userData.torso = torso
  root.userData.head = head
  root.userData.leftLeg = makeLeg(-1)
  root.userData.rightLeg = makeLeg(1)
  root.userData.leftArm = makeArm(-1)
  root.userData.rightArm = makeArm(1)
  root.userData.phase = Math.random() * Math.PI * 2
  root.scale.setScalar(0.96 + Math.random() * 0.065)
  scene.add(root)
  return root
}

const F = (x, y) => new THREE.Vector3(x, 0, -y)
const route = (...keys) => keys.map(([t, x, y]) => ({ t, point: F(x, y) }))
const footballers = [
  { root: createPlayer(homeJersey, homeShorts, homeSocks, 0, 6), kick: 0.115, path: route([0, 0, 0], [.24, 7, -4], [.55, 14, -6], [1, 15, -5]) },
  { root: createPlayer(homeJersey, homeShorts, homeSocks, 1, 8), kick: 0.315, path: route([0, 14, -12], [.22, 16, -12], [.46, 25, -21], [.64, 34, -21], [1, 38, -18]) },
  { root: createPlayer(homeJersey, homeShorts, homeSocks, 2, 11), kick: 0.815, path: route([0, 33, -27], [.43, 34, -27], [.58, 39, -26], [.73, 44, -14], [.82, 43, -6], [.94, 48, 1], [1, 49, 2]) },
  { root: createPlayer(homeJersey, homeShorts, homeSocks, 1, 10), path: route([0, 7, 13], [.42, 19, 5], [.7, 35, 1], [1, 43, 6]) },
  { root: createPlayer(awayJersey, awayShorts, awaySocks, 2, 4, '#9d2825'), path: route([0, 12, -4], [.3, 21, -11], [.62, 34, -12], [1, 43, -5]) },
  { root: createPlayer(awayJersey, awayShorts, awaySocks, 0, 5, '#9d2825'), path: route([0, 24, -23], [.36, 29, -22], [.68, 41, -19], [1, 46, -9]) },
  { root: createPlayer(awayJersey, awayShorts, awaySocks, 1, 3, '#9d2825'), path: route([0, 36, -5], [.5, 38, -5], [.76, 44, -7], [1, 49, -2]) },
  { root: createPlayer(awayJersey, awayShorts, awaySocks, 0, 2, '#9d2825'), path: route([0, 30, 9], [.55, 37, 8], [.78, 44, 5], [1, 47, 4]) },
]
const goalkeeper = createPlayer(keeperJersey, keeperShorts, keeperSocks, 1, 1, '#ffffff')
goalkeeper.position.copy(F(52.05, 0))
goalkeeper.rotation.y = -Math.PI / 2

function samplePlayerRoute(keys, t, out) {
  if (t <= keys[0].t) return out.copy(keys[0].point)
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1]
    if (t <= b.t) {
      const amount = smooth((t - a.t) / (b.t - a.t))
      return out.lerpVectors(a.point, b.point, amount)
    }
  }
  return out.copy(keys.at(-1).point)
}

const playerPosition = new THREE.Vector3()
const playerAhead = new THREE.Vector3()
function updateFootballers(t) {
  footballers.forEach((footballer, index) => {
    const { root, path: keys, kick } = footballer
    const rig = root.userData
    samplePlayerRoute(keys, t, playerPosition)
    samplePlayerRoute(keys, Math.min(1, t + 0.004), playerAhead)
    root.position.copy(playerPosition)
    const step = playerAhead.distanceTo(playerPosition)
    if (step > 0.0001) root.lookAt(playerAhead.x, root.position.y, playerAhead.z)

    const activity = THREE.MathUtils.clamp(step * 230, 0, 1)
    const cycle = t * 112 + rig.phase
    const stride = Math.sin(cycle) * 0.68 * activity
    const leftRecovery = Math.max(0, Math.sin(cycle + Math.PI * 0.15)) * activity
    const rightRecovery = Math.max(0, Math.sin(cycle + Math.PI * 1.15)) * activity

    rig.leftLeg.thigh.rotation.x = stride
    rig.rightLeg.thigh.rotation.x = -stride
    rig.leftLeg.knee.rotation.x = leftRecovery * 0.92
    rig.rightLeg.knee.rotation.x = rightRecovery * 0.92

    rig.leftArm.upper.rotation.x = -stride * 0.82
    rig.rightArm.upper.rotation.x = stride * 0.82
    rig.leftArm.elbow.rotation.x = -0.58 - Math.abs(stride) * 0.32
    rig.rightArm.elbow.rotation.x = -0.58 - Math.abs(stride) * 0.32

    rig.torso.position.y = 0.94 + Math.abs(Math.sin(cycle * 2)) * 0.025 * activity
    rig.torso.rotation.x = 0.075 * activity
    rig.torso.rotation.z = Math.sin(cycle) * 0.035 * activity
    rig.head.rotation.y = Math.sin(t * 19 + index) * 0.08

    if (kick != null) {
      const kickWindow = Math.max(0, 1 - Math.abs(t - kick) / 0.044)
      const kickAmount = Math.sin(kickWindow * Math.PI * 0.5)
      rig.rightLeg.thigh.rotation.x = -kickAmount * 1.08
      rig.rightLeg.knee.rotation.x = (1 - kickAmount) * 0.72
      rig.leftLeg.thigh.rotation.x = kickAmount * 0.18
      rig.leftLeg.knee.rotation.x = kickAmount * 0.12
      rig.leftArm.upper.rotation.z = 0.13 + kickAmount * 0.48
      rig.rightArm.upper.rotation.z = -0.13 - kickAmount * 0.48
      rig.torso.rotation.x += kickAmount * 0.13
      rig.torso.rotation.z += kickAmount * 0.08
    } else {
      rig.leftArm.upper.rotation.z = 0.13
      rig.rightArm.upper.rotation.z = -0.13
    }
  })

  const dive = smooth((t - 0.84) / 0.12)
  goalkeeper.position.set(52.05, Math.sin(dive * Math.PI) * 0.42, THREE.MathUtils.lerp(0, -2.2, dive))
  goalkeeper.rotation.set(dive * 1.17, -Math.PI / 2, 0)
  const keeperReady = Math.sin(t * 70) * 0.14 * (1 - dive)
  const keeperRig = goalkeeper.userData
  keeperRig.torso.rotation.x = -dive * 0.16
  keeperRig.leftLeg.thigh.rotation.x = keeperReady + dive * 0.32
  keeperRig.rightLeg.thigh.rotation.x = -keeperReady - dive * 0.38
  keeperRig.leftLeg.knee.rotation.x = dive * 0.5
  keeperRig.rightLeg.knee.rotation.x = dive * 0.72
  keeperRig.leftArm.upper.rotation.z = -0.38 - dive * 1.18
  keeperRig.rightArm.upper.rotation.z = 0.38 + dive * 1.18
  keeperRig.leftArm.upper.rotation.x = -dive * 0.26
  keeperRig.rightArm.upper.rotation.x = dive * 0.26
  keeperRig.leftArm.elbow.rotation.x = -0.45 * (1 - dive)
  keeperRig.rightArm.elbow.rotation.x = -0.45 * (1 - dive)
}

const BALL_TIMELINE = [
  [0, 0], [0.1, 0],
  [0.28, 0.24], [0.32, 0.25],       // control del interior
  [0.48, 0.48], [0.52, 0.49],       // control del extremo
  [0.72, 0.76], [0.8, 0.78],        // recorte y preparación
  [0.95, 1], [1, 1],
]
const SHOTS = [
  { t: 0.0, pos: [18, 48, 74], look: [8, 0, 0] },
  { t: 0.16, pos: [-6.2, 2.6, -5.6], look: [4.5, -0.25, 1], follow: true },
  { t: 0.42, pos: [-6.5, 2.1, -4.6], look: [5, -0.25, 1.4], follow: true },
  { t: 0.64, pos: [-5.2, 1.65, -4.1], look: [5.5, 0, 1], follow: true },
  { t: 0.8, pos: [37, 3.1, 9.5], look: [52.5, 1.35, 0] },
  { t: 1.0, pos: [45.5, 1.8, 6.5], look: [53.3, 0.75, -3.6] },
]

const smooth = (x) => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x) }
const lerpTable = (table, t) => {
  for (let i = 0; i < table.length - 1; i++) {
    const [t0, v0] = table[i], [t1, v1] = table[i + 1]
    if (t <= t1) return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0 || 1))
  }
  return table.at(-1)[1]
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), camLook = new THREE.Vector3()
const resolve = (shot, key, ballPos, out) => {
  out.fromArray(shot[key])
  return shot.follow ? out.add(ballPos) : out
}
function placeCamera(t, ballPos, time) {
  let i = 0
  while (i < SHOTS.length - 2 && t > SHOTS[i + 1].t) i++
  const s0 = SHOTS[i], s1 = SHOTS[i + 1]
  const f = smooth((t - s0.t) / (s1.t - s0.t))
  camera.position.lerpVectors(resolve(s0, 'pos', ballPos, _a), resolve(s1, 'pos', ballPos, _b), f)
  camLook.lerpVectors(resolve(s0, 'look', ballPos, _a), resolve(s1, 'look', ballPos, _b), f)
  if (!REDUCED && t > 0.935) {
    const power = (1 - smooth((t - 0.935) / 0.065)) * 0.075
    camera.position.x += Math.sin(time * 51) * power
    camera.position.y += Math.cos(time * 43) * power
  }
  camera.lookAt(camLook)
}

// ------------------------------------------------------------ celebración
const particleCount = MOBILE.matches ? 150 : 260
const particlePositions = new Float32Array(particleCount * 3)
const particleColors = new Float32Array(particleCount * 3)
const particleVelocity = Array.from({ length: particleCount }, () => new THREE.Vector3())
const colors = [new THREE.Color('#c8ff45'), new THREE.Color('#ffffff'), new THREE.Color('#69b7ff')]
const particleGeometry = new THREE.BufferGeometry()
particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3))
const particles = new THREE.Points(
  particleGeometry,
  new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
)
scene.add(particles)

const goalRingMaterial = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
const goalRings = [0, 1].map((i) => {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 0.9, 64), goalRingMaterial.clone())
  ring.position.set(53.5, 1.2, -3.1)
  ring.rotation.y = -Math.PI / 2
  ring.visible = false
  ring.userData.delay = i * 0.16
  scene.add(ring)
  return ring
})

let goalAge = 10
function resetCelebration() {
  goalAge = 0
  for (let i = 0; i < particleCount; i++) {
    const j = i * 3
    particlePositions[j] = 52.8 + (Math.random() - 0.5) * 1.8
    particlePositions[j + 1] = 1.1 + Math.random() * 1.7
    particlePositions[j + 2] = -3 + (Math.random() - 0.5) * 4.8
    particleVelocity[i].set((Math.random() - 0.4) * 5.5, 2.5 + Math.random() * 6.5, (Math.random() - 0.5) * 5.5)
    const color = colors[i % colors.length]
    particleColors[j] = color.r
    particleColors[j + 1] = color.g
    particleColors[j + 2] = color.b
  }
  particleGeometry.attributes.position.needsUpdate = true
  particleGeometry.attributes.color.needsUpdate = true
  particles.material.opacity = REDUCED ? 0 : 1
}
function animateCelebration(dt) {
  goalAge += dt
  if (goalAge < 2.7 && !REDUCED) {
    for (let i = 0; i < particleCount; i++) {
      const j = i * 3
      particleVelocity[i].y -= dt * 5.6
      particlePositions[j] += particleVelocity[i].x * dt
      particlePositions[j + 1] += particleVelocity[i].y * dt
      particlePositions[j + 2] += particleVelocity[i].z * dt
    }
    particleGeometry.attributes.position.needsUpdate = true
    particles.material.opacity = Math.max(0, 1 - goalAge / 2.7)
  } else particles.material.opacity = 0

  goalRings.forEach((ring) => {
    const age = goalAge - ring.userData.delay
    ring.visible = age >= 0 && age < 1.1 && !REDUCED
    if (ring.visible) {
      const s = 1 + age * 7
      ring.scale.setScalar(s)
      ring.material.opacity = (1 - age / 1.1) * 0.72
    }
  })
}

// ------------------------------------------------------------ modelo Blender
let ball = null
const ballBase = new THREE.Quaternion()
const carga = document.querySelector('#carga')
const cargaPct = document.querySelector('#carga-pct')
const cargaBarra = document.querySelector('#carga-linea-barra')

new GLTFLoader().load(
  `${import.meta.env.BASE_URL}models/campo.glb`,
  (gltf) => {
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy())
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return
      const name = `${o.parent?.name || ''}${o.name}`
      const flat = /Cesped|Lineas/.test(name)
      o.receiveShadow = flat
      o.castShadow = !flat
      const materials = Array.isArray(o.material) ? o.material : [o.material]
      materials.forEach((m) => {
        if (!m) return
        if (m.map) { m.map.anisotropy = maxAniso; m.map.colorSpace = THREE.SRGBColorSpace }
        if (/Cesped/.test(name)) {
          m.roughness = 0.76
          m.color.set('#6f9564')
          m.map = grassAlbedo
          m.bumpMap = grassBump
          m.bumpScale = 0.085
          m.onBeforeCompile = (shader) => {
            shader.vertexShader = shader.vertexShader
              .replace('#include <common>', '#include <common>\nvarying vec3 vGrassPosition;')
              .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrassPosition = position;')
            shader.fragmentShader = shader.fragmentShader
              .replace('#include <common>', `#include <common>
                varying vec3 vGrassPosition;
                float grassHash(vec2 p) {
                  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }
                float grassNoise(vec2 p) {
                  vec2 i = floor(p);
                  vec2 f = fract(p);
                  f = f * f * (3.0 - 2.0 * f);
                  return mix(mix(grassHash(i), grassHash(i + vec2(1.0, 0.0)), f.x),
                             mix(grassHash(i + vec2(0.0, 1.0)), grassHash(i + vec2(1.0, 1.0)), f.x), f.y);
                }
              `)
              .replace('#include <color_fragment>', `#include <color_fragment>
                float broadVariation = grassNoise(vGrassPosition.xz * 0.42);
                float mediumVariation = grassNoise(vGrassPosition.xz * 2.8);
                float fineVariation = grassNoise(vGrassPosition.xz * 12.0);
                float mowingStripe = mod(floor((vGrassPosition.x + 52.5) / 5.25), 2.0);
                diffuseColor.rgb *= mix(0.91, 1.07, mowingStripe)
                                  * mix(0.9, 1.06, broadVariation)
                                  * mix(0.94, 1.055, mediumVariation)
                                  * mix(0.98, 1.025, fineVariation);
              `)
          }
          m.needsUpdate = true
        }
        if (/Lineas/.test(name)) { m.polygonOffset = true; m.polygonOffsetFactor = -2 }
        if (/postes|soportes/i.test(name)) { m.metalness = 0.22; m.roughness = 0.3 }
      })
    })
    scene.add(gltf.scene)
    ball = gltf.scene.getObjectByName('Balon')
    if (ball) ballBase.copy(ball.quaternion)
    cargaBarra.style.width = '100%'
    cargaPct.textContent = '100%'
    requestAnimationFrame(() => carga.classList.add('oculto'))
    ScrollTrigger.refresh()
  },
  (e) => {
    if (!e.total) return
    const percent = Math.round((e.loaded / e.total) * 100)
    cargaPct.textContent = `${percent}%`
    cargaBarra.style.width = `${percent}%`
  },
  (err) => {
    cargaPct.textContent = 'Error'
    cargaBarra.style.background = '#ff6b5d'
    console.error('No se pudo cargar el modelo 3D', err)
  },
)

// ------------------------------------------------------------ scroll + interfaz
let target = 0
let progress = 0
ScrollTrigger.create({
  trigger: '#historia',
  start: 'top top',
  end: 'bottom bottom',
  onUpdate: (state) => { target = state.progress },
})

document.querySelectorAll('.bloque .tarjeta').forEach((el) => {
  const side = el.closest('.derecha') ? 42 : -42
  gsap.fromTo(el, { autoAlpha: 0, x: side, y: 20 }, {
    autoAlpha: 1,
    x: 0,
    y: 0,
    duration: 0.9,
    ease: 'power3.out',
    scrollTrigger: {
      trigger: el.parentElement,
      start: 'top 68%',
      end: 'bottom 34%',
      toggleActions: 'play reverse play reverse',
    },
  })
})

document.querySelector('#repetir').addEventListener('click', () => scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' }))

const minuto = document.querySelector('#minuto')
const golesLocal = document.querySelector('#goles-local')
const marcador = document.querySelector('.marcador')
const barra = document.querySelector('#progreso-barra')
const capitulo = document.querySelector('#capitulo')
const flash = document.querySelector('#destello-gol')
let scored = false

function updateHud(t) {
  minuto.textContent = `${String(Math.round(t * 90)).padStart(2, '0')}'`
  barra.style.height = `${t * 100}%`
  capitulo.textContent = String(Math.min(4, Math.floor(t * 5))).padStart(2, '0')
  const goal = t > 0.93
  if (goal !== scored) {
    scored = goal
    golesLocal.textContent = goal ? '1' : '0'
    marcador.classList.toggle('anotado', goal)
    if (goal) {
      resetCelebration()
      flash.classList.remove('activo')
      requestAnimationFrame(() => flash.classList.add('activo'))
    } else {
      particles.material.opacity = 0
      goalRings.forEach((ring) => { ring.visible = false })
    }
  }
}

// ------------------------------------------------------------ bucle
function resize() {
  const w = innerWidth, h = innerHeight
  renderer.setPixelRatio(Math.min(devicePixelRatio, w < 640 ? 1.5 : 2))
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.fov = w / h < 0.8 ? 67 : w / h < 1 ? 58 : 42
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

const ballPos = new THREE.Vector3()
const qa = new THREE.Quaternion()
let lastTime = performance.now()

renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - lastTime) / 1000, 0.1)
  lastTime = now
  progress = REDUCED ? target : progress + (target - progress) * Math.min(1, dt * 5.2)

  const u = lerpTable(BALL_TIMELINE, progress)
  path.getPointAt(u, ballPos)
  if (ball) {
    ball.position.copy(ballPos)
    const k = u * STEPS, i = Math.min(Math.floor(k), STEPS - 1)
    qa.slerpQuaternions(rolls[i], rolls[i + 1], k - i)
    ball.quaternion.multiplyQuaternions(qa, ballBase)
  }

  trailGeometry.setDrawRange(0, Math.max(0, Math.floor(u * trailPoints.length)))
  trail.material.opacity = 0.12 + Math.sin(now * 0.004) * 0.04

  sun.position.copy(ballPos).add(SUN_OFFSET)
  sun.target.position.copy(ballPos)
  updateFootballers(progress)
  placeCamera(progress, ballPos, now / 1000)
  updateHud(progress)
  animateCelebration(dt)
  renderer.render(scene, camera)
})
