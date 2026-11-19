import { useEffect, useRef } from 'react'

/** Animated isotherm contour lines on a 2D canvas: the website's thermal map, light enough for a phone.
 *  `heat` (0–1) shifts the palette from cool teal toward amber/ember. */
export default function IsoField({ heat = 0.35, levels = 9, speed = 1, style }: { heat?: number; levels?: number; speed?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const heatRef = useRef(heat)
  heatRef.current = heat
  useEffect(() => {
    const c = ref.current!, ctx = c.getContext('2d')!
    let raf = 0, last = 0, w = 0, h = 0
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => { w = c.clientWidth; h = c.clientHeight; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0) }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(c)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const G = 6 // grid step in css px
    const field = (x: number, y: number, t: number) =>
      Math.sin(x * 0.011 + t * 0.21) * 0.9 + Math.sin(y * 0.014 - t * 0.17) * 0.8 + Math.sin((x + y) * 0.008 + t * 0.11) * 0.7 +
      Math.sin(Math.hypot(x - w * 0.7, y - h * 0.3) * 0.018 - t * 0.3) * 0.9
    const col = (f: number) => {
      const hh = heatRef.current, s = Math.min(1, Math.max(0, f * 0.7 + hh * 0.6))
      const stops = [[59, 232, 224], [124, 245, 184], [255, 193, 94], [255, 106, 61]]
      const i = Math.min(2, Math.floor(s * 3)), k = s * 3 - i
      const a = stops[i], b = stops[i + 1]
      return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(',')})`
    }
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < 50) return
      last = now
      const t = (reduce ? 0 : now / 1000) * speed
      const nx = Math.ceil(w / G) + 1, ny = Math.ceil(h / G) + 1
      const v = new Float32Array(nx * ny)
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = field(i * G, j * G, t)
      ctx.clearRect(0, 0, w, h)
      ctx.lineWidth = 1
      for (let l = 0; l < levels; l++) {
        const iso = -2.6 + (5.2 * (l + 0.5)) / levels
        const f = l / (levels - 1)
        ctx.strokeStyle = col(f); ctx.globalAlpha = 0.18 + f * 0.42
        ctx.beginPath()
        for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
          const a = v[j * nx + i], b = v[j * nx + i + 1], cc = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i]
          const idx = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (cc > iso ? 2 : 0) | (d > iso ? 1 : 0)
          if (idx === 0 || idx === 15) continue
          const x = i * G, y = j * G
          const lerp = (p: number, q: number) => (iso - p) / (q - p)
          const T = [x + G * lerp(a, b), y], R = [x + G, y + G * lerp(b, cc)], B = [x + G * lerp(d, cc), y + G], Lf = [x, y + G * lerp(a, d)]
          const seg = (p: number[], q: number[]) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]) }
          switch (idx) {
            case 1: case 14: seg(Lf, B); break
            case 2: case 13: seg(B, R); break
            case 3: case 12: seg(Lf, R); break
            case 4: case 11: seg(T, R); break
            case 5: seg(Lf, T); seg(B, R); break
            case 6: case 9: seg(T, B); break
            case 7: case 8: seg(Lf, T); break
            case 10: seg(T, R); seg(Lf, B); break
          }
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [levels, speed])
  return <canvas ref={ref} aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }} />
}
