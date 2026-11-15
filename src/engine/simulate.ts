// Synthetic 7-day Clip traces with known ground truth (for demo and benchmark only).
import { DAYS, Posture, Sample, STEP_MIN, Trace } from './signals'

export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}
function gauss(r: () => number) {
  const u = Math.max(r(), 1e-9), v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export type Kind = 'typical' | 'heat' | 'asymmetry' | 'both' | 'poorWear' | 'fault'
export const KIND_LABEL: Record<Kind, string> = {
  typical: 'Typical week',
  heat: 'High heat load',
  asymmetry: 'Left/right pattern',
  both: 'Heat + pattern',
  poorWear: 'Clip barely worn',
  fault: 'Sensor fault',
}

export interface SimOptions { asymMagnitude?: number; heatHours?: number; naturalOffset?: number }

export function simulate(kind: Kind, seed = 7, opt: SimOptions = {}): Trace {
  const r = rng(seed)
  const asymMag = opt.asymMagnitude ?? 0.9
  const heatHours = opt.heatHours ?? 5
  const natural = opt.naturalOffset ?? (r() - 0.5) * 0.3 // everyone is a little asymmetric
  const samples: Sample[] = []
  const perDay = (24 * 60) / STEP_MIN
  const heatStart = 9 + Math.floor(r() * 3)
  let drift = 0
  for (let i = 0; i < DAYS * perDay; i++) {
    const minute = i * STEP_MIN
    const hour = (minute / 60) % 24
    const day = Math.floor(minute / 1440)
    const lying = hour < 6.5 || hour >= 23
    const posture: Posture = lying ? 'lying' : (hour >= 8 && hour < 17) || (hour >= 19 && hour < 22) ? 'sitting' : 'standing'
    drift = drift * 0.96 + gauss(r) * 0.04
    const ambient = 24 + 6 * Math.max(0, Math.sin(((hour - 7) / 14) * Math.PI)) + (posture === 'sitting' && hour > 12 && hour < 15 ? 4 : 0)
    let core = lying ? 33.0 : posture === 'sitting' ? 34.1 : 33.8
    core += drift
    const inHeat = !lying && hour >= heatStart && hour < heatStart + heatHours
    if ((kind === 'heat' || kind === 'both') && inHeat) core += 1.35
    let left = core + natural / 2 + gauss(r) * 0.12
    let right = core - natural / 2 + gauss(r) * 0.12
    if (kind === 'asymmetry' || kind === 'both') left += lying ? asymMag * 0.15 : asymMag
    let wornNow = true
    if (kind === 'poorWear') wornNow = day === 0 && hour >= 8 && hour < 20
    else if (r() < 0.04) wornNow = false // short gaps happen
    if (kind === 'fault' && day >= 2) right = 34.25
    samples.push({
      t: minute,
      left: wornNow ? Math.round(left * 100) / 100 : null,
      right: wornNow ? (kind === 'fault' && day >= 2 ? right : Math.round(right * 100) / 100) : null,
      ambient: Math.round(ambient * 10) / 10,
      posture,
    })
  }
  return {
    id: `${kind}-${seed}`,
    label: KIND_LABEL[kind],
    samples,
    truth: {
      asymmetry: kind === 'asymmetry' || kind === 'both',
      highHeat: (kind === 'heat' || kind === 'both') && heatHours >= 3,
      poorWear: kind === 'poorWear',
      fault: kind === 'fault',
    },
  }
}

/** Hourly 7×24 grid of mean temperature (for heatmaps). */
export function hourlyGrid(trace: Trace, side: 'left' | 'right' | 'mean' = 'mean'): (number | null)[][] {
  const grid: (number | null)[][] = Array.from({ length: DAYS }, () => Array(24).fill(null))
  const acc: Record<string, number[]> = {}
  for (const s of trace.samples) {
    if (s.left == null || s.right == null) continue
    const d = Math.floor(s.t / 1440), h = Math.floor((s.t % 1440) / 60)
    const v = side === 'left' ? s.left : side === 'right' ? s.right : (s.left + s.right) / 2
    ;(acc[`${d}-${h}`] ||= []).push(v)
  }
  for (const [k, vals] of Object.entries(acc)) {
    const [d, h] = k.split('-').map(Number)
    grid[d][h] = vals.reduce((a, b) => a + b, 0) / vals.length
  }
  return grid
}
