// Renders public/icon.svg to the PNG app icons.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const svg = fs.readFileSync('public/icon.svg', 'utf8')
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const p = await b.newPage()
for (const n of [192, 512]) {
  await p.setViewport({ width: n, height: n })
  await p.setContent(`<html><body style="margin:0;background:#05090b">${svg.replace('<svg ', `<svg width="${n}" height="${n}" `)}</body></html>`)
  await p.screenshot({ path: `public/icon-${n}.png`, omitBackground: false })
}
await b.close(); console.log('icons ok')
