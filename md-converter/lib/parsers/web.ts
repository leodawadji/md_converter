import * as cheerio from 'cheerio'
import TurndownService from 'turndown'

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
})

export const NOISE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe',
  'nav', 'header', 'footer',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '.cookie-banner', '.newsletter-signup', '.sidebar', '.ad', '.advertisement',
  '#comments', '.comments',
]

export const CONTENT_SELECTORS = [
  'article',
  '[role="main"]',
  'main',
  '.post-content', '.article-content', '.entry-content', '.content',
  '.post-body', '.article-body',
]

export interface ScrapeResult {
  title: string
  markdown: string
  url: string
  byline?: string
}

/** Parse raw HTML into title + clean markdown. Used by scrapeUrl and the Ladder service. */
export function htmlToMarkdown(
  html: string,
  sourceUrl: string,
): { title: string; markdown: string; byline?: string } {
  const $ = cheerio.load(html)

  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('title').text() ||
    new URL(sourceUrl).hostname

  const byline =
    $('meta[name="author"]').attr('content') ||
    $('[rel="author"]').first().text() ||
    $('.author').first().text() ||
    undefined

  for (const sel of NOISE_SELECTORS) $(sel).remove()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let contentEl: cheerio.Cheerio<any> | null = null
  for (const sel of CONTENT_SELECTORS) {
    const el = $(sel).first()
    if (el.length && el.text().trim().length > 200) {
      contentEl = el
      break
    }
  }

  const contentHtml = contentEl ? contentEl.html() ?? '' : $('body').html() ?? ''
  const rawMarkdown = turndown.turndown(contentHtml)
  const markdown = buildMarkdown(title, byline, sourceUrl, rawMarkdown)

  return { title: title.trim(), markdown, byline: byline?.trim() || undefined }
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MDConverter/1.0; +https://github.com/local)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    throw new Error(`Tipo de conteúdo não suportado: ${contentType}`)
  }

  const html = await response.text()
  const { title, markdown, byline } = htmlToMarkdown(html, url)
  return { title, markdown, url, byline }
}

function buildMarkdown(title: string, byline: string | undefined, url: string, body: string): string {
  const cleaned = body
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\[([^\]]+)\]\(\)/g, '$1')
    .trim()

  const lines: string[] = [
    `# ${title.trim()}`,
    '',
    `> Fonte: ${url}`,
  ]

  if (byline) lines.push(`> Autor: ${byline}`)

  lines.push('', '---', '', cleaned)

  return lines.join('\n')
}
