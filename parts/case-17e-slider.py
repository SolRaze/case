"""Lens cover for `case-17e-spine`, printed flat on its outside face. Rails
retain it by friction; it slides down to clear the lens and flash keepouts."""

import runpy
from pathlib import Path

part = runpy.run_path(str(Path(__file__).with_name("case-17e.py")),
                      init_globals={"BUTTONS": "slot", "BACK_BAND": 1.5, "SLIDER": True})["slider"]
