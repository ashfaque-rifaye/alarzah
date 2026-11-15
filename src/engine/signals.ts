// Alarzah Clip signal engine: deterministic, explainable, no AI.
// One sample every 10 minutes: left/right skin temperature, ambient temperature, posture, worn.

export type Posture = 'lying' | 'sitting' | 'standing'
export interface Sample {
  t: number // minutes since start
  left: number | null
  right: number | null
  ambient: number
  posture: Posture
}
export interface Trace {
  id: string
  label: string
  samples: Sample[]
  truth?: { asymmetry: boolean; highHeat: boolean; poorWear: boolean; fault: boolean }
}

export const STEP_MIN = 10
export const DAYS = 7
export const THRESHOLDS = {
  minWornHours: 72, // at least 3 days of wear
  heatAbsolute: 35.0, // °C mean scrotal skin temperature counted as 'hot' (provisional, pilot-calibrated)
  highHeatHoursPerDay: 3,
  asymUpright: 0.6, // °C left minus right when upright
  asymLyingMax: 0.3, // and fading when lying
  asymPostureDelta: 0.35,
  validMin: 28,
  validMax: 39,
  flatlineSamples: 36, // 6 hours with no change at all
}

export interface Analysis {
  status: 'ok' | 'insufficient' | 'fault'
  reason?: string
  wornHours: number
  medianUpright?: number
  lyingBaseline?: number
  heatHoursPerDay?: number
  coolingDrop?: number
  diffUpright?: number
  diffLying?: number
  highHeat: boolean
  asymmetryPattern: boolean
  rules: string[]
}

export function median(values: number[]): number | undefined {
  if (!values.length) return undefined
  const a = [...values].sort((x, y) => x - y)
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

function hasFault(samples: Sample[]): string | undefined {
  for (const side of ['left', 'right'] as const) {
    let run = 0
    let prev: number | null = null
    for (const s of samples) {
      const v = s[side]
      if (v == null) { run = 0; prev = null; continue }
      if (v < THRESHOLDS.validMin || v > THRESHOLDS.validMax) return `${side} sensor out of range (${v.toFixed(1)} °C)`
      if (prev != null && v === prev) { run++; if (run >= THRESHOLDS.flatlineSamples) return `${side} sensor stuck at ${v.toFixed(2)} °C` }
      else run = 0
      prev = v
    }
  }
  return undefined
}

export function analyse(trace: Trace): Analysis {
  const worn = trace.samples.filter(s => s.left != null && s.right != null)
  const wornHours = (worn.length * STEP_MIN) / 60
  const base: Analysis = { status: 'ok', wornHours, highHeat: false, asymmetryPattern: false, rules: [] }
  const fault = hasFault(trace.samples)
  if (fault) return { ...base, status: 'fault', reason: `Sensor fault: ${fault}. No result is given; the reading never counts as normal.`, rules: ['R-FAULT'] }
  if (wornHours < THRESHOLDS.minWornHours)
    return { ...base, status: 'insufficient', reason: `Worn ${wornHours.toFixed(0)} h; at least ${THRESHOLDS.minWornHours} h (3 days) are needed. A missing reading never counts as normal.`, rules: ['R-WEAR'] }

  const upright = worn.filter(s => s.posture !== 'lying')
  const lying = worn.filter(s => s.posture === 'lying')
  const mean = (s: Sample) => ((s.left as number) + (s.right as number)) / 2
  const lyingBaseline = median(lying.map(mean)) as number
  const medianUpright = median(upright.map(mean)) as number
  const hot = upright.filter(s => mean(s) >= THRESHOLDS.heatAbsolute)
  const days = wornHours / 24
  const heatHoursPerDay = (hot.length * STEP_MIN) / 60 / Math.max(days, 1)
  const diffUpright = median(upright.map(s => (s.left as number) - (s.right as number))) as number
  const diffLying = median(lying.map(s => (s.left as number) - (s.right as number))) as number
  const coolingDrop = medianUpright - lyingBaseline

  const rules: string[] = []
  const highHeat = heatHoursPerDay >= THRESHOLDS.highHeatHoursPerDay
  if (highHeat) rules.push('R-HEAT')
  const asymmetryPattern =
    diffUpright >= THRESHOLDS.asymUpright &&
    diffLying <= THRESHOLDS.asymLyingMax &&
    diffUpright - diffLying >= THRESHOLDS.asymPostureDelta
  if (asymmetryPattern) rules.push('R-ASYM')
  return { status: 'ok', wornHours, medianUpright, lyingBaseline, heatHoursPerDay, coolingDrop, diffUpright, diffLying, highHeat, asymmetryPattern, rules }
}
