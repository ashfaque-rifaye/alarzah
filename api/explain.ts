// Vercel function: an LLM only words the explanation; fixed rules decided everything; a checker gates every reply.
// Provider order: NVIDIA Nemotron (NVIDIA_API_KEY) -> Claude (ANTHROPIC_API_KEY) -> rule-based wording.
import Anthropic from '@anthropic-ai/sdk'
import { ExplainRequest, ExplainResponse, ruleText, SYSTEM_PROMPT, userPrompt, verify } from '../src/engine/verify.js'

const NVIDIA_MODEL = process.env.NVIDIA_TEXT_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b'
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const CLAUDE_MODEL = 'claude-opus-5-5'

const json = (body: ExplainResponse | { error: string }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

async function nvidia(req: ExplainRequest): Promise<{ text: string; model: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const r = await fetch(NVIDIA_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { authorization: `Bearer ${(process.env.NVIDIA_API_KEY || "").trim().replace(/^"|"$/g, "")}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        max_tokens: 700,
        temperature: 0.2,
        chat_template_kwargs: { enable_thinking: false },
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt(req) }],
      }),
    })
    if (!r.ok) throw new Error(`NVIDIA ${r.status}`)
    const j = (await r.json()) as { model?: string; choices?: { message?: { content?: string } }[] }
    const text = (j.choices?.[0]?.message?.content ?? '').trim()
    if (!text) throw new Error('NVIDIA empty reply')
    return { text, model: j.model || NVIDIA_MODEL }
  } finally {
    clearTimeout(timer)
  }
}

async function claude(req: ExplainRequest): Promise<{ text: string; model: string } | { refused: true }> {
  const client = new Anthropic({ timeout: 25_000, maxRetries: 1 })
  const msg = await client.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1200,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt(req) }],
  })
  if (msg.stop_reason === 'refusal') return { refused: true }
  return { text: msg.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim(), model: msg.model }
}

export async function POST(request: Request): Promise<Response> {
  let req: ExplainRequest
  try {
    req = await request.json()
    if (!req?.facts?.recommendations?.length || JSON.stringify(req).length > 6000) throw new Error('bad request')
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }
  const fallback = (reason: string): Response => json({ text: ruleText(req), source: 'rules', checks: [], reason })
  const gate = (text: string, model: string): Response => {
    const checks = verify(text, req.facts)
    if (checks.some(c => !c.pass)) return json({ text: ruleText(req), source: 'rules', checks, model, reason: 'The AI reply failed a safety check and was blocked' })
    return json({ text, source: 'ai', checks, model })
  }

  const errors: string[] = []
  if (process.env.NVIDIA_API_KEY) {
    try { const r = await nvidia(req); return gate(r.text, r.model) } catch (e) { errors.push(e instanceof Error ? e.message : 'NVIDIA error') }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const r = await claude(req)
      if ('refused' in r) return fallback('The AI declined; rule-based wording shown')
      return gate(r.text, r.model)
    } catch (err) {
      if (err instanceof Anthropic.APIError) errors.push(`Claude error ${err.status}`)
      else errors.push('Claude unreachable')
    }
  }
  return fallback(errors.length ? `AI unavailable (${errors.join('; ')})` : 'AI is not configured on this deployment')
}
