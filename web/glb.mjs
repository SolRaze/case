// out/<phone>/<style>.stl -> public/glb/<phone>/<style>.glb, meshopt compressed,
// plus previews/<phone>/<style>.png beside it and public/glb/index.json listing what exists.
// Skips a glb newer than its stl. Run after case.py --all: npm run glb
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const root = path.resolve(import.meta.dirname, '..');
const dst = path.join(import.meta.dirname, 'public', 'glb');
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

// binary STL: 80-byte header, uint32 count, 50 bytes per triangle (normal, 3 vertices, uint16)
function stlPositions(buf) {
  const n = buf.readUInt32LE(80);
  if (buf.length !== 84 + n * 50) throw new Error('not a binary stl');
  const pos = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    for (let j = 0; j < 9; j++) pos[i * 9 + j] = buf.readFloatLE(o + j * 4);
  }
  return pos;
}

async function convert(stl, glb) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc.createAccessor().setType('VEC3').setArray(stlPositions(fs.readFileSync(stl))).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute('POSITION', position);
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(prim)));
  await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await io.write(glb, doc);
}

const index = {};
let built = 0;
for (const phone of fs.readdirSync(path.join(root, 'out')).sort()) {
  const dir = path.join(root, 'out', phone);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.stl')).sort()) {
    const style = f.slice(0, -4);
    const stl = path.join(dir, f);
    const glb = path.join(dst, phone, `${style}.glb`);
    fs.mkdirSync(path.dirname(glb), { recursive: true });
    if (!fs.existsSync(glb) || fs.statSync(glb).mtimeMs < fs.statSync(stl).mtimeMs) {
      await convert(stl, glb);
      built++;
    }
    const png = path.join(root, 'previews', phone, `${style}.png`);
    if (fs.existsSync(png)) fs.copyFileSync(png, path.join(dst, phone, `${style}.png`));
    (index[phone] ??= []).push(style);
  }
}
fs.writeFileSync(path.join(dst, 'index.json'), JSON.stringify(index));
console.log(`${built} built, ${Object.values(index).flat().length} total`);
