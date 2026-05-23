import { NextRequest, NextResponse } from 'next/server'
import { parseTxt } from '@/lib/parsers/txt'
import { convertToMarkdown, detectDocumentType } from '@/lib/converter'
import { analyzeDocument } from '@/lib/guardrails'
import { convertWithMarkItDown } from '@/lib/services/markitdown'
import {
  preprocessMarkdown,
  fixSplitHeadings,
  extractStructure,
  enrichWithLLM,
} from '@/lib/enrichment'
import type { EnrichmentResult } from '@/types'

const MARKITDOWN_EXTENSIONS = new Set(['pdf', 'docx', 'xlsx', 'pptx', 'html', 'htm'])

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const pasteText = formData.get('text') as string | null

    let rawText = ''
    let markdown = ''
    let fileType: 'txt' | 'pdf' | 'docx' | 'paste' = 'paste'
    let originalName = 'paste'
    let usedMarkItDown = false

    if (pasteText) {
      rawText = pasteText
      fileType = 'paste'
      originalName = 'Texto colado'
    } else if (file) {
      originalName = file.name
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const buffer = Buffer.from(await file.arrayBuffer())

      if (MARKITDOWN_EXTENSIONS.has(ext)) {
        markdown = await convertWithMarkItDown(buffer, file.name)
        rawText = markdown
        fileType = (ext === 'pdf' || ext === 'docx') ? ext : 'txt'
        usedMarkItDown = true
      } else {
        rawText = await parseTxt(buffer.toString('utf-8'))
        fileType = 'txt'
      }
    } else {
      return NextResponse.json({ error: 'Nenhum arquivo ou texto fornecido.' }, { status: 400 })
    }

    if (!usedMarkItDown) {
      const docType = detectDocumentType(rawText)
      markdown = convertToMarkdown(rawText, docType)
    }

    // Structural post-processing
    markdown = preprocessMarkdown(markdown)
    markdown = fixSplitHeadings(markdown)
    rawText = usedMarkItDown ? markdown : rawText

    const docType = detectDocumentType(rawText)
    const analysis = analyzeDocument(markdown, docType)

    // Enrich: extract article structure + optional LLM topics/temas/missing headings
    let enrichment: EnrichmentResult = extractStructure(markdown, docType, originalName)
    if (enrichment.articles.length > 0) {
      const llmResult = await enrichWithLLM(enrichment.articles, markdown).catch(() => ({
        enrichment: {},
        correctedMarkdown: markdown,
      }))
      enrichment = { ...enrichment, ...llmResult.enrichment }
      markdown = llmResult.correctedMarkdown
    }

    return NextResponse.json({ rawText, markdown, analysis, fileType, originalName, enrichment })
  } catch (err) {
    console.error('Parse error:', err)
    const message = err instanceof Error ? err.message : 'Erro ao processar o arquivo.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
