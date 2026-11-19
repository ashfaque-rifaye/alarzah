// Records the Alarzah demo: the real mobile app (phone frame) and clinician console driven on the live site, captioned on a 1920x1080 stage.
// Usage: node e2e/video/record.mjs [baseUrl] [outDir]   — needs ffmpeg on PATH and the stage served at http://localhost:5190/stage.html
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] || 'https://alarzah.vercel.app'
const OUT = process.argv[3] || '../submission/video'
const ONLY = process.env.SCENES ? process.env.SCENES.split(',') : null
fs.mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const host = BASE.replace(/^https?:\/\//, '')

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: process.env.HEADED ? false : true,
  defaultViewport: null,
  args: ['--window-size=1920,1080', '--hide-scrollbars', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required'],
})
const page = (await browser.pages())[0] || await browser.newPage()
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
await page.goto('http://localhost:5190/stage.html', { waitUntil: 'load' })
const frameOf = async id => (await page.$(`#${id}`)).contentFrame()
const load = async (id, url, wait = 2500) => { await page.evaluate((i, u) => { document.getElementById(i).src = u }, id, url); await sleep(wait) }
const cap = async (step, h, p, url) => { await page.evaluate((a, b, c, d) => stage.caption(a, b, c, d), step, h, p, url); await sleep(500) }
const layout = async name => { await page.evaluate(n => stage.layout(n), name); await sleep(950) }

/** Find a visible button/link (or selector) in a frame, show a tap on the stage, scroll it into view and click it. */
async function tap(id, label, { sel = 'button, a', exact = false, pause = 650, timeout = 8000 } = {}) {
  const f = await frameOf(id)
  const finder = (s, l, ex) => {
    const els = [...document.querySelectorAll(s)].filter(e => !e.disabled && e.offsetParent !== null)
    return l == null ? els[0] : (els.find(e => e.textContent.trim() === l) || (!ex && els.find(e => e.textContent.includes(l))))
  }
  await f.waitForFunction(finder, { timeout }, sel, label, exact)
  const r = await f.evaluate(async (s, l, ex, fnSrc) => {
    const el = (0, eval)(fnSrc)(s, l, ex)
    el.scrollIntoView({ block: 'center', behavior: 'smooth' }); await new Promise(r => setTimeout(r, 420))
    const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }, sel, label, exact, finder.toString())
  await page.evaluate((i, x, y) => {
    const fr = document.getElementById(i); const b = fr.getBoundingClientRect(); const k = b.width / fr.offsetWidth
    stage.tap(b.x + x * k, b.y + y * k)
  }, id, r.x, r.y)
  await sleep(180)
  await f.evaluate((s, l, ex, fnSrc) => (0, eval)(fnSrc)(s, l, ex).click(), sel, label, exact, finder.toString())
  await sleep(pause)
}
const answer = async label => {
  const f = await frameOf('appF')
  await f.waitForFunction(() => document.querySelectorAll('.q-card').length === 1, { timeout: 6000 })
  await tap('appF', label, { sel: '.q-card .q-opt', pause: 520 })
}
const tab = label => tap('appF', label, { sel: '.m-tab', pause: 900 })
const scrollApp = async (y, ms = 1200) => { const f = await frameOf('appF'); await f.evaluate(yy => document.querySelector('.m-scroll')?.scrollTo({ top: yy, behavior: 'smooth' }), y); await sleep(ms) }
const waitText = async (id, t, timeout = 15000) => (await frameOf(id)).waitForFunction(s => document.body.innerText.includes(s), { timeout }, t)

const scenes = []
const scene = (name, fn) => scenes.push({ name, fn })

