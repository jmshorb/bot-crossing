/**
 * Breaks: a thread you have parked because it is waiting on something outside the machine —
 * another person's fix, a deploy window, a reply — so its bot goes and sits on the grass with
 * a drink instead of standing at its building looking like work.
 *
 * Colony bookkeeping only, like an archive: `state.breaks[threadId] = { reason, until, since }`
 * in colony.json, and nothing reaches the harness. When `until` comes round the bot gets up,
 * walks back and holds up a `?` with "Break's over — is <reason> ready?", which is the reminder;
 * the conversation is yours to pick up. A break also ends by itself the moment its thread starts
 * running again, because that means you already picked it up.
 *
 * Pure and browser-free, like `merge-state.js`, so every way of getting it wrong — a reminder
 * that never fires, a break that ends itself on a stale timestamp — can be tested under node.
 */

/**
 * Decorate threads with their break, and say which breaks are finished with.
 *
 * - On break: `onBreak: { reason, until }`. The colony reads it as its own status.
 * - Past `until`: `breakOver: { reason }` and `unread: true`, so the bot wants you.
 * - Running since the break began: the break is over without a reminder; its id is returned in
 *   `ended` for the caller to drop from the file.
 */
export function applyBreaks(threads, breaks, now = Date.now()) {
  const ended = []
  const all = breaks || {}
  const out = (threads || []).map((raw) => {
    // The page re-applies this to threads it already decorated, so last pass's marks come off
    // first — including the `unread` a finished break forced on, which goes back to the
    // harness's own value rather than lingering until the next scan.
    const t = stripBreak(raw)
    const b = all[t.id]
    if (!b) return t
    if (t.running && (t.lastActivityAt || 0) > b.since) {
      ended.push(t.id)
      return t
    }
    if (b.until && now >= b.until) {
      return { ...t, onBreak: null, breakOver: { reason: b.reason || '' }, breakUnread: Boolean(t.unread), unread: true }
    }
    return { ...t, onBreak: { reason: b.reason || '', until: b.until || 0, drink: Number.isInteger(b.drink) ? b.drink : null } }
  })
  return { threads: out, ended }
}

function stripBreak(t) {
  if (!t || (!('onBreak' in t) && !('breakOver' in t) && !('breakUnread' in t))) return t
  const { onBreak, breakOver, breakUnread, ...rest } = t
  return breakUnread === undefined ? rest : { ...rest, unread: breakUnread }
}

/**
 * A drink for a new break: a random bright colour, kept clear of the drinks already out on other
 * breaks the way zone colours keep clear of each other — so two bots sitting side by side never
 * hold the same one while there is any other choice. Hue is what tells drinks apart at a glance,
 * so the spacing is measured round the colour wheel; saturation and lightness stay high so every
 * one of them reads as a cocktail rather than a cup of tea.
 */
export function pickDrinkColor(taken = [], rand = Math.random) {
  const hues = taken.filter(Number.isInteger).map(hueOf).sort((a, b) => a - b)
  let hue = rand() * 360
  if (hues.length) {
    // The widest stretch of the wheel nobody's drink is in, and somewhere near its middle —
    // random within the middle fifth, so it is not predictable but never crowds a neighbour.
    // Random tries were the first version, and with five drinks out they could land two
    // within a few degrees of each other.
    let from = hues[hues.length - 1]
    let span = hues[0] + 360 - from
    for (let i = 1; i < hues.length; i++) {
      if (hues[i] - hues[i - 1] > span) {
        from = hues[i - 1]
        span = hues[i] - hues[i - 1]
      }
    }
    hue = (from + span * (0.4 + rand() * 0.2)) % 360
  }
  return hslToRgb(hue, 0.85 + rand() * 0.15, 0.55 + rand() * 0.08)
}

function hueOf(rgb) {
  const r = ((rgb >> 16) & 255) / 255
  const g = ((rgb >> 8) & 255) / 255
  const b = (rgb & 255) / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (!d) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const to = (v) => Math.round((v + m) * 255)
  return (to(r) << 16) | (to(g) << 8) | to(b)
}

/** What the card says about a thread's break, or '' for a thread not on one. */
export function breakLabel(thread) {
  if (thread?.breakOver) {
    const r = thread.breakOver.reason
    return r ? `Break's over — is ${r} ready?` : "Break's over"
  }
  if (thread?.onBreak) {
    const r = thread.onBreak.reason
    return r ? `Dreaming about ${r}` : 'Taking a break'
  }
  return ''
}

/** "until Fri 27 Nov, 09:00", or '' for a break with no end. */
export function untilLabel(until, locale) {
  if (!until) return ''
  const d = new Date(until)
  const date = d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  return `until ${date}, ${time}`
}
