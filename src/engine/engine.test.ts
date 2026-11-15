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
