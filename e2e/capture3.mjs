// Capture high-resolution product screens for the deck from the live site.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
const BASE = process.argv[2] || 'https://alarzah.vercel.app'
const OUT = process.argv[3] || '../submission/shots3'
fs.mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const launch = () => puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'] })
let browser = await launch()
let ctx = await browser.createBrowserContext()
const fresh = async () => { try { await browser.close() } catch {} browser = await launch(); ctx = await browser.createBrowserContext() }
const done = n => fs.existsSync(`${OUT}/${n}.png`)
const phone = async (name, url, prep) => {
  if (done(name)) return
  await fresh()
  const p = await ctx.newPage(); await p.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await p.goto(BASE + url + (url.includes('?') ? '&' : '?') + 'nosplash=1', { waitUntil: 'networkidle0' }); await sleep(2200)
  if (prep) await prep(p)
  await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('phone', name); await p.close()
}
const desk = async (name, url, prep, w = 1600, h = 1000) => {
  if (done(name)) return
  await fresh()
  const p = await ctx.newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: 1.5 })
  await p.goto(BASE + url + (url.includes('?') ? '&' : '?') + 'nosplash=1', { waitUntil: 'networkidle0' }); await sleep(2500)
  if (prep) await prep(p)
  await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('desk', name); await p.close()
}
const scrollTo = (sel, frac = 0) => async p => { await p.evaluate((s, f) => { const el = document.querySelector(s); window.scrollTo(0, el.offsetTop + el.offsetHeight * f) }, sel, frac); await sleep(3500) }

await phone('m_home', '/app?demo=1&tab=home&lab=1&book=1')
await phone('m_send', '/app?demo=1&tab=care&reviewed=0&pod=none')
await phone('m_care_review', '/app?demo=1&tab=care&book=1&lab=1', async p => { await p.evaluate(() => document.querySelector('.m-scroll').scrollTo(0, 0)) })
await phone('m_lab', '/app?demo=1&tab=care&book=1&lab=1', async p => { await p.evaluate(() => { const el = document.querySelector('.lab'); el.scrollIntoView({ block: 'center' }) }); await sleep(900) })
await phone('m_booking', '/app?demo=1&tab=care&lab=1', async p => {
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Book ·'))?.click()); await sleep(900)
})
await phone('m_check', '/app?demo=1&check=0&tab=check&q=4')
await phone('m_alarm', '/app?demo=1&check=0&tab=check&q=0&alarm=pain')
await phone('m_clip', '/app?demo=1&tab=clip')
await phone('m_vault', '/app?demo=1&tab=vault&share=1')
await phone('m_ar', '/app?demo=1&tab=care&lang=ar&lab=1&book=1')
await phone('m_onboard', '/app')
const click = t => async p => { await p.evaluate(t => [...document.querySelectorAll('button')].find(b => b.textContent.includes(t))?.click(), t); await sleep(1400) }
await phone('m_guide', '/app', async p => { await click('Continue as guest')(p); await click('Next')(p) })
// signed-in demo patient and his profile sheet
const asDemo = (who, then) => async p => {
  await p.evaluate(w => [...document.querySelectorAll('button')].find(b => b.textContent.includes(w))?.click(), who); await sleep(4000)
  if (then) await then(p)
}
await phone('m_today', '/app', asDemo('Omar'))
await phone('m_profile', '/app', asDemo('Omar', async p => { await p.evaluate(() => document.querySelector('.m-head .av, header .av, .av')?.closest('button')?.click()); await sleep(1500) }))
// live loop: send from the app, see it in the console
if (!done('m_waiting')) {
  await fresh()
  const p = await ctx.newPage(); await p.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true })
  await p.goto(BASE + '/app?demo=1&tab=care&reviewed=0&nosplash=1', { waitUntil: 'networkidle0' }); await sleep(1500)
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Send for clinician review'))?.click()); await sleep(1200)
  await p.screenshot({ path: `${OUT}/m_waiting.png` })
}
// console with the live case: same browser context as the app that sent it
if (!done('d_console_live')) {
  const p = await ctx.newPage(); await p.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1.5 })
  await p.goto(BASE + '/clinic?guest=1&nosplash=1', { waitUntil: 'networkidle0' }); await sleep(2500)
  await p.screenshot({ path: `${OUT}/d_console_live.png` }); console.log('desk d_console_live')
}
await desk('d_bench', '/clinic/benchmark')
await desk('d_fair', '/clinic/fairness')
await desk('d_hero', '/', null)
await desk('d_inside', '/', scrollTo('#inside', 0.55))
await desk('d_theatre', '/', scrollTo('#signals', 0.12))
await desk('d_app_desktop', '/app?demo=1&tab=care')
await desk('d_clinic_login', '/clinic')
await desk('d_patients', '/clinic', async p => {
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Dr. Mariam'))?.click()); await sleep(3500)
  await p.goto(BASE + '/clinic/patients?nosplash=1', { waitUntil: 'networkidle0' }); await sleep(3000)
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Faisal'))?.click()); await sleep(2500)
})
await browser.close()
