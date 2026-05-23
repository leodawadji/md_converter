'use client'
import { Merge, Trash2 } from 'lucide-react'
import type { ParsedDocument } from '@/types'
import DocumentCard from './DocumentCard'
import ImportZone from './ImportZone'
import BatchFolderProcessor from './BatchFolderProcessor'

interface DocumentListProps {
  documents: ParsedDocument[]
  activeId: string | null
  onSetActive: (id: string) => void
  onDocumentAdded: (doc: ParsedDocument) => void
  onDocumentDeleted: (id: string) => void
  onToggleSelect: (id: string) => void
  onMergeSelected: () => void
  onSplit: (docId: string, charIndex: number) => void
}

export default function DocumentList({
  documents,
  activeId,
  onSetActive,
  onDocumentAdded,
  onDocumentDeleted,
  onToggleSelect,
  onMergeSelected,
  onSplit,
}: DocumentListProps) {
  const selectedCount = documents.filter(d => d.selected).length

  return (
    <div className="flex flex-col h-full gap-4">
      <ImportZone onDocumentAdded={onDocumentAdded} />
      <BatchFolderProcessor />

      {documents.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Documentos ({documents.length})
            </h2>
            {selectedCount >= 2 && (
              <button
                onClick={onMergeSelected}
                className="flex items-center gap-1.5 text-xs bg-violet-600 hover:bg-violet-500 text-white px-2.5 py-1 rounded-lg transition-colors"
              >
                <Merge className="w-3 h-3" />
                Mesclar {selectedCount}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-1">
            {documents.map(doc => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                isActive={doc.id === activeId}
                onSelect={() => onSetActive(doc.id)}
                onDelete={() => onDocumentDeleted(doc.id)}
                onToggleCheck={() => onToggleSelect(doc.id)}
                onSplit={(charIndex) => onSplit(doc.id, charIndex)}
              />
            ))}
          </div>
        </>
      )}

      {documents.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-center">
          <p className="text-xs text-zinc-600">Nenhum documento importado ainda.</p>
        </div>
      )}
    </div>
  )
}
