# Alarzah

A private, low-friction front door to men's reproductive health.
Future Health Digital Innovation Challenge 2026 · Fertility · **Challenge 01: Male Reproductive Health**.

> **Screening, not diagnosis.** Alarzah decides *who should see whom, how soon*. It never diagnoses. Fixed rules make every decision; AI only rewords them; a clinician approves every referral.

| | Link (guest mode, no login) |
|---|---|
| Product story | https://alarzah.vercel.app |
| Mobile app (installable PWA) | https://alarzah.vercel.app/app · filled-in journey: `/app?demo=1` |
| Clinician console | https://alarzah.vercel.app/clinic · review queue: `/clinic/queue` |
| Live test suite | https://alarzah.vercel.app/clinic/benchmark |

---

## 1. What it does

1. **Check-in** (app): 13 questions, Arabic or English, typed or spoken. Anonymous code, no name. Red flags (sudden pain, a new lump) interrupt at once.
2. **The Clip** (wearable, 3–7 days): left and right skin temperature plus posture. The phone computes **heat load** and a **left/right pattern** that can point to a treatable varicocele.
3. **The Pod**: keeps a home semen sample at 20–37 °C inside the 60-minute lab window, under an anonymous code.
4. **Rules R0–R8** turn answers, Clip signals and lab results into ranked next steps. NVIDIA Nemotron rewords the explanation; a checker blocks unsafe replies.
5. **A clinician approves** in the console; the man's app updates; he books on UAE working days; the lab result returns and is checked against WHO 2021 limits.

## 2. Architecture

```
 Phone (PWA, data stays here)                      Vercel serverless            Clinician console
 ┌────────────────────────────────┐               ┌──────────────────┐          ┌──────────────────┐
 │ Check-in ─┐                    │  facts only   │ /api/explain      │          │ Today · Queue     │
 │ Clip BLE ─┼─► signals.ts ─► rules.ts (R0–R8) ─┼─► Nemotron ──► verify.ts ──┐ │ approve / amend   │
 │ Weather / │   heat load,      ranked steps     │   (Claude, then  │  pass?  │ │ fairness, tests   │
 │ motion  ──┘   L/R pattern          │           │    rule fallback)│◄────────┘ └────────┬─────────┘
 │                                    ▼           └──────────────────┘                    │
 │      Send for review (anonymous code) ─────── sync.ts ─────────────────────────────────┘
 │      ◄── approval → booking → Pod → lab result → R8 (WHO 2021)
 └────────────────────────────────┘
```

| Layer | File | Role |
|---|---|---|
| Signal analysis | `src/engine/signals.ts` | Wear check, fault detection, heat hours/day ≥ 35.0 °C, left−right upright vs lying |
| Triage | `src/engine/rules.ts` | Deterministic rules R0–R8, tier order, WHO 2021 semen limits |
| AI explanation | `api/explain.ts` | NVIDIA Nemotron → Claude → rule wording. Only de-identified facts are sent |
| AI checker | `src/engine/verify.ts` | Blocks new numbers, diagnoses, promises, false reassurance, marriage or medication advice (EN + AR) |
| Live inputs | `src/engine/live.ts` | Open-Meteo weather, phone motion (posture), Web Bluetooth Health Thermometer (GATT 0x1809 / 0x2A1C) |
| Sample data | `src/engine/simulate.ts` | Seeded 7-day traces with known ground truth |
| Test suite | `src/engine/benchmark.ts`, `engine.test.ts` | 30 triage cases, signal benchmark with Wilson 95% intervals |
| App ↔ console | `src/engine/sync.ts` | localStorage + BroadcastChannel (same browser only, see limitations) |
| Hardware | `src/components/Device.tsx` | Clip and Pod reference design, safety, wear guide |

Stack: React 18 + TypeScript (Vite), Framer Motion, Three.js / React Three Fiber, PWA, Vercel serverless, NVIDIA NIM, Anthropic SDK, Vitest, Puppeteer.

## 3. The rules

