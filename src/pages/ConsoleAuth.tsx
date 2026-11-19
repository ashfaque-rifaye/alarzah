// Clinician sign-in and the Patients directory for the console (records come from Turso via /api/account).
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { call, demoList, DemoProfile, signIn } from '../engine/account'
import { AVATARS, DEMO_PASSWORD, initials, PatientProfile } from '../engine/profiles'
import { TIER_META, triage, EMPTY_CHECKIN, SEMEN_REF } from '../engine/rules'
import BreezeField from '../components/BreezeField'
import './console-auth.css'

export interface ServerPatient { id: string; name: string; demo: boolean; createdAt: number; updatedAt: number; profile: PatientProfile | null; state: Record<string, any>; code?: string; status?: 'waiting' | 'reviewed'; sentAt?: number }

export function Av({ name, tone, size = 38 }: { name: string; tone?: string; size?: number }) {
  return <span className="ca-av" style={{ width: size, height: size, fontSize: size * 0.38, background: AVATARS[tone ?? 'teal'] ?? AVATARS.teal }}>{initials(name)}</span>
}

export function ClinicLogin({ onDone, onGuest }: { onDone: () => void; onGuest: () => void }) {
  const [demos, setDemos] = useState<DemoProfile[] | null>(null)
  const [email, setEmail] = useState(''), [pw, setPw] = useState('')
  const [busy, setBusy] = useState<string | null>(null), [err, setErr] = useState<string | null>(null)
  useEffect(() => { demoList().then(d => setDemos(d.filter(x => x.role === 'clinician'))).catch(() => setDemos([])) }, [])
  const run = async (key: string, how: Parameters<typeof signIn>[1]) => {
    setBusy(key); setErr(null)
    try { await signIn('clinician', how); onDone() } catch (e) { setErr(e instanceof Error ? e.message : 'Could not sign in'); setBusy(null) }
  }
  return (
    <div className="ca-wrap grain">
      <div className="ca-bg"><BreezeField density={0.6} /></div>
      <motion.div className="ca-card" initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
        <div className="ca-brand"><img src="/brand/mark.svg" alt="" /><div><b>Alarzah</b><span>Clinician console</span></div></div>
        <h1>Sign in to review</h1>
        <p>Approve or change each referral. Nothing reaches the man, and nothing can be booked, until you do.</p>
        <form onSubmit={e => { e.preventDefault(); run('form', { email, password: pw }) }} className="ca-form">
          <label><span>Work email</span><input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@clinic.ae" autoComplete="username" /></label>
          <label><span>Password</span><input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" autoComplete="current-password" /></label>
          {err && <div className="ca-err">{err}</div>}
          <button className="btn btn-primary" disabled={!email || !pw || !!busy}>{busy === 'form' ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <div className="ca-div"><span>or use a demo account</span></div>
        <div className="ca-demos">
          {demos === null && <div className="ca-demo skel" />}
          {demos?.map(d => (
            <button key={d.id} className="ca-demo" onClick={() => run(d.id, { demo: d.id })} disabled={!!busy}>
              <Av name={d.name} tone={d.id === 'c_mariam' ? 'mint' : 'violet'} />
              <div><b>{d.name}{busy === d.id ? ' …' : ''}</b><span>{d.title}</span></div>
              <em>→</em>
            </button>))}
        </div>
        <div className="ca-foot">
          <span>Demo login: <code>mariam@demo.alarzah</code> · <code>{DEMO_PASSWORD}</code></span>
          <button onClick={onGuest}>Continue as guest with the sample cohort</button>
        </div>
      </motion.div>
    </div>
  )
}

const ANSWER_LABEL: Record<string, string> = { pain: 'Sudden pain', lump: 'New lump', steroids: 'Non-prescribed steroids', udt: 'Undescended testicle', pastTesticular: 'Past testicular problem', heatJob: 'Hot job / long sitting', smoke: 'Smoking / shisha', metabolic: 'Weight / diabetes', infection: 'Infection symptoms', erection: 'Erection problems', noSpermBefore: 'Previous test: no sperm', partner35: 'Wife 35+' }
const TTC: Record<string, string> = { none: 'Not planning', lt6: 'Trying < 6 months', '6to12': 'Trying 6–12 months', ge12: 'Trying 12+ months' }

export function Patients({ patients, loading, openCase, me }: { patients: ServerPatient[]; loading: boolean; openCase: (code: string) => void; me: string }) {
  const [q, setQ] = useState(''), [f, setF] = useState<'all' | 'waiting' | 'reviewed' | 'shared'>('all')
  const [sel, setSel] = useState<string | null>(null)
  const list = useMemo(() => patients.filter(p => (f === 'all' || (f === 'shared' ? !p.code : p.status === f)) && `${p.name} ${p.code ?? ''} ${p.profile?.group ?? ''} ${p.profile?.emirate ?? ''}`.toLowerCase().includes(q.toLowerCase())), [patients, q, f])
  useEffect(() => { if (!sel && list[0]) setSel(list[0].id) }, [list.length])
  const cur = patients.find(p => p.id === sel)
  return (
    <div className="ca-pat">
      <section className="glass ca-plist scroll-thin">
        <div className="c-head"><h2>Patients</h2><span className="chip"><span className="dot" />{patients.length} with shared records</span></div>
        <p className="ca-hint">Only men who sent a case or turned on “let my care team see my record”. Every record you open is logged and shown to him.</p>
        <input className="c-search" placeholder="Search name, code, group, emirate…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="ca-seg">{(['all', 'waiting', 'reviewed', 'shared'] as const).map(k => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{k === 'all' ? 'All' : k === 'waiting' ? 'Waiting' : k === 'reviewed' ? 'Reviewed' : 'Record only'}</button>)}</div>
        {loading && !patients.length && [0, 1, 2].map(k => <div key={k} className="ca-prow skel" />)}
        {list.map(p => (
          <button key={p.id} className={`ca-prow ${p.id === sel ? 'on' : ''}`} onClick={() => setSel(p.id)}>
            <Av name={p.name} tone={p.profile?.avatar} />
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <b>{p.name}{p.demo && <i className="ca-demo-tag">demo</i>}</b>
              <span>{p.profile?.ageBand} · {p.profile?.group} · {p.profile?.emirate}</span>
            </div>
            <span className={`ca-st ${p.status ?? 'shared'}`}>{p.status === 'waiting' ? 'Waiting' : p.status === 'reviewed' ? 'Reviewed' : 'Record'}</span>
          </button>))}
        {!loading && !list.length && <div className="dim" style={{ padding: 20, fontSize: 13 }}>No patients match.</div>}
      </section>
      <AnimatePresence mode="wait">
        {cur ? <PatientDetail key={cur.id} p={cur} openCase={openCase} me={me} /> : <div />}
      </AnimatePresence>
    </div>
  )
}

function PatientDetail({ p, openCase, me }: { p: ServerPatient; openCase: (code: string) => void; me: string }) {
  const [detail, setDetail] = useState<{ access: { actor: string; what: string; at: number }[]; cases: any[] } | null>(null)
  useEffect(() => { call('patient', { id: p.id }, 'clinician').then(setDetail).catch(() => setDetail({ access: [], cases: [] })) }, [p.id])
  const st = p.state ?? {}, ans = st.answers ?? {}
  const checkin = { ...EMPTY_CHECKIN, ...Object.fromEntries(Object.entries(ans).map(([k, v]) => [k, k === 'ttc' ? (v ?? 'none') : !!v])) } as any
  const tri = st.checkDone ? triage(checkin, undefined, st.lab) : null
  const flags = Object.entries(ans).filter(([k, v]) => v === true && ANSWER_LABEL[k]).map(([k]) => ANSWER_LABEL[k])
  const fmt = (t?: number) => (t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
  return (
    <motion.section className="ca-pdetail" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <div className="glass c-card ca-phead">
        <Av name={p.name} tone={p.profile?.avatar} size={64} />
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Patient record{p.demo ? ' · demo profile' : ''}</div>
          <h2>{p.name}</h2>
          <div className="muted" style={{ fontSize: 13 }}>{p.code ?? 'No case sent'} · {p.profile?.lang === 'ar' ? 'Arabic' : 'English'} · joined {new Date(p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        </div>
        {p.code && <button className="btn btn-primary" onClick={() => openCase(p.code!)}>{p.status === 'waiting' ? 'Review case' : 'Open case'} →</button>}
      </div>
      <div className="ca-grid">
        <div className="glass c-card">
          <div className="c-head"><b>Details</b><span className="dim" style={{ fontSize: 12 }}>shared by him</span></div>
          <dl className="ca-dl">
            {[['Age', p.profile?.ageBand], ['Group', p.profile?.group], ['Education', p.profile?.education], ['Emirate', p.profile?.emirate], ['Family physician', p.profile?.familyPhysician || '—'], ['Language', p.profile?.lang === 'ar' ? 'Arabic' : 'English']].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v ?? '—'}</dd></div>)}
          </dl>
          <div className="c-head" style={{ marginTop: 16 }}><b>Consent</b></div>
          <div className="ca-consent">
            {([['backup', 'Record backup'], ['shareWithCareTeam', 'Care team can view'], ['research', 'De-identified research']] as const).map(([k, l]) => <span key={k} className={p.profile?.consent?.[k] ? 'on' : ''}>{p.profile?.consent?.[k] ? '✓' : '✕'} {l}</span>)}
          </div>
        </div>
        <div className="glass c-card">
          <div className="c-head"><b>Pathway</b><span className="dim" style={{ fontSize: 12 }}>updated {fmt(p.updatedAt)}</span></div>
          <ol className="ca-path">
            {[['Check-in', st.checkDone], ['Clip week', st.weekDone], ['Sent for review', !!st.sharedAt], ['Clinician review', !!st.reviewedAt], ['Booked', (st.bookings ?? []).length > 0], ['Lab result', !!st.lab]].map(([l, d]) => <li key={l as string} className={d ? 'done' : ''}><i />{l as string}</li>)}
          </ol>
          {tri && <><div className="c-head" style={{ marginTop: 14 }}><b>Rules chose</b></div>
            <div className="ca-tiers">{tri.recommendations.map(r => <span key={r.tier} style={{ borderColor: TIER_META[r.tier].color + '88', color: TIER_META[r.tier].color }}>{r.rule} · {TIER_META[r.tier].label}</span>)}</div></>}
        </div>
        <div className="glass c-card">
          <div className="c-head"><b>Check-in answers</b></div>
          <div className="ca-tiers">{ans.ttc && <span>{TTC[ans.ttc]}</span>}{flags.map(x => <span key={x} className="warm">{x}</span>)}{!flags.length && !ans.ttc && <span className="dim">Not completed</span>}</div>
          {st.lab && <><div className="c-head" style={{ marginTop: 14 }}><b>Lab result</b><span className="dim" style={{ fontSize: 12 }}>WHO 2021 lower limits</span></div>
            <table className="c-table"><tbody>{SEMEN_REF.map(r => <tr key={r.key}><td>{r.label}</td><td style={{ color: st.lab[r.key] < r.min ? 'var(--warm)' : undefined }}>{st.lab[r.key]} {r.unit}</td><td className="dim">≥ {r.min}</td></tr>)}</tbody></table></>}
          {(st.bookings ?? []).length > 0 && <><div className="c-head" style={{ marginTop: 14 }}><b>Appointments</b></div>{st.bookings.map((b: any) => <div key={b.ref} className="ca-book"><b>{b.slot}</b><span>{b.place} · {b.ref}</span></div>)}</>}
        </div>
        <div className="glass c-card">
          <div className="c-head"><b>Access log</b><span className="dim" style={{ fontSize: 12 }}>he can see this</span></div>
          <ul className="ca-log">
            {(detail?.access ?? []).slice(0, 8).map((a, i) => <li key={i}><b>{a.actor}</b> {a.what.toLowerCase()}<span>{fmt(a.at)}</span></li>)}
            {detail && !detail.access.length && <li className="dim">No views yet</li>}
          </ul>
          <div className="c-head" style={{ marginTop: 14 }}><b>His activity</b></div>
          <ul className="ca-log">{(st.audit ?? []).slice(0, 6).map((a: any, i: number) => <li key={i}>{a.what}<span>{fmt(a.at)}</span></li>)}</ul>
          <div className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>Signed in as {me}</div>
        </div>
      </div>
    </motion.section>
  )
}
