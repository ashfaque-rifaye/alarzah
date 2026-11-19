// Client for /api/account (Turso). Patient and clinician sessions are kept apart, so one browser can run both sides of the demo.
import type { PatientProfile } from './profiles'

export type Role = 'patient' | 'clinician'
export interface AccountUser { id: string; role: Role; email: string; name: string; title?: string; demo: boolean }
export interface CaseRow { code: string; status: 'waiting' | 'reviewed'; decision?: string; note?: string; reviewed_by?: string; reviewed_at?: number; sent_at: number }
export interface Bundle { user: AccountUser; profile: PatientProfile | null; state: Record<string, any>; cases: CaseRow[] }
export interface DemoProfile { id: string; role: Role; name: string; title?: string; blurb: string; profile: PatientProfile | null }
export interface Session { token: string; user: AccountUser }

const KEY = (r: Role) => `alarzah.session.${r}`
export function getSession(role: Role): Session | null {
  try { const s = localStorage.getItem(KEY(role)); return s ? JSON.parse(s) : null } catch { return null }
}
export function setSession(role: Role, s: Session | null) {
  try { s ? localStorage.setItem(KEY(role), JSON.stringify(s)) : localStorage.removeItem(KEY(role)) } catch { /* storage blocked */ }
}

export async function call<T = any>(action: string, body: Record<string, unknown> = {}, role?: Role): Promise<T> {
  const sess = role ? getSession(role) : null
  const r = await fetch('/api/account', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(sess ? { authorization: `Bearer ${sess.token}` } : {}) },
    body: JSON.stringify({ action, ...body }),
  })
  let j: any = {}
  try { j = await r.json() } catch { /* not JSON */ }
  if (!r.ok) {
    if (r.status === 401 && role) setSession(role, null)
    throw new Error(j.error || `Server error ${r.status}`)
  }
  return j as T
}

export async function signIn(role: Role, how: { demo: string } | { email: string; password: string }): Promise<Bundle> {
  const j = await call<Bundle & { token: string }>('demo' in how ? 'demo' : 'login', 'demo' in how ? { id: how.demo } : { ...how, role })
  setSession(role, { token: j.token, user: j.user })
  return j
}
export async function signUp(body: { email: string; password: string; alias: string; ageBand: string; lang: string; group?: string; education?: string; emirate?: string; state?: unknown }): Promise<Bundle> {
  const j = await call<Bundle & { token: string }>('signup', body)
  setSession('patient', { token: j.token, user: j.user })
  return j
}
export async function signOut(role: Role) {
  try { await call('logout', {}, role) } catch { /* already gone */ }
  setSession(role, null)
}
export const demoList = () => call<{ profiles: DemoProfile[] }>('demoList').then(r => r.profiles)
