"""`case-17e` with pockets for the ADG 42.1 MagSafe magnet array, glued in
from the phone side, and the action and side buttons as flexure keys."""

import runpy
from pathlib import Path

part = runpy.run_path(str(Path(__file__).with_name("case-17e.py")),
                      init_globals={"MAGSAFE": "ring", "KEYS": ("action", "side_power")})["part"]
