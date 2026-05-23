'use client'
import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Edit3, Loader2 } from 'lucide-react'
import type { ParsedDocument, GuardrailResult } from '@/types'
import GuardrailBar from './GuardrailBar'

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-zinc-500 gap-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      Carregando editor...
    </div>
  ),
})

interface EditorPanelProps {
  doc: ParsedDocument | null
  onMarkdownChange: (id: string, markdown: string, analysis: GuardrailResult) => void
}

export default function EditorPanel({ doc, onMarkdownChange }: EditorPanelProps) {
  const [value, setValue] = useState('')
  const [analysis, setAnalysis] = useState<GuardrailResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (doc) {
      setValue(doc.markdown)
      setAnalysis(doc.analysis)
    }
  }, [doc?.id])

  const analyzeText = useCallback(async (text: string) => {
    setAnalyzing(true)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data: GuardrailResult = await res.json()
      setAnalysis(data)
      return data
    } finally {
      setAnalyzing(false)
    }
  }, [])

  const handleChange = useCallback((val?: string) => {
    const newVal = val ?? ''
    setValue(newVal)

    if (debounceTimer) clearTimeout(debounceTimer)
    const timer = setTimeout(async () => {
      if (doc) {
        const newAnalysis = await analyzeText(newVal)
        onMarkdownChange(doc.id, newVal, newAnalysis)
      }
    }, 800)
    setDebounceTimer(timer)
  }, [doc, debounceTimer, analyzeText, onMarkdownChange])

  if (!doc) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3">
        <Edit3 className="w-10 h-10 text-zinc-700" />
        <div>
          <p className="text-sm font-medium text-zinc-500">Nenhum documento selecionado</p>
          <p className="text-xs text-zinc-600 mt-1">Importe um arquivo ou cole um texto para começar</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Document name */}
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-sm font-semibold text-zinc-200 truncate">{doc.name}</h2>
        <span className="text-xs text-zinc-500 shrink-0">· {doc.originalName}</span>
        {analyzing && <Loader2 className="w-3 h-3 animate-spin text-violet-400 ml-auto shrink-0" />}
      </div>

      {/* Guardrail bar */}
      {analysis && <GuardrailBar analysis={analysis} />}

      {/* Editor */}
      <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-zinc-700" data-color-mode="dark">
        <MDEditor
          value={value}
          onChange={handleChange}
          height="100%"
          preview="edit"
          style={{ height: '100%', background: 'transparent' }}
        />
      </div>
    </div>
  )
}
