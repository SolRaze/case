import * as THREE from 'three';

/** one entry of phones.json, written by phones.py from phone.py; mm, x 0..W, y 0..-L, z 0 at the front glass */
export type PhoneSpec = {
  id: string;
  W: number;
  L: number;
  T: number;
  ring: [number, number][];
  buttons: { name: string; side: 'left' | 'right'; center_y: number; length: number; protrusion: number }[];
  bx: [number, number];
  lenses: [number, number, number][];
  flash: [number, number, number] | null;
  others: [number, number, number][];
  plateau: { rect: [number, number, number, number] } | { ring: [number, number][] } | null;
  lens_z: number;
  flash_z: number;
};

/** satin: the least roughness on the finish's own colours; a sky theme raises it so faces turned to the light carry its sheen */
export type Finish = { body: string; frame: string; plateau: string; satin?: number };
export const rough = (f: Finish, r: number) => Math.max(r, f.satin ?? 0);

// render choices, not on the drawings: edge round-over and plateau corner radius
const EDGE = 0.8;
const PLATEAU_R = 0.3;

const shape = (pts: [number, number][]) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));

function roundedRect(x0: number, x1: number, y0: number, y1: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

/** extruded slab from z0 outward (toward -z, the back) by depth, bevelled by b on both faces */
function slab(s: THREE.Shape, z0: number, depth: number, b: number, seg: number) {
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(depth - 2 * b, 0.01),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: seg > 8 ? 3 : 1,
    curveSegments: seg,
  });
  g.translate(0, 0, -(z0 + depth) + b);
  return g;
}

function disc(x: number, y: number, r: number, z0: number, h: number, seg: number) {
  const g = new THREE.CylinderGeometry(r, r, h, seg * 2);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z0 - h / 2);
  return g;
}

/**
 * The phone as drawn, back facing +z, centred on its bounding box, 1 unit = 1 mm.
 * Every material is its own so one phone can fade while the others stay.
 * seg is the curve resolution; a low one gives the faceted, flat-shaded console look.
 */
export function buildPhone(p: PhoneSpec, finish: Finish, seg = 24) {
  const m = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, transparent: true, flatShading: seg <= 8, ...o });
  const glass = m(finish.body, { roughness: rough(finish, 0.35), metalness: 0.05 });
  const frame = m(finish.frame, { roughness: rough(finish, 0.3), metalness: 0.8 });
  const frosted = m(finish.plateau, { roughness: rough(finish, 0.5), metalness: 0.1 });
  const ringMetal = m('#b9bec4', { roughness: 0.25, metalness: 0.9 });
  const lensGlass = m('#07080c', { roughness: 0.05, metalness: 0.3 });
  const flashLens = m('#ececec', { roughness: 0.4, emissive: '#262626' });
  const dark = m('#1a1a1a', { roughness: 0.8 });

  const g = new THREE.Group();
  const back = -p.T;

  // the ring arrives dense from phone.py; thin it for a low seg so the corners facet too
  const step = Math.max(1, Math.round(24 / seg));
  const body = slab(shape(p.ring.filter((_, i) => i % step === 0)), 0, p.T, Math.min(EDGE, p.T / 3), seg);
  // ExtrudeGeometry groups: 0 front and back faces, 1 the side wall and its bevels
  g.add(new THREE.Mesh(body, [glass, frame]));

  let base = back;
  if (p.plateau) {
    const s =
      'rect' in p.plateau
        ? (([x0, x1, y0, y1]) => roundedRect(x0, x1, y0, y1, Math.min(x1 - x0, y1 - y0) * PLATEAU_R))(p.plateau.rect)
        : shape(p.plateau.ring);
    g.add(new THREE.Mesh(slab(s, p.T, p.flash_z, Math.min(0.4, p.flash_z / 3), seg), frosted));
    base = back - p.flash_z;
  }
  const rise = Math.max(p.lens_z - (base === back ? 0 : p.flash_z), 0.3);
  for (const [x, y, d] of p.lenses) {
    g.add(new THREE.Mesh(disc(x, y, d / 2, base, rise, seg), ringMetal));
    g.add(new THREE.Mesh(disc(x, y, d * 0.36, base - rise, 0.05, seg), lensGlass));
  }
  if (p.flash) g.add(new THREE.Mesh(disc(p.flash[0], p.flash[1], p.flash[2] / 2, base, 0.08, seg), flashLens));
  for (const [x, y, d] of p.others) g.add(new THREE.Mesh(disc(x, y, Math.max(d / 2, 0.4), base, 0.06, seg), dark));

  const [bw, bz] = p.bx;
  for (const b of p.buttons) {
    const box = new THREE.BoxGeometry(b.protrusion + 0.4, b.length, bw);
    const x = b.side === 'left' ? -b.protrusion / 2 + 0.2 : p.W + b.protrusion / 2 - 0.2;
    box.translate(x, b.center_y, bz);
    g.add(new THREE.Mesh(box, frame));
  }

  const materials = [glass, frame, frosted, ringMetal, lensGlass, flashLens, dark];
  return { object: framed(p, g), frame: g, materials };
}

