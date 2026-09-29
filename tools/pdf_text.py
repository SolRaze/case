#!/usr/bin/env python3
"""Every text run of a drawing PDF with its position, one line each.

    pdf_text.py <pdf> [page]     page x0 y0 text, points from the page's top left

Sheets whose text is drawn as vector outlines with no font print nothing here;
read those off pdf_crop.py renders.
"""

import sys

import pymupdf

doc = pymupdf.open(sys.argv[1])
pages = [int(sys.argv[2]) - 1] if len(sys.argv) > 2 else range(doc.page_count)
for i in pages:
    for x0, y0, x1, y1, text, *_ in doc[i].get_text("words"):
        print(f"{i + 1} {x0:7.1f} {y0:6.1f} {text}")
