case

parametric iphone case for any phone in ref/iphone | 3d-printable stl | apple dimensional drawing data for every product on the accessories drawings page

layout
- case.py | the case: geometry, checks, stl export, previews, command line
- phone.py | a phone from ref/iphone | rules.py and rules.json | which knobs build, and the guideline limits
- styles.json | styles as named knob sets
- ref/ | drawing data per product, one json per model, index in ref/README.md
- previews/ | every build seen from the back | tools/ | drawing fetch and reading, phone body check, readme writer

run
- `python case.py` 17e, every style | `python case.py magsafe frame` | `--phone 16 --phone air` | `--all`
- `--check` no output files | `--no-png` stl only | stl to out/, not committed
- `python rules.py` phone x style table | `--write` refresh the invalid table | `--verify`
- `python tools/fetch.py` drawings and guidelines into pdf/, not committed
- `python tools/readme.py` rewrite the readmes

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
- ribcorner | the corner coupon with a ribbed back: 1.2 mm between 1.2 mm ribs on a 10 mm grid, 2.0 at the ribs

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
- RIBS | default null | null (solid back) or mm pocketed out of the back between ribs

design
- The outside is one rounded shape: a 1.8 mm round on the back edge, a 0.8 mm round on the front rim, and the rim opening flared 0.4 mm.
- The camera bump (the lenses and any plateau) gets a round window with a rounded ring 1.5 mm wide, standing 1.0 mm past the lens; a flash or mic outside the bump gets its own flush hole, and the flash light cone is cut as a shallow countersink round it.
- Button windows and port openings are obround; the receiver gets a shallow dip in the top rim that eases back up over 4 mm each side.
- Styles only change knobs, so every style shares this shape.

rules | build skips a phone and style that break one, and says which
- The slider needs the fitted camera ring; it slides over that window.
- The slider and MagSafe don't mix: the rails run down to y -52 and the charger's top edge sits at -45.
- MagSafe needs the full back, since the magnets and the charger both sit on it.
- A back plate needs a banded back to sit in.
- Keys need side walls, so they don't work with corner-only walls.
- A button is either a key or closed over, never both.
- Ribs pocket the full back; the magnets need it solid.
- Phones whose sheet has no corner profile can't be built. Ruled out: 5s, se-2-3.
- Phones with a full-width camera plateau need the universal camera window. Ruled out: air, 17-pro, 17-pro-max, 18-pro, 18-pro-max.
- The slider needs room for its right rail beside the camera. Fits only 12, 16e, 17e.
- The cigarette clip needs a phone long enough to hold it. Ruled out: 12-mini, 13-mini.
- The universal window only works when the camera sits within 48 mm of the top. Ruled out: none.

limits | from the apple accessory design guidelines and the phone sheets, checked on every build
- Any exposed glass stays at least 0.85 mm, ideally 1.0, off a flat table; the rim and camera ring stand 1.0 proud. (ADG 5.1.1)
- The back of the case is 2.0 mm thick, under the 2.1 each phone sheet allows (5.0 on the SE). (note 8 on every iPhone sheet)
- The bottom wall is 1.8 mm, the most docks and cables allow. (ADG 5.1.3)
- MagSafe magnets sit 0.85 mm from the outside face at most. (ADG 42.1 fig 42-3)
- Every lens and flash light cone is cut clear, with the fit clearance added. (ADG 5.7.1 and each sheet's keepout cones)
- The USB-C connector keepout is cut through the bottom wall, with the fit clearance added. (each sheet, ADG 5.1.2.3)
- Speaker and mic openings reach 2.0 mm past the port, with a 45 degree chamfer outside and a 0.6 mm straight land. (ADG 5.2.3.1)
- The front rim reaches 0.5 mm over the phone's rolled edge: more than the 0.25 clearance so it holds the phone, and short of the glass edge at 1.05. (17e sheet, glass edge 1.05 in)

checks
- every build: closed mesh, one solid, glass gap >= 0.85 for front glass, lens cover, back glass
- 300 of 420 phone x style build and pass | the rest are in rules.json invalid

previews | from the back, grid in previews/README.md
- 5s | none, sheet has no corner profile
- se-2-3 | none, sheet has no corner profile
- [12-mini](previews/README.md#12-mini) | 11 styles
- [12](previews/README.md#12) | 14 styles
- [12-pro](previews/README.md#12-pro) | 12 styles
- [12-pro-max](previews/README.md#12-pro-max) | 12 styles
- [13-mini](previews/README.md#13-mini) | 11 styles
- [13](previews/README.md#13) | 12 styles
- [13-pro](previews/README.md#13-pro) | 12 styles
- [13-pro-max](previews/README.md#13-pro-max) | 12 styles
- [14](previews/README.md#14) | 12 styles
- [14-plus](previews/README.md#14-plus) | 12 styles
- [14-pro](previews/README.md#14-pro) | 12 styles
- [14-pro-max](previews/README.md#14-pro-max) | 12 styles
- [15](previews/README.md#15) | 12 styles
- [15-plus](previews/README.md#15-plus) | 12 styles
- [15-pro](previews/README.md#15-pro) | 12 styles
- [15-pro-max](previews/README.md#15-pro-max) | 12 styles
- [16](previews/README.md#16) | 12 styles
- [16-plus](previews/README.md#16-plus) | 12 styles
- [16e](previews/README.md#16e) | 14 styles
- [16-pro](previews/README.md#16-pro) | 12 styles
- [16-pro-max](previews/README.md#16-pro-max) | 12 styles
- [17](previews/README.md#17) | 12 styles
- [17e](previews/README.md#17e) | 14 styles
- [air](previews/README.md#air) | 4 styles
- [17-pro](previews/README.md#17-pro) | 4 styles
- [17-pro-max](previews/README.md#17-pro-max) | 4 styles
- [18-pro](previews/README.md#18-pro) | 4 styles
- [18-pro-max](previews/README.md#18-pro-max) | 4 styles

requirements
- `pip install -r requirements.txt` | blender's python module, numpy, pymupdf | libegl for headless previews

license mit
