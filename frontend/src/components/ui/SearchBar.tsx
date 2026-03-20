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
    <div className="relative">
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]"
      />
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={'\u041F\u043E\u0438\u0441\u043A \u0441\u043F\u0443\u0442\u043D\u0438\u043A\u043E\u0432...'}
        className="w-full bg-cosmos-surface/50 border border-cosmos-border rounded-lg py-2 pl-9 pr-9 text-sm text-[#e5e7eb] placeholder-[#9ca3af]/60 focus:outline-none focus:border-accent-cyan/40 transition-colors duration-200"
      />
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#e5e7eb] transition-colors duration-200"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
