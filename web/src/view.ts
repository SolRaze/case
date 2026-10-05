import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

type Cam = { fov: number; distance: number; turn: number };

/** three.js stage: one case model at a time, sized to fit, drag to turn, pinch to zoom, double tap resets */
export function createView(canvas: HTMLCanvasElement, cam: Cam, color: string) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(cam.fov, 1, 0.01, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(1, 2, 3);
  camera.add(sun);
  scene.add(camera);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  let fit = 1;
  const reset = () => {
    // cam.distance is a multiple of the distance that just fits the model's bounding sphere
    const half = THREE.MathUtils.degToRad(cam.fov / 2);
    const d = (fit / Math.sin(Math.min(half, Math.atan(Math.tan(half) * camera.aspect)))) * cam.distance;
    controls.minDistance = d * 0.4;
    controls.maxDistance = d * 2;
    camera.position.set(Math.sin(cam.turn) * d, d * 0.1, Math.cos(cam.turn) * d);
    controls.target.set(0, 0, 0);
    controls.update();
  };
  reset();
  canvas.addEventListener('dblclick', reset);

  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide });
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let model: THREE.Object3D | null = null;
  let token = 0;

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      reset();
    }
  }
  renderer.setAnimationLoop(() => {
    resize();
    controls.update();
    renderer.render(scene, camera);
  });

  /** load a glb; a later call wins over one still in flight */
  async function show(url: string) {
    const mine = ++token;
    const gltf = await loader.loadAsync(url);
    if (mine !== token) return;
    const root = new THREE.Group();
    gltf.scene.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const m = o as THREE.Mesh;
      m.updateWorldMatrix(true, false);
      // stl carries no normals and weld merged hard edges: crease at 30 degrees
      // positions arrive quantized (normalized int16, scale on the node): to float before baking the node matrix
      const q = m.geometry.getAttribute('position');
      const pos = new Float32Array(q.count * 3);
      for (let i = 0; i < q.count; i++) pos.set([q.getX(i), q.getY(i), q.getZ(i)], i * 3);
      const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(m.geometry.getIndex());
      g.applyMatrix4(m.matrixWorld);
      root.add(new THREE.Mesh(toCreasedNormals(g, Math.PI / 6), material));
    });
    // case.py writes mm, z-up, lying flat: its xy plane faces the camera as is; 1 unit = 100 mm
    root.scale.setScalar(0.01);
    const box = new THREE.Box3().setFromObject(root);
    root.position.sub(box.getCenter(new THREE.Vector3()));
    const first = !model;
    fit = box.getBoundingSphere(new THREE.Sphere()).radius;
    if (model) {
      scene.remove(model);
      model.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    model = root;
    scene.add(root);
    if (first) reset();
  }

  return { show, reset };
}
