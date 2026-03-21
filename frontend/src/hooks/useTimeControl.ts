'use client';

import { useEffect } from 'react';
import { useTimeStore } from '@/store/timeStore';

const TICK_INTERVAL_MS = 100;

export function useTimeControl() {
  const { isPlaying } = useTimeStore();

  useEffect(() => {
    if (!isPlaying) return;

    const intervalId = setInterval(() => {
      const { isRealTime, speed, setCurrentTime, advanceTime } = useTimeStore.getState();

      if (isRealTime) {
        setCurrentTime(new Date());
      } else {
        advanceTime(speed * TICK_INTERVAL_MS);
      }
    }, TICK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isPlaying]);

  return useTimeStore();
}
