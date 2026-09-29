#!/usr/bin/env python3
"""Measure a spec JSON and its generated solid against the drawn paths in the source PDF.

The spec was read from the dimension text and the detail-A/detail-B tick marks. The
sheets also draw the product in full orthographic views whose path data shares nothing
with those details, so every value can be checked against geometry. Points map to
millimetres from each view's own extents and the printed width, length and thickness.

Frames matter and are not uniform across the sheets. A view is identified as front- or
back-facing by which side its button bumps sit on: the action and volume buttons are on
the product's left, the side button on its right. In a back-facing view the x axis runs
the other way, so an ordinate read there is 71.52 - x in the front-facing product frame
that the spec's datum declares. Sheet 1: front, back, both side and the bottom views.
Sheet 2: view 1 front, views 2 and 3 back.

Circles and corner blends are drawn as curves, so beziers are flattened before the
components are walked - without that the camera, the screws and the MagSafe zone are
all invisible.

Usage: phone-body-check.py [spec.json] [drawing.pdf]
"""

import importlib.util
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


geom = _load("pdfgeom", "pdf-geometry.py")
body = _load("phonebody", "phone-body.py")

SHEET1, SHEET2 = 20, 25
S1, S2 = 2.074425, 1.38293          # pt per mm, sheet 1 and sheet 2
FRONT_X, BACK_X, TOP_Y = 305.15, 748.69, 510.74     # sheet 1 view origins
BOTTOM_Z = 80.75                                     # front face in the bottom view
SIDE_L, SIDE_R = 159.18, 624.34                      # front face in each side view
V1_X, V2_X, V3_X, S2_Y = 63.15, 294.67, 648.93, 274.22


def flatten(segs, n=12):
    """Cubic segments as polylines. The component walker only follows lines."""
    out = []
    for s in segs:
        if s[0] == "l":
            out.append(s)
            continue
        p0, p1, p2, p3 = s[1:]
        prev = p0
        for i in range(1, n + 1):
            t = i / n
            u = 1 - t
            p = (u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
                 u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1])
            out.append(("l", prev, p))
            prev = p
    return out


def components(segs):
    """Connected components, each as (bbox, nodes, segments)."""
    comps, _ = geom.components(segs)
    owner = {node: i for i, comp in enumerate(comps) for node in comp}
    lines = [[] for _ in comps]
    for s in segs:
        k = (round(s[1][0], 2), round(s[1][1], 2))
        if k in owner:
            lines[owner[k]].append((s[1], s[2]))
    out = []
    for comp, ls in zip(comps, lines):
        xs = [p[0] for p in comp]
        ys = [p[1] for p in comp]
        out.append(((min(xs), max(xs), min(ys), max(ys)), comp, ls))
    return out


def seg_dist(p, a, b):
    vx, vy = b[0] - a[0], b[1] - a[1]
    wx, wy = p[0] - a[0], p[1] - a[1]
    d2 = vx * vx + vy * vy
    t = 0.0 if d2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / d2))
    return math.hypot(wx - t * vx, wy - t * vy)


def fit_circle(pts):
    """Least-squares centre and radius, plus the worst residual."""
    n = len(pts)
    sx = sum(p[0] for p in pts) / n
    sy = sum(p[1] for p in pts) / n
    a = b = c = d = e = f = 0.0
    for x, y in pts:
        u, v = x - sx, y - sy
        a += u * u
        b += u * v
        c += v * v
        e += 0.5 * (u * u * u + u * v * v)
        f += 0.5 * (v * v * v + v * u * u)
    det = a * c - b * b
    cx, cy = sx + (e * c - f * b) / det, sy + (a * f - b * e) / det
    r = sum(math.hypot(x - cx, y - cy) for x, y in pts) / n
    return cx, cy, r, max(abs(math.hypot(x - cx, y - cy) - r) for x, y in pts)


