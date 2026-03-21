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
    <div className="premium-field group relative overflow-hidden rounded-[18px]">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.12),transparent_70%)] opacity-80" />
      <Search
        size={16}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7887a3] transition-colors duration-200 group-focus-within:text-[#7fe8ff]"
      />
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={'\u041F\u043E\u0438\u0441\u043A \u0441\u043F\u0443\u0442\u043D\u0438\u043A\u043E\u0432...'}
        className="w-full rounded-[18px] bg-transparent py-4 pl-12 pr-11 text-[15px] text-[#eef4ff] placeholder-[#7f8ca7]/70 focus:outline-none"
      />
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7f8ca7] transition-colors duration-200 hover:text-[#eef4ff]"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
