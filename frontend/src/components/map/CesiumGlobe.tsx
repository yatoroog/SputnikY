'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Satellite } from '@/types';
import { useSatelliteStore } from '@/store/satelliteStore';
import { isRenderableAltitudeKm } from '@/lib/utils';

if (typeof window !== 'undefined') {
  window.CESIUM_BASE_URL = '/cesium';
}

const EARTH_RADIUS_METERS = 6_378_137;
const INITIAL_CAMERA_RANGE_METERS = 22_000_000;
const GRID_ALTITUDE_METERS = 22_000;
const GRID_STEP_DEGREES = 10;

const GLOBE_BACKGROUND = '#04101d';
const GLOBE_BASE = '#16314e';
const GLOBE_COUNTRY_STROKE = '#c4cedd';
const GLOBE_GRID = '#e18d2b';
const GLOBE_GRID_EMPHASIS = '#ffc062';
const SATELLITE_COLOR = '#ff9f1f';
const SATELLITE_SELECTED_COLOR = '#ffe0ad';
const ORBIT_PATH_COLOR = '#ffb24c';
const LABEL_COLOR = '#f8fafc';

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

function buildParallelPositions(
  Cesium: typeof import('cesium'),
  latitude: number,
  altitude: number
) {
  const positions: InstanceType<typeof Cesium.Cartesian3>[] = [];

  for (let longitude = -180; longitude <= 180; longitude += 2) {
    positions.push(Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude));
  }

  return positions;
}

