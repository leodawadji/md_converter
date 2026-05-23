import type { DocumentType } from '@/types'

const EMAIL_PATTERNS = /\b(From|To|Cc|Bcc|Subject|Date):\s/i
const HEADER_PATTERNS = /^(#{1,6}\s|\*{3}|={3}|-{3})/m
const DIALOG_PATTERNS = /^[\w\s]+:\s.+$/m
const DATE_SEQUENCE = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g

export function detectDocumentType(text: string): DocumentType {
  if (EMAIL_PATTERNS.test(text)) return 'email'
  if (HEADER_PATTERNS.test(text)) return 'report'
  if (DIALOG_PATTERNS.test(text)) {
    const matches = text.match(DIALOG_PATTERNS)
    if (matches && matches.length > 3) return 'dialogue'
  }
  const dates = text.match(DATE_SEQUENCE)
  if (dates && dates.length > 4) return 'log'
  return 'generic'
}

export function convertToMarkdown(text: string, docType: DocumentType): string {
  switch (docType) {
    case 'email':
      return convertEmail(text)
    case 'report':
      return convertReport(text)
    case 'dialogue':
      return convertDialogue(text)
    case 'log':
      return convertLog(text)
    default:
      return convertGeneric(text)
  }
}

function convertEmail(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let inBody = false
  let headerCount = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (headerCount > 0 && !inBody) {
        inBody = true
        result.push('')
        result.push('---')
        result.push('')
      } else {
        result.push('')
      }
      continue
    }

    const emailHeader = trimmed.match(/^(From|To|Cc|Bcc|Subject|Date):\s(.+)$/i)
    if (emailHeader && !inBody) {
      const key = emailHeader[1]
      const value = emailHeader[2]
      if (key.toLowerCase() === 'subject') {
        result.push(`## ${value}`)
      } else {
        result.push(`**${key}:** ${value}  `)
      }
      headerCount++
    } else {
      result.push(trimmed)
    }
  }

  return result.join('\n')
}

function convertReport(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      result.push('')
      continue
    }

    // Already markdown-like
    if (/^#{1,6}\s/.test(trimmed)) {
      result.push(trimmed)
      continue
    }

    // All caps line → heading
    if (/^[A-Z\s\d]{5,}$/.test(trimmed) && trimmed.length < 80) {
      result.push(`## ${trimmed}`)
      continue
    }

    // Numbered list
    if (/^\d+[.)]\s/.test(trimmed)) {
      result.push(trimmed)
      continue
    }

    // Bullet
    if (/^[-•*]\s/.test(trimmed)) {
      result.push(trimmed.replace(/^[•]\s/, '- '))
      continue
    }

    result.push(trimmed)
  }

  return result.join('\n')
}

function convertDialogue(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      result.push('')
      continue
    }

    const speakerMatch = trimmed.match(/^([\w\s]{1,30}):\s(.+)$/)
    if (speakerMatch) {
      result.push(`**${speakerMatch[1]}:** ${speakerMatch[2]}`)
    } else {
      result.push(trimmed)
    }
  }

  return result.join('\n')
}

function convertLog(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let lastDate = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      result.push('')
      continue
    }

    const dateMatch = trimmed.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/)
    if (dateMatch && dateMatch[1] !== lastDate) {
      lastDate = dateMatch[1]
      result.push(`\n### ${lastDate}\n`)
    }

    result.push(trimmed)
  }

  return result.join('\n')
}

function convertGeneric(text: string): string {
  const paragraphs = text.split(/\n{2,}/)
  return paragraphs
    .map(p => p.trim().replace(/\n/g, ' '))
    .filter(Boolean)
    .join('\n\n')
}
