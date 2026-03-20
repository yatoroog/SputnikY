'use client';

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
        <p className="text-[#9ca3af] text-sm">{'\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0433\u043B\u043E\u0431\u0443\u0441\u0430...'}</p>
      </div>
    </div>
  ),
});

export default function HomePage() {
  const satellites = useSatelliteStore((state) => state.satellites);
  const selectedSatellite = useSatelliteStore((state) => state.selectedSatellite);

  useSatellites();
  useWebSocket();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-cosmos-bg">
      {/* 3D Globe - full screen */}
      <div className="absolute inset-0">
        <CesiumGlobe satellites={satellites} selectedSatellite={selectedSatellite} />
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
