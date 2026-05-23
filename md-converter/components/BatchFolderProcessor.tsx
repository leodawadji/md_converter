'use client'
import { useRef, useState, useCallback } from 'react'
import JSZip from 'jszip'
import {
  FolderOpen, X, FileText, Layers, List, ChevronRight,
  Loader2, Download, Package, AlertCircle, CheckCircle2, Trash2,
} from 'lucide-react'
import type { ParsedDocument } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'individual' | 'group'
type GroupMethod = 'type' | 'prefix' | 'manual'

interface FileEntry {
  file: File
  ext: string
  baseName: string
  group: string // computed or manual
}

interface ProcessedResult {
  name: string
  markdown: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUPPORTED_EXTS = ['txt', 'pdf', 'docx']

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9_\-\u00C0-\u024F]/g, '_').slice(0, 60)
}

function getExt(file: File) {
  return (file.name.split('.').pop() ?? '').toLowerCase()
}

function getBaseName(file: File) {
  return file.name.replace(/\.[^.]+$/, '')
}

function groupByType(entries: FileEntry[]): FileEntry[] {
  return entries.map(e => ({ ...e, group: e.ext.toUpperCase() }))
}

function groupByPrefix(entries: FileEntry[], delimiter: string): FileEntry[] {
  return entries.map(e => {
    const idx = e.baseName.indexOf(delimiter)
    const group = idx > 0 ? e.baseName.slice(0, idx) : e.baseName
    return { ...e, group }
  })
}

async function parseFile(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/parse', { method: 'POST', body: formData })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Erro ao processar arquivo.')
  return data.markdown as string
}

