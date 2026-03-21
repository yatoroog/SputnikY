'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Satellite, SatellitePosition } from '@/types';
import { useSatelliteStore } from '@/store/satelliteStore';
import { isRenderableAltitudeKm } from '@/lib/utils';
import { fetchOrbit } from '@/lib/api';

const SatelliteModel3D = dynamic(() => import('./SatelliteModel3D'), {
  ssr: false,
});

const EARTH_RADIUS_KM = 6_371;

/* ── orbit-type palette (matches CesiumGlobe) ───────────── */

function getOrbitColor(orbitType: string) {
  switch (orbitType?.toUpperCase()) {
    case 'LEO':
      return '#22d3ee';
    case 'MEO':
      return '#60a5fa';
    case 'GEO':
      return '#fbbf24';
    case 'HEO':
      return '#f87171';
    default:
      return '#94a3b8';
  }
}

/* ── 2GIS type stubs ─────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DGMap = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DGMarker = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DGPolyline = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DGCircle = any;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    DG?: any;
  }
}

/* ── helpers ─────────────────────────────────────────────── */

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

function makeDotIcon(
  DG: NonNullable<typeof window.DG>,
  color: string,
  isSelected: boolean
) {
  const size = isSelected ? 14 : 8;
  const borderW = isSelected ? 2 : 1;
  const border = isSelected ? '#fff' : color;
  const shadow = isSelected ? `0 0 14px ${color}` : `0 0 4px ${color}80`;
  return DG.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border-radius:50%;
      border:${borderW}px solid ${border};
      box-shadow:${shadow};
      pointer-events:auto;cursor:pointer;
    "></div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function applyMarkerTransition(marker: DGMarker) {
  const markerElement = (marker as { _icon?: HTMLElement; getElement?: () => HTMLElement | null })
    .getElement?.() ?? (marker as { _icon?: HTMLElement })._icon;

  if (markerElement) {
    markerElement.style.transition = 'transform 220ms linear';
    markerElement.style.willChange = 'transform';
  }
}

/* ── component ───────────────────────────────────────────── */

