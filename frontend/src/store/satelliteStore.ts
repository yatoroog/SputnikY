import { create } from 'zustand';
import type {
  Satellite,
  SatellitePosition,
  AreaPass,
  CatalogStatus,
  FilterFacets,
} from '@/types';

interface SatelliteStore {
  satellites: Satellite[];
  catalogStatus: CatalogStatus | null;
  filterFacets: FilterFacets | null;
  selectedSatellite: Satellite | null;
  positions: Map<string, SatellitePosition>;
  loading: boolean;
  error: string | null;
  isCloseUp: boolean;

  clickedLocation: { lat: number; lng: number } | null;
  areaPasses: AreaPass[];
  areaPassesLoading: boolean;

  setSatellites: (satellites: Satellite[]) => void;
  setCatalogStatus: (catalogStatus: CatalogStatus | null) => void;
  setFilterFacets: (filterFacets: FilterFacets | null) => void;
  selectSatellite: (satellite: Satellite | null) => void;
  updatePositions: (positions: SatellitePosition[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCloseUp: (v: boolean) => void;

  setClickedLocation: (location: { lat: number; lng: number } | null) => void;
  setAreaPasses: (passes: AreaPass[]) => void;
  setAreaPassesLoading: (loading: boolean) => void;
}

function applyPositionToSatellite(
  satellite: Satellite | null,
  positions: Map<string, SatellitePosition>
): Satellite | null {
  if (!satellite) {
    return null;
  }

  const nextPosition = positions.get(satellite.id);
  if (!nextPosition) {
    return satellite;
  }

  if (
    satellite.latitude === nextPosition.lat &&
    satellite.longitude === nextPosition.lng &&
    satellite.altitude === nextPosition.alt
  ) {
    return satellite;
  }

  return {
    ...satellite,
    latitude: nextPosition.lat,
    longitude: nextPosition.lng,
    altitude: nextPosition.alt,
  };
}

export const useSatelliteStore = create<SatelliteStore>()((set) => ({
  satellites: [],
  catalogStatus: null,
  filterFacets: null,
  selectedSatellite: null,
  positions: new Map(),
  loading: false,
  error: null,
  isCloseUp: false,

  clickedLocation: null,
  areaPasses: [],
  areaPassesLoading: false,

  setSatellites: (satellites: Satellite[]) =>
    set((state) => {
      const nextSatellites = satellites.map((satellite) =>
        applyPositionToSatellite(satellite, state.positions) ?? satellite
      );

      let nextSelectedSatellite = state.selectedSatellite;
      if (state.selectedSatellite) {
        const matchingSatellite = nextSatellites.find(
          (satellite) => satellite.id === state.selectedSatellite?.id
        );
        nextSelectedSatellite =
          matchingSatellite ??
          applyPositionToSatellite(state.selectedSatellite, state.positions);
      }

      return {
        satellites: nextSatellites,
        selectedSatellite: nextSelectedSatellite,
      };
    }),

  setCatalogStatus: (catalogStatus: CatalogStatus | null) => set({ catalogStatus }),

  setFilterFacets: (filterFacets: FilterFacets | null) => set({ filterFacets }),

  selectSatellite: (satellite: Satellite | null) =>
    set({ selectedSatellite: satellite, clickedLocation: null, areaPasses: [], isCloseUp: false }),

  updatePositions: (positions: SatellitePosition[]) =>
    set((state) => {
      const newPositions = new Map(state.positions);
      let positionsChanged = false;

      for (const pos of positions) {
        const prev = newPositions.get(pos.id);
        if (
          !prev ||
          prev.lat !== pos.lat ||
          prev.lng !== pos.lng ||
          prev.alt !== pos.alt
        ) {
          newPositions.set(pos.id, pos);
          positionsChanged = true;
        }
      }

      if (!positionsChanged) {
        return state;
      }

      let satellitesChanged = false;
      const nextSatellites = state.satellites.map((satellite) => {
        const nextSatellite = applyPositionToSatellite(satellite, newPositions) ?? satellite;
        if (nextSatellite !== satellite) {
          satellitesChanged = true;
        }
        return nextSatellite;
      });

      const nextSelectedSatellite = applyPositionToSatellite(
        state.selectedSatellite,
        newPositions
      );

      return {
        positions: newPositions,
        satellites: satellitesChanged ? nextSatellites : state.satellites,
        selectedSatellite: nextSelectedSatellite,
      };
    }),

  setLoading: (loading: boolean) => set({ loading }),

  setError: (error: string | null) => set({ error }),

  setCloseUp: (v: boolean) => set({ isCloseUp: v }),

  setClickedLocation: (location) =>
    set({ clickedLocation: location, selectedSatellite: null }),

  setAreaPasses: (passes) => set({ areaPasses: passes }),

  setAreaPassesLoading: (loading) => set({ areaPassesLoading: loading }),
}));
