# Alarzah

A private, low-friction front door to men's reproductive health. Future Health Digital Innovation Challenge 2026, Fertility Challenge 01 (Male Reproductive Health).

- Product story (desktop): https://alarzah.vercel.app
- Mobile app (installable PWA): https://alarzah.vercel.app/app
- Clinician console: https://alarzah.vercel.app/clinic
- Live test suite: https://alarzah.vercel.app/clinic/benchmark

## What is in here
- `src/engine/` deterministic engine: Clip signal analysis (`signals.ts`), synthetic 7-day traces with ground truth (`simulate.ts`), triage rules R1–R7 (`rules.ts`), published test suite and Wilson intervals (`benchmark.ts`), Vitest tests (`engine.test.ts`).
- `src/pages/` Landing (React Three Fiber 3D Clip, signal theatre), MobileApp (onboarding, check-in with red-flag interrupt, Clip, Care + Pod, Vault; Arabic/English), Console (review queue, fairness, test suite).

## Run
```
npm install
npm run dev
npm test
```

Synthetic data only. Not medical advice. AI never makes a decision in this system.
