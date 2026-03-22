'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronDown, ChevronUp, Cuboid, Map as MapIcon, Menu, X, Flame } from 'lucide-react';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import { useThemeStore } from '@/store/themeStore';
import { useSatellites } from '@/hooks/useSatellites';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSimulatedPositions } from '@/hooks/useSimulatedPositions';
import { useGroupingStore } from '@/store/groupingStore';
import type { CatalogStatus, Satellite } from '@/types';

const CesiumGlobe = dynamic(() => import('@/components/map/CesiumGlobe'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-cosmos-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-accent-cyan/50 border-t-transparent" />
        <p className="text-sm text-[#94a3c0]">Загрузка глобуса...</p>
      </div>
    </div>
  ),
});

const Map2D = dynamic(() => import('@/components/map/Map2D'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-cosmos-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-accent-cyan/50 border-t-transparent" />
        <p className="text-sm text-[#94a3c0]">Загрузка карты...</p>
      </div>
    </div>
  ),
});

const ThemeToggle = dynamic(() => import('@/components/ui/ThemeToggle'), {
  ssr: false,
  loading: () => null,
});

const NotificationCenter = dynamic(() => import('@/components/ui/NotificationCenter'), {
  ssr: false,
  loading: () => null,
});

const Sidebar = dynamic(() => import('@/components/ui/Sidebar'), {
  ssr: false,
  loading: () => null,
});

const SatelliteCard = dynamic(() => import('@/components/ui/SatelliteCard'), {
  ssr: false,
  loading: () => null,
});

const AreaPassesPanel = dynamic(() => import('@/components/ui/AreaPassesPanel'), {
  ssr: false,
  loading: () => null,
});

const GroupingComparisonPanel = dynamic(
  () => import('@/components/ui/GroupingComparisonPanel'),
  {
    ssr: false,
    loading: () => null,
  }
);

const TimelineControl = dynamic(() => import('@/components/ui/TimelineControl'), {
  ssr: false,
  loading: () => null,
});

const WhatsOverhead = dynamic(() => import('@/components/ui/WhatsOverhead'), {
  ssr: false,
  loading: () => null,
});

const HeatmapOverlay = dynamic(() => import('@/components/ui/HeatmapOverlay'), {
  ssr: false,
  loading: () => null,
});

type ViewMode = '3d' | '2d';

interface ClientAppShellProps {
  initialSatellites?: Satellite[];
  initialCatalogStatus?: CatalogStatus | null;
}

