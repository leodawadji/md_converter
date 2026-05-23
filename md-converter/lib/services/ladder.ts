import { htmlToMarkdown } from '@/lib/parsers/web'

export function isLadderConfigured(): boolean {
  return !!process.env.LADDER_URL
}

interface LadderApiResponse {
  body: string
  request?: { headers: Record<string, string> }
  response?: { headers: Record<string, string> }
}

/**
 * Fetch a URL through a running Ladder instance and return clean markdown.
 *
 * Requires LADDER_URL in .env.local (e.g. http://localhost:8080).
 * Optional LADDER_AUTH in format "user:password" for basic auth.
 *
 * Run Ladder locally:
 *   docker run -p 8080:8080 ghcr.io/everywall/ladder:latest
 */
export async function fetchViaLadder(
  url: string,
): Promise<{ markdown: string; title: string }> {
  const base = process.env.LADDER_URL
  if (!base) {
    throw new Error(
      'Ladder não configurado. Defina LADDER_URL em .env.local (ex: http://localhost:8080).',
    )
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const auth = process.env.LADDER_AUTH
  if (auth) {
    headers['Authorization'] = `Basic ${Buffer.from(auth).toString('base64')}`
  }

  const apiUrl = `${base.replace(/\/$/, '')}/api`

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ladder retornou ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`)
  }

  const data = (await res.json()) as LadderApiResponse

  if (!data.body) {
    throw new Error('Ladder retornou resposta sem body.')
  }

  const { title, markdown } = htmlToMarkdown(data.body, url)
  return { title, markdown }
}
