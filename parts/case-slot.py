"""`case` with one button slot per side, fitted camera and full back."""

import runpy
from pathlib import Path

STYLE = {"BUTTONS": "slot"}

ns = runpy.run_path(str(Path(__file__).with_name("case.py")),
                    init_globals={**STYLE, "PHONE": globals().get("PHONE", "17e")})
part, GLASS = ns["part"], ns["GLASS"]
