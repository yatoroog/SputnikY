'use client';

import { memo, useState, useCallback } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Satellite as SatelliteIcon,
} from 'lucide-react';
import { useSatelliteStore } from '@/store/satelliteStore';
import { cn, getOrbitTypeColor, formatAltitude, getOrbitTypeLabel } from '@/lib/utils';
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
          className="panel-base p-3 hover:border-accent-cyan/30 transition-all duration-200"
          title={'\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u0430\u043D\u0435\u043B\u044C'}
        >
          <ChevronRight size={18} className="text-[#9ca3af]" />
        </button>
      </div>
    );
  }

  return (
    <div className="panel-base h-full w-[380px] flex flex-col animate-slide-in-left overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-cosmos-border">
        <div className="flex items-center gap-2">
          <SatelliteIcon size={18} className="text-accent-cyan" />
          <h2 className="text-base font-semibold text-[#e5e7eb]">
            {'\u0421\u043F\u0443\u0442\u043D\u0438\u043A\u0438'}
          </h2>
          <span className="bg-accent-blue/20 text-accent-blue text-xs font-medium px-2 py-0.5 rounded-full">
            {satellites.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleUploader}
            className="p-1.5 text-[#9ca3af] hover:text-accent-cyan transition-colors duration-200"
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
            className="p-1.5 text-[#9ca3af] hover:text-[#e5e7eb] transition-colors duration-200"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-cosmos-border">
        <SearchBar />
      </div>

      {/* Filters */}
      <div className="p-3 border-b border-cosmos-border">
        <FilterPanel />
      </div>

      {/* TLE Uploader */}
      {showUploader && (
        <div className="p-3 border-b border-cosmos-border">
          <TleUploader />
        </div>
      )}

      {/* Satellite list */}
      <div className="flex-1 overflow-y-auto">
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
          <div className="py-1">
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
        'w-full text-left px-4 py-3 border-b border-cosmos-border/50 transition-all duration-200 hover:bg-accent-cyan/5',
        isSelected && 'bg-accent-cyan/10 border-l-2 border-l-accent-cyan'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: orbitColor }}
            />
            <p
              className={cn(
                'text-sm font-medium truncate',
                isSelected ? 'text-accent-cyan' : 'text-[#e5e7eb]'
              )}
            >
              {satellite.name}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1 ml-4">
            <span className="text-xs text-[#9ca3af]">
              NORAD {satellite.noradId}
            </span>
            <span className="text-xs text-[#9ca3af]">
              {formatAltitude(satellite.altitude)}
            </span>
          </div>
        </div>
        <span
          className="badge flex-shrink-0 mt-0.5"
          style={{
            backgroundColor: `${orbitColor}20`,
            color: orbitColor,
            border: `1px solid ${orbitColor}40`,
          }}
        >
          {satellite.orbitType}
        </span>
      </div>
    </button>
  );
});
