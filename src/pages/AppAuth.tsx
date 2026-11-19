// Welcome, sign-in, sign-up, guided first run and the profile sheet for the man's app.
import { AnimatePresence, motion } from 'framer-motion'
import { ReactNode, useEffect, useState } from 'react'
import IsoField from '../components/IsoField'
import { ClipExploded } from '../components/Device'
import { Bundle, call, demoList, DemoProfile, signIn, signUp } from '../engine/account'
import { AVATARS, DEMO_PASSWORD, initials, PatientProfile } from '../engine/profiles'
import './auth.css'

const ease = [0.16, 1, 0.3, 1] as const
const arrow = <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
const back = <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>

export function Avatar({ name, tone = 'teal', size = 40 }: { name: string; tone?: string; size?: number }) {
  return <span className="av" style={{ width: size, height: size, fontSize: size * 0.38, background: AVATARS[tone] ?? AVATARS.teal }}>{initials(name || '?')}</span>
}

export type AuthResult = { kind: 'guest'; lang: 'en' | 'ar' } | { kind: 'account'; bundle: Bundle }

/* ---------- Welcome + sign in / create account ---------- */
export function Welcome({ lang, setLang, onDone }: { lang: 'en' | 'ar'; setLang: (l: 'en' | 'ar') => void; onDone: (r: AuthResult) => void }) {
  const [stage, setStage] = useState<'home' | 'signin' | 'signup'>('home')
  const [demos, setDemos] = useState<DemoProfile[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { demoList().then(d => setDemos(d.filter(x => x.role === 'patient'))).catch(() => setDemos([])) }, [])
  const ar = lang === 'ar'
  const demo = async (id: string) => {
    setBusy(id); setErr(null)
    try { onDone({ kind: 'account', bundle: await signIn('patient', { demo: id }) }) } catch (e) { setErr(e instanceof Error ? e.message : 'Could not sign in'); setBusy(null) }
  }
  return (
    <motion.div className="au" initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.03, filter: 'blur(10px)' }} transition={{ duration: 0.5 }}>
      <div className="au-field"><IsoField heat={0.35} levels={9} /></div>
      <AnimatePresence mode="wait">
        {stage === 'home' && (
          <motion.div key="home" className="au-page" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.45, ease }}>
            <div className="au-top">
              <div className="au-brand"><img src="/brand/mark.svg" alt="" /><b>Alarzah</b></div>
              <button className="au-lang" onClick={() => setLang(ar ? 'en' : 'ar')}>{ar ? 'English' : 'العربية'}</button>
            </div>
            <div className="au-hero">
              <img src="/brand/clip-pod-hero.webp" alt="The Alarzah Clip and Pod (concept render)" />
              <span className="au-hero-tag">Concept render · reference design</span>
            </div>
            <h1 className="au-h1">{ar ? 'صحة الرجل، بخصوصية تامة.' : <>Men’s health,<br /><span className="thermal-text">privately.</span></>}</h1>
            <p className="au-lead">{ar ? 'فحص خاص، مشبك صغير يقيس الحرارة في المنزل، وطبيب يراجع كل إحالة.' : 'A private check-in, a small Clip that reads heat at home, and a clinician who signs off every referral.'}</p>
            <div className="au-actions">
              <button className="btn btn-primary" onClick={() => setStage('signup')}>{ar ? 'أنشئ حسابًا' : 'Create an account'} {arrow}</button>
              <button className="btn au-glassbtn" onClick={() => setStage('signin')}>{ar ? 'تسجيل الدخول' : 'Sign in'}</button>
              <button className="au-guest" onClick={() => onDone({ kind: 'guest', lang })}>{ar ? 'تابع كضيف · لا شيء يغادر هاتفك' : 'Continue as guest · nothing leaves this phone'}</button>
            </div>
            <div className="au-demos">
              <div className="au-kicker">Demo profiles · tap to sign in</div>
              <div className="au-demo-row">
                {demos === null && [0, 1, 2].map(k => <div key={k} className="au-demo skeleton" />)}
                {demos?.map(d => (
                  <button key={d.id} className="au-demo" onClick={() => demo(d.id)} disabled={!!busy}>
                    <Avatar name={d.name} tone={d.profile?.avatar} size={36} />
                    <div><b>{d.name}{busy === d.id ? ' …' : ''}</b><span>{d.blurb}</span></div>
                  </button>
                ))}
                {demos?.length === 0 && <div className="au-demo-off">Demo profiles need the server. Guest mode works offline.</div>}
              </div>
              {err && <div className="au-err">{err}</div>}
            </div>
          </motion.div>
        )}
        {stage === 'signin' && <SignIn key="in" onBack={() => setStage('home')} onDone={b => onDone({ kind: 'account', bundle: b })} />}
        {stage === 'signup' && <SignUp key="up" lang={lang} onBack={() => setStage('home')} onDone={b => onDone({ kind: 'account', bundle: b })} />}
      </AnimatePresence>
    </motion.div>
  )
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="au-field-row"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}
function Chips<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="au-chips">{options.map(([v, l]) => <button type="button" key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</div>
}

function SignIn({ onBack, onDone }: { onBack: () => void; onDone: (b: Bundle) => void }) {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  const go = async (e?: React.FormEvent) => {
    e?.preventDefault(); setBusy(true); setErr(null)
    try { onDone(await signIn('patient', { email, password: pw })) } catch (x) { setErr(x instanceof Error ? x.message : 'Could not sign in'); setBusy(false) }
  }
  return (
    <motion.form className="au-page au-form" onSubmit={go} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.4, ease }}>
      <button type="button" className="au-back" onClick={onBack}>{back}Back</button>
      <h2 className="au-h2">Welcome back</h2>
      <p className="au-lead">Sign in to see your records, your review and your bookings on any phone.</p>
      <div className="au-sheet">
        <Field label="Email or mobile number"><input autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
        <Field label="Password"><input type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" /></Field>
      </div>
      {err && <div className="au-err">{err}</div>}
      <button className="btn btn-primary" disabled={busy || !email || !pw}>{busy ? 'Signing in…' : 'Sign in'} {arrow}</button>
      <button type="button" className="au-guest" onClick={() => { setEmail('omar@demo.alarzah'); setPw(DEMO_PASSWORD) }}>Fill in a demo account (omar@demo.alarzah)</button>
    </motion.form>
  )
}

