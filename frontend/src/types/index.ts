export interface Satellite {
  id: string;
  name: string;
  noradId: number;
  country: string;
  orbitType: string;
  purpose: string;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  period: number;
  inclination: number;
  epoch: string;
}

export interface MetricRange {
  min: number;
  max: number;
}

export interface BreakdownItem {
  label: string;
  count: number;
}

export interface SatelliteGrouping {
  id: string;
  label: string;
  satellites: Satellite[];
  satelliteCount: number;
  countries: string[];
  purposes: string[];
  orbitTypes: string[];
  countryBreakdown: BreakdownItem[];
  purposeBreakdown: BreakdownItem[];
  orbitTypeBreakdown: BreakdownItem[];
  altitudeRange: MetricRange | null;
  inclinationRange: MetricRange | null;
  periodRange: MetricRange | null;
  velocityRange: MetricRange | null;
  averageAltitude: number;
  averageInclination: number;
  averagePeriod: number;
  averageVelocity: number;
  primaryOrbitType: string;
}

export interface CatalogStatus {
  source: string;
  lastSyncAt: string | null;
  note: string | null;
}

export interface FilterFacets {
  countries: string[];
  purposes: string[];
}

export interface SatellitePosition {
  id: string;
  lat: number;
  lng: number;
  alt: number;
}

export interface OrbitPoint {
  lat: number;
  lng: number;
  alt: number;
  ts: number;
}

export interface Pass {
  satelliteId: string;
  satelliteName: string;
  aos: number;
  los: number;
  maxElevation: number;
  duration: number;
}

export interface AreaPass {
  satelliteId: string;
  satelliteName: string;
  orbitType: string;
  aos: number;
  los: number;
  maxElevation: number;
  duration: number;
}

export interface WSMessage {
  type: string;
  data: unknown;
}

export interface FilterParams {
  country?: string;
  orbitType?: string;
  purpose?: string;
  search?: string;
}

export interface TimeControlState {
  currentTime: Date;
  isPlaying: boolean;
  speed: number;
  isRealTime: boolean;
}
