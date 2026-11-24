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
    return { ...t, onBreak: { reason: b.reason || '', until: b.until || 0 } }
  })
  return { threads: out, ended }
}

function stripBreak(t) {
  if (!t || (!('onBreak' in t) && !('breakOver' in t) && !('breakUnread' in t))) return t
  const { onBreak, breakOver, breakUnread, ...rest } = t
  return breakUnread === undefined ? rest : { ...rest, unread: breakUnread }
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
