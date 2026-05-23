'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Eye } from 'lucide-react'
import type { ParsedDocument } from '@/types'

interface PreviewPanelProps {
  doc: ParsedDocument | null
}

export default function PreviewPanel({ doc }: PreviewPanelProps) {
  if (!doc) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3">
        <Eye className="w-10 h-10 text-zinc-700" />
        <p className="text-xs text-zinc-600">O preview aparecerá aqui</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-2 px-1">
        <Eye className="w-4 h-4 text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-300">Preview</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-800/30 p-5">
        <div className="prose prose-invert prose-sm max-w-none
          prose-headings:text-zinc-100
          prose-p:text-zinc-300
          prose-strong:text-zinc-100
          prose-code:text-violet-300
          prose-code:bg-zinc-900
          prose-code:rounded
          prose-code:px-1
          prose-pre:bg-zinc-900
          prose-blockquote:border-violet-500
          prose-blockquote:text-zinc-400
          prose-a:text-violet-400
          prose-li:text-zinc-300
          prose-hr:border-zinc-700
        ">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {doc.markdown}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
