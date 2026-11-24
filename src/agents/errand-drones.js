import * as THREE from 'three'
import { crowdMaterials, crowdMesh, droneGeometry, phaseAttribute, wrapAngle } from '../world/fauna.js'
import { bendPoint } from '../core/curve.js'

/**
 * Sub-agents, drawn as drones working the air over the thread that sent them.
 *
 * Upstream draws an errand as one more astronaut in its parent's zone, and says why in
 * `src/game/errands.js`. This fork draws them as the cargo drone's airframe instead, because a
 * swarm of three workers under one conversation reads better as one bot with three helpers over
 * its building than as four bots that look like four separate threads.
 *
 * The airframe, shader and rotor animation are the fauna fleet's own (`src/world/fauna.js`); this
 * only decides where each one flies. A drone rises out of its parent's building when the errand
 * appears, circles above it at its own radius and height while the errand runs — so three never
 * stack into one — and sinks back into the roof and shrinks away when the errand ends.
 *
 * One instanced mesh, sized once. A drone has nothing of its own to open, so clicking one picks
 * the bot that sent it; and while that bot is selected its drones glow, so a swarm reads as one
 * thing even when its drones are spread round the building.
 */

const CAPACITY = 64
const SCALE = 1.25
/** How high over the building's base the drones circle, and the spread between them. */
const ORBIT_HEIGHT = 4.2
const ORBIT_RADIUS = 1.9
const ORBIT_SPEED = 0.55
const ROTOR_RATE = 42
/** Seconds to rise in or sink out; the scale follows the same clock. */
const GROW = 0.9
const UNTINTED = 0xf2efe8
/**
 * A selected bot's drones. Pushed well past 1.0 and pulsing, because the bloom pass only catches
 * colour a long way over 1 and a blue drone at 1.9x read as barely lighter; bigger; and gathered
 * round the bot itself, just over its head. Round the building was tried first, and the bot's
 * card — placed beside the bot — sat right over the building and hid them; the bot is the one
 * spot the card is laid out to keep clear.
 */
const LIT_GAIN = [2.6, 4.2] // the pulse's low and high
const LIT_PULSE = 3.2 // radians per second
const LIT_SCALE = 1.35
const LIT_HEIGHT = 2.1 // over the bot's feet
const LIT_RADIUS = 1.25
/** World radius a click has to land within, around a drone's centre. */
const PICK_RADIUS = 0.75

const _dummy = new THREE.Object3D()
const _color = new THREE.Color()
const _v = new THREE.Vector3()

