import type { DocumentType } from '@/types'

export interface ArticleInfo {
  id: number
  titulo: string
  tema?: string
}

export interface EnrichmentResult {
  tipo: string
  edition?: number
  topics: string[]
  articles: ArticleInfo[]
}

// Convert "// Title" patterns to "## Title" (plain and bold-wrapped variants).
export function preprocessMarkdown(markdown: string): string {
  return markdown
    // **// Title** or ***// Title*** (bold/italic from PDF bold headings)
    .replace(/^\*{1,3}\/\/\s*(.+?)\*{0,3}\s*$/gm, (_, t) => `## ${t.trim()}`)
    // // Title (plain)
    .replace(/^\/\/\s*(.+?)\s*$/gm, (_, t) => `## ${t.trim()}`)
    .trim()
}

/**
 * Merge ## headings split across a blank line by a PDF line-break.
 * e.g. "## O novo hype é desenho\n\ninfantil." → "## O novo hype é desenho infantil."
 * Only merges when the heading lacks terminal punctuation AND the continuation is ≤50 chars.
 */
export function fixSplitHeadings(markdown: string): string {
  return markdown.replace(
    /^(##\s+[^\n]{5,120}[^\s.!?»"'\n])\n\n([^\n#]{1,50}[.!?»"'])\n/gm,
    '$1 $2\n',
  )
}

/** Extract article structure and generate a basic EnrichmentResult */
export function extractStructure(
  markdown: string,
  docType: DocumentType,
  originalName: string
): EnrichmentResult {
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)]
  const articles: ArticleInfo[] = headings.map((m, i) => ({
    id: i + 1,
    titulo: m[1].trim().replace(/\*\*/g, ''),
  }))

  const tipo = deriveTipo(articles.length, docType)

  const editionMatch = originalName.match(/(\d{2,4})[.\s_-]/)
  const edition = editionMatch ? parseInt(editionMatch[1]) : undefined

  const topics = articles.map(a => a.titulo)

  return { tipo, edition, topics, articles }
}

function deriveTipo(articleCount: number, docType: DocumentType): string {
  if (articleCount > 1) return 'newsletter'
  if (docType === 'email') return 'email'
  if (docType === 'report') return 'relatório'
  if (docType === 'dialogue') return 'diálogo'
  if (docType === 'log') return 'log'
  return 'documento'
}

/** Extract the body text of each article section (after its ## heading) */
export function extractArticleExcerpts(markdown: string): string[] {
  const sections = markdown.split(/\n(?=##\s)/)
  return sections
    .filter(s => s.trimStart().startsWith('## '))
    .map(s => s.replace(/^##\s+[^\n]+\n?/, '').trim().slice(0, 300))
}

// ─── LLM provider detection ───────────────────────────────────────────────────
// Priority: Groq (free) → Gemini (free) → Anthropic → OpenAI

type Provider = 'groq' | 'gemini' | 'anthropic' | 'openai'

function detectProvider(): Provider | null {
  if (process.env.GROQ_API_KEY) return 'groq'
  if (process.env.GEMINI_API_KEY) return 'gemini'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  if (process.env.OPENAI_API_KEY) return 'openai'
  return null
}

async function callLLM(prompt: string): Promise<string> {
  const provider = detectProvider()
  if (!provider) throw new Error('no provider')

  const signal = AbortSignal.timeout(30_000)

  if (provider === 'groq') {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
      signal,
    })
    if (!res.ok) throw new Error(`Groq ${res.status}`)
    const d = await res.json()
    return d.choices[0].message.content
  }

  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal,
      }
    )
    if (!res.ok) throw new Error(`Gemini ${res.status}`)
    const d = await res.json()
    return d.candidates[0].content.parts[0].text
  }

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal,
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}`)
    const d = await res.json()
    return d.content[0].text
  }

  // openai
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
    signal,
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}`)
  const d = await res.json()
  return d.choices[0].message.content
}

/**
 * Split markdown into chunks of ~chunkChars each, respecting ## boundaries.
 */
