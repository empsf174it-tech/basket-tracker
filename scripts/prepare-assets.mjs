// Copies MediaPipe wasm into public/ and downloads the pose models once,
// so the app never depends on a CDN at runtime.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const wasmSrc = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const outDir = resolve(root, 'public/mediapipe');
const wasmDst = resolve(outDir, 'wasm');
const MODELS = ['lite', 'full', 'heavy'];
const modelUrl = (m) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/1/pose_landmarker_${m}.task`;

mkdirSync(wasmDst, { recursive: true });
cpSync(wasmSrc, wasmDst, { recursive: true });
console.log('[assets] wasm copied');

for (const m of MODELS) {
  const dst = resolve(outDir, `pose_landmarker_${m}.task`);
  if (existsSync(dst)) {
    console.log(`[assets] ${m} model present`);
    continue;
  }
  const res = await fetch(modelUrl(m));
  if (!res.ok) throw new Error(`${m} model download failed: ${res.status}`);
  writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
  console.log(`[assets] ${m} model downloaded`);
}