function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export class ErrandDrones {
  constructor(scene) {
    const geo = droneGeometry()
    let seed = 7
    phaseAttribute(geo, CAPACITY, () => ((seed = (seed * 16807) % 2147483647) / 2147483647))
    // No crate on these: the fauna shader folds it into the hull when `aCarry` is 0.
    this.carry = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1)
    this.rotor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1)
    this.rotor.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aCarry', this.carry)
    geo.setAttribute('aRotor', this.rotor)

    this.mats = crowdMaterials({
      name: 'errand-drone',
      drone: true,
      accentA: 0x3a3d44,
      accentB: 0xc9a26a,
      side: THREE.FrontSide,
      shadow: true,
    })
    this.mesh = crowdMesh(geo, this.mats, CAPACITY, 'errand-drones', true)
    for (let i = 0; i < CAPACITY; i++) this.mesh.setColorAt(i, _color.setHex(UNTINTED))
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
    this.mesh.count = 0
    scene.add(this.mesh)

    /** id → drone. Kept across polls so a drone already circling never jumps. */
    this.drones = new Map()
    /** The parent whose drones are lit — the selected bot's thread id, or null. */
    this.highlight = null
  }

  /** Light up `parentId`'s drones and gather them round `follow` (its bot, with a `pos`). */
  setHighlight(parentId, follow = null) {
    this.highlight = parentId || null
    this.follow = parentId ? follow : null
  }

  /**
   * The parent thread id of the drone under the cursor, or null. Each drone's centre is bent
   * through the world curve the way the shader draws it, then projected; a hit is anywhere within
   * the drone's own on-screen radius, so a near drone is as easy to click as a far one is fair.
   * Nearest to the camera wins when two overlap.
   */
  pick(camera, ndcX, ndcY, aspect) {
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    let best = null
    let bestDepth = Infinity
    for (const d of this.drones.values()) {
      if (d.leaving || d.grow < 0.5) continue
      bendPoint(_v.set(d.x, d.y, d.z)).applyMatrix4(camera.matrixWorldInverse)
      const depth = -_v.z
      if (depth <= camera.near) continue
      const r = (PICK_RADIUS * SCALE * d.grow) / (depth * halfFov)
      _v.applyMatrix4(camera.projectionMatrix)
      const dx = (ndcX - _v.x) * aspect
      const dy = ndcY - _v.y
      if (dx * dx + dy * dy > r * r || depth >= bestDepth) continue
      best = d.parentId
      bestDepth = depth
    }
    return best
  }

  /**
   * The errands out right now: `{ id, anchor: Vector3 (the parent's building), color }`. A new
   * id rises out of its anchor; an id that is gone sinks back into it and is then dropped.
   */
  setErrands(list) {
    const wanted = new Set()
    // Siblings share a building, so each takes its own lane round it in arrival order.
    const lanes = new Map()
    for (const e of list) {
      if (!e?.anchor) continue
      wanted.add(e.id)
      const lane = lanes.get(e.parentId) ?? 0
      lanes.set(e.parentId, lane + 1)
      let d = this.drones.get(e.id)
      if (!d) {
        const h = hash(e.id)
        d = {
          x: e.anchor.x,
          y: e.anchor.y + 0.5,
          z: e.anchor.z,
          vx: 0,
          vy: 0,
          vz: 0,
          heading: (h % 628) / 100,
          pitch: 0,
          roll: 0,
          angle: (h >>> 8) % 100,
          orbit: ((h >>> 4) % 628) / 100,
          grow: 0,
          leaving: false,
        }
        this.drones.set(e.id, d)
      }
      d.leaving = false
      d.parentId = e.parentId
      d.anchor = e.anchor.clone()
      d.lane = lane
      d.color = e.color ?? UNTINTED
    }
    for (const [id, d] of this.drones) if (!wanted.has(id)) d.leaving = true
  }

  update(dt, motion = 1) {
    let n = 0
    this._t = (this._t || 0) + dt
    const pulse = 0.5 + 0.5 * Math.sin(this._t * LIT_PULSE)
    for (const [id, d] of this.drones) {
      d.grow = THREE.MathUtils.clamp(d.grow + (d.leaving ? -dt : dt) / GROW, 0, 1)
      if (d.leaving && d.grow <= 0) {
        this.drones.delete(id)
        continue
      }
      if (n >= CAPACITY) continue

      // A circle of its own round the parent: lanes step the radius out and the height up.
      d.orbit += ORBIT_SPEED * motion * dt * (d.lane % 2 ? -1 : 1)
      // Eased, so a drone glides over to its bot when the bot is picked and back when let go.
      const litNow = this.highlight !== null && d.parentId === this.highlight && this.follow?.pos
      d.lit = THREE.MathUtils.damp(d.lit || 0, litNow ? 1 : 0, 4, dt)
      const up = d.leaving || d.grow < 1 ? d.grow : 1
      // The centre, height and radius of the circle slide from the building's to the bot's.
      const f = this.follow?.pos
      const k = f ? d.lit : 0
      const cx = d.anchor.x + (f ? (f.x - d.anchor.x) * k : 0)
      const cz = d.anchor.z + (f ? (f.z - d.anchor.z) * k : 0)
      const r = (ORBIT_RADIUS + d.lane * 0.9) * (1 - k) + (LIT_RADIUS + d.lane * 0.45) * k
      const tx = cx + Math.cos(d.orbit) * r * up
      const tz = cz + Math.sin(d.orbit) * r * up
      const high = d.anchor.y + 0.5 + (ORBIT_HEIGHT + d.lane * 0.55 - 0.5) * up
      const low = (f ? f.y : d.anchor.y) + LIT_HEIGHT + d.lane * 0.35
      const ty = high * (1 - k) + low * k + Math.sin(d.orbit * 3 + d.lane) * 0.15

      const ax = ((tx - d.x) * 2.2 - d.vx) * Math.min(1, 3 * dt)
      const az = ((tz - d.z) * 2.2 - d.vz) * Math.min(1, 3 * dt)
      d.vx += ax
      d.vz += az
      d.vy += ((ty - d.y) * 2.5 - d.vy) * Math.min(1, 4 * dt)
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.z += d.vz * dt

      // Lean into the turn, as the cargo drones do, so it reads as flying rather than sliding.
      if (d.vx * d.vx + d.vz * d.vz > 0.02) d.heading += wrapAngle(Math.atan2(d.vx, d.vz) - d.heading) * Math.min(1, 3 * dt)
      const fx = Math.sin(d.heading)
      const fz = Math.cos(d.heading)
      const pitch = THREE.MathUtils.clamp((d.vx * fx + d.vz * fz) * 0.06, -0.35, 0.35)
      const roll = THREE.MathUtils.clamp((d.vx * fz - d.vz * fx) * 0.06, -0.35, 0.35)
      d.pitch += (pitch - d.pitch) * Math.min(1, 4 * dt)
      d.roll += (roll - d.roll) * Math.min(1, 4 * dt)
      d.angle += ROTOR_RATE * (0.5 + 0.5 * d.grow) * motion * dt
      if (d.angle > 1e4) d.angle -= 1e4

      _dummy.position.set(d.x, d.y, d.z)
      _dummy.rotation.set(0, d.heading, 0)
      _dummy.rotateX(d.pitch)
      _dummy.rotateZ(d.roll)
      _dummy.scale.setScalar(SCALE * (1 + (LIT_SCALE - 1) * d.lit) * Math.max(0.001, d.grow))
      _dummy.updateMatrix()
      this.mesh.setMatrixAt(n, _dummy.matrix)
      _color.setHex(d.color)
      if (d.lit > 0.01) _color.multiplyScalar(1 + (LIT_GAIN[0] + (LIT_GAIN[1] - LIT_GAIN[0]) * pulse - 1) * d.lit)
      this.mesh.setColorAt(n, _color)
      this.rotor.array[n] = d.angle
      n++
    }
    this.mesh.count = n
    if (n) {
      this.mesh.instanceMatrix.needsUpdate = true
      this.mesh.instanceColor.needsUpdate = true
      this.rotor.needsUpdate = true
    }
  }

  /** How many are in the air, counting any still sinking out. */
  get count() {
    return this.mesh.count
  }

  dispose() {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.mats.material.dispose()
    this.mats.depth?.dispose()
  }
}
