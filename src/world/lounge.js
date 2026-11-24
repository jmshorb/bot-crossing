import * as THREE from 'three'

/**
 * The lounge: where threads on a break go to wait. A deck with a pool, a row of loungers down
 * each long side, and a tiki bar at one end that you can click for the guest list.
 *
 * One place rather than a random patch of grass next to each zone, because the colony is a map
 * you read at a glance: everything waiting on the outside world is in one spot, and how full the
 * loungers are says how much is parked. Built at real size in world units on a raised deck, so
 * uneven ground under it never shows, and placed by the colony on open ground near the lander.
 *
 * Local frame: the pool's long axis is X, the bar is at +X, loungers face the water from ±Z.
 *
 * On airless or hostile worlds — Luna, Mars, Frost, Cinder — the whole lounge sits under a glass
 * dome on a round plinth, because a pool party in a vacuum wants a roof.
 */

/** Planets whose lounge is under a dome. */
export const DOMED_PLANETS = new Set(['moon', 'mars', 'tundra', 'volcanic'])

export const LOUNGE = {
  deckW: 11.5,
  deckD: 8.4,
  poolW: 5.4,
  poolD: 2.6,
  /** How far the deck stands above the highest ground under it. */
  lift: 0.32,
  /** The radius the colony keeps clear of scatter, and checks for open ground. */
  radius: 7.4,
  /** Seat height on a lounger, above the deck. */
  seatY: 0.3,
  /** Lounger x positions along each side; four a side. */
  seatsX: [-2.55, -0.85, 0.85, 2.55],
  seatZ: 2.55,
  barX: 4.55,
  /** The dome's footprint: an ellipse round the deck, corners and all. */
  domeRX: 8.2,
  domeRZ: 6.0,
  domeH: 4.6,
}

const WOOD = 0xc89a63
const BAMBOO = 0xd8b46a
const THATCH = 0xb48a45

export class Lounge {
  /**
   * `center` is a world point on the ground, `angle` the deck's turn about Y, `deckY` the top of
   * the deck in world units.
   */
  constructor(center, angle, deckY, { dome = false } = {}) {
    this.dome = dome
    this.center = center.clone()
    this.angle = angle
    this.deckY = deckY
    this.group = new THREE.Group()
    this.group.name = 'lounge'
    this.group.position.set(center.x, deckY, center.z)
    this.group.rotation.y = angle
    this._mats = []
    this._geos = []
    this.uniforms = { uTime: { value: 0 } }
    this._build()
    if (dome) this._buildDome()
    this.group.updateMatrixWorld(true)
  }

  _mat(params, Kind = THREE.MeshStandardMaterial) {
    const m = new Kind(params)
    this._mats.push(m)
    return m
  }

  _add(geo, mat, x, y, z, ry = 0, shadow = true) {
    this._geos.push(geo)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.rotation.y = ry
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    this.group.add(mesh)
    return mesh
  }

