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
import GroupingSelector from './GroupingSelector';
import TleUploader from './TleUploader';
import type { Satellite } from '@/types';

function getSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case 'n2yo':
      return 'N2YO';
    case 'local_tle':
      return 'Local TLE';
    case 'uploaded_tle':
      return 'TLE Upload';
    case 'preset':
      return 'TLE Preset';
    default:
      return 'Unknown';
  }
}

function getSourceTone(source: string | null | undefined): string {
  switch (source) {
    case 'n2yo':
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
    case 'local_tle':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-300';
    case 'uploaded_tle':
    case 'preset':
      return 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300';
    default:
      return 'border-white/10 bg-white/5 text-[#94a3c0]';
  }
}

function formatStatusTime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getVisibleCatalogNote(note: string | null | undefined): string | null {
  if (!note) {
    return null;
  }

  const normalized = note.trim();
  if (normalized.startsWith('N2YO startup fetch skipped:')) {
    return null;
  }

  return normalized;
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const satellites = useSatelliteStore((state) => state.satellites);
  const catalogStatus = useSatelliteStore((state) => state.catalogStatus);
  const selectedSatellite = useSatelliteStore((state) => state.selectedSatellite);
  const loading = useSatelliteStore((state) => state.loading);
  const error = useSatelliteStore((state) => state.error);
  const selectSatellite = useSatelliteStore((state) => state.selectSatellite);
  const statusTimestamp = formatStatusTime(catalogStatus?.lastSyncAt);
  const visibleCatalogNote = getVisibleCatalogNote(catalogStatus?.note);

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
          className="panel-base premium-icon-button flex h-14 w-14 items-center justify-center rounded-[20px] text-[#94a3c0] transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
          title={'Показать панель'}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="panel-base glass-shimmer relative h-full w-[min(392px,calc(100vw-1rem))] overflow-hidden animate-slide-in-left">
      {/* Top specular line */}
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent z-10" />

      <div className="relative flex h-full flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pb-5 pt-6">
          <div className="flex items-center gap-3">
            <div className="premium-icon-button flex h-11 w-11 items-center justify-center rounded-2xl text-accent-cyan">
              <SatelliteIcon size={18} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-[17px] font-semibold tracking-[0.02em] text-white">
                  {'Спутники'}
                </h2>
                <span className="rounded-full bg-white/8 border border-white/10 px-2.5 py-1 text-[11px] font-semibold tracking-[0.18em] text-accent-cyan">
                  {satellites.length}
                </span>
              </div>
              <p className="mt-1 text-[11px] uppercase tracking-[0.24em] text-[#637196]">
                Орбитальный каталог
              </p>
              {catalogStatus && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
                        getSourceTone(catalogStatus.source)
                      )}
                    >
                      {getSourceLabel(catalogStatus.source)}
                    </span>
                    {statusTimestamp && (
                      <span className="text-[11px] text-[#7f8ca7]">
                        {statusTimestamp}
                      </span>
                    )}
                  </div>
                  {visibleCatalogNote && (
                    <p className="max-w-[260px] text-[11px] leading-relaxed text-[#94a3c0]">
                      {visibleCatalogNote}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleUploader}
              className="premium-icon-button flex h-10 w-10 items-center justify-center rounded-2xl text-[#7f8ca7] transition-all duration-300 hover:-translate-y-0.5 hover:text-accent-cyan"
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
              className="premium-icon-button flex h-10 w-10 items-center justify-center rounded-2xl text-[#7f8ca7] transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
            >
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>

        {/* Glass divider */}
        <div className="mx-5 h-px glass-divider-h" />

        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {/* Search */}
          <div className="px-4 py-4">
            <SearchBar />
          </div>

          {/* Glass divider */}
          <div className="mx-5 h-px glass-divider-h" />

          {/* Filters */}
          <div className="px-4 py-4">
            <FilterPanel />
          </div>

          {/* Glass divider */}
          <div className="mx-5 h-px glass-divider-h" />

          {/* Grouping comparison */}
          <div className="px-4 py-4">
            <GroupingSelector />
          </div>

          {/* TLE Uploader */}
          {showUploader && (
            <>
              <div className="mx-5 h-px glass-divider-h" />
              <div className="px-4 py-4">
                <TleUploader />
              </div>
            </>
          )}

          {/* Glass divider */}
          <div className="mx-5 h-px glass-divider-h" />

          {/* Satellite list */}
          <div className="px-3 py-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-accent-cyan/50 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                <AlertTriangle size={28} className="text-amber-400" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[#eef2ff]">
                    Не удалось загрузить спутники
                  </p>
                  <p className="text-xs leading-relaxed text-[#94a3c0]">{error}</p>
                </div>
              </div>
            ) : satellites.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-[#94a3c0]">
                <SatelliteIcon size={32} className="mb-3 opacity-40" />
                <p className="text-sm">{'Спутники не найдены'}</p>
                <p className="text-xs mt-1">{'Попробуйте изменить фильтры'}</p>
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
        'group relative w-full overflow-hidden rounded-[20px] border px-4 py-4 text-left transition-all duration-300',
        isSelected
          ? 'border-white/15 bg-white/10 shadow-[0_0_24px_rgba(6,182,212,0.1)]'
          : 'border-white/6 bg-white/[0.03] hover:-translate-y-0.5 hover:border-white/12 hover:bg-white/[0.06]'
      )}
    >
      {/* Top specular line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full shadow-[0_0_10px_currentColor]"
              style={{ backgroundColor: orbitColor }}
            />
            <p
              className={cn(
                'truncate text-[15px] font-medium tracking-[0.01em] transition-colors duration-300',
                isSelected ? 'text-accent-cyan' : 'text-[#eef2ff] group-hover:text-white'
              )}
            >
              {satellite.name}
            </p>
          </div>
          <div className="ml-[18px] mt-2 flex items-center gap-2">
            <span className="text-xs uppercase tracking-[0.16em] text-[#637196]">
              NORAD {satellite.noradId}
            </span>
            <span className="text-xs text-[#4a5578]">
              •
            </span>
            <span className="text-xs text-[#94a3c0]">
              {formatAltitude(satellite.altitude)}
            </span>
          </div>
        </div>
        <span
          className="badge mt-0.5 flex-shrink-0 px-3 py-1 text-[10px] tracking-[0.22em]"
          style={{
            background: `${orbitColor}15`,
            color: orbitColor,
            border: `1px solid ${orbitColor}30`,
            boxShadow: `0 0 12px ${orbitColor}10`,
          }}
        >
          {satellite.orbitType}
        </span>
      </div>
    </button>
  );
});
