import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Heatmap, ThermalChart } from '../components/viz'
import { analyse, Analysis, Trace } from '../engine/signals'
import { Kind, rng, simulate } from '../engine/simulate'
import { Checkin, EMPTY_CHECKIN, TIER_META, TIER_ORDER, triage, Triage } from '../engine/rules'
import { postReview, readInbox, readReviews, SharedCase, subscribe } from '../engine/sync'
import { runSignalBench, runTriageSuite } from '../engine/benchmark'
import './console.css'
import './console-guide.css'

interface Case { live?: boolean; id: string; age: number | string; group: string; lang: 'Arabic' | 'English'; edu: string; submitted: number; checkin: Checkin; trace: Trace; analysis: Analysis; tri: Triage; completed: boolean; daysToEval: number }
const GROUPS = ['Emirati', 'Arab expatriate', 'South Asian', 'Other']
const EDU = ['School', 'Diploma', 'University']
const qs = new URLSearchParams(location.search)
const EMBED = qs.has('embed')

/** A case the man sent from his app (same browser in the prototype). */
function fromShared(sc: SharedCase): Case {
  const trace = simulate(sc.clipKind ?? 'poorWear', 11)
  const analysis = analyse(trace)
  return {
    live: true, id: sc.code, age: '—', group: 'Not shared', lang: sc.lang === 'ar' ? 'Arabic' : 'English', edu: 'Not shared', submitted: sc.sentAt,
    checkin: sc.checkin, trace, analysis, tri: triage(sc.checkin, sc.clipKind ? analysis : undefined, sc.lab), completed: true, daysToEval: 0,
  }
}

function cohort(n = 28): Case[] {
  const r = rng(42)
  const kinds: Kind[] = ['typical', 'asymmetry', 'heat', 'both', 'typical', 'poorWear', 'typical', 'heat']
  return Array.from({ length: n }, (_, i) => {
    const c: Checkin = { ...EMPTY_CHECKIN, steroids: r() < 0.18, smoke: r() < 0.3, metabolic: r() < 0.3, heatJob: r() < 0.35, udt: r() < 0.06, infection: r() < 0.06, lump: i === 3, pain: false, ttc: (['none', 'lt6', '6to12', 'ge12'] as const)[Math.floor(r() * 4)], partner35: r() < 0.3 }
    const trace = simulate(kinds[i % kinds.length], 300 + i)
    const analysis = analyse(trace)
    const group = GROUPS[Math.floor(r() * 4)]
    return {
      id: 'ALZ-' + Math.floor(r() * 36 ** 4).toString(36).toUpperCase().padStart(4, '0'), age: 21 + Math.floor(r() * 24), group, lang: (r() < 0.55 ? 'Arabic' : 'English') as Case['lang'], edu: EDU[Math.floor(r() * 3)],
      submitted: Date.now() - Math.floor(r() * 50) * 3600e3, checkin: c, trace, analysis, tri: triage(c, analysis),
      completed: r() < (group === 'South Asian' ? 0.68 : 0.8), daysToEval: 3 + Math.floor(r() * 12),
    }
  }).sort((a, b) => TIER_ORDER.indexOf(a.tri.recommendations[0].tier) - TIER_ORDER.indexOf(b.tri.recommendations[0].tier) || a.submitted - b.submitted)
}

/* ---------- getting-started progress (persisted) ---------- */
type Prog = { opened?: boolean; decided?: boolean; live?: boolean; fairness?: boolean; bench?: boolean; tour?: boolean }
const PKEY = 'alarzah.console.progress'
const readProg = (): Prog => { try { return JSON.parse(localStorage.getItem(PKEY) || '{}') } catch { return {} } }
function useProgress() {
  const [p, setP] = useState<Prog>(readProg)
  const mark = (k: keyof Prog) => setP(o => { if (o[k]) return o; const n = { ...o, [k]: true }; try { localStorage.setItem(PKEY, JSON.stringify(n)) } catch { /* ignore */ } return n })
  return { p, mark }
}