class Report:
    def __init__(self, tol):
        self.tol, self.rows, self.worst = tol, [], 0.0

    def add(self, group, name, spec, drawn, unit="mm", soft=False):
        """soft rows are reported but kept out of the worst-case: they compare a
        nominal radius against a corner that is drawn as a continuous-curvature
        blend, so no single circle fits it end to end."""
        d = None if spec is None else drawn - spec
        if d is not None and not soft:
            self.worst = max(self.worst, abs(d))
        self.rows.append((group, name, spec, drawn, d, unit + ("  blend" if soft else "")))

    def note(self, group, name, text):
        self.rows.append((group, name, None, text, None, ""))

    def show(self):
        last = None
        for group, name, spec, drawn, d, unit in self.rows:
            if group != last:
                print(f"\n{group}")
                last = group
            if isinstance(drawn, str):
                print(f"  {name:<34}{drawn}")
            elif spec is None:
                print(f"  {name:<34}{'':>10}  {drawn:9.3f} {unit}   not in spec")
            else:
                flag = "" if abs(d) <= self.tol or "blend" in unit else "   <-- OVER TOLERANCE"
                print(f"  {name:<34}{spec:10.3f}  {drawn:9.3f} {unit}  {d:+7.3f}{flag}")


def main():
    spec_path = Path(sys.argv[1]) if len(sys.argv) > 1 else \
        Path(__file__).resolve().parents[1] / "ref/iphone/17e.json"
    spec = json.loads(spec_path.read_text())
    pdf = Path(sys.argv[2]) if len(sys.argv) > 2 else spec_path.with_suffix(".pdf")

    b = spec["body"]
    W, L, T = b["width"], b["length"], b["thickness"]
    objs = geom.pdftext.load(str(pdf))
    c1 = components(flatten(geom.segments(objs, SHEET1)))
    c2 = components(flatten(geom.segments(objs, SHEET2)))
    r = Report(spec["general_tolerance"][0]["tol"])

    def within(comps, X0, Y0, S, box, minseg=1):
        """Components inside box (x0, x1, y0, y1) in mm, as (x0, x1, y0, y1, nodes)."""
        out = []
        for bb, nodes, ls in comps:
            x0, x1 = (bb[0] - X0) / S, (bb[1] - X0) / S
            y0, y1 = (bb[2] - Y0) / S, (bb[3] - Y0) / S
            if box[0] <= x0 and x1 <= box[1] and box[2] <= y0 and y1 <= box[3] \
                    and len(ls) >= minseg:
                out.append((x0, x1, y0, y1,
                            [((p[0] - X0) / S, (p[1] - Y0) / S) for p in nodes]))
        return out

    # ---- body outline, from both full-size views on sheet 1
    views = [c for c in c1 if abs((c[0][1] - c[0][0]) / W - S1) < 0.01
             and abs((c[0][3] - c[0][2]) / L - S1) < 0.01]
    ring = body.plan_outline(b["corner"]["polyline"], W, L)
    for n, (bb, nodes, segs) in enumerate(sorted(views, key=lambda c: c[0][0]), 1):
        x0, x1, y0, y1 = bb
        sx, sy = (x1 - x0) / W, (y1 - y0) / L
        drawn = [(((a[0]-x0)/sx, (a[1]-y1)/sy), ((c[0]-x0)/sx, (c[1]-y1)/sy))
                 for a, c in segs]
        worst = max(min(seg_dist(p, a, c) for a, c in drawn) for p in ring)
        r.add("body", f"corner polyline vs view {n}", 0.0, worst)
        r.add("body", f"view {n} scale isotropy", 0.0, (sy - sx) / sx * 100, "%")

    # ---- thickness, from the union of each narrow view's components
    for label, lo, hi, axis, run in (("left side view", 130.0, 175.0, 0, (290.0, 315.0)),
                                     ("right side view", 610.0, 655.0, 0, (290.0, 315.0)),
                                     ("bottom view", 55.0, 95.0, 1, (140.0, 155.0))):
        i, j = (0, 2) if axis == 0 else (2, 0)
        sel = [bb for bb, _, _ in c1
               if lo <= bb[i] and bb[i+1] <= hi and run[0] <= bb[j+1] - bb[j] <= run[1]]
        got = (max(bb[i+1] for bb in sel) - min(bb[i] for bb in sel)) / S1
        r.add("body", f"thickness, {label}", T, got)

    # ---- concentric plan outlines: profile terminal, flat start, glass
    front = [c for c in views if c[0][0] < 500][0]
    fx0, fx1, fy0, fy1 = front[0]
    ins = sorted({round(min((p[0]-fx0)/S1, W - (p[0]-fx0)/S1), 3)
                  for p in front[1] if -100 < (p[1]-fy1)/S1 < -50})
    prof = b["edge_profile"]["x_offsets_each_side"][-1]
    r.add("body", "profile terminal inset", prof, min(ins, key=lambda v: abs(v - prof)))
    flat = spec["display"]["housing_edge_to_flat_area_top_side"]
    r.add("body", "flat-area start inset", flat, min(ins, key=lambda v: abs(v - flat)))
    for label, printed, axis in (("glass width", spec["glass"]["front_glass_width"], 0),
                                 ("glass length", spec["glass"]["front_glass_length"], 1)):
        want = printed * S1
        hit = [bb for bb, _, _ in c1
               if abs(bb[axis*2+1] - bb[axis*2] - want) < 1.0
               and bb[(1-axis)*2+1] - bb[(1-axis)*2] < 1.0]
        r.add("body", label, printed, (hit[0][axis*2+1] - hit[0][axis*2]) / S1)

    # ---- display active area and its cutout
    d = spec["display"]
    aa = [c for c in within(c1, FRONT_X, TOP_Y, S1, (0, W, -L, 0), minseg=100)
          if abs(c[1] - c[0] - d["active_area_width"]) < 0.1][0]
    r.add("display", "active area width", d["active_area_width"], aa[1] - aa[0])
    r.add("display", "active area length", d["active_area_length"], aa[3] - aa[2])
    r.add("display", "margin, housing to active", d["housing_edge_to_active_area"], aa[0])
    notch = [p for p in aa[4] if p[1] > -12 and 20 < p[0] < 52]
    floor = min(p[1] for p in notch)
    walls = sorted(p[0] for p in notch if -5.5 < p[1] < -4.7)   # between tip blend and fillet
    cut = d["cutout"]
    r.add("display", "cutout left wall", cut["x"][0], walls[0])
    r.add("display", "cutout right wall", cut["x"][1], walls[-1])
    r.add("display", "cutout width", cut["width"], walls[-1] - walls[0])
    r.add("display", "cutout floor", cut["y_bottom"], floor)
    r.add("display", "cutout depth", cut["depth"], aa[3] - floor)
    arc = [p for p in notch if 45.3 < p[0] < 49.05 and floor + 0.05 < p[1] < -5.5]
    cx, cy, rad, res = fit_circle(arc)
    r.add("display", "cutout fillet radius", cut["bottom_corner_radius"], rad, soft=True)
    r.add("display", "fillet tangent, upper", -5.32, cy)
    r.note("display", "fillet circularity", f"{res:.4f} mm worst residual over {len(arc)} points")
    tip = [p for p in notch if 49.3 < p[0] < 50.0 and p[1] > -3.9]
    r.add("display", "cutout tip radius", cut["top_corner_radius"], fit_circle(tip)[2], soft=True)
    r.note("display", "tip circularity",
           f"{fit_circle(tip)[3]:.4f} mm worst residual - the corner is a blend, not an arc")

    # ---- buttons and SIM tray, from the side views and the front-view bumps
    for name, X0, Xf, sign in (("left", 143.01, SIDE_L, 1), ("right", 624.34, SIDE_R, -1)):
        for x0, x1, y0, y1, nodes in within(c1, X0, TOP_Y, S1, (-1, 9, -L, 0), minseg=60):
            span, mid = y1 - y0, (y0 + y1) / 2
            match = [x for x in spec["buttons"] + [dict(spec["sim_tray"], name="sim tray")]
                     if abs(x["center_y"] - mid) < 0.3 and abs(x["length"] - span) < 0.06]
            if not match:
                continue
            f = match[0]
            z0 = sign * (X0 + x0 * S1 - Xf) / S1
            z1 = sign * (X0 + x1 * S1 - Xf) / S1
            r.add("buttons", f"{f['name']} centre", f["center_y"], mid)
            r.add("buttons", f"{f['name']} length", f["length"], span)
            r.add("buttons", f"{f['name']} depth of centre", -T / 2, (z0 + z1) / 2)
            r.add("buttons", f"{f['name']} width in z",
                  3.31 if f["name"] != "sim tray" else 2.56, abs(z1 - z0))
    for x0, x1, y0, y1, nodes in within(c1, FRONT_X, TOP_Y, S1, (-1, W + 1, -L, 0), minseg=60):
        if x0 > -0.05 and x1 < W + 0.05:
            continue
        f = [x for x in spec["buttons"] if abs(x["center_y"] - (y0 + y1) / 2) < 0.3]
        if f and x1 - x0 < 1.0:
            r.add("buttons", f"{f[0]['name']} protrusion", f[0]["protrusion"],
                  max(x1 - W, -x0))

    # ---- bottom view: ports, screws, connector. x here matches the product frame
    be = spec["bottom_edge"]
    feats = within(c1, FRONT_X, BOTTOM_Z, S1, (-1, W + 1, -T - 1, 0.1), minseg=30)
    usb = [f for f in feats if abs(f[1] - f[0] - be["usb_c"]["opening_width"]) < 0.05][0]
    r.add("bottom edge", "usb-c opening left", be["usb_c"]["opening_x"][0], usb[0])
    r.add("bottom edge", "usb-c opening right", be["usb_c"]["opening_x"][1], usb[1])
    r.add("bottom edge", "usb-c opening width", be["usb_c"]["opening_width"], usb[1] - usb[0])
    r.note("bottom edge", "usb-c opening height", f"{usb[3] - usb[2]:.3f} mm drawn, not dimensioned")
    sc = [f for f in feats if abs(f[1] - f[0] - be["screws"]["diameter"]) < 0.02]
    for got, want in zip(sorted((f[0] + f[1]) / 2 for f in sc), be["screws"]["x"]):
        r.add("bottom edge", "screw centre", want, got)
    r.add("bottom edge", "screw diameter", be["screws"]["diameter"],
          sum(f[1] - f[0] for f in sc) / len(sc))
    sp = spec["bottom_edge"]["speaker_ports"]
    holes = sorted((f[0] + f[1]) / 2 for f in feats
                   if abs(f[1] - f[0] - sp["diameter"]) < 0.02 and abs(f[3] - f[2] - sp["diameter"]) < 0.02)
    r.add("bottom edge", "speaker hole count", sp["count"], len(holes))
    r.add("bottom edge", "speaker diameter", sp["diameter"],
          sum(f[1] - f[0] for f in feats if abs(f[1] - f[0] - sp["diameter"]) < 0.02) / len(holes))
    left = [h for h in holes if h < 35]
    right = [h for h in holes if h > 35]
    r.add("bottom edge", "left group span", sp["left_group"]["x_span"][1] - sp["left_group"]["x_span"][0],
          (left[-1] - left[0]) + sp["diameter"])
    r.add("bottom edge", "right group span", sp["right_group"]["x_span"][1] - sp["right_group"]["x_span"][0],
          (right[-1] - right[0]) + sp["diameter"])
    pitch = [round(b_ - a_, 4) for g in (left, right) for a_, b_ in zip(g, g[1:])]
    r.note("bottom edge", "speaker pitch",
           f"{sum(pitch)/len(pitch):.4f} mm uniform, spread {max(pitch)-min(pitch):.4f} - was unverified")

    # ---- rear camera, measured in the back view's own frame
    rc = spec["rear_camera"]
    for name, want_d, want_x in (("lens", rc["lens"]["outer_diameter"], rc["lens"]["x_back"]),
                                 ("rear mic", rc["rear_mic"]["diameter"], rc["rear_mic"]["x_back"]),
                                 ("flash", rc["flash"]["diameter"], rc["flash"]["x_back"])):
        hit = [f for f in within(c1, BACK_X, TOP_Y, S1, (0, W, -30, 0), minseg=30)
               if abs(f[1] - f[0] - want_d) < 0.02 and abs(f[3] - f[2] - want_d) < 0.02]
        if hit:
            r.add("rear camera", f"{name} diameter", want_d, hit[0][1] - hit[0][0])
            r.add("rear camera", f"{name} x, back frame", want_x, (hit[0][0] + hit[0][1]) / 2)
            r.add("rear camera", f"{name} y", rc["all_features_on_row_y"],
                  (hit[0][2] + hit[0][3]) / 2)
    bump = [bb for bb, _, ls in c1 if 135 < bb[0] and bb[1] < 144 and len(ls) > 15]
    r.add("rear camera", "back face to camera glass", rc["plateau_height_above_back_glass"],
          (143.01 - min(bb[0] for bb in bump)) / S1)

    # ---- sheet 2: MagSafe, compass, keepout boundaries. views 2 and 3 are back-facing
    ms = spec["magsafe"]
    hit = [f for f in within(c2, V3_X, S2_Y, S2, (-1, W + 1, -L, 0), minseg=40)
           if abs(f[1] - f[0] - ms["inner_zone"]["diameter"]) < 0.05][0]
    r.add("sheet 2", "magsafe inner diameter", ms["inner_zone"]["diameter"], hit[1] - hit[0])
    r.add("sheet 2", "magsafe centre x", ms["center"][0], (hit[0] + hit[1]) / 2)
    r.add("sheet 2", "magsafe centre y", ms["center"][1], (hit[2] + hit[3]) / 2)

    def edges(X0, Y0, lo, hi):
        v, h = {}, {}
        for s in flatten(geom.segments(objs, SHEET2)):
            (ax, ay), (bx, by) = s[1], s[2]
            if not (X0 - 4 < ax < X0 + 104 and X0 - 4 < bx < X0 + 104
                    and lo < ay < hi and lo < by < hi):
                continue
            if abs(ax - bx) < 0.02 and abs(ay - by) > 1:
                v[round((ax - X0) / S2, 2)] = v.get(round((ax - X0) / S2, 2), 0) + abs(ay - by) / S2
            if abs(ay - by) < 0.02 and abs(ax - bx) > 1:
                h[round((ay - Y0) / S2, 2)] = h.get(round((ay - Y0) / S2, 2), 0) + abs(ax - bx) / S2
        return ({k for k, n in v.items() if n > 5}, {k for k, n in h.items() if n > 5})

    vx, hy = edges(V2_X, 274.53, 55, 292)
    vx3, hy3 = edges(V3_X, S2_Y, 55, 292)
    vx |= vx3
    hy |= hy3
    wanted = sorted({x for reg in spec["antenna_keepouts"]["regions"] for x in reg["x_back"]
                     if 0 < x < W} | {spec["camera_keepout_region"]["x_back"][1],
                                      spec["compass"]["x_back"]})
    for want in wanted:
        near = min(vx, key=lambda v: abs(v - want))
        r.add("sheet 2", f"keepout x {want}, back frame", want, near)
    wanted_y = sorted({y for reg in spec["antenna_keepouts"]["regions"] for y in reg["y"]
                       if -L < y < 0} | {spec["camera_keepout_region"]["y"][1],
                                         spec["compass"]["center"][1]})
    for want in wanted_y:
        r.add("sheet 2", f"keepout y {want}", want, min(hy, key=lambda v: abs(v - want)))

    print(f"{spec['product']}: spec and solid vs the paths drawn in {pdf.name}")
    print(f"{'':36}{'spec':>10}  {'drawn':>9}        delta")
    r.show()
    print(f"\nworst deviation {r.worst:.4f} mm, sheet general tolerance {r.tol:.2f} mm")

    # the frame check that everything above depends on
    for label, X0, Y0, comps, S in (("front view", FRONT_X, TOP_Y, c1, S1),
                                    ("back view", BACK_X, TOP_Y, c1, S1),
                                    ("sheet 2 view 1", V1_X, S2_Y, c2, S2),
                                    ("sheet 2 view 2", V2_X, 274.53, c2, S2),
                                    ("sheet 2 view 3", V3_X, S2_Y, c2, S2)):
        bumps = [(x0, (y0 + y1) / 2) for x0, x1, y0, y1, _ in
                 within(comps, X0, Y0, S, (-1, W + 1, -L, 0), minseg=60)
                 if not (x0 > -0.05 and x1 < W + 0.05)]
        side = [x for x, y in bumps if abs(y + 52.53) < 0.3]
        facing = "front-facing" if side and side[0] > 0 else "back-facing"
        print(f"  {label:<16}{facing}  (side button at x {side[0]:.1f})")

    assert r.worst < r.tol, f"worst deviation {r.worst:.4f} mm"


if __name__ == "__main__":
    main()
