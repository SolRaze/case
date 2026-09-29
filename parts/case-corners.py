"""`case-17e` held at the four corners only, walls open between them."""

import runpy
from pathlib import Path

part = runpy.run_path(str(Path(__file__).with_name("case-17e.py")),
                      init_globals={"WALLS": "corners", "BUTTONS": "slot"})["part"]
