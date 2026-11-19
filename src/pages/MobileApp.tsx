import { AnimatePresence, motion } from 'framer-motion'
import QRCode from 'qrcode'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import BreezeField from '../components/BreezeField'
import IsoField from '../components/IsoField'
import { CLIP_PARTS, CLIP_SAFETY, CLIP_SPECS, CLIP_STATUS, ClipExploded, POD_PARTS, StepIcon, WEAR_STEPS } from '../components/Device'
import { Heatmap, ThermalChart, thermal } from '../components/viz'
import { AskPanel, factsFrom, useVoice } from '../components/Ask'
import { analyse } from '../engine/signals'
import { Kind, KIND_LABEL, simulate } from '../engine/simulate'
import { Checkin, EMPTY_CHECKIN, SEMEN_REF, SemenResult, TIER_META, TierId, triage, Ttc } from '../engine/rules'
import { readReviews, sendCase, subscribe } from '../engine/sync'
import { heatAdvice, useClipLink, useMotion, useWeather } from '../engine/live'
import { Lang, QUESTIONS, STRINGS, Strings, TTC_OPTIONS } from '../i18n'
import { Avatar, AuthResult, Guide, ProfileSheet, saveRemote, Welcome } from './AppAuth'
import { call, getSession, setSession, signOut } from '../engine/account'
import type { PatientProfile } from '../engine/profiles'
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
  account?: { id: string; name: string; email: string; demo: boolean }
  profile?: PatientProfile
  guest?: boolean
  demoProfile?: string
  syncedAt?: number
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
    ...fresh(), lang: (params.get('lang') as Lang) || 'en', onboarded: true, anonId: 'K7Q2', guest: true,
    answers: { pain: false, lump: false, ttc: '6to12', partner35: false, steroids: true, udt: false, pastTesticular: false, heatJob: true, smoke: false, metabolic: false, infection: false, erection: false, noSpermBefore: false },
    checkDone: params.get('check') !== '0', paired: params.get('paired') !== '0', weekDone: params.get('week') !== '0', clipKind: (params.get('kind') as Kind) || 'both',
    pod: (params.get('pod') as PodState) || 'collected', collectedAt: Date.now() - 754000, reviewedAt: params.get('reviewed') === '0' ? undefined : Date.now(),
    sharedAt: params.get('reviewed') === '0' ? undefined : Date.now() - 900000, reviewNote: 'Approved. Please book the examination and the home test.',
    lab: params.get('lab') ? { ...labFor((params.get('kind') as Kind) || 'both'), at: Date.now() - 3600e3 } : undefined,
    bookings: params.get('book') ? [{ tier: 'andrology', place: PLACES.andrology!, slot: slots()[1], ref: 'BK-4Q7M', at: Date.now() - 600e3 }] : [],
    audit: [
      { at: Date.now() - 60000, what: 'One-time summary link created (expires in 24 h, opens once)' },
      { at: Date.now() - 754000, what: 'Sample collected; Pod timer started' },
      { at: Date.now() - 900000, what: 'Referral reviewed by clinician' },
      { at: Date.now() - 1800000, what: '7 days of Clip readings analysed on the phone' },
      { at: Date.now() - 2400000, what: 'Check-in completed (answers kept on device)' },
      { at: Date.now() - 2500000, what: 'Started anonymously (no name, no ID)' },
    ],
  }
}
function load(): State {
  if (params.get('demo')) return demoState()
  if (params.get('fresh')) return { ...fresh(), lang: (params.get('lang') as Lang) || 'en' }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const st: State = { ...fresh(), ...JSON.parse(raw) }
      if (st.account && !getSession('patient')) return fresh() // signed out elsewhere
      if (st.onboarded && !st.account) st.guest = true // profiles from before accounts existed
      return st
    }
  } catch { /* storage blocked */ }
  return fresh()
}

/** Sample lab result for the prototype: heat exposure lowers it, otherwise within range. */
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
  while (out.length < 3) { const x = new Date(d.getTime() + add * 864e5); add++; if (x.getDay() === 6 || x.getDay() === 0) continue // UAE weekend: Saturday and Sunday
    out.push(`${x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${['09:30', '13:15', '17:40'][out.length]}`) }
  return out
}
const caseCode = (s: State) => `ALZ-${s.anonId}`
const previewKind = (k: Kind) => (k === 'heat' || k === 'asymmetry' || k === 'both' ? k : 'typical')

type Live = { weather: ReturnType<typeof useWeather>; motion: ReturnType<typeof useMotion>; link: ReturnType<typeof useClipLink> }
const Ctx = createContext<{ s: State; set: (p: Partial<State>) => void; t: Strings; log: (w: string) => void; go: (t: Tab) => void; reset: () => void; notify: (m: string) => void; live: Live; openProfile: () => void }>(null!)
const useApp = () => useContext(Ctx)

const spring = { type: 'spring', stiffness: 380, damping: 32 } as const
const page = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } }

