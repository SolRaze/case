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
      "- previews/ | every build seen from the back | tools/ | drawing fetch and reading, phone body check, readme writer",
      "- web/ | memory card browser: every phone with a case, modelled from its drawing | edit joins, cuts and moves a part set's parts | showcase holds finished designs to remix | playground, own icon on the front page, no phone | box, cylinder, sphere, cone, torus and stl blocks joined, cut and blended in the printer's 235 x 235 x 200 mm volume | saved parts on its shelf and in edit's add part, my parts | exports stl | every key has a button in the bar | keys, touch or a controller | phones.py reads phone.py and rules.json at dev and build", "",
      "run",
      "- `python case.py` 17e, every style | `python case.py magsafe frame` | `--phone 16 --phone air` | `--all`",
      "- `--check` no output files | `--no-png` stl only | stl to out/, not committed",
      "- `python rules.py` phone x style table | `--write` refresh the invalid table | `--verify`",
      "- `python tools/fetch.py` drawings and guidelines into pdf/, not committed",
      "- `python tools/readme.py` rewrite the readmes",
      "- web/ `npm install` | `npm run phones` writes web/phones.json, `npm run glb` packs out/ stl into web/public/glb | `npm run dev`", "",
      "styles"]
L += [f"- {n} | {s['about']}" for n, s in styles.items()]
L += ["", "knobs | defaults and values in rules.json knobs", "- " + " | ".join(rules["knobs"])]
L += ["", "design",
      "- outside one rounded shape | 1.55 mm wall rolls into the back over 3.0 mm | 0.8 mm round on the front rim | rim opening flared 0.4 mm",
      "- camera opening hugs every lens and their plateau, 1.2 mm out | flash and mic outside it get their own hole | a full-width plateau opens the top of the back, top corners and rim kept",
      "- camera ring 1.0 mm past the lens, flat 1.5 mm top, outside rounded | camera and flash holes chamfer 0.4 mm outside | every other back opening rounds out 0.75 mm",
      "- banded back keeps the camera ring on an island swept out to the band | inside corners filleted 6 mm, each opening one curve",
      "- open walls end in a 5 mm round into the back and a 2 mm round over the rim top",
      "- button windows and port openings obround | a flexure key hinges toward the larger gap to the next button | receiver gets a shallow dip in the top rim, easing back up over 4 mm each side",
      "- styles only change knobs, every style shares this shape",
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
      "previews"]
P = ["previews", "", "one section per phone, every style that builds, seen from the back | python case.py writes them", ""]
for p in phones:
    built = [s for s in styles if (R / f"previews/{p}/{s}.png").exists()]
    if built:
        P += [f'<a name="{p}"></a>{p}', "", "| " + " | ".join(built) + " |", "|" + "---|" * len(built),
              "| " + " | ".join(f"![{s}]({p}/{s}.png)" for s in built) + " |", ""]
(R / "previews/README.md").write_text("\n".join(P))
L.append(f"- from the back, one section per phone in previews/README.md | {sum(x.startswith('<a name') for x in P)} of {len(phones)} phones")
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
