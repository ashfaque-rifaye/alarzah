import { Link, useParams } from 'react-router-dom'

/** What a wife or doctor sees when opening a one-time link (demo: links are never stored on a server). */
export default function Share() {
  const { tok } = useParams()
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="glass" style={{ maxWidth: 460, padding: 28, textAlign: 'center' }}>
        <img src="/icon.svg" width={48} height={48} alt="" />
        <h1 style={{ fontSize: 28, margin: '14px 0 8px' }}>This link has already been used</h1>
        <p className="muted">Alarzah share links open once and expire after 24 hours. In this demo the summary never leaves the sender’s phone, so nothing is stored here.</p>
        <p className="dim mono">{tok}</p>
        <Link className="btn btn-ghost" to="/">About Alarzah</Link>
      </div>
    </div>
  )
}
