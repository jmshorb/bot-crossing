import * as THREE from 'three'

/**
 * The lounge: where threads on a break go to wait. A deck with a pool, a row of loungers down
 * each long side, and a tiki bar at one end that you can click for the guest list.
 *
 * One place rather than a random patch of grass next to each zone, because the colony is a map
 * you read at a glance: everything waiting on the outside world is in one spot, and how full the
 * loungers are says how much is parked. It is a hex tile of the colony's own lattice — the cell
 * beside the lander, reserved like the lander's (see LOUNGE_CELL in plot-move.js) — at a zone
 * deck's size and height, so it reads as part of the base rather than something dropped near it.
 *
 * Local frame: the pool's long axis is X, the bar is at +X, loungers face the water from ±Z. The
 * hex is flat-topped with corners on ±X, which is also the lattice's, and the colony only turns
 * the lounge by whole sixths so the two always agree.
 *
 * On airless or hostile worlds — Luna, Mars, Frost, Cinder — the whole lounge is enclosed: a
 * hexagonal glass prism with a low pyramid roof.
 */

/** Planets whose lounge is under a dome. */
export const DOMED_PLANETS = new Set(['moon', 'mars', 'tundra', 'volcanic'])

/** The hex's corner radius: a zone tile's, pulled in a hair so it never z-fights a neighbour. */
export const HEX_R = 7.6 * 0.992

export const LOUNGE = {
  poolW: 5.4,
  poolD: 2.6,
  /** The radius the colony keeps clear of scatter round the lounge's centre. */
  radius: 8.6,
  /** Seat height on a lounger, above the deck. */
  seatY: 0.3,
  /** Lounger x positions along each side; four a side. */
  seatsX: [-2.55, -0.85, 0.85, 2.55],
  seatZ: 2.55,
  barX: 4.55,
  /** The enclosure: wall height and roof rise. */
  wallH: 4.0,
  roofH: 1.3,
}

/** Whether a local point is inside a flat-topped hex of corner radius `r`. */
function inHex(lx, lz, r) {
  const k = (r * Math.sqrt(3)) / 2
  return Math.abs(lz) <= k && (Math.abs(lx) * Math.sqrt(3)) / 2 + Math.abs(lz) / 2 <= k
}

/**
 * Where the palms stand, as [angle round the deck, distance from its middle, height, lean]. The
 * four corners away from the bar, inset off the kerb: the loungers stop well short of them and
 * the bar owns the corner on +X.
 */
const PALMS = [
  [(Math.PI / 3) * 1, 5.9, 2.6, 0.32],
  [(Math.PI / 3) * 2, 5.8, 2.2, 0.26],
  [(Math.PI / 3) * 4, 5.9, 2.45, 0.36],
  [(Math.PI / 3) * 5, 5.8, 2.05, 0.22],
]

/** How far either side of the bar's middle the torches stand: half a unit clear of the eaves. */
const TORCH_Z = 3.1

const WOOD = 0xc89a63
const BAMBOO = 0xd8b46a

