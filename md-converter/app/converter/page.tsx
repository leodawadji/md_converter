'use client'
import { useState, useCallback } from 'react'
import { FileText, Sparkles, PanelRight, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { ParsedDocument, GuardrailResult } from '@/types'
import DocumentList from '@/components/DocumentList'
import EditorPanel from '@/components/EditorPanel'
import PreviewPanel from '@/components/PreviewPanel'
import ExportPanel from '@/components/ExportPanel'

export default function ConverterPage() {
  const [documents, setDocuments] = useState<ParsedDocument[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(true)
  const activeDoc = documents.find(d => d.id === activeId) ?? null

  const handleDocumentAdded = useCallback((doc: ParsedDocument) => {
    setDocuments(prev => [...prev, doc])
    setActiveId(doc.id)
  }, [])

  const handleDocumentDeleted = useCallback((id: string) => {
    setDocuments(prev => {
      const next = prev.filter(d => d.id !== id)
      if (activeId === id) setActiveId(next[0]?.id ?? null)
      return next
    })
  }, [activeId])

  const handleToggleSelect = useCallback((id: string) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, selected: !d.selected } : d))
  }, [])

  const handleMergeSelected = useCallback(() => {
    setDocuments(prev => {
      const selected = prev.filter(d => d.selected)
      if (selected.length < 2) return prev

      const mergedMarkdown = selected
        .map((d, i) => (i === 0 ? d.markdown : `\n\n---\n\n## ${d.name}\n\n${d.markdown}`))
        .join('')

      const mergedName = `Mesclado (${selected.map(d => d.name).join(' + ')})`

      const newDoc: ParsedDocument = {
        id: crypto.randomUUID(),
        name: mergedName,
        originalName: selected.map(d => d.originalName).join(', '),
        fileType: selected[0].fileType,
        rawText: selected.map(d => d.rawText).join('\n\n'),
        markdown: mergedMarkdown,
        tables: selected.flatMap(d => d.tables),
        analysis: selected[0].analysis,
        selected: false,
        createdAt: new Date().toISOString(),
      }

      const remaining = prev.filter(d => !d.selected)
      setActiveId(newDoc.id)
      return [...remaining, newDoc]
    })
  }, [])

  const handleSplit = useCallback((docId: string, charIndex: number) => {
    setDocuments(prev => {
      const doc = prev.find(d => d.id === docId)
      if (!doc) return prev

      const partA = doc.markdown.slice(0, charIndex).trim()
      const partB = doc.markdown.slice(charIndex).trim()
      if (!partA || !partB) return prev

      const docA: ParsedDocument = {
        ...doc, id: crypto.randomUUID(), name: `${doc.name} (1)`,
        markdown: partA, rawText: partA, selected: false, createdAt: new Date().toISOString(),
      }
      const docB: ParsedDocument = {
        ...doc, id: crypto.randomUUID(), name: `${doc.name} (2)`,
        markdown: partB, rawText: partB, selected: false, createdAt: new Date().toISOString(),
      }

      const rest = prev.filter(d => d.id !== docId)
      const insertAt = prev.findIndex(d => d.id === docId)
      const result = [...rest.slice(0, insertAt), docA, docB, ...rest.slice(insertAt)]
      setActiveId(docA.id)
      return result
    })
  }, [])

  const handleMarkdownChange = useCallback((id: string, markdown: string, analysis: GuardrailResult) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, markdown, analysis } : d))
  }, [])

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Início
          </Link>
          <div className="w-px h-4 bg-zinc-700" />
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-zinc-100 leading-none">MD Converter</h1>
              <p className="text-xs text-zinc-500 leading-none mt-0.5">Contexto otimizado para IA</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span>Guardrails ativos</span>
          </div>
          <div className="w-px h-4 bg-zinc-700" />
          <span className="text-xs text-zinc-500">{documents.length} doc{documents.length !== 1 ? 's' : ''}</span>
          <div className="w-px h-4 bg-zinc-700" />
          <button
            onClick={() => setShowPreview(v => !v)}
            title="Alternar preview"
            className={`p-1 rounded transition-colors ${showPreview ? 'text-violet-400 bg-violet-400/10' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-x-auto">
        <aside className="w-64 min-w-[240px] shrink-0 border-r border-zinc-800 flex flex-col p-4 overflow-hidden">
          <DocumentList
            documents={documents}
            activeId={activeId}
            onSetActive={setActiveId}
            onDocumentAdded={handleDocumentAdded}
            onDocumentDeleted={handleDocumentDeleted}
            onToggleSelect={handleToggleSelect}
            onMergeSelected={handleMergeSelected}
            onSplit={handleSplit}
          />
          {documents.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800 shrink-0">
              <ExportPanel documents={documents} />
            </div>
          )}
        </aside>

        <main className="flex-1 min-w-[320px] flex flex-col p-4 border-r border-zinc-800 overflow-hidden">
          <EditorPanel doc={activeDoc} onMarkdownChange={handleMarkdownChange} />
        </main>

        {showPreview && (
          <aside className="w-80 min-w-[280px] shrink-0 flex flex-col p-4 overflow-hidden">
            <PreviewPanel doc={activeDoc} />
          </aside>
        )}
      </div>
    </div>
  )
}
