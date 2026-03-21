import { create } from 'zustand';
import type { Satellite, SatellitePosition, AreaPass } from '@/types';

interface SatelliteStore {
  satellites: Satellite[];
  selectedSatellite: Satellite | null;
  positions: Map<string, SatellitePosition>;
  loading: boolean;
  error: string | null;
  isCloseUp: boolean;

  clickedLocation: { lat: number; lng: number } | null;
  areaPasses: AreaPass[];
  areaPassesLoading: boolean;

  setSatellites: (satellites: Satellite[]) => void;
  selectSatellite: (satellite: Satellite | null) => void;
  updatePositions: (positions: SatellitePosition[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCloseUp: (v: boolean) => void;

  setClickedLocation: (location: { lat: number; lng: number } | null) => void;
  setAreaPasses: (passes: AreaPass[]) => void;
  setAreaPassesLoading: (loading: boolean) => void;
}

export const useSatelliteStore = create<SatelliteStore>()((set) => ({
  satellites: [],
  selectedSatellite: null,
  positions: new Map(),
  loading: false,
  error: null,
  isCloseUp: false,

  clickedLocation: null,
  areaPasses: [],
  areaPassesLoading: false,

  setSatellites: (satellites: Satellite[]) => set({ satellites }),

  selectSatellite: (satellite: Satellite | null) =>
    set({ selectedSatellite: satellite, clickedLocation: null, areaPasses: [], isCloseUp: false }),

  updatePositions: (positions: SatellitePosition[]) =>
    set((state) => {
      const newPositions = new Map(state.positions);
      for (const pos of positions) {
        newPositions.set(pos.id, pos);
      }
      return { positions: newPositions };
    }),

  setLoading: (loading: boolean) => set({ loading }),

  setError: (error: string | null) => set({ error }),

  setCloseUp: (v: boolean) => set({ isCloseUp: v }),

  setClickedLocation: (location) =>
    set({ clickedLocation: location, selectedSatellite: null }),

  setAreaPasses: (passes) => set({ areaPasses: passes }),

  setAreaPassesLoading: (loading) => set({ areaPassesLoading: loading }),
}));
