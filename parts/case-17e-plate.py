"""Swap-in back plate for `case-17e-plateframe`, 1 mm, dropped in from the phone
side and held by the phone. Print a blank, then emboss or cut it."""

import runpy
from pathlib import Path

part = runpy.run_path(str(Path(__file__).with_name("case-17e.py")),
                      init_globals={"BUTTONS": "slot", "CAMERA": "universal", "BACK_BAND": 8.0, "PLATE": True})["plate"]
