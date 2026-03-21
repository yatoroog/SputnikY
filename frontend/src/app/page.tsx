'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Cuboid, Map as MapIcon } from 'lucide-react';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import { useThemeStore } from '@/store/themeStore';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { useSatellites } from '@/hooks/useSatellites';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSimulatedPositions } from '@/hooks/useSimulatedPositions';
import Sidebar from '@/components/ui/Sidebar';
import SatelliteCard from '@/components/ui/SatelliteCard';
import AreaPassesPanel from '@/components/ui/AreaPassesPanel';
import TimelineControl from '@/components/ui/TimelineControl';

const CesiumGlobe = dynamic(() => import('@/components/map/CesiumGlobe'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-cosmos-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-accent-cyan/50 border-t-transparent rounded-full animate-spin" />
        <p className="text-[#94a3c0] text-sm">
          {'\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0433\u043B\u043E\u0431\u0443\u0441\u0430...'}
        </p>
      </div>
    </div>
  ),
});

const Map2D = dynamic(() => import('@/components/map/Map2D'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-cosmos-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-accent-cyan/50 border-t-transparent rounded-full animate-spin" />
        <p className="text-[#94a3c0] text-sm">
          {'\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043A\u0430\u0440\u0442\u044B...'}
        </p>
      </div>
    </div>
  ),
});

type ViewMode = '3d' | '2d';

export default function HomePage() {
  const satellites = useSatelliteStore((state) => state.satellites);
  const selectedSatellite = useSatelliteStore((state) => state.selectedSatellite);
  const clickedLocation = useSatelliteStore((state) => state.clickedLocation);
  const isRealTime = useTimeStore((state) => state.isRealTime);
  const isDark = useThemeStore((state) => state.isDark);
  const [viewMode, setViewMode] = useState<ViewMode>('3d');

  useSatellites();
  useWebSocket(isRealTime);
  useSimulatedPositions();

  useEffect(() => {
    if (viewMode === '3d' && !isDark) {
      useThemeStore.getState().toggle();
    }
  }, [viewMode]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-cosmos-bg" data-view={viewMode} data-theme={isDark ? 'dark' : 'light'}>
      {/* Map */}
      <div className="absolute inset-0">
        {viewMode === '3d' ? (
          <CesiumGlobe satellites={satellites} selectedSatellite={selectedSatellite} />
        ) : (
          <Map2D satellites={satellites} selectedSatellite={selectedSatellite} />
        )}
      </div>

      {/* 3D / 2D toggle — liquid glass pill */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20">
        <div className="panel-base px-1 py-1">
          <div className="flex items-center gap-0.5 rounded-[22px] p-0.5">
            <button
              onClick={() => setViewMode('3d')}
              className={`flex min-w-[80px] items-center justify-center gap-2 rounded-[20px] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] transition-all duration-300 ${
                viewMode === '3d'
                  ? 'bg-white/10 text-[#7fe8ff] shadow-[0_0_20px_rgba(6,182,212,0.15)] border border-white/15'
                  : 'text-[#7f8ca7] hover:bg-white/[0.05] hover:text-[#dbe7ff]'
              }`}
            >
              <Cuboid size={14} />
              3D
            </button>
            <button
              onClick={() => setViewMode('2d')}
              className={`flex min-w-[80px] items-center justify-center gap-2 rounded-[20px] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] transition-all duration-300 ${
                viewMode === '2d'
                  ? 'bg-white/10 text-[#b8d3ff] shadow-[0_0_20px_rgba(59,130,246,0.15)] border border-white/15'
                  : 'text-[#7f8ca7] hover:bg-white/[0.05] hover:text-[#dbe7ff]'
              }`}
            >
              <MapIcon size={14} />
              2D
            </button>
          </div>
        </div>
      </div>

      {/* Left sidebar */}
      <div className="absolute top-4 left-4 bottom-28 z-10">
        <Sidebar />
      </div>

      {/* Right satellite card */}
      {selectedSatellite && (
        <div className="absolute top-4 right-4 bottom-28 z-10">
          <SatelliteCard />
        </div>
      )}

      {/* Right area passes panel */}
      {!selectedSatellite && clickedLocation && (
        <div className="absolute top-4 right-4 bottom-28 z-10">
          <AreaPassesPanel />
        </div>
      )}

      {/* Bottom timeline */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10">
        <TimelineControl />
      </div>

      {/* Theme toggle — bottom right, only in 2D */}
      {viewMode === '2d' && (
        <div className="absolute bottom-5 right-4 z-20">
          <ThemeToggle />
        </div>
      )}
    </div>
  );
}
