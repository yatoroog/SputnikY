import { create } from 'zustand';
import type { Satellite, SatellitePosition } from '@/types';

interface SatelliteStore {
  satellites: Satellite[];
  selectedSatellite: Satellite | null;
  positions: Map<string, SatellitePosition>;
  loading: boolean;
  error: string | null;
  setSatellites: (satellites: Satellite[]) => void;
  selectSatellite: (satellite: Satellite | null) => void;
  updatePositions: (positions: SatellitePosition[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSatelliteStore = create<SatelliteStore>()((set) => ({
  satellites: [],
  selectedSatellite: null,
  positions: new Map(),
  loading: false,
  error: null,

  setSatellites: (satellites: Satellite[]) => set({ satellites }),

  selectSatellite: (satellite: Satellite | null) => set({ selectedSatellite: satellite }),

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
}));
