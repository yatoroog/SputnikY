import { isRenderableAltitudeKm } from '@/lib/utils';

export const EARTH_RADIUS_KM = 6_371;

const DEFAULT_MIN_ELEVATION_DEG = 10;
const MIN_ELEVATION_FLOOR_DEG = 0;
const MIN_ELEVATION_CEIL_DEG = 89;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeMinElevationDeg(value?: number): number {
  const safeValue = typeof value === 'number' ? value : Number.NaN;

  if (!Number.isFinite(safeValue)) {
    return DEFAULT_MIN_ELEVATION_DEG;
  }

  return clamp(safeValue, MIN_ELEVATION_FLOOR_DEG, MIN_ELEVATION_CEIL_DEG);
}

export function getCoverageMinElevationDeg(): number {
  const configured = Number(process.env.NEXT_PUBLIC_COVERAGE_MIN_ELEVATION_DEG);
  return normalizeMinElevationDeg(configured);
}

export function computeCoverageCentralAngleRad(
  altitudeKm: number,
  minElevationDeg: number = getCoverageMinElevationDeg()
): number {
  if (!isRenderableAltitudeKm(altitudeKm)) {
    return 0;
  }

  const safeAltitudeKm = Math.max(0, altitudeKm);
  const safeMinElevationDeg = normalizeMinElevationDeg(minElevationDeg);
  const minElevationRad = safeMinElevationDeg * Math.PI / 180;
  const orbitalRadiusKm = EARTH_RADIUS_KM + safeAltitudeKm;
  const cosineArgument =
    (EARTH_RADIUS_KM / orbitalRadiusKm) * Math.cos(minElevationRad);
  const centralAngleRad =
    Math.acos(clamp(cosineArgument, -1, 1)) - minElevationRad;

  if (!Number.isFinite(centralAngleRad)) {
    return 0;
  }

  return Math.max(0, centralAngleRad);
}

export function computeCoverageRadiusKm(
  altitudeKm: number,
  minElevationDeg: number = getCoverageMinElevationDeg()
): number {
  return EARTH_RADIUS_KM * computeCoverageCentralAngleRad(altitudeKm, minElevationDeg);
}

export function computeCoverageRadiusMeters(
  altitudeKm: number,
  minElevationDeg: number = getCoverageMinElevationDeg()
): number {
  return computeCoverageRadiusKm(altitudeKm, minElevationDeg) * 1000;
}

export function formatCoverageModelLabel(
  minElevationDeg: number = getCoverageMinElevationDeg()
): string {
  const safeMinElevationDeg = normalizeMinElevationDeg(minElevationDeg);
  if (safeMinElevationDeg <= 0) {
    return 'геометрический горизонт';
  }

  return `мин. угол места ${safeMinElevationDeg.toFixed(0)}°`;
}
