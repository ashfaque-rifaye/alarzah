// Vercel function: Claude words the explanation; fixed rules decided everything; a checker gates every reply.
import Anthropic from '@anthropic-ai/sdk'
import { ExplainRequest, ExplainResponse, ruleText, SYSTEM_PROMPT, userPrompt, verify } from '../src/engine/verify'

const MODEL = 'claude-opus-5-5'
const json = (body: ExplainResponse | { error: string }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export async function POST(request: Request): Promise<Response> {
  let req: ExplainRequest
  try {
    req = await request.json()
    if (!req?.facts?.recommendations?.length || JSON.stringify(req).length > 6000) throw new Error('bad request')
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }
  const fallback = (reason: string): Response => json({ text: ruleText(req), source: 'rules', checks: [], reason })
  if (!process.env.ANTHROPIC_API_KEY) return fallback('AI is not configured on this deployment')

  const client = new Anthropic({ timeout: 25_000, maxRetries: 1 })
  try {
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 1200,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt(req) }],
    })
    if (msg.stop_reason === 'refusal') return fallback('The AI declined; rule-based wording shown')
    const text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim()
    const checks = verify(text, req.facts)
    if (checks.some(c => !c.pass)) {
      return json({ text: ruleText(req), source: 'rules', checks, model: msg.model, reason: 'The AI reply failed a safety check and was blocked' })
    }
    return json({ text, source: 'ai', checks, model: msg.model })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return fallback('AI busy (rate limited)')
    if (err instanceof Anthropic.AuthenticationError) return fallback('AI key rejected')
    if (err instanceof Anthropic.APIError) return fallback(`AI error ${err.status}`)
    return fallback('AI unreachable')
  }
}