const ic = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const NAV_ICON: Record<string, JSX.Element> = {
  today: <svg viewBox="0 0 24 24" width="18" height="18" {...ic}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>,
  queue: <svg viewBox="0 0 24 24" width="18" height="18" {...ic}><path d="M5 7h14M5 12h14M5 17h9" /></svg>,
  fairness: <svg viewBox="0 0 24 24" width="18" height="18" {...ic}><path d="M12 4v16M5 8h14M7 8l-3 6a3 3 0 0 0 6 0Zm10 0-3 6a3 3 0 0 0 6 0Z" /></svg>,
  benchmark: <svg viewBox="0 0 24 24" width="18" height="18" {...ic}><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" /></svg>,
}

type View = 'today' | 'queue' | 'fairness' | 'benchmark'
export default function Console() {
  const loc = useLocation(), nav = useNavigate()
  const view: View = loc.pathname.includes('benchmark') ? 'benchmark' : loc.pathname.includes('fairness') ? 'fairness' : loc.pathname.includes('queue') ? 'queue' : 'today'
  const base = useMemo(() => cohort(), [])
  const [inbox, setInbox] = useState(readInbox)
  const [flash, setFlash] = useState<string | null>(null)
  const { p, mark } = useProgress()
  useEffect(() => subscribe(() => {
    const next = readInbox()
    setInbox(prev => { if (next[0] && next[0].code !== prev[0]?.code) { setSel(next[0].code); setFlash(next[0].code); mark('live'); setTimeout(() => setFlash(null), 6000) } return next })
  }), [])
  useEffect(() => { if (inbox.length) mark('live') }, [inbox.length])
  useEffect(() => { if (view === 'fairness') mark('fairness'); if (view === 'benchmark') mark('bench') }, [view])
  const cases = useMemo(() => [...inbox.map(fromShared), ...base], [inbox, base])
  const [sel, setSel] = useState(() => readInbox()[0]?.code ?? base[0].id)
  const [signed, setSigned] = useState<Record<string, 'approved' | 'changed'>>(() => Object.fromEntries(readReviews().map(r => [r.code, r.decision])))
  useEffect(() => { if (Object.keys(signed).length) mark('decided') }, [signed])
  const [tour, setTour] = useState(() => !EMBED && (qs.has('tour') || (!qs.has('notour') && !readProg().tour)) && loc.pathname.includes('queue'))
  useEffect(() => { document.title = 'Alarzah · Clinician console' }, [])
  const waiting = cases.filter(c => !signed[c.id] && c.tri.recommendations.some(r => r.clinicianReview))
  const go = (v: View) => nav(v === 'today' ? '/clinic' : `/clinic/${v}`)
  const startTour = () => { nav('/clinic/queue'); setTimeout(() => setTour(true), 450) }
  return (
    <div className={`c-shell grain ${EMBED ? 'embed' : ''}`}>
      <aside className="c-rail">
        <Link to="/" className="c-brand"><img src="/icon.svg" width={30} height={30} alt="" /><div><b>Alarzah</b><div className="dim" style={{ fontSize: 11 }}>Clinician console</div></div></Link>
        {([['today', 'Today', null], ['queue', 'Review queue', waiting.length], ['fairness', 'Fairness', null], ['benchmark', 'Test suite', '30/30']] as const).map(([k, l, b]) => (
          <button key={k} className={`c-navi ${view === k ? 'on' : ''}`} onClick={() => go(k)}>
            {view === k && <motion.div layoutId="cnav" className="c-navglow" />}<span className="c-navl">{NAV_ICON[k]}{l}</span>{b != null && <span className={`c-badge ${k === 'queue' && b ? 'hot' : ''}`}>{b}</span>}
          </button>))}
        <div className="c-rail-steps">
          <div className="c-mini">Your shift</div>
          {[['Open the top case', p.opened], ['Approve or change', p.decided], ['Watch a live case arrive', p.live], ['Check fairness', p.fairness]].map(([l, d]) => <div key={l as string} className={d ? 'done' : ''}><i />{l as string}</div>)}
        </div>
        <div style={{ marginTop: 'auto' }} className="c-note">Sample cohort for the prototype.<br />Signed in as <b>Dr. Demo</b> (guest)<br /><button className="c-linkbtn" onClick={startTour}>Replay the walkthrough</button></div>
        <Link to="/app" className="btn btn-ghost" style={{ fontSize: 13, padding: '10px 12px' }}>Open the man’s app →</Link>
      </aside>
      <main className="c-main">
        <AnimatePresence>{flash && <motion.button className="c-flash" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => go('queue')}><span className="c-live">LIVE</span> New case {flash} just arrived from the man’s app{view !== 'queue' && <b> · Open it →</b>}</motion.button>}</AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            {view === 'today' && <Today cases={cases} waiting={waiting} signed={signed} p={p} go={go} open={id => { setSel(id); go('queue') }} startTour={startTour} />}
            {view === 'queue' && <Queue cases={cases} sel={sel} setSel={id => { setSel(id); mark('opened') }} signed={signed} setSigned={setSigned} onOpen={() => mark('opened')} />}
            {view === 'fairness' && <Fairness cases={cases} />}
            {view === 'benchmark' && <Bench />}
          </motion.div>
        </AnimatePresence>
      </main>
      <AnimatePresence>{tour && view === 'queue' && <Tour onDone={() => { setTour(false); mark('tour') }} />}</AnimatePresence>
    </div>
  )
}

