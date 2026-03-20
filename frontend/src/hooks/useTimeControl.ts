'use client';

import { useEffect } from 'react';
import { useTimeStore } from '@/store/timeStore';

const TICK_INTERVAL = 1000;

export function useTimeControl() {
  const { currentTime, isPlaying, speed, isRealTime, setCurrentTime } = useTimeStore();

  useEffect(() => {
    if (!isPlaying) return;

    const intervalId = setInterval(() => {
      if (isRealTime) {
        setCurrentTime(new Date());
      } else {
        setCurrentTime(
          new Date(currentTime.getTime() + speed * TICK_INTERVAL)
        );
      }
    }, TICK_INTERVAL);

    return () => clearInterval(intervalId);
  }, [isPlaying, speed, isRealTime, currentTime, setCurrentTime]);

  return useTimeStore();
}
