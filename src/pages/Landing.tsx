import { motion, useMotionValue, useScroll, useSpring, useTransform } from 'framer-motion'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import BreezeField from '../components/BreezeField'
import { CountUp, Heatmap, ThermalChart } from '../components/viz'
import { analyse } from '../engine/signals'
import { Kind, KIND_LABEL, simulate } from '../engine/simulate'
import { EMPTY_CHECKIN, TIER_META, TIER_ORDER, triage } from '../engine/rules'
import './landing.css'

const ClipScene = lazy(() => import('../components/ClipScene'))
const reveal = { initial: { opacity: 0, y: 40 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-12% 0px' }, transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] } }

function Tilt({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const mx = useMotionValue(0), my = useMotionValue(0)
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [8, -8]), { stiffness: 150, damping: 15 })
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-10, 10]), { stiffness: 150, damping: 15 })
  return (
    <motion.div className={className} style={{ ...style, rotateX: rx, rotateY: ry }}
      onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); mx.set((e.clientX - r.left) / r.width - 0.5); my.set((e.clientY - r.top) / r.height - 0.5) }}
      onPointerLeave={() => { mx.set(0); my.set(0) }}>{children}</motion.div>
  )
}

export default function Landing() {
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [0, 160])
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0])
  return (
    <div className="grain">
      <nav className="l-nav glass">
        <Link to="/" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><img src="/icon.svg" width={28} height={28} alt="" /><b style={{ fontFamily: 'var(--display)', fontSize: 18 }}>Alarzah</b></Link>
        <div className="l-links"><a className="nl" href="#problem">Problem</a><a className="nl" href="#how">How it works</a><a className="nl" href="#signals">Signals</a><a className="nl" href="#privacy">Privacy</a><a className="nl" href="#honest">Limits</a></div>
        <div style={{ display: 'flex', gap: 8 }}><Link className="btn btn-ghost" style={{ padding: '10px 14px', fontSize: 14 }} to="/clinic">Clinician console</Link><Link className="btn btn-primary" style={{ padding: '10px 16px', fontSize: 14 }} to="/app">Open the app</Link></div>
      </nav>

      <header className="l-hero" ref={heroRef}>
        <div className="l-hero-bg"><BreezeField density={1.1} /></div>
        <motion.div className="l-wrap" style={{ y, opacity: fade }}>
          <div className="l-hero-grid">
            <div>
              <motion.span className="chip" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><span className="dot" />Future Health 2026 · Fertility · Challenge 01</motion.span>
              <motion.h1 className="l-h1" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>
                Men’s fertility,<br />measured <span className="thermal-text">quietly.</span>
              </motion.h1>
              <motion.p className="l-lede" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
                Most men are assessed only after a year of trying, or after their wife’s tests. Alarzah is a private front door: an anonymous check-in, a small Clip that reads heat at home, and a Pod that makes the semen test possible without a clinic room. Fixed rules choose the next step. A clinician checks every referral.
              </motion.p>
              <motion.div className="l-cta" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                <Link className="btn btn-primary" to="/app">Open the mobile app →</Link>
                <Link className="btn btn-ghost" to="/clinic">See the clinician console</Link>
              </motion.div>
              <div style={{ display: 'flex', gap: 18, marginTop: 34, flexWrap: 'wrap', fontSize: 13 }} className="muted">
                <span>● No name, no ID</span><span>● No camera, ever</span><span>● 30/30 safety cases pass</span>
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <Suspense fallback={<div style={{ height: 560 }} />}><ClipScene height={560} /></Suspense>
              <motion.div className="l-hud glass" style={{ top: 70, left: 0 }} animate={{ y: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity }}><span className="muted">Left pad</span><br /><b style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--warm)' }}>34.9°</b></motion.div>
              <motion.div className="l-hud glass" style={{ bottom: 110, right: 0 }} animate={{ y: [0, 8, 0] }} transition={{ duration: 6, repeat: Infinity }}><span className="muted">Right pad</span><br /><b style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--cool)' }}>34.1°</b></motion.div>
              <motion.div className="l-hud glass" style={{ bottom: 40, left: 40 }} animate={{ y: [0, -6, 0] }} transition={{ duration: 7, repeat: Infinity }}><span className="mono" style={{ color: 'var(--mint)' }}>R-ASYM · upright 0.80° · lying 0.12°</span></motion.div>
            </div>
          </div>
        </motion.div>
      </header>

      <div className="marquee"><div>{Array(2).fill(0).map((_, k) => <span key={k}>
        <span>Private check-in</span><i>✦</i><span>Left/right skin temperature</span><i>✦</i><span>Heat load</span><i>✦</i><span>Home sample at 20–37 °C</span><i>✦</i><span>Clinician sign-off</span><i>✦</i><span>Arabic + English</span><i>✦</i><span>No images, ever</span><i>✦</i>
      </span>)}</div></div>

      <section className="l-section" id="problem"><div className="l-wrap">
        <motion.div {...reveal}><div className="eyebrow">The problem</div>
          <h2 className="l-h2">Men walk in only when it’s <span className="thermal-text">already late.</span></h2>
          <p className="l-lede">The challenge brief: male reproductive health is treated as a late infertility issue. In Abu Dhabi’s own words, men’s screening uptake is low, and today insurance cards are blocked after three months of reminders. That is not the lever anyone wants.</p></motion.div>
        <div className="l-stats">
          {[
            { v: 40, s: '%', label: 'lower sperm concentration per 1 °C rise in daytime scrotal temperature', src: 'Hjollund et al., 2002 · 99 men' },
            { v: 1.1, d: 1, s: '°C', label: 'left/right difference with varicocele, vs 0.4 °C without', src: 'Scrotal thermography study' },
            { v: 15, s: '%', label: 'of men have a varicocele, a common treatable cause', src: 'EAU guideline (verify)' },
            { v: 60, s: ' min', label: 'a home sample must reach the lab within, at 20–37 °C', src: 'WHO laboratory manual 2021' },
          ].map((x, k) => (
            <motion.div key={k} className="glass l-stat" {...reveal} transition={{ ...reveal.transition, delay: k * 0.08 }}>
              <b className={k === 0 ? 'thermal-text' : ''}><CountUp to={x.v} decimals={x.d ?? 0} suffix={x.s} /></b>
              <div style={{ fontSize: 15 }}>{x.label}</div><div className="dim" style={{ fontSize: 12, marginTop: 10 }}>{x.src}</div>
            </motion.div>
          ))}
        </div>
      </div></section>

      <section className="l-section" id="how" style={{ background: 'radial-gradient(60% 50% at 50% 0%, rgba(59,232,224,.07), transparent)' }}><div className="l-wrap">
        <motion.div {...reveal}><div className="eyebrow">How it works</div><h2 className="l-h2">Three quiet steps. <span className="muted">No waiting room.</span></h2></motion.div>
        <div className="l-steps">
          {[
            { n: '01', t: 'Private check-in', d: 'Anonymous, in Arabic or English. History, heat at work, metabolic risk, and the question men never answer in a clinic: non-prescribed steroids.', tag: 'Red flags interrupt instantly', c: 'var(--cool)' },
            { n: '02', t: 'The Clip', d: 'Clips into ordinary underwear for 3–7 days. Two skin sensors read left and right; a motion sensor knows lying from upright. No camera, no images.', tag: 'Heat load · left/right pattern', c: 'var(--warm)' },
            { n: '03', t: 'The Pod', d: 'Collect at home with your wife, not in a clinic room. The Pod holds 20–37 °C, counts down to the lab deadline and carries an anonymous code.', tag: 'Lab-grade semen analysis', c: 'var(--mint)' },
          ].map((x, k) => (
            <motion.div key={k} {...reveal} transition={{ ...reveal.transition, delay: k * 0.1 }}>
              <Tilt className="glass l-step">
                <div className="n">{x.n}</div>
                <div style={{ height: 120, display: 'grid', placeItems: 'center', transform: 'translateZ(40px)' }}>
                  <motion.div animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }} transition={{ duration: 3 + k, repeat: Infinity }} style={{ width: 90, height: 90, borderRadius: k === 1 ? 30 : '50%', background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.5), ${x.c} 40%, transparent 72%)`, filter: 'blur(.3px)', boxShadow: `0 0 60px -6px ${x.c}` }} />
                </div>
                <h3>{x.t}</h3><p className="muted" style={{ margin: 0 }}>{x.d}</p>
                <span className="chip" style={{ marginTop: 'auto', alignSelf: 'flex-start', color: 'var(--ink)' }}>{x.tag}</span>
              </Tilt>
            </motion.div>
          ))}
        </div>
      </div></section>

      <Theatre />
      <Ladder />

      <section className="l-section" id="privacy"><div className="l-wrap">
        <motion.div {...reveal}><div className="eyebrow">Privacy by design</div><h2 className="l-h2">His data stays <span className="thermal-text">on his phone.</span></h2></motion.div>
        <div className="l-two">
          <motion.div className="glass l-surface" {...reveal}>
            {['Raw readings and answers never leave the device', 'Sharing only through a one-time link that expires in 24 h', 'Lab orders carry an anonymous code, not a name', 'Every share is written to an audit log he can read', 'One button deletes everything'].map((x, k) => (
              <motion.div key={k} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: k * 0.1 }} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--line)', fontSize: 17 }}>
                <span style={{ color: 'var(--mint)' }}>✓</span>{x}</motion.div>))}
          </motion.div>
          <motion.div className="glass l-surface" {...reveal}>
            <div className="eyebrow" style={{ color: '#ff8a6a' }}>Never used for</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
              {['Insurance', 'Employment', 'Marriage paperwork', 'Visa', 'Advertising', 'Model training without consent'].map((x, k) => (
                <motion.span key={x} initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: k * 0.07 }}
                  style={{ padding: '12px 16px', borderRadius: 14, border: '1px solid rgba(255,106,61,.4)', color: '#ffb39a', background: 'rgba(255,106,61,.07)', textDecoration: 'line-through', fontSize: 16 }}>{x}</motion.span>))}
            </div>
            <p className="muted" style={{ marginTop: 30 }}>AI never decides anything. Fixed rules compute every signal and every referral; an AI model may only reword explanations in plain Arabic or English, and a checker blocks any reply whose numbers or advice differ from the rules.</p>
          </motion.div>
        </div>
      </div></section>

      <section className="l-section"><div className="l-wrap">
        <motion.div {...reveal}><div className="eyebrow">Two surfaces</div><h2 className="l-h2">One for him. <span className="muted">One for the clinician.</span></h2></motion.div>
        <div className="l-two">
          <Link to="/app"><Tilt className="glass l-surface" style={{ background: 'radial-gradient(80% 70% at 30% 0%, rgba(59,232,224,.18), transparent), linear-gradient(160deg, rgba(255,255,255,.06), rgba(255,255,255,.02))' }}>
            <div className="eyebrow">Mobile app · installable</div><h3 style={{ fontSize: 34, margin: '14px 0' }}>The private check</h3>
            <p className="muted">Onboarding, check-in with red-flag interrupt, Clip pairing and live readings, next steps with the rule behind each, the Pod countdown, and the privacy vault.</p>
            <span className="btn btn-primary" style={{ marginTop: 20 }}>Open /app →</span>
          </Tilt></Link>
          <Link to="/clinic"><Tilt className="glass l-surface" style={{ background: 'radial-gradient(80% 70% at 70% 0%, rgba(255,193,94,.16), transparent), linear-gradient(160deg, rgba(255,255,255,.06), rgba(255,255,255,.02))' }}>
            <div className="eyebrow" style={{ color: 'var(--warm)' }}>Desktop console</div><h3 style={{ fontSize: 34, margin: '14px 0' }}>Review, sign off, prove it</h3>
            <p className="muted">A review queue ordered by urgency, one-click sign-off, fairness across groups, and the full published test suite running live in the browser.</p>
            <span className="btn btn-ghost" style={{ marginTop: 20 }}>Open /clinic →</span>
          </Tilt></Link>
        </div>
      </div></section>

      <section className="l-section" id="honest"><div className="l-wrap">
        <motion.div {...reveal}><div className="eyebrow" style={{ color: 'var(--warm)' }}>What we don’t claim</div><h2 className="l-h2">Honest limits.</h2></motion.div>
        <div className="l-honest">
          {[['Thresholds are provisional', 'The 35.0 °C heat line and the 0.6 °C left/right rule come from small studies. A pilot must calibrate them.'],
            ['No validated product exists yet', 'Wearable scrotal temperature is supported by research, not by a cleared device. The Clip is a screening prompt, not a diagnosis.'],
            ['Readings here are simulated', 'The demo uses synthetic 7-day traces with known ground truth. The hardware and the engine are real; the physiology is not.'],
            ['Heat and varicocele are two causes among many', 'Most of the value still comes from the check-in, the rules and the semen test.']].map(([h, d]) => (
            <motion.div key={h} {...reveal}><b>{h}</b><p className="muted" style={{ margin: '6px 0 0' }}>{d}</p></motion.div>))}
        </div>
      </div></section>

      <footer className="l-foot"><div className="l-wrap" style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <span>Alarzah · Future Health Digital Innovation Challenge 2026 · Fertility Challenge 01 · Prototype, synthetic data only, not medical advice.</span>
        <span style={{ display: 'flex', gap: 16 }}><Link to="/app">App</Link><Link to="/clinic">Console</Link><Link to="/clinic/benchmark">Test suite</Link><Link to="/demo">Demo video</Link></span>
      </div></footer>
    </div>
  )
}

function Theatre() {
  const [kind, setKind] = useState<Kind>('asymmetry')
  const trace = useMemo(() => simulate(kind, 11), [kind])
  const a = useMemo(() => analyse(trace), [trace])
  const tri = useMemo(() => triage(EMPTY_CHECKIN, a), [a])
  return (
    <section className="l-section" id="signals"><div className="l-wrap">
      <motion.div {...reveal}><div className="eyebrow">Signal theatre · live</div><h2 className="l-h2">Pick a week. <span className="thermal-text">Watch the rules decide.</span></h2>
        <p className="l-lede">This runs the real Alarzah engine in your browser on simulated 7-day Clip traces.</p></motion.div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 26 }}>
        {(['typical', 'heat', 'asymmetry', 'both', 'poorWear', 'fault'] as Kind[]).map(k => (
          <button key={k} className="chip" onClick={() => setKind(k)} style={kind === k ? { color: 'var(--ink)', borderColor: 'rgba(59,232,224,.7)', background: 'rgba(59,232,224,.12)' } : undefined}>{KIND_LABEL[k]}</button>))}
      </div>
      <div className="l-theatre">
        <div className="glass" style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}><span><span style={{ color: '#ffc15e' }}>● left</span> &nbsp; <span style={{ color: '#3be8e0' }}>● right</span> &nbsp; <span className="dim">shaded = lying</span></span><span className="dim">7 days · 1,008 samples</span></div>
          <ThermalChart trace={trace} height={260} />
          <div style={{ overflowX: 'auto', marginTop: 18 }}><Heatmap trace={trace} cell={18} gap={3} /></div>
        </div>
        <div className="glass" style={{ padding: 22 }}>
          <div className="eyebrow">Computed on the phone</div>
          {a.status !== 'ok' ? <p style={{ fontSize: 17 }}><b style={{ color: 'var(--warm)' }}>No result.</b> {a.reason}</p> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              {[['Heat load', `${a.heatHoursPerDay!.toFixed(1)} h/day`, a.highHeat], ['Left − right upright', `${a.diffUpright!.toFixed(2)} °C`, a.asymmetryPattern], ['Left − right lying', `${a.diffLying!.toFixed(2)} °C`, false], ['Worn', `${a.wornHours.toFixed(0)} h`, false]].map(([l, v, f]) => (
                <div key={l as string} style={{ padding: 14, borderRadius: 16, border: `1px solid ${f ? 'rgba(255,193,94,.6)' : 'var(--line)'}`, background: 'rgba(255,255,255,.03)' }}>
                  <div className="muted" style={{ fontSize: 12 }}>{l}</div><div style={{ font: '600 24px var(--display)', color: f ? 'var(--warm)' : undefined }}>{v}</div></div>))}
            </div>)}
          <div className="eyebrow" style={{ marginTop: 22, color: 'var(--warm)' }}>Next step</div>
          {tri.recommendations.map(r => (
            <motion.div key={kind + r.tier} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ width: 10, height: 30, borderRadius: 4, background: TIER_META[r.tier].color, boxShadow: `0 0 14px ${TIER_META[r.tier].color}` }} />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{r.title}</div><div className="dim mono">{r.rule} · {r.why}</div></div>
            </motion.div>))}
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
      <motion.div {...reveal}><div className="eyebrow">Safe triage</div><h2 className="l-h2">Seven tiers. <span className="muted">Every one explicit.</span></h2></motion.div>
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