/* ---------- Today: where to start ---------- */
const FLOW = [
  { k: 'Check-in', who: 'The man', d: '13 private questions in his app', c: '#3be8e0' },
  { k: 'Clip week', who: 'His phone', d: 'Heat load and left/right pattern computed on the phone', c: '#7cf5b8' },
  { k: 'Rules R1–R8', who: 'Fixed rules', d: 'Rank the next steps; red flags go to him instantly', c: '#ffc15e' },
  { k: 'Your review', who: 'You', d: 'Approve or change every referral', c: '#ffffff', you: true },
  { k: 'Booking', who: 'The man', d: 'Opens only after your sign-off', c: '#c9a6ff' },
  { k: 'Pod + lab', who: 'Lab', d: 'Home sample; result returns under his code', c: '#7cc8ff' },
  { k: 'Rule R8', who: 'Fixed rules', d: 'Result below WHO limits → back to you', c: '#ff8a3d' },
]
function Today({ cases, waiting, signed, p, go, open, startTour }: { cases: Case[]; waiting: Case[]; signed: Record<string, string>; p: Prog; go: (v: View) => void; open: (id: string) => void; startTour: () => void }) {
  const urgent = waiting.filter(c => ['emergency', 'urgentUrology'].includes(c.tri.recommendations[0].tier))
  const live = cases.filter(c => c.live)
  const avgWait = waiting.length ? waiting.reduce((a, c) => a + (Date.now() - c.submitted), 0) / waiting.length / 3600e3 : 0
  const steps: [string, string, boolean | undefined, () => void][] = [
    ['Take the 60-second walkthrough', 'See what each part of a case means', p.tour, startTour],
    ['Open the most urgent case', 'The queue is already sorted by the rules', p.opened, () => waiting[0] && open(waiting[0].id)],
    ['Approve or change one referral', 'Approve sends it to his phone at once', p.decided, () => go('queue')],
    ['Watch a live case arrive', 'Open /app in another tab, send a case, it appears here', p.live, () => window.open('/app', '_blank')],
    ['Check fairness across groups', 'Completion by nationality, language, education', p.fairness, () => go('fairness')],
    ['Look at the published test suite', '30 triage cases and the signal benchmark', p.bench, () => go('benchmark')],
  ]
  const doneN = steps.filter(s => s[2]).length
  return (
    <div className="c-today">
      <div className="c-hero">
        <div>
          <div className="eyebrow">Clinician console · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>Your review shift</h1>
          <p className="muted">Men send anonymous summaries from the Alarzah app. Fixed rules have already ranked them and chosen the next steps. <b>Your job is one decision per case: approve those steps, or change them.</b> Nothing reaches the man, and nothing can be booked, until you do.</p>
          <div className="c-hero-cta">
            <button className="btn btn-primary" onClick={() => waiting[0] ? open(waiting[0].id) : go('queue')}>Start with the most urgent case →</button>
            <button className="btn btn-ghost" onClick={startTour}>Show me around</button>
          </div>
        </div>
        <div className="c-kpis5">
          {[[waiting.length, 'waiting for you', ''], [urgent.length, 'urgent or red-flag', 'hot'], [live.length, 'sent live today', 'live'], [Object.keys(signed).length, 'signed off', 'ok'], [`${avgWait.toFixed(0)} h`, 'average wait', '']].map(([v, l, c]) => (
            <div key={l as string} className={`c-k ${c}`}><b>{v}</b><span>{l}</span></div>))}
        </div>
      </div>

      <section className="glass c-card">
        <div className="c-head"><div><b style={{ fontSize: 17 }}>How a case reaches you</b><div className="dim" style={{ fontSize: 12.5 }}>Seven steps from his phone to a lab result. You hold step 4; everything after waits for it.</div></div></div>
        <div className="c-flow">
          {FLOW.map((f, k) => (
            <motion.div key={f.k} className={`c-flow-n ${f.you ? 'you' : ''}`} style={{ ['--c' as string]: f.c }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.06 }}>
              <div className="c-flow-i">{k + 1}</div>
              <div className="c-flow-who">{f.who}</div>
              <b>{f.k}</b>
              <span>{f.d}</span>
              {k < FLOW.length - 1 && <i className="c-flow-arrow" />}
            </motion.div>))}
        </div>
      </section>

      <div className="c-grid2">
        <section className="glass c-card">
          <div className="c-head"><b style={{ fontSize: 17 }}>Getting started</b><span className="chip">{doneN}/{steps.length} done</span></div>
          <div className="c-prog"><motion.div animate={{ width: `${(doneN / steps.length) * 100}%` }} /></div>
          {steps.map(([t, d, done, act], k) => (
            <button key={t} className={`c-step ${done ? 'done' : ''}`} onClick={act}>
              <span className="c-step-n">{done ? '✓' : k + 1}</span>
              <div><b>{t}</b><div className="dim">{d}</div></div>
              <span className="c-step-go">→</span>
            </button>))}
        </section>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <section className="glass c-card">
            <b style={{ fontSize: 17 }}>Who decides what</b>
            <div className="c-roles">
              <div><span className="c-role you">You</span><p>Approve or change each referral · add a note to the man · send a case back to his family physician</p></div>
              <div><span className="c-role rules">Fixed rules</span><p>Red flags (sent to him instantly, never wait for you) · ranking · every number from the Clip and the lab</p></div>
              <div><span className="c-role ai">AI</span><p>Only rewords the explanation in Arabic or English · a checker blocks new numbers, diagnoses or promises</p></div>
            </div>
          </section>
          <section className="glass c-card">
            <div className="c-head"><b style={{ fontSize: 17 }}>Up next</b><button className="c-linkbtn" onClick={() => go('queue')}>Full queue →</button></div>
            {waiting.slice(0, 4).map(c => { const top = c.tri.recommendations[0]; return (
              <button key={c.id} className="c-next" onClick={() => open(c.id)}>
                <span className="c-dot" style={{ background: TIER_META[top.tier].color, boxShadow: `0 0 12px ${TIER_META[top.tier].color}` }} />
                <span className="mono">{c.id}{c.live && <span className="c-live">LIVE</span>}</span>
                <span className="dim">{TIER_META[top.tier].label}</span>
                <span className="dim" style={{ marginLeft: 'auto' }}>{Math.round((Date.now() - c.submitted) / 3600e3)} h</span>
              </button>) })}
          </section>
        </div>
      </div>
    </div>
  )
}

