"""Phones for the case, from the drawing data in ref/iphone/. 1 unit = 1 mm.

A phone is a flat dict the case geometry reads.
ref/iphone/sizes.json names every phone: an entry with `spec` points
at a full drawing transcription (ref/iphone/17e.json's shape, read by from_spec); the
rest are one-sheet summaries (from_sizes), and what those sheets leave out is taken
from the 17e drawing.

Frame: x 0..W across the front, y 0..-L down, z 0 at the front glass.
"""

import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
APPLE = ROOT / "ref/iphone"
SIZES = APPLE / "sizes.json"
REF_SPEC = APPLE / "17e.json"
SPLINE = 8            # samples per span between dimensioned corner points


def shoelace(ring):
    return sum(ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1]
               for i in range(len(ring))) / 2.0


def plan_outline(corner, width, length):
    """The corner polyline reflected into all four corners, closed and counterclockwise.

    The polyline runs from the side edge (x 0) to the end edge (y 0), so the reflected
    copies must alternate direction for the ring to stay continuous.
    """
    mx = [(width - x, y) for x, y in corner]
    my = [(x, -length - y) for x, y in corner]
    mxy = [(width - x, -length - y) for x, y in corner]
    ring = [tuple(p) for p in corner] + mx[::-1] + mxy + my[::-1]
    if shoelace(ring) < 0:
        ring.reverse()
    return ring


def offset_ring(ring, dist):
    """Inward offset of a convex ring by dist, exact: each vertex is the intersection
    of its two offset edges."""
    n = len(ring)
    normals = []
    for i in range(n):
        ax, ay = ring[i]
        bx, by = ring[(i + 1) % n]
        tx, ty = bx - ax, by - ay
        m = math.hypot(tx, ty)
        normals.append((-ty / m, tx / m))  # inward, for a counterclockwise ring
    out = []
    for i in range(n):
        n1, n2 = normals[i - 1], normals[i]
        vx, vy = ring[i]
        det = n1[0] * n2[1] - n1[1] * n2[0]
        if abs(det) < 1e-9:  # collinear edges: no corner to solve, slide along the normal
            out.append((vx + dist * n2[0], vy + dist * n2[1]))
            continue
        c1 = vx * n1[0] + vy * n1[1] + dist
        c2 = vx * n2[0] + vy * n2[1] + dist
        out.append(((c1 * n2[1] - c2 * n1[1]) / det,
                    (n1[0] * c2 - n2[0] * c1) / det))
    return out


def convex(ring):
    n = len(ring)
    return all((ring[i][0] - ring[i - 1][0]) * (ring[(i + 1) % n][1] - ring[i][1])
               - (ring[i][1] - ring[i - 1][1]) * (ring[(i + 1) % n][0] - ring[i][0]) >= -1e-9 for i in range(n))


def offset(ring, dist):
    """offset_ring, or where its mitres fold over - an inward offset deeper than a
    corner's curvature - the intersection of the ring's inward-shifted half-planes."""
    out = offset_ring(ring, dist)
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
            return (W - f["x"], f["y"], f["d"])   # back-view x, flipped to the front view
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