function buildFrontmatter(names: string[]): string {
  return [
    '---',
    `source: "${names.join(', ')}"`,
    `created: ${new Date().toISOString().slice(0, 10)}`,
    '---',
    '',
  ].join('\n')
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BatchFolderProcessor() {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [mode, setMode] = useState<Mode>('individual')
  const [groupMethod, setGroupMethod] = useState<GroupMethod>('type')
  const [delimiter, setDelimiter] = useState('_')
  const [manualGroups, setManualGroups] = useState<Record<string, string>>({})

  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' })
  const [results, setResults] = useState<ProcessedResult[]>([])
  const [errors, setErrors] = useState<string[]>([])

  const inputRef = useRef<HTMLInputElement>(null)

  // ── Derived ──────────────────────────────────────────────────────────────────

  const computedEntries: FileEntry[] = entries.map(e => {
    if (mode === 'individual') return e
    if (groupMethod === 'type') return { ...e, group: e.ext.toUpperCase() }
    if (groupMethod === 'prefix') {
      const idx = e.baseName.indexOf(delimiter)
      return { ...e, group: idx > 0 ? e.baseName.slice(0, idx) : e.baseName }
    }
    // manual
    return { ...e, group: manualGroups[e.file.name] ?? 'Grupo 1' }
  })

  const groups = mode === 'group'
    ? [...new Set(computedEntries.map(e => e.group))].sort()
    : []

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleFolderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const valid = files.filter(f => SUPPORTED_EXTS.includes(getExt(f)))
    const newEntries: FileEntry[] = valid.map(f => ({
      file: f,
      ext: getExt(f),
      baseName: getBaseName(f),
      group: 'Grupo 1',
    }))
    setEntries(newEntries)
    setManualGroups(Object.fromEntries(newEntries.map(e => [e.file.name, 'Grupo 1'])))
    setResults([])
    setErrors([])
    if (e.target) e.target.value = ''
  }, [])

  const handleProcess = useCallback(async () => {
    if (computedEntries.length === 0) return
    setProcessing(true)
    setResults([])
    setErrors([])

    if (mode === 'individual') {
      const total = computedEntries.length
      setProgress({ done: 0, total, current: '' })
      const out: ProcessedResult[] = []
      const errs: string[] = []

      for (let i = 0; i < computedEntries.length; i++) {
        const e = computedEntries[i]
        setProgress({ done: i, total, current: e.file.name })
        try {
          const markdown = await parseFile(e.file)
          out.push({ name: sanitize(e.baseName), markdown })
        } catch (err) {
          errs.push(`${e.file.name}: ${err instanceof Error ? err.message : 'Erro'}`)
        }
      }

      setProgress({ done: total, total, current: '' })
      setResults(out)
      setErrors(errs)
    } else {
      // Group mode: process each file, then merge by group
      const total = computedEntries.length
      setProgress({ done: 0, total, current: '' })
      const grouped: Record<string, { name: string; markdown: string }[]> = {}
      const errs: string[] = []

      for (let i = 0; i < computedEntries.length; i++) {
        const e = computedEntries[i]
        setProgress({ done: i, total, current: e.file.name })
        try {
          const markdown = await parseFile(e.file)
          if (!grouped[e.group]) grouped[e.group] = []
          grouped[e.group].push({ name: e.file.name, markdown })
        } catch (err) {
          errs.push(`${e.file.name}: ${err instanceof Error ? err.message : 'Erro'}`)
        }
      }

      setProgress({ done: total, total, current: '' })
      const out: ProcessedResult[] = Object.entries(grouped).map(([groupName, items]) => {
        const names = items.map(i => i.name)
        const merged = buildFrontmatter(names) +
          items.map((item, idx) =>
            idx === 0
              ? item.markdown
              : `\n\n---\n\n## ${item.name.replace(/\.[^.]+$/, '')}\n\n${item.markdown}`
          ).join('')
        return { name: sanitize(groupName), markdown: merged }
      })

      setResults(out)
      setErrors(errs)
    }

    setProcessing(false)
  }, [computedEntries, mode])

  const handleDownload = useCallback(async () => {
    if (results.length === 0) return
    if (results.length === 1) {
      const blob = new Blob([results[0].markdown], { type: 'text/markdown' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${results[0].name}.md`
      a.click()
      URL.revokeObjectURL(a.href)
      return
    }
    const zip = new JSZip()
    const used = new Set<string>()
    results.forEach(r => {
      let fname = `${r.name}.md`
      let n = 1
      while (used.has(fname)) fname = `${r.name}_${n++}.md`
      used.add(fname)
      zip.file(fname, r.markdown)
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'lote_markdown.zip'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [results])

  const reset = () => {
    setEntries([])
    setManualGroups({})
    setResults([])
    setErrors([])
    setMode('individual')
    setGroupMethod('type')
    setProgress({ done: 0, total: 0, current: '' })
  }

  const done = !processing && results.length > 0
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => { reset(); setOpen(true) }}
        className="w-full flex items-center justify-center gap-2 text-xs text-zinc-400 hover:text-violet-400 py-2 transition-colors"
      >
        <FolderOpen className="w-3.5 h-3.5" />
        Processar pasta inteira
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-violet-600/20 border border-violet-500/30 rounded-lg flex items-center justify-center">
                  <FolderOpen className="w-4 h-4 text-violet-400" />
                </div>
                <h2 className="text-sm font-semibold text-zinc-100">Processar pasta inteira</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Step 1: Select folder */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  1. Selecionar pasta
                </h3>
                <div className="flex items-center gap-3">
                  <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFolderChange}
                    multiple
                    // @ts-expect-error — webkitdirectory is non-standard but widely supported
                    webkitdirectory=""
                    directory=""
                  />
                  <button
                    onClick={() => inputRef.current?.click()}
                    disabled={processing}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 text-sm rounded-lg transition-colors"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Selecionar pasta
                  </button>

                  {entries.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>
                        <strong className="text-zinc-200">{entries.length}</strong> arquivo{entries.length !== 1 ? 's' : ''} compatível{entries.length !== 1 ? 'is' : ''} encontrado{entries.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-500">
                        {[...new Set(entries.map(e => e.ext))].map(x => `.${x}`).join(' ')}
                      </span>
                      <button onClick={reset} className="text-zinc-600 hover:text-red-400 transition-colors ml-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {entries.length > 0 && (
                  <div className="max-h-28 overflow-y-auto rounded-xl border border-zinc-800 divide-y divide-zinc-800">
                    {entries.map(e => (
                      <div key={e.file.name} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                        <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        <span className="text-zinc-400 truncate flex-1">{e.file.name}</span>
                        <span className="text-zinc-600 shrink-0">{(e.file.size / 1024).toFixed(0)} KB</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Step 2: Output mode */}
              {entries.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    2. Modo de saída
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Option A — individual */}
                    <button
                      onClick={() => setMode('individual')}
                      className={`flex flex-col gap-2 p-4 rounded-xl border text-left transition-all ${
                        mode === 'individual'
                          ? 'border-violet-500/60 bg-violet-500/10'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <List className={`w-4 h-4 ${mode === 'individual' ? 'text-violet-400' : 'text-zinc-500'}`} />
                        <span className="text-sm font-medium text-zinc-200">Um MD por arquivo</span>
                      </div>
                      <p className="text-xs text-zinc-500">
                        Gera um arquivo <code className="text-zinc-400">.md</code> separado para cada arquivo da pasta. Exportado como <code className="text-zinc-400">.zip</code>.
                      </p>
                    </button>

                    {/* Option B — group */}
                    <button
                      onClick={() => setMode('group')}
                      className={`flex flex-col gap-2 p-4 rounded-xl border text-left transition-all ${
                        mode === 'group'
                          ? 'border-violet-500/60 bg-violet-500/10'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Layers className={`w-4 h-4 ${mode === 'group' ? 'text-violet-400' : 'text-zinc-500'}`} />
                        <span className="text-sm font-medium text-zinc-200">Agrupar arquivos</span>
                      </div>
                      <p className="text-xs text-zinc-500">
                        Agrupa arquivos e gera um <code className="text-zinc-400">.md</code> por grupo, com os conteúdos concatenados.
                      </p>
                    </button>
                  </div>

                  {/* Group options */}
                  {mode === 'group' && (
                    <div className="space-y-3 p-4 bg-zinc-800/40 border border-zinc-800 rounded-xl">
                      <p className="text-xs font-medium text-zinc-400">Método de agrupamento</p>
                      <div className="flex flex-col gap-2">

                        {/* By type */}
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input type="radio" name="gm" value="type" checked={groupMethod === 'type'} onChange={() => setGroupMethod('type')} className="mt-0.5 accent-violet-500" />
                          <div>
                            <p className="text-sm text-zinc-200">Por tipo de arquivo</p>
                            <p className="text-xs text-zinc-500">Todos os PDFs juntos, todos os DOCX juntos, etc.</p>
                          </div>
                        </label>

                        {/* By prefix */}
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input type="radio" name="gm" value="prefix" checked={groupMethod === 'prefix'} onChange={() => setGroupMethod('prefix')} className="mt-0.5 accent-violet-500" />
                          <div className="flex-1">
                            <p className="text-sm text-zinc-200">Por prefixo do nome</p>
                            <p className="text-xs text-zinc-500 mb-2">Ex: <code>relatorio_jan.pdf</code> e <code>relatorio_fev.pdf</code> → grupo <code>relatorio</code></p>
                            {groupMethod === 'prefix' && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-zinc-400">Separador:</span>
                                <input
                                  type="text"
                                  value={delimiter}
                                  onChange={e => setDelimiter(e.target.value || '_')}
                                  maxLength={3}
                                  className="w-14 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 text-center focus:outline-none focus:border-violet-500"
                                />
                              </div>
                            )}
                          </div>
                        </label>

                        {/* Manual */}
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input type="radio" name="gm" value="manual" checked={groupMethod === 'manual'} onChange={() => setGroupMethod('manual')} className="mt-0.5 accent-violet-500" />
                          <div>
                            <p className="text-sm text-zinc-200">Manual</p>
                            <p className="text-xs text-zinc-500">Defina o grupo de cada arquivo individualmente.</p>
                          </div>
                        </label>
                      </div>

                      {/* Manual group editor */}
                      {groupMethod === 'manual' && (
                        <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-zinc-700 divide-y divide-zinc-800">
                          {entries.map(e => (
                            <div key={e.file.name} className="flex items-center gap-3 px-3 py-2">
                              <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                              <span className="text-xs text-zinc-400 truncate flex-1">{e.file.name}</span>
                              <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                              <input
                                type="text"
                                value={manualGroups[e.file.name] ?? 'Grupo 1'}
                                onChange={ev => setManualGroups(prev => ({ ...prev, [e.file.name]: ev.target.value || 'Grupo 1' }))}
                                className="w-28 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-violet-500 text-right"
                                placeholder="Grupo 1"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Group preview */}
                      {groups.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {groups.map(g => (
                            <span key={g} className="text-xs px-2.5 py-1 bg-zinc-700 text-zinc-300 rounded-lg">
                              {g} ({computedEntries.filter(e => e.group === g).length} arq.)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* Progress */}
              {processing && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                      <span>{progress.current || 'Processando...'}</span>
                    </div>
                    <span>{progress.done}/{progress.total}</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </section>
              )}

              {/* Errors */}
              {errors.length > 0 && (
                <section className="space-y-1.5">
                  {errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{err}</span>
                    </div>
                  ))}
                </section>
              )}

              {/* Results summary */}
              {done && (
                <section className="flex items-center gap-3 p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-xs text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>{results.length}</strong> arquivo{results.length !== 1 ? 's' : ''} MD gerado{results.length !== 1 ? 's' : ''} com sucesso.
                    {errors.length > 0 && <span className="text-amber-400 ml-2">({errors.length} com erro)</span>}
                  </span>
                </section>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800 shrink-0 gap-3">
              <button
                onClick={() => setOpen(false)}
                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Fechar
              </button>

              <div className="flex items-center gap-2">
                {done && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {results.length > 1 ? <Package className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                    {results.length > 1 ? `Baixar ${results.length} arquivos (.zip)` : `Baixar ${results[0].name}.md`}
                  </button>
                )}

                {!done && (
                  <button
                    onClick={handleProcess}
                    disabled={entries.length === 0 || processing}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {processing
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Processando...</>
                      : <><FileText className="w-4 h-4" /> Processar {entries.length > 0 ? `${entries.length} arquivos` : 'pasta'}</>
                    }
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
