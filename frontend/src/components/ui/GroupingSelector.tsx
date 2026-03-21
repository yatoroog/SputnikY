'use client';

import { useEffect } from 'react';
import { Check, GitCompareArrows, Layers3, X } from 'lucide-react';
import { buildSatelliteGroupings, formatGroupingBreakdown, formatMetricRange } from '@/lib/groupings';
import { cn, formatAltitude, formatPeriod, getOrbitTypeColor } from '@/lib/utils';
import { useSatelliteStore } from '@/store/satelliteStore';
import { MAX_GROUPING_COMPARISON, useGroupingStore } from '@/store/groupingStore';

function formatDegree(value: number): string {
  return `${value.toFixed(1)}°`;
}

export default function GroupingSelector() {
  const satellites = useSatelliteStore((state) => state.satellites);
  const groupings = buildSatelliteGroupings(satellites);
  const selectedGroupingIds = useGroupingStore((state) => state.selectedGroupingIds);
  const toggleGrouping = useGroupingStore((state) => state.toggleGrouping);
  const clearSelection = useGroupingStore((state) => state.clearSelection);
  const openComparison = useGroupingStore((state) => state.openComparison);
  const syncAvailableGroupings = useGroupingStore(
    (state) => state.syncAvailableGroupings
  );

  useEffect(() => {
    syncAvailableGroupings(groupings.map((grouping) => grouping.id));
  }, [groupings, syncAvailableGroupings]);

  const selectionLimitReached =
    selectedGroupingIds.length >= MAX_GROUPING_COMPARISON;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <GitCompareArrows size={14} className="text-accent-cyan" />
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#637196]">
              Сравнение группировок
            </p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[#94a3c0]">
            Семейства формируются автоматически по названиям спутников в текущем каталоге.
          </p>
        </div>
        {selectedGroupingIds.length > 0 && (
          <button
            onClick={clearSelection}
            className="premium-icon-button flex h-8 w-8 items-center justify-center rounded-xl text-[#637196] transition-colors hover:text-white"
            title="Очистить выбор"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-[#7f8ca7]">
          Выбрано {selectedGroupingIds.length} из {MAX_GROUPING_COMPARISON}
        </span>
        <span className="text-[#4a5578]">
          {groupings.length > 0 ? `${groupings.length} группировок` : 'Нет групп для сравнения'}
        </span>
      </div>

      <button
        onClick={openComparison}
        disabled={selectedGroupingIds.length === 0}
        className={cn(
          'flex w-full items-center justify-center rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-300',
          selectedGroupingIds.length > 0
            ? 'border-accent-cyan/30 bg-accent-cyan/12 text-accent-cyan hover:-translate-y-0.5 hover:border-accent-cyan/45 hover:bg-accent-cyan/18'
            : 'cursor-not-allowed border-white/10 bg-white/[0.03] text-[#4a5578]'
        )}
      >
        Сравнить выбранные группировки
      </button>

      {groupings.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-xs leading-relaxed text-[#94a3c0]">
          Для сравнения нужны как минимум две спутниковые записи в одной группе. Это появится
          автоматически, если в каталоге есть семейства вроде `Starlink`, `GPS`, `ISS`, `GOES`
          или похожие серии.
        </div>
      ) : (
        <div className="space-y-2">
          {groupings.map((grouping) => {
            const isSelected = selectedGroupingIds.includes(grouping.id);
            const isDisabled = selectionLimitReached && !isSelected;
            const orbitColor = getOrbitTypeColor(grouping.primaryOrbitType);

            return (
              <button
                key={grouping.id}
                onClick={() => toggleGrouping(grouping.id)}
                disabled={isDisabled}
                className={cn(
                  'group relative w-full overflow-hidden rounded-[20px] border px-4 py-3.5 text-left transition-all duration-300',
                  isSelected
                    ? 'border-white/15 bg-white/10 shadow-[0_0_24px_rgba(6,182,212,0.1)]'
                    : 'border-white/6 bg-white/[0.03] hover:-translate-y-0.5 hover:border-white/12 hover:bg-white/[0.06]',
                  isDisabled && 'cursor-not-allowed opacity-45 hover:translate-y-0'
                )}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full shadow-[0_0_10px_currentColor]"
                        style={{ backgroundColor: orbitColor }}
                      />
                      <p
                        className={cn(
                          'truncate text-sm font-medium transition-colors',
                          isSelected ? 'text-accent-cyan' : 'text-[#eef2ff] group-hover:text-white'
                        )}
                      >
                        {grouping.label}
                      </p>
                    </div>

                    <div className="ml-[18px] mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#94a3c0]">
                      <span>{formatGroupingBreakdown(grouping.orbitTypeBreakdown, 2)}</span>
                      <span className="text-[#4a5578]">•</span>
                      <span>{grouping.satelliteCount} спутн.</span>
                      <span className="text-[#4a5578]">•</span>
                      <span>{formatMetricRange(grouping.altitudeRange, formatAltitude)}</span>
                    </div>

                    <div className="ml-[18px] mt-1.5 text-[11px] text-[#637196]">
                      Наклонение {formatMetricRange(grouping.inclinationRange, formatDegree)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className="badge mt-0.5 flex-shrink-0 px-3 py-1 text-[10px] tracking-[0.2em]"
                      style={{
                        background: `${orbitColor}15`,
                        color: orbitColor,
                        border: `1px solid ${orbitColor}30`,
                        boxShadow: `0 0 12px ${orbitColor}10`,
                      }}
                    >
                      {grouping.satelliteCount}
                    </span>
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                        isSelected
                          ? 'border-accent-cyan/40 bg-accent-cyan/15 text-accent-cyan'
                          : 'border-white/10 bg-white/5 text-[#4a5578]'
                      )}
                    >
                      {isSelected ? <Check size={13} /> : <Layers3 size={12} />}
                    </span>
                  </div>
                </div>

                <div className="ml-[18px] mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#637196]">
                  <span>Период {formatMetricRange(grouping.periodRange, formatPeriod)}</span>
                  {grouping.countryBreakdown.length > 0 && (
                    <>
                      <span className="text-[#4a5578]">•</span>
                      <span>{formatGroupingBreakdown(grouping.countryBreakdown, 2)}</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
