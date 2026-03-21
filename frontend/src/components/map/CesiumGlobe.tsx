'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Satellite, SatellitePosition } from '@/types';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
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
const EARTH_NIGHT_TEXTURE_URL = '/images/earth/earth-night-lights.jpg?v=20260321a';
const EARTH_DAY_NIGHT_ALPHA = 0.12;
const EARTH_LIGHTS_DAY_ALPHA = 0.0;
const EARTH_LIGHTS_NIGHT_ALPHA = 1.0;

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

function buildOrbitSegments(
  Cesium: typeof import('cesium'),
  latDeg: number,
  lngDeg: number,
  altKm: number,
  incDeg: number,
  steps = 360
): InstanceType<typeof import('cesium').Cartesian3>[][] {
  const lat = latDeg * (Math.PI / 180);
  const lng = lngDeg * (Math.PI / 180);
  const altM = altKm * 1000;

  const e1x = Math.cos(lat) * Math.cos(lng);
  const e1y = Math.cos(lat) * Math.sin(lng);
  const e1z = Math.sin(lat);

  let px = -e1y;
  let py = e1x;
  let pz = 0.0;
  let pLen = Math.sqrt(px * px + py * py + pz * pz);

  if (pLen < 1e-9) {
    px = 1;
    py = 0;
    pz = 0;
    pLen = 1;
  } else {
    px /= pLen;
    py /= pLen;
    pz /= pLen;
  }

  const inc = incDeg * (Math.PI / 180);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);
  const dot = e1x * px + e1y * py + e1z * pz;
  const crx = e1y * pz - e1z * py;
  const cry = e1z * px - e1x * pz;
  const crz = e1x * py - e1y * px;

  const e2x = px * cosI + crx * sinI + e1x * dot * (1 - cosI);
  const e2y = py * cosI + cry * sinI + e1y * dot * (1 - cosI);
  const e2z = pz * cosI + crz * sinI + e1z * dot * (1 - cosI);

  const raw: Array<[number, number]> = [];

  for (let i = 0; i <= steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);

    const qx = cosine * e1x + sine * e2x;
    const qy = cosine * e1y + sine * e2y;
    const qz = cosine * e1z + sine * e2z;

    const qLen = Math.sqrt(qx * qx + qy * qy + qz * qz);
    if (qLen < 1e-10) continue;

    const qLat = Math.asin(Math.max(-1, Math.min(1, qz / qLen))) * (180 / Math.PI);
    const qLng = Math.atan2(qy / qLen, qx / qLen) * (180 / Math.PI);
    raw.push([qLng, qLat]);
  }

  const segments: InstanceType<typeof import('cesium').Cartesian3>[][] = [];
  let currentSegment: InstanceType<typeof import('cesium').Cartesian3>[] = [];

  for (let i = 0; i < raw.length; i++) {
    currentSegment.push(Cesium.Cartesian3.fromDegrees(raw[i][0], raw[i][1], altM));

    if (i < raw.length - 1) {
      const deltaLng = Math.abs(raw[i + 1][0] - raw[i][0]);
      if (deltaLng > 180) {
        if (currentSegment.length >= 2) segments.push(currentSegment);
        currentSegment = [];
      }
    }
  }

  if (currentSegment.length >= 2) segments.push(currentSegment);

  return segments;
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

