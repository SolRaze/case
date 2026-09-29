"""`case` frame with a rebate for a swap-in back plate, `case-plate`."""

import runpy
from pathlib import Path

STYLE = {"BUTTONS": "slot", "CAMERA": "universal", "BACK_BAND": 8.0, "PLATE": True}

ns = runpy.run_path(str(Path(__file__).with_name("case.py")),
                    init_globals={**STYLE, "PHONE": globals().get("PHONE", "17e")})
part, GLASS = ns["part"], ns["GLASS"]
