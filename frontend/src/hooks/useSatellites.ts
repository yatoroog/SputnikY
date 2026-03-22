'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useFilterStore } from '@/store/filterStore';
import { fetchSatelliteCatalog } from '@/lib/api';
import type { FilterFacets, FilterParams, Satellite } from '@/types';

function hasFilterFacets(facets: FilterFacets | null): facets is FilterFacets {
  return !!facets && (facets.countries.length > 0 || facets.purposes.length > 0);
}

function deriveFilterFacets(satellites: Satellite[]): FilterFacets {
  return {
    countries: Array.from(
      new Set(satellites.map((satellite) => satellite.country).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right, 'ru')),
    purposes: Array.from(
      new Set(satellites.map((satellite) => satellite.purpose).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right, 'ru')),
  };
}

interface UseSatellitesOptions {
  skipInitialLoad?: boolean;
}

export function useSatellites(options: UseSatellitesOptions = {}) {
  const setSatellites = useSatelliteStore((state) => state.setSatellites);
  const setCatalogStatus = useSatelliteStore((state) => state.setCatalogStatus);
  const setFilterFacets = useSatelliteStore((state) => state.setFilterFacets);
  const setLoading = useSatelliteStore((state) => state.setLoading);
  const setError = useSatelliteStore((state) => state.setError);
  const { country, orbitType, purpose, search } = useFilterStore();
  const didSkipInitialLoadRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const filters: FilterParams = {};
      if (country) filters.country = country;
      if (orbitType) filters.orbitType = orbitType;
      if (purpose) filters.purpose = purpose;
      if (search) filters.search = search;

      const data = await fetchSatelliteCatalog(filters);
      setSatellites(data.satellites);
      setCatalogStatus(data.catalogStatus);

      const currentFacets = useSatelliteStore.getState().filterFacets;
      const hasActiveCatalogFilters = Boolean(country || orbitType || purpose || search);

      if (hasFilterFacets(data.filterFacets)) {
        setFilterFacets(data.filterFacets);
      } else if (!hasActiveCatalogFilters || !hasFilterFacets(currentFacets)) {
        setFilterFacets(deriveFilterFacets(data.satellites));
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0441\u043F\u0443\u0442\u043D\u0438\u043A\u043E\u0432';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    country,
    orbitType,
    purpose,
    search,
    setSatellites,
    setCatalogStatus,
    setFilterFacets,
    setLoading,
    setError,
  ]);

  useEffect(() => {
    const hasActiveCatalogFilters = Boolean(country || orbitType || purpose || search);
    const hasSeededSatellites = useSatelliteStore.getState().satellites.length > 0;

    if (
      options.skipInitialLoad &&
      !didSkipInitialLoadRef.current &&
      hasSeededSatellites &&
      !hasActiveCatalogFilters
    ) {
      didSkipInitialLoadRef.current = true;
      return;
    }

    load();
  }, [country, orbitType, purpose, search, load, options.skipInitialLoad]);

  return { refetch: load };
}
