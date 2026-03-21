/**
 * Generate 6 high-quality space skybox faces (2048x2048 each)
 * with stars, nebulae, and cosmic dust.
 * Outputs PNG files to public/images/skybox/
 */
import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'images', 'skybox');
const SIZE = 2048;

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateFace(seed, nebulaConfig) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const rand = seededRandom(seed);

  // Deep space base
  ctx.fillStyle = '#010108';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // ─── Nebula clouds ────────────────────────────────────────
  const nebulaColors = [
    { r: 40, g: 12, b: 80 },   // deep purple
    { r: 12, g: 25, b: 65 },   // deep blue
    { r: 25, g: 50, b: 65 },   // teal
    { r: 55, g: 18, b: 40 },   // dark magenta
    { r: 15, g: 40, b: 55 },   // dark cyan
    { r: 60, g: 20, b: 20 },   // dark red
    { r: 20, g: 15, b: 55 },   // indigo
  ];

  // Large diffuse nebulae (background)
  for (let n = 0; n < (nebulaConfig.count || 4); n++) {
    const cx = rand() * SIZE;
    const cy = rand() * SIZE;
    const rx = SIZE * (0.2 + rand() * 0.4);
    const ry = SIZE * (0.15 + rand() * 0.35);
    const c = nebulaColors[Math.floor(rand() * nebulaColors.length)];
    const baseAlpha = nebulaConfig.intensity * (0.06 + rand() * 0.1);

    // Elliptical nebula via scale transform
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    gradient.addColorStop(0, `rgba(${c.r + 20},${c.g + 15},${c.b + 10},${baseAlpha})`);
    gradient.addColorStop(0.25, `rgba(${c.r},${c.g},${c.b},${baseAlpha * 0.7})`);
    gradient.addColorStop(0.6, `rgba(${c.r},${c.g},${c.b},${baseAlpha * 0.2})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Smaller, brighter nebula wisps
  for (let n = 0; n < (nebulaConfig.wisps || 6); n++) {
    const cx = rand() * SIZE;
    const cy = rand() * SIZE;
    const r = SIZE * (0.03 + rand() * 0.1);
    const c = nebulaColors[Math.floor(rand() * nebulaColors.length)];
    const alpha = nebulaConfig.intensity * (0.04 + rand() * 0.08);

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, `rgba(${c.r + 40},${c.g + 30},${c.b + 20},${alpha})`);
    gradient.addColorStop(0.5, `rgba(${c.r + 20},${c.g + 15},${c.b + 10},${alpha * 0.4})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  // ─── Cosmic dust lane (on some faces) ─────────────────────
  if (nebulaConfig.dustLane) {
    const angle = rand() * Math.PI;
    const cx = SIZE / 2 + (rand() - 0.5) * SIZE * 0.3;
    const cy = SIZE / 2 + (rand() - 0.5) * SIZE * 0.3;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    for (let d = 0; d < 200; d++) {
      const x = (rand() - 0.5) * SIZE * 0.8;
      const y = (rand() - 0.5) * SIZE * 0.08;
      const r = 2 + rand() * 15;
      const alpha = 0.01 + rand() * 0.03;

      const c = nebulaColors[Math.floor(rand() * nebulaColors.length)];
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, `rgba(${c.r + 30},${c.g + 20},${c.b + 15},${alpha})`);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    ctx.restore();
  }

  // ─── Stars layer 1: faint background (many, tiny) ─────────
  for (let i = 0; i < 5000; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const alpha = 0.08 + rand() * 0.25;
    const radius = 0.2 + rand() * 0.4;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200,210,235,${alpha})`;
    ctx.fill();
  }

  // ─── Stars layer 2: medium ────────────────────────────────
  for (let i = 0; i < 1500; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const brightness = rand();
    const alpha = 0.25 + brightness * 0.55;
    const radius = 0.3 + rand() * 0.7;

    // Star color variation: white, blue-white, yellow-white
    const colorType = rand();
    let r, g, b;
    if (colorType < 0.6) {
      // White
      r = 200 + Math.floor(rand() * 55);
      g = 205 + Math.floor(rand() * 50);
      b = 215 + Math.floor(rand() * 40);
    } else if (colorType < 0.8) {
      // Blue-white
      r = 170 + Math.floor(rand() * 40);
      g = 190 + Math.floor(rand() * 40);
      b = 230 + Math.floor(rand() * 25);
    } else if (colorType < 0.95) {
      // Yellow-white
      r = 230 + Math.floor(rand() * 25);
      g = 210 + Math.floor(rand() * 30);
      b = 170 + Math.floor(rand() * 40);
    } else {
      // Warm orange (rare)
      r = 240 + Math.floor(rand() * 15);
      g = 180 + Math.floor(rand() * 40);
      b = 140 + Math.floor(rand() * 30);
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.fill();
  }

  // ─── Stars layer 3: bright with glow ──────────────────────
  for (let i = 0; i < 50; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const coreRadius = 0.8 + rand() * 1.5;
    const glowRadius = coreRadius * (3 + rand() * 3);

    // Glow
    const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
    glow.addColorStop(0, 'rgba(220,230,255,0.2)');
    glow.addColorStop(0.3, 'rgba(200,215,245,0.06)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - glowRadius, y - glowRadius, glowRadius * 2, glowRadius * 2);

    // Cross spikes (diffraction)
    if (rand() > 0.5) {
      ctx.strokeStyle = `rgba(220,230,255,0.08)`;
      ctx.lineWidth = 0.5;
      const spikeLen = glowRadius * 1.2;
      ctx.beginPath();
      ctx.moveTo(x - spikeLen, y);
      ctx.lineTo(x + spikeLen, y);
      ctx.moveTo(x, y - spikeLen);
      ctx.lineTo(x, y + spikeLen);
      ctx.stroke();
    }

    // Core
    ctx.beginPath();
    ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(245,248,255,0.9)`;
    ctx.fill();
  }

  return canvas;
}

// Each face has different nebula configurations for variety
const faceConfigs = [
  { name: 'px', seed: 11111, config: { count: 3, wisps: 5, intensity: 1.0, dustLane: false } },
  { name: 'nx', seed: 22222, config: { count: 4, wisps: 8, intensity: 1.2, dustLane: true } },
  { name: 'py', seed: 33333, config: { count: 2, wisps: 4, intensity: 0.8, dustLane: false } },
  { name: 'ny', seed: 44444, config: { count: 5, wisps: 10, intensity: 1.5, dustLane: true } },
  { name: 'pz', seed: 55555, config: { count: 3, wisps: 6, intensity: 1.1, dustLane: false } },
  { name: 'nz', seed: 66666, config: { count: 4, wisps: 7, intensity: 0.9, dustLane: true } },
];

console.log(`Generating ${faceConfigs.length} skybox faces at ${SIZE}x${SIZE}...`);

for (const { name, seed, config } of faceConfigs) {
  process.stdout.write(`  ${name}...`);
  const canvas = generateFace(seed, config);
  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.92 });
  const path = join(outDir, `${name}.jpg`);
  writeFileSync(path, buffer);
  console.log(` done (${(buffer.length / 1024).toFixed(0)}KB)`);
}

console.log('Skybox generation complete!');
