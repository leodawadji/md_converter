'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, PlayCircle, Play, Copy, Download, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, AlertCircle, Settings2, Timer,
} from 'lucide-react'
import type { TranscribeEvent, TranscriptOptions, TranscriptSegment } from '@/types/transcript'

type Step = 'idle' | 'download' | 'transcribe' | 'format' | 'done' | 'error'

interface Result {
  markdown: string
  title: string
  segments: TranscriptSegment[]
  elapsedSeconds: number
  source?: 'summarize' | 'whisperx'
}

const STEP_LABELS: Record<Step, string> = {
  idle: 'Aguardando',
  download: 'Baixando áudio...',
  transcribe: 'Transcrevendo...',
  format: 'Formatando markdown...',
  done: 'Concluído',
  error: 'Erro',
}

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m === 0) return `${sec}s`
  return `${m}m ${String(sec).padStart(2, '0')}s`
}

export default function TranscribePage() {
  const [url, setUrl] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showOptions, setShowOptions] = useState(false)

  // Elapsed timer
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  // Options
  const [modelSize, setModelSize] = useState<'tiny' | 'small' | 'medium'>('small')
  const [language, setLanguage] = useState('')
  const [minSpeakers, setMinSpeakers] = useState('')
  const [maxSpeakers, setMaxSpeakers] = useState('')
  const [speakerMapRaw, setSpeakerMapRaw] = useState('')
  const [includeTimestamps, setIncludeTimestamps] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const isRunning = step !== 'idle' && step !== 'done' && step !== 'error'

  const startTimer = () => {
    startTimeRef.current = Date.now()
    setElapsed(0)
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
  }

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => () => stopTimer(), [])

  const parseSpeakerMap = (raw: string): Record<string, string> | undefined => {
    if (!raw.trim()) return undefined
    const map: Record<string, string> = {}
    for (const pair of raw.split(',')) {
      const [k, v] = pair.split('=').map(s => s.trim())
      if (k && v) map[k] = v
    }
    return Object.keys(map).length > 0 ? map : undefined
  }

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || isRunning) return

    setStep('download')
    setStatusMsg('Verificando dependências...')
    setResult(null)
    setError('')
    startTimer()

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const body: Record<string, unknown> = { url: url.trim(), modelSize, includeTimestamps }
      if (language) body.language = language
      if (minSpeakers) body.minSpeakers = parseInt(minSpeakers)
      if (maxSpeakers) body.maxSpeakers = parseInt(maxSpeakers)
      const speakerMap = parseSpeakerMap(speakerMapRaw)
      if (speakerMap) body.speakerMap = speakerMap

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })

      if (!res.body) throw new Error('Resposta sem body.')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as TranscribeEvent
            if (event.type === 'progress') {
              setStep(event.step as Step)
              setStatusMsg(event.message)
            } else if (event.type === 'result') {
              const finalElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
              stopTimer()
              setResult({ markdown: event.markdown, title: event.title, segments: event.segments, elapsedSeconds: finalElapsed, source: event.source })
              setStep('done')
              setStatusMsg('')
            } else if (event.type === 'error') {
              stopTimer()
              setError(event.message)
              setStep('error')
              setStatusMsg('')
            }
          } catch {
            // ignore malformed SSE line
          }
        }
      }
    } catch (err) {
      stopTimer()
      if ((err as Error).name === 'AbortError') {
        setStep('idle')
        setStatusMsg('')
      } else {
        setError(err instanceof Error ? err.message : 'Erro desconhecido.')
        setStep('error')
      }
    }
  }, [url, modelSize, language, minSpeakers, maxSpeakers, speakerMapRaw, includeTimestamps, isRunning])

  const handleCancel = () => {
    stopTimer()
    abortRef.current?.abort()
  }

  const handleCopy = () => {
    if (!result) return
    navigator.clipboard.writeText(result.markdown).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleDownload = () => {
    if (!result) return
    const blob = new Blob([result.markdown], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${result.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'transcricao'}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Início
          </Link>
          <div className="w-px h-4 bg-zinc-700" />
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-red-600 rounded-lg flex items-center justify-center">
              <PlayCircle className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-zinc-100 leading-none">Transcrição YouTube</h1>
              <p className="text-xs text-zinc-500 leading-none mt-0.5">Diarização de falantes com WhisperX</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-2xl flex flex-col gap-6">

          {/* Input form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                disabled={isRunning}
                required
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500/60 disabled:opacity-50 transition-colors"
              />
              {isRunning ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!url.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Transcrever
                </button>
              )}
            </div>

            {/* Speakers — always visible, most impactful setting */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-zinc-400 shrink-0">Nº de falantes:</label>
              <div className="flex items-center gap-1">
                {[null, 1, 2, 3, 4, 5, 6].map(n => (
                  <button
                    key={n ?? 'auto'}
                    type="button"
                    disabled={isRunning}
                    onClick={() => {
                      setMinSpeakers(n ? String(n) : '')
                      setMaxSpeakers(n ? String(n) : '')
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${
                      (n === null ? !minSpeakers && !maxSpeakers : minSpeakers === String(n) && maxSpeakers === String(n))
                        ? 'bg-red-600 text-white'
                        : 'bg-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {n ?? 'auto'}
                  </button>
                ))}
              </div>
              <span className="text-xs text-zinc-600">
                {minSpeakers ? `Fixado em ${minSpeakers} — melhor precisão` : 'auto-detect — pode errar'}
              </span>
            </div>

            {/* Options toggle */}
            <button
              type="button"
              onClick={() => setShowOptions(v => !v)}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors self-start"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Opções avançadas
              {showOptions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showOptions && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-xl">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-400 font-medium">Modelo Whisper</label>
                  <select
                    value={modelSize}
                    onChange={e => setModelSize(e.target.value as typeof modelSize)}
                    disabled={isRunning}
                    className="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-red-500/60 disabled:opacity-50"
                  >
                    <option value="tiny">tiny — rápido, qualidade baixa</option>
                    <option value="small">small — recomendado (padrão)</option>
                    <option value="medium">medium — mais lento, melhor qualidade</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-400 font-medium">Idioma (opcional)</label>
                  <input
                    type="text"
                    value={language}
                    onChange={e => setLanguage(e.target.value)}
                    placeholder="pt, en, es... (auto-detect)"
                    disabled={isRunning}
                    className="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500/60 disabled:opacity-50"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-400 font-medium">Mín. falantes</label>
                  <input type="number" min={1} value={minSpeakers} onChange={e => setMinSpeakers(e.target.value)}
                    placeholder="ex: 2" disabled={isRunning}
                    className="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500/60 disabled:opacity-50" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-400 font-medium">Máx. falantes</label>
                  <input type="number" min={1} value={maxSpeakers} onChange={e => setMaxSpeakers(e.target.value)}
                    placeholder="ex: 4" disabled={isRunning}
                    className="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500/60 disabled:opacity-50" />
                </div>

                <div className="sm:col-span-2 flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-400 font-medium">Nomes dos falantes (opcional)</label>
                  <input
                    type="text"
                    value={speakerMapRaw}
                    onChange={e => setSpeakerMapRaw(e.target.value)}
                    placeholder="SPEAKER_00=Entrevistador,SPEAKER_01=Convidado"
                    disabled={isRunning}
                    className="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500/60 disabled:opacity-50"
                  />
                  <p className="text-xs text-zinc-600">Formato: SPEAKER_00=Nome1,SPEAKER_01=Nome2</p>
                </div>

                <div className="sm:col-span-2 flex items-center gap-2.5">
                  <input type="checkbox" id="timestamps" checked={includeTimestamps}
                    onChange={e => setIncludeTimestamps(e.target.checked)} disabled={isRunning}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 accent-red-500" />
                  <label htmlFor="timestamps" className="text-sm text-zinc-400 cursor-pointer">
                    Incluir timestamps no markdown
                  </label>
                </div>
              </div>
            )}
          </form>

          {/* Progress + timer */}
          {isRunning && (
            <div className="flex items-center gap-3 p-4 bg-zinc-800/60 border border-zinc-700 rounded-xl">
              <Loader2 className="w-5 h-5 text-red-400 animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-200">{STEP_LABELS[step]}</p>
                  <div className="flex items-center gap-1 text-xs text-zinc-500 shrink-0">
                    <Timer className="w-3.5 h-3.5" />
                    <span className="font-mono">{formatElapsed(elapsed)}</span>
                  </div>
                </div>
                {statusMsg && <p className="text-xs text-zinc-500 mt-0.5 truncate">{statusMsg}</p>}
              </div>
            </div>
          )}

          {/* Error */}
          {step === 'error' && error && (
            <div className="flex items-start gap-3 p-4 bg-red-950/40 border border-red-800/50 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300">Erro na transcrição</p>
                <pre className="text-xs text-red-400/80 mt-1.5 whitespace-pre-wrap font-mono">{error}</pre>
              </div>
            </div>
          )}

          {/* Result */}
          {step === 'done' && result && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">Transcrição concluída</span>
                  <span className="text-zinc-600">·</span>
                  {result.source === 'summarize' ? (
                    <span className="text-zinc-400 text-xs">via legenda</span>
                  ) : (
                    <span className="text-zinc-400 text-xs">{result.segments.length} segmentos · WhisperX</span>
                  )}
                  <span className="text-zinc-600">·</span>
                  <span className="flex items-center gap-1 text-zinc-400 text-xs">
                    <Timer className="w-3 h-3" />
                    {formatElapsed(result.elapsedSeconds)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors">
                    <Copy className="w-3.5 h-3.5" />
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                  <button onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors">
                    <Download className="w-3.5 h-3.5" />
                    Baixar .md
                  </button>
                </div>
              </div>

              <pre className="w-full bg-zinc-800/70 border border-zinc-700 rounded-xl p-4 text-xs text-zinc-300 font-mono whitespace-pre-wrap overflow-auto max-h-[60vh]">
                {result.markdown}
              </pre>
            </div>
          )}

          {/* Info hint */}
          {step === 'idle' && (
            <div className="p-4 bg-zinc-800/30 border border-zinc-800 rounded-xl text-xs text-zinc-500 leading-relaxed">
              <p className="font-medium text-zinc-400 mb-1.5">Como funciona</p>
              <p>
                Tenta extrair a legenda disponível no YouTube automaticamente (rápido, sem download de áudio).
                Se não houver legenda, baixa o áudio e transcreve com WhisperX localmente.
              </p>
              <p className="mt-2">
                Para diarização de falantes com WhisperX, configure <code className="text-zinc-400">HF_TOKEN</code> no <code className="text-zinc-400">.env.local</code>.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
