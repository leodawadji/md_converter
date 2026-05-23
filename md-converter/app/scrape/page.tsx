'use client'
import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Globe, Link2, Copy, Download, Loader2, CheckCircle2, AlertCircle, ShieldOff } from 'lucide-react'
import type { GuardrailResult } from '@/types'

interface ScrapeResult {
  markdown: string
  title: string
  byline?: string
  url: string
  analysis: GuardrailResult
  source?: 'ladder' | 'summarize' | 'cheerio'
}

const SOURCE_LABEL: Record<string, string> = {
  ladder: 'via Ladder',
  summarize: 'via summarize.sh',
  cheerio: 'via cheerio',
}

export default function ScrapePage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScrapeResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [useLadder, setUseLadder] = useState(false)
  const [ladderAvailable, setLadderAvailable] = useState(false)

  useEffect(() => {
    fetch('/api/scrape')
      .then(r => r.json())
      .then(d => setLadderAvailable(!!d.ladderAvailable))
      .catch(() => {})
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed || loading) return

    setLoading(true)
    setResult(null)
    setError('')

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, useLadder }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao buscar a página.')
      } else {
        setResult(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro de rede.')
    } finally {
      setLoading(false)
    }
  }, [url, loading, useLadder])

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
    const slug = result.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'pagina'
    a.download = `${slug}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const tokenColor =
    !result ? '' :
    result.analysis.tokenLevel === 'ok' ? 'text-emerald-400' :
    result.analysis.tokenLevel === 'warn' ? 'text-amber-400' : 'text-red-400'

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
            <div className="w-7 h-7 bg-sky-600 rounded-lg flex items-center justify-center">
              <Globe className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-zinc-100 leading-none">Conversor de Sites</h1>
              <p className="text-xs text-zinc-500 leading-none mt-0.5">Extrai conteúdo web em Markdown</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-2xl flex flex-col gap-6">

          {/* Input form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://exemplo.com/artigo"
                  disabled={loading}
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-sky-500/60 disabled:opacity-50 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={!url.trim() || loading}
                className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition-colors shrink-0"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</>
                  : <><Globe className="w-4 h-4" /> Converter</>
                }
              </button>
            </div>

            {/* Ladder toggle */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-600">
                Funciona com artigos, posts de blog e páginas com conteúdo estático.
              </p>

              <button
                type="button"
                onClick={() => setUseLadder(v => !v)}
                disabled={loading}
                title={
                  ladderAvailable
                    ? 'Usar Ladder para contornar paywalls'
                    : 'Defina LADDER_URL em .env.local para ativar'
                }
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 border ${
                  useLadder
                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-400'
                    : ladderAvailable
                      ? 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                      : 'bg-zinc-800/50 border-zinc-800 text-zinc-700 cursor-not-allowed'
                }`}
              >
                <ShieldOff className="w-3.5 h-3.5" />
                {useLadder ? 'Ladder ativo' : 'Paywall bypass'}
                {!ladderAvailable && <span className="text-zinc-800 ml-0.5">·</span>}
                {!ladderAvailable && <span className="text-zinc-700">não configurado</span>}
              </button>
            </div>

            {useLadder && (
              <p className="text-xs text-orange-400/70 bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2">
                Ladder ativo — o request será roteado pelo proxy local para contornar restrições de acesso.
                Use apenas para fins de pesquisa e respeite os termos de uso dos sites.
              </p>
            )}
          </form>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-950/40 border border-red-800/50 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300">Erro ao buscar a página</p>
                <p className="text-xs text-red-400/80 mt-1 whitespace-pre-wrap">{error}</p>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="font-medium truncate max-w-xs">{result.title}</span>
                  </div>
                  {result.byline && (
                    <p className="text-xs text-zinc-500 ml-6">{result.byline}</p>
                  )}
                  <div className="flex items-center gap-2 ml-6">
                    <p className={`text-xs ${tokenColor}`}>
                      ~{result.analysis.tokenEstimate.toLocaleString()} tokens estimados
                    </p>
                    {result.source && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span className={`text-xs ${result.source === 'ladder' ? 'text-orange-400' : 'text-zinc-600'}`}>
                          {SOURCE_LABEL[result.source] ?? result.source}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar .md
                  </button>
                </div>
              </div>

              {result.analysis.warnings.length > 0 && (
                <div className="flex flex-col gap-1 p-3 bg-amber-950/30 border border-amber-800/40 rounded-lg">
                  {result.analysis.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-400">⚠ {w}</p>
                  ))}
                </div>
              )}

              <pre className="w-full bg-zinc-800/70 border border-zinc-700 rounded-xl p-4 text-xs text-zinc-300 font-mono whitespace-pre-wrap overflow-auto max-h-[60vh]">
                {result.markdown}
              </pre>
            </div>
          )}

          {/* Info box when idle */}
          {!result && !error && !loading && (
            <div className="p-4 bg-zinc-800/30 border border-zinc-800 rounded-xl text-xs text-zinc-500 leading-relaxed">
              <p className="font-medium text-zinc-400 mb-2">Como funciona</p>
              <ul className="space-y-1.5 list-disc list-inside">
                <li>Cole a URL de qualquer artigo, post ou documentação pública</li>
                <li>O conteúdo principal é extraído e convertido em Markdown limpo</li>
                <li>Links, imagens e elementos desnecessários são removidos automaticamente</li>
                <li>O Markdown gerado é otimizado para contexto em modelos de linguagem</li>
                {ladderAvailable && (
                  <li className="text-orange-400/70">
                    Ladder configurado — ative o toggle <span className="font-medium">Paywall bypass</span> para sites com paywall
                  </li>
                )}
                {!ladderAvailable && (
                  <li>
                    Para sites com paywall, configure <code className="text-zinc-400">LADDER_URL</code> em <code className="text-zinc-400">.env.local</code> e rode o Ladder localmente
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
