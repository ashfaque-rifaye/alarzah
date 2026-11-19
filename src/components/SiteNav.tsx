// Apple-style site navigation: transparent at the top, frosted on scroll, scroll-spy on sections, full-screen sheet on phones.
import { AnimatePresence, motion, useScroll, useSpring } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const LINKS: [string, string][] = [['problem', 'Why'], ['inside', 'The Clip'], ['hardware', 'Hardware'], ['signals', 'How it decides'], ['product', 'Product'], ['honest', 'Evidence']]

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const { scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 40 })
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 24)
    f(); window.addEventListener('scroll', f, { passive: true })
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setActive(e.target.id) }), { rootMargin: '-45% 0px -50% 0px' })
    const t = setTimeout(() => LINKS.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el) }), 400)
    return () => { window.removeEventListener('scroll', f); io.disconnect(); clearTimeout(t) }
  }, [])
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = '' } }, [open])
  const jump = (id: string) => { setOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  return (
    <>
      <header className={`sn ${scrolled ? 'sn-on' : ''} ${open ? 'sn-open' : ''}`}>
        <div className="sn-in">
          <Link to="/" className="sn-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><img src="/brand/mark.svg" alt="" /><b>Alarzah</b></Link>
          <nav className="sn-links" aria-label="Sections">
            {LINKS.map(([id, l]) => (
              <button key={id} onClick={() => jump(id)} className={active === id ? 'on' : ''}>
                {active === id && <motion.span layoutId="sn-pill" className="sn-pill" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                <span className="sn-l">{l}</span>
              </button>))}
          </nav>
          <div className="sn-cta">
            <Link to="/clinic" className="sn-text">Clinicians</Link>
            <Link to="/app" className="sn-btn">Open the app</Link>
            <button className="sn-burger" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}><i /><i /></button>
          </div>
        </div>
        <motion.div className="sn-progress" style={{ scaleX: progress }} />
      </header>
      <AnimatePresence>
        {open && (
          <motion.div className="sn-sheet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <nav>
              {LINKS.map(([id, l], i) => (
                <motion.button key={id} onClick={() => jump(id)} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}>{l}</motion.button>))}
            </nav>
            <motion.div className="sn-sheet-cta" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Link to="/app" className="btn btn-primary">Open the app</Link>
              <Link to="/clinic" className="btn au-glassbtn btn-ghost">Clinician console</Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