  _build() {
    const L = LOUNGE
    const deck = this._mat({ color: 0xd9c7a3, roughness: 0.85 })
    const tile = this._mat({ color: 0xf1ece2, roughness: 0.6 })
    const wood = this._mat({ color: WOOD, roughness: 0.75 })
    const bamboo = this._mat({ color: BAMBOO, roughness: 0.7 })
    const thatch = this._mat({ color: THATCH, roughness: 0.95, flatShading: true })
    const cushion = this._mat({ color: 0xf4efe6, roughness: 0.9 })
    const stripe = this._mat({ color: 0x3fb6c9, roughness: 0.9 })

    // The deck: a slab deep enough to bury uneven ground, its top at y = 0 locally, built as four
    // pieces round the pool's hole — one solid slab put its top straight over the water.
    const holeW = L.poolW + 0.56
    const holeD = L.poolD + 0.56
    const sideD = (L.deckD - holeD) / 2
    const endW = (L.deckW - holeW) / 2
    this._add(new THREE.BoxGeometry(L.deckW, 1.6, sideD), deck, 0, -0.8, holeD / 2 + sideD / 2, 0, false)
    this._add(new THREE.BoxGeometry(L.deckW, 1.6, sideD), deck, 0, -0.8, -holeD / 2 - sideD / 2, 0, false)
    this._add(new THREE.BoxGeometry(endW, 1.6, holeD), deck, holeW / 2 + endW / 2, -0.8, 0, 0, false)
    this._add(new THREE.BoxGeometry(endW, 1.6, holeD), deck, -holeW / 2 - endW / 2, -0.8, 0, 0, false)
    // The basin's walls, so the hole has sides rather than a view into the slab.
    const wall = this._mat({ color: 0x7fcfe0, roughness: 0.5 })
    this._add(new THREE.BoxGeometry(holeW, 0.6, 0.06), wall, 0, -0.3, holeD / 2 - 0.03, 0, false)
    this._add(new THREE.BoxGeometry(holeW, 0.6, 0.06), wall, 0, -0.3, -holeD / 2 + 0.03, 0, false)
    this._add(new THREE.BoxGeometry(0.06, 0.6, holeD), wall, holeW / 2 - 0.03, -0.3, 0, 0, false)
    this._add(new THREE.BoxGeometry(0.06, 0.6, holeD), wall, -holeW / 2 + 0.03, -0.3, 0, 0, false)

    // The pool: a pale tile coping round a sunken basin, and the water just under the rim.
    const cw = 0.28
    const copeY = 0.03
    this._add(new THREE.BoxGeometry(L.poolW + cw * 2, 0.06, cw), tile, 0, copeY, L.poolD / 2 + cw / 2)
    this._add(new THREE.BoxGeometry(L.poolW + cw * 2, 0.06, cw), tile, 0, copeY, -L.poolD / 2 - cw / 2)
    this._add(new THREE.BoxGeometry(cw, 0.06, L.poolD), tile, L.poolW / 2 + cw / 2, copeY, 0)
    this._add(new THREE.BoxGeometry(cw, 0.06, L.poolD), tile, -L.poolW / 2 - cw / 2, copeY, 0)
    this._add(new THREE.BoxGeometry(holeW, 0.02, holeD), this._mat({ color: 0x9fe0ee, roughness: 0.4 }), 0, -0.58, 0, 0, false)
    this.water = this._add(new THREE.PlaneGeometry(holeW, holeD, 24, 12), this._waterMaterial(), 0, -0.1, 0, 0, false)
    this.water.rotation.x = -Math.PI / 2

    // Loungers down both long sides, each facing the water, with a little table to its right.
    this.seats = []
    for (const side of [1, -1]) {
      for (const x of L.seatsX) {
        const z = side * L.seatZ
        const ry = side > 0 ? Math.PI : 0 // a lounger's head is away from the pool
        const g = new THREE.Group()
        g.position.set(x, 0, z)
        g.rotation.y = ry
        // Frame, seat cushion, raised backrest and its stripe — all in the lounger's own frame,
        // facing +Z (toward the pool), head at -Z.
        const parts = [
          [new THREE.BoxGeometry(0.72, 0.08, 1.7), wood, 0, 0.2, 0, 0],
          [new THREE.BoxGeometry(0.66, 0.08, 1.0), cushion, 0, 0.28, 0.3, 0],
          [new THREE.BoxGeometry(0.66, 0.08, 0.72), cushion, 0, 0.48, -0.55, 0.62],
          [new THREE.BoxGeometry(0.67, 0.085, 0.16), stripe, 0, 0.33, 0.5, 0],
        ]
        for (const [geo, mat, px, py, pz, rx] of parts) {
          this._geos.push(geo)
          const m = new THREE.Mesh(geo, mat)
          m.position.set(px, py, pz)
          m.rotation.x = rx
          m.castShadow = true
          m.receiveShadow = true
          g.add(m)
        }
        for (const [lx, lz] of [[-0.3, -0.75], [0.3, -0.75], [-0.3, 0.75], [0.3, 0.75]]) {
          const leg = new THREE.BoxGeometry(0.06, 0.2, 0.06)
          this._geos.push(leg)
          const m = new THREE.Mesh(leg, wood)
          m.position.set(lx, 0.1, lz)
          g.add(m)
        }
        this.group.add(g)
        // The side table, on the lounger's right as you lie on it.
        const tx = x + (side > 0 ? -0.62 : 0.62)
        this._add(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 14), wood, tx, 0.34, z + side * 0.15)
        this._add(new THREE.CylinderGeometry(0.035, 0.05, 0.32, 8), wood, tx, 0.16, z + side * 0.15)
        this.seats.push({
          local: new THREE.Vector3(x, 0, z + side * -0.05),
          yaw: ry,
          table: new THREE.Vector3(tx, 0.36, z + side * 0.15),
        })
      }
    }

