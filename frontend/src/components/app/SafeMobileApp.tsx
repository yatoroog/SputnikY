'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import { useSatellites } from '@/hooks/useSatellites';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSimulatedPositions } from '@/hooks/useSimulatedPositions';
import type { CatalogStatus, Satellite } from '@/types';

const Map2D = dynamic(() => import('@/components/map/Map2D'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-cosmos-bg">
      <div className="flex flex-col items-center gap-3 text-[#94a3c0]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-cyan/50 border-t-transparent" />
        <p className="text-sm">Загрузка карты...</p>
      </div>
    </div>
  ),
});

interface SafeMobileAppProps {
  initialSatellites?: Satellite[];
  initialCatalogStatus?: CatalogStatus | null;
}

export default function SafeMobileApp({
  initialSatellites = [],
  initialCatalogStatus = null,
}: SafeMobileAppProps) {
  const satellites = useSatelliteStore((state) => state.satellites);
  const selectedSatellite = useSatelliteStore((state) => state.selectedSatellite);
  const selectSatellite = useSatelliteStore((state) => state.selectSatellite);
  const setSatellites = useSatelliteStore((state) => state.setSatellites);
  const setCatalogStatus = useSatelliteStore((state) => state.setCatalogStatus);
  const loading = useSatelliteStore((state) => state.loading);
  const error = useSatelliteStore((state) => state.error);
  const isRealTime = useTimeStore((state) => state.isRealTime);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const visibleSatellites = satellites.slice(0, 8);

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
  }, [initialCatalogStatus, initialSatellites, setCatalogStatus, setSatellites]);

  useEffect(() => {
    if (selectedSatellite) {
      setIsDrawerOpen(false);
    }
  }, [selectedSatellite]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-cosmos-bg text-white">
      <div className="absolute inset-0">
        <Map2D satellites={satellites} selectedSatellite={selectedSatellite} />
      </div>

      <div
        className="absolute left-3 right-3 top-3 z-40"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0px)' }}
      >
        <div className="panel-base flex items-center justify-between gap-3 rounded-[24px] px-3 py-3">
          <button
            type="button"
            onClick={() => setIsDrawerOpen((value) => !value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            Спутники
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold">SputnikX Mobile</div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[#94a3c0]">
              2D режим
            </div>
          </div>
          <button
            type="button"
            onClick={() => selectSatellite(null)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            Сброс
          </button>
        </div>
      </div>

      {isDrawerOpen && (
        <div className="absolute inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsDrawerOpen(false)}
            aria-label="Закрыть меню"
          />
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[70vh] overflow-hidden rounded-t-[28px] border border-white/10 bg-[#0b1020] shadow-2xl"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
          >
            <div className="border-b border-white/10 px-4 py-4">
              <div className="text-base font-semibold">Спутники</div>
              <div className="mt-1 text-xs text-[#94a3c0]">
                Доступно: {satellites.length}
              </div>
            </div>

            <div className="max-h-[calc(70vh-72px)] overflow-y-auto px-3 py-3">
              {loading ? (
                <div className="py-8 text-center text-sm text-[#94a3c0]">
                  Загрузка каталога...
                </div>
              ) : error ? (
                <div className="py-8 text-center text-sm text-[#fca5a5]">
                  {error}
                </div>
              ) : satellites.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#94a3c0]">
                  Список пока пуст
                </div>
              ) : (
                <div className="space-y-2">
                  {satellites.slice(0, 100).map((satellite) => (
                    <button
                      key={satellite.id}
                      type="button"
                      onClick={() => selectSatellite(satellite)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                        selectedSatellite?.id === satellite.id
                          ? 'border-cyan-400/40 bg-cyan-400/10'
                          : 'border-white/10 bg-white/5'
                      }`}
                    >
                      <div className="truncate text-sm font-medium">{satellite.name}</div>
                      <div className="mt-1 text-xs text-[#94a3c0]">
                        NORAD {satellite.noradId} • {satellite.orbitType}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedSatellite && (
        <div
          className="absolute bottom-36 left-3 right-3 z-40"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
        >
          <div className="panel-base rounded-[24px] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">
                  {selectedSatellite.name}
                </div>
                <div className="mt-1 text-xs text-[#94a3c0]">
                  NORAD {selectedSatellite.noradId} • {selectedSatellite.orbitType}
                </div>
              </div>
              <button
                type="button"
                onClick={() => selectSatellite(null)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="absolute bottom-3 left-3 right-3 z-40"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
      >
        <div className="panel-base rounded-[24px] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Спутники</div>
              <div className="mt-1 text-xs text-[#94a3c0]">
                Показано {visibleSatellites.length} из {satellites.length}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            >
              Все
            </button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {visibleSatellites.map((satellite) => (
              <button
                key={satellite.id}
                type="button"
                onClick={() => selectSatellite(satellite)}
                className={`min-w-[180px] rounded-2xl border px-3 py-3 text-left ${
                  selectedSatellite?.id === satellite.id
                    ? 'border-cyan-400/40 bg-cyan-400/10'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="truncate text-sm font-medium">{satellite.name}</div>
                <div className="mt-1 text-xs text-[#94a3c0]">
                  NORAD {satellite.noradId}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
