'use client';

import { memo, useState, useCallback } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Satellite as SatelliteIcon,
} from 'lucide-react';
import { useSatelliteStore } from '@/store/satelliteStore';
import { cn, getOrbitTypeColor, formatAltitude } from '@/lib/utils';
import SearchBar from './SearchBar';
import FilterPanel from './FilterPanel';
import TleUploader from './TleUploader';
import type { Satellite } from '@/types';

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const satellites = useSatelliteStore((state) => state.satellites);
  const selectedSatellite = useSatelliteStore((state) => state.selectedSatellite);
  const loading = useSatelliteStore((state) => state.loading);
  const error = useSatelliteStore((state) => state.error);
  const selectSatellite = useSatelliteStore((state) => state.selectSatellite);

  const handleSelect = useCallback(
    (satellite: Satellite) => {
      selectSatellite(satellite);
    },
    [selectSatellite]
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const toggleUploader = useCallback(() => {
    setShowUploader((prev) => !prev);
  }, []);

  if (collapsed) {
    return (
      <div className="h-full flex flex-col">
        <button
          onClick={toggleCollapsed}
          className="panel-base premium-icon-button flex h-14 w-14 items-center justify-center rounded-[20px] text-[#9ca3af] transition-all duration-300 hover:-translate-y-0.5 hover:text-[#eef4ff]"
          title={'\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u0430\u043D\u0435\u043B\u044C'}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="panel-base relative h-full w-[min(392px,calc(100vw-1rem))] overflow-hidden animate-slide-in-left">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_72%)]" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-white/8 px-5 pb-5 pt-6">
        <div className="flex items-center gap-3">
          <div className="premium-icon-button flex h-11 w-11 items-center justify-center rounded-2xl text-accent-cyan">
            <SatelliteIcon size={18} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-[17px] font-semibold tracking-[0.02em] text-[#f2f6ff]">
                {'\u0421\u043F\u0443\u0442\u043D\u0438\u043A\u0438'}
              </h2>
              <span className="rounded-full border border-[#4d73c7]/30 bg-[linear-gradient(180deg,rgba(28,53,109,0.86),rgba(15,29,63,0.86))] px-2.5 py-1 text-[11px] font-semibold tracking-[0.18em] text-[#a9c5ff]">
                {satellites.length}
              </span>
            </div>
            <p className="mt-1 text-[11px] uppercase tracking-[0.24em] text-[#71809f]">
              Орбитальный каталог
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleUploader}
            className="premium-icon-button flex h-10 w-10 items-center justify-center rounded-2xl text-[#7f8ca7] transition-all duration-300 hover:-translate-y-0.5 hover:text-[#82ecff]"
            title="TLE"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </button>
          <button
            onClick={toggleCollapsed}
            className="premium-icon-button flex h-10 w-10 items-center justify-center rounded-2xl text-[#7f8ca7] transition-all duration-300 hover:-translate-y-0.5 hover:text-[#eef4ff]"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-white/8 px-4 py-4">
        <SearchBar />
      </div>

      {/* Filters */}
      <div className="border-b border-white/8 px-4 py-4">
        <FilterPanel />
      </div>

      {/* TLE Uploader */}
      {showUploader && (
        <div className="border-b border-white/8 px-4 py-4">
          <TleUploader />
        </div>
      )}

      {/* Satellite list */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <AlertTriangle size={28} className="text-amber-400" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#e5e7eb]">
                Не удалось загрузить спутники
              </p>
              <p className="text-xs leading-relaxed text-[#9ca3af]">{error}</p>
            </div>
          </div>
        ) : satellites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[#9ca3af]">
            <SatelliteIcon size={32} className="mb-3 opacity-40" />
            <p className="text-sm">{'\u0421\u043F\u0443\u0442\u043D\u0438\u043A\u0438 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B'}</p>
            <p className="text-xs mt-1">{'\u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0444\u0438\u043B\u044C\u0442\u0440\u044B'}</p>
          </div>
        ) : (
          <div className="space-y-2 pb-2">
            {satellites.map((sat) => (
              <SatelliteListItem
                key={sat.id}
                satellite={sat}
                isSelected={selectedSatellite?.id === sat.id}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

interface SatelliteListItemProps {
  satellite: Satellite;
  isSelected: boolean;
  onSelect: (satellite: Satellite) => void;
}

const SatelliteListItem = memo(function SatelliteListItem({
  satellite,
  isSelected,
  onSelect,
}: SatelliteListItemProps) {
  const orbitColor = getOrbitTypeColor(satellite.orbitType);

  return (
    <button
      onClick={() => onSelect(satellite)}
      className={cn(
        'group relative w-full overflow-hidden rounded-[22px] border px-4 py-4 text-left transition-all duration-300',
        isSelected
          ? 'border-[#47dff8]/32 bg-[linear-gradient(180deg,rgba(12,41,64,0.96),rgba(8,23,39,0.94))] shadow-[0_18px_45px_rgba(6,182,212,0.12)]'
          : 'border-white/6 bg-[linear-gradient(180deg,rgba(14,21,40,0.92),rgba(8,13,25,0.9))] hover:-translate-y-0.5 hover:border-[#4fdcf6]/20 hover:bg-[linear-gradient(180deg,rgba(16,25,47,0.96),rgba(9,15,28,0.94))]'
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-70" />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full shadow-[0_0_14px_currentColor]"
              style={{ backgroundColor: orbitColor }}
            />
            <p
              className={cn(
                'truncate text-[15px] font-medium tracking-[0.01em] transition-colors duration-300',
                isSelected ? 'text-[#87efff]' : 'text-[#ecf2ff] group-hover:text-white'
              )}
            >
              {satellite.name}
            </p>
          </div>
          <div className="ml-[18px] mt-2 flex items-center gap-2">
            <span className="text-xs uppercase tracking-[0.16em] text-[#8190af]">
              NORAD {satellite.noradId}
            </span>
            <span className="text-xs text-[#9ca3af]">
              •
            </span>
            <span className="text-xs text-[#9ca3af]">
              {formatAltitude(satellite.altitude)}
            </span>
          </div>
        </div>
        <span
          className="badge mt-0.5 flex-shrink-0 px-3 py-1 text-[10px] tracking-[0.22em]"
          style={{
            background: `linear-gradient(180deg, ${orbitColor}22, ${orbitColor}12)`,
            color: orbitColor,
            border: `1px solid ${orbitColor}4d`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 18px ${orbitColor}18`,
          }}
        >
          {satellite.orbitType}
        </span>
      </div>
    </button>
  );
});