export default function CesiumGlobe({ satellites, selectedSatellite }: CesiumGlobeProps) {
  const viewerRef = useRef<InstanceType<typeof import('cesium').Viewer> | null>(null);
  const pointCollectionRef = useRef<
    InstanceType<typeof import('cesium').PointPrimitiveCollection> | null
  >(null);
  const pointMapRef = useRef<
    Map<string, InstanceType<typeof import('cesium').PointPrimitive>>
  >(new Map());

  const orbitEntitiesRef = useRef<InstanceType<typeof import('cesium').Entity>[]>([]);
  const coverageFillRef = useRef<InstanceType<typeof import('cesium').Entity> | null>(null);
  const coverageBorderRef = useRef<InstanceType<typeof import('cesium').Entity> | null>(null);
  const nadirRef = useRef<InstanceType<typeof import('cesium').Entity> | null>(null);
  const coverageSatIdRef = useRef<string | null>(null);

  const labelRef = useRef<InstanceType<typeof import('cesium').Entity> | null>(null);
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

  const [viewerState, setViewerState] = useState<'initializing' | 'ready' | 'error'>('initializing');
  const [viewerError, setViewerError] = useState<string | null>(null);

  const positionsRef = useRef<Map<string, SatellitePosition>>(new Map());
  const selectSatellite = useSatelliteStore((state) => state.selectSatellite);
  const setClickedLocation = useSatelliteStore((state) => state.setClickedLocation);

  satellitesRef.current = satellites;
  selectedSatelliteRef.current = selectedSatellite;

  const clearOrbit = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    for (const entity of orbitEntitiesRef.current) {
      try {
        viewer.entities.remove(entity);
      } catch {}
    }
    orbitEntitiesRef.current = [];
  }, []);

  const clearCoverage = useCallback(() => {
    coverageSatIdRef.current = null;
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    if (coverageFillRef.current) {
      viewer.entities.remove(coverageFillRef.current);
      coverageFillRef.current = null;
    }
    if (coverageBorderRef.current) {
      viewer.entities.remove(coverageBorderRef.current);
      coverageBorderRef.current = null;
    }
    if (nadirRef.current) {
      viewer.entities.remove(nadirRef.current);
      nadirRef.current = null;
    }
  }, []);

  const drawInstant = useCallback((satellite: Satellite) => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || viewer.isDestroyed() || !Cesium) return;

    const position = positionsRef.current.get(satellite.id);
    const lat = position?.lat ?? satellite.latitude;
    const lng = position?.lng ?? satellite.longitude;
    const altKm = position?.alt ?? satellite.altitude;

    if (!hasRenderableCoordinates(lat, lng, altKm)) return;

    clearOrbit();

    const segments = buildOrbitSegments(Cesium, lat, lng, altKm, satellite.inclination, 360);
    const lineColor = Cesium.Color.fromCssColorString(ORBIT_COLOR).withAlpha(0.9);
    const dimColor = Cesium.Color.fromCssColorString(ORBIT_COLOR).withAlpha(0.2);

    for (const segment of segments) {
      if (segment.length < 2) continue;
      const entity = viewer.entities.add({
        polyline: {
          positions: segment,
          width: 2,
          material: lineColor,
          clampToGround: false,
          arcType: Cesium.ArcType.NONE,
          depthFailMaterial: dimColor,
        },
      });
      orbitEntitiesRef.current.push(entity);
    }

    clearCoverage();

    const angleRad = Math.acos(Math.min(1, EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm)));
    const radiusMeters = EARTH_RADIUS_KM * angleRad * 1000;
    const color = Cesium.Color.fromCssColorString(COVERAGE_COLOR);
    const initialPosition = Cesium.Cartesian3.fromDegrees(lng, lat, 0);

    coverageFillRef.current = viewer.entities.add({
      position: initialPosition,
      ellipse: {
        semiMajorAxis: radiusMeters,
        semiMinorAxis: radiusMeters,
        material: color.withAlpha(0.12),
        outline: false,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        granularity: Cesium.Math.toRadians(1),
      },
    });

    coverageBorderRef.current = viewer.entities.add({
      position: initialPosition,
      ellipse: {
        semiMajorAxis: radiusMeters,
        semiMinorAxis: radiusMeters,
        material: Cesium.Color.TRANSPARENT,
        outline: true,
        outlineColor: color.withAlpha(0.85),
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        granularity: Cesium.Math.toRadians(1),
      },
    });

    nadirRef.current = viewer.entities.add({
      polyline: {
        positions: [
          Cesium.Cartesian3.fromDegrees(lng, lat, altKm * 1000),
          Cesium.Cartesian3.fromDegrees(lng, lat, 0),
        ],
        width: 1.5,
        material: new Cesium.PolylineDashMaterialProperty({
          color: color.withAlpha(0.55),
          dashLength: 12,
          dashPattern: 0xff00,
        }),
        clampToGround: false,
        arcType: Cesium.ArcType.NONE,
        depthFailMaterial: new Cesium.PolylineDashMaterialProperty({
          color: color.withAlpha(0.18),
          dashLength: 12,
          dashPattern: 0xff00,
        }),
      },
    });

    coverageSatIdRef.current = satellite.id;

    viewer.scene.requestRender();
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

      const selectedId = selectedSatelliteRef.current?.id ?? null;
      if (selectedId && labelRef.current) {
        const motion = pointMotionRef.current.get(selectedId);
        if (motion) {
          const position = getMotionPosition(motion, nowMs);
          labelRef.current.position = new activeCesium.ConstantPositionProperty(
            activeCesium.Cartesian3.fromDegrees(
              position.lng,
              position.lat,
              position.altKm * 1000
            )
          );
        }
      }

      const coverageSatId = coverageSatIdRef.current;
      if (coverageSatId) {
        const motion = pointMotionRef.current.get(coverageSatId);
        if (motion) {
          const position = getMotionPosition(motion, nowMs);

          if (coverageFillRef.current) {
            coverageFillRef.current.position = new activeCesium.ConstantPositionProperty(
              activeCesium.Cartesian3.fromDegrees(position.lng, position.lat, 0)
            );
          }
          if (coverageBorderRef.current) {
            coverageBorderRef.current.position = new activeCesium.ConstantPositionProperty(
              activeCesium.Cartesian3.fromDegrees(position.lng, position.lat, 0)
            );
          }
          if (nadirRef.current) {
            nadirRef.current.polyline!.positions = new activeCesium.ConstantProperty([
              activeCesium.Cartesian3.fromDegrees(
                position.lng,
                position.lat,
                position.altKm * 1000
              ),
              activeCesium.Cartesian3.fromDegrees(position.lng, position.lat, 0),
            ]);
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
    }

    if (selectedSatellite) {
      const position = positions.get(selectedSatellite.id);
      const lat = position?.lat ?? selectedSatellite.latitude;
      const lng = position?.lng ?? selectedSatellite.longitude;
      const altKm = position?.alt ?? selectedSatellite.altitude;

      if (hasRenderableCoordinates(lat, lng, altKm)) {
        labelRef.current = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lng, lat, altKm * 1000),
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
