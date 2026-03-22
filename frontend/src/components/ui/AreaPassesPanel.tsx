'use client';

import { useEffect } from 'react';
import { Clock, MapPin, Radio, X } from 'lucide-react';
import { fetchAreaPasses } from '@/lib/api';
import { cn, getOrbitTypeColor } from '@/lib/utils';
import { useSatelliteStore } from '@/store/satelliteStore';

interface AreaPassesPanelProps {
  className?: string;
}

export default function AreaPassesPanel({ className }: AreaPassesPanelProps) {
  const clickedLocation = useSatelliteStore((state) => state.clickedLocation);
  const areaPasses = useSatelliteStore((state) => state.areaPasses);
  const loading = useSatelliteStore((state) => state.areaPassesLoading);
  const setClickedLocation = useSatelliteStore((state) => state.setClickedLocation);
  const setAreaPasses = useSatelliteStore((state) => state.setAreaPasses);
  const setAreaPassesLoading = useSatelliteStore((state) => state.setAreaPassesLoading);

  useEffect(() => {
    if (!clickedLocation) return;

    let cancelled = false;

    setAreaPassesLoading(true);
    setAreaPasses([]);

    fetchAreaPasses(clickedLocation.lat, clickedLocation.lng, 6)
      .then((passes) => {
        if (!cancelled) {
          setAreaPasses(passes);
        }
      })
      .catch((error) => {
        console.warn('Failed to fetch area passes:', error);
      })
      .finally(() => {
        if (!cancelled) {
          setAreaPassesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clickedLocation, setAreaPasses, setAreaPassesLoading]);

  if (!clickedLocation) return null;

  const formatTime = (ts: number) => {
    const date = new Date(ts * 1000);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts: number) => {
    const date = new Date(ts * 1000);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div
      className={cn(
        'panel-base glass-shimmer flex max-h-full w-[min(360px,calc(100vw-1rem))] flex-col overflow-hidden animate-slide-in-right',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-6 top-0 z-10 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="flex items-center justify-between px-4 py-3 lg:p-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-accent-cyan/10 lg:h-8 lg:w-8">
            <Radio size={14} className="text-accent-cyan lg:h-4 lg:w-4" />
          </div>
          <h2 className="truncate text-sm font-semibold text-white lg:text-base">
            Пролёты спутников
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setClickedLocation(null)}
          className="premium-icon-button flex h-7 w-7 items-center justify-center rounded-xl text-[#637196] transition-all hover:text-white lg:h-8 lg:w-8"
          aria-label="Закрыть панель"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mx-4 h-px glass-divider-h lg:mx-5" />

      <div className="px-4 py-2 lg:px-5 lg:py-3">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#94a3c0] lg:gap-2 lg:text-xs">
          <MapPin size={12} className="shrink-0 text-accent-cyan" />
          <span>
            {Math.abs(clickedLocation.lat).toFixed(2)}&deg;
            {clickedLocation.lat >= 0 ? 'N' : 'S'},{' '}
            {Math.abs(clickedLocation.lng).toFixed(2)}&deg;
            {clickedLocation.lng >= 0 ? 'E' : 'W'}
          </span>
          <span className="text-[#2d3654]">|</span>
          <Clock size={12} className="shrink-0 text-[#637196]" />
          <span>Ближайшие 6 часов</span>
        </div>
      </div>

      <div className="mx-4 h-px glass-divider-h lg:mx-5" />

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10 lg:py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-cyan/50 border-t-transparent" />
              <p className="text-xs text-[#637196]">Расчёт пролётов...</p>
            </div>
          </div>
        ) : areaPasses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-[#637196] lg:py-12">
            <Radio size={28} className="mb-3 opacity-40" />
            <p className="text-sm">Пролётов не найдено</p>
            <p className="mt-1 text-xs text-[#4a5578]">Попробуйте выбрать другую точку</p>
          </div>
        ) : (
          <div className="py-1">
            {areaPasses.map((pass, index) => {
              const orbitColor = getOrbitTypeColor(pass.orbitType);

              return (
                <div
                  key={`${pass.satelliteId}-${pass.aos}-${index}`}
                  className="border-b border-white/5 px-4 py-2.5 transition-colors duration-200 hover:bg-white/[0.03] lg:px-5 lg:py-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 shrink-0 rounded-full shadow-[0_0_8px_currentColor]"
                          style={{ backgroundColor: orbitColor }}
                        />
                        <p className="truncate text-[13px] font-medium text-[#eef2ff] lg:text-sm">
                          {pass.satelliteName}
                        </p>
                      </div>

                      <div className="ml-4 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#637196] lg:mt-1.5 lg:gap-3 lg:text-xs">
                        <span>{formatDate(pass.aos)}</span>
                        <span>
                          {formatTime(pass.aos)} - {formatTime(pass.los)}
                        </span>
                        <span>{formatDuration(pass.duration)}</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className="badge text-[9px] lg:text-[10px]"
                        style={{
                          backgroundColor: `${orbitColor}15`,
                          color: orbitColor,
                          border: `1px solid ${orbitColor}30`,
                        }}
                      >
                        {pass.orbitType}
                      </span>
                      <span className="text-[9px] text-[#4a5578] lg:text-[10px]">
                        макс {pass.maxElevation.toFixed(1)}&deg;
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
