"""Parametric phone case in Blender: the geometry of parts/case-17e.py for any
phone in ref/iphone/sizes.json. 1 unit = 1 mm.

build123d stays the print source. This file reads the dimension constants and knob
defaults out of case-17e.py, and the preset knob sets out of the case-17e-* part
files, with ast, so a value changed there changes here. The geometry below follows
case-17e.py block by block; change the two together.

Frame as case-17e.py: x 0..W across the front, y 0..-L down, z 0 at the front glass.

Live, cad profile, bl py:
    ns = runpy.run_path(str(Path.home() / "Projects/Assets/case/blender/case.py"))
    ns["build"]("16", "magsafe", WALLS="sides")      # phone, preset, knob overrides
    ns["check"](obj, ...)                             # manifold, one solid, glass gap
Headless, writes case.blend beside this file (gitignored):
    Blender --background --factory-startup --python case.py -- [phone ...] [preset ...] [--all]
"""

import ast
import importlib.util
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "parts/case-17e.py"
OUTLINE = ROOT / "extract/phone-body.py"
APPLE = ROOT / "ref/iphone"
SIZES = APPLE / "sizes.json"
REF_SPEC = APPLE / "17e.json"
BLEND = Path(__file__).resolve().parent / "case.blend"
SOLVER = "MANIFOLD"   # every operand is a closed loft, which is all this solver needs
SEG = 64              # segments per full circle
SPLINE = 8            # samples per span between dimensioned corner points


def consts(knobs):
    """case-17e.py's upper-case top-level assignments, evaluated in order with the
    knobs pre-set, the way runpy init_globals feeds them. Lines needing the phone
    fail to evaluate and are skipped."""
    ns = dict(knobs)
    for node in ast.parse(SOURCE.read_text()).body:
        if not (isinstance(node, ast.Assign) and len(node.targets) == 1
                and isinstance(node.targets[0], ast.Name) and node.targets[0].id.isupper()):
            continue
        try:
            ns[node.targets[0].id] = eval(compile(ast.Expression(node.value), str(SOURCE), "eval"), ns)
        except (NameError, AttributeError):
            pass
    ns.pop("__builtins__", None)
    return ns


def presets():
    """{name: (init_globals, output)} from parts/case-17e-*.py; `case` is the bare file.
    case-17e-corner cuts a coupon rather than setting knobs, so it has no entry."""
    out = {"case": ({}, "part")}
    for f in sorted(SOURCE.parent.glob("case-17e-*.py")):
        tree = ast.parse(f.read_text())
        kw = [k.value for n in ast.walk(tree) if isinstance(n, ast.Call)
              for k in n.keywords if k.arg == "init_globals"]
        if not kw:
            continue
        sub = next(n.slice.value for n in ast.walk(tree)
                   if isinstance(n, ast.Subscript) and isinstance(n.slice, ast.Constant))
        out[f.stem.removeprefix("case-17e-")] = (ast.literal_eval(kw[0]), sub)
    return out