function SignUp({ lang, onBack, onDone }: { lang: 'en' | 'ar'; onBack: () => void; onDone: (b: Bundle) => void }) {
  const [step, setStep] = useState(0)
  const [f, setF] = useState({ alias: '', email: '', password: '', ageBand: '25–34', lang, group: 'Other', education: 'University', emirate: 'Abu Dhabi' })
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  const up = (p: Partial<typeof f>) => setF(o => ({ ...o, ...p }))
  const submit = async () => {
    setBusy(true); setErr(null)
    try { onDone(await signUp(f)) } catch (x) { setErr(x instanceof Error ? x.message : 'Could not create the account'); setBusy(false) }
  }
  return (
    <motion.div className="au-page au-form" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.4, ease }}>
      <button type="button" className="au-back" onClick={() => (step ? setStep(0) : onBack())}>{back}Back</button>
      <div className="au-steps"><i className="on" /><i className={step ? 'on' : ''} /></div>
      {step === 0 ? <>
        <h2 className="au-h2">Create your account</h2>
        <p className="au-lead">Use any name you like. We never ask for your real name or Emirates ID.</p>
        <div className="au-sheet">
          <Field label="What should we call you?" hint="A first name or a nickname"><input value={f.alias} onChange={e => up({ alias: e.target.value })} placeholder="e.g. Omar" /></Field>
          <Field label="Email or mobile number"><input autoComplete="username" value={f.email} onChange={e => up({ email: e.target.value })} placeholder="you@example.com" /></Field>
          <Field label="Password" hint="At least 8 characters"><input type="password" autoComplete="new-password" value={f.password} onChange={e => up({ password: e.target.value })} /></Field>
        </div>
        <button className="btn btn-primary" disabled={!f.alias || !f.email || f.password.length < 8} onClick={() => setStep(1)}>Continue {arrow}</button>
      </> : <>
        <h2 className="au-h2">A little about you</h2>
        <p className="au-lead">This tunes the advice and lets us check the service is fair to every group. You can change it later.</p>
        <div className="au-sheet">
          <Field label="Age"><Chips value={f.ageBand} onChange={v => up({ ageBand: v })} options={[['18–24', '18–24'], ['25–34', '25–34'], ['35–44', '35–44'], ['45+', '45+']]} /></Field>
          <Field label="Language"><Chips value={f.lang} onChange={v => up({ lang: v })} options={[['en', 'English'], ['ar', 'العربية']]} /></Field>
          <Field label="Emirate"><Chips value={f.emirate} onChange={v => up({ emirate: v })} options={[['Abu Dhabi', 'Abu Dhabi'], ['Al Ain', 'Al Ain'], ['Dubai', 'Dubai'], ['Other', 'Other']]} /></Field>
        </div>
        <div className="au-note">Your record is backed up to a secure server so it follows you to a new phone. Nothing is shared with a clinician until you send it. Never used for insurance, employment, marriage or visa paperwork.</div>
        {err && <div className="au-err">{err}</div>}
        <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create account'} {arrow}</button>
      </>}
    </motion.div>
  )
}

