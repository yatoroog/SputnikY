'use client';

import { useEffect, useRef } from 'react';
import { fetchPositionsAtTime } from '@/lib/api';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';

const SIMULATION_POLL_INTERVAL_MS = 500;

export function useSimulatedPositions() {
  const isRealTime = useTimeStore((state) => state.isRealTime);
  const updatePositions = useSatelliteStore((state) => state.updatePositions);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (isRealTime) return;

    let cancelled = false;

    const loadPositions = async () => {
      const requestId = ++requestIdRef.current;

      try {
        const positions = await fetchPositionsAtTime(useTimeStore.getState().currentTime);
        if (!cancelled && requestId === requestIdRef.current) {
          updatePositions(positions);
        }
      } catch {
        // Keep the last good frame; the next poll will retry.
      }
    };

    void loadPositions();

    const intervalId = setInterval(() => {
      void loadPositions();
    }, SIMULATION_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [isRealTime, updatePositions]);
}
