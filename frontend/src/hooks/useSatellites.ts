'use client';

import { useEffect, useCallback } from 'react';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useFilterStore } from '@/store/filterStore';
import { fetchSatellites } from '@/lib/api';
import type { FilterParams } from '@/types';

export function useSatellites() {
  const setSatellites = useSatelliteStore((state) => state.setSatellites);
  const setLoading = useSatelliteStore((state) => state.setLoading);
  const setError = useSatelliteStore((state) => state.setError);
  const { country, orbitType, purpose, search } = useFilterStore();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const filters: FilterParams = {};
      if (country) filters.country = country;
      if (orbitType) filters.orbitType = orbitType;
      if (purpose) filters.purpose = purpose;
      if (search) filters.search = search;

      const data = await fetchSatellites(filters);
      setSatellites(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0441\u043F\u0443\u0442\u043D\u0438\u043A\u043E\u0432';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [country, orbitType, purpose, search, setSatellites, setLoading, setError]);

  useEffect(() => {
    load();
  }, [load]);

  return { refetch: load };
}
