'use client';

import { useCallback } from 'react';
import { X, Globe, MapPin, Gauge, Clock, Compass, Navigation } from 'lucide-react';
import { useSatelliteStore } from '@/store/satelliteStore';
import {
  formatCoordinate,
  formatAltitude,
  formatPeriod,
  getOrbitTypeColor,
  getOrbitTypeLabel,
} from '@/lib/utils';

export default function SatelliteCard() {
  const selectedSatellite = useSatelliteStore((state) => state.selectedSatellite);
  const selectSatellite = useSatelliteStore((state) => state.selectSatellite);

  const handleClose = useCallback(() => {
    selectSatellite(null);
  }, [selectSatellite]);

  if (!selectedSatellite) return null;

  const sat = selectedSatellite;
  const orbitColor = getOrbitTypeColor(sat.orbitType);

  const params = [
    {
      icon: Globe,
      label: '\u0421\u0442\u0440\u0430\u043D\u0430',
      value: sat.country || '\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E',
    },
    {
      icon: Navigation,
      label: '\u0422\u0438\u043F \u043E\u0440\u0431\u0438\u0442\u044B',
      value: getOrbitTypeLabel(sat.orbitType),
    },
    {
      icon: MapPin,
      label: '\u0412\u044B\u0441\u043E\u0442\u0430',
      value: formatAltitude(sat.altitude),
    },
    {
      icon: Clock,
      label: '\u041F\u0435\u0440\u0438\u043E\u0434',
      value: formatPeriod(sat.period),
    },
    {
      icon: Compass,
      label: '\u041D\u0430\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435',
      value: `${sat.inclination.toFixed(1)}\u00B0`,
    },
    {
      icon: MapPin,
      label: '\u041A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B',
      value: formatCoordinate(sat.latitude, sat.longitude),
    },
    {
      icon: Gauge,
      label: '\u0421\u043A\u043E\u0440\u043E\u0441\u0442\u044C',
      value: `${sat.velocity.toFixed(1)} \u043A\u043C/\u0441`,
    },
  ];

  return (
    <div className="panel-base glass-shimmer w-[360px] h-fit max-h-full overflow-y-auto animate-slide-in-right">
      {/* Top specular line */}
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent z-10" />

      {/* Header */}
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
            {'\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435: '}{sat.purpose}
          </p>
        )}
      </div>

      {/* Glass divider */}
      <div className="mx-5 h-px glass-divider-h" />

      {/* Parameters */}
      <div className="p-5">
        <h3 className="text-[11px] text-[#637196] uppercase tracking-[0.24em] mb-4">
          {'\u041F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B'}
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

      {/* Glass divider */}
      <div className="mx-5 h-px glass-divider-h" />

      {/* Orbit indicator */}
      <div className="p-5">
        <div className="flex items-center gap-2.5 py-2.5 px-4 rounded-2xl bg-accent-cyan/5 border border-accent-cyan/15">
          <div
            className="w-2 h-2 rounded-full animate-pulse-glow"
            style={{ backgroundColor: '#06b6d4' }}
          />
          <span className="text-xs text-accent-cyan/80">
            {'\u041E\u0440\u0431\u0438\u0442\u0430 \u043E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u0435\u0442\u0441\u044F \u043D\u0430 \u0433\u043B\u043E\u0431\u0443\u0441\u0435'}
          </span>
        </div>
      </div>
    </div>
  );
}
