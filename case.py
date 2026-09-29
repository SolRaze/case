"""Phone case for any phone in ref/iphone/sizes.json, the print source. 1 unit = 1 mm.

Geometry comes from the drawing JSON, not from measurement: phone.py reads a
phone out of ref/iphone/, and the Accessory Design Guidelines (pdf/adg.pdf,
fetched by tools/fetch.py) set the limits, cited below as ADG: chapter 5 "Cases"
(pages 32-46) and 42.1 "MagSafe Case Magnet Array" (pages 269-272).

Frame: x 0..W across the front, y 0..-L down the length, z 0 at the front cover-glass
plane and -T at the back face.

Knobs, defaults in rules.json; a style in styles.json is a named knob set.
  BUTTONS    "windows" one window per button | "slot" one window per side
  KEYS       button names printed as flexure keys that press through the wall;
             names this phone lacks are dropped
  CLOSED     button names covered, the wall relieved so it never presses them
  CAMERA     "fitted" ring round this cluster | "universal" full-width top band
  BACK_BAND  None full back | mm of back kept round the edge
  PLATE      the band carries an inside rebate for a swap-in back plate, `plate`
  WALLS      "full" | "sides" top and bottom walls open | "corners" corners only
  MAGSAFE    None | "ring" pockets for the ADG 42.1 magnet array | "open" hole
  SLIDER     lens cover sliding down rails on a raised track, `slider`
  CIG        cigarette clip along the right edge of the back
  COUPON     None | mm of each edge kept round the bottom-right corner, a fit test
A fitted camera on a banded back stands on a spine, a full-width strip of back
across the camera, which also carries the slider rails. rules.json lists the
valid combinations; the asserts in build() are the same rules.

    python case.py                         every style, for the 17e
    python case.py magsafe frame           these styles
    python case.py --phone 16 --phone air  these phones
    python case.py --all                   every phone in ref/iphone/sizes.json
    python case.py --check                 check only, write nothing
    python case.py --no-png                STL only

builds each style, checks it (manifold, one solid, glass gap) and writes
out/<phone>/<style>.stl and previews/<phone>/<style>.png. Several phones run one
process each, which keeps memory bounded. A phone and style that rules.json rules
out is skipped and says why; any other failure exits 1.
From Python: import case; case.build("16", "magsafe", WALLS="sides"); case.check(obj).
"""

import json
import math
import subprocess
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

import phone as ph
import rules

ROOT = Path(__file__).resolve().parent
SOLVER = "MANIFOLD"   # every operand is a closed loft, which is all this solver needs
SEG = 64              # segments per full circle

CLEAR = 0.25   # phone to inner wall, all round
WALL = 1.55    # side wall. CLEAR + WALL is the bottom, 1.8 max for docks (ADG 5.1.3)
BACK = 2.0     # 2.1 is the Apple hard limit for backside thickness
LIP = 0.5      # rim reaches this far in over the phone's rolled front edge, clear
               # of the glass edge at 1.05. Rigid print (PETG/PLA): the phone snaps
               # past it by bowing the long walls LIP each side, and it retains only
               # while LIP > CLEAR. PLA cracks sooner, 0.35 there
GLASS_GAP = 1.0        # exposed glass to any flat surface: 0.85 min, 1.0 ideal (ADG 5.1.1)
MIN_GAP = 0.85
PROUD = GLASS_GAP      # how far the rim stands above the front glass plane
RING_W = 1.5           # raised ring round the camera window, holds the lens off a table
EDGE_BACK = 1.8        # round on the back edge of the case, CLEAR + WALL
EDGE_FRONT = 0.8       # round on the outer edge of the front rim
RIM_FLARE = 0.4        # the front opening opens this much wider at the rim top
WINDOW_FLARE = 0.4     # the camera window opens this much wider at the ring top
RECEIVER_BLEND = 4.0   # the receiver dip eases back up to the rim over this, each side
BUTTON_MARGIN = 0.75   # extra window each end of a button
BUTTON_RAIL = 1.3      # wall left above and below a button window
FEATURE_MARGIN = 1.2   # around the rear camera cluster
PORT_OFFSET = 2.0      # speaker/mic opening past the port edge, thin case (ADG 5.2.3.1)
PORT_LAND = 0.6        # straight wall at an opening's inner edge, 1.5 max (ADG 5.2.3.1)
RECEIVER_CLEAR = 0.35  # round the receiver slot, which the rim notch leaves open forward
UNI_L = 48.0           # universal camera window, full width, this deep from the top edge.
                       # Deepest plateau drawn is 46.54 (15 Pro, 16 Pro Max); 17 Pro Max is full width
UNI_INSET = 0.5        # universal window edge in from the phone outline; plateaus start 1.04 in

