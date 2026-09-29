"""`case-17e` with a snap clip for one cigarette along the right edge of the
back. Unlit only; PETG softens near 80 C."""

import runpy
from pathlib import Path

part = runpy.run_path(str(Path(__file__).with_name("case-17e.py")),
                      init_globals={"CIG": True})["part"]
