/**
 * Finder colour tags on a repo's folder — macOS only, and the one deliberate exception to
 * "colony.json is the only file this project writes".
 *
 * A zone's colour is mirrored onto its folder so the repo reads the same colour in Finder as it
 * does on the map, and a colour set in Finder comes back the other way. It writes the folder's
 * extended attributes and nothing else: never a harness's store, never a file's contents.
 *
 * Finder keeps a colour twice, and both copies have to move together:
 *
 * - `com.apple.metadata:_kMDItemUserTags` — a binary plist array of `"Name\n<index>"` strings.
 *   This is the modern list Finder's sidebar and tag menu read. A custom tag can carry a colour
 *   too (`"Work\n4"`), which is why only the seven standard names are ever replaced here.
 * - `com.apple.FinderInfo` byte 9, bits 1–3 — the classic label. Finder still draws the dot from
 *   it in some views, so a write that updates only the tag list shows the old colour there.
 *
 * Node has no xattr API, so this goes through `/usr/bin/xattr` and `/usr/bin/plutil`. Both are
 * part of the OS rather than any application bundle, and both get argument lists, never a
 * shell string.
 */
import { execFile } from 'node:child_process'

/** Finder's own label indices. 0 is "no colour". */
export const FINDER_COLORS = ['', 'Gray', 'Green', 'Purple', 'Blue', 'Yellow', 'Red', 'Orange']

const TAGS = 'com.apple.metadata:_kMDItemUserTags'
const INFO = 'com.apple.FinderInfo'
const XATTR = '/usr/bin/xattr'
const PLUTIL = '/usr/bin/plutil'

export const finderTagsSupported = () => process.platform === 'darwin'

function run(bin, args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(bin, args, { encoding: 'buffer', maxBuffer: 1 << 20, timeout: 5000 }, (err, out) =>
      err ? reject(err) : resolve(out)
    )
    if (input !== undefined) child.stdin.end(input)
  })
}

/** An attribute's raw bytes, or null when the folder has none. */
async function readAttr(dir, name) {
  try {
    const hex = (await run(XATTR, ['-px', name, dir])).toString('utf8').replace(/\s+/g, '')
    return hex ? Buffer.from(hex, 'hex') : null
  } catch {
    return null // `xattr` exits non-zero for "no such attribute", which is the common case
  }
}

async function writeAttr(dir, name, bytes) {
  if (!bytes) {
    await run(XATTR, ['-d', name, dir]).catch(() => {})
    return
  }
  await run(XATTR, ['-wx', name, bytes.toString('hex'), dir])
}

async function readTags(dir) {
  const raw = await readAttr(dir, TAGS)
  if (!raw) return []
  try {
    const list = JSON.parse((await run(PLUTIL, ['-convert', 'json', '-o', '-', '-'], raw)).toString('utf8'))
    return Array.isArray(list) ? list.filter((t) => typeof t === 'string') : []
  } catch {
    return []
  }
}

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function writeTags(dir, tags) {
  if (!tags.length) return writeAttr(dir, TAGS, null)
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    `<plist version="1.0"><array>${tags.map((t) => `<string>${escapeXml(t)}</string>`).join('')}</array></plist>\n`
  const binary = await run(PLUTIL, ['-convert', 'binary1', '-o', '-', '-'], xml)
  return writeAttr(dir, TAGS, binary)
}

const colorOfTag = (tag) => {
  const m = /\n(\d)$/.exec(tag)
  return m ? Number(m[1]) : 0
}

/** The folder's Finder colour, 0–7. The first coloured tag wins, the way Finder draws it. */
export async function readFinderColor(dir) {
  for (const tag of await readTags(dir)) {
    const c = colorOfTag(tag)
    if (c > 0 && c < FINDER_COLORS.length) return c
  }
  const info = await readAttr(dir, INFO)
  return info && info.length > 9 ? (info[9] >> 1) & 7 : 0
}

/**
 * Give the folder exactly one standard colour tag, or none for 0. Custom tags are kept as they
 * are — including any colour they carry — because they are somebody's filing, not ours.
 */
export async function writeFinderColor(dir, color) {
  const index = Number(color) | 0
  if (index < 0 || index >= FINDER_COLORS.length) throw new Error('Not a Finder colour')
  const standard = new Set(FINDER_COLORS.filter(Boolean))
  const kept = (await readTags(dir)).filter((t) => !standard.has(t.split('\n')[0]))
  await writeTags(dir, index ? [`${FINDER_COLORS[index]}\n${index}`, ...kept] : kept)

  const info = Buffer.alloc(32)
  ;(await readAttr(dir, INFO))?.copy(info, 0, 0, 32)
  info[9] = (info[9] & ~0x0e) | (index << 1)
  await writeAttr(dir, INFO, info.every((b) => b === 0) ? null : info)
}
