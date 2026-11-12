import * as THREE from 'three';
import '@fontsource/inter/latin-400.css';
import theme from './theme';
import specs from '../phones.json';
import { buildLocked, buildPhone, edges, lockedEdge, framed, label, look, lookT, sheetLook, type PhoneSpec } from './phone';
import { buildLogo, buildPlay, buildShirt } from './logo';
import { fromHour, lit } from './sky';
import { READY, order, styleName, year } from './catalog';
import { exportStl, isSet, load, loadMy, loadTemplates, MY, partSolid, placing, saveTemplates, seat, SINK, solid, type Template } from './cases';
import { STEPS, combine, opsKey, partList, type Move, type Moves, type Op, type Part } from './parts';
import { inkLayer } from './ink';
import * as sfx from './sound';
import { picker, screenRect } from './pick';
import { playground, type Dir } from './play';

const S = theme.strings;
const C = theme.colors;
const css = document.documentElement.style;
css.setProperty('--font', theme.font);
for (const [k, v] of Object.entries(C)) if (typeof v === 'string') css.setProperty(`--${k}`, v);
C.field.forEach((v, i) => css.setProperty(`--field${i}`, v));
C.detail.forEach((v, i) => css.setProperty(`--detail${i}`, v));

const $ = (id: string) => document.getElementById(id)!;
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const clock = () => performance.now() / 1000;
/** the page the url asked for on load, read before the first paint rewrites it */
const start = decodeURIComponent(location.hash.slice(1));
// the entry the page loaded on; a popstate to an entry with no state is a url typed or followed while open
history.replaceState({ landing: true }, '');
/** reduced motion: no idle spin or sway, a swipe still turns the phone */
const still = matchMedia('(prefers-reduced-motion: reduce)');
const idle = () => (still.matches ? 0 : theme.spin);
const phones = order(specs as unknown as PhoneSpec[]);
const spec = (id: string) => phones.find((p) => p.id === id)!;
const card = spec(theme.card);

// scene: 1 unit = 100 mm
const MM = 0.01;
const COLS = 3;
const CELL = { w: 1.2, h: 1.6 }; // under TILT a row's lower third tucks behind the next row, so three rows clear the footer
const FOV = 40;
const T = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const TILT = 0.3; // the grid's plane leans back by this: lower rows sit nearer the camera and read bigger
const REST = { x: 0.2, y: 0 }; // grid pose: upright and square, top leaning toward the camera
const D = 4.2; // distance from the camera of the front page's icons and the open phone
const EDIT = 3; // edit's phone sits this many D away, scaled to match
const FLIP = THREE.MathUtils.degToRad(95);
const LOGO_H = 100; // mm

// two renderers over one scene: layer 0 at the console's line count, layer 1 (the open case) at full resolution
const low = new THREE.WebGLRenderer({ canvas: $('view') as HTMLCanvasElement, alpha: true });
const hi = new THREE.WebGLRenderer({ canvas: $('hi') as HTMLCanvasElement, alpha: true, antialias: true });
hi.localClippingEnabled = true; // edit's ghost is cut to the case's outline, as the solve cuts the part
const ink = inkLayer($('ink') as HTMLCanvasElement, $('ui'), C.pick);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
// key and rim ride with the camera, aimed at the icons' distance; away from a sky theme neither may sit near the view axis,
// or a straight-on black back mirrors it and reads grey
const key = new THREE.DirectionalLight(0xffffff, 2.2);
// key comes from the field's bright corner: style.css runs the field at 115deg, so its light is at 295deg, 25 degrees above level
const LIT = THREE.MathUtils.degToRad(115 + 180);
key.position.set(5 * Math.sin(LIT), 5 * Math.cos(LIT), -1);
const rim = new THREE.DirectionalLight(0xffffff, 1.2);
rim.position.set(3, -1, -7);
const sky = new THREE.HemisphereLight(0xffffff, 0x404040, 1.6);
for (const l of [key, rim, sky]) l.layers.enableAll();
for (const l of [key, rim]) {
  l.target.position.set(0, 0, -D);
  camera.add(l.target);
}
camera.add(key, rim);
scene.add(camera, sky);

// a sky theme lights by the hour, local time or ?t=<hour>, and on a phone its tilt swings the light up to 20 degrees
// as if the light stayed in the room; reduced motion keeps the tilt out
/** a sky theme's models in satin, so the moving light shows on their faces, not only their edges */
const finish = theme.sky ? { ...theme.finish, satin: 0.6 } : theme.finish;
let glowNight = 1; // the selection glow's scale: dimmed by night, or it outshines the field
let pin: number | null = null; // the playground's Light pins the hour; null follows the clock
let relight = () => {};
if (theme.sky) {
  const at = Number(new URLSearchParams(location.search).get('t') ?? NaN);
  // the key at 3x: on the near-black finish it is the only light that shows which side the sun or moon is on
  const KEY = key.intensity * 3, SKY = sky.intensity, RIM = rim.intensity, R = rim.position.clone();
  let tilt = 0;
  relight = () => {
    const d = new Date();
    const l = fromHour(pin ?? (Number.isNaN(at) ? d.getHours() + d.getMinutes() / 60 : at));
    l.angle += tilt;
    const s = lit(l, C.field);
    $('bg').style.background = s.background;
    // placed as the static key, only turned by the hour: near the view axis a straight-on black back mirrors it and reads grey
    key.position.set(5 * s.key[0], 5 * s.key[1], -1);
    key.color.setHSL(...s.tint);
    key.intensity = KEY * s.keyScale;
    // the rim swings with the light by its turn from the 115deg field as written, so 9:00 keeps the glints where they were
    const turn = THREE.MathUtils.degToRad(l.angle - 115);
    rim.position.set(R.x * Math.cos(turn) + R.y * Math.sin(turn), R.y * Math.cos(turn) - R.x * Math.sin(turn), R.z);
    rim.color.setHSL(...s.tint);
    rim.intensity = RIM * s.keyScale;
    sky.intensity = SKY * s.skyScale;
    // by night: locked phones' wireframe and the button discs' rims lift off the field, the glow drops
    lockedEdge(l.dark ? '#4a505c' : '#000000');
    ink.ring = l.dark ? '#ffffff38' : '';
    glowNight = l.dark ? 0.45 : 1;
  };
  relight();
  setInterval(relight, 60_000);
  const onTilt = (e: DeviceOrientationEvent) => {
    if (still.matches || e.gamma === null || e.beta === null) return;
    // left-right tilt whichever way the screen is turned
    const turn = screen.orientation?.angle ?? 0;
    const side = turn === 90 ? e.beta : turn === 270 || turn === -90 ? -e.beta : turn === 180 ? -e.gamma : e.gamma;
    tilt += ((clamp(side, -45, 45) / 45) * 20 - tilt) * 0.15;
    relight();
  };
  addEventListener('deviceorientation', onTilt);
  // iOS gives no tilt until asked from a touchend (pointerup is no gesture there); called on the class or it throws.
  // the listener stays until iOS answers, so a call it refuses is asked again on the next tap
  const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  if (DOE.requestPermission && !still.matches) {
    const ask = () => DOE.requestPermission!().then(() => removeEventListener('touchend', ask), () => {});
    addEventListener('touchend', ask);
  }
}

/** a hot white core whose light bleeds past the icon's edges: the selection glows */
function glowSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, C.glow);
  r.addColorStop(0.08, C.glow);
  r.addColorStop(0.18, C.glow + 'aa');
  r.addColorStop(0.36, C.glow + '33');
  r.addColorStop(0.65, C.glow + '0c');
  r.addColorStop(1, C.glow + '00');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  s.renderOrder = 1;
  return s;
}
const glow = glowSprite();
const dot = glowSprite();
scene.add(glow, dot);

type Item = {
  holder: THREE.Group;
  materials: THREE.Material[];
  h: number; // height at scale 1
  pos: THREE.Vector3;
  scale: number;
  opacity: number;
  spin: number;
  tilt: number;
  born: number; // when it pops in on a page
  ready: boolean;
};
function item(object: THREE.Object3D, materials: THREE.Material[], h: number): Item {
  const holder = new THREE.Group();
  object.scale.setScalar(MM);
  holder.add(object);
  holder.visible = false;
  materials = [...materials, sheetLook(object)];
  scene.add(holder);
  return { holder, materials, h: h * MM, pos: new THREE.Vector3(), scale: 1, opacity: 0, spin: REST.y, tilt: REST.x, born: 0, ready: true };
}

// the models page: one finish for every phone, a black silhouette where no case is finished yet
// mono draws every model's creases
look(theme.sheet ? 1 : 0, theme.sheet);
const bodies = phones.map((p) => (READY.has(p.id) ? buildPhone(p, finish, 8) : buildLocked(p, 8)));
const models = bodies.map((b, i) => item(b.object, b.materials, phones[i].L));
const fit = models[phones.indexOf(card)];

// the open phone's case: full resolution and see-through, over a depth-only copy of the phone so the phone hides what is behind it
const caseMat = new THREE.MeshStandardMaterial({
  color: theme.case.color, roughness: 0.3, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
});
const caseMesh = new THREE.Mesh(new THREE.BufferGeometry(), caseMat);
const caseLine = sheetLook(caseMesh);
const centre = new THREE.Vector3(card.W / 2, -card.L / 2, -card.T / 2);
// edit's move: the part where it will go, drawn over the case, and the grid it snaps to
// the ghost is lit and drawn once per pixel: its depth-only copy goes first, so its own far faces do not stack into blotches
// and the phone hides what sinks into it; the case writes no depth, so the ghost shows through the case
const ghostCut: THREE.Plane[] = [];
const ghost = new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshStandardMaterial({ color: C.pick, emissive: C.pick, emissiveIntensity: 0.35, roughness: 0.6, transparent: true, opacity: 0.6, depthWrite: false, clippingPlanes: ghostCut }),
);
ghost.matrixAutoUpdate = false;
const ghostDepth = new THREE.Mesh(ghost.geometry, new THREE.MeshBasicMaterial({ colorWrite: false, clippingPlanes: ghostCut }));
ghostDepth.layers.set(1);
ghost.add(ghostDepth);
const setGhost = (g: THREE.BufferGeometry) => (ghost.geometry = ghostDepth.geometry = g);
const snapGrid = new THREE.LineSegments(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: C.pick, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false }),
);
{
  const g = bodies[phones.indexOf(card)].frame;
  // pushed back a hair: the case's inner skin lies on the phone and would otherwise z-fight it
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 });
  for (const m of [...g.children] as THREE.Mesh[]) {
    const d = new THREE.Mesh(m.geometry, depthOnly);
    d.layers.set(1);
    g.add(d);
  }
  caseMesh.layers.set(1);
  g.add(caseMesh);
  for (const o of [ghost, snapGrid]) {
    o.layers.set(1);
    o.visible = false;
    o.renderOrder = 2;
    g.add(o);
  }
}

// the front page: a phone opens its cases page, the apple opens the models, the bed opens the playground, the shirt opens nothing yet
const isGlyph = (icon: string) => icon === 'logo' || icon === 'play' || icon === 'shirt';
const front = theme.front.map((f) => {
  const { object, materials } =
    f.icon === 'logo' ? buildLogo(LOGO_H, card.T, finish, f.seg) : f.icon === 'shirt' ? buildShirt(LOGO_H, card.T, finish, f.seg) : f.icon === 'play' ? buildPlay(LOGO_H, finish, f.seg) : buildPhone(spec(f.icon), finish, f.seg);
  return item(object, materials, isGlyph(f.icon) ? LOGO_H : spec(f.icon).L);
});

// the built styles and part sets; the parts of each set, read once; the starts edit offers in its first row
let styles: string[] = [];
const setParts = new Map<string, Part[]>();
type Look = Pick<Template, 'style' | 'ops' | 'moves'>;
const copyLook = (l: Look): Look => ({ style: l.style, ops: l.ops && { ...l.ops }, moves: l.moves && { ...l.moves } });
let starts: { name: string; look: Look }[] = [];
/** finished designs kept out of the start row: A on it steps through them, and the bar shows no key for it */
let creations: typeof starts = [];
let store = loadTemplates([]);

