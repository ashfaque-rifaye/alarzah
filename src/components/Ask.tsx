import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { ExplainFacts, ExplainResponse, ruleText } from '../engine/verify'
import type { Triage } from '../engine/rules'
import { TIER_META } from '../engine/rules'
import type { Analysis } from '../engine/signals'

export function factsFrom(tri: Triage, clip?: Analysis): ExplainFacts {
  return {
    recommendations: tri.recommendations.map(r => ({ tier: r.tier, label: TIER_META[r.tier].label, title: r.title, rule: r.rule, why: r.why })),
    signals: clip?.status === 'ok' ? {
      heatHoursPerDay: +clip.heatHoursPerDay!.toFixed(1), leftMinusRightUpright: +clip.diffUpright!.toFixed(2),
      leftMinusRightLying: +clip.diffLying!.toFixed(2), wornHours: Math.round(clip.wornHours),
    } : clip ? { clip: 'no result', reason: clip.reason } : undefined,
    note: tri.clipNote,
  }
}

export async function explain(lang: 'en' | 'ar', level: 'simple' | 'standard', facts: ExplainFacts, question?: string): Promise<ExplainResponse> {
  try {
    const r = await fetch('/api/explain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang, level, facts, question }) })
    if (!r.ok) throw new Error(String(r.status))
    return await r.json()
  } catch {
    return { text: ruleText({ lang, level, facts, question }), source: 'rules', checks: [], reason: 'AI service unreachable' }
  }
}

type SR = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void }
export function useVoice(lang: 'en' | 'ar') {
  const [listening, setListening] = useState(false)
  const recRef = useRef<SR | null>(null)
  const Ctor = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition
    || (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition
  const listen = (onText: (t: string) => void) => {
    if (!Ctor) return false
    const rec = new Ctor(); recRef.current = rec
    rec.lang = lang === 'ar' ? 'ar-AE' : 'en-US'; rec.interimResults = false
    rec.onresult = e => onText(e.results[0][0].transcript)
    rec.onend = () => setListening(false); rec.onerror = () => setListening(false)
    setListening(true); rec.start(); return true
  }
  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang === 'ar' ? 'ar-SA' : 'en-GB'; u.rate = lang === 'ar' ? 0.95 : 1
    const v = speechSynthesis.getVoices().find(v => v.lang.startsWith(lang === 'ar' ? 'ar' : 'en'))
    if (v) u.voice = v
    speechSynthesis.speak(u)
  }
  useEffect(() => () => { recRef.current?.stop(); if ('speechSynthesis' in window) speechSynthesis.cancel() }, [])
  return { canListen: !!Ctor, listening, listen, speak }
}

const SUGGEST = {
  en: ['What does this mean for me?', 'Why do I need an examination?', 'Is this serious?', 'Can heat really matter?'],
  ar: ['ماذا تعني هذه النتيجة؟', 'لماذا أحتاج إلى فحص؟', 'هل هذا خطير؟', 'هل تؤثر الحرارة فعلًا؟'],
}

/** Ask Alarzah: rules decide, AI explains, a checker verifies, voice in and out. */
export function AskPanel({ facts, lang, compact = false }: { facts: ExplainFacts; lang: 'en' | 'ar'; compact?: boolean }) {
  const [q, setQ] = useState('')
  const [level, setLevel] = useState<'simple' | 'standard'>('simple')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<ExplainResponse | null>(null)
  const [shown, setShown] = useState('')
  const voice = useVoice(lang)
  const ask = async (question?: string) => {
    setBusy(true); setRes(null); setShown('')
    const r = await explain(lang, level, facts, question || undefined)
    setRes(r); setBusy(false)
  }
  useEffect(() => {
    if (!res) return
    let i = 0
    const id = setInterval(() => { i += 3; setShown(res.text.slice(0, i)); if (i >= res.text.length) clearInterval(id) }, 16)
    return () => clearInterval(id)
  }, [res])
  const ar = lang === 'ar'
  return (
    <div className="ask" dir={ar ? 'rtl' : 'ltr'}>
      <div className="ask-head">
        <div className="ask-orb" data-busy={busy} />
        <div style={{ flex: 1 }}>
          <b>{ar ? 'اسأل Alarzah' : 'Ask Alarzah'}</b>
          <div className="ask-sub">{ar ? 'القواعد تقرر · الذكاء الاصطناعي يشرح · مدقق يتحقق' : 'Rules decide · AI explains · a checker verifies'}</div>
        </div>
        <button className="ask-level" onClick={() => setLevel(l => (l === 'simple' ? 'standard' : 'simple'))}>{level === 'simple' ? (ar ? 'مبسّط' : 'Simple') : (ar ? 'عادي' : 'Standard')}</button>
      </div>
      <div className="ask-chips">{SUGGEST[lang].slice(0, compact ? 3 : 4).map(s => <button key={s} onClick={() => { setQ(s); ask(s) }}>{s}</button>)}</div>
      <form className="ask-input" onSubmit={e => { e.preventDefault(); ask(q) }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={ar ? 'اكتب أو تحدث بسؤالك…' : 'Type or speak your question…'} aria-label="Your question" />
        {voice.canListen && <button type="button" className={`ask-mic ${voice.listening ? 'on' : ''}`} aria-label="Speak your question" onClick={() => voice.listen(t => { setQ(t); ask(t) })}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" /></svg></button>}
        <button className="ask-go" aria-label="Ask">{busy ? <span className="ask-spin" /> : '↑'}</button>
      </form>
      <AnimatePresence>
        {(busy || res) && (
          <motion.div className="ask-answer" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {busy ? <div className="ask-think"><i /><i /><i /><span>{ar ? 'يصوغ الشرح، ثم يتحقق منه…' : 'Wording the explanation, then checking it…'}</span></div> : res && <>
              <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{shown}</p>
              <div className="ask-meta">
                <span className={`ask-src ${res.source}`}>{res.source === 'ai' ? `AI · ${res.model ?? 'Claude'}` : (ar ? 'صياغة القواعد' : 'Rule-based wording')}</span>
                {res.checks.map(c => <span key={c.name} className={`ask-check ${c.pass ? 'ok' : 'bad'}`} title={c.detail}>{c.pass ? '✓' : '✕'} {c.name}</span>)}
                {res.reason && <span className="ask-reason">{res.reason}</span>}
                <button className="ask-speak" onClick={() => voice.speak(res.text)}>{ar ? '🔊 استمع' : '🔊 Listen'}</button>
              </div>
            </>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
