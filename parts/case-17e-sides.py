"""`case-17e` with the top and bottom walls open between the corners."""

import runpy
from pathlib import Path

part = runpy.run_path(str(Path(__file__).with_name("case-17e.py")),
                      init_globals={"WALLS": "sides", "KEYS": ("action", "side_power")})["part"]