| Rule | Trigger | Next step | Clinician review |
|---|---|---|---|
| R1 | Sudden severe pain or swelling | Emergency department now (possible torsion) | No, immediate |
| R2 | New lump | Urologist within days | No, immediate |
| R3 | Trying ≥ 12 months, or 6–12 months with wife ≥ 35, or previous test with no sperm | Fertility service, both partners in parallel | Yes |
| R4 | Clip: left−right ≥ 0.6 °C upright **and** ≤ 0.3 °C lying; or undescended testicle history | Short andrology / urology exam | Yes |
| R5 | Non-prescribed steroids, weight/diabetes, past testicular problem, infection, erection problems | Family physician (confidential for steroids) | Yes |
| R6 | Planning a family, or any risk signal | Home semen analysis with the Pod | Yes |
| R7 | Clip heat load ≥ 3 h/day at ≥ 35.0 °C, hot job, smoking/shisha | Self-care plan, re-test in 6 weeks | No |
| R8 | Lab result below WHO 2021 lower limits (vol 1.4 mL, conc 16 M/mL, total motility 42%, progressive 30%, forms 4%); zero sperm → fertility | Andrology or fertility review | Yes |
| R0 | Nothing reported | No referral now | No |

**Missing or bad data never reads "normal":** under 72 h worn → "no result"; out-of-range or flat-lined sensor → "fault"; both fall back to answers only, and the app says so.

## 4. Test results (reproducible: `npm test`, or the live `/clinic/benchmark` page)

| Suite | Result |
|---|---|
| Triage cases (expected tiers, must / must-not) | **30 / 30 pass** |
| Red-flag cases (pain, lump, incl. with poor wear or sensor fault) | **8 / 8 pass** |
| "No result" on poor wear or sensor fault (12 traces) | **12 / 12** correctly return no result |
| Left/right pattern (60 seeded traces) | sensitivity **72%** (95% CI 49–88%), specificity **100%** (89–100%) |
| High heat load (60 seeded traces) | sensitivity **88%** (64–97%), specificity **100%** (89–100%) |
| Unit tests (Vitest) | **21 / 21 pass** |
| End-to-end journey (Puppeteer, `node e2e/journey.mjs <url>`) | **15 / 15 steps** |

The left/right rule misses about 1 in 4 sample patterns. We chose specificity over sensitivity on purpose (a false referral costs a clinic slot and worry), and the threshold is to be recalibrated against ultrasound in the pilot.

### Triage test cases

| ID | Case | Must include | Must not |
|---|---|---|---|
| T01 | Sudden severe pain only | emergency | semen |
| T02 | Pain + trying 12 months | emergency, fertility | |
| T03 | New lump | urgent urology | |
| T04 | Lump + steroids | urgent urology, family physician | |
| T05 | Pain + lump | emergency, urgent urology | |
| T06 | Pain with poor Clip wear | emergency | |
| T07 | Lump with sensor fault | urgent urology | |
| T08 | Pain, not planning family | emergency | none |
| T09 | Nothing reported | none | |
| T10 | Typical week, no risks | none | |
| T11 | Trying 12+ months | fertility, semen | |
| T12 | Trying 6–12 months, wife 35+ | fertility | |
| T13 | Trying 6–12 months, wife < 35 | semen | fertility |
| T14 | Previous test: no sperm | fertility | |
| T15 | Steroids only | family physician, semen | |
| T16 | Undescended testicle history | andrology | |
| T17 | Left/right pattern on Clip | andrology, semen | |
| T18 | High heat load on Clip | self-care, semen | |
| T19 | Heat + pattern | andrology, self-care, semen | |
| T20 | Poor wear never reads normal | none | andrology, self-care |
| T21 | Sensor fault never reads normal | semen | andrology |
| T22 | Smoking / shisha | self-care, semen | |
| T23 | Hot job, long driving | self-care | |
| T24 | Overweight / diabetes | family physician | |
| T25 | Infection symptoms | family physician | |
| T26 | Erection problems | family physician | |
| T27 | Past mumps orchitis | family physician, semen | |
| T28 | Planning, no risks | semen | fertility |
| T29 | Many risks at once | fertility, andrology, family physician, semen, self-care | |
| T30 | Steroids + trying 12+ months | fertility, family physician | |

