'use client'
import { FileText, File, Clipboard, Globe, Trash2, Scissors, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ParsedDocument } from '@/types'
import GuardrailBar from './GuardrailBar'
import { useState } from 'react'

interface DocumentCardProps {
  doc: ParsedDocument
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onToggleCheck: () => void
  onSplit: (charIndex: number) => void
}

const fileIcons = {
  pdf: <File className="w-4 h-4 text-red-400" />,
  docx: <FileText className="w-4 h-4 text-blue-400" />,
  txt: <FileText className="w-4 h-4 text-zinc-400" />,
  paste: <Clipboard className="w-4 h-4 text-violet-400" />,
  url: <Globe className="w-4 h-4 text-sky-400" />,
}

const docTypeLabel: Record<string, string> = {
  email: 'Email',
  report: 'Relatório',
  dialogue: 'Diálogo',
  log: 'Log',
  generic: 'Genérico',
}

export default function DocumentCard({ doc, isActive, onSelect, onDelete, onToggleCheck, onSplit }: DocumentCardProps) {
  const [showSplits, setShowSplits] = useState(false)
  const hasSplits = doc.analysis.splitSuggestions.length > 0

  return (
    <div
      className={cn(
        'rounded-xl border transition-all duration-150 cursor-pointer',
        isActive
          ? 'border-violet-500 bg-zinc-800'
          : 'border-zinc-700/50 bg-zinc-800/40 hover:border-zinc-600'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-3" onClick={onSelect}>
        <input
          type="checkbox"
          checked={doc.selected}
          onChange={e => { e.stopPropagation(); onToggleCheck() }}
          className="mt-0.5 accent-violet-500 cursor-pointer"
          onClick={e => e.stopPropagation()}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {fileIcons[doc.fileType]}
            <span className="text-sm font-medium text-zinc-200 truncate">{doc.name}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-zinc-500">{docTypeLabel[doc.analysis.docType]}</span>
            <span className="text-zinc-700">·</span>
            <GuardrailBar analysis={doc.analysis} compact />
            {doc.tables && doc.tables.length > 0 && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="text-xs text-emerald-400">
                  {doc.tables.length} tabela{doc.tables.length !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="text-zinc-600 hover:text-red-400 transition-colors p-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Split suggestions */}
      {hasSplits && isActive && (
        <div className="border-t border-zinc-700/50 px-3 pb-3 pt-2">
          <button
            onClick={() => setShowSplits(v => !v)}
            className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            <Scissors className="w-3 h-3" />
            {doc.analysis.splitSuggestions.length} sugestão(ões) de divisão
            {showSplits ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showSplits && (
            <div className="mt-2 space-y-1.5">
              {doc.analysis.splitSuggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => onSplit(s.charIndex)}
                  className="w-full text-left text-xs bg-amber-400/5 border border-amber-400/10 rounded-lg px-2.5 py-1.5 hover:bg-amber-400/10 transition-colors"
                >
                  <span className="text-zinc-400">Dividir em</span>{' '}
                  <span className="text-amber-300 font-medium">{s.reason}</span>{' '}
                  <span className="text-zinc-600">({Math.round(s.confidence * 100)}% confiança)</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
