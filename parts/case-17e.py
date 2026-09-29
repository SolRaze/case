"""iPhone 17e case. Geometry comes from the drawing JSON, not from measurement.

Sources:
- ref/iphone/17e.json, every value of the iPhone 17e PDF (Apple's dimensional
  drawing) transcribed and checked against the drawn paths. The 16e drawing is
  the same body, so every style fits it too.
- Accessory Design Guidelines (Apple, not committed): chapter 5 "Cases" (pages 32-46) and 42.1
  "MagSafe Case Magnet Array" (pages 269-272), cited below as ADG.

Drawing frame, kept throughout: x 0..71.52 across the width, y 0..-146.71 down
the length, z 0 at the front cover-glass plane and -7.80 at the back face.

Style knobs, set by the case-17e-* part files through runpy init_globals:
  BUTTONS    "windows" one window per button | "slot" one window per side
  KEYS       button names printed as flexure keys that press through the wall
  CLOSED     button names covered, the wall relieved so it never presses them
  CAMERA     "fitted" ring round this cluster | "universal" full-width top band
  BACK_BAND  None full back | mm of back kept round the edge
  PLATE      the band carries an inside rebate for a swap-in back plate, `plate`
  WALLS      "full" | "sides" top and bottom walls open | "corners" corners only
  MAGSAFE    None | "ring" pockets for the ADG 42.1 magnet array | "open" hole
  SLIDER     lens cover sliding down rails on a raised track, `slider`
  CIG        cigarette clip along the right edge of the back
A fitted camera on a banded back stands on a spine, a full-width strip of back
across the camera, which also carries the slider rails.

    .venv/bin/python parts/case-17e.py    asserts the ADG glass clearance
"""

import importlib.util
import json
import math
from pathlib import Path

from build123d import (
    Align,
    Box,
    Cone,
    Cylinder,
    Plane,
    Polyline,
    Pos,
    Rectangle,
    RectangleRounded,
    Rot,
    SlotOverall,
    extrude,
    make_face,
)

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "ref/iphone/17e.json"
OUTLINE = ROOT / "extract/phone-body.py"

CLEAR = 0.25   # phone to inner wall, all round
WALL = 1.55    # side wall. CLEAR + WALL is the bottom, 1.8 max for docks (ADG 5.1.3)
BACK = 2.0     # 2.1 is the Apple hard limit for backside thickness
LIP = 0.5      # rim reaches this far in over the phone's rolled front edge, clear
               # of the glass edge at 1.05. Rigid print (PETG/PLA): the phone snaps
               # past it by bowing the long walls LIP each side, and it retains only
               # while LIP > CLEAR. PLA cracks sooner, 0.35 there
GLASS_GAP = 1.0        # exposed glass to any flat surface: 0.85 min, 1.0 ideal (ADG 5.1.1)
PROUD = GLASS_GAP      # how far the rim stands above the front glass plane
RING_W = 1.5           # raised ring round the camera window, holds the lens off a table
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
MS_FLOOR = 0.85        # magnet to case outside, 0.85 max (ADG 42.1 fig 42-3)
MS_T = 0.55            # magnet thickness (ADG fig 42-3)
MS_CLR = 0.1           # magnet pocket, each side
MS_OPEN_D = 60.0       # "open" hole, a MagSafe charger puck seats on the phone
CIG_D = 8.0            # king size 7.9-8.0, slim 5.4
CIG_WALL = 1.4
CIG_SNAP = 0.85        # clip mouth as a fraction of CIG_D
CIG_LEN = 30.0
CIG_Y = -120.0         # clip centre, below the MagSafe charger and clocking magnet

BUTTONS = globals().get("BUTTONS", "windows")
KEYS = tuple(globals().get("KEYS", ()))
CLOSED = tuple(globals().get("CLOSED", ()))
CAMERA = globals().get("CAMERA", "fitted")
BACK_BAND = globals().get("BACK_BAND")
PLATE = globals().get("PLATE", False)
WALLS = globals().get("WALLS", "full")
MAGSAFE = globals().get("MAGSAFE")
SLIDER = globals().get("SLIDER", False)
CIG = globals().get("CIG", False)