KEY_GAP = 0.2          # button top to the relieved wall face
KEY_NUB = 0.15         # nub on a key, reaches KEY_GAP - KEY_NUB from the button top
KEY_SLOT = 0.6         # cut round a key tab
KEY_HINGE = 6.0        # key tab length past the window, hinged at the top end;
                       # 0.35 press at the nub strains the 1.15 tab about 0.5 %
CORNER_L = 20.0        # WALLS "sides"/"corners": wall kept this far along each edge from a corner
SPINE_W = 4.0          # spine past the camera ring
PLATE_T = 1.0          # swap-in back plate, the band keeps BACK - PLATE_T as its ledge
PLATE_LEDGE = 3.0      # ledge the plate rests on, inside the band opening
PLATE_CLR = 0.2        # plate to rebate, each side
SL_T = 1.2             # slider plate
SL_CLR = 0.3           # slider to rail web, and slider to rail lip
RAIL_W = 1.5           # rail web
RAIL_LIP = 1.0         # rail lip over the slider edge
RAIL_LIP_T = 0.8
MS_FLOOR = 0.80        # magnet to case outside: 0.85 max (ADG 42.1 fig 42-3), 0.80 in R13-R16
MS_T = 0.55            # magnet thickness (ADG fig 42-3)
MS_CLR = 0.1           # magnet pocket, each side
MS_OPEN_D = 60.0       # "open" hole, a MagSafe charger puck seats on the phone
RIB_W = 1.2            # RIBS: rib across the back, and the solid rim round every pocket
RIB_PITCH = 10.0       # RIBS: rib centre to centre, both ways
CIG_D = 8.0            # king size 7.9-8.0, slim 5.4
CIG_WALL = 1.4
CIG_SNAP = 0.85        # clip mouth as a fraction of CIG_D
CIG_LEN = 30.0
CIG_Y = -120.0         # clip centre, below the MagSafe charger and clocking magnet

KNOBS = rules.knob_defaults()


def styles():
    """{name: {"knobs": {...}, "output": "part" | "plate" | "slider", "about": str}}."""
    return rules.STYLES


offset, phone = ph.offset, ph.phone


# Solids ----------------------------------------------------------------------

class S:
    """A closed mesh with + - & as union, difference and intersection, each a new result."""

    def __init__(self, obj):
        self.obj = obj

    def _op(self, other, op):
        obj = bpy.data.objects.new("s", self.obj.data.copy())
        SCRATCH.objects.link(obj)
        m = obj.modifiers.new("b", "BOOLEAN")
        m.operation, m.solver, m.object = op, SOLVER, other.obj
        bpy.context.view_layer.update()
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        obj.modifiers.clear()
        old, obj.data = obj.data, mesh
        bpy.data.meshes.remove(old)
        return S(obj)

    def __add__(self, o):
        return self._op(o, "UNION")

    def __sub__(self, o):
        return self._op(o, "DIFFERENCE")

    def __and__(self, o):
        return self._op(o, "INTERSECT")


SCRATCH = None
GLASS = {}   # object name -> glass points, for check()


