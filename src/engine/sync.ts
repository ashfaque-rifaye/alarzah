// Prototype transport between the man's app and the clinician console.
// Only what he explicitly sends is shared. In the prototype this travels through the browser
// (localStorage + BroadcastChannel), so both surfaces in one browser stay in sync live;
// in production it is an encrypted, consented API call into the clinic's queue.
import type { Checkin, SemenResult } from './rules'
import type { Kind } from './simulate'

export interface SharedCase { code: string; sentAt: number; lang: 'en' | 'ar'; checkin: Checkin; clipKind?: Kind; lab?: SemenResult }
export interface Review { code: string; decision: 'approved' | 'changed'; note: string; at: number; by: string }

const INBOX = 'alarzah.inbox', REVIEWS = 'alarzah.reviews'
const read = <T,>(k: string): T[] => { try { return JSON.parse(localStorage.getItem(k) || '[]') } catch { return [] } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage blocked */ } }
let channel: BroadcastChannel | null = null
const ch = () => (channel ??= 'BroadcastChannel' in window ? new BroadcastChannel('alarzah') : null)

export const readInbox = () => read<SharedCase>(INBOX)
export const readReviews = () => read<Review>(REVIEWS)

export function sendCase(c: SharedCase) {
  write(INBOX, [c, ...readInbox().filter(x => x.code !== c.code)].slice(0, 20))
  ch()?.postMessage({ type: 'case', code: c.code })
}
export function postReview(r: Review) {
  write(REVIEWS, [r, ...readReviews().filter(x => x.code !== r.code)].slice(0, 50))
  ch()?.postMessage({ type: 'review', code: r.code })
}
/** Calls back whenever the other surface sends or reviews something (other tabs, iframes or windows). */
export function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === INBOX || e.key === REVIEWS) cb() }
  const c = ch()
  const onMsg = () => cb()
  window.addEventListener('storage', onStorage)
  c?.addEventListener('message', onMsg)
  return () => { window.removeEventListener('storage', onStorage); c?.removeEventListener('message', onMsg) }
}
