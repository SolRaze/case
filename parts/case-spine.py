"""`case-17e` backless round a spine: a 1.5 mm band, a full-width strip across the
fitted camera ring, and slider rails on it. The slider is `case-17e-slider`."""

import runpy
from pathlib import Path

part = runpy.run_path(str(Path(__file__).with_name("case-17e.py")),
                      init_globals={"BUTTONS": "slot", "BACK_BAND": 1.5, "SLIDER": True})["part"]
