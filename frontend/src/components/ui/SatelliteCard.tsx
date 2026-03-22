'use client';

import { useCallback, useState, useEffect } from 'react';
import { X, Globe, MapPin, Gauge, Clock, Compass, Navigation, Crosshair, ShieldAlert, Loader2 } from 'lucide-react';
import { useSatelliteStore } from '@/store/satelliteStore';
import { fetchConjunctions } from '@/lib/api';
import {
  cn,
  formatCoordinate,
  formatAltitude,
  formatPeriod,
  getOrbitTypeColor,
  getOrbitTypeLabel,
} from '@/lib/utils';
import type { Conjunction } from '@/types';

interface SatelliteCardProps {
  className?: string;
}

export default function SatelliteCard({ className }: SatelliteCardProps) {
  const selectedSatellite = useSatelliteStore((state) => state.selectedSatellite);
  const selectSatellite = useSatelliteStore((state) => state.selectSatellite);
  const isCloseUp = useSatelliteStore((state) => state.isCloseUp);
  const setCloseUp = useSatelliteStore((state) => state.setCloseUp);
  const [conjunctions, setConjunctions] = useState<Conjunction[]>([]);
  const [conjLoading, setConjLoading] = useState(false);
  const [showConj, setShowConj] = useState(false);

  const handleClose = useCallback(() => {
    selectSatellite(null);
  }, [selectSatellite]);

  useEffect(() => {
    setConjunctions([]);
    setShowConj(false);
  }, [selectedSatellite?.id]);

  const loadConjunctions = useCallback(async () => {
    if (!selectedSatellite) return;
    setShowConj(true);
    setConjLoading(true);
    try {
      const data = await fetchConjunctions(selectedSatellite.id, 24, 50);
      setConjunctions(data);
    } catch {
      setConjunctions([]);
    } finally {
      setConjLoading(false);
    }
  }, [selectedSatellite]);

  if (!selectedSatellite) return null;

  const sat = selectedSatellite;
  const orbitColor = getOrbitTypeColor(sat.orbitType);

  const params = [
    {
      icon: Globe,
      label: 'Владелец / страна',
      value: sat.country || 'Неизвестно',
    },
    {
      icon: Navigation,
      label: 'Тип орбиты',
      value: getOrbitTypeLabel(sat.orbitType),
    },
    {
      icon: MapPin,
      label: 'Высота',
      value: formatAltitude(sat.altitude),
    },
    {
      icon: Clock,
      label: 'Период',
      value: formatPeriod(sat.period),
    },
    {
      icon: Compass,
      label: 'Наклонение',
      value: `${sat.inclination.toFixed(1)}°`,
    },
    {
      icon: MapPin,
      label: 'Координаты',
      value: formatCoordinate(sat.latitude, sat.longitude),
    },
    {
      icon: Gauge,
      label: 'Скорость',
      value: `${sat.velocity.toFixed(1)} км/с`,
    },
  ];

  const formatDateTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className={cn(
        'panel-base glass-shimmer h-fit max-h-full w-[min(360px,calc(100vw-1rem))] overflow-y-auto animate-slide-in-right',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent z-10" />

      <div className="relative p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">
              {sat.name}
            </h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-[#637196]">NORAD {sat.noradId}</span>
              <span
                className="badge"
                style={{
                  backgroundColor: `${orbitColor}15`,
                  color: orbitColor,
                  border: `1px solid ${orbitColor}30`,
                }}
              >
                {sat.orbitType}
              </span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="premium-icon-button flex h-8 w-8 items-center justify-center rounded-xl text-[#637196] hover:text-white transition-all duration-200 flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {sat.purpose && (
          <p className="text-xs text-[#94a3c0] mt-3">
            {'Назначение: '}{sat.purpose}
          </p>
        )}
      </div>

      <div className="mx-5 h-px glass-divider-h" />

      <div className="p-5">
        <h3 className="text-[11px] text-[#637196] uppercase tracking-[0.24em] mb-4">
          Параметры
        </h3>
        <div className="space-y-3.5">
          {params.map((param) => {
            const Icon = param.icon;
            return (
              <div key={param.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">
                    <Icon size={13} className="text-accent-cyan" />
                  </div>
                  <span className="text-sm text-[#94a3c0]">{param.label}</span>
                </div>
                <span className="text-sm text-[#eef2ff] font-medium">{param.value}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mx-5 h-px glass-divider-h" />

      {/* Conjunction Detection */}
      <div className="p-5">
        {!showConj ? (
          <button
            type="button"
            onClick={loadConjunctions}
            className="flex w-full items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/[0.08] transition-all duration-300"
          >
            <ShieldAlert size={14} className="text-[#637196]" />
            <span className="text-xs font-medium uppercase tracking-wider text-[#94a3c0]">
              Проверить сближения
            </span>
          </button>
        ) : conjLoading ? (
          <div className="flex items-center justify-center gap-2 py-3">
            <Loader2 size={16} className="text-accent-cyan animate-spin" />
            <span className="text-xs text-[#637196]">Анализ сближений (24ч)...</span>
          </div>
        ) : conjunctions.length === 0 ? (
          <div className="text-center py-2">
            <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-400">
              <ShieldAlert size={13} />
              <span>Сближений не обнаружено (24ч, &lt;50 км)</span>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <ShieldAlert size={13} className="text-amber-400" />
              <span className="text-[11px] uppercase tracking-wider text-amber-400 font-medium">
                {conjunctions.length} {conjunctions.length === 1 ? 'сближение' : conjunctions.length < 5 ? 'сближения' : 'сближений'}
              </span>
            </div>
            <div className="space-y-2">
              {conjunctions.slice(0, 5).map((conj, i) => (
                <div
                  key={`${conj.satellite2Id}-${conj.closestAt}-${i}`}
                  className="glass-surface rounded-xl p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[#eef2ff] truncate">{conj.satellite2Name}</span>
                    <span className={cn(
                      'text-[10px] font-semibold',
                      conj.minDistanceKm < 10 ? 'text-red-400' : conj.minDistanceKm < 25 ? 'text-amber-400' : 'text-yellow-400'
                    )}>
                      {conj.minDistanceKm.toFixed(1)} км
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-[#4a5578]">
                    {formatDateTime(conj.closestAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mx-5 h-px glass-divider-h" />

      <div className="p-5">
        <button
          onClick={() => setCloseUp(!isCloseUp)}
          className={`flex w-full items-center gap-3 py-3 px-4 rounded-2xl transition-all duration-300 ${
            isCloseUp
              ? 'bg-accent-cyan/15 border border-accent-cyan/30'
              : 'bg-white/5 border border-white/10 hover:bg-white/[0.08]'
          }`}
        >
          <div className="relative w-10 h-5 flex-shrink-0">
            <div
              className={`absolute inset-0 rounded-full transition-colors duration-300 ${
                isCloseUp
                  ? 'bg-accent-cyan/25 border border-accent-cyan/40'
                  : 'bg-white/10 border border-white/15'
              }`}
            />
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-300 shadow-md ${
                isCloseUp
                  ? 'left-[22px] bg-accent-cyan shadow-accent-cyan/40'
                  : 'left-0.5 bg-[#637196]'
              }`}
            />
          </div>
          <div className="flex items-center gap-2">
            <Crosshair
              size={14}
              className={isCloseUp ? 'text-accent-cyan' : 'text-[#637196]'}
            />
            <span
              className={`text-xs font-medium uppercase tracking-wider ${
                isCloseUp ? 'text-accent-cyan' : 'text-[#94a3c0]'
              }`}
            >
              {isCloseUp ? 'Отдалить' : 'Приблизить'}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
