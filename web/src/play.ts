// the playground: a print bed and blocks melted into one part, worked like a game; main.ts hands it the keys, the frame and the hud while view is 'play'
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import theme from './theme';
import { dropImport, exportStl, FEATURED, featuredPiece, featuredSolid, IMPORT, keepImport, loadMy, MY, partSolid, pieceMatrix, saveMy, type Piece, type Shape } from './cases';
import * as sfx from './sound';
import { fromHour } from './sky';

export type Key = 'a' | 'b' | 'y' | 'x' | 'l' | 'r' | 'zl' | 'zr';
/** the d-pad, drawn in the bar where it steps the held piece */
export type Dir = 'left' | 'right' | 'up' | 'down';
type Deps = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  paint: () => void;
  leave: () => void;
  ink: (tag: string, s: string, cls?: string) => HTMLElement;
  /** pins the field and lights to an hour; null hands them back to the clock */
  hour: (h: number | null) => void;
};

const S = theme.strings;
const C = theme.colors;
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
/** reduced motion: the shelf's parts jump into place, no pop, sway or spin */
const still = matchMedia('(prefers-reduced-motion: reduce)');
const MM = 0.01; // main.ts's scene unit is 100 mm
const DIST = 7; // the bed's distance from the camera
// mm, solder's build volume: printer.cfg stepper_x and stepper_y position_max 235, stepper_z 200
const BED = 235;
const HEIGHT = 200;
const GRID = 1; // mm one move or size step
const SNAP = 2; // mm a moving piece's middle jumps onto another's, or the bed's
const ANGLE = 15; // degrees one turn
const BLEND = 0.5; // mm one blend step
const TOOLS = ['move', 'turn', 'size', 'blend'] as const;
const SHAPES: Shape[] = ['box', 'cylinder', 'sphere', 'cone', 'torus'];
const SIZES: Record<Shape, number[]> = { box: [20, 20, 20], cylinder: [20, 20, 30], sphere: [24, 24, 24], cone: [24, 24, 30], torus: [36, 36, 12] };
// the keyboard naming uses; the last row's words are keys of their own
const KEYS = ['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ0123', '456789-'].map((r) => [...r]);
KEYS[3].push(S.space, S.del, S.ok);
const NAME = 24; // characters a name may have

/** cells live, and on save and export: about 1 mm, then 0.2 to 0.3 mm as the part grows */
const liveEdge = (n: number) => Math.max(1, n / 100);
const fineEdge = (n: number) => clamp(n / 350, 0.2, 0.3);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'part';

// the unit shapes the worker's field draws, filling [-1, 1]; three's cylinder and cone stand on y, turned onto z
const UNIT: Record<Shape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(2, 2, 2),
  sphere: new THREE.SphereGeometry(1, 32, 16),
  cylinder: new THREE.CylinderGeometry(1, 1, 2, 40).rotateX(Math.PI / 2),
  cone: new THREE.ConeGeometry(1, 2, 40).rotateX(Math.PI / 2),
  torus: new THREE.TorusGeometry(0.7, 0.3, 16, 48).scale(1, 1, 1 / 0.3),
};
for (const g of Object.values(UNIT)) g.computeBoundingBox();
/** an stl piece's mesh, centred as it was kept */
const stlGeos = new Map<string, Promise<THREE.BufferGeometry>>();
function stlGeo(ref: string) {
  if (!stlGeos.has(ref))
    stlGeos.set(
      ref,
      partSolid('', ref).then(({ pos, idx }) => {
        const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)).setIndex(new THREE.BufferAttribute(idx, 1));
        g.computeVertexNormals();
        g.computeBoundingBox();
        return g;
      }),
    );
  return stlGeos.get(ref)!;
}

type Bench = { name: string; pieces: Piece[] };
const BENCH = 'case.bench';
const copy = (p: Piece): Piece => ({ ...p, pos: [...p.pos], rot: [...p.rot], size: [...p.size] });
function loadBench(): Bench {
  try {
    const b = JSON.parse(localStorage.getItem(BENCH) ?? 'null');
    if (b && Array.isArray(b.pieces)) return b;
  } catch {
    // unreadable storage starts an empty bench
  }
  return { name: '', pieces: [] };
}

type Mesh = { pos: Float32Array<ArrayBuffer>; idx: Uint32Array<ArrayBuffer> };
type Job = { pieces: Piece[]; edge: number; live: boolean; ok: (m: Mesh) => void; no: (e: Error) => void };

