import { spawn, execFileSync } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'

export type ContentType = 'youtube' | 'twitter' | 'podcast' | 'website'

const IS_WIN = process.platform === 'win32'

// On Windows, cmd.exe interprets `&` in URLs as a command separator, even with
// shell:true. Fix: resolve the CLI's .js entry point and spawn `node script.js`
// directly — no shell, no argument mangling.
// undefined = not yet probed; null = probed, not found; string = path found
let _winCliPath: string | null | undefined = undefined

function resolveWinCli(): string | null {
  if (_winCliPath !== undefined) return _winCliPath
  try {
    const npmRoot = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      timeout: 5_000,
      // npm is itself a .cmd on Windows, so we need shell here (one-time cost)
      shell: true,
    }).trim()
    const candidate = join(npmRoot, '@steipete', 'summarize', 'dist', 'cli.js')
    _winCliPath = existsSync(candidate) ? candidate : null
  } catch {
    _winCliPath = null
  }
  return _winCliPath
}

function spawnSummarize(args: string[]) {
  if (IS_WIN) {
    const cli = resolveWinCli()
    if (cli) {
      // node dist/cli.js — args are passed as a proper array, no shell quoting
      return spawn('node', [cli, ...args], { env: process.env })
    }
    // Fallback: shell:true (breaks on URLs with &, but better than EINVAL)
    return spawn('summarize', args, { env: process.env, shell: true })
  }
  return spawn('summarize', args, { env: process.env })
}

export function detectContentType(url: string): ContentType {
  try {
    const { hostname, pathname } = new URL(url)
    const host = hostname.replace(/^www\./, '')
    if (/youtube\.com|youtu\.be/.test(host)) return 'youtube'
    if (/twitter\.com|x\.com/.test(host)) return 'twitter'
    if (/\.(mp3|m4a|ogg|wav|aac|flac|opus)$/i.test(pathname)) return 'podcast'
    return 'website'
  } catch {
    return 'website'
  }
}

function buildArgs(
  url: string,
  contentType: ContentType,
  opts: { language?: string } = {}
): string[] {
  const args = [url, '--extract', '--format', 'md']

  switch (contentType) {
    case 'youtube':
      // auto: youtubei → captionTracks → yt-dlp → Apify
      args.push('--youtube', 'auto')
      if (opts.language) args.push('--language', opts.language)
      break
    case 'website':
      // Use Firecrawl for JS-heavy sites when key is available
      if (process.env.FIRECRAWL_API_KEY) args.push('--firecrawl', 'auto')
      break
    // twitter, podcast: summarize handles automatically — no extra flags needed
  }

  return args
}

export async function extractUrl(
  url: string,
  opts: { language?: string; onProgress?: (msg: string) => void; timeoutMs?: number } = {}
): Promise<{ markdown: string; contentType: ContentType }> {
  const contentType = detectContentType(url)
  const args = buildArgs(url, contentType, { language: opts.language })
  const markdown = await runSummarize(args, opts.onProgress, opts.timeoutMs)
  return { markdown, contentType }
}

function runSummarize(
  args: string[],
  onProgress?: (msg: string) => void,
  timeoutMs = 120_000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawnSummarize(args)

    let stdout = ''
    let stderr = ''
    let settled = false
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn() } }

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stdout.on('error', () => { /* drain silently */ })

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      if (onProgress) {
        for (const line of text.split('\n')) {
          const trimmed = line.trim()
          if (trimmed) onProgress(trimmed)
        }
      }
    })
    proc.stderr.on('error', () => { /* drain silently */ })

    const timer = setTimeout(() => {
      proc.kill()
      settle(() => reject(new Error('Timeout ao extrair conteúdo.')))
    }, timeoutMs)

    proc.on('close', (code) => {
      clearTimeout(timer)
      settle(() => {
        if (code !== 0) {
          reject(new Error(`summarize encerrou com código ${code}:\n${stderr.slice(-500)}`))
          return
        }
        const result = stdout.trim()
        if (!result) {
          reject(new Error('summarize retornou conteúdo vazio.'))
          return
        }
        resolve(result)
      })
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      settle(() => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error('summarize não encontrado. Instale com: npm i -g @steipete/summarize'))
        } else {
          reject(err)
        }
      })
    })
  })
}

export function checkInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawnSummarize(['--help'])
    proc.stdout?.resume()
    proc.stderr?.resume()
    proc.stdout?.on('error', () => { /* drain */ })
    proc.stderr?.on('error', () => { /* drain */ })
    proc.on('error', () => resolve(false))
    // exit code 0 = found; non-zero with shell:true = command not found
    proc.on('close', (code) => resolve(code === 0))
  })
}

export function extractTitleFromMarkdown(markdown: string, fallback = ''): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() ?? fallback
}
