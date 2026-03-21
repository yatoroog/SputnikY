import { create } from 'zustand';

interface TimeStore {
  currentTime: Date;
  isPlaying: boolean;
  speed: number;
  isRealTime: boolean;
  setCurrentTime: (time: Date) => void;
  advanceTime: (deltaMs: number) => void;
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  resetToRealTime: () => void;
}

export const useTimeStore = create<TimeStore>()((set) => ({
  currentTime: new Date(),
  isPlaying: true,
  speed: 1,
  isRealTime: true,

  setCurrentTime: (time: Date) => set({ currentTime: time }),

  advanceTime: (deltaMs: number) =>
    set((state) => ({
      currentTime: new Date(state.currentTime.getTime() + deltaMs),
    })),

  togglePlay: () =>
    set((state) => ({
      isPlaying: !state.isPlaying,
      isRealTime: false,
    })),

  setSpeed: (speed: number) =>
    set({
      speed,
      isRealTime: false,
    }),

  stepForward: () =>
    set((state) => ({
      currentTime: new Date(state.currentTime.getTime() + 60000),
      isPlaying: false,
      isRealTime: false,
    })),

  stepBackward: () =>
    set((state) => ({
      currentTime: new Date(state.currentTime.getTime() - 60000),
      isPlaying: false,
      isRealTime: false,
    })),

  resetToRealTime: () =>
    set({
      currentTime: new Date(),
      isPlaying: true,
      speed: 1,
      isRealTime: true,
    }),
}));
