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
    <div className="space-y-5">
      {/* Orbit type chips */}
      <div>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.28em] text-[#7f8ca7]">
          {'\u0422\u0438\u043F \u043E\u0440\u0431\u0438\u0442\u044B'}
        </p>
        <div className="flex flex-wrap gap-2">
          {ORBIT_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => setOrbitType(type.value)}
              className={cn(
                'premium-chip rounded-full px-4 py-2 text-xs font-semibold tracking-[0.16em] transition-all duration-300',
                orbitType === type.value
                  ? 'border-[#4fdcf6]/40 bg-[linear-gradient(180deg,rgba(10,82,112,0.95),rgba(8,48,76,0.92))] text-[#82ecff] shadow-[0_14px_30px_rgba(6,182,212,0.14)]'
                  : 'text-[#7f8ca7] hover:border-[#4fdcf6]/25 hover:text-[#eef4ff]'
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Country dropdown */}
      <div>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.28em] text-[#7f8ca7]">
          {'\u0421\u0442\u0440\u0430\u043D\u0430'}
        </p>
        <div className="premium-field rounded-[18px]">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full cursor-pointer appearance-none rounded-[18px] bg-transparent py-3.5 pl-4 pr-11 text-[15px] text-[#eef4ff] focus:outline-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%237f8ca7' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
              backgroundPosition: 'right 14px center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: '18px',
            }}
          >
            {countryOptions.map((c) => (
              <option key={c.value} value={c.value} className="bg-cosmos-surface">
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Reset filters */}
      {hasActiveFilters && (
        <button
          onClick={handleResetFilters}
          className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-[#8a98b7] transition-all duration-300 hover:border-[#4fdcf6]/25 hover:text-[#82ecff]"
        >
          <RotateCcw size={12} />
          {'\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0444\u0438\u043B\u044C\u0442\u0440\u044B'}
        </button>
      )}
    </div>
  );
}
