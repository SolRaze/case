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
