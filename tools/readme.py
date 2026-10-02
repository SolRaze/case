"""Write README.md, previews/README.md and ref/README.md from styles.json, rules.json, the
refs and the built previews. Run after python case.py --all or any ref change."""

import json
from pathlib import Path

R = Path(__file__).resolve().parents[1]
styles = json.loads((R / "styles.json").read_text())
rules = json.loads((R / "rules.json").read_text())
phones = list(json.loads((R / "ref/iphone/sizes.json").read_text())["phones"])

L = []
L += ["case", "",
      "parametric iphone case for any phone in ref/iphone | 3d-printable stl | apple dimensional drawing data for every product on the accessories drawings page", "",
      "layout",
      "- case.py | the case: geometry, checks, stl export, previews, command line",
      "- phone.py | a phone from ref/iphone | rules.py and rules.json | which knobs build, and the guideline limits",
      "- styles.json | styles as named knob sets",
      "- ref/ | drawing data per product, one json per model, index in ref/README.md",
      "- laptop/ | MS-16W1 mainboard measured off a pegboard, findings in laptop/README.md",
      "- previews/ | every build seen from the back | tools/ | drawing fetch and reading, phone body check, readme writer", "",
      "run",
      "- `python case.py` 17e, every style | `python case.py magsafe frame` | `--phone 16 --phone air` | `--all`",
      "- `--check` no output files | `--no-png` stl only | stl to out/, not committed",
      "- `python rules.py` phone x style table | `--write` refresh the invalid table | `--verify`",
      "- `python tools/fetch.py` drawings and guidelines into pdf/, not committed",
      "- `python tools/readme.py` rewrite the readmes", "",
      "styles"]
L += [f"- {n} | {s['about']}" for n, s in styles.items()]
L += ["", "knobs"]
L += [f"- {k} | default {json.dumps(v['default'])} | {v['values'] if isinstance(v['values'], str) else ' '.join(json.dumps(x) for x in v['values'])}"
      for k, v in rules["knobs"].items()]
L += ["", "design",
      "- The outside is one rounded shape: a 1.55 mm wall rolling into the back over 3.0 mm, a 0.8 mm round on the front rim, and the rim opening flared 0.4 mm.",
      "- The camera opening hugs every lens and the plateau they stand on, 1.2 mm out; flash and mic outside it get their own hole. A full-width plateau opens the top of the back, its top corners and rim kept.",
      "- The camera ring stands 1.0 mm past the lens: a flat 1.5 mm top, its outside rounded; the camera and flash holes chamfer 0.4 mm at their outside edge, every other opening in the back rounds out 0.75 mm.",
      "- A banded back keeps the camera ring on an island swept out to the band, every inside corner filleted at 6 mm, so each opening is one curve.",
      "- Open walls end in a 5 mm round into the back and a 2 mm round over the rim top.",
      "- Button windows and port openings are obround; a flexure key hinges toward the larger gap to the next button. The receiver gets a shallow dip in the top rim that eases back up over 4 mm each side.",
      "- Styles only change knobs, so every style shares this shape.",
      "", "rules | build skips a phone and style that break one, and says which"]
L += [f"- {r['text']}" for r in rules["combinations"]]
for r in rules["phones"]:
    dflt = {k: v["default"] for k, v in rules["knobs"].items()}
    hit = [s for s, v in styles.items() if all({**dflt, **v["knobs"]}[k] == w for k, w in r.get("if", {}).items())]
    fits = [p for p in phones if any(s not in rules["invalid"].get(p, {}) for s in hit)]
    if fits and len(r["phones"]) > len(fits):
        L.append(f"- {r['text']} Fits only {', '.join(fits)}.")
    else:
        L.append(f"- {r['text']} Ruled out: {', '.join(r['phones']) or 'none'}.")
L += ["", "limits | from the apple accessory design guidelines and the phone sheets, checked on every build"]
L += [f"- {r['text']} ({r['source']})" for r in rules["limits"]]
L += ["", "checks", "- every build: closed mesh, one solid, glass gap >= 0.85 for front glass, lens cover, back glass",
      f"- {sum(1 for p in phones for s in styles if not (rules['invalid'].get(p, {}).get(s)))} of {len(phones) * len(styles)} phone x style build and pass | the rest are in rules.json invalid", "",
      "previews | from the back, grid in previews/README.md"]
P = ["previews", "", "one section per phone, every style that builds, seen from the back | python case.py writes them", ""]
for p in phones:
    built = [s for s in styles if (R / f"previews/{p}/{s}.png").exists()]
    if built:
        L.append(f"- [{p}](previews/README.md#{p}) | {len(built)} styles")
        P += [f'<a name="{p}"></a>{p}', "", "| " + " | ".join(built) + " |", "|" + "---|" * len(built),
              "| " + " | ".join(f"![{s}]({p}/{s}.png)" for s in built) + " |", ""]
    else:
        L.append(f"- {p} | none, {', '.join(sorted(set(rules['invalid'][p].values())))}")
(R / "previews/README.md").write_text("\n".join(P))
L += ["", "requirements", "- `pip install -r requirements.txt` | blender's python module, numpy, pymupdf | libegl for headless previews", "",
      "license mit"]
(R / "README.md").write_text("\n".join(L) + "\n")

# ref index
fam = {}
for f in sorted(R.glob("ref/*/*.json")):
    if f.name == "sizes.json":
        continue
    d = json.loads(f.read_text())
    s = d.get("source", {})
    fam.setdefault(f.parent.name, []).append((d.get("product", f.stem), f.relative_to(R / "ref"), s.get("sheet_date"), s.get("url")))
X = ["ref", "", "apple dimensional drawings, one json per model, grouped by family | 1 unit = 1 mm | null = not dimensioned on the sheet",
     "- pdfs from the source urls, fetched by tools/fetch.py into pdf/, not committed",
     "- iphone/sizes.json | main-sheet summary of every iphone, what the case loader reads",
     "- each json lists what was read by eye under unverified", ""]
for k in sorted(fam):
    X += [k, "", "| model | file | sheet date | source |", "|---|---|---|---|"]
    for prod, path, date, url in sorted(fam[k], key=lambda t: t[2] or "", reverse=True):
        X.append(f"| {prod} | [{path.name}]({path}) | {date or '-'} | {url or '-'} |")
    X.append("")
(R / "ref/README.md").write_text("\n".join(X))
print(len(L), sum(len(v) for v in fam.values()))
