# MD Converter — Handover

Next.js 15 app (App Router, TypeScript, Tailwind) that converts documents and web content into clean markdown for use as LLM context. Runs locally on Windows 11.

---

## Features

| Route | What it does |
|---|---|
| `/` | Home / navigation |
| `/converter` | Upload PDF/DOCX/TXT or paste text → markdown with YAML frontmatter |
| `/scrape` | Scrape a URL → markdown (summarize.sh first, cheerio fallback) |
| `/transcribe` | YouTube URL → markdown transcript (summarize.sh captions first, WhisperX fallback) |

---

## Architecture

### File-to-Markdown pipeline (`/api/parse`)
1. **Convert** (Python, `scripts/convert.py`):
   - PDF → **Docling** (preserves tables, layout, multi-column). Falls back to MarkItDown if Docling fails.
   - DOCX/PPTX/XLSX/HTML → **MarkItDown**.
   - TXT/paste → no external conversion.
2. **Table extraction** — for PDFs, Docling returns tables as a separate array.
   Each table is replaced inline with `[ver Tabela N]` and appended as a
   `### Tabela N` block under a `## Tabelas` section at the end of the document.
3. `preprocessMarkdown` converts `// Title` → `## Title`.
4. `fixSplitHeadings` merges headings broken across a blank line by PDF extraction.
5. `extractStructure` finds `##` headings → builds `articles[]` array.
6. `enrichWithLLM` enriches with chunked LLM analysis (no more 4000-char truncation).
7. Returns `{markdown, tables, enrichment, engine, warnings}`.

### YAML frontmatter (exported `.md`)
```yaml
---
source: "filename.pdf"
created: 2025-01-01
tipo: newsletter          # newsletter | email | relatório | diálogo | documento
edition: 144
tokens_est: 3200
quality_score: 87
topics:
  - IA generativa no varejo
  - estratégia direct-to-consumer Nike
articles:
  - id: 1
    titulo: "Título do artigo"
    tema: assunto central
---
```

### LLM enrichment (`lib/enrichment.ts`)
Priority: **Groq** (free, `llama-3.3-70b-versatile`) → Gemini → Anthropic → OpenAI.  
Set `GROQ_API_KEY` in `.env.local` for best free results. Falls back silently if no key is set.

### URL scraping + YouTube transcription (`lib/services/summarize.ts`)
Uses `@steipete/summarize` npm package (`npm i -g @steipete/summarize`).  
**Windows note:** the CLI is a `.cmd` wrapper — Node.js cannot spawn `.cmd` files directly (EINVAL). The service resolves the underlying `dist/cli.js` via `npm root -g` and spawns `node dist/cli.js` directly, avoiding cmd.exe shell argument mangling (which would split URLs at `&`).

Content-type routing:
- `youtube` → `--youtube auto` (caption extraction chain: youtubei → captionTracks → yt-dlp → Apify)
- `website` → `--firecrawl auto` if `FIRECRAWL_API_KEY` is set
- `twitter`, `podcast` → no extra flags

If summarize.sh fails or returns < 200 chars, the transcribe route falls through to **WhisperX** (local Python, slow, requires `HF_TOKEN` for diarization).

---

## Key files

```
app/
  api/parse/route.ts          Main document conversion endpoint
  api/scrape/route.ts         URL scraping endpoint
  api/transcribe/route.ts     YouTube SSE streaming transcription
  transcribe/page.tsx         Transcription UI (SSE reader)
  converter/page.tsx          File converter UI

lib/
  enrichment.ts               preprocessMarkdown, fixSplitHeadings, extractStructure, enrichWithLLM
  converter.ts                Text → markdown heuristic conversion
  guardrails.ts               Quality analysis (tokenEstimate, qualityScore)
  services/
    convert.ts                Spawns Python convert.py (hybrid Docling + MarkItDown)
    summarize.ts              Wraps @steipete/summarize CLI (Windows-safe)
    transcriber.ts            WhisperX diarization pipeline
    youtube-downloader.ts     yt-dlp audio download

components/
  ImportZone.tsx              Drag-drop + paste input
  ExportPanel.tsx             Download single .md or zip (builds frontmatter)
  DocumentCard.tsx / DocumentList.tsx / EditorPanel.tsx / PreviewPanel.tsx

scripts/
  convert.py                  Python bridge: hybrid Docling (PDF) + MarkItDown (Office), outputs JSON {markdown, tables, engine, warnings}

types/
  index.ts                    ParsedDocument, EnrichmentResult, ArticleInfo
  transcript.ts               TranscribeEvent, TranscriptSegment (+ source field)
```

---

## Environment variables (`.env.local`)

```
GROQ_API_KEY=          # Free — recommended for enrichment (llama-3.3-70b-versatile)
GEMINI_API_KEY=        # Free fallback
ANTHROPIC_API_KEY=     # Paid fallback
OPENAI_API_KEY=        # Paid fallback
HF_TOKEN=              # Hugging Face — needed for WhisperX speaker diarization
FIRECRAWL_API_KEY=     # Optional — better JS-heavy site scraping
```

---

## Dependencies (non-npm)

| Tool | Install | Used for |
|---|---|---|
| Python 3.10+ | system | Docling + MarkItDown |
| `docling` | `pip install docling` | PDF conversion (primary engine) — first run downloads ~1GB of models |
| `markitdown[all]` | `pip install "markitdown[all]"` | DOCX/XLSX/PPTX conversion + PDF fallback |
| `@steipete/summarize` | `npm i -g @steipete/summarize` | URL scraping + YouTube captions |
| `yt-dlp` | `pip install yt-dlp` | YouTube audio download (WhisperX path) |
| `ffmpeg` | `winget install Gyan.FFmpeg` | Audio processing (WhisperX path) |
| WhisperX | `pip install whisperx` | Local transcription fallback |

---

## Known issues / next steps

- **WhisperX is very slow** (~20+ min for long videos) when YouTube captions are unavailable. No fix implemented; the UI now shows clear progress messages.
- **LLM topic quality** depends on model. `llama-3.3-70b-versatile` (Groq) gives specific topics; `llama-3.1-8b-instant` was too generic (switched in last session).
- **Missing `##` heading detection** via LLM marker injection is new — not yet tested at scale. The LLM is asked to return the first unique phrase of any heading-less article so the route can insert `## Title\n\n` before it.
- **`fixSplitHeadings`** uses a heuristic (heading without terminal punctuation + blank line + ≤50 char continuation with punctuation). Works for the observed pattern; edge cases possible.
