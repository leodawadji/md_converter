export interface TranscriptSegment {
  start: number
  end: number
  text: string
  speaker: string // "SPEAKER_00", "SPEAKER_01", etc.
}

export interface TranscriptOptions {
  modelSize?: 'tiny' | 'small' | 'medium'
  language?: string
  minSpeakers?: number
  maxSpeakers?: number
  speakerMap?: Record<string, string> // { "SPEAKER_00": "Entrevistador" }
  includeTimestamps?: boolean
}

export interface DownloadResult {
  filePath: string
  title: string
  duration: number // seconds
}

export type TranscribeProgressStep = 'download' | 'transcribe' | 'format' | 'done' | 'error'

export interface TranscribeProgressEvent {
  type: 'progress'
  step: TranscribeProgressStep
  message: string
}

export interface TranscribeResultEvent {
  type: 'result'
  markdown: string
  title: string
  segments: TranscriptSegment[]
  source?: 'summarize' | 'whisperx'
}

export interface TranscribeErrorEvent {
  type: 'error'
  message: string
}

export type TranscribeEvent = TranscribeProgressEvent | TranscribeResultEvent | TranscribeErrorEvent
