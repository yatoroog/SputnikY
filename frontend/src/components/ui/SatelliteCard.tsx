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
    <div className="panel-base w-[360px] h-fit max-h-full overflow-y-auto animate-slide-in-right">
      {/* Header */}
      <div className="p-4 border-b border-cosmos-border">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-[#e5e7eb] truncate">
              {sat.name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-[#9ca3af]">NORAD {sat.noradId}</span>
              <span
                className="badge"
                style={{
                  backgroundColor: `${orbitColor}20`,
                  color: orbitColor,
                  border: `1px solid ${orbitColor}40`,
                }}
              >
                {sat.orbitType}
              </span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-[#9ca3af] hover:text-[#e5e7eb] transition-colors duration-200 flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {sat.purpose && (
          <p className="text-xs text-[#9ca3af] mt-2">
            {'\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435: '}{sat.purpose}
          </p>
        )}
      </div>

      {/* Parameters */}
      <div className="p-4">
        <h3 className="text-xs text-[#9ca3af] uppercase tracking-wider mb-3">
          {'\u041F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B'}
        </h3>
        <div className="space-y-3">
          {params.map((param) => {
            const Icon = param.icon;
            return (
              <div key={param.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-accent-cyan flex-shrink-0" />
                  <span className="text-sm text-[#9ca3af]">{param.label}</span>
                </div>
                <span className="text-sm text-[#e5e7eb] font-medium">{param.value}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Orbit indicator */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-accent-cyan/5 border border-accent-cyan/20">
          <div
            className="w-2 h-2 rounded-full animate-pulse-glow"
            style={{ backgroundColor: '#06b6d4' }}
          />
          <span className="text-xs text-accent-cyan">
            {'\u041E\u0440\u0431\u0438\u0442\u0430 \u043E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u0435\u0442\u0441\u044F \u043D\u0430 \u0433\u043B\u043E\u0431\u0443\u0441\u0435'}
          </span>
        </div>
      </div>
    </div>
  );
}
