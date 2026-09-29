case

parametric iphone case for any phone in ref/iphone | 3d-printable stl | apple dimensional drawing data for every product on the accessories drawings page

layout
- blender/ | case.py print source: constants, geometry, checks, stl export, previews | styles.json styles as named knob sets
- build | every phone x style, one process per phone, to out/<phone>/<style>.stl and previews/<phone>/<style>.png
- ref/rules.json | knob defaults, invalid combinations and why, guideline limits | extract/rules.py reads it
- ref/ | drawing data per product family, one json per model | index in ref/README.md
- extract/ | phone loader, drawing fetch and reading tools, body solid and its check against the drawing

run
- `./build` 17e, every style | `./build magsafe frame` | `./build --phone 16 --phone air` | `./build --all`
- `./build --check` no output files | `--no-png` stl only
- `python extract/rules.py` phone x style table | `--write` refresh the invalid table | `--verify`
- `python extract/fetch.py` drawings and guidelines into extract/pdf/, not committed
- `python extract/readme.py` rewrite the readmes from styles, rules, refs and previews

styles
- case | full case: a window per button, fitted camera ring, full back
- slot | one button slot per side, fitted camera, full back
- magsafe | pockets for the ADG 42.1 magnet array, glued in from the phone side; action and side buttons as flexure keys where the phone has them
- sides | top and bottom walls open between the corners
- corners | held at the four corners only, walls open between them
- frame | back kept as an 8 mm band round the edge, universal top-band camera window
- backless | side walls with a 1.5 mm band of back, universal top-band camera rim
- plateframe | frame with a rebate for the swap-in back plate
- plate | 1 mm swap-in back plate for plateframe, dropped in from the phone side and held by the phone
- spine | 1.5 mm band and a full-width strip across the fitted camera ring carrying slider rails
- slider | lens cover for spine, printed flat on its outside face, slides down clear of the lens and flash keepouts
- cig | snap clip for one unlit cigarette along the right edge of the back; PETG softens near 80 C
- corner | bottom-right corner only, 45 mm of each edge: squircle corner, USB-C edge and speaker group, a fit test that prints in minutes

knobs
- BUTTONS | default "windows" | "windows" "slot"
- KEYS | default [] | button names; names a phone lacks are dropped
- CLOSED | default [] | button names, none shared with KEYS
- CAMERA | default "fitted" | "fitted" "universal"
- BACK_BAND | default null | null (full back) or mm of back kept round the edge
- PLATE | default false | false true
- WALLS | default "full" | "full" "sides" "corners"
- MAGSAFE | default null | null "ring" "open"
- SLIDER | default false | false true
- CIG | default false | false true
- COUPON | default null | null or mm of each edge kept round the bottom-right corner

rules | a style breaking one is skipped by build, with the reason
- slider-fitted | if {"SLIDER": true} require {"CAMERA": "fitted"} | the slider covers a fitted window
- slider-no-magsafe | if {"SLIDER": true} require {"MAGSAFE": null} | slider rails reach y -52, a charger's top edge is at -45
- magsafe-full-back | if {"MAGSAFE": ["ring", "open"]} require {"BACK_BAND": null} | magnets and the charger need the full back
- plate-band | if {"PLATE": true} require {"BACK_BAND": "set"} | the plate sits in a banded back
- keys-need-walls | if {"KEYS": "set"} require {"WALLS": ["full", "sides"]} | corner walls leave no wall for a key
- keys-closed-apart | if {"KEYS": "set", "CLOSED": "set"} require {"disjoint": ["KEYS", "CLOSED"]} | a button is either a key or covered
- corner-profile | sheet has no corner profile | 5s, se-2-3
- full-width-plateau | if {"CAMERA": "fitted"} full-width camera plateau, use CAMERA universal | air, 17-pro, 17-pro-max, 18-pro, 18-pro-max
- rail-fit | if {"SLIDER": true} right rail falls off the case | 12-mini, 12-pro, 12-pro-max, 13-mini, 13, 13-pro, 13-pro-max, 14, 14-plus, 14-pro, 14-pro-max, 15, 15-plus, 15-pro, 15-pro-max, 16, 16-plus, 16-pro, 16-pro-max, 17
- cig-fit | if {"CIG": true} cigarette clip runs off the bottom | 12-mini, 13-mini
- universal-window | if {"CAMERA": "universal"} camera reaches past the universal window | none

