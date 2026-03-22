'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import type { Satellite, SatellitePosition, OrbitPoint } from '@/types';
import { fetchOrbit } from '@/lib/api';
import { isRenderableAltitudeKm } from '@/lib/utils';

if (typeof window !== 'undefined') {
  window.CESIUM_BASE_URL = '/cesium';
}

const EARTH_RADIUS_KM = 6_371;
const EARTH_RADIUS_METERS = 6_378_137;
const INITIAL_CAMERA_RANGE_METERS = 22_000_000;

const GLOBE_BACKGROUND = '#010108';
const GLOBE_BASE = '#03050a';
const GLOBE_COUNTRY_STROKE = '#c4cedd';
const LABEL_COLOR = '#f8fafc';
const ORBIT_COLOR = '#a855f7';
const COVERAGE_COLOR = '#a855f7';
const EARTH_DAY_TEXTURE_URL = '/images/earth/earth-day-blue-marble.jpg?v=20260321b';
const EARTH_NIGHT_TEXTURE_URL = '/images/earth/earth-night-lights.jpg?v=20260321c';
const EARTH_DAY_NIGHT_ALPHA = 0.12;
const EARTH_LIGHTS_DAY_ALPHA = 0.0;
const EARTH_LIGHTS_NIGHT_ALPHA = 1.0;
const ORBIT_VISUAL_LIFT_MIN_KM = 150;
const ORBIT_VISUAL_LIFT_MAX_KM = 500;

function getOrbitPointColor(orbitType: string) {
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

function getOrbitTrackColor(orbitType: string) {
  return orbitType ? getOrbitPointColor(orbitType) : ORBIT_COLOR;
}

function getOrbitVisualAltitudeKm(altKm: number) {
  const liftKm = Math.min(
    ORBIT_VISUAL_LIFT_MAX_KM,
    Math.max(ORBIT_VISUAL_LIFT_MIN_KM, altKm * 0.08)
  );
  return altKm + liftKm;
}

interface CesiumGlobeProps {
  satellites: Satellite[];
  selectedSatellite: Satellite | null;
}

interface RenderPosition {
  lat: number;
  lng: number;
  altKm: number;
}

interface MotionState {
  from: RenderPosition;
  to: RenderPosition;
  startedAtMs: number;
  durationMs: number;
}

function isSameRenderPosition(a: RenderPosition, b: RenderPosition) {
  return (
    Math.abs(a.lat - b.lat) < 0.00001 &&
    Math.abs(a.lng - b.lng) < 0.00001 &&
    Math.abs(a.altKm - b.altKm) < 0.005
  );
}

function hasRenderableCoordinates(lat: number, lng: number, altKm: number) {
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

function normalizeLng(lng: number) {
  let normalized = lng;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

function interpolateLongitude(from: number, to: number, progress: number) {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return normalizeLng(from + delta * progress);
}

function getMotionPosition(motion: MotionState, nowMs: number): RenderPosition {
  if (motion.durationMs <= 0) return motion.to;
  const progress = Math.min(1, Math.max(0, (nowMs - motion.startedAtMs) / motion.durationMs));
  return {
    lat: motion.from.lat + (motion.to.lat - motion.from.lat) * progress,
    lng: interpolateLongitude(motion.from.lng, motion.to.lng, progress),
    altKm: motion.from.altKm + (motion.to.altKm - motion.from.altKm) * progress,
  };
}

// Цвет траектории
const ORBIT_TRACK_COLORS = ['#a855f7', '#60a5fa', '#34d399', '#f59e0b', '#f87171'];

/**
 * Строит замкнутый эллипс орбиты.
 *
 * Ключевое отличие от старого подхода:
 * - Нормаль к плоскости орбиты h = r × v, где v — вектор скорости from→to.
 * - h стабильна по всей орбите и не меняет знак на полюсах.
 * - f1 = r (текущая позиция), f2 = h × r (вдоль движения).
 * - Это даёт правильный замкнутый эллипс без разворота на 180°.
 *
 * @param fromLat/fromLng — предыдущая позиция (для вектора скорости)
 */
function computeFullOrbitPoints(
  Cesium: typeof import('cesium'),
  latDeg: number, lngDeg: number, altKm: number,
  fromLatDeg: number, fromLngDeg: number
): InstanceType<typeof import('cesium').Cartesian3>[] {
  const D2R = Math.PI / 180;
  const altM = altKm * 1000;

  // Текущая позиция — единичный вектор r
  const latR = latDeg * D2R, lngR = lngDeg * D2R;
  const rx = Math.cos(latR) * Math.cos(lngR);
  const ry = Math.cos(latR) * Math.sin(lngR);
  const rz = Math.sin(latR);

  // Вектор скорости из from→to в ECEF, проецируем на плоскость ⊥ r
  const fLatR = fromLatDeg * D2R, fLngR = fromLngDeg * D2R;
  let vx = rx - Math.cos(fLatR) * Math.cos(fLngR);
  let vy = ry - Math.cos(fLatR) * Math.sin(fLngR);
  let vz = rz - Math.sin(fLatR);
  // Убираем радиальную компоненту
  const vDotR = vx*rx + vy*ry + vz*rz;
  vx -= vDotR*rx; vy -= vDotR*ry; vz -= vDotR*rz;
  let vLen = Math.sqrt(vx*vx + vy*vy + vz*vz);
  if (vLen < 1e-10) {
    // Нет данных о скорости — используем восток
    vx = -Math.sin(lngR); vy = Math.cos(lngR); vz = 0;
    vLen = Math.sqrt(vx*vx + vy*vy);
  }
  vx /= vLen; vy /= vLen; vz /= vLen;

  // Нормаль плоскости орбиты h = r × v (стабильна по всей орбите)
  const hx = ry*vz - rz*vy;
  const hy = rz*vx - rx*vz;
  const hz = rx*vy - ry*vx;
  const hLen = Math.sqrt(hx*hx + hy*hy + hz*hz);
  const hnx = hx/hLen, hny = hy/hLen, hnz = hz/hLen;

  // f2 = h × r — вектор в направлении движения спутника
  const f1x = rx, f1y = ry, f1z = rz;
  const f2x = hny*rz - hnz*ry;
  const f2y = hnz*rx - hnx*rz;
  const f2z = hnx*ry - hny*rx;
  const f2Len = Math.sqrt(f2x*f2x + f2y*f2y + f2z*f2z);
  const e2x = f2x/f2Len, e2y = f2y/f2Len, e2z = f2z/f2Len;

  const steps = 360;
  const points: InstanceType<typeof import('cesium').Cartesian3>[] = [];

  for (let i = 0; i <= steps; i++) {
    const u = (2 * Math.PI * i) / steps;
    const c = Math.cos(u), s = Math.sin(u);
    const qx = c*f1x + s*e2x;
    const qy = c*f1y + s*e2y;
    const qz = c*f1z + s*e2z;
    const qLat = Math.asin(Math.max(-1, Math.min(1, qz))) * 180 / Math.PI;
    const qLon = Math.atan2(qy, qx) * 180 / Math.PI;
    points.push(Cesium.Cartesian3.fromDegrees(qLon, qLat, altM));
  }

  return points;
}


async function loadEarthImageryLayers(
  Cesium: typeof import('cesium'),
  viewer: InstanceType<typeof import('cesium').Viewer>
) {
  const [dayProvider, nightProvider] = await Promise.all([
    Cesium.SingleTileImageryProvider.fromUrl(EARTH_DAY_TEXTURE_URL, {
      credit: new Cesium.Credit('NASA Blue Marble Next Generation'),
    }),
    Cesium.SingleTileImageryProvider.fromUrl(EARTH_NIGHT_TEXTURE_URL, {
      credit: new Cesium.Credit('NASA Earth at Night'),
    }),
  ]);

  if (viewer.isDestroyed()) return;

  viewer.imageryLayers.removeAll();

  const dayLayer = viewer.imageryLayers.addImageryProvider(dayProvider);
  dayLayer.dayAlpha = 1.0;
  dayLayer.nightAlpha = EARTH_DAY_NIGHT_ALPHA;
  dayLayer.brightness = 1.0;
  dayLayer.contrast = 1.06;
  dayLayer.gamma = 1.03;
  dayLayer.saturation = 1.05;

  const nightLayer = viewer.imageryLayers.addImageryProvider(nightProvider);
  nightLayer.dayAlpha = EARTH_LIGHTS_DAY_ALPHA;
  nightLayer.nightAlpha = EARTH_LIGHTS_NIGHT_ALPHA;
  nightLayer.brightness = 1.18;
  nightLayer.contrast = 1.32;
  nightLayer.gamma = 1.02;
  nightLayer.saturation = 1.1;
}

// Пересоздаёт GroundPrimitive зоны покрытия по новым координатам.
// Старые примитивы удаляются ПОСЛЕ добавления новых — нет мигания.
function rebuildCoverageGP(
  Cesium: typeof import('cesium'),
  viewer: InstanceType<typeof import('cesium').Viewer>,
  lng: number, lat: number, radiusMeters: number,
  color: InstanceType<typeof import('cesium').Color>
): {
  fill: InstanceType<typeof import('cesium').GroundPrimitive>,
  border: InstanceType<typeof import('cesium').GroundPolylinePrimitive>
} {
  const fill = new Cesium.GroundPrimitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.EllipseGeometry({
        center: Cesium.Cartesian3.fromDegrees(lng, lat),
        semiMajorAxis: radiusMeters,
        semiMinorAxis: radiusMeters,
        granularity: Cesium.Math.toRadians(1),
      }),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(0.18)),
      },
    }),
    asynchronous: false,
  });

  // Граница — геодезическая окружность
  const pts: InstanceType<typeof Cesium.Cartesian3>[] = [];
  const N = 120;
  const d = radiusMeters / (6371 * 1000);
  const lat0 = lat * Math.PI / 180;
  const lng0 = lng * Math.PI / 180;
  for (let i = 0; i <= N; i++) {
    const b = (2 * Math.PI * i) / N;
    const lat1 = Math.asin(Math.sin(lat0)*Math.cos(d) + Math.cos(lat0)*Math.sin(d)*Math.cos(b));
    const lng1 = lng0 + Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat0), Math.cos(d)-Math.sin(lat0)*Math.sin(lat1));
    pts.push(Cesium.Cartesian3.fromRadians(lng1, lat1));
  }
  const border = new Cesium.GroundPolylinePrimitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.GroundPolylineGeometry({ positions: pts, width: 2 }),
      attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(0.9)) },
    }),
    appearance: new Cesium.PolylineColorAppearance(),
    asynchronous: false,
  });

  viewer.scene.groundPrimitives.add(fill);
  viewer.scene.groundPrimitives.add(border);
  return { fill, border };
}

