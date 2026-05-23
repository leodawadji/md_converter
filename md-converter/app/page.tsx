'use client'
import Link from 'next/link'
import { FileText, PlayCircle, Globe, ArrowRight, Sparkles } from 'lucide-react'

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-zinc-100 leading-none">Ferramentas IA</h1>
            <p className="text-xs text-zinc-500 leading-none mt-0.5">Contexto otimizado para modelos de linguagem</p>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-zinc-100 mb-3">
            O que você quer fazer?
          </h2>
          <p className="text-zinc-400 text-base max-w-md">
            Escolha uma das ferramentas abaixo para preparar conteúdo para uso com IAs.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-4xl">
          {/* MD Converter */}
          <Link
            href="/converter"
            className="group relative flex flex-col gap-4 p-6 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700 hover:border-violet-500/60 rounded-xl transition-all duration-200"
          >
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 bg-violet-600/20 border border-violet-500/30 rounded-xl flex items-center justify-center group-hover:bg-violet-600/30 transition-colors">
                <FileText className="w-6 h-6 text-violet-400" />
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all" />
            </div>

            <div>
              <h3 className="text-base font-semibold text-zinc-100 mb-1.5">
                Conversor de Documentos
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Converta PDFs, DOCX e textos em Markdown otimizado para janelas de contexto de IAs.
                Análise de qualidade em tempo real.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 mt-auto">
              {['PDF', 'DOCX', 'TXT', 'Markdown'].map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 bg-zinc-700 text-zinc-400 rounded-md">
                  {tag}
                </span>
              ))}
            </div>
          </Link>

          {/* YouTube Transcriber */}
          <Link
            href="/transcribe"
            className="group relative flex flex-col gap-4 p-6 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700 hover:border-red-500/60 rounded-xl transition-all duration-200"
          >
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 bg-red-600/20 border border-red-500/30 rounded-xl flex items-center justify-center group-hover:bg-red-600/30 transition-colors">
                <PlayCircle className="w-6 h-6 text-red-400" />
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-red-400 group-hover:translate-x-0.5 transition-all" />
            </div>

            <div>
              <h3 className="text-base font-semibold text-zinc-100 mb-1.5">
                Transcrição de YouTube
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Transcreva vídeos do YouTube com identificação de falantes (diarização).
                Gera markdown formatado como diálogo.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 mt-auto">
              {['WhisperX', 'Diarização', 'Markdown', 'CPU'].map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 bg-zinc-700 text-zinc-400 rounded-md">
                  {tag}
                </span>
              ))}
            </div>
          </Link>

          {/* Web Scraper */}
          <Link
            href="/scrape"
            className="group relative flex flex-col gap-4 p-6 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700 hover:border-sky-500/60 rounded-xl transition-all duration-200"
          >
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 bg-sky-600/20 border border-sky-500/30 rounded-xl flex items-center justify-center group-hover:bg-sky-600/30 transition-colors">
                <Globe className="w-6 h-6 text-sky-400" />
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-sky-400 group-hover:translate-x-0.5 transition-all" />
            </div>

            <div>
              <h3 className="text-base font-semibold text-zinc-100 mb-1.5">
                Conversor de Sites
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Cole a URL de qualquer artigo ou página e obtenha o conteúdo em Markdown
                limpo, pronto para contexto de IA.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 mt-auto">
              {['URL', 'Cheerio', 'Markdown', 'Sem login'].map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 bg-zinc-700 text-zinc-400 rounded-md">
                  {tag}
                </span>
              ))}
            </div>
          </Link>
        </div>

        {/* Footer note */}
        <p className="mt-12 text-xs text-zinc-600 text-center">
          Processamento local — nenhum dado é enviado para servidores externos.
        </p>
      </main>
    </div>
  )
}