/** solved cases by style and ops, shared by the ring, the phone, edit and print; oldest dropped past GEOS */
const geos = new Map<string, Promise<THREE.BufferGeometry>>();
const GEOS = 24;
/** the playground's saved parts as parts that start off; edit's Add part lists them under My parts */
const myList = (): Part[] => Object.keys(loadMy()).map((name) => ({ name, op: 'off' }));
/** the version of each saved part a look has on; one deleted since is left out, and the solve skips it */
function myVers(t: Look) {
  const my = loadMy();
  return Object.fromEntries(Object.keys(t.ops ?? {}).flatMap((n) => (my[n] && t.ops![n] !== 'off' ? [[n, my[n].version]] : [])));
}
const keyOf = (t: Look) =>
  isSet(t.style) ? `${t.style}|${opsKey(t.ops, [...(setParts.get(t.style) ?? []), ...myList()], t.moves)}|${JSON.stringify(myVers(t))}` : t.style;
const sameLook = (a: Look, b: Look) => a.style === b.style && keyOf(a) === keyOf(b);
/** a design's case; lane 'edit' replaces the queued solve it overtakes, which then rejects and leaves the cache */
function caseOf(t: Look, lane?: string) {
  const k = keyOf(t);
  if (!geos.has(k)) {
    const p = isSet(t.style) ? combine(card.id, t.style, t.ops ?? {}, t.moves ?? {}, lane, myVers(t)) : load(card.id, t.style);
    p.catch(() => geos.delete(k));
    geos.set(k, p);
    if (geos.size > GEOS) geos.delete(geos.keys().next().value!);
  }
  return geos.get(k)!;
}
let solving = 0; // 1 while the phone's solve is in flight
let asked = 0; // counts wear's calls and never rewinds: only the latest may land
/** puts a design's case on the open phone */
function wear(t?: Look) {
  if (!t) return;
  const n = ++asked;
  solving = 1;
  caseOf(t, 'edit').then(
    (g) => {
      if (n !== asked) return;
      solving = 0;
      caseMesh.geometry = g;
      edges(caseMesh);
      paint();
    },
    () => {
      if (n !== asked) return;
      solving = 0;
      sfx.cancel();
      paint();
    },
  );
}

/** one ring item per saved design, made the first time the ring asks; a solve another lane overtook is asked again */
const items = new Map<Template, Item>();
function itemOf(t: Template) {
  let it = items.get(t);
  if (it) return it;
  const m = new THREE.MeshStandardMaterial({ color: theme.case.grid, roughness: 0.6, transparent: true });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
  it = item(framed(card, mesh), [m], card.L);
  it.ready = false;
  const fill = (): Promise<void> =>
    caseOf(t).then((g) => {
      mesh.geometry = g;
      edges(mesh);
      it!.ready = true;
    }, fill);
  fill();
  items.set(t, it);
  return it;
}
function dropItem(t: Template) {
  const it = items.get(t);
  if (!it) return;
  scene.remove(it.holder);
  it.materials.forEach((m) => m.dispose());
  items.delete(t);
}


type View = 'boot' | 'models' | 'cases' | 'detail' | 'edit' | 'info' | 'play' | 'apparel';
let view: View = 'boot';
let from: 'boot' | 'models' = 'boot'; // where B on the cases page goes
let msel = 0; // models grid
let fsel = 0; // front page, an index into fronts()
let entered = 0; // the theme.front icon the open page came from
let ring = 0; // cases page: the picked design, counted across ring pages
let turn = 0; // the ring's eased rotation, in slots
// the command list: 0 shut, 1 Edit Copy Print Delete, 2 Export Order, 3 are you sure, 4 printing
let menu = 0;
let cmd = 0;
let yes = false;
let opener = 0; // the row that opened the command list's second level, where B puts the cursor back
let draft: Look | null = null; // edit: the case being made; nothing is saved until A
let editing = -1; // edit: the design A saves over, -1 a new one
let psel = 0; // edit: 0 the start row, then the parts added
let adding = false; // edit: Y opened the list of parts not yet added
let asel = 0; // edit: the picked row of that list
let agroup: string | null = null; // edit: the group of parts that list shows; null while it lists the groups
let past: Look[] = []; // edit: the draft before each change, newest last; Undo takes one back
let origin: Look | null = null; // edit: the look it opened on; B on a draft off it asks before dropping it
let leaving = false; // edit: B asked once, a second B drops the draft
const orbit = { yaw: 0, tilt: 0 }; // edit: a drag turns the phone to look round the case; a move starts square-on
// edit: Y on a part moves and turns it on the back; at is its place, from what B puts back, snap steps it on the grid and by ANGLE;
// c is the part's middle, lo hi the x y z shifts that keep that middle over the case and within RISE of the back, box the case's outline, part the part's
let moving: {
  name: string; from: Move; at: Move; snap: boolean; c: THREE.Vector3; lo: number[]; hi: number[]; box: THREE.Box3; part: THREE.Box3; union: boolean;
} | null = null;
let side = false; // moving: the phone turned to its edge, the arrows then shift the part along y and z
const RISE = 15; // mm a part may sink into or lift off the back
const GRID = 2; // mm between grid lines, one snapped step
const FINE = 0.25; // mm one free arrow step
const ANGLE = 15; // degrees one snapped turn; a free turn is 1
let back: 'cases' | 'detail' = 'cases'; // where edit returns
let printAt = -1;
let flip: { i: number; t0: number; dir: 1 | -1 } | null = null;
let busy = false;
let drag = 0; // models: how far a held swipe has carried the row, in phones
let fling = 0; // extra spin from a swipe, decays to the idle spin
let grab = false; // a finger is on the open phone: it turns with the finger, not by itself
let dist = 4;
let loading = false;

const RING = 8; // designs on one ring page
/** the saved designs on built styles, in the order they were made */
const edited = () => store.list.filter((t) => t.edited && styles.includes(t.style));
/** the cases page as the showcase page: its ring holds the creations, A opens a copy of one in edit */
let gallery = false;
/** showcase's preview: the picked creation alone on the phone, big and turning */
let peek = false;
/** the phone in the ring's middle tries the picked creation on */
const tryOn = () => gallery && wear(creations[ring].look);
/** the designs on the ring */
const ringList = (): Template[] => (gallery ? creations.map((c) => c.look) : edited());
const shown = () => ringList().map(itemOf);
/** the picked design's index in store.list, -1 with none */
const tpl = () => store.list.indexOf(edited()[ring]);
/** a look's start name; a part set's look that is no start is custom */
const lookName = (t: Look) => [...starts, ...creations].find((s) => sameLook(s.look, t))?.name ?? (isSet(t.style) ? S.custom : styleName(t.style));
/** a design's name on screen: its look's, numbered when designs share it */
function designName(t: Template) {
  const n = lookName(t);
  const same = edited().filter((x) => lookName(x) === n);
  return same.length > 1 ? `${n} ${same.indexOf(t) + 1}` : n;
}
/** the front page's icons, as theme.front indices: the phones with a design, the apple and the playground */
const fronts = () => theme.front.flatMap((f, i) => (isGlyph(f.icon) || (f.icon === card.id && edited().length) ? [i] : []));
const opens = (i: number) => (theme.front[i].icon === 'logo' ? 'models' : theme.front[i].icon === 'play' ? 'play' : theme.front[i].icon === 'shirt' ? 'apparel' : 'cases');
const portrait = () => camera.aspect < 1;

const rowOf = (i: number) => Math.floor(i / COLS);
const flat = (i: number) => ({ x: ((i % COLS) - (COLS - 1) / 2) * CELL.w, v: -rowOf(i) * CELL.h });
const onPlane = (x: number, v: number) => new THREE.Vector3(x, v * Math.cos(TILT), -v * Math.sin(TILT));
const slot = (i: number) => onPlane(flat(i).x, flat(i).v);
const camAt = () => new THREE.Vector3(0, 0, dist);
/** a point d in front of the camera's resting place, fx and fy in fractions of the view's width and height there */
const ahead = (fx: number, fy: number, d: number) =>
  camAt().add(new THREE.Vector3(fx * 2 * d * T * camera.aspect, fy * 2 * d * T, -d));
/** the scale that makes something h tall fill frac of the view's height at distance d */
const fill = (frac: number, d: number, h: number) => (frac * 2 * d * T) / h;

function layout() {
  const w = innerWidth;
  const h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const pr = clamp(theme.lines / h, 0.2, 1);
  low.setPixelRatio(pr);
  low.setSize(w, h, false);
  hi.setPixelRatio(Math.min(devicePixelRatio, 2));
  hi.setSize(w, h, false);
  ink.resize(pr);
  // fit the columns across, and at least two rows of height
  dist = Math.max((COLS * CELL.w + 0.4) / 2 / (T * camera.aspect), (CELL.h * 2.4) / 2 / T);
}

type Target = { pos: THREE.Vector3; scale: number; opacity: number; spin: boolean; tilt?: number; sway?: number; yaw?: number };
const gone = (i: number): Target => ({ pos: slot(i).setZ(slot(i).z - 2), scale: 0.6, opacity: 0, spin: false });

