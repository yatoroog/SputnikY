'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { load } from '@2gis/mapgl';
import type { Satellite, SatellitePosition } from '@/types';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useThemeStore } from '@/store/themeStore';
import { isRenderableAltitudeKm } from '@/lib/utils';
import { fetchOrbit } from '@/lib/api';

const SatelliteModel3D = dynamic(() => import('./SatelliteModel3D'), {
  ssr: false,
});

const EARTH_RADIUS_KM = 6_371;
const MAPGL_API_KEY = process.env.NEXT_PUBLIC_2GIS_MAPGL_KEY?.trim() ?? '';
const STYLE_DARK = 'e05ac437-fcc2-4845-ad74-b1de9ce07555';
const STYLE_LIGHT = 'c080bb6a-8134-4993-93a1-5b4d8c36a59b';
const MAPGL_PLACEHOLDER_KEY = 'your_2gis_mapgl_key_here';

type MapGLModule = Awaited<ReturnType<typeof load>>;
type MapInstance = InstanceType<MapGLModule['Map']>;
type MarkerInstance = InstanceType<MapGLModule['Marker']>;
type CircleInstance = InstanceType<MapGLModule['Circle']>;
type PolylineInstance = InstanceType<MapGLModule['Polyline']>;

function getOrbitColor(orbitType: string) {
  switch (orbitType?.toUpperCase()) {
    case 'LEO': return '#22d3ee';
    case 'MEO': return '#60a5fa';
    case 'GEO': return '#fbbf24';
    case 'HEO': return '#f87171';
    default: return '#94a3b8';
  }
}

function makeDotSvg(color: string, isSelected: boolean): string {
  const size = isSelected ? 16 : 10;
  const r = size / 2 - 1;
  const borderW = isSelected ? 2 : 1;
  const border = isSelected ? '#ffffff' : color;
  const glow = isSelected ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r + 2}" fill="none" stroke="${color}" stroke-width="1" opacity="0.4"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size + 4}" height="${size + 4}">${glow}<circle cx="${(size + 4) / 2}" cy="${(size + 4) / 2}" r="${r}" fill="${color}" stroke="${border}" stroke-width="${borderW}"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

interface Map2DProps {
  satellites: Satellite[];
  selectedSatellite: Satellite | null;
}

function hasRenderableCoords(lat: number, lng: number, altKm: number) {
  return (
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180 &&
    isRenderableAltitudeKm(altKm)
  );
}

