import type { TranscriptSegment } from '@/types/transcript'

interface DialogueFormatterOptions {
  speakerMap?: Record<string, string>
  includeTimestamps?: boolean
  title?: string
}

interface SpeakerBlock {
  speaker: string
  segments: TranscriptSegment[]
}

// Gap between segments (seconds) that triggers a paragraph break within the same speaker
const PARAGRAPH_GAP_S = 3.0
// Max characters in a single paragraph before forcing a break at the next sentence end
const MAX_PARAGRAPH_CHARS = 600

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function resolveSpeakerName(rawSpeaker: string, speakerMap?: Record<string, string>): string {
  if (speakerMap?.[rawSpeaker]) return speakerMap[rawSpeaker]
  const match = rawSpeaker.match(/SPEAKER_(\d+)/)
  if (match) return `Speaker ${parseInt(match[1], 10) + 1}`
  return rawSpeaker
}

// Groups consecutive segments from the same speaker into blocks.
// A gap > PARAGRAPH_GAP_S between segments of the same speaker starts a NEW block.
function groupIntoContinuousBlocks(segments: TranscriptSegment[]): SpeakerBlock[] {
  const blocks: SpeakerBlock[] = []
  for (const seg of segments) {
    const speaker = seg.speaker || 'UNKNOWN'
    const last = blocks[blocks.length - 1]
    const lastSeg = last?.segments[last.segments.length - 1]
    const gap = lastSeg ? seg.start - lastSeg.end : Infinity

    if (last && last.speaker === speaker && gap < PARAGRAPH_GAP_S) {
      last.segments.push(seg)
    } else {
      blocks.push({ speaker, segments: [seg] })
    }
  }
  return blocks
}

// Within a single speaker block, split into paragraphs at natural sentence
// boundaries when the accumulated text exceeds MAX_PARAGRAPH_CHARS.
function splitIntoParagraphs(segments: TranscriptSegment[]): string[] {
  const paragraphs: string[] = []
  let current = ''

  for (const seg of segments) {
    const text = seg.text.trim()
    if (!text) continue
    current += (current ? ' ' : '') + text

    // Break after sentence-ending punctuation when over the limit
    if (current.length >= MAX_PARAGRAPH_CHARS && /[.!?…]["']?\s*$/.test(current)) {
      paragraphs.push(current.trim())
      current = ''
    }
  }
  if (current.trim()) paragraphs.push(current.trim())
  return paragraphs.length > 0 ? paragraphs : ['']
}

export function formatAsDialogue(
  segments: TranscriptSegment[],
  options: DialogueFormatterOptions = {}
): string {
  const { speakerMap, includeTimestamps = false, title } = options
  const parts: string[] = []

  if (title) parts.push(`# Transcrição: ${title}\n`)

  if (segments.length === 0) {
    parts.push('_Nenhuma fala detectada na transcrição._')
    return parts.join('\n')
  }

  // Detect if diarization was actually performed (more than one unique speaker)
  const uniqueSpeakers = new Set(segments.map(s => s.speaker || 'UNKNOWN'))
  const hasDiarization = uniqueSpeakers.size > 1

  if (!hasDiarization) {
    parts.push('> ℹ️ Transcrição sem diarização de falantes (HF_TOKEN não configurado ou vídeo com um único falante). Configure `HF_TOKEN` no `.env.local` para identificar os falantes.\n')
  }

  const blocks = groupIntoContinuousBlocks(segments)

  for (const block of blocks) {
    const name = resolveSpeakerName(block.speaker, speakerMap)
    const paragraphs = splitIntoParagraphs(block.segments)

    if (includeTimestamps) {
      const start = block.segments[0].start
      const end = block.segments[block.segments.length - 1].end
      const ts = `_[${formatTimestamp(start)} → ${formatTimestamp(end)}]_`
      parts.push(`**${name}:** ${ts}\n${paragraphs.join('\n\n')}\n`)
    } else {
      // First paragraph on the same line as the speaker label; rest indented as continuation
      const [first, ...rest] = paragraphs
      const body = rest.length > 0 ? `${first}\n\n${rest.join('\n\n')}` : first
      parts.push(`**${name}:** ${body}\n`)
    }
  }

  return parts.join('\n')
}

export function buildSpeakerMap(rawMap: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const pair of rawMap.split(',')) {
    const [key, value] = pair.split('=').map(s => s.trim())
    if (key && value) map[key] = value
  }
  return map
}
