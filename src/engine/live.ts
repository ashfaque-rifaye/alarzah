// Real-time inputs the app can read today, without the Clip hardware:
//  1. Outdoor heat now + today's hourly forecast (Open-Meteo, no key, CORS-enabled).
//  2. The phone's own motion sensor (DeviceOrientation) for upright vs lying.
//  3. A real Bluetooth link to any device that speaks the standard Health Thermometer profile (GATT 0x1809),
//     which is the profile the Alarzah Clip firmware exposes. Without a device, a clearly labelled preview stream is used.
import { useEffect, useRef, useState } from 'react'

/* ---------- 1. weather ---------- */
export interface Weather { temp: number; feels: number; humidity: number; place: string; at: number; hours: { h: number; temp: number; feels: number }[]; source: 'live' | 'cached' }
const ABU_DHABI = { lat: 24.4539, lon: 54.3773, place: 'Abu Dhabi' }
const WKEY = 'alarzah.weather'

export async function fetchWeather(lat = ABU_DHABI.lat, lon = ABU_DHABI.lon, place = ABU_DHABI.place): Promise<Weather> {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m&hourly=temperature_2m,apparent_temperature&forecast_days=1&timezone=auto`
  const r = await fetch(u)
  if (!r.ok) throw new Error('weather ' + r.status)
  const j = await r.json()
  const hours = (j.hourly.time as string[]).map((t, i) => ({ h: new Date(t).getHours(), temp: j.hourly.temperature_2m[i], feels: j.hourly.apparent_temperature[i] }))
  const w: Weather = { temp: j.current.temperature_2m, feels: j.current.apparent_temperature, humidity: j.current.relative_humidity_2m, place, at: Date.now(), hours, source: 'live' }
  try { localStorage.setItem(WKEY, JSON.stringify(w)) } catch { /* ignore */ }
  return w
}

export function useWeather() {
  const [w, setW] = useState<Weather | null>(() => { try { const c = JSON.parse(localStorage.getItem(WKEY) || 'null'); return c ? { ...c, source: 'cached' } : null } catch { return null } })
  const [err, setErr] = useState<string | null>(null)
  const [where, setWhere] = useState(ABU_DHABI)
  useEffect(() => {
    let alive = true
    const go = () => fetchWeather(where.lat, where.lon, where.place).then(x => { if (alive) { setW(x); setErr(null) } }).catch(() => alive && setErr('offline'))
    go()
    const id = setInterval(go, 10 * 60e3)
    return () => { alive = false; clearInterval(id) }
  }, [where])
  const useMyLocation = () => navigator.geolocation?.getCurrentPosition(p => setWhere({ lat: p.coords.latitude, lon: p.coords.longitude, place: 'Your location' }))
  return { w, err, useMyLocation }
}

/** Plain, deterministic heat advice from the real forecast (no AI). */
export function heatAdvice(w: Weather) {
  const hot = w.hours.filter(h => h.feels >= 38)
  const now = new Date().getHours()
  const next = hot.find(h => h.h >= now)
  if (w.feels >= 40) return { level: 'high' as const, title: 'Extreme heat outside', body: 'Keep the car cooled before you sit, stand up every hour on long drives, and wear loose underwear today.' }
  if (next) return { level: 'mid' as const, title: `Hot from ${String(next.h).padStart(2, '0')}:00`, body: `${hot.length} hours today feel ≥ 38 °C. Plan breaks from sitting and from hot cabs or kitchens.` }
  return { level: 'low' as const, title: 'Mild heat today', body: 'A good day to wear the Clip normally; no extra heat precautions needed.' }
}

/* ---------- 2. phone motion ---------- */
export type Posture = 'upright' | 'lying' | 'unknown'
export function useMotion() {
  const [state, setState] = useState<{ supported: boolean; needsPermission: boolean; posture: Posture; tilt: number | null }>(() => ({
    supported: typeof window !== 'undefined' && 'DeviceOrientationEvent' in window,
    needsPermission: typeof (window as any).DeviceOrientationEvent?.requestPermission === 'function',
    posture: 'unknown', tilt: null,
  }))
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!state.supported || (state.needsPermission && !on)) return
    let got = false
    const f = (e: DeviceOrientationEvent) => {
      if (e.beta == null) return
      got = true
      const tilt = Math.abs(e.beta)
      setState(s => ({ ...s, tilt, posture: tilt > 55 ? 'upright' : tilt < 30 ? 'lying' : s.posture }))
    }
    window.addEventListener('deviceorientation', f)
    const t = setTimeout(() => { if (!got) setState(s => ({ ...s, supported: false })) }, 2500) // desktops expose the API but never fire it
    return () => { window.removeEventListener('deviceorientation', f); clearTimeout(t) }
  }, [state.supported, state.needsPermission, on])
  const enable = async () => {
    try { const r = await (window as any).DeviceOrientationEvent.requestPermission(); if (r === 'granted') setOn(true) } catch { /* denied */ }
  }
  return { ...state, enable }
}

/* ---------- 3. Clip link (Web Bluetooth, Health Thermometer profile) ---------- */
export type LinkState = 'idle' | 'connecting' | 'live' | 'preview' | 'error'
export interface Reading { t: number; left: number | null; right: number | null; ambient: number | null }

/** IEEE-11073 32-bit FLOAT used by the Temperature Measurement characteristic (0x2A1C). */
function float11073(dv: DataView, o: number) {
  const raw = dv.getUint32(o, true)
  let mant = raw & 0x00ffffff; const exp = (raw >> 24) << 24 >> 24
  if (mant >= 0x800000) mant = -((0xffffff + 1) - mant)
  return mant * Math.pow(10, exp)
}

export function useClipLink(previewKind: 'typical' | 'heat' | 'asymmetry' | 'both' = 'asymmetry') {
  const [state, setState] = useState<LinkState>('idle')
  const [device, setDevice] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [hist, setHist] = useState<Reading[]>([])
  const devRef = useRef<any>(null)
  const push = (r: Reading) => setHist(h => [...h.slice(-179), r])
  const supported = typeof navigator !== 'undefined' && 'bluetooth' in navigator

  const connect = async () => {
    setErr(null); setState('connecting')
    try {
      const bt = (navigator as any).bluetooth
      const dev = await bt.requestDevice({ filters: [{ services: ['health_thermometer'] }, { namePrefix: 'Alarzah' }], optionalServices: ['health_thermometer', 'battery_service'] })
      devRef.current = dev; setDevice(dev.name || 'Thermometer')
      const server = await dev.gatt.connect()
      const svc = await server.getPrimaryService('health_thermometer')
      const chars = await svc.getCharacteristics()
      // Alarzah Clip: two Temperature Measurement characteristics (left pad, right pad). A standard thermometer has one.
      const temps = chars.filter((c: any) => c.uuid.startsWith('00002a1c') || c.uuid.startsWith('00002a1e'))
      const last: { left: number | null; right: number | null } = { left: null, right: null }
      await Promise.all(temps.slice(0, 2).map(async (c: any, i: number) => {
        await c.startNotifications()
        c.addEventListener('characteristicvaluechanged', (e: any) => {
          const dv: DataView = e.target.value
          const flags = dv.getUint8(0); let v = float11073(dv, 1)
          if (flags & 1) v = (v - 32) * 5 / 9 // Fahrenheit flag
          if (i === 0) last.left = v; else last.right = v
          push({ t: Date.now(), left: last.left, right: last.right, ambient: null })
        })
      }))
      dev.addEventListener('gattserverdisconnected', () => setState('idle'))
      setState('live')
    } catch (e: any) {
      setState('error'); setErr(e?.name === 'NotFoundError' ? 'No device chosen' : e?.message || 'Could not connect')
    }
  }
  const disconnect = () => { try { devRef.current?.gatt?.disconnect() } catch { /* ignore */ } setState('idle'); setHist([]) }
  const preview = () => { setState('preview'); setDevice('Preview stream'); setHist([]) }

  // preview stream: 1 Hz, physiologically shaped, clearly labelled in the UI
  useEffect(() => {
    if (state !== 'preview') return
    const hot = previewKind === 'heat' || previewKind === 'both' ? 0.9 : 0, asym = previewKind === 'asymmetry' || previewKind === 'both' ? 0.75 : 0.05
    let k = 0
    const tick = () => {
      k++
      const now = Date.now(), wave = Math.sin(now / 9000) * 0.18 + Math.sin(now / 2300) * 0.05
      const n = () => (Math.random() - 0.5) * 0.05
      push({ t: now, left: +(33.9 + hot + asym + wave + n()).toFixed(2), right: +(33.9 + hot + wave * 0.9 + n()).toFixed(2), ambient: +(29 + Math.sin(now / 60000)).toFixed(1) })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => { clearInterval(id); void k }
  }, [state, previewKind])
  useEffect(() => () => { try { devRef.current?.gatt?.disconnect() } catch { /* ignore */ } }, [])
  const latest = hist[hist.length - 1]
  return { state, device, err, hist, latest, supported, connect, disconnect, preview }
}
