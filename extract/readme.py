"""Write README.md, previews/README.md and ref/README.md from styles.json, ref/rules.json, the
refs and the built previews. Run after ./build --all or any ref change."""

import json
from pathlib import Path

R = Path(__file__).resolve().parents[1]
styles = json.loads((R / "blender/styles.json").read_text())
rules = json.loads((R / "ref/rules.json").read_text())
phones = list(json.loads((R / "ref/iphone/sizes.json").read_text())["phones"])

L = []
L += ["case", "",
      "parametric iphone case for any phone in ref/iphone | 3d-printable stl | apple dimensional drawing data for every product on the accessories drawings page", "",
      "layout",
      "- blender/ | case.py print source: constants, geometry, checks, stl export, previews | styles.json styles as named knob sets",
      "- build | every phone x style, one process per phone, to out/<phone>/<style>.stl and previews/<phone>/<style>.png",
      "- ref/rules.json | knob defaults, invalid combinations and why, guideline limits | extract/rules.py reads it",
      "- ref/ | drawing data per product family, one json per model | index in ref/README.md",
      "- extract/ | phone loader, drawing fetch and reading tools, body solid and its check against the drawing", "",
      "run",
      "- `./build` 17e, every style | `./build magsafe frame` | `./build --phone 16 --phone air` | `./build --all`",
      "- `./build --check` no output files | `--no-png` stl only",
      "- `python extract/rules.py` phone x style table | `--write` refresh the invalid table | `--verify`",
      "- `python extract/fetch.py` drawings and guidelines into extract/pdf/, not committed",
      "- `python extract/readme.py` rewrite the readmes from styles, rules, refs and previews", "",
      "styles"]
L += [f"- {n} | {s['about']}" for n, s in styles.items()]
L += ["", "knobs"]
L += [f"- {k} | default {json.dumps(v['default'])} | {v['values'] if isinstance(v['values'], str) else ' '.join(json.dumps(x) for x in v['values'])}"
      for k, v in rules["knobs"].items()]
L += ["", "rules | a style breaking one is skipped by build, with the reason"]
for r in rules["combinations"]:
    L.append(f"- {r['id']} | if {json.dumps(r['if'])} require {json.dumps(r['require'])} | {r['why']}")
for r in rules["phones"]:
    ph = ", ".join(r["phones"]) or "none"
    cond = f"if {json.dumps(r['if'])} " if r.get("if") else ""
    L.append(f"- {r['id']} | {cond}{r['why']} | {ph}")
L += ["", "limits | apple accessory design guidelines, checked on every build"]
for r in rules["limits"]:
    lim = " ".join(f"{k} {r[k]}" for k in ("min", "ideal", "max") if k in r)
    L.append(f"- {r['id']} | {r['rule']}{' | ' + lim if lim else ''} | {r['case']} | {r['source']}")
L += ["", "checks", "- every build: closed mesh, one solid, glass gap >= 0.85 for front glass, lens cover, back glass",
      f"- {sum(1 for p in phones for s in styles if not (rules['invalid'].get(p, {}).get(s)))} of {len(phones) * len(styles)} phone x style build and pass | the rest are in ref/rules.json invalid", "",
      "previews | from the back, grid in previews/README.md"]
P = ["previews", "", "one section per phone, every style that builds, seen from the back | ./build writes them", ""]
for p in phones:
    built = [s for s in styles if (R / f"previews/{p}/{s}.png").exists()]
    if built:
        L.append(f"- [{p}](previews/README.md#{p}) | {len(built)} styles")
        P += [f'<a name="{p}"></a>{p}', "", "| " + " | ".join(built) + " |", "|" + "---|" * len(built),
              "| " + " | ".join(f"![{s}]({p}/{s}.png)" for s in built) + " |", ""]
    else:
        L.append(f"- {p} | none, {', '.join(sorted(set(rules['invalid'][p].values())))}")
(R / "previews/README.md").write_text("\n".join(P))
L += ["", "requirements", "- `pip install -r requirements.txt` | numpy, pymupdf and the python module of the modelling tool | libegl for headless previews", "",
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
     "- pdfs from the source urls, fetched by extract/fetch.py into extract/pdf/, not committed",
     "- iphone/sizes.json | main-sheet summary of every iphone, what the case loader reads",
     "- rules.json | case knob rules and guideline limits", "- each json lists what was read by eye under unverified", ""]
for k in sorted(fam):
    X += [k, "", "| model | file | sheet date | source |", "|---|---|---|---|"]
    for prod, path, date, url in sorted(fam[k], key=lambda t: t[2] or "", reverse=True):
        X.append(f"| {prod} | [{path.name}]({path}) | {date or '-'} | {url or '-'} |")
    X.append("")
(R / "ref/README.md").write_text("\n".join(X))
print(len(L), sum(len(v) for v in fam.values()))
