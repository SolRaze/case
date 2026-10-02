case

parametric iphone case for any phone in ref/iphone | 3d-printable stl | apple dimensional drawing data for every product on the accessories drawings page

layout
- case.py | the case: geometry, checks, stl export, previews, command line
- phone.py | a phone from ref/iphone | rules.py and rules.json | which knobs build, and the guideline limits
- styles.json | styles as named knob sets
- ref/ | drawing data per product, one json per model, index in ref/README.md
- laptop/ | MS-16W1 mainboard measured off a pegboard, findings in laptop/README.md
- previews/ | every build seen from the back | tools/ | drawing fetch and reading, phone body check, readme writer

run
- `python case.py` 17e, every style | `python case.py magsafe frame` | `--phone 16 --phone air` | `--all`
- `--check` no output files | `--no-png` stl only | stl to out/, not committed
- `python rules.py` phone x style table | `--write` refresh the invalid table | `--verify`
- `python tools/fetch.py` drawings and guidelines into pdf/, not committed
- `python tools/readme.py` rewrite the readmes

styles
- base | the template every phone gets: flat outside, 1.0 mm back skin under lengthwise channels on the phone side that run out into the camera window; every button a flexure key; 1.0 mm corner bumpers
- case | full case: a window per button, fitted camera ring, full back
- slot | one button slot per side, fitted camera, full back
- magsafe | pockets for the ADG 42.1 magnet array, glued in from the phone side; action and side buttons as flexure keys where the phone has them
- sides | top and bottom walls open between the corners
- corners | held at the four corners, full back, walls open between them and rounded at the ends
- frame | back kept as an 8 mm band round the edge, the camera ring on an island swept into it
- edge | edge only: the walls and a 1.5 mm lip of back round the edge, the camera open
- plateframe | frame with a rebate for the swap-in back plate
- plate | 1 mm swap-in back plate for plateframe, dropped in from the phone side and held by the phone
- spine | 1.5 mm band and a full-width strip across the fitted camera ring carrying slider rails
- slider | lens cover for spine, printed flat on its outside face, slides down clear of the lens and flash keepouts
- leather | printed core for a 0.6 mm leather skin glued over the full back and walls: 0.95 mm walls, 1.4 mm back, 1.8 and 2.0 with the skin on; camera ring and a 1.5 mm rim band stand flush with the skin and cover its edges
- cig | snap clip for one unlit cigarette along the right edge of the back; PETG softens near 80 C
- corner | bottom-right corner only, 45 mm of each edge: squircle corner, USB-C edge and speaker group, a fit test that prints in minutes
- ribs | full case, ribbed back: 1.2 mm between 1.2 mm ribs on a 10 mm grid, 2.0 at the ribs
- ribcorner | the corner coupon with a ribbed back: 1.2 mm between 1.2 mm ribs on a 10 mm grid, 2.0 at the ribs
- flip | full case carrying a front cover on a 3DS-style hinge along the left edge: two end knuckles, stop shelves for the cover open flat at 180, 1.5 mm corner bumpers
- cover | 2 mm front cover for flip, its barrel runs between the case's knuckles on a 1.75 filament pin

knobs
- BUTTONS | default "windows" | "windows" "slot"
- KEYS | default [] | button names; names a phone lacks are dropped
- CLOSED | default [] | button names, none shared with KEYS
- BACK_BAND | default null | null (full back) or mm of back kept round the edge
- RING | default true | false true
- PLATE | default false | false true
- WALLS | default "full" | "full" "sides" "corners"
- MAGSAFE | default null | null "ring" "open"
- SLIDER | default false | false true
- CIG | default false | false true
- COUPON | default null | null or mm of each edge kept round the bottom-right corner
- FLIP | default false | false true
- RIBS | default null | null (solid back) or mm pocketed out of the back between ribs
- RIB_SIDE | default "out" | "out" "in"
- BUMPER | default null | null or mm the outside bulges out round each corner
- LEATHER | default null | null or mm of leather glued over the outside

design
- The outside is one rounded shape: a 1.55 mm wall rolling into the back over 3.0 mm, a 0.8 mm round on the front rim, and the rim opening flared 0.4 mm.
- The camera opening hugs every lens and the plateau they stand on, 1.2 mm out; flash and mic outside it get their own hole. A full-width plateau opens the top of the back, its top corners and rim kept.
- The camera ring stands 1.0 mm past the lens: a flat 1.5 mm top, its outside rounded; the camera and flash holes chamfer 0.4 mm at their outside edge, every other opening in the back rounds out 0.75 mm.
- A banded back keeps the camera ring on an island swept out to the band, every inside corner filleted at 6 mm, so each opening is one curve.
- Open walls end in a 5 mm round into the back and a 2 mm round over the rim top.
- Button windows and port openings are obround; a flexure key hinges toward the larger gap to the next button. The receiver gets a shallow dip in the top rim that eases back up over 4 mm each side.
- Styles only change knobs, so every style shares this shape.

