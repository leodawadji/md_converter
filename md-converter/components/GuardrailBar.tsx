'use client'
import { AlertTriangle, CheckCircle, XCircle, Zap, Layers, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GuardrailResult } from '@/types'

interface GuardrailBarProps {
  analysis: GuardrailResult
  compact?: boolean
}

const levelColors = {
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  critical: 'text-red-400',
}

const levelBg = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  critical: 'bg-red-400',
}

const levelLabel = {
  ok: 'OK',
  warn: 'Atenção',
  critical: 'Crítico',
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

export default function GuardrailBar({ analysis, compact = false }: GuardrailBarProps) {
  const { tokenEstimate, tokenLevel, qualityScore, densityScore, structureScore, warnings, suggestions } = analysis

  const tokenPercent = Math.min((tokenEstimate / 8000) * 100, 100)
  const qualityColor = qualityScore >= 70 ? 'bg-emerald-400' : qualityScore >= 40 ? 'bg-amber-400' : 'bg-red-400'

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className={cn('font-mono font-bold', levelColors[tokenLevel])}>
          ~{tokenEstimate.toLocaleString()} tok
        </span>
        <span className="text-zinc-600">|</span>
        <span className={cn('font-medium', qualityScore >= 70 ? 'text-emerald-400' : qualityScore >= 40 ? 'text-amber-400' : 'text-red-400')}>
          Q: {qualityScore}
        </span>
        {warnings.length > 0 && <AlertTriangle className="w-3 h-3 text-amber-400" />}
      </div>
    )
  }

  return (
    <div className="space-y-3 p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
      {/* Token meter */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs text-zinc-400">Tokens estimados</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn('text-xs font-mono font-bold', levelColors[tokenLevel])}>
              ~{tokenEstimate.toLocaleString()}
            </span>
            <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', levelColors[tokenLevel],
              tokenLevel === 'ok' ? 'bg-emerald-400/10' : tokenLevel === 'warn' ? 'bg-amber-400/10' : 'bg-red-400/10'
            )}>
              {levelLabel[tokenLevel]}
            </span>
          </div>
        </div>
        <div className="w-full h-2 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', levelBg[tokenLevel])}
            style={{ width: `${tokenPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-zinc-600">
          <span>0</span>
          <span>4k ideal</span>
          <span>8k limite</span>
        </div>
      </div>

      {/* Quality scores */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 flex items-center gap-1"><Star className="w-3 h-3" />Qualidade</span>
            <span className="text-xs font-bold text-zinc-300">{qualityScore}</span>
          </div>
          <ScoreBar value={qualityScore} color={qualityColor} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Densidade</span>
            <span className="text-xs font-bold text-zinc-300">{densityScore}</span>
          </div>
          <ScoreBar value={densityScore} color={densityScore >= 60 ? 'bg-emerald-400' : 'bg-amber-400'} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 flex items-center gap-1"><Layers className="w-3 h-3" />Estrutura</span>
            <span className="text-xs font-bold text-zinc-300">{structureScore}</span>
          </div>
          <ScoreBar value={structureScore} color={structureScore >= 60 ? 'bg-emerald-400' : 'bg-amber-400'} />
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-amber-300 bg-amber-400/5 border border-amber-400/10 rounded-lg px-2 py-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-1">
          {suggestions.map((s, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-sky-300 bg-sky-400/5 border border-sky-400/10 rounded-lg px-2 py-1.5">
              <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" />
              {s}
            </div>
          ))}
        </div>
      )}

      {warnings.length === 0 && suggestions.length === 0 && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle className="w-3.5 h-3.5" />
          Documento dentro dos parâmetros ideais
        </div>
      )}
    </div>
  )
}
