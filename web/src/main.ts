import * as THREE from 'three';
import theme from '../themes/memcard.json';
import specs from '../phones.json';
import { buildPhone, label, type PhoneSpec } from './phone';

const S = theme.strings;
const C = theme.colors;
const css = document.documentElement.style;
css.setProperty('--font', theme.font);
for (const [k, v] of Object.entries(C)) if (typeof v === 'string') css.setProperty(`--${k}`, v);
C.boot.forEach((v, i) => css.setProperty(`--boot${i}`, v));
C.field.forEach((v, i) => css.setProperty(`--field${i}`, v));
C.detail.forEach((v, i) => css.setProperty(`--detail${i}`, v));

const $ = (id: string) => document.getElementById(id)!;
const phones = specs as unknown as PhoneSpec[];

// scene: 1 unit = 100 mm
const MM = 0.01;
const CELL = { w: 0.95, h: 1.8 };
const FOV = 30;
const REST = { x: -0.12, y: 0.32 }; // grid pose: the back, turned a little to show the side buttons

const canvas = $('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-2, 3, 4);
const rim = new THREE.DirectionalLight(0xffffff, 1.2);
rim.position.set(3, -1, -2);
camera.add(key, rim);
scene.add(camera);

/** the light behind the selected phone: a soft additive disc */
function glowSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, C.glow);
  r.addColorStop(0.35, C.glow + '99');
  r.addColorStop(1, C.glow + '00');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  );
  s.renderOrder = -1;
  return s;
}
const glow = glowSprite();
scene.add(glow);

type Item = {
  spec: PhoneSpec;
  holder: THREE.Group;
  materials: THREE.Material[];
  pos: THREE.Vector3;
  scale: number;
  opacity: number;
  spin: number;
  tilt: number;
};
const item = (spec: PhoneSpec, i: number, seg?: number): Item => {
  const { object, materials } = buildPhone(spec, theme.finishes[i % theme.finishes.length], seg);
  const holder = new THREE.Group();
  object.scale.setScalar(MM);
  holder.add(object);
  scene.add(holder);
  return { spec, holder, materials, pos: new THREE.Vector3(), scale: 1, opacity: 0, spin: REST.y, tilt: REST.x };
};
const items = phones.map((p, i) => item(p, i));
// the boot card: low detail, held still, lying back up like the console's memory card
const card = item(phones.find((p) => p.id === theme.card) ?? phones[0], 1, 6);

type View = 'boot' | 'grid' | 'detail';
let view: View = 'boot';
let sel = 0;
let cmd = 0;
let camY = 0;
let fling = 0; // extra spin from a swipe, decays to the theme's spin
let cols = 3;
let visH = 1;
let visW = 1;
let dist = 4;

const rowOf = (i: number) => Math.floor(i / cols);
const slot = (i: number) => new THREE.Vector3(((i % cols) - (cols - 1) / 2) * CELL.w, -rowOf(i) * CELL.h, 0);

function layout() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  cols = camera.aspect < 0.8 ? 3 : camera.aspect < 1.4 ? 5 : 6;
  const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  // fit the grid's width, and at least one and a half rows of height
  dist = Math.max((cols * CELL.w + 0.3) / 2 / (t * camera.aspect), (CELL.h * 1.6) / 2 / t / 0.68);
  visH = 2 * dist * t;
  visW = visH * camera.aspect;
  follow();
}

/** rows sit between the header (top 22%) and the button bar (bottom 12%) */
const band = () => ({ top: visH / 2 - visH * 0.22, bottom: -visH / 2 + visH * 0.12 });
const camLimits = () => {
  const b = band();
  const lastRow = rowOf(items.length - 1);
  const max = -(b.top - CELL.h / 2);
  const min = Math.min(max, -lastRow * CELL.h - (b.bottom + CELL.h / 2));
  return { min, max };
};
/** scroll just enough to keep the selected row inside the band */
function follow() {
  const b = band();
  const y = slot(sel).y;
  const hi = y - (b.top - CELL.h / 2);
  const lo = y - (b.bottom + CELL.h / 2);
  camY = Math.min(Math.max(camY, hi), lo);
  const { min, max } = camLimits();
  camY = Math.min(Math.max(camY, min), max);
}

