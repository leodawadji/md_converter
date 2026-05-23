import { spawn } from 'child_process'
import { join } from 'path'
import type { TranscriptSegment, TranscriptOptions } from '@/types/transcript'

const SCRIPT_PATH = join(process.cwd(), 'scripts', 'transcribe.py')

// How long we wait for transcription: base + (duration * ratio)
// A 1h video with 'small' model takes ~10min, so ratio ~10x
const TIMEOUT_BASE_MS = 60_000 // 1 min base
const TIMEOUT_RATIO = 12 // 12x video duration in ms

export async function transcribeWithDiarization(
  audioPath: string,
  options: TranscriptOptions = {},
  videoDurationSeconds = 0,
  onProgress?: (message: string) => void
): Promise<TranscriptSegment[]> {
  const {
    modelSize = 'small',
    language,
    minSpeakers,
    maxSpeakers,
  } = options

  const args: string[] = [
    SCRIPT_PATH,
    audioPath,
    '--model', modelSize,
  ]
  if (language) args.push('--language', language)
  if (minSpeakers) args.push('--min-speakers', String(minSpeakers))
  if (maxSpeakers) args.push('--max-speakers', String(maxSpeakers))

  const hfToken = process.env.HF_TOKEN
  const env = { ...process.env, ...(hfToken ? { HF_TOKEN: hfToken } : {}) }

  const python = process.platform === 'win32' ? 'python' : 'python3'

  return new Promise((resolve, reject) => {
    const proc = spawn(python, args, { env })

    let stdout = ''
    let stderrBuf = ''

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrBuf += text
      if (onProgress) {
        for (const line of text.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed) continue
          // Forward all non-trivial lines so the user can see pyannote errors
          const isNoise = /^\s*(config|Traceback|File "|^\s+at |UserWarning|warnings\.warn|FutureWarning|^\s*\^)/.test(trimmed)
          if (!isNoise) onProgress(trimmed)
        }
      }
    })

    const dynamicTimeout = videoDurationSeconds > 0
      ? TIMEOUT_BASE_MS + videoDurationSeconds * 1000 * TIMEOUT_RATIO
      : 30 * 60 * 1000 // 30 min fallback

    const timeout = setTimeout(() => {
      proc.kill()
      reject(new Error('Timeout na transcrição. Tente um modelo menor (tiny ou small) ou um vídeo mais curto.'))
    }, dynamicTimeout)

    proc.on('close', (code) => {
      clearTimeout(timeout)
      // Always print full stderr to server console for debugging
      console.log('[transcribe.py stderr]\n' + stderrBuf)
      if (code !== 0) {
        reject(new Error(`Erro na transcrição (código ${code}):\n${stderrBuf.slice(-2000)}`))
        return
      }
      // Find the first line that parses as a JSON array — defensive against
      // any library that leaks output to stdout
      const jsonLine = stdout.split('\n').find(l => l.trimStart().startsWith('['))
      if (!jsonLine) {
        const preview = stdout.slice(0, 500) || '(stdout vazio)'
        reject(new Error(`Nenhum JSON encontrado na saída do script Python.\nStdout: ${preview}\nStderr: ${stderrBuf.slice(-500)}`))
        return
      }
      try {
        resolve(JSON.parse(jsonLine) as TranscriptSegment[])
      } catch (e) {
        reject(new Error(`JSON inválido na saída do script Python: ${e}\nLinha: ${jsonLine.slice(0, 200)}`))
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('Python não encontrado. Certifique-se que Python 3 está instalado e no PATH.'))
      } else {
        reject(err)
      }
    })
  })
}

function tryCommand(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: 'ignore' })
    proc.on('error', () => resolve(false))
    proc.on('close', (code) => resolve(code === 0))
  })
}

export async function checkDependencies(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = []
  const isWin = process.platform === 'win32'
  const python = isWin ? 'python' : 'python3'

  // Check Python — required for everything
  if (!await tryCommand(python, ['--version'])) {
    missing.push('python')
    return { ok: false, missing } // nothing else will work without python
  }

  // Check yt-dlp via Python module — works even when the binary isn't in PATH
  const ytdlpOk = await tryCommand(python, ['-m', 'yt_dlp', '--version'])
  if (!ytdlpOk) missing.push('yt-dlp (rode: python -m pip install yt-dlp)')

  // Check ffmpeg — must be a standalone binary in PATH
  const ffmpegOk = await tryCommand('ffmpeg', ['-version'])
  if (!ffmpegOk) missing.push('ffmpeg')

  return { ok: missing.length === 0, missing }
}
