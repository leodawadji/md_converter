export type DocumentType = 'email' | 'report' | 'dialogue' | 'log' | 'generic'

export interface ArticleInfo {
  id: number
  titulo: string
  tema?: string
}

export interface EnrichmentResult {
  tipo: string
  edition?: number
  topics: string[]
  articles: ArticleInfo[]
}

export type GuardrailLevel = 'ok' | 'warn' | 'critical'

export interface SplitSuggestion {
  charIndex: number
  reason: string
  confidence: number
}

export interface TopicCluster {
  label: string
  keywords: string[]
  docIds: string[]
}

export interface GuardrailResult {
  tokenEstimate: number
  tokenLevel: GuardrailLevel
  qualityScore: number       // 0–100
  densityScore: number       // 0–100
  structureScore: number     // 0–100
  hasDuplicates: boolean
  docType: DocumentType
  splitSuggestions: SplitSuggestion[]
  warnings: string[]
  suggestions: string[]
}

export interface ParsedDocument {
  id: string
  name: string
  originalName: string
  fileType: 'txt' | 'pdf' | 'docx' | 'paste' | 'url'
  rawText: string
  markdown: string
  analysis: GuardrailResult
  enrichment?: EnrichmentResult
  selected: boolean
  createdAt: string
}
