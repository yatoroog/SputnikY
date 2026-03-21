'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useFilterStore } from '@/store/filterStore';

export default function SearchBar() {
  const setSearch = useFilterStore((state) => state.setSearch);
  const storeSearch = useFilterStore((state) => state.search);
  const [localValue, setLocalValue] = useState(storeSearch);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      setLocalValue(value);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        setSearch(value);
      }, 300);
    },
    [setSearch]
  );

  const handleClear = useCallback(() => {
    setLocalValue('');
    setSearch('');
  }, [setSearch]);

  useEffect(() => {
    setLocalValue(storeSearch);
  }, [storeSearch]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="premium-field group relative overflow-hidden rounded-2xl">
      {/* Subtle glow on focus */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.08),transparent_70%)] opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
      <Search
        size={15}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4a5578] transition-colors duration-200 group-focus-within:text-accent-cyan"
      />
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={'Поиск спутников...'}
        className="w-full rounded-2xl bg-transparent py-3.5 pl-11 pr-10 text-[14px] text-[#eef2ff] placeholder-[#4a5578] focus:outline-none"
      />
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#4a5578] transition-colors duration-200 hover:text-white"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
