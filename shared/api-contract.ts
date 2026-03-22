// Shared API Contract — единый файл типов для фронтенда и бэкенда
// Зеркалирует Go-структуры из backend/internal/models/types.go

export interface Satellite {
  id: string;
  name: string;
  noradId: number;
  country: string;
  ownerCode: string;
  ownerName: string;
  orbitType: 'LEO' | 'MEO' | 'GEO' | 'HEO';
  purpose: string;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  period: number;
  inclination: number;
  epoch: string;
}

export interface CatalogStatus {
  source: string;
  lastSyncAt: string | null;
  note: string | null;
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
  ts: number; // Unix timestamp
}

export interface Pass {
  satelliteId: string;
  satelliteName: string;
  aos: number; // Acquisition of Signal (unix ts)
  los: number; // Loss of Signal (unix ts)
  maxElevation: number; // Degrees
  duration: number; // Seconds
}

export interface ObserverArea {
  name?: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

export interface TrackedSatellite {
  id: string;
  name: string;
  noradId: number;
  orbitType: string;
  country: string;
  ownerCode: string;
  ownerName: string;
  purpose: string;
}

export interface SatelliteApproach {
  satelliteId: string;
  satelliteName: string;
  startAt: number;
  endAt: number;
  closestAt: number;
  notifyAt: number;
  minDistanceKm: number;
  radiusKm: number;
  duration: number;
  closestLat: number;
  closestLng: number;
  closestAltitudeKm: number;
  closestVelocityKmS: number;
}

export interface AreaSatelliteApproach {
  satellite: TrackedSatellite;
  approach: SatelliteApproach;
}

export interface WSMessage {
  type: 'positions' | 'notification';
  data: unknown;
}

export interface SubscribeMessage {
  type: 'subscribe' | 'unsubscribe';
  ids: string[];
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

// API Endpoints
// GET  /api/satellites          — список спутников с фильтрами + catalog_status (query: country, orbitType, purpose, search)
// GET  /api/satellites/:id      — детали спутника
// GET  /api/satellites/:id/orbit — траектория орбиты (query: hours=2)
// GET  /api/passes              — пролёты над точкой (query: lat, lng, hours=24)
// POST /api/tle/upload          — загрузка TLE файла (multipart form)
// GET  /api/tle/presets         — список предустановленных наборов
// POST /api/tle/presets/:name   — загрузить предустановленный набор
// WS   /ws/positions            — WebSocket: получение позиций в реальном времени