def _outline_module():
    spec = importlib.util.spec_from_file_location("phone_body", OUTLINE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pb = _outline_module()


def convex(ring):
    n = len(ring)
    return all((ring[i][0] - ring[i - 1][0]) * (ring[(i + 1) % n][1] - ring[i][1])
               - (ring[i][1] - ring[i - 1][1]) * (ring[(i + 1) % n][0] - ring[i][0]) >= -1e-9 for i in range(n))


def offset(ring, dist):
    """pb.offset_ring, or where its mitres fold over - an inward offset deeper than a
    corner's curvature - the intersection of the ring's inward-shifted half-planes."""
    out = pb.offset_ring(ring, dist)
    if convex(out):
        return out
    poly = list(ring)
    for i in range(len(ring)):
        (ax, ay), (bx, by) = ring[i], ring[(i + 1) % len(ring)]
        m = math.hypot(bx - ax, by - ay)
        nx, ny = -(by - ay) / m, (bx - ax) / m
        c = nx * ax + ny * ay + dist
        side = [nx * x + ny * y - c for x, y in poly]
        nxt = []
        for j in range(len(poly)):
            k = (j + 1) % len(poly)
            if side[j] >= 0:
                nxt.append(poly[j])
            if (side[j] >= 0) != (side[k] >= 0):
                t = side[j] / (side[j] - side[k])
                nxt.append((poly[j][0] + t * (poly[k][0] - poly[j][0]), poly[j][1] + t * (poly[k][1] - poly[j][1])))
        poly = nxt
    return poly


# Phones ----------------------------------------------------------------------

def from_spec(s):
    """A full drawing transcription, iphone-17e.json's shape."""
    b, cam, bot = s["body"], s["rear_camera"], s["bottom_edge"]
    usb, sp, bx = bot["usb_c"], bot["speaker_ports"], s["button_cross_section"]
    ko, rec, cones = usb["recommended_connector_keepout"], s["top_edge"]["receiver_slot"], cam["keepout_cones"]
    return {
        "W": b["width"], "L": b["length"], "T": b["thickness"],
        "corner": [tuple(p) for p in b["corner"]["polyline"]],
        "buttons": [{k: x[k] for k in ("name", "side", "center_y", "length", "protrusion")} for x in s["buttons"]],
        "bx": (bx["width_across_thickness"], bx["centre_z"]),
        "usb": (sum(usb["opening_x"]) / 2, usb["opening_centre_z"], ko["width"], ko["height"]),
        "speakers": (sp["diameter"], sp["centre_z"], [sp["left_group"]["x_span"], sp["right_group"]["x_span"]]),
        "receiver": (rec["width"], rec["z_from_front"]),
        "lenses": [(*cam["lens"]["center"], cam["lens"]["outer_diameter"])],
        "flash": (*cam["flash"]["center"], cam["flash"]["diameter"]),
        "others": [(*cam["rear_mic"]["center"], cam["rear_mic"]["diameter"])],
        "plateau": None,
        "lens_z": s["glass"]["back_glass_to_camera_glass"],
        "flash_z": 0.0,
        "lens_cone": (cones["rear_camera"]["angle"], cones["rear_camera"]["base_diameter"]),
        "flash_inner": (cones["flash_inner"]["angle"], cones["flash_inner"]["base_diameter"]),
        "flash_outer": (cones["flash_outer"]["angle"], cones["flash_outer"]["diameter_at_transition"],
                        cones["flash_outer"]["transition_to_back_glass"]),
        "magsafe": tuple(s["magsafe"]["center"]),
        "max_back": s["case_hard_limits"]["max_backside_thickness"],
        "notes": [],
    }


def corner_points(c):
    """iphone-sizes corner ordinates as points from the side edge (x 0) to the end
    edge (y 0), the order of the 17e polyline. x pairs with y read backwards."""
    xs, ys = (c["x"], c["y"]) if isinstance(c, dict) else (c, c)
    n = len(xs)
    return [(0.0, -ys[-1])] + [(xs[i], -ys[n - 2 - i]) for i in range(n - 1)] + [(xs[-1], 0.0)]


def spline(pts, per=SPLINE):
    """Centripetal Catmull-Rom through the points, run in tangent to both edges."""
    d0, d1 = math.dist(pts[0], pts[1]), math.dist(pts[-2], pts[-1])
    p = [np.array(q, float) for q in [(pts[0][0], pts[0][1] - d0), *pts, (pts[-1][0] + d1, pts[-1][1])]]
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1:i + 3]
        t1 = np.linalg.norm(p1 - p0) ** 0.5
        t2 = t1 + np.linalg.norm(p2 - p1) ** 0.5
        t3 = t2 + np.linalg.norm(p3 - p2) ** 0.5
        for t in np.linspace(t1, t2, per, endpoint=False):
            a1 = ((t1 - t) * p0 + t * p1) / t1
            a2 = ((t2 - t) * p1 + (t - t1) * p2) / (t2 - t1)
            a3 = ((t3 - t) * p2 + (t - t2) * p3) / (t3 - t2)
            b1 = ((t2 - t) * a1 + t * a2) / t2
            b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1)
            out.append(tuple(((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1)))
    # offset_ring needs a convex ring: the spline overshoots past the edge lines on
    # sparse sheets, so clamp to them and drop every vertex that turns outward.
    chain = []
    for x, y in out + [tuple(pts[-1])]:
        q = (max(x, 0.0), min(y, 0.0))
        while len(chain) >= 2 and ((chain[-1][0] - chain[-2][0]) * (q[1] - chain[-2][1])
                                   - (chain[-1][1] - chain[-2][1]) * (q[0] - chain[-2][0])) >= -1e-9:
            chain.pop()
        chain.append(q)
    return chain


def from_sizes(e):
    """A one-sheet iphone-sizes entry. What those sheets leave out - ports, receiver
    slot, button protrusion, light-cone sizes - is taken from the 17e drawing:
    ports centred on the width, cones sized round each flash as 17e's is round its."""
    ref = from_spec(json.loads(REF_SPEC.read_text()))
    W, L, T = e["body"]["w"], e["body"]["l"], e["body"]["t"]
    assert e.get("corner"), "sheet has no corner profile"
    cam, proud, left = e["camera"], e["proud"], e["left"]
    notes = ["ports, receiver, protrusion, cones from 17e"]

    def feat(f):
        if f and None not in (f.get("x"), f.get("y"), f.get("d")):
            return (W - f["x"], f["y"], f["d"])   # back-view x, mirrored to the front view
        return None

    rename = {"vol_up": "volume_up", "vol_down": "volume_down", "side": "side_power"}
    buttons = [{"name": rename.get(n, n), "side": side, "center_y": -v["c"], "length": v["len"],
                "protrusion": ref["buttons"][0]["protrusion"]}
               for side in ("left", "right") for n, v in (e.get(side) or {}).items()
               if isinstance(v, dict) and n != "sim"]
    assert all(b["length"] for b in buttons), "button without a length on the sheet"
    shift = (W - ref["W"]) / 2
    rd, rz, rg = ref["speakers"]
    flash = feat(cam.get("flash"))
    if flash is None:
        notes.append("flash not located on the sheet, no flash cone")
    others = [f for f in (feat(cam.get("mic")), feat(cam.get("sensor"))) if f]
    plateau = cam.get("plateau")
    if isinstance(plateau, dict):
        xs, ys = plateau["x"], plateau["y"]
        # ponytail: one missing ordinate span is taken from the other axis, the plateaus
        # with a gap are square; read it off the sheet to drop this.
        if None in ys:
            ys = [-v for v in xs]
            notes.append("plateau y taken square from x")
        plateau = (W - xs[1], W - xs[0], ys[1], ys[0])
    elif plateau is not None:
        plateau = "full"
    lens_z = proud.get("glass") or proud.get("turret") or proud["plateau"] + proud["glass_above_plateau"]
    fi, fo = ref["flash_inner"], ref["flash_outer"]
    fd = (flash or ref["flash"])[2] - ref["flash"][2]
    return {
        "W": W, "L": L, "T": T,
        "corner": spline(corner_points(e["corner"])),
        "buttons": buttons,
        "bx": (left["w"], -left["c"]),
        "usb": (W / 2, -T / 2, *ref["usb"][2:]),
        "speakers": (rd, -T / 2, [[x0 + shift, x1 + shift] for x0, x1 in rg]),
        "receiver": ref["receiver"],
        "lenses": [feat(f) for f in cam["lens"]],
        "flash": flash,
        "others": others,
        "plateau": plateau,
        "lens_z": lens_z,
        "flash_z": proud.get("plateau", 0.0),
        "lens_cone": ref["lens_cone"],
        "flash_inner": (fi[0], fi[1] + fd),
        "flash_outer": (fo[0], fo[1] + fd, fo[2]),
        "magsafe": (W / 2, -L / 2),
        "max_back": ref["max_back"],
        "notes": notes,
    }


def phone(name):
    e = json.loads(SIZES.read_text())["phones"][name]
    if "spec" in e:
        return from_spec(json.loads((APPLE / e["spec"]).read_text()))
    return from_sizes(e)


def phones():
    return list(json.loads(SIZES.read_text())["phones"])


# Solids ----------------------------------------------------------------------

class S:
    """A closed mesh with build123d's + - & operators, each a new boolean result."""

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
    """build123d RectangleRounded."""
    pts = []
    for k, (sx, sy) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        ox, oy = cx + sx * (w / 2 - r), cy + sy * (h / 2 - r)
        for i in range(n + 1):
            a = math.pi / 2 * (k + i / n)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def slot(w, h, n=SEG // 2):
    """build123d SlotOverall: w overall along the first axis, h across, round ends."""
    r = h / 2
    return [(sx * (w / 2 - r) + r * math.cos(a), r * math.sin(a))
            for sx, a0 in ((1, -math.pi / 2), (-1, math.pi / 2))
            for a in (a0 + math.pi * i / n for i in range(n + 1))]


def cylinder(cx, cy, r, z0, z1):
    return prism(circle(r, cx, cy), z0, z1)


def keepout_cone(cx, cy, z0, r0, half_angle, z1):
    """Frustum from radius r0 at z0 opening outward (-z) at half_angle to z1."""
    r1 = r0 + (z0 - z1) * math.tan(math.radians(half_angle))
    return loft([[(x, y, z0) for x, y in circle(r0, cx, cy)], [(x, y, z1) for x, y in circle(r1, cx, cy)]])


# Case ------------------------------------------------------------------------

def build(name="17e", preset="case", **knobs):
    """Every solid case-17e.py makes for this phone and knob set, as objects in the
    `case` collection: `part`, and `plate` / `slider` where the knobs make them."""
    global SCRATCH
    base, _ = PRESETS[preset]
    g = consts({**base, **knobs})
    globals().update(g)
    p = phone(name)
    W, L, T = p["W"], p["L"], p["T"]

    names = {b["name"] for b in p["buttons"]}
    assert BACK <= p["max_back"]
    assert CLEAR + WALL <= 1.8
    assert CLEAR < LIP < 1.05
    assert BUTTONS in ("windows", "slot") and CAMERA in ("fitted", "universal")
    assert WALLS in ("full", "sides", "corners") and MAGSAFE in (None, "ring", "open")
    assert set(KEYS) | set(CLOSED) <= names and not set(KEYS) & set(CLOSED), f"buttons are {sorted(names)}"
    assert not (KEYS and WALLS == "corners"), "corner walls leave no wall for a key"
    assert not PLATE or BACK_BAND, "the plate sits in a banded back"
    assert not MAGSAFE or BACK_BAND is None, "magnets and the charger need the full back"
    assert not SLIDER or CAMERA == "fitted", "the slider covers a fitted window"
    assert not (SLIDER and MAGSAFE), "slider rails reach y -52, a charger's top edge is at -45"
    assert not (CAMERA == "fitted" and p["plateau"] == "full"), "full-width camera plateau, use CAMERA universal"
    assert not CIG or CIG_Y - CIG_LEN / 2 > -L, "cigarette clip runs off the bottom"

    SCRATCH = bpy.data.collections.new("case-scratch")
    bpy.context.scene.collection.children.link(SCRATCH)

    ring = pb.plan_outline(p["corner"], W, L)
    outer = offset(ring, -(CLEAR + WALL))
    inner = offset(ring, -CLEAR)
    front = offset(ring, LIP)

    Z_BACK = -T
    Z_CASE_BACK = Z_BACK - BACK
    Z_LENS = Z_BACK - p["lens_z"]
    Z_RING = Z_LENS - GLASS_GAP
    OUT = CLEAR + WALL

    part = prism(outer, Z_CASE_BACK, PROUD)
    part -= prism(inner, Z_BACK, 0.0)
    part -= prism(front, 0.0, PROUD)

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

    # Receiver slot notch up through the rim.
    rw, rz = p["receiver"]
    rec_z0 = rz[1] - RECEIVER_CLEAR
    rec_z1 = PROUD + 1
    part -= edge_port(rw + 2 * RECEIVER_CLEAR, rec_z1 - rec_z0, W / 2, (rec_z0 + rec_z1) / 2, top=True, shape=rect)

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
        part -= side_box(side, -thru, thru, top + BUTTON_MARGIN, bot - BUTTON_MARGIN, zc - half, zc + half)
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
            part += span(-10, W + 10, 10, spine_bot, Z_CASE_BACK, Z_BACK) & prism(outer, Z_CASE_BACK, Z_BACK)

    def top_band(depth):
        return span(-10, W + 10, 10, -depth, -50, 50)

    if CAMERA == "fitted":
        part += prism(rounded(cam_w + 2 * RING_W, cam_l + 2 * RING_W, 4.0 + RING_W, cam_x, cam_y),
                      Z_RING, Z_CASE_BACK + 0.5)
        if SLIDER:
            part += rails & prism(outer, z_lip - 1, 0)
        window = prism(rounded(cam_w, cam_l, 4.0, cam_x, cam_y), Z_BACK - BACK / 2 - BACK - 4, Z_BACK - BACK / 2 + BACK + 4)
    else:
        assert cam_y - cam_l / 2 >= -UNI_L, "camera reaches past the universal window"
        part += top_band(UNI_L + RING_W) & prism(outer, Z_RING, Z_CASE_BACK + 0.5)
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
        label = f"case-{name}-{preset}" + ("" if key == "part" else f"-{key}")
        old = bpy.data.objects.get(label)
        if old:
            bpy.data.objects.remove(old)
        SCRATCH.objects.unlink(s.obj)
        col.objects.link(s.obj)
        s.obj.name = s.obj.data.name = label
        s.obj["phone"], s.obj["preset"], s.obj["knobs"] = name, preset, json.dumps({**base, **knobs})
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
    vol, bad, parts = solid_check(obj)
    line = f"{obj.name}: {vol / 1000:.2f} cm3, {bad} open edges, {parts} solid{'s' * (parts != 1)}"
    ok = bad == 0 and parts == 1 and vol > 0
    if glass and obj.name in GLASS:
        gaps = {k: glass_gap(obj, v) for k, v in GLASS[obj.name].items()}
        line += " | " + ", ".join(f"{k} {g:.3f}" for k, g in gaps.items())
        ok &= all(g >= 0.85 - 1e-6 for g in gaps.values())
    print(("ok   " if ok else "FAIL ") + line)
    return ok


PRESETS = presets()


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    names = phones() if "--all" in args else [a for a in args if a in phones()] or ["17e"]
    sets = [a for a in args if a in PRESETS] or list(PRESETS)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system, s.unit_settings.scale_length, s.unit_settings.length_unit = "METRIC", 0.001, "MILLIMETERS"
    for i, n in enumerate(names):
        for j, pr in enumerate(sets):
            try:
                made = build(n, pr)
            except AssertionError as e:
                print(f"skip {n} {pr}: {e}")
                continue
            for k, o in enumerate(made.values()):
                o.location = (j * 100 + k * 90, -i * 200, 0)
                check(o)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    BLEND.with_suffix(".blend1").unlink(missing_ok=True)
    print(f"saved {BLEND}")


if __name__ == "__main__" and bpy.app.background:
    main()
