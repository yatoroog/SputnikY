'use client';

import { useEffect } from 'react';
import { GitCompareArrows, Layers3, Radar, X } from 'lucide-react';
import {
  buildSatelliteGroupings,
  formatGroupingBreakdown,
  formatMetricRange,
} from '@/lib/groupings';
import {
  cn,
  formatAltitude,
  formatPeriod,
  getOrbitTypeColor,
  getOrbitTypeLabel,
} from '@/lib/utils';
import { useGroupingStore } from '@/store/groupingStore';
import { useSatelliteStore } from '@/store/satelliteStore';
import type { SatelliteGrouping } from '@/types';

function formatDegree(value: number): string {
  return `${value.toFixed(1)}°`;
}

function formatVelocity(value: number): string {
  return `${value.toFixed(1)} км/с`;
}

function formatMetricValue(grouping: SatelliteGrouping, metric: string): string {
  switch (metric) {
    case 'satellites':
      return String(grouping.satelliteCount);
    case 'countries':
      return formatGroupingBreakdown(grouping.countryBreakdown, 4);
    case 'orbits':
      return formatGroupingBreakdown(grouping.orbitTypeBreakdown, 3);
    case 'purposes':
      return formatGroupingBreakdown(grouping.purposeBreakdown, 3);
    case 'altitude-range':
      return formatMetricRange(grouping.altitudeRange, formatAltitude);
    case 'altitude-average':
      return formatAltitude(grouping.averageAltitude);
    case 'inclination-range':
      return formatMetricRange(grouping.inclinationRange, formatDegree);
    case 'period-range':
      return formatMetricRange(grouping.periodRange, formatPeriod);
    case 'velocity-range':
      return formatMetricRange(grouping.velocityRange, formatVelocity);
    default:
      return '—';
  }
}

const COMPARISON_ROWS = [
  { id: 'satellites', label: 'Количество спутников' },
  { id: 'countries', label: 'Страны и распределение' },
  { id: 'orbits', label: 'Типы орбит' },
  { id: 'purposes', label: 'Назначения' },
  { id: 'altitude-range', label: 'Диапазон высот' },
  { id: 'altitude-average', label: 'Средняя высота' },
  { id: 'inclination-range', label: 'Разброс наклонений' },
  { id: 'period-range', label: 'Период обращения' },
  { id: 'velocity-range', label: 'Диапазон скоростей' },
] as const;

interface GroupingChipProps {
  grouping: SatelliteGrouping;
  isActive: boolean;
  onActivate: () => void;
  onRemove: () => void;
}

