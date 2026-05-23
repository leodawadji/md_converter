import { spawn } from 'child_process'
import { join } from 'path'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const SCRIPT_PATH = join(process.cwd(), 'scripts', 'convert.py')
const python = process.platform === 'win32' ? 'python' : 'python3'

export interface ExtractedTable {
  id: number
  markdown: string
  caption: string | null
  page: number | null
}

export interface ConversionResult {
  markdown: string
  tables: ExtractedTable[]
  engine: 'docling' | 'markitdown'
  warnings: string[]
}

export async function convertDocument(
  buffer: Buffer,
  filename: string
): Promise<ConversionResult> {
  const ext = filename.split('.').pop()?.toLowerCase() || 'bin'
  const tmpPath = join(tmpdir(), `convert-${randomUUID()}.${ext}`)

  try {
    await writeFile(tmpPath, buffer)
    return await runScript(tmpPath)
  } finally {
    unlink(tmpPath).catch(() => null)
  }
}

function runScript(filePath: string): Promise<ConversionResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(python, [SCRIPT_PATH, filePath])

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        try {
          const err = JSON.parse(stderr.trim())
          reject(new Error(err.error || `convert.py falhou (codigo ${code})`))
        } catch {
          reject(new Error(`convert.py falhou (codigo ${code}):\n${stderr.slice(-1000)}`))
        }
        return
      }
      try {
        const result = JSON.parse(stdout.trim())
        if (result.error) {
          reject(new Error(result.error))
        } else {
          resolve({
            markdown: result.markdown ?? '',
            tables: result.tables ?? [],
            engine: result.engine ?? 'markitdown',
            warnings: result.warnings ?? [],
          })
        }
      } catch {
        reject(new Error(`JSON invalido na saida do script.\nStdout: ${stdout.slice(0, 200)}`))
      }
    })

    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('Python nao encontrado. Certifique-se que Python 3.10+ esta instalado e no PATH.'))
      } else {
        reject(err)
      }
    })
  })
}

export { convertDocument as convertWithMarkItDown }
