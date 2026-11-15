// Deterministic triage rules (EAU/WHO-informed). AI never decides a tier.
import type { Analysis } from './signals'

export type Ttc = 'none' | 'lt6' | '6to12' | 'ge12'
export interface Checkin {
  pain: boolean // sudden severe testicular pain or swelling
  lump: boolean // new lump in a testicle
  udt: boolean // undescended testicle as a child
  pastTesticular: boolean // mumps orchitis, injury, surgery, cancer treatment
  steroids: boolean // non-prescribed testosterone or anabolic steroids, now or past year
  heatJob: boolean // hot work or > 6 h/day sitting or driving
  smoke: boolean // smoking or shisha
  metabolic: boolean // overweight or diabetes
  infection: boolean // discharge, burning, genital sores
  erection: boolean // erection or ejaculation problems
  noSpermBefore: boolean // a previous test found no sperm
  ttc: Ttc
  partner35: boolean
}
export const EMPTY_CHECKIN: Checkin = {
  pain: false, lump: false, udt: false, pastTesticular: false, steroids: false, heatJob: false, smoke: false,
  metabolic: false, infection: false, erection: false, noSpermBefore: false, ttc: 'none', partner35: false,
}

export type TierId = 'emergency' | 'urgentUrology' | 'fertility' | 'andrology' | 'familyPhysician' | 'semen' | 'selfCare' | 'none'
export interface Recommendation {
  tier: TierId
  title: string
  detail: string
  rule: string
  why: string
  clinicianReview: boolean
}
export const TIER_ORDER: TierId[] = ['emergency', 'urgentUrology', 'fertility', 'andrology', 'familyPhysician', 'semen', 'selfCare', 'none']
export const TIER_META: Record<TierId, { label: string; color: string; short: string }> = {
  emergency: { label: 'Emergency now', short: 'Emergency', color: '#ff4d3d' },
  urgentUrology: { label: 'Urgent urology', short: 'Urgent', color: '#ff8a3d' },
  fertility: { label: 'Fertility service', short: 'Fertility', color: '#ffc15e' },
  andrology: { label: 'Andrology / urology', short: 'Andrology', color: '#c9a6ff' },
  familyPhysician: { label: 'Family physician', short: 'Family Dr', color: '#7cc8ff' },
  semen: { label: 'Semen analysis at home', short: 'Semen test', color: '#3be8e0' },
  selfCare: { label: 'Self-care + re-test', short: 'Self-care', color: '#7cf5b8' },
  none: { label: 'Nothing needed now', short: 'All clear', color: '#9fb3bc' },
}

export interface Triage { recommendations: Recommendation[]; redFlag: boolean; clipNote?: string; firedRules: string[] }

export function triage(c: Checkin, clip?: Analysis): Triage {
  const out: Recommendation[] = []
  const add = (r: Recommendation) => { if (!out.some(o => o.tier === r.tier)) out.push(r) }
  const asym = clip?.status === 'ok' && clip.asymmetryPattern
  const heat = clip?.status === 'ok' && clip.highHeat

  if (c.pain) add({ tier: 'emergency', rule: 'R1', clinicianReview: false, title: 'Go to an emergency department now',
    detail: 'Sudden severe pain or swelling can be a twisted testicle, which needs treatment within hours. Do not wait for this app.',
    why: 'You reported sudden, severe testicular pain or swelling.' })
  if (c.lump) add({ tier: 'urgentUrology', rule: 'R2', clinicianReview: false, title: 'See a urologist within days',
    detail: 'A new lump needs a prompt examination and usually an ultrasound. Most lumps are not cancer, but it must be checked.',
    why: 'You reported a new lump in a testicle.' })
  const months = c.ttc === 'ge12' || (c.ttc === '6to12' && c.partner35)
  if (months || c.noSpermBefore) add({ tier: 'fertility', rule: 'R3', clinicianReview: true, title: 'Fertility service, together with your wife',
    detail: 'Both partners should be assessed in parallel, not one after the other.',
    why: c.noSpermBefore ? 'A previous test found no sperm.' : c.ttc === 'ge12' ? 'Trying for 12 months or more.' : 'Trying for 6+ months and your wife is 35 or older.' })
  if (asym || c.udt) add({ tier: 'andrology', rule: 'R4', clinicianReview: true, title: 'A short andrology / urology examination',
    detail: asym ? 'Your Clip showed a left-warmer pattern when upright that fades lying down. A varicocele is one possible cause and is treatable. This is not a diagnosis.'
      : 'A history of undescended testicle is worth a specialist check before planning a family.',
    why: asym ? `Left minus right: ${clip!.diffUpright!.toFixed(2)} °C upright vs ${clip!.diffLying!.toFixed(2)} °C lying (rule: ≥ 0.6 upright, ≤ 0.3 lying).` : 'History of undescended testicle.' })
  if (c.steroids || c.metabolic || c.pastTesticular || c.infection || c.erection) add({ tier: 'familyPhysician', rule: 'R5', clinicianReview: true,
    title: c.steroids ? 'Your family physician, confidentially' : 'Your family physician',
    detail: c.steroids ? 'Non-prescribed testosterone or steroids can switch off sperm production. It is often reversible; a doctor can help you stop safely and check hormones.'
      : 'A routine check of the risk factors you reported.',
    why: [c.steroids && 'non-prescribed steroids', c.metabolic && 'weight or diabetes', c.pastTesticular && 'past testicular problem', c.infection && 'infection symptoms', c.erection && 'erection or ejaculation problems'].filter(Boolean).join(', ') })
  const anyRisk = asym || heat || c.udt || c.steroids || c.metabolic || c.pastTesticular || c.heatJob || c.smoke || c.infection
  if (c.ttc !== 'none' || (anyRisk && !c.pain)) add({ tier: 'semen', rule: 'R6', clinicianReview: true, title: 'A semen analysis, collected at home',
    detail: 'Collect at home with the Alarzah Pod: it keeps the sample between 20 and 37 °C, times the delivery and uses an anonymous lab code.',
    why: c.ttc !== 'none' ? 'You are planning a family.' : 'At least one risk signal is present.' })
  if (heat || c.heatJob || c.smoke) add({ tier: 'selfCare', rule: 'R7', clinicianReview: false, title: 'Self-care plan, then re-test in 6 weeks',
    detail: 'Breaks from sitting every hour, looser underwear, a ventilated car seat, and stopping smoking or shisha. Sperm take about 10 weeks to form, so changes show slowly.',
    why: heat ? `Heat load ${clip!.heatHoursPerDay!.toFixed(1)} h/day at or above 35.0 °C (rule: ≥ 3 h/day).` : c.heatJob ? 'Hot work or long sitting.' : 'Smoking or shisha.' })
  if (!out.length) add({ tier: 'none', rule: 'R0', clinicianReview: false, title: 'Nothing needs a referral now', detail: 'You can repeat the check any time, or when you start planning a family.', why: 'No risk signal in your answers or readings.' })

  out.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
  let clipNote: string | undefined
  if (!clip) clipNote = 'No Clip readings yet. Your result uses your answers only.'
  else if (clip.status !== 'ok') clipNote = clip.reason
  return { recommendations: out, redFlag: c.pain || c.lump, clipNote, firedRules: out.map(o => o.rule).concat(clip?.rules ?? []) }
}
