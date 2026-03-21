import { create } from 'zustand';

interface ThemeStore {
  isDark: boolean;
  toggle: () => void;
}

export const useThemeStore = create<ThemeStore>()((set) => ({
  isDark: true,
  toggle: () => set((state) => ({ isDark: !state.isDark })),
}));
