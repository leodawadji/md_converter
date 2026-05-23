import { spawn } from 'child_process'
import { join } from 'path'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const SCRIPT_PATH = join(process.cwd(), 'scripts', 'markitdown_convert.py')
const python = process.platform === 'win32' ? 'python' : 'python3'

export async function convertWithMarkItDown(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase() || 'bin'
  const tmpPath = join(tmpdir(), `markitdown-${randomUUID()}.${ext}`)

  try {
    await writeFile(tmpPath, buffer)
    return await runScript(tmpPath)
  } finally {
    unlink(tmpPath).catch(() => null)
  }
}

function runScript(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(python, [SCRIPT_PATH, filePath])

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`markitdown falhou (código ${code}):\n${stderr.slice(-1000)}`))
        return
      }
      try {
        const result = JSON.parse(stdout.trim())
        if (result.error) {
          reject(new Error(result.error))
        } else {
          resolve(result.markdown ?? '')
        }
      } catch {
        reject(new Error(`JSON inválido na saída do script.\nStdout: ${stdout.slice(0, 200)}`))
      }
    })

    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('Python não encontrado. Certifique-se que Python 3 está instalado e no PATH.'))
      } else {
        reject(err)
      }
    })
  })
}
