"""`case-17e` backless: side walls, back kept as a 1.5 mm band, universal
top-band camera rim, one button slot per side."""

import runpy
from pathlib import Path

part = runpy.run_path(str(Path(__file__).with_name("case-17e.py")),
                      init_globals={"BUTTONS": "slot", "CAMERA": "universal", "BACK_BAND": 1.5})["part"]
