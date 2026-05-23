export async function parsePdf(buffer: Buffer): Promise<string> {
  // pdf-parse v2 uses a class-based API: new PDFParse({ data: buffer })
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  return result.text as string
}
