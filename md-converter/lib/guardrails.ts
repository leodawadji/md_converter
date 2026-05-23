import type { GuardrailLevel, GuardrailResult, SplitSuggestion, DocumentType } from '@/types'
import { detectDocumentType } from './converter'

const CHARS_PER_TOKEN = 4
const TOKEN_OK = 4000
const TOKEN_WARN = 8000

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function getTokenLevel(tokens: number): GuardrailLevel {
  if (tokens <= TOKEN_OK) return 'ok'
  if (tokens <= TOKEN_WARN) return 'warn'
  return 'critical'
}

function calcDensityScore(text: string): number {
  const totalChars = text.length
  if (totalChars === 0) return 0
  const usefulChars = text.replace(/\s+/g, ' ').trim().length
  const wordCount = text.trim().split(/\s+/).length
  const avgWordLen = usefulChars / wordCount
  const densityRatio = usefulChars / totalChars
  // Good density: ~70%+ useful chars, avg word len 4-8
  const densityPart = Math.min(densityRatio * 100, 100)
  const wordLenPart = avgWordLen >= 3 && avgWordLen <= 10 ? 100 : Math.max(0, 100 - Math.abs(avgWordLen - 5) * 20)
  return Math.round((densityPart * 0.6) + (wordLenPart * 0.4))
}

function calcStructureScore(text: string, docType: DocumentType): number {
  let score = 50 // base

  // Has headings
  if (/^#{1,3}\s/m.test(text)) score += 20
  // Has lists
  if (/^[-*\d]\s/m.test(text)) score += 15
  // Has paragraphs (multiple blank lines)
  if (/\n{2,}/.test(text)) score += 10
  // Penalize if no structure at all
  if (text.split('\n').length < 3) score -= 20
  // Bonus for known structure types
  if (docType !== 'generic') score += 5

  return Math.max(0, Math.min(100, score))
}

function detectDuplicates(text: string): boolean {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 50)
  if (paragraphs.length < 2) return false

  const seen = new Set<string>()
  for (const p of paragraphs) {
    // Simple fingerprint: first 100 chars normalized
    const fp = p.slice(0, 100).toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(fp)) return true
    seen.add(fp)
  }
  return false
}

function findSplitSuggestions(text: string, tokens: number): SplitSuggestion[] {
  if (tokens <= TOKEN_OK) return []

  const suggestions: SplitSuggestion[] = []
  const targetChars = TOKEN_OK * CHARS_PER_TOKEN
  const lines = text.split('\n')
  let charCount = 0

  for (let i = 0; i < lines.length; i++) {
    charCount += lines[i].length + 1

    if (charCount >= targetChars) {
      // Find nearest natural boundary (blank line or heading)
      let bestIdx = charCount
      let bestReason = 'limite de tamanho'
      let confidence = 0.6

      // Look backwards for a heading or blank line
      for (let j = i; j >= Math.max(0, i - 20); j--) {
        if (lines[j].trim() === '') {
          bestIdx = lines.slice(0, j + 1).join('\n').length
          bestReason = 'parágrafo vazio'
          confidence = 0.8
          break
        }
        if (/^#{1,3}\s/.test(lines[j].trim())) {
          bestIdx = lines.slice(0, j).join('\n').length
          bestReason = `início de seção: "${lines[j].trim().slice(0, 40)}"`
          confidence = 0.95
          break
        }
      }

      suggestions.push({ charIndex: bestIdx, reason: bestReason, confidence })
      charCount = 0 // reset counter for next chunk
    }
  }

  return suggestions
}

function buildWarnings(tokens: number, level: GuardrailLevel, hasDuplicates: boolean, density: number): string[] {
  const warnings: string[] = []
  if (level === 'warn') warnings.push(`Documento com ~${tokens.toLocaleString()} tokens — considere dividir em partes menores.`)
  if (level === 'critical') warnings.push(`Documento muito grande (~${tokens.toLocaleString()} tokens). Recomendado: <4.000 tokens por arquivo de contexto.`)
  if (hasDuplicates) warnings.push('Conteúdo duplicado detectado. Revise o documento para remover repetições.')
  if (density < 40) warnings.push('Baixa densidade de conteúdo — muitos espaços ou ruído no texto.')
  return warnings
}

function buildSuggestions(docType: DocumentType, structure: number, tokens: number): string[] {
  const suggestions: string[] = []
  if (structure < 50) suggestions.push('Adicionar cabeçalhos (##) para melhorar a navegabilidade pelo modelo de IA.')
  if (docType === 'email') suggestions.push('Emails detectados — considere agrupar por remetente ou assunto.')
  if (docType === 'log') suggestions.push('Log detectado — agrupar por data ou evento pode melhorar a recuperação de contexto.')
  if (tokens > TOKEN_OK * 0.8) suggestions.push('Próximo do limite ideal — revise se há seções dispensáveis.')
  return suggestions
}

export function analyzeDocument(text: string, overrideDocType?: DocumentType): GuardrailResult {
  const tokens = estimateTokens(text)
  const level = getTokenLevel(tokens)
  const docType = overrideDocType ?? detectDocumentType(text)
  const density = calcDensityScore(text)
  const structure = calcStructureScore(text, docType)
  const hasDuplicates = detectDuplicates(text)
  const splitSuggestions = findSplitSuggestions(text, tokens)

  // Quality = weighted average
  const qualityScore = Math.round(
    density * 0.4 +
    structure * 0.4 +
    (hasDuplicates ? 0 : 20)
  )

  return {
    tokenEstimate: tokens,
    tokenLevel: level,
    qualityScore,
    densityScore: density,
    structureScore: structure,
    hasDuplicates,
    docType,
    splitSuggestions,
    warnings: buildWarnings(tokens, level, hasDuplicates, density),
    suggestions: buildSuggestions(docType, structure, tokens),
  }
}