limits | apple accessory design guidelines, checked on every build
- glass-gap | exposed glass to any flat surface the case rests on | min 0.85 ideal 1.0 | GLASS_GAP 1.0; rim PROUD 1.0 over the front glass, camera ring 1.0 past the lens cover | ADG 5.1.1
- backside-thickness | case thickness on the back of the phone | max 2.1 | BACK 2.0 | sheet note 8 on every iPhone drawing (SE: 5.0)
- bottom-wall | case wall below the phone, for docks and cables | max 1.8 | CLEAR 0.25 + WALL 1.55 = 1.80 | ADG 5.1.3
- magsafe-magnet-depth | MagSafe magnet to the case outside | max 0.85 | MS_FLOOR 0.85, magnet 0.55 thick, 0.55 from the device | ADG 42.1 fig 42-3
- camera-keepout | lens and flash light cones clear of the case | every cone cut through the case, grown by CLEAR for the phone's shift | ADG 5.7.1 and each sheet's keepout cones
- connector-keepout | USB-C recommended connector keepout, flush to the product surface, 14.0 outward | obround keepout grown by CLEAR, through the bottom wall | each sheet, ADG 5.1.2.3
- port-openings | speaker and mic openings | PORT_OFFSET 2.0 past the port edge, 45 deg outside chamfer, PORT_LAND 0.6 straight wall (1.5 max) | ADG 5.2.3.1
- lip | rim lip over the rolled front edge clear of the glass edge | max 1.05 | LIP 0.5, and LIP > CLEAR so the phone is retained | 17e sheet, glass edge 1.05 in

checks
- every build: closed mesh, one solid, glass gap >= 0.85 for front glass, lens cover, back glass
- 277 of 390 phone x style build and pass | the rest are in ref/rules.json invalid

previews | from the back, grid in previews/README.md
- 5s | none, sheet has no corner profile
- se-2-3 | none, sheet has no corner profile
- [12-mini](previews/README.md#12-mini) | 10 styles
- [12](previews/README.md#12) | 13 styles
- [12-pro](previews/README.md#12-pro) | 11 styles
- [12-pro-max](previews/README.md#12-pro-max) | 11 styles
- [13-mini](previews/README.md#13-mini) | 10 styles
- [13](previews/README.md#13) | 11 styles
- [13-pro](previews/README.md#13-pro) | 11 styles
- [13-pro-max](previews/README.md#13-pro-max) | 11 styles
- [14](previews/README.md#14) | 11 styles
- [14-plus](previews/README.md#14-plus) | 11 styles
- [14-pro](previews/README.md#14-pro) | 11 styles
- [14-pro-max](previews/README.md#14-pro-max) | 11 styles
- [15](previews/README.md#15) | 11 styles
- [15-plus](previews/README.md#15-plus) | 11 styles
- [15-pro](previews/README.md#15-pro) | 11 styles
- [15-pro-max](previews/README.md#15-pro-max) | 11 styles
- [16](previews/README.md#16) | 11 styles
- [16-plus](previews/README.md#16-plus) | 11 styles
- [16e](previews/README.md#16e) | 13 styles
- [16-pro](previews/README.md#16-pro) | 11 styles
- [16-pro-max](previews/README.md#16-pro-max) | 11 styles
- [17](previews/README.md#17) | 11 styles
- [17e](previews/README.md#17e) | 13 styles
- [air](previews/README.md#air) | 4 styles
- [17-pro](previews/README.md#17-pro) | 4 styles
- [17-pro-max](previews/README.md#17-pro-max) | 4 styles
- [18-pro](previews/README.md#18-pro) | 4 styles
- [18-pro-max](previews/README.md#18-pro-max) | 4 styles

requirements
- `pip install -r requirements.txt` | numpy, pymupdf and the python module of the modelling tool | libegl for headless previews

license mit
