import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

/** how a part joins the case: base is the shell and stays, the rest union, cut or sit out */
export type Op = 'base' | 'union' | 'difference' | 'off';
export type Part = { name: string; op: Op };
/** a part's place on the back: x and y shift in the case's mm, degrees turned about its own middle counter-clockwise, then z shift in mm */
export type Move = [number, number, number, number?];
export type Moves = Record<string, Move>;
/** the ops ← → step an added part through; off is △'s */
export const STEPS: Op[] = ['union', 'difference'];
type Mesh = { pos: Float32Array; idx: Uint32Array };

/** a part set's parts and their parts.json ops, as glb.mjs copies it; version changes whenever glb.mjs rewrites the set */
export const partList = (phone: string, set: string): Promise<{ list: Part[]; version: string }> =>
  fetch(`glb/${phone}/${set}/parts.json`).then(async (r) => ({
    list: await r.json(),
    version: r.headers.get('etag') ?? r.headers.get('last-modified') ?? '',
  }));

/** ops and moves as a cache key, in parts.json order: only the parts off their parts.json op, and the moves of parts on the case */
export const opsKey = (ops: Record<string, Op> | undefined, list: Part[], moves?: Moves) =>
  JSON.stringify(
    list
      .filter((p) => p.op !== 'base')
      .flatMap((p) => {
        const op = ops?.[p.name] ?? p.op;
        const m = op !== 'off' && moves?.[p.name];
        return op !== p.op || m ? [[p.name, op, ...(m || [])]] : [];
      }),
  );

// solved meshes survive a reload in IndexedDB, keyed by set, version and ops; a set without a version is not kept
const db = new Promise<IDBDatabase | null>((ok) => {
  const r = indexedDB.open('case.solved', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('mesh');
  r.onsuccess = () => ok(r.result);
  r.onerror = () => ok(null);
});
async function kept(key: string): Promise<Mesh | undefined> {
  const d = await db;
  if (!d) return;
  return new Promise((ok) => {
    const r = d.transaction('mesh').objectStore('mesh').get(key);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ok(undefined);
  });
}
async function keep(key: string, m: Mesh) {
  (await db)?.transaction('mesh', 'readwrite').objectStore('mesh').put(m, key);
}

/** bumped whenever solve.worker.ts makes a different mesh from the same parts, so IndexedDB's old meshes go unused */
const SOLVER = 2;

// one solve at a time in the worker; a lane's newer job replaces its queued one and jumps the queue
type Job = { msg: { dir: string; ops: Record<string, Op>; moves: Moves }; lane?: string; ok: (m: Mesh) => void; no: (e: Error) => void };
const worker = new Worker(new URL('./solve.worker.ts', import.meta.url), { type: 'module' });
const queue: Job[] = [];
let running: Job | null = null;
function pump() {
  if (running || !queue.length) return;
  running = queue.shift()!;
  worker.postMessage(running.msg);
}
worker.onmessage = (e: MessageEvent<Mesh & { error?: string }>) => {
  if (e.data.error) running!.no(new Error(e.data.error));
  else running!.ok(e.data);
  running = null;
  pump();
};
const solve = (msg: Job['msg'], lane?: string) =>
  new Promise<Mesh>((ok, no) => {
    for (const j of queue.filter((j) => lane && j.lane === lane)) {
      queue.splice(queue.indexOf(j), 1);
      j.no(new Error('superseded'));
    }
    const job = { msg, lane, ok, no };
    if (lane) queue.unshift(job);
    else queue.push(job);
    pump();
  });

/** a part set's case with the ops and moves given and parts.json's for the rest; from IndexedDB when solved before, else solved in solve.worker.ts.
 * Rejects when a newer job on the same lane replaced it before it started. */
export async function combine(phone: string, set: string, ops: Record<string, Op>, moves: Moves, lane?: string) {
  const { list, version } = await partList(phone, set);
  const key = `${phone}/${set}|${version}|${SOLVER}|${opsKey(ops, list, moves)}`;
  let m = version ? await kept(key) : undefined;
  if (!m) {
    m = await solve({ dir: new URL(`glb/${phone}/${set}`, location.href).href, ops, moves }, lane);
    if (version) keep(key, m);
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  return toCreasedNormals(g, Math.PI / 6);
}
