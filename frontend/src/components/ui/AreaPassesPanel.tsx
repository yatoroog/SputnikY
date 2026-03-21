'use client';

import { useEffect } from 'react';
import { X, MapPin, Clock, Radio } from 'lucide-react';
import { useSatelliteStore } from '@/store/satelliteStore';
import { fetchAreaPasses } from '@/lib/api';
import { getOrbitTypeColor } from '@/lib/utils';

export default function AreaPassesPanel() {
  const clickedLocation = useSatelliteStore((s) => s.clickedLocation);
  const areaPasses = useSatelliteStore((s) => s.areaPasses);
  const loading = useSatelliteStore((s) => s.areaPassesLoading);
  const setClickedLocation = useSatelliteStore((s) => s.setClickedLocation);
  const setAreaPasses = useSatelliteStore((s) => s.setAreaPasses);
  const setAreaPassesLoading = useSatelliteStore((s) => s.setAreaPassesLoading);

  useEffect(() => {
    if (!clickedLocation) return;
    let cancelled = false;

    setAreaPassesLoading(true);
    setAreaPasses([]);

    fetchAreaPasses(clickedLocation.lat, clickedLocation.lng, 6)
      .then((passes) => {
        if (!cancelled) setAreaPasses(passes);
      })
      .catch((err) => {
        console.warn('Failed to fetch area passes:', err);
      })
      .finally(() => {
        if (!cancelled) setAreaPassesLoading(false);
      });

    return () => { cancelled = true; };
  }, [clickedLocation, setAreaPasses, setAreaPassesLoading]);

  if (!clickedLocation) return null;

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="panel-base glass-shimmer w-[360px] max-h-full flex flex-col animate-slide-in-right overflow-hidden">
      {/* Top specular line */}
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent z-10" />

      {/* Header */}
      <div className="flex items-center justify-between p-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-cyan/10">
            <Radio size={16} className="text-accent-cyan" />
          </div>
          <h2 className="text-base font-semibold text-white">
            {'Пролёты спутников'}
          </h2>
        </div>
        <button
          onClick={() => setClickedLocation(null)}
          className="premium-icon-button flex h-8 w-8 items-center justify-center rounded-xl text-[#637196] hover:text-white transition-all"
        >
          <X size={15} />
        </button>
      </div>

      {/* Glass divider */}
      <div className="mx-5 h-px glass-divider-h" />

      {/* Location info */}
      <div className="px-5 py-3">
        <div className="flex items-center gap-2 text-xs text-[#94a3c0]">
          <MapPin size={12} className="text-accent-cyan flex-shrink-0" />
          <span>
            {Math.abs(clickedLocation.lat).toFixed(2)}&deg;{clickedLocation.lat >= 0 ? 'N' : 'S'},{' '}
            {Math.abs(clickedLocation.lng).toFixed(2)}&deg;{clickedLocation.lng >= 0 ? 'E' : 'W'}
          </span>
          <span className="text-[#2d3654]">|</span>
          <Clock size={12} className="flex-shrink-0 text-[#637196]" />
          <span>{'Ближайшие 6 часов'}</span>
        </div>
      </div>

      {/* Glass divider */}
      <div className="mx-5 h-px glass-divider-h" />

      {/* Pass list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-accent-cyan/50 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-[#637196]">{'Расчёт пролётов...'}</p>
            </div>
          </div>
        ) : areaPasses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[#637196]">
            <Radio size={28} className="mb-3 opacity-40" />
            <p className="text-sm">{'Пролётов не найдено'}</p>
            <p className="text-xs mt-1 text-[#4a5578]">{'Попробуйте выбрать другую точку'}</p>
          </div>
        ) : (
          <div className="py-1">
            {areaPasses.map((pass, i) => {
              const orbitColor = getOrbitTypeColor(pass.orbitType);
              return (
                <div
                  key={`${pass.satelliteId}-${pass.aos}-${i}`}
                  className="px-5 py-3.5 border-b border-white/5 hover:bg-white/[0.03] transition-colors duration-200"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0 shadow-[0_0_8px_currentColor]"
                          style={{ backgroundColor: orbitColor }}
                        />
                        <p className="text-sm font-medium text-[#eef2ff] truncate">
                          {pass.satelliteName}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 ml-4 text-xs text-[#637196]">
                        <span>{formatDate(pass.aos)}</span>
                        <span>
                          {formatTime(pass.aos)} — {formatTime(pass.los)}
                        </span>
                        <span>{formatDuration(pass.duration)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span
                        className="badge text-[10px]"
                        style={{
                          backgroundColor: `${orbitColor}15`,
                          color: orbitColor,
                          border: `1px solid ${orbitColor}30`,
                        }}
                      >
                        {pass.orbitType}
                      </span>
                      <span className="text-[10px] text-[#4a5578]">
                        {'макс'} {pass.maxElevation.toFixed(1)}&deg;
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