// the models page is one row: the picked phone big in the middle, its neighbours stepped back and turned in at the sides, the picked one rocks and carries the glow
const sway = (picked: boolean) => (picked && !still.matches ? 0.35 * Math.sin(clock() * 1.6) : 0);
/** the row's step, as a fraction of the view's width */
/** one scale for the row, from the tallest phone, so phones keep their real sizes against each other */
const tallest = Math.max(...models.map((m) => m.h));
const STEP = () => (portrait() ? 0.5 : 0.2);
function gridTarget(i: number): Target {
  if (view !== 'models') return gone(i);
  const o = i - msel + drag;
  const a = Math.abs(o);
  return {
    pos: ahead(o * STEP(), 0.03, D + Math.min(a, 2) * 1.2),
    scale: fill(portrait() ? 0.4 : 0.5, D, tallest),
    opacity: clamp(2.5 - a, 0, 1),
    spin: false,
    yaw: -clamp(o, -1, 1) * 0.5,
    sway: sway(i === msel && !drag),
  };
}
/** the cases page's middle, in fractions of the view: the ring sits round it */
const hub = () => (portrait() ? { x: 0, y: 0.06 } : { x: -0.2, y: 0.02 });
/** the open phone: in the ring's middle, turning; bigger and still, back to the camera, in edit */
function openTarget(it: Item): Target {
  const pt = portrait();
  if (view === 'edit') {
    // EDIT times as far and as much bigger: the parts stand tens of mm off the back, and up close perspective spreads them past the case's sides
    const E = D * EDIT;
    const yaw = moving ? (side ? -Math.PI / 2 : 0) : orbit.yaw;
    const tilt = moving ? 0 : orbit.tilt;
    // landscape: left of the list, which style.css #parts starts at 56%
    if (!pt) return { pos: ahead(-0.2, 0.02, E), scale: fill(0.74, E, it.h), opacity: 1, spin: false, tilt, yaw };
    // portrait: in the band between the header and the part list
    const list = $('parts').getBoundingClientRect();
    const top = 0.1 * innerHeight, bottom = list.height ? list.top - 0.02 * innerHeight : 0.88 * innerHeight;
    const y = 0.5 - (top + bottom) / 2 / innerHeight;
    // 0.86: the case and its parts stand past the phone's own height
    return { pos: ahead(0, y, E), scale: fill(Math.min(0.62, (0.86 * (bottom - top)) / innerHeight), E, it.h), opacity: 1, spin: false, tilt, yaw };
  }
  if (view === 'detail' || peek) return { pos: ahead(pt ? 0 : -0.2, pt ? 0.1 : 0.02, D), scale: fill(pt ? 0.36 : 0.62, D, it.h), opacity: 1, spin: true };
  return { pos: ahead(hub().x, hub().y, D), scale: fill(pt ? 0.24 : 0.36, D, it.h), opacity: 1, spin: true };
}
const page = () => Math.floor(ring / RING);
/** design j on the cases page: this page's designs evenly round the phone, the picked one at the bottom */
function ringTarget(it: Item, j: number): Target {
  const n = shown().length;
  const k = j - page() * RING;
  const m = Math.min(RING, n - page() * RING);
  if (view !== 'cases' || peek || k < 0 || k >= m) return gone(j);
  const a = -Math.PI / 2 + ((k - turn) * 2 * Math.PI) / m;
  const pt = portrait();
  const pos = ahead(hub().x + Math.cos(a) * (pt ? 0.34 : 0.17), hub().y + Math.sin(a) * (pt ? 0.22 : 0.3), D);
  return { pos, scale: fill(pt ? 0.1 : 0.13, D, it.h), opacity: 1, spin: false, sway: sway(j === ring) };
}
/** X on a model: the phone small and rocking, centred over the labels and level with the name in style.css #info */
function infoTarget(it: Item): Target {
  const col = $('i-list').querySelector('dt')?.getBoundingClientRect();
  const row = $('i-name').getBoundingClientRect();
  const x = col ? (col.left + col.right) / 2 / innerWidth - 0.5 : -0.3;
  const y = 0.5 - (row.top + row.bottom) / 2 / innerHeight;
  return { pos: ahead(x, y, D), scale: fill(portrait() ? 0.2 : 0.3, D, it.h), opacity: 1, spin: false, sway: sway(true) };
}
function frontTarget(i: number): Target {
  const shown = fronts();
  const k = Math.max(shown.indexOf(i), 0);
  return {
    pos: ahead((k - (shown.length - 1) / 2) * (portrait() ? 0.48 : 0.3), 0.02, D),
    scale: fill((portrait() ? 0.26 : 0.36) * (theme.front[i].size ?? 1), D, front[i].h) * (k === fsel ? 1.12 : 1),
    opacity: view === 'boot' && shown.includes(i) ? 1 : 0,
    spin: false,
  };
}

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const unwind = (a: number, rest: number) => rest + (((a - rest) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
/** pop-in: 0 before it is born, overshooting a little to 1 over 0.3 s */
const pop = (it: Item, now: number) => {
  const k = it.ready ? clamp((now - it.born) / 0.3, 0, 1) : 0;
  return k && 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;
};

function pose(it: Item, t: Target, dt: number, grow = 1) {
  it.pos.x = damp(it.pos.x, t.pos.x, 7, dt);
  it.pos.y = damp(it.pos.y, t.pos.y, 7, dt);
  it.pos.z = damp(it.pos.z, t.pos.z, 7, dt);
  it.scale = damp(it.scale, t.scale, 7, dt);
  it.opacity = damp(it.opacity, t.opacity, 6, dt);
  if (t.spin && grab) {
    // pointermove turns it
  } else if (t.spin) {
    it.spin += dt * (idle() + fling);
    it.tilt = damp(it.tilt, -0.05, 4, dt);
  } else {
    // ease back to the rest pose the short way round
    it.spin = damp(unwind(it.spin, REST.y), REST.y + (t.yaw ?? 0) + (t.sway ?? 0), 5, dt);
    it.tilt = damp(it.tilt, t.tilt ?? REST.x, 5, dt);
  }
  it.holder.position.copy(it.pos);
  it.holder.scale.setScalar(it.scale * grow);
  it.holder.rotation.set(it.tilt, it.spin, 0);
  it.holder.visible = it.opacity > 0.01 && grow > 0;
  for (const m of it.materials) {
    const a = m.userData.alpha ?? 1;
    m.opacity = it.opacity * a;
    m.depthWrite = it.opacity > 0.98 && a === 1;
  }
}

const timer = new THREE.Timer();
let hiDrawn = false;
low.setAnimationLoop((t) => {
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 0.05);
  const now = clock();
  pad(now, dt);
  play.frame(dt, now);
  fling = damp(fling, 0, 1.5, dt);
  const open = view === 'cases' || view === 'detail' || view === 'edit';

  models.forEach((it, i) => pose(it, view === 'info' && i === msel ? infoTarget(it) : open && it === fit ? openTarget(it) : gridTarget(i), dt, view === 'models' ? pop(it, now) : 1));
  // the ring turns the short way round to the picked design
  const list = shown();
  const m = Math.min(RING, list.length - page() * RING);
  if (m > 0) {
    const to = ring - page() * RING;
    turn = (turn + m) % m;
    turn += ((((to - turn) % m) + m * 1.5) % m - m / 2) * (1 - Math.exp(-8 * dt));
  }
  teeItems.forEach((it, i) => pose(it, teeTarget(i), dt, view === 'apparel' ? pop(it, now) : 1));
  for (const it of items.values()) {
    const j = list.indexOf(it);
    pose(it, j < 0 ? gone(0) : ringTarget(it, j), dt, view === 'cases' ? pop(it, now) : 1);
  }

  // the front icons hold their own pose; the entered one flips toward the camera and blows up
  let k = 0;
  if (flip) {
    const s = clamp((now - flip.t0) / 0.35, 0, 1);
    k = flip.dir > 0 ? s * s : (1 - s) ** 2;
    if (flip.dir < 0 && s >= 1) flip = null;
  }
  front.forEach((it, i) => {
    pose(it, frontTarget(i), dt);
    const f = flip && flip.i === i ? k : 0;
    it.holder.rotation.set(theme.front[i].pose[0] + f * FLIP, theme.front[i].pose[1], theme.front[i].pose[2]);
    it.holder.scale.setScalar(it.scale * (1 + 8 * f));
  });

  const grid = view === 'models' ? models : view === 'cases' ? list : [];
  const busyPop = grid.some((it) => !it.ready || now < it.born + 0.3) || (solving > 0 && open && view !== 'edit');
  if (busyPop !== loading) {
    loading = busyPop;
    paint();
  }
  // more ring pages on the cases page
  const pages = Math.ceil(list.length / RING);
  const more = view === 'cases' && !menu ? [page() > 0, page() < pages - 1] : [false, false];
  (['up', 'down'] as const).forEach((k, i) => {
    if (more[i] !== k in document.body.dataset) more[i] ? (document.body.dataset[k] = '') : delete document.body.dataset[k];
  });

  // the case on 17e: any template while editing, else the worn one, open or on the models page; printing blows it outward and away
  const caseOn = view === 'edit' || (view === 'cases' && gallery) || (store.worn >= 0 && (open || view === 'models' || view === 'info'));
  // a solve in flight in edit dims the case it will replace
  let alpha = caseOn ? fit.opacity * theme.case.opacity * (view === 'edit' && solving ? 0.7 : 1) : 0;
  let s = 1;
  if (printAt >= 0) {
    const p = clamp((now - printAt) / 0.7, 0, 1);
    s = 1 + 0.6 * (1 - (1 - p) ** 3);
    alpha *= 1 - p;
  }
  caseMesh.scale.setScalar(s);
  caseMesh.position.copy(centre).multiplyScalar(1 - s);
  caseMat.opacity = alpha;
  caseLine.opacity = alpha * lookT();
  if (ghost.visible) clipGhost();
  caseMesh.visible = alpha > 0.003;

  // front page: a centre dot in front of the icon and an underglow behind it on the same spot
  // phone selection grid and the cases ring: one glow on the icon's lower part, depth-tested so a row in front covers it
  // both jump, never glide
  const lit = view === 'boot' ? front[fronts()[fsel]] : view === 'models' ? models[msel] : view === 'apparel' && photo < 0 ? teeItems[tsel] : view === 'cases' && !menu ? list[ring] : null;
  if (lit && !flip && !busy) {
    const g = view === 'boot' ? 1 : Math.min(pop(lit, now), 1);
    const h = lit.h * lit.scale;
    const toCam = camera.position.clone().sub(lit.pos);
    const o = theme.dot * glowNight * (0.85 + 0.15 * Math.sin(now * 2.1)) * lit.opacity * g;
    if (view === 'boot') {
      dot.position.copy(lit.pos).add(toCam.clone().setLength(0.3));
      dot.scale.setScalar(h * 0.55);
      // past the icon's bounding radius, or the tilted icon's far half pokes through the additive glow
      glow.position.copy(lit.pos).sub(toCam.setLength(h * 0.55));
      glow.scale.set(h * 1.9, h * 0.9, 1);
      glow.material.opacity = dot.material.opacity = o;
    } else {
      dot.position.copy(lit.pos);
      dot.position.y -= h * 0.42;
      dot.position.add(camera.position.clone().sub(dot.position).setLength(0.3));
      dot.scale.setScalar(h * 1.2);
      dot.material.opacity = o;
      glow.material.opacity = 0;
    }
    dot.material.depthTest = view !== 'boot';
  } else glow.material.opacity = dot.material.opacity = 0;

  // the playground places its bed from where the camera stands
  const c = camAt();
  if (view !== 'play') camera.position.set(damp(camera.position.x, c.x, 8, dt), damp(camera.position.y, c.y, 8, dt), damp(camera.position.z, c.z, 8, dt));
  camera.layers.set(0);
  low.render(scene, camera);
  const teesUp = teeItems.some((it) => it.holder.visible);
  if (caseMesh.visible || play.shown || teesUp || hiDrawn) {
    camera.layers.set(1);
    hi.render(scene, camera);
    camera.layers.set(0);
    hiDrawn = caseMesh.visible || play.shown || teesUp;
  }
  ink.draw();
});

// text and buttons
/** a button: its letter drawn in strokes, in its theme colour, inside a disc, black unless the theme names one */
const disc = (mark: string, color: string) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${(theme.buttons as { disc?: string }).disc ?? '#000'}" stroke="${theme.sheet?.edge ?? 'none'}" stroke-width="1"/>` +
      `<g fill="none" stroke="${color}" stroke-width="2.6">${mark}</g></svg>`,
  );
const glyph = {
  a: disc('<path d="M7 18 12 6 17 18M8.7 14H15.3"/>', theme.buttons.a),
  b: disc('<path d="M8 12H13A3 3 0 0 0 13 6H8V18H13.4A3 3 0 0 0 13.4 12"/>', theme.buttons.b),
  x: disc('<path d="M7.5 6 16.5 18M16.5 6 7.5 18"/>', theme.buttons.x),
  y: disc('<path d="M7.2 6 12 12.4 16.8 6M12 12.4V18"/>', theme.buttons.y),
  l: disc('<path d="M9 6V18H16"/>', theme.buttons.y),
  r: disc('<path d="M8 18V6H13A3.2 3.2 0 0 1 13 12.4H8M12.6 12.4 16.4 18"/>', theme.buttons.y),
  zl: disc('<path stroke-width="2" d="M4 7H10L4 17H10M13.5 7V17H19.5"/>', theme.buttons.y),
  zr: disc('<path stroke-width="2" d="M4 7H10L4 17H10M13.5 17V7H17.3A2.7 2.7 0 0 1 17.3 12.4H13.5M17 12.4 20 17"/>', theme.buttons.y),
  // the d-pad, drawn as chevrons
  left: disc('<path d="M14.5 7 9.5 12 14.5 17"/>', theme.buttons.y),
  right: disc('<path d="M9.5 7 14.5 12 9.5 17"/>', theme.buttons.y),
  up: disc('<path d="M7 14.5 12 9.5 17 14.5"/>', theme.buttons.y),
  down: disc('<path d="M7 9.5 12 14.5 17 9.5"/>', theme.buttons.y),
};
type Press = Exclude<keyof typeof glyph, Dir>;
/** the console's more-this-way marker: a flat borderless blue triangle, faded at its base and darkening to the tip */
const arrow = (d: string, base: 0 | 1) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12"><linearGradient id="g" x1="0" y1="${base}" x2="0" y2="${1 - base}">` +
      `<stop offset="0" stop-color="${C.more}" stop-opacity="0"/><stop offset=".4" stop-color="${C.more}"/>` +
      `<stop offset="1" stop-color="#${new THREE.Color(C.more).multiplyScalar(0.45).getHexString()}"/></linearGradient><path d="${d}" fill="url(#g)"/></svg>`,
  );
($('up') as HTMLImageElement).src = arrow('M12 0 24 12H0Z', 1);
($('down') as HTMLImageElement).src = arrow('M0 0H24L12 12Z', 0);
const bars: Record<View, [Press, string][]> = {
  boot: [['a', S.enter]],
  models: [['a', S.enter], ['b', S.back], ['x', S.options]],
  cases: [['a', S.enter], ['b', S.back], ['x', S.options]],
  detail: [],
  edit: [['a', S.save], ['b', S.back]],
  info: [['b', S.back]],
  play: [],
  apparel: [],
};