export class Lounge {
  /**
   * `center` is the cell's centre, `angle` the deck's turn about Y (a multiple of 60°), `deckY`
   * the top of the deck.
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
    this.group.updateMatrixWorld(true)
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
    const cushion = this._mat({ color: 0xf4efe6, roughness: 0.9 })
    const stripe = this._mat({ color: 0x3fb6c9, roughness: 0.9 })

    // The deck: a hex slab at a zone's size, deep enough to bury uneven ground, its top at y = 0
    // locally, with the pool's hole cut through it — a solid slab put its top over the water.
    const holeW = L.poolW + 0.56
    const holeD = L.poolD + 0.56
    const hex = new THREE.Shape()
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2
      if (i === 0) hex.moveTo(HEX_R * Math.cos(a), HEX_R * Math.sin(a))
      else hex.lineTo(HEX_R * Math.cos(a), HEX_R * Math.sin(a))
    }
    const hole = new THREE.Path()
    hole.moveTo(-holeW / 2, -holeD / 2)
    hole.lineTo(-holeW / 2, holeD / 2)
    hole.lineTo(holeW / 2, holeD / 2)
    hole.lineTo(holeW / 2, -holeD / 2)
    hole.lineTo(-holeW / 2, -holeD / 2)
    hex.holes.push(hole)
    const slab = new THREE.ExtrudeGeometry(hex, { depth: 1.6, bevelEnabled: false })
    // Shape x/y are the lounge's x/z; extruded along +Z, then turned to hang down from y = 0.
    slab.rotateX(Math.PI / 2)
    this._add(slab, deck, 0, 0, 0, 0, false)
    // A wooden kerb round the edge, the way a zone's deck has its coloured one.
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2
      const a1 = ((i + 1) / 6) * Math.PI * 2
      const mx = ((Math.cos(a0) + Math.cos(a1)) / 2) * (HEX_R - 0.09)
      const mz = ((Math.sin(a0) + Math.sin(a1)) / 2) * (HEX_R - 0.09)
      const kerb = this._add(new THREE.BoxGeometry(HEX_R, 0.1, 0.18), wood, mx, 0.05, mz, 0, false)
      kerb.rotation.y = -Math.atan2(mz, mx) + Math.PI / 2
    }
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
    this._buildThatch(bx + 0.05, 2.2)
    for (const pz of [-0.7, 0.7]) {
      this._add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), wood, bx - 0.85, 0.66, pz)
      this._add(new THREE.CylinderGeometry(0.04, 0.05, 0.64, 8), wood, bx - 0.85, 0.32, pz)
    }
    const sign = this._add(new THREE.PlaneGeometry(1.7, 0.5), this._mat({ map: signTexture(), roughness: 0.8 }), bx - 0.37, 1.62, 0, -Math.PI / 2, false)
    sign.rotation.y = -Math.PI / 2
    // Two torches, one off each end of the bar, which glow after dark. Out past the eaves on
    // purpose: the thatch reaches about 2.5 either side of the counter, and a flame under straw
    // is a fire waiting to happen. Tall enough to see over the counter from the pool.
    this.flames = []
    this.torches = []
    for (const pz of [-TORCH_Z, TORCH_Z]) {
      this._add(new THREE.CylinderGeometry(0.035, 0.05, 1.9, 8), bamboo, bx, 0.95, pz)
      const cup = this._add(new THREE.CylinderGeometry(0.1, 0.06, 0.16, 10), wood, bx, 1.96, pz)
      cup.castShadow = false
      const flame = this._add(new THREE.SphereGeometry(0.12, 10, 8), this._mat({ color: 0xffa040, emissive: 0xff7a1a, emissiveIntensity: 1.2 }), bx, 2.12, pz, 0, false)
      flame.scale.set(1, 1.5, 1)
      this.flames.push(flame)
      this.torches.push(new THREE.Vector3(bx, 0, pz))
    }
    /** Where the bar is, locally, for picking. */
    this.barLocal = new THREE.Vector3(bx, 1.3, 0)

