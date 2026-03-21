import { cpSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const cesiumSource = join(projectRoot, 'node_modules', 'cesium', 'Build', 'Cesium');
const targetDir = join(projectRoot, 'public', 'cesium');

const dirs = ['Workers', 'ThirdParty', 'Assets', 'Widgets'];

for (const dir of dirs) {
  const src = join(cesiumSource, dir);
  const dest = join(targetDir, dir);

  if (existsSync(src)) {
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
    console.log(`Copied ${dir}`);
  } else {
    console.warn(`Source not found: ${src}`);
  }
}

console.log('Cesium assets copied to public/cesium/');