// targets per view
function targets(it: Item, i: number) {
  if (view === 'boot') return { pos: slot(i).setZ(-2), scale: 0.6, opacity: 0, selected: false };
  if (view === 'grid') return { pos: slot(i), scale: i === sel ? 1.06 : 1, opacity: 1, selected: i === sel };
  if (i !== sel) return { pos: slot(i).setZ(-1), scale: 1, opacity: 0, selected: false };
  // detail: the selected phone comes forward, upper middle in portrait, left in landscape
  const portrait = camera.aspect < 1;
  const p = new THREE.Vector3(portrait ? 0 : -visW * 0.2, camY + (portrait ? visH * 0.12 : 0), 1.2);
  return { pos: p, scale: 1.25, opacity: 1, selected: true };
}

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const unwind = (a: number, rest: number) => rest + (((a - rest) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;

function pose(it: Item, t: { pos: THREE.Vector3; scale: number; opacity: number; selected: boolean }, dt: number) {
  it.pos.x = damp(it.pos.x, t.pos.x, 7, dt);
  it.pos.y = damp(it.pos.y, t.pos.y, 7, dt);
  it.pos.z = damp(it.pos.z, t.pos.z, 7, dt);
  it.scale = damp(it.scale, t.scale, 7, dt);
  it.opacity = damp(it.opacity, t.opacity, 6, dt);
  if (t.selected) {
    it.spin += dt * (theme.spin + fling);
    it.tilt = damp(it.tilt, -0.05, 4, dt);
  } else {
    // ease back to the rest pose the short way round
    it.spin = damp(unwind(it.spin, REST.y), REST.y, 5, dt);
    it.tilt = damp(it.tilt, REST.x, 5, dt);
  }
  it.holder.position.copy(it.pos);
  it.holder.scale.setScalar(it.scale);
  it.holder.rotation.set(it.tilt, it.spin, 0);
  it.holder.visible = it.opacity > 0.01;
  for (const m of it.materials) {
    m.opacity = it.opacity;
    m.depthWrite = it.opacity > 0.98;
  }
}

const timer = new THREE.Timer();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 0.05);
  const now = timer.getElapsed();
  fling = damp(fling, 0, 1.5, dt);
  items.forEach((it, i) => pose(it, targets(it, i), dt));
  const boot = view === 'boot';
  pose(card, { pos: new THREE.Vector3(0, camY + visH * 0.04, boot ? 1 : 3), scale: 1.4, opacity: boot ? 1 : 0, selected: false }, dt);
  card.holder.rotation.set(...(theme.cardPose as [number, number, number]));

  const lit = boot ? card : items[sel];
  glow.position.copy(lit.pos).add(new THREE.Vector3(0, 0, -0.35));
  glow.scale.setScalar(1.9 * lit.scale);
  glow.material.opacity = (boot ? 0.45 : 0.55 + 0.2 * Math.sin(now * 2.2)) * lit.opacity;

  camera.position.set(0, damp(camera.position.y, camY, 8, dt), dist);
  renderer.render(scene, camera);
});

// text and buttons
/** a low-res button: the mark in its official colour's grey, inside a black disc, on a 13 px grid */
function pixels(on: (x: number, y: number) => boolean, color: string) {
  let r = '';
  for (let y = 0; y < 13; y++)
    for (let x = 0; x < 13; x++) {
      const dx = x - 6, dy = y - 6;
      if (dx * dx + dy * dy > 42) continue;
      r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${on(dx, dy) ? color : '#000'}"/>`;
    }
  return `<svg viewBox="0 0 13 13" shape-rendering="crispEdges">${r}</svg>`;
}
const ring = (dx: number, dy: number) => Math.abs(Math.hypot(dx, dy) - 3.2) < 0.8;
const glyph = {
  cross: pixels((dx, dy) => Math.abs(dx) <= 3 && (dx === dy || dx === -dy), theme.buttons.cross),
  circle: pixels(ring, theme.buttons.circle),
  triangle: pixels((dx, dy) => dy >= -3 && dy <= 2 && (dy === 2 ? Math.abs(dx) <= 3 : Math.abs(dx) === Math.round((dy + 3) * 0.6)), theme.buttons.triangle),
};
type Press = keyof typeof glyph;
const bars: Record<View, [Press, string][]> = {
  boot: [['cross', S.enter]],
  grid: [['cross', S.enter], ['circle', S.back], ['triangle', S.options]],
  detail: [['cross', S.enter], ['circle', S.back]],
};

