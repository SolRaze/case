"""`case` backless round a spine: a 1.5 mm band, a full-width strip across the
fitted camera ring, and slider rails on it. The slider is `case-slider`."""

import runpy
from pathlib import Path

STYLE = {"BUTTONS": "slot", "BACK_BAND": 1.5, "SLIDER": True}

ns = runpy.run_path(str(Path(__file__).with_name("case.py")),
                    init_globals={**STYLE, "PHONE": globals().get("PHONE", "17e")})
part, GLASS = ns["part"], ns["GLASS"]
