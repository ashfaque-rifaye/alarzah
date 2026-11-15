import { motion, useInView, animate } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Trace } from '../engine/signals'
import { THRESHOLDS } from '../engine/signals'
import { hourlyGrid } from '../engine/simulate'

const STOPS: [number, [number, number, number]][] = [
  [0, [27, 70, 110]], [0.25, [59, 232, 224]], [0.5, [124, 245, 184]], [0.72, [255, 193, 94]], [1, [255, 77, 61]],
]
/** Map a temperature (°C) to a thermal colour. */
export function thermal(t: number | null, lo = 32.4, hi = 35.8, alpha = 1): string {
  if (t == null) return `rgba(255,255,255,0.04)`
  const x = Math.min(1, Math.max(0, (t - lo) / (hi - lo)))
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [p0, c0] = STOPS[i - 1], [p1, c1] = STOPS[i], f = (x - p0) / (p1 - p0)
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * f))
      return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`
    }
  }
  return `rgba(255,77,61,${alpha})`
}

export function CountUp({ to, decimals = 0, suffix = '', prefix = '', duration = 1.6 }: { to: number; decimals?: number; suffix?: string; prefix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  const [v, setV] = useState(0)
  useEffect(() => { if (!inView) return; const c = animate(0, to, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: setV }); return () => c.stop() }, [inView, to, duration])
  return <span ref={ref}>{prefix}{v.toFixed(decimals)}{suffix}</span>
}

/** Left/right temperature over 7 days with lying periods shaded and the 35 °C heat line. */
export function ThermalChart({ trace, height = 220, compact = false }: { trace: Trace; height?: number; compact?: boolean }) {
  const W = 1000, H = 300, pad = { l: compact ? 6 : 38, r: 8, t: 14, b: compact ? 8 : 26 }
  const lo = 31.8, hi = 36.6
  const n = trace.samples.length
  const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b)
  const path = (side: 'left' | 'right') => {
    let d = '', pen = false
    trace.samples.forEach((s, i) => {
      const v = s[side]
      if (v == null) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }
  const bands = useMemo(() => {
    const out: [number, number][] = []
    let start = -1
    trace.samples.forEach((s, i) => {
      if (s.posture === 'lying' && start < 0) start = i
      if (s.posture !== 'lying' && start >= 0) { out.push([start, i]); start = -1 }
    })
    if (start >= 0) out.push([start, n - 1])
    return out
  }, [trace, n])
  const key = trace.id
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }} role="img" aria-label="Left and right skin temperature over 7 days">
      <defs>
        <linearGradient id="gL" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ff8a3d" /><stop offset="1" stopColor="#ffc15e" /></linearGradient>
        <linearGradient id="gR" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3be8e0" /><stop offset="1" stopColor="#7cf5b8" /></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      {bands.map(([a, b], i) => <rect key={i} x={x(a)} y={pad.t} width={x(b) - x(a)} height={H - pad.t - pad.b} fill="rgba(157,139,255,0.07)" />)}
      {!compact && [32, 33, 34, 35, 36].map(t => (
        <g key={t}><line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
          <text x={4} y={y(t) + 4} fill="#5c6f78" fontSize="13">{t}°</text></g>
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={y(THRESHOLDS.heatAbsolute)} y2={y(THRESHOLDS.heatAbsolute)} stroke="#ff6a3d" strokeDasharray="6 6" opacity={0.7} />
      {!compact && <text x={W - pad.r - 4} y={y(THRESHOLDS.heatAbsolute) - 6} fill="#ff8a3d" fontSize="13" textAnchor="end">35.0 °C heat line</text>}
      <motion.path key={key + 'R'} d={path('right')} fill="none" stroke="url(#gR)" strokeWidth={2.2} filter="url(#glow)" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: 'easeInOut' }} />
      <motion.path key={key + 'L'} d={path('left')} fill="none" stroke="url(#gL)" strokeWidth={2.2} filter="url(#glow)" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: 'easeInOut', delay: 0.15 }} />
      {!compact && Array.from({ length: 7 }, (_, d) => <text key={d} x={x((d + 0.5) * (n / 7))} y={H - 6} fill="#5c6f78" fontSize="13" textAnchor="middle">Day {d + 1}</text>)}
    </svg>
  )
}

/** 7×24 thermal heatmap with a staggered reveal. */
export function Heatmap({ trace, cell = 14, gap = 3, side = 'mean' as 'mean' | 'left' | 'right' }: { trace: Trace; cell?: number; gap?: number; side?: 'mean' | 'left' | 'right' }) {
  const grid = useMemo(() => hourlyGrid(trace, side), [trace, side])
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(24, ${cell}px)`, gap, width: 'max-content' }} role="img" aria-label="Hourly temperature heatmap, 7 days by 24 hours">
      {grid.flatMap((row, d) => row.map((v, h) => (
        <motion.div key={`${trace.id}-${d}-${h}`} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: (d * 24 + h) * 0.0025, duration: 0.35 }}
          title={v == null ? 'not worn' : `Day ${d + 1}, ${h}:00 · ${v.toFixed(2)} °C`}
          style={{ width: cell, height: cell, borderRadius: 4, background: thermal(v), boxShadow: v != null && v >= 35 ? `0 0 10px ${thermal(v, 32.4, 35.8, 0.6)}` : 'none' }} />
      )))}
    </div>
  )
}

/** Animated circular gauge for a temperature. */
export function TempGauge({ value, label, size = 128, lo = 31, hi = 37 }: { value: number; label: string; size?: number; lo?: number; hi?: number }) {
  const r = size / 2 - 10, c = 2 * Math.PI * r, f = Math.min(1, Math.max(0, (value - lo) / (hi - lo)))
  const col = thermal(value)
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(135deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={8} strokeDasharray={`${c * 0.75} ${c}`} strokeLinecap="round" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={`${c * 0.75} ${c}`} animate={{ strokeDashoffset: c * 0.75 * (1 - f) }} initial={{ strokeDashoffset: c * 0.75 }}
          transition={{ type: 'spring', stiffness: 60, damping: 16 }} style={{ filter: `drop-shadow(0 0 8px ${col})` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ font: `600 ${size / 4.4}px var(--display)`, letterSpacing: '-0.03em' }}>{value.toFixed(1)}°</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.12em', textTransform: 'uppercase' }}>{label}</div>
        </div>
      </div>
    </div>
  )
}
