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

previews | from the back, one row per phone
- 5s | sheet has no corner profile
- se-2-3 | sheet has no corner profile
- 12-mini | ![case](previews/12-mini/case.png) ![slot](previews/12-mini/slot.png) ![magsafe](previews/12-mini/magsafe.png) ![sides](previews/12-mini/sides.png) ![corners](previews/12-mini/corners.png) ![frame](previews/12-mini/frame.png) ![backless](previews/12-mini/backless.png) ![plateframe](previews/12-mini/plateframe.png) ![plate](previews/12-mini/plate.png) ![corner](previews/12-mini/corner.png)
- 12 | ![case](previews/12/case.png) ![slot](previews/12/slot.png) ![magsafe](previews/12/magsafe.png) ![sides](previews/12/sides.png) ![corners](previews/12/corners.png) ![frame](previews/12/frame.png) ![backless](previews/12/backless.png) ![plateframe](previews/12/plateframe.png) ![plate](previews/12/plate.png) ![spine](previews/12/spine.png) ![slider](previews/12/slider.png) ![cig](previews/12/cig.png) ![corner](previews/12/corner.png)
- 12-pro | ![case](previews/12-pro/case.png) ![slot](previews/12-pro/slot.png) ![magsafe](previews/12-pro/magsafe.png) ![sides](previews/12-pro/sides.png) ![corners](previews/12-pro/corners.png) ![frame](previews/12-pro/frame.png) ![backless](previews/12-pro/backless.png) ![plateframe](previews/12-pro/plateframe.png) ![plate](previews/12-pro/plate.png) ![cig](previews/12-pro/cig.png) ![corner](previews/12-pro/corner.png)
- 12-pro-max | ![case](previews/12-pro-max/case.png) ![slot](previews/12-pro-max/slot.png) ![magsafe](previews/12-pro-max/magsafe.png) ![sides](previews/12-pro-max/sides.png) ![corners](previews/12-pro-max/corners.png) ![frame](previews/12-pro-max/frame.png) ![backless](previews/12-pro-max/backless.png) ![plateframe](previews/12-pro-max/plateframe.png) ![plate](previews/12-pro-max/plate.png) ![cig](previews/12-pro-max/cig.png) ![corner](previews/12-pro-max/corner.png)
- 13-mini | ![case](previews/13-mini/case.png) ![slot](previews/13-mini/slot.png) ![magsafe](previews/13-mini/magsafe.png) ![sides](previews/13-mini/sides.png) ![corners](previews/13-mini/corners.png) ![frame](previews/13-mini/frame.png) ![backless](previews/13-mini/backless.png) ![plateframe](previews/13-mini/plateframe.png) ![plate](previews/13-mini/plate.png) ![corner](previews/13-mini/corner.png)
- 13 | ![case](previews/13/case.png) ![slot](previews/13/slot.png) ![magsafe](previews/13/magsafe.png) ![sides](previews/13/sides.png) ![corners](previews/13/corners.png) ![frame](previews/13/frame.png) ![backless](previews/13/backless.png) ![plateframe](previews/13/plateframe.png) ![plate](previews/13/plate.png) ![cig](previews/13/cig.png) ![corner](previews/13/corner.png)
- 13-pro | ![case](previews/13-pro/case.png) ![slot](previews/13-pro/slot.png) ![magsafe](previews/13-pro/magsafe.png) ![sides](previews/13-pro/sides.png) ![corners](previews/13-pro/corners.png) ![frame](previews/13-pro/frame.png) ![backless](previews/13-pro/backless.png) ![plateframe](previews/13-pro/plateframe.png) ![plate](previews/13-pro/plate.png) ![cig](previews/13-pro/cig.png) ![corner](previews/13-pro/corner.png)
- 13-pro-max | ![case](previews/13-pro-max/case.png) ![slot](previews/13-pro-max/slot.png) ![magsafe](previews/13-pro-max/magsafe.png) ![sides](previews/13-pro-max/sides.png) ![corners](previews/13-pro-max/corners.png) ![frame](previews/13-pro-max/frame.png) ![backless](previews/13-pro-max/backless.png) ![plateframe](previews/13-pro-max/plateframe.png) ![plate](previews/13-pro-max/plate.png) ![cig](previews/13-pro-max/cig.png) ![corner](previews/13-pro-max/corner.png)
- 14 | ![case](previews/14/case.png) ![slot](previews/14/slot.png) ![magsafe](previews/14/magsafe.png) ![sides](previews/14/sides.png) ![corners](previews/14/corners.png) ![frame](previews/14/frame.png) ![backless](previews/14/backless.png) ![plateframe](previews/14/plateframe.png) ![plate](previews/14/plate.png) ![cig](previews/14/cig.png) ![corner](previews/14/corner.png)
- 14-plus | ![case](previews/14-plus/case.png) ![slot](previews/14-plus/slot.png) ![magsafe](previews/14-plus/magsafe.png) ![sides](previews/14-plus/sides.png) ![corners](previews/14-plus/corners.png) ![frame](previews/14-plus/frame.png) ![backless](previews/14-plus/backless.png) ![plateframe](previews/14-plus/plateframe.png) ![plate](previews/14-plus/plate.png) ![cig](previews/14-plus/cig.png) ![corner](previews/14-plus/corner.png)
- 14-pro | ![case](previews/14-pro/case.png) ![slot](previews/14-pro/slot.png) ![magsafe](previews/14-pro/magsafe.png) ![sides](previews/14-pro/sides.png) ![corners](previews/14-pro/corners.png) ![frame](previews/14-pro/frame.png) ![backless](previews/14-pro/backless.png) ![plateframe](previews/14-pro/plateframe.png) ![plate](previews/14-pro/plate.png) ![cig](previews/14-pro/cig.png) ![corner](previews/14-pro/corner.png)
- 14-pro-max | ![case](previews/14-pro-max/case.png) ![slot](previews/14-pro-max/slot.png) ![magsafe](previews/14-pro-max/magsafe.png) ![sides](previews/14-pro-max/sides.png) ![corners](previews/14-pro-max/corners.png) ![frame](previews/14-pro-max/frame.png) ![backless](previews/14-pro-max/backless.png) ![plateframe](previews/14-pro-max/plateframe.png) ![plate](previews/14-pro-max/plate.png) ![cig](previews/14-pro-max/cig.png) ![corner](previews/14-pro-max/corner.png)
- 15 | ![case](previews/15/case.png) ![slot](previews/15/slot.png) ![magsafe](previews/15/magsafe.png) ![sides](previews/15/sides.png) ![corners](previews/15/corners.png) ![frame](previews/15/frame.png) ![backless](previews/15/backless.png) ![plateframe](previews/15/plateframe.png) ![plate](previews/15/plate.png) ![cig](previews/15/cig.png) ![corner](previews/15/corner.png)
- 15-plus | ![case](previews/15-plus/case.png) ![slot](previews/15-plus/slot.png) ![magsafe](previews/15-plus/magsafe.png) ![sides](previews/15-plus/sides.png) ![corners](previews/15-plus/corners.png) ![frame](previews/15-plus/frame.png) ![backless](previews/15-plus/backless.png) ![plateframe](previews/15-plus/plateframe.png) ![plate](previews/15-plus/plate.png) ![cig](previews/15-plus/cig.png) ![corner](previews/15-plus/corner.png)
- 15-pro | ![case](previews/15-pro/case.png) ![slot](previews/15-pro/slot.png) ![magsafe](previews/15-pro/magsafe.png) ![sides](previews/15-pro/sides.png) ![corners](previews/15-pro/corners.png) ![frame](previews/15-pro/frame.png) ![backless](previews/15-pro/backless.png) ![plateframe](previews/15-pro/plateframe.png) ![plate](previews/15-pro/plate.png) ![cig](previews/15-pro/cig.png) ![corner](previews/15-pro/corner.png)
- 15-pro-max | ![case](previews/15-pro-max/case.png) ![slot](previews/15-pro-max/slot.png) ![magsafe](previews/15-pro-max/magsafe.png) ![sides](previews/15-pro-max/sides.png) ![corners](previews/15-pro-max/corners.png) ![frame](previews/15-pro-max/frame.png) ![backless](previews/15-pro-max/backless.png) ![plateframe](previews/15-pro-max/plateframe.png) ![plate](previews/15-pro-max/plate.png) ![cig](previews/15-pro-max/cig.png) ![corner](previews/15-pro-max/corner.png)
- 16 | ![case](previews/16/case.png) ![slot](previews/16/slot.png) ![magsafe](previews/16/magsafe.png) ![sides](previews/16/sides.png) ![corners](previews/16/corners.png) ![frame](previews/16/frame.png) ![backless](previews/16/backless.png) ![plateframe](previews/16/plateframe.png) ![plate](previews/16/plate.png) ![cig](previews/16/cig.png) ![corner](previews/16/corner.png)
- 16-plus | ![case](previews/16-plus/case.png) ![slot](previews/16-plus/slot.png) ![magsafe](previews/16-plus/magsafe.png) ![sides](previews/16-plus/sides.png) ![corners](previews/16-plus/corners.png) ![frame](previews/16-plus/frame.png) ![backless](previews/16-plus/backless.png) ![plateframe](previews/16-plus/plateframe.png) ![plate](previews/16-plus/plate.png) ![cig](previews/16-plus/cig.png) ![corner](previews/16-plus/corner.png)
- 16e | ![case](previews/16e/case.png) ![slot](previews/16e/slot.png) ![magsafe](previews/16e/magsafe.png) ![sides](previews/16e/sides.png) ![corners](previews/16e/corners.png) ![frame](previews/16e/frame.png) ![backless](previews/16e/backless.png) ![plateframe](previews/16e/plateframe.png) ![plate](previews/16e/plate.png) ![spine](previews/16e/spine.png) ![slider](previews/16e/slider.png) ![cig](previews/16e/cig.png) ![corner](previews/16e/corner.png)
- 16-pro | ![case](previews/16-pro/case.png) ![slot](previews/16-pro/slot.png) ![magsafe](previews/16-pro/magsafe.png) ![sides](previews/16-pro/sides.png) ![corners](previews/16-pro/corners.png) ![frame](previews/16-pro/frame.png) ![backless](previews/16-pro/backless.png) ![plateframe](previews/16-pro/plateframe.png) ![plate](previews/16-pro/plate.png) ![cig](previews/16-pro/cig.png) ![corner](previews/16-pro/corner.png)
- 16-pro-max | ![case](previews/16-pro-max/case.png) ![slot](previews/16-pro-max/slot.png) ![magsafe](previews/16-pro-max/magsafe.png) ![sides](previews/16-pro-max/sides.png) ![corners](previews/16-pro-max/corners.png) ![frame](previews/16-pro-max/frame.png) ![backless](previews/16-pro-max/backless.png) ![plateframe](previews/16-pro-max/plateframe.png) ![plate](previews/16-pro-max/plate.png) ![cig](previews/16-pro-max/cig.png) ![corner](previews/16-pro-max/corner.png)
- 17 | ![case](previews/17/case.png) ![slot](previews/17/slot.png) ![magsafe](previews/17/magsafe.png) ![sides](previews/17/sides.png) ![corners](previews/17/corners.png) ![frame](previews/17/frame.png) ![backless](previews/17/backless.png) ![plateframe](previews/17/plateframe.png) ![plate](previews/17/plate.png) ![cig](previews/17/cig.png) ![corner](previews/17/corner.png)
- 17e | ![case](previews/17e/case.png) ![slot](previews/17e/slot.png) ![magsafe](previews/17e/magsafe.png) ![sides](previews/17e/sides.png) ![corners](previews/17e/corners.png) ![frame](previews/17e/frame.png) ![backless](previews/17e/backless.png) ![plateframe](previews/17e/plateframe.png) ![plate](previews/17e/plate.png) ![spine](previews/17e/spine.png) ![slider](previews/17e/slider.png) ![cig](previews/17e/cig.png) ![corner](previews/17e/corner.png)
- air | ![frame](previews/air/frame.png) ![backless](previews/air/backless.png) ![plateframe](previews/air/plateframe.png) ![plate](previews/air/plate.png)
- 17-pro | ![frame](previews/17-pro/frame.png) ![backless](previews/17-pro/backless.png) ![plateframe](previews/17-pro/plateframe.png) ![plate](previews/17-pro/plate.png)
- 17-pro-max | ![frame](previews/17-pro-max/frame.png) ![backless](previews/17-pro-max/backless.png) ![plateframe](previews/17-pro-max/plateframe.png) ![plate](previews/17-pro-max/plate.png)
- 18-pro | ![frame](previews/18-pro/frame.png) ![backless](previews/18-pro/backless.png) ![plateframe](previews/18-pro/plateframe.png) ![plate](previews/18-pro/plate.png)
- 18-pro-max | ![frame](previews/18-pro-max/frame.png) ![backless](previews/18-pro-max/backless.png) ![plateframe](previews/18-pro-max/plateframe.png) ![plate](previews/18-pro-max/plate.png)

requirements
- `pip install -r requirements.txt` | numpy, pymupdf and the python module of the modelling tool | libegl for headless previews

license mit