/** the apparel pages, from public/apparel/apparel.json: the tees side by side, then one tee's photos */
type Tee = { id: string; name: string; kind: string; icon: string; print?: string; quote?: string; images: string[] };
let tees: Tee[] = [];
let tsel = 0;
let photo = -1; // the open tee's photo; -1 on the list
const teeSrc = (t: Tee, f: string) => `apparel/${t.id}/${f}`;
/** each tee's cutout as a flat card in the scene, drawn on the sharp canvas; posed like the models row */
let teeItems: Item[] = [];
const TEE_H = tallest / MM; // mm, as tall as the tallest phone, so the row's sizes carry over
function buildTees() {
  const load = new THREE.TextureLoader();
  teeItems = tees.map((t) => {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.layers.set(1);
    mesh.scale.set(TEE_H, TEE_H, 1);
    load.load(teeSrc(t, t.icon), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex;
      mat.needsUpdate = true;
      mesh.scale.x = (TEE_H * tex.image.width) / tex.image.height;
    });
    // item() sets its object's scale to mm, so the card is sized inside a group
    return item(new THREE.Group().add(mesh), [mat], TEE_H);
  });
}
/** the tees row: like the models row, the picked tee big in the middle, its neighbours stepped back and turned in */
function teeTarget(i: number): Target {
  if (view !== 'apparel' || photo >= 0) return gone(i);
  const o = i - tsel + drag;
  const a = Math.abs(o);
  return {
    pos: ahead(o * (portrait() ? 0.55 : 0.3), 0.02, D + Math.min(a, 2) * 1.2),
    scale: fill(portrait() ? 0.36 : 0.5, D, tallest),
    opacity: clamp(2.5 - a, 0, 1),
    spin: false,
    tilt: 0,
    yaw: -clamp(o, -1, 1) * 0.5,
    sway: sway(i === tsel && !drag),
  };
}
fetch('apparel/apparel.json')
  .then((r) => r.json())
  .then((t: Tee[]) => {
    tees = t;
    buildTees();
    $('tees').replaceChildren(
      ...t.map((tee, i) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        const img = document.createElement('img');
        img.src = teeSrc(tee, tee.icon);
        img.alt = '';
        b.ariaLabel = tee.name;
        b.append(img);
        b.onclick = () => (i === tsel ? press('a') : move(i - tsel, 0));
        li.append(b);
        return li;
      }),
    );
    if (view === 'apparel') paint();
  });
$('tee-photo').onclick = (e) => move(e.offsetX < (e.target as HTMLElement).clientWidth / 2 ? -1 : 1, 0);
// the tee page's order link: an Instagram DM, theme.order
Object.assign($('tee-buy'), { href: theme.order, textContent: S.buy });

