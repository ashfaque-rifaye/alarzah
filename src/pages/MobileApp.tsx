import { AnimatePresence, motion } from 'framer-motion'
import QRCode from 'qrcode'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import BreezeField from '../components/BreezeField'
import { Heatmap, TempGauge, ThermalChart, thermal } from '../components/viz'
import { AskPanel, factsFrom, useVoice } from '../components/Ask'
import { analyse } from '../engine/signals'
import { Kind, KIND_LABEL, simulate } from '../engine/simulate'
import { Checkin, EMPTY_CHECKIN, SEMEN_REF, SemenResult, TIER_META, TierId, triage, Ttc } from '../engine/rules'
import { readReviews, sendCase, subscribe } from '../engine/sync'
import { Lang, QUESTIONS, STRINGS, Strings, TTC_OPTIONS } from '../i18n'
import './mobile.css'

type Tab = 'home' | 'check' | 'clip' | 'care' | 'vault'
type PodState = 'none' | 'ordered' | 'collected' | 'delivered'
interface Audit { at: number; what: string }
interface State {
  lang: Lang
  onboarded: boolean
  answers: Record<string, boolean | Ttc | undefined>
  checkDone: boolean
  paired: boolean
  clipKind: Kind
  weekDone: boolean
  pod: PodState
  collectedAt?: number
  breach: boolean
  audit: Audit[]
  reviewedAt?: number
  reviewNote?: string
  sharedAt?: number
  lab?: SemenResult & { at: number }
  bookings: Booking[]
  anonId: string
}
interface Booking { tier: TierId; place: string; slot: string; ref: string; at: number }
const KEY = 'alarzah.v1'
const fresh = (): State => ({
  lang: 'en', onboarded: false, answers: {}, checkDone: false, paired: false, clipKind: 'asymmetry', weekDone: false,
  pod: 'none', breach: false, bookings: [], audit: [{ at: Date.now(), what: 'Anonymous profile created on this device' }],
  anonId: Math.random().toString(36).slice(2, 6).toUpperCase(),
})
const params = new URLSearchParams(location.search)
/** ?demo=1 preloads a filled-in journey (for the demo video and screenshots); ?tab=, ?kind=, ?lang=ar, ?pod= adjust it. */
function demoState(): State {
  return {
    ...fresh(), lang: (params.get('lang') as Lang) || 'en', onboarded: true, anonId: 'K7Q2',
    answers: { pain: false, lump: false, ttc: '6to12', partner35: false, steroids: true, udt: false, pastTesticular: false, heatJob: true, smoke: false, metabolic: false, infection: false, erection: false, noSpermBefore: false },
    checkDone: params.get('check') !== '0', paired: params.get('paired') !== '0', weekDone: params.get('week') !== '0', clipKind: (params.get('kind') as Kind) || 'both',
    pod: (params.get('pod') as PodState) || 'collected', collectedAt: Date.now() - 754000, reviewedAt: params.get('reviewed') === '0' ? undefined : Date.now(),
    sharedAt: params.get('reviewed') === '0' ? undefined : Date.now() - 900000, reviewNote: 'Approved. Please book the examination and the home test.',
    lab: params.get('lab') ? { ...labFor((params.get('kind') as Kind) || 'both'), at: Date.now() - 3600e3 } : undefined,
    bookings: params.get('book') ? [{ tier: 'andrology', place: PLACES.andrology!, slot: slots()[1], ref: 'BK-4Q7M', at: Date.now() - 600e3 }] : [],
    audit: [
      { at: Date.now() - 60000, what: 'One-time summary link created (expires in 24 h, opens once)' },
      { at: Date.now() - 754000, what: 'Sample collected; Pod timer started' },
      { at: Date.now() - 900000, what: 'Referral reviewed by clinician (simulated)' },
      { at: Date.now() - 1800000, what: '7 days of Clip readings analysed on the phone' },
      { at: Date.now() - 2400000, what: 'Check-in completed (answers kept on device)' },
      { at: Date.now() - 2500000, what: 'Started anonymously (no name, no ID)' },
    ],
  }
}
function load(): State {
  if (params.get('demo')) return demoState()
  if (params.get('fresh')) return { ...fresh(), lang: (params.get('lang') as Lang) || 'en' }
  try { const s = localStorage.getItem(KEY); if (s) return { ...fresh(), ...JSON.parse(s) } } catch { /* storage blocked */ }
  return fresh()
}

/** Simulated lab result for the demo: heat exposure lowers it, otherwise within range. */
function labFor(kind: Kind): SemenResult {
  return kind === 'heat' || kind === 'both'
    ? { volume: 2.6, concentration: 11, totalMotility: 36, progressive: 24, morphology: 5 }
    : { volume: 2.9, concentration: 38, totalMotility: 57, progressive: 41, morphology: 6 }
}
const PLACES: Partial<Record<TierId, string>> = {
  urgentUrology: 'Urology clinic · urgent slot', andrology: 'Andrology clinic · partner network', fertility: 'Fertility centre · partner network', familyPhysician: 'Your family physician (Sahatna)',
}
function slots() {
  const out: string[] = []; const d = new Date(); let add = 1
  while (out.length < 3) { const x = new Date(d.getTime() + add * 864e5); add++; if (x.getDay() === 5 || x.getDay() === 6) continue
    out.push(`${x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${['09:30', '13:15', '17:40'][out.length]}`) }
  return out
}
const caseCode = (s: State) => `ALZ-${s.anonId}`

const Ctx = createContext<{ s: State; set: (p: Partial<State>) => void; t: Strings; log: (w: string) => void; go: (t: Tab) => void; reset: () => void; notify: (m: string) => void }>(null!)
const useApp = () => useContext(Ctx)

const spring = { type: 'spring', stiffness: 380, damping: 32 } as const
const page = { initial: { opacity: 0, y: 18, filter: 'blur(6px)' }, animate: { opacity: 1, y: 0, filter: 'blur(0px)' }, exit: { opacity: 0, y: -10, filter: 'blur(6px)' }, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }

/* ---------- icons ---------- */
const I = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="3.5" width="14" height="17" rx="3" /><path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  clip: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="6" width="16" height="7" rx="3.5" /><circle cx="8.5" cy="17.5" r="2" /><circle cx="15.5" cy="17.5" r="2" /><path d="M8.5 13v2.5M15.5 13v2.5" /></svg>,
  care: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 20s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.7-7 10-7 10Z" strokeLinejoin="round" /><path d="M9 11h6M12 8v6" strokeLinecap="round" /></svg>,
  vault: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4.5" y="10" width="15" height="10" rx="3" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /><circle cx="12" cy="15" r="1.4" fill="currentColor" /></svg>,
  arrow: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  lock: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
}

