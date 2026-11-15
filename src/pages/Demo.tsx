import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import BreezeField from '../components/BreezeField'

/** Placeholder for the < 3 minute demo video (replace VIDEO_URL when published). */
const VIDEO_URL = ''

export default function Demo() {
  return (
    <div className="grain" style={{ position: 'relative', minHeight: '100vh' }}>
      <div style={{ position: 'fixed', inset: 0 }}><BreezeField density={0.8} /></div>
      <div style={{ position: 'relative', width: 'min(900px, calc(100% - 32px))', margin: '0 auto', padding: '80px 0' }}>
        <Link to="/" className="chip"><span className="dot" />Alarzah</Link>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 'clamp(40px,6vw,72px)', lineHeight: 1, margin: '20px 0' }}>Demo <span className="thermal-text">video</span></motion.h1>
        <div className="glass" style={{ aspectRatio: '16/9', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
          {VIDEO_URL ? <iframe src={VIDEO_URL} title="Alarzah demo video" style={{ width: '100%', height: '100%', border: 0 }} allowFullScreen />
            : <div style={{ textAlign: 'center', padding: 24 }}><div style={{ font: '600 22px var(--display)' }}>The under-3-minute video is published here by 20 November 2026.</div><p className="muted">Until then, everything shown in it is live:</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}><Link className="btn btn-primary" to="/app">Mobile app</Link><Link className="btn btn-ghost" to="/clinic">Clinician console</Link><Link className="btn btn-ghost" to="/clinic/benchmark">Test suite</Link></div></div>}
        </div>
        <ol className="muted" style={{ lineHeight: 1.9, marginTop: 26 }}>
          <li>Anonymous check-in in Arabic and English, with the instant red-flag interrupt.</li>
          <li>The Alarzah Clip reading left and right skin temperature live; the phone computing heat load and the left/right pattern.</li>
          <li>Next steps with the rule behind each, and clinician sign-off on the desktop console.</li>
          <li>The Alarzah Pod keeping a home sample between 20 and 37 °C, with a countdown and an anonymous lab code.</li>
          <li>The privacy vault: one-time share link, audit log, delete everything.</li>
        </ol>
      </div>
    </div>
  )
}
