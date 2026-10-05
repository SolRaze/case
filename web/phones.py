"""Every phone that has a case, as the drawing geometry the web view builds its phone
models from: web/phones.json, in sizes.json order. phone.py stays the only reader of
ref/iphone; this only flattens its dicts and adds the plan outline.

Run from the repo root: .venv/bin/python web/phones.py (npm runs it before dev and build).
Frame as phone.py: x 0..W across the front, y 0..-L down, z 0 at the front glass.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from phone import phone, phones, plan_outline  # noqa: E402

FULL_MARGIN = 2.5  # mm a full-width plateau runs past its lowest lens; not on the sheets


def clip_below(ring, y):
    """The part of a convex ring above the line y (Sutherland-Hodgman, one edge)."""
    out = []
    for i, b in enumerate(ring):
        a = ring[i - 1]
        if (a[1] >= y) != (b[1] >= y):
            t = (y - a[1]) / (b[1] - a[1])
            out.append((a[0] + t * (b[0] - a[0]), y))
        if b[1] >= y:
            out.append(b)
    return out


def plateau(p, ring):
    """Camera plateau as a polygon, or a rectangle (x0, x1, y0, y1), or None."""
    if p["plateau"] == "full":
        return {"ring": clip_below(ring, min(y - d / 2 for _, y, d in p["lenses"]) - FULL_MARGIN)}
    if p["plateau"]:
        return {"rect": p["plateau"]}
    return None


def main():
    invalid = json.loads((ROOT / "rules.json").read_text())["invalid"]
    styles = json.loads((ROOT / "styles.json").read_text())
    out = []
    for name in phones():
        if all(s in invalid.get(name, {}) for s in styles):
            continue
        p = phone(name)
        ring = plan_outline(p["corner"], p["W"], p["L"])
        r2 = lambda v: round(v, 3)  # noqa: E731
        out.append({
            "id": name,
            "W": p["W"], "L": p["L"], "T": p["T"],
            "ring": [[r2(x), r2(y)] for x, y in ring],
            "buttons": p["buttons"],
            "bx": p["bx"],
            "lenses": p["lenses"],
            "flash": p["flash"],
            "others": p["others"],
            "plateau": plateau(p, ring),
            "lens_z": p["lens_z"],
            "flash_z": p["flash_z"],
        })
    path = Path(__file__).with_name("phones.json")
    path.write_text(json.dumps(out))
    print(f"{len(out)} phones -> {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
