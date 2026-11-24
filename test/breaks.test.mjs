import test from 'node:test'
import assert from 'node:assert/strict'
import { applyBreaks, breakLabel, pickDrinkColor } from '../src/game/breaks.js'
import { mergeState } from '../src/game/merge-state.js'

const NOW = Date.parse('2026-11-24T12:00:00Z')
const thread = (over = {}) => ({ id: 't1', title: 'Fix the CDN', lastActivityAt: NOW - 3600e3, running: false, unread: false, ...over })

test('a thread on a break is its own status, and says what it is waiting for', () => {
  const { threads, ended } = applyBreaks([thread()], { t1: { reason: "Sam's CDN fix", until: 0, since: NOW - 60e3 } }, NOW)
  assert.deepEqual(ended, [])
  assert.deepEqual(threads[0].onBreak, { reason: "Sam's CDN fix", until: 0, drink: null })
  assert.equal(breakLabel(threads[0]), "Dreaming about Sam's CDN fix")
  assert.equal(breakLabel(applyBreaks([thread()], { t1: { reason: '', until: 0, since: NOW } }, NOW).threads[0]), 'Taking a break')
})

test('a break that has run out wants you, with a reminder of what for', () => {
  const breaks = { t1: { reason: "Sam's CDN fix", until: NOW - 1, since: NOW - 86400e3 } }
  const [t] = applyBreaks([thread()], breaks, NOW).threads
  assert.equal(t.unread, true)
  assert.equal(t.onBreak, null, 'no longer parked, so the colony reads it as wanting you')
  assert.equal(breakLabel(t), "Break's over — is Sam's CDN fix ready?")
})

test('a break ends by itself when its thread starts running again', () => {
  const breaks = { t1: { reason: '', until: 0, since: NOW - 60e3 } }
  const { threads, ended } = applyBreaks([thread({ running: true, lastActivityAt: NOW })], breaks, NOW)
  assert.deepEqual(ended, ['t1'])
  assert.equal(threads[0].onBreak, undefined)
})

test('re-applying after a break is dropped puts the thread back exactly as it was', () => {
  const breaks = { t1: { reason: 'x', until: NOW - 1, since: NOW - 1e6 } }
  const once = applyBreaks([thread({ unread: false })], breaks, NOW).threads
  assert.equal(once[0].unread, true)
  const after = applyBreaks(once, {}, NOW).threads[0]
  assert.equal(after.unread, false, 'the unread the reminder forced on goes away with it')
  assert.equal('onBreak' in after || 'breakOver' in after || 'breakUnread' in after, false)
})

test('breaks survive a conflicted save, and ending one here wins', () => {
  const b = { reason: '', until: 0, since: 1 }
  const merged = mergeState({ breaks: { a: b } }, { breaks: { c: b } }, { breaks: { a: b, d: b } })
  assert.deepEqual(Object.keys(merged.breaks).sort(), ['c', 'd'])
})

test('a new drink is a bright colour clear of the ones already poured', () => {
  const hue = (c) => {
    const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b)
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    return (h * 60 + 360) % 360
  }
  // Many rounds, since the picks are random: the spacing has to hold every time, not usually.
  for (let round = 0; round < 200; round++) {
  const poured = []
  for (let i = 0; i < 6; i++) poured.push(pickDrinkColor(poured))
  for (const c of poured) assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff)
  // Six drinks round a 360-degree wheel: every pair at least 25 degrees apart. (Rounding to
  // 8-bit RGB moves a hue by a degree or so, hence the margin under the 28.8 the maths gives.)
  for (let i = 0; i < poured.length; i++) {
    for (let j = i + 1; j < poured.length; j++) {
      const d = Math.abs(((hue(poured[i]) - hue(poured[j]) + 540) % 360) - 180)
      assert.ok(d >= 25, `drinks ${i} and ${j} are only ${d.toFixed(0)} degrees apart`)
    }
  }
  }
})

test("a break remembers the drink it was poured", () => {
  const [t] = applyBreaks([thread()], { t1: { reason: '', until: 0, since: NOW, drink: 0x33ccff } }, NOW).threads
  assert.equal(t.onBreak.drink, 0x33ccff)
})