function paint() {
  document.body.dataset.view = view;
  const pr = view === 'boot' ? theme.lowres : Math.min(devicePixelRatio, 2);
  if (renderer.getPixelRatio() !== pr) renderer.setPixelRatio(pr);
  const p = items[sel].spec;
  $('brand').textContent = S.title;
  $('name').textContent = label(p.id);
  $('sub').textContent = `${p.W} × ${p.L} × ${p.T} mm`;
  $('maker').textContent = S.maker;
  $('d-name').textContent = label(p.id);
  $('d-data').textContent = S.noData;
  const ul = $('commands');
  ul.innerHTML = '';
  [S.edit, S.delete].forEach((t, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'ink' + (i === cmd ? ' on' : '');
    b.textContent = t;
    b.onclick = () => (cmd === i ? press('cross') : ((cmd = i), paint()));
    li.append(b);
    ul.append(li);
  });
  const bar = $('bar');
  bar.innerHTML = '';
  for (const [k, t] of bars[view]) {
    const b = document.createElement('button');
    b.innerHTML = `${glyph[k]}<span class="ink">${t}</span>`;
    b.onclick = () => press(k);
    bar.append(b);
  }
}

/** black fade between the browser and the card's contents, as the console does */
function fadeTo(v: View) {
  const f = $('fade');
  f.classList.add('on');
  setTimeout(() => {
    view = v;
    paint();
    f.classList.remove('on');
  }, 280);
}

function press(k: Press) {
  if (view === 'boot') {
    if (k === 'cross') fadeTo('grid');
  } else if (view === 'grid') {
    if (k === 'cross') {
      view = 'detail';
      cmd = 0;
    } else if (k === 'circle') return fadeTo('boot');
  } else if (k === 'circle') view = 'grid';
  // detail cross on edit or delete: nothing to edit or delete yet
  paint();
}

function move(dx: number, dy: number) {
  if (view === 'grid') {
    const n = sel + dx + dy * cols;
    if (n < 0 || n >= items.length || (dx && rowOf(n) !== rowOf(sel))) return;
    sel = n;
    follow();
  } else if (view === 'detail' && dy) cmd = (cmd + 2 + dy) % 2;
  paint();
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  const map: Record<string, () => void> = {
    arrowleft: () => move(-1, 0),
    arrowright: () => move(1, 0),
    arrowup: () => move(0, -1),
    arrowdown: () => move(0, 1),
    enter: () => press('cross'),
    x: () => press('cross'),
    ' ': () => press('cross'),
    escape: () => press('circle'),
    backspace: () => press('circle'),
    o: () => press('circle'),
    t: () => press('triangle'),
  };
  if (map[k]) {
    e.preventDefault();
    map[k]();
  }
});

// touch: tap picks, a second tap on the picked phone enters; vertical drag scrolls the grid,
// horizontal drag on a spinning phone flings it round
const ray = new THREE.Raycaster();
let down: { x: number; y: number; camY: number; last: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, camY, last: e.clientX };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!down) return;
  if (view === 'grid') {
    const { min, max } = camLimits();
    camY = Math.min(Math.max(down.camY + ((e.clientY - down.y) / innerHeight) * visH, min), max);
  } else {
    fling += (e.clientX - down.last) * 0.08;
    down.last = e.clientX;
  }
});
canvas.addEventListener('pointerup', (e) => {
  const d = down;
  down = null;
  if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
  if (view === 'boot') return press('cross');
  if (view !== 'grid') return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects(items.map((it) => it.holder), true)[0];
  if (!hit) return;
  const i = items.findIndex((it) => it.holder === hit.object.parent?.parent?.parent);
  if (i < 0) return;
  if (i === sel) return press('cross');
  sel = i;
  follow();
  paint();
});

addEventListener('resize', layout);
layout();
items.forEach((it, i) => it.pos.copy(slot(i).setZ(-2)));
camera.position.set(0, camY, dist);
paint();
