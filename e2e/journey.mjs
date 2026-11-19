// End-to-end journey test: drives the real mobile app and the clinician console in one Chrome.
// Usage: node e2e/journey.mjs [baseUrl]   (default http://localhost:5179)
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] || 'http://localhost:5179'
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = path.resolve('e2e/out'); fs.mkdirSync(OUT, { recursive: true })
const results = []
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await browser.createBrowserContext()
const app = await ctx.newPage()
await app.setViewport({ width: 430, height: 900, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
app.on('dialog', d => d.dismiss()) // decline the real-Bluetooth prompt; use the demo Clip

const text = async (page, t, timeout = 6000) => page.waitForSelector(`::-p-text(${t})`, { timeout })
/** Click the button or link whose text matches exactly, else the first that contains the text. */
const click = async (page, t, timeout = 6000) => {
  const find = l => { const els = [...document.querySelectorAll('button, a')].filter(e => !e.disabled && e.offsetParent !== null)
    return els.find(e => e.textContent.trim() === l) || els.find(e => e.textContent.includes(l)) }
  await page.waitForFunction(find, { timeout }, t)
  await page.evaluate(l => { const els = [...document.querySelectorAll('button, a')].filter(e => !e.disabled && e.offsetParent !== null)
    ;(els.find(e => e.textContent.trim() === l) || els.find(e => e.textContent.includes(l))).click() }, t)
  await sleep(400)
}
const has = async (page, t, timeout = 6000) => { try { await text(page, t, timeout); return true } catch { return false } }
async function step(name, fn) {
  const t0 = Date.now()
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log(`✓ ${name}`) }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, err: String(e.message || e).split('\n')[0] }); console.log(`✗ ${name}: ${e.message}`); await app.screenshot({ path: `${OUT}/fail-${results.length}.png` }) }
}
/** Click an answer button on the single visible question card (waits out the card transition). */
async function answer(label) {
  await app.waitForFunction(() => document.querySelectorAll('.q-card').length === 1, { timeout: 6000 })
  const ok = await app.evaluate(l => { const b = [...document.querySelectorAll('.q-card .q-opt')].find(x => x.textContent.trim().startsWith(l)); if (!b) return false; b.click(); return true }, label)
  if (!ok) throw new Error(`answer "${label}" not found`)
  await sleep(450)
}
const tab = async label => { await app.evaluate(l => { [...document.querySelectorAll('.m-tab')].find(b => b.textContent.includes(l))?.click() }, label); await sleep(600) }