/* ---------- walkthrough (coach marks) ---------- */
const TOUR = [
  { sel: '.c-list', t: '1 · The queue', d: 'Every man here sent his summary himself, under an anonymous code. The rules sorted them: red and orange first. LIVE marks a case that just arrived from a phone.' },
  { sel: '.c-journey', t: '2 · Where this case is', d: 'Received, rules applied, then your review. Booking and the home lab test stay locked until you sign.' },
  { sel: '.c-recs', t: '3 · What the rules chose', d: 'Each card is one next step, with the rule that fired (R1–R8) and the exact reason. No AI chose these.' },
  { sel: '.c-evidence', t: '4 · The evidence', d: 'Seven days of Clip readings, left in amber and right in teal, and the findings calculated from them. Check they support the steps.' },
  { sel: '.c-decide', t: '5 · Your decision', d: 'Approve sends the steps to his phone at once and opens booking. Change sends him to his family physician first. That is the whole job.' },
]
function Tour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const [r, setR] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    let id = 0
    const upd = () => { const el = document.querySelector(TOUR[i].sel); setR(el ? el.getBoundingClientRect() : null) }
    const el = document.querySelector(TOUR[i].sel)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    upd(); id = window.setInterval(upd, 120)
    window.addEventListener('resize', upd)
    return () => { clearInterval(id); window.removeEventListener('resize', upd) }
  }, [i])
  const pad = 8
  const W = window.innerWidth, H = window.innerHeight
  const below = r ? r.bottom + 220 < H : true, above = r ? r.top - 220 > 0 : false
  // tall targets: put the tip beside them (right if it fits, else left); otherwise below, else above
  const side = r && !below && !above ? (r.right + 390 < W ? 'right' : 'left') : null
  const tipLeft = !r ? 16 : side === 'right' ? r.right + 18 : side === 'left' ? Math.max(16, r.left - 378) : Math.min(W - 380, Math.max(16, r.left))
  const tipTop = !r ? 100 : side ? Math.min(H - 240, Math.max(16, r.top + 40)) : below ? r.bottom + 14 : r.top - 214
  return (
    <motion.div className="c-tour" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {r && <motion.div className="c-spot" animate={{ left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: Math.min(r.height, window.innerHeight - 40) + pad * 2 }} transition={{ type: 'spring', stiffness: 200, damping: 28 }} />}
      <motion.div className="c-tip glass" key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, left: tipLeft, top: tipTop }}>
        <div className="eyebrow">{TOUR[i].t}</div>
        <p>{TOUR[i].d}</p>
        <div className="c-tip-foot">
          <div className="c-tip-dots">{TOUR.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
          <button className="c-linkbtn" onClick={onDone}>Skip</button>
          {i > 0 && <button className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: 13 }} onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => (i < TOUR.length - 1 ? setI(i + 1) : onDone())}>{i < TOUR.length - 1 ? 'Next' : 'Start reviewing'}</button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ---------- queue ---------- */
