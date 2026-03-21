'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Cuboid, Map as MapIcon } from 'lucide-react';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
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
        <div className="w-12 h-12 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
        <p className="text-[#9ca3af] text-sm">
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
        <div className="w-12 h-12 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
        <p className="text-[#9ca3af] text-sm">
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
  const [viewMode, setViewMode] = useState<ViewMode>('3d');

  useSatellites();
  useWebSocket(isRealTime);
  useSimulatedPositions();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-cosmos-bg">
      {/* Map */}
      <div className="absolute inset-0">
        {viewMode === '3d' ? (
          <CesiumGlobe satellites={satellites} selectedSatellite={selectedSatellite} />
        ) : (
          <Map2D satellites={satellites} selectedSatellite={selectedSatellite} />
        )}
      </div>

      {/* 3D / 2D toggle */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20">
        <div className="panel-base px-1.5 py-1.5">
          <div className="flex items-center gap-1 rounded-[20px] bg-white/[0.025] p-1">
            <button
              onClick={() => setViewMode('3d')}
              className={`flex min-w-[82px] items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.22em] transition-all duration-300 ${
                viewMode === '3d'
                  ? 'bg-[linear-gradient(180deg,rgba(17,81,110,0.95),rgba(6,49,79,0.95))] text-[#7fe8ff] shadow-[0_12px_28px_rgba(6,182,212,0.18)]'
                  : 'text-[#7f8ca7] hover:bg-white/[0.04] hover:text-[#dbe7ff]'
              }`}
            >
              <Cuboid size={14} />
              3D
            </button>
            <button
              onClick={() => setViewMode('2d')}
              className={`flex min-w-[82px] items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.22em] transition-all duration-300 ${
                viewMode === '2d'
                  ? 'bg-[linear-gradient(180deg,rgba(25,55,108,0.95),rgba(13,34,77,0.95))] text-[#b8d3ff] shadow-[0_12px_28px_rgba(59,130,246,0.18)]'
                  : 'text-[#7f8ca7] hover:bg-white/[0.04] hover:text-[#dbe7ff]'
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
    </div>
  );
}
