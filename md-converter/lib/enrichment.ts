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

/**
 * Convert // Title patterns → ## Title.
 * Handles plain (// Title) and bold-wrapped (**// Title**) variants,
 * since MarkItDown may wrap PDF bold headings in ** markers.
 * Trims trailing whitespace/carriage-returns from captured title.
 */
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
 * Enrich topics and article temas via LLM.
 * Also discovers articles that lack a ## heading by asking the LLM for a
 * "marker" (first unique phrase in the body), then inserts ## before it.
 * Returns enrichment data AND a corrected markdown string.
 */
export async function enrichWithLLM(
  knownArticles: ArticleInfo[],
  markdown: string
): Promise<{ enrichment: Partial<EnrichmentResult>; correctedMarkdown: string }> {
  if (!detectProvider()) return { enrichment: {}, correctedMarkdown: markdown }

  const truncated = markdown.length > 4000
    ? markdown.slice(0, 4000) + '\n...[truncado]'
    : markdown

  const knownTitles = knownArticles.map(a => `- "${a.titulo}"`).join('\n') || '(nenhum detectado automaticamente)'

  const prompt = `Você é editor de uma newsletter brasileira de tecnologia/negócios. Analise o markdown abaixo e retorne um JSON com dois campos:

1. "topics": lista de 3-6 tópicos semânticos ESPECÍFICOS em português (2-5 palavras cada).
   ERRADO (genérico demais): ["Inteligência Artificial", "Tecnologia", "Negócios e Empreendedorismo"]
   CERTO (específico): ["IA generativa no varejo", "estratégia direct-to-consumer Nike", "regulação de plataformas digitais"]

2. "articles": array com TODOS os artigos do documento — incluindo os que não têm heading ## no markdown.
   Cada item deve ter:
   - "titulo": título do artigo (extraído do heading ## ou inferido do conteúdo)
   - "tema": 2-4 palavras, assunto central do artigo
   - "marker": SOMENTE para artigos que NÃO têm heading ## — copie aqui a primeira frase ou expressão literal e única do corpo desse artigo (será usada para inserir o heading no lugar certo)

Headings ## já detectados automaticamente:
${knownTitles}

Markdown do documento:
${truncated}

Retorne APENAS JSON válido, sem blocos de código, sem texto fora do JSON.`

  try {
    const raw = await callLLM(prompt)
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(jsonStr)

    let correctedMarkdown = markdown
    const allArticles: ArticleInfo[] = []

    if (Array.isArray(parsed.articles)) {
      let idCounter = 1
      for (const a of parsed.articles) {
        if (!a.titulo) continue
        const article: ArticleInfo = {
          id: idCounter++,
          titulo: String(a.titulo),
          tema: a.tema ? String(a.tema) : undefined,
        }
        allArticles.push(article)

        // Insert a ## heading for articles the LLM found but that have no heading yet
        if (a.marker && typeof a.marker === 'string' && a.marker.length >= 5) {
          // Skip if any heading already contains this article's title
          const headingExists = correctedMarkdown
            .split('\n')
            .some(l => l.startsWith('## ') && l.toLowerCase().includes(article.titulo.toLowerCase().slice(0, 20)))
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
    }

    return {
      enrichment: {
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        articles: allArticles.length > 0 ? allArticles : undefined,
      },
      correctedMarkdown,
    }
  } catch {
    return { enrichment: {}, correctedMarkdown: markdown }
  }
}
