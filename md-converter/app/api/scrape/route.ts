import { NextRequest, NextResponse } from 'next/server'
import { scrapeUrl } from '@/lib/parsers/web'
import { analyzeDocument } from '@/lib/guardrails'
import { detectDocumentType } from '@/lib/converter'
import { extractUrl, extractTitleFromMarkdown, type ContentType } from '@/lib/services/summarize'
import { fetchViaLadder, isLadderConfigured } from '@/lib/services/ladder'

export async function GET() {
  return NextResponse.json({ ladderAvailable: isLadderConfigured() })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { url, useLadder = false } = body as { url: string; useLadder?: boolean }

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL é obrigatória.' }, { status: 400 })
    }

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return NextResponse.json({ error: 'URL inválida.' }, { status: 400 })
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Apenas URLs http e https são suportadas.' }, { status: 400 })
    }

    let markdown: string
    let title: string
    let byline: string | undefined
    let contentType: ContentType = 'website'
    let source: 'ladder' | 'summarize' | 'cheerio' = 'cheerio'

    // ── Ladder path (explicit opt-in) ──────────────────────────────────────────
    if (useLadder) {
      if (!isLadderConfigured()) {
        return NextResponse.json(
          { error: 'Ladder não configurado. Defina LADDER_URL em .env.local (ex: http://localhost:8080) e reinicie o servidor.' },
          { status: 400 },
        )
      }
      const result = await fetchViaLadder(url)
      markdown = result.markdown
      title = result.title
      source = 'ladder'
    } else {
      // ── Primary: summarize.sh ──────────────────────────────────────────────
      try {
        const result = await extractUrl(url, { timeoutMs: 60_000 })
        markdown = result.markdown
        contentType = result.contentType
        title = extractTitleFromMarkdown(markdown, parsed.hostname)
        source = 'summarize'
      } catch (summarizeErr) {
        // ── Fallback: cheerio + turndown ─────────────────────────────────────
        console.warn('[scrape] summarize falhou, usando fallback cheerio:', summarizeErr)
        const result = await scrapeUrl(url)
        markdown = result.markdown
        title = result.title
        byline = result.byline
        source = 'cheerio'
      }
    }

    const docType = detectDocumentType(markdown)
    const analysis = analyzeDocument(markdown, docType)

    return NextResponse.json({ markdown, title, byline, url, analysis, contentType, source })
  } catch (err) {
    console.error('Scrape error:', err)
    const message = err instanceof Error ? err.message : 'Erro ao buscar a página.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
