import { NextRequest, NextResponse } from 'next/server'
import { analyzeDocument } from '@/lib/guardrails'

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json()
    if (typeof text !== 'string') {
      return NextResponse.json({ error: 'Campo "text" obrigatório.' }, { status: 400 })
    }
    const analysis = analyzeDocument(text)
    return NextResponse.json(analysis)
  } catch (err) {
    console.error('Analyze error:', err)
    return NextResponse.json({ error: 'Erro ao analisar o texto.' }, { status: 500 })
  }
}
