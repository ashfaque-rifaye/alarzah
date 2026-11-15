// Published test suite: triage cases with expected tiers, and a signal benchmark with known truth.
import { analyse } from './signals'
import { Checkin, EMPTY_CHECKIN, TierId, triage } from './rules'
import { Kind, simulate } from './simulate'

export interface TriageCase { id: string; name: string; redFlag: boolean; input: Partial<Checkin>; clip?: Kind; must: TierId[]; mustNot?: TierId[] }

export const TRIAGE_CASES: TriageCase[] = [
  { id: 'T01', name: 'Sudden severe pain only', redFlag: true, input: { pain: true }, must: ['emergency'], mustNot: ['semen'] },
  { id: 'T02', name: 'Pain + trying 12 months', redFlag: true, input: { pain: true, ttc: 'ge12' }, must: ['emergency', 'fertility'] },
  { id: 'T03', name: 'New lump', redFlag: true, input: { lump: true }, must: ['urgentUrology'] },
  { id: 'T04', name: 'Lump + steroids', redFlag: true, input: { lump: true, steroids: true }, must: ['urgentUrology', 'familyPhysician'] },
  { id: 'T05', name: 'Pain + lump together', redFlag: true, input: { pain: true, lump: true }, must: ['emergency', 'urgentUrology'] },
  { id: 'T06', name: 'Pain with poor Clip wear', redFlag: true, input: { pain: true }, clip: 'poorWear', must: ['emergency'] },
  { id: 'T07', name: 'Lump with sensor fault', redFlag: true, input: { lump: true }, clip: 'fault', must: ['urgentUrology'] },
  { id: 'T08', name: 'Pain while not planning family', redFlag: true, input: { pain: true, ttc: 'none' }, must: ['emergency'], mustNot: ['none'] },
  { id: 'T09', name: 'Nothing reported', redFlag: false, input: {}, must: ['none'] },
  { id: 'T10', name: 'Typical week, no risks', redFlag: false, input: {}, clip: 'typical', must: ['none'] },
  { id: 'T11', name: 'Trying 12+ months', redFlag: false, input: { ttc: 'ge12' }, must: ['fertility', 'semen'] },
  { id: 'T12', name: 'Trying 6–12 months, wife 35+', redFlag: false, input: { ttc: '6to12', partner35: true }, must: ['fertility'] },
  { id: 'T13', name: 'Trying 6–12 months, wife < 35', redFlag: false, input: { ttc: '6to12' }, must: ['semen'], mustNot: ['fertility'] },
  { id: 'T14', name: 'Previous test: no sperm', redFlag: false, input: { noSpermBefore: true }, must: ['fertility'] },
  { id: 'T15', name: 'Steroids only', redFlag: false, input: { steroids: true }, must: ['familyPhysician', 'semen'] },
  { id: 'T16', name: 'Undescended testicle history', redFlag: false, input: { udt: true }, must: ['andrology'] },
  { id: 'T17', name: 'Left/right pattern on Clip', redFlag: false, input: {}, clip: 'asymmetry', must: ['andrology', 'semen'] },
  { id: 'T18', name: 'High heat load on Clip', redFlag: false, input: {}, clip: 'heat', must: ['selfCare', 'semen'] },
  { id: 'T19', name: 'Heat + pattern', redFlag: false, input: { ttc: 'lt6' }, clip: 'both', must: ['andrology', 'selfCare', 'semen'] },
  { id: 'T20', name: 'Poor wear never reads normal', redFlag: false, input: {}, clip: 'poorWear', must: ['none'], mustNot: ['andrology', 'selfCare'] },
  { id: 'T21', name: 'Sensor fault never reads normal', redFlag: false, input: { ttc: 'lt6' }, clip: 'fault', must: ['semen'], mustNot: ['andrology'] },
  { id: 'T22', name: 'Smoking / shisha', redFlag: false, input: { smoke: true }, must: ['selfCare', 'semen'] },
  { id: 'T23', name: 'Hot job, long driving', redFlag: false, input: { heatJob: true }, must: ['selfCare'] },
  { id: 'T24', name: 'Overweight / diabetes', redFlag: false, input: { metabolic: true }, must: ['familyPhysician'] },
  { id: 'T25', name: 'Infection symptoms', redFlag: false, input: { infection: true }, must: ['familyPhysician'] },
  { id: 'T26', name: 'Erection problems', redFlag: false, input: { erection: true }, must: ['familyPhysician'] },
  { id: 'T27', name: 'Past mumps orchitis', redFlag: false, input: { pastTesticular: true }, must: ['familyPhysician', 'semen'] },
  { id: 'T28', name: 'Planning, no risks', redFlag: false, input: { ttc: 'lt6' }, must: ['semen'], mustNot: ['fertility'] },
  { id: 'T29', name: 'Many risks at once', redFlag: false, input: { steroids: true, smoke: true, metabolic: true, udt: true, ttc: 'ge12' }, clip: 'both', must: ['fertility', 'andrology', 'familyPhysician', 'semen', 'selfCare'] },
  { id: 'T30', name: 'Steroids + trying 12+ months', redFlag: false, input: { steroids: true, ttc: 'ge12' }, must: ['fertility', 'familyPhysician'] },
]

