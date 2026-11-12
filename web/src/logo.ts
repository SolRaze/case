import * as THREE from 'three';
import { rough, type Finish } from './phone';

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

/** a plain t-shirt, drawn for this site; outline units, y up, 118 tall */
function shirt() {
  const s = new THREE.Shape();
  s.moveTo(-14, 59);
  s.bezierCurveTo(-8, 50, 8, 50, 14, 59);
  s.lineTo(30, 54);
  s.quadraticCurveTo(38, 51, 44, 44);
  s.lineTo(62, 18);
  s.quadraticCurveTo(64, 14, 60, 11);
  s.lineTo(46, 2);
  s.quadraticCurveTo(42, 0, 40, 4);
  s.lineTo(36, 10);
  s.lineTo(36, -55);
  s.quadraticCurveTo(36, -59, 32, -59);
  s.lineTo(-32, -59);
  s.quadraticCurveTo(-36, -59, -36, -55);
  s.lineTo(-36, 10);
  s.lineTo(-40, 4);
  s.quadraticCurveTo(-42, 0, -46, 2);
  s.lineTo(-60, 11);
  s.quadraticCurveTo(-64, 14, -62, 18);
  s.lineTo(-44, 44);
  s.quadraticCurveTo(-38, 51, -30, 54);
  s.lineTo(-14, 59);
  return [s];
}

/**
 * The apple as a slab h mm tall and depth mm thick, centred, face toward +z; the same
 * material split as buildPhone: caps in the finish's body, the side wall in its frame.
 */
export const buildLogo = (h: number, depth: number, finish: Finish, seg: number) => slab(outline(), h, depth, finish, seg);

/** shadow tint on the shirt, the LOUD logo's lime */
const SHADE = '#b4f000';

/** the apparel icon, a slab like the apple, all of it in the LOUD logo's glossy blue whatever the finish */
export function buildShirt(h: number, depth: number, finish: Finish, seg: number) {
  const gloss = new THREE.MeshPhysicalMaterial({ color: '#0a3cff', roughness: 0.15, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, flatShading: seg <= 8 });
  // the shaded side turns the logo's lime: the less light reaches a spot against its own blue, the more of it
  gloss.onBeforeCompile = (s) => {
    s.uniforms.shade = { value: new THREE.Color(SHADE) };
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', 'uniform vec3 shade;\nvoid main() {')
      .replace('#include <opaque_fragment>', 'float lit = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)) / max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-3);\noutgoingLight = mix(outgoingLight, shade * 0.6, (1.0 - smoothstep(0.15, 0.7, lit)) * 0.8);\n#include <opaque_fragment>');
  };
  return slab(shirt(), h, depth, finish, seg, [gloss, gloss]);
}

function slab(shapes: THREE.Shape[], h: number, depth: number, finish: Finish, seg: number, mats?: [THREE.Material, THREE.Material]) {
  const k = h / 118;
  const bevel = 0.8 / k;
  const geo = new THREE.ExtrudeGeometry(shapes, {
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
  const [face, side] = mats ?? [m(finish.body, { roughness: rough(finish, 0.35), metalness: 0.05 }), m(finish.frame, { roughness: rough(finish, 0.3), metalness: 0.8 })];
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
  const bed = m(finish.body, { roughness: rough(finish, 0.35), metalness: 0.05 });
  const solid = m(finish.frame, { roughness: rough(finish, 0.3), metalness: 0.8 });
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
