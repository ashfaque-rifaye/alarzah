import { describe, expect, it } from 'vitest'
import { analyse } from './signals'
import { simulate } from './simulate'
import { EMPTY_CHECKIN, triage } from './rules'
import { runSignalBench, runTriageSuite, wilson } from './benchmark'

describe('signal engine', () => {
  it('flags the left/right pattern', () => expect(analyse(simulate('asymmetry', 3)).asymmetryPattern).toBe(true))
  it('flags high heat load', () => expect(analyse(simulate('heat', 3)).highHeat).toBe(true))
  it('typical week is quiet', () => {
    const a = analyse(simulate('typical', 3))
    expect(a.status).toBe('ok'); expect(a.asymmetryPattern).toBe(false); expect(a.highHeat).toBe(false)
  })
  it('poor wear gives no result, never normal', () => expect(analyse(simulate('poorWear', 3)).status).toBe('insufficient'))
  it('stuck sensor gives a fault, never normal', () => expect(analyse(simulate('fault', 3)).status).toBe('fault'))
})

describe('triage rules', () => {
  it('pain goes to emergency first', () => expect(triage({ ...EMPTY_CHECKIN, pain: true }).recommendations[0].tier).toBe('emergency'))
  it('emergency is never held for clinician review', () =>
    expect(triage({ ...EMPTY_CHECKIN, pain: true }).recommendations[0].clinicianReview).toBe(false))
  it('all 30 published cases pass', () => expect(runTriageSuite().filter(r => !r.pass).map(r => r.c.id)).toEqual([]))
  it('100% of red-flag cases route correctly', () => {
    const red = runTriageSuite().filter(r => r.c.redFlag)
    expect(red.length).toBeGreaterThanOrEqual(8); expect(red.every(r => r.pass)).toBe(true)
  })
})

describe('benchmark', () => {
  it('wilson interval is sane', () => { const [lo, hi] = wilson(9, 10); expect(lo).toBeGreaterThan(0.5); expect(hi).toBeLessThanOrEqual(1) })
  it('no-result traces never read as normal', () => { const b = runSignalBench(); expect(b.noResultCorrect).toBe(b.noResultTotal) })
})

import { numbersIn, verify } from './verify'
describe('AI reply checker', () => {
  const facts = { recommendations: [{ tier: 'andrology', label: 'Andrology / urology', title: 'A short andrology / urology examination', rule: 'R4', why: 'Left minus right: 0.74 °C upright vs 0.02 °C lying' }] }
  it('reads Arabic digits', () => expect(numbersIn('٠٫٧٤ و 12')).toEqual(['0.74', '12']))
  it('passes a faithful reply', () => expect(verify('Your left side was 0.74 °C warmer when upright. A short examination is the next step. This is screening support, not a diagnosis.', facts).every(c => c.pass)).toBe(true))
  it('blocks an invented statistic', () => expect(verify('About 40% of men like you have a varicocele.', facts)[0].pass).toBe(false))
  it('blocks a diagnosis', () => expect(verify('You have a varicocele and should get surgery.', facts)[1].pass).toBe(false))
  it('blocks marriage advice', () => expect(verify('You should not marry until this is fixed.', facts)[1].pass).toBe(false))
  it('keeps emergency first', () => {
    const f = { recommendations: [{ tier: 'emergency', label: 'Emergency now', title: 'Go to an emergency department now', rule: 'R1', why: 'pain' }] }
    expect(verify('Please see your family doctor soon. This is screening support.', f).find(c => c.name.startsWith('Emergency'))!.pass).toBe(false)
  })
})
