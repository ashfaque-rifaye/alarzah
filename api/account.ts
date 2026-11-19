// Accounts and records API (Turso). One endpoint, action-based:
// patients: demoList, signup, login, demo, me, save, sendCase, logout, deleteAccount
// clinicians: patients, patient, review
import { checkHash, db, ensure, hash, seedOne, token } from './_db.js'

type Row = Record<string, any>
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
const fail = (error: string, status = 400) => res({ error }, status)
const DAY = 864e5
const parse = (s: unknown, d: any = {}) => { try { return JSON.parse(String(s ?? '')) } catch { return d } }
const clean = (s: unknown, n = 80) => String(s ?? '').trim().slice(0, n)

async function session(user: Row) {
  const t = token(), now = Date.now()
  await db().execute({ sql: 'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)', args: [t, user.id, now, now + 30 * DAY] })
  return t
}
async function whoami(request: Request): Promise<Row | null> {
  const t = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!t) return null
  const r = await db().execute({ sql: 'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?', args: [t, Date.now()] })
  return r.rows[0] ?? null
}
const publicUser = (u: Row) => ({ id: u.id, role: u.role, email: u.email, name: u.name, title: u.title, demo: !!u.is_demo })
async function bundle(u: Row) {
  const p = await db().execute({ sql: 'SELECT profile_json, state_json, updated_at FROM profiles WHERE user_id = ?', args: [u.id] })
  const c = await db().execute({ sql: 'SELECT code, status, decision, note, reviewed_by, reviewed_at, sent_at FROM cases WHERE user_id = ? ORDER BY sent_at DESC', args: [u.id] })
  return { user: publicUser(u), profile: parse(p.rows[0]?.profile_json, null), state: parse(p.rows[0]?.state_json, {}), cases: c.rows }
}
const log = (patient: string, actor: string, what: string) => db().execute({ sql: 'INSERT INTO access_log (patient_id, actor, what, at) VALUES (?,?,?,?)', args: [patient, actor, what, Date.now()] })

