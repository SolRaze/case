"""Bottom-right corner of `case`, for a fit test that prints in minutes.

Keeps the squircle corner, the USB-C opening edge and the right-hand speaker
group — the features that fail first if the printer's scale is off. Fits the
real phone corner or it does not.
"""

import runpy
from pathlib import Path

from build123d import Box, Pos

CUT = 45.0   # how much of each edge to keep

ns = runpy.run_path(str(Path(__file__).with_name("case.py")),
                    init_globals={"PHONE": globals().get("PHONE", "17e")})
case = ns["part"]
W, L = ns["W"], ns["L"]

keep = Pos(W, -L, 0) * Box(2 * CUT, 2 * CUT, 60)
part = case & keep