const lockInks: THREE.LineBasicMaterial[] = [];
let lockEdge = '#000000';
/** the locked phones' wireframe colour, black by day; a night field lifts it or the phones vanish into it */
export function lockedEdge(c: string) {
  lockEdge = c;
  for (const m of lockInks) m.color.set(c);
}

/** a phone with no finished case yet: the body and a padlock, see-through black under a black wireframe */
export function buildLocked(p: PhoneSpec, seg = 8) {
  // userData.alpha: main.ts pose scales the fade by it, so the phone stays see-through
  const fill = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, userData: { alpha: 0.55 } });
  const ink = new THREE.LineBasicMaterial({ color: lockEdge, transparent: true, userData: { alpha: 0.85 } });
  lockInks.push(ink);
  // black solid with its black wireframe on top
  const solid = (geo: THREE.BufferGeometry) => [new THREE.Mesh(geo, fill), new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), ink)];
  const g = new THREE.Group();
  const step = Math.max(1, Math.round(24 / seg));
  g.add(...solid(slab(shape(p.ring.filter((_, i) => i % step === 0)), 0, p.T, Math.min(EDGE, p.T / 3), seg)));

  const w = p.W * 0.36;
  const h = w * 0.8;
  const d = 2.4;
  const cx = p.W / 2;
  const cy = -p.L / 2 - h * 0.2;
  const z = -p.T - d / 2;
  const body = new THREE.BoxGeometry(w, h, d);
  body.translate(cx, cy, z);
  const shackle = new THREE.TorusGeometry(w * 0.3, w * 0.075, 8, 16, Math.PI);
  shackle.translate(cx, cy + h / 2, z);
  g.add(...solid(body), ...solid(shackle));
  return { object: framed(p, g), frame: g, materials: [fill, ink] };
}

/** wraps a group drawn in the drawing frame: centred on the phone, turned so the back faces the camera */
export function framed(p: PhoneSpec, g: THREE.Object3D) {
  const inner = new THREE.Group();
  inner.add(g);
  g.position.set(-p.W / 2, p.L / 2, p.T / 2);
  inner.rotation.y = Math.PI;
  return inner;
}

/** "16-pro-max" -> "16 Pro Max", "se-2-3" -> "SE 2/3": the model without the product name */
export function label(id: string) {
  const w = id.split('-');
  if (w[0] === 'se') return `SE ${w.slice(1).join('/')}`;
  return w.map((s) => (/^\d/.test(s) ? s : s[0].toUpperCase() + s.slice(1))).join(' ');
}