/* ---------- Guided first run ---------- */
const GUIDE = [
  { k: 'Check-in', t: '13 private questions', b: 'About three minutes, in Arabic or English, typed or spoken. If anything is urgent, the app tells you at once.', art: 'check' },
  { k: 'The Clip', t: 'Wear it for 3–7 days', b: 'It clips inside snug underwear and reads skin heat on the left and right. Your phone does the maths.', art: 'clip' },
  { k: 'The Pod', t: 'The lab test, from home', b: 'The Pod keeps the sample at body temperature and times the trip to the lab under an anonymous code.', art: 'pod' },
  { k: 'Your clinician', t: 'A doctor signs off every step', b: 'Fixed medical rules suggest the next steps. A clinician approves them before anything is booked.', art: 'doc' },
]
function GuideArt({ k }: { k: string }) {
  if (k === 'clip') return <div className="gd-art gd-clip"><ClipExploded open={0.55} labels={false} /></div>
  if (k === 'pod') return <div className="gd-art gd-photo"><img src="/brand/clip-pod-hero-2.webp" alt="The Alarzah Pod and Clip (concept render)" /></div>
  if (k === 'doc') return (
    <div className="gd-art gd-doc">
      {[['Rules', 'Andrology exam suggested', '#ffc15e'], ['Clinician', 'Approved · Dr. Mariam', '#7cf5b8'], ['You', 'Book on a working day', '#3be8e0']].map(([a, b, c], i) => (
        <motion.div key={a} className="gd-doc-row" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.18 }}><i style={{ background: c }} /><div><span>{a}</span><b>{b}</b></div></motion.div>
      ))}
    </div>
  )
  return (
    <div className="gd-art gd-check">
      {['Any sudden pain or swelling?', 'Trying for a baby? How long?', 'Hot job or long hours sitting?'].map((q, i) => (
        <motion.div key={q} className="gd-q" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.15 }} style={{ ['--i' as string]: i }}><span>{String(i + 1).padStart(2, '0')}</span>{q}<em>{i === 0 ? 'No' : i === 1 ? '6–12 mo' : 'Yes'}</em></motion.div>
      ))}
    </div>
  )
}
export function Guide({ name, onFinish }: { name?: string; onFinish: () => void }) {
  const [i, setI] = useState(0)
  const g = GUIDE[i]
  return (
    <motion.div className="au gd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.03, filter: 'blur(10px)' }} transition={{ duration: 0.45 }}>
      <div className="au-field"><IsoField heat={0.2 + i * 0.18} levels={8} /></div>
      <div className="au-page">
        <div className="au-top">
          <div className="au-kicker">{name ? `Welcome, ${name}` : 'Welcome'} · how it works</div>
          <button className="au-skip" onClick={onFinish}>Skip</button>
        </div>
        <div className="gd-progress">{GUIDE.map((_, k) => <i key={k} className={k < i ? 'done' : k === i ? 'on' : ''}><motion.b key={i} initial={{ width: 0 }} animate={{ width: k < i ? '100%' : k === i ? '100%' : 0 }} transition={{ duration: k === i ? 0.6 : 0 }} /></i>)}</div>
        <AnimatePresence mode="wait">
          <motion.div key={i} className="gd-body" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.4, ease }}>
            <GuideArt k={g.art} />
            <div className="au-kicker" style={{ color: 'var(--cool)' }}>Step {i + 1} of 4 · {g.k}</div>
            <h2 className="au-h2">{g.t}</h2>
            <p className="au-lead">{g.b}</p>
          </motion.div>
        </AnimatePresence>
        <button className="btn btn-primary" onClick={() => (i < GUIDE.length - 1 ? setI(i + 1) : onFinish())}>{i < GUIDE.length - 1 ? 'Next' : 'Start my check-in'} {arrow}</button>
      </div>
    </motion.div>
  )
}

