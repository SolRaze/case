"""`case-17e` with one button slot per side, fitted camera and full back."""

import runpy
from pathlib import Path

part = runpy.run_path(str(Path(__file__).with_name("case-17e.py")),
                      init_globals={"BUTTONS": "slot"})["part"]