## 5. Data sources and legal right to use

| Data | Source | Personal data? |
|---|---|---|
| Clip traces, console cases, lab results, booking slots | Generated by `simulate.ts` (seeded, 100% synthetic, not LLM-generated); always labelled **Sample** | No |
| Live weather | Open-Meteo public API (CC BY 4.0, no key) | No; location only if the user allows it, never sent elsewhere |
| Posture | The phone's own motion sensor, processed on device | Stays on the phone |
| Bluetooth temperature | Any standard BLE Health Thermometer the user pairs | Stays on the phone |
| Thresholds and limits | Published literature: WHO 2021 semen manual; Hjollund 2002 (heat, 99 men); varicocele thermography studies | No |
| AI explanation | Only rule outputs (tiers, rule IDs, reasons) are sent; no name, code, answers or raw readings | No |

No data was provided by the organisers and none is needed. No real patient data is used.

## 6. Responsible AI, privacy and safety

- **AI never decides.** Rules are deterministic and tested; the model only rewords. Every reply passes `verify.ts` or is replaced by rule wording, and the source (AI or rules) is shown to the user.
- **Human oversight.** Every referral except R1/R2 emergencies and R7 self-care waits for clinician approval in the console.
- **Privacy by design.** Anonymous code instead of a name; data stays on the phone; sharing is explicit and per case (a summary link that opens once and expires in 24 h); the Vault shows an audit log and erases everything on request; reproductive data is never for insurance, employment, marriage or visa use.
- **Fairness.** The console shows referral and completion rates by nationality, language, age and education.
- **Hardware safety.** The Clip is passive sensing only (no current, no heating), ~0.1 mW, sealed silicone, screw-locked coin-cell door. Standards path: IEC 60601-1, 60601-1-11, 60601-1-2, ISO 10993, IEC 62304, ISO 14971; device class to be agreed with DoH.

## 7. Assumptions, dependencies and limitations

**Assumptions**
- The 35.0 °C heat line and the 0.6 °C left/right rule come from small studies and are provisional; the pilot recalibrates them.
- The "+1 °C → about −40% concentration" figure is from one 99-man study (Hjollund 2002).
- Licensed Abu Dhabi labs will accept home-collected samples delivered within 60 minutes at 20–37 °C.

**Dependencies**
- Vercel (hosting + serverless), NVIDIA NIM (`NVIDIA_API_KEY`, optional), Anthropic API (`ANTHROPIC_API_KEY`, optional), Open-Meteo.
- Without either AI key the app still works fully and labels its text "Rule-based wording".
- Web Bluetooth needs Chrome or Edge (Android, Windows, macOS); not iPhone Safari.

**Limitations (stated plainly)**
- **The Clip and Pod are not built.** They are a reference design: parts specified, bench validation in pilot weeks 0–8. Skin readings in the demo are sample data, labelled as such.
- The app ↔ console link works only within one browser (localStorage). Production needs a consented API and Malaffi / Sahatna integration.
- The left/right rule has 72% sensitivity on sample data; it is not validated on real men.
- All imagery in the deck and video is AI-generated and disclosed.

## 8. Run it

```bash
npm install
npm run dev            # http://localhost:5173 (or the port Vite prints)
npm test               # 21 unit tests incl. the 30-case triage suite
npm run build
node e2e/journey.mjs http://localhost:5173   # 15-step end-to-end test, needs Chrome
```

Useful app URL parameters: `?demo=1` (filled-in journey), `?fresh=1`, `?lang=ar`, `?tab=home|check|clip|care|vault`, `?kind=typical|heat|asymmetry|both|poorWear|fault`.

Optional environment variables for `/api/explain`: `NVIDIA_API_KEY`, `ANTHROPIC_API_KEY`.

## 9. IP and third-party materials

Own code, written during the challenge. Open-source dependencies under MIT / BSD / Apache-2.0 licences (React, Three.js, Vite, Framer Motion, etc.). Open-Meteo data under CC BY 4.0. No proprietary or patient data.

*Not medical advice. Sample data only. AI never makes a decision in this system.*