/** the preview look: body black, crease lines pale; t is how far the models have turned to it, 0 the theme's own finish */
export type Sheet = { body?: string; edge: string; grey?: boolean };
type Orig = { color: THREE.Color; emissive?: THREE.Color; metalness?: number; roughness?: number };
const lit = new Set<THREE.MeshStandardMaterial>();
const inked = new Set<THREE.LineBasicMaterial>(); // lines the model was built with
const creases = new Set<THREE.LineBasicMaterial>(); // lines sheetLook drew
const veiled = new Set<THREE.MeshBasicMaterial>(); // see-through fills, solid at t 1
let sheet: Sheet = { body: '#0f0f12', edge: '#b3b3b8' };
let t = 0;
export const lookT = () => t;

/**
 * Readies a built model for the preview look: its materials join the look's sets with their own values kept,
 * creases over 30 degrees get lines. Returns the crease line material so the caller's fade reaches it.
 */
export function sheetLook(root: THREE.Object3D) {
  const line = new THREE.LineBasicMaterial({ color: sheet.edge, transparent: true, userData: { alpha: t } });
  creases.add(line);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.LineSegments) {
      const m = o.material as THREE.LineBasicMaterial;
      m.userData.orig ??= { color: m.color.clone() };
      inked.add(m);
    } else if (o instanceof THREE.Mesh) meshes.push(o);
  });
  for (const o of meshes) {
    for (const m of [o.material].flat())
      if (m instanceof THREE.MeshStandardMaterial) {
        m.userData.orig ??= { color: m.color.clone(), emissive: m.emissive.clone(), metalness: m.metalness, roughness: m.roughness };
        // faces pushed back so the crease lines on them win the depth test
        m.polygonOffset = true;
        m.polygonOffsetFactor = 1;
        m.polygonOffsetUnits = 2;
        lit.add(m);
      } else if (m instanceof THREE.MeshBasicMaterial && m.userData.alpha !== undefined) {
        m.userData.veil ??= m.userData.alpha;
        m.polygonOffset = true;
        m.polygonOffsetFactor = 1;
        m.polygonOffsetUnits = 2;
        veiled.add(m);
      }
    o.userData.edge = line;
    edges(o);
  }
  look(t);
  return line;
}

/** turns every readied model t of the way from its own finish to the preview look */
export function look(to: number, s: Sheet = sheet) {
  t = to;
  sheet = s;
  const body = new THREE.Color(s.body ?? 0);
  const edge = new THREE.Color(s.edge);
  const black = new THREE.Color(0);
  // a sheet without a body keeps each model's own finish and only adds the creases
  const fill = s.body ? t : 0;
  for (const m of lit) {
    const o = m.userData.orig as Orig;
    m.color.copy(o.color).lerp(body, fill);
    if (s.grey) m.color.setScalar(m.color.r * 0.2126 + m.color.g * 0.7152 + m.color.b * 0.0722);
    m.emissive.copy(o.emissive!).lerp(black, fill);
    m.metalness = THREE.MathUtils.lerp(o.metalness!, 0, fill);
    m.roughness = THREE.MathUtils.lerp(o.roughness!, 0.5, fill);
  }
  for (const m of veiled) m.userData.alpha = THREE.MathUtils.lerp(m.userData.veil, 1, fill);
  for (const m of inked) m.color.copy((m.userData.orig as Orig).color).lerp(edge, t);
  for (const m of creases) {
    m.color.copy(edge);
    m.userData.alpha = t; // main.ts pose multiplies a model's fade by it
  }
}

/** redraws a sheetLook mesh's crease lines after its geometry changes; no-op on a mesh sheetLook never saw */
export function edges(mesh: THREE.Mesh) {
  const line = mesh.userData.edge as THREE.LineBasicMaterial | undefined;
  if (!line) return;
  const old = mesh.getObjectByName('edges');
  if (old) {
    mesh.remove(old);
    (old as THREE.LineSegments).geometry.dispose();
  }
  if (!mesh.geometry.attributes.position) return;
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), line);
  l.name = 'edges';
  l.layers.mask = mesh.layers.mask;
  mesh.add(l);
}