export async function POST(request: Request): Promise<Response> {
  let body: Row
  try { body = await request.json(); if (JSON.stringify(body).length > 60_000) throw new Error('too big') } catch { return fail('Invalid request') }
  try { await ensure() } catch (e) { return fail(e instanceof Error ? e.message : 'Database unavailable', 503) }
  const c = db()
  const action = String(body.action || '')

  if (action === 'demoList') {
    const r = await c.execute({ sql: 'SELECT u.id, u.role, u.name, u.title, u.blurb, p.profile_json FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.is_demo = 1 ORDER BY u.role DESC, u.created_at', args: [] })
    return res({ profiles: r.rows.map(x => ({ id: x.id, role: x.role, name: x.name, title: x.title, blurb: x.blurb, profile: parse(x.profile_json, null) })) })
  }
  if (action === 'signup') {
    const email = clean(body.email, 120).toLowerCase(), pw = String(body.password || ''), role = body.role === 'clinician' ? 'clinician' : 'patient'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/^\+?\d{8,15}$/.test(email.replace(/\s/g, ''))) return fail('Enter a valid email or mobile number')
    if (pw.length < 8) return fail('Use at least 8 characters for the password')
    if (role === 'clinician') return fail('Clinician accounts are created by the clinic administrator')
    const exists = await c.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] })
    if (exists.rows.length) return fail('An account with this email or number already exists; sign in instead')
    const id = 'u_' + token().slice(0, 12), now = Date.now(), alias = clean(body.alias, 40) || 'Member'
    await c.execute({ sql: 'INSERT INTO users (id, role, email, name, pass_hash, is_demo, created_at) VALUES (?,?,?,?,?,0,?)', args: [id, role, email, alias, hash(pw), now] })
    const profile = { alias, ageBand: body.ageBand || '25–34', lang: body.lang === 'ar' ? 'ar' : 'en', group: body.group || 'Other', education: body.education || 'University', emirate: clean(body.emirate, 40) || 'Abu Dhabi', familyPhysician: '', consent: { backup: true, shareWithCareTeam: false, research: false }, avatar: 'sky' }
    await c.execute({ sql: 'INSERT INTO profiles (user_id, profile_json, state_json, updated_at) VALUES (?,?,?,?)', args: [id, JSON.stringify(profile), JSON.stringify(body.state ?? {}), now] })
    const u = (await c.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] })).rows[0]
    return res({ token: await session(u), ...(await bundle(u)) })
  }
  if (action === 'login') {
    const email = clean(body.email, 120).toLowerCase()
    const u = (await c.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] })).rows[0]
    if (!u || !checkHash(String(body.password || ''), String(u.pass_hash))) return fail('Email or password is not right', 401)
    if (body.role && body.role !== u.role) return fail(u.role === 'clinician' ? 'This is a clinician account; use the console' : 'This is a patient account; use the app', 403)
    if (u.is_demo && u.role === 'patient') await seedOne(String(u.id))
    return res({ token: await session(u), ...(await bundle(u)) })
  }
  if (action === 'demo') {
    const u = (await c.execute({ sql: 'SELECT * FROM users WHERE id = ? AND is_demo = 1', args: [String(body.id || '')] })).rows[0]
    if (!u) return fail('Unknown demo profile', 404)
    if (u.role === 'patient') await seedOne(String(u.id))
    return res({ token: await session(u), ...(await bundle(u)) })
  }

  const me = await whoami(request)
  if (!me) return fail('Please sign in again', 401)

  if (action === 'me') return res(await bundle(me))
  if (action === 'logout') { await c.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')] }); return res({ ok: true }) }

  if (me.role === 'patient') {
    if (action === 'save') {
      const now = Date.now()
      const cur = (await c.execute({ sql: 'SELECT profile_json, state_json FROM profiles WHERE user_id = ?', args: [me.id] })).rows[0]
      const profile = body.profile ? { ...parse(cur?.profile_json), ...body.profile } : parse(cur?.profile_json)
      const state = body.state ?? parse(cur?.state_json)
      // Backup off: keep the profile, drop the health record from the server.
      const stored = profile?.consent?.backup === false ? {} : state
      await c.execute({ sql: 'INSERT OR REPLACE INTO profiles (user_id, profile_json, state_json, updated_at) VALUES (?,?,?,?)', args: [me.id, JSON.stringify(profile), JSON.stringify(stored), now] })
      if (body.profile?.alias) await c.execute({ sql: 'UPDATE users SET name = ? WHERE id = ?', args: [clean(body.profile.alias, 40), me.id] })
      return res({ ok: true, savedAt: now })
    }
    if (action === 'sendCase') {
      const p = body.case || {}
      const code = clean(p.code, 20); if (!code) return fail('Missing case code')
      await c.execute({ sql: 'INSERT OR REPLACE INTO cases (code, user_id, sent_at, payload_json, status) VALUES (?,?,?,?,?)', args: [code, me.id, Date.now(), JSON.stringify({ ...p, patientId: me.id }), 'waiting'] })
      return res({ ok: true })
    }
    if (action === 'deleteAccount') {
      for (const t of ['sessions', 'profiles', 'cases']) await c.execute({ sql: `DELETE FROM ${t} WHERE user_id = ?`, args: [me.id] })
      await c.execute({ sql: 'DELETE FROM access_log WHERE patient_id = ?', args: [me.id] })
      if (!me.is_demo) await c.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [me.id] })
      else await seedOne(String(me.id))
      return res({ ok: true })
    }
    return fail('Not allowed', 403)
  }

  // Clinician actions. Role-based: they only see men who turned on "share with my care team" or sent a case.
  if (action === 'patients') {
    const r = await c.execute({
      sql: `SELECT u.id, u.name, u.is_demo, u.created_at, p.profile_json, p.state_json, p.updated_at,
              (SELECT code FROM cases k WHERE k.user_id = u.id ORDER BY sent_at DESC LIMIT 1) AS code,
              (SELECT status FROM cases k WHERE k.user_id = u.id ORDER BY sent_at DESC LIMIT 1) AS status,
              (SELECT sent_at FROM cases k WHERE k.user_id = u.id ORDER BY sent_at DESC LIMIT 1) AS sent_at
            FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.role = 'patient' ORDER BY COALESCE(sent_at, p.updated_at) DESC LIMIT 200`, args: [],
    })
    const rows = r.rows.map(x => ({ id: x.id, name: x.name, demo: !!x.is_demo, createdAt: x.created_at, updatedAt: x.updated_at, profile: parse(x.profile_json, null), state: parse(x.state_json, {}), code: x.code, status: x.status, sentAt: x.sent_at }))
      .filter(x => x.code || x.profile?.consent?.shareWithCareTeam)
    return res({ patients: rows })
  }
  if (action === 'patient') {
    const id = String(body.id || '')
    const u = (await c.execute({ sql: "SELECT * FROM users WHERE id = ? AND role = 'patient'", args: [id] })).rows[0]
    if (!u) return fail('Not found', 404)
    const b = await bundle(u)
    if (!b.cases.length && !b.profile?.consent?.shareWithCareTeam) return fail('This man has not shared his record', 403)
    await log(id, String(me.name), 'Opened the record')
    const access = await c.execute({ sql: 'SELECT actor, what, at FROM access_log WHERE patient_id = ? ORDER BY at DESC LIMIT 30', args: [id] })
    return res({ ...b, access: access.rows })
  }
  if (action === 'review') {
    const code = clean(body.code, 20), decision = body.decision === 'changed' ? 'changed' : 'approved', note = clean(body.note, 500)
    const k = (await c.execute({ sql: 'SELECT user_id FROM cases WHERE code = ?', args: [code] })).rows[0]
    if (!k) return fail('Case not found', 404)
    await c.execute({ sql: "UPDATE cases SET status = 'reviewed', decision = ?, note = ?, reviewed_by = ?, reviewed_at = ? WHERE code = ?", args: [decision, note, me.name, Date.now(), code] })
    await log(String(k.user_id), String(me.name), `${decision === 'approved' ? 'Approved' : 'Changed'} the referral`)
    return res({ ok: true })
  }
  return fail('Unknown action')
}
