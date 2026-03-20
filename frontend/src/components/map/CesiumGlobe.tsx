'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Satellite } from '@/types';
import { useSatelliteStore } from '@/store/satelliteStore';
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
  const renderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [viewerState, setViewerState] = useState<'initializing' | 'ready' | 'error'>(
    'initializing'
  );
  const [viewerError, setViewerError] = useState<string | null>(null);

  const positions = useSatelliteStore((state) => state.positions);
  const selectSatellite = useSatelliteStore((state) => state.selectSatellite);
  const setClickedLocation = useSatelliteStore((state) => state.setClickedLocation);
  satellitesRef.current = satellites;

  /* ── init ───────────────────────────────────────────────── */

  const initViewer = useCallback(async () => {
    if (!containerRef.current || viewerRef.current) return;

    setViewerState('initializing');
    setViewerError(null);

    try {
      const Cesium = await import('cesium');
      // @ts-expect-error - CSS module import for Cesium widgets
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
      viewer.scene.fog.enabled = false;
      if (viewer.scene.moon) viewer.scene.moon.show = false;
      if (viewer.scene.sun) viewer.scene.sun.show = false;
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;

      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(GLOBE_BASE);
      viewer.scene.globe.depthTestAgainstTerrain = true;
      viewer.scene.globe.enableLighting = false;
      viewer.scene.globe.showGroundAtmosphere = false;
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
      if (renderIntervalRef.current) {
        clearInterval(renderIntervalRef.current);
        renderIntervalRef.current = null;
      }
      clickHandlerRef.current?.destroy();
      clickHandlerRef.current = null;
      countryBordersRef.current = null;
      pointMapRef.current.clear();
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
      }
    });

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
        continue;
      }

      const position = Cesium.Cartesian3.fromDegrees(lng, lat, altKm * 1000);
      const isSelected = selectedSatellite?.id === sat.id;
      const baseColor = getOrbitPointColor(sat.orbitType);
      const pointColor = Cesium.Color.fromCssColorString(baseColor).withAlpha(
        isSelected ? 1.0 : 0.85
      );

      const pixelSize = isSelected ? 9 : 6;
      const outlineWidth = isSelected ? 2 : 0.5;
      const outlineColor = isSelected
        ? Cesium.Color.WHITE.withAlpha(0.95)
        : Cesium.Color.fromCssColorString(baseColor).withAlpha(0.4);

      const existingPoint = pointMapRef.current.get(sat.id);

      if (existingPoint) {
        existingPoint.position = position;
        existingPoint.pixelSize = pixelSize;
        existingPoint.color = pointColor;
        existingPoint.outlineWidth = outlineWidth;
        existingPoint.outlineColor = outlineColor;
        existingPoint.disableDepthTestDistance = 0;
        existingPoint.scaleByDistance = new Cesium.NearFarScalar(
          2.0e6, 1.4, 4.2e7, 0.6
        );
        existingPoint.translucencyByDistance = new Cesium.NearFarScalar(
          2.0e6, 1.0, 4.2e7, 0.8
        );
        existingPoint.show = true;
      } else {
        const point = pointCollection.add({
          id: sat.id,
          position,
          pixelSize,
          color: pointColor,
          outlineColor,
          outlineWidth,
          disableDepthTestDistance: 0,
          scaleByDistance: new Cesium.NearFarScalar(2.0e6, 1.4, 4.2e7, 0.6),
          translucencyByDistance: new Cesium.NearFarScalar(2.0e6, 1.0, 4.2e7, 0.8),
        });
        pointMapRef.current.set(sat.id, point);
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
  }, [satellites, positions, selectedSatellite, viewerState]);

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

    const pos = positions.get(selectedSatellite.id);
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
  }, [selectedSatellite, positions, viewerState]);

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
        const orbitData = await fetchOrbit(sat.id, 2);
        if (cancelled || !viewerRef.current || viewerRef.current.isDestroyed()) return;

        if (!orbitData || orbitData.length < 2) return;

        const orbitPositions = orbitData.map((pt) =>
          Cesium.Cartesian3.fromDegrees(pt.lng, pt.lat, (pt.alt ?? sat.altitude) * 1000)
        );

        const orbitColor = Cesium.Color.fromCssColorString(
          getOrbitPointColor(sat.orbitType)
        ).withAlpha(0.6);

        orbitEntityRef.current = viewer.entities.add({
          polyline: {
            positions: orbitPositions,
            width: 2,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.2,
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