export interface CaseResult { c: TriageCase; got: TierId[]; pass: boolean; ms: number }
export function runTriageSuite(): CaseResult[] {
  return TRIAGE_CASES.map(c => {
    const t0 = performance.now()
    const clip = c.clip ? analyse(simulate(c.clip, 11)) : undefined
    const got = triage({ ...EMPTY_CHECKIN, ...c.input }, clip).recommendations.map(r => r.tier)
    const pass = c.must.every(m => got.includes(m)) && !(c.mustNot ?? []).some(m => got.includes(m))
    return { c, got, pass, ms: performance.now() - t0 }
  })
}

export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (!n) return [0, 1]
  const p = k / n, d = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / d
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

export interface SignalMetric { name: string; tp: number; fn: number; tn: number; fp: number; sens: number; spec: number; sensCI: [number, number]; specCI: [number, number] }
export interface SignalBench { traces: number; noResultCorrect: number; noResultTotal: number; metrics: SignalMetric[] }

/** 60 simulated weeks with randomised magnitudes; borderline cases are included on purpose. */
export function runSignalBench(seed = 2026, n = 60): SignalBench {
  const kinds: ('typical' | 'heat' | 'asymmetry' | 'both' | 'poorWear' | 'fault')[] = ['typical', 'typical', 'heat', 'asymmetry', 'both', 'typical', 'heat', 'asymmetry', 'poorWear', 'fault']
  let s = seed
  const res = Array.from({ length: n }, (_, i) => {
    const kind = kinds[i % kinds.length]
    s = (s * 1103515245 + 12345) % 2147483648
    const r1 = (s % 1000) / 1000
    const asymMagnitude = 0.4 + r1 * 1.0 // 0.4–1.4 °C: some are deliberately below threshold
    const heatHours = 2 + Math.round(r1 * 5) // 2–7 h/day
    const naturalOffset = (r1 - 0.5) * 0.5
    const tr = simulate(kind, 100 + i, { asymMagnitude, heatHours, naturalOffset })
    return { tr, a: analyse(tr) }
  })
  const ok = res.filter(r => !r.tr.truth!.poorWear && !r.tr.truth!.fault)
  const nores = res.filter(r => r.tr.truth!.poorWear || r.tr.truth!.fault)
  const metric = (name: string, truth: (x: typeof res[0]) => boolean, pred: (x: typeof res[0]) => boolean): SignalMetric => {
    let tp = 0, fn = 0, tn = 0, fp = 0
    for (const x of ok) { const t = truth(x), p = pred(x); if (t && p) tp++; else if (t) fn++; else if (p) fp++; else tn++ }
    return { name, tp, fn, tn, fp, sens: tp / Math.max(tp + fn, 1), spec: tn / Math.max(tn + fp, 1), sensCI: wilson(tp, tp + fn), specCI: wilson(tn, tn + fp) }
  }
  return {
    traces: n,
    noResultCorrect: nores.filter(x => x.a.status !== 'ok').length,
    noResultTotal: nores.length,
    metrics: [
      metric('Left/right pattern', x => x.tr.truth!.asymmetry, x => x.a.asymmetryPattern),
      metric('High heat load', x => x.tr.truth!.highHeat, x => x.a.highHeat),
    ],
  }
}
