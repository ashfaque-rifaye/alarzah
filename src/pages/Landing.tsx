import SiteNav from '../components/SiteNav'
import { motion, MotionValue, useMotionValueEvent, useScroll, useSpring, useTransform } from 'framer-motion'
import Lenis from 'lenis'
import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AskPanel, factsFrom } from '../components/Ask'
import { CountUp, Heatmap, ThermalChart } from '../components/viz'
import { CLIP_PARTS, CLIP_SAFETY, CLIP_SPECS, CLIP_STATUS, ClipExploded, POD_PARTS, StepIcon, WEAR_STEPS } from '../components/Device'
import { analyse } from '../engine/signals'
import { Kind, KIND_LABEL, simulate } from '../engine/simulate'
import { EMPTY_CHECKIN, TIER_META, TIER_ORDER, triage } from '../engine/rules'
import './landing.css'

const ClipScene = lazy(() => import('../components/ClipScene'))
const ThermalField = lazy(() => import('../components/ThermalField'))
const ease = [0.16, 1, 0.3, 1] as const
const reveal = { initial: { opacity: 0, y: 40 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-12% 0px' }, transition: { duration: 0.9, ease } }

/** Headline that rises word by word. Words wrapped in *asterisks* get the thermal gradient. */
function Words({ text, className, delay = 0, as: Tag = 'h2' }: { text: string; className?: string; delay?: number; as?: 'h1' | 'h2' }) {
  const words = text.split(' ')
  return (
    <Tag className={className} aria-label={text.replace(/\*/g, '')}>
      {words.map((w, i) => {
        const hot = w.startsWith('*')
        return (
          <Fragment key={i}><span className="w-mask" aria-hidden>
            <motion.span className={`w ${hot ? 'thermal-text' : ''}`} initial={{ y: '110%', rotate: 4 }} whileInView={{ y: '0%', rotate: 0 }} viewport={{ once: true, margin: '-8% 0px' }}
              transition={{ duration: 0.9, ease, delay: delay + i * 0.06 }}>{w.replace(/\*/g, '')}</motion.span>
          </span>{i < words.length - 1 ? ' ' : ''}</Fragment>
        )
      })}
    </Tag>
  )
}

function Cursor() {
  const [on, setOn] = useState(false)
  const [big, setBig] = useState(false)
  const x = useSpring(0, { stiffness: 500, damping: 40 }), y = useSpring(0, { stiffness: 500, damping: 40 })
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return
    setOn(true)
    const move = (e: PointerEvent) => { x.set(e.clientX); y.set(e.clientY); setBig(!!(e.target as HTMLElement).closest('a,button,.tilt')) }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [x, y])
  if (!on) return null
  return <motion.div className={`cursor ${big ? 'big' : ''}`} style={{ x, y }} aria-hidden />
}

function Magnetic({ children, to, primary }: { children: React.ReactNode; to: string; primary?: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null)
  const x = useSpring(0, { stiffness: 220, damping: 14 }), y = useSpring(0, { stiffness: 220, damping: 14 })
  return (
    <motion.span style={{ x, y, display: 'inline-block' }}
      onPointerMove={e => { const r = ref.current!.getBoundingClientRect(); x.set((e.clientX - r.left - r.width / 2) * 0.25); y.set((e.clientY - r.top - r.height / 2) * 0.35) }}
      onPointerLeave={() => { x.set(0); y.set(0) }}>
      <Link ref={ref} to={to} className={`btn ${primary ? 'btn-primary' : 'btn-ghost'}`}>{children}</Link>
    </motion.span>
  )
}

export default function Landing() {
  useEffect(() => {
    document.title = 'Alarzah · Men’s reproductive health, measured quietly'
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true })
    let id = 0
    const raf = (t: number) => { lenis.raf(t); id = requestAnimationFrame(raf) }
    id = requestAnimationFrame(raf)
    return () => { cancelAnimationFrame(id); lenis.destroy() }
  }, [])
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 60])
  const heroFade = useTransform(scrollYProgress, [0, 0.75], [1, 0])
  const clipY = useTransform(scrollYProgress, [0, 1], [0, -140])
  const clipS = useTransform(scrollYProgress, [0, 1], [1, 1.18])
  const wordY = useTransform(scrollYProgress, [0, 1], [0, 120])
  const shadowS = useTransform(scrollYProgress, [0, 0.6], [1, 0.55])
  const shadowO = useTransform(scrollYProgress, [0, 0.6], [1, 0.15])
  const heroOpen = useRef(0)
  useMotionValueEvent(scrollYProgress, 'change', v => { heroOpen.current = Math.min(1, v * 1.6) * 0.75 })
  return (
    <div className="grain landing">
      <Cursor />
      <SiteNav />

      <header className="l-hero hx" ref={heroRef}>
        <div className="l-hero-bg"><Suspense fallback={null}><ThermalField /></Suspense></div>
        <div className="l-wrap hx-wrap">
          <motion.span className="chip hx-chip" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ opacity: heroFade }}><span className="dot" />Future Health 2026 · Fertility · Challenge 01</motion.span>
          <div className="hx-stage">
            <motion.div className="hx-word" aria-hidden initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }} style={{ y: wordY }}>ALARZAH</motion.div>
            <motion.div className="hx-plinth" aria-hidden initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 1.1, ease: [0.16, 1, 0.3, 1] }}>
              <i className="hx-beam" /><i className="hx-top" /><motion.i className="hx-shadow" style={{ scale: shadowS, opacity: shadowO }} /><i className="hx-body" />
            </motion.div>
            <motion.div className="hx-clip" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 1.2, ease: [0.16, 1, 0.3, 1] }} style={{ y: clipY, scale: clipS }}>
              <Suspense fallback={null}><ClipScene height="100%" progress={heroOpen} /></Suspense>
            </motion.div>
          </div>
          <motion.div className="hx-specs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.9 }} style={{ opacity: heroFade }}>
            <div><b>±0.1 °C</b><span>left and right, every minute</span></div><i />
            <div><b>Upright vs lying</b><span>the pattern that matters</span></div><i />
            <div><b>5 months</b><span>on one coin cell</span></div>
          </motion.div>
          <motion.div className="hx-copy" style={{ opacity: heroFade, y: heroY }}>
            <Words as="h1" className="l-h1 hx-h1" text="Men’s fertility, measured *quietly.*" delay={0.5} />
            <motion.p className="l-lede hx-lede" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.8 }}>
              A private check-in, a small Clip that reads heat at home, and a Pod for the semen test without a clinic room. Fixed rules choose the next step. A clinician signs it off.
            </motion.p>
            <motion.div className="l-cta hx-cta" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05 }}>
              <Magnetic to="/app" primary>Open the mobile app →</Magnetic>
              <Magnetic to="/clinic">Clinician console</Magnetic>
            </motion.div>
            <div className="l-scrollcue hx-cue"><span />move your cursor: it’s a heat source</div>
          </motion.div>
        </div>
      </header>

      <div className="marquee"><div>{Array(2).fill(0).map((_, k) => <span key={k}>
        <span>Private check-in</span><i>✦</i><span>Left/right skin temperature</span><i>✦</i><span>Heat load</span><i>✦</i><span>Home sample at 20–37 °C</span><i>✦</i><span>Rules decide, AI explains</span><i>✦</i><span>Arabic + English voice</span><i>✦</i><span>No images, ever</span><i>✦</i>
      </span>)}</div></div>

      <section className="l-section" id="problem"><div className="l-wrap">
        <motion.div {...reveal}><div className="eyebrow">The problem</div></motion.div>
        <Words className="l-h2" text="Men walk in only when it’s *already* *late.*" />
        <motion.p className="l-lede" {...reveal}>The challenge brief: male reproductive health is treated as a late infertility issue. In Abu Dhabi’s own words, men’s screening uptake is low, and today insurance cards are blocked after three months of reminders. Nobody wants that to be the lever.</motion.p>
        <div className="l-stats">
          {[
            { v: 40, s: '%', label: 'lower sperm concentration per 1 °C rise in daytime scrotal temperature', src: 'Hjollund et al., 2002 · 99 men' },
            { v: 1.1, d: 1, s: '°C', label: 'left/right difference with varicocele, vs 0.4 °C without', src: 'Scrotal thermography study' },
            { v: 15, s: '%', label: 'of men have a varicocele, a common treatable cause', src: 'EAU guideline (to verify)' },
            { v: 60, s: ' min', label: 'a home sample must reach the lab within, at 20–37 °C', src: 'WHO laboratory manual 2021' },
          ].map((x, k) => (
            <motion.div key={k} className="glass l-stat tilt" {...reveal} transition={{ ...reveal.transition, delay: k * 0.08 }}>
              <b className={k === 0 ? 'thermal-text' : ''}><CountUp to={x.v} decimals={x.d ?? 0} suffix={x.s} /></b>
              <div style={{ fontSize: 15 }}>{x.label}</div><div className="dim" style={{ fontSize: 12, marginTop: 10 }}>{x.src}</div>
            </motion.div>
          ))}
        </div>
      </div></section>

      <Inside />
      <Hardware />

      <section className="l-section" id="how"><div className="l-wrap">
        <motion.div {...reveal}><div className="eyebrow">How it works</div></motion.div>
        <Words className="l-h2" text="Three quiet steps. *No* *waiting* *room.*" />
        <div className="l-steps">
          {[
            { n: '01', t: 'Private check-in', d: 'Anonymous, in Arabic or English, typed or spoken. History, heat at work, metabolic risk, and the question men never answer in a clinic: non-prescribed steroids.', tag: 'Red flags interrupt instantly', c: '#3be8e0' },
            { n: '02', t: 'The Clip', d: 'Clips into ordinary underwear for 3–7 days. Two skin sensors read left and right; a motion sensor knows lying from upright. No camera, no images.', tag: 'Heat load · left/right pattern', c: '#ffc15e' },
            { n: '03', t: 'The Pod', d: 'Collect at home with your wife, not in a clinic room. The Pod holds 20–37 °C, counts down to the lab deadline and carries an anonymous code.', tag: 'Lab-grade semen analysis', c: '#7cf5b8' },
          ].map((x, k) => (
            <motion.div key={k} className="glass l-step tilt" {...reveal} transition={{ ...reveal.transition, delay: k * 0.1 }} whileHover={{ y: -8 }}>
              <div className="l-step-n">{x.n}</div>
              <div className="l-step-art"><motion.i animate={{ scale: [1, 1.12, 1], rotate: [0, 90, 180] }} transition={{ duration: 6 + k, repeat: Infinity, ease: 'easeInOut' }} style={{ background: `conic-gradient(from 0deg, ${x.c}, transparent 40%, ${x.c})` }} /><span style={{ background: x.c, boxShadow: `0 0 50px ${x.c}` }} /></div>
              <h3>{x.t}</h3><p className="muted" style={{ margin: 0 }}>{x.d}</p>
              <span className="chip" style={{ marginTop: 'auto', alignSelf: 'flex-start', color: 'var(--ink)' }}>{x.tag}</span>
            </motion.div>
          ))}
        </div>
      </div></section>

      <Theatre />
      <Product />
      <Ladder />

      <section className="l-section" id="privacy"><div className="l-wrap">
        <motion.div {...reveal}><div className="eyebrow">Privacy by design</div></motion.div>
        <Words className="l-h2" text="His data stays *on* *his* *phone.*" />
        <div className="l-two">
          <motion.div className="glass l-surface" {...reveal}>
            {['Raw readings and answers never leave the device', 'Sharing only through a one-time link that expires in 24 h', 'Lab orders carry an anonymous code, not a name', 'Every share is written to an audit log he can read', 'One button deletes everything'].map((x, k) => (
              <motion.div key={k} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: k * 0.1 }} className="l-check"><span>✓</span>{x}</motion.div>))}
          </motion.div>
          <motion.div className="glass l-surface" {...reveal}>
            <div className="eyebrow" style={{ color: '#ff8a6a' }}>Never used for</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
              {['Insurance', 'Employment', 'Marriage paperwork', 'Visa', 'Advertising', 'Model training without consent'].map((x, k) => (
                <motion.span key={x} className="l-never" initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: k * 0.07 }}>{x}</motion.span>))}
            </div>
            <p className="muted" style={{ marginTop: 30 }}>AI never decides anything. Fixed rules compute every signal and every referral; Claude only rewords explanations in plain Arabic or English, and a checker blocks any reply that adds a number, diagnoses, promises an outcome, or gives marriage or medication advice.</p>
          </motion.div>
        </div>
      </div></section>

      <section className="l-section" id="honest"><div className="l-wrap">
        <motion.div {...reveal}><div className="eyebrow" style={{ color: 'var(--warm)' }}>What we don’t claim</div></motion.div>
        <Words className="l-h2" text="Honest *limits.*" />
        <div className="l-honest">
          {[['Thresholds are provisional', 'The 35.0 °C heat line and the 0.6 °C left/right rule come from small studies. A pilot must calibrate them.'],
            ['No validated product exists yet', 'Wearable scrotal temperature is supported by research, not by a cleared device. The Clip is a screening prompt, not a diagnosis.'],
            ['Skin readings need the Clip', 'The app streams real outdoor heat, the phone’s own motion sensor and any real Bluetooth thermometer today. Without a Clip, skin readings are a labelled preview; the Clip is a reference design, not yet a finished device.'],
            ['Our own benchmark shows misses', 'On 60 simulated weeks the left/right rule caught 72% of patterns, with no false alarms. Borderline cases are included on purpose.']].map(([h, d]) => (
            <motion.div key={h} {...reveal}><b>{h}</b><p className="muted" style={{ margin: '6px 0 0' }}>{d}</p></motion.div>))}
        </div>
      </div></section>

      <section className="l-final"><div className="l-wrap" style={{ textAlign: 'center' }}>
        <Words className="l-h2" text="Earlier. Private. *Measured.*" />
        <div className="l-cta" style={{ justifyContent: 'center' }}><Magnetic to="/app" primary>Try the app →</Magnetic><Magnetic to="/clinic/benchmark">See the test suite</Magnetic></div>
      </div></section>

      <footer className="l-foot"><div className="l-wrap" style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <span>Alarzah · Future Health Digital Innovation Challenge 2026 · Fertility Challenge 01 · Prototype, synthetic data only, not medical advice.</span>
        <span style={{ display: 'flex', gap: 16 }}><Link to="/app">App</Link><Link to="/clinic">Console</Link><Link to="/clinic/benchmark">Test suite</Link><Link to="/demo">Demo video</Link></span>
      </div></footer>
    </div>
  )
}

