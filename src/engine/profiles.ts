// Pre-created demo profiles, shared by the API seed and the app's profile picker.
// Every one is fictional and marked as a demo account.
import type { Ttc } from './rules'
import type { Kind } from './simulate'

export interface PatientProfile {
  alias: string
  ageBand: '18–24' | '25–34' | '35–44' | '45+'
  lang: 'en' | 'ar'
  group: 'Emirati' | 'Arab expatriate' | 'South Asian' | 'Other'
  education: 'School' | 'Diploma' | 'University'
  emirate: string
  familyPhysician?: string
  consent: { backup: boolean; shareWithCareTeam: boolean; research: boolean }
  avatar: string // gradient key
}

export interface DemoSeed {
  id: string
  role: 'patient' | 'clinician'
  email: string
  name: string
  title?: string
  blurb: string
  profile?: PatientProfile
  /** Partial app state, merged over a fresh state on the phone. */
  state?: Record<string, unknown>
}

const H = 3600e3
const ago = (h: number) => Date.now() - h * H
const audit = (rows: [number, string][]) => rows.map(([h, what]) => ({ at: ago(h), what }))

export const DEMO_PASSWORD = 'alarzah-demo'

export const DEMO_SEEDS: DemoSeed[] = [
  {
    id: 'p_omar', role: 'patient', email: 'omar@demo.alarzah', name: 'Omar', blurb: 'Trying 6–12 months · Clip shows heat and a left/right pattern · approved and booked',
    profile: { alias: 'Omar', ageBand: '25–34', lang: 'ar', group: 'Emirati', education: 'University', emirate: 'Abu Dhabi', familyPhysician: 'Dr. N. Al Mansoori · Sahatna', consent: { backup: true, shareWithCareTeam: true, research: false }, avatar: 'teal' },
    state: {
      lang: 'en', onboarded: true, anonId: 'K7Q2', checkDone: true, paired: true, weekDone: true, clipKind: 'both', pod: 'ordered',
      answers: { pain: false, lump: false, ttc: '6to12' as Ttc, partner35: false, steroids: false, udt: false, pastTesticular: false, heatJob: true, smoke: false, metabolic: false, infection: false, erection: false, noSpermBefore: false },
      sharedAt: ago(30), reviewedAt: ago(26), reviewNote: 'Approved. Please book the examination and the home test.',
      bookings: [{ tier: 'andrology', place: 'Andrology clinic · partner network', slot: 'Mon 24 Nov · 09:30', ref: 'BK-4Q7M', at: ago(20) }],
      audit: audit([[20, 'Andrology examination booked (BK-4Q7M)'], [26, 'Clinician Dr. Mariam approved your referral'], [30, 'Summary sent to the clinician queue as ALZ-K7Q2 (with consent)'], [32, '7 days of Clip readings analysed on the phone'], [200, 'Check-in completed'], [201, 'Account created · backup on']]),
    },
  },
  {
    id: 'p_rahul', role: 'patient', email: 'rahul@demo.alarzah', name: 'Rahul', blurb: 'Delivery driver · high heat load · self-care plan, waiting for review',
    profile: { alias: 'Rahul', ageBand: '25–34', lang: 'en', group: 'South Asian', education: 'Diploma', emirate: 'Abu Dhabi', consent: { backup: true, shareWithCareTeam: true, research: true }, avatar: 'amber' },
    state: {
      lang: 'en', onboarded: true, anonId: 'R3HD', checkDone: true, paired: true, weekDone: true, clipKind: 'heat', pod: 'none',
      answers: { pain: false, lump: false, ttc: 'lt6' as Ttc, partner35: false, steroids: false, udt: false, pastTesticular: false, heatJob: true, smoke: true, metabolic: false, infection: false, erection: false, noSpermBefore: false },
      sharedAt: ago(5),
      audit: audit([[5, 'Summary sent to the clinician queue as ALZ-R3HD (with consent)'], [6, '7 days of Clip readings analysed on the phone'], [180, 'Check-in completed'], [181, 'Account created · backup on']]),
    },
  },
  {
    id: 'p_khalid', role: 'patient', email: 'khalid@demo.alarzah', name: 'Khalid', blurb: 'Trying 12+ months · lab result below WHO limits · rule R8 sent him back for review',
    profile: { alias: 'Khalid', ageBand: '35–44', lang: 'ar', group: 'Arab expatriate', education: 'University', emirate: 'Al Ain', familyPhysician: 'Dr. S. Haddad · Al Ain', consent: { backup: true, shareWithCareTeam: true, research: false }, avatar: 'violet' },
    state: {
      lang: 'en', onboarded: true, anonId: 'X9KM', checkDone: true, paired: true, weekDone: true, clipKind: 'heat', pod: 'delivered',
      answers: { pain: false, lump: false, ttc: 'ge12' as Ttc, partner35: true, steroids: false, udt: false, pastTesticular: false, heatJob: false, smoke: true, metabolic: true, infection: false, erection: false, noSpermBefore: false },
      sharedAt: ago(170), reviewedAt: ago(160), reviewNote: 'Approved: fertility service with your wife, and the home test.',
      lab: { volume: 2.6, concentration: 11, totalMotility: 36, progressive: 24, morphology: 5, at: ago(3) },
      bookings: [{ tier: 'fertility', place: 'Fertility centre · partner network', slot: 'Tue 25 Nov · 13:15', ref: 'BK-8D2C', at: ago(150) }],
      audit: audit([[3, 'Lab result received with the anonymous code'], [26, 'Sample collected; Pod timer started'], [150, 'Fertility appointment booked (BK-8D2C)'], [160, 'Clinician Dr. Mariam approved your referral'], [170, 'Summary sent to the clinician queue'], [300, 'Account created · backup on']]),
    },
  },
  {
    id: 'p_faisal', role: 'patient', email: 'faisal@demo.alarzah', name: 'Faisal', blurb: 'Reported a new lump · red flag sent him to urology at once',
    profile: { alias: 'Faisal', ageBand: '18–24', lang: 'ar', group: 'Emirati', education: 'School', emirate: 'Abu Dhabi', consent: { backup: true, shareWithCareTeam: true, research: false }, avatar: 'ember' },
    state: {
      lang: 'en', onboarded: true, anonId: 'F2LM', checkDone: true, paired: false, weekDone: false, clipKind: 'typical', pod: 'none',
      answers: { pain: false, lump: true, ttc: 'none' as Ttc, partner35: false, steroids: true, udt: false, pastTesticular: false, heatJob: false, smoke: false, metabolic: false, infection: false, erection: false, noSpermBefore: false },
      sharedAt: ago(2),
      audit: audit([[2, 'Summary sent to the clinician queue as ALZ-F2LM (with consent)'], [2.1, 'Red flag: urgent urology advised immediately'], [2.2, 'Check-in completed'], [2.5, 'Account created · backup on']]),
    },
  },
  {
    id: 'p_james', role: 'patient', email: 'james@demo.alarzah', name: 'James', blurb: 'New account · nothing done yet · see the first-run guide',
    profile: { alias: 'James', ageBand: '35–44', lang: 'en', group: 'Other', education: 'University', emirate: 'Dubai', consent: { backup: true, shareWithCareTeam: false, research: false }, avatar: 'mint' },
    state: { lang: 'en', onboarded: false, anonId: 'J5WT', audit: audit([[0.1, 'Account created · backup on']]) },
  },
  {
    id: 'c_mariam', role: 'clinician', email: 'mariam@demo.alarzah', name: 'Dr. Mariam', title: 'Andrology · reviewing clinician', blurb: 'Reviews referrals for the partner network',
  },
  {
    id: 'c_coord', role: 'clinician', email: 'coordinator@demo.alarzah', name: 'Care coordinator', title: 'Bookings and follow-up', blurb: 'Tracks bookings, lab returns and overdue cases',
  },
]

export const AVATARS: Record<string, string> = {
  teal: 'linear-gradient(135deg,#3be8e0,#1b6f8a)', amber: 'linear-gradient(135deg,#ffc15e,#c2601f)', violet: 'linear-gradient(135deg,#c9a6ff,#5b3fa8)',
  ember: 'linear-gradient(135deg,#ff8a6a,#a3261a)', mint: 'linear-gradient(135deg,#7cf5b8,#1f7a5a)', sky: 'linear-gradient(135deg,#7cc8ff,#2a4f9e)',
}
export const initials = (s: string) => s.replace(/^Dr\.?\s*/i, '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