scene('site', async () => {
  await layout('site')
  await load('siteF', BASE + '/', 4500)
  await cap('The product site', 'A quiet front door to <em>men’s reproductive health</em>')
  await sleep(4200)
  const f = await frameOf('siteF')
  const glide = async (to, ms) => f.evaluate(async (target, dur) => {
    const y0 = window.scrollY; const t0 = performance.now()
    await new Promise(res => { const st = () => { const k = Math.min(1, (performance.now() - t0) / dur); const e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; window.scrollTo(0, y0 + (target - y0) * e); k < 1 ? requestAnimationFrame(st) : res() }; st() })
  }, to, ms)
  const top = async (sel, frac) => f.evaluate((s, k) => { const el = document.querySelector(s); return el ? el.offsetTop + el.offsetHeight * k : 0 }, sel, frac)
  await cap('Inside the Clip', 'Two skin sensors, a motion sensor, <em>no camera, no microphone</em>')
  await glide(await top('#inside', 0.05), 2200); await glide(await top('#inside', 0.78), 9000)
  await cap('Signals + AI', 'Fixed rules decide. <em>AI only explains, and a checker verifies.</em>')
  await glide(await top('#signals', 0.1), 2600); await sleep(3500)
})

scene('onboard', async () => {
  await load('siteF', 'about:blank', 50)
  await layout('')
  await load('appF', BASE + '/app?fresh=1&embed=1', 3000)
  await cap('01 · Start', 'No name. No ID. <em>Start anonymously.</em>', 'Everything stays on his phone until he chooses to share it. Arabic or English.', `${host}/app`)
  await sleep(2200)
  await tap('appF', 'Next', { pause: 1300 }); await tap('appF', 'Next', { pause: 1300 }); await tap('appF', 'Start anonymously', { pause: 2200 })
})

scene('checkin', async () => {
  await cap('02 · Private check-in', '13 questions, <em>asked without judgement</em>', 'History, heat exposure, metabolic risk and, privately, steroid use. Red flags interrupt instantly.')
  await tab('Check-in'); await sleep(900)
  for (const a of ['No', 'No', '6–12 months', 'No', 'Yes', 'No', 'No', 'Yes', 'No', 'No', 'No', 'No', 'No']) await answer(a)
  await waitText('appF', 'answers saved on this phone only'); await sleep(2200)
})

scene('clip', async () => {
  await cap('03 · The Clip', 'A week of skin temperature, <em>read in seconds</em>', 'Heat load: hours per day at or above 35 °C. Left/right pattern: the shape of a varicocele filling when upright.')
  await tab('Clip'); await tap('appF', 'Preview with a sample stream', { pause: 1800 })
  await tap('appF', 'Heat + pattern', { pause: 900 }); await tap('appF', 'Fast-forward 7 days', { pause: 3500 })
  await scrollApp(520, 2600); await scrollApp(1100, 2600); await scrollApp(0, 1200)
})

scene('care', async () => {
  await cap('04 · Next steps', 'Fixed rules choose <em>one of eight next steps</em>', 'Every step shows the rule that fired. Screening, not diagnosis.')
  await tab('Care'); await sleep(1500); await scrollApp(380, 2400)
  await cap('05 · Ask Alarzah', 'NVIDIA Nemotron explains. <em>A checker verifies every reply.</em>', 'No new numbers, no diagnosis, no promises, no false reassurance, in English and Arabic. Rule-based wording if a reply fails.')
  await tap('appF', 'Is this serious?', { pause: 600 })
  await (await frameOf('appF')).waitForSelector('.ask-answer .ask-meta', { timeout: 25000 })
  await (await frameOf('appF')).evaluate(() => document.querySelector('.ask-answer')?.scrollIntoView({ block: 'start', behavior: 'smooth' })); await sleep(5200)
})

scene('review', async () => {
  await cap('06 · Clinician review', 'He sends it. <em>A clinician sees it live.</em>', 'An anonymous case code, never a name.')
  await tap('appF', 'Send for clinician review', { pause: 1800 })
  await load('deskF', BASE + '/clinic/queue?notour=1', 1500)
  await layout('split')
  await cap('06 · Clinician review', 'The case arrives <em>LIVE</em> at the top of the clinician queue')
  await sleep(4200)
  await (await frameOf('deskF')).evaluate(() => window.scrollTo({ top: 300, behavior: 'smooth' })); await sleep(2200)
  await (await frameOf('deskF')).evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(1200)
  await cap('07 · Sign-off', 'The clinician approves, <em>and his app updates instantly</em>')
  await tap('deskF', 'Approve and send', { pause: 1200 })
  await waitText('appF', 'Reviewed by a clinician', 10000); await sleep(3200)
})

