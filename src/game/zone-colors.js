/**
 * Zone colours you pick by hand, and how they stay in step with Finder's colour tags.
 *
 * Pure and browser-free, like `merge-state.js`: every way of getting the reconcile wrong is a
 * colour that flips back on the next poll, and that is worth being able to test under node.
 *
 * Finder has seven colours and a zone can be any colour, so the link is lossy by design: a
 * zone is tagged with the *nearest* Finder colour, and a colour arriving from Finder lands on
 * the map as that colour's swatch here. Each saved entry remembers which Finder colour it was
 * last synced as (`finder`), which is the only way to tell "you changed this in Finder" from
 * "this was never in step to begin with".
 */

/**
 * Finder's seven, indexed as Finder indexes them (0 is "none"). The values are Finder's hues
 * pulled toward the colony palette — Finder's own are tuned for a white sidebar and glare on a
 * night-time deck.
 */
export const FINDER_SWATCHES = [
  null,
  { name: 'Gray', color: 0x8a8f98 },
  { name: 'Green', color: 0x4f9a63 },
  { name: 'Purple', color: 0x8b5cc9 },
  { name: 'Blue', color: 0x4f7ec9 },
  { name: 'Yellow', color: 0xd2ad2e },
  { name: 'Red', color: 0xc95050 },
  { name: 'Orange', color: 0xd9822f },
]

/** The order Finder's own tag menu lists them in. */
export const FINDER_MENU_ORDER = [6, 7, 5, 2, 4, 3, 1]

function rgb(c) {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255]
}

function hsl(c) {
  const [r, g, b] = rgb(c).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}

/**
 * The Finder colour a zone colour is tagged as. By hue rather than RGB distance: a dark blue
 * is nearer gray than blue in RGB, but nobody picking it meant gray. Only a colour with almost
 * no saturation goes to Gray.
 */
export function nearestFinderColor(color) {
  const [h, s] = hsl(color)
  if (s < 0.18) return 1
  let best = 2
  let bestD = Infinity
  for (let i = 2; i < FINDER_SWATCHES.length; i++) {
    const d = Math.abs(((hsl(FINDER_SWATCHES[i].color)[0] - h + 540) % 360) - 180)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/**
 * One zone's colour after looking at its folder's Finder tag.
 *
 * - In step (`finder` matches the tag): keep the saved colour. This is the common case, and
 *   it is what lets a custom colour survive although Finder can only say "blue".
 * - The tag changed and is a colour: Finder wins, because that is newer than anything here.
 * - The tag was cleared on a zone that had been synced: you took the colour off in Finder, so
 *   the zone goes back to automatic.
 * - No saved colour and no tag: automatic, nothing to do.
 *
 * Returns the entry to keep (`{ color, finder }`) or null for automatic.
 */
export function reconcileZoneColor(saved, finderTag) {
  const tag = Number(finderTag) | 0
  if (saved && saved.finder === tag) return saved
  if (tag > 0 && FINDER_SWATCHES[tag]) return { color: FINDER_SWATCHES[tag].color, finder: tag }
  if (saved && saved.finder > 0) return null
  return saved || null
}