/* ---------- Inside the Clip: pinned, scroll-driven exploded view ---------- */
const STEPS = [
  { k: 'Assembled', t: 'The size of a key fob.', d: 'It clips into ordinary underwear. Nothing to see, nothing to hear, nothing to charge for a week.' },
  { k: 'Shell', t: 'No camera. No microphone.', d: 'Washable medical silicone. Privacy is enforced by what the hardware simply does not have.' },
  { k: 'Sensors', t: 'Left and right, ±0.1 °C.', d: 'Two Texas Instruments TMP117 sensors read each side once a minute, accurate to ±0.1 °C across the 32–35 °C range scrotal skin sits in. The difference between them is the signal.' },
  { k: 'Motion', t: 'It knows lying from upright.', d: 'A varicocele fills when standing. A difference that appears upright and fades lying down is the pattern worth an examination.' },
  { k: 'Phone', t: 'Computed on his phone.', d: 'An nRF52832 radio stores the week and syncs over the standard Bluetooth Health Thermometer profile. Fixed rules on the phone turn it into heat load and the left/right pattern. Nothing goes to a server.' },
]
function Inside() {
  const ref = useRef<HTMLDivElement>(null)
  const prog = useRef(0)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const [step, setStep] = useState(0)
  useMotionValueEvent(scrollYProgress, 'change', v => { prog.current = v; setStep(Math.min(STEPS.length - 1, Math.floor(v * STEPS.length * 0.999))) })
  return (
    <section className="l-inside" id="inside" ref={ref}>
      <div className="l-inside-pin">
        <div className="l-wrap l-inside-grid">
          <div>
            <div className="eyebrow">Inside the Clip</div>
            <motion.div key={step} initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.6, ease }}>
              <div className="l-inside-k mono">{String(step + 1).padStart(2, '0')} · {STEPS[step].k}</div>
              <h2 className="l-h2" style={{ margin: '10px 0 14px' }}>{STEPS[step].t}</h2>
              <p className="l-lede">{STEPS[step].d}</p>
            </motion.div>
            <div className="l-inside-bar"><Bar p={scrollYProgress} /></div>
          </div>
          <Suspense fallback={null}><ClipScene height="78vh" progress={prog} labels /></Suspense>
        </div>
      </div>
    </section>
  )
}
function Bar({ p }: { p: MotionValue<number> }) {
  const w = useTransform(p, [0, 1], ['0%', '100%'])
  return <motion.div style={{ width: w }} />
}

