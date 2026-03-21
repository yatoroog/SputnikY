'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchOrbit } from '@/lib/api';
import type { OrbitPoint } from '@/types';

interface OrbitPathProps {
  satelliteId: string;
  hours?: number;
}

/**
 * OrbitPath - fetches orbit data for a given satellite.
 * The actual polyline rendering is handled imperatively in CesiumGlobe.
 * This hook-based component provides orbit data.
 */
export function useOrbitPath(satelliteId: string | null, hours: number = 2) {
  const [orbitPoints, setOrbitPoints] = useState<OrbitPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrbit = useCallback(async () => {
    if (!satelliteId) {
      setOrbitPoints([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const points = await fetchOrbit(satelliteId, hours);
      setOrbitPoints(points);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : '\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u043E\u0440\u0431\u0438\u0442\u044B';
      setError(message);
      setOrbitPoints([]);
    } finally {
      setLoading(false);
    }
  }, [satelliteId, hours]);

  useEffect(() => {
    loadOrbit();
  }, [loadOrbit]);

  return { orbitPoints, loading, error, refetch: loadOrbit };
}

export default function OrbitPath({ satelliteId, hours = 2 }: OrbitPathProps) {
  const { loading, error } = useOrbitPath(satelliteId, hours);

  if (loading) {
    return (
      <div className="text-xs text-[#9ca3af]">
        {'\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043E\u0440\u0431\u0438\u0442\u044B...'}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-red-400">
        {error}
      </div>
    );
  }

  return null;
}
