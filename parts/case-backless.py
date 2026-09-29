"""`case` backless: side walls, back kept as a 1.5 mm band, universal
top-band camera rim, one button slot per side."""

import runpy
from pathlib import Path

STYLE = {"BUTTONS": "slot", "CAMERA": "universal", "BACK_BAND": 1.5}

ns = runpy.run_path(str(Path(__file__).with_name("case.py")),
                    init_globals={**STYLE, "PHONE": globals().get("PHONE", "17e")})
part, GLASS = ns["part"], ns["GLASS"]
