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

export type Finish = { body: string; frame: string; plateau: string };

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
function slab(s: THREE.Shape, z0: number, depth: number, b: number) {
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(depth - 2 * b, 0.01),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 3,
    curveSegments: 24,
  });
  g.translate(0, 0, -(z0 + depth) + b);
  return g;
}

function disc(x: number, y: number, r: number, z0: number, h: number) {
  const g = new THREE.CylinderGeometry(r, r, h, 40);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z0 - h / 2);
  return g;
}

/**
 * The phone as drawn, back facing +z, centred on its bounding box, 1 unit = 1 mm.
 * Every material is its own so one phone can fade while the others stay.
 */
export function buildPhone(p: PhoneSpec, finish: Finish) {
  const m = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, transparent: true, ...o });
  const glass = m(finish.body, { roughness: 0.35, metalness: 0.05 });
  const frame = m(finish.frame, { roughness: 0.3, metalness: 0.8 });
  const frosted = m(finish.plateau, { roughness: 0.5, metalness: 0.1 });
  const ringMetal = m('#b9bec4', { roughness: 0.25, metalness: 0.9 });
  const lensGlass = m('#07080c', { roughness: 0.05, metalness: 0.3 });
  const flashLens = m('#f3ecd2', { roughness: 0.4, emissive: '#2a2618' });
  const dark = m('#1a1a1a', { roughness: 0.8 });

  const g = new THREE.Group();
  const back = -p.T;

  const body = slab(shape(p.ring), 0, p.T, Math.min(EDGE, p.T / 3));
  // ExtrudeGeometry groups: 0 front and back faces, 1 the side wall and its bevels
  g.add(new THREE.Mesh(body, [glass, frame]));

  let base = back;
  if (p.plateau) {
    const s =
      'rect' in p.plateau
        ? (([x0, x1, y0, y1]) => roundedRect(x0, x1, y0, y1, Math.min(x1 - x0, y1 - y0) * PLATEAU_R))(p.plateau.rect)
        : shape(p.plateau.ring);
    g.add(new THREE.Mesh(slab(s, p.T, p.flash_z, Math.min(0.4, p.flash_z / 3)), frosted));
    base = back - p.flash_z;
  }
  const rise = Math.max(p.lens_z - (base === back ? 0 : p.flash_z), 0.3);
  for (const [x, y, d] of p.lenses) {
    g.add(new THREE.Mesh(disc(x, y, d / 2, base, rise), ringMetal));
    g.add(new THREE.Mesh(disc(x, y, d * 0.36, base - rise, 0.05), lensGlass));
  }
  if (p.flash) g.add(new THREE.Mesh(disc(p.flash[0], p.flash[1], p.flash[2] / 2, base, 0.08), flashLens));
  for (const [x, y, d] of p.others) g.add(new THREE.Mesh(disc(x, y, Math.max(d / 2, 0.4), base, 0.06), dark));

  const [bw, bz] = p.bx;
  for (const b of p.buttons) {
    const box = new THREE.BoxGeometry(b.protrusion + 0.4, b.length, bw);
    const x = b.side === 'left' ? -b.protrusion / 2 + 0.2 : p.W + b.protrusion / 2 - 0.2;
    box.translate(x, b.center_y, bz);
    g.add(new THREE.Mesh(box, frame));
  }

  // centre, then turn so the back faces the camera
  const inner = new THREE.Group();
  inner.add(g);
  g.position.set(-p.W / 2, p.L / 2, p.T / 2);
  inner.rotation.y = Math.PI;
  const materials = [glass, frame, frosted, ringMetal, lensGlass, flashLens, dark];
  return { object: inner, materials };
}

/** "16-pro-max" -> "16 Pro Max", "se-2-3" -> "SE 2/3": the model without the product name */
export function label(id: string) {
  const w = id.split('-');
  if (w[0] === 'se') return `SE ${w.slice(1).join('/')}`;
  return w.map((s) => (/^\d/.test(s) ? s : s[0].toUpperCase() + s.slice(1))).join(' ');
}
