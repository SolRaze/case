"""`case` with pockets for the ADG 42.1 MagSafe magnet array, glued in
from the phone side, and the action and side buttons as flexure keys."""

import runpy
from pathlib import Path

STYLE = {"MAGSAFE": "ring", "KEYS": ("action", "side_power")}

ns = runpy.run_path(str(Path(__file__).with_name("case.py")),
                    init_globals={**STYLE, "PHONE": globals().get("PHONE", "17e")})
part, GLASS = ns["part"], ns["GLASS"]
