'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useSatellites } from '@/hooks/useSatellites';
import { useWebSocket } from '@/hooks/useWebSocket';
import Sidebar from '@/components/ui/Sidebar';
import SatelliteCard from '@/components/ui/SatelliteCard';
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
  const [viewMode, setViewMode] = useState<ViewMode>('3d');

  useSatellites();
  useWebSocket();

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
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
        <div className="panel-base flex rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('3d')}
            className={`px-4 py-2 text-xs font-semibold transition-all duration-200 ${
              viewMode === '3d'
                ? 'bg-accent-cyan/20 text-accent-cyan'
                : 'text-[#9ca3af] hover:text-[#e5e7eb] hover:bg-white/5'
            }`}
          >
            3D
          </button>
          <button
            onClick={() => setViewMode('2d')}
            className={`px-4 py-2 text-xs font-semibold transition-all duration-200 ${
              viewMode === '2d'
                ? 'bg-accent-cyan/20 text-accent-cyan'
                : 'text-[#9ca3af] hover:text-[#e5e7eb] hover:bg-white/5'
            }`}
          >
            2D
          </button>
        </div>
      </div>

      {/* Left sidebar */}
      <div className="absolute top-4 left-4 bottom-20 z-10">
        <Sidebar />
      </div>

      {/* Right satellite card */}
      {selectedSatellite && (
        <div className="absolute top-4 right-4 bottom-20 z-10">
          <SatelliteCard />
        </div>
      )}

      {/* Bottom timeline */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
        <TimelineControl />
      </div>
    </div>
  );
}
