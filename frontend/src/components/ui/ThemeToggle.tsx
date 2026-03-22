'use client';

import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';

export default function ThemeToggle() {
  const isDark = useThemeStore((s) => s.isDark);
  const toggle = useThemeStore((s) => s.toggle);

  return (
    <button
      onClick={toggle}
      className="premium-icon-button flex items-center gap-1.5 px-2 py-1.5 rounded-[16px] transition-all duration-300"
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
    >
      <div className="relative w-10 h-5">
        {/* Track */}
        <div
          className={`absolute inset-0 rounded-full transition-colors duration-300 ${
            isDark ? 'bg-accent-cyan/20 border border-accent-cyan/30' : 'bg-amber-400/20 border border-amber-400/30'
          }`}
        />
        {/* Thumb */}
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-300 shadow-md ${
            isDark
              ? 'left-0.5 bg-accent-cyan shadow-accent-cyan/30'
              : 'left-[22px] bg-amber-400 shadow-amber-400/30'
          }`}
        />
      </div>
      <span className="text-[11px] text-[#94a3c0] font-medium uppercase tracking-wider select-none">
        {isDark ? <Moon size={14} className="text-accent-cyan" /> : <Sun size={14} className="text-amber-400" />}
      </span>
    </button>
  );
}