export default function ClientAppShell({
  initialSatellites = [],
  initialCatalogStatus = null,
}: ClientAppShellProps) {
  const satellites = useSatelliteStore((state) => state.satellites);
  const selectedSatellite = useSatelliteStore((state) => state.selectedSatellite);
  const clickedLocation = useSatelliteStore((state) => state.clickedLocation);
  const selectSatellite = useSatelliteStore((state) => state.selectSatellite);
  const setClickedLocation = useSatelliteStore((state) => state.setClickedLocation);
  const setSatellites = useSatelliteStore((state) => state.setSatellites);
  const setCatalogStatus = useSatelliteStore((state) => state.setCatalogStatus);
  const isComparisonOpen = useGroupingStore((state) => state.isComparisonOpen);
  const isRealTime = useTimeStore((state) => state.isRealTime);
  const isDark = useThemeStore((state) => state.isDark);
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobileDetailsOpen, setIsMobileDetailsOpen] = useState(false);
  const [isMobileDetailsMinimized, setIsMobileDetailsMinimized] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [viewportReady, setViewportReady] = useState(false);
  const [heatmapVisible, setHeatmapVisible] = useState(false);
  const hadMobileDetailsTargetRef = useRef(false);

  useSatellites({ skipInitialLoad: initialSatellites.length > 0 });
  useWebSocket(isRealTime);
  useSimulatedPositions();

  useEffect(() => {
    if (initialSatellites.length > 0) {
      setSatellites(initialSatellites);
    }
    if (initialCatalogStatus) {
      setCatalogStatus(initialCatalogStatus);
    }
  }, [initialSatellites, initialCatalogStatus, setCatalogStatus, setSatellites]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const applyViewport = () => {
      const mobile = window.innerWidth <= 1023;
      setIsMobileViewport(mobile);
    };

    const mobile = window.innerWidth <= 1023;
    setIsMobileViewport(mobile);
    if (mobile) setViewMode('2d');
    setViewportReady(true);

    window.addEventListener('resize', applyViewport);
    window.addEventListener('orientationchange', applyViewport);

    return () => {
      window.removeEventListener('resize', applyViewport);
      window.removeEventListener('orientationchange', applyViewport);
    };
  }, []);

  useEffect(() => {
    if (viewMode === '3d' && !isDark) {
      useThemeStore.getState().toggle();
    }
  }, [viewMode, isDark]);

  useEffect(() => {
    const hasDetailsTarget = Boolean(selectedSatellite || clickedLocation);

    if (hasDetailsTarget && !hadMobileDetailsTargetRef.current) {
      setIsMobileDetailsOpen(true);
      setIsMobileDetailsMinimized(false);
    }

    if (!hasDetailsTarget && hadMobileDetailsTargetRef.current) {
      setIsMobileDetailsOpen(false);
      setIsMobileDetailsMinimized(false);
    }

    hadMobileDetailsTargetRef.current = hasDetailsTarget;
  }, [clickedLocation, selectedSatellite]);

  const closeMobileSatelliteDetails = () => {
    setIsMobileDetailsOpen(false);
    setIsMobileDetailsMinimized(false);
    selectSatellite(null);
  };

  const closeMobileLocationDetails = () => {
    setIsMobileDetailsOpen(false);
    setIsMobileDetailsMinimized(false);
    setClickedLocation(null);
  };

  return (
    <div
      className="relative isolate h-dvh w-screen overflow-hidden bg-cosmos-bg"
      data-view={viewMode}
      data-theme={isDark ? 'dark' : 'light'}
    >
      <div className="absolute inset-0 z-0">
        {!viewportReady ? (
          <div className="absolute inset-0 flex items-center justify-center bg-cosmos-bg">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-2 border-accent-cyan/50 border-t-transparent" />
              <p className="text-sm text-[#94a3c0]">Загрузка...</p>
            </div>
          </div>
        ) : viewMode === '3d' ? (
          <CesiumGlobe satellites={satellites} selectedSatellite={selectedSatellite} />
        ) : (
          <Map2D satellites={satellites} selectedSatellite={selectedSatellite} />
        )}
        {viewMode === '2d' && <HeatmapOverlay visible={heatmapVisible} />}
      </div>

      <div className="absolute left-1/2 top-5 z-20 hidden -translate-x-1/2 lg:block">
        <ViewModeToggle viewMode={viewMode} onChange={setViewMode} />
      </div>

      {!isMobileSidebarOpen && !isMobileDetailsOpen && !isComparisonOpen && (
        <div
          className="pointer-events-none absolute inset-x-3 top-3 z-50 lg:hidden"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 0px)' }}
        >
          <div className="pointer-events-auto panel-base rounded-[24px] px-2.5 py-2.5">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="premium-icon-button flex h-9 w-9 touch-manipulation items-center justify-center rounded-[18px] text-[#94a3c0] transition-all duration-300 hover:text-white"
                aria-label="Открыть меню"
              >
                <Menu size={16} />
              </button>

              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold tracking-[0.02em] text-white">
                  SputnikX
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-[#7f8ca7]">
                  <span>{viewMode === '2d' ? '2D Map' : '3D Globe'}</span>
                  <span className="h-1 w-1 rounded-full bg-[#3a4565]" />
                  <span>{satellites.length} sats</span>
                </div>
              </div>

              {viewMode === '2d' && <ThemeToggle />}
            </div>

            <div className="mt-2">
              <ViewModeToggle
                viewMode={viewMode}
                onChange={setViewMode}
                compact
              />
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-28 left-4 top-4 z-10 hidden lg:block">
        <Sidebar />
      </div>

      {!isMobileViewport && <NotificationCenter />}

      {!isMobileViewport && (
        <div className="absolute top-4 right-20 z-20">
          <WhatsOverhead />
        </div>
      )}

      {!isComparisonOpen && selectedSatellite && (
        <div className="absolute bottom-28 right-4 top-20 z-10 hidden lg:block">
          <SatelliteCard />
        </div>
      )}

      {!isComparisonOpen && !selectedSatellite && clickedLocation && (
        <div className="absolute bottom-28 right-4 top-20 z-10 hidden lg:block">
          <AreaPassesPanel />
        </div>
      )}

      {(!isMobileViewport || !isMobileDetailsOpen) && (
        <div
          className="pointer-events-none absolute bottom-5 left-1/2 z-50 w-[min(680px,calc(100vw-0.75rem))] -translate-x-1/2 px-1.5 lg:bottom-5 lg:z-10 lg:w-auto lg:px-0"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
        >
          <div className="pointer-events-auto scale-[0.9] origin-bottom sm:scale-[0.94] lg:scale-100">
            <TimelineControl />
          </div>
        </div>
      )}

      {viewMode === '2d' && (
        <div className="absolute bottom-5 right-4 z-20 hidden lg:flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHeatmapVisible((v) => !v)}
            className={`premium-icon-button flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-300 ${
              heatmapVisible
                ? 'bg-accent-cyan/15 border border-accent-cyan/30 text-accent-cyan'
                : 'panel-base text-[#637196] hover:text-[#94a3c0]'
            }`}
            title={heatmapVisible ? 'Скрыть тепловую карту' : 'Тепловая карта плотности'}
          >
            <Flame size={16} />
          </button>
          <ThemeToggle />
        </div>
      )}

      {isMobileSidebarOpen && (
        <div className="absolute inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#040711]/70 backdrop-blur-sm"
            onClick={() => setIsMobileSidebarOpen(false)}
            aria-label="Закрыть меню"
          />
          <div
            className="absolute inset-x-3 bottom-3 top-3"
            style={{
              paddingTop: 'max(env(safe-area-inset-top), 0px)',
              paddingBottom: 'max(env(safe-area-inset-bottom), 0px)',
            }}
          >
            <div className="relative h-full">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(false)}
                className="premium-icon-button absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-2xl text-[#cbd5e1]"
                aria-label="Закрыть меню"
              >
                <X size={16} />
              </button>
              <Sidebar className="h-full w-full max-w-none rounded-[28px] pr-12" />
            </div>
          </div>
        </div>
      )}

      {!isComparisonOpen &&
        isMobileDetailsOpen &&
        !isMobileDetailsMinimized &&
        (selectedSatellite || clickedLocation) && (
          <div className="pointer-events-none absolute inset-0 z-30 lg:hidden">
            <button
              type="button"
              className="pointer-events-auto absolute inset-0 bg-[#040711]/35"
              onClick={selectedSatellite ? closeMobileSatelliteDetails : closeMobileLocationDetails}
              aria-label="Скрыть детали"
            />

            {selectedSatellite ? (
              <div
                className="pointer-events-auto absolute inset-x-2 bottom-0"
                style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
              >
                <div className="relative pt-8">
                  <button
                    type="button"
                    onClick={() => setIsMobileDetailsMinimized(true)}
                    className="absolute right-14 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-[#cbd5e1] backdrop-blur-sm transition-colors hover:text-white"
                    aria-label="Свернуть панель"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={closeMobileSatelliteDetails}
                    className="absolute right-3 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-[#cbd5e1] backdrop-blur-sm transition-colors hover:text-white"
                    aria-label="Скрыть панель"
                  >
                    <X size={16} />
                  </button>
                  <div className="absolute left-1/2 top-3 h-1.5 w-12 -translate-x-1/2 rounded-full bg-white/20" />
                  <SatelliteCard className="max-h-[68vh] w-full max-w-none rounded-t-[28px] rounded-b-[24px]" />
                </div>
              </div>
            ) : clickedLocation ? (
              <div
                className="pointer-events-auto absolute inset-x-3 bottom-3"
                style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
              >
                <div className="relative pt-8">
                  <button
                    type="button"
                    onClick={() => setIsMobileDetailsMinimized(true)}
                    className="absolute right-14 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-[#cbd5e1] backdrop-blur-sm transition-colors hover:text-white"
                    aria-label="Свернуть панель"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={closeMobileLocationDetails}
                    className="absolute right-3 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-[#cbd5e1] backdrop-blur-sm transition-colors hover:text-white"
                    aria-label="Скрыть панель"
                  >
                    <X size={16} />
                  </button>
                  <div className="absolute left-1/2 top-3 h-1.5 w-12 -translate-x-1/2 rounded-full bg-white/20" />
                  <AreaPassesPanel className="h-[34vh] max-h-[34vh] w-full max-w-none rounded-t-[28px] rounded-b-[24px] lg:h-auto lg:max-h-full" />
                </div>
              </div>
            ) : null}
          </div>
        )}

      {!isComparisonOpen &&
        isMobileDetailsOpen &&
        isMobileDetailsMinimized &&
        (selectedSatellite || clickedLocation) && (
          <div
            className="pointer-events-none absolute inset-x-3 bottom-3 z-50 lg:hidden"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
          >
            <div className="pointer-events-auto panel-base flex items-center justify-between rounded-[18px] px-3 py-2">
              <button
                type="button"
                onClick={() => setIsMobileDetailsMinimized(false)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate text-xs font-semibold text-white">
                  {selectedSatellite ? selectedSatellite.name : 'Пролёты спутников'}
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[#7f8ca7]">
                  {selectedSatellite ? 'Карточка спутника' : 'Выбранная точка'}
                </div>
              </button>
              <div className="ml-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMobileDetailsMinimized(false)}
                  className="premium-icon-button flex h-8 w-8 items-center justify-center rounded-[14px] text-[#cbd5e1]"
                  aria-label="Развернуть панель"
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedSatellite) {
                      closeMobileSatelliteDetails();
                      return;
                    }

                    closeMobileLocationDetails();
                  }}
                  className="premium-icon-button flex h-8 w-8 items-center justify-center rounded-[14px] text-[#cbd5e1]"
                  aria-label="Закрыть панель"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          </div>
        )}

      <GroupingComparisonPanel />
    </div>
  );
}

