// the playground's solver: the shape pieces as one signed distance field meshed by Manifold.levelSet, then the stl pieces added or cut exactly.
// play.ts posts one job at a time and answers each with an indexed mesh in the part frame, or an error
import * as THREE from 'three';
import Module, { type Manifold, type Mat4 } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { partSolid, pieceMatrix, type Piece, type Shape } from './cases';

const wasm = Module({ locateFile: () => wasmUrl }).then((m) => (m.setup(), m));

// unit shapes filling [-1, 1] on every axis, negative inside; the torus's tube is 0.3 of its outline across and fills it along z, as play.ts draws it
const len2 = (a: number, b: number) => Math.sqrt(a * a + b * b);
const unit: Record<Shape, (x: number, y: number, z: number) => number> = {
  box(x, y, z) {
    const a = Math.abs(x) - 1, b = Math.abs(y) - 1, c = Math.abs(z) - 1;
    return Math.hypot(Math.max(a, 0), Math.max(b, 0), Math.max(c, 0)) + Math.min(Math.max(a, b, c), 0);
  },
  sphere: (x, y, z) => Math.hypot(x, y, z) - 1,
  cylinder(x, y, z) {
    const a = len2(x, y) - 1, b = Math.abs(z) - 1;
    return Math.min(Math.max(a, b), 0) + len2(Math.max(a, 0), Math.max(b, 0));
  },
  // base radius 1 at z -1, apex at z 1: iq's capped cone, r1 1, r2 0, h 1
  cone(x, y, z) {
    const qx = len2(x, y), qy = z;
    const cax = qx - Math.min(qx, qy < 0 ? 1 : 0), cay = Math.abs(qy) - 1;
    const t = Math.min(Math.max((-qx * -1 + (1 - qy) * 2) / 5, 0), 1);
    const cbx = qx - t, cby = qy - 1 + 2 * t;
    const s = cbx < 0 && cay < 0 ? -1 : 1;
    return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
  },
  torus: (x, y, z) => len2(len2(x, y) - 0.7, z * 0.3) - 0.3,
};
/** polynomial smooth min over k mm; k 0 is the plain min */
const smin = (a: number, b: number, k: number) => {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/** an stl piece's solid, centred as play.ts keeps it, and its size there */
const stls = new Map<string, Promise<{ m: Manifold; native: number[] }>>();
function stl(ref: string) {
  if (!stls.has(ref)) {
    const p = (async () => {
      const { Manifold, Mesh } = await wasm;
      const s = await partSolid('', ref);
      if (!s) throw new Error('missing');
      const mesh = new Mesh({ numProp: 3, vertProperties: s.pos, triVerts: s.idx });
      mesh.merge();
      const m = new Manifold(mesh);
      const { min, max } = m.boundingBox();
      return { m, native: max.map((v, i) => v - min[i] || 1) };
    })();
    p.catch(() => stls.delete(ref));
    stls.set(ref, p);
  }
  return stls.get(ref)!;
}

self.onmessage = (e: MessageEvent<{ pieces: Piece[]; edge: number }>) =>
  run(e.data.pieces, e.data.edge).catch((err) => self.postMessage({ error: String(err?.message ?? err) }));
async function run(pieces: Piece[], edge: number) {
  const { Manifold } = await wasm;
  // each shape: the part frame into its own, its half-size, and the factor from unit distance back to mm
  const fields = pieces
    .filter((p) => p.kind !== 'stl')
    .map((p) => {
      const h = p.size.map((s) => s / 2);
      return { f: unit[p.kind as Shape], m: pieceMatrix(p).invert().elements, h, s: Math.min(...h), cut: p.op === 'cut', k: p.blend, p };
    });
  // the field reaches as far as the join pieces' boxes, their blend and one cell
  const box = new THREE.Box3();
  for (const { p, h, k, cut } of fields)
    if (!cut) {
      const b = new THREE.Box3(new THREE.Vector3(-h[0], -h[1], -h[2]), new THREE.Vector3(...(h as [number, number, number])));
      box.union(b.applyMatrix4(pieceMatrix(p)).expandByScalar(k + edge));
    }
  const temp: Manifold[] = [];
  let out: Manifold | null = null;
  if (!box.isEmpty()) {
    // levelSet's positive is inside: the field negated; d starts at 1e9, Infinity turns smin's mix into NaN
    const sdf = ([x, y, z]: number[]) => {
      let d = 1e9;
      for (const { f, m, h, s, cut, k } of fields) {
        const di = f((m[0] * x + m[4] * y + m[8] * z + m[12]) / h[0], (m[1] * x + m[5] * y + m[9] * z + m[13]) / h[1], (m[2] * x + m[6] * y + m[10] * z + m[14]) / h[2]) * s;
        d = cut ? -smin(-d, di, k) : smin(d, di, k);
      }
      return -d;
    };
    out = Manifold.levelSet(sdf, { min: box.min.toArray(), max: box.max.toArray() }, edge);
  }
  for (const p of pieces.filter((p) => p.kind === 'stl' && p.ref)) {
    const { m, native } = await stl(p.ref!);
    const t = m.transform(pieceMatrix(p).scale(new THREE.Vector3(...p.size.map((s, i) => s / native[i]) as [number, number, number])).elements as unknown as Mat4);
    temp.push(t);
    if (p.op === 'join') {
      if (out) temp.push(out);
      out = out ? out.add(t) : t;
    } else if (out) {
      temp.push(out);
      out = out.subtract(t);
    }
  }
  // nothing prints under the bed
  let pos = new Float32Array(), idx = new Uint32Array();
  if (out) {
    const cut = out.trimByPlane([0, 0, 1], 0);
    const g = cut.getMesh();
    pos = g.vertProperties.slice();
    idx = g.triVerts.slice();
    cut.delete();
    if (!temp.includes(out)) out.delete();
  }
  for (const t of temp) t.delete();
  self.postMessage({ pos, idx }, { transfer: [pos.buffer, idx.buffer] });
}