def loft(rings):
    """Rings of equal length, capped at both ends: a closed mesh."""
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    for a, b in zip(vs, vs[1:]):
        for i in range(len(a)):
            bm.faces.new((a[i - 1], a[i], b[i], b[i - 1]))
    bm.faces.new(vs[0])
    bm.faces.new(vs[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("s")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("s", mesh)
    SCRATCH.objects.link(obj)
    return S(obj)


def prism(ring, z0, z1):
    return loft([[(x, y, z0) for x, y in ring], [(x, y, z1) for x, y in ring]])


def rect(w, h):
    return [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]


def span(x0, x1, y0, y1, z0, z1):
    """Axis box between two corners, any order."""
    ring = [(x + (x0 + x1) / 2, y + (y0 + y1) / 2) for x, y in rect(abs(x1 - x0), abs(y1 - y0))]
    return prism(ring, min(z0, z1), max(z0, z1))


def circle(r, cx=0.0, cy=0.0, n=SEG):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def rounded(w, h, r, cx=0.0, cy=0.0, n=SEG // 4):
    """Rectangle w x h with corners rounded to r, centred on cx, cy."""
    pts = []
    for k, (sx, sy) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        ox, oy = cx + sx * (w / 2 - r), cy + sy * (h / 2 - r)
        for i in range(n + 1):
            a = math.pi / 2 * (k + i / n)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def slot(w, h, n=SEG // 2):
    """Obround w overall along the first axis, h across, round ends."""
    r = h / 2
    return [(sx * (w / 2 - r) + r * math.cos(a), r * math.sin(a))
            for sx, a0 in ((1, -math.pi / 2), (-1, math.pi / 2))
            for a in (a0 + math.pi * i / n for i in range(n + 1))]


def hull(pts):
    """Convex hull, counterclockwise."""
    pts = sorted(set(pts))

    def half(seq):
        out = []
        for q in seq:
            while len(out) > 1 and ((out[-1][0] - out[-2][0]) * (q[1] - out[-2][1])
                                    - (out[-1][1] - out[-2][1]) * (q[0] - out[-2][0])) <= 1e-9:
                out.pop()
            out.append(q)
        return out[:-1]
    return half(pts) + half(pts[::-1])


def quarter(n=8):
    """(across, up) on a quarter round of radius 1, from its side to its top."""
    return [(1 - math.sin(math.pi / 2 * i / n), 1 - math.cos(math.pi / 2 * i / n)) for i in range(n + 1)]


def cylinder(cx, cy, r, z0, z1):
    return prism(circle(r, cx, cy), z0, z1)


def keepout_cone(cx, cy, z0, r0, half_angle, z1):
    """Frustum from radius r0 at z0 opening outward (-z) at half_angle to z1."""
    r1 = r0 + (z0 - z1) * math.tan(math.radians(half_angle))
    return loft([[(x, y, z0) for x, y in circle(r0, cx, cy)], [(x, y, z1) for x, y in circle(r1, cx, cy)]])


# Case ------------------------------------------------------------------------

def build(name="17e", style="case", **knobs):
    """Every solid this phone, style and knob overrides make, as objects in the
    `case` collection: `part`, and `plate` / `slider` where the knobs make them."""
    global SCRATCH
    base = styles()[style]["knobs"]
    globals().update({**KNOBS, **base, **knobs})
    p = phone(name)
    W, L, T = p["W"], p["L"], p["T"]

    names = {b["name"] for b in p["buttons"]}
    KEYS = tuple(k for k in globals()["KEYS"] if k in names)
    CLOSED = tuple(k for k in globals()["CLOSED"] if k in names)
    assert BACK <= p["max_back"]
    assert CLEAR + WALL <= 1.8
    assert CLEAR < LIP < 1.05
    assert BUTTONS in ("windows", "slot") and CAMERA in ("fitted", "universal")
    assert WALLS in ("full", "sides", "corners") and MAGSAFE in (None, "ring", "open")
    assert not set(KEYS) & set(CLOSED)
    assert not (KEYS and WALLS == "corners"), "corner walls leave no wall for a key"
    assert not PLATE or BACK_BAND, "the plate sits in a banded back"
    assert not MAGSAFE or BACK_BAND is None, "magnets and the charger need the full back"
    assert not SLIDER or CAMERA == "fitted", "the slider covers a fitted window"
    assert not RIBS or (BACK_BAND is None and not MAGSAFE), "ribs pocket the full back, magnets need it solid"
    assert not RIBS or BACK - RIBS >= MIN_GAP, "back between the ribs under the glass gap"
    assert not (SLIDER and MAGSAFE), "slider rails reach y -52, a charger's top edge is at -45"
    assert not (CAMERA == "fitted" and p["plateau"] == "full"), "full-width camera plateau, use CAMERA universal"
    assert not CIG or CIG_Y - CIG_LEN / 2 > -L, "cigarette clip runs off the bottom"

    SCRATCH = bpy.data.collections.new("case-scratch")
    bpy.context.scene.collection.children.link(SCRATCH)

    OUT = CLEAR + WALL
    ring = ph.plan_outline(p["corner"], W, L)
    outer = offset(ring, -OUT)
    inner = offset(ring, -CLEAR)
    front = offset(ring, LIP)

    Z_BACK = -T
    Z_CASE_BACK = Z_BACK - BACK
    Z_LENS = Z_BACK - p["lens_z"]
    Z_RING = Z_LENS - GLASS_GAP

    def body(z0, z1, back=EDGE_BACK, top=EDGE_FRONT):
        """Outer shape from z0 (back) to z1 (front), both edges rounded."""
        rings = [(z0 + back * v, back * a) for a, v in quarter()]
        rings += [(z1 - top * v, top * a) for a, v in quarter()[::-1]]
        rings = [r for i, r in enumerate(rings) if not i or r != rings[i - 1]]
        return loft([[(x, y, z) for x, y in offset(ring, -OUT + d)] for z, d in rings])

    part = body(Z_CASE_BACK, PROUD)
    part -= prism(inner, Z_BACK, 0.0)
    part -= loft([[(x, y, z) for x, y in r] for r, z in
                  ((front, -0.01), (front, PROUD - RIM_FLARE), (offset(ring, LIP - RIM_FLARE), PROUD + 0.01))])

    def edge_port(w, h, cx, cz, top, shape=slot):
        """Opening w along x, h along z through the top or bottom wall, with the
        45 deg outside chamfer ADG 5.2.3.1 asks of speaker and mic openings."""
        y_out = OUT if top else -(L + OUT)
        inward = -1 if top else 1
        ch = WALL - PORT_LAND + 1

        def at(poly, t):
            return [(cx + u, y_out - inward + inward * t, cz + v) for u, v in poly]
        hole = loft([at(shape(w, h), 0), at(shape(w, h), WALL + CLEAR + 2)])
        return hole + loft([at(shape(w + 2 * ch, h + 2 * ch), 0), at(shape(w, h), ch)])

    def side_box(side, d0, d1, y0, y1, z0, z1):
        if side == "right":
            return span(W + d0, W + d1, y0, y1, z0, z1)
        return span(-d0, -d1, y0, y1, z0, z1)

    # USB-C connector keepout, grown by CLEAR.
    ux, uz, kw, kh = p["usb"]
    a = WALL + CLEAR + 2
    part -= loft([[(ux + u, -L + t, uz + v) for u, v in slot(kw + 2 * CLEAR, kh + 2 * CLEAR)] for t in (-a, a)])

    # Speaker / mic ports: one opening per group.
    sd, sz, groups = p["speakers"]
    for x0, x1 in groups:
        part -= edge_port(x1 - x0 + 2 * PORT_OFFSET, sd + 2 * PORT_OFFSET, (x0 + x1) / 2, sz, top=False)

    # Receiver: a dip in the top rim, flat over the slot and easing back up to the rim top.
    rw, rz = p["receiver"]
    rec_z0 = rz[1] - RECEIVER_CLEAR
    half_w, n = rw / 2 + RECEIVER_CLEAR, 12
    ease = [(half_w + RECEIVER_BLEND * i / n,
             rec_z0 + (PROUD + 0.02 - rec_z0) * (1 - math.cos(math.pi * i / n)) / 2) for i in range(n + 1)]
    X = half_w + RECEIVER_BLEND + 1
    dip = ([(-X, PROUD + 2), (-X, PROUD + 0.02)] + [(-u, z) for u, z in ease[::-1]]
           + ease + [(X, PROUD + 0.02), (X, PROUD + 2)])
    part -= loft([[(W / 2 + u, y, z) for u, z in dip] for y in (OUT + 1, -LIP - CLEAR - 2)])

    # Buttons: windows, slot, keys, closed.
    bw, zc = p["bx"]
    half = -BUTTON_RAIL - zc
    thru = OUT + 2
    windows = [(b["side"], b["center_y"] + b["length"] / 2, b["center_y"] - b["length"] / 2)
               for b in p["buttons"] if b["name"] not in KEYS + CLOSED]
    if BUTTONS == "slot":
        windows = [(side, max(t for s_, t, _ in windows if s_ == side),
                    min(b for s_, _, b in windows if s_ == side))
                   for side in sorted({s_ for s_, _, _ in windows})]
    for side, top, bot in windows:
        x0, x1 = (W - thru, W + thru) if side == "right" else (thru, -thru)
        length = top - bot + 2 * BUTTON_MARGIN
        part -= loft([[(x, (top + bot) / 2 + u, zc + v) for u, v in slot(length, 2 * half)] for x in (x0, x1)])
    for b in p["buttons"]:
        if b["name"] not in KEYS + CLOSED:
            continue
        side, cy, bl = b["side"], b["center_y"], b["length"]
        relief = b["protrusion"] + KEY_GAP
        part -= side_box(side, 0, relief, cy + bl / 2 + 0.5, cy - bl / 2 - 0.5, zc - bw / 2 - 0.3, zc + bw / 2 + 0.3)
        if b["name"] in CLOSED:
            continue
        free, root = cy - bl / 2 - BUTTON_MARGIN, cy + bl / 2 + BUTTON_MARGIN + KEY_HINGE
        for z in (zc - half, zc + half):
            part -= side_box(side, -thru, thru, free - KEY_SLOT, root, z - KEY_SLOT / 2, z + KEY_SLOT / 2)
        part -= side_box(side, -thru, thru, free - KEY_SLOT, free, zc - half, zc + half)
        part += side_box(side, relief - KEY_NUB, relief + 0.01, cy + 1.5, cy - 1.5, zc - 1.0, zc + 1.0)

    # Wall styles.
    top_z = (Z_BACK, PROUD + 1)
    if WALLS in ("sides", "corners"):
        for y0, y1 in ((5, -LIP - 1), (-L + LIP + 1, -L - 5)):
            part -= span(CORNER_L, W - CORNER_L, y0, y1, *top_z)
    if WALLS == "corners":
        for x0, x1 in ((-5, LIP + 1), (W - LIP - 1, W + 5)):
            part -= span(x0, x1, -CORNER_L, -(L - CORNER_L), *top_z)

    # Rear camera: one opening over every lens, flash, mic, sensor and the plateau.
    feats = p["lenses"] + [f for f in [p["flash"]] if f] + p["others"]
    xs = [v for cx, _, d in feats for v in (cx - d / 2, cx + d / 2)]
    ys = [v for _, cy, d in feats for v in (cy - d / 2, cy + d / 2)]
    if isinstance(p["plateau"], tuple):
        xs += p["plateau"][:2]
        ys += p["plateau"][2:]
    cam_w = max(xs) - min(xs) + 2 * FEATURE_MARGIN
    cam_l = max(ys) - min(ys) + 2 * FEATURE_MARGIN
    cam_x, cam_y = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    # The bump: every lens and the plateau they stand on. Flash and mic outside it get
    # their own flush hole in the back.
    pts = [q for cx, cy, d in p["lenses"] for q in circle(d / 2 + FEATURE_MARGIN, cx, cy)]
    if isinstance(p["plateau"], tuple):
        x0, x1, y0, y1 = p["plateau"]
        pts += rounded(x1 - x0 + 2 * FEATURE_MARGIN, y1 - y0 + 2 * FEATURE_MARGIN, 4.0 + FEATURE_MARGIN,
                       (x0 + x1) / 2, (y0 + y1) / 2)

    Z_FLASH = Z_BACK - p["flash_z"]
    fi_a, fi_d = p["flash_inner"]
    fo_a, fo_d, fo_tr = p["flash_outer"]
    z_tr = Z_FLASH - fo_tr
    lc_a, lc_d = p["lens_cone"]

    def flash_r(z):
        return fo_d / 2 + CLEAR + (z_tr - z) * math.tan(math.radians(fo_a / 2))

    def lens_r(z):
        return lc_d / 2 + CLEAR + (Z_LENS - z) * math.tan(math.radians(lc_a / 2))

    def cone_edges(z):
        """(x, y, r) of every light cone at depth z."""
        out = [(lx, ly, lens_r(z)) for lx, ly, _ in p["lenses"]]
        if p["flash"]:
            out.append((p["flash"][0], p["flash"][1], flash_r(z)))
        return out

    cam = hull(pts)

    def inside(x, y):
        return all((bx - ax) * (y - ay) - (by - ay) * (x - ax) >= 0 for (ax, ay), (bx, by) in zip(cam, cam[1:] + cam[:1]))
    loose = [f for f in feats[len(p["lenses"]):] if not inside(f[0], f[1])]

    slider = None
    if SLIDER:
        z_sl = Z_RING - SL_T
        z_lip = z_sl - SL_CLR - RAIL_LIP_T
        sl_top = cam_y + cam_l / 2 + RING_W
        sl_l = cam_l + 2 * RING_W
        open_top = min(cy - r for _, cy, r in cone_edges(z_sl)) - 0.5
        lip_x0 = min(cx - r for cx, _, r in cone_edges(z_lip)) - 0.5
        lip_x1 = max(cx + r for cx, _, r in cone_edges(z_lip)) + 0.5
        sl_x0 = min(cam_x - cam_w / 2 - RING_W, lip_x0 - RAIL_LIP + SL_CLR)
        sl_x1 = max(cam_x + cam_w / 2 + RING_W, lip_x1 + RAIL_LIP - SL_CLR)
        assert sl_x1 + SL_CLR + RAIL_W <= W + OUT, "right rail falls off the case"
        rail_bot = open_top - sl_l - 1.0
        rails = span(sl_x0 - SL_CLR - RAIL_W, sl_x1 + SL_CLR + RAIL_W, sl_top + 1.5, rail_bot,
                     Z_RING, Z_CASE_BACK + 0.5)
        for web0, web1, lip0 in ((sl_x0 - SL_CLR - RAIL_W, sl_x0 - SL_CLR, sl_x0 + RAIL_LIP),
                                 (sl_x1 + SL_CLR + RAIL_W, sl_x1 + SL_CLR, sl_x1 - RAIL_LIP)):
            rails += span(web0, web1, sl_top + 1.5, rail_bot, z_lip, Z_RING + 0.01)
            rails += span(web0, lip0, sl_top + 1.5, rail_bot, z_lip, z_lip + RAIL_LIP_T)
            rails += span(web0, lip0, sl_top + 1.5, sl_top + 0.2, z_lip, Z_RING)
        slider = span(sl_x0, sl_x1, sl_top, sl_top - sl_l, z_sl, Z_RING - 0.05)
        slider += span(sl_x0 + 3, sl_x1 - 3, sl_top - sl_l + 1.0, sl_top - sl_l + 2.0, z_sl - 0.6, z_sl + 0.01)

    spine_bot = None
    if BACK_BAND is not None:
        part -= prism(offset(ring, BACK_BAND), Z_RING - 5, Z_BACK)
        if PLATE:
            part -= prism(offset(ring, BACK_BAND - PLATE_LEDGE), Z_BACK - PLATE_T, Z_BACK)
        if CAMERA == "fitted":
            spine_bot = (rail_bot if SLIDER else cam_y - cam_l / 2 - RING_W) - SPINE_W
            part += span(-10, W + 10, 10, spine_bot, Z_CASE_BACK, Z_BACK) & body(Z_CASE_BACK, PROUD)

    def top_band(depth):
        return span(-10, W + 10, 10, -depth, -50, 50)

    if CAMERA == "fitted":
        # Ring round the bump, its outer edge a round as high as the ring stands.
        h = Z_CASE_BACK - Z_RING
        prof = [(Z_CASE_BACK + 0.5, RING_W + h)] + [(Z_CASE_BACK - h * (1 - a), RING_W + h * (1 - v)) for a, v in quarter()]
        part += loft([[(x, y, z) for x, y in offset(cam, -d)] for z, d in prof])
        if SLIDER:
            part += rails & prism(outer, z_lip - 1, 0)
        window = loft([[(x, y, z) for x, y in offset(cam, -d)] for z, d in
                       ((Z_BACK + 1, 0), (Z_RING + WINDOW_FLARE, 0), (Z_RING - 0.01, WINDOW_FLARE + 0.01))])
        if loose:
            hole = hull([q for cx, cy, d in loose for q in circle(d / 2 + FEATURE_MARGIN, cx, cy)])
            window += loft([[(x, y, z) for x, y in offset(hole, -d)] for z, d in
                            ((Z_BACK + 1, 0), (Z_CASE_BACK + WINDOW_FLARE, 0), (Z_CASE_BACK - 0.01, WINDOW_FLARE + 0.01))])
    else:
        assert cam_y - cam_l / 2 >= -UNI_L, "camera reaches past the universal window"
        part += top_band(UNI_L + RING_W) & body(Z_RING, Z_CASE_BACK + 0.5, min(EDGE_BACK, Z_CASE_BACK - Z_RING), 0)
        window = top_band(UNI_L) & prism(offset(ring, UNI_INSET), Z_RING - 1, Z_BACK)
    part -= window

    # Light cones past the window edge, grown by CLEAR (ADG 5.7.1).
    Z_OUT = Z_RING - 6
    keepout = None
    cones = [keepout_cone(lx, ly, Z_LENS, lc_d / 2 + CLEAR, lc_a / 2, Z_OUT) for lx, ly, _ in p["lenses"]]
    if p["flash"]:
        fx, fy, _ = p["flash"]
        cones += [keepout_cone(fx, fy, Z_FLASH, fi_d / 2 + CLEAR, fi_a / 2, z_tr),
                  keepout_cone(fx, fy, z_tr, fo_d / 2 + CLEAR, fo_a / 2, Z_OUT)]
    for c in cones:
        keepout = c if keepout is None else keepout + c
    part -= keepout

    # MagSafe (ADG 42.1).
    mx, my = p["magsafe"]
    if MAGSAFE == "ring":
        z0, z1 = Z_CASE_BACK + MS_FLOOR, Z_BACK
        assert z1 - z0 >= MS_T + 0.5, "magnet ends up past 0.55 from the device"
        part -= cylinder(mx, my, 54.10 / 2 + MS_CLR, z0, z1) - cylinder(mx, my, 46.00 / 2 - MS_CLR, z0, z1)
        part -= span(mx - 3 - MS_CLR, mx + 3 + MS_CLR, my - 31.18 + MS_CLR, my - 50.49 - MS_CLR, z0, z1)
    elif MAGSAFE == "open":
        part -= cylinder(mx, my, MS_OPEN_D / 2, Z_BACK - BACK - 1, Z_BACK + BACK + 1)

    # Ribs: pockets in the outside of the back leave BACK - RIBS between the ribs; the
    # ribs and the rim keep BACK, so the case still rests at BACK off the table.
    if RIBS:
        keep = prism(offset(ring, -1), Z_CASE_BACK - 1, Z_CASE_BACK + RIBS) - prism(offset(ring, RIB_W), Z_CASE_BACK - 1, Z_CASE_BACK + RIBS)
        if CAMERA == "fitted":
            keep += prism(offset(cam, -(RING_W + Z_CASE_BACK - Z_RING + RIB_W)), Z_CASE_BACK - 1, Z_CASE_BACK + RIBS)
            if loose:
                keep += prism(offset(hole, -(WINDOW_FLARE + RIB_W)), Z_CASE_BACK - 1, Z_CASE_BACK + RIBS)
        else:
            keep += top_band(UNI_L + RING_W + RIB_W)
        n = int(max(W, L) / RIB_PITCH) + 2
        for i in range(n):
            keep += span(W / 2 + (i - n / 2) * RIB_PITCH - RIB_W / 2, W / 2 + (i - n / 2) * RIB_PITCH + RIB_W / 2,
                         10, -L - 10, Z_CASE_BACK - 1, Z_CASE_BACK + RIBS)
            keep += span(-10, W + 10, -L / 2 + (i - n / 2) * RIB_PITCH - RIB_W / 2,
                         -L / 2 + (i - n / 2) * RIB_PITCH + RIB_W / 2, Z_CASE_BACK - 1, Z_CASE_BACK + RIBS)
        part -= prism(offset(ring, RIB_W), Z_CASE_BACK - 1, Z_CASE_BACK + RIBS) - keep

    # Cigarette clip along the right edge of the back.
    if CIG:
        r_in = CIG_D / 2 + 0.2
        r_out = r_in + CIG_WALL
        ccx, ccz = W + OUT - r_out, Z_CASE_BACK - r_out

        def tube_y(r, length):
            return loft([[(ccx + u, CIG_Y + t, ccz + v) for u, v in circle(r)] for t in (length / 2, -length / 2)])
        tube = tube_y(r_out, CIG_LEN)
        tube += span(ccx - r_out * 0.8, W + OUT, CIG_Y + CIG_LEN / 2, CIG_Y - CIG_LEN / 2, ccz, Z_CASE_BACK + 0.5)
        tube -= tube_y(r_in, CIG_LEN + 2)
        tube -= span(ccx - CIG_SNAP * CIG_D / 2, ccx + CIG_SNAP * CIG_D / 2,
                     CIG_Y + CIG_LEN, CIG_Y - CIG_LEN, ccz - r_out - 1, ccz)
        part += tube & prism(outer, Z_CASE_BACK - 30, Z_CASE_BACK + 0.5)

    if COUPON:
        part &= span(W - COUPON, W + COUPON, -L + COUPON, -L - COUPON, Z_CASE_BACK - 30, PROUD + 30)

    plate = None
    if PLATE:
        plate = prism(offset(ring, BACK_BAND - PLATE_LEDGE + PLATE_CLR), Z_BACK - PLATE_T, Z_BACK)
        plate -= window
        plate -= keepout
        if CAMERA == "universal":
            plate -= top_band(UNI_L + RING_W + PLATE_CLR)
        if spine_bot is not None:
            plate -= span(-10, W + 10, 10, spine_bot - PLATE_CLR, -50, 50)

    col = bpy.data.collections.get("case") or bpy.data.collections.new("case")
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    made = {}
    for key, s in (("part", part), ("plate", plate), ("slider", slider)):
        if s is None:
            continue
        label = f"case-{name}-{style}" + ("" if key == "part" else f"-{key}")
        old = bpy.data.objects.get(label)
        if old:
            bpy.data.objects.remove(old)
        SCRATCH.objects.unlink(s.obj)
        col.objects.link(s.obj)
        s.obj.name = s.obj.data.name = label
        s.obj["phone"], s.obj["style"], s.obj["knobs"] = name, style, json.dumps({**base, **knobs})
        made[key] = s.obj
    for o in list(SCRATCH.objects):
        bpy.data.objects.remove(o)
    bpy.data.collections.remove(SCRATCH)
    for m in [m for m in bpy.data.meshes if not m.users]:
        bpy.data.meshes.remove(m)

    glass = {
        "front glass": [(x, y, 0.0) for x, y in offset(ring, 1.05)],
        "lens cover": [(lx + d / 2 * math.cos(t), ly + d / 2 * math.sin(t), Z_LENS)
                       for lx, ly, d in p["lenses"] for t in np.linspace(0, 2 * math.pi, 180, endpoint=False)],
        "back glass": [(x, y, Z_BACK) for x in np.linspace(5, W - 5, 30) for y in np.linspace(-5, 5 - L, 60)],
    }
    if not COUPON:
        GLASS[made["part"].name] = glass
    for n in p["notes"]:
        print(f"{name}: {n}")
    return made


# Checks ----------------------------------------------------------------------

def solid_check(obj):
    """(volume mm3, non-manifold edges, loose parts) of a mesh object."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bad = sum(not e.is_manifold for e in bm.edges)
    seen, parts = set(), 0
    for v in bm.verts:
        if v.index in seen:
            continue
        parts += 1
        stack = [v]
        seen.add(v.index)
        while stack:
            for e in stack.pop().link_edges:
                for u in e.verts:
                    if u.index not in seen:
                        seen.add(u.index)
                        stack.append(u)
    vol = bm.calc_volume(signed=True)
    bm.free()
    return vol, bad, parts


def glass_gap(obj, pts):
    """ADG 5.1.1: a flat surface touches the case on a supporting plane, so the gap
    is each glass point's distance to the nearest one, the least over the points.
    Hull facet normals give the planes; each plane's offset is the support over every
    vertex, so an inexact facet still yields a real tangent plane."""
    co = np.array([v.co for v in obj.data.vertices])
    bm = bmesh.new()
    for v in co:
        bm.verts.new(v)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bm.normal_update()
    n = np.array([f.normal for f in bm.faces if f.calc_area() > 1e-9])
    bm.free()
    n = np.vstack([n, -n])
    d = (co @ n.T).max(axis=0)
    return float((d - np.array(pts) @ n.T).min())


def check(obj, glass=True):
    """True when the mesh is closed, one piece, and every glass point stands at least
    MIN_GAP off any flat surface the case rests on."""
    vol, bad, parts = solid_check(obj)
    line = f"{obj.name}: {vol / 1000:.2f} cm3, {bad} open edges, {parts} solid{'s' * (parts != 1)}"
    ok = bad == 0 and parts == 1 and vol > 0
    if glass and obj.name in GLASS:
        gaps = {k: glass_gap(obj, v) for k, v in GLASS[obj.name].items()}
        line += " | " + ", ".join(f"{k} {g:.3f}" for k, g in gaps.items())
        ok &= all(g >= MIN_GAP - 1e-6 for g in gaps.values())
    print(("ok   " if ok else "FAIL ") + line)
    return ok


# Output ----------------------------------------------------------------------

def only(obj):
    for o in bpy.context.scene.objects:
        o.select_set(o == obj)
        o.hide_render = o != obj and o.type == "MESH"
    bpy.context.view_layer.objects.active = obj


def export_stl(obj, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    only(obj)
    bpy.ops.wm.stl_export(filepath=str(path), export_selected_objects=True, ascii_format=False)


def preview(obj, path, size=200):
    """Solid-shaded view of the back, three-quarter from above the camera corner,
    orthographic and framed on the object."""
    path.parent.mkdir(parents=True, exist_ok=True)
    s = bpy.context.scene
    only(obj)
    co = np.array([obj.matrix_world @ v.co for v in obj.data.vertices])
    lo, hi = co.min(axis=0), co.max(axis=0)
    mid = (lo + hi) / 2
    cam = s.camera
    if cam is None:
        cam = bpy.data.objects.new("preview", bpy.data.cameras.new("preview"))
        s.collection.objects.link(cam)
        s.camera = cam
        cam.data.type = "ORTHO"
    look = np.array([0.45, 0.35, -1.0])
    look /= np.linalg.norm(look)
    up = np.array([0.0, 1.0, 0.0]) - look[1] * look      # phone top stays up
    up /= np.linalg.norm(up)
    rot = np.column_stack([np.cross(up, look), up, look])  # camera looks down its -Z
    cam.matrix_world = Matrix.Translation(Vector(mid + look * 400)) @ Matrix(rot.tolist()).to_4x4()
    cam.data.ortho_scale = float(max(hi - lo)) * 1.08
    cam.data.clip_end = 2000
    s.render.engine = "BLENDER_WORKBENCH"
    s.display.shading.light = "STUDIO"
    s.display.shading.color_type = "SINGLE"
    s.display.shading.single_color = (0.62, 0.66, 0.72)
    s.display.shading.show_cavity = True
    s.render.film_transparent = True
    s.render.resolution_x = s.render.resolution_y = size
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"
    s.render.image_settings.compression = 100
    s.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main(args):
    all_styles = styles()
    names = [args[i + 1] for i, a in enumerate(args) if a == "--phone"]
    names = ph.phones() if "--all" in args else names or ["17e"]
    chosen = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or args[i - 1] != "--phone")]
    bad = [st for st in chosen if st not in all_styles]
    if bad:
        raise SystemExit(f"no style named {', '.join(bad)}; styles are {', '.join(all_styles)}")
    chosen = chosen or list(all_styles)
    if len(names) > 1:
        flags = [a for a in args if a in ("--check", "--no-png")]
        failed = [n for n in names
                  if subprocess.run([sys.executable, __file__, *chosen, *flags, "--phone", n], cwd=ROOT).returncode]
        if failed:
            raise SystemExit(f"failed: {', '.join(failed)}")
        return
    out = None if "--check" in args else ROOT / "out"
    png = None if "--check" in args or "--no-png" in args else ROOT / "previews"
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system, s.unit_settings.scale_length, s.unit_settings.length_unit = "METRIC", 0.001, "MILLIMETERS"
    failed = []
    for n in names:
        for st in chosen:
            why = rules.why_invalid(n, st)
            if why:
                print(f"skip {n} {st}: {why}")
                continue
            try:
                made = build(n, st)
            except AssertionError as e:
                print(f"FAIL {n} {st}: {e}")
                failed.append(f"{n} {st}")
                continue
            obj = made[all_styles[st]["output"]]
            if not check(obj):
                failed.append(f"{n} {st}")
            if out:
                export_stl(obj, out / n / f"{st}.stl")
            if png:
                preview(obj, png / n / f"{st}.png")
            for o in made.values():
                bpy.data.objects.remove(o)
            for m in [m for m in bpy.data.meshes if not m.users]:
                bpy.data.meshes.remove(m)
    if failed:
        print(f"{len(failed)} failed: {', '.join(failed)}")
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