export function playground(d: Deps) {
  let bench = loadBench();
  const save = () => localStorage.setItem(BENCH, JSON.stringify(bench));
  let mode: 'browse' | 'palette' | 'held' | 'name' | 'shelf' | 'light' = 'browse';
  let hour = 9; // light: the hour pinned on the field
  let sel = 0; // browse: the pieces, then the actions
  let row = 0; // palette and shelf
  let deep = false; // the palette's Featured list is open
  /** the palette's rows: the shapes, Featured, which opens the featured parts, and Import STL; with Featured open, its parts */
  const palRows = (): ({ shape: Shape } | { f: (typeof FEATURED)[number] } | 'featured' | 'import')[] =>
    deep ? FEATURED.map((f) => ({ f })) : [...SHAPES.map((shape) => ({ shape })), 'featured', 'import'];
  let key = [0, 0]; // name: the keyboard's column and row
  let typed = '';
  let oops = false; // the last import was no closed solid; the title says so until the next key
  /** the piece in hand: its index, how it was, the tool, mm it floats over what is under it, and the middle it last snapped to */
  let held: { i: number; from: Piece | null; tool: number; lift: number; snapped: string } | null = null;
  const aim = { yaw: -0.6, tilt: 0.65 }; // where a drag or the right stick turns the bed; orbit eases to it
  const orbit = { ...aim };
  let shown = false;
  let squashAt = -1;
  let popAt = -1;
  let now = 0;

  // the bed: a dark plate with a 10 mm grid from its middle, the build volume's outline, the solved part on it, and a ghost per piece; all on layer 1, the full-resolution renderer
  const pivot = new THREE.Group();
  const world = new THREE.Group();
  world.rotation.x = -Math.PI / 2;
  world.scale.setScalar(MM);
  // the view turns about the volume's middle, not the bed's
  world.position.y = (-HEIGHT / 2) * MM;
  pivot.add(world);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(BED, BED), new THREE.MeshStandardMaterial({ color: theme.finish.body, roughness: 0.8 }));
  plate.position.z = -0.05;
  const lines: number[] = [];
  for (let t = -Math.floor(BED / 20) * 10; t <= BED / 2; t += 10) lines.push(t, -BED / 2, 0, t, BED / 2, 0, -BED / 2, t, 0, BED / 2, t, 0);
  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)),
    new THREE.LineBasicMaterial({ color: C.dim, transparent: true, opacity: 0.6 }),
  );
  const volume = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(BED, BED, HEIGHT)), grid.material);
  volume.position.z = HEIGHT / 2;
  const body = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: theme.case.color, roughness: 0.45 }));
  world.add(plate, grid, volume, body);
  const ghosts: THREE.Mesh[] = [];
  const ghostMat = () =>
    new THREE.MeshStandardMaterial({ color: C.pick, emissive: C.pick, emissiveIntensity: 0.35, roughness: 0.6, transparent: true, opacity: 0.4, depthWrite: false });
  // light: a dome over the bed drawn in lines, the light's path across it and the sun or moon on it, a ray to the bed's middle
  const ORB = 200;
  const TIP = THREE.MathUtils.degToRad(20); // the path leans back from upright
  const ring = (f: (t: number) => [number, number, number], n = 64, half = false) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) pts.push(new THREE.Vector3(...f(((half ? 1 : 2) * Math.PI * i) / n)));
    return new THREE.BufferGeometry().setFromPoints(pts);
  };
  const along = (t: number): [number, number, number] => [-ORB * Math.cos(t), ORB * Math.sin(t) * Math.sin(TIP), ORB * Math.sin(t) * Math.cos(TIP)];
  const domeMat = new THREE.LineBasicMaterial({ color: C.dim, transparent: true, opacity: 0.5 });
  const orb = new THREE.Group();
  orb.add(
    new THREE.Line(ring((t) => [ORB * Math.cos(t), ORB * Math.sin(t), 0]), domeMat),
    new THREE.Line(ring((t) => [ORB * Math.cos(t), 0, ORB * Math.sin(t)], 32, true), domeMat),
    new THREE.Line(ring((t) => [0, ORB * Math.cos(t), ORB * Math.sin(t)], 32, true), domeMat),
    ...[30, 60].map((a) => {
      const r = ORB * Math.cos(THREE.MathUtils.degToRad(a)), z = ORB * Math.sin(THREE.MathUtils.degToRad(a));
      return new THREE.Line(ring((t) => [r * Math.cos(t), r * Math.sin(t), z]), domeMat);
    }),
    new THREE.Line(ring(along, 48, true), new THREE.LineBasicMaterial({ color: C.pick })),
  );
  const orbLight = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffd27a' }));
  const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: C.pick, transparent: true, opacity: 0.6 }));
  orb.add(orbLight, beam);
  orb.visible = false;
  world.add(orb);
  const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${Math.round((h % 1) * 60) === 30 ? '30' : '00'}`;
  pivot.traverse((o) => o.layers.set(1));
  pivot.visible = false;
  d.scene.add(pivot);

  // Shapes and Shelf: the picked row's part stands large and turning in the bed's place, sliding in from the list's side on each move, as the console's save browser brings an icon forward
  const show = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: theme.case.color, roughness: 0.45, transparent: true }));
  show.layers.set(1);
  const tip = new THREE.Group().add(show);
  tip.rotation.x = -Math.PI / 2; // parts are z-up
  const stand = new THREE.Group().add(tip);
  stand.visible = false;
  d.scene.add(stand);
  let showing = '';
  let showAt = 0;
  /** the picked row's part: an id, how to get its mesh, and a shape's size as it lands on the bed */
  function picked(): [string, () => Promise<THREE.BufferGeometry>, number[]?] | null {
    if (mode === 'palette') {
      const r = palRows()[row];
      if (typeof r !== 'object') return null;
      if ('shape' in r) return [r.shape, async () => UNIT[r.shape], SIZES[r.shape].map((v) => v / 2)];
      const f = r.f;
      return [f.slug, () => featuredSolid(f.slug).then(() => stlGeo(IMPORT + f.slug))];
    }
    return null;
  }

  // Shelf: the saved parts as a memory card's game data, small turning icons in rows that pop in one by one; the picked one rocks over a glow
  // and names itself in the title; A brings it forward large and turning beside its Open and Delete, Delete asks first
  type Icon = { key: string; holder: THREE.Group; mesh: THREE.Mesh; big: number; tall: number; born: number };
  // every icon one pose: leaning back LEAN to show its depth, turned YAW to show its side
  const LEAN = 0.35;
  const YAW = 0.3;
  let icons: Icon[] = [];
  let card = 0; // shelf: 0 the icons, 1 the picked part's actions, 2 its delete asked
  let act = 0; // card 1: Open, Delete
  let yes = false; // card 2
  let cols = 3; // icons across the shelf's run
  let scroll = 0; // the shelf's first line in view, eased to aimScroll
  let aimScroll = 0;
  let inView = 3; // lines of icons in view
  let cellPx = 100; // one icon line, in screen pixels
  let tall = false; // portrait: the shelf runs sideways under the bed, else down beside it
  let zoom = 1; // the bed's size: ZL ZR, the wheel or a pinch
  const zoomBy = (f: number) => (zoom = clamp(zoom * f, 0.5, 2.5));
  /** icon i's line along the shelf's run, and its place across it */
  const lineOf = (i: number) => Math.floor(i / cols);
  /** scroll just enough to keep the picked icon's line in view */
  const follow = () => (aimScroll = clamp(clamp(aimScroll, lineOf(row) - inView + 1, lineOf(row)), 0, Math.max(lineOf(icons.length - 1) - inView + 1, 0)));
  /** is a screen point, in fractions 0 to 1, over the shelf rather than the bed */
  const onShelf = (x: number, y: number) => mode === 'shelf' && !card && (tall ? y > 0.56 : x > 0.5);
  /** the wheel or a drag over the shelf scrolls it, by pixels along its run */
  const roll = (px: number) => (aimScroll = clamp(aimScroll + px / cellPx, 0, Math.max(lineOf(icons.length - 1) - inView + 1, 0)));
  const shelfRoot = new THREE.Group();
  shelfRoot.visible = false;
  d.scene.add(shelfRoot);
  /** an additive white radial sprite, alpha at its centre and at 0.3 of its radius */
  const glowSprite = (core: number, mid: number) =>
    new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: (() => {
          const c = document.createElement('canvas');
          c.width = c.height = 64;
          const g = c.getContext('2d')!;
          const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
          r.addColorStop(0, `rgba(255,255,255,${core})`);
          r.addColorStop(0.3, `rgba(255,255,255,${mid})`);
          r.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = r;
          g.fillRect(0, 0, 64, 64);
          return new THREE.CanvasTexture(c);
        })(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
  // the picked part: a white dot in front of its lower part, and an underglow behind it that the part and its neighbours cover
  const halo = glowSprite(0.6, 0.25);
  halo.renderOrder = 1; // after the icons, depth-tested
  const dot = glowSprite(1, 0.35);
  for (const s of [halo, dot]) s.layers.set(1), shelfRoot.add(s);
  /** builds the icons from the saved parts, row and card back on the first */
  function fillShelf() {
    for (const it of icons) shelfRoot.remove(it.holder);
    icons = shelf().map(([key], i) => {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: theme.case.color, roughness: 0.45, transparent: true, opacity: 0 }));
      mesh.layers.set(1);
      const orient = new THREE.Group().add(mesh);
      const tip = new THREE.Group().add(orient);
      tip.rotation.x = -LEAN;
      const holder = new THREE.Group().add(tip);
      holder.visible = false;
      shelfRoot.add(holder);
      const it: Icon = { key, holder, mesh, big: 0, tall: 0, born: now + 0.2 + i * 0.08 };
      stlGeo(key).then(
        (g) => {
          mesh.geometry = g;
          mesh.position.copy(g.boundingBox!.getCenter(new THREE.Vector3()).negate());
          const dims = g.boundingBox!.getSize(new THREE.Vector3()).toArray();
          it.big = Math.max(...dims);
          {
            // laid flat: thinnest side toward the viewer, longest across, whatever way up the file was saved
            const by = [0, 1, 2].sort((a, b) => dims[b] - dims[a]); // longest, middle, thinnest
            const cols = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
            cols[by[0]].set(1, 0, 0);
            cols[by[1]].set(0, 1, 0);
            cols[by[2]].set(0, 0, 1);
            const m = new THREE.Matrix4().makeBasis(cols[0], cols[1], cols[2]);
            if (m.determinant() < 0) cols[by[2]].set(0, 0, -1), m.makeBasis(cols[0], cols[1], cols[2]);
            orient.setRotationFromMatrix(m);
            // drawn height once leaned back, before scale: the baseline and the dot measure from it
            it.tall = dims[by[1]] * Math.cos(LEAN) + dims[by[2]] * Math.sin(LEAN);
          }
          holder.visible = true;
        },
        () => {},
      );
      return it;
    });
    row = clamp(row, 0, Math.max(icons.length - 1, 0));
    card = 0;
    follow();
  }
  const SPREAD = 0.5;
  const biggest = () => Math.max(1e-6, ...icons.map((it) => it.big));
  function shelfFrame(t: number, dt: number, h: number, pt: boolean) {
    shelfRoot.visible = mode === 'shelf';
    if (!shelfRoot.visible) return;
    const w = h * d.camera.aspect;
    // icon size and spacing measured off the console's browser (Reference/screens/ps2), in view heights: 0.2 apart, an icon 0.19 at its largest side.
    // Landscape: 3 across in the right half, mirroring the bed, running down, 3 lines in view. Portrait: 2 rows under the bed, running sideways
    tall = pt;
    cols = pt ? 2 : 3;
    const cell = pt ? Math.min(0.2 * h, w / 3.3) : Math.min(0.25 * h, (0.46 * w) / 3);
    inView = pt ? Math.max(Math.floor(w / cell), 1) : 3;
    cellPx = (cell / h) * innerHeight;
    const icon = 0.95 * cell;
    const k = still.matches ? 1 : 1 - Math.exp(-8 * dt);
    aimScroll = clamp(aimScroll, 0, Math.max(lineOf(icons.length - 1) - inView + 1, 0));
    scroll += (aimScroll - scroll) * k;
    icons.forEach((it, i) => {
      if (!it.big) return; // not loaded yet
      const on = i === row;
      const v = lineOf(i) - scroll;
      const across = i % cols;
      const fore = card > 0 && on;
      const spot = pt
        ? new THREE.Vector3((v - (inView - 1) / 2) * cell, -0.12 * h - across * cell * 1.05, -DIST)
        : new THREE.Vector3(0.25 * w + (across - (cols - 1) / 2) * cell * 1.1, 0.24 * h - v * cell * 1.05, -DIST);
      // the pop: overshoots, then settles, as the cards page's icons do
      const p = clamp((t - it.born) / 0.3, 0, 1);
      const grow = still.matches ? p && 1 : p && 1 + 2.7 * (p - 1) ** 3 + 1.7 * (p - 1) ** 2;
      // opened, it stands 0.3 view heights in the bed's place and the rest fade, or they would sit under the text
      // parts keep their order of size against the shelf's biggest, by the square root so a small one still reads; SPREAD 1 is true scale, 0 all one size
      const size = fore ? (0.3 * h) / it.big : (icon * (it.big / biggest()) ** SPREAD) / it.big;
      // on a baseline: every part's bottom on its line's floor
      if (!fore) spot.y += (it.tall * size - icon) / 2;
      it.holder.position.lerp(fore ? pivot.position.clone() : d.camera.position.clone().add(spot), k);
      it.holder.scale.setScalar(THREE.MathUtils.lerp(it.holder.scale.x || size, size, k) * (fore ? 1 : grow));
      it.holder.rotation.set(0, fore ? (still.matches ? YAW : t * 0.6) : YAW + (on && card === 0 && !still.matches ? 0.25 * Math.sin(t * 1.6) : 0), 0);
      const m = it.mesh.material as THREE.MeshStandardMaterial;
      const shown = card > 0 ? (on ? 1 : 0) : clamp(Math.min(v + 0.5, inView - 0.5 - v) * 2, 0, 1);
      m.opacity += (shown - m.opacity) * k;
    });
    const lit = icons[row];
    halo.visible = dot.visible = !!lit && card === 0 && lit.holder.visible;
    if (halo.visible) {
      // an underglow behind the picked part, rimming its outline
      const seen = Math.max(lit.big * lit.holder.scale.x, 0.7 * icon); // the part's longest side as drawn, small parts lifted
      halo.position.copy(lit.holder.position).add(new THREE.Vector3(0, -0.1 * seen, -0.6 * seen));
      halo.scale.set(1.6 * seen, 1.1 * seen, 1);
      // on the part's lower third, by its drawn height
      dot.position.copy(lit.holder.position).add(new THREE.Vector3(0, -0.3 * lit.tall * lit.holder.scale.x, 0.3));
      dot.scale.setScalar(0.8 * seen);
      halo.material.opacity = dot.material.opacity = (0.85 + 0.15 * Math.sin(t * 2.1)) * (lit.mesh.material as THREE.MeshStandardMaterial).opacity;
    }
  }
  /** a tap on the shelf, in view fractions -1 to 1: an icon picks, the picked one is A */
  const tapRay = new THREE.Raycaster();
  tapRay.layers.set(1);
  function tap(x: number, y: number) {
    if (mode !== 'shelf' || card) return;
    tapRay.setFromCamera(new THREE.Vector2(x, y), d.camera);
    const hit = tapRay.intersectObjects(icons.map((it) => it.mesh))[0];
    const i = icons.findIndex((it) => it.mesh === hit?.object);
    if (i < 0) return;
    if (i === row) return press('a');
    row = i;
    follow();
    sfx.tick();
    d.paint();
  }

  /** a piece's ghost: its shape, sized and placed; an stl piece's waits for its mesh */
  function ghostOf(i: number) {
    const p = bench.pieces[i];
    while (ghosts.length <= i) {
      const g = new THREE.Mesh(new THREE.BufferGeometry(), ghostMat());
      g.matrixAutoUpdate = false;
      g.layers.set(1);
      world.add(g);
      ghosts.push(g);
    }
    const g = ghosts[i];
    if (p.kind !== 'stl') g.geometry = UNIT[p.kind];
    else if (g.userData.ref !== p.ref) {
      g.geometry = new THREE.BufferGeometry();
      stlGeo(p.ref!).then((s) => bench.pieces[i]?.ref === p.ref && (g.geometry = s), () => {});
    }
    g.userData.ref = p.ref;
    const n = native(p, g.geometry);
    g.matrix.copy(pieceMatrix(p).scale(new THREE.Vector3(p.size[0] / n[0], p.size[1] / n[1], p.size[2] / n[2])));
    g.matrixWorldNeedsUpdate = true;
    return g;
  }
  /** the size of a piece's drawn geometry before scaling */
  const native = (p: Piece, g: THREE.BufferGeometry) => {
    if (p.kind !== 'stl') return [2, 2, 2];
    const b = g.boundingBox;
    return b ? b.getSize(new THREE.Vector3()).toArray().map((v) => v || 1) : p.size;
  };
  const syncGhosts = () => {
    bench.pieces.forEach((_, i) => ghostOf(i));
    for (const g of ghosts.splice(bench.pieces.length)) world.remove(g);
  };

  // one solve at a time; a newer live job replaces a queued live one, a fine one always runs
  const worker = new Worker(new URL('./sdf.worker.ts', import.meta.url), { type: 'module' });
  const queue: Job[] = [];
  let running: Job | null = null;
  const pump = () => {
    if (running || !queue.length) return;
    running = queue.shift()!;
    worker.postMessage({ pieces: running.pieces, edge: running.edge });
    d.paint();
  };
  worker.onmessage = (e: MessageEvent<Mesh & { error?: string }>) => {
    const j = running!;
    running = null;
    if (e.data.error) j.no(new Error(e.data.error));
    else j.ok(e.data);
    pump();
    d.paint();
  };
  const extent = (ps: Piece[]) => Math.max(1, ...ps.map((p) => Math.max(...p.size)));
  function solveWith(pieces: Piece[], live: boolean) {
    return new Promise<Mesh>((ok, no) => {
      for (const j of queue.filter((j) => live && j.live)) {
        queue.splice(queue.indexOf(j), 1);
        j.no(new Error('superseded'));
      }
      queue.push({ pieces: pieces.map(copy), edge: (live ? liveEdge : fineEdge)(extent(pieces)), live, ok, no });
      pump();
    });
  }
  const geometry = ({ pos, idx }: Mesh) => {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)).setIndex(new THREE.BufferAttribute(idx, 1));
    return toCreasedNormals(g, Math.PI / 6);
  };
  /** the bench solved live onto the bed; it pops when it lands */
  function solve() {
    save();
    if (!bench.pieces.length) {
      body.geometry = new THREE.BufferGeometry();
      return;
    }
    solveWith(bench.pieces, true).then(
      (m) => {
        body.geometry.dispose();
        body.geometry = geometry(m);
        popAt = now;
      },
      () => {},
    );
  }

  /** the highest surface under x y: the other join pieces' ghosts, else the bed */
  const ray = new THREE.Raycaster();
  ray.layers.enableAll();
  function surface(x: number, y: number, skip: number) {
    world.updateMatrixWorld(true);
    const o = world.localToWorld(new THREE.Vector3(x, y, 1000));
    ray.set(o, world.localToWorld(new THREE.Vector3(x, y, 0)).sub(o).normalize());
    const hit = ray.intersectObjects(ghosts.filter((g, i) => i !== skip && bench.pieces[i]?.op === 'join'), false)[0];
    return hit ? Math.max(world.worldToLocal(hit.point.clone()).z, 0) : 0;
  }
  /** mm from a piece's middle down to its lowest point, as turned */
  function under(i: number) {
    const g = ghostOf(i);
    const b = g.geometry.boundingBox;
    return b ? bench.pieces[i].pos[2] - b.clone().applyMatrix4(g.matrix).min.z : bench.pieces[i].size[2] / 2;
  }
  /** the held piece sat on whatever is under its middle, lift above it */
  function ride() {
    const h = held!, p = bench.pieces[h.i];
    p.pos[2] = Math.round((surface(p.pos[0], p.pos[1], h.i) + under(h.i) + h.lift) * 100) / 100;
    ghostOf(h.i);
  }
  const rumble = () =>
    navigator.getGamepads?.().find((g) => g?.connected)?.vibrationActuator?.playEffect('dual-rumble', { duration: 45, strongMagnitude: 0.15, weakMagnitude: 0.5 }).catch(() => {});

  /** a piece in hand from i; from is how it was, null for one just added, which B takes off again */
  function grab(i: number, from: Piece | null) {
    sel = i;
    held = { i, from, tool: 0, lift: 0, snapped: '' };
    const p = bench.pieces[i];
    held.lift = Math.max(p.pos[2] - under(i) - surface(p.pos[0], p.pos[1], i), 0);
    mode = 'held';
  }
  function add(p: Piece) {
    bench.pieces.push(p);
    syncGhosts();
    grab(bench.pieces.length - 1, null);
    held!.lift = 0;
    ride();
    solve();
  }
  const fresh = (kind: Shape): Piece => ({ kind, pos: [0, 0, 0], rot: [0, 0, 0], size: [...SIZES[kind]], op: 'join', blend: 2 });

  /** Import STL: the file welded and centred, kept in IndexedDB and tried alone; one that is no closed solid goes again */
  const file = Object.assign(document.createElement('input'), { type: 'file', accept: '.stl', hidden: true });
  document.body.append(file);
  file.onchange = async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f || !shown) return;
    const ref = `${IMPORT}${slug(f.name.replace(/\.stl$/i, ''))}-${Date.now().toString(36)}`;
    try {
      const g = mergeVertices(new THREE.BufferGeometry().setAttribute('position', new STLLoader().parse(await f.arrayBuffer()).getAttribute('position')));
      g.computeBoundingBox();
      const b = g.boundingBox!;
      if (!g.index || ![...b.min.toArray(), ...b.max.toArray()].every(isFinite)) throw new Error('empty');
      g.center();
      await keepImport(ref, { pos: Float32Array.from(g.getAttribute('position').array), idx: Uint32Array.from(g.index.array) });
      const size = b.getSize(new THREE.Vector3()).toArray();
      const p: Piece = { kind: 'stl', ref, pos: [0, 0, 0], rot: [0, 0, 0], size, op: 'join', blend: 0 };
      await solveWith([p], true).catch((e) => {
        if (e.message !== 'superseded') throw e;
      });
      mode = 'browse';
      add(p);
      sfx.confirm();
    } catch {
      dropImport(ref).catch(() => {});
      oops = true;
      sfx.cancel();
    }
    d.paint();
  };

  /** Save part: solved fine, the mesh kept under my:<name> and the recipe beside it; a name saved before is replaced, one version on */
  async function savePart(name: string) {
    const ref = MY + slug(name);
    bench.name = name;
    save();
    const m = await solveWith(bench.pieces, false);
    await keepImport(ref, m);
    const my = loadMy();
    saveMy({ ...my, [ref]: { name, version: (my[ref]?.version ?? 0) + 1, pieces: bench.pieces.map(copy) } });
  }

  type Act = 'shapes' | 'import' | 'save' | 'shelf' | 'export' | 'light';
  // Light only where the theme lights by the hour
  const ACTS: Act[] = ['shapes', 'import', 'save', 'shelf', 'export', ...(theme.sky ? (['light'] as const) : [])];
  const actName: Record<Act, string> = { shapes: S.shapes, import: S.importStl, save: S.savePart, shelf: S.shelf, export: S.exportStl, light: S.light };
  const rowsN = () => bench.pieces.length + ACTS.length;
  const actOf = (i: number): Act | undefined => ACTS[i - bench.pieces.length];
  const shelf = () => Object.entries(loadMy());
  const pieceName = (p: Piece, i: number) =>
    p.kind === 'stl' ? (FEATURED.find((f) => IMPORT + f.slug === p.ref)?.name ?? p.ref!.slice(IMPORT.length).replace(/-[a-z0-9]+$/, '')) : `${S[p.kind]} ${i + 1}`;

  /** a step on the held piece: d-pad dx dy, or dz from L2 R2, by the tool */
  function nudge(dx: number, dy: number, dz: number) {
    const h = held!, p = bench.pieces[h.i];
    const tool = TOOLS[h.tool];
    if (dz && tool !== 'size') {
      const l = clamp(Math.round(h.lift + dz * GRID), 0, HEIGHT);
      if (l === h.lift) return false;
      h.lift = l;
    } else if (tool === 'blend') {
      const b = clamp(p.blend + (dx - dy) * BLEND, 0, 20);
      if (b === p.blend) return false;
      p.blend = b;
    }
    else if (tool === 'move') {
      // the d-pad pushes along the bed's axis nearest the way it points on screen
      const c = Math.cos(orbit.yaw), s = Math.sin(orbit.yaw);
      const vx = dx * c - dy * s, vy = -dx * s - dy * c;
      const along = Math.abs(vx) >= Math.abs(vy) ? [Math.sign(vx), 0] : [0, Math.sign(vy)];
      const was = [p.pos[0], p.pos[1]];
      const to = [clamp(Math.round(was[0] + along[0] * GRID), -BED / 2, BED / 2), clamp(Math.round(was[1] + along[1] * GRID), -BED / 2, BED / 2)];
      // a middle ahead within SNAP pulls the piece onto it; one behind lets it go
      const mids = [[0, 0], ...bench.pieces.filter((_, i) => i !== h.i).map((q) => q.pos)];
      const m = mids.find(([x, y]) => Math.hypot(x - to[0], y - to[1]) <= SNAP && (x - was[0]) * along[0] + (y - was[1]) * along[1] > 0);
      const snapped = m ? `${m[0]},${m[1]}` : '';
      if (m) [to[0], to[1]] = [m[0], m[1]];
      if (snapped && snapped !== h.snapped) {
        sfx.tick();
        rumble();
      }
      h.snapped = snapped;
      if (to[0] === was[0] && to[1] === was[1]) return false;
      [p.pos[0], p.pos[1]] = to;
    } else if (tool === 'turn') {
      // ← → roll about y, ↑ ↓ tip about x
      if (dx) p.rot[1] = wrap(p.rot[1] + dx * ANGLE);
      if (dy) p.rot[0] = wrap(p.rot[0] + dy * ANGLE);
    } else {
      const s = [...p.size];
      p.size[0] = clamp(p.size[0] + dx * GRID, 1, BED);
      p.size[1] = clamp(p.size[1] - dy * GRID, 1, BED);
      p.size[2] = clamp(p.size[2] + dz * GRID, 1, HEIGHT);
      if (s.every((v, i) => v === p.size[i])) return false;
    }
    ride();
    solve();
    return true;
  }
  const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

  function press(k: Key) {
    oops = false;
    if ((k === 'zl' || k === 'zr') && (mode === 'browse' || mode === 'shelf')) {
      zoomBy(k === 'zr' ? 1.15 : 1 / 1.15);
      return sfx.tick();
    }
    if (mode === 'held') {
      const h = held!, p = bench.pieces[h.i];
      if (k === 'a') {
        sfx.confirm();
        held = null;
        mode = 'browse';
        squashAt = now;
      } else if (k === 'b') {
        sfx.cancel();
        if (h.from) bench.pieces[h.i] = h.from;
        else bench.pieces.splice(h.i, 1);
        sel = clamp(sel, 0, rowsN() - 1);
        held = null;
        mode = 'browse';
        syncGhosts();
        solve();
      } else if (k === 'y') {
        sfx.tick();
        h.tool = (h.tool + 1) % TOOLS.length;
      } else if (k === 'x') {
        sfx.tick();
        p.op = p.op === 'join' ? 'cut' : 'join';
        solve();
      } else if (k === 'l' || k === 'r') {
        sfx.tick();
        p.rot[2] = wrap(p.rot[2] + (k === 'l' ? ANGLE : -ANGLE));
        ride();
        solve();
      } else if (!nudge(0, 0, k === 'zr' ? 1 : -1)) return sfx.cancel();
      else sfx.tick();
    } else if (mode === 'palette') {
      const r = palRows()[row];
      if (k === 'a' && r === 'featured') {
        sfx.confirm();
        deep = true;
        row = 0;
      } else if (k === 'a' && r === 'import') {
        sfx.confirm();
        mode = 'browse';
        file.click();
      } else if (k === 'a' && typeof r === 'object') {
        sfx.confirm();
        if ('shape' in r) add(fresh(r.shape));
        else {
          const f = r.f;
          mode = 'browse';
          featuredSolid(f.slug).then(
            (s) => (add(featuredPiece(f.slug, s)), d.paint()),
            () => ((oops = true), sfx.cancel(), d.paint()),
          );
        }
      } else if (k === 'b') {
        sfx.cancel();
        // the featured list goes back to its row in the palette, the palette to the bench
        if (deep) (deep = false), (row = SHAPES.length);
        else mode = 'browse';
      } else return;
    } else if (mode === 'shelf') {
      const s = shelf()[row];
      if (k === 'b') {
        sfx.cancel();
        if (card) card--;
        else mode = 'browse';
      } else if (k !== 'a' || !s) return;
      else if (card === 0) {
        sfx.confirm();
        card = 1;
        act = 0;
      } else if (card === 1 && act === 0) {
        sfx.confirm();
        bench = { name: s[1].name, pieces: s[1].pieces.map(copy) };
        sel = 0;
        mode = 'browse';
        syncGhosts();
        solve();
      } else if (card === 1) {
        sfx.confirm();
        card = 2;
        yes = false;
      } else if (!yes) {
        sfx.cancel();
        card = 1;
      } else {
        sfx.confirm();
        const my = loadMy();
        delete my[s[0]];
        saveMy(my);
        dropImport(s[0]).catch(() => {});
        fillShelf();
      }
    } else if (mode === 'light') {
      if (k !== 'b') return;
      sfx.cancel();
      mode = 'browse';
      d.hour(null);
    } else if (mode === 'name') {
      if (k === 'b') {
        sfx.cancel();
        mode = 'browse';
      } else if (k === 'x') type('Backspace');
      else if (k === 'y') type(' ');
      else if (k === 'a') {
        const c = KEYS[key[1]][key[0]];
        type(c === S.space ? ' ' : c === S.del ? 'Backspace' : c === S.ok ? 'Enter' : c);
      }
      return d.paint();
    } else {
      const p = bench.pieces[sel];
      if (k === 'b') return d.leave();
      if (k === 'y') {
        sfx.confirm();
        mode = 'palette';
        row = 0;
        deep = false;
      } else if (k === 'a' && p) {
        sfx.confirm();
        grab(sel, copy(p));
      } else if (k === 'a') {
        const a = actOf(sel)!;
        if (a !== 'import' && a !== 'shapes' && a !== 'shelf' && a !== 'light' && !bench.pieces.length) return sfx.cancel();
        sfx.confirm();
        if (a === 'shapes') (mode = 'palette'), (row = 0), (deep = false);
        else if (a === 'import') file.click();
        else if (a === 'shelf') (mode = 'shelf'), (row = 0), fillShelf();
        else if (a === 'light') {
          const t = new Date();
          hour = Math.round((t.getHours() + t.getMinutes() / 60) * 2) / 2 % 24;
          mode = 'light';
          d.hour(hour);
        }
        else if (a === 'save') {
          mode = 'name';
          typed = bench.name.slice(0, NAME);
          key = [KEYS[3].length - 1, 3];
        } else
          void solveWith(bench.pieces, false).then(
            (m) => exportStl(geometry(m), `${slug(bench.name)}.stl`),
            () => sfx.cancel(),
          );
      } else if (k === 'x' && p) {
        sfx.cancel();
        bench.pieces.splice(sel, 1);
        sel = clamp(sel, 0, rowsN() - 1);
        syncGhosts();
        solve();
      } else if (k === 'l' && p) {
        // a copy in hand where the piece stands
        sfx.confirm();
        bench.pieces.push(copy(p));
        syncGhosts();
        grab(bench.pieces.length - 1, null);
        solve();
      } else if (k === 'r' && p) {
        // a copy mirrored across the bed's middle line
        if (!p.pos[0] && !p.rot[1] && !p.rot[2]) return sfx.cancel();
        sfx.confirm();
        const q = copy(p);
        q.pos[0] = -q.pos[0];
        q.rot = [q.rot[0], -q.rot[1], -q.rot[2]];
        bench.pieces.push(q);
        sel = bench.pieces.length - 1;
        syncGhosts();
        solve();
      } else return;
    }
    d.paint();
  }

  function move(dx: number, dy: number) {
    oops = false;
    if (mode === 'held') {
      if (!nudge(dx, dy, 0)) return;
    } else if (mode === 'light') {
      // ← → half an hour, ↑ ↓ three
      hour = (((hour + dx * 0.5 - dy * 3) % 24) + 24) % 24;
      d.hour(hour);
    } else if (mode === 'name') {
      const y = clamp(key[1] + dy, 0, KEYS.length - 1);
      key = [clamp(key[0] + dx, 0, KEYS[y].length - 1), y];
    } else if (mode === 'shelf') {
      if (card === 2) {
        if (!dx && !dy) return;
        yes = !yes;
      } else if (card === 1) {
        const n = clamp(act + dy, 0, 1);
        if (n === act) return;
        act = n;
      } else {
        // along the run steps a line, across it steps within one
        const [along, across] = tall ? [dx, dy] : [dy, dx];
        const n = row + across + along * cols;
        if (n < 0 || n >= icons.length || (across && lineOf(n) !== lineOf(row))) return;
        row = n;
        follow();
      }
    } else if (mode === 'palette') {
      const n = clamp(row + dy, 0, palRows().length - 1);
      if (!dy || n === row) return;
      row = n;
    } else if (dy) {
      const n = clamp(sel + dy, 0, rowsN() - 1);
      if (n === sel) return;
      sel = n;
    } else {
      // ← → on a piece swaps join and cut
      const p = bench.pieces[sel];
      if (!p) return;
      p.op = p.op === 'join' ? 'cut' : 'join';
      solve();
    }
    sfx.tick();
    d.paint();
  }

  /** a key typed while naming; true when it was taken */
  function type(k: string) {
    if (mode !== 'name') return false;
    if (k === 'Escape') return press('b'), true;
    if (k === 'Backspace') {
      if (!typed) return sfx.cancel(), true;
      typed = typed.slice(0, -1);
      sfx.tick();
    } else if (k === 'Enter') {
      const name = typed.trim();
      if (!name) return sfx.cancel(), true;
      sfx.confirm();
      mode = 'browse';
      void savePart(name).then(d.paint, () => sfx.cancel());
    } else if (/^[a-z0-9\- ]$/i.test(k) && typed.length < NAME) {
      typed += k.toUpperCase();
      sfx.tick();
    } else return false;
    d.paint();
    return true;
  }

  /** a drag or the right stick; at a screen point, in fractions 0 to 1, over the shelf it scrolls the shelf, else it turns the bed */
  function drag(dx: number, dy: number, x = 0, y = 0) {
    if (onShelf(x, y)) return roll(-(tall ? dx : dy));
    aim.yaw += dx * 0.01;
    aim.tilt = clamp(aim.tilt + dy * 0.01, 0.05, 1.45);
  }

  function frame(dt: number, t: number) {
    now = t;
    if (!shown) return;
    const k = still.matches ? 1 : 1 - Math.exp(-8 * dt);
    orbit.yaw += (aim.yaw - orbit.yaw) * k;
    orbit.tilt += (aim.tilt - orbit.tilt) * k;
    // landscape keeps the bed left of the list, as edit keeps its phone
    const pt = d.camera.aspect < 1;
    const h = 2 * DIST * Math.tan(THREE.MathUtils.degToRad(d.camera.fov / 2));
    pivot.position.copy(d.camera.position).add(new THREE.Vector3(pt ? 0 : -0.2 * h * d.camera.aspect, pt ? 0.14 * h : 0, -DIST));
    pivot.rotation.set(orbit.tilt, orbit.yaw, 0);
    // portrait's shelf takes the lower half, so the bed sits higher and smaller over it
    const up = pt && mode === 'shelf' && !card;
    pivot.position.y += up ? 0.08 * h : 0;
    pivot.scale.setScalar((pt ? (up ? 0.6 : 0.8) : 1) * zoom);
    const want = picked();
    const id = want ? `${mode}/${want[0]}` : '';
    if (id !== showing) {
      showing = id;
      stand.visible = false;
      want?.[1]().then(
        (g) => {
          if (showing !== id) return;
          show.geometry = g;
          show.scale.fromArray(want[2] ?? [1, 1, 1]);
          show.position.copy(g.boundingBox!.getCenter(new THREE.Vector3()).negate().multiply(show.scale));
          stand.visible = true;
          showAt = now;
        },
        () => {},
      );
    }
    // the bed steps aside while a part is shown
    world.visible = !showing && !(mode === 'shelf' && card);
    shelfFrame(t, dt, h, pt);
    if (stand.visible) {
      const e = 1 - (1 - clamp((t - showAt) / 0.25, 0, 1)) ** 3;
      stand.position.copy(pivot.position).add(new THREE.Vector3((1 - e) * 0.25 * h, 0, 0));
      stand.rotation.set(0.35, t * 0.6, 0);
      stand.scale.setScalar((0.45 * h) / show.geometry.boundingBox!.getSize(new THREE.Vector3()).multiply(show.scale).length());
      (show.material as THREE.MeshStandardMaterial).opacity = e;
    }
    // the part pops when a solve lands
    const pop = popAt >= 0 ? clamp((t - popAt) / 0.25, 0, 1) : 1;
    body.scale.setScalar(1 + 0.035 * Math.sin(Math.PI * pop));
    orb.visible = mode === 'light';
    if (orb.visible) {
      const l = fromHour(hour);
      orbLight.position.set(...along(Math.PI * l.along));
      (orbLight.material as THREE.MeshBasicMaterial).color.set(l.night ? '#bcd0ff' : '#ffd27a');
      beam.geometry.setFromPoints([new THREE.Vector3(), orbLight.position]);
    }
    // the held piece's ghost shows strong, the picked one faint; a cut in red; a drop squashes it
    const sq = squashAt >= 0 ? clamp((t - squashAt) / 0.22, 0, 1) : 1;
    const wob = Math.sin(Math.PI * sq);
    ghosts.forEach((g, i) => {
      const p = bench.pieces[i];
      const on = held ? held.i === i : mode === 'browse' && sel === i;
      g.visible = on;
      if (!on || !p) return;
      const m = g.material as THREE.MeshStandardMaterial;
      m.color.set(p.op === 'cut' ? C.del : C.pick);
      m.emissive.copy(m.color);
      m.opacity = held ? 0.55 : 0.28;
      // under places the ghost; the squash goes on after, about the piece's foot
      const foot = p.pos[2] - under(i);
      if (!held && wob)
        g.matrix
          .premultiply(new THREE.Matrix4().makeTranslation(0, 0, -foot))
          .premultiply(new THREE.Matrix4().makeScale(1 + 0.08 * wob, 1 + 0.08 * wob, 1 - 0.15 * wob))
          .premultiply(new THREE.Matrix4().makeTranslation(0, 0, foot));
    });
  }

  function rows(): [HTMLElement, boolean][] {
    const li = (e: HTMLElement, cls = '') => {
      const l = document.createElement('li');
      if (cls) l.className = cls;
      l.append(e);
      return l;
    };
    const button = (s: string, on: boolean, click: () => void, cls = '') => {
      const b = d.ink('button', s, [on ? 'on' : '', cls].filter(Boolean).join(' '));
      b.onclick = click;
      return b;
    };
    // a tap picks a row, a tap on the picked row is A
    const pick = (on: boolean, set: () => void) => () => (on ? press('a') : (sfx.tick(), set(), d.paint()));
    const title = (s: string): [HTMLElement, boolean] => [li(d.ink('p', s, 'title')), false];
    const list = (names: string[], at: number, set: (i: number) => void) =>
      names.map((s, i): [HTMLElement, boolean] => [li(button(s, i === at, pick(i === at, () => set(i)))), i === at]);
    if (mode === 'light') return [title(S.light), [li(d.ink('p', `${hhmm(hour)}  ${fromHour(hour).night ? S.moon : S.sun}`, 'read')), false]];
    if (mode === 'palette')
      return [
        title(deep ? S.featured : S.shapes),
        ...list(palRows().map((r) => (r === 'featured' ? `${S.featured}  ${FEATURED.length}` : r === 'import' ? S.importStl : 'shape' in r ? S[r.shape] : r.f.name)), row, (i) => (row = i)),
      ];
    if (mode === 'shelf') {
      const m = shelf()[row]?.[1];
      if (!m) return [title(S.shelf), [li(d.ink('p', S.shelfEmpty)), false]];
      // the icons are the list; a screen reader hears the picked one's name
      if (!card) return [[li(Object.assign(document.createElement('p'), { className: 'sr', textContent: m.name })), false]];
      const head: [HTMLElement, boolean][] = [title(m.name), [li(d.ink('p', `v${m.version}`, 'read')), false]];
      if (card === 1) return [...head, ...list([S.open, S.delete], act, (i) => (act = i))];
      return [...head, [li(d.ink('p', S.sure)), false], ...list([S.yes, S.no], yes ? 0 : 1, (i) => (yes = i === 0))];
    }
    if (mode === 'name') {
      const keys = KEYS.map((r, y): [HTMLElement, boolean] => {
        const l = document.createElement('li');
        l.className = 'keys';
        l.append(...r.map((c, x) => button(c, x === key[0] && y === key[1], pick(x === key[0] && y === key[1], () => (key = [x, y])), 'key')));
        return [l, y === key[1]];
      });
      return [title(S.name), [li(d.ink('p', `${typed}_`, 'read')), false], ...keys];
    }
    if (mode === 'held') {
      const h = held!, p = bench.pieces[h.i];
      const f = (v: number) => `${+v.toFixed(1)}`;
      const value = {
        move: `${f(p.pos[0])}  ${f(p.pos[1])}  ${S.lift} ${f(h.lift)}`,
        turn: `${p.rot.map((a) => `${a}°`).join(' ')}`,
        size: `${p.size.map(f).join(' × ')} mm`,
        blend: `${f(p.blend)} mm`,
      };
      return [
        title(`${pieceName(p, h.i)}  ${p.op === 'join' ? S.union : S.difference}`),
        ...TOOLS.map((t, i): [HTMLElement, boolean] => {
          const l = document.createElement('li');
          l.append(button(S[t], i === h.tool, () => ((h.tool = i), sfx.tick(), d.paint()), 'name'), d.ink('p', value[t], 'value'));
          return [l, i === h.tool];
        }),
      ];
    }
    const P = bench.pieces.map((p, i): [HTMLElement, boolean] => {
      const on = i === sel;
      const l = document.createElement('li');
      const step = () => (sel = i, move(1, 0));
      l.append(
        button(pieceName(p, i), on, pick(on, () => (sel = i)), 'name'),
        button('‹', on, step, 'step'),
        button(p.op === 'join' ? S.union : S.difference, on, pick(on, () => (sel = i)), 'value'),
        button('›', on, step, 'step'),
      );
      return [l, on];
    });
    const n = bench.pieces.length;
    return [
      ...(n ? P : [[li(d.ink('p', S.emptyBench)), false] as [HTMLElement, boolean]]),
      ...ACTS.map((a, i): [HTMLElement, boolean] => [li(button(actName[a], n + i === sel, pick(n + i === sel, () => (sel = n + i))), i ? 'act' : 'act first'), n + i === sel]),
    ];
  }

  // every key the mode takes has a button: the bar is the touch and mouse way to each; a third word names a group of marks for a screen reader in place of its label
  function bar(): [Key | Dir, string, string?][] {
    if (mode === 'held')
      return [
        ['left', ''], ['up', ''], ['down', ''], ['right', S[TOOLS[held!.tool]]],
        ['a', S.drop], ['b', S.cancel], ['y', S.tool], ['x', `${S.union}/${S.difference}`],
        ['l', ''], ['r', S.spin], ['zl', ''], ['zr', TOOLS[held!.tool] === 'size' ? S.size : S.lift],
      ];
    if (mode === 'light') return [['left', ''], ['up', ''], ['down', ''], ['right', hhmm(hour), S.light], ['b', S.back]];
    if (mode === 'palette') return [['a', typeof palRows()[row] === 'object' ? S.add : S.open], ['b', S.back]];
    if (mode === 'shelf') return card ? [['a', card === 1 ? (act ? S.delete : S.open) : yes ? S.yes : S.no], ['b', S.close]] : [...(icons.length ? [['a', S.enter] as [Key, string]] : []), ['b', S.back], ['zl', ''], ['zr', S.zoom]];
    if (mode === 'name') return [['a', S.type], ['b', S.cancel], ['x', S.del], ['y', S.space]];
    const p = bench.pieces[sel];
    return p
      ? [['a', S.grab], ['b', S.back], ['x', S.remove], ['y', S.shapes], ['l', S.dup], ['r', S.mirror]]
      : [['a', S.enter], ['b', S.back], ['y', S.shapes], ['zl', ''], ['zr', S.zoom]];
  }

  return {
    enter() {
      shown = pivot.visible = true;
      mode = 'browse';
      held = null;
      sel = clamp(sel, 0, rowsN() - 1);
      syncGhosts();
      solve();
    },
    exit() {
      shown = pivot.visible = stand.visible = shelfRoot.visible = false;
      showing = '';
      if (mode === 'light') d.hour(null);
    },
    get shown() {
      return shown;
    },
    title: (): [string, string] =>
      mode === 'shelf' && card === 0 && icons[row] ? [shelf()[row]?.[1].name ?? S.shelf, S.shelf] : [mode === 'name' ? S.savePart : S.play, oops ? S.notSolid : running || queue.length ? S.loading : bench.name],
    press,
    move,
    type,
    drag,
    tap,
    zoomBy,
    /** the wheel at a screen point, in fractions 0 to 1: over the shelf it scrolls, else it zooms the bed */
    wheel: (dy: number, x: number, y: number) => (onShelf(x, y) ? roll(dy) : zoomBy(Math.exp(-dy * 0.001))),
    frame,
    rows,
    bar,
  };
}