/* ---------- icons ---------- */
const sv = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const I = {
  home: <svg viewBox="0 0 24 24" {...sv}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
  check: <svg viewBox="0 0 24 24" {...sv}><rect x="5" y="3.5" width="14" height="17" rx="3" /><path d="m9 12 2 2 4-4" /></svg>,
  clip: <svg viewBox="0 0 24 24" {...sv}><rect x="4" y="6" width="16" height="7" rx="3.5" /><circle cx="8.5" cy="17.5" r="2" /><circle cx="15.5" cy="17.5" r="2" /><path d="M8.5 13v2.5M15.5 13v2.5" /></svg>,
  care: <svg viewBox="0 0 24 24" {...sv}><path d="M12 20s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.7-7 10-7 10Z" /><path d="M9 11h6M12 8v6" /></svg>,
  vault: <svg viewBox="0 0 24 24" {...sv}><rect x="4.5" y="10" width="15" height="10" rx="3" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /><circle cx="12" cy="15" r="1.4" fill="currentColor" /></svg>,
  arrow: <svg viewBox="0 0 24 24" width="18" height="18" {...sv} strokeWidth={2}><path d="M5 12h14m-5-5 5 5-5 5" /></svg>,
  lock: <svg viewBox="0 0 24 24" width="13" height="13" {...sv} strokeWidth={2.2}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  bt: <svg viewBox="0 0 24 24" width="18" height="18" {...sv}><path d="m7 7 10 10-5 4V3l5 4L7 17" /></svg>,
  speaker: <svg viewBox="0 0 24 24" width="15" height="15" {...sv}><path d="M4 10v4h4l5 4V6L8 10Z" /><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" /></svg>,
  mic: <svg viewBox="0 0 24 24" width="15" height="15" {...sv}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  sun: <svg viewBox="0 0 24 24" width="16" height="16" {...sv}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></svg>,
  drop: <svg viewBox="0 0 24 24" width="16" height="16" {...sv}><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" /></svg>,
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
  const weather = useWeather(), motionS = useMotion(), link = useClipLink(previewKind(s.clipKind))
  useEffect(() => { if (params.get('demo') && link.state === 'idle') link.preview() }, [])
  useEffect(() => {
    if ((link.state === 'live' || link.state === 'preview') && !s.paired) {
      setS(o => ({ ...o, paired: true, audit: [{ at: Date.now(), what: link.state === 'live' ? `Clip connected over Bluetooth (${link.device})` : 'Preview stream started (sample readings)' }, ...o.audit] }))
    }
  }, [link.state])
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
      setS(o => ({ ...o, lab: { ...labFor(o.clipKind), at: Date.now() }, audit: [{ at: Date.now(), what: 'Lab result received with the anonymous code' }, ...o.audit] }))
      notify('Your semen analysis result is ready')
    }, 7000)
    return () => clearTimeout(id)
  }, [s.pod, s.lab])
  /* account: back up the record (debounced) and pick up clinician reviews from the server */
  useEffect(() => {
    if (!s.account || params.get('demo')) return
    const id = setTimeout(() => {
      const { account, profile, syncedAt, ...state } = s
      saveRemote(state, profile).then(r => setS(o => ({ ...o, syncedAt: r.savedAt }))).catch(() => {})
    }, 1200)
    return () => clearTimeout(id)
  }, [s.account?.id, s.answers, s.checkDone, s.paired, s.weekDone, s.pod, s.lab, s.bookings, s.sharedAt, s.reviewedAt, s.onboarded, s.lang, s.profile])
  useEffect(() => {
    if (!s.account || !s.sharedAt) return
    const poll = () => call<{ cases: { status: string; reviewed_at?: number; reviewed_by?: string; decision?: string; note?: string; sent_at: number }[] }>('me', {}, 'patient').then(b => {
      const k = b.cases[0]
      if (k?.status === 'reviewed' && k.reviewed_at && k.reviewed_at > (s.reviewedAt ?? 0)) {
        setS(o => ({ ...o, reviewedAt: k.reviewed_at, reviewNote: k.note ?? o.reviewNote, audit: [{ at: Date.now(), what: `Clinician ${k.reviewed_by} ${k.decision} your referral` }, ...o.audit] }))
        notify(`${k.reviewed_by} reviewed your referral`)
      }
    }).catch(() => {})
    poll(); const id = setInterval(poll, 6000)
    return () => clearInterval(id)
  }, [s.account?.id, s.sharedAt, s.reviewedAt])
  const [profileOpen, setProfileOpen] = useState(false)
  const onAuth = (r: AuthResult) => {
    if (r.kind === 'guest') { setS(o => ({ ...o, guest: true, lang: r.lang, audit: [{ at: Date.now(), what: 'Started as a guest (stored on this phone only)' }, ...o.audit] })); return }
    const b = r.bundle
    setS({ ...fresh(), ...(b.state as Partial<State>), account: { id: b.user.id, name: b.user.name, email: b.user.email, demo: b.user.demo }, profile: b.profile ?? undefined, guest: false, lang: (b.state.lang as Lang) || (b.profile?.lang as Lang) || 'en' })
    setTab('home')
  }
  const signOutAll = async () => {
    setProfileOpen(false)
    if (s.account) await signOut('patient')
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
    link.disconnect(); setS(fresh()); setTab('home')
  }
  const records = [
    { label: 'Check-in', value: s.checkDone ? 'Completed' : 'Not yet' },
    { label: 'Clip week', value: s.weekDone ? `Analysed · ${KIND_LABEL[s.clipKind]}` : s.paired ? 'Wearing' : 'Not started' },
    { label: 'Clinician review', value: s.reviewedAt ? `Approved ${new Date(s.reviewedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : s.sharedAt ? 'Waiting' : 'Not sent', tone: s.reviewedAt ? 'var(--mint)' : undefined },
    { label: 'Appointments', value: s.bookings.length ? s.bookings.map(b => b.slot).join(', ') : 'None' },
    { label: 'Lab result', value: s.lab ? new Date(s.lab.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : s.pod !== 'none' ? `Pod ${s.pod}` : 'None' },
    { label: 'Case code', value: caseCode(s) },
  ]
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }) }, [tab])
  const live = useMemo(() => ({ weather, motion: motionS, link }), [weather, motionS, link])
  const api = useMemo(() => ({
    s, t: STRINGS[s.lang], live,
    set: (p: Partial<State>) => setS(o => ({ ...o, ...p })),
    log: (what: string) => setS(o => ({ ...o, audit: [{ at: Date.now(), what }, ...o.audit].slice(0, 40) })),
    go: (t: Tab) => setTab(t),
    reset: async () => {
      if (s.account) { try { await call('deleteAccount', {}, 'patient') } catch { /* offline */ } setSession('patient', null) }
      try { localStorage.removeItem(KEY) } catch { /* ignore */ } link.disconnect(); setS(fresh()); setTab('home')
    },
    notify,
    openProfile: () => setProfileOpen(true),
  }), [s, live])

  const app = (
    <Ctx.Provider value={api}>
      <div className="m-root" dir={s.lang === 'ar' ? 'rtl' : 'ltr'} lang={s.lang}>
        {!wide ? <div style={{ height: 'max(14px, env(safe-area-inset-top))', flex: 'none' }} /> : <div className="m-status"><Clock /><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5" width="3" height="7" rx="1" /><rect x="10" y="2" width="3" height="10" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" opacity=".4" /></svg>
          <svg width="26" height="12" viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".5" /><rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" /><rect x="23.5" y="4" width="2" height="4" rx="1" fill="currentColor" opacity=".5" /></svg>
        </span></div>}
        <div className="m-scroll" ref={scrollRef}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={tab + s.lang} {...page}>
              {tab === 'home' && <Today />}
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
        <AnimatePresence>{!s.account && !s.guest && <Welcome key="welcome" lang={s.lang} setLang={l => setS(o => ({ ...o, lang: l }))} onDone={onAuth} />}</AnimatePresence>
        <AnimatePresence>{(s.account || s.guest) && !s.onboarded && <Guide key="guide" name={s.profile?.alias} onFinish={() => { setS(o => ({ ...o, onboarded: true, audit: [{ at: Date.now(), what: 'Finished the how-it-works guide' }, ...o.audit] })); setTab('check') }} />}</AnimatePresence>
        <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} account={s.account} profile={s.profile} records={records} synced={s.syncedAt}
          onSave={p => setS(o => ({ ...o, profile: { ...(o.profile ?? { alias: o.account?.name ?? 'Guest', ageBand: '25–34', lang: o.lang, group: 'Other', education: 'University', emirate: 'Abu Dhabi', consent: { backup: true, shareWithCareTeam: false, research: false }, avatar: 'sky' }), ...p } as PatientProfile }))}
          onSignOut={signOutAll} onCreateAccount={signOutAll} />
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
function Clock() {
  const [n, setN] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setN(new Date()), 20e3); return () => clearInterval(id) }, [])
  return <span>{n.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
}

function SideLeft() {
  return (
    <div className="m-side" style={{ justifySelf: 'end' }}>
      <Link to="/" className="chip"><span className="dot" />Alarzah · Mobile app</Link>
      <h1>The whole check, <span className="thermal-text">in his pocket.</span></h1>
      <p>Running live. The outdoor heat for Abu Dhabi, your phone’s motion sensor and the Bluetooth link are real. Skin readings come from a connected Clip, or from a preview stream that is labelled as one.</p>
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
          <p style={{ margin: 0, fontSize: 14 }}>Scan, then <b>Add to Home Screen</b>. On a phone, posture comes from its own motion sensor.</p>
        </div>
      </div>
      <div className="glass" style={{ padding: 22, marginTop: 14 }}>
        <div className="eyebrow" style={{ color: 'var(--warm)' }}>The path a man takes</div>
        <ol className="m-path-list">
          <li><b>Check-in</b> · 13 private questions; a red flag interrupts at once</li>
          <li><b>Clip</b> · 3–7 days; the phone computes heat and the left/right pattern</li>
          <li><b>Review</b> · he sends a code, a clinician approves in /clinic</li>
          <li><b>Book</b> · only after sign-off, on UAE working days</li>
          <li><b>Pod</b> · home sample, lab result checked against WHO 2021</li>
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
    { k: '01', t: t.ob1t, b: t.ob1b, art: <CodeArt code={s.anonId} /> },
    { k: '02', t: t.ob2t, b: t.ob2b, art: <div style={{ width: 300 }}><ExplodeLoop /></div> },
    { k: '03', t: t.ob3t, b: t.ob3b, art: <LadderArt /> },
  ]
  return (
    <motion.div className="ob" initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04, filter: 'blur(10px)' }} transition={{ duration: 0.5 }}>
      <div className="ob-field"><IsoField heat={0.2 + i * 0.2} levels={8} /></div>
      <div className="m-between" style={{ position: 'relative' }}>
        <div className="m-row"><img src="/icon.svg" width={30} height={30} alt="" /><b style={{ fontFamily: 'var(--display)' }}>Alarzah</b></div>
        <button className="m-lang" onClick={() => set({ lang: s.lang === 'en' ? 'ar' : 'en' })}>{s.lang === 'en' ? 'العربية' : 'English'}</button>
      </div>
      <div className="ob-art">
        <motion.div key={i} initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 18 }}>{slides[i].art}</motion.div>
      </div>
      <motion.div key={'t' + i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} style={{ position: 'relative' }}>
        <div className="m-kicker">{slides[i].k} / 03</div>
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
function CodeArt({ code }: { code: string }) {
  const [shown, setShown] = useState('····')
  useEffect(() => {
    let k = 0
    const id = setInterval(() => { k++; setShown(code.split('').map((c, i) => (k > 6 + i * 3 ? c : '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(Math.random() * 32)])).join('')); if (k > 18) clearInterval(id) }, 60)
    return () => clearInterval(id)
  }, [code])
  return (
    <div className="code-art">
      <div className="m-kicker" style={{ textAlign: 'center' }}>Your anonymous code</div>
      <div className="code-big">ALZ-<span className="thermal-text">{shown}</span></div>
      <div className="code-rows">{[['Name', 'never asked'], ['Phone number', 'never asked'], ['Emirates ID', 'never asked'], ['Stored', 'this phone only']].map(([a, b]) => <div key={a}><span>{a}</span><b>{b}</b></div>)}</div>
    </div>
  )
}
function ExplodeLoop() {
  const [o, setO] = useState(0)
  useEffect(() => { let t0 = performance.now(), raf = 0; const f = (n: number) => { const p = ((n - t0) / 4200) % 1; setO(p < 0.5 ? easeIO(p * 2) : easeIO(2 - p * 2)); raf = requestAnimationFrame(f) }; raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf) }, [])
  return <ClipExploded open={0.15 + o * 0.85} labels={false} />
}
const easeIO = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const LadderArt = () => (
  <div style={{ width: 250 }}>
    {(['emergency', 'urgentUrology', 'fertility', 'andrology', 'familyPhysician', 'semen', 'selfCare'] as const).map((k, i) => (
      <motion.div key={k} className="ladder-row" initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.08 }} style={{ ['--c' as string]: TIER_META[k].color, width: `${100 - i * 6}%` }}>
        <span>R{i + 1}</span>{TIER_META[k].short}
      </motion.div>
    ))}
  </div>
)

/* ---------- shared bits ---------- */
function Header({ title, sub, kicker }: { title: string; sub?: string; kicker?: string }) {
  const { s, set, t, openProfile } = useApp()
  return (
    <>
      <div className="m-top">
        <div className="m-id"><span className="m-id-code mono">ALZ-{s.anonId}</span><span className="m-id-safe">{I.lock}{t.onDevice}</span></div>
        <div className="m-row" style={{ gap: 8 }}>
          <button className="m-lang" onClick={() => set({ lang: s.lang === 'en' ? 'ar' : 'en' })} aria-label={t.lang}>{s.lang === 'en' ? 'ع' : 'EN'}</button>
          <button className="m-avatar-btn" onClick={openProfile} aria-label="Your profile"><Avatar name={s.profile?.alias || s.account?.name || 'Guest'} tone={s.profile?.avatar ?? 'sky'} size={36} /></button>
        </div>
      </div>
      {kicker && <div className="m-kicker">{kicker}</div>}
      {title && <h1 className="m-h1">{title}</h1>}
      {sub && <p className="muted" style={{ margin: '0 0 16px', fontSize: 14 }}>{sub}</p>}
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
function Spark({ data, color, h = 34 }: { data: (number | null)[]; color: string; h?: number }) {
  const v = data.filter((x): x is number => x != null)
  if (v.length < 2) return <div style={{ height: h }} />
  const lo = Math.min(...v) - 0.05, hi = Math.max(...v) + 0.05
  const pts = data.map((x, i) => x == null ? null : `${(i / (data.length - 1)) * 100},${h - ((x - lo) / (hi - lo)) * (h - 4) - 2}`).filter(Boolean).join(' ')
  return <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block' }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg>
}
function LivePill({ kind }: { kind: 'live' | 'preview' | 'off' }) {
  return <span className={`pill pill-${kind}`}><i />{kind === 'live' ? 'LIVE' : kind === 'preview' ? 'PREVIEW' : 'OFF'}</span>
}

/* ---------- today ---------- */
function pathway(s: State, analysisOk: boolean) {
  const steps = [
    { k: 'Check-in', done: s.checkDone, tab: 'check' as Tab },
    { k: 'Clip week', done: s.paired && s.weekDone && analysisOk, tab: 'clip' as Tab },
    { k: 'Review', done: !!s.reviewedAt, tab: 'care' as Tab },
    { k: 'Book', done: s.bookings.length > 0, tab: 'care' as Tab },
    { k: 'Lab result', done: !!s.lab, tab: 'care' as Tab },
  ]
  const cur = steps.findIndex(x => !x.done)
  return { steps, cur: cur < 0 ? steps.length : cur }
}
const NEXT_COPY = ['Answer 13 private questions. About 3 minutes.', 'Wear the Clip for 3–7 days, then let the phone compute.', 'Send your anonymous summary for a clinician to approve.', 'Pick a slot; the clinic sees only your code.', 'Collect at home with the Pod; the lab result comes back here.']

function Today() {
  const { s, t, go, live } = useApp()
  const { w } = live.weather, link = live.link, m = live.motion
  const { analysis, trace } = useClip()
  const tri = triage(toCheckin(s.answers), analysis)
  const { steps, cur } = pathway(s, !!analysis)
  const on = link.state === 'live' || link.state === 'preview'
  const heat = w ? Math.min(1, Math.max(0, (w.feels - 24) / 22)) : 0.3
  const adv = w ? heatAdvice(w) : null
  const now = new Date()
  const L = link.latest?.left, R = link.latest?.right
  return (
    <>
      <Header kicker={now.toLocaleDateString(s.lang === 'ar' ? 'ar-AE' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} title="" />
      <h1 className="m-greet">{s.lang === 'ar' ? 'مرحبًا،' : 'Hi,'} <span className="thermal-text">{s.profile?.alias || s.account?.name || (s.lang === 'ar' ? 'بك' : 'there')}.</span></h1>
      <p className="m-greet-sub">{cur >= 5 ? 'Your pathway is complete. Re-test in 6 weeks.' : `${Math.min(cur, 5)} of 5 steps done · next: ${steps[cur].k.toLowerCase()}`}</p>
      <section className={`hero ${on ? 'hero-on' : ''}`}>
        <IsoField heat={on && L ? Math.min(1, Math.max(0, (L - 33) / 3)) : heat} />
        <div className="hero-shade" />
        <div className="hero-in">
          <div className="m-between"><LivePill kind={on ? (link.state === 'live' ? 'live' : 'preview') : w?.source === 'live' ? 'live' : 'off'} /><span className="mono hero-meta">{on ? link.device : `${w?.place ?? 'Abu Dhabi'} · Open-Meteo`}</span></div>
          {on && L != null ? (
            <div className="hero-pair">
              <div><div className="m-kicker" style={{ color: 'var(--warm)' }}>{t.skinLeft}</div><div className="hero-num">{L.toFixed(1)}<small>°</small></div></div>
              <div><div className="m-kicker" style={{ color: 'var(--cool)' }}>{t.skinRight}</div><div className="hero-num">{R != null ? R.toFixed(1) : '—'}<small>°</small></div></div>
            </div>
          ) : (
            <div className="hero-pair">
              <div><div className="m-kicker">{t.outside}</div><div className="hero-num">{w ? Math.round(w.temp) : '—'}<small>°</small></div></div>
              <div><div className="m-kicker" style={{ color: 'var(--warm)' }}>{t.feels}</div><div className="hero-num hot">{w ? Math.round(w.feels) : '—'}<small>°</small></div></div>
            </div>
          )}
          {on && L != null && R != null
            ? <div className="hero-foot"><span className="mono">Δ L−R <b>{(L - R).toFixed(2)} °C</b></span><span className="mono">{w ? `Outside ${Math.round(w.temp)}° · feels ${Math.round(w.feels)}°` : ''}</span></div>
            : <button className="hero-cta" onClick={() => go('clip')}>{I.bt}{t.connectClip}<span>{I.arrow}</span></button>}
        </div>
      </section>
      {adv && <div className={`advice advice-${adv.level}`}><span>{I.sun}</span><div><b>{adv.title}</b><div>{adv.body}</div></div></div>}

      <section className="card path kit">
        <div className="m-between"><div><div className="kit-title">Your kit</div><div className="kit-sub">{t.pathway}</div></div><span className="kit-count"><b>{Math.min(cur, 5)}</b> of 5</span></div>
        <div className="kit-tubes">{steps.map((x, k) => (
          <button key={x.k} className={`kit-tube ${x.done ? 'done' : k === cur ? 'cur' : ''}`} onClick={() => go(x.tab)}>
            <span className="kit-glass"><motion.i initial={{ height: 0 }} animate={{ height: x.done ? '100%' : k === cur ? '34%' : '0%' }} transition={{ delay: 0.1 + k * 0.08, type: 'spring', stiffness: 90, damping: 16 }} /></span>
            <span className="kit-l">{x.k}</span>
          </button>))}
        </div>
        {cur < 5 ? (
          <button className="path-next" onClick={() => go(steps[cur].tab)}>
            <div><b>{['Start your private check-in', 'Wear the Clip', 'Send for clinician review', 'Book your appointment', 'Do the home test'][cur]}</b><div className="muted">{NEXT_COPY[cur]}</div></div>{I.arrow}
          </button>
        ) : <div className="path-next"><div><b>Pathway complete</b><div className="muted">Re-test in 6 weeks, or whenever you like.</div></div></div>}
      </section>

      <div className="bento">
        <div className="tile tile-wide">
          <div className="m-between"><div className="m-kicker">{t.heatToday} · {w?.place ?? 'Abu Dhabi'}</div><span className="mono dim" style={{ fontSize: 10.5 }}>feels-like by hour</span></div>
          <HourBars hours={w?.hours} />
        </div>
        <div className="tile">
          <div className="m-kicker">{t.phonePosture}</div>
          {m.supported && m.needsPermission && m.posture === 'unknown'
            ? <button className="tile-btn" onClick={m.enable}>Use motion sensor</button>
            : <><div className="tile-v">{!m.supported ? '—' : m.posture === 'unknown' ? '…' : m.posture === 'upright' ? 'Upright' : 'Lying'}</div>
              <div className="tile-s">{!m.supported ? 'No motion sensor on this device' : m.tilt != null ? `tilt ${Math.round(m.tilt)}° · live` : 'waiting for movement'}</div></>}
        </div>
        <div className="tile">
          <div className="m-kicker">{t.humidity}</div>
          <div className="tile-v">{w ? Math.round(w.humidity) : '—'}<small>%</small></div>
          <div className="tile-s">{w ? `updated ${new Date(w.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'offline'}</div>
        </div>
        <button className="tile" onClick={() => go('clip')}>
          <div className="m-kicker">Clip</div>
          <div className="tile-v" style={{ fontSize: 20 }}>{link.state === 'live' ? 'Connected' : link.state === 'preview' ? 'Preview' : s.paired ? 'Paired' : 'Not connected'}</div>
          <div className="tile-s">{on ? `${link.hist.length} readings this session` : 'Tap to connect or learn how'}</div>
        </button>
        <div className="tile">
          <div className="m-kicker">Left − right</div>
          {analysis?.status === 'ok' ? <><div className="tile-v" style={{ color: analysis.asymmetryPattern ? 'var(--warm)' : undefined }}>{analysis.diffUpright!.toFixed(2)}°</div><div className="tile-s">upright, week average</div></>
            : on && L != null && R != null ? <><div className="tile-v">{(L - R).toFixed(2)}°</div><Spark data={link.hist.slice(-60).map(h => (h.left != null && h.right != null ? h.left - h.right : null))} color="#ffc15e" h={22} /></>
              : <><div className="tile-v">—</div><div className="tile-s">needs the Clip</div></>}
        </div>
        {trace && analysis?.status === 'ok' && <div className="tile tile-wide">
          <div className="m-between"><div className="m-kicker">{t.weekTitle} · hour by hour</div><span className="mono dim" style={{ fontSize: 10.5 }}>{analysis.heatHoursPerDay!.toFixed(1)} h/day ≥ 35 °C</span></div>
          <div style={{ overflowX: 'auto', marginTop: 10 }}><Heatmap trace={trace} cell={11} gap={2} /></div>
        </div>}
      </div>

      {s.checkDone && (
        <section className="card next-card" style={{ ['--c' as string]: TIER_META[tri.recommendations[0].tier].color }}>
          <div className="m-between"><div className="m-kicker" style={{ color: 'var(--c)' }}>{t.nextStep} · {TIER_META[tri.recommendations[0].tier].label}</div><span className="mono dim">{tri.recommendations[0].rule}</span></div>
          <div className="next-title">{tri.recommendations[0].title}</div>
          <button className="link-btn" onClick={() => go('care')}>See all steps and why {I.arrow}</button>
        </section>
      )}
      {s.bookings.length > 0 && <section className="card">
        <div className="m-kicker" style={{ color: 'var(--mint)' }}>Upcoming</div>
        {s.bookings.map(b => <div key={b.ref} className="m-between" style={{ marginTop: 10, fontSize: 13.5 }}><div><b>{TIER_META[b.tier].label}</b><div className="muted" style={{ fontSize: 12 }}>{b.place}</div></div><span className="mono" style={{ fontSize: 12 }}>{b.slot}</span></div>)}
      </section>}
      <button className="card pod-row" onClick={() => go('care')}>
        <div><div className="m-kicker">Alarzah Pod · home sample</div><b>{s.lab ? 'Lab result ready' : s.pod === 'delivered' ? 'At the lab, result on the way' : s.pod === 'collected' ? 'Sample collected · timer running' : s.pod === 'ordered' ? 'Arriving tomorrow' : 'Semen test without a clinic room'}</b></div>
        <span className="pod-btn">{s.lab ? 'View' : s.pod === 'none' ? t.orderPod : 'Open'}</span>
      </button>
    </>
  )
}
function HourBars({ hours }: { hours?: { h: number; temp: number; feels: number }[] }) {
  const nowH = new Date().getHours()
  if (!hours?.length) return <div className="dim" style={{ fontSize: 12, padding: '18px 0' }}>Waiting for the forecast…</div>
  const max = 50, min = 20
  return (
    <div className="hours">
      {hours.slice(0, 24).map(x => (
        <div key={x.h} className={`hour ${x.h === nowH ? 'now' : ''}`} title={`${x.h}:00 · ${Math.round(x.temp)}° · feels ${Math.round(x.feels)}°`}>
          <motion.i initial={{ height: 0 }} animate={{ height: `${Math.max(8, ((x.feels - min) / (max - min)) * 100)}%` }} transition={{ delay: x.h * 0.02 }} style={{ background: thermal(x.feels, 26, 44) }} />
          {x.h % 6 === 0 && <span>{String(x.h).padStart(2, '0')}</span>}
        </div>
      ))}
      <div className="hours-line" style={{ bottom: `${((38 - min) / (max - min)) * 100}%` }}><span>38°</span></div>
    </div>
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
      <Header kicker="Step 1 of 5" title={t.step1} />
      <div className="card done-card">
        <motion.div className="done-mark" initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
          <svg viewBox="0 0 24 24" width="40" height="40" {...sv} strokeWidth={2.4}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </motion.div>
        <h3>{t.done}</h3>
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
      <Header kicker="Step 1 of 5 · private" title={t.step1} />
      <div className="q-ticks">{visible.map((x, k) => <i key={x.id} className={k < i ? 'done' : k === i ? 'cur' : ''} />)}</div>
      <div className="m-between" style={{ margin: '8px 0 12px', fontSize: 12 }}><span className="mono dim">{String(i + 1).padStart(2, '0')} / {visible.length}</span><span className="dim">{t.onDevice}</span></div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={q.id} className="q-card" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
          {q.redFlag && <span className="pill pill-red" style={{ alignSelf: 'flex-start' }}><i />Safety question</span>}
          <div className="q-text">{s.lang === 'ar' ? q.ar : q.en}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <button className="chip" onClick={() => voice.speak(s.lang === 'ar' ? q.ar : q.en)}>{I.speaker}{s.lang === 'ar' ? 'استمع' : 'Listen'}</button>
            {voice.canListen && q.kind !== 'ttc' && <button className="chip" style={voice.listening ? { color: '#fff', background: '#ff4d3d', borderColor: '#ff4d3d' } : undefined}
              onClick={() => voice.listen(txt => { const y = /(yes|yeah|yep)|نعم|اي|أيوه/i.test(txt), n = /(no|nope)|لا/i.test(txt); if (y) answer(true); else if (n) answer(false) })}>{I.mic}{s.lang === 'ar' ? 'أجب بصوتك' : 'Answer by voice'}</button>}
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
          <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} className="alarm-mark">!</motion.div>
          <h2 style={{ fontSize: 30, margin: '22px 0 10px' }}>{alarm === 'pain' ? 'Go to an emergency department now' : 'See a urologist within days'}</h2>
          <p style={{ color: '#ffd2c6' }}>{alarm === 'pain' ? 'Sudden severe pain or swelling can be a twisted testicle. It needs treatment within hours. Do not wait for this app or for a clinician review.' : 'A new lump must be examined promptly, usually with an ultrasound. Most lumps are not cancer, but it has to be checked.'}</p>
          <div className="alarm-rule mono">Rule {alarm === 'pain' ? 'R1' : 'R2'} · fixed rule, no AI · shown instantly</div>
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
type ClipView = 'live' | 'wear' | 'inside'
function ClipScreen() {
  const { s, t } = useApp()
  const [view, setView] = useState<ClipView>(() => (params.get('view') as ClipView) || 'live')
  return (
    <>
      <Header kicker="Step 2 of 5 · 3–7 days" title={s.paired ? t.clip : t.pairClip} />
      <div className="seg3">
        {(['live', 'wear', 'inside'] as ClipView[]).map(v => <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
          {view === v && <motion.span layoutId="seg3" className="seg3-glow" transition={spring} />}<span>{v === 'live' ? t.liveView : v === 'wear' ? t.wearGuide : t.inside}</span></button>)}
      </div>
      {view === 'live' && <ClipLive openGuide={() => setView('wear')} />}
      {view === 'wear' && <WearGuide />}
      {view === 'inside' && <Inside />}
    </>
  )
}
function ClipLive({ openGuide }: { openGuide: () => void }) {
  const { s, set, t, log, live } = useApp()
  const link = live.link, m = live.motion, w = live.weather.w
  const [ff, setFf] = useState(0)
  const { trace, analysis } = useClip()
  const on = link.state === 'live' || link.state === 'preview'
  const fastForward = () => {
    setFf(1)
    const id = setInterval(() => setFf(v => { if (v >= 7) { clearInterval(id); set({ weekDone: true }); log(`7 days of Clip readings analysed on the phone (${KIND_LABEL[s.clipKind]})`); return 8 } return v + 1 }), 280)
  }
  const L = link.latest?.left, R = link.latest?.right
  return (
    <>
      {!on && !s.paired ? (
        <section className="card connect">
          <div className="connect-art"><ClipExploded open={0.12} labels={false} /></div>
          <h3>{t.connectClip}</h3>
          <p className="muted">The Clip speaks the standard Bluetooth Health Thermometer profile. Any thermometer that does can stream to this screen right now.</p>
          {link.supported
            ? <button className="btn btn-primary" style={{ width: '100%' }} onClick={link.connect} disabled={link.state === 'connecting'}>{I.bt}{link.state === 'connecting' ? 'Searching…' : 'Connect over Bluetooth'}</button>
            : <div className="note">This browser has no Web Bluetooth. Use Chrome on Android, Windows or macOS to connect a real device.</div>}
          {link.err && <div className="note" style={{ color: '#ffb39a' }}>{link.err}</div>}
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={link.preview}>Preview with a sample stream</button>
          <button className="link-btn" onClick={openGuide}>New to the Clip? How to wear it {I.arrow}</button>
        </section>
      ) : (
        <section className={`card live-card ${link.state === 'live' ? 'is-live' : ''}`}>
          <div className="m-between">
            <LivePill kind={link.state === 'live' ? 'live' : link.state === 'preview' ? 'preview' : 'off'} />
            <span className="mono dim" style={{ fontSize: 11 }}>{on ? `${link.device} · ${link.hist.length} readings` : 'Paired · not streaming'}</span>
          </div>
          <div className="live-pair">
            <div><div className="m-kicker" style={{ color: 'var(--warm)' }}>{t.left}</div><div className="live-num" style={{ color: thermal(L ?? null) }}>{L != null ? L.toFixed(2) : '—'}<small>°C</small></div></div>
            <div className="live-delta"><span className="mono">Δ</span><b>{L != null && R != null ? (L - R).toFixed(2) : '—'}</b></div>
            <div><div className="m-kicker" style={{ color: 'var(--cool)' }}>{t.right}</div><div className="live-num" style={{ color: thermal(R ?? null) }}>{R != null ? R.toFixed(2) : '—'}<small>°C</small></div></div>
          </div>
          <LiveChart hist={link.hist} />
          <div className="live-row">
            <div><span>{t.posture}</span><b>{m.supported && m.posture !== 'unknown' ? (m.posture === 'upright' ? 'Upright' : 'Lying') : '—'}</b><em>{m.supported ? 'phone sensor' : 'no sensor here'}</em></div>
            <div><span>{t.ambient}</span><b>{w ? `${Math.round(w.temp)}°` : '—'}</b><em>{w ? 'Open-Meteo, live' : 'offline'}</em></div>
            <div><span>Source</span><b>{link.state === 'live' ? 'Bluetooth' : link.state === 'preview' ? 'Sample' : '—'}</b><em>{link.state === 'preview' ? 'not your body' : 'GATT 0x1809'}</em></div>
          </div>
          {!on && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            {link.supported && <button className="btn btn-ghost" onClick={link.connect}>{I.bt}Reconnect</button>}
            <button className="btn btn-ghost" onClick={link.preview}>Sample stream</button></div>}
          {on && <button className="link-btn" onClick={link.disconnect}>Disconnect</button>}
        </section>
      )}

      {(s.paired || on) && (!s.weekDone ? (
        <section className="card">
          <div className="m-kicker">{t.weekTitle}</div>
          <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 12px' }}>A result needs at least 72 hours worn. To see what the phone computes, play a sample week:</p>
          <div className="seg">{(['typical', 'heat', 'asymmetry', 'both', 'poorWear', 'fault'] as Kind[]).map(k => <button key={k} className={s.clipKind === k ? 'on' : ''} onClick={() => set({ clipKind: k, weekDone: false })}>{KIND_LABEL[k]}</button>)}</div>
          <div className="week-dots">{[1, 2, 3, 4, 5, 6, 7].map(d => <i key={d} className={ff >= d ? 'on' : ''}><span>D{d}</span></i>)}</div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={fastForward} disabled={ff > 0 && ff < 8}>{ff > 0 && ff < 8 ? `Day ${ff} of 7…` : 'Fast-forward 7 days'}</button>
        </section>
      ) : trace && analysis && (
        <section className="card">
          <div className="m-between"><div className="m-kicker">{t.weekTitle} · {link.state === 'live' ? 'from your Clip' : 'sample week'}</div><button className="link-btn" style={{ margin: 0 }} onClick={() => set({ weekDone: false })}>Change</button></div>
          <div style={{ marginTop: 10 }}><ThermalChart trace={trace} height={140} compact /></div>
          <div className="m-between" style={{ fontSize: 11, marginTop: 6 }}><span style={{ color: '#ffc15e' }}>● {t.left}</span><span style={{ color: '#3be8e0' }}>● {t.right}</span><span className="dim">shaded = lying</span></div>
          <div style={{ overflowX: 'auto', marginTop: 10 }}><Heatmap trace={trace} cell={10} gap={2} /></div>
          {analysis.status !== 'ok' ? (
            <div className="note" style={{ color: 'var(--warm)', marginTop: 12 }}><b>No result.</b> {analysis.reason}</div>
          ) : (
            <div className="sig-grid">
              <Sig label={t.heatLoad} v={`${analysis.heatHoursPerDay!.toFixed(1)} h/d`} flag={analysis.highHeat} rule="≥ 3 h/day at ≥ 35.0 °C" />
              <Sig label={t.pattern} v={`${analysis.diffUpright!.toFixed(2)}°`} flag={analysis.asymmetryPattern} rule={`upright vs ${analysis.diffLying!.toFixed(2)}° lying`} />
              <Sig label={t.cooling} v={`${analysis.coolingDrop!.toFixed(2)}°`} rule="upright minus lying" />
              <Sig label={t.wear} v={`${analysis.wornHours.toFixed(0)} h`} rule="≥ 72 h needed" />
            </div>
          )}
          <p className="dim" style={{ fontSize: 12, margin: '10px 0 0' }}>{t.notDiagnosis} Calculated by fixed rules on the phone; no AI.</p>
        </section>
      ))}
    </>
  )
}
function LiveChart({ hist }: { hist: { t: number; left: number | null; right: number | null }[] }) {
  const H = 96
  const v = hist.flatMap(h => [h.left, h.right]).filter((x): x is number => x != null)
  if (v.length < 4) return <div className="live-chart empty">Waiting for readings…</div>
  const lo = Math.min(...v) - 0.15, hi = Math.max(...v) + 0.15
  const n = Math.max(24, hist.length)
  const path = (k: 'left' | 'right') => hist.map((h, i) => h[k] == null ? '' : `${i === 0 ? 'M' : 'L'}${((n - hist.length + i) / (n - 1)) * 300},${H - ((h[k]! - lo) / (hi - lo)) * (H - 8) - 4}`).join('')
  return (
    <div className="live-chart">
      <svg viewBox={`0 0 300 ${H}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1="0" x2="300" y1={H * f} y2={H * f} stroke="rgba(255,255,255,.05)" />)}
        <path d={path('right')} fill="none" stroke="#3be8e0" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        <path d={path('left')} fill="none" stroke="#ffc15e" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="live-chart-axis mono"><span>{hi.toFixed(1)}°</span><span>last {Math.round(hist.length)} s</span><span>{lo.toFixed(1)}°</span></div>
    </div>
  )
}
function Sig({ label, v, flag, rule }: { label: string; v: string; flag?: boolean; rule: string }) {
  return (
    <motion.div className={`sig ${flag ? 'flag' : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="m-kicker" style={{ color: flag ? 'var(--warm)' : undefined }}>{label}</div>
      <div className="sig-v">{v}</div>
      <div className="dim" style={{ fontSize: 11 }}>{rule}</div>
    </motion.div>
  )
}
function WearGuide() {
  const { s } = useApp()
  const ar = s.lang === 'ar'
  const [open, setOpen] = useState<number | null>(0)
  const faq = [
    ['Does it hurt or feel warm?', 'No. It only listens to temperature: no current, no heating. The pads are soft silicone domes about the size of a fingertip.'],
    ['Can I shower or go to the gym?', 'Take it off to shower, swim or use a sauna. The gym is fine if it does not rub; put it back in the same position.'],
    ['What if I forget a day?', 'Nothing breaks. The phone needs 72 hours worn in total; it tells you if it has too little to give a result, and never calls it normal.'],
    ['Will anyone know?', 'It is the size of a key fob, makes no sound and has no light once paired. Readings stay on your phone.'],
  ]
  return (
    <>
      <div className="steps">
        {WEAR_STEPS.map((x, k) => (
          <motion.div key={k} className="wstep" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.05 }}>
            <div className="wstep-ic"><StepIcon k={x.icon} /></div>
            <div><div className="m-kicker">Step {k + 1}</div><b>{ar ? x.tAr : x.t}</b><p>{ar ? x.dAr : x.d}</p></div>
          </motion.div>
        ))}
      </div>
      <section className="card">
        <div className="dodont">
          <div><div className="m-kicker" style={{ color: 'var(--mint)' }}>Do</div><ul><li>Snug briefs or trunks</li><li>Same spot every day</li><li>Wear it while you sleep</li><li>Open the app once a day</li></ul></div>
          <div><div className="m-kicker" style={{ color: '#ff8a7a' }}>Don’t</div><ul><li>Loose boxers</li><li>Shower or sauna with it</li><li>Tape it to the skin</li><li>Share the Clip</li></ul></div>
        </div>
      </section>
      <section className="card">
        <div className="m-kicker">Questions men ask</div>
        {faq.map(([q, a], k) => (
          <div key={q} className="faq">
            <button onClick={() => setOpen(open === k ? null : k)}><span>{q}</span><span className="faq-x">{open === k ? '−' : '+'}</span></button>
            <AnimatePresence>{open === k && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>{a}</motion.p>}</AnimatePresence>
          </div>
        ))}
      </section>
    </>
  )
}
function Inside() {
  return (
    <>
      <section className="card inside">
        <span className="pill pill-preview" style={{ alignSelf: 'flex-start' }}><i />{CLIP_STATUS}</span>
        <div className="inside-art"><ClipExploded open={1} /></div>
      </section>
      {CLIP_PARTS.map(p => (
        <div key={p.id} className="part" style={{ ['--c' as string]: p.color }}>
          <div className="m-between"><b>{p.name}</b><span className="mono part-no">{p.part}</span></div>
          <p>{p.detail}</p>
        </div>
      ))}
      <section className="card">
        <div className="m-kicker">Specification</div>
        <div className="spec">{CLIP_SPECS.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      </section>
      <section className="card">
        <div className="m-kicker" style={{ color: 'var(--mint)' }}>Safety</div>
        {CLIP_SAFETY.map(([k, v]) => <div key={k} className="safe"><b>{k}</b><p>{v}</p></div>)}
      </section>
      <section className="card">
        <div className="m-kicker" style={{ color: 'var(--warm)' }}>The Pod · home sample</div>
        <div className="spec">{POD_PARTS.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      </section>
    </>
  )
}

/* ---------- care ---------- */
const BOOKABLE: TierId[] = ['urgentUrology', 'fertility', 'andrology', 'familyPhysician']
function Care() {
  const { s, set, t, log, go, notify } = useApp()
  const { analysis } = useClip()
  const tri = triage(toCheckin(s.answers), analysis, s.lab)
  const [open, setOpen] = useState<string | null>(null)
  const [booking, setBooking] = useState<TierId | null>(null)
  if (!s.checkDone) return (<><Header kicker="Steps 3–5" title={t.care} /><section className="card"><p style={{ marginTop: 0 }}>Finish the private check-in first. It decides which steps you see here.</p><button className="btn btn-primary" onClick={() => go('check')}>{t.startCheck}</button></section></>)
  const send = () => {
    sendCase({ code: caseCode(s), sentAt: Date.now(), lang: s.lang, checkin: toCheckin(s.answers), clipKind: s.paired && s.weekDone ? s.clipKind : undefined, lab: s.lab ? { volume: s.lab.volume, concentration: s.lab.concentration, totalMotility: s.lab.totalMotility, progressive: s.lab.progressive, morphology: s.lab.morphology } : undefined })
    if (s.account) call('sendCase', { case: { code: caseCode(s), sentAt: Date.now(), lang: s.lang, checkin: toCheckin(s.answers), clipKind: s.paired && s.weekDone ? s.clipKind : undefined, lab: s.lab } }, 'patient').catch(() => notify('Saved on this phone; will send when online'))
    set({ sharedAt: Date.now(), reviewedAt: undefined })
    log(`Summary sent to the clinician queue as ${caseCode(s)} (with consent)`)
    notify('Sent to the clinician queue')
  }
  const status = s.reviewedAt ? 'reviewed' : s.sharedAt ? 'waiting' : 'unsent'
  return (
    <>
      <Header kicker="Steps 3–5 · review, book, test" title={t.nextStep} sub={tri.clipNote} />
      <div className="review-track">{[['Sent', !!s.sharedAt], ['Clinician', !!s.reviewedAt], ['Booked', s.bookings.length > 0]].map(([l, d], k) => <div key={k} className={d ? 'done' : ''}><i />{l as string}</div>)}</div>
      <div className={`send-card ${status}`}>
        {status === 'unsent' && <>
          <b>Ready for a clinician to check</b>
          <div className="muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>Sends your answers, Clip signals and results under the code <b className="mono">{caseCode(s)}</b>. No name, no ID. Written to your audit log.</div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={send}>Send for clinician review</button>
        </>}
        {status === 'waiting' && <>
          <div className="m-row"><span className="pulse-dot" /><b>Waiting for a clinician</b></div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Case {caseCode(s)} is in the review queue. Open the clinician console (/clinic) in this browser to review it live.</div>
          <button className="link-btn" onClick={() => { set({ reviewedAt: Date.now(), reviewNote: 'Approved (single-screen demo).' }); log('Referral reviewed (single-screen demo)') }}>Single screen? Approve it from here</button>
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
          <motion.div key={r.tier + r.rule} className="tier" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.06 }} style={{ ['--c' as string]: m.color }}>
            <div className="m-between"><span className="tier-tag">{m.label}</span><span className="dim mono">{r.rule}</span></div>
            <div className="tier-title">{r.title}</div>
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
        <p className="dim" style={{ fontSize: 11, textAlign: 'center' }}>Prototype: partner-clinic slots are illustrative.</p>
      </motion.div>
    </motion.div>
  )
}
function LabCard() {
  const { s } = useApp()
  const lab = s.lab!
  return (
    <div className="lab">
      <div className="m-between"><b>Semen analysis · lab result</b><span className="dim" style={{ fontSize: 11 }}>{new Date(lab.at).toLocaleDateString()} · sample result</span></div>
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
    <div className="why" style={{ color: 'var(--ink)' }}>Pod arriving tomorrow. Collect at home, then press the button on the Pod to start its 60-minute timer.
      <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={() => { set({ pod: 'collected', collectedAt: Date.now(), breach: false }); log('Sample collected; Pod timer started') }}>I’ve collected the sample</button></div>
  )
  if (s.pod === 'delivered') return <div className="why" style={{ color: 'var(--mint)' }}>Delivered to the lab in time and within 20–37 °C. The result arrives here with your anonymous code.</div>
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
          {!bad && <button className="dim" style={{ fontSize: 11 }} onClick={() => { set({ breach: true }); log('Pod temperature breach tested') }}>Test a breach</button>}
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
  const items = [['Check-in answers', `${Object.keys(s.answers).length} items`], ['Clip readings', s.weekDone ? '1,008 per pad' : '—'], ['Pod log', s.pod], ['Account', 'none'], ['Server copies', 'none']]
  return (
    <>
      <Header kicker="Privacy" title={t.privacyTitle} sub="Everything below is stored only in this browser. The server never sees it." />
      <section className="card vault-grid">{items.map(([k, v]) => <div key={k}><span>{k}</span><b className="mono">{v}</b></div>)}</section>
      <section className="card">
        <div className="m-kicker" style={{ color: '#ff8a6a' }}>{t.never}</div>
        <div className="never" style={{ marginTop: 10 }}>{['Insurance', 'Employment', 'Marriage paperwork', 'Visa', 'Advertising', 'AI training without consent'].map(x => <span key={x}>{x}</span>)}</div>
      </section>
      <section className="card">
        <b>Share with your wife or doctor</b>
        <p className="muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>A summary only, through a link that opens once and expires in 24 hours. Nothing is shared automatically.</p>
        {link ? (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="m-row">
            <img src={link.qr} width={86} height={86} alt="QR code of the one-time link" />
            <div style={{ minWidth: 0 }}><div className="mono" style={{ wordBreak: 'break-all', fontSize: 12 }}>{link.url}</div><div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>Expires {new Date(link.exp).toLocaleString()}</div></div>
          </motion.div>
        ) : <button className="btn btn-primary" style={{ width: '100%' }} onClick={make}>{t.share}</button>}
      </section>
      <section className="card">
        <b>Audit log</b>
        <div className="audit">{s.audit.slice(0, 8).map((a, k) => <div key={k}><span className="mono">{new Date(a.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>{a.what}</div>)}</div>
      </section>
      {!confirm ? <button className="btn btn-ghost" style={{ width: '100%', color: '#ff8a7a', borderColor: 'rgba(255,77,61,.4)' }} onClick={() => setConfirm(true)}>{t.deleteAll}</button>
        : <section className="card" style={{ borderColor: 'rgba(255,77,61,.5)' }}><p style={{ marginTop: 0 }}>Delete every answer, reading and log from this device? This cannot be undone.</p>
          <div className="m-row"><button className="btn" style={{ background: '#ff4d3d', color: '#fff' }} onClick={reset}>Delete</button><button className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancel</button></div></section>}
    </>
  )
}