/* ---------- Signal theatre + AI explainer ---------- */
function Theatre() {
  const [kind, setKind] = useState<Kind>('asymmetry')
  const [lang, setLang] = useState<'en' | 'ar'>('en')
  const trace = useMemo(() => simulate(kind, 11), [kind])
  const a = useMemo(() => analyse(trace), [trace])
  const tri = useMemo(() => triage(EMPTY_CHECKIN, a), [a])
  return (
    <section className="l-section" id="signals"><div className="l-wrap">
      <motion.div {...reveal}><div className="eyebrow">Signal theatre · live in your browser</div></motion.div>
      <Words className="l-h2" text="Rules decide. AI explains. *A* *checker* *verifies.*" />
      <motion.p className="l-lede" {...reveal}>Pick a simulated week. The real Alarzah engine computes the signals and the next step; Claude rewords it in plain Arabic or English; the checker blocks any reply that adds a number, diagnoses or advises.</motion.p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 26 }}>
        {(['typical', 'heat', 'asymmetry', 'both', 'poorWear', 'fault'] as Kind[]).map(k => (
          <button key={k} className={`chip ${kind === k ? 'chip-on' : ''}`} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>))}
      </div>
      <div className="l-theatre">
        <div className="glass" style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}><span><span style={{ color: '#ffc15e' }}>● left</span> &nbsp; <span style={{ color: '#3be8e0' }}>● right</span> &nbsp; <span className="dim">shaded = lying</span></span><span className="dim">7 days · 1,008 samples</span></div>
          <ThermalChart trace={trace} height={250} />
          <div style={{ overflowX: 'auto', marginTop: 18 }}><Heatmap trace={trace} cell={18} gap={3} /></div>
          {a.status !== 'ok' ? <p style={{ fontSize: 16, marginBottom: 0 }}><b style={{ color: 'var(--warm)' }}>No result.</b> {a.reason}</p> : (
            <div className="l-sigs">
              {[['Heat load', `${a.heatHoursPerDay!.toFixed(1)} h/day`, a.highHeat], ['Left − right upright', `${a.diffUpright!.toFixed(2)} °C`, a.asymmetryPattern], ['Left − right lying', `${a.diffLying!.toFixed(2)} °C`, false], ['Worn', `${a.wornHours.toFixed(0)} h`, false]].map(([l, v, f]) => (
                <div key={l as string} className={f ? 'hot' : ''}><span className="muted">{l}</span><b>{v}</b></div>))}
            </div>)}
        </div>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div className="glass" style={{ padding: 20 }}>
            <div className="eyebrow" style={{ color: 'var(--warm)' }}>Next step · decided by rules</div>
            {tri.recommendations.map(r => (
              <motion.div key={kind + r.tier} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="l-rec">
                <span style={{ background: TIER_META[r.tier].color, boxShadow: `0 0 14px ${TIER_META[r.tier].color}` }} />
                <div><div style={{ fontWeight: 600 }}>{r.title}</div><div className="dim mono">{r.rule} · {r.why}</div></div>
              </motion.div>))}
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 8 }}>
              {(['en', 'ar'] as const).map(l => <button key={l} className={`chip ${lang === l ? 'chip-on' : ''}`} onClick={() => setLang(l)}>{l === 'en' ? 'English' : 'العربية'}</button>)}
            </div>
            <AskPanel key={kind + lang} facts={factsFrom(tri, a)} lang={lang} />
          </div>
        </div>
      </div>
    </div></section>
  )
}

