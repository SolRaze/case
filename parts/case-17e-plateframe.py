"""`case-17e` frame with a rebate for a swap-in back plate, `case-17e-plate`."""

import runpy
from pathlib import Path

part = runpy.run_path(str(Path(__file__).with_name("case-17e.py")),
                      init_globals={"BUTTONS": "slot", "CAMERA": "universal", "BACK_BAND": 8.0, "PLATE": True})["part"]