def _outline_module():
    """phone-body.py owns the squircle outline and the exact ring offset."""
    spec = importlib.util.spec_from_file_location("phone_body", OUTLINE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def prism(ring, z0, z1):
    face = make_face(Polyline(*[(x, y) for x, y in ring], close=True))
    return extrude(Pos(0, 0, z0) * face, amount=z1 - z0)


def span(x0, x1, y0, y1, z0, z1):
    """Axis box between two corners, any order."""
    return Pos((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2) * Box(
        abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))


pb = _outline_module()
spec = json.loads(SPEC.read_text())
names = {b["name"] for b in spec["buttons"]}
assert BACK <= spec["case_hard_limits"]["max_backside_thickness"]
assert CLEAR + WALL <= 1.8
assert CLEAR < LIP < 1.05
assert BUTTONS in ("windows", "slot") and CAMERA in ("fitted", "universal")
assert WALLS in ("full", "sides", "corners") and MAGSAFE in (None, "ring", "open")
assert set(KEYS) | set(CLOSED) <= names and not set(KEYS) & set(CLOSED)
assert not (KEYS and WALLS == "corners"), "corner walls leave no wall for a key"
assert not PLATE or BACK_BAND, "the plate sits in a banded back"
assert not MAGSAFE or BACK_BAND is None, "magnets and the charger need the full back"
assert not SLIDER or CAMERA == "fitted", "the slider covers a fitted window"
assert not (SLIDER and MAGSAFE), "slider rails reach y -52, a charger's top edge is at -45"
body = spec["body"]
W, L, T = body["width"], body["length"], body["thickness"]

ring = pb.plan_outline(body["corner"]["polyline"], W, L)
outer = pb.offset_ring(ring, -(CLEAR + WALL))   # negative is outward
inner = pb.offset_ring(ring, -CLEAR)
front = pb.offset_ring(ring, LIP)

Z_BACK = -T                 # back face of the phone
Z_CASE_BACK = Z_BACK - BACK  # outer back of the case
Z_LENS = Z_BACK - spec["glass"]["back_glass_to_camera_glass"]
Z_RING = Z_LENS - GLASS_GAP
OUT = CLEAR + WALL

part = prism(outer, Z_CASE_BACK, PROUD)
part -= prism(inner, Z_BACK, 0.0)     # phone pocket
part -= prism(front, 0.0, PROUD)      # front window, inside the lip


def edge_port(w, h, cx, cz, top, shape=SlotOverall):
    """Opening w along x, h along z through the top or bottom wall, with the
    45 deg outside chamfer ADG 5.2.3.1 asks of speaker and mic openings."""
    y_out = OUT if top else -(L + OUT)
    inward = -1 if top else 1
    ch = WALL - PORT_LAND + 1          # chamfer depth, started 1 outside the wall
    plane = Plane(origin=(cx, y_out - inward, cz), x_dir=(1, 0, 0), z_dir=(0, inward, 0))
    hole = extrude(plane * make_face(shape(w, h)), amount=WALL + CLEAR + 2)
    return hole + extrude(plane * make_face(shape(w + 2 * ch, h + 2 * ch)), amount=ch, taper=45)


def keepout_cone(cx, cy, z0, r0, half_angle, z1):
    """Frustum from radius r0 at z0 opening outward (-z) at half_angle to z1."""
    h = z0 - z1
    r1 = r0 + h * math.tan(math.radians(half_angle))
    return Pos(cx, cy, z0) * Cone(r1, r0, h, align=(Align.CENTER, Align.CENTER, Align.MAX))


def side_box(side, d0, d1, y0, y1, z0, z1):
    """Box d0..d1 outward from the phone's left or right face."""
    if side == "right":
        return span(W + d0, W + d1, y0, y1, z0, z1)
    return span(-d0, -d1, y0, y1, z0, z1)


bottom = spec["bottom_edge"]

# USB-C: Apple's recommended connector keepout, an obround 12.45 x 6.6, grown
# by CLEAR because the phone shifts that far inside the case (ADG 5.1.2.3).
usb = bottom["usb_c"]
ko = usb["recommended_connector_keepout"]
part -= Pos(sum(usb["opening_x"]) / 2, -L, usb["opening_centre_z"]) * extrude(
    Plane.XZ * make_face(SlotOverall(ko["width"] + 2 * CLEAR, ko["height"] + 2 * CLEAR)),
    amount=WALL + CLEAR + 2, both=True,
)

# Speaker / mic ports: one opening per group, PORT_OFFSET past the outer holes.
sp = bottom["speaker_ports"]
for grp in (sp["left_group"], sp["right_group"]):
    x0, x1 = grp["x_span"]
    part -= edge_port(x1 - x0 + 2 * PORT_OFFSET, sp["diameter"] + 2 * PORT_OFFSET,
                      (x0 + x1) / 2, sp["centre_z"], top=False)

# Receiver / front mic slot in the top edge, centred on the width. A notch up
# through the rim: its sound leaves forward past the glass as well as up.
rec = spec["top_edge"]["receiver_slot"]
rec_z0 = rec["z_from_front"][1] - RECEIVER_CLEAR
rec_z1 = PROUD + 1
part -= edge_port(rec["width"] + 2 * RECEIVER_CLEAR, rec_z1 - rec_z0, W / 2, (rec_z0 + rec_z1) / 2,
                  top=True, shape=Rectangle)

# Buttons. Open ones are cut-through windows with rails kept above and below;
# "slot" merges the open ones on a side into one window. Keys and covered
# buttons keep the wall, relieved KEY_GAP off the button top. A key is a tab
# cut free on three sides, hinged KEY_HINGE above the window, with a nub on
# its inner face over the button.
bx = spec["button_cross_section"]
zc = bx["centre_z"]
half = -BUTTON_RAIL - zc          # rail to centre, same both sides of the midplane
thru = OUT + 2
windows = [(b["side"], b["center_y"] + b["length"] / 2, b["center_y"] - b["length"] / 2)
           for b in spec["buttons"] if b["name"] not in KEYS + CLOSED]
if BUTTONS == "slot":
    windows = [(side, max(t for s_, t, _ in windows if s_ == side),
                min(b for s_, _, b in windows if s_ == side))
               for side in sorted({s_ for s_, _, _ in windows})]
for side, top, bot in windows:
    part -= side_box(side, -thru, thru, top + BUTTON_MARGIN, bot - BUTTON_MARGIN, zc - half, zc + half)
for b in spec["buttons"]:
    if b["name"] not in KEYS + CLOSED:
        continue
    side, cy, bl = b["side"], b["center_y"], b["length"]
    relief = b["protrusion"] + KEY_GAP
    part -= side_box(side, 0, relief, cy + bl / 2 + 0.5, cy - bl / 2 - 0.5,
                     zc - bx["width_across_thickness"] / 2 - 0.3,
                     zc + bx["width_across_thickness"] / 2 + 0.3)
    if b["name"] in CLOSED:
        continue
    free, root = cy - bl / 2 - BUTTON_MARGIN, cy + bl / 2 + BUTTON_MARGIN + KEY_HINGE
    for z in (zc - half, zc + half):
        part -= side_box(side, -thru, thru, free - KEY_SLOT, root, z - KEY_SLOT / 2, z + KEY_SLOT / 2)
    part -= side_box(side, -thru, thru, free - KEY_SLOT, free, zc - half, zc + half)
    part += side_box(side, relief - KEY_NUB, relief + 0.01, cy + 1.5, cy - 1.5, zc - 1.0, zc + 1.0)

# Wall styles: walls cut away between corners, down to the back plate.
top_z = (Z_BACK, PROUD + 1)
if WALLS in ("sides", "corners"):
    for y0, y1 in ((5, -LIP - 1), (-L + LIP + 1, -L - 5)):
        part -= span(CORNER_L, W - CORNER_L, y0, y1, *top_z)
if WALLS == "corners":
    for x0, x1 in ((-5, LIP + 1), (W - LIP - 1, W + 5)):
        part -= span(x0, x1, -CORNER_L, -(L - CORNER_L), *top_z)

# Rear camera cluster: one opening over lens, flash and rear mic.
cam = spec["rear_camera"]
xs, ys = [], []
for feat, dia in (
    (cam["lens"], cam["lens"]["outer_diameter"]),
    (cam["flash"], cam["flash"]["diameter"]),
    (cam["rear_mic"], cam["rear_mic"]["diameter"]),
):
    cx, cy = feat["center"]
    xs += [cx - dia / 2, cx + dia / 2]
    ys += [cy - dia / 2, cy + dia / 2]
cam_w = max(xs) - min(xs) + 2 * FEATURE_MARGIN
cam_l = max(ys) - min(ys) + 2 * FEATURE_MARGIN
cam_x, cam_y = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
cam_c = Pos(cam_x, cam_y, 0)

cones = cam["keepout_cones"]
fx, fy = cam["flash"]["center"]
fi, fo = cones["flash_inner"], cones["flash_outer"]
z_tr = Z_BACK - fo["transition_to_back_glass"]
lx, ly = cam["lens"]["center"]
lc = cones["rear_camera"]


def flash_r(z):
    """Flash keepout radius at z past the transition, grown by CLEAR."""
    return fo["diameter_at_transition"] / 2 + CLEAR + (z_tr - z) * math.tan(math.radians(fo["angle"] / 2))


def lens_r(z):
    """Lens keepout radius at z past the lens cover, grown by CLEAR."""
    return lc["base_diameter"] / 2 + CLEAR + (Z_LENS - z) * math.tan(math.radians(lc["angle"] / 2))


# Slider: a plate riding on a raised track in two rails, sliding down (-y)
# from covering the window to clear of the lens and flash keepouts at its own
# depth. Both rail lips stand outside both keepouts at the lip's depth.
if SLIDER:
    z_sl = Z_RING - SL_T                          # slider outside face
    z_lip = z_sl - SL_CLR - RAIL_LIP_T            # rail lip outside face
    sl_top = cam_y + cam_l / 2 + RING_W
    sl_l = cam_l + 2 * RING_W
    open_top = min(fy - flash_r(z_sl), ly - lens_r(z_sl)) - 0.5
    lip_x0 = min(fx - flash_r(z_lip), lx - lens_r(z_lip)) - 0.5
    lip_x1 = max(fx + flash_r(z_lip), lx + lens_r(z_lip)) + 0.5
    sl_x0 = min(cam_x - cam_w / 2 - RING_W, lip_x0 - RAIL_LIP + SL_CLR)
    sl_x1 = max(cam_x + cam_w / 2 + RING_W, lip_x1 + RAIL_LIP - SL_CLR)
    assert sl_x1 + SL_CLR + RAIL_W <= W + OUT, "right rail falls off the case"
    rail_bot = open_top - sl_l - 1.0
    track = span(sl_x0 - SL_CLR - RAIL_W, sl_x1 + SL_CLR + RAIL_W, sl_top + 1.5, rail_bot,
                 Z_RING, Z_CASE_BACK + 0.5)
    rails = track
    for web0, web1, lip0 in ((sl_x0 - SL_CLR - RAIL_W, sl_x0 - SL_CLR, sl_x0 + RAIL_LIP),
                             (sl_x1 + SL_CLR + RAIL_W, sl_x1 + SL_CLR, sl_x1 - RAIL_LIP)):
        rails += span(web0, web1, sl_top + 1.5, rail_bot, z_lip, Z_RING + 0.01)
        rails += span(web0, lip0, sl_top + 1.5, rail_bot, z_lip, z_lip + RAIL_LIP_T)
        rails += span(web0, lip0, sl_top + 1.5, sl_top + 0.2, z_lip, Z_RING)   # closed stop
    slider = span(sl_x0, sl_x1, sl_top, sl_top - sl_l, z_sl, Z_RING - 0.05)
    slider += span(sl_x0 + 3, sl_x1 - 3, sl_top - sl_l + 1.0, sl_top - sl_l + 2.0,
                   z_sl - 0.6, z_sl + 0.01)                                     # thumb ridge

# Banded back, then the spine and swap-in plate rebate.
spine_bot = None
if BACK_BAND is not None:
    part -= prism(pb.offset_ring(ring, BACK_BAND), Z_RING - 5, Z_BACK)
    if PLATE:
        rebate = pb.offset_ring(ring, BACK_BAND - PLATE_LEDGE)
        part -= prism(rebate, Z_BACK - PLATE_T, Z_BACK)
    if CAMERA == "fitted":
        spine_bot = (rail_bot if SLIDER else cam_y - cam_l / 2 - RING_W) - SPINE_W
        part += span(-10, W + 10, 10, spine_bot, Z_CASE_BACK, Z_BACK) & prism(outer, Z_CASE_BACK, Z_BACK)

if CAMERA == "fitted":
    # Ring tall enough to keep the lens cover GLASS_GAP off a table.
    part += cam_c * Pos(0, 0, Z_RING) * extrude(
        make_face(RectangleRounded(cam_w + 2 * RING_W, cam_l + 2 * RING_W, 4.0 + RING_W)),
        amount=Z_CASE_BACK - Z_RING + 0.5,
    )
    if SLIDER:
        part += rails & prism(outer, z_lip - 1, 0)
    window = cam_c * Pos(0, 0, Z_BACK - BACK / 2) * extrude(
        make_face(RectangleRounded(cam_w, cam_l, 4.0)), amount=BACK + 4, both=True)
else:
    # Universal: the whole top band opens, whatever the camera layout, and a
    # rim round it stands GLASS_GAP past this phone's lens cover.
    def top_band(depth):
        return Pos(W / 2, 10 - (depth + 10) / 2, 0) * Box(W + 20, depth + 10, 100)
    part += top_band(UNI_L + RING_W) & prism(outer, Z_RING, Z_CASE_BACK + 0.5)
    window = top_band(UNI_L) & prism(pb.offset_ring(ring, UNI_INSET), Z_RING - 1, Z_BACK)
part -= window

# Apple's light cones, cut past the window edge, each grown by CLEAR for the
# phone's shift in the case (ADG 5.7.1). The flash cone is 80 deg from the
# rear glass to the transition, then 155 deg.
Z_OUT = Z_RING - 6
keepout = keepout_cone(fx, fy, Z_BACK, fi["base_diameter"] / 2 + CLEAR, fi["angle"] / 2, z_tr)
keepout += keepout_cone(fx, fy, z_tr, fo["diameter_at_transition"] / 2 + CLEAR, fo["angle"] / 2, Z_OUT)
keepout += keepout_cone(lx, ly, Z_LENS, lc["base_diameter"] / 2 + CLEAR, lc["angle"] / 2, Z_OUT)
part -= keepout

# MagSafe (ADG 42.1, figs 42-2 to 42-4): magnet ring 46.00-54.10 and clocking
# magnet 6.00 x 19.31, 0.55 thick, 0.55 from the device and MS_FLOOR from the
# outside. Pockets open to the phone side; the magnets glue in, ring outer pole
# N toward the phone, inner pole S, clocking magnet S-N-S across its width.
ms = spec["magsafe"]
mx, my = ms["center"]
if MAGSAFE == "ring":
    z0, z1 = Z_CASE_BACK + MS_FLOOR, Z_BACK
    assert z1 - z0 >= MS_T + 0.5, "magnet ends up past 0.55 from the device"
    part -= Pos(mx, my, z0) * (
        Cylinder(54.10 / 2 + MS_CLR, z1 - z0, align=(Align.CENTER, Align.CENTER, Align.MIN))
        - Cylinder(46.00 / 2 - MS_CLR, z1 - z0, align=(Align.CENTER, Align.CENTER, Align.MIN)))
    part -= span(mx - 3 - MS_CLR, mx + 3 + MS_CLR, my - 31.18 + MS_CLR, my - 50.49 - MS_CLR, z0, z1)
elif MAGSAFE == "open":
    part -= Pos(mx, my, Z_BACK) * Cylinder(MS_OPEN_D / 2, 2 * BACK + 2)

# Cigarette clip: a C tube along the right edge of the back, mouth outward.
# Holds an unlit one; PETG softens near 80 C.
if CIG:
    r_in = CIG_D / 2 + 0.2
    r_out = r_in + CIG_WALL
    ccx, ccz = W + OUT - r_out, Z_CASE_BACK - r_out
    tube = Pos(ccx, CIG_Y, ccz) * Rot(90, 0, 0) * Cylinder(r_out, CIG_LEN)
    tube += span(ccx - r_out * 0.8, W + OUT, CIG_Y + CIG_LEN / 2, CIG_Y - CIG_LEN / 2,
                 ccz, Z_CASE_BACK + 0.5)
    tube -= Pos(ccx, CIG_Y, ccz) * Rot(90, 0, 0) * Cylinder(r_in, CIG_LEN + 2)
    tube -= span(ccx - CIG_SNAP * CIG_D / 2, ccx + CIG_SNAP * CIG_D / 2,
                 CIG_Y + CIG_LEN, CIG_Y - CIG_LEN, ccz - r_out - 1, ccz)
    part += tube & prism(outer, Z_CASE_BACK - 30, Z_CASE_BACK + 0.5)

# Swap-in back plate: fills the rebate, minus the camera window, keepouts and spine.
if PLATE:
    plate = prism(pb.offset_ring(ring, BACK_BAND - PLATE_LEDGE + PLATE_CLR), Z_BACK - PLATE_T, Z_BACK)
    plate -= window + keepout
    if CAMERA == "universal":
        plate -= Pos(W / 2, 10 - (UNI_L + RING_W + PLATE_CLR + 10) / 2, 0) * Box(
            W + 20, UNI_L + RING_W + PLATE_CLR + 10, 100)
    if spine_bot is not None:
        plate -= span(-10, W + 10, 10, spine_bot - PLATE_CLR, -50, 50)


if __name__ == "__main__":
    # ADG 5.1.1: no exposed glass within GLASS_GAP of a flat surface in any
    # orientation. A flat surface touches the case's convex hull, so the gap is
    # each glass point's distance to the nearest hull facet.
    import numpy as np
    from scipy.spatial import ConvexHull

    verts, _ = part.tessellate(0.02)
    eq = ConvexHull([(v.X, v.Y, v.Z) for v in verts]).equations
    lr = cam["lens"]["outer_diameter"] / 2
    a = np.linspace(0, 2 * math.pi, 180, endpoint=False)
    glass = {
        "front glass": [(x, y, 0.0) for x, y in pb.offset_ring(ring, 1.05)],
        "lens cover": [(lx + lr * math.cos(t), ly + lr * math.sin(t), Z_LENS) for t in a],
        "back glass": [(x, y, Z_BACK) for x in np.linspace(5, W - 5, 30)
                       for y in np.linspace(-5, 5 - L, 60)],
    }
    for name, pts in glass.items():
        pts = np.array(pts)
        gap = -(pts @ eq[:, :3].T + eq[:, 3]).max(axis=1).min()
        print(f"{name}: {gap:.3f} mm to a flat surface")
        assert gap >= 0.85 - 1e-6, name
