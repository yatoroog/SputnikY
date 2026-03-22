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
  'Russia/CIS': '\u0420\u043E\u0441\u0441\u0438\u044F / \u0421\u041D\u0413',
  China: '\u041A\u0438\u0442\u0430\u0439',
  ESA: 'ESA',
  EUMETSAT: 'EUMETSAT',
  EUTELSAT: 'EUTELSAT',
  Europe: '\u0415\u0432\u0440\u043E\u043F\u0430',
  India: '\u0418\u043D\u0434\u0438\u044F',
  Japan: '\u042F\u043F\u043E\u043D\u0438\u044F',
  'South Korea': '\u042E\u0436\u043D\u0430\u044F \u041A\u043E\u0440\u0435\u044F',
  Taiwan: '\u0422\u0430\u0439\u0432\u0430\u043D\u044C',
  'United Kingdom': '\u0412\u0435\u043B\u0438\u043A\u043E\u0431\u0440\u0438\u0442\u0430\u043D\u0438\u044F',
  ORBCOMM: 'ORBCOMM',
  Iridium: 'Iridium',
  Globalstar: 'Globalstar',
  SES: 'SES',
  O3b: 'O3b',
  UAE: '\u041E\u0410\u042D',
  International: '\u041C\u0435\u0436\u0434\u0443\u043D\u0430\u0440\u043E\u0434\u043D\u044B\u0435',
  Unknown: '\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E',
};

const PURPOSE_LABELS: Record<string, string> = {
  Communications: '\u0421\u0432\u044f\u0437\u044c',
  Navigation: '\u041d\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044f',
  Weather: '\u041f\u043e\u0433\u043e\u0434\u0430',
  'Space Station': '\u041a\u043e\u0441\u043c\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u0441\u0442\u0430\u043d\u0446\u0438\u044f',
  Science: '\u041d\u0430\u0443\u043a\u0430',
  'Amateur Radio': '\u041b\u044e\u0431\u0438\u0442\u0435\u043b\u044c\u0441\u043a\u0430\u044f \u0440\u0430\u0434\u0438\u043e\u0441\u0432\u044f\u0437\u044c',
  Military: '\u0412\u043e\u0435\u043d\u043d\u044b\u0435',
  Other: '\u0414\u0440\u0443\u0433\u043e\u0435',
};

function buildSelectOptions(
  values: string[],
  selectedValue: string,
  allLabel: string,
  labels?: Record<string, string>
) {
  const uniqueValues = new Set(values.filter(Boolean));
  if (selectedValue) {
    uniqueValues.add(selectedValue);
  }

  const sortedValues = Array.from(uniqueValues).sort((left, right) =>
    (labels?.[left] ?? left).localeCompare(labels?.[right] ?? right, 'ru')
  );

  return [
    { value: '', label: allLabel },
    ...sortedValues.map((value) => ({
      value,
      label: labels?.[value] ?? value,
    })),
  ];
}

export default function FilterPanel() {
  const { orbitType, country, purpose, setOrbitType, setCountry, setPurpose, resetFilters } =
    useFilterStore();
  const filterFacets = useSatelliteStore((state) => state.filterFacets);
  const satellites = useSatelliteStore((state) => state.satellites);

  const hasActiveFilters = orbitType || country || purpose;
  const countryOptions = useMemo(() => {
    const countryValues =
      filterFacets?.countries && filterFacets.countries.length > 0
        ? filterFacets.countries
        : satellites.map((satellite) => satellite.country);

    return buildSelectOptions(
      countryValues,
      country,
      '\u0412\u0441\u0435 \u0432\u043b\u0430\u0434\u0435\u043b\u044c\u0446\u044b / \u0441\u0442\u0440\u0430\u043d\u044b',
      COUNTRY_LABELS
    );
  }, [country, filterFacets, satellites]);

  const purposeOptions = useMemo(() => {
    const purposeValues =
      filterFacets?.purposes && filterFacets.purposes.length > 0
        ? filterFacets.purposes
        : satellites.map((satellite) => satellite.purpose);

    return buildSelectOptions(
      purposeValues,
      purpose,
      '\u0412\u0441\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f',
      PURPOSE_LABELS
    );
  }, [purpose, filterFacets, satellites]);

  const handleResetFilters = useCallback(() => {
    resetFilters();
  }, [resetFilters]);

  return (
    <div className="space-y-5">
      {/* Orbit type chips */}
      <div>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.28em] text-[#637196]">
          {'Тип орбиты'}
        </p>
        <div className="flex flex-wrap gap-2">
          {ORBIT_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => setOrbitType(type.value)}
              className={cn(
                'premium-chip rounded-full px-4 py-2 text-xs font-semibold tracking-[0.14em] transition-all duration-300',
                orbitType === type.value
                  ? 'bg-accent-cyan/12 border-accent-cyan/25 text-accent-cyan shadow-[0_0_16px_rgba(6,182,212,0.08)]'
                  : 'text-[#637196] hover:border-white/15 hover:text-[#eef2ff] hover:bg-white/[0.06]'
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Country dropdown */}
      <div>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.28em] text-[#637196]">
          {'Владелец / страна'}
        </p>
        <div className="premium-field rounded-2xl">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full cursor-pointer appearance-none rounded-2xl bg-transparent py-3 pl-4 pr-11 text-[14px] text-[#eef2ff] focus:outline-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23637196' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
              backgroundPosition: 'right 14px center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: '18px',
            }}
          >
            {countryOptions.map((c) => (
              <option key={c.value} value={c.value} className="bg-[#0d1120]">
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Purpose dropdown */}
      <div>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.28em] text-[#637196]">
          {'Назначение'}
        </p>
        <div className="premium-field rounded-2xl">
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="w-full cursor-pointer appearance-none rounded-2xl bg-transparent py-3 pl-4 pr-11 text-[14px] text-[#eef2ff] focus:outline-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23637196' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
              backgroundPosition: 'right 14px center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: '18px',
            }}
          >
            {purposeOptions.map((option) => (
              <option key={option.value} value={option.value} className="bg-[#0d1120]">
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Reset filters */}
      {hasActiveFilters && (
        <button
          onClick={handleResetFilters}
          className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[#637196] transition-all duration-300 hover:border-accent-cyan/20 hover:text-accent-cyan hover:bg-accent-cyan/5"
        >
          <RotateCcw size={12} />
          {'Сбросить фильтры'}
        </button>
      )}
    </div>
  );
}
