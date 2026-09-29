"""`case` held at the four corners only, walls open between them."""

import runpy
from pathlib import Path

STYLE = {"WALLS": "corners", "BUTTONS": "slot"}

ns = runpy.run_path(str(Path(__file__).with_name("case.py")),
                    init_globals={**STYLE, "PHONE": globals().get("PHONE", "17e")})
part, GLASS = ns["part"], ns["GLASS"]