/* ---------- shell ---------- */
export default function MobileApp() {
  const [s, setS] = useState<State>(load)
  const [tab, setTab] = useState<Tab>(() => (params.get('tab') as Tab) || 'home')
  const [wide, setWide] = useState(() => window.innerWidth > 760 && !params.has('embed'))
  const [scale, setScale] = useState(() => Math.min(1, (window.innerHeight - 40) / 876))
  useEffect(() => { const f = () => { setWide(window.innerWidth > 760 && !params.has('embed')); setScale(Math.min(1, (window.innerHeight - 40) / 876)) }; window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ } }, [s])
  useEffect(() => { document.title = 'Alarzah · App' }, [])
  const [toast, setToast] = useState<string | null>(null)
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(t => (t === m ? null : t)), 4200) }
  useEffect(() => {
    const check = () => {
      const r = readReviews().find(x => x.code === caseCode(s))
      if (r && (!s.reviewedAt || r.at > s.reviewedAt)) {
        setS(o => ({ ...o, reviewedAt: r.at, reviewNote: r.note, audit: [{ at: Date.now(), what: `Clinician ${r.by} ${r.decision} your referral` }, ...o.audit] }))
        notify(`${r.by} reviewed your referral`)
      }
    }
    check()
    return subscribe(check)
  }, [s.anonId, s.reviewedAt])
  useEffect(() => {
    if (s.pod !== 'delivered' || s.lab) return
    const id = setTimeout(() => {
      setS(o => ({ ...o, lab: { ...labFor(o.clipKind), at: Date.now() }, audit: [{ at: Date.now(), what: 'Lab result received with the anonymous code (simulated)' }, ...o.audit] }))
      notify('Your semen analysis result is ready')
    }, 7000)
    return () => clearTimeout(id)
  }, [s.pod, s.lab])
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }) }, [tab])
  const api = useMemo(() => ({
    s, t: STRINGS[s.lang],
    set: (p: Partial<State>) => setS(o => ({ ...o, ...p })),
    log: (what: string) => setS(o => ({ ...o, audit: [{ at: Date.now(), what }, ...o.audit].slice(0, 40) })),
    go: (t: Tab) => setTab(t),
    reset: () => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } setS(fresh()); setTab('home') },
    notify,
  }), [s])

  const app = (
    <Ctx.Provider value={api}>
      <div className="m-root" dir={s.lang === 'ar' ? 'rtl' : 'ltr'} lang={s.lang}>
        {!wide ? <div style={{ height: 'max(14px, env(safe-area-inset-top))', flex: 'none' }} /> : <div className="m-status"><span>9:41</span><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5" width="3" height="7" rx="1" /><rect x="10" y="2" width="3" height="10" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" opacity=".4" /></svg>
          <svg width="26" height="12" viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".5" /><rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" /><rect x="23.5" y="4" width="2" height="4" rx="1" fill="currentColor" opacity=".5" /></svg>
        </span></div>}
        <div className="m-scroll" ref={scrollRef}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={tab + s.lang} {...page}>
              {tab === 'home' && <Home />}
              {tab === 'check' && <CheckIn />}
              {tab === 'clip' && <ClipScreen />}
              {tab === 'care' && <Care />}
              {tab === 'vault' && <Vault />}
            </motion.div>
          </AnimatePresence>
        </div>
        <nav className="m-tabs" aria-label="App sections">
          {(['home', 'check', 'clip', 'care', 'vault'] as Tab[]).map(k => (
            <button key={k} className={`m-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)} aria-current={tab === k}>
              {tab === k && <motion.div layoutId="tabglow" className="m-tab-glow" transition={spring} />}
              {I[k]}<span>{STRINGS[s.lang][k]}</span>
            </button>
          ))}
        </nav>
        <AnimatePresence>{toast && <motion.div className="m-toast" role="status" initial={{ opacity: 0, y: -20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }}><span className="m-toast-dot" />{toast}</motion.div>}</AnimatePresence>
        <AnimatePresence>{!s.onboarded && <Onboarding />}</AnimatePresence>
      </div>
    </Ctx.Provider>
  )

  if (!wide) return <div className="m-full">{app}</div>
  return (
    <div className="m-stage grain">
      <div className="m-stage-bg"><BreezeField density={0.7} /></div>
      <div className="m-desktop">
        <SideLeft />
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'center', height: 876 * scale, display: 'grid', placeItems: 'center' }}>
        <motion.div className="phone" initial={{ opacity: 0, y: 40, rotateX: 8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} style={{ perspective: 1200 }}>
          <div className="island" />
          <div className="phone-screen">{app}</div>
        </motion.div>
        </div>
        <SideRight />
      </div>
    </div>
  )
}

function SideLeft() {
  return (
    <div className="m-side" style={{ justifySelf: 'end' }}>
      <Link to="/" className="chip"><span className="dot" />Alarzah · Mobile app</Link>
      <h1>The whole check, <span className="thermal-text">in his pocket.</span></h1>
      <p>This is the installable Alarzah app, running live. Everything you enter stays in this browser. All readings are simulated for the demo.</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
        <Link className="btn btn-ghost" to="/clinic">Clinician console {I.arrow}</Link>
        <Link className="btn btn-ghost" to="/">Product story</Link>
      </div>
    </div>
  )
}
function SideRight() {
  const [qr, setQr] = useState('')
  useEffect(() => { QRCode.toDataURL(`${location.origin}/app`, { margin: 0, width: 240, color: { dark: '#04070b', light: '#ffffff' } }).then(setQr) }, [])
  return (
    <div className="m-side">
      <div className="glass" style={{ padding: 22 }}>
        <div className="eyebrow">Open on your phone</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 14 }}>
          {qr && <img className="qr" src={qr} alt="QR code to open the Alarzah app on a phone" />}
          <p style={{ margin: 0, fontSize: 14 }}>Scan, then <b>Add to Home Screen</b>. It installs as a full-screen app (PWA) and works offline.</p>
        </div>
      </div>
      <div className="glass" style={{ padding: 22, marginTop: 14 }}>
        <div className="eyebrow" style={{ color: 'var(--warm)' }}>Try this path</div>
        <ol style={{ margin: '12px 0 0', paddingInlineStart: 18, color: 'var(--muted)', fontSize: 14, lineHeight: 1.8 }}>
          <li>Check-in: answer "Yes" to the first question to see the red-flag interrupt.</li>
          <li>Clip: pair, then pick a week and fast-forward 7 days.</li>
          <li>Care: see each next step and the rule behind it.</li>
          <li>Vault: make a one-time share link, then delete everything.</li>
        </ol>
      </div>
    </div>
  )
}

/* ---------- onboarding ---------- */
function Onboarding() {
  const { s, set, t, log } = useApp()
  const [i, setI] = useState(0)
  const slides = [
    { t: t.ob1t, b: t.ob1b, art: <LockArt /> },
    { t: t.ob2t, b: t.ob2b, art: <ClipArt /> },
    { t: t.ob3t, b: t.ob3b, art: <LadderArt /> },
  ]
  return (
    <motion.div className="ob" initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04, filter: 'blur(10px)' }} transition={{ duration: 0.5 }}>
      <div className="m-between">
        <div className="m-row"><img src="/icon.svg" width={30} height={30} alt="" /><b style={{ fontFamily: 'var(--display)' }}>Alarzah</b></div>
        <button className="m-lang" onClick={() => set({ lang: s.lang === 'en' ? 'ar' : 'en' })}>{s.lang === 'en' ? 'العربية' : 'English'}</button>
      </div>
      <div className="ob-art">
        <motion.div key={i} initial={{ opacity: 0, scale: 0.85, rotate: -6 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 18 }}>{slides[i].art}</motion.div>
      </div>
      <motion.div key={'t' + i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <h2>{slides[i].t}</h2>
        <p className="muted" style={{ margin: 0 }}>{slides[i].b}</p>
      </motion.div>
      <div className="dots">{slides.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
      <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => { if (i < 2) setI(i + 1); else { set({ onboarded: true }); log('Started anonymously (no name, no ID)') } }}>
        {i < 2 ? t.next : t.start} {I.arrow}
      </button>
    </motion.div>
  )
}
const LockArt = () => (
  <div style={{ position: 'relative', width: 220, height: 220, display: 'grid', placeItems: 'center' }}>
    {[0, 1, 2].map(k => <motion.div key={k} style={{ position: 'absolute', inset: k * 26, borderRadius: '50%', border: '1px solid rgba(59,232,224,.35)' }} animate={{ rotate: k % 2 ? -360 : 360 }} transition={{ duration: 18 + k * 6, repeat: Infinity, ease: 'linear' }}>
      <div style={{ position: 'absolute', top: -4, left: '50%', width: 8, height: 8, borderRadius: 8, background: ['#3be8e0', '#7cf5b8', '#ffc15e'][k], boxShadow: `0 0 14px ${['#3be8e0', '#7cf5b8', '#ffc15e'][k]}` }} />
    </motion.div>)}
    <svg width="74" height="74" viewBox="0 0 24 24" fill="none" stroke="url(#lg)" strokeWidth="1.4"><defs><linearGradient id="lg" x1="0" x2="1"><stop stopColor="#3be8e0" /><stop offset="1" stopColor="#ffc15e" /></linearGradient></defs><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.2" fill="#ffc15e" /></svg>
  </div>
)
const ClipArt = () => (
  <div style={{ position: 'relative', width: 240, height: 200 }}>
    <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }} style={{ position: 'absolute', left: 30, right: 30, top: 30, height: 74, borderRadius: 30, background: 'linear-gradient(145deg,#1b252c,#0a1015)', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 30px 60px -20px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.1)' }}>
      <div style={{ position: 'absolute', left: 20, top: 30, width: 8, height: 8, borderRadius: 8, background: '#3be8e0', boxShadow: '0 0 12px #3be8e0' }} />
    </motion.div>
    {[60, 150].map((x, k) => <motion.div key={x} animate={{ boxShadow: [`0 0 20px ${k ? '#ffc15e' : '#3be8e0'}`, `0 0 50px ${k ? '#ff6a3d' : '#7cf5b8'}`, `0 0 20px ${k ? '#ffc15e' : '#3be8e0'}`] }} transition={{ duration: 2.4, repeat: Infinity, delay: k }}
      style={{ position: 'absolute', left: x, top: 128, width: 34, height: 34, borderRadius: '50%', background: k ? 'radial-gradient(#ffc15e,#ff6a3d)' : 'radial-gradient(#7cf5b8,#3be8e0)' }} />)}
  </div>
)
const LadderArt = () => (
  <div style={{ width: 230 }}>
    {(['emergency', 'urgentUrology', 'fertility', 'andrology', 'familyPhysician', 'semen', 'selfCare'] as const).map((k, i) => (
      <motion.div key={k} initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.08 }}
        style={{ height: 22, marginBottom: 7, borderRadius: 8, width: `${100 - i * 7}%`, background: `linear-gradient(90deg, ${TIER_META[k].color}, transparent)`, opacity: 0.85, fontSize: 11, padding: '3px 10px', color: '#031013', fontWeight: 600 }}>{TIER_META[k].short}</motion.div>
    ))}
  </div>
)

/* ---------- home ---------- */
function Header({ title, sub }: { title: string; sub?: string }) {
  const { s, set, t } = useApp()
  return (
    <>
      <div className="m-top">
        <div className="m-row"><div className="m-avatar">{s.anonId}</div><div><div style={{ fontSize: 12 }} className="muted">{t.guest} · {s.anonId}</div><div className="m-row" style={{ gap: 6, fontSize: 12, color: 'var(--mint)' }}>{I.lock}{t.onDevice}</div></div></div>
        <button className="m-lang" onClick={() => set({ lang: s.lang === 'en' ? 'ar' : 'en' })} aria-label={t.lang}>{s.lang === 'en' ? 'ع' : 'EN'}</button>
      </div>
      <h1 className="m-h1">{title}</h1>
      {sub && <p className="muted" style={{ margin: '0 0 14px', fontSize: 14 }}>{sub}</p>}
    </>
  )
}

function useClip() {
  const { s } = useApp()
  return useMemo(() => {
    if (!s.paired || !s.weekDone) return { trace: undefined, analysis: undefined }
    const trace = simulate(s.clipKind, 11)
    return { trace, analysis: analyse(trace) }
  }, [s.paired, s.weekDone, s.clipKind])
}
function toCheckin(a: State['answers']): Checkin {
  const c: Checkin = { ...EMPTY_CHECKIN }
  for (const [k, v] of Object.entries(a)) (c as any)[k] = k === 'ttc' ? (v ?? 'none') : !!v
  return c
}

function Home() {
  const { s, t, go } = useApp()
  const { analysis } = useClip()
  const done = [s.checkDone, s.paired && s.weekDone, s.checkDone && !!analysis]
  const n = done.filter(Boolean).length
  const tri = triage(toCheckin(s.answers), analysis)
  return (
    <>
      <Header title={t.greeting} sub={t.appTagline} />
      <div className="orb-wrap">
        <motion.div className="orb" animate={{ rotate: 360 }} transition={{ duration: 30, repeat: Infinity, ease: 'linear' }} />
        <div className="orb-label"><div>
          <div style={{ font: '600 52px var(--display)', letterSpacing: '-0.04em' }}>{n}<span className="dim" style={{ fontSize: 26 }}>/3</span></div>
          <div className="muted" style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase' }}>{t.yourJourney}</div>
        </div></div>
      </div>
      {[t.step1, t.step2, t.step3].map((label, k) => (
        <button key={k} className="step-pill" style={{ width: '100%', textAlign: 'start' }} onClick={() => go((['check', 'clip', 'care'] as Tab[])[k])}>
          <div className={`step-num ${done[k] ? 'done' : ''}`}>{done[k] ? '✓' : k + 1}</div>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{label}</div><div className="muted" style={{ fontSize: 12.5 }}>{done[k] ? t.done : t.notStarted}</div></div>
          <span className="muted">{I.arrow}</span>
        </button>
      ))}
      {s.checkDone && (
        <motion.div className="glass m-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 6 }}>
          <div className="eyebrow">{t.nextStep}</div>
          <div className="m-row" style={{ marginTop: 10 }}>
            <div style={{ width: 10, height: 44, borderRadius: 6, background: TIER_META[tri.recommendations[0].tier].color, boxShadow: `0 0 16px ${TIER_META[tri.recommendations[0].tier].color}` }} />
            <div><div style={{ fontWeight: 600 }}>{tri.recommendations[0].title}</div><div className="muted" style={{ fontSize: 12.5 }}>{TIER_META[tri.recommendations[0].tier].label}</div></div>
          </div>
        </motion.div>
      )}
      {s.bookings.length > 0 && <div className="glass m-card" style={{ marginTop: 6 }}>
        <div className="eyebrow" style={{ color: 'var(--mint)' }}>Upcoming</div>
        {s.bookings.map(b => <div key={b.ref} className="m-between" style={{ marginTop: 10, fontSize: 13.5 }}><div><b>{TIER_META[b.tier].label}</b><div className="muted" style={{ fontSize: 12 }}>{b.place}</div></div><span className="mono" style={{ fontSize: 12 }}>{b.slot}</span></div>)}
      </div>}
      <div className="glass m-card" style={{ marginTop: 6 }}>
        <div className="m-between"><div><div style={{ fontWeight: 600 }}>Alarzah Pod</div><div className="muted" style={{ fontSize: 12.5 }}>{s.lab ? 'Lab result ready' : s.pod === 'delivered' ? 'At the lab, result on the way' : 'Semen test at home, lab-grade result'}</div></div>
          <button className="btn btn-ghost" style={{ padding: '9px 14px', fontSize: 13 }} onClick={() => go('care')}>{s.lab ? 'View result' : s.pod === 'none' ? t.orderPod : s.pod === 'ordered' ? 'Collect' : s.pod === 'collected' ? 'In transit' : 'At lab'}</button></div>
      </div>
    </>
  )
}

/* ---------- check-in ---------- */
function CheckIn() {
  const { s, set, t, log, go } = useApp()
  const visible = QUESTIONS.filter(q => q.id !== 'partner35' || (s.answers.ttc && s.answers.ttc !== 'none'))
  const [i, setI] = useState(() => (params.has('q') ? Number(params.get('q')) : s.checkDone ? visible.length : 0))
  const [alarm, setAlarm] = useState<null | 'pain' | 'lump'>(() => (params.get('alarm') as 'pain' | 'lump') || null)
  const voice = useVoice(s.lang)
  const q = visible[i]
  const answer = (v: boolean | Ttc | undefined) => {
    set({ answers: { ...s.answers, [q.id]: v } })
    if (q.redFlag && v === true) { setAlarm(q.id as 'pain' | 'lump'); log(`Red flag shown immediately: ${q.id}`); return }
    setTimeout(() => setI(x => x + 1), 180)
  }
  useEffect(() => { if (i >= visible.length && !s.checkDone) { set({ checkDone: true }); log('Check-in completed (answers kept on device)') } }, [i])
  if (i >= visible.length) return (
    <>
      <Header title={t.step1} />
      <div className="glass q-card" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: 360 }}>
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }} style={{ width: 84, height: 84, borderRadius: 28, display: 'grid', placeItems: 'center', background: 'var(--thermal)', color: '#031013', fontSize: 40 }}>✓</motion.div>
        <h3 style={{ marginTop: 18, fontSize: 24 }}>{t.done}</h3>
        <p className="muted" style={{ fontSize: 14 }}>{Object.keys(s.answers).length} answers saved on this phone only.</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn btn-primary" onClick={() => go('clip')}>{t.pairClip}</button>
          <button className="btn btn-ghost" onClick={() => { setI(0); set({ checkDone: false }) }}>Redo</button>
        </div>
      </div>
    </>
  )
  return (
    <>
      <Header title={t.step1} />
      <div className="m-between" style={{ marginBottom: 10, fontSize: 12.5 }}><span className="muted">{i + 1} / {visible.length}</span><span className="muted">{t.onDevice}</span></div>
      <div className="progress" style={{ marginBottom: 14 }}><motion.div animate={{ width: `${((i + 1) / visible.length) * 100}%` }} transition={spring} /></div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={q.id} className="glass q-card" initial={{ opacity: 0, x: 40, rotate: 1.5 }} animate={{ opacity: 1, x: 0, rotate: 0 }} exit={{ opacity: 0, x: -40, rotate: -1.5 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
          {q.redFlag && <span className="chip" style={{ color: '#ffb39a', borderColor: 'rgba(255,106,61,.5)', alignSelf: 'flex-start' }}>Safety question</span>}
          <div className="q-text">{s.lang === 'ar' ? q.ar : q.en}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <button className="chip" onClick={() => voice.speak(s.lang === 'ar' ? q.ar : q.en)}>🔊 {s.lang === 'ar' ? 'استمع' : 'Listen'}</button>
            {voice.canListen && q.kind !== 'ttc' && <button className="chip" style={voice.listening ? { color: '#fff', background: '#ff4d3d', borderColor: '#ff4d3d' } : undefined}
              onClick={() => voice.listen(txt => { const y = /(yes|yeah|yep)|نعم|اي|أيوه/i.test(txt), n = /(no|nope)|لا/i.test(txt); if (y) answer(true); else if (n) answer(false) })}>🎙 {s.lang === 'ar' ? 'أجب بصوتك' : 'Answer by voice'}</button>}
          </div>
          {(s.lang === 'ar' ? q.hintAr : q.hintEn) && <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>{s.lang === 'ar' ? q.hintAr : q.hintEn}</p>}
          <div style={{ marginTop: 'auto' }}>
            {q.kind === 'ttc'
              ? TTC_OPTIONS.map(o => <button key={o.v} className={`q-opt ${s.answers.ttc === o.v ? 'sel' : ''}`} onClick={() => answer(o.v as Ttc)}>{s.lang === 'ar' ? o.ar : o.en}<span>{I.arrow}</span></button>)
              : [[t.yes, true], [t.no, false], [t.preferNot, undefined]].map(([l, v]) => (
                <motion.button whileTap={{ scale: 0.97 }} key={String(l)} className={`q-opt ${s.answers[q.id] === v && q.id in s.answers ? 'sel' : ''}`} onClick={() => answer(v as boolean | undefined)}>{l as string}<span>{I.arrow}</span></motion.button>))}
          </div>
        </motion.div>
      </AnimatePresence>
      {i > 0 && <button className="muted" style={{ marginTop: 12, fontSize: 14 }} onClick={() => setI(i - 1)}>← {t.back}</button>}
      <AnimatePresence>{alarm && (
        <motion.div className="alarm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} style={{ width: 64, height: 64, borderRadius: 22, background: '#ff4d3d', display: 'grid', placeItems: 'center', fontSize: 34, fontWeight: 700, boxShadow: '0 0 50px #ff4d3d' }}>!</motion.div>
          <h2 style={{ fontSize: 30, margin: '22px 0 10px' }}>{alarm === 'pain' ? 'Go to an emergency department now' : 'See a urologist within days'}</h2>
          <p style={{ color: '#ffd2c6' }}>{alarm === 'pain' ? 'Sudden severe pain or swelling can be a twisted testicle. It needs treatment within hours. Do not wait for this app or for a clinician review.' : 'A new lump must be examined promptly, usually with an ultrasound. Most lumps are not cancer, but it has to be checked.'}</p>
          <div className="glass" style={{ padding: 14, marginTop: 8, borderColor: 'rgba(255,255,255,.2)' }}>
            <div className="mono" style={{ color: '#ffd2c6' }}>Rule {alarm === 'pain' ? 'R1' : 'R2'} · fixed rule, no AI · shown instantly</div>
          </div>
          <div style={{ marginTop: 'auto', display: 'grid', gap: 10 }}>
            {alarm === 'pain' && <a className="btn" style={{ background: '#fff', color: '#2a0a06' }} href="tel:998">Call 998 (UAE ambulance)</a>}
            <button className="btn btn-ghost" onClick={() => { setAlarm(null); setI(x => x + 1) }}>I understand, continue check-in</button>
          </div>
        </motion.div>
      )}</AnimatePresence>
    </>
  )
}

/* ---------- clip ---------- */
function ClipScreen() {
  const { s, set, t, log } = useApp()
  const [scan, setScan] = useState(false)
  const [ff, setFf] = useState(0)
  const { trace, analysis } = useClip()
  const live = useLive(s.clipKind)
  const nav = navigator as Navigator & { bluetooth?: { requestDevice: (o: unknown) => Promise<unknown> } }
  const pair = async (real: boolean) => {
    setScan(true)
    if (real && nav.bluetooth) {
      try { await nav.bluetooth.requestDevice({ filters: [{ namePrefix: 'Alarzah' }], optionalServices: ['health_thermometer'] }); log('Real Clip found over Bluetooth') }
      catch { log('No real Clip found nearby; demo Clip used instead') }
    }
    setTimeout(() => { setScan(false); set({ paired: true }); log('Demo Clip paired (simulated readings)') }, 1600)
  }
  const fastForward = () => {
    setFf(1)
    const id = setInterval(() => setFf(v => { if (v >= 7) { clearInterval(id); set({ weekDone: true }); log(`7 days of Clip readings analysed on the phone (${KIND_LABEL[s.clipKind]})`); return 8 } return v + 1 }), 280)
  }
  if (!s.paired) return (
    <>
      <Header title={t.pairClip} sub="Clip it into ordinary underwear. Two soft pads rest left and right. No camera, no microphone, no images." />
      <div className="glass m-card" style={{ textAlign: 'center', padding: 26 }}>
        <div className="radar">{scan && <><span /><span /><span /></>}<ClipArt /></div>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => pair(false)} disabled={scan}>{scan ? 'Pairing…' : 'Use the demo Clip'}</button>
        {nav.bluetooth && !scan && <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => pair(true)}>Find a real Clip (Bluetooth)</button>}
        <p className="dim" style={{ fontSize: 12, margin: '12px 0 0' }}>Uses Web Bluetooth if a real Clip is nearby; otherwise a demo Clip with simulated readings.</p>
      </div>
    </>
  )
  return (
    <>
      <Header title={t.clip} />
      <div className="glass m-card">
        <div className="m-between" style={{ marginBottom: 6 }}>
          <span className="chip"><span className="dot" style={{ animation: 'pulse 1.4s infinite' }} />{t.live} · demo Clip</span>
          <span className="muted" style={{ fontSize: 12 }}>{t.posture}: {live.posture}</span>
        </div>
        <div className="m-between" style={{ justifyContent: 'space-around' }}>
          <TempGauge value={live.left} label={t.left} size={132} />
          <TempGauge value={live.right} label={t.right} size={132} />
        </div>
        <div className="m-between" style={{ fontSize: 12.5 }}><span className="muted">{t.ambient} {live.ambient.toFixed(1)}°</span><span className="muted">Δ L–R <b style={{ color: 'var(--ink)' }}>{(live.left - live.right).toFixed(2)}°</b></span></div>
      </div>
      <div className="seg" style={{ margin: '4px 0 10px' }}>
        {(['typical', 'heat', 'asymmetry', 'both', 'poorWear', 'fault'] as Kind[]).map(k => <button key={k} className={s.clipKind === k ? 'on' : ''} onClick={() => set({ clipKind: k, weekDone: false })}>{KIND_LABEL[k]}</button>)}
      </div>
      {!s.weekDone ? (
        <div className="glass m-card" style={{ textAlign: 'center' }}>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 0 }}>In real life you wear it for 3–7 days. For the demo, fast-forward a simulated week.</p>
          <div className="progress" style={{ margin: '10px 0 14px' }}><motion.div animate={{ width: `${Math.min(ff, 7) / 7 * 100}%` }} /></div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={fastForward} disabled={ff > 0 && ff < 8}>{ff > 0 && ff < 8 ? `Day ${ff} of 7…` : 'Fast-forward 7 days'}</button>
        </div>
      ) : trace && analysis && (
        <>
          <div className="glass m-card" style={{ padding: 12 }}><ThermalChart trace={trace} height={150} compact />
            <div className="m-between" style={{ fontSize: 11.5, marginTop: 6 }} ><span style={{ color: '#ffc15e' }}>● {t.left}</span><span style={{ color: '#3be8e0' }}>● {t.right}</span><span className="dim">shaded = lying</span></div></div>
          <div className="glass m-card" style={{ overflowX: 'auto' }}><Heatmap trace={trace} cell={10} gap={2} /></div>
          {analysis.status !== 'ok' ? (
            <div className="glass m-card" style={{ borderColor: 'rgba(255,193,94,.5)' }}><div className="tier-tag" style={{ color: 'var(--warm)' }}>No result</div><p style={{ margin: '6px 0 0', fontSize: 14 }}>{analysis.reason}</p></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Sig label={t.heatLoad} v={`${analysis.heatHoursPerDay!.toFixed(1)} h/d`} flag={analysis.highHeat} rule="≥ 3 h/day at ≥ 35.0 °C" />
              <Sig label={t.pattern} v={`${analysis.diffUpright!.toFixed(2)}°`} flag={analysis.asymmetryPattern} rule={`upright vs ${analysis.diffLying!.toFixed(2)}° lying`} />
              <Sig label={t.cooling} v={`${analysis.coolingDrop!.toFixed(2)}°`} rule="upright minus lying" />
              <Sig label={t.wear} v={`${analysis.wornHours.toFixed(0)} h`} rule="≥ 72 h needed" />
            </div>
          )}
          <p className="dim" style={{ fontSize: 12, marginTop: 10 }}>{t.notDiagnosis} Calculated by fixed rules on the phone; no AI.</p>
        </>
      )}
    </>
  )
}
function Sig({ label, v, flag, rule }: { label: string; v: string; flag?: boolean; rule: string }) {
  return (
    <motion.div className="sig" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={flag ? { borderColor: 'rgba(255,193,94,.55)', boxShadow: '0 0 30px -14px #ffc15e' } : undefined}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div className="sig-v" style={{ color: flag ? 'var(--warm)' : undefined }}>{v}</div>
      <div className="dim" style={{ fontSize: 11 }}>{rule}</div>
    </motion.div>
  )
}
function useLive(kind: Kind) {
  const [v, setV] = useState({ left: 34.2, right: 34.0, ambient: 29, posture: 'sitting' })
  useEffect(() => {
    const id = setInterval(() => setV(o => {
      const hot = kind === 'heat' || kind === 'both' ? 0.9 : 0, asym = kind === 'asymmetry' || kind === 'both' ? 0.8 : 0
      const j = () => (Math.random() - 0.5) * 0.08
      return { left: 34.1 + hot + asym + j() + Math.sin(Date.now() / 4000) * 0.1, right: 34.0 + hot + j() + Math.sin(Date.now() / 4300) * 0.1, ambient: 29 + Math.sin(Date.now() / 9000) * 1.5, posture: o.posture }
    }), 900)
    return () => clearInterval(id)
  }, [kind])
  return v
}

/* ---------- care ---------- */
const BOOKABLE: TierId[] = ['urgentUrology', 'fertility', 'andrology', 'familyPhysician']
function Care() {
  const { s, set, t, log, go, notify } = useApp()
  const { analysis } = useClip()
  const tri = triage(toCheckin(s.answers), analysis, s.lab)
  const [open, setOpen] = useState<string | null>(null)
  const [booking, setBooking] = useState<TierId | null>(null)
  if (!s.checkDone) return (<><Header title={t.care} /><div className="glass m-card"><p style={{ marginTop: 0 }}>Finish the private check-in first.</p><button className="btn btn-primary" onClick={() => go('check')}>{t.startCheck}</button></div></>)
  const send = () => {
    sendCase({ code: caseCode(s), sentAt: Date.now(), lang: s.lang, checkin: toCheckin(s.answers), clipKind: s.paired && s.weekDone ? s.clipKind : undefined, lab: s.lab ? { volume: s.lab.volume, concentration: s.lab.concentration, totalMotility: s.lab.totalMotility, progressive: s.lab.progressive, morphology: s.lab.morphology } : undefined })
    set({ sharedAt: Date.now(), reviewedAt: undefined })
    log(`Summary sent to the clinician queue as ${caseCode(s)} (with consent)`)
    notify('Sent to the clinician queue')
  }
  const status = s.reviewedAt ? 'reviewed' : s.sharedAt ? 'waiting' : 'unsent'
  return (
    <>
      <Header title={t.nextStep} sub={tri.clipNote} />
      <div className={`send-card ${status}`}>
        {status === 'unsent' && <>
          <div style={{ fontWeight: 600 }}>Ready for a clinician to check</div>
          <div className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>Sends your answers, Clip signals and results under the code <b className="mono">{caseCode(s)}</b>. No name, no ID. It is written to your audit log.</div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={send}>Send for clinician review</button>
        </>}
        {status === 'waiting' && <>
          <div className="m-row"><span className="pulse-dot" /><b>Waiting for a clinician</b></div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Case {caseCode(s)} is in the review queue. Open the clinician console (/clinic) in this browser to review it live.</div>
          <button className="dim" style={{ fontSize: 12, marginTop: 8 }} onClick={() => { set({ reviewedAt: Date.now(), reviewNote: 'Approved (simulated review).' }); log('Referral reviewed (simulated, single-screen demo)') }}>Simulate the review (single-screen demo)</button>
        </>}
        {status === 'reviewed' && <>
          <div className="m-row"><span style={{ color: 'var(--mint)', fontSize: 18 }}>✓</span><b>Reviewed by a clinician</b></div>
          {s.reviewNote && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>“{s.reviewNote}”</div>}
          <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>You can now book the steps below.</div>
        </>}
      </div>
      <div style={{ marginBottom: 12 }}><AskPanel facts={factsFrom(tri, analysis)} lang={s.lang} compact /></div>
      {tri.recommendations.map((r, k) => {
        const m = TIER_META[r.tier]
        const booked = s.bookings.find(b => b.tier === r.tier)
        return (
          <motion.div key={r.tier + r.rule} className="tier" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.07 }}>
            <div className="tier-bar" style={{ background: m.color, boxShadow: `0 0 18px ${m.color}` }} />
            <div className="m-between"><span className="tier-tag" style={{ color: m.color }}>{m.label}</span><span className="dim mono">{r.rule}</span></div>
            <div style={{ fontWeight: 600, fontSize: 17, margin: '6px 0 4px' }}>{r.title}</div>
            <div className="muted" style={{ fontSize: 13.5 }}>{r.detail}</div>
            {r.tier === 'emergency' && <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <a className="btn" style={{ background: '#ff4d3d', color: '#fff' }} href="tel:998">Call 998 (UAE ambulance)</a>
              <a className="btn btn-ghost" href="https://www.google.com/maps/search/emergency+department+near+me" target="_blank" rel="noreferrer">Nearest emergency department</a>
            </div>}
            <div className="m-between">
              {r.clinicianReview ? <span className={`review ${s.reviewedAt ? 'ok' : ''}`}><i />{s.reviewedAt ? t.reviewed : s.sharedAt ? 'Waiting for review' : 'Not yet sent for review'}</span> : <span className="review ok"><i />Shown instantly · no review delay</span>}
              <button className="muted" style={{ fontSize: 12.5, marginTop: 10 }} onClick={() => setOpen(open === r.tier ? null : r.tier)}>{t.why}</button>
            </div>
            <AnimatePresence>{open === r.tier && <motion.div className="why" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>{r.why}<div className="mono dim" style={{ marginTop: 6 }}>{t.rule} {r.rule} · deterministic · no AI</div></motion.div>}</AnimatePresence>
            {BOOKABLE.includes(r.tier) && (booked
              ? <div className="booked">✓ Booked · {booked.slot}<br /><span className="dim">{booked.place} · ref {booked.ref}</span></div>
              : <button className="btn btn-ghost" style={{ width: '100%', marginTop: 12 }} disabled={!s.reviewedAt} onClick={() => setBooking(r.tier)}>{s.reviewedAt ? `${t.book} · ${PLACES[r.tier]}` : 'Booking opens after review'}</button>)}
            {r.tier === 'semen' && (s.lab ? <LabCard /> : <Pod />)}
          </motion.div>
        )
      })}
      <p className="dim" style={{ fontSize: 12 }}>{t.notDiagnosis}</p>
      {createPortal(<AnimatePresence>{booking && <BookSheet tier={booking} onClose={() => setBooking(null)} />}</AnimatePresence>, document.querySelector('.m-root') ?? document.body)}
    </>
  )
}
function BookSheet({ tier, onClose }: { tier: TierId; onClose: () => void }) {
  const { s, set, log, notify } = useApp()
  const [pick, setPick] = useState(0)
  const opts = slots()
  const confirm = () => {
    const ref = 'BK-' + Math.random().toString(36).slice(2, 6).toUpperCase()
    set({ bookings: [...s.bookings.filter(b => b.tier !== tier), { tier, place: PLACES[tier]!, slot: opts[pick], ref, at: Date.now() }] })
    log(`Booked ${TIER_META[tier].label} · ${opts[pick]} (anonymous referral ${ref})`)
    notify('Appointment booked'); onClose()
  }
  return (
    <motion.div className="sheet-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 32 }} onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="tier-tag" style={{ color: TIER_META[tier].color }}>{TIER_META[tier].label}</div>
        <h3 style={{ fontSize: 22, margin: '6px 0 4px' }}>{PLACES[tier]}</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>The clinic receives the anonymous referral {caseCode(s)}; your name is given only at the visit, if you choose.</p>
        {opts.map((o, i) => <button key={o} className={`q-opt ${pick === i ? 'sel' : ''}`} onClick={() => setPick(i)}>{o}<span>{pick === i ? '●' : '○'}</span></button>)}
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={confirm}>Confirm booking</button>
        <p className="dim" style={{ fontSize: 11, textAlign: 'center' }}>Prototype: bookings are simulated.</p>
      </motion.div>
    </motion.div>
  )
}
function LabCard() {
  const { s } = useApp()
  const lab = s.lab!
  return (
    <div className="lab">
      <div className="m-between"><b>Semen analysis · lab result</b><span className="dim" style={{ fontSize: 11 }}>{new Date(lab.at).toLocaleDateString()} · simulated</span></div>
      {SEMEN_REF.map(x => {
        const v = lab[x.key], below = v < x.min, max = x.min * 3
        return (
          <div key={x.key} style={{ marginTop: 10 }}>
            <div className="m-between" style={{ fontSize: 12.5 }}><span>{x.label}</span><span style={{ color: below ? 'var(--warm)' : 'var(--mint)' }}>{v} {x.unit} {below ? '· below' : '· ok'}</span></div>
            <div className="lab-bar"><i style={{ left: `${(x.min / max) * 100}%` }} /><motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (v / max) * 100)}%` }} transition={{ duration: 0.8 }} style={{ background: below ? 'linear-gradient(90deg,#ffc15e,#ff6a3d)' : undefined }} /></div>
          </div>)
      })}
      <div className="dim" style={{ fontSize: 11, marginTop: 8 }}>Marker = WHO 2021 lower reference limit. One result is not a diagnosis.</div>
    </div>
  )
}
function Pod() {
  const { s, set, log, t } = useApp()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  const LIMIT = 60 * 60 * 1000
  const left = s.collectedAt ? Math.max(0, LIMIT - (now - s.collectedAt)) : LIMIT
  const temp = s.breach ? 38.6 : 34.6 + Math.sin(now / 5000) * 0.4
  const [qr, setQr] = useState('')
  useEffect(() => { if (s.pod === 'collected') QRCode.toDataURL(`ALZ-${s.anonId}-${(s.collectedAt ?? 0).toString(36).toUpperCase()}`, { margin: 0, width: 160, color: { dark: '#eaf2f4', light: '#00000000' } }).then(setQr) }, [s.pod])
  if (s.pod === 'none') return <button className="btn btn-ghost" style={{ marginTop: 12, width: '100%' }} onClick={() => { set({ pod: 'ordered' }); log('Pod ordered with an anonymous code') }}>{t.orderPod}</button>
  if (s.pod === 'ordered') return (
    <div className="why" style={{ color: 'var(--ink)' }}>Pod arriving tomorrow (simulated). Collect at home, then press the button on the Pod.
      <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={() => { set({ pod: 'collected', collectedAt: Date.now(), breach: false }); log('Sample collected; Pod timer started') }}>I’ve collected the sample</button></div>
  )
  if (s.pod === 'delivered') return <div className="why" style={{ color: 'var(--mint)' }}>Delivered to the lab in time and within 20–37 °C. The result arrives here with your anonymous code (simulated: in a few seconds).</div>
  const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000)
  const r = 92, c = 2 * Math.PI * r
  const bad = s.breach || left === 0
  return (
    <div style={{ marginTop: 12 }}>
      <div className="timer-ring">
        <svg width="220" height="220" style={{ transform: 'rotate(-90deg)' }}><circle cx="110" cy="110" r={r} stroke="rgba(255,255,255,.07)" strokeWidth="10" fill="none" />
          <circle cx="110" cy="110" r={r} stroke={bad ? '#ff4d3d' : thermal(temp)} strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - left / LIMIT)} style={{ transition: 'stroke-dashoffset 1s linear', filter: `drop-shadow(0 0 8px ${bad ? '#ff4d3d' : thermal(temp)})` }} /></svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}><div>
          <div style={{ font: '600 40px var(--display)' }}>{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}</div>
          <div style={{ color: bad ? '#ff8a7a' : 'var(--mint)', fontSize: 13 }}>{temp.toFixed(1)} °C · {bad ? 'out of range' : 'in range 20–37 °C'}</div>
        </div></div>
      </div>
      {bad && <div className="why" style={{ color: '#ffb39a' }}>The sample is flagged unreliable. The lab will not report it as normal; please repeat the collection.</div>}
      <div className="m-between" style={{ marginTop: 10 }}>
        {qr && <img src={qr} width={70} height={70} alt="Anonymous lab code" />}
        <div className="dim" style={{ fontSize: 11.5, flex: 1 }}>Anonymous lab code<br /><span className="mono">ALZ-{s.anonId}</span></div>
        <div style={{ display: 'grid', gap: 6 }}>
          <button className="btn btn-primary" style={{ padding: '9px 12px', fontSize: 13 }} onClick={() => { set({ pod: bad ? 'ordered' : 'delivered' }); log(bad ? 'Collection to be repeated' : 'Sample handed to courier in range') }}>{bad ? 'Repeat' : 'Courier'}</button>
          {!bad && <button className="dim" style={{ fontSize: 11 }} onClick={() => { set({ breach: true }); log('Pod temperature breach simulated') }}>Simulate breach</button>}
        </div>
      </div>
    </div>
  )
}

