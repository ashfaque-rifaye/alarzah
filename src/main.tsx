import React, { Suspense, lazy, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './styles/global.css'

const Landing = lazy(() => import('./pages/Landing'))
const MobileApp = lazy(() => import('./pages/MobileApp'))
const Console = lazy(() => import('./pages/Console'))
const Demo = lazy(() => import('./pages/Demo'))
const Share = lazy(() => import('./pages/Share'))

/** Tells the inline launch screen (index.html) that the first page has rendered. */
function Ready() { useEffect(() => { (window as any).__splashDone?.() }, []); return null }

function Loader() {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
    <div style={{ width: 46, height: 46, borderRadius: '50%', border: '2px solid rgba(255,255,255,.1)', borderTopColor: 'var(--cool)', animation: 'spin 1s linear infinite' }} />
    <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
  </div>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app/*" element={<MobileApp />} />
          <Route path="/clinic/*" element={<Console />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/s/:tok" element={<Share />} />
          <Route path="/demo.html" element={<Demo />} />
          <Route path="*" element={<Landing />} />
        </Routes>
        <Ready />
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
