'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Satellite, SatellitePosition } from '@/types';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import { isRenderableAltitudeKm } from '@/lib/utils';
import { fetchOrbit } from '@/lib/api';

if (typeof window !== 'undefined') {
  window.CESIUM_BASE_URL = '/cesium';
}

const EARTH_RADIUS_KM = 6_371;
const EARTH_RADIUS_METERS = 6_378_137;
const INITIAL_CAMERA_RANGE_METERS = 22_000_000;

const GLOBE_BACKGROUND = '#010108';
const GLOBE_BASE = '#0a1628';
const GLOBE_COUNTRY_STROKE = '#c4cedd';
const LABEL_COLOR = '#f8fafc';

/* ── orbit-type palette ─────────────────────────────────── */

function getOrbitPointColor(orbitType: string) {
  switch (orbitType?.toUpperCase()) {
    case 'LEO':
      return '#22d3ee'; // cyan
    case 'MEO':
      return '#60a5fa'; // blue
    case 'GEO':
      return '#fbbf24'; // amber
    case 'HEO':
      return '#f87171'; // red
    default:
      return '#94a3b8'; // slate
  }
}

/* ── helpers ─────────────────────────────────────────────── */

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

function normalizeLongitude(lng: number) {
  let normalized = lng;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

function interpolateLongitude(from: number, to: number, progress: number) {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return normalizeLongitude(from + delta * progress);
}

function getMotionPosition(motion: MotionState, nowMs: number): RenderPosition {
  if (motion.durationMs <= 0) {
    return motion.to;
  }

  const progress = Math.min(1, Math.max(0, (nowMs - motion.startedAtMs) / motion.durationMs));
  return {
    lat: motion.from.lat + (motion.to.lat - motion.from.lat) * progress,
    lng: interpolateLongitude(motion.from.lng, motion.to.lng, progress),
    altKm: motion.from.altKm + (motion.to.altKm - motion.from.altKm) * progress,
  };
}

/* ── component ───────────────────────────────────────────── */

export default function CesiumGlobe({
  satellites,
  selectedSatellite,
}: CesiumGlobeProps) {
  const viewerRef = useRef<InstanceType<typeof import('cesium').Viewer> | null>(null);
  const pointCollectionRef = useRef<
    InstanceType<typeof import('cesium').PointPrimitiveCollection> | null
  >(null);
  const pointMapRef = useRef<
    Map<string, InstanceType<typeof import('cesium').PointPrimitive>>
  >(new Map());
  const orbitEntityRef = useRef<InstanceType<typeof import('cesium').Entity> | null>(null);
  const coverageEntityRef = useRef<InstanceType<typeof import('cesium').Entity> | null>(null);
  const clickedLocationEntityRef = useRef<InstanceType<typeof import('cesium').Entity> | null>(null);
  const selectedLabelEntityRef = useRef<InstanceType<typeof import('cesium').Entity> | null>(
    null
  );
  const clickHandlerRef = useRef<InstanceType<
    typeof import('cesium').ScreenSpaceEventHandler
  > | null>(null);
  const countryBordersRef = useRef<InstanceType<
    typeof import('cesium').GeoJsonDataSource
  > | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cesiumRef = useRef<typeof import('cesium') | null>(null);
  const satellitesRef = useRef<Satellite[]>(satellites);
  const selectedSatelliteRef = useRef<Satellite | null>(selectedSatellite);
  const pointMotionRef = useRef<Map<string, MotionState>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const renderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSnapshotAtRef = useRef<number | null>(null);

  /* rotation state */
  const isUserInteractingRef = useRef(false);
  const lastFrameMsRef = useRef(performance.now());
  const lastStoreTimeMsRef = useRef(0);
  const lastStoreWallMsRef = useRef(performance.now());

  const [viewerState, setViewerState] = useState<'initializing' | 'ready' | 'error'>(
    'initializing'
  );
  const [viewerError, setViewerError] = useState<string | null>(null);

  const positionsRef = useRef<Map<string, SatellitePosition>>(new Map());
  const selectSatellite = useSatelliteStore((state) => state.selectSatellite);
  const setClickedLocation = useSatelliteStore((state) => state.setClickedLocation);
  satellitesRef.current = satellites;
  selectedSatelliteRef.current = selectedSatellite;

  /* ── init ───────────────────────────────────────────────── */

  const initViewer = useCallback(async () => {
    if (!containerRef.current || viewerRef.current) return;

    setViewerState('initializing');
    setViewerError(null);

    try {
      const Cesium = await import('cesium');
      await import('cesium/Build/Cesium/Widgets/widgets.css').catch(() => {});

      // Guard against double init (React Strict Mode)
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
          error instanceof Error
            ? error.message
            : 'Не удалось инициализировать Cesium Viewer'
        );
        return;
      }

      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString(GLOBE_BACKGROUND);

      /* ── depth: atmosphere + lighting ── */
      viewer.scene.fog.enabled = true;
      viewer.scene.fog.density = 2.0e-4;
      viewer.scene.fog.minimumBrightness = 0.03;
      if (viewer.scene.moon) viewer.scene.moon.show = false;
      if (viewer.scene.sun) viewer.scene.sun.show = true;
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = true;
        viewer.scene.skyAtmosphere.brightnessShift = -0.15;
        viewer.scene.skyAtmosphere.saturationShift = 0.15;
      }

      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(GLOBE_BASE);
      viewer.scene.globe.depthTestAgainstTerrain = true;
      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.showGroundAtmosphere = true;
      viewer.scene.globe.showWaterEffect = false;
      viewer.scene.postProcessStages.fxaa.enabled = true;

      viewer.screenSpaceEventHandler.removeInputAction(
        Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
      );
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 7_500_000;
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 60_000_000;

      /* point collection for satellites */
      pointCollectionRef.current = viewer.scene.primitives.add(
        new Cesium.PointPrimitiveCollection()
      );

      /* camera */
      viewer.camera.viewBoundingSphere(
        new Cesium.BoundingSphere(Cesium.Cartesian3.ZERO, EARTH_RADIUS_METERS),
        new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(14),
          Cesium.Math.toRadians(-28),
          INITIAL_CAMERA_RANGE_METERS
        )
      );
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

      /* stop Cesium's own clock — time is managed by timeStore */
      viewer.clock.shouldAnimate = false;

      /* pause rotation while the user drags / zooms */
      viewer.camera.moveStart.addEventListener(() => {
        isUserInteractingRef.current = true;
      });
      viewer.camera.moveEnd.addEventListener(() => {
        isUserInteractingRef.current = false;
      });

      /* click handler */
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      clickHandlerRef.current = handler;
      handler.setInputAction(
        (movement: { position: InstanceType<typeof Cesium.Cartesian2> }) => {
          const picked = viewer.scene.pick(movement.position) as
            | { id?: unknown; primitive?: { id?: unknown } }
            | undefined;

          let satId: string | null = null;

          if (typeof picked?.id === 'string') {
            satId = picked.id;
          } else if (typeof picked?.primitive?.id === 'string') {
            satId = picked.primitive.id;
          } else if (
            picked?.id &&
            typeof picked.id === 'object' &&
            'properties' in picked.id &&
            picked.id.properties
          ) {
            const props = picked.id.properties as {
              satelliteId?: { getValue?: () => unknown };
            };
            const value = props.satelliteId?.getValue?.();
            if (typeof value === 'string') satId = value;
          }

          if (satId) {
            const sat = satellitesRef.current.find((item) => item.id === satId);
            if (sat) selectSatellite(sat);
          } else {
            // Click on empty area — get geographic coordinates
            const ray = viewer.camera.getPickRay(movement.position);
            if (ray) {
              const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
              if (cartesian) {
                const carto = Cesium.Cartographic.fromCartesian(cartesian);
                const lat = Cesium.Math.toDegrees(carto.latitude);
                const lng = Cesium.Math.toDegrees(carto.longitude);
                setClickedLocation({ lat, lng });
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

      // Periodic render for live position updates
      renderIntervalRef.current = setInterval(() => {
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
      }, 2000);

      /* async imagery & borders */
      void (async () => {
        try {
          const tmsUrl = Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII');
          const provider = await Cesium.TileMapServiceImageryProvider.fromUrl(tmsUrl);
          if (!viewer.isDestroyed()) {
            const earthLayer = viewer.imageryLayers.addImageryProvider(provider);
            earthLayer.alpha = 0.96;
            earthLayer.brightness = 0.65;
            earthLayer.contrast = 1.2;
            earthLayer.gamma = 1.02;
            earthLayer.saturation = 0.15;
            earthLayer.hue = -0.02;
            viewer.scene.requestRender();
          }
        } catch {
          /* fallback to globe base color */
        }

        try {
          const countryBorders = await Cesium.GeoJsonDataSource.load(
            '/data/ne_110m_admin_0_countries.geojson',
            {
              stroke: Cesium.Color.fromCssColorString(GLOBE_COUNTRY_STROKE).withAlpha(0.35),
              fill: Cesium.Color.TRANSPARENT,
              strokeWidth: 0.8,
              clampToGround: true,
            }
          );

          for (const entity of countryBorders.entities.values) {
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
            viewer.dataSources.add(countryBorders);
            countryBordersRef.current = countryBorders;
            viewer.scene.requestRender();
          }
        } catch {
          /* borders are decorative */
        }
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
      countryBordersRef.current = null;
      pointMapRef.current.clear();
      pointMotionRef.current.clear();
      lastSnapshotAtRef.current = null;
      pointCollectionRef.current = null;
      selectedLabelEntityRef.current = null;
      coverageEntityRef.current = null;
      clickedLocationEntityRef.current = null;

      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── subscribe to positions without re-renders ────────── */

  useEffect(() => {
    positionsRef.current = useSatelliteStore.getState().positions;
    const unsub = useSatelliteStore.subscribe((state, prev) => {
      positionsRef.current = state.positions;
      if (state.positions === prev.positions) return;

      const nowMs = performance.now();
      const elapsed = lastSnapshotAtRef.current ? nowMs - lastSnapshotAtRef.current : 0;
      const motionDur = Math.max(120, Math.min(elapsed || 0, 2200));
      let fresh = false;

      state.positions.forEach((pos, id) => {
        if (!hasRenderableCoordinates(pos.lat, pos.lng, pos.alt)) return;
        const target: RenderPosition = { lat: pos.lat, lng: pos.lng, altKm: pos.alt };
        const existing = pointMotionRef.current.get(id);
        const current = existing ? getMotionPosition(existing, nowMs) : target;
        if (!existing || !isSameRenderPosition(existing.to, target)) {
          pointMotionRef.current.set(id, {
            from: current,
            to: target,
            startedAtMs: nowMs,
            durationMs: existing ? motionDur : 0,
          });
          fresh = true;
        }
      });

      if (fresh) lastSnapshotAtRef.current = nowMs;
    });
    return unsub;
  }, []);

  /* ── smooth point animation ───────────────────────────── */

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
      const selectedId = selectedSatelliteRef.current?.id ?? null;
      const selectedMotion = selectedId ? pointMotionRef.current.get(selectedId) : null;

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

      if (selectedMotion) {
        const position = getMotionPosition(selectedMotion, nowMs);
        const cartesian = activeCesium.Cartesian3.fromDegrees(
          position.lng,
          position.lat,
          position.altKm * 1000
        );

        if (selectedLabelEntityRef.current) {
          selectedLabelEntityRef.current.position =
            new activeCesium.ConstantPositionProperty(cartesian);
        }
        if (coverageEntityRef.current) {
          coverageEntityRef.current.position =
            new activeCesium.ConstantPositionProperty(
              activeCesium.Cartesian3.fromDegrees(position.lng, position.lat, 0)
            );
        }
      }

      /* ── Clock sync + smooth camera rotation ── */
      const timeState = useTimeStore.getState();
      const storeTimeMs = timeState.currentTime.getTime();

      // Interpolate clock between store ticks so lighting doesn't jump
      if (storeTimeMs !== lastStoreTimeMsRef.current) {
        lastStoreTimeMsRef.current = storeTimeMs;
        lastStoreWallMsRef.current = nowMs;
      }
      const wallSinceUpdate = nowMs - lastStoreWallMsRef.current;
      const interpolatedMs = timeState.isPlaying
        ? storeTimeMs + timeState.speed * wallSinceUpdate
        : storeTimeMs;
      activeViewer.clock.currentTime = activeCesium.JulianDate.fromDate(
        new Date(interpolatedMs)
      );

      // Camera rotation around Earth's Z axis (spins globe + skybox together)
      const dtSec = Math.min((nowMs - lastFrameMsRef.current) / 1000, 0.05);
      lastFrameMsRef.current = nowMs;

      if (timeState.isPlaying && !isUserInteractingRef.current && dtSec > 0) {
        const EARTH_DEG_PER_SEC = 360 / 86400;
        const MAX_DEG_PER_SEC = 2;
        const deg = Math.min(EARTH_DEG_PER_SEC * timeState.speed, MAX_DEG_PER_SEC);
        activeViewer.camera.rotate(
          activeCesium.Cartesian3.UNIT_Z,
          -activeCesium.Math.toRadians(deg * dtSec)
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

  /* ── update satellite points ───────────────────────────── */

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
    )
      return;

    const currentIds = new Set(satellites.map((s) => s.id));
    const existingIdsList = Array.from(pointMapRef.current.keys());

    // Remove stale points
    existingIdsList.forEach((id) => {
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

    // Shared NearFarScalar instances (avoid allocating per satellite)
    const sharedScale = new Cesium.NearFarScalar(2.0e6, 1.4, 4.2e7, 0.6);
    const sharedTranslucency = new Cesium.NearFarScalar(2.0e6, 1.0, 4.2e7, 0.8);

    // Pre-parse orbit colors once
    const colorCache = new Map<string, InstanceType<typeof Cesium.Color>>();
    const getColor = (orbitType: string) => {
      let c = colorCache.get(orbitType);
      if (!c) {
        c = Cesium.Color.fromCssColorString(getOrbitPointColor(orbitType));
        colorCache.set(orbitType, c);
      }
      return c;
    };

    // Add / update
    for (const sat of satellites) {
      const pos = positions.get(sat.id);
      const lat = pos?.lat ?? sat.latitude;
      const lng = pos?.lng ?? sat.longitude;
      const altKm = pos?.alt ?? sat.altitude;

      if (!hasRenderableCoordinates(lat, lng, altKm)) {
        const p = pointMapRef.current.get(sat.id);
        if (p) {
          pointCollection.remove(p);
          pointMapRef.current.delete(sat.id);
        }
        pointMotionRef.current.delete(sat.id);
        continue;
      }

      const isSelected = selectedSatellite?.id === sat.id;
      const baseColor = getColor(sat.orbitType);
      const pointColor = baseColor.withAlpha(isSelected ? 1.0 : 0.85);
      const pixelSize = isSelected ? 9 : 6;
      const outlineWidth = isSelected ? 2 : 0.5;
      const outlineColor = isSelected
        ? Cesium.Color.WHITE.withAlpha(0.95)
        : baseColor.withAlpha(0.4);

      const existingPoint = pointMapRef.current.get(sat.id);

      if (existingPoint) {
        existingPoint.pixelSize = pixelSize;
        existingPoint.color = pointColor;
        existingPoint.outlineWidth = outlineWidth;
        existingPoint.outlineColor = outlineColor;
        existingPoint.show = true;
      } else {
        const initPos = { lat, lng, altKm };
        const point = pointCollection.add({
          id: sat.id,
          position: Cesium.Cartesian3.fromDegrees(lng, lat, altKm * 1000),
          pixelSize,
          color: pointColor,
          outlineColor,
          outlineWidth,
          disableDepthTestDistance: 0,
          scaleByDistance: sharedScale,
          translucencyByDistance: sharedTranslucency,
        });
        pointMapRef.current.set(sat.id, point);

        // Ensure initial motion state exists
        if (!pointMotionRef.current.has(sat.id)) {
          pointMotionRef.current.set(sat.id, {
            from: initPos,
            to: initPos,
            startedAtMs: nowMs,
            durationMs: 0,
          });
        }
      }
    }

    // Selected label
    if (selectedLabelEntityRef.current) {
      viewer.entities.remove(selectedLabelEntityRef.current);
      selectedLabelEntityRef.current = null;
    }

    if (selectedSatellite) {
      const pos = positions.get(selectedSatellite.id);
      const lat = pos?.lat ?? selectedSatellite.latitude;
      const lng = pos?.lng ?? selectedSatellite.longitude;
      const altKm = pos?.alt ?? selectedSatellite.altitude;

      if (hasRenderableCoordinates(lat, lng, altKm)) {
        selectedLabelEntityRef.current = viewer.entities.add({
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

  /* ── coverage zone (footprint) ─────────────────────────── */

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (viewerState !== 'ready' || !viewer || viewer.isDestroyed() || !Cesium) return;

    if (coverageEntityRef.current) {
      viewer.entities.remove(coverageEntityRef.current);
      coverageEntityRef.current = null;
    }

    if (!selectedSatellite) return;

    const pos = positionsRef.current.get(selectedSatellite.id);
    const lat = pos?.lat ?? selectedSatellite.latitude;
    const lng = pos?.lng ?? selectedSatellite.longitude;
    const altKm = pos?.alt ?? selectedSatellite.altitude;

    if (!hasRenderableCoordinates(lat, lng, altKm)) return;

    // Footprint radius calculation
    const halfAngle = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm));
    const groundRadiusMeters = EARTH_RADIUS_KM * halfAngle * 1000;

    const baseColor = getOrbitPointColor(selectedSatellite.orbitType);
    const color = Cesium.Color.fromCssColorString(baseColor);

    coverageEntityRef.current = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat, 0),
      ellipse: {
        semiMajorAxis: groundRadiusMeters,
        semiMinorAxis: groundRadiusMeters,
        material: color.withAlpha(0.08),
        outline: true,
        outlineColor: color.withAlpha(0.4),
        outlineWidth: 1.5,
        height: 0,
      },
    });

    viewer.scene.requestRender();
  }, [selectedSatellite, viewerState]);

  /* ── clicked location marker ─────────────────────────── */

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    const clickedLocation = useSatelliteStore.getState().clickedLocation;
    if (viewerState !== 'ready' || !viewer || viewer.isDestroyed() || !Cesium) return;

    if (clickedLocationEntityRef.current) {
      viewer.entities.remove(clickedLocationEntityRef.current);
      clickedLocationEntityRef.current = null;
    }

    if (!clickedLocation) return;

    clickedLocationEntityRef.current = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(clickedLocation.lng, clickedLocation.lat, 0),
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

  // Subscribe to clickedLocation changes
  useEffect(() => {
    const unsub = useSatelliteStore.subscribe((state, prev) => {
      if (state.clickedLocation !== prev.clickedLocation) {
        const viewer = viewerRef.current;
        const Cesium = cesiumRef.current;
        if (!viewer || viewer.isDestroyed() || !Cesium) return;

        if (clickedLocationEntityRef.current) {
          viewer.entities.remove(clickedLocationEntityRef.current);
          clickedLocationEntityRef.current = null;
        }

        const loc = state.clickedLocation;
        if (!loc) { viewer.scene.requestRender(); return; }

        clickedLocationEntityRef.current = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(loc.lng, loc.lat, 0),
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
      }
    });
    return unsub;
  }, []);

  /* ── orbit path (only when satellite selected) ─────────── */

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (viewerState !== 'ready' || !viewer || viewer.isDestroyed() || !Cesium) return;

    if (orbitEntityRef.current) {
      viewer.entities.remove(orbitEntityRef.current);
      orbitEntityRef.current = null;
      viewer.scene.requestRender();
    }

    if (!selectedSatellite) return;

    const sat = selectedSatellite;
    if (!isRenderableAltitudeKm(sat.altitude)) return;

    let cancelled = false;

    (async () => {
      try {
        // Fetch full orbit period (~3 hours for LEO, enough for one revolution)
        const orbitData = await fetchOrbit(sat.id, 3);
        if (cancelled || !viewerRef.current || viewerRef.current.isDestroyed()) return;

        if (!orbitData || orbitData.length < 2) return;

        const orbitPositions = orbitData.map((pt) =>
          Cesium.Cartesian3.fromDegrees(pt.lng, pt.lat, (pt.alt ?? sat.altitude) * 1000)
        );

        const orbitColor = Cesium.Color.fromCssColorString(
          getOrbitPointColor(sat.orbitType)
        ).withAlpha(0.85);

        orbitEntityRef.current = viewer.entities.add({
          polyline: {
            positions: orbitPositions,
            width: 3,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.3,
              color: orbitColor,
            }),
            clampToGround: false,
          },
        });

        viewer.scene.requestRender();
      } catch (err) {
        console.warn('Failed to fetch orbit:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedSatellite, viewerState]);

  /* ── render ─────────────────────────────────────────────── */

  return (
    <div className="relative w-full h-full" style={{ background: GLOBE_BACKGROUND }}>
      <div ref={containerRef} className="absolute inset-0" />

      {viewerState === 'initializing' && (
        <div className="absolute inset-0 flex items-center justify-center bg-cosmos-bg/50">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
            <p className="text-[#9ca3af] text-sm">
              {'\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0433\u043B\u043E\u0431\u0443\u0441\u0430...'}
            </p>
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
              {viewerError ??
                'Проверь поддержку WebGL в браузере и перезагрузи страницу.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
