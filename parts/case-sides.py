"""`case` with the top and bottom walls open between the corners."""

import runpy
from pathlib import Path

STYLE = {"WALLS": "sides", "KEYS": ("action", "side_power")}

ns = runpy.run_path(str(Path(__file__).with_name("case.py")),
                    init_globals={**STYLE, "PHONE": globals().get("PHONE", "17e")})
part, GLASS = ns["part"], ns["GLASS"]