function paintApparel() {
  [...$('tees').querySelectorAll('button')].forEach((b, i) => (i === tsel ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
  const t = tees[tsel];
  if (photo < 0 || !t) return;
  ($('tee-photo') as HTMLImageElement).src = teeSrc(t, t.images[photo]);
  new Image().src = teeSrc(t, t.images[(photo + 1) % t.images.length]);
  $('tee-name').textContent = t.name;
  $('tee-kind').textContent = t.kind;
  $('tee-note').textContent = t.quote ?? t.print ?? '';
  $('tee-dots').replaceChildren(
    ...t.images.map((_, i) => {
      const li = document.createElement('li');
      if (i === photo) li.ariaCurrent = 'true';
      return li;
    }),
  );
}

/** edit's bar: what A does on the picked row, B, and X on a part; a move's other controls are rows beside the phone */
function editBar(): [Press, string][] {
  if (leaving) return [['a', S.stay], ['b', S.discard]];
  if (adding) return [['a', agroup === null ? S.enter : S.add], ['b', S.back]];
  if (moving) return [['a', S.place], ['b', S.cancel]];
  const k = rowKind();
  const x = { start: '', part: S.move, add: S.add, undo: S.undo, save: S.save }[k];
  return [...(x ? [['a', x] as [Press, string]] : []), ['b', S.back], ...(k === 'part' ? [['x', S.remove] as [Press, string]] : [])];
}

const text = (id: string, s: string) => ($(id).textContent = s);

/** the showcase button, top right of a phone's page: Y opens the creations */
const inspoOpen = () => view === 'detail' && menu === 1 && creations.length > 0;
($('inspo').firstElementChild as HTMLImageElement).src = glyph.y;
$('inspo').lastElementChild!.textContent = S.inspo;
// it stays in the page, so a click must not leave it focused to take a later Enter
$('inspo').onclick = (e) => {
  (e.currentTarget as HTMLElement).blur();
  press('y');
};
const ink$ = (tag: string, s: string, cls = '') => {
  const e = document.createElement(tag);
  e.className = 'ink' + (cls && ' ' + cls);
  e.textContent = s;
  // the step arrows read as quotation marks to a screen reader
  if (s === '‹' || s === '›') e.ariaLabel = s === '‹' ? 'Previous' : 'Next';
  return e;
};
const play = playground({ scene, camera, paint, leave, ink: ink$, hour: (h) => ((pin = h), relight()) });

type Row = [id: 'new' | 'edit' | 'copy' | 'print' | 'delete' | 'export' | 'order', label: string, ok: boolean];
/** the command list's rows and whether each can be picked; detail works on the worn design, cases on the picked one */
function rows(): Row[] {
  const has = shown().length > 0;
  if (menu === 1 && view === 'detail')
    return store.worn >= 0
      ? [['copy', S.copy, true], ['delete', S.delete, true]]
      : [['new', S.new, starts.length > 0], ['delete', S.delete, false]];
  if (menu === 1) return [['edit', S.edit, has], ['copy', S.copy, has], ['print', S.print, has], ['delete', S.delete, has]];
  if (menu === 2) return [['export', S.export, true], ['order', S.order, !!theme.order]];
  return [];
}

/** a part set's parts but the base, then the saved parts, each with its op in the draft and in parts.json */
const setRows = () =>
  draft && isSet(draft.style)
    ? [...(setParts.get(draft.style) ?? []), ...myList()].filter((p) => p.op !== 'base').map((p) => ({ name: p.name, def: p.op, op: draft!.ops?.[p.name] ?? p.op }))
    : [];
/** the op Add part puts a part on: its parts.json op, a saved part joined */
const addOp = (r: { def: Op }): Op => (r.def === 'off' ? 'union' : r.def);
/** edit's part rows: the parts on the case, joined ones then cut ones, as the list groups them; Y lists the rest */
const partRows = () => {
  const on = setRows();
  return [...on.filter((r) => r.op === 'union'), ...on.filter((r) => r.op === 'difference')];
};
/** a part file's name as a label: clipper-seat reads Clipper seat; a saved part by the name it was saved under */
const partName = (n: string) => (n.startsWith(MY) ? (loadMy()[n]?.name ?? n.slice(MY.length)) : n.charAt(0).toUpperCase() + n.slice(1).replace(/-/g, ' '));
/** what a part is for, from the theme's groups by part name; a part in none of them is Other */
const GROUPS: Record<string, string[]> = theme.groups;
const groupOf = (name: string) =>
  name.startsWith(MY) ? (loadMy()[name]?.featured ? S.featured : S.myParts) : (Object.keys(GROUPS).find((g) => GROUPS[g].includes(name)) ?? S.other);
/** the parts off the case, by name with C10 after C9 */
const addable = () =>
  setRows()
    .filter((r) => r.op === 'off' && (r.def !== 'off' || r.name.startsWith(MY)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
/** the groups with a part left to add, in the theme's order, Other last */
const addGroups = () => [...Object.keys(GROUPS), S.featured, S.myParts, S.other].filter((g) => addable().some((r) => groupOf(r.name) === g));
/** Y's list one group deep: that group's parts left to add */
const addRows = () => addable().filter((r) => groupOf(r.name) === agroup);
/** edit's rows: the start, the parts, then what A can do: add a part, undo, save */
type Kind = 'start' | 'part' | 'add' | 'undo' | 'save';
const tail = (): Kind[] => [...(addable().length ? ['add' as const] : []), ...(past.length ? ['undo' as const] : []), 'save'];
const rowKind = (i = psel): Kind => (i === 0 ? 'start' : i <= partRows().length ? 'part' : (tail()[i - partRows().length - 1] ?? 'save'));
const rowCount = () => 1 + partRows().length + tail().length;
/** remembers the draft as it is, before a change */
function mark() {
  past.push(copyLook(draft!));
  if (past.length > 50) past.shift();
}
/** the draft as it was before its last change; the pick stays on Undo while there is more to undo, never slides onto Save */
function undo() {
  const l = past.pop();
  if (!l) return false;
  const k = rowKind();
  draft = l;
  wear(draft);
  psel = k !== 'undo' ? Math.min(psel, partRows().length) : past.length ? 1 + partRows().length + tail().indexOf('undo') : 0;
  return true;
}
/** the draft with one part on op; a part on its parts.json op keeps no entry */
function setOp(name: string, def: Op, op: Op) {
  mark();
  const ops = { ...draft!.ops, [name]: op };
  if (op === def) delete ops[name];
  // a part taken off forgets its move
  if (op === 'off') setMove(name, [0, 0, 0, 0]);
  draft = { ...draft!, ops: Object.keys(ops).length ? ops : undefined };
  wear(draft);
}
/** the draft with one part placed at at; a part in its own place keeps no entry */
function setMove(name: string, at: Move) {
  const moves: Moves = { ...draft!.moves, [name]: at };
  if (!at.some(Boolean)) delete moves[name];
  draft = { ...draft!, moves: Object.keys(moves).length ? moves : undefined };
}
const moveOf = (name: string): Move => {
  const m = draft?.moves?.[name];
  return [m?.[0] ?? 0, m?.[1] ?? 0, m?.[2] ?? 0, m?.[3] ?? 0];
};
const mm = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${+Math.abs(v).toFixed(2)}`;

/** one part's solid as a geometry, for the ghost, and its box, for the move's range */
const partGeos = new Map<string, Promise<THREE.BufferGeometry>>();
function partGeo(style: string, name: string): Promise<THREE.BufferGeometry> {
  const mine = name.startsWith(MY);
  const url = mine ? `${style}|${name}|${loadMy()[name]?.version}` : `glb/${card.id}/${style}/${name}.glb`;
  // a saved part seats on the base's back as the solve seats it
  const base = () => partGeo(style, setParts.get(style)!.find((p) => p.op === 'base')!.name);
  if (!partGeos.has(url))
    partGeos.set(
      url,
      (mine ? Promise.all([partSolid('', name), base()]).then(([m, b]) => seat(m, b.boundingBox!.min.toArray(), b.boundingBox!.max.toArray())) : solid(url)).then(({ pos, idx }) => {
        const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)).setIndex(new THREE.BufferAttribute(idx, 1));
        g.computeBoundingBox();
        return g;
      }),
    );
  return partGeos.get(url)!;
}
/** Y on a part: its ghost over the case, free to go anywhere its middle stays over the base shell */
async function startMove(name: string) {
  const style = draft!.style;
  const [g, base] = await Promise.all([partGeo(style, name), partGeo(style, setParts.get(style)!.find((p) => p.op === 'base')!.name)]);
  if (view !== 'edit' || draft?.style !== style) return;
  const p = g.boundingBox!, b = base.boundingBox!;
  const at = moveOf(name);
  const c = p.getCenter(new THREE.Vector3()).setZ(0);
  const union = partRows().find((r) => r.name === name)?.op === 'union';
  side = false;
  orbit.yaw = orbit.tilt = 0;
  moving = {
    name, from: at, at: [...at], snap: true, c, box: b, part: p, union,
    lo: [b.min.x - c.x, b.min.y - c.y, -RISE], hi: [b.max.x - c.x, b.max.y - c.y, RISE],
  };
  setGhost(g);
  grid();
  placeGhost();
  paint();
}
/** the snap grid: over the shell's outline on its back face, or edge-on across y and every z the part can reach, through the shell's middle */
function grid() {
  const { box: b, part: p } = moving!;
  const v: number[] = [];
  const lines = (from: number, to: number, line: (t: number) => number[]) => {
    for (let t = Math.ceil(from / GRID) * GRID; t <= to; t += GRID) v.push(...line(t));
  };
  if (side) {
    const x = (b.min.x + b.max.x) / 2;
    const z0 = Math.min(b.min.z, p.min.z) - RISE, z1 = Math.max(b.max.z, p.max.z) + RISE;
    lines(z0, z1, (z) => [x, b.min.y, z, x, b.max.y, z]);
    lines(b.min.y, b.max.y, (y) => [x, y, z0, x, y, z1]);
  } else {
    // the back is the face nearer the camera
    caseMesh.updateWorldMatrix(true, false);
    const d = (z: number) => new THREE.Vector3(0, 0, z).applyMatrix4(caseMesh.matrixWorld).distanceTo(camera.position);
    const z = d(b.min.z) < d(b.max.z) ? b.min.z : b.max.z;
    lines(b.min.x, b.max.x, (x) => [x, b.min.y, z, x, b.max.y, z]);
    lines(b.min.y, b.max.y, (y) => [b.min.x, y, z, b.max.x, y, z]);
  }
  snapGrid.geometry.dispose();
  snapGrid.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
}
/** edit's picked part, faint over the case where it sits, so the row and the part read as one: a part row's, or in Y's list the part A would add; moving takes over from it */
let picked: { name: string; c: THREE.Vector3; box: THREE.Box3; union: boolean } | null = null;
const wanted = () => (view === 'edit' && draft && !moving ? (adding ? addRows()[asel] : partRows()[psel - 1]) : undefined);
async function showPart() {
  const r = wanted();
  const union = (adding ? r?.def : r?.op) === 'union';
  if (!r) picked = null;
  else if (picked?.name !== r.name || picked.union !== union) {
    // nothing shows while the part loads: the last part's ghost is not this row's
    picked = null;
    placeGhost();
    const style = draft!.style;
    const [g, base] = await Promise.all([partGeo(style, r.name), partGeo(style, setParts.get(style)!.find((p) => p.op === 'base')!.name)]);
    if (wanted()?.name !== r.name) return;
    picked = { name: r.name, c: g.boundingBox!.getCenter(new THREE.Vector3()).setZ(0), box: base.boundingBox!, union };
    setGhost(g);
  }
  placeGhost();
}
/** the ghost: the moving part where it will go, else the picked one where it is; added parts in the pick colour, cuts in red */
function placeGhost() {
  const s = moving ?? picked;
  ghost.visible = !!s;
  snapGrid.visible = !!moving?.snap;
  if (!s) return;
  const mat = ghost.material;
  mat.color.set(s.union ? C.pick : C.del);
  mat.emissive.copy(mat.color);
  mat.opacity = moving ? 0.6 : 0.35;
  ghost.matrix.copy(placing(s.c, moving?.at ?? moveOf(s.name)));
}
/** a union part's ghost cut to the case's sides and SINK into its back, as the solver cuts it, in world space, so it follows the phone; a cut part shows whole */
function clipGhost() {
  const m = moving ?? picked;
  const planes = ghostCut;
  planes.length = 0;
  if (!m?.union) return;
  const { min, max } = m.box;
  // pose moved the phone this frame; the renderer has not walked the scene yet
  caseMesh.updateWorldMatrix(true, false);
  const n = new THREE.Matrix3().getNormalMatrix(caseMesh.matrixWorld);
  for (const [nx, ny, d] of [[1, 0, -min.x], [-1, 0, max.x], [0, 1, -min.y], [0, -1, max.y]])
    planes.push(new THREE.Plane(new THREE.Vector3(nx, ny, 0), d).applyMatrix4(caseMesh.matrixWorld, n));
  planes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), min.z + SINK).applyMatrix4(caseMesh.matrixWorld, n));
}
/** a shift on screen, in px with y down, as a shift in the case's x y z mm: across x and y on the back, z and y edge-on */
function toCase(px: number, py: number): number[] {
  caseMesh.updateWorldMatrix(true, false);
  const s = (v: THREE.Vector3) => {
    v.applyMatrix4(caseMesh.matrixWorld).project(camera);
    return [(v.x * innerWidth) / 2, (-v.y * innerHeight) / 2];
  };
  const [u, w] = side ? [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)] : [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];
  const [o, eu, ew] = [s(new THREE.Vector3()), s(u.clone()), s(w.clone())];
  const a = eu[0] - o[0], c = eu[1] - o[1], b = ew[0] - o[0], d = ew[1] - o[1];
  const det = a * d - b * c || 1;
  const du = (d * px - b * py) / det, dw = (a * py - c * px) / det;
  return side ? [0, dw, du] : [du, dw, 0];
}
/** moves the ghost to at, snapped, kept in range and its turn within ±180°; false when it could not go there */
function shift(at: Move) {
  const m = moving!;
  const [x, y, z] = [at[0], at[1], at[3] ?? 0].map((v, i) => clamp(m.snap ? Math.round(v / GRID) * GRID : Math.round(v / FINE) * FINE, m.lo[i], m.hi[i]));
  const deg = Math.round(m.snap ? Math.round(at[2] / ANGLE) * ANGLE : at[2]);
  const q: Move = [x, y, ((((deg + 180) % 360) + 360) % 360) - 180, z];
  if (q.every((v, i) => v === m.at[i])) return false;
  m.at = q;
  placeGhost();
  return true;
}
/** L1 turns the moving part counter-clockwise on screen, R1 clockwise: one ANGLE snapped, a degree free */
function turnBy(dir: 1 | -1) {
  const m = moving!;
  // the back faces the camera mirrored, so a turn on screen is the other way round in the case's frame
  const [x, y] = toCase(1, 0), [x2, y2] = toCase(0, -1);
  const flip = Math.sign(x * y2 - y * x2) || 1;
  return shift([m.at[0], m.at[1], m.at[2] + dir * flip * (m.snap ? ANGLE : 1), m.at[3]]);
}
/** a move back to the part's own place */
function resetMove() {
  if (view !== 'edit' || !moving) return;
  if (!shift([0, 0, 0, 0])) return sfx.cancel();
  sfx.tick();
  paint();
}
const opName: Record<Op, string> = { base: '', union: S.union, difference: S.difference, off: S.off };

/** "1 case", "2 cases": the theme's count words are plurals ending in s */
const many = (n: number, word: string) => `${n} ${n === 1 ? word.replace(/s$/, '') : word}`;
function paint() {
  document.body.dataset.view = view;
  syncUrl();
  if (menu) document.body.dataset.menu = '';
  else delete document.body.dataset.menu;
  if (inspoOpen()) document.body.dataset.inspo = '';
  else delete document.body.dataset.inspo;
  const p = phones[msel];
  const list = ringList();
  const pages = Math.ceil(list.length / RING);
  text('brand', S.brand);
  const count = view === 'models' ? many(models.length, S.models) : view === 'cases' ? many(list.length, S.cases) : '';
  text('sub', count);
  text('loading', S.loading);
  if (loading) document.body.dataset.loading = '';
  else delete document.body.dataset.loading;

  let n1 = '';
  let n2 = '';
  if (view === 'boot') {
    const f = theme.front[fronts()[fsel]].icon;
    n1 = f === 'logo' ? S.title : f === 'play' ? S.play : f === 'shirt' ? S.shirt : label(f);
    n2 = f === 'logo' ? many(models.length, S.models) : isGlyph(f) ? '' : many(list.length, S.cases);
  } else if (view === 'models') {
    n1 = label(p.id);
  } else if (view === 'cases') {
    n1 = gallery ? creations[ring].name : list.length ? designName(list[ring]) : S.noCases;
    const where = gallery ? S.inspo : label(card.id);
    n2 = pages > 1 ? `${where} ${page() + 1}/${pages}` : where;
  } else if (view === 'edit') {
    n1 = leaving ? S.discardAsk : editing >= 0 ? designName(store.list[editing]) : S.new;
    n2 = solving ? S.loading : label(card.id);
  } else if (view === 'play') [n1, n2] = play.title();
  else if (view === 'apparel' && photo < 0 && tees[tsel]) [n1, n2] = [tees[tsel].name, tees[tsel].kind];
  if (view === 'apparel' && photo >= 0) document.body.dataset.tee = '';
  else delete document.body.dataset.tee;
  if (view === 'apparel') paintApparel();
  text('n1', n1);
  text('n2', n2);

  const w = store.list[store.worn];
  text('d-maker', S.title);
  text('d-name', label(p.id));
  text('d-case', w ? `${designName(w)} ${S.case}`.toUpperCase() : '');
  text('d-size', `${p.W} × ${p.L} × ${p.T} mm`);

  const made = p.id === card.id ? list.length : 0;
  text('i-name', `${S.product} ${label(p.id)}`);
  const on = p.id === card.id && store.worn >= 0 ? designName(store.list[store.worn]) : S.bare;
  $('i-list').replaceChildren(
    ...[
      [S.maker, S.title],
      [S.released, year(p.id)],
      [S.size, `${p.W} × ${p.L} × ${p.T} mm`],
      [S.made, made ? String(made) : S.none],
      [S.wearing, on],
    ].flatMap(([k, v]) => [ink$('dt', k), ink$('dd', v)]),
  );

  // the console's flow: the chosen option stays as the heading, then a question or the work
  const ul = $('commands');
  const li = (e: HTMLElement) => {
    const l = document.createElement('li');
    l.append(e);
    return l;
  };
  const button = (s: string, on: boolean, click: () => void, cls = '') => {
    const b = ink$('button', s, [on ? 'on' : '', cls].filter(Boolean).join(' '));
    b.onclick = click;
    return li(b);
  };
  const row = ([id, s, ok]: Row, i: number) =>
    button(s, ok && i === cmd, () => (!ok ? sfx.cancel() : cmd === i ? press('a') : (sfx.tick(), (cmd = i), paint())), [ok ? '' : 'off', id === 'delete' ? 'del' : ''].filter(Boolean).join(' '));
  if (menu === 1) ul.replaceChildren(...rows().map(row));
  else if (menu === 2) ul.replaceChildren(li(ink$('p', S.print)), ...rows().map(row));
  else if (menu === 3) {
    ul.replaceChildren(
      li(ink$('p', S.delete, 'del')),
      li(ink$('p', S.sure)),
      button(S.yes, yes, () => (yes ? press('a') : (sfx.tick(), (yes = true), paint()))),
      button(S.no, !yes, () => (!yes ? press('a') : (sfx.tick(), (yes = false), paint()))),
    );
  } else if (menu === 4) ul.replaceChildren(li(ink$('p', S.print)), li(ink$('p', S.printing)), li(ink$('p', S.keep)));
  else ul.replaceChildren();

  // edit's rows: the start, each part, then add, undo and save; a tap picks a row, a tap on the picked row is A, ‹ › step it as ← → do
  const parts = $('parts');
  // rows are a finger tall on a touch screen, and only as many show as fit beside or under the phone
  const rowH = Math.max(parseFloat(getComputedStyle(parts).fontSize) * 1.6, matchMedia('(pointer: coarse)').matches ? 40 : 0);
  parts.style.setProperty('--row', `${rowH}px`);
  const fits = Math.max(4, Math.floor((innerHeight * (portrait() ? 0.36 : 0.62)) / rowH));
  /** the rows that fit, the picked one kept in the middle; ▲ ▼ stand in for the rows cut off */
  const windowed = (rows: [HTMLElement, boolean][]) => {
    const els = rows.map((r) => r[0]);
    if (els.length <= fits) return els;
    const from = clamp(rows.findIndex((r) => r[1]) - (fits >> 1), 0, els.length - fits);
    const cut = els.slice(from, from + fits);
    if (from > 0) cut[0] = li(ink$('p', '▲', 'more'));
    if (from + fits < els.length) cut[fits - 1] = li(ink$('p', '▼', 'more'));
    return cut;
  };
  if (view === 'edit' && draft && adding) {
    // Y's list: the groups, then one group's parts; a tap picks a row, a part shows on the case, a second tap is A
    const list = agroup === null ? addGroups().map((g) => `${g}  ${addable().filter((r) => groupOf(r.name) === g).length}`) : addRows().map((r) => `${partName(r.name)}  ${opName[addOp(r)]}`);
    parts.replaceChildren(
      li(ink$('p', agroup ?? S.addTitle, 'title')),
      ...windowed(
        list.map((s, i): [HTMLElement, boolean] => {
          const b = ink$('button', s, i === asel ? 'on' : '');
          b.onclick = () => (i === asel ? press('a') : (sfx.tick(), (asel = i), paint()));
          return [li(b), i === asel];
        }),
      ),
    );
  } else if (view === 'edit' && draft && moving) {
    // a move: where the part is, then its controls, each with the button that also works it
    const at = moving.at;
    const pos: [string, number][] = side ? [['y', at[1]], ['z', at[3] ?? 0]] : [['x', at[0]], ['y', at[1]], ...(at[3] ? [['z', at[3]] as [string, number]] : [])];
    const hint = (b: HTMLElement, k: Press) => {
      const img = document.createElement('img');
      img.className = 'px';
      img.src = glyph[k];
      img.alt = '';
      b.prepend(img);
    };
    const act = (k: Press | null, name: string, value: string, click: () => void) => {
      const l = document.createElement('li');
      const a = ink$('button', name, 'name');
      const b = ink$('button', value, 'value');
      a.onclick = b.onclick = click;
      if (k) hint(a, k);
      l.append(a, b);
      return l;
    };
    const turn = document.createElement('li');
    const step = (s: string, k: Press) => {
      const b = ink$('button', s, 'step');
      b.onclick = () => press(k);
      return b;
    };
    const turnL = step('‹', 'l'), turnR = step('›', 'r');
    hint(turnL, 'l');
    turnR.append(Object.assign(document.createElement('img'), { className: 'px', src: glyph.r, alt: '' }));
    turn.append(ink$('p', S.turn, 'name'), turnL, ink$('p', `${at[2]}°`, 'value'), turnR);
    parts.replaceChildren(
      li(ink$('p', partName(moving.name), 'title')),
      li(ink$('p', `${pos.map(([a, v]) => `${a} ${mm(v)}`).join('   ')} mm`, 'read')),
      ...(side ? [] : [turn]),
      act('y', S.grid, moving.snap ? S.snap : S.free, () => press('y')),
      act('x', S.view, side ? S.side : S.flat, () => press('x')),
      act(null, S.reset, '', resetMove),
    );
  } else if (view === 'edit' && draft) {
    const editRow = (i: number, name: string, value: string, cls = '') => {
      const on = i === psel;
      const l = document.createElement('li');
      if (cls) l.className = cls;
      const b = (s: string, click: () => void, c = '') => {
        const e = ink$('button', s, [on ? 'on' : '', c].filter(Boolean).join(' '));
        e.onclick = click;
        return e;
      };
      // a tap on the picked part is A: it moves the part
      const pick = () => {
        if (on) return void (i && press('a'));
        sfx.tick();
        psel = i;
        leaving = false;
        paint();
      };
      const step = (d: number) => () => {
        psel = i;
        move(d, 0);
      };
      l.append(b(name, pick, 'name'), b('‹', step(-1), 'step'), b(value, pick, 'value'), b('›', step(1), 'step'));
      return l;
    };
    // a part off its parts.json op or out of its own place shows in the title colour
    const changed = (r: { name: string; op: Op; def: Op }) => r.op !== r.def || moveOf(r.name).some(Boolean);
    // each op's rows under a heading; the headings are not rows, ↑/↓ step over them
    const heading = { union: S.joined, difference: S.cutOut } as Record<Op, string>;
    const P = partRows();
    const names: Record<string, string> = { add: S.addPart, undo: S.undo, save: S.save };
    parts.replaceChildren(
      ...windowed([
        [editRow(0, S.start, lookName(draft)), !psel],
        ...P.flatMap((r, i, all): [HTMLElement, boolean][] => [
          ...(all[i - 1]?.op !== r.op ? [[li(ink$('p', heading[r.op], 'group')), false] as [HTMLElement, boolean]] : []),
          [editRow(i + 1, partName(r.name), opName[r.op], changed(r) ? 'moved' : ''), i + 1 === psel],
        ]),
        ...tail().map((k, i): [HTMLElement, boolean] => {
          const n = P.length + 1 + i;
          const b = ink$('button', names[k], n === psel ? 'on' : '');
          b.onclick = () => {
            if (n === psel) return press('a');
            sfx.tick();
            psel = n;
            leaving = false;
            paint();
          };
          const l = li(b);
          l.className = i ? 'act' : 'act first';
          return [l, n === psel];
        }),
      ]),
    );
  } else if (view === 'play') parts.replaceChildren(...windowed(play.rows()));
  else parts.replaceChildren();
  void showPart();

  const bar = $('bar');
  const keys: [Press | Dir, string][] =
    menu === 4 ? [] : menu ? [['a', S.enter], ['b', S.back]] : view === 'edit' ? editBar() : view === 'play' ? play.bar() : view === 'apparel' ? (photo < 0 ? [['a', S.enter], ['b', S.back]] : [['left', ''], ['right', S.view], ['x', S.order], ['b', S.back]]) : view === 'cases' && gallery ? [['a', S.remix], ['b', S.back], ...(peek ? [] : [['x', S.preview] as [Press, string]])] : view === 'cases' && !list.length ? [['a', S.enter], ['b', S.back]] : bars[view];
  // marks with no word of their own stay on one line with the next, which names them
  const groups: HTMLElement[] = [];
  let group: HTMLElement | null = null;
  keys.forEach(([k, s], i) => {
    const b = document.createElement('button');
    const img = document.createElement('img');
    img.className = 'px';
    img.src = glyph[k];
    img.alt = '';
    b.append(img);
    b.append(ink$('span', s));
    if (!s) b.ariaLabel = `${keys.slice(i).find((x) => x[1])?.[1] ?? ''} ${k}`.trim();
    b.onclick = () => (DIR[k] ? move(...DIR[k]) : press(k as Press));
    group ??= document.createElement('div');
    group.append(b);
    if (s || i === keys.length - 1) {
      groups.push(group);
      group = null;
    }
  });
  bar.replaceChildren(...groups);
  document.body.style.setProperty('--bar', `${bar.offsetHeight}px`);
}

const fade = $('fade');
/** black over everything: snaps on, then lifts over ms */
function lift(ms: number) {
  fade.style.transition = 'none';
  fade.style.opacity = '1';
  void fade.offsetWidth;
  fade.style.transition = `opacity ${ms}ms linear`;
  fade.style.opacity = '0';
}

/** seconds between one icon popping in and the next */
const STAGGER = 0.14;
/** the cases page; its designs pop in one by one after delay seconds */
function openCases(delay: number) {
  view = 'cases';
  menu = 0;
  ring = clamp(ring, 0, Math.max(shown().length - 1, 0));
  turn = ring - page() * RING;
  const now = clock();
  shown().forEach((it, j) => {
    it.pos.copy(ringTarget(it, j).pos);
    it.born = now + delay + (j % RING) * STAGGER;
  });
}

/** the console's memory card select: the icon flips up into the camera, then the page fades in and its icons pop in one by one */
function enterFront() {
  sfx.card();
  busy = true;
  const i = (entered = fronts()[fsel]);
  flip = { i, t0: clock(), dir: 1 };
  document.body.dataset.busy = '';
  setTimeout(() => {
    flip = null;
    for (const it of front) it.opacity = 0;
    if (opens(i) === 'cases') {
      from = 'boot';
      camera.position.copy(camAt());
      fit.pos.copy(openTarget(fit).pos);
      openCases(0.35);
    } else if (opens(i) === 'apparel') {
      view = 'apparel';
      photo = -1;
      camera.position.copy(camAt());
      const now = clock();
      teeItems.forEach((it, j) => {
        it.pos.copy(teeTarget(j).pos);
        it.born = now + 0.35 + j * STAGGER;
      });
    } else if (opens(i) === 'play') {
      view = 'play';
      camera.position.copy(camAt());
      play.enter();
    } else {
      view = 'models';
      camera.position.copy(camAt());
      const now = clock();
      // the rows in view come in one by one; the rest land with the last of them
      let k = 0;
      models.forEach((it, j) => {
        const t = gridTarget(j);
        it.pos.copy(t.pos);
        it.born = now + 0.35 + (t.opacity > 0 ? k++ : k) * STAGGER;
      });
    }
    delete document.body.dataset.busy;
    busy = false;
    lift(500);
    paint();
  }, 350);
}

/** back to the front page: a quick black, then the icon un-flips into place */
function leave() {
  sfx.cancel();
  busy = true;
  fade.style.transition = 'opacity 180ms linear';
  fade.style.opacity = '1';
  setTimeout(() => {
    for (const it of view === 'models' ? models : [...shown(), fit]) it.opacity = 0;
    play.exit();
    view = 'boot';
    camera.position.copy(camAt());
    // back on the icon it came from; a phone whose last design went is off the front page
    fsel = Math.max(fronts().indexOf(entered), 0);
    front.forEach((it, i) => {
      it.pos.copy(frontTarget(i).pos);
      it.opacity = frontTarget(i).opacity;
    });
    flip = { i: fronts()[fsel], t0: clock(), dir: -1 };
    busy = false;
    lift(300);
    paint();
  }, 180);
}

/** Export: the picked design goes on the phone, blows away and downloads */
function print() {
  const i = tpl();
  const t = store.list[i];
  if (!t) return;
  store.worn = i;
  wear(t);
  menu = 4;
  sfx.print();
  printAt = clock();
  const file = `iphone-${card.id}-${designName(t).toLowerCase().replace(/\s+/g, '-')}.stl`;
  caseOf(t).then((g) => exportStl(g, file));
  t.printed = new Date().toISOString();
  saveTemplates(store);
  setTimeout(() => {
    menu = 0;
    printAt = -1;
    paint();
  }, 1800);
}

/** Order: a mail to theme.order naming the design, until a checkout exists */
function mail() {
  const t = store.list[tpl()];
  if (!t) return;
  menu = 0;
  location.href = `mailto:${theme.order}?subject=${encodeURIComponent(`${label(card.id)} ${designName(t)} ${S.case}`)}`;
}

/** Delete: that design only */
function remove() {
  const i = tpl();
  const t = store.list[i];
  if (!t) return;
  store.list.splice(i, 1);
  if (store.worn === i) store.worn = -1;
  else if (store.worn > i) store.worn--;
  dropItem(t);
  saveTemplates(store);
  menu = 0;
  ring = clamp(ring, 0, Math.max(shown().length - 1, 0));
  turn = ring - page() * RING;
}

/** edit opens on a copy of look; A saves it over design at, or as a new design when at is -1 */
function startEdit(look: Look, at: number) {
  back = view === 'detail' ? 'detail' : 'cases';
  draft = copyLook(look);
  editing = at;
  origin = copyLook(look);
  past = [];
  leaving = false;
  orbit.yaw = orbit.tilt = 0;
  psel = 0;
  adding = false;
  moving = null;
  placeGhost();
  menu = 0;
  view = 'edit';
  wear(draft);
}

// the url: the page and what is picked on it, so a reload or a link lands there; a draft or an open menu is not kept.
// Off the front page one extra history entry sits on top, so the browser's back is B: it pops the entry, B runs, and the entry comes back while off the front page
let guarded = false;
let unguarding = false;
function route() {
  if (view === 'models' || view === 'info') return `${view}/${phones[msel].id}`;
  if (view === 'cases') return `${gallery ? 'showcase' : 'cases'}/${ring + 1}`;
  if (view === 'apparel' && photo >= 0 && tees[tsel]) return `apparel/${tees[tsel].id}`;
  return view === 'boot' ? '' : view;
}
function syncUrl() {
  if (unguarding) return;
  const r = route();
  const url = r ? `#${r}` : location.pathname + location.search;
  if (view !== 'boot' && !guarded) {
    history.pushState({ guard: true }, '', url);
    guarded = true;
  } else if (view === 'boot' && guarded) {
    // back on the front page by B: drop the extra entry, its popstate writes the url
    guarded = false;
    unguarding = true;
    history.back();
  } else if (decodeURIComponent(location.hash.slice(1)) !== r) history.replaceState(history.state, '', url);
}
addEventListener('popstate', () => {
  if (!history.state) return location.reload();
  if (unguarding) {
    unguarding = false;
    return syncUrl();
  }
  guarded = false;
  if (!busy && !flip) press('b');
  if (!busy) paint();
});
/** a link's page: in through its front page icon as a press would, then on to the page under it */
function arrive(r: string) {
  const [page, arg = ''] = r.split('/');
  const under = ['models', 'info', 'detail', 'showcase'].includes(page) ? 'models' : page === 'cases' || page === 'edit' ? 'cases' : page === 'play' ? 'play' : page === 'apparel' ? 'apparel' : null;
  if (!under) return;
  // with no designs the phone is off the front page, its cases are reached from the models
  let i = fronts().findIndex((f) => opens(f) === under);
  if (i < 0) i = fronts().findIndex((f) => opens(f) === 'models');
  if (i < 0) return;
  fsel = i;
  const phone = phones.findIndex((p) => p.id === arg);
  if (phone >= 0) msel = phone;
  if (page === 'cases') ring = Math.max(parseInt(arg) - 1, 0) || 0;
  if (page === 'detail' || page === 'showcase' || (under === 'cases' && opens(fronts()[i]) === 'models')) msel = models.indexOf(fit);
  enterFront();
  setTimeout(() => {
    const tee = tees.findIndex((t) => t.id === arg);
    if (page === 'apparel' && tee >= 0) {
      tsel = tee;
      photo = 0;
      return paint();
    }
    if (page === 'info') {
      view = 'info';
      return paint();
    }
    if (view === 'models' && (page === 'detail' || page === 'showcase' || under === 'cases')) press('a');
    if (page === 'showcase' && inspoOpen()) press('y');
  }, 400);
}

/** a key while the command list is open */
function command(k: Press) {
  if (menu === 4) return;
  if (k === 'b') {
    sfx.cancel();
    // back one level, the cursor on the row that opened it
    cmd = menu === 1 ? 0 : opener;
    menu = menu === 1 ? 0 : 1;
    if (view === 'detail' && !menu) {
      view = 'models';
    }
    return paint();
  }
  if (k === 'y') {
    if (!inspoOpen()) return;
    sfx.confirm();
    gallery = true;
    ring = 0;
    openCases(0.1);
    tryOn();
    return paint();
  }
  if (k !== 'a') return;
  if (menu === 3) {
    if (yes) {
      sfx.confirm();
      remove();
      if (view === 'detail') menu = 1;
      cmd = 0;
    } else {
      sfx.cancel();
      menu = 1;
      cmd = opener;
    }
    return paint();
  }
  const r = rows()[cmd];
  if (!r?.[2]) return sfx.cancel();
  sfx.confirm();
  const i = view === 'detail' ? store.worn : tpl();
  const t = store.list[i];
  if (r[0] === 'new') startEdit(starts[0].look, -1);
  else if (r[0] === 'edit') startEdit(t, i);
  else if (r[0] === 'copy') startEdit(t, -1);
  else if (r[0] === 'print' && !theme.order) print();
  else if (r[0] === 'print' || r[0] === 'delete') {
    opener = cmd;
    menu = r[0] === 'print' ? 2 : 3;
    cmd = 0;
    yes = false;
  } else if (r[0] === 'export') print();
  else mail();
  paint();
}

function press(k: Press) {
  if (busy || flip) return;
  if (view === 'play') return play.press(k);
  if (view === 'apparel') {
    if (k === 'b' && photo < 0) return leave();
    if (k === 'b') {
      sfx.cancel();
      photo = -1;
    } else if (k === 'a' && photo < 0 && tees.length) {
      sfx.confirm();
      photo = 0;
    } else if (k === 'x' && photo >= 0) {
      sfx.confirm();
      return void open(theme.order, '_blank', 'noopener');
    } else return;
    return paint();
  }
  if (view === 'boot') {
    if (menu) return command(k);
    if (k === 'a') return enterFront();
    return;
  }
  if (view === 'models') {
    if (k === 'b') return leave();
    if (k === 'x') {
      sfx.confirm();
      view = 'info';
      return paint();
    }
    if (k !== 'a') return;
    if (models[msel] !== fit) return sfx.cancel();
    sfx.confirm();
    view = 'detail';
    menu = 1;
    cmd = 0;
    // detail's rows work on the worn design
    ring = Math.max(edited().indexOf(store.list[store.worn]), 0);
  } else if (view === 'detail') return command(k);
  else if (view === 'cases') {
    if (menu) return command(k);
    if (gallery) {
      if (k === 'a') {
        sfx.confirm();
        peek = false;
        startEdit(creations[ring].look, -1);
      } else if (k === 'x' || (k === 'b' && peek)) {
        sfx[peek ? 'cancel' : 'confirm']();
        peek = !peek;
      } else if (k === 'b') {
        sfx.cancel();
        gallery = false;
        wear(store.list[store.worn]);
        ring = Math.max(edited().indexOf(store.list[store.worn]), 0);
        view = 'detail';
        menu = 1;
        cmd = 0;
      } else return sfx.cancel();
      return paint();
    }
    if (k === 'b') {
      if (from === 'boot') return leave();
      sfx.cancel();
      view = 'models';
    } else if (k === 'x') {
      if (!shown().length) return sfx.cancel();
      sfx.confirm();
      menu = 1;
      cmd = 0;
    } else if (k === 'a') {
      // A puts the picked design on the phone; on the bare phone it opens the model's detail, where New is
      const i = tpl();
      sfx.confirm();
      store.worn = i;
      saveTemplates(store);
      wear(store.list[i]);
      if (i < 0) {
        view = 'detail';
        menu = 1;
        cmd = 0;
      }
    }
  } else if (view === 'edit') {
    if (!draft) return;
    // B on a changed draft asks first: B again drops it, anything else keeps editing
    if (leaving) {
      leaving = false;
      if (k !== 'b') {
        sfx.tick();
        return paint();
      }
    } else if (k === 'b' && !adding && !moving && origin && !sameLook(draft, origin)) {
      sfx.cancel();
      leaving = true;
      return paint();
    }
    // the add list: A opens the picked group, then adds the picked part on its parts.json op; B goes back a level, then shuts the list
    if (adding) {
      const groups = addGroups();
      if (agroup === null) {
        if (k === 'a' && groups[asel]) {
          sfx.confirm();
          agroup = groups[asel];
          asel = 0;
        } else if (k === 'b') {
          sfx.cancel();
          adding = false;
        } else return;
        return paint();
      }
      const r = addRows()[asel];
      if (k === 'a' && r) {
        sfx.confirm();
        setOp(r.name, r.def, addOp(r));
        psel = partRows().findIndex((x) => x.name === r.name) + 1;
      } else if (k === 'b') {
        sfx.cancel();
        // a lone group opened straight away; there is no group list to go back to
        if (groups.length > 1) {
          asel = Math.max(groups.indexOf(agroup), 0);
          agroup = null;
          return paint();
        }
      } else return;
      adding = false;
      return paint();
    }
    // moving: A places the part and solves, Y swaps grid and free, B puts it back, X sends it home
    if (moving) {
      const m = moving;
      if (k === 'a') {
        sfx.confirm();
        moving = null;
        if (m.at.some((v, i) => v !== m.from[i])) {
          mark();
          setMove(m.name, m.at);
          wear(draft);
        }
      } else if (k === 'y') {
        sfx.tick();
        m.snap = !m.snap;
        if (m.snap) shift(m.at);
      } else if (k === 'b') {
        sfx.cancel();
        moving = null;
      } else if (k === 'x') {
        sfx.tick();
        side = !side;
        grid();
      } else if (k === 'l' || k === 'r') {
        if (side) return sfx.cancel();
        if (!turnBy(k === 'l' ? 1 : -1)) return sfx.cancel();
        sfx.tick();
      }
      placeGhost();
      return paint();
    }
    // Y opens the add list from any row
    if (k === 'y') {
      if (!addable().length) return sfx.cancel();
      sfx.confirm();
      adding = true;
      asel = 0;
      agroup = addGroups().length > 1 ? null : addGroups()[0];
      return paint();
    }
    // X takes the picked part off
    if (k === 'x') {
      const r = partRows()[psel - 1];
      if (!r) return sfx.cancel();
      sfx.cancel();
      setOp(r.name, r.def, 'off');
      psel = Math.min(psel, partRows().length);
      return paint();
    }
    // A works the picked row: a part moves, Add part opens the list, Undo steps back, Save saves; the start row steps the creations
    if (k === 'a') {
      const kind = rowKind();
      if (kind === 'start') {
        const next = creations[(creations.findIndex((c) => sameLook(c.look, draft!)) + 1) % creations.length];
        if (!next || sameLook(next.look, draft)) return sfx.cancel();
        sfx.confirm();
        mark();
        draft = copyLook(next.look);
        wear(draft);
        return paint();
      }
      if (kind === 'add') return press('y');
      if (kind === 'part') {
        sfx.confirm();
        return void startMove(partRows()[psel - 1].name);
      }
      if (kind === 'undo') {
        if (undo()) sfx.tick();
        else sfx.cancel();
        return paint();
      }
      sfx.confirm();
      const old = store.list[editing];
      const t: Template = { ...old, style: draft.style, ops: draft.ops, moves: draft.moves, edited: new Date().toISOString() };
      if (old && !sameLook(old, t)) delete t.printed;
      if (old) {
        dropItem(old);
        store.list[editing] = t;
      } else store.list.push(t);
      store.worn = store.list.indexOf(t);
      // a remix saved from the showcase page lands on the user's own cases
      gallery = false;
      ring = edited().indexOf(t);
    } else if (k === 'b') {
      sfx.cancel();
      wear(store.list[store.worn]);
    } else return;
    draft = null;
    moving = null;
    placeGhost();
    saveTemplates(store);
    view = back;
    if (view === 'cases') tryOn();
    if (back === 'detail') {
      menu = 1;
      cmd = 0;
    }
  } else if (view === 'info') {
    if (k !== 'b') return;
    sfx.cancel();
    view = 'models';
  }
  paint();
}

function move(dx: number, dy: number) {
  if (busy || flip) return;
  if (view === 'play') return play.move(dx, dy);
  if (view === 'apparel') {
    if (!dx || !tees.length) return;
    if (photo < 0) {
      const n = clamp(tsel + dx, 0, tees.length - 1);
      if (n === tsel) return;
      tsel = n;
    } else {
      const n = tees[tsel].images.length;
      photo = (photo + dx + n) % n;
    }
  } else if (view === 'boot' && !menu) {
    const n = clamp(fsel + dx, 0, fronts().length - 1);
    if (n === fsel) return;
    fsel = n;
  } else if (view === 'models') {
    const n = msel + dx;
    if (!dx || n < 0 || n >= models.length) return;
    msel = n;
  } else if (view === 'edit') {
    // ↑/↓ pick a row; ← → on the start row change the start, on a part step its op; in Y's list ↑/↓ pick a part
    // moving, the arrows step the part one grid line, or a fine step when free, the way they point on screen
    if (!draft) return;
    leaving = false;
    const parts = partRows();
    if (moving) {
      const v = toCase(dx, dy);
      const big = Math.max(...v.map(Math.abs));
      const step = moving.snap ? GRID : FINE;
      const d = v.map((t) => (Math.abs(t) > big / 2 ? Math.sign(t) * step : 0));
      const a = moving.at;
      if (!shift([a[0] + d[0], a[1] + d[1], a[2], (a[3] ?? 0) + d[2]])) return sfx.cancel();
    } else if (adding) {
      const n = clamp(asel + dy, 0, (agroup === null ? addGroups() : addRows()).length - 1);
      if (!dy || n === asel) return;
      asel = n;
    } else if (dy) {
      const n = clamp(psel + dy, 0, rowCount() - 1);
      if (n === psel) return;
      psel = n;
    } else if (!psel) {
      if (starts.length < 2) return;
      mark();
      // a changed draft or a creation steps from the first start
      const at = Math.max(starts.findIndex((s) => sameLook(s.look, draft!)), 0);
      draft = copyLook(starts[(at + dx + starts.length) % starts.length].look);
      wear(draft);
    } else {
      const r = parts[psel - 1];
      if (!r) return;
      setOp(r.name, r.def, STEPS[(STEPS.indexOf(r.op) + dx + STEPS.length) % STEPS.length]);
      // the row changes group; the pick goes with it
      psel = partRows().findIndex((x) => x.name === r.name) + 1;
    }
  } else if (view === 'info' || menu === 4) return;
  else if (menu === 3) yes = !yes;
  else if (menu) {
    // up and down step over the rows that cannot be picked
    const r = rows();
    if (!dy) return;
    let n = cmd;
    do n = (n + dy + r.length) % r.length;
    while (!r[n][2] && n !== cmd);
    if (n === cmd) return;
    cmd = n;
  } else {
    // ←/→ turn the ring, ↑/↓ change its page
    const n = shown().length;
    const p = page();
    const m = Math.min(RING, n - p * RING);
    if (!n) return;
    if (dx) {
      const r = p * RING + ((ring - p * RING + dx + m) % m);
      if (r === ring) return;
      ring = r;
    } else {
      const q = clamp(p + dy, 0, Math.ceil(n / RING) - 1);
      if (q === p) return;
      ring = q * RING;
      openCases(0);
    }
    tryOn();
  }
  sfx.tick();
  paint();
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  const map: Record<string, () => void> = {
    arrowleft: () => move(-1, 0),
    arrowright: () => move(1, 0),
    arrowup: () => move(0, -1),
    arrowdown: () => move(0, 1),
    enter: () => press('a'),
    a: () => press('a'),
    ' ': () => press('a'),
    escape: () => press('b'),
    backspace: () => press('b'),
    b: () => press('b'),
    x: () => press('x'),
    y: () => press('y'),
    l: () => press('l'),
    r: () => press('r'),
    m: sfx.toggleMute,
    '-': resetMove,
    z: () => {
      if (view !== 'edit' || !draft || moving || adding || !undo()) return sfx.cancel();
      sfx.tick();
      paint();
    },
  };
  // the browser's own chords stay the browser's; naming in the playground takes the keys it types; a held key repeats only where a step should
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // a button reached with Tab takes its own Enter and Space
  if ((k === 'enter' || k === ' ') && e.target instanceof HTMLButtonElement && e.target.matches(':focus-visible')) return;
  if (view === 'play' && !busy && play.type(e.key)) return e.preventDefault();
  // shift with ↑ ↓ is ZR and ZL: the playground's up and down
  if (e.shiftKey && (k === 'arrowup' || k === 'arrowdown')) {
    e.preventDefault();
    return press(k === 'arrowup' ? 'zr' : 'zl');
  }
  if (e.repeat && !k.startsWith('arrow') && k !== 'l' && k !== 'r') return;
  if (map[k]) {
    e.preventDefault();
    map[k]();
  }
});
// a controller works the page as the keys do: the standard mapping's face buttons, shoulders and triggers press, the d-pad and the left stick move,
// the right stick turns the playground's bed. A held direction, shoulder or trigger repeats after HOLD, then every AGAIN; held is each one's next repeat time
const PAD: Press[] = ['a', 'b', 'x', 'y', 'l', 'r', 'zl', 'zr'];
const DIR: Record<string, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const REPEAT = new Set(['l', 'r', 'zl', 'zr']);
const HOLD = 0.4, AGAIN = 0.08, STICK = 0.5, DEAD = 0.2;
const held = new Map<string, number>();
/**
 * the button index of A, B, X, Y. The standard mapping is by position: a Nintendo pad's bottom button is B and its left is Y,
 * so its pairs swap; only Nintendo's own pads, a third-party one naming the Switch can already report by label.
 * A pad without the standard mapping sends its raw order; generic pads number the faces Y B A X, case.pad ("2,1,3,0") overrides.
 * Steam Input presents every pad as a standard one.
 */
function face(p: Gamepad): number[] {
  if (p.mapping === 'standard') return /nintendo|joy-?con|pro controller|057e/i.test(p.id) ? [1, 0, 3, 2] : [0, 1, 2, 3];
  const own = localStorage.getItem('case.pad')?.split(',').map(Number);
  return own?.length === 4 && own.every((n) => n >= 0) ? own : [2, 1, 3, 0];
}
/** a raw pad's d-pad as one hat axis: -1 up, stepping 2/7 clockwise round to 1 up-left, anything past 1 at rest; left right up down */
function hat(v: number | undefined): [boolean, boolean, boolean, boolean] {
  if (v === undefined || v > 1.1 || v < -1.1) return [false, false, false, false];
  const step = Math.round((v + 1) * 3.5) % 8; // 0 up, 1 up-right ... 7 up-left
  return [step >= 5 && step <= 7, step >= 1 && step <= 3, step === 7 || step <= 1, step >= 3 && step <= 5];
}
function pad(now: number, dt: number) {
  const p = navigator.getGamepads?.().find((g) => g?.connected);
  if (!p) return;
  const b = (i: number) => !!p.buttons[i]?.pressed;
  const [x = 0, y = 0, rx = 0, ry = 0] = p.axes;
  if (view === 'play' && Math.hypot(rx, ry) > DEAD) play.drag(rx * dt * 300, ry * dt * 300);
  const standard = p.mapping === 'standard';
  const [hl, hr, hu, hd] = standard ? [false, false, false, false] : hat(p.axes[9]);
  const on: Record<string, boolean> = { left: b(14) || hl || x < -STICK, right: b(15) || hr || x > STICK, up: b(12) || hu || y < -STICK, down: b(13) || hd || y > STICK };
  PAD.forEach((k, i) => (on[k] = b(i < 4 ? face(p)[i] : i)));
  for (const k in on) {
    const next = held.get(k);
    if (!on[k]) held.delete(k);
    else if (next === undefined || ((k in DIR || REPEAT.has(k)) && now >= next)) {
      held.set(k, now + (next === undefined ? HOLD : AGAIN));
      if (k in DIR) move(...DIR[k]);
      else press(k as Press);
    }
  }
}

// a changed draft is lost with the tab, so closing it asks
addEventListener('beforeunload', (e) => {
  if (view === 'edit' && draft && origin && !sameLook(draft, origin)) e.preventDefault();
});

// audio may only start inside a gesture
addEventListener('pointerdown', sfx.unlock, { capture: true, once: true });
addEventListener('keydown', sfx.unlock, { capture: true, once: true });

// touch: tap picks, a second tap on the picked icon is A; vertical drag scrolls the grid,
// on the cases and detail pages a touch holds the phone and a drag turns and tips it, let go mid-swipe and it flings on
const ray = new THREE.Raycaster();
const canvas = $('view');
/** radians per pixel dragged across the open phone */
const TURN = 0.012;
let down: { x: number; y: number; last: number; lastY: number; t: number; v: number; from?: Move } | null = null;
// two fingers on the playground pinch its bed's zoom
const touches = new Map<number, [number, number]>();
const spread = () => {
  const [a, b] = [...touches.values()];
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
};
canvas.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, [e.clientX, e.clientY]);
  down = { x: e.clientX, y: e.clientY, last: e.clientX, lastY: e.clientY, t: e.timeStamp, v: 0 };
  if ((view === 'cases' || view === 'detail') && menu < 2) {
    grab = true;
    fling = 0;
  }
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!down) return;
  if (moving && view === 'edit') {
    // a drag carries the ghost from where the touch found it
    const [x, y, z] = toCase(e.clientX - down.x, e.clientY - down.y);
    const f = (down.from ??= [...moving.at]);
    shift([f[0] + x, f[1] + y, moving.at[2], (f[3] ?? 0) + z]);
    paint();
  } else if (view === 'play' && touches.size === 2 && touches.has(e.pointerId)) {
    const was = spread();
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (was > 0) play.zoomBy(spread() / was);
  } else if (view === 'play') {
    // the drag acts where it started: over the shelf it scrolls, over the bed it turns
    play.drag(e.clientX - down.last, e.clientY - down.lastY, down.x / innerWidth, down.y / innerHeight);
    down.last = e.clientX;
    down.lastY = e.clientY;
  } else if (view === 'models' || (view === 'apparel' && photo < 0)) {
    // the row follows the finger, never past its ends
    const [sel, n, step] = view === 'models' ? [msel, models.length, STEP()] : [tsel, tees.length, portrait() ? 0.55 : 0.3];
    drag = clamp((e.clientX - down.x) / (step * innerWidth), sel - n + 1, sel);
  } else if (view === 'edit') {
    orbit.yaw = clamp(orbit.yaw + (e.clientX - down.last) * TURN, -3, 3);
    orbit.tilt = clamp(orbit.tilt + (e.clientY - down.lastY) * TURN, -0.7, 0.7);
    down.last = e.clientX;
    down.lastY = e.clientY;
  } else if (grab) {
    const dx = (e.clientX - down.last) * TURN;
    fit.spin += dx;
    fit.tilt = clamp(fit.tilt + (e.clientY - down.lastY) * TURN, -0.7, 0.7);
    down.v = dx / Math.max((e.timeStamp - down.t) / 1000, 1e-3);
    down.last = e.clientX;
    down.lastY = e.clientY;
    down.t = e.timeStamp;
  }
});
const untouch = (e: PointerEvent) => touches.delete(e.pointerId);
canvas.addEventListener('pointerup', untouch);
canvas.addEventListener('pointercancel', untouch);
canvas.addEventListener(
  'wheel',
  (e) => {
    if (view !== 'play') return;
    e.preventDefault();
    play.wheel(e.deltaY + e.deltaX, e.clientX / innerWidth, e.clientY / innerHeight);
  },
  { passive: false },
);
canvas.addEventListener('pointercancel', () => {
  down = null;
  drag = 0;
  grab = false;
});
canvas.addEventListener('pointerup', (e) => {
  const d = down;
  down = null;
  if (!d) return;
  if (grab) {
    grab = false;
    // a swipe still moving at release carries on, a held stop does not
    if (e.timeStamp - d.t < 80) fling = clamp(d.v - idle(), -30, 30);
  }
  const dx = e.clientX - d.x;
  if (drag) {
    // a swipe lands on the nearest phone, a quick flick at least one along
    const tee = view === 'apparel';
    const sel = tee ? tsel : msel;
    const n = clamp(Math.round(sel - drag - (e.timeStamp - d.t < 250 ? Math.sign(drag) * 0.4 : 0)), 0, (tee ? tees.length : models.length) - 1);
    drag = 0;
    if (n !== sel) {
      if (tee) tsel = n;
      else msel = n;
      sfx.tick();
      paint();
    }
    return;
  }
  if (Math.hypot(dx, e.clientY - d.y) > 8) return;
  if (view === 'play') return play.tap((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const list = view === 'boot' ? fronts().map((i) => front[i]) : view === 'models' ? models : view === 'apparel' && photo < 0 ? teeItems : view === 'cases' && !menu ? shown() : [];
  if (!list.length) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects(list.filter((it) => it.holder.visible).map((it) => it.holder), true)[0];
  if (!hit) return;
  let o: THREE.Object3D = hit.object;
  while (o.parent && o.parent !== scene) o = o.parent;
  const i = list.findIndex((it) => it.holder === o);
  if (i < 0) return;
  const cur = view === 'boot' ? fsel : view === 'models' ? msel : view === 'apparel' ? tsel : ring;
  if (i === cur) return press('a');
  if (view === 'boot') fsel = i;
  else if (view === 'apparel') tsel = i;
  else if (view === 'cases') {
    ring = i;
    tryOn();
  }
  else {
    msel = i;
  }
  sfx.tick();
  paint();
});

if (import.meta.env.DEV)
  picker(
    () => (menu ? `${view} menu ${menu}` : view),
    (x, y) => {
      const named: [Item, string][] = [
        ...models.map((it, i): [Item, string] => [it, `model ${phones[i].id}`]),
        ...front.map((it, i): [Item, string] => [it, `front ${theme.front[i].icon}`]),
        ...[...items].map(([t, it]): [Item, string] => [it, `case ${designName(t)}`]),
      ].filter(([it]) => it.holder.visible && it.opacity > 0.05);
      ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
      const hit = ray.intersectObjects(named.map(([it]) => it.holder), true)[0];
      let o = hit?.object;
      while (o?.parent && o.parent !== scene) o = o.parent;
      const n = named.find(([it]) => it.holder === o);
      return n ? { name: `${n[1]} (3D)`, rect: screenRect(n[0].holder, camera) } : null;
    },
  );

addEventListener('resize', layout);
msel = models.indexOf(fit);
layout();
models.forEach((it, i) => it.pos.copy(gone(i).pos));
front.forEach((it, i) => {
  const t = frontTarget(i);
  it.pos.copy(t.pos);
  it.scale = t.scale;
});
camera.position.copy(camAt());
paint();
arrive(start);
