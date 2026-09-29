case

parametric iphone case | build123d print source | blender mirror | apple dimensional drawing data

layout
- parts/ build123d case | case-17e.py base | case-17e-*.py presets as knob sets
- blender/ case.py | same geometry in blender for any phone in ref/iphone/sizes.json
- extract/ phone body solid from a drawing json | check against the drawn pdf
- ref/ drawing data per product family | iphone | watch | airpods | mac | one json per model
- build | runs every part | writes step and stl to out/

run
- `./build` | `./build case-17e-magsafe` | `./build --check`
- `Blender --background --factory-startup --python blender/case.py -- --all`

state
- case geometry pinned to 17e | PHONE knob pending
- ref extraction ongoing | newest models first | pdfs not committed
