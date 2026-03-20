import { create } from 'zustand';

interface FilterStore {
  country: string;
  orbitType: string;
  purpose: string;
  search: string;
  setCountry: (country: string) => void;
  setOrbitType: (orbitType: string) => void;
  setPurpose: (purpose: string) => void;
  setSearch: (search: string) => void;
  resetFilters: () => void;
}

const initialState = {
  country: '',
  orbitType: '',
  purpose: '',
  search: '',
};

export const useFilterStore = create<FilterStore>()((set) => ({
  ...initialState,

  setCountry: (country: string) => set({ country }),
  setOrbitType: (orbitType: string) => set({ orbitType }),
  setPurpose: (purpose: string) => set({ purpose }),
  setSearch: (search: string) => set({ search }),
  resetFilters: () => set(initialState),
}));