    // The tiki bar: a bamboo counter under a thatched roof on four posts, two stools in front,
    // and a sign. The counter faces the pool (-X).
    const bx = L.barX
    this._add(new THREE.BoxGeometry(0.7, 1.0, 2.6), bamboo, bx, 0.5, 0)
    this._add(new THREE.BoxGeometry(0.9, 0.08, 2.8), wood, bx - 0.05, 1.04, 0)
    for (const [px, pz] of [[-0.7, -1.5], [-0.7, 1.5], [0.8, -1.5], [0.8, 1.5]]) {
      this._add(new THREE.CylinderGeometry(0.06, 0.07, 2.3, 8), bamboo, bx + px, 1.15, pz)
    }
    const roof = this._add(new THREE.ConeGeometry(2.4, 1.1, 4, 1), thatch, bx + 0.05, 2.75, 0)
    roof.rotation.y = Math.PI / 4
    roof.scale.set(1, 1, 1.35)
    for (const pz of [-0.7, 0.7]) {
      this._add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), wood, bx - 0.85, 0.66, pz)
      this._add(new THREE.CylinderGeometry(0.04, 0.05, 0.64, 8), wood, bx - 0.85, 0.32, pz)
    }
    const sign = this._add(new THREE.PlaneGeometry(1.7, 0.5), this._mat({ map: signTexture(), roughness: 0.8 }), bx - 0.37, 1.62, 0, -Math.PI / 2, false)
    sign.rotation.y = -Math.PI / 2
    // Two torches at the bar's corners, which glow after dark.
    this.flames = []
    for (const pz of [-1.9, 1.9]) {
      this._add(new THREE.CylinderGeometry(0.035, 0.05, 1.6, 8), bamboo, bx - 1.2, 0.8, pz)
      const flame = this._add(new THREE.SphereGeometry(0.12, 10, 8), this._mat({ color: 0xffa040, emissive: 0xff7a1a, emissiveIntensity: 1.2 }), bx - 1.2, 1.7, pz, 0, false)
      flame.scale.set(1, 1.5, 1)
      this.flames.push(flame)
    }
    /** Where the bar is, locally, for picking. */
    this.barLocal = new THREE.Vector3(bx, 1.3, 0)
  }

  /**
   * A glass dome on a round plinth: the plinth buries the ground round the deck out to the
   * dome's edge, the glass is a faint, slightly blue shell, and eight ribs and a base ring give it
   * a frame so it reads as a structure rather than a soap bubble.
   */
  _buildDome() {
    const L = LOUNGE
    const plinth = this._mat({ color: 0xb9bcc2, roughness: 0.8, metalness: 0.1 })
    // A ring, not a disc: the deck already fills the middle, and a solid plinth put its top
    // straight over the pool. An ellipse with the deck's rectangle cut out, extruded downward.
    const ring = new THREE.Shape()
    ring.absellipse(0, 0, L.domeRX + 0.25, L.domeRZ + 0.25, 0, Math.PI * 2, false, 0)
    const hole = new THREE.Path()
    hole.moveTo(-L.deckW / 2, -L.deckD / 2)
    hole.lineTo(L.deckW / 2, -L.deckD / 2)
    hole.lineTo(L.deckW / 2, L.deckD / 2)
    hole.lineTo(-L.deckW / 2, L.deckD / 2)
    hole.lineTo(-L.deckW / 2, -L.deckD / 2)
    ring.holes.push(hole)
    const geo = new THREE.ExtrudeGeometry(ring, { depth: 1.62, bevelEnabled: false, curveSegments: 48 })
    // Shape x/y are the lounge's x/z; extruded along +Z, then turned so it hangs down from y = 0.
    geo.rotateX(Math.PI / 2)
    this._add(geo, plinth, 0, 0, 0, 0, false)

    const glass = this._mat({
      color: 0xcfe8ff,
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const shell = this._add(new THREE.SphereGeometry(1, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0, 0, 0, false)
    shell.scale.set(L.domeRX, L.domeH, L.domeRZ)
    // Drawn after everything inside it, so the inside shows through.
    shell.renderOrder = 3

    // Matte: a polished frame caught the sun as hard white glints the bloom turned into stars.
    const frame = this._mat({ color: 0xdfe3e8, roughness: 0.75, metalness: 0.1 })
    const rim = this._add(new THREE.TorusGeometry(1, 0.012, 6, 64), frame, 0, 0.03, 0, 0, false)
    rim.rotation.x = Math.PI / 2
    rim.scale.set(L.domeRX, L.domeRZ, 4)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const pts = []
      for (let k = 0; k <= 16; k++) {
        const t = (k / 16) * (Math.PI / 2)
        pts.push(new THREE.Vector3(Math.cos(a) * Math.cos(t) * L.domeRX, Math.sin(t) * L.domeH, Math.sin(a) * Math.cos(t) * L.domeRZ))
      }
      this._add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.045, 5, false), frame, 0, 0, 0, 0, false)
    }
  }

  _waterMaterial() {
    const m = this._mat({ color: 0x2fb8e0, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88, emissive: 0x0a3d52 })
    const uniforms = this.uniforms
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           transformed.z += sin( position.x * 3.1 + uTime * 1.6 ) * 0.012 + cos( position.y * 4.3 + uTime * 1.2 ) * 0.01;`
        )
    }
    return m
  }

  /** A seat's world position (on the deck), the yaw a bot lies at, and where its drink stands. */
  seat(i) {
    const s = this.seats[i]
    if (!s) return null
    const pos = s.local.clone().applyMatrix4(this.group.matrixWorld)
    const table = s.table.clone().applyMatrix4(this.group.matrixWorld)
    return { pos, yaw: s.yaw + this.angle, table }
  }

  get seatCount() {
    return this.seats.length
  }

  /**
   * Where a guest stands when every lounger is taken: open deck clear of the loungers and the
   * bar, mostly at the pool's far end, cycling round for as many as there are. A starting point
   * only — the guest wanders the deck from there, held to it by `onDeck`.
   */
  mingleSpot(k) {
    const spots = [
      [-4.5, 0], [-4.5, 2.4], [-4.5, -2.4], [-3.4, 1.2], [-3.4, -1.2],
      [3.4, 3.5], [3.4, -3.5], [-1.7, 3.8], [1.7, -3.8], [-1.7, -3.8], [1.7, 3.8],
    ]
    const [x, z] = spots[k % spots.length]
    return new THREE.Vector3(x, 0, z).applyMatrix4(this.group.matrixWorld)
  }

  /** Whether a point is somewhere a wandering guest may walk: on the deck, not in the pool. */
  onDeck(x, z) {
    if (!this.contains(x, z, -0.45)) return false
    const dx = x - this.center.x
    const dz = z - this.center.z
    const c = Math.cos(-this.angle)
    const s = Math.sin(-this.angle)
    const lx = dx * c - dz * s
    const lz = dx * s + dz * c
    // Under a dome the plinth ring counts as floor, but the deck's own edges are the limit.
    if (Math.abs(lx) > LOUNGE.deckW / 2 - 0.45 || Math.abs(lz) > LOUNGE.deckD / 2 - 0.45) return false
    return !(Math.abs(lx) < LOUNGE.poolW / 2 + 0.6 && Math.abs(lz) < LOUNGE.poolD / 2 + 0.6)
  }

  /** The bar's world position, for picking and for flying the camera to. */
  barWorld(out = new THREE.Vector3()) {
    return out.copy(this.barLocal).applyMatrix4(this.group.matrixWorld)
  }

  /** Whether a world point is on the deck — the ground there is the deck, not the terrain. */
  contains(x, z, margin = 0) {
    const dx = x - this.center.x
    const dz = z - this.center.z
    const c = Math.cos(-this.angle)
    const s = Math.sin(-this.angle)
    const lx = dx * c - dz * s
    const lz = dx * s + dz * c
    // Under a dome the plinth is the floor out to the dome's edge.
    if (this.dome) {
      const rx = LOUNGE.domeRX + 0.25 + margin
      const rz = LOUNGE.domeRZ + 0.25 + margin
      return (lx * lx) / (rx * rx) + (lz * lz) / (rz * rz) <= 1
    }
    return Math.abs(lx) <= LOUNGE.deckW / 2 + margin && Math.abs(lz) <= LOUNGE.deckD / 2 + margin
  }

  /** What the bots walk round: the pool and the bar, as circles in world space. */
  obstacles() {
    const out = []
    const toWorld = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(this.group.matrixWorld)
    for (const x of [-1.8, 0, 1.8]) {
      const p = toWorld(x, 0)
      out.push({ x: p.x, z: p.z, r: 1.45, keep: 1.45 })
    }
    const bar = toWorld(LOUNGE.barX, 0)
    out.push({ x: bar.x, z: bar.z, r: 1.4, keep: 1.4 })
    return out
  }

  update(elapsed, night = 0) {
    this.uniforms.uTime.value = elapsed
    for (const [i, f] of this.flames.entries()) {
      const flicker = 1 + Math.sin(elapsed * 11 + i * 2) * 0.08 + Math.sin(elapsed * 23 + i) * 0.05
      f.scale.set(flicker, 1.5 * flicker, flicker)
      f.material.emissiveIntensity = 0.8 + night * 2.2
    }
  }

  dispose() {
    this.group.removeFromParent()
    for (const g of this._geos) g.dispose()
    for (const m of this._mats) {
      m.map?.dispose()
      m.dispose()
    }
  }
}

/** The bar's sign: TIKI BAR, burnt into a plank. */
function signTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 76
  const g = c.getContext('2d')
  g.fillStyle = '#8a5a2b'
  g.fillRect(0, 0, 256, 76)
  g.strokeStyle = '#6b4320'
  g.lineWidth = 3
  for (let y = 12; y < 76; y += 16) {
    g.beginPath()
    g.moveTo(0, y + Math.sin(y) * 2)
    g.lineTo(256, y + Math.cos(y) * 2)
    g.stroke()
  }
  g.fillStyle = '#ffe2a8'
  g.font = 'bold 44px Georgia, serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('TIKI BAR', 128, 40)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