function GroupingChip({
  grouping,
  isActive,
  onActivate,
  onRemove,
}: GroupingChipProps) {
  const orbitColor = getOrbitTypeColor(grouping.primaryOrbitType);

  return (
    <div
      className={cn(
        'inline-flex items-center overflow-hidden rounded-full border backdrop-blur transition-all duration-300',
        isActive
          ? 'shadow-[0_0_32px_rgba(6,182,212,0.16)]'
          : 'hover:border-white/18 hover:bg-white/[0.05]'
      )}
      style={{
        borderColor: isActive ? `${orbitColor}55` : `${orbitColor}28`,
        backgroundColor: isActive ? `${orbitColor}1c` : 'rgba(255,255,255,0.03)',
      }}
    >
      <button
        onClick={onActivate}
        className="flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
        style={{ color: isActive ? '#eef2ff' : orbitColor }}
      >
        <span
          className="h-2.5 w-2.5 rounded-full shadow-[0_0_12px_currentColor]"
          style={{ backgroundColor: orbitColor }}
        />
        <span className="text-sm font-medium">{grouping.label}</span>
        <span className="text-xs text-[#94a3c0]">{grouping.satelliteCount}</span>
      </button>

      <button
        onClick={onRemove}
        className="flex h-full items-center justify-center border-l px-3 text-sm text-[#94a3c0] transition-colors hover:bg-white/[0.06] hover:text-white"
        style={{
          borderLeftColor: isActive ? `${orbitColor}2f` : 'rgba(255,255,255,0.08)',
        }}
        aria-label={`Убрать группировку ${grouping.label}`}
      >
        <X size={14} />
      </button>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  accentColor: string;
}

function StatCard({ label, value, accentColor }: StatCardProps) {
  return (
    <div
      className="relative overflow-hidden rounded-[18px] border border-white/10 bg-[#0f1729]/82 px-3 py-3 sm:rounded-[22px] sm:px-4 sm:py-4"
      style={{
        backgroundImage: `radial-gradient(circle at top right, ${accentColor}22, transparent 45%)`,
      }}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent" />
      <p className="text-[11px] uppercase tracking-[0.2em] text-[#637196]">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-snug text-white sm:mt-3 sm:text-lg">{value}</p>
    </div>
  );
}

export default function GroupingComparisonPanel() {
  const satellites = useSatelliteStore((state) => state.satellites);
  const selectSatellite = useSatelliteStore((state) => state.selectSatellite);
  const selectedGroupingIds = useGroupingStore((state) => state.selectedGroupingIds);
  const activeGroupingId = useGroupingStore((state) => state.activeGroupingId);
  const isComparisonOpen = useGroupingStore((state) => state.isComparisonOpen);
  const closeComparison = useGroupingStore((state) => state.closeComparison);
  const toggleGrouping = useGroupingStore((state) => state.toggleGrouping);
  const setActiveGrouping = useGroupingStore((state) => state.setActiveGrouping);
  const allGroupings = buildSatelliteGroupings(satellites);

  const selectedGroupings = selectedGroupingIds
    .map((id) => allGroupings.find((grouping) => grouping.id === id) ?? null)
    .filter((grouping): grouping is SatelliteGrouping => grouping !== null);

  const activeGrouping =
    selectedGroupings.find((grouping) => grouping.id === activeGroupingId) ??
    selectedGroupings[0] ??
    null;

  useEffect(() => {
    if (!isComparisonOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeComparison();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isComparisonOpen, closeComparison]);

  if (!isComparisonOpen || selectedGroupings.length === 0 || !activeGrouping) {
    return null;
  }

  const activeColor = getOrbitTypeColor(activeGrouping.primaryOrbitType);

  return (
    <div
      className="fixed inset-0 z-30 overflow-y-auto bg-[rgba(2,6,23,0.74)] px-2 py-2 backdrop-blur-[5px] sm:px-4 sm:py-4 md:px-6 md:py-6"
      onClick={closeComparison}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[1660px] items-start justify-center">
        <div
          className="panel-base relative w-full overflow-hidden rounded-[24px] border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,0.08),transparent_28%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.09),transparent_30%),linear-gradient(180deg,rgba(8,12,22,0.96),rgba(7,10,18,0.94))] shadow-[0_24px_120px_rgba(0,0,0,0.5)] sm:rounded-[36px]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 top-0 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent z-10" />

          <div className="relative max-h-[calc(100vh-1rem)] overflow-y-auto overscroll-contain sm:max-h-[calc(100vh-2rem)] md:max-h-[calc(100vh-3rem)]">
            <div className="sticky top-0 z-30 border-b border-white/8 bg-[linear-gradient(180deg,rgba(10,15,27,0.96),rgba(10,15,27,0.82))] backdrop-blur-xl">
              <div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-6 md:px-8 md:pt-7">
                <div className="flex items-start justify-between gap-3 sm:gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[18px] bg-accent-cyan/10 shadow-[0_0_36px_rgba(6,182,212,0.14)] sm:h-14 sm:w-14 sm:rounded-2xl">
                        <GitCompareArrows size={18} className="text-accent-cyan sm:h-6 sm:w-6" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold leading-none text-white sm:text-[28px] md:text-[34px]">
                          Сравнение группировок
                        </h2>
                        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[#94a3c0] sm:mt-3 sm:text-base md:text-lg">
                          Большое модальное окно с агрегатами, чистой таблицей сравнения и
                          подробным списком спутников выбранной активной группы.
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={closeComparison}
                    className="premium-icon-button flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[18px] text-[#637196] transition-colors hover:text-white sm:h-14 sm:w-14 sm:rounded-[22px]"
                    title="Закрыть сравнение"
                  >
                    <X size={18} className="sm:h-6 sm:w-6" />
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-5 sm:gap-3">
                  {selectedGroupings.map((grouping) => (
                    <GroupingChip
                      key={grouping.id}
                      grouping={grouping}
                      isActive={grouping.id === activeGrouping.id}
                      onActivate={() => setActiveGrouping(grouping.id)}
                      onRemove={() => toggleGrouping(grouping.id)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4 px-3 pb-3 pt-3 sm:space-y-6 sm:px-6 sm:pb-6 sm:pt-6 md:px-8 md:pb-8">
              <section className="overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,22,38,0.82),rgba(8,12,22,0.86))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:rounded-[30px]">
                <div className="flex flex-col gap-2 border-b border-white/8 px-3 py-3 sm:gap-3 sm:px-5 sm:py-5 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-[#637196]">
                      Агрегированное сравнение
                    </p>
                    <h3 className="mt-1.5 text-base font-semibold text-white sm:mt-2 sm:text-xl">
                      Ключевые метрики по выбранным группировкам
                    </h3>
                  </div>
                  <p className="text-xs text-[#7f8ca7] sm:text-sm">
                    Сводка занимает всю ширину окна и прокручивается только по горизонтали при
                    необходимости.
                  </p>
                </div>

                <div className="overflow-x-auto px-2 pb-2 pt-2 sm:px-4 sm:pb-4 sm:pt-4 md:px-5 md:pb-5">
                  <div className="overflow-hidden rounded-[18px] border border-white/8 bg-white/[0.03] sm:rounded-[24px]">
                    <div
                      className="grid min-w-[720px] w-full gap-px bg-white/[0.06] sm:min-w-[980px]"
                      style={{
                        gridTemplateColumns: `minmax(170px,0.9fr) repeat(${selectedGroupings.length}, minmax(180px,1fr))`,
                      }}
                    >
                      <div className="bg-[#10182b]/96 px-3 py-3 text-left text-[10px] font-medium uppercase tracking-[0.18em] text-[#637196] sm:px-5 sm:py-5 sm:text-[11px] sm:tracking-[0.24em]">
                        Метрика
                      </div>

                      {selectedGroupings.map((grouping) => {
                        const orbitColor = getOrbitTypeColor(grouping.primaryOrbitType);

                        return (
                          <div
                            key={grouping.id}
                            className="bg-[#10182b]/96 px-3 py-3 sm:px-5 sm:py-5"
                            style={{
                              backgroundImage: `radial-gradient(circle at top left, ${orbitColor}1f, transparent 45%)`,
                            }}
                          >
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div
                                className="h-2.5 w-2.5 rounded-full shadow-[0_0_14px_currentColor] sm:h-3 sm:w-3"
                                style={{ backgroundColor: orbitColor }}
                              />
                              <div>
                                <p className="text-[13px] font-semibold text-white sm:text-[15px]">
                                  {grouping.label}
                                </p>
                                <p className="mt-0.5 text-[11px] text-[#7f8ca7] sm:mt-1 sm:text-xs">
                                  {grouping.satelliteCount} спутн.
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {COMPARISON_ROWS.map((row, rowIndex) => (
                        <div key={row.id} className="contents">
                          <div
                            className={cn(
                              'px-3 py-3 text-xs font-medium text-[#9fb0d4] sm:px-5 sm:py-4 sm:text-sm',
                              rowIndex % 2 === 0 ? 'bg-[#0d1324]' : 'bg-[#0a101d]'
                            )}
                          >
                            {row.label}
                          </div>

                          {selectedGroupings.map((grouping) => (
                            <div
                              key={`${grouping.id}-${row.id}`}
                              className={cn(
                                'px-3 py-3 text-xs leading-relaxed text-white sm:px-5 sm:py-4 sm:text-sm',
                                rowIndex % 2 === 0 ? 'bg-[#0d1324]' : 'bg-[#0a101d]'
                              )}
                            >
                              {formatMetricValue(grouping, row.id)}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,22,38,0.84),rgba(8,12,22,0.88))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:rounded-[30px]">
                <div
                  className="border-b border-white/8 px-3 py-4 sm:px-5 sm:py-6 md:px-6"
                  style={{
                    backgroundImage: `radial-gradient(circle at top right, ${activeColor}1f, transparent 38%)`,
                  }}
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <Layers3 size={18} className="sm:h-[22px] sm:w-[22px]" style={{ color: activeColor }} />
                        <h3 className="truncate text-lg font-semibold text-white sm:text-[28px] md:text-[34px]">
                          {activeGrouping.label}
                        </h3>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-[#94a3c0] sm:mt-4 sm:gap-x-3 sm:gap-y-2 sm:text-sm">
                        <span>{formatGroupingBreakdown(activeGrouping.orbitTypeBreakdown, 3)}</span>
                        {activeGrouping.countryBreakdown.length > 0 && (
                          <>
                            <span className="text-[#4a5578]">•</span>
                            <span>{formatGroupingBreakdown(activeGrouping.countryBreakdown, 3)}</span>
                          </>
                        )}
                        {activeGrouping.purposeBreakdown.length > 0 && (
                          <>
                            <span className="text-[#4a5578]">•</span>
                            <span>{formatGroupingBreakdown(activeGrouping.purposeBreakdown, 2)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-[#94a3c0] sm:px-4 sm:py-2.5 sm:text-sm">
                      <Radar size={16} className="text-accent-cyan" />
                      Клик по спутнику подсветит его на карте
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:mt-6 sm:gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                      label="Спутников"
                      value={String(activeGrouping.satelliteCount)}
                      accentColor={activeColor}
                    />
                    <StatCard
                      label="Диапазон высот"
                      value={formatMetricRange(activeGrouping.altitudeRange, formatAltitude)}
                      accentColor={activeColor}
                    />
                    <StatCard
                      label="Наклонение"
                      value={formatMetricRange(activeGrouping.inclinationRange, formatDegree)}
                      accentColor={activeColor}
                    />
                    <StatCard
                      label="Период обращения"
                      value={formatMetricRange(activeGrouping.periodRange, formatPeriod)}
                      accentColor={activeColor}
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[860px] sm:min-w-[1180px]">
                    <div className="grid grid-cols-[minmax(240px,2fr)_minmax(150px,1fr)_100px_110px_110px_100px] border-b border-white/8 bg-[#0f1729]/92 px-3 py-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[#637196] sm:grid-cols-[minmax(320px,2.4fr)_minmax(180px,1.05fr)_120px_140px_140px_120px] sm:px-5 sm:py-4 sm:text-[11px] sm:tracking-[0.22em]">
                      <span>Спутник</span>
                      <span>Орбита</span>
                      <span>Высота</span>
                      <span>Наклонение</span>
                      <span>Период</span>
                      <span>Скорость</span>
                    </div>

                    <div className="divide-y divide-white/8">
                      {activeGrouping.satellites.map((satellite, index) => (
                        <button
                          key={satellite.id}
                          onClick={() => selectSatellite(satellite)}
                          className={cn(
                            'grid w-full grid-cols-[minmax(240px,2fr)_minmax(150px,1fr)_100px_110px_110px_100px] items-start gap-0 px-3 py-3 text-left transition-all duration-200 hover:bg-white/[0.04] sm:grid-cols-[minmax(320px,2.4fr)_minmax(180px,1.05fr)_120px_140px_140px_120px] sm:px-5 sm:py-5',
                            index % 2 === 0 ? 'bg-white/[0.01]' : 'bg-white/[0.025]'
                          )}
                        >
                          <div className="min-w-0 pr-3 sm:pr-6">
                            <p className="truncate text-sm font-medium text-[#eef2ff] sm:text-[18px]">
                              {satellite.name}
                            </p>
                            <p className="mt-1 text-xs text-[#637196] sm:mt-2 sm:text-sm">
                              NORAD {satellite.noradId}
                              {satellite.country ? ` • ${satellite.country}` : ''}
                              {satellite.purpose ? ` • ${satellite.purpose}` : ''}
                            </p>
                          </div>

                          <div className="pr-3 sm:pr-5">
                            <span
                              className="inline-flex rounded-full border px-2 py-1 text-xs font-medium sm:px-3 sm:text-sm"
                              style={{
                                color: getOrbitTypeColor(satellite.orbitType),
                                borderColor: `${getOrbitTypeColor(satellite.orbitType)}30`,
                                backgroundColor: `${getOrbitTypeColor(satellite.orbitType)}12`,
                              }}
                            >
                              {getOrbitTypeLabel(satellite.orbitType)}
                            </span>
                          </div>

                          <span className="text-xs font-medium text-[#eef2ff] sm:text-base">
                            {formatAltitude(satellite.altitude)}
                          </span>
                          <span className="text-xs font-medium text-[#eef2ff] sm:text-base">
                            {formatDegree(satellite.inclination)}
                          </span>
                          <span className="text-xs font-medium text-[#eef2ff] sm:text-base">
                            {formatPeriod(satellite.period)}
                          </span>
                          <span className="text-xs font-medium text-[#eef2ff] sm:text-base">
                            {formatVelocity(satellite.velocity)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