scene('book', async () => {
  await layout('')
  await cap('08 · Book', 'Booking opens <em>only after sign-off</em>', 'Andrology clinic slots on UAE working days, under his anonymous code.')
  await tap('appF', 'Book · Andrology clinic', { pause: 1800 }); await tap('appF', 'Confirm booking', { pause: 2600 })
})

scene('pod', async () => {
  await cap('09 · The Pod', 'Collect at home. <em>Not in a clinic room.</em>', 'The Pod holds 20–37 °C and counts down to the lab deadline. The courier and lab see only the code.')
  await tap('appF', 'Order a Pod', { pause: 1600 }); await tap('appF', 'I’ve collected the sample', { pause: 2400 })
  await tap('appF', 'Courier', { pause: 1200 })
  await cap('10 · Lab result', 'The result returns <em>to his phone</em>', 'Five values against WHO 2021 lower reference limits. Rule R8: below range → andrology review.')
  await waitText('appF', 'Semen analysis · lab result', 20000)
  await (await frameOf('appF')).evaluate(() => document.querySelector('.lab')?.scrollIntoView({ block: 'start', behavior: 'smooth' })); await sleep(5200)
  await tab('Home'); await sleep(3000)
})

scene('arabic', async () => {
  await cap('11 · Arabic', 'Arabic first, <em>right to left</em>', 'Every screen, every question and the AI explanation, with voice in and out.')
  await (await frameOf('appF')).evaluate(() => [...document.querySelectorAll('.m-lang')][0]?.click()); await sleep(2600)
  await tab('الرعاية').catch(() => {}); await sleep(2600)
  await (await frameOf('appF')).evaluate(() => [...document.querySelectorAll('.m-lang')][0]?.click()); await sleep(1500)
})

scene('vault', async () => {
  await cap('12 · Privacy vault', 'He controls <em>every share</em>', 'One-time links that expire, an audit log of every access, and delete everything in one tap.')
  await tab('Vault'); await sleep(1200)
  await tap('appF', 'Create a one-time link', { pause: 2400 }); await scrollApp(600, 2200)
  await tap('appF', 'Delete everything', { pause: 1400 }); await tap('appF', 'Delete', { exact: true, pause: 2600 })
})

scene('redflag', async () => {
  await cap('13 · Safety first', 'A red flag <em>interrupts instantly</em>', 'Sudden severe pain goes straight to the emergency department, not to a questionnaire.')
  await load('appF', BASE + '/app?fresh=1&embed=1', 2600)
  await tap('appF', 'Next', { pause: 500 }); await tap('appF', 'Next', { pause: 500 }); await tap('appF', 'Start anonymously', { pause: 1200 })
  await tab('Check-in'); await answer('Yes'); await sleep(3800)
})

scene('bench', async () => {
  await load('deskF', BASE + '/clinic/benchmark', 2500)
  await page.evaluate(() => stage.deskUrl(location.host ? 'alarzah.vercel.app/clinic/benchmark' : ''))
  await layout('deskonly')
  await cap('14 · Evidence', 'The test suite runs live: <em>30/30 cases, 8/8 red flags</em>')
  await sleep(3000); await (await frameOf('deskF')).evaluate(() => window.scrollTo({ top: 520, behavior: 'smooth' })); await sleep(3500)
  await load('deskF', BASE + '/clinic/fairness', 2200); await page.evaluate(() => stage.deskUrl('alarzah.vercel.app/clinic/fairness'))
  await cap('15 · Fairness', 'Every measure, <em>split by group</em>', '')
  await sleep(4500)
})

const recorder = await page.screencast({ path: `${OUT}/raw.webm` })
const t0 = Date.now(); const marks = []
for (const s of scenes) {
  if (ONLY && !ONLY.includes(s.name)) continue
  const ts = Date.now()
  try { await s.fn(); console.log('✓', s.name, ((Date.now() - ts) / 1000).toFixed(1) + 's') }
  catch (e) { console.log('✗', s.name, String(e.message).split('\n')[0]); await page.screenshot({ path: `${OUT}/fail-${s.name}.png` }) }
  marks.push({ scene: s.name, at: (ts - t0) / 1000 })
}
await recorder.stop()
fs.writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks, null, 2))
console.log('total', ((Date.now() - t0) / 1000).toFixed(1) + 's')
await browser.close()