export default function Map2D({ satellites, selectedSatellite }: Map2DProps) {
  const mapRef = useRef<DGMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, DGMarker>>(new Map());
  const orbitLinesRef = useRef<DGPolyline[]>([]);
  const coverageCircleRef = useRef<DGCircle | null>(null);
  const clickedMarkerRef = useRef<DGMarker | null>(null);
  const satellitesRef = useRef<Satellite[]>(satellites);
  const prevSelectedIdRef = useRef<string | null>(null);

  const prevMapStateRef = useRef<{ center: [number, number]; zoom: number } | null>(null);

  const [mapReady, setMapReady] = useState(false);

  const positionsRef = useRef<Map<string, SatellitePosition>>(new Map());
  const selectedSatRef = useRef<Satellite | null>(selectedSatellite);
  const isCloseUpRef = useRef(false);
  const selectSatellite = useSatelliteStore((state) => state.selectSatellite);
  const setClickedLocation = useSatelliteStore((state) => state.setClickedLocation);
  const isCloseUp = useSatelliteStore((state) => state.isCloseUp);
  satellitesRef.current = satellites;
  selectedSatRef.current = selectedSatellite;
  isCloseUpRef.current = isCloseUp;

  /* ── load 2GIS script ──────────────────────────────────── */

  const loadDGScript = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      if (window.DG) {
        resolve();
        return;
      }
      const existing = document.querySelector('script[src*="maps.api.2gis.ru"]');
      if (existing) {
        const check = setInterval(() => {
          if (window.DG) { clearInterval(check); resolve(); }
        }, 100);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://maps.api.2gis.ru/2.0/loader.js?pkg=full';
      script.async = true;
      script.onload = () => {
        const check = setInterval(() => {
          if (window.DG) { clearInterval(check); resolve(); }
        }, 100);
      };
      document.head.appendChild(script);
    });
  }, []);

  /* ── init map ──────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await loadDGScript();
      if (cancelled || !containerRef.current || !window.DG) return;

      window.DG.then(() => {
        if (cancelled || !containerRef.current || !window.DG) return;

        const map = window.DG.map(containerRef.current, {
          center: [30, 60],
          zoom: 3,
          scrollWheelZoom: true,
          zoomControl: true,
        });

        // Click on empty area
        map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
          setClickedLocation({ lat: e.latlng.lat, lng: e.latlng.lng });
        });

        mapRef.current = map;
        setMapReady(true);
      });
    })();

    return () => {
      cancelled = true;
      orbitLinesRef.current.forEach((l) => { try { l.remove(); } catch {} });
      orbitLinesRef.current = [];
      markersRef.current.forEach((m) => { try { m.remove(); } catch {} });
      markersRef.current.clear();
      if (coverageCircleRef.current) { try { coverageCircleRef.current.remove(); } catch {} }
      if (clickedMarkerRef.current) { try { clickedMarkerRef.current.remove(); } catch {} }
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch {}
        mapRef.current = null;
      }
      setMapReady(false);
    };
  }, [loadDGScript, setClickedLocation]);

  /* ── subscribe to positions without re-renders ────────── */

  useEffect(() => {
    positionsRef.current = useSatelliteStore.getState().positions;
    const unsub = useSatelliteStore.subscribe((state) => {
      positionsRef.current = state.positions;
    });
    return unsub;
  }, []);

  /* ── RAF position update loop (decoupled from React) ─── */

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
          if (p) marker.setLatLng([p.lat, p.lng]);
        });
        const sel = selectedSatRef.current;
        if (coverageCircleRef.current && sel) {
          const p = positions.get(sel.id);
          if (p) coverageCircleRef.current.setLatLng([p.lat, p.lng]);
        }
        // Follow selected satellite in close-up mode
        if (isCloseUpRef.current && sel && map) {
          const p = positions.get(sel.id);
          if (p) map.panTo([p.lat, p.lng], { animate: false });
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [mapReady]);

  /* ── update markers ────────────────────────────────────── */

  useEffect(() => {
    const map = mapRef.current;
    const DG = window.DG;
    if (!map || !DG || !mapReady) return;

    const currentIds = new Set(satellites.map((s) => s.id));
    const selId = selectedSatellite?.id ?? null;
    const prevSelId = prevSelectedIdRef.current;
    prevSelectedIdRef.current = selId;

    // Remove stale markers
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // IDs that need icon refresh (selection changed)
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
        // Only refresh icon if selection state changed for this marker
        if (needsIconRefresh.has(sat.id)) {
          existing.setIcon(makeDotIcon(DG, color, isSelected));
          applyMarkerTransition(existing);
        }
      } else {
        const icon = makeDotIcon(DG, color, isSelected);
        const marker = DG.marker([lat, lng], { icon }).addTo(map);
        applyMarkerTransition(marker);
        marker.bindPopup(
          `<b>${sat.name}</b><br>` +
            `<small>${sat.orbitType} | ${altKm.toFixed(1)} km | NORAD ${sat.noradId}</small>`
        );
        const satId = sat.id;
        marker.on('click', (e: { originalEvent?: { stopPropagation?: () => void } }) => {
          if (e.originalEvent?.stopPropagation) e.originalEvent.stopPropagation();
          const s = satellitesRef.current.find((item: Satellite) => item.id === satId);
          if (s) selectSatellite(s);
        });
        markersRef.current.set(sat.id, marker);
      }
    }
  }, [satellites, selectedSatellite, selectSatellite, mapReady]);

  /* ── close-up mode: zoom, hide markers, save/restore state ── */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (isCloseUp && selectedSatellite) {
      // Save current map state (only on first entry)
      if (!prevMapStateRef.current) {
        const c = map.getCenter();
        prevMapStateRef.current = {
          center: [c.lat, c.lng],
          zoom: map.getZoom(),
        };
      }

      // Hide all markers
      markersRef.current.forEach((marker: DGMarker) => {
        const el =
          (marker as { _icon?: HTMLElement })._icon ??
          (marker as { getElement?: () => HTMLElement | null }).getElement?.();
        if (el) el.style.display = 'none';
      });

      // Zoom close to satellite
      const pos = positionsRef.current.get(selectedSatellite.id);
      if (pos) {
        map.setView([pos.lat, pos.lng], 5, { animate: true, duration: 1.5 });
      }
    } else {
      // Show all markers
      markersRef.current.forEach((marker: DGMarker) => {
        const el =
          (marker as { _icon?: HTMLElement })._icon ??
          (marker as { getElement?: () => HTMLElement | null }).getElement?.();
        if (el) el.style.display = '';
      });

      // Restore previous map state
      if (prevMapStateRef.current) {
        map.setView(
          prevMapStateRef.current.center,
          prevMapStateRef.current.zoom,
          { animate: true, duration: 1.5 }
        );
        prevMapStateRef.current = null;
      }
    }
  }, [isCloseUp, selectedSatellite, mapReady]);

  /* ── coverage zone ───────────────────────────────────────── */

  useEffect(() => {
    const map = mapRef.current;
    const DG = window.DG;
    if (!map || !DG || !mapReady) return;

    if (coverageCircleRef.current) {
      try { coverageCircleRef.current.remove(); } catch {}
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

    coverageCircleRef.current = DG.circle([lat, lng], {
      radius: groundRadiusMeters,
      color: color,
      weight: 1.5,
      opacity: 0.4,
      fillColor: color,
      fillOpacity: 0.08,
    }).addTo(map);
  }, [selectedSatellite, mapReady]);

  /* ── clicked location marker ──────────────────────────── */

  useEffect(() => {
    const unsub = useSatelliteStore.subscribe((state, prev) => {
      if (state.clickedLocation !== prev.clickedLocation) {
        const map = mapRef.current;
        const DG = window.DG;
        if (!map || !DG) return;

        if (clickedMarkerRef.current) {
          try { clickedMarkerRef.current.remove(); } catch {}
          clickedMarkerRef.current = null;
        }

        const loc = state.clickedLocation;
        if (!loc) return;

        const icon = DG.divIcon({
          html: `<div style="
            width:12px;height:12px;
            background:#f59e0b;
            border-radius:50%;
            border:2px solid #fff;
            box-shadow:0 0 10px #f59e0b80;
          "></div>`,
          className: '',
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        clickedMarkerRef.current = DG.marker([loc.lat, loc.lng], { icon }).addTo(map);
      }
    });
    return unsub;
  }, []);

  /* ── orbit path ────────────────────────────────────────── */

  useEffect(() => {
    const map = mapRef.current;
    const DG = window.DG;
    if (!map || !DG || !mapReady) return;

    // Remove old orbit lines
    orbitLinesRef.current.forEach((l) => { try { l.remove(); } catch {} });
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

        const orbitPoints: [number, number][] = orbitData.map((pt) => [pt.lat, pt.lng]);

        // Split at antimeridian crossings
        const segments: [number, number][][] = [];
        let current: [number, number][] = [];

        for (let i = 0; i < orbitPoints.length; i++) {
          const pt = orbitPoints[i];
          if (current.length > 0) {
            const prev = current[current.length - 1];
            if (Math.abs(pt[1] - prev[1]) > 180) {
              segments.push(current);
              current = [];
            }
          }
          current.push(pt);
        }
        if (current.length > 0) segments.push(current);

        for (const seg of segments) {
          const line = DG.polyline(seg, {
            color,
            weight: 1.5,
            opacity: 0.5,
            dashArray: '6,4',
          }).addTo(map);
          orbitLinesRef.current.push(line);
        }
      } catch (err) {
        console.warn('Failed to fetch orbit for 2D map:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedSatellite, mapReady]);

  /* ── render ─────────────────────────────────────────────── */

  return (
    <div className="relative w-full h-full" style={{ background: '#0a1628' }}>
      <div ref={containerRef} className="absolute inset-0" />
      {isCloseUp && selectedSatellite && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <SatelliteModel3D />
        </div>
      )}
    </div>
  );
}
