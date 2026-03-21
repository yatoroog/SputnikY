/**
 * Convert satellite.fbx → satellite.glb using Three.js + jsdom
 * Run: node scripts/convert-fbx-to-glb.mjs
 */
import { JSDOM } from 'jsdom';

// Polyfill browser globals for Three.js
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, writable: true });
global.self = dom.window;
global.HTMLElement = dom.window.HTMLElement;
global.Blob = dom.window.Blob;
global.FileReader = dom.window.FileReader;

// Polyfill TextDecoder/TextEncoder if needed
if (!global.TextDecoder) {
  const { TextDecoder, TextEncoder } = await import('util');
  global.TextDecoder = TextDecoder;
  global.TextEncoder = TextEncoder;
}

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputPath = resolve(__dirname, '../../satellite.fbx');
const outputPath = resolve(__dirname, '../public/satellite.glb');

console.log('Loading FBX from:', inputPath);

const fbxData = readFileSync(inputPath);
const loader = new FBXLoader();
const group = loader.parse(fbxData.buffer, '');

// Normalize scale
const box = new THREE.Box3().setFromObject(group);
const size = box.getSize(new THREE.Vector3());
const maxDim = Math.max(size.x, size.y, size.z);
if (maxDim > 0) {
  const scale = 1.0 / maxDim; // normalize to 1 unit
  group.scale.multiplyScalar(scale);
}

// Center the model
const box2 = new THREE.Box3().setFromObject(group);
const center = box2.getCenter(new THREE.Vector3());
group.position.sub(center);

// Force opaque MeshStandardMaterial on all meshes (FBX materials don't export well)
group.traverse((child) => {
  if (child.isMesh) {
    const oldMat = child.material;
    child.material = new THREE.MeshStandardMaterial({
      color: oldMat.color ?? new THREE.Color(0x889099),
      metalness: 0.75,
      roughness: 0.3,
      transparent: false,
      opacity: 1.0,
    });
  }
});

console.log('FBX loaded. Exporting to GLB...');

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(group, { binary: true });

writeFileSync(outputPath, Buffer.from(glb));
console.log('GLB written to:', outputPath, '- size:', Buffer.from(glb).length, 'bytes');