/* ---------- vault ---------- */
function Vault() {
  const { s, t, log, reset } = useApp()
  const [link, setLink] = useState<{ url: string; qr: string; exp: number } | null>(null)
  useEffect(() => { if (params.get('share')) make() }, [])
  const [confirm, setConfirm] = useState(false)
  const make = async () => {
    const tok = Array.from(crypto.getRandomValues(new Uint8Array(9)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 14)
    const url = `${location.origin}/s/${tok}`
    setLink({ url, qr: await QRCode.toDataURL(url, { margin: 0, width: 180, color: { dark: '#eaf2f4', light: '#00000000' } }), exp: Date.now() + 24 * 3600e3 })
    log('One-time summary link created (expires in 24 h, opens once)')
  }
  const items = [['Check-in answers', `${Object.keys(s.answers).length} items`], ['Clip readings', s.weekDone ? '1,008 samples' : '—'], ['Pod log', s.pod], ['Account', 'none']]
  return (
    <>
      <Header title={t.privacyTitle} sub="Everything below is stored only in this browser. The server never sees it." />
      <div className="glass m-card">{items.map(([k, v]) => <div key={k} className="m-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}><span>{k}</span><span className="muted mono">{v}</span></div>)}</div>
      <div className="glass m-card">
        <div className="eyebrow" style={{ color: '#ff8a6a' }}>{t.never}</div>
        <div className="never" style={{ marginTop: 10 }}>{['Insurance', 'Employment', 'Marriage paperwork', 'Visa', 'Advertising', 'AI training without consent'].map(x => <span key={x}>{x}</span>)}</div>
      </div>
      <div className="glass m-card">
        <div style={{ fontWeight: 600 }}>Share with your wife or doctor</div>
        <p className="muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>A summary only, through a link that opens once and expires in 24 hours. Nothing is shared automatically.</p>
        {link ? (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="m-row">
            <img src={link.qr} width={86} height={86} alt="QR code of the one-time link" />
            <div style={{ minWidth: 0 }}><div className="mono" style={{ wordBreak: 'break-all', fontSize: 12 }}>{link.url}</div><div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>Demo link · expires {new Date(link.exp).toLocaleString()}</div></div>
          </motion.div>
        ) : <button className="btn btn-primary" style={{ width: '100%' }} onClick={make}>{t.share}</button>}
      </div>
      <div className="glass m-card">
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Audit log</div>
        {s.audit.slice(0, 8).map((a, k) => <div key={k} style={{ fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid var(--line)' }}><span className="dim mono">{new Date(a.at).toLocaleTimeString()}</span> · {a.what}</div>)}
      </div>
      {!confirm ? <button className="btn btn-ghost" style={{ width: '100%', color: '#ff8a7a', borderColor: 'rgba(255,77,61,.4)' }} onClick={() => setConfirm(true)}>{t.deleteAll}</button>
        : <div className="glass m-card" style={{ borderColor: 'rgba(255,77,61,.5)' }}><p style={{ marginTop: 0 }}>Delete every answer, reading and log from this device? This cannot be undone.</p>
          <div className="m-row"><button className="btn" style={{ background: '#ff4d3d', color: '#fff' }} onClick={reset}>Delete</button><button className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancel</button></div></div>}
    </>
  )
}
