// Frame-accurate render of film.html (intro / outro titles) to H.264.
// Usage: node e2e/video/render.mjs intro|outro <out.mp4> [stillsAt=1,2.5,...]   — stage served at http://localhost:5190
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

const [part = 'intro', out = `${part}.mp4`, stills] = process.argv.slice(2)
const FPS = 30
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--window-size=1920,1080', '--hide-scrollbars', '--force-device-scale-factor=1', '--font-render-hinting=none'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
await page.goto(`http://localhost:5190/film.html?part=${part}&stretch=${process.env.STRETCH || 1}`, { waitUntil: 'load' })
await page.evaluate(() => window.ready)
const dur = await page.evaluate(() => window.DURATION)

if (stills) { // quick look: a few stills instead of the full render
  for (const t of stills.split(',').map(Number)) {
    await page.evaluate(x => window.render(x), t)
    await page.screenshot({ path: out.replace(/\.\w+$/, '') + `_${t.toFixed(2)}.jpg`, type: 'jpeg', quality: 85 })
  }
  await browser.close(); process.exit(0)
}

const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] })
const n = Math.round(dur * FPS)
for (let i = 0; i < n; i++) {
  await page.evaluate(x => window.render(x), i / FPS)
  const buf = await page.screenshot({ type: 'jpeg', quality: 95 })
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r))
  if (i % 60 === 0) process.stdout.write(`${part} ${i}/${n}\n`)
}
ff.stdin.end()
await new Promise(r => ff.on('close', r))
await browser.close()
console.log('wrote', out, fs.statSync(out).size)
