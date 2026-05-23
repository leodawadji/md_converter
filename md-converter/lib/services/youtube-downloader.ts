import { execFile } from 'child_process'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { DownloadResult } from '@/types/transcript'

const execFileAsync = promisify(execFile)

const MAX_DURATION_SECONDS = 3 * 60 * 60 // 3 hours

const YOUTUBE_URL_PATTERN =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[A-Za-z0-9_\-]{11}/

// Use "python -m yt_dlp" so it always works regardless of whether the
// yt-dlp binary is in PATH — only Python itself needs to be in PATH.
const PYTHON = process.platform === 'win32' ? 'python' : 'python3'
const YTDLP_ARGS_PREFIX = ['-m', 'yt_dlp']

export function isValidYouTubeUrl(url: string): boolean {
  return YOUTUBE_URL_PATTERN.test(url)
}

async function getVideoInfo(url: string): Promise<{ title: string; duration: number }> {
  const { stdout } = await execFileAsync(
    PYTHON,
    [...YTDLP_ARGS_PREFIX, '--print', '%(title)s\n%(duration)s', '--no-playlist', url],
    { timeout: 30_000 }
  )

  const lines = stdout.trim().split('\n')
  const title = lines[0] ?? 'Sem título'
  const duration = parseInt(lines[1] ?? '0', 10)
  return { title, duration }
}

export async function downloadAudio(youtubeUrl: string): Promise<DownloadResult> {
  if (!isValidYouTubeUrl(youtubeUrl)) {
    throw new Error('URL inválida. Forneça um link válido do YouTube.')
  }

  const info = await getVideoInfo(youtubeUrl)

  if (info.duration > MAX_DURATION_SECONDS) {
    const hours = Math.floor(info.duration / 3600)
    throw new Error(
      `Vídeo muito longo (${hours}h). O limite é 3 horas para evitar downloads excessivos.`
    )
  }

  const outDir = tmpdir()
  const outId = randomUUID()
  const outTemplate = join(outDir, `${outId}.%(ext)s`)

  await execFileAsync(
    PYTHON,
    [
      ...YTDLP_ARGS_PREFIX,
      '-x',
      '--audio-format', 'wav',
      '--audio-quality', '0',
      '--no-playlist',
      '-o', outTemplate,
      youtubeUrl,
    ],
    { timeout: 10 * 60 * 1000 }
  )

  const filePath = join(outDir, `${outId}.wav`)
  return { filePath, title: info.title, duration: info.duration }
}
