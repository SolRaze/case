import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import styles from '../../styles.json';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** the styles built for a phone, in styles.json order; public/glb/index.json is written by glb.mjs */
export async function built(phone: string): Promise<string[]> {
  const index: Record<string, string[]> = await fetch('glb/index.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  const have = new Set(index[phone] ?? []);
  return Object.keys(styles).filter((s) => have.has(s));
}

/** one case in the drawing frame, mm, float positions with creased normals; glb.mjs writes one mesh per file */
export async function load(phone: string, style: string) {
  const gltf = await loader.loadAsync(`glb/${phone}/${style}.glb`);
  gltf.scene.updateMatrixWorld(true);
  let out = new THREE.BufferGeometry();
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const q = m.geometry.getAttribute('position');
    const pos = new Float32Array(q.count * 3);
    for (let i = 0; i < q.count; i++) pos.set([q.getX(i), q.getY(i), q.getZ(i)], i * 3);
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(m.geometry.getIndex());
    g.applyMatrix4(m.matrixWorld);
    out = toCreasedNormals(g, Math.PI / 6);
  });
  return out;
}

/** a case the user keeps; styles seed the list, designs will add their own; edited is set when the user saves it from edit */
export type Template = { style: string; edited?: string; printed?: string };
/** worn: the index of the template on the phone, -1 bare */
export type Templates = { cur: number; worn: number; list: Template[] };
const KEY = 'case.templates';

/** the saved templates, with a template added for every built style that has none */
export function loadTemplates(built: string[]): Templates {
  let t: Templates = { cur: 0, worn: -1, list: [] };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && Array.isArray(s.list)) t = s;
  } catch {
    // unreadable storage starts a fresh list
  }
  // an unedited seed of a style no longer built is dropped; an edited one stays stored but is never picked
  const have = (x?: Template) => !!x && built.includes(x.style);
  const cur = t.list[t.cur], worn = t.list[t.worn];
  t.list = t.list.filter((x) => x.edited || have(x));
  for (const style of built) if (!t.list.some((x) => x.style === style)) t.list.push({ style });
  t.cur = have(cur) ? t.list.indexOf(cur!) : Math.max(t.list.findIndex(have), 0);
  t.worn = have(worn) ? t.list.indexOf(worn!) : -1;
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
