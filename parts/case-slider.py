"""Lens cover for `case-spine`, printed flat on its outside face. Rails
retain it by friction; it slides down to clear the lens and flash keepouts."""

import runpy
from pathlib import Path

STYLE = {"BUTTONS": "slot", "BACK_BAND": 1.5, "SLIDER": True}

ns = runpy.run_path(str(Path(__file__).with_name("case.py")),
                    init_globals={**STYLE, "PHONE": globals().get("PHONE", "17e")})
part = ns["slider"]
