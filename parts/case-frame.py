"""`case` as a frame: back kept as an 8 mm band round the edge, universal
top-band camera window, one button slot per side."""

import runpy
from pathlib import Path

STYLE = {"BUTTONS": "slot", "CAMERA": "universal", "BACK_BAND": 8.0}

ns = runpy.run_path(str(Path(__file__).with_name("case.py")),
                    init_globals={**STYLE, "PHONE": globals().get("PHONE", "17e")})
part, GLASS = ns["part"], ns["GLASS"]