function Journey({ c, signed }: { c: Case; signed?: string }) {
  const steps = [
    ['Received', true, c.live ? 'from his phone' : `${Math.round((Date.now() - c.submitted) / 3600e3)} h ago`],
    ['Rules applied', true, c.tri.firedRules.slice(0, 3).join(' · ') || 'R7'],
    ['Your review', !!signed, signed ? (signed === 'approved' ? 'approved' : 'changed') : 'waiting for you'],
    ['He books', false, signed ? 'open to him now' : 'locked until review'],
    ['Lab result', false, 'returns under his code'],
  ] as const
  const cur = steps.findIndex(s => !s[1])
  return (
    <div className="c-journey">
      {steps.map(([l, d, sub], k) => (
        <div key={l} className={`c-j ${d ? 'done' : k === cur ? 'cur' : ''}`}>
          <i>{d ? '✓' : k + 1}</i><div><b>{l}</b><span>{sub}</span></div>
        </div>))}
    </div>
  )
}
function Queue({ cases, sel, setSel, signed, setSigned, onOpen }: { cases: Case[]; sel: string; setSel: (s: string) => void; signed: Record<string, 'approved' | 'changed'>; setSigned: (f: (o: Record<string, 'approved' | 'changed'>) => Record<string, 'approved' | 'changed'>) => void; onOpen: () => void }) {
  const c = cases.find(x => x.id === sel) ?? cases[0]
  const [q, setQ] = useState('')
  useEffect(() => { onOpen() }, [])
  const list = cases.filter(x => x.id.toLowerCase().includes(q.toLowerCase()) || x.group.toLowerCase().includes(q.toLowerCase()))
  const idx = cases.findIndex(x => x.id === c.id)
  const nextOpen = cases.slice(idx + 1).find(x => !signed[x.id])
  const decide = (d: 'approved' | 'changed') => {
    setSigned(o => ({ ...o, [c.id]: d }))
    if (c.live) postReview({ code: c.id, decision: d, note: d === 'approved' ? 'Approved. Please book the steps shown; the home test can go ahead.' : 'Changed: please see your family physician first; they will arrange the rest.', at: Date.now(), by: 'Dr. Demo' })
  }
  return (
    <div className="c-queue">
      <section className="glass c-list scroll-thin">
        <div className="c-head"><h2>Review queue</h2><span className="chip"><span className="dot" />{cases.length} men · by urgency</span></div>
        <div className="c-how"><span>1</span>Pick a case <span>2</span>Check steps + evidence <span>3</span>Approve or change</div>
        <input className="c-search" placeholder="Search anonymous ID or group…" value={q} onChange={e => setQ(e.target.value)} />
        {list.map(x => {
          const top = x.tri.recommendations[0]
          return (
            <motion.button layout key={x.id} className={`c-item ${x.id === c.id ? 'on' : ''}`} onClick={() => setSel(x.id)}>
              <span className="c-dot" style={{ background: TIER_META[top.tier].color, boxShadow: `0 0 12px ${TIER_META[top.tier].color}` }} />
              <div style={{ flex: 1, textAlign: 'left' }}><div className="mono" style={{ color: 'var(--ink)' }}>{x.id}{x.live && <span className="c-live">LIVE</span>}</div><div className="dim" style={{ fontSize: 12 }}>{TIER_META[top.tier].label} · {x.lang}</div></div>
              {signed[x.id] ? <span className="c-ok">✓</span> : <span className="dim" style={{ fontSize: 11 }}>{Math.round((Date.now() - x.submitted) / 3600e3)}h</span>}
            </motion.button>)
        })}
      </section>
      <AnimatePresence mode="wait">
        <motion.section key={c.id} className="c-detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.3 }}>
          <div className="glass c-card">
            <div className="c-head">
              <div><div className="eyebrow">Shared by the man · one-time summary</div><h2 className="mono" style={{ fontSize: 28, marginTop: 6 }}>{c.id}</h2>
                <div className="muted" style={{ fontSize: 13 }}>{c.live ? <>Sent from the man’s app just now · {c.lang} · age, nationality and education not shared</> : <>Age {c.age} · {c.group} · {c.lang} · {c.edu} · submitted {Math.round((Date.now() - c.submitted) / 3600e3)} h ago</>}</div></div>
              <div className="c-decide">
                {signed[c.id] ? <>
                  <span className="chip" style={{ color: 'var(--mint)' }}>✓ {signed[c.id] === 'approved' ? 'Referrals approved' : 'Changed and sent'}</span>
                  {nextOpen && <button className="btn btn-ghost" onClick={() => setSel(nextOpen.id)}>Next case →</button>}
                </> : <>
                  <button className="btn btn-primary" onClick={() => decide('approved')}>Approve and send</button>
                  <button className="btn btn-ghost" onClick={() => decide('changed')}>Change</button></>}
              </div>
            </div>
            <Journey c={c} signed={signed[c.id]} />
            <div className="c-sub">What the rules chose · each step cites its rule</div>
            <div className="c-recs">
              {c.tri.recommendations.map(r => (
                <div key={r.tier} className="c-rec" style={{ borderColor: TIER_META[r.tier].color + '66' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><b style={{ color: TIER_META[r.tier].color }}>{TIER_META[r.tier].label}</b><span className="mono dim">{r.rule}</span></div>
                  <div style={{ fontSize: 14, margin: '4px 0' }}>{r.title}</div>
                  <div className="dim" style={{ fontSize: 12 }}>{r.why}</div>
                </div>))}
            </div>
          </div>
          <div className="c-grid2 c-evidence">
            <div className="glass c-card">
              <div className="c-head"><b>Clip · 7 days</b><span className="dim" style={{ fontSize: 12 }}><span style={{ color: '#ffc15e' }}>● left</span> &nbsp;<span style={{ color: '#3be8e0' }}>● right</span> &nbsp;shaded = lying</span></div>
              <ThermalChart trace={c.trace} height={200} />
              <div style={{ overflowX: 'auto', marginTop: 10 }}><Heatmap trace={c.trace} cell={13} gap={2} /></div>
            </div>
            <div className="glass c-card">
              <div className="c-head"><b>Calculated findings</b><span className="dim" style={{ fontSize: 12 }}>fixed rules · no AI</span></div>
              {c.analysis.status !== 'ok' ? <p style={{ color: 'var(--warm)' }}>{c.analysis.reason}</p> : (
                <table className="c-table"><tbody>
                  <tr><td>Heat load</td><td>{c.analysis.heatHoursPerDay!.toFixed(1)} h/day ≥ 35.0 °C</td><td>{c.analysis.highHeat ? <span style={{ color: 'var(--warm)' }}>R-HEAT</span> : '—'}</td></tr>
                  <tr><td>Left − right, upright</td><td>{c.analysis.diffUpright!.toFixed(2)} °C</td><td rowSpan={2}>{c.analysis.asymmetryPattern ? <span style={{ color: 'var(--warm)' }}>R-ASYM</span> : '—'}</td></tr>
                  <tr><td>Left − right, lying</td><td>{c.analysis.diffLying!.toFixed(2)} °C</td></tr>
                  <tr><td>Night cooling</td><td>{c.analysis.coolingDrop!.toFixed(2)} °C</td><td>—</td></tr>
                  <tr><td>Wear</td><td>{c.analysis.wornHours.toFixed(0)} h</td><td>≥ 72 h ✓</td></tr>
                </tbody></table>)}
              <div className="c-head" style={{ marginTop: 18 }}><b>Check-in (shared)</b></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(c.checkin).filter(([, v]) => v && v !== 'none').map(([k, v]) => <span key={k} className="chip">{k}{typeof v === 'string' ? `: ${v}` : ''}</span>)}
              </div>
              <div className="c-ai"><b>AI-worded explanation</b> <span className="dim">(checked against the rules before display)</span><br />“Your Clip readings and answers suggest {c.tri.recommendations.map(r => TIER_META[r.tier].label.toLowerCase()).join(', ')}. This is screening support, not a diagnosis.”</div>
            </div>
          </div>
        </motion.section>
      </AnimatePresence>
    </div>
  )
}

function Fairness({ cases }: { cases: Case[] }) {
  const by = (key: 'group' | 'lang' | 'edu') => {
    const vals = Array.from(new Set(cases.map(c => c[key])))
    return vals.map(v => { const g = cases.filter(c => c[key] === v); return { v, n: g.length, done: g.filter(c => c.completed).length / g.length, days: g.reduce((a, c) => a + c.daysToEval, 0) / g.length } })
  }
  const avg = cases.filter(c => c.completed).length / cases.length
  return (
    <div>
      <div className="c-head"><div><div className="eyebrow">Fairness across groups</div><h2 style={{ fontSize: 34, marginTop: 6 }}>Is it working for everyone?</h2></div><span className="chip" style={{ color: 'var(--warm)' }}>Sample cohort · method demo</span></div>
      <div className="c-explain"><b>What to look for:</b> any group more than 10 points below the average completion rate is flagged ⚑ for follow-up (outreach in that language, a different time of day, a male nurse). Split by nationality group, language and education, as the challenge asks.</div>
      <div className="c-fair">
        {(['group', 'lang', 'edu'] as const).map(k => (
          <div key={k} className="glass c-card">
            <b>{k === 'group' ? 'Nationality group' : k === 'lang' ? 'Language' : 'Education'}</b>
            {by(k).map((row, i) => {
              const flag = row.done < avg - 0.1
              return (
                <div key={row.v} style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{row.v} <span className="dim">n={row.n}</span></span><span style={{ color: flag ? 'var(--warm)' : 'var(--mint)' }}>{Math.round(row.done * 100)}% completed {flag && '⚑'}</span></div>
                  <div className="progress" style={{ marginTop: 6 }}><motion.div initial={{ width: 0 }} animate={{ width: `${row.done * 100}%` }} transition={{ delay: i * 0.1, duration: 0.8 }} style={{ background: flag ? 'linear-gradient(90deg,#ffc15e,#ff6a3d)' : undefined }} /></div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>Mean {row.days.toFixed(1)} days to first evaluation</div>
                </div>)
            })}
          </div>))}
      </div>
    </div>
  )
}

function Bench() {
  const [seed, setSeed] = useState(2026)
  const suite = useMemo(() => runTriageSuite(), [])
  const sig = useMemo(() => runSignalBench(seed), [seed])
  const red = suite.filter(r => r.c.redFlag)
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`
  return (
    <div>
      <div className="c-head"><div><div className="eyebrow">Published test suite · runs live in your browser</div><h2 style={{ fontSize: 34, marginTop: 6 }}>Proof, not promises</h2></div>
        <button className="btn btn-ghost" onClick={() => setSeed(s => s + 1)}>Re-run signals with new seed ↻</button></div>
      <div className="c-explain"><b>How to read this:</b> the triage suite checks that each published case reaches the right tier (red flags must never wait for review). The signal benchmark plays sample weeks with known answers through the same engine your queue uses, and reports misses honestly.</div>
      <div className="c-kpis">
        {[[`${suite.filter(r => r.pass).length}/${suite.length}`, 'triage cases pass'], [`${red.filter(r => r.pass).length}/${red.length}`, 'red-flag cases routed correctly'], [`${sig.noResultCorrect}/${sig.noResultTotal}`, 'poor-wear / faulty traces returned “no result”, never “normal”'], ...sig.metrics.map(m => [`${pct(m.sens)} / ${pct(m.spec)}`, `${m.name}: sensitivity / specificity`])].map(([v, l], k) => (
          <motion.div key={l} className="glass c-kpi" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.06 }}><b className={k < 3 ? 'thermal-text' : ''}>{v}</b><span className="muted">{l}</span></motion.div>))}
      </div>
      <div className="c-grid2" style={{ marginTop: 14 }}>
        <div className="glass c-card scroll-thin" style={{ maxHeight: 560, overflow: 'auto' }}>
          <b>Triage cases</b>
          <table className="c-table" style={{ marginTop: 10 }}><thead><tr><th>ID</th><th>Case</th><th>Expected</th><th>Result</th></tr></thead><tbody>
            {suite.map(r => <tr key={r.c.id}><td className="mono">{r.c.id}{r.c.redFlag && <span style={{ color: '#ff6a3d' }}> ●</span>}</td><td>{r.c.name}</td><td className="dim" style={{ fontSize: 12 }}>{r.c.must.map(m => TIER_META[m].short).join(', ')}{r.c.mustNot ? ` · not ${r.c.mustNot.map(m => TIER_META[m].short).join(', ')}` : ''}</td><td style={{ color: r.pass ? 'var(--mint)' : 'var(--red)' }}>{r.pass ? 'pass' : 'FAIL'}</td></tr>)}
          </tbody></table>
        </div>
        <div className="glass c-card">
          <b>Signal benchmark · {sig.traces} sample weeks</b>
          <p className="dim" style={{ fontSize: 13 }}>Magnitudes are randomised (left/right 0.4–1.4 °C, heat 2–7 h/day), so borderline weeks are included on purpose and misses are expected. 95% Wilson intervals.</p>
          {sig.metrics.map(m => (
            <div key={m.name} style={{ marginTop: 18 }}>
              <div style={{ fontWeight: 600 }}>{m.name}</div>
              {([['Sensitivity', m.sens, m.sensCI, `${m.tp}/${m.tp + m.fn}`], ['Specificity', m.spec, m.specCI, `${m.tn}/${m.tn + m.fp}`]] as const).map(([l, v, ci, frac]) => (
                <div key={l} style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span className="muted">{l} <span className="dim">{frac}</span></span><span>{pct(v)} <span className="dim">[{pct(ci[0])}–{pct(ci[1])}]</span></span></div>
                  <div className="c-ci"><div style={{ left: `${ci[0] * 100}%`, width: `${(ci[1] - ci[0]) * 100}%` }} /><i style={{ left: `${v * 100}%` }} /></div>
                </div>))}
            </div>))}
          <p className="dim" style={{ fontSize: 12, marginTop: 20 }}>Same suite runs in CI with Vitest (11 tests). Pilot data will replace the sample weeks.</p>
        </div>
      </div>
    </div>
  )
}