rules | build skips a phone and style that break one, and says which
- The slider and MagSafe don't mix: the rails run down to y -52 and the charger's top edge sits at -45.
- The magnets and the charger hole need the full back round them.
- A back plate needs a banded back to sit in.
- Keys need side walls, so they don't work with corner-only walls.
- A button is either a key or closed over, never both.
- Ribs pocket the full back; the magnets need it solid.
- The hinge knuckles stand on the left wall, so the flip cover needs it.
- A leather skin needs a plain outside: full walls, no ribs, bumpers or MagSafe magnets.
- Leaving the camera without a ring needs a banded back, and no slider or leather skin.
- Phones whose sheet has no corner profile can't be built. Ruled out: 5s.
- The slider can't cover a full-width camera plateau. Fits only se-2-3, 12, 16e, 17e.
- The slider needs room for its right rail beside the camera. Fits only se-2-3, 12, 16e, 17e.
- The cigarette clip needs a phone long enough to hold it. Ruled out: 12-mini, 13-mini.
- The flip cover's top knuckle starts 1 mm past the corner arc and must clear the left buttons. Ruled out: 12-mini, 12, 12-pro, 13-mini, se-2-3.

limits | from the apple accessory design guidelines and the phone sheets, checked on every build
- Any exposed glass stays at least 0.85 mm, ideally 1.0, off a flat table; the rim and camera ring stand 1.0 proud. (ADG 5.1.1)
- The back of the case is 2.0 mm thick, under the 2.1 each phone sheet allows (5.0 on the SE). (note 8 on every iPhone sheet)
- The bottom wall is 1.55 mm, under the 1.8 mm docks and cables allow. (ADG 5.1.3)
- MagSafe magnets sit 0.85 mm from the outside face at most. (ADG 42.1 fig 42-3)
- Every lens and flash light cone is cut clear, with the fit clearance added. (ADG 5.7.1 and each sheet's keepout cones)
- The USB-C connector keepout is cut through the bottom wall, with the fit clearance added. (each sheet, ADG 5.1.2.3)
- Speaker and mic openings reach 2.0 mm past the port, with a 45 degree chamfer outside and a 0.6 mm straight land. (ADG 5.2.3.1)
- The front rim reaches 0.5 mm over the phone's rolled edge: more than the 0.25 clearance so it holds the phone, and short of the glass edge at 1.05. (17e sheet, glass edge 1.05 in)

checks
- every build: closed mesh, one solid, glass gap >= 0.85 for front glass, lens cover, back glass
- 489 of 570 phone x style build and pass | the rest are in rules.json invalid

previews | from the back, grid in previews/README.md
- 5s | none, sheet has no corner profile
- [se-2-3](previews/README.md#se-2-3) | 17 styles
- [12-mini](previews/README.md#12-mini) | 13 styles
- [12](previews/README.md#12) | 16 styles
- [12-pro](previews/README.md#12-pro) | 14 styles
- [12-pro-max](previews/README.md#12-pro-max) | 16 styles
- [13-mini](previews/README.md#13-mini) | 13 styles
- [13](previews/README.md#13) | 16 styles
- [13-pro](previews/README.md#13-pro) | 16 styles
- [13-pro-max](previews/README.md#13-pro-max) | 16 styles
- [14](previews/README.md#14) | 16 styles
- [14-plus](previews/README.md#14-plus) | 16 styles
- [14-pro](previews/README.md#14-pro) | 16 styles
- [14-pro-max](previews/README.md#14-pro-max) | 16 styles
- [15](previews/README.md#15) | 16 styles
- [15-plus](previews/README.md#15-plus) | 16 styles
- [15-pro](previews/README.md#15-pro) | 16 styles
- [15-pro-max](previews/README.md#15-pro-max) | 16 styles
- [16](previews/README.md#16) | 16 styles
- [16-plus](previews/README.md#16-plus) | 16 styles
- [16e](previews/README.md#16e) | 18 styles
- [16-pro](previews/README.md#16-pro) | 16 styles
- [16-pro-max](previews/README.md#16-pro-max) | 16 styles
- [17](previews/README.md#17) | 17 styles
- [17e](previews/README.md#17e) | 19 styles
- [air](previews/README.md#air) | 17 styles
- [17-pro](previews/README.md#17-pro) | 17 styles
- [17-pro-max](previews/README.md#17-pro-max) | 16 styles
- [18-pro](previews/README.md#18-pro) | 16 styles
- [18-pro-max](previews/README.md#18-pro-max) | 16 styles

requirements
- `pip install -r requirements.txt` | blender's python module, numpy, pymupdf | libegl for headless previews

license mit
