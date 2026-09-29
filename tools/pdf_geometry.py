#!/usr/bin/env python3
"""Vector paths out of a drawing PDF's content streams, in the stream's own frame.

Apple's sheets draw each page into a Form XObject; the path coordinates here are in
that form's frame, with every cm inside it applied. Text objects are skipped.

    load(pdf)              the document (also as pdftext.load)
    segments(doc, xref)    [("l", p0, p1) | ("c", p0, p1, p2, p3)] of one stream
    components(segs)       connected groups of endpoints, rounded to 0.01 pt
    streams(doc)           xrefs of every form or page content stream, biggest first

Usage: pdf_geometry.py <pdf>   lists the streams and their segment counts
"""

import re
import sys
from types import SimpleNamespace

import pymupdf

TOKEN = re.compile(rb"\((?:\\.|[^\\)])*\)|<<|>>|<[0-9A-Fa-f\s]*>|\[|\]|/[^\s/\[\]()<>]*|[^\s/\[\]()<>]+")


def load(path):
    return pymupdf.open(path)


pdftext = SimpleNamespace(load=load)


def streams(doc):
    out = []
    for x in range(1, doc.xref_length()):
        if doc.xref_is_stream(x) and (b"/Form" in doc.xref_object(x).encode() or not doc.xref_object(x).strip("<> \n")):
            out.append(x)
    for page in doc:
        out += [c for c in page.get_contents() if c not in out]
    return sorted(out, key=lambda x: -len(doc.xref_stream(x) or b""))


def _mul(a, b):
    return (a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
            a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5])


def segments(doc, xref):
    data = doc.xref_stream(xref)
    ctm, stack, ops = (1, 0, 0, 1, 0, 0), [], []
    segs, cur, start, text = [], None, None, False

    def pt(x, y):
        return (ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5])

    for tok in TOKEN.findall(data):
        c = tok[:1]
        if c in b"0123456789.-+":
            try:
                ops.append(float(tok))
                continue
            except ValueError:
                pass
        if c in b"(</[]" or tok == b">>":
            ops.append(None)
            continue
        op = tok
        if op == b"BT":
            text = True
        elif op == b"ET":
            text = False
        elif text:
            pass
        elif op == b"q":
            stack.append(ctm)
        elif op == b"Q":
            ctm = stack.pop() if stack else (1, 0, 0, 1, 0, 0)
        elif op == b"cm" and len(ops) >= 6:
            ctm = _mul(tuple(ops[-6:]), ctm)
        elif op == b"m" and len(ops) >= 2:
            cur = start = pt(*ops[-2:])
        elif op == b"l" and len(ops) >= 2 and cur:
            p = pt(*ops[-2:])
            segs.append(("l", cur, p))
            cur = p
        elif op in (b"c", b"v", b"y") and cur:
            n = ops[-6:] if op == b"c" else ops[-4:]
            if op == b"c":
                p1, p2, p3 = pt(*n[0:2]), pt(*n[2:4]), pt(*n[4:6])
            elif op == b"v":
                p1, p2, p3 = cur, pt(*n[0:2]), pt(*n[2:4])
            else:
                p1, p2, p3 = pt(*n[0:2]), pt(*n[2:4]), pt(*n[2:4])
            segs.append(("c", cur, p1, p2, p3))
            cur = p3
        elif op == b"h" and cur and start and cur != start:
            segs.append(("l", cur, start))
            cur = start
        elif op == b"re" and len(ops) >= 4:
            x, y, w, h = ops[-4:]
            q = [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)]
            segs += [("l", q[i], q[(i + 1) % 4]) for i in range(4)]
            cur = start = q[0]
        ops = []
    return segs


def _key(p):
    return (round(p[0], 2), round(p[1], 2))


def components(segs):
    """(list of node sets, node -> component index), nodes as rounded endpoints."""
    parent = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for s in segs:
        a, b = find(_key(s[1])), find(_key(s[-1]))
        if a != b:
            parent[a] = b
    groups = {}
    for n in parent:
        groups.setdefault(find(n), set()).add(n)
    comps = list(groups.values())
    index = {n: i for i, c in enumerate(comps) for n in c}
    return comps, index


if __name__ == "__main__":
    doc = load(sys.argv[1])
    for x in streams(doc):
        print(x, len(segments(doc, x)))
