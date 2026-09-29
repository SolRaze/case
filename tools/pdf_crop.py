#!/usr/bin/env python3
"""Render a drawing page, or a region of it, to PNG for reading dimensions by eye.

    pdf_crop.py <pdf> <page> [x0 y0 x1 y1] [--zoom N] [-o out.png]

Region in points from the page's top left; zoom defaults to 4 (288 dpi).
Writes pdf/crop/<name>-p<page>.png unless -o is given.
"""

import sys
from pathlib import Path

import pymupdf

args = sys.argv[1:]
zoom, out = 4.0, None
if "--zoom" in args:
    i = args.index("--zoom")
    zoom = float(args[i + 1])
    del args[i:i + 2]
if "-o" in args:
    i = args.index("-o")
    out = Path(args[i + 1])
    del args[i:i + 2]
pdf, page = Path(args[0]), int(args[1])
doc = pymupdf.open(pdf)
pg = doc[page - 1]
clip = pymupdf.Rect(*map(float, args[2:6])) if len(args) >= 6 else pg.rect
if out is None:
    out = Path(__file__).resolve().parents[1] / "pdf/crop" / f"{pdf.stem}-p{page}.png"
out.parent.mkdir(exist_ok=True)
pg.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip).save(out)
print(out)
