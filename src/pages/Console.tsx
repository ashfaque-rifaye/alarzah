import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Heatmap, ThermalChart } from '../components/viz'
import { analyse, Analysis, Trace } from '../engine/signals'
import { Kind, rng, simulate } from '../engine/simulate'
import { Checkin, EMPTY_CHECKIN, TIER_META, TIER_ORDER, triage, Triage } from '../engine/rules'
import { runSignalBench, runTriageSuite } from '../engine/benchmark'
import './console.css'

interface Case { id: string; age: number; group: string; lang: 'Arabic' | 'English'; edu: string; submitted: number; checkin: Checkin; trace: Trace; analysis: Analysis; tri: Triage; completed: boolean; daysToEval: number }
const GROUPS = ['Emirati', 'Arab expatriate', 'South Asian', 'Other']
const EDU = ['School', 'Diploma', 'University']

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

type View = 'queue' | 'fairness' | 'benchmark'
export default function Console() {
  const loc = useLocation(), nav = useNavigate()
  const view: View = loc.pathname.includes('benchmark') ? 'benchmark' : loc.pathname.includes('fairness') ? 'fairness' : 'queue'
  const cases = useMemo(() => cohort(), [])
  const [sel, setSel] = useState(cases[0].id)
  const [signed, setSigned] = useState<Record<string, 'approved' | 'changed'>>({})
  useEffect(() => { document.title = 'Alarzah · Clinician console' }, [])
  return (
    <div className="c-shell grain">
      <aside className="c-rail">
        <Link to="/" className="c-brand"><img src="/icon.svg" width={30} height={30} alt="" /><div><b>Alarzah</b><div className="dim" style={{ fontSize: 11 }}>Clinician console</div></div></Link>
        {([['queue', 'Review queue', cases.filter(c => !signed[c.id] && c.tri.recommendations.some(r => r.clinicianReview)).length], ['fairness', 'Fairness', null], ['benchmark', 'Test suite', '30/30']] as const).map(([k, l, b]) => (
          <button key={k} className={`c-navi ${view === k ? 'on' : ''}`} onClick={() => nav(k === 'queue' ? '/clinic' : `/clinic/${k}`)}>
            {view === k && <motion.div layoutId="cnav" className="c-navglow" />}<span>{l}</span>{b != null && <span className="c-badge">{b}</span>}
          </button>))}
        <div style={{ marginTop: 'auto' }} className="c-note">Synthetic cohort · demo only.<br />Signed in as <b>Dr. Demo</b> (guest)</div>
        <Link to="/app" className="btn btn-ghost" style={{ fontSize: 13, padding: '10px 12px' }}>Open the man’s app →</Link>
      </aside>
      <main className="c-main">
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            {view === 'queue' && <Queue cases={cases} sel={sel} setSel={setSel} signed={signed} setSigned={setSigned} />}
            {view === 'fairness' && <Fairness cases={cases} />}
            {view === 'benchmark' && <Bench />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

function Queue({ cases, sel, setSel, signed, setSigned }: { cases: Case[]; sel: string; setSel: (s: string) => void; signed: Record<string, 'approved' | 'changed'>; setSigned: (f: (o: Record<string, 'approved' | 'changed'>) => Record<string, 'approved' | 'changed'>) => void }) {
  const c = cases.find(x => x.id === sel)!
  const [q, setQ] = useState('')
  const list = cases.filter(x => x.id.toLowerCase().includes(q.toLowerCase()) || x.group.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="c-queue">
      <section className="glass c-list scroll-thin">
        <div className="c-head"><h2>Review queue</h2><span className="chip"><span className="dot" />{cases.length} men · sorted by urgency</span></div>
        <input className="c-search" placeholder="Search anonymous ID or group…" value={q} onChange={e => setQ(e.target.value)} />
        {list.map(x => {
          const top = x.tri.recommendations[0]
          return (
            <motion.button layout key={x.id} className={`c-item ${x.id === sel ? 'on' : ''}`} onClick={() => setSel(x.id)}>
              <span className="c-dot" style={{ background: TIER_META[top.tier].color, boxShadow: `0 0 12px ${TIER_META[top.tier].color}` }} />
              <div style={{ flex: 1, textAlign: 'left' }}><div className="mono" style={{ color: 'var(--ink)' }}>{x.id}</div><div className="dim" style={{ fontSize: 12 }}>{TIER_META[top.tier].label} · {x.lang}</div></div>
              {signed[x.id] ? <span className="c-ok">✓</span> : <span className="dim" style={{ fontSize: 11 }}>{Math.round((Date.now() - x.submitted) / 3600e3)}h</span>}
            </motion.button>)
        })}
      </section>
      <AnimatePresence mode="wait">
        <motion.section key={c.id} className="c-detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.3 }}>
          <div className="glass c-card">
            <div className="c-head">
              <div><div className="eyebrow">Shared by the man · one-time summary</div><h2 className="mono" style={{ fontSize: 28, marginTop: 6 }}>{c.id}</h2>
                <div className="muted" style={{ fontSize: 13 }}>Age {c.age} · {c.group} · {c.lang} · {c.edu} · submitted {Math.round((Date.now() - c.submitted) / 3600e3)} h ago</div></div>
              <div style={{ display: 'flex', gap: 8 }}>
                {signed[c.id] ? <span className="chip" style={{ color: 'var(--mint)' }}>✓ {signed[c.id] === 'approved' ? 'Referrals approved' : 'Changed and sent'}</span> : <>
                  <button className="btn btn-primary" onClick={() => setSigned(o => ({ ...o, [c.id]: 'approved' }))}>Approve and send</button>
                  <button className="btn btn-ghost" onClick={() => setSigned(o => ({ ...o, [c.id]: 'changed' }))}>Change</button></>}
              </div>
            </div>
            <div className="c-recs">
              {c.tri.recommendations.map(r => (
                <div key={r.tier} className="c-rec" style={{ borderColor: TIER_META[r.tier].color + '66' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><b style={{ color: TIER_META[r.tier].color }}>{TIER_META[r.tier].label}</b><span className="mono dim">{r.rule}</span></div>
                  <div style={{ fontSize: 14, margin: '4px 0' }}>{r.title}</div>
                  <div className="dim" style={{ fontSize: 12 }}>{r.why}</div>
                </div>))}
            </div>
          </div>
          <div className="c-grid2">
            <div className="glass c-card">
              <div className="c-head"><b>Clip · 7 days</b><span className="dim" style={{ fontSize: 12 }}>recorded observations</span></div>
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
      <div className="c-head"><div><div className="eyebrow">Fairness across groups</div><h2 style={{ fontSize: 34, marginTop: 6 }}>Is it working for everyone?</h2></div><span className="chip" style={{ color: 'var(--warm)' }}>Synthetic cohort · method demo</span></div>
      <p className="muted" style={{ maxWidth: 760 }}>Every measure is split by nationality group, language and education, as the challenge and the Inception42 sessions ask. Any group more than 10 points below the average completion rate is flagged for follow-up.</p>
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
          <b>Signal benchmark · {sig.traces} simulated weeks</b>
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
          <p className="dim" style={{ fontSize: 12, marginTop: 20 }}>Same suite runs in CI with Vitest (11 tests). Synthetic data only; pilot data will replace it.</p>
        </div>
      </div>
    </div>
  )
}