export default function Map2D({ satellites, selectedSatellite }: Map2DProps) {
  const mapRef = useRef<MapInstance | null>(null);
  const mapglRef = useRef<MapGLModule | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, MarkerInstance>>(new Map());
  const orbitLinesRef = useRef<PolylineInstance[]>([]);
  const coverageCircleRef = useRef<CircleInstance | null>(null);
  const clickedMarkerRef = useRef<MarkerInstance | null>(null);
  const satellitesRef = useRef<Satellite[]>(satellites);
  const prevSelectedIdRef = useRef<string | null>(null);
  const prevMapStateRef = useRef<{ center: number[]; zoom: number } | null>(null);
  const markerClickedRef = useRef(false);
  const currentStyleRef = useRef<string | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const positionsRef = useRef<Map<string, SatellitePosition>>(new Map());
  const selectedSatRef = useRef<Satellite | null>(selectedSatellite);
  const isCloseUpRef = useRef(false);
  const selectSatellite = useSatelliteStore((state) => state.selectSatellite);
  const setClickedLocation = useSatelliteStore((state) => state.setClickedLocation);
  const isCloseUp = useSatelliteStore((state) => state.isCloseUp);
  const isDark = useThemeStore((state) => state.isDark);
  satellitesRef.current = satellites;
  selectedSatRef.current = selectedSatellite;
  isCloseUpRef.current = isCloseUp;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!MAPGL_API_KEY || MAPGL_API_KEY === MAPGL_PLACEHOLDER_KEY) {
        setMapError('Для 2D-карты не задан NEXT_PUBLIC_2GIS_MAPGL_KEY.');
        return;
      }

      try {
        const mapgl = await load();
        if (cancelled || !containerRef.current) return;

        mapglRef.current = mapgl;

        const currentTheme = useThemeStore.getState().isDark;
        const initStyle = currentTheme ? STYLE_DARK : STYLE_LIGHT;
        currentStyleRef.current = initStyle;
        const map = new mapgl.Map(containerRef.current, {
          key: MAPGL_API_KEY,
          center: [60, 30],
          zoom: 3,
          zoomControl: true,
          style: initStyle,
          defaultBackgroundColor: currentTheme ? '#1C2429' : '#F5F2E0',
        });

        map.on('click', (e) => {
          if (markerClickedRef.current) {
            markerClickedRef.current = false;
            return;
          }
          const lngLat = e.lngLat;
          setClickedLocation({ lat: lngLat[1], lng: lngLat[0] });
        });

        setMapError(null);
        mapRef.current = map;
        setMapReady(true);
      } catch (error) {
        if (!cancelled) {
          setMapError(
            error instanceof Error
              ? `Не удалось инициализировать 2D-карту: ${error.message}`
              : 'Не удалось инициализировать 2D-карту.'
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      orbitLinesRef.current.forEach((l) => { try { l.destroy(); } catch {} });
      orbitLinesRef.current = [];
      markersRef.current.forEach((m) => { try { m.destroy(); } catch {} });
      markersRef.current.clear();
      if (coverageCircleRef.current) { try { coverageCircleRef.current.destroy(); } catch {} }
      if (clickedMarkerRef.current) { try { clickedMarkerRef.current.destroy(); } catch {} }
      if (mapRef.current) {
        try { mapRef.current.destroy(); } catch {}
        mapRef.current = null;
      }
      mapglRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const targetStyle = isDark ? STYLE_DARK : STYLE_LIGHT;
    if (currentStyleRef.current === targetStyle) return;
    currentStyleRef.current = targetStyle;
    mapRef.current.setStyleById(targetStyle);
  }, [isDark, mapReady]);

  useEffect(() => {
    positionsRef.current = useSatelliteStore.getState().positions;
    const unsub = useSatelliteStore.subscribe((state) => {
      positionsRef.current = state.positions;
    });
    return unsub;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let rafId: number;
    let lastMs = 0;

    const tick = () => {
      const now = performance.now();
      if (now - lastMs >= 50) {
        lastMs = now;
        const positions = positionsRef.current;
        markersRef.current.forEach((marker, id) => {
          const p = positions.get(id);
          if (p) marker.setCoordinates([p.lng, p.lat]);
        });
        if (isCloseUpRef.current && selectedSatRef.current) {
          const p = positions.get(selectedSatRef.current.id);
          if (p) map.setCenter([p.lng, p.lat], { duration: 0 });
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const mapgl = mapglRef.current;
    if (!map || !mapgl || !mapReady) return;

    const currentIds = new Set(satellites.map((s) => s.id));
    const selId = selectedSatellite?.id ?? null;
    const prevSelId = prevSelectedIdRef.current;
    prevSelectedIdRef.current = selId;

    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.destroy();
        markersRef.current.delete(id);
      }
    });

    const needsIconRefresh = new Set<string>();
    if (prevSelId && prevSelId !== selId) needsIconRefresh.add(prevSelId);
    if (selId && selId !== prevSelId) needsIconRefresh.add(selId);

    const positions = positionsRef.current;
    for (const sat of satellites) {
      const pos = positions.get(sat.id);
      const lat = pos?.lat ?? sat.latitude;
      const lng = pos?.lng ?? sat.longitude;
      const altKm = pos?.alt ?? sat.altitude;

      if (!hasRenderableCoords(lat, lng, altKm)) continue;

      const color = getOrbitColor(sat.orbitType);
      const isSelected = selId === sat.id;
      const existing = markersRef.current.get(sat.id);

      if (existing) {
        if (needsIconRefresh.has(sat.id)) {
          const size = isSelected ? 20 : 14;
          existing.setIcon({
            icon: makeDotSvg(color, isSelected),
            size: [size, size],
            anchor: [size / 2, size / 2],
          });
        }
      } else {
        const size = isSelected ? 20 : 14;
        const marker = new mapgl.Marker(map, {
          coordinates: [lng, lat],
          icon: makeDotSvg(color, isSelected),
          size: [size, size],
          anchor: [size / 2, size / 2],
          userData: { satId: sat.id },
        });
        const satId = sat.id;
        marker.on('click', () => {
          markerClickedRef.current = true;
          const s = satellitesRef.current.find((item: Satellite) => item.id === satId);
          if (s) selectSatellite(s);
        });
        markersRef.current.set(sat.id, marker);
      }
    }
  }, [satellites, selectedSatellite, selectSatellite, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (isCloseUp && selectedSatellite) {
      if (!prevMapStateRef.current) {
        prevMapStateRef.current = {
          center: map.getCenter(),
          zoom: map.getZoom(),
        };
      }

      markersRef.current.forEach((marker) => marker.hide());

      const pos = positionsRef.current.get(selectedSatellite.id);
      if (pos) {
        map.setCenter([pos.lng, pos.lat], { duration: 1500 });
        map.setZoom(5, { duration: 1500 });
      }
    } else {
      markersRef.current.forEach((marker) => marker.show());

      if (prevMapStateRef.current) {
        map.setCenter(prevMapStateRef.current.center, { duration: 1500 });
        map.setZoom(prevMapStateRef.current.zoom, { duration: 1500 });
        prevMapStateRef.current = null;
      }
    }
  }, [isCloseUp, selectedSatellite, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const mapgl = mapglRef.current;
    if (!map || !mapgl || !mapReady) return;

    if (coverageCircleRef.current) {
      try { coverageCircleRef.current.destroy(); } catch {}
      coverageCircleRef.current = null;
    }

    if (!selectedSatellite) return;

    const pos = positionsRef.current.get(selectedSatellite.id);
    const lat = pos?.lat ?? selectedSatellite.latitude;
    const lng = pos?.lng ?? selectedSatellite.longitude;
    const altKm = pos?.alt ?? selectedSatellite.altitude;

    if (!hasRenderableCoords(lat, lng, altKm)) return;

    const halfAngle = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm));
    const groundRadiusMeters = EARTH_RADIUS_KM * halfAngle * 1000;
    const color = getOrbitColor(selectedSatellite.orbitType);

    coverageCircleRef.current = new mapgl.Circle(map, {
      coordinates: [lng, lat],
      radius: groundRadiusMeters,
      color: color + '14',
      strokeColor: color + '66',
      strokeWidth: 1.5,
    });
  }, [selectedSatellite, mapReady]);

  useEffect(() => {
    const unsub = useSatelliteStore.subscribe((state, prev) => {
      if (state.clickedLocation !== prev.clickedLocation) {
        const map = mapRef.current;
        const mapgl = mapglRef.current;
        if (!map || !mapgl) return;

        if (clickedMarkerRef.current) {
          try { clickedMarkerRef.current.destroy(); } catch {}
          clickedMarkerRef.current = null;
        }

        const loc = state.clickedLocation;
        if (!loc) return;

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><circle cx="6" cy="6" r="4" fill="#f59e0b" stroke="#ffffff" stroke-width="2"/></svg>`;
        clickedMarkerRef.current = new mapgl.Marker(map, {
          coordinates: [loc.lng, loc.lat],
          icon: `data:image/svg+xml;base64,${btoa(svg)}`,
          size: [12, 12],
          anchor: [6, 6],
        });
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const mapgl = mapglRef.current;
    if (!map || !mapgl || !mapReady) return;

    orbitLinesRef.current.forEach((l) => { try { l.destroy(); } catch {} });
    orbitLinesRef.current = [];

    if (!selectedSatellite) return;
    if (!isRenderableAltitudeKm(selectedSatellite.altitude)) return;

    let cancelled = false;
    const color = getOrbitColor(selectedSatellite.orbitType);

    (async () => {
      try {
        const orbitData = await fetchOrbit(selectedSatellite.id, 2);
        if (cancelled || !mapRef.current) return;
        if (!orbitData || orbitData.length < 2) return;

        const orbitPoints: number[][] = orbitData.map((pt) => [pt.lng, pt.lat]);

        const segments: number[][][] = [];
        let current: number[][] = [];

        for (let i = 0; i < orbitPoints.length; i++) {
          const pt = orbitPoints[i];
          if (current.length > 0) {
            const prev = current[current.length - 1];
            if (Math.abs(pt[0] - prev[0]) > 180) {
              segments.push(current);
              current = [];
            }
          }
          current.push(pt);
        }
        if (current.length > 0) segments.push(current);

        for (const seg of segments) {
          const line = new mapgl.Polyline(map, {
            coordinates: seg,
            width: 2,
            color: color + '80',
            dashLength: 6,
            gapLength: 4,
            gapColor: '#00000000',
          });
          orbitLinesRef.current.push(line);
        }
      } catch (err) {
        console.warn('Failed to fetch orbit for 2D map:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedSatellite, mapReady]);

  return (
    <div className="relative w-full h-full" style={{ background: '#0a1628' }}>
      <div ref={containerRef} className="absolute inset-0" />
      {mapError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0a1628]/90 px-6 text-center">
          <div className="panel-base max-w-md p-5">
            <p className="text-sm font-semibold text-[#eef2ff]">
              2D-карта недоступна
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[#94a3c0]">
              {mapError}
            </p>
          </div>
        </div>
      )}
      {isCloseUp && selectedSatellite && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <SatelliteModel3D />
        </div>
      )}
    </div>
  );
}
