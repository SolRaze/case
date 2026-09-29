#!/usr/bin/env python3
"""Download Apple's public dimensional drawings into pdf/ (gitignored).

    python3 tools/fetch.py            every pdf linked from the drawings page
    python3 tools/fetch.py iphone-17  only names containing any argument
    python3 tools/fetch.py --list     print the urls, newest first, download nothing

The page lists products newest first; that order is kept in pdf/index.txt.
The Accessory Design Guidelines, the case rules, come along as adg.pdf.
"""

import re
import sys
import urllib.request
from pathlib import Path

SITE = "https://developer.apple.com"
PAGE = SITE + "/accessories/dimensional-drawings/"
ADG = SITE + "/accessories/Accessory-Design-Guidelines.pdf"
DEST = Path(__file__).resolve().parents[1] / "pdf"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def urls():
    html = get(PAGE).decode()
    seen = []
    for href in re.findall(r'href="([^"]+\.pdf)"', html):
        url = href if href.startswith("http") else SITE + href
        if url not in seen:
            seen.append(url)
    return seen


def main(argv):
    only = [a for a in argv if not a.startswith("-")]
    found = urls()
    if "--list" in argv:
        print("\n".join(found))
        return
    DEST.mkdir(exist_ok=True)
    (DEST / "index.txt").write_text("\n".join(found) + "\n")
    for url in found + [ADG]:
        name = "adg.pdf" if url == ADG else url.rsplit("/", 1)[1]
        if only and not any(o in name for o in only):
            continue
        out = DEST / name
        if out.exists():
            continue
        out.write_bytes(get(url))
        print(f"{name}: {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main(sys.argv[1:])