export default function CesiumGlobe({ satellites, selectedSatellite }: CesiumGlobeProps) {
  const viewerRef = useRef<InstanceType<typeof import('cesium').Viewer> | null>(null);
  const pointCollectionRef = useRef<
    InstanceType<typeof import('cesium').PointPrimitiveCollection> | null
  >(null);
  const pointMapRef = useRef<
    Map<string, InstanceType<typeof import('cesium').PointPrimitive>>
  >(new Map());

  const orbitEntitiesRef    = useRef<InstanceType<typeof import('cesium').Entity>[]>([]);
  const orbitPrimitivesRef  = useRef<InstanceType<typeof import('cesium').Primitive> | null>(null);
  const orbitSatIdRef       = useRef<string | null>(null);
  // Статичная орбита: функция перестройки + последняя позиция (для smooth redraw)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orbitDrawFnRef      = useRef<((...args: any[]) => any) | null>(null);
  const orbitLastPosRef     = useRef<{ lat: number; lng: number; altKm: number } | null>(null);
  const orbitLiveSatIdRef   = useRef<string | null>(null);
  const orbitLiveIncRef     = useRef<number>(0);
  // Coverage GP
  const nadirRef            = useRef<InstanceType<typeof import('cesium').Entity> | null>(null);
  const coverageSatIdRef    = useRef<string | null>(null);
  const coveragePosRef      = useRef<{ lng: number; lat: number; altKm: number } | null>(null);
  const coverageGPFillRef   = useRef<InstanceType<typeof import('cesium').GroundPrimitive> | null>(null);
  const coverageGPBorderRef = useRef<InstanceType<typeof import('cesium').GroundPolylinePrimitive> | null>(null);
  const coverageRadiusRef   = useRef<number>(0);
  const coverageGPLastRef   = useRef<{ lng: number; lat: number } | null>(null);
  const coverageFillRef     = useRef<InstanceType<typeof import('cesium').Entity> | null>(null);
  const coverageBorderRef   = useRef<InstanceType<typeof import('cesium').Entity> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildCoverageGPRef  = useRef<((...args: any[]) => any) | null>(null);


  const labelRef = useRef<InstanceType<typeof import('cesium').Entity> | null>(null);
  // Текущая позиция метки — обновляется каждый кадр через CallbackProperty
  const labelPosRef = useRef<{ lng: number; lat: number; altKm: number } | null>(null);
  const clickLocationRef = useRef<InstanceType<typeof import('cesium').Entity> | null>(null);
  const clickHandlerRef = useRef<InstanceType<
    typeof import('cesium').ScreenSpaceEventHandler
  > | null>(null);
  const bordersRef = useRef<InstanceType<typeof import('cesium').GeoJsonDataSource> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cesiumRef = useRef<typeof import('cesium') | null>(null);
  const satellitesRef = useRef<Satellite[]>(satellites);
  const selectedSatelliteRef = useRef<Satellite | null>(selectedSatellite);
  const pointMotionRef = useRef<Map<string, MotionState>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const renderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSnapshotRef = useRef<number | null>(null);
  const userInteractingRef = useRef(false);
  const modelEntityRef = useRef<InstanceType<typeof import('cesium').Entity> | null>(null);
  const prevCameraRef = useRef<{
    position: InstanceType<typeof import('cesium').Cartesian3>;
    direction: InstanceType<typeof import('cesium').Cartesian3>;
    up: InstanceType<typeof import('cesium').Cartesian3>;
  } | null>(null);
  const isCloseUpRef = useRef(false);
  const closeUpRangeRef = useRef(4_000_000);
  const closeUpTrackingRef = useRef(false);
  const lastFrameMsRef = useRef(performance.now());
  const lastStoreTimeMsRef = useRef(0);
  const lastStoreWallMsRef = useRef(performance.now());
  const groundViewActiveRef = useRef(false);
  const groundViewEntitiesRef = useRef<Map<string, InstanceType<typeof import('cesium').Entity>>>(new Map());

  const [viewerState, setViewerState] = useState<'initializing' | 'ready' | 'error'>('initializing');
  const [viewerError, setViewerError] = useState<string | null>(null);

  const positionsRef = useRef<Map<string, SatellitePosition>>(new Map());
  const selectSatellite = useSatelliteStore((state) => state.selectSatellite);
  const setClickedLocation = useSatelliteStore((state) => state.setClickedLocation);

  satellitesRef.current = satellites;
  selectedSatelliteRef.current = selectedSatellite;

  const drawOrbitSegments = useCallback((
    orbitType: string,
    segments: InstanceType<typeof import('cesium').Cartesian3>[][]
  ) => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || viewer.isDestroyed() || !Cesium) return;

    const color = Cesium.Color.fromCssColorString(getOrbitTrackColor(orbitType));

    for (const segment of segments) {
      if (segment.length < 2) continue;

      const glowEntity = viewer.entities.add({
        polyline: {
          positions: segment,
          width: 8,
          material: new Cesium.PolylineGlowMaterialProperty({
            color: color.withAlpha(0.2),
            glowPower: 0.2,
            taperPower: 0.75,
          }),
          clampToGround: false,
          arcType: Cesium.ArcType.NONE,
          depthFailMaterial: new Cesium.PolylineGlowMaterialProperty({
            color: color.withAlpha(0.12),
            glowPower: 0.16,
            taperPower: 0.75,
          }),
        },
      });
      orbitEntitiesRef.current.push(glowEntity);

      const dashEntity = viewer.entities.add({
        polyline: {
          positions: segment,
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({
            color: color.withAlpha(0.95),
            dashLength: 18,
            dashPattern: 0xf0f0,
          }),
          clampToGround: false,
          arcType: Cesium.ArcType.NONE,
          depthFailMaterial: new Cesium.PolylineDashMaterialProperty({
            color: color.withAlpha(0.45),
            dashLength: 18,
            dashPattern: 0xf0f0,
          }),
        },
      });
      orbitEntitiesRef.current.push(dashEntity);
    }
  }, []);

  const clearOrbit = useCallback(() => {
    orbitSatIdRef.current    = null;
    orbitLiveSatIdRef.current = null;
    orbitDrawFnRef.current   = null;
    orbitLastPosRef.current  = null;
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    for (const entity of orbitEntitiesRef.current) {
      try { viewer.entities.remove(entity); } catch {}
    }
    orbitEntitiesRef.current = [];
    if (orbitPrimitivesRef.current) {
      try { viewer.scene.primitives.remove(orbitPrimitivesRef.current); } catch {}
      orbitPrimitivesRef.current = null;
    }
  }, []);

  const clearCoverage = useCallback(() => {
    coverageSatIdRef.current  = null;
    coveragePosRef.current    = null;
    coverageGPLastRef.current = null;
    buildCoverageGPRef.current = null;
    const v = viewerRef.current;
    if (!v || v.isDestroyed()) return;
    if (coverageGPFillRef.current)   { try { v.scene.groundPrimitives.remove(coverageGPFillRef.current); }   catch {} coverageGPFillRef.current = null; }
    if (coverageGPBorderRef.current) { try { v.scene.groundPrimitives.remove(coverageGPBorderRef.current); } catch {} coverageGPBorderRef.current = null; }
    if (nadirRef.current)            { try { v.entities.remove(nadirRef.current); }          catch {} nadirRef.current = null; }
    coverageFillRef.current   = null;
    coverageBorderRef.current = null;
  }, []);

  const drawInstant = useCallback((satellite: Satellite) => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || viewer.isDestroyed() || !Cesium) return;

    const position = positionsRef.current.get(satellite.id);
    const lat = position?.lat ?? satellite.latitude;
    const lng = position?.lng ?? satellite.longitude;
    const altKm = position?.alt ?? satellite.altitude;

    console.log('[drawInstant]', satellite.name, { lat, lng, altKm, inc: satellite.inclination, hasPos: !!position });

    if (!hasRenderableCoordinates(lat, lng, altKm)) {
      console.warn('[drawInstant] NOT renderable — skipping', { lat, lng, altKm });
      return;
    }

    clearOrbit();

    // ── Орбита: статичный Primitive, один раз при выборе ──────────────────────
    const periodMin = satellite.period > 0 ? satellite.period : 90;
    orbitLiveSatIdRef.current = satellite.id;

    // Функция построения орбиты — принимает текущую и предыдущую позицию.
    // Предыдущая позиция нужна для вычисления вектора скорости (направления орбиты).
    const buildOrbitPrimitive = (
      C: typeof Cesium, v: typeof viewer,
      pLat: number, pLng: number, pAlt: number,
      fLat: number, fLng: number  // from-позиция для вектора скорости
    ) => {
      const pts = computeFullOrbitPoints(C, pLat, pLng, pAlt, fLat, fLng);
      const orbitColor = C.Color.fromCssColorString(ORBIT_TRACK_COLORS[0]);
      const prim = v.scene.primitives.add(new C.Primitive({
        geometryInstances: new C.GeometryInstance({
          geometry: new C.PolylineGeometry({
            positions: pts,
            width: 2,
            arcType: C.ArcType.NONE,
          }),
          attributes: {
            color: C.ColorGeometryInstanceAttribute.fromColor(orbitColor.withAlpha(0.9)),
          },
        }),
        appearance: new C.PolylineColorAppearance({ translucent: true }),
        asynchronous: false,
      }));
      return prim;
    };

    const motion0 = pointMotionRef.current.get(satellite.id);
    const fromLat0 = motion0?.from.lat ?? (lat - 0.01);
    const fromLng0 = motion0?.from.lng ?? lng;

    orbitPrimitivesRef.current = buildOrbitPrimitive(Cesium, viewer, lat, lng, altKm, fromLat0, fromLng0);
    orbitDrawFnRef.current = buildOrbitPrimitive;
    orbitLastPosRef.current = { lat, lng, altKm };

    clearCoverage();

    // ── Зона покрытия ─────────────────────────────────────────────────────────
    const horizonRatio = Math.min(0.999, EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm));
    const angleRad = Math.acos(horizonRatio);
    const cappedAngle = Math.min(angleRad, Math.PI * 80 / 180);
    const radiusMeters = EARTH_RADIUS_KM * cappedAngle * 1000;
    const color = Cesium.Color.fromCssColorString(COVERAGE_COLOR);

    coveragePosRef.current  = { lng, lat, altKm };
    coverageRadiusRef.current = radiusMeters;

    // buildGP — создаёт GroundPrimitive для покрытия (без артефактов)
    const buildGP = (C: typeof Cesium, v: typeof viewer, pLng: number, pLat: number, r: number) => {
      const gpFill = new C.GroundPrimitive({
        geometryInstances: new C.GeometryInstance({
          geometry: new C.EllipseGeometry({
            center: C.Cartesian3.fromDegrees(pLng, pLat),
            semiMajorAxis: r, semiMinorAxis: r,
            granularity: C.Math.toRadians(1),
          }),
          attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(0.18)) },
        }),
        asynchronous: false,
      });
      const borderPts: InstanceType<typeof C.Cartesian3>[] = [];
      const N = 120, d = r / (EARTH_RADIUS_KM * 1000);
      const lat0r = pLat * Math.PI / 180, lng0r = pLng * Math.PI / 180;
      for (let i = 0; i <= N; i++) {
        const b = (2 * Math.PI * i) / N;
        const la1 = Math.asin(Math.sin(lat0r)*Math.cos(d) + Math.cos(lat0r)*Math.sin(d)*Math.cos(b));
        const lo1 = lng0r + Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat0r), Math.cos(d)-Math.sin(lat0r)*Math.sin(la1));
        borderPts.push(C.Cartesian3.fromRadians(lo1, la1));
      }
      const gpBorder = new C.GroundPolylinePrimitive({
        geometryInstances: new C.GeometryInstance({
          geometry: new C.GroundPolylineGeometry({ positions: borderPts, width: 2 }),
          attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(0.9)) },
        }),
        appearance: new C.PolylineColorAppearance(),
        asynchronous: false,
      });
      v.scene.groundPrimitives.add(gpFill);
      v.scene.groundPrimitives.add(gpBorder);
      return { gpFill, gpBorder };
    };

    const { gpFill: gf0, gpBorder: gb0 } = buildGP(Cesium, viewer, lng, lat, radiusMeters);
    coverageGPFillRef.current   = gf0;
    coverageGPBorderRef.current = gb0;
    coverageGPLastRef.current   = { lng, lat };
    (buildCoverageGPRef as React.MutableRefObject<typeof buildGP>).current = buildGP;

    // Надир-линия
    nadirRef.current = viewer.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const p = coveragePosRef.current;
          return [
            Cesium.Cartesian3.fromDegrees(p ? p.lng : lng, p ? p.lat : lat, (p ? p.altKm : altKm) * 1000),
            Cesium.Cartesian3.fromDegrees(p ? p.lng : lng, p ? p.lat : lat, 0),
          ];
        }, false) as never,
        width: 1,
        material: new Cesium.PolylineDashMaterialProperty({
          color: color.withAlpha(0.4),
          dashLength: 14,
          dashPattern: 0xff00,
        }),
        clampToGround: false,
        arcType: Cesium.ArcType.NONE,
        depthFailMaterial: new Cesium.PolylineDashMaterialProperty({
          color: color.withAlpha(0.12),
          dashLength: 14,
          dashPattern: 0xff00,
        }),
      },
    });

    coverageSatIdRef.current = satellite.id;
    viewer.scene.requestRender();
    console.log('[drawInstant] done — orbit+coverage built');
  }, [clearOrbit, clearCoverage]);

  const initViewer = useCallback(async () => {
    if (!containerRef.current || viewerRef.current) return;

    setViewerState('initializing');
    setViewerError(null);

    try {
      const Cesium = await import('cesium');
      await import('cesium/Build/Cesium/Widgets/widgets.css').catch(() => {});

      if (viewerRef.current) return;
      cesiumRef.current = Cesium;

      const token = process.env.NEXT_PUBLIC_CESIUM_TOKEN;
      if (token && token !== 'your_cesium_ion_token_here') {
        Cesium.Ion.defaultAccessToken = token;
      }

      let viewer: InstanceType<typeof Cesium.Viewer>;
      try {
        viewer = new Cesium.Viewer(containerRef.current, {
          baseLayer: false,
          timeline: false,
          animation: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
          skyBox: new Cesium.SkyBox({
            sources: {
              positiveX: '/images/skybox/px.jpg',
              negativeX: '/images/skybox/nx.jpg',
              positiveY: '/images/skybox/py.jpg',
              negativeY: '/images/skybox/ny.jpg',
              positiveZ: '/images/skybox/pz.jpg',
              negativeZ: '/images/skybox/nz.jpg',
            },
          }),
          showRenderLoopErrors: false,
          scene3DOnly: true,
          useBrowserRecommendedResolution: true,
          orderIndependentTranslucency: false,
          creditContainer: document.createElement('div'),
        } as Record<string, unknown>);
      } catch (error) {
        containerRef.current.innerHTML = '';
        setViewerState('error');
        setViewerError(
          error instanceof Error ? error.message : 'Ошибка инициализации Cesium'
        );
        return;
      }

      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString(GLOBE_BACKGROUND);
      viewer.scene.fog.enabled = true;
      viewer.scene.fog.density = 1.35e-4;
      viewer.scene.fog.minimumBrightness = 0.02;
      if (viewer.scene.moon) viewer.scene.moon.show = false;
      if (viewer.scene.sun) viewer.scene.sun.show = true;
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = true;
        viewer.scene.skyAtmosphere.brightnessShift = -0.08;
        viewer.scene.skyAtmosphere.saturationShift = 0.08;
      }
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(GLOBE_BASE);
      viewer.scene.globe.depthTestAgainstTerrain = true;
      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.dynamicAtmosphereLighting = true;
      viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;
      viewer.scene.globe.showGroundAtmosphere = true;
      viewer.scene.globe.showWaterEffect = false;
      viewer.scene.globe.atmosphereLightIntensity = 14;
      viewer.scene.globe.atmosphereSaturationShift = 0.08;
      viewer.scene.globe.atmosphereBrightnessShift = -0.04;
      viewer.scene.postProcessStages.fxaa.enabled = true;
      viewer.screenSpaceEventHandler.removeInputAction(
        Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
      );
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 7_500_000;
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 60_000_000;

      pointCollectionRef.current = viewer.scene.primitives.add(
        new Cesium.PointPrimitiveCollection()
      );

      viewer.camera.viewBoundingSphere(
        new Cesium.BoundingSphere(Cesium.Cartesian3.ZERO, EARTH_RADIUS_METERS),
        new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(14),
          Cesium.Math.toRadians(-28),
          INITIAL_CAMERA_RANGE_METERS
        )
      );
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      viewer.clock.shouldAnimate = false;

      viewer.camera.moveStart.addEventListener(() => {
        userInteractingRef.current = true;
      });
      viewer.camera.moveEnd.addEventListener(() => {
        userInteractingRef.current = false;
      });

      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      clickHandlerRef.current = handler;
      handler.setInputAction(
        (movement: { position: InstanceType<typeof Cesium.Cartesian2> }) => {
          const picked = viewer.scene.pick(movement.position) as
            | { id?: unknown; primitive?: { id?: unknown } }
            | undefined;

          let satId: string | null = null;
          if (typeof picked?.id === 'string') satId = picked.id;
          else if (typeof picked?.primitive?.id === 'string') satId = picked.primitive.id;
          else if (
            picked?.id &&
            typeof picked.id === 'object' &&
            'properties' in picked.id &&
            picked.id.properties
          ) {
            const value = (
              picked.id.properties as { satelliteId?: { getValue?: () => unknown } }
            ).satelliteId?.getValue?.();
            if (typeof value === 'string') satId = value;
          }

          if (satId) {
            const satellite = satellitesRef.current.find((item) => item.id === satId);
            if (satellite) selectSatellite(satellite);
          } else {
            const ray = viewer.camera.getPickRay(movement.position);
            if (ray) {
              const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
              if (cartesian) {
                const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                setClickedLocation({
                  lat: Cesium.Math.toDegrees(cartographic.latitude),
                  lng: Cesium.Math.toDegrees(cartographic.longitude),
                });
              } else {
                selectSatellite(null);
              }
            } else {
              selectSatellite(null);
            }
          }
        },
        Cesium.ScreenSpaceEventType.LEFT_CLICK
      );

      viewerRef.current = viewer;
      setViewerState('ready');
      viewer.scene.requestRender();

      renderIntervalRef.current = setInterval(() => {
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
      }, 2000);

      void (async () => {
        try {
          await loadEarthImageryLayers(Cesium, viewer);
          viewer.scene.requestRender();
        } catch {}

        try {
          const borders = await Cesium.GeoJsonDataSource.load(
            '/data/ne_110m_admin_0_countries.geojson',
            {
              stroke: Cesium.Color.fromCssColorString(GLOBE_COUNTRY_STROKE).withAlpha(0.35),
              fill: Cesium.Color.TRANSPARENT,
              strokeWidth: 0.8,
              clampToGround: true,
            }
          );

          for (const entity of borders.entities.values) {
            if (entity.polygon) {
              entity.polygon.material = new Cesium.ColorMaterialProperty(
                Cesium.Color.TRANSPARENT
              );
              entity.polygon.outline = new Cesium.ConstantProperty(false);
            }
            if (entity.polyline) {
              entity.polyline.material = new Cesium.ColorMaterialProperty(
                Cesium.Color.fromCssColorString(GLOBE_COUNTRY_STROKE).withAlpha(0.35)
              );
              entity.polyline.width = new Cesium.ConstantProperty(0.8);
              entity.polyline.clampToGround = new Cesium.ConstantProperty(true);
            }
          }

          if (!viewer.isDestroyed()) {
            viewer.dataSources.add(borders);
            bordersRef.current = borders;
            viewer.scene.requestRender();
          }
        } catch {}
      })();
    } catch (error) {
      if (containerRef.current) containerRef.current.innerHTML = '';
      setViewerState('error');
      setViewerError(
        error instanceof Error ? error.message : 'Не удалось подготовить 3D-глобус'
      );
    }
  }, [selectSatellite, setClickedLocation]);

  useEffect(() => {
    void initViewer();
    return () => {
      clearOrbit();
      clearCoverage();

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (renderIntervalRef.current) {
        clearInterval(renderIntervalRef.current);
        renderIntervalRef.current = null;
      }
      clickHandlerRef.current?.destroy();
      clickHandlerRef.current = null;
      bordersRef.current = null;
      pointMapRef.current.clear();
      pointMotionRef.current.clear();
      lastSnapshotRef.current = null;
      pointCollectionRef.current = null;
      labelRef.current = null;
      clickLocationRef.current = null;
      modelEntityRef.current = null;
      prevCameraRef.current = null;

      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [clearCoverage, clearOrbit, initViewer]);

  useEffect(() => {
    positionsRef.current = useSatelliteStore.getState().positions;
    const unsubscribe = useSatelliteStore.subscribe((state, prev) => {
      positionsRef.current = state.positions;
      if (state.positions === prev.positions) return;

      const nowMs = performance.now();
      const elapsed = lastSnapshotRef.current ? nowMs - lastSnapshotRef.current : 0;
      const durationMs = Math.max(120, Math.min(elapsed || 0, 2200));
      let hasFreshData = false;

      state.positions.forEach((position, id) => {
        if (!hasRenderableCoordinates(position.lat, position.lng, position.alt)) return;

        const target: RenderPosition = {
          lat: position.lat,
          lng: position.lng,
          altKm: position.alt,
        };
        const existing = pointMotionRef.current.get(id);
        const current = existing ? getMotionPosition(existing, nowMs) : target;

        if (!existing || !isSameRenderPosition(existing.to, target)) {
          pointMotionRef.current.set(id, {
            from: current,
            to: target,
            startedAtMs: nowMs,
            durationMs: existing ? durationMs : 0,
          });
          hasFreshData = true;
        }
      });

      if (hasFreshData) lastSnapshotRef.current = nowMs;
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    const pointCollection = pointCollectionRef.current;
    if (
      viewerState !== 'ready' ||
      !viewer ||
      viewer.isDestroyed() ||
      !Cesium ||
      !pointCollection
    ) {
      return;
    }

    const animate = () => {
      const activeViewer = viewerRef.current;
      const activeCesium = cesiumRef.current;
      if (!activeViewer || activeViewer.isDestroyed() || !activeCesium) {
        animationFrameRef.current = null;
        return;
      }

      const nowMs = performance.now();

      pointMapRef.current.forEach((point, id) => {
        const motion = pointMotionRef.current.get(id);
        if (!motion) return;
        const position = getMotionPosition(motion, nowMs);
        point.position = activeCesium.Cartesian3.fromDegrees(
          position.lng,
          position.lat,
          position.altKm * 1000
        );
      });

      // Update ground view model positions
      if (groundViewActiveRef.current && groundViewEntitiesRef.current.size > 0) {
        groundViewEntitiesRef.current.forEach((entity, id) => {
          const motion = pointMotionRef.current.get(id);
          if (!motion) return;
          const pos = getMotionPosition(motion, nowMs);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (entity as any).position = activeCesium.Cartesian3.fromDegrees(pos.lng, pos.lat, pos.altKm * 1000);
        });
      }

      const selectedId = selectedSatelliteRef.current?.id ?? null;
      if (selectedId && labelRef.current) {
        const motion = pointMotionRef.current.get(selectedId);
        if (motion) {
          const position = getMotionPosition(motion, nowMs);
          labelPosRef.current = { lng: position.lng, lat: position.lat, altKm: position.altKm };
        }
      }

      // Орбита: пересчитываем когда спутник сместился > 0.5° (~55 км)
      const orbitSat = orbitLiveSatIdRef.current;
      if (orbitSat) {
        const oMotion = pointMotionRef.current.get(orbitSat);
        if (oMotion) {
          const oPos = getMotionPosition(oMotion, nowMs);
          const oLast = orbitLastPosRef.current;
          const oMoved = !oLast ||
            Math.abs(oPos.lat - oLast.lat) > 0.2 ||
            Math.abs(oPos.lng - oLast.lng) > 0.2;
          const drawFn = orbitDrawFnRef.current;
          if (oMoved && drawFn && activeViewer && !activeViewer.isDestroyed() && activeCesium) {
            // Новый Primitive добавляется ДО удаления старого — нет мигания
            const newPrim = drawFn(
              activeCesium, activeViewer,
              oPos.lat, oPos.lng, oPos.altKm,
              oMotion.from.lat, oMotion.from.lng  // вектор скорости для стабильной нормали
            );
            if (orbitPrimitivesRef.current) {
              try { activeViewer.scene.primitives.remove(orbitPrimitivesRef.current); } catch {}
            }
            orbitPrimitivesRef.current = newPrim;
            orbitLastPosRef.current = { lat: oPos.lat, lng: oPos.lng, altKm: oPos.altKm };
          }
        }
      }

      // Зона покрытия: обновляем ref + пересоздаём GP при смещении > 0.1°
      const coverageSatId = coverageSatIdRef.current;
      if (coverageSatId) {
        const motion = pointMotionRef.current.get(coverageSatId);
        if (motion) {
          const position = getMotionPosition(motion, nowMs);
          coveragePosRef.current = { lng: position.lng, lat: position.lat, altKm: position.altKm };

          const gpLast = coverageGPLastRef.current;
          const moved = !gpLast ||
            Math.abs(position.lat - gpLast.lat) > 0.1 ||
            Math.abs(position.lng - gpLast.lng) > 0.1;
          const buildFn = buildCoverageGPRef.current;
          if (moved && buildFn && activeViewer && !activeViewer.isDestroyed() && activeCesium) {
            const r = coverageRadiusRef.current;
            const { gpFill: nf, gpBorder: nb } = buildFn(
              activeCesium, activeViewer, position.lng, position.lat, r
            );
            if (coverageGPFillRef.current)   { try { activeViewer.scene.groundPrimitives.remove(coverageGPFillRef.current); }   catch {} }
            if (coverageGPBorderRef.current) { try { activeViewer.scene.groundPrimitives.remove(coverageGPBorderRef.current); } catch {} }
            coverageGPFillRef.current   = nf;
            coverageGPBorderRef.current = nb;
            coverageGPLastRef.current   = { lat: position.lat, lng: position.lng };
          }
        }
      }

      if (closeUpTrackingRef.current && selectedId) {
        const motion = pointMotionRef.current.get(selectedId);
        if (motion) {
          const position = getMotionPosition(motion, nowMs);
          const satellitePosition = activeCesium.Cartesian3.fromDegrees(
            position.lng,
            position.lat,
            position.altKm * 1000
          );
          const transform = activeCesium.Transforms.eastNorthUpToFixedFrame(
            satellitePosition
          );
          activeViewer.camera.lookAtTransform(
            transform,
            new activeCesium.HeadingPitchRange(
              0,
              activeCesium.Math.toRadians(-80),
              closeUpRangeRef.current
            )
          );
        }
      }

      const timeState = useTimeStore.getState();
      const storeTimeMs = timeState.currentTime.getTime();
      if (storeTimeMs !== lastStoreTimeMsRef.current) {
        lastStoreTimeMsRef.current = storeTimeMs;
        lastStoreWallMsRef.current = nowMs;
      }
      const interpolatedMs = timeState.isPlaying
        ? storeTimeMs + timeState.speed * (nowMs - lastStoreWallMsRef.current)
        : storeTimeMs;
      activeViewer.clock.currentTime = activeCesium.JulianDate.fromDate(
        new Date(interpolatedMs)
      );

      const deltaSec = Math.min((nowMs - lastFrameMsRef.current) / 1000, 0.05);
      lastFrameMsRef.current = nowMs;
      if (
        timeState.isPlaying &&
        !userInteractingRef.current &&
        !isCloseUpRef.current &&
        deltaSec > 0
      ) {
        activeViewer.camera.rotate(
          activeCesium.Cartesian3.UNIT_Z,
          -activeCesium.Math.toRadians(
            Math.min((360 / 86400) * timeState.speed, 2) * deltaSec
          )
        );
      }

      activeViewer.scene.requestRender();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [viewerState]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    const pointCollection = pointCollectionRef.current;
    if (
      viewerState !== 'ready' ||
      !viewer ||
      viewer.isDestroyed() ||
      !Cesium ||
      !pointCollection
    ) {
      return;
    }

    const currentIds = new Set(satellites.map((satellite) => satellite.id));
    Array.from(pointMapRef.current.keys()).forEach((id) => {
      if (!currentIds.has(id)) {
        const point = pointMapRef.current.get(id);
        if (point) {
          pointCollection.remove(point);
          pointMapRef.current.delete(id);
        }
        pointMotionRef.current.delete(id);
      }
    });

    const nowMs = performance.now();
    const positions = positionsRef.current;
    const sharedScale = new Cesium.NearFarScalar(2.0e6, 1.4, 4.2e7, 0.6);
    const sharedTranslucency = new Cesium.NearFarScalar(2.0e6, 1.0, 4.2e7, 0.8);
    const colorCache = new Map<string, InstanceType<typeof Cesium.Color>>();

    const getColor = (orbitType: string) => {
      let color = colorCache.get(orbitType);
      if (!color) {
        color = Cesium.Color.fromCssColorString(getOrbitPointColor(orbitType));
        colorCache.set(orbitType, color);
      }
      return color;
    };

    for (const satellite of satellites) {
      const position = positions.get(satellite.id);
      const lat = position?.lat ?? satellite.latitude;
      const lng = position?.lng ?? satellite.longitude;
      const altKm = position?.alt ?? satellite.altitude;

      if (!hasRenderableCoordinates(lat, lng, altKm)) {
        const point = pointMapRef.current.get(satellite.id);
        if (point) {
          pointCollection.remove(point);
          pointMapRef.current.delete(satellite.id);
        }
        pointMotionRef.current.delete(satellite.id);
        continue;
      }

      const isSelected = selectedSatellite?.id === satellite.id;
      const baseColor = getColor(satellite.orbitType);
      const existingPoint = pointMapRef.current.get(satellite.id);

      if (existingPoint) {
        existingPoint.pixelSize = isSelected ? 9 : 6;
        existingPoint.color = baseColor.withAlpha(isSelected ? 1.0 : 0.85);
        existingPoint.outlineWidth = isSelected ? 2 : 0.5;
        existingPoint.outlineColor = isSelected
          ? Cesium.Color.WHITE.withAlpha(0.95)
          : baseColor.withAlpha(0.4);
        existingPoint.disableDepthTestDistance = 0;
        existingPoint.show = true;
      } else {
        const point = pointCollection.add({
          id: satellite.id,
          position: Cesium.Cartesian3.fromDegrees(lng, lat, altKm * 1000),
          pixelSize: isSelected ? 9 : 6,
          color: baseColor.withAlpha(isSelected ? 1.0 : 0.85),
          outlineColor: isSelected
            ? Cesium.Color.WHITE.withAlpha(0.95)
            : baseColor.withAlpha(0.4),
          outlineWidth: isSelected ? 2 : 0.5,
          disableDepthTestDistance: 0,
          scaleByDistance: sharedScale,
          translucencyByDistance: sharedTranslucency,
        });
        pointMapRef.current.set(satellite.id, point);
        if (!pointMotionRef.current.has(satellite.id)) {
          pointMotionRef.current.set(satellite.id, {
            from: { lat, lng, altKm },
            to: { lat, lng, altKm },
            startedAtMs: nowMs,
            durationMs: 0,
          });
        }
      }
    }

    if (labelRef.current) {
      viewer.entities.remove(labelRef.current);
      labelRef.current = null;
      labelPosRef.current = null;
    }

    if (selectedSatellite) {
      const position = positions.get(selectedSatellite.id);
      const lat = position?.lat ?? selectedSatellite.latitude;
      const lng = position?.lng ?? selectedSatellite.longitude;
      const altKm = position?.alt ?? selectedSatellite.altitude;

      if (hasRenderableCoordinates(lat, lng, altKm)) {
        // Инициализируем pos ref и создаём label с CallbackProperty
        labelPosRef.current = { lng, lat, altKm };
        labelRef.current = viewer.entities.add({
          position: new Cesium.CallbackProperty(() => {
            const p = labelPosRef.current;
            if (!p) return Cesium.Cartesian3.fromDegrees(lng, lat, altKm * 1000);
            return Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.altKm * 1000);
          }, false) as never,
          label: {
            text: selectedSatellite.name,
            font: '11px Inter, system-ui, sans-serif',
            fillColor: Cesium.Color.fromCssColorString(LABEL_COLOR),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            scaleByDistance: new Cesium.NearFarScalar(1.0e3, 1.0, 5.0e6, 0.4),
          },
          properties: { satelliteId: selectedSatellite.id },
        });
      }
    }

    viewer.scene.requestRender();
  }, [satellites, selectedSatellite, viewerState]);

  useEffect(() => {
    clearOrbit();
    clearCoverage();

    if (viewerState !== 'ready' || !selectedSatellite) return;

    drawInstant(selectedSatellite);
  }, [selectedSatellite, viewerState, clearCoverage, clearOrbit, drawInstant]);

  // Если при выборе спутника позиции ещё не было — перерисовываем когда она появится
  useEffect(() => {
    const unsubscribe = useSatelliteStore.subscribe((state, prev) => {
      if (state.positions === prev.positions) return;
      const sel = selectedSatelliteRef.current;
      if (!sel) return;
      // Орбита уже нарисована — не перерисовываем. Только если coverageSatIdRef не установлен
      // (значит drawInstant не смог отрисоваться из-за отсутствия позиции)
      if (coverageSatIdRef.current === sel.id) return;
      if (viewerRef.current && !viewerRef.current.isDestroyed() && cesiumRef.current) {
        const pos = state.positions.get(sel.id);
        if (pos && hasRenderableCoordinates(pos.lat, pos.lng, pos.alt)) {
          console.log('[positions arrived] re-drawing for', sel.name);
          drawInstant(sel);
        }
      }
    });
    return unsubscribe;
  }, [drawInstant]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    const clickedLocation = useSatelliteStore.getState().clickedLocation;
    if (viewerState !== 'ready' || !viewer || viewer.isDestroyed() || !Cesium) return;

    if (clickLocationRef.current) {
      viewer.entities.remove(clickLocationRef.current);
      clickLocationRef.current = null;
    }
    if (!clickedLocation) return;

    clickLocationRef.current = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        clickedLocation.lng,
        clickedLocation.lat,
        0
      ),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#f59e0b'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      ellipse: {
        semiMajorAxis: 100_000,
        semiMinorAxis: 100_000,
        material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.1),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.3),
        height: 0,
      },
    });
    viewer.scene.requestRender();
  }, [viewerState]);

  useEffect(() => {
    const unsubscribe = useSatelliteStore.subscribe((state, prev) => {
      if (state.clickedLocation === prev.clickedLocation) return;

      const viewer = viewerRef.current;
      const Cesium = cesiumRef.current;
      if (!viewer || viewer.isDestroyed() || !Cesium) return;

      if (clickLocationRef.current) {
        viewer.entities.remove(clickLocationRef.current);
        clickLocationRef.current = null;
      }

      const clickedLocation = state.clickedLocation;
      if (!clickedLocation) {
        viewer.scene.requestRender();
        return;
      }

      clickLocationRef.current = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
          clickedLocation.lng,
          clickedLocation.lat,
          0
        ),
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString('#f59e0b'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        ellipse: {
          semiMajorAxis: 100_000,
          semiMinorAxis: 100_000,
          material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.1),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.3),
          height: 0,
        },
      });
      viewer.scene.requestRender();
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = useSatelliteStore.subscribe((state, prev) => {
      if (
        state.isCloseUp === prev.isCloseUp &&
        state.selectedSatellite === prev.selectedSatellite
      ) {
        return;
      }

      const viewer = viewerRef.current;
      const Cesium = cesiumRef.current;
      if (!viewer || viewer.isDestroyed() || !Cesium) return;

      const wantCloseUp = state.isCloseUp && !!state.selectedSatellite;
      const wasCloseUp = isCloseUpRef.current;
      isCloseUpRef.current = wantCloseUp;

      if (wasCloseUp && !wantCloseUp) {
        closeUpTrackingRef.current = false;

        if (modelEntityRef.current) {
          viewer.trackedEntity = undefined;
          viewer.entities.remove(modelEntityRef.current);
          modelEntityRef.current = null;
        }

        pointMapRef.current.forEach((point) => {
          point.show = true;
        });

        viewer.scene.globe.depthTestAgainstTerrain = true;
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 7_500_000;
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

        if (prevCameraRef.current) {
          viewer.camera.flyTo({
            destination: prevCameraRef.current.position,
            orientation: {
              direction: prevCameraRef.current.direction,
              up: prevCameraRef.current.up,
            },
            duration: 1.5,
          });
          prevCameraRef.current = null;
        }

        viewer.scene.requestRender();
        return;
      }

      if (wantCloseUp && !wasCloseUp) {
        const satellite = state.selectedSatellite!;
        const position = positionsRef.current.get(satellite.id);
        const lat = position?.lat ?? satellite.latitude;
        const lng = position?.lng ?? satellite.longitude;
        const altKm = position?.alt ?? satellite.altitude;

        if (!hasRenderableCoordinates(lat, lng, altKm)) return;

        prevCameraRef.current = {
          position: viewer.camera.position.clone(),
          direction: viewer.camera.direction.clone(),
          up: viewer.camera.up.clone(),
        };

        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 100;
        viewer.scene.globe.depthTestAgainstTerrain = false;

        pointMapRef.current.forEach((point) => {
          point.show = false;
        });

        const satelliteId = satellite.id;
        const modelScale = altKm < 2000 ? 2500 : altKm < 20000 ? 7500 : 20000;
        const flyRange = altKm < 2000 ? 4_000_000 : altKm < 20000 ? 8_000_000 : 15_000_000;
        closeUpRangeRef.current = flyRange;

        const positionProperty = new Cesium.CallbackProperty(() => {
          const motion = pointMotionRef.current.get(satelliteId);
          if (motion) {
            const interpolated = getMotionPosition(motion, performance.now());
            return Cesium.Cartesian3.fromDegrees(
              interpolated.lng,
              interpolated.lat,
              interpolated.altKm * 1000
            );
          }
          return Cesium.Cartesian3.fromDegrees(lng, lat, altKm * 1000);
        }, false);

        const orientationProperty = new Cesium.CallbackProperty(() => {
          const t = performance.now() / 1000;
          const heading = Cesium.Math.toRadians((t * 5) % 360);
          const motion = pointMotionRef.current.get(satelliteId);
          const interpolated = motion
            ? getMotionPosition(motion, performance.now())
            : { lat, lng, altKm };
          const cartesian = Cesium.Cartesian3.fromDegrees(
            interpolated.lng,
            interpolated.lat,
            interpolated.altKm * 1000
          );
          return Cesium.Transforms.headingPitchRollQuaternion(
            cartesian,
            new Cesium.HeadingPitchRoll(heading, 0, 0)
          );
        }, false);

        modelEntityRef.current = viewer.entities.add({
          position: positionProperty as never,
          orientation: orientationProperty as never,
          model: {
            uri: '/satellite.glb',
            scale: modelScale,
            minimumPixelSize: 64,
            maximumScale: 200000,
          },
        });

        const destination = Cesium.Cartesian3.fromDegrees(lng, lat, altKm * 1000);
        viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(destination, 1), {
          offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0),
            Cesium.Math.toRadians(-80),
            flyRange
          ),
          duration: 1.5,
          complete: () => {
            if (
              viewerRef.current &&
              !viewerRef.current.isDestroyed() &&
              isCloseUpRef.current
            ) {
              closeUpTrackingRef.current = true;
            }
          },
        });

        viewer.scene.requestRender();
      }
    });

    return unsubscribe;
  }, []);

  // Ground Observer View — 3D satellite models
  useEffect(() => {
    const unsubscribe = useSatelliteStore.subscribe((state, prev) => {
      const viewer = viewerRef.current;
      const Cesium = cesiumRef.current;
      if (!viewer || viewer.isDestroyed() || !Cesium) return;

      const loc = state.groundViewLocation;
      const prevLoc = prev.groundViewLocation;

      if (loc && (!prevLoc || loc.lat !== prevLoc.lat || loc.lng !== prevLoc.lng)) {
        // Enter ground observer view

        // Hide point primitives
        if (pointCollectionRef.current) {
          pointCollectionRef.current.show = false;
        }

        // Remove any prior ground view entities
        groundViewEntitiesRef.current.forEach((entity) => {
          viewer.entities.remove(entity);
        });
        groundViewEntitiesRef.current.clear();

        // Create 3D model entities for each satellite
        const nowMs = performance.now();
        const sats = satellitesRef.current;

        for (const sat of sats) {
          const motion = pointMotionRef.current.get(sat.id);
          const pos = motion
            ? getMotionPosition(motion, nowMs)
            : { lat: sat.latitude, lng: sat.longitude, altKm: sat.altitude };

          if (!hasRenderableCoordinates(pos.lat, pos.lng, pos.altKm)) continue;

          const orbitColor = Cesium.Color.fromCssColorString(getOrbitPointColor(sat.orbitType));

          const entity = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(pos.lng, pos.lat, pos.altKm * 1000),
            model: {
              uri: '/satellite.glb',
              scale: 3000,
              minimumPixelSize: 0,
              maximumScale: 50000,
              color: orbitColor.withAlpha(0.95),
              colorBlendMode: Cesium.ColorBlendMode.MIX,
              colorBlendAmount: 0.4,
              silhouetteColor: orbitColor,
              silhouetteSize: 1.5,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 10_000_000),
            },
            label: {
              text: sat.name,
              font: '11px sans-serif',
              fillColor: Cesium.Color.WHITE.withAlpha(0.9),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -15),
              scaleByDistance: new Cesium.NearFarScalar(200_000, 1.0, 8_000_000, 0.2),
              translucencyByDistance: new Cesium.NearFarScalar(200_000, 1.0, 8_000_000, 0.0),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5_000_000),
            },
          });

          groundViewEntitiesRef.current.set(sat.id, entity);
        }

        groundViewActiveRef.current = true;

        // Camera setup
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1;
        viewer.scene.globe.depthTestAgainstTerrain = true;

        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(loc.lng, loc.lat, 10),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-5),
            roll: 0,
          },
          duration: 2,
        });
      } else if (!loc && prevLoc) {
        // Exit ground observer view

        groundViewActiveRef.current = false;

        // Remove model entities
        groundViewEntitiesRef.current.forEach((entity) => {
          viewer.entities.remove(entity);
        });
        groundViewEntitiesRef.current.clear();

        // Show point primitives again
        if (pointCollectionRef.current) {
          pointCollectionRef.current.show = true;
        }

        // Restore camera
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 7_500_000;
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(prevLoc.lng, prevLoc.lat, INITIAL_CAMERA_RANGE_METERS),
          orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-90),
            roll: 0,
          },
          duration: 2,
        });
      }
    });

    return () => {
      unsubscribe();
      // Clean up on unmount
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) {
        groundViewEntitiesRef.current.forEach((entity) => {
          viewer.entities.remove(entity);
        });
      }
      groundViewEntitiesRef.current.clear();
      groundViewActiveRef.current = false;
    };
  }, []);

  return (
    <div className="relative w-full h-full" style={{ background: GLOBE_BACKGROUND }}>
      <div ref={containerRef} className="absolute inset-0" />

      {viewerState === 'initializing' && (
        <div className="absolute inset-0 flex items-center justify-center bg-cosmos-bg/50">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
            <p className="text-[#9ca3af] text-sm">Загрузка глобуса...</p>
          </div>
        </div>
      )}

      {viewerState === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-cosmos-bg/80 px-6">
          <div className="panel-base max-w-md p-5 text-center">
            <p className="text-sm font-semibold text-[#e5e7eb]">
              Не удалось инициализировать 3D-глобус
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[#9ca3af]">
              {viewerError ?? 'Проверь поддержку WebGL в браузере и перезагрузи страницу.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}