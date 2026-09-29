#!/usr/bin/env python3
"""Body solid from an Apple dimensional-drawing JSON (see ref/).

Sweeps the plan outline - the detail-A corner polyline mirrored into four corners -
through the detail-B edge profile and writes a binary STL in drawing coordinates:
x 0..width, y 0..-length, z 0..-thickness, with z 0 at the front cover-glass plane.

Usage: phone-body.py <spec.json> [out.stl]
Self-check: phone-body.py --test
"""

import json
import math
import struct
import sys
from pathlib import Path


def shoelace(ring):
    return sum(ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1]
               for i in range(len(ring))) / 2.0


def plan_outline(corner, width, length):
    """The corner polyline mirrored into all four corners, closed and counterclockwise.

    The polyline runs from the side edge (x 0) to the end edge (y 0), so the mirrored
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


def levels(spec):
    """(z, inward offset) front face to back face.

    The sheet dimensions the profile only out to |z| 3.82, where the side has rolled
    0.91 inward. The faces at |z| 3.90 are inset by where the surface goes flat, which
    the front view calls out as 1.15 and draws as a fourth concentric outline. The
    glass is a separate boundary 1.05 in and is not the edge of the solid.
    """
    body = spec["body"]
    half_t = body["edge_profile"]["half_thickness"]
    face = spec["display"]["housing_edge_to_flat_area_top_side"]
    pairs = sorted(((p["z_from_midplane"], p["inward_offset"])
                    for p in body["edge_profile"]["pairing"]), reverse=True)
    front = [(half_t, face)] + pairs
    both = front + [(-z, o) for z, o in reversed(front)]
    return [(z - half_t, o) for z, o in both]  # z 0 at the front face


def solid(spec):
    body = spec["body"]
    ring = plan_outline(body["corner"]["polyline"], body["width"], body["length"])
    rows = [(z, offset_ring(ring, o)) for z, o in levels(spec)]

    tris = []
    n = len(ring)
    for (zu, up), (zd, dn) in zip(rows, rows[1:]):
        for j in range(n):
            k = (j + 1) % n
            a, b = (up[j][0], up[j][1], zu), (dn[j][0], dn[j][1], zd)
            c, d = (up[k][0], up[k][1], zu), (dn[k][0], dn[k][1], zd)
            tris += [(a, b, c), (c, b, d)]

    for z, r, front in ((rows[0][0], rows[0][1], True), (rows[-1][0], rows[-1][1], False)):
        cx = sum(p[0] for p in r) / n
        cy = sum(p[1] for p in r) / n
        for j in range(n):
            k = (j + 1) % n
            a, b = (r[j][0], r[j][1], z), (r[k][0], r[k][1], z)
            tris.append(((cx, cy, z), a, b) if front else ((cx, cy, z), b, a))
    return tris


def volume(tris):
    return sum((a[1] * b[2] - a[2] * b[1]) * c[0]
               + (a[2] * b[0] - a[0] * b[2]) * c[1]
               + (a[0] * b[1] - a[1] * b[0]) * c[2]
               for a, b, c in tris) / 6.0


def write_stl(tris, path):
    with open(path, "wb") as f:
        f.write(b"\0" * 80 + struct.pack("<I", len(tris)))
        for a, b, c in tris:
            u = [b[i] - a[i] for i in range(3)]
            v = [c[i] - a[i] for i in range(3)]
            nx = u[1] * v[2] - u[2] * v[1]
            ny = u[2] * v[0] - u[0] * v[2]
            nz = u[0] * v[1] - u[1] * v[0]
            m = math.hypot(nx, ny, nz) or 1.0
            f.write(struct.pack("<12fH", nx / m, ny / m, nz / m,
                                *a, *b, *c, 0))


def test(spec_path):
    spec = json.loads(Path(spec_path).read_text())
    body = spec["body"]
    tris = solid(spec)
    pts = [p for t in tris for p in t]
    for axis, lo, hi in ((0, 0.0, body["width"]),
                         (1, -body["length"], 0.0),
                         (2, -body["thickness"], 0.0)):
        got = (min(p[axis] for p in pts), max(p[axis] for p in pts))
        assert abs(got[0] - lo) < 1e-4 and abs(got[1] - hi) < 1e-4, (axis, got, (lo, hi))
    box = body["width"] * body["length"] * body["thickness"]
    vol = volume(tris)
    assert 0.90 * box < vol < box, f"volume {vol:.1f} vs bounding box {box:.1f}"
    assert len(tris) == 2 * len(body["corner"]["polyline"]) * 4 * (11 + 1)
    print(f"ok: {len(tris)} triangles, volume {vol:.1f} mm3, "
          f"{100 * vol / box:.1f}% of the bounding box")


if __name__ == "__main__":
    default = Path(__file__).resolve().parents[1] / "ref/iphone/17e.json"
    if "--test" in sys.argv:
        test(default)
    else:
        src = Path(sys.argv[1]) if len(sys.argv) > 1 else default
        out = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_name(src.stem + "-body.stl")
        spec = json.loads(src.read_text())
        tris = solid(spec)
        write_stl(tris, out)
        print(f"{out}  {len(tris)} triangles  {volume(tris):.1f} mm3")
