"""`case` with a snap clip for one cigarette along the right edge of the
back. Unlit only; PETG softens near 80 C."""

import runpy
from pathlib import Path

STYLE = {"CIG": True}

ns = runpy.run_path(str(Path(__file__).with_name("case.py")),
                    init_globals={**STYLE, "PHONE": globals().get("PHONE", "17e")})
part, GLASS = ns["part"], ns["GLASS"]
