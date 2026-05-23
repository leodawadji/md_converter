import { NextRequest, NextResponse } from 'next/server'
import { parseTxt } from '@/lib/parsers/txt'
import { convertToMarkdown, detectDocumentType } from '@/lib/converter'
import { analyzeDocument } from '@/lib/guardrails'
import { convertDocument } from '@/lib/services/convert'
import {
  preprocessMarkdown,
  fixSplitHeadings,
  extractStructure,
  enrichWithLLM,
} from '@/lib/enrichment'
import type { EnrichmentResult } from '@/types'

const EXTERNAL_CONVERT_EXTENSIONS = new Set(['pdf', 'docx', 'xlsx', 'pptx', 'html', 'htm'])

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const pasteText = formData.get('text') as string | null

    let rawText = ''
    let markdown = ''
    let fileType: 'txt' | 'pdf' | 'docx' | 'paste' = 'paste'
    let originalName = 'paste'
    let usedExternalConverter = false
    let tables: Array<{ id: number; markdown: string; caption: string | null; page: number | null }> = []
    let engine: 'docling' | 'markitdown' | undefined = undefined
    let warnings: string[] = []

    if (pasteText) {
      rawText = pasteText
      fileType = 'paste'
      originalName = 'Texto colado'
    } else if (file) {
      originalName = file.name
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const buffer = Buffer.from(await file.arrayBuffer())

      if (EXTERNAL_CONVERT_EXTENSIONS.has(ext)) {
        const result = await convertDocument(buffer, file.name)
        markdown = result.markdown
        rawText = markdown
        tables = result.tables
        engine = result.engine
        warnings = result.warnings
        fileType = (ext === 'pdf' || ext === 'docx') ? ext : 'txt'
        usedExternalConverter = true
      } else {
        rawText = await parseTxt(buffer.toString('utf-8'))
        fileType = 'txt'
      }
    } else {
      return NextResponse.json({ error: 'Nenhum arquivo ou texto fornecido.' }, { status: 400 })
    }

    if (!usedExternalConverter) {
      const docType = detectDocumentType(rawText)
      markdown = convertToMarkdown(rawText, docType)
    }

    // Structural post-processing
    markdown = preprocessMarkdown(markdown)
    markdown = fixSplitHeadings(markdown)
    rawText = usedExternalConverter ? markdown : rawText

    const docType = detectDocumentType(rawText)
    const analysis = analyzeDocument(markdown, docType)

    // Enrich: extract article structure + chunked LLM topics/temas/missing headings
    let enrichment: EnrichmentResult = extractStructure(markdown, docType, originalName)
    if (enrichment.articles.length > 0 || markdown.length > 1000) {
      const llmResult = await enrichWithLLM(enrichment.articles, markdown).catch(() => ({
        enrichment: {},
        correctedMarkdown: markdown,
      }))
      enrichment = { ...enrichment, ...llmResult.enrichment }
      markdown = llmResult.correctedMarkdown
    }

    return NextResponse.json({
      rawText,
      markdown,
      tables,
      engine,
      warnings,
      analysis,
      fileType,
      originalName,
      enrichment,
    })
  } catch (err) {
    console.error('Parse error:', err)
    const message = err instanceof Error ? err.message : 'Erro ao processar o arquivo.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