/* ---------- Profile sheet ---------- */
export interface ProfileSheetProps {
  open: boolean; onClose: () => void
  account?: { id: string; name: string; email: string; demo: boolean }
  profile?: PatientProfile
  records: { label: string; value: string; tone?: string }[]
  onSave: (p: Partial<PatientProfile>) => void
  onSignOut: () => void
  onCreateAccount: () => void
  synced?: number
}
export function ProfileSheet({ open, onClose, account, profile, records, onSave, onSignOut, onCreateAccount, synced }: ProfileSheetProps) {
  const [edit, setEdit] = useState(false)
  const [d, setD] = useState<Partial<PatientProfile>>({})
  useEffect(() => { if (open) { setD(profile ?? {}); setEdit(false) } }, [open])
  const consent = { backup: true, shareWithCareTeam: false, research: false, ...(profile?.consent ?? {}) }
  const toggle = (k: keyof typeof consent) => onSave({ consent: { ...consent, [k]: !consent[k] } })
  return (
    <AnimatePresence>
      {open && <>
        <motion.div className="ps-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
        <motion.div className="ps" role="dialog" aria-label="Your profile" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
          <div className="ps-grab" />
          <div className="ps-head">
            <Avatar name={profile?.alias || account?.name || 'Guest'} tone={profile?.avatar} size={56} />
            <div style={{ minWidth: 0 }}>
              <b>{profile?.alias || account?.name || 'Guest'}</b>
              <span>{account ? `${account.email}${account.demo ? ' · demo profile' : ''}` : 'Guest · stored on this phone only'}</span>
              {account && <em>{synced ? `Backed up ${new Date(synced).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Backup on'}</em>}
            </div>
          </div>

          {!account && <button className="ps-cta" onClick={onCreateAccount}><b>Create an account</b><span>Keep your record if you change phones, and see your review on any device.</span></button>}

          <div className="ps-sec">
            <div className="ps-sec-h"><span>Details</span>{account && <button onClick={() => { if (edit) onSave(d); setEdit(!edit) }}>{edit ? 'Save' : 'Edit'}</button>}</div>
            <div className="ps-list">
              {([['alias', 'Name shown', 'text'], ['ageBand', 'Age', 'text'], ['emirate', 'Emirate', 'text'], ['familyPhysician', 'Family physician', 'text']] as const).map(([k, l]) => (
                <div key={k}><span>{l}</span>{edit ? <input value={(d as any)[k] ?? ''} onChange={e => setD(o => ({ ...o, [k]: e.target.value }))} /> : <b>{(profile as any)?.[k] || '—'}</b>}</div>
              ))}
              <div><span>Language</span><b>{profile?.lang === 'ar' ? 'العربية' : 'English'}</b></div>
            </div>
          </div>

          <div className="ps-sec">
            <div className="ps-sec-h"><span>Consent · you can change these any time</span></div>
            <div className="ps-list">
              {([['backup', 'Back up my record', 'Encrypted copy so it follows you to a new phone'], ['shareWithCareTeam', 'Let my care team see my record', 'Only reviewing clinicians; every view is logged'], ['research', 'Help improve the service', 'De-identified counts only, never your answers']] as const).map(([k, l, s]) => (
                <button key={k} className="ps-toggle" disabled={!account} onClick={() => toggle(k)}><div><b>{l}</b><span>{s}</span></div><i className={consent[k] ? 'on' : ''} /></button>
              ))}
            </div>
          </div>

          <div className="ps-sec">
            <div className="ps-sec-h"><span>Your records</span></div>
            <div className="ps-list">{records.map(r => <div key={r.label}><span>{r.label}</span><b style={{ color: r.tone }}>{r.value}</b></div>)}</div>
          </div>

          <button className="btn au-glassbtn" style={{ width: '100%' }} onClick={onSignOut}>{account ? 'Sign out' : 'Leave guest mode'}</button>
          <p className="ps-foot">Never used for insurance, employment, marriage or visa paperwork.</p>
        </motion.div>
      </>}
    </AnimatePresence>
  )
}

export const saveRemote = (state: unknown, profile?: Partial<PatientProfile>) => call<{ savedAt: number }>('save', { state, profile }, 'patient')