await step('1. Welcome, continue as guest, how-it-works guide', async () => {
  await app.goto(`${BASE}/app?fresh=1`, { waitUntil: 'networkidle0' })
  await click(app, 'Continue as guest', 9000); await click(app, 'Next'); await click(app, 'Next'); await click(app, 'Next'); await click(app, 'Start my check-in')
  if (!(await has(app, 'Your pathway'))) throw new Error('home not shown')
})
await step('2. Private check-in, 13 questions with the conditional one', async () => {
  await tab('Check-in')
  const plan = ['No', 'No', '6–12 months', 'No', 'Yes', 'No', 'No', 'Yes', 'No', 'No', 'No', 'No', 'No']
  for (const a of plan) await answer(a)
  if (!(await has(app, 'answers saved on this phone only'))) throw new Error('check-in not completed')
})
await step('3. Pair the Clip and read a simulated week (heat + pattern)', async () => {
  await tab('Clip'); await click(app, 'Preview with a sample stream')
  await app.waitForSelector('.seg', { timeout: 8000 })
  await click(app, 'Heat + pattern'); await click(app, 'Fast-forward 7 days')
  await text(app, 'Heat load', 8000)
  const flags = await app.$$eval('.sig', els => els.filter(e => e.classList.contains('flag')).length)
  if (flags < 2) throw new Error(`expected 2 flagged signals, got ${flags}`)
})
let tiers = []
await step('4. Next steps follow the rules (andrology, family physician, semen, self-care)', async () => {
  await tab('Care')
  tiers = await app.$$eval('.tier .tier-tag', els => els.map(e => e.textContent))
  for (const t of ['Andrology / urology', 'Family physician', 'Semen analysis at home', 'Self-care + re-test']) if (!tiers.includes(t)) throw new Error(`missing ${t}; got ${tiers.join(', ')}`)
})
await step('5. Ask Alarzah answers and shows its checks', async () => {
  await click(app, 'Is this serious?')
  await app.waitForSelector('.ask-answer .ask-meta', { timeout: 25000 })
})
let code = ''
await step('6. Send the case for clinician review', async () => {
  await click(app, 'Send for clinician review')
  await text(app, 'Waiting for a clinician')
  code = await app.$eval('.send-card .mono, .send-card', el => (el.textContent.match(/ALZ-[A-Z0-9]{4}/) || [''])[0])
  if (!code) code = await app.evaluate(() => (document.body.innerText.match(/ALZ-[A-Z0-9]{4}/) || [''])[0])
  if (!code) throw new Error('no case code')
})
const console_ = await ctx.newPage()
await console_.setViewport({ width: 1440, height: 900 })
await step('7. The case appears LIVE in the clinician console', async () => {
  await console_.goto(`${BASE}/clinic/queue?notour=1&guest=1`, { waitUntil: 'networkidle0' })
  await text(console_, code, 8000); await text(console_, 'LIVE')
  await console_.screenshot({ path: `${OUT}/console-live.png` })
})
await step('8. Clinician approves; the app updates live', async () => {
  await click(console_, 'Approve and send')
  await app.bringToFront()
  await text(app, 'Reviewed by a clinician', 8000)
})
await step('9. Book the andrology examination', async () => {
  await click(app, 'Book · Andrology clinic')
  await click(app, 'Confirm booking')
  await text(app, 'Booked ·')
})
await step('10. Pod: order, collect, courier, then the lab result returns', async () => {
  await click(app, 'Order a Pod'); await click(app, 'I’ve collected the sample')
  await text(app, 'in range 20–37 °C'); await click(app, 'Courier')
  await text(app, 'Semen analysis · lab result', 15000)
  const below = await app.$$eval('.lab span', els => els.filter(e => e.textContent.includes('below')).length)
  if (below < 2) throw new Error(`expected low values for a heat-exposed week, got ${below}`)
  if (!(await has(app, 'An andrology review of your semen result'))) throw new Error('R8 not applied')
  await app.screenshot({ path: `${OUT}/app-care.png`, fullPage: false })
})
await step('11. Home shows the booking and the result', async () => {
  await tab('Today'); await text(app, 'Upcoming'); await text(app, 'Lab result ready')
})
await step('12. Arabic: right-to-left layout', async () => {
  await app.evaluate(() => [...document.querySelectorAll('.m-lang')][0].click()); await sleep(600)
  const dir = await app.$eval('.m-root', el => el.getAttribute('dir'))
  if (dir !== 'rtl') throw new Error('not rtl')
  await app.evaluate(() => [...document.querySelectorAll('.m-lang')][0].click()); await sleep(400)
})
await step('13. Vault: one-time link, audit log, delete everything', async () => {
  await tab('Vault'); await click(app, 'Create a one-time link'); await text(app, '/s/')
  await text(app, 'Booked Andrology')
  await click(app, 'Delete everything'); await click(app, 'Delete')
  await text(app, 'Continue as guest')
})
await step('14. Red flag interrupts instantly (fresh profile)', async () => {
  await app.goto(`${BASE}/app?fresh=1`, { waitUntil: 'networkidle0' })
  await click(app, 'Continue as guest', 9000); await click(app, 'Next'); await click(app, 'Next'); await click(app, 'Next'); await click(app, 'Start my check-in')
  await tab('Check-in'); await answer('Yes')
  await text(app, 'Go to an emergency department now'); await text(app, 'Call 998')
})
await step('15. Clinician test suite runs live: 30/30', async () => {
  await console_.goto(`${BASE}/clinic/benchmark?guest=1`, { waitUntil: 'networkidle0' })
  await text(console_, '30/30'); await text(console_, '8/8')
})
await step('16. Demo account: patient signs in; clinician sees his record from the database', async () => {
  await app.goto(`${BASE}/app?fresh=1`, { waitUntil: 'networkidle0' })
  await click(app, 'Omar', 12000)
  await text(app, 'Your kit', 12000)
  const c2 = await ctx.newPage(); await c2.setViewport({ width: 1440, height: 900 })
  await c2.goto(`${BASE}/clinic/patients`, { waitUntil: 'networkidle0' })
  await click(c2, 'Dr. Mariam', 12000)
  await text(c2, 'Patient record', 15000); await text(c2, 'Access log')
  await c2.close()
})

await browser.close()
const pass = results.filter(r => r.ok).length
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), pass, total: results.length, results }, null, 2))
console.log(`\n${pass}/${results.length} steps passed`)
process.exit(pass === results.length ? 0 : 1)
