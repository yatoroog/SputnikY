import type {
  Satellite,
  OrbitPoint,
  Pass,
  AreaPass,
  SatelliteApproach,
  SatelliteApproachesResponse,
  AreaSatelliteApproach,
  AreaSatelliteApproachesResponse,
  FilterParams,
  SatellitePosition,
  CatalogStatus,
  FilterFacets,
  ObserverArea,
  TrackedSatellite,
} from '@/types';
import { isRenderableAltitudeKm } from '@/lib/utils';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers = new Headers(options?.headers);

  if (!(options?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

type SatelliteWire = Partial<Satellite> & {
  id: string;
  name: string;
  norad_id?: number;
  orbit_type?: string;
};

type PassWire = Partial<Pass> & {
  satellite_id?: string;
  satellite_name?: string;
  max_elevation?: number;
};

type SatelliteListResponse = {
  count: number;
  catalog_status?: CatalogStatusWire;
  filter_facets?: FilterFacetsWire;
  satellites: SatelliteWire[];
};

type CatalogStatusWire = Partial<CatalogStatus> & {
  last_sync_at?: string | null;
};

type FilterFacetsWire = Partial<FilterFacets> & {
  countries?: string[];
  purposes?: string[];
};

export type SatelliteCatalog = {
  satellites: Satellite[];
  catalogStatus: CatalogStatus | null;
  filterFacets: FilterFacets | null;
};

type OrbitResponse = {
  satellite_id: string;
  duration_min: number;
  points: OrbitPoint[];
};

type PassesResponse = {
  satellite_id: string;
  satellite_name: string;
  observer: {
    lat: number;
    lng: number;
    alt: number;
  };
  hours: number;
  passes: PassWire[];
};

type PresetsResponse = {
  presets: string[];
};

type PositionsResponse = {
  time: string;
  count: number;
  positions: SatellitePosition[];
};

type ObserverAreaWire = Partial<ObserverArea> & {
  radius_km?: number;
};

type TrackedSatelliteWire = Partial<TrackedSatellite> & {
  norad_id?: number;
  orbit_type?: string;
};

type SatelliteApproachWire = Partial<SatelliteApproach> & {
  satellite_id?: string;
  satellite_name?: string;
  start_at?: number;
  end_at?: number;
  closest_at?: number;
  notify_at?: number;
  min_distance_km?: number;
  radius_km?: number;
  closest_lat?: number;
  closest_lng?: number;
  closest_altitude_km?: number;
  closest_velocity_km_s?: number;
};

type SatelliteApproachesResponseWire = {
  satellite: TrackedSatelliteWire;
  observer: ObserverAreaWire;
  hours: number;
  notify_before_min?: number;
  approaches: SatelliteApproachWire[];
};

type AreaSatelliteApproachWire = {
  satellite?: TrackedSatelliteWire;
  approach?: SatelliteApproachWire;
};

type AreaSatelliteApproachesResponseWire = {
  observer: ObserverAreaWire;
  hours: number;
  notify_before_min?: number;
  approaches: AreaSatelliteApproachWire[];
};

function normalizeSatellite(satellite: SatelliteWire): Satellite | null {
  const normalized = {
    id: satellite.id,
    name: satellite.name,
    noradId: satellite.noradId ?? satellite.norad_id ?? 0,
    country: satellite.country ?? 'Unknown',
    orbitType: satellite.orbitType ?? satellite.orbit_type ?? '',
    purpose: satellite.purpose ?? '',
    latitude: satellite.latitude ?? 0,
    longitude: satellite.longitude ?? 0,
    altitude: satellite.altitude ?? 0,
    velocity: satellite.velocity ?? 0,
    period: satellite.period ?? 0,
    inclination: satellite.inclination ?? 0,
    epoch: satellite.epoch ?? '',
  };

  if (
    !Number.isFinite(normalized.latitude) ||
    !Number.isFinite(normalized.longitude) ||
    normalized.latitude < -90 ||
    normalized.latitude > 90 ||
    normalized.longitude < -180 ||
    normalized.longitude > 180 ||
    !isRenderableAltitudeKm(normalized.altitude)
  ) {
    return null;
  }

  return normalized;
}

function normalizePass(pass: PassWire): Pass {
  return {
    satelliteId: pass.satelliteId ?? pass.satellite_id ?? '',
    satelliteName: pass.satelliteName ?? pass.satellite_name ?? '',
    aos: pass.aos ?? 0,
    los: pass.los ?? 0,
    maxElevation: pass.maxElevation ?? pass.max_elevation ?? 0,
    duration: pass.duration ?? 0,
  };
}

function normalizePosition(position: SatellitePosition): SatellitePosition | null {
  if (
    typeof position.id !== 'string' ||
    !Number.isFinite(position.lat) ||
    position.lat < -90 ||
    position.lat > 90 ||
    !Number.isFinite(position.lng) ||
    position.lng < -180 ||
    position.lng > 180 ||
    !isRenderableAltitudeKm(position.alt)
  ) {
    return null;
  }

  return position;
}

function normalizeTrackedSatellite(satellite: TrackedSatelliteWire): TrackedSatellite {
  return {
    id: satellite.id ?? '',
    name: satellite.name ?? '',
    noradId: satellite.noradId ?? satellite.norad_id ?? 0,
    orbitType: satellite.orbitType ?? satellite.orbit_type ?? '',
    country: satellite.country ?? 'Unknown',
    purpose: satellite.purpose ?? '',
  };
}

function normalizeObserverArea(observer: ObserverAreaWire): ObserverArea {
  return {
    name: observer.name,
    lat: observer.lat ?? 0,
    lng: observer.lng ?? 0,
    radiusKm: observer.radiusKm ?? observer.radius_km ?? 0,
  };
}

function normalizeSatelliteApproach(approach: SatelliteApproachWire): SatelliteApproach {
  return {
    satelliteId: approach.satelliteId ?? approach.satellite_id ?? '',
    satelliteName: approach.satelliteName ?? approach.satellite_name ?? '',
    startAt: approach.startAt ?? approach.start_at ?? 0,
    endAt: approach.endAt ?? approach.end_at ?? 0,
    closestAt: approach.closestAt ?? approach.closest_at ?? 0,
    notifyAt: approach.notifyAt ?? approach.notify_at ?? 0,
    minDistanceKm: approach.minDistanceKm ?? approach.min_distance_km ?? 0,
    radiusKm: approach.radiusKm ?? approach.radius_km ?? 0,
    duration: approach.duration ?? 0,
    closestLat: approach.closestLat ?? approach.closest_lat ?? 0,
    closestLng: approach.closestLng ?? approach.closest_lng ?? 0,
    closestAltitudeKm: approach.closestAltitudeKm ?? approach.closest_altitude_km ?? 0,
    closestVelocityKmS:
      approach.closestVelocityKmS ?? approach.closest_velocity_km_s ?? 0,
  };
}

function normalizeAreaSatelliteApproach(
  event: AreaSatelliteApproachWire
): AreaSatelliteApproach {
  return {
    satellite: normalizeTrackedSatellite(event.satellite ?? {}),
    approach: normalizeSatelliteApproach(event.approach ?? {}),
  };
}

function normalizeCatalogStatus(status?: CatalogStatusWire | null): CatalogStatus | null {
  if (!status || typeof status.source !== 'string' || status.source.trim() === '') {
    return null;
  }

  return {
    source: status.source,
    lastSyncAt: status.lastSyncAt ?? status.last_sync_at ?? null,
    note: status.note ?? null,
  };
}

function normalizeFilterFacets(facets?: FilterFacetsWire | null): FilterFacets | null {
  if (!facets) {
    return null;
  }

  const countries = Array.isArray(facets.countries)
    ? facets.countries.filter((value): value is string => typeof value === 'string' && value !== '')
    : [];
  const purposes = Array.isArray(facets.purposes)
    ? facets.purposes.filter((value): value is string => typeof value === 'string' && value !== '')
    : [];

  return {
    countries,
    purposes,
  };
}

export async function fetchSatelliteCatalog(filters?: FilterParams): Promise<SatelliteCatalog> {
  const params = new URLSearchParams();

  if (filters?.country) params.set('country', filters.country);
  if (filters?.orbitType) params.set('orbit_type', filters.orbitType);
  if (filters?.purpose) params.set('purpose', filters.purpose);
  if (filters?.search) params.set('search', filters.search);

  const query = params.toString();
  const path = `/api/satellites${query ? `?${query}` : ''}`;
  const data = await request<SatelliteListResponse | SatelliteWire[]>(path);
  const satellites = Array.isArray(data) ? data : data.satellites;
  const catalogStatus = Array.isArray(data) ? null : normalizeCatalogStatus(data.catalog_status);
  const filterFacets = Array.isArray(data) ? null : normalizeFilterFacets(data.filter_facets);

  return {
    satellites: satellites
      .map(normalizeSatellite)
      .filter((satellite): satellite is Satellite => satellite !== null),
    catalogStatus,
    filterFacets,
  };
}

export async function fetchSatellites(filters?: FilterParams): Promise<Satellite[]> {
  const { satellites } = await fetchSatelliteCatalog(filters);
  return satellites;
}

export async function fetchSatelliteById(id: string): Promise<Satellite> {
  const satellite = normalizeSatellite(
    await request<SatelliteWire>(`/api/satellites/${id}`)
  );

  if (!satellite) {
    throw new Error('Satellite data is out of the supported visualization range');
  }

  return satellite;
}

export async function fetchOrbit(id: string, hours: number = 2): Promise<OrbitPoint[]> {
  const duration = Math.max(1, Math.round(hours * 60));
  const data = await request<OrbitResponse | OrbitPoint[]>(
    `/api/satellites/${id}/orbit?duration=${duration}`
  );

  return Array.isArray(data) ? data : data.points;
}

export async function fetchPasses(
  id: string,
  lat: number,
  lng: number,
  hours: number = 24
): Promise<Pass[]> {
  const data = await request<PassesResponse | PassWire[]>(
    `/api/passes?id=${encodeURIComponent(id)}&lat=${lat}&lng=${lng}&hours=${hours}`
  );
  const passes = Array.isArray(data) ? data : data.passes;

  return passes.map(normalizePass);
}

type AreaPassWire = {
  satellite_id?: string;
  satellite_name?: string;
  orbit_type?: string;
  aos?: number;
  los?: number;
  max_elevation?: number;
  duration?: number;
};

type AreaPassesResponse = {
  observer: { lat: number; lng: number };
  hours: number;
  passes: AreaPassWire[];
};

export async function fetchAreaPasses(lat: number, lng: number, hours: number = 6): Promise<AreaPass[]> {
  const data = await request<AreaPassesResponse | AreaPassWire[]>(
    `/api/passes/area?lat=${lat}&lng=${lng}&hours=${hours}`
  );

  const passes = Array.isArray(data) ? data : data.passes;

  return passes.map((p) => ({
    satelliteId: p.satellite_id ?? '',
    satelliteName: p.satellite_name ?? '',
    orbitType: p.orbit_type ?? '',
    aos: p.aos ?? 0,
    los: p.los ?? 0,
    maxElevation: p.max_elevation ?? 0,
    duration: p.duration ?? 0,
  }));
}

export async function fetchSatelliteApproaches(
  id: string,
  lat: number,
  lng: number,
  radiusKm: number,
  hours: number = 4,
  notifyBeforeMin: number = 60
): Promise<SatelliteApproachesResponse> {
  const data = await request<SatelliteApproachesResponseWire>(
    `/api/approaches?id=${encodeURIComponent(id)}&lat=${lat}&lng=${lng}&radius_km=${radiusKm}&hours=${hours}&notify_before_min=${notifyBeforeMin}`
  );

  return {
    satellite: normalizeTrackedSatellite(data.satellite),
    observer: normalizeObserverArea(data.observer),
    hours: data.hours ?? hours,
    notifyBeforeMin: data.notify_before_min ?? notifyBeforeMin,
    approaches: Array.isArray(data.approaches)
      ? data.approaches.map(normalizeSatelliteApproach)
      : [],
  };
}

export async function fetchAreaSatelliteApproaches(
  lat: number,
  lng: number,
  radiusKm: number,
  hours: number = 4,
  notifyBeforeMin: number = 60
): Promise<AreaSatelliteApproachesResponse> {
  const data = await request<AreaSatelliteApproachesResponseWire>(
    `/api/approaches/area?lat=${lat}&lng=${lng}&radius_km=${radiusKm}&hours=${hours}&notify_before_min=${notifyBeforeMin}`
  );

  return {
    observer: normalizeObserverArea(data.observer),
    hours: data.hours ?? hours,
    notifyBeforeMin: data.notify_before_min ?? notifyBeforeMin,
    approaches: Array.isArray(data.approaches)
      ? data.approaches.map(normalizeAreaSatelliteApproach)
      : [],
  };
}

export async function uploadTLE(file: File): Promise<SatelliteCatalog> {
  const rawTle = await file.text();

  await request<{ message: string; count: number }>('/api/tle/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: rawTle,
  });

  return fetchSatelliteCatalog();
}

export async function fetchPresets(): Promise<string[]> {
  const data = await request<PresetsResponse | string[]>('/api/tle/presets');
  return Array.isArray(data) ? data : data.presets;
}

export async function loadPreset(name: string): Promise<SatelliteCatalog> {
  await request<{ message: string; preset: string; count: number }>(
    `/api/tle/presets/${encodeURIComponent(name)}`,
    {
      method: 'POST',
    }
  );

  return fetchSatelliteCatalog();
}

export async function fetchPositionsAtTime(time: Date): Promise<SatellitePosition[]> {
  const data = await request<PositionsResponse | SatellitePosition[]>(
    `/api/positions?time=${encodeURIComponent(time.toISOString())}`
  );
  const positions = Array.isArray(data) ? data : data.positions;

  return positions
    .map(normalizePosition)
    .filter((position): position is SatellitePosition => position !== null);
}
