'use client';

import { useCallback, useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { useFilterStore } from '@/store/filterStore';
import { useSatelliteStore } from '@/store/satelliteStore';
import { cn } from '@/lib/utils';

const ORBIT_TYPES = [
  { value: '', label: '\u0412\u0441\u0435' },
  { value: 'LEO', label: 'LEO' },
  { value: 'MEO', label: 'MEO' },
  { value: 'GEO', label: 'GEO' },
  { value: 'HEO', label: 'HEO' },
];

const COUNTRY_LABELS: Record<string, string> = {
  USA: '\u0421\u0428\u0410',
  Russia: '\u0420\u043E\u0441\u0441\u0438\u044F',
  China: '\u041A\u0438\u0442\u0430\u0439',
  Europe: '\u0415\u0432\u0440\u043E\u043F\u0430',
  India: '\u0418\u043D\u0434\u0438\u044F',
  Japan: '\u042F\u043F\u043E\u043D\u0438\u044F',
  International: '\u041C\u0435\u0436\u0434\u0443\u043D\u0430\u0440\u043E\u0434\u043D\u044B\u0435',
  Unknown: '\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E',
};

export default function FilterPanel() {
  const { orbitType, country, setOrbitType, setCountry, resetFilters } =
    useFilterStore();
  const satellites = useSatelliteStore((state) => state.satellites);

  const hasActiveFilters = orbitType || country;
  const countryOptions = useMemo(() => {
    const countries = Array.from(
      new Set(satellites.map((satellite) => satellite.country).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right, 'ru'));

    return [
      { value: '', label: '\u0412\u0441\u0435 \u0441\u0442\u0440\u0430\u043D\u044B' },
      ...countries.map((value) => ({
        value,
        label: COUNTRY_LABELS[value] ?? value,
      })),
    ];
  }, [satellites]);

  const handleResetFilters = useCallback(() => {
    resetFilters();
  }, [resetFilters]);

  return (
    <div className="space-y-3">
      {/* Orbit type chips */}
      <div>
        <p className="text-xs text-[#9ca3af] mb-2 uppercase tracking-wider">
          {'\u0422\u0438\u043F \u043E\u0440\u0431\u0438\u0442\u044B'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ORBIT_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => setOrbitType(type.value)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 border',
                orbitType === type.value
                  ? 'bg-accent-cyan/20 border-accent-cyan/50 text-accent-cyan'
                  : 'bg-cosmos-surface/30 border-cosmos-border text-[#9ca3af] hover:border-accent-cyan/30 hover:text-[#e5e7eb]'
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Country dropdown */}
      <div>
        <p className="text-xs text-[#9ca3af] mb-2 uppercase tracking-wider">
          {'\u0421\u0442\u0440\u0430\u043D\u0430'}
        </p>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="w-full bg-cosmos-surface/50 border border-cosmos-border rounded-lg py-2 px-3 text-sm text-[#e5e7eb] focus:outline-none focus:border-accent-cyan/40 transition-colors duration-200 appearance-none cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%239ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
            backgroundPosition: 'right 8px center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '20px',
          }}
        >
          {countryOptions.map((c) => (
            <option key={c.value} value={c.value} className="bg-cosmos-surface">
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Reset filters */}
      {hasActiveFilters && (
        <button
          onClick={handleResetFilters}
          className="flex items-center gap-1.5 text-xs text-[#9ca3af] hover:text-accent-cyan transition-colors duration-200"
        >
          <RotateCcw size={12} />
          {'\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0444\u0438\u043B\u044C\u0442\u0440\u044B'}
        </button>
      )}
    </div>
  );
}
