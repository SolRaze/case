case

parametric iphone case for any phone in ref/iphone | 3d-printable stl | apple dimensional drawing data for every product on the accessories drawings page

layout
- case.py | the case: geometry, checks, stl export, previews, command line
- phone.py | a phone from ref/iphone | rules.py and rules.json | which knobs build, and the guideline limits
- styles.json | styles as named knob sets
- ref/ | drawing data per product, one json per model, index in ref/README.md
- laptop/ | MS-16W1 mainboard measured off a pegboard, findings in laptop/README.md
- previews/ | every build seen from the back | tools/ | drawing fetch and reading, phone body check, readme writer
- web/ | memory card browser: every phone with a case, modelled from its drawing | edit joins, cuts and moves a part set's parts | showcase holds finished designs to remix | playground, own icon on the front page, no phone | box, cylinder, sphere, cone, torus and stl blocks joined, cut and blended in the printer's 235 x 235 x 200 mm volume | saved parts on its shelf and in edit's add part, my parts | exports stl | every key has a button in the bar | keys, touch or a controller | phones.py reads phone.py and rules.json at dev and build

run
- `python case.py` 17e, every style | `python case.py magsafe frame` | `--phone 16 --phone air` | `--all`
- `--check` no output files | `--no-png` stl only | stl to out/, not committed
- `python rules.py` phone x style table | `--write` refresh the invalid table | `--verify`
- `python tools/fetch.py` drawings and guidelines into pdf/, not committed
- `python tools/readme.py` rewrite the readmes
- web/ `npm install` | `npm run phones` writes web/phones.json, `npm run glb` packs out/ stl into web/public/glb | `npm run dev`

styles
- base | the template every phone gets, the printed fit: flat outside, 2.2 mm walls at 0.35 clearance leaning in 0.45 by the front glass plane to pinch the phone's flat sides, no lip, rim 2.0 over the glass; 1.0 mm back skin under lengthwise channels on the phone side that run out into the camera window and through the bottom wall; one window per side open up through the rim, the wall thinned round it; the bottom open from speaker to speaker up through the rim; 1.5 mm corner bumpers
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

knobs | defaults and values in rules.json knobs
- BUTTONS | KEYS | CLOSED | BACK_BAND | RING | PLATE | WALLS | MAGSAFE | SLIDER | CIG | COUPON | FLIP | RIBS | RIB_SIDE | BUMPER | LEATHER | PORT | VENT

design
- outside one rounded shape | 1.55 mm wall rolls into the back over 3.0 mm | 0.8 mm round on the front rim | rim opening flared 0.4 mm
- camera opening hugs every lens and their plateau, 1.2 mm out | flash and mic outside it get their own hole | a full-width plateau opens the top of the back, top corners and rim kept
- camera ring 1.0 mm past the lens, flat 1.5 mm top, outside rounded | camera and flash holes chamfer 0.4 mm outside | every other back opening rounds out 0.75 mm
- banded back keeps the camera ring on an island swept out to the band | inside corners filleted 6 mm, each opening one curve
- open walls end in a 5 mm round into the back and a 2 mm round over the rim top
- button windows and port openings obround | a flexure key hinges toward the larger gap to the next button | receiver gets a shallow dip in the top rim, easing back up over 4 mm each side
- styles only change knobs, every style shares this shape

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
- Vents run out of the inner channels, so they need ribs on the phone side.
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
- The front rim reaches 0.5 mm over the phone's rolled edge along the long sides: more than the 0.25 clearance so it holds the phone, and short of the glass edge at 1.05. Round the corners and across both ends it stops at the phone's outline, because only the long walls bow to let the phone past, and the cavity is 0.4 clear round each corner arc. (17e sheet, glass edge 1.05 in)

checks
- every build: closed mesh, one solid, glass gap >= 0.85 for front glass, lens cover, back glass
- 489 of 570 phone x style build and pass | the rest are in rules.json invalid

previews
- from the back, one section per phone in previews/README.md | 29 of 30 phones

requirements
- `pip install -r requirements.txt` | blender's python module, numpy, pymupdf | libegl for headless previews

license mit
