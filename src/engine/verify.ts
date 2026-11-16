// The AI may only word explanations. This checker runs on every AI reply before anyone sees it.
// A reply that adds a number, diagnoses, promises, or gives life advice is blocked and replaced by rule-based text.

export interface ExplainFacts {
  recommendations: { tier: string; label: string; title: string; rule: string; why: string }[]
  signals?: Record<string, number | string | boolean | undefined>
  note?: string
}
export interface ExplainRequest { lang: 'en' | 'ar'; level: 'simple' | 'standard'; question?: string; facts: ExplainFacts }
export interface Check { name: string; pass: boolean; detail?: string }
export interface ExplainResponse { text: string; source: 'ai' | 'rules'; checks: Check[]; model?: string; reason?: string }

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const normaliseDigits = (s: string) => s.replace(/[٠-٩]/g, d => String(ARABIC_DIGITS.indexOf(d))).replace(/٫/g, '.')
/** Numbers that are always safe to say: counts, timings and limits that the rules themselves use. */
const SAFE_NUMBERS = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '20', '24', '35', '35.0', '37', '60', '72', '998'])

export function numbersIn(text: string): string[] {
  return (normaliseDigits(text).match(/\d+(?:\.\d+)?/g) ?? []).map(n => n.replace(/\.0+$/, ''))
}

const BANNED: [RegExp, string][] = [
  [/\byou (?:have|are suffering from) (?:a )?(?:varicocele|infertility|cancer|torsion|low sperm)/i, 'states a diagnosis'],
  [/\b(?:you are|you're) (?:infertile|sterile)\b/i, 'states a diagnosis'],
  [/\bdiagnos(?:e|ed|is) (?:you|that you)\b/i, 'claims to diagnose'],
  [/\b(?:guarantee|definitely|certainly will|100% sure|cure[sd]?)\b/i, 'promises an outcome'],
  [/\b(?:should|must) (?:not )?(?:marry|divorce|get married|have (?:a )?(?:baby|children)|stop trying)\b/i, 'gives life or marriage advice'],
  [/\b(?:take|start|stop) (?:\d+ ?mg|clomiphene|testosterone|hcg|antibiotics)\b/i, 'gives medication instructions'],
  [/\bignore (?:the|your) (?:doctor|clinician|referral)\b/i, 'undermines the referral'],
  [/(?:(?:is|it's|this is) not (?:serious|dangerous|a (?:big )?(?:deal|problem))|nothing to worry about|no need to worry|you(?:'re| are) (?:fine|healthy|normal))/i, 'gives false reassurance'],
  [/(?:أنت مصاب|لديك دوالي|أنت عقيم|نضمن|بالتأكيد|يجب أن تتزوج|يجب أن تطلق)/, 'states a diagnosis or gives life advice (Arabic)'],
  [/(?:ليس خطير|غير خطير|لا داعي للقلق|لا تقلق|أنت بخير|أنت سليم)/, 'gives false reassurance (Arabic)'],
]

export function verify(text: string, facts: ExplainFacts): Check[] {
  const allowed = new Set(SAFE_NUMBERS)
  numbersIn(JSON.stringify(facts)).forEach(n => allowed.add(n))
  const extra = numbersIn(text).filter(n => !allowed.has(n))
  const checks: Check[] = [
    { name: 'Every number comes from the rules', pass: extra.length === 0, detail: extra.length ? `unexpected: ${[...new Set(extra)].join(', ')}` : undefined },
  ]
  const hits = BANNED.filter(([re]) => re.test(text)).map(([, why]) => why)
  checks.push({ name: 'No diagnosis, promise or life advice', pass: hits.length === 0, detail: hits.join('; ') || undefined })
  const top = facts.recommendations[0]
  if (top?.tier === 'emergency') checks.push({ name: 'Emergency step stays first', pass: /emergency|طوارئ|الإسعاف|998/i.test(text) })
  checks.push({ name: 'Length within limit', pass: text.length > 20 && text.length < 1400 })
  return checks
}

/** Deterministic wording used when the AI is offline or its reply fails a check. */
export function ruleText(req: ExplainRequest): string {
  const r = req.facts.recommendations
  if (req.lang === 'ar') {
    const lines = r.map((x, i) => `${i + 1}. ${x.title}.`)
    return `هذه نتيجة فحص وليست تشخيصًا. خطواتك التالية حسب القواعد الطبية:\n${lines.join('\n')}\nيراجع طبيب كل إحالة قبل إرسالها، وبياناتك تبقى على هاتفك.`
  }
  const lines = r.map((x, i) => `${i + 1}. ${x.title}.`)
  return `This is a screening result, not a diagnosis. Based on fixed medical rules, your next steps are:\n${lines.join('\n')}\nA clinician reviews every referral before it is sent, and your data stays on your phone.`
}

export const SYSTEM_PROMPT = `You are the explanation voice of Alarzah, a private men's reproductive health check used in Abu Dhabi.
Fixed medical rules have already decided the man's next steps. You only explain them in plain, warm, respectful words.
Rules for every reply:
- Use only the facts provided. Never add a number, percentage, statistic or timeframe that is not in the facts.
- Never diagnose, never say what he "has", never promise an outcome, never change or reorder the next steps.
- Never give medication instructions or advice about marriage, divorce or family decisions; for those, say a clinician can talk it through.
- Never judge how serious something is ("not serious", "nothing to worry about", "you are fine"); say the clinician will look at it with him.
- Do not mention marriage, wives or family unless the facts or his question do.
- If the first step is an emergency, say first and clearly that he should go to an emergency department now.
- Keep it short: at most 110 words, no headings, no lists unless asked. Avoid stigma; do not assume he is married or trying for a baby unless the facts say so.
- Answer in the requested language (English or Gulf-friendly Modern Standard Arabic) at the requested reading level.
- End by reminding him this is screening support, not a diagnosis.`

export function userPrompt(req: ExplainRequest): string {
  return [
    `Language: ${req.lang === 'ar' ? 'Arabic' : 'English'}. Reading level: ${req.level === 'simple' ? 'very simple, short sentences' : 'standard'}.`,
    `Facts (decided by rules, do not change):\n${JSON.stringify(req.facts)}`,
    req.question ? `His question: ${req.question.slice(0, 400)}` : 'Explain his next steps and why, in one short paragraph.',
  ].join('\n\n')
}
