import { useEffect, useRef } from 'react'

/** A flowing "cool breeze" particle field rendered to canvas; reacts gently to the pointer. */
export default function BreezeField({ density = 1, className, style }: { density?: number; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    let w = 0, h = 0, raf = 0, t = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const mouse = { x: -9999, y: -9999 }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    type P = { x: number; y: number; life: number; max: number; hue: number }
    let ps: P[] = []
    const resize = () => {
      w = cv.clientWidth; h = cv.clientHeight
      cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.floor(((w * h) / 9000) * density)
      ps = Array.from({ length: count }, () => spawn())
      ctx.fillStyle = '#04070b'; ctx.fillRect(0, 0, w, h)
    }
    const spawn = (): P => ({ x: Math.random() * w, y: Math.random() * h, life: 0, max: 120 + Math.random() * 220, hue: Math.random() })
    const field = (x: number, y: number) =>
      Math.sin(x * 0.0021 + t * 0.6) * 1.4 + Math.cos(y * 0.0034 - t * 0.4) * 1.1 + Math.sin((x + y) * 0.0011 + t * 0.25)
    const color = (k: number, a: number) => {
      const c = k < 0.55 ? [59, 232, 224] : k < 0.85 ? [124, 245, 184] : k < 0.96 ? [255, 193, 94] : [255, 106, 61]
      return `rgba(${c[0]},${c[1]},${c[2]},${a})`
    }
    const loop = () => {
      t += 0.004
      ctx.fillStyle = 'rgba(4,7,11,0.045)'
      ctx.fillRect(0, 0, w, h)
      for (const p of ps) {
        const a = field(p.x, p.y)
        let vx = Math.cos(a) * 0.9 + 0.55, vy = Math.sin(a) * 0.6
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy
        if (d2 < 22000) { const f = (22000 - d2) / 22000; vx += (dx / 60) * f; vy += (dy / 60) * f }
        const nx = p.x + vx, ny = p.y + vy
        const fade = Math.sin((p.life / p.max) * Math.PI)
        ctx.strokeStyle = color(p.hue, 0.9 * fade)
        ctx.lineWidth = 1.6
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke()
        p.x = nx; p.y = ny; p.life++
        if (p.life > p.max || p.x > w + 10 || p.y < -10 || p.y > h + 10) Object.assign(p, spawn(), { x: Math.random() < 0.6 ? -5 : Math.random() * w })
      }
      raf = requestAnimationFrame(loop)
    }
    const onMove = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove)
    if (!reduce) loop()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onMove) }
  }, [density])
  return <canvas ref={ref} className={className} style={{ width: '100%', height: '100%', display: 'block', ...style }} aria-hidden />
}
