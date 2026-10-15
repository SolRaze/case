// the part set solver: off the page so a 4 s solve does not stall it; parts.ts posts one job at a time, this answers with an indexed mesh
import * as THREE from 'three';
import Module, { type Manifold, type Mat4 } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { MY, partSolid, placing, seat, SINK, solid } from './cases';
import type { Moves, Op, Part } from './parts';

const wasm = Module({ locateFile: () => wasmUrl }).then((m) => (m.setup(), m));
const lists = new Map<string, Promise<Part[]>>();
const solids = new Map<string, Promise<Manifold>>();
/** the base and union parts joined, by dir and part names; a difference-only change reuses it. Oldest dropped past JOINED. */
const joined = new Map<string, Manifold>();
const JOINED = 4;
/** where a union part may be, by dir: behind the base, within its outline and SINK into its back; the phone's pocket, the camera window and the wall openings stay clear */
const outlines = new Map<string, Promise<Manifold>>();
function outline(dir: string, base: string) {
  if (!outlines.has(dir))
    outlines.set(
      dir,
      (async () => {
        const { Manifold } = await wasm;
        const s = await part(dir, base);
        const back = s.translate([0, 0, -100]), whole = s.hull();
        const column = Manifold.hull([s, back]), kept = whole.translate([0, 0, SINK]);
        const h = column.subtract(kept);
        for (const m of [back, whole, column, kept]) m.delete();
        return h;
      })(),
    );
  return outlines.get(dir)!;
}

/** a part set as glb.mjs writes it: glb/<phone>/<set>/parts.json and one glb per part, each a closed solid */
function list(dir: string) {
  if (!lists.has(dir)) lists.set(dir, fetch(`${dir}/parts.json`).then((r) => r.json()));
  return lists.get(dir)!;
}
/** one part's solid, loaded the first time a solve uses it */
function part(dir: string, name: string) {
  const url = `${dir}/${name}.glb`;
  if (!solids.has(url))
    solids.set(
      url,
      (async () => {
        const { pos, idx } = await solid(url);
        const { Manifold, Mesh } = await wasm;
        const mesh = new Mesh({ numProp: 3, vertProperties: pos, triVerts: idx });
        mesh.merge();
        return new Manifold(mesh);
      })(),
    );
  return solids.get(url)!;
}

/** a saved part seated on the base's back, by dir, name and version; null once deleted */
const mine = new Map<string, Promise<Manifold | null>>();
function myPart(dir: string, base: string, name: string, version: number) {
  const key = `${dir}|${name}|${version}`;
  if (!mine.has(key))
    mine.set(
      key,
      (async () => {
        const s = await partSolid('', name);
        if (!s) return null;
        const { min, max } = (await part(dir, base)).boundingBox();
        const { Manifold, Mesh } = await wasm;
        const { pos, idx } = seat(s, min, max);
        const mesh = new Mesh({ numProp: 3, vertProperties: pos, triVerts: idx });
        mesh.merge();
        return new Manifold(mesh);
      })(),
    );
  return mine.get(key)!;
}

// the union parts cut to the base's outline and joined to it, then every difference part cut, as the Blender modifier stack does; a moved part is placed first
self.onmessage = (e: MessageEvent<{ dir: string; ops: Record<string, Op>; moves: Moves; my: Record<string, number> }>) =>
  run(e.data.dir, e.data.ops, e.data.moves, e.data.my ?? {}).catch((err) => self.postMessage({ error: String(err) }));
async function run(dir: string, ops: Record<string, Op>, moves: Moves, my: Record<string, number>) {
  const { Manifold } = await wasm;
  // parts.json's parts, then the saved parts given a version; a saved part that is gone leaves no solid and is skipped
  const parts = [...(await list(dir)), ...Object.keys(my).filter((n) => n.startsWith(MY)).map((name): Part => ({ name, op: 'off' }))];
  const base = parts.find((p) => p.op === 'base')!.name;
  const op = (p: Part) => (p.op === 'base' ? 'base' : (ops[p.name] ?? p.op));
  const names = (...o: Op[]) => parts.filter((p) => o.includes(op(p))).map((p) => p.name);
  // shifted copies are made per solve and freed at its end; the lazy solids stay
  const temp: Manifold[] = [];
  const placed = async (n: string) => {
    const s = n.startsWith(MY) ? await myPart(dir, base, n, my[n]) : await part(dir, n);
    const m = moves[n];
    if (!s) return null;
    if (!m || !m.some(Boolean)) return s;
    const { min, max } = s.boundingBox();
    const c = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, 0);
    const t = s.transform(placing(c, m).elements as unknown as Mat4);
    temp.push(t);
    return t;
  };
  const ups = names('union');
  const key = `${dir}|${ups.map((n) => [n, my[n] ?? '', moves[n] ?? []])}`;
  if (!joined.has(key)) {
    const shell = await part(dir, base);
    let body = shell;
    const all = (await Promise.all(ups.map(placed))).filter((m) => m !== null);
    if (all.length) {
      const u = all.length > 1 ? Manifold.union(all) : all[0];
      if (u !== all[0]) temp.push(u);
      const inside = u.intersect(await outline(dir, base));
      temp.push(inside);
      body = Manifold.union([shell, inside]);
    }
    joined.set(key, body);
    if (joined.size > JOINED) {
      const [k, m] = joined.entries().next().value!;
      joined.delete(k);
      if (!(await Promise.all(solids.values())).includes(m)) m.delete();
    }
  }
  const body = joined.get(key)!;
  const cut = (await Promise.all(names('difference').map(placed))).filter((m) => m !== null);
  const out = cut.length ? Manifold.difference([body, ...cut]) : body;
  const m = out.getMesh();
  if (out !== body) out.delete();
  for (const t of temp) t.delete();
  const pos = m.vertProperties.slice(), idx = m.triVerts.slice();
  self.postMessage({ pos, idx }, { transfer: [pos.buffer, idx.buffer] });
}