function buildMeridianPositions(
  Cesium: typeof import('cesium'),
  longitude: number,
  altitude: number
) {
  const positions: InstanceType<typeof Cesium.Cartesian3>[] = [];

  for (let latitude = -90; latitude <= 90; latitude += 2) {
    positions.push(Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude));
  }

  return positions;
}

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
  const selectedLabelEntityRef = useRef<InstanceType<typeof import('cesium').Entity> | null>(null);
  const globeOverlayEntitiesRef = useRef<Array<InstanceType<typeof import('cesium').Entity>>>([]);
  const clickHandlerRef = useRef<InstanceType<typeof import('cesium').ScreenSpaceEventHandler> | null>(null);
  const countryBordersRef = useRef<InstanceType<typeof import('cesium').GeoJsonDataSource> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cesiumRef = useRef<typeof import('cesium') | null>(null);
  const satellitesRef = useRef<Satellite[]>(satellites);
  const [viewerState, setViewerState] = useState<'initializing' | 'ready' | 'error'>(
    'initializing'
  );
  const [viewerError, setViewerError] = useState<string | null>(null);
  const positions = useSatelliteStore((state) => state.positions);
  const selectSatellite = useSatelliteStore((state) => state.selectSatellite);
  satellitesRef.current = satellites;

  const renderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const initViewer = useCallback(async () => {
    if (!containerRef.current || viewerRef.current) return;

    setViewerState('initializing');
    setViewerError(null);

    try {
      const Cesium = await import('cesium');
      // @ts-expect-error - CSS module import for Cesium widgets
      await import('cesium/Build/Cesium/Widgets/widgets.css').catch(() => {
        // CSS may not load in all environments
      });

      // Guard against double initialization (React Strict Mode)
      if (viewerRef.current) return;

      cesiumRef.current = Cesium;

      const token = process.env.NEXT_PUBLIC_CESIUM_TOKEN;
      if (token && token !== 'your_cesium_ion_token_here') {
        Cesium.Ion.defaultAccessToken = token;
      }

      const baseUrl = Cesium.buildModuleUrl('');

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
              positiveX: `${baseUrl}Assets/Textures/SkyBox/tycho2t3_80_px.jpg`,
              negativeX: `${baseUrl}Assets/Textures/SkyBox/tycho2t3_80_mx.jpg`,
              positiveY: `${baseUrl}Assets/Textures/SkyBox/tycho2t3_80_py.jpg`,
              negativeY: `${baseUrl}Assets/Textures/SkyBox/tycho2t3_80_my.jpg`,
              positiveZ: `${baseUrl}Assets/Textures/SkyBox/tycho2t3_80_pz.jpg`,
              negativeZ: `${baseUrl}Assets/Textures/SkyBox/tycho2t3_80_mz.jpg`,
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
      if (viewer.scene.moon) {
        viewer.scene.moon.show = false;
      }
      if (viewer.scene.sun) {
        viewer.scene.sun.show = false;
      }
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = false;
      }
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(GLOBE_BASE);
      viewer.scene.globe.depthTestAgainstTerrain = false;
      viewer.scene.globe.enableLighting = false;
      viewer.scene.globe.showGroundAtmosphere = false;
      viewer.scene.globe.showWaterEffect = false;
      viewer.scene.postProcessStages.fxaa.enabled = true;
      viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 7_500_000;
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 60_000_000;

      pointCollectionRef.current = viewer.scene.primitives.add(
        new Cesium.PointPrimitiveCollection()
      );

      const gridColor = Cesium.Color.fromCssColorString(GLOBE_GRID).withAlpha(0.26);
      const emphasisGridColor = Cesium.Color.fromCssColorString(GLOBE_GRID_EMPHASIS).withAlpha(0.4);

      for (let longitude = -180; longitude < 180; longitude += GRID_STEP_DEGREES) {
        const isEmphasis = longitude === 0 || Math.abs(longitude) === 180;
        globeOverlayEntitiesRef.current.push(
          viewer.entities.add({
            polyline: {
              positions: buildMeridianPositions(Cesium, longitude, GRID_ALTITUDE_METERS),
              width: isEmphasis ? 1.2 : 0.9,
              material: isEmphasis ? emphasisGridColor : gridColor,
              arcType: Cesium.ArcType.NONE,
            },
          })
        );
      }

      for (let latitude = -80; latitude <= 80; latitude += GRID_STEP_DEGREES) {
        const isEmphasis = latitude === 0;
        globeOverlayEntitiesRef.current.push(
          viewer.entities.add({
            polyline: {
              positions: buildParallelPositions(Cesium, latitude, GRID_ALTITUDE_METERS),
              width: isEmphasis ? 1.2 : 0.9,
              material: isEmphasis ? emphasisGridColor : gridColor,
              arcType: Cesium.ArcType.NONE,
            },
          })
        );
      }

      globeOverlayEntitiesRef.current.push(
        viewer.entities.add({
          position: Cesium.Cartesian3.ZERO,
          ellipsoid: {
            radii: new Cesium.Cartesian3(
              EARTH_RADIUS_METERS + GRID_ALTITUDE_METERS,
              EARTH_RADIUS_METERS + GRID_ALTITUDE_METERS,
              EARTH_RADIUS_METERS + GRID_ALTITUDE_METERS
            ),
            fill: false,
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#7691ff').withAlpha(0.28),
            outlineWidth: 1.2,
            stackPartitions: 128,
            slicePartitions: 128,
          },
        })
      );

      globeOverlayEntitiesRef.current.push(
        viewer.entities.add({
          position: Cesium.Cartesian3.ZERO,
          ellipsoid: {
            radii: new Cesium.Cartesian3(
              EARTH_RADIUS_METERS + 110_000,
              EARTH_RADIUS_METERS + 110_000,
              EARTH_RADIUS_METERS + 110_000
            ),
            fill: false,
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#a7b4ff').withAlpha(0.14),
            outlineWidth: 1.4,
            stackPartitions: 128,
            slicePartitions: 128,
          },
        })
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

      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      clickHandlerRef.current = handler;
      handler.setInputAction((movement: { position: InstanceType<typeof Cesium.Cartesian2> }) => {
        const picked = viewer.scene.pick(movement.position) as
          | {
              id?: unknown;
              primitive?: {
                id?: unknown;
              };
            }
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
            satelliteId?: {
              getValue?: () => unknown;
            };
          };
          const value = props.satelliteId?.getValue?.();
          if (typeof value === 'string') {
            satId = value;
          }
        }

        if (satId) {
          const sat = satellitesRef.current.find((item) => item.id === satId);
          if (sat) {
            selectSatellite(sat);
          }
        } else {
          selectSatellite(null);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      viewerRef.current = viewer;
      setViewerState('ready');
      viewer.scene.requestRender();

      // Periodic render to keep scene alive (satellite position updates, camera movement)
      renderIntervalRef.current = setInterval(() => {
        if (viewer && !viewer.isDestroyed()) {
          viewer.scene.requestRender();
        }
      }, 2000);

      void (async () => {
        try {
          const tmsUrl = Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII');
          const provider = await Cesium.TileMapServiceImageryProvider.fromUrl(tmsUrl);

          if (!viewer.isDestroyed()) {
            const earthLayer = viewer.imageryLayers.addImageryProvider(provider);
            earthLayer.alpha = 0.96;
            earthLayer.brightness = 0.72;
            earthLayer.contrast = 1.18;
            earthLayer.gamma = 1.02;
            earthLayer.saturation = 0.2;
            earthLayer.hue = -0.02;
            viewer.scene.requestRender();
          }
        } catch {
          // Fall back to globe base color if bundled imagery fails to load.
        }

        try {
          const countryBorders = await Cesium.GeoJsonDataSource.load(
            '/data/ne_110m_admin_0_countries.geojson',
            {
              stroke: Cesium.Color.fromCssColorString(GLOBE_COUNTRY_STROKE).withAlpha(0.52),
              fill: Cesium.Color.TRANSPARENT,
              strokeWidth: 1,
              clampToGround: true,
            }
          );

          for (const entity of countryBorders.entities.values) {
            if (entity.polygon) {
              entity.polygon.material = new Cesium.ColorMaterialProperty(Cesium.Color.TRANSPARENT);
              entity.polygon.outline = new Cesium.ConstantProperty(false);
            }

            if (entity.polyline) {
              entity.polyline.material = new Cesium.ColorMaterialProperty(
                Cesium.Color.fromCssColorString(GLOBE_COUNTRY_STROKE).withAlpha(0.52)
              );
              entity.polyline.width = new Cesium.ConstantProperty(1);
              entity.polyline.clampToGround = new Cesium.ConstantProperty(true);
            }
          }

          if (!viewer.isDestroyed()) {
            viewer.dataSources.add(countryBorders);
            countryBordersRef.current = countryBorders;
            viewer.scene.requestRender();
          }
        } catch {
          // Country borders are decorative; continue without them if the asset cannot be loaded.
        }
      })();
    } catch (error) {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      setViewerState('error');
      setViewerError(
        error instanceof Error ? error.message : 'Не удалось подготовить 3D-глобус'
      );
    }
  }, [selectSatellite]);

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
      globeOverlayEntitiesRef.current = [];
      pointMapRef.current.clear();
      pointCollectionRef.current = null;
      selectedLabelEntityRef.current = null;

      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
    // Only init once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update satellite entities
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

    const currentIds = new Set(satellites.map((s) => s.id));
    const existingIdsList = Array.from(pointMapRef.current.keys());

    // Remove points no longer in the list
    existingIdsList.forEach((id) => {
      if (!currentIds.has(id)) {
        const point = pointMapRef.current.get(id);
        if (point) {
          pointCollection.remove(point);
          pointMapRef.current.delete(id);
        }
      }
    });

    // Add or update points
    for (const sat of satellites) {
      const pos = positions.get(sat.id);
      const lat = pos?.lat ?? sat.latitude;
      const lng = pos?.lng ?? sat.longitude;
      const altKm = pos?.alt ?? sat.altitude;
      if (!hasRenderableCoordinates(lat, lng, altKm)) {
        const hiddenPoint = pointMapRef.current.get(sat.id);
        if (hiddenPoint) {
          pointCollection.remove(hiddenPoint);
          pointMapRef.current.delete(sat.id);
        }
        continue;
      }
      const alt = altKm * 1000;

      const position = Cesium.Cartesian3.fromDegrees(lng, lat, alt);
      const isSelected = selectedSatellite?.id === sat.id;
      const pointColor = Cesium.Color.fromCssColorString(
        isSelected ? SATELLITE_SELECTED_COLOR : SATELLITE_COLOR
      ).withAlpha(0.98);
      const outlineColor = Cesium.Color.fromCssColorString('#fff3d6').withAlpha(
        isSelected ? 0.98 : 0.9
      );
      const pixelSize = isSelected ? 14 : 10.5;

      const existingPoint = pointMapRef.current.get(sat.id);

      if (existingPoint) {
        existingPoint.position = position;
        existingPoint.pixelSize = pixelSize;
        existingPoint.color = pointColor;
        existingPoint.outlineWidth = isSelected ? 3.6 : 2.8;
        existingPoint.outlineColor = outlineColor;
        existingPoint.disableDepthTestDistance = Number.POSITIVE_INFINITY;
        existingPoint.scaleByDistance = new Cesium.NearFarScalar(2.0e6, 1.35, 4.2e7, 1.12);
        existingPoint.translucencyByDistance = new Cesium.NearFarScalar(2.0e6, 1.0, 4.2e7, 1.0);
        existingPoint.show = true;
      } else {
        const point = pointCollection.add({
          id: sat.id,
          position,
          pixelSize,
          color: pointColor,
          outlineColor,
          outlineWidth: isSelected ? 3.6 : 2.8,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(2.0e6, 1.35, 4.2e7, 1.12),
          translucencyByDistance: new Cesium.NearFarScalar(2.0e6, 1.0, 4.2e7, 1.0),
        });
        pointMapRef.current.set(sat.id, point);
      }
    }

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
            pixelOffset: new Cesium.Cartesian2(0, -18),
            scaleByDistance: new Cesium.NearFarScalar(1.0e3, 1.0, 5.0e6, 0.4),
          },
          properties: {
            satelliteId: selectedSatellite.id,
          },
        });
      }
    }

    viewer.scene.requestRender();
  }, [satellites, positions, selectedSatellite, viewerState]);

  // Show orbit path for selected satellite
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (viewerState !== 'ready' || !viewer || viewer.isDestroyed() || !Cesium) return;

    // Remove previous orbit
    if (orbitEntityRef.current) {
      viewer.entities.remove(orbitEntityRef.current);
      orbitEntityRef.current = null;
      viewer.scene.requestRender();
    }

    if (!selectedSatellite) return;

    // Generate a simple orbit approximation using inclination and period
    const sat = selectedSatellite;
    if (!isRenderableAltitudeKm(sat.altitude)) {
      return;
    }
    const orbitPoints: InstanceType<typeof Cesium.Cartesian3>[] = [];
    const numPoints = 360;
    const inclinationRad = (sat.inclination * Math.PI) / 180;
    const altMeters = sat.altitude * 1000;
    const periodSec = sat.period * 60;

    for (let i = 0; i <= numPoints; i++) {
      const fraction = i / numPoints;
      const angle = fraction * 2 * Math.PI;

      const latRad = Math.asin(Math.sin(inclinationRad) * Math.sin(angle));
      const lngRad =
        Math.atan2(
          Math.cos(inclinationRad) * Math.sin(angle),
          Math.cos(angle)
        ) +
        ((sat.longitude * Math.PI) / 180) -
        fraction * ((2 * Math.PI * 86400) / periodSec - 2 * Math.PI);

      const latDeg = (latRad * 180) / Math.PI;
      let lngDeg = (lngRad * 180) / Math.PI;

      // Normalize longitude
      while (lngDeg > 180) lngDeg -= 360;
      while (lngDeg < -180) lngDeg += 360;

      orbitPoints.push(Cesium.Cartesian3.fromDegrees(lngDeg, latDeg, altMeters));
    }

    const orbitEntity = viewer.entities.add({
      polyline: {
        positions: orbitPoints,
        width: 2,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.18,
          color: Cesium.Color.fromCssColorString(ORBIT_PATH_COLOR).withAlpha(0.68),
        }),
        clampToGround: false,
      },
    });

    orbitEntityRef.current = orbitEntity;
    viewer.scene.requestRender();
  }, [selectedSatellite, viewerState]);

  // Fly to selected satellite
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (
      viewerState !== 'ready' ||
      !viewer ||
      viewer.isDestroyed() ||
      !Cesium ||
      !selectedSatellite
    ) {
      return;
    }

    const pos = positions.get(selectedSatellite.id);
    const lat = pos?.lat ?? selectedSatellite.latitude;
    const lng = pos?.lng ?? selectedSatellite.longitude;
    const altKm = pos?.alt ?? selectedSatellite.altitude;
    if (!hasRenderableCoordinates(lat, lng, altKm)) {
      return;
    }
    const alt = altKm * 1000;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, alt + 2000000),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-60),
        roll: 0,
      },
      duration: 1.5,
    });
    viewer.scene.requestRender();
  }, [selectedSatellite, positions, viewerState]);

  return (
    <div className="relative w-full h-full" style={{ background: GLOBE_BACKGROUND }}>
      <div ref={containerRef} className="absolute inset-0" />

      {viewerState === 'initializing' && (
        <div className="absolute inset-0 flex items-center justify-center bg-cosmos-bg/50">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
            <p className="text-[#9ca3af] text-sm">{'\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0433\u043B\u043E\u0431\u0443\u0441\u0430...'}</p>
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