    // A few small palms near the deck's corners, clear of the loungers, the bar and the pool.
    this.palms = []
    PALMS.forEach(([a, r, h, lean], i) => {
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      this._buildPalm(x, z, h, lean, i)
      this.palms.push(new THREE.Vector3(x, 0, z))
    })
  }

  /**
   * The enclosure for hostile worlds: a hexagonal glass prism standing on the deck's edge, with a
   * low six-sided pyramid roof and a pale frame — posts at the corners, a ring at the eaves and
   * ridges up to the apex.
   */
  _buildDome() {
    const L = LOUNGE
    const R = HEX_R - 0.12
    const glass = this._mat({
      color: 0xcfe8ff,
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    // Matte: a polished frame caught the sun as hard white glints the bloom turned into stars.
    const frame = this._mat({ color: 0xdfe3e8, roughness: 0.75, metalness: 0.1 })
    const corner = (i) => {
      const a = (i / 6) * Math.PI * 2
      return new THREE.Vector3(R * Math.cos(a), 0, R * Math.sin(a))
    }
    const bar = (from, to, r = 0.05) => {
      const len = from.distanceTo(to)
      const m = this._add(new THREE.CylinderGeometry(r, r, len, 6), frame, 0, 0, 0, 0, false)
      m.position.copy(from).add(to).multiplyScalar(0.5)
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
      return m
    }
    const panel = (from, to, y0, y1) => {
      const w = from.distanceTo(to)
      const m = this._add(new THREE.PlaneGeometry(w, y1 - y0), glass, 0, 0, 0, 0, false)
      m.position.copy(from).add(to).multiplyScalar(0.5)
      m.position.y = (y0 + y1) / 2
      m.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x)
      m.renderOrder = 3
      return m
    }
    const H = L.wallH
    for (let i = 0; i < 6; i++) {
      const a = corner(i)
      const b = corner(i + 1)
      bar(a, a.clone().setY(H), 0.06)
      bar(a.clone().setY(H), b.clone().setY(H))
      panel(a, b, 0, H)
    }
    // The roof: a shallow six-sided pyramid. Three's cone starts its first corner on +Z, a pointy
    // hex; turning it a twelfth puts its corners on the walls' corners.
    const roof = this._add(new THREE.ConeGeometry(R, L.roofH, 6, 1, true), glass, 0, H + L.roofH / 2, 0, Math.PI / 6, false)
    roof.renderOrder = 3
    const apex = new THREE.Vector3(0, H + L.roofH, 0)
    for (let i = 0; i < 6; i++) bar(corner(i).setY(H), apex, 0.045)
  }

  /**
   * The bar's roof: grass thatch rather than a smooth cone. One four-sided pyramid of straw with a
   * ragged fringe of strands hanging off its eaves. The straw is a procedural texture laid down
   * the slope, so the strands run the way rain would; the fringe is the same straw cut into uneven
   * ends with alpha. `y` is the eaves' height.
   */
  _buildThatch(x, y) {
    const straw = this._mat({ map: strawTexture(false), roughness: 0.95, side: THREE.DoubleSide, color: 0xffffff })
    const fringe = this._mat({
      map: strawTexture(true),
      roughness: 0.95,
      side: THREE.DoubleSide,
      alphaTest: 0.5,
      color: 0xffffff,
    })
    const r = 2.5
    const h = 1.35
    const cone = this._add(new THREE.ConeGeometry(r, h, 4, 1, true), straw, x, y + h / 2, 0, Math.PI / 4)
    cone.scale.set(1, 1, 1.35)
    // The fringe: a short, slightly flared skirt just under the eaves.
    const skirt = this._add(new THREE.CylinderGeometry(r * 0.99, r * 1.07, 0.38, 4, 1, true), fringe, x, y - 0.14, 0, Math.PI / 4)
    skirt.scale.set(1, 1, 1.35)
  }

  /**
   * A small palm: a ringed trunk curving up out of a low mound of soil, seven fronds drooping from
   * the crown — each a strip bent into an arch and cut into leaflets by an alpha texture — and a
   * cluster of coconuts. `lean` tips the trunk away from the deck's middle.
   */
  _buildPalm(x, z, h, lean, seed) {
    const out = Math.atan2(z, x)
    const ox = Math.cos(out) * lean
    const oz = Math.sin(out) * lean
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0, z),
      new THREE.Vector3(x + ox * 0.15, h * 0.35, z + oz * 0.15),
      new THREE.Vector3(x + ox * 0.55, h * 0.7, z + oz * 0.55),
      new THREE.Vector3(x + ox, h, z + oz),
    ])
    const bark = this._mat({ color: 0x8a6a45, roughness: 0.95 })
    this._add(new THREE.TubeGeometry(curve, 16, 0.085, 7, false), bark, 0, 0, 0)
    // Rings where old fronds fell, so it reads as a palm trunk rather than a pole.
    const ring = this._mat({ color: 0x6e5236, roughness: 0.95 })
    for (let i = 1; i < 9; i++) {
      const p = curve.getPoint(i / 9)
      const t = curve.getTangent(i / 9)
      const m = this._add(new THREE.TorusGeometry(0.095, 0.022, 5, 10), ring, p.x, p.y, p.z)
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), t)
    }
    // A low mound of soil round the trunk's foot: earth brown flecked with moss green.
    const soil = this._soil || (this._soil = this._mat({ map: soilTexture(), roughness: 1 }))
    const mound = this._add(new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), soil, x, 0, z)
    mound.scale.set(1, 0.28, 1)
    const top = curve.getPoint(1)
    const leaf = this._mat({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, color: 0xffffff })
    const fronds = 7
    for (let i = 0; i < fronds; i++) {
      const g = frondGeometry(1.25 + ((i * 37 + seed * 13) % 7) * 0.05)
      this._geos.push(g)
      const m = new THREE.Mesh(g, leaf)
      m.position.copy(top)
      m.rotation.order = 'YZX'
      m.rotation.y = (i / fronds) * Math.PI * 2 + seed * 0.7
      m.rotation.z = 0.25 + (i % 2) * 0.12
      m.castShadow = true
      this.group.add(m)
    }
    const nut = this._mat({ color: 0x5a3f22, roughness: 0.8 })
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + seed
      this._add(new THREE.SphereGeometry(0.07, 8, 6), nut, top.x + Math.cos(a) * 0.1, top.y - 0.08, top.z + Math.sin(a) * 0.1)
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
    const { lx, lz } = this._local(x, z)
    if (!inHex(lx, lz, HEX_R - 0.6)) return false
    return !(Math.abs(lx) < LOUNGE.poolW / 2 + 0.6 && Math.abs(lz) < LOUNGE.poolD / 2 + 0.6)
  }

  _local(x, z) {
    const dx = x - this.center.x
    const dz = z - this.center.z
    const c = Math.cos(-this.angle)
    const s = Math.sin(-this.angle)
    return { lx: dx * c + dz * s, lz: -dx * s + dz * c }
  }

  /** The bar's world position, for picking and for flying the camera to. */
  barWorld(out = new THREE.Vector3()) {
    return out.copy(this.barLocal).applyMatrix4(this.group.matrixWorld)
  }

  /** Whether a world point is on the deck — the ground there is the deck, not the terrain. */
  contains(x, z, margin = 0) {
    const { lx, lz } = this._local(x, z)
    return inHex(lx, lz, HEX_R + margin)
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
    for (const p of [...this.palms, ...this.torches]) {
      const w = toWorld(p.x, p.z)
      out.push({ x: w.x, z: w.z, r: 0.45, keep: 0.45 })
    }
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

/**
 * Straw, as a texture: hundreds of thin strands in a spread of dry yellows and browns, running
 * down the image (which is down the slope on a cone). With `fringe` the strands end raggedly
 * partway down and everything below them is transparent — the hanging edge of a thatch tier.
 */
function strawTexture(fringe) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')
  if (!fringe) {
    g.fillStyle = '#9c7838'
    g.fillRect(0, 0, 256, 128)
  }
  const tones = ['#d8b768', '#c9a557', '#b8924a', '#e3c77e', '#a27c3c', '#8c6a32']
  let seed = fringe ? 7 : 3
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 900; i++) {
    const x = rand() * 256
    const len = fringe ? 40 + rand() * 85 : 128
    g.strokeStyle = tones[Math.floor(rand() * tones.length)]
    g.lineWidth = 0.8 + rand() * 1.6
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x + (rand() - 0.5) * 6, len)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.repeat.set(fringe ? 3 : 2, 1)
  // Left at three's default flip: the canvas's top row lands at v = 1, which on a cylinder is its
  // top edge, so a fringe's strands hang from the eaves with their ragged ends at the bottom.
  return t
}

