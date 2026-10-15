import * as THREE from 'three';
import type { Finish } from './phone';

/** an apple with a bite and a leaf, drawn for this site; outline units, y up, 118 tall */
function outline() {
  const body = new THREE.Shape();
  body.moveTo(0, 35);
  body.bezierCurveTo(8, 42, 30, 48, 42, 30);
  body.bezierCurveTo(28, 22, 26, 2, 47, -8);
  body.bezierCurveTo(42, -28, 32, -46, 22, -50);
  body.bezierCurveTo(14, -54, 8, -46, 0, -45);
  body.bezierCurveTo(-8, -46, -14, -54, -22, -50);
  body.bezierCurveTo(-40, -42, -52, -10, -48, 12);
  body.bezierCurveTo(-45, 36, -24, 48, -10, 40);
  body.bezierCurveTo(-5, 38, -3, 36, 0, 35);
  const leaf = new THREE.Shape();
  leaf.moveTo(1, 42);
  leaf.bezierCurveTo(2, 56, 10, 64, 22, 66);
  leaf.bezierCurveTo(22, 54, 14, 44, 1, 42);
  return [body, leaf];
}

/**
 * The apple as a slab h mm tall and depth mm thick, centred, face toward +z; the same
 * material split as buildPhone: caps in the finish's body, the side wall in its frame.
 */
export function buildLogo(h: number, depth: number, finish: Finish, seg: number) {
  const k = h / 118;
  const bevel = 0.8 / k;
  const geo = new THREE.ExtrudeGeometry(outline(), {
    depth: depth / k - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 1,
    curveSegments: seg,
  });
  geo.scale(k, k, k);
  geo.center();
  const m = (color: string, o: Partial<THREE.MeshStandardMaterialParameters>) =>
    new THREE.MeshStandardMaterial({ color, transparent: true, flatShading: seg <= 8, ...o });
  const face = m(finish.body, { roughness: 0.35, metalness: 0.05 });
  const side = m(finish.frame, { roughness: 0.3, metalness: 0.8 });
  const object = new THREE.Group();
  object.add(new THREE.Mesh(geo, [face, side]));
  return { object, materials: [face, side] };
}

/**
 * The playground's icon, drawn for this site: a print bed h mm tall with a block, a post and a cone standing on it,
 * centred, the solids toward +z; the bed in the finish's body, the solids in its frame.
 */
export function buildPlay(h: number, finish: Finish, seg: number) {
  const m = (color: string, o: Partial<THREE.MeshStandardMaterialParameters>) =>
    new THREE.MeshStandardMaterial({ color, transparent: true, flatShading: seg <= 8, ...o });
  const bed = m(finish.body, { roughness: 0.35, metalness: 0.05 });
  const solid = m(finish.frame, { roughness: 0.3, metalness: 0.8 });
  const w = h * 0.7, t = h * 0.05, r = h * 0.08;
  const plate = new THREE.Shape();
  plate.moveTo(-w / 2 + r, -h / 2);
  for (const [x, y, a] of [[w / 2 - r, -h / 2 + r, -0.5], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 0.5], [-w / 2 + r, -h / 2 + r, 1]])
    plate.absarc(x, y, r, a * Math.PI, (a + 0.5) * Math.PI, false);
  const object = new THREE.Group();
  object.add(new THREE.Mesh(new THREE.ExtrudeGeometry(plate, { depth: t, bevelEnabled: false, curveSegments: seg }).translate(0, 0, -t), bed));
  // each solid stands on the bed's face at z 0
  const stand = (g: THREE.BufferGeometry, x: number, y: number, tall: number, turn = 0) =>
    object.add(new THREE.Mesh(g.rotateX(Math.PI / 2).rotateZ(turn).translate(x * h, y * h, tall / 2), solid));
  stand(new THREE.BoxGeometry(h * 0.3, h * 0.3, h * 0.3), -0.14, 0.26, h * 0.3, 0.3);
  stand(new THREE.CylinderGeometry(h * 0.11, h * 0.11, h * 0.5, seg * 2), 0.17, 0, h * 0.5);
  stand(new THREE.ConeGeometry(h * 0.17, h * 0.42, seg * 2), -0.13, -0.27, h * 0.42);
  return { object, materials: [bed, solid] };
}
