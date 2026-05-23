#!/usr/bin/env python3
"""
Convert a file to Markdown.

Strategy:
- PDF  -> Docling (IBM, preserves tables/layout/multi-column)
- DOCX/PPTX/XLSX/HTML -> MarkItDown (Microsoft, fast and reliable for Office)
- Fallback to MarkItDown if Docling fails on PDF.

Output (stdout, JSON):
{
  "markdown": str,
  "tables": [
    {"id": int, "markdown": str, "caption": str | None, "page": int | None}
  ],
  "engine": "docling" | "markitdown",
  "warnings": [str]
}

Errors go to stderr as JSON: {"error": "..."}
"""

import sys
import json
import argparse
import io
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


# ──────────────────────────────────────────────────────────────────────────────
# Docling path (PDF only)
# ──────────────────────────────────────────────────────────────────────────────

def convert_pdf_with_docling(file_path: str) -> dict:
    """
    Convert a PDF using Docling. Extracts tables separately and replaces
    each in-line table occurrence in the markdown with a reference like:
        [ver Tabela N]
    while appending the full table as a "## Tabela N" block at the end.
    """
    from docling.document_converter import DocumentConverter

    converter = DocumentConverter()
    result = converter.convert(file_path)
    doc = result.document

    markdown = doc.export_to_markdown()

    tables_out = []
    if hasattr(doc, "tables") and doc.tables:
        for idx, tbl in enumerate(doc.tables, start=1):
            try:
                tbl_md = tbl.export_to_markdown(doc)
            except Exception:
                try:
                    df = tbl.export_to_dataframe()
                    tbl_md = df.to_markdown(index=False)
                except Exception:
                    continue

            caption = None
            try:
                if hasattr(tbl, "captions") and tbl.captions:
                    caption = " ".join(c.text for c in tbl.captions if hasattr(c, "text"))
            except Exception:
                pass

            page = None
            try:
                if hasattr(tbl, "prov") and tbl.prov:
                    page = tbl.prov[0].page_no
            except Exception:
                pass

            tables_out.append({
                "id": idx,
                "markdown": tbl_md.strip(),
                "caption": caption,
                "page": page,
            })

    if tables_out:
        for t in tables_out:
            placeholder = f"[ver Tabela {t['id']}]"
            if t["markdown"] and t["markdown"] in markdown:
                markdown = markdown.replace(t["markdown"], placeholder, 1)

        tables_section = ["", "", "## Tabelas", ""]
        for t in tables_out:
            heading = f"### Tabela {t['id']}"
            if t["caption"]:
                heading += f" — {t['caption']}"
            if t["page"] is not None:
                heading += f" *(pag. {t['page']})*"
            tables_section.append(heading)
            tables_section.append("")
            tables_section.append(t["markdown"])
            tables_section.append("")

        markdown = markdown.rstrip() + "\n".join(tables_section)

    return {
        "markdown": markdown,
        "tables": tables_out,
        "engine": "docling",
        "warnings": [],
    }


# ──────────────────────────────────────────────────────────────────────────────
# MarkItDown path (Office formats)
# ──────────────────────────────────────────────────────────────────────────────

def convert_with_markitdown(file_path: str) -> dict:
    from markitdown import MarkItDown
    md = MarkItDown()
    result = md.convert(file_path)
    return {
        "markdown": result.text_content,
        "tables": [],
        "engine": "markitdown",
        "warnings": [],
    }


# ──────────────────────────────────────────────────────────────────────────────
# Router
# ──────────────────────────────────────────────────────────────────────────────

def convert(file_path: str) -> dict:
    ext = Path(file_path).suffix.lower().lstrip(".")

    if ext == "pdf":
        try:
            return convert_pdf_with_docling(file_path)
        except ImportError:
            result = convert_with_markitdown(file_path)
            result["warnings"].append(
                "Docling nao instalado — usando MarkItDown como fallback. "
                "Instale com: pip install docling"
            )
            return result
        except Exception as e:
            result = convert_with_markitdown(file_path)
            result["warnings"].append(
                f"Docling falhou ({type(e).__name__}: {e}); "
                "usando MarkItDown como fallback."
            )
            return result

    return convert_with_markitdown(file_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file_path")
    args = parser.parse_args()

    try:
        result = convert(args.file_path)
        print(json.dumps(result, ensure_ascii=False))
    except ImportError as e:
        print(json.dumps({
            "error": f"Dependencia nao instalada: {e}. "
                     f"Rode: pip install docling markitdown[all]"
        }), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"{type(e).__name__}: {e}"}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
