import { NextRequest } from 'next/server'
import { unlink } from 'fs/promises'
import { downloadAudio, isValidYouTubeUrl } from '@/lib/services/youtube-downloader'
import { transcribeWithDiarization, checkDependencies } from '@/lib/services/transcriber'
import { formatAsDialogue } from '@/lib/formatters/dialogue-formatter'
import { extractUrl, extractTitleFromMarkdown, checkInstalled as isSummarizeInstalled } from '@/lib/services/summarize'
import type { TranscribeEvent, TranscriptOptions } from '@/types/transcript'

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: TranscribeEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      let tempFile: string | null = null

      try {
        const body = await req.json()
        const {
          url,
          modelSize = 'small',
          language,
          minSpeakers,
          maxSpeakers,
          speakerMap,
          includeTimestamps = false,
        } = body as { url: string } & TranscriptOptions & { speakerMap?: Record<string, string> }

        // ── Validate URL ─────────────────────────────────
        if (!url || !isValidYouTubeUrl(url)) {
          send({ type: 'error', message: 'URL inválida. Forneça um link válido do YouTube.' })
          controller.close()
          return
        }

        // ── Quick path: summarize.sh caption extraction ───
        // Tries YouTube's native captions (youtubei → captionTracks → yt-dlp → Apify).
        // No audio download or local model needed. Falls through to WhisperX if unavailable.
        const summarizeAvailable = await isSummarizeInstalled()
        if (summarizeAvailable) {
          send({ type: 'progress', step: 'download', message: 'Buscando legenda do YouTube (summarize.sh)...' })
          try {
            const { markdown } = await extractUrl(url, {
              language: language || undefined,
              timeoutMs: 90_000,
              onProgress: (msg) => send({ type: 'progress', step: 'transcribe', message: `[summarize] ${msg}` }),
            })
            if (markdown.trim().length > 200) {
              send({ type: 'progress', step: 'format', message: 'Formatando markdown...' })
              const title = extractTitleFromMarkdown(markdown, 'YouTube')
              send({ type: 'result', markdown, title, segments: [], source: 'summarize' })
              controller.close()
              return
            }
            // Caption found but too short — fall through
            send({ type: 'progress', step: 'download', message: 'Legenda indisponível. Iniciando transcrição local com WhisperX (pode levar vários minutos)...' })
          } catch (quickErr) {
            console.warn('[transcribe] summarize falhou:', quickErr)
            send({ type: 'progress', step: 'download', message: 'Legenda não encontrada. Iniciando transcrição local com WhisperX (pode levar vários minutos)...' })
          }
        }

        // ── Check WhisperX dependencies ───────────────────
        send({ type: 'progress', step: 'download', message: 'Verificando dependências do WhisperX...' })
        const { ok, missing } = await checkDependencies()
        if (!ok) {
          const hints: string[] = []
          if (missing.some(m => m.startsWith('yt-dlp'))) {
            hints.push('• yt-dlp: abra um terminal e rode\n  python -m pip install yt-dlp')
          }
          if (missing.some(m => m.startsWith('ffmpeg'))) {
            hints.push('• ffmpeg: rode  winget install Gyan.FFmpeg\n  ou baixe em https://github.com/BtbN/FFmpeg-Builds/releases')
          }
          send({
            type: 'error',
            message: `Dependências ausentes:\n\n${hints.join('\n\n')}\n\nDepois reinicie o servidor (npm run dev).`,
          })
          controller.close()
          return
        }

        // ── HF_TOKEN diagnostic ───────────────────────────
        const hfToken = process.env.HF_TOKEN
        console.log('[transcribe] HF_TOKEN:', hfToken ? `${hfToken.slice(0, 10)}... (OK)` : 'NÃO ENCONTRADO')

        // ── Download audio ────────────────────────────────
        send({ type: 'progress', step: 'download', message: 'Baixando áudio do YouTube...' })
        const { filePath, title, duration } = await downloadAudio(url)
        tempFile = filePath

        const durationMin = Math.ceil(duration / 60)
        send({
          type: 'progress',
          step: 'transcribe',
          message: `Áudio baixado (${durationMin} min). Carregando WhisperX... Na primeira execução o modelo (~500 MB) será baixado automaticamente. Aguarde.`,
        })

        // ── Transcribe ────────────────────────────────────
        const segments = await transcribeWithDiarization(
          filePath,
          { modelSize: modelSize as 'tiny' | 'small' | 'medium', language, minSpeakers, maxSpeakers },
          duration,
          (msg) => send({ type: 'progress', step: 'transcribe', message: msg })
        )

        // ── Format ───────────────────────────────────────
        send({ type: 'progress', step: 'format', message: 'Formatando markdown...' })
        const markdown = formatAsDialogue(segments, {
          title,
          speakerMap,
          includeTimestamps,
        })

        send({ type: 'result', markdown, title, segments, source: 'whisperx' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido.'
        send({ type: 'error', message })
      } finally {
        if (tempFile) {
          unlink(tempFile).catch(() => null)
        }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
