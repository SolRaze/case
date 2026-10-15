import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import styles from '../../styles.json';
import type { Move, Moves, Op } from './parts';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** the styles built for a phone in styles.json order, then its part sets; public/glb/index.json is written by glb.mjs */
export async function built(phone: string): Promise<string[]> {
  const index: Record<string, string[]> = await fetch('glb/index.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  const have = new Set(index[phone] ?? []);
  return [...Object.keys(styles).filter((s) => have.has(s)), ...[...have].filter((s) => !(s in styles))];
}

/** where a moved part goes: turned about its own middle c, then shifted; solve.worker.ts and edit's ghost both place parts with it */
export function placing(c: THREE.Vector3, [dx, dy, deg = 0, dz = 0]: Move) {
  return new THREE.Matrix4()
    .makeTranslation(c.x + dx, c.y + dy, dz)
    .multiply(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(deg)))
    .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, 0));
}

/** mm a joined part reaches into the shell from its back face, the case's lowest z: enough to fuse, never into the phone's pocket; solve.worker.ts cuts to it and edit's ghost shows it */
export const SINK = 0.4;

/** a part set, not a styles.json style: glb.mjs builds it from out/<phone>/<set>/parts.json */
export const isSet = (style: string) => !(style in styles);

/** one glb's mesh in the drawing frame, mm, indexed; glb.mjs writes one mesh per file */
export async function solid(url: string) {
  const gltf = await loader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  let out = { pos: new Float32Array(), idx: new Uint32Array() };
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const q = m.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    const pos = new Float32Array(q.count * 3);
    for (let i = 0; i < q.count; i++) v.fromBufferAttribute(q, i).applyMatrix4(m.matrixWorld).toArray(pos, i * 3);
    out = { pos, idx: Uint32Array.from(m.geometry.getIndex()!.array) };
  });
  return out;
}

/** an imported STL's part name starts with this; its mesh is welded, in the case's mm, and kept in IndexedDB, where solve.worker.ts reads it too */
export const IMPORT = 'stl:';
type Solid = Awaited<ReturnType<typeof solid>>;
const imports = <T>(mode: IDBTransactionMode, ask: (s: IDBObjectStore) => IDBRequest<T>) =>
  new Promise<T>((ok, no) => {
    const open = indexedDB.open('case.imports', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('stl');
    open.onerror = () => no(open.error);
    open.onsuccess = () => {
      const r = ask(open.result.transaction('stl', mode).objectStore('stl'));
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    };
  });
export const importNames = () => imports('readonly', (s) => s.getAllKeys()) as Promise<string[]>;
export const keepImport = (name: string, m: Solid) => imports('readwrite', (s) => s.put(m, name));
export const dropImport = (name: string) => imports('readwrite', (s) => s.delete(name));
/** a part's mesh: an import or a saved part from IndexedDB, undefined when gone; any other from its glb in dir */
export const partSolid = (dir: string, name: string): Promise<Solid> =>
  name.startsWith(IMPORT) || name.startsWith(MY) ? imports('readonly', (s) => s.get(name)) : solid(`${dir}/${name}.glb`);

/** a part saved from the playground: its mesh in case.imports under MY + slug, in the part frame; name, version and recipe in localStorage */
export const MY = 'my:';
export type MyPart = { name: string; version: number; pieces: Piece[] };
const MYKEY = 'case.my';
export function loadMy(): Record<string, MyPart> {
  try {
    return JSON.parse(localStorage.getItem(MYKEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
export const saveMy = (m: Record<string, MyPart>) => localStorage.setItem(MYKEY, JSON.stringify(m));
/** a saved part on a case's back, given the base's box: turned 180° about x so its bed face meets the back, centred on the box, the bed face SINK into the shell.
 * solve.worker.ts and edit's ghost both seat with it */
export function seat({ pos, idx }: Solid, min: number[], max: number[]): Solid {
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3)
    for (const a of [0, 1]) {
      lo[a] = Math.min(lo[a], pos[i + a]);
      hi[a] = Math.max(hi[a], pos[i + a]);
    }
  const dx = (min[0] + max[0] - lo[0] - hi[0]) / 2, my = (lo[1] + hi[1]) / 2, cy = (min[1] + max[1]) / 2, z = min[2] + SINK;
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    out[i] = pos[i] + dx;
    out[i + 1] = cy - (pos[i + 1] - my);
    out[i + 2] = z - pos[i + 2];
  }
  return { pos: out, idx };
}

export type Shape = 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus';
/** one playground block in the part frame, mm, z up, the bed at z 0: pos its middle, rot degrees about x y z, size its outline before turning;
 * an stl piece's ref names its mesh in case.imports, kept centred on the origin. blend is the mm it melts into what comes before it */
export type Piece = { kind: Shape | 'stl'; pos: number[]; rot: number[]; size: number[]; op: 'join' | 'cut'; blend: number; ref?: string };
/** a piece turned by rot, then moved to pos; its size is the caller's */
export function pieceMatrix({ pos: [x, y, z], rot }: Piece) {
  const [a, b, c] = rot.map(THREE.MathUtils.degToRad);
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(a, b, c)).setPosition(x, y, z);
}

/** one case in the drawing frame, float positions with creased normals */
export async function load(phone: string, style: string) {
  const { pos, idx } = await solid(`glb/${phone}/${style}.glb`);
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return toCreasedNormals(g, Math.PI / 6);
}

/** a design the user saved from edit: a style, and on a part set the parts switched off their parts.json op; several may share a style */
export type Template = { style: string; edited?: string; printed?: string; ops?: Record<string, Op>; moves?: Moves };
/** worn: the index of the design on the phone, -1 bare; cur is unused and kept for stored data */
export type Templates = { cur: number; worn: number; list: Template[] };
const KEY = 'case.templates';

/** the saved designs; one on a style no longer built stays stored but is never worn */
export function loadTemplates(built: string[]): Templates {
  let t: Templates = { cur: 0, worn: -1, list: [] };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && Array.isArray(s.list)) t = s;
  } catch {
    // unreadable storage starts a fresh list
  }
  const worn = t.list[t.worn];
  t.list = t.list.filter((x) => x.edited);
  t.cur = 0;
  t.worn = worn?.edited && built.includes(worn.style) ? t.list.indexOf(worn) : -1;
  return t;
}
export const saveTemplates = (t: Templates) => localStorage.setItem(KEY, JSON.stringify(t));

/** downloads the geometry as binary STL, mm, as case.py exports it */
export function exportStl(geo: THREE.BufferGeometry, name: string) {
  const data = new STLExporter().parse(new THREE.Mesh(geo), { binary: true });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'model/stl' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
