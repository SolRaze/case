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
