"""`case-17e` as a frame: back kept as an 8 mm band round the edge, universal
top-band camera window, one button slot per side."""

import runpy
from pathlib import Path

part = runpy.run_path(str(Path(__file__).with_name("case-17e.py")),
                      init_globals={"BUTTONS": "slot", "CAMERA": "universal", "BACK_BAND": 8.0})["part"]
