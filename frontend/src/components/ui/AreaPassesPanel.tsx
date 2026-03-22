'use client';

import { useEffect, useState, useCallback } from 'react';
import { Clock, MapPin, Radio, X, FileText, FileJson, Calendar, Radar, Eye } from 'lucide-react';
import { fetchAreaPasses } from '@/lib/api';
import { cn, getOrbitTypeColor } from '@/lib/utils';
import { useSatelliteStore } from '@/store/satelliteStore';
import type { AreaPass } from '@/types';
import PolarPlot from './PolarPlot';

interface AreaPassesPanelProps {
  className?: string;
}

function getElevationQuality(maxElevation: number): { color: string; label: string } {
  if (maxElevation >= 60) return { color: '#22c55e', label: 'Отлично' };
  if (maxElevation >= 30) return { color: '#f59e0b', label: 'Хорошо' };
  return { color: '#ef4444', label: 'Слабый' };
}

function formatAzimuth(degrees: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16;
  return `${degrees.toFixed(0)}° ${dirs[idx]}`;
}

function generateCSV(passes: AreaPass[], lat: number, lng: number): string {
  const header = 'Satellite,NORAD ID,Orbit Type,AOS Time,AOS Azimuth,TCA Time,TCA Elevation,TCA Azimuth,LOS Time,LOS Azimuth,Max Elevation,Duration (s)';
  const rows = passes.map((p) => {
    const aosDate = new Date(p.aos * 1000).toISOString();
    const tcaDate = p.tca ? new Date(p.tca * 1000).toISOString() : '';
    const losDate = new Date(p.los * 1000).toISOString();
    return `"${p.satelliteName}","${p.satelliteId}","${p.orbitType}","${aosDate}",${p.aosAzimuth},"${tcaDate}",${p.tcaElevation},${p.tcaAzimuth},"${losDate}",${p.losAzimuth},${p.maxElevation},${p.duration}`;
  });
  return `# Observer: ${lat.toFixed(4)}, ${lng.toFixed(4)}\n${header}\n${rows.join('\n')}`;
}