/* ---------- Live product: the real app and console, embedded ---------- */
function Product() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const rot = useTransform(scrollYProgress, [0, 0.5, 1], [18, 0, -10])
  const y = useTransform(scrollYProgress, [0, 1], [80, -80])
  const [tab, setTab] = useState('care')
  return (
    <section className="l-section" id="product" ref={ref}><div className="l-wrap">
      <motion.div {...reveal}><div className="eyebrow">Two surfaces · both live below</div></motion.div>
      <Words className="l-h2" text="One for him. *One* *for* *the* *clinician.*" />
      <div className="l-product">
        <motion.div className="l-phone-wrap" style={{ rotateY: rot, y }}>
          <div className="l-phone"><div className="l-island" /><iframe key={tab} title="Alarzah mobile app (live)" src={`/app?demo=1&embed=1&tab=${tab}`} loading="lazy" /></div>
          <div className="l-phone-tabs">{[['home', 'Home'], ['check', 'Check-in'], ['clip', 'Clip'], ['care', 'Care + AI'], ['vault', 'Vault']].map(([k, l]) => <button key={k} className={`chip ${tab === k ? 'chip-on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
        </motion.div>
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <motion.div className="l-browser" {...reveal}>
            <div className="l-browser-bar"><i /><i /><i /><span>alarzah.vercel.app/clinic</span></div>
            <div className="l-browser-body"><iframe title="Alarzah clinician console (live)" src="/clinic/queue?embed=1" loading="lazy" /></div>
          </motion.div>
          <motion.div className="l-feature-grid" {...reveal}>
            {[['Installable', 'Add to Home Screen: full-screen, offline'], ['Voice', 'Questions read aloud; answer by voice'], ['Arabic first', 'Full right-to-left layout'], ['Sign-off', 'Every referral reviewed by a clinician']].map(([h, d]) => <div key={h} className="glass"><b>{h}</b><span className="muted">{d}</span></div>)}
          </motion.div>
          <div className="l-cta"><Magnetic to="/app" primary>Open the app full screen →</Magnetic><Magnetic to="/clinic">Open the console</Magnetic></div>
        </div>
      </div>
    </div></section>
  )
}

function Ladder() {
  const rows: Record<string, string> = {
    emergency: 'Sudden severe pain or swelling: possible torsion. Shown instantly, never waits for review.',
    urgentUrology: 'A new lump. Prompt examination and ultrasound.',
    fertility: 'Trying 12+ months (6+ if wife is 35+), or no sperm on a previous test. Both partners together.',
    andrology: 'Left/right pattern on the Clip, or history of undescended testicle.',
    familyPhysician: 'Non-prescribed steroids (confidential), weight, diabetes, infection, past testicular problems.',
    semen: 'Planning a family, or any risk signal. Collected at home with the Pod.',
    selfCare: 'High heat load, hot work, long sitting, smoking or shisha. Re-test in 6 weeks.',
  }
  return (
    <section className="l-section"><div className="l-wrap">
      <motion.div {...reveal}><div className="eyebrow">Safe triage</div></motion.div>
      <Words className="l-h2" text="Seven tiers. *Every* *one* *explicit.*" />
      <div className="l-ladder">
        {TIER_ORDER.filter(t => t !== 'none').map((t, k) => (
          <motion.div key={t} className="l-rung" style={{ ['--c' as string]: TIER_META[t].color }} initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: k * 0.07, duration: 0.6 }}>
            <b style={{ color: TIER_META[t].color, fontFamily: 'var(--display)', fontSize: 18 }}>{TIER_META[t].label}</b>
            <span className="muted">{rows[t]}</span>
            <span className="mono dim">R{k + 1}</span>
          </motion.div>))}
      </div>
    </div></section>
  )
}

/* ---------- Hardware: the reference design, how the test is done, safety ---------- */
function Hardware() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] })
  const [open, setOpen] = useState(0)
  useMotionValueEvent(scrollYProgress, 'change', v => setOpen(Math.min(1, Math.max(0, v * 1.15))))
  return (
    <section className="l-section" id="hardware" ref={ref}><div className="l-wrap">
      <motion.div {...reveal}><div className="eyebrow">The hardware · reference design</div></motion.div>
      <Words className="l-h2" text="Real parts. *Nothing* *exotic.*" />
      <motion.p className="l-lede" {...reveal}>Every part of the Clip is an off-the-shelf, datasheet-backed component. It only listens to temperature, runs on a coin cell and speaks the standard Bluetooth thermometer profile, so the app can already stream from a real device.</motion.p>
      <div className="l-hw">
        <motion.div className="glass l-hw-art" {...reveal}>
          <span className="chip" style={{ color: 'var(--warm)' }}><span className="dot" style={{ background: 'var(--warm)', boxShadow: '0 0 10px var(--warm)' }} />{CLIP_STATUS}</span>
          <ClipExploded open={open} />
        </motion.div>
        <div className="l-hw-parts">
          {CLIP_PARTS.map((p, k) => (
            <motion.div key={p.id} className="l-part" style={{ ['--c' as string]: p.color }} initial={{ opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: k * 0.06 }}>
              <div><b>{p.name}</b><span className="mono">{p.part}</span></div><p>{p.detail}</p>
            </motion.div>))}
        </div>
      </div>
      <div className="l-hw-grid">
        <motion.div className="glass l-surface" {...reveal} style={{ minHeight: 0 }}>
          <div className="eyebrow">Specification</div>
          <div className="l-spec">{CLIP_SPECS.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
        </motion.div>
        <motion.div className="glass l-surface" {...reveal} style={{ minHeight: 0 }}>
          <div className="eyebrow" style={{ color: 'var(--mint)' }}>Safety by design</div>
          <div className="l-spec">{CLIP_SAFETY.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
        </motion.div>
      </div>
      <motion.div {...reveal} style={{ marginTop: 70 }}><div className="eyebrow">How the test is done</div></motion.div>
      <Words className="l-h2" text="Six steps, *at* *home.*" />
      <div className="l-wear">
        {WEAR_STEPS.map((x, k) => (
          <motion.div key={k} className="glass l-wstep" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: k * 0.07 }}>
            <div className="l-wstep-top"><span className="mono">{String(k + 1).padStart(2, '0')}</span><i><StepIcon k={x.icon} /></i></div>
            <b>{x.t}</b><p className="muted">{x.d}</p>
          </motion.div>))}
      </div>
      <motion.div className="glass l-surface l-pod" {...reveal} style={{ minHeight: 0, marginTop: 16 }}>
        <div><div className="eyebrow" style={{ color: 'var(--warm)' }}>And the Pod · home sample to lab</div><p className="muted" style={{ marginTop: 10 }}>Collected at home, not in a clinic room. The Pod keeps the sample at 20–37 °C and counts down the WHO 60-minute window; the lab only ever sees a code.</p></div>
        <div className="l-spec">{POD_PARTS.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      </motion.div>
    </div></section>
  )
}
