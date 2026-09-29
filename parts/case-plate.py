"""Swap-in back plate for `case-plateframe`, 1 mm, dropped in from the phone
side and held by the phone. Print a blank, then emboss or cut it."""

import runpy
from pathlib import Path

STYLE = {"BUTTONS": "slot", "CAMERA": "universal", "BACK_BAND": 8.0, "PLATE": True}

ns = runpy.run_path(str(Path(__file__).with_name("case.py")),
                    init_globals={**STYLE, "PHONE": globals().get("PHONE", "17e")})
part = ns["plate"]