/** A palm frond's outline: a midrib with leaflets raking back along both sides, cut out by alpha. */
function frondTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')
  g.strokeStyle = '#3d7a2e'
  g.lineCap = 'round'
  for (let x = 8; x < 248; x += 7) {
    const k = 1 - x / 256
    const w = 6 + 24 * Math.sin(Math.min(1, (x / 256) * 1.4) * Math.PI * 0.9) * (0.4 + 0.6 * k)
    g.strokeStyle = x % 14 ? '#4a8f36' : '#3f8030'
    g.lineWidth = 3
    for (const side of [-1, 1]) {
      g.beginPath()
      g.moveTo(x, 32)
      g.lineTo(x + 12, 32 + side * w)
      g.stroke()
    }
  }
  g.strokeStyle = '#5a7a2a'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(0, 32)
  g.lineTo(256, 32)
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * A frond: a strip `length` long along +X from the crown, arched up a little and then drooping
 * past its middle, its width tapering to the tip. The alpha texture does the leaflets.
 */
function frondGeometry(length) {
  const geo = new THREE.PlaneGeometry(length, 0.62, 10, 1)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getX(i) + length / 2) / length
    pos.setX(i, t * length)
    pos.setY(i, 0.22 * t - 0.75 * t * t)
    pos.setZ(i, pos.getZ(i) * (1 - 0.55 * t))
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

/** Soil: a dark earth brown, mottled lighter and darker, with flecks and tufts of moss green. */
function soilTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#5a4030'
  g.fillRect(0, 0, 128, 128)
  let seed = 11
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const tones = ['#4a3426', '#6b4d36', '#3f2c20', '#7a5a3e']
  for (let i = 0; i < 260; i++) {
    g.fillStyle = tones[Math.floor(rand() * tones.length)]
    g.beginPath()
    g.arc(rand() * 128, rand() * 128, 1 + rand() * 4, 0, Math.PI * 2)
    g.fill()
  }
  const greens = ['#4f7a34', '#3f6a2a', '#6b8f3e']
  for (let i = 0; i < 140; i++) {
    g.fillStyle = greens[Math.floor(rand() * greens.length)]
    g.beginPath()
    g.arc(rand() * 128, rand() * 128, 0.8 + rand() * 2.6, 0, Math.PI * 2)
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
