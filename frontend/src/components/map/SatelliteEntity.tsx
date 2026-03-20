'use client';

import { useCallback } from 'react';
import type { Satellite, SatellitePosition } from '@/types';
import { getOrbitTypeColor } from '@/lib/utils';

interface SatelliteEntityProps {
  satellite: Satellite;
  position?: SatellitePosition;
  isSelected: boolean;
  onSelect: (satellite: Satellite) => void;
}

/**
 * SatelliteEntity - describes a satellite point for the CesiumGlobe.
 * This component provides entity configuration data rather than rendering Resium components directly,
 * since all Cesium entity management is handled imperatively in CesiumGlobe.
 */
export function getSatelliteEntityConfig(
  satellite: Satellite,
  position?: SatellitePosition,
  isSelected: boolean = false
) {
  const lat = position?.lat ?? satellite.latitude;
  const lng = position?.lng ?? satellite.longitude;
  const alt = (position?.alt ?? satellite.altitude) * 1000;
  const color = getOrbitTypeColor(satellite.orbitType);
  const pixelSize = isSelected ? 10 : 6;

  return {
    id: satellite.id,
    name: satellite.name,
    lat,
    lng,
    alt,
    color,
    pixelSize,
    isSelected,
    outlineWidth: isSelected ? 3 : 1,
  };
}

export default function SatelliteEntity({
  satellite,
  isSelected,
  onSelect,
}: SatelliteEntityProps) {
  const handleClick = useCallback(() => {
    onSelect(satellite);
  }, [satellite, onSelect]);

  // This component is a logical wrapper; actual rendering happens in CesiumGlobe
  return (
    <div
      data-satellite-id={satellite.id}
      data-selected={isSelected}
      onClick={handleClick}
      style={{ display: 'none' }}
    />
  );
}
