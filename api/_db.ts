// Turso (libSQL) access for accounts, patient records, cases and reviews. Files starting with _ are not deployed as functions.
import { createClient, type Client } from '@libsql/client/web'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { DEMO_PASSWORD, DEMO_SEEDS } from '../src/engine/profiles.js'
import { EMPTY_CHECKIN } from '../src/engine/rules.js'

let client: Client | null = null
export function db(): Client {
  if (client) return client
  const url = (process.env.TURSO_DATABASE_URL || '').trim()
  const authToken = (process.env.TURSO_AUTH_TOKEN || '').trim().replace(/^"|"$/g, '')
  if (!url) throw new Error('Database is not configured')
  client = createClient({ url: url.replace(/^libsql:/, 'https:'), authToken })
  return client
}

export const hash = (pw: string) => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(pw, salt, 32).toString('hex')}` }
export const checkHash = (pw: string, stored: string) => {
  const [salt, h] = stored.split(':'); if (!salt || !h) return false
  const a = Buffer.from(h, 'hex'), b = scryptSync(pw, salt, 32)
  return a.length === b.length && timingSafeEqual(a, b)
}
export const token = () => randomBytes(24).toString('base64url')

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, role TEXT NOT NULL, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, title TEXT, pass_hash TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0, blurb TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, state_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS cases (code TEXT PRIMARY KEY, user_id TEXT NOT NULL, sent_at INTEGER NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', decision TEXT, note TEXT, reviewed_by TEXT, reviewed_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS access_log (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, actor TEXT NOT NULL, what TEXT NOT NULL, at INTEGER NOT NULL)`,
]

let ready: Promise<void> | null = null
export const ensure = () => (ready ??= (async () => {
  const c = db()
  for (const s of SCHEMA) await c.execute(s)
  const have = await c.execute({ sql: 'SELECT COUNT(*) AS n FROM users WHERE is_demo = 1', args: [] })
  if (Number(have.rows[0].n) < DEMO_SEEDS.length) for (const s of DEMO_SEEDS) await seedOne(s.id, true)
})().catch(e => { ready = null; throw e }))

/** (Re)creates one demo account in its starting state. Demo profiles reset on every demo sign-in so each visitor sees the same story. */
export async function seedOne(id: string, insertUser = false) {
  const s = DEMO_SEEDS.find(x => x.id === id); if (!s) return
  const c = db(), now = Date.now()
  if (insertUser) await c.execute({ sql: 'INSERT OR IGNORE INTO users (id, role, email, name, title, pass_hash, is_demo, blurb, created_at) VALUES (?,?,?,?,?,?,1,?,?)', args: [s.id, s.role, s.email, s.name, s.title ?? null, hash(DEMO_PASSWORD), s.blurb, now] })
  if (s.role !== 'patient') return
  const state = { ...s.state, demoProfile: s.id }
  await c.execute({ sql: 'INSERT OR REPLACE INTO profiles (user_id, profile_json, state_json, updated_at) VALUES (?,?,?,?)', args: [s.id, JSON.stringify(s.profile), JSON.stringify(state), now] })
  await c.execute({ sql: 'DELETE FROM cases WHERE user_id = ?', args: [s.id] })
  await c.execute({ sql: 'DELETE FROM access_log WHERE patient_id = ?', args: [s.id] })
  const st = s.state as any
  if (st?.sharedAt) {
    const checkin: Record<string, unknown> = { ...EMPTY_CHECKIN }
    for (const [k, v] of Object.entries(st.answers ?? {})) checkin[k] = k === 'ttc' ? (v ?? 'none') : !!v
    const payload = { code: `ALZ-${st.anonId}`, sentAt: st.sharedAt, lang: s.profile!.lang, checkin, clipKind: st.weekDone ? st.clipKind : undefined, lab: st.lab, patientId: s.id }
    await c.execute({
      sql: 'INSERT OR REPLACE INTO cases (code, user_id, sent_at, payload_json, status, decision, note, reviewed_by, reviewed_at) VALUES (?,?,?,?,?,?,?,?,?)',
      args: [payload.code, s.id, st.sharedAt, JSON.stringify(payload), st.reviewedAt ? 'reviewed' : 'waiting', st.reviewedAt ? 'approved' : null, st.reviewNote ?? null, st.reviewedAt ? 'Dr. Mariam' : null, st.reviewedAt ?? null],
    })
  }
}
