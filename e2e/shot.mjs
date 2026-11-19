// Full-resolution screenshots for design review.
// Usage: node e2e/shot.mjs <url> <out.png> [width=1440] [height=900] [mobile=0] [waitMs=2500] [js-to-run-before-shot]
import puppeteer from 'puppeteer-core'

const [url, out, w = '1440', h = '900', mobile = '0', wait = '2500', js] = process.argv.slice(2)
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
})
const page = await browser.newPage()
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: mobile === '1' ? 2 : 1, isMobile: mobile === '1', hasTouch: mobile === '1' })
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
await new Promise(r => setTimeout(r, +wait))
if (js) { await page.evaluate(js); await new Promise(r => setTimeout(r, 1200)) }
await page.screenshot({ path: out, type: out.endsWith('.jpg') ? 'jpeg' : 'png', ...(out.endsWith('.jpg') ? { quality: 85 } : {}) })
if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '))
await browser.close()