interface ViewModeToggleProps {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
  compact?: boolean;
  disable3d?: boolean;
}

function ViewModeToggle({
  viewMode,
  onChange,
  compact = false,
  disable3d = false,
}: ViewModeToggleProps) {
  const baseButtonClass = compact
    ? 'flex flex-1 touch-manipulation items-center justify-center gap-2 rounded-[18px] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition-all duration-300'
    : 'flex min-w-[80px] touch-manipulation items-center justify-center gap-2 rounded-[20px] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] transition-all duration-300';

  return (
    <div className={compact ? 'w-full' : 'panel-base px-1 py-1'}>
      <div className="flex items-center gap-0.5 rounded-[22px] p-0.5">
        <button
          type="button"
          onClick={() => !disable3d && onChange('3d')}
          disabled={disable3d}
          className={`${baseButtonClass} ${
            disable3d ? 'cursor-not-allowed opacity-45 text-[#637196]' : ''
          } ${
            viewMode === '3d'
              ? 'border border-white/15 bg-white/10 text-[#7fe8ff] shadow-[0_0_20px_rgba(6,182,212,0.15)]'
              : 'text-[#7f8ca7] hover:bg-white/[0.05] hover:text-[#dbe7ff]'
          }`}
          title={disable3d ? '3D отключен на мобильном устройстве' : '3D'}
        >
          <Cuboid size={14} />
          3D
        </button>
        <button
          type="button"
          onClick={() => onChange('2d')}
          className={`${baseButtonClass} ${
            viewMode === '2d'
              ? 'border border-white/15 bg-white/10 text-[#b8d3ff] shadow-[0_0_20px_rgba(59,130,246,0.15)]'
              : 'text-[#7f8ca7] hover:bg-white/[0.05] hover:text-[#dbe7ff]'
          }`}
        >
          <MapIcon size={14} />
          2D
        </button>
      </div>
    </div>
  );
}
