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
    <div className="panel-base w-[360px] max-h-full flex flex-col animate-slide-in-right overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-cosmos-border">
        <div className="flex items-center gap-2">
          <Radio size={18} className="text-accent-cyan" />
          <h2 className="text-base font-semibold text-[#e5e7eb]">
            {'Пролёты спутников'}
          </h2>
        </div>
        <button
          onClick={() => setClickedLocation(null)}
          className="p-1.5 text-[#9ca3af] hover:text-[#e5e7eb] transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Location info */}
      <div className="px-4 py-2.5 border-b border-cosmos-border bg-white/[0.02]">
        <div className="flex items-center gap-2 text-xs text-[#9ca3af]">
          <MapPin size={12} className="text-accent-cyan flex-shrink-0" />
          <span>
            {Math.abs(clickedLocation.lat).toFixed(2)}&deg;{clickedLocation.lat >= 0 ? 'N' : 'S'},{' '}
            {Math.abs(clickedLocation.lng).toFixed(2)}&deg;{clickedLocation.lng >= 0 ? 'E' : 'W'}
          </span>
          <span className="text-[#6b7280]">|</span>
          <Clock size={12} className="flex-shrink-0" />
          <span>{'Ближайшие 6 часов'}</span>
        </div>
      </div>

      {/* Pass list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-[#9ca3af]">{'Расчёт пролётов...'}</p>
            </div>
          </div>
        ) : areaPasses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[#9ca3af]">
            <Radio size={28} className="mb-3 opacity-40" />
            <p className="text-sm">{'Пролётов не найдено'}</p>
            <p className="text-xs mt-1">{'Попробуйте выбрать другую точку'}</p>
          </div>
        ) : (
          <div className="py-1">
            {areaPasses.map((pass, i) => {
              const orbitColor = getOrbitTypeColor(pass.orbitType);
              return (
                <div
                  key={`${pass.satelliteId}-${pass.aos}-${i}`}
                  className="px-4 py-3 border-b border-cosmos-border/50 hover:bg-accent-cyan/5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: orbitColor }}
                        />
                        <p className="text-sm font-medium text-[#e5e7eb] truncate">
                          {pass.satelliteName}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 ml-4 text-xs text-[#9ca3af]">
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
                          backgroundColor: `${orbitColor}20`,
                          color: orbitColor,
                          border: `1px solid ${orbitColor}40`,
                        }}
                      >
                        {pass.orbitType}
                      </span>
                      <span className="text-[10px] text-[#9ca3af]">
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
