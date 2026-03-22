'use client';

import { useEffect, useRef, useCallback, memo } from 'react';
import { useSatelliteStore } from '@/store/satelliteStore';

interface HeatmapOverlayProps {
  visible: boolean;
}

const GRID_SIZE = 6; // degrees per cell — larger cells = more visible density
const LAT_BINS = Math.ceil(180 / GRID_SIZE);
const LNG_BINS = Math.ceil(360 / GRID_SIZE);

function getHeatColor(value: number, maxValue: number): [number, number, number, number] {
  if (maxValue === 0 || value === 0) return [0, 0, 0, 0];
  const t = Math.min(value / maxValue, 1);

  if (t < 0.2) {
    const s = t / 0.2;
    return [30, 80, 220, Math.round(s * 140)];
  } else if (t < 0.4) {
    const s = (t - 0.2) / 0.2;
    return [6, 182, 212, Math.round(140 + s * 40)];
  } else if (t < 0.6) {
    const s = (t - 0.4) / 0.2;
    return [
      Math.round(6 + s * 240),
      Math.round(182 - s * 20),
      Math.round(212 - s * 180),
      Math.round(180 + s * 30),
    ];
  } else if (t < 0.8) {
    const s = (t - 0.6) / 0.2;
    return [
      Math.round(246 - s * 10),
      Math.round(162 - s * 60),
      Math.round(32 - s * 20),
      Math.round(210 + s * 20),
    ];
  } else {
    const s = (t - 0.8) / 0.2;
    return [
      Math.round(236 + s * 19),
      Math.round(102 - s * 60),
      Math.round(12 + s * 8),
      Math.round(230 + s * 25),
    ];
  }
}

function HeatmapOverlay({ visible }: HeatmapOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const satellites = useSatelliteStore((state) => state.satellites);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    if (width === 0 || height === 0) return;

    ctx.clearRect(0, 0, width, height);

    if (!visible || satellites.length === 0) return;

    // Build density grid
    const grid = new Float32Array(LAT_BINS * LNG_BINS);
    let maxVal = 0;

    for (const sat of satellites) {
      const latBin = Math.floor((sat.latitude + 90) / GRID_SIZE);
      const lngBin = Math.floor((sat.longitude + 180) / GRID_SIZE);
      if (latBin >= 0 && latBin < LAT_BINS && lngBin >= 0 && lngBin < LNG_BINS) {
        const idx = latBin * LNG_BINS + lngBin;
        grid[idx]++;
        if (grid[idx] > maxVal) maxVal = grid[idx];
      }
    }

    if (maxVal === 0) return;

    const cellW = width / LNG_BINS;
    const cellH = height / LAT_BINS;

    // Draw density cells
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let latBin = 0; latBin < LAT_BINS; latBin++) {
      for (let lngBin = 0; lngBin < LNG_BINS; lngBin++) {
        const val = grid[latBin * LNG_BINS + lngBin];
        if (val === 0) continue;

        const [r, g, b, a] = getHeatColor(val, maxVal);

        // Flip Y axis (latitude 90 at top)
        const startX = Math.floor(lngBin * cellW);
        const startY = Math.floor((LAT_BINS - 1 - latBin) * cellH);
        const endX = Math.min(Math.ceil((lngBin + 1) * cellW), width);
        const endY = Math.min(Math.ceil((LAT_BINS - latBin) * cellH), height);

        for (let py = startY; py < endY; py++) {
          for (let px = startX; px < endX; px++) {
            const idx = (py * width + px) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [satellites, visible]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
      }
      render();
    };

    // Delay initial resize to ensure layout is computed
    const timer = setTimeout(resize, 50);
    window.addEventListener('resize', resize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', resize);
    };
  }, [render]);

  useEffect(() => {
    render();
  }, [render]);

  if (!visible) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 5,
        opacity: 0.75,
      }}
    />
  );
}

export default memo(HeatmapOverlay);
