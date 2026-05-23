'use client'
import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, Clipboard, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ParsedDocument } from '@/types'

interface ImportZoneProps {
  onDocumentAdded: (doc: ParsedDocument) => void
}

export default function ImportZone({ onDocumentAdded }: ImportZoneProps) {
  const [loading, setLoading] = useState(false)
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const processFile = useCallback(async (file: File) => {
    setLoading(true)
    setError(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/parse', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const doc: ParsedDocument = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ''),
        originalName: data.originalName,
        fileType: data.fileType,
        rawText: data.rawText,
        markdown: data.markdown,
        analysis: data.analysis,
        enrichment: data.enrichment,
        selected: false,
        createdAt: new Date().toISOString(),
      }
      onDocumentAdded(doc)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao processar arquivo.')
    } finally {
      setLoading(false)
    }
  }, [onDocumentAdded])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(processFile)
  }, [processFile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    multiple: true,
    disabled: loading,
  })

  const handlePasteSubmit = async () => {
    if (!pasteText.trim()) return
    setLoading(true)
    setError(null)
    const formData = new FormData()
    formData.append('text', pasteText)
    try {
      const res = await fetch('/api/parse', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const doc: ParsedDocument = {
        id: crypto.randomUUID(),
        name: `Texto ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
        originalName: 'Texto colado',
        fileType: 'paste',
        rawText: data.rawText,
        markdown: data.markdown,
        analysis: data.analysis,
        enrichment: data.enrichment,
        selected: false,
        createdAt: new Date().toISOString(),
      }
      onDocumentAdded(doc)
      setPasteText('')
      setPasteMode(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao processar texto.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {!pasteMode ? (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
            isDragActive
              ? 'border-violet-500 bg-violet-500/10'
              : 'border-zinc-700 hover:border-violet-500/60 hover:bg-zinc-800/50',
            loading && 'opacity-50 cursor-not-allowed'
          )}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-3">
            {loading ? (
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            ) : (
              <Upload className="w-8 h-8 text-zinc-400" />
            )}
            <div>
              <p className="text-sm font-medium text-zinc-200">
                {loading ? 'Processando...' : isDragActive ? 'Solte os arquivos aqui' : 'Arraste arquivos ou clique para selecionar'}
              </p>
              <p className="text-xs text-zinc-500 mt-1">.txt, .pdf, .docx — múltiplos arquivos suportados</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="Cole seu texto aqui..."
            className="w-full h-40 bg-zinc-800 border border-zinc-700 rounded-xl p-3 text-sm text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none focus:border-violet-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handlePasteSubmit}
              disabled={!pasteText.trim() || loading}
              className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {loading ? 'Processando...' : 'Converter'}
            </button>
            <button
              onClick={() => { setPasteMode(false); setPasteText('') }}
              className="px-4 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!pasteMode && (
        <button
          onClick={() => setPasteMode(true)}
          className="w-full flex items-center justify-center gap-2 text-xs text-zinc-400 hover:text-violet-400 py-2 transition-colors"
        >
          <Clipboard className="w-3.5 h-3.5" />
          Colar texto diretamente
        </button>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  )
}
