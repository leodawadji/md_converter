'use client'
import { Download, Package, FileDown } from 'lucide-react'
import JSZip from 'jszip'
import type { ParsedDocument } from '@/types'

interface ExportPanelProps {
  documents: ParsedDocument[]
}

function buildFrontmatter(doc: ParsedDocument): string {
  const { tipo = 'documento', edition, topics = [], articles = [] } = doc.enrichment ?? {}
  const lines: string[] = [
    '---',
    `source: "${doc.originalName}"`,
    `created: ${new Date(doc.createdAt).toISOString().slice(0, 10)}`,
    `tipo: ${tipo}`,
  ]

  if (edition !== undefined) lines.push(`edition: ${edition}`)

  lines.push(
    `tokens_est: ${doc.analysis.tokenEstimate}`,
    `quality_score: ${doc.analysis.qualityScore}`,
  )

  if (topics.length > 0) {
    lines.push('topics:')
    topics.forEach(t => lines.push(`  - ${t}`))
  } else {
    lines.push('topics: []')
  }

  if (articles.length > 0) {
    lines.push('articles:')
    articles.forEach(a => {
      lines.push(`  - id: ${a.id}`)
      lines.push(`    titulo: "${a.titulo}"`)
      if (a.tema) lines.push(`    tema: ${a.tema}`)
    })
  }

  lines.push('---', '')
  return lines.join('\n')
}

function buildMarkdownFile(doc: ParsedDocument): string {
  return buildFrontmatter(doc) + doc.markdown
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\u00C0-\u024F]/g, '_').slice(0, 60)
}

export default function ExportPanel({ documents }: ExportPanelProps) {
  const handleDownloadSingle = (doc: ParsedDocument) => {
    const content = buildMarkdownFile(doc)
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sanitizeFilename(doc.name)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadAll = async () => {
    if (documents.length === 0) return
    if (documents.length === 1) {
      handleDownloadSingle(documents[0])
      return
    }
    const zip = new JSZip()
    const usedNames = new Set<string>()
    documents.forEach(doc => {
      let base = sanitizeFilename(doc.name)
      let filename = `${base}.md`
      let counter = 1
      while (usedNames.has(filename)) {
        filename = `${base}_${counter++}.md`
      }
      usedNames.add(filename)
      zip.file(filename, buildMarkdownFile(doc))
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'contexto_markdown.zip'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (documents.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
        <FileDown className="w-3.5 h-3.5" />
        Exportar
      </h3>

      <button
        onClick={handleDownloadAll}
        className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
      >
        {documents.length > 1 ? (
          <>
            <Package className="w-4 h-4" />
            Baixar todos ({documents.length}) como .zip
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Baixar {documents[0].name}.md
          </>
        )}
      </button>

      {documents.length > 1 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {documents.map(doc => (
            <button
              key={doc.id}
              onClick={() => handleDownloadSingle(doc)}
              className="w-full flex items-center gap-2 text-xs text-zinc-400 hover:text-violet-400 px-2 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-left"
            >
              <Download className="w-3 h-3 shrink-0" />
              <span className="truncate">{doc.name}.md</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