function generateICS(passes: AreaPass[]): string {
  const events = passes.map((p) => {
    const dtStart = new Date(p.aos * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const dtEnd = new Date(p.los * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const desc = `Max Elevation: ${p.maxElevation.toFixed(1)}°\\nAOS Azimuth: ${p.aosAzimuth.toFixed(0)}°\\nLOS Azimuth: ${p.losAzimuth.toFixed(0)}°\\nDuration: ${Math.floor(p.duration / 60)}m ${p.duration % 60}s`;
    return `BEGIN:VEVENT\nDTSTART:${dtStart}\nDTEND:${dtEnd}\nSUMMARY:Pass: ${p.satelliteName}\nDESCRIPTION:${desc}\nEND:VEVENT`;
  });
  return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//SputnikX//Pass Planner//RU\n${events.join('\n')}\nEND:VCALENDAR`;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AreaPassesPanel({ className }: AreaPassesPanelProps) {
  const clickedLocation = useSatelliteStore((state) => state.clickedLocation);
  const areaPasses = useSatelliteStore((state) => state.areaPasses);
  const loading = useSatelliteStore((state) => state.areaPassesLoading);
  const setClickedLocation = useSatelliteStore((state) => state.setClickedLocation);
  const setAreaPasses = useSatelliteStore((state) => state.setAreaPasses);
  const setAreaPassesLoading = useSatelliteStore((state) => state.setAreaPassesLoading);
  const [selectedPassIdx, setSelectedPassIdx] = useState<number | null>(null);
  const [polarPlotPass, setPolarPlotPass] = useState<AreaPass | null>(null);
  const groundViewLocation = useSatelliteStore((state) => state.groundViewLocation);
  const setGroundViewLocation = useSatelliteStore((state) => state.setGroundViewLocation);

  useEffect(() => {
    if (!clickedLocation) return;

    let cancelled = false;

    setAreaPassesLoading(true);
    setAreaPasses([]);
    setSelectedPassIdx(null);

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

  const handleExportCSV = useCallback(() => {
    if (!clickedLocation || areaPasses.length === 0) return;
    downloadFile(
      generateCSV(areaPasses, clickedLocation.lat, clickedLocation.lng),
      'satellite-passes.csv',
      'text/csv'
    );
  }, [areaPasses, clickedLocation]);

  const handleExportJSON = useCallback(() => {
    if (!clickedLocation || areaPasses.length === 0) return;
    downloadFile(
      JSON.stringify({ observer: clickedLocation, passes: areaPasses }, null, 2),
      'satellite-passes.json',
      'application/json'
    );
  }, [areaPasses, clickedLocation]);

  const handleExportICS = useCallback(() => {
    if (areaPasses.length === 0) return;
    downloadFile(generateICS(areaPasses), 'satellite-passes.ics', 'text/calendar');
  }, [areaPasses]);

  if (!clickedLocation) return null;

  const formatTime = (ts: number) => {
    const date = new Date(ts * 1000);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
        <button
          type="button"
          onClick={() => {
            if (groundViewLocation && groundViewLocation.lat === clickedLocation.lat && groundViewLocation.lng === clickedLocation.lng) {
              setGroundViewLocation(null);
            } else {
              setGroundViewLocation({ lat: clickedLocation.lat, lng: clickedLocation.lng });
            }
          }}
          className={cn(
            'mt-1.5 flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium transition-colors',
            groundViewLocation ? 'text-accent-cyan bg-accent-cyan/10' : 'text-[#4a5578] hover:text-accent-cyan'
          )}
          title="Вид наблюдателя с Земли (3D)"
        >
          <Eye size={11} />
          {groundViewLocation ? 'Выйти из вида с Земли' : 'Вид с Земли (3D)'}
        </button>
      </div>

      {/* Export buttons */}
      {areaPasses.length > 0 && (
        <>
          <div className="mx-4 h-px glass-divider-h lg:mx-5" />
          <div className="flex items-center gap-1.5 px-4 py-2 lg:px-5">
            <span className="text-[10px] uppercase tracking-wider text-[#4a5578] mr-auto">Экспорт</span>
            <button
              type="button"
              onClick={handleExportCSV}
              className="premium-icon-button flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-[#637196] hover:text-accent-cyan transition-colors"
              title="Экспорт CSV"
            >
              <FileText size={11} />
              CSV
            </button>
            <button
              type="button"
              onClick={handleExportJSON}
              className="premium-icon-button flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-[#637196] hover:text-accent-cyan transition-colors"
              title="Экспорт JSON"
            >
              <FileJson size={11} />
              JSON
            </button>
            <button
              type="button"
              onClick={handleExportICS}
              className="premium-icon-button flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-[#637196] hover:text-accent-cyan transition-colors"
              title="Экспорт iCal"
            >
              <Calendar size={11} />
              iCal
            </button>
          </div>
        </>
      )}

      <div className="mx-4 h-px glass-divider-h lg:mx-5" />

      {/* Polar Plot */}
      {polarPlotPass && clickedLocation && (
        <>
          <div className="mx-4 h-px glass-divider-h lg:mx-5" />
          <div className="px-2 py-2">
            <PolarPlot
              pass={polarPlotPass}
              observerLat={clickedLocation.lat}
              observerLng={clickedLocation.lng}
              onClose={() => setPolarPlotPass(null)}
            />
          </div>
        </>
      )}

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
              const quality = getElevationQuality(pass.maxElevation);
              const isExpanded = selectedPassIdx === index;

              return (
                <div
                  key={`${pass.satelliteId}-${pass.aos}-${index}`}
                  className={cn(
                    'border-b border-white/5 px-4 py-2.5 transition-colors duration-200 cursor-pointer lg:px-5 lg:py-3.5',
                    isExpanded ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
                  )}
                  onClick={() => setSelectedPassIdx(isExpanded ? null : index)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 shrink-0 rounded-full shadow-[0_0_8px_currentColor]"
                          style={{ backgroundColor: quality.color }}
                        />
                        <p className="truncate text-[13px] font-medium text-[#eef2ff] lg:text-sm">
                          {pass.satelliteName}
                        </p>
                      </div>

                      <div className="ml-4 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#637196] lg:mt-1.5 lg:gap-3 lg:text-xs">
                        <span>{formatDate(pass.aos)}</span>
                        <span>
                          {formatTime(pass.aos)} – {formatTime(pass.los)}
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
                      <span
                        className="text-[9px] font-medium lg:text-[10px]"
                        style={{ color: quality.color }}
                      >
                        {pass.maxElevation.toFixed(1)}°
                      </span>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-3 ml-4 space-y-1.5 text-[11px] lg:text-xs animate-fade-in">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="glass-surface rounded-lg p-2 text-center">
                          <div className="text-[9px] uppercase tracking-wider text-[#4a5578] mb-0.5">AOS</div>
                          <div className="text-[#94a3c0] font-medium">{formatTime(pass.aos)}</div>
                          <div className="text-[9px] text-[#4a5578]">{formatAzimuth(pass.aosAzimuth)}</div>
                        </div>
                        <div className="glass-surface rounded-lg p-2 text-center">
                          <div className="text-[9px] uppercase tracking-wider text-[#4a5578] mb-0.5">TCA</div>
                          <div className="text-[#94a3c0] font-medium">{pass.tca ? formatTime(pass.tca) : '—'}</div>
                          <div className="text-[9px] font-medium" style={{ color: quality.color }}>
                            {pass.tcaElevation.toFixed(1)}° ↑
                          </div>
                        </div>
                        <div className="glass-surface rounded-lg p-2 text-center">
                          <div className="text-[9px] uppercase tracking-wider text-[#4a5578] mb-0.5">LOS</div>
                          <div className="text-[#94a3c0] font-medium">{formatTime(pass.los)}</div>
                          <div className="text-[9px] text-[#4a5578]">{formatAzimuth(pass.losAzimuth)}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPolarPlotPass(pass); }}
                        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent-cyan/10 border border-accent-cyan/20 py-1.5 text-[10px] font-medium uppercase tracking-wider text-accent-cyan hover:bg-accent-cyan/20 transition-colors"
                      >
                        <Radar size={12} />
                        Polar Plot
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
