#!/usr/bin/env python3
"""Convert a file to Markdown using Microsoft MarkItDown."""

import sys
import json
import argparse
import io

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


def convert(file_path: str) -> str:
    from markitdown import MarkItDown
    md = MarkItDown()
    result = md.convert(file_path)
    return result.text_content


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file_path")
    args = parser.parse_args()

    try:
        markdown = convert(args.file_path)
        print(json.dumps({"markdown": markdown}, ensure_ascii=False))
    except ImportError:
        print(
            json.dumps({"error": "markitdown não instalado. Rode: pip install markitdown"}),
            file=sys.stderr,
        )
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
