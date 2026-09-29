#!/usr/bin/env python3
"""ref/rules.json as code: which phone and style combinations build.

    why_invalid(phone, style)   the first rule that rules the pair out, or None
    knob_defaults()             {knob: default}

    python extract/rules.py            table of every phone x style, x where ruled out
    python extract/rules.py --verify   the sizes.json-derived phone lists still match
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RULES = json.loads((ROOT / "ref/rules.json").read_text())
STYLES = json.loads((ROOT / "blender/styles.json").read_text())


def knob_defaults():
    return {k: v["default"] for k, v in RULES["knobs"].items()}


def knobs(style):
    return {**knob_defaults(), **STYLES[style]["knobs"]}


def _match(k, want):
    """want: a value, a list of values, or "set" (anything but empty or null)."""
    if want == "set":
        return k not in (None, False, [], ())
    if isinstance(want, list):
        return k in want
    return k == want


def why_invalid(phone, style):
    k = knobs(style)
    for r in RULES["combinations"]:
        if all(_match(k[n], v) for n, v in r["if"].items()):
            req = r["require"]
            if "disjoint" in req:
                a, b = req["disjoint"]
                ok = not set(k[a]) & set(k[b])
            else:
                ok = all(_match(k[n], v) for n, v in req.items())
            if not ok:
                return r["why"]
    for r in RULES["phones"]:
        if phone in r["phones"] and all(_match(k[n], v) for n, v in r.get("if", {}).items()):
            return r["why"]
    return None


def verify():
    sizes = json.loads((ROOT / "ref/iphone/sizes.json").read_text())["phones"]
    lists = {r["id"]: set(r["phones"]) for r in RULES["phones"]}
    corner = {k for k, e in sizes.items() if "spec" not in e and not e.get("corner")}
    full = {k for k, e in sizes.items() if "spec" not in e and e.get("camera", {}).get("plateau") is not None
            and not isinstance(e["camera"]["plateau"], dict)}
    assert lists["corner-profile"] == corner, corner ^ lists["corner-profile"]
    assert lists["full-width-plateau"] == full, full ^ lists["full-width-plateau"]
    print("ok")


if __name__ == "__main__":
    if "--verify" in sys.argv:
        verify()
    else:
        names = list(json.loads((ROOT / "ref/iphone/sizes.json").read_text())["phones"])
        print("phone".ljust(12) + " ".join(s[:5].ljust(5) for s in STYLES))
        for n in names:
            print(n.ljust(12) + " ".join(("x" if why_invalid(n, s) else ".").ljust(5) for s in STYLES))
