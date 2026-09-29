case

parametric iphone case | print source for any phone in ref/iphone | apple dimensional drawing data

layout
- blender/ case.py print source | styles.json named knob sets
- extract/ phone loader | phone body solid from a drawing json | pdf fetch and reading tools
- ref/ drawing data per product family | iphone | ipad | watch | airpods | magsafe | mac | tv | vision
- build | every phone x style to out/<phone>/<style>.stl and previews/

run
- `./build` | `./build magsafe` | `./build --phone 16 --all --check`

requirements
- blender as the python module bpy | numpy | pymupdf | libegl for headless previews