function chunkMarkdown(markdown: string, chunkChars = 8000): Array<{
  index: number
  content: string
  firstHeading: string | null
}> {
  const sections = markdown.split(/\n(?=##\s)/)
  const chunks: Array<{ index: number; content: string; firstHeading: string | null }> = []
  let buffer = ''
  let bufferFirstHeading: string | null = null

  const flush = () => {
    if (buffer.trim()) {
      chunks.push({
        index: chunks.length,
        content: buffer,
        firstHeading: bufferFirstHeading,
      })
    }
    buffer = ''
    bufferFirstHeading = null
  }

  for (const sec of sections) {
    const headingMatch = sec.match(/^##\s+(.+)/)
    const heading = headingMatch ? headingMatch[1].trim() : null

    if (buffer.length + sec.length > chunkChars && buffer.length > 0) {
      flush()
    }
    if (!bufferFirstHeading) bufferFirstHeading = heading
    buffer += (buffer ? '\n' : '') + sec
  }
  flush()

  return chunks
}

function buildEnrichmentPrompt(
  knownTitles: string,
  chunk: string,
  chunkIndex: number,
  totalChunks: number
): string {
  const partInfo = totalChunks > 1
    ? `\n[Este e o trecho ${chunkIndex + 1} de ${totalChunks} do documento — analise APENAS o que esta visivel neste trecho.]\n`
    : ''

  return `Voce e editor de uma newsletter brasileira de mercado financeiro/tecnologia/negocios. Analise o markdown abaixo e retorne um JSON com dois campos:
${partInfo}
1. "topics": lista de 3-6 topicos semanticos ESPECIFICOS em portugues (2-5 palavras cada). Foque em entidades concretas (empresas, paises, setores, metricas), nao em categorias genericas.
   ERRADO: ["Inteligencia Artificial", "Tecnologia", "Negocios", "Mercado Financeiro", "Economia"]
   CERTO: ["Petrobras dividendos extraordinarios", "IPO Stone follow-on", "Selic 9.75% Copom", "Tesouro IPCA+ 2045"]

2. "articles": array com TODOS os artigos/secoes deste trecho — incluindo os que nao tem heading ## no markdown.
   Cada item deve ter:
   - "titulo": titulo do artigo
   - "tema": 2-4 palavras, assunto central
   - "marker": SOMENTE para artigos que NAO tem heading ##  — primeira frase ou expressao literal e unica do corpo desse artigo.

Headings ## ja detectados:
${knownTitles}

Markdown:
${chunk}

Retorne APENAS JSON valido, sem blocos de codigo.`
}

/**
 * Enrich topics and article temas via LLM, with chunking for long documents.
 */
export async function enrichWithLLM(
  knownArticles: ArticleInfo[],
  markdown: string
): Promise<{ enrichment: Partial<EnrichmentResult>; correctedMarkdown: string }> {
  if (!detectProvider()) return { enrichment: {}, correctedMarkdown: markdown }

  const chunks = chunkMarkdown(markdown, 8000)
  const knownTitles = knownArticles.map(a => `- "${a.titulo}"`).join('\n')
    || '(nenhum detectado automaticamente)'

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const prompt = buildEnrichmentPrompt(knownTitles, chunk.content, chunk.index, chunks.length)
      try {
        const raw = await callLLM(prompt)
        const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
        return JSON.parse(jsonStr)
      } catch {
        return null
      }
    })
  )

  const allTopics = new Set<string>()
  const allArticles: Array<{ titulo: string; tema?: string; marker?: string }> = []

  for (const res of chunkResults) {
    if (!res) continue
    if (Array.isArray(res.topics)) {
      res.topics.forEach((t: string) => allTopics.add(t))
    }
    if (Array.isArray(res.articles)) {
      for (const a of res.articles) {
        if (a.titulo) allArticles.push(a)
      }
    }
  }

  let correctedMarkdown = markdown
  const articlesWithIds: ArticleInfo[] = []
  let idCounter = 1

  for (const a of allArticles) {
    const article: ArticleInfo = {
      id: idCounter++,
      titulo: String(a.titulo),
      tema: a.tema ? String(a.tema) : undefined,
    }
    articlesWithIds.push(article)

    if (a.marker && typeof a.marker === 'string' && a.marker.length >= 5) {
      const titleSlice = article.titulo.toLowerCase().slice(0, 20)
      const headingExists = correctedMarkdown
        .split('\n')
        .some(l => l.startsWith('## ') && l.toLowerCase().includes(titleSlice))
      if (!headingExists) {
        const markerIdx = correctedMarkdown.indexOf(a.marker)
        if (markerIdx !== -1) {
          const lineStart = correctedMarkdown.lastIndexOf('\n', markerIdx) + 1
          const linePrefix = correctedMarkdown.slice(lineStart, markerIdx)
          if (!linePrefix.startsWith('#') && !linePrefix.startsWith('-')) {
            correctedMarkdown =
              correctedMarkdown.slice(0, lineStart) +
              `## ${article.titulo}\n\n` +
              correctedMarkdown.slice(lineStart)
          }
        }
      }
    }
  }

  return {
    enrichment: {
      topics: [...allTopics].slice(0, 8),
      articles: articlesWithIds.length > 0 ? articlesWithIds : undefined,
    },
    correctedMarkdown,
  }
}
