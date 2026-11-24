import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FINDER_SWATCHES, nearestFinderColor, reconcileZoneColor } from '../src/game/zone-colors.js'
import { mergeState } from '../src/game/merge-state.js'
import { readFinderColor, writeFinderColor } from '../server/lib/finder-tags.mjs'

test('every Finder swatch maps back to itself', () => {
  for (let i = 1; i < FINDER_SWATCHES.length; i++) assert.equal(nearestFinderColor(FINDER_SWATCHES[i].color), i)
})

test('a dark blue is blue, not gray', () => {
  assert.equal(nearestFinderColor(0x1a2a6c), 4)
  assert.equal(nearestFinderColor(0x777777), 1)
})

test('reconcile keeps a custom colour while Finder agrees', () => {
  const saved = { color: 0x1a2a6c, finder: 4 }
  assert.equal(reconcileZoneColor(saved, 4), saved)
})

test('reconcile takes a colour changed in Finder', () => {
  assert.deepEqual(reconcileZoneColor({ color: 0x1a2a6c, finder: 4 }, 7), { color: FINDER_SWATCHES[7].color, finder: 7 })
  assert.deepEqual(reconcileZoneColor(undefined, 2), { color: FINDER_SWATCHES[2].color, finder: 2 })
})

test('reconcile drops a synced colour cleared in Finder, but not one never synced', () => {
  assert.equal(reconcileZoneColor({ color: 1, finder: 3 }, 0), null)
  assert.deepEqual(reconcileZoneColor({ color: 1, finder: 0 }, 0), { color: 1, finder: 0 })
  assert.equal(reconcileZoneColor(undefined, 0), null)
})

test('zone colours survive a conflicted save', () => {
  const base = { zoneColors: { a: { color: 1, finder: 0 } } }
  const local = { zoneColors: { a: { color: 1, finder: 0 }, b: { color: 2, finder: 4 } } }
  const remote = { zoneColors: { a: { color: 3, finder: 6 } } }
  assert.deepEqual(mergeState(base, local, remote).zoneColors, { a: { color: 3, finder: 6 }, b: { color: 2, finder: 4 } })
})

test('Finder tags round-trip and leave custom tags alone', { skip: process.platform !== 'darwin' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-finder-'))
  try {
    assert.equal(await readFinderColor(dir), 0)
    await writeFinderColor(dir, 4)
    assert.equal(await readFinderColor(dir), 4)
    // Somebody's own tag, filed beside ours, has to outlive a recolour.
    const xml = '<plist version="1.0"><array><string>Work</string><string>Blue\n4</string></array></plist>'
    const bin = execFileSync('/usr/bin/plutil', ['-convert', 'binary1', '-o', '-', '-'], { input: xml })
    execFileSync('/usr/bin/xattr', ['-wx', 'com.apple.metadata:_kMDItemUserTags', bin.toString('hex'), dir])
    await writeFinderColor(dir, 7)
    assert.equal(await readFinderColor(dir), 7)
    const info = execFileSync('/usr/bin/xattr', ['-px', 'com.apple.FinderInfo', dir], { encoding: 'utf8' }).replace(/\s/g, '')
    assert.equal(info.slice(18, 20).toLowerCase(), '0e') // byte 9: Orange (7) << 1, as Finder writes it
    const tags = execFileSync('/usr/bin/xattr', ['-px', 'com.apple.metadata:_kMDItemUserTags', dir], { encoding: 'utf8' })
    const list = JSON.parse(
      execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], { input: Buffer.from(tags.replace(/\s/g, ''), 'hex') })
    )
    assert.deepEqual(list, ['Orange\n7', 'Work'])
    await writeFinderColor(dir, 0)
    assert.equal(await readFinderColor(dir), 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
