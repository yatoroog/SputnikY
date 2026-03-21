'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Clock,
} from 'lucide-react';
import { useTimeControl } from '@/hooks/useTimeControl';
import { formatTimeUTC, formatDateUTC, cn } from '@/lib/utils';

const SPEED_OPTIONS = [1, 2, 5, 10, 50, 100, 1000];

export default function TimelineControl() {
  const [isMounted, setIsMounted] = useState(false);
  const {
    currentTime,
    isPlaying,
    speed,
    isRealTime,
    togglePlay,
    setSpeed,
    stepForward,
    stepBackward,
    resetToRealTime,
  } = useTimeControl();

  const handleSpeedChange = useCallback(
    (newSpeed: number) => {
      setSpeed(newSpeed);
    },
    [setSpeed]
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <div className="panel-base flex w-[min(680px,calc(100vw-2rem))] flex-wrap items-center justify-center gap-2 px-2.5 py-2 sm:px-3 lg:flex-nowrap lg:justify-between">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      {/* Time display */}
      <div className="flex min-w-[118px] items-center gap-2">
        <div className="premium-icon-button flex h-8 w-8 items-center justify-center rounded-2xl text-accent-cyan">
          <Clock size={13} />
        </div>
        <div className="flex flex-col">
          <span
            className="font-mono text-[18px] font-medium leading-none text-[#f2f6ff]"
            suppressHydrationWarning
          >
            {isMounted ? formatTimeUTC(currentTime) : '--:--:--'}
          </span>
          <span
            className="mt-1 font-mono text-[8px] uppercase tracking-[0.18em] text-[#8a98b7]"
            suppressHydrationWarning
          >
            UTC • {isMounted ? formatDateUTC(currentTime) : '-- --- ----'}
          </span>
        </div>
      </div>

      {/* Separator */}
      <div className="premium-divider hidden h-9 w-px lg:block" />

      {/* Playback controls */}
      <div className="flex items-center gap-1 rounded-[16px] border border-white/6 bg-black/10 p-1">
        <button
          onClick={stepBackward}
          className="premium-icon-button flex h-8 w-8 items-center justify-center rounded-2xl text-[#8a98b7] transition-all duration-300 hover:-translate-y-0.5 hover:text-[#eef4ff]"
          title={'\u041D\u0430\u0437\u0430\u0434 (1 \u043C\u0438\u043D)'}
        >
          <SkipBack size={13} />
        </button>
        <button
          onClick={togglePlay}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-2xl transition-all duration-300',
            isPlaying
              ? 'bg-[linear-gradient(180deg,rgba(12,82,110,0.95),rgba(7,49,77,0.94))] text-[#82ecff] shadow-[0_14px_30px_rgba(6,182,212,0.18)]'
              : 'premium-icon-button text-[#8a98b7] hover:-translate-y-0.5 hover:text-[#eef4ff]'
          )}
          title={isPlaying ? '\u041F\u0430\u0443\u0437\u0430' : '\u0412\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u0435'}
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button
          onClick={stepForward}
          className="premium-icon-button flex h-8 w-8 items-center justify-center rounded-2xl text-[#8a98b7] transition-all duration-300 hover:-translate-y-0.5 hover:text-[#eef4ff]"
          title={'\u0412\u043F\u0435\u0440\u0451\u0434 (1 \u043C\u0438\u043D)'}
        >
          <SkipForward size={13} />
        </button>
      </div>

      {/* Separator */}
      <div className="premium-divider hidden h-9 w-px lg:block" />

      {/* Speed selector */}
      <div className="flex items-center gap-1 rounded-[16px] border border-white/6 bg-black/10 p-1">
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => handleSpeedChange(s)}
            className={cn(
              'rounded-2xl px-1.5 py-1.5 text-[9px] font-semibold tracking-[0.1em] transition-all duration-300',
              speed === s
                ? 'border border-[#598fff]/36 bg-[linear-gradient(180deg,rgba(31,69,139,0.96),rgba(16,35,77,0.94))] text-[#b9d0ff] shadow-[0_14px_28px_rgba(59,130,246,0.16)]'
                : 'text-[#8a98b7] hover:bg-white/[0.04] hover:text-[#eef4ff]'
            )}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="premium-divider hidden h-9 w-px lg:block" />

      {/* Real-time button */}
      <button
        onClick={resetToRealTime}
        className={cn(
          'flex min-w-[118px] items-center justify-center gap-2 rounded-[16px] px-2.5 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] transition-all duration-300',
          isRealTime
            ? 'border border-[#4fdcf6]/32 bg-[linear-gradient(180deg,rgba(10,86,114,0.96),rgba(8,50,78,0.94))] text-[#82ecff] shadow-[0_16px_32px_rgba(6,182,212,0.16)]'
            : 'premium-icon-button text-[#8a98b7] hover:-translate-y-0.5 hover:text-[#82ecff]'
        )}
      >
        <div
          className={cn(
            'h-2 w-2 rounded-full',
            isRealTime ? 'bg-accent-cyan animate-pulse shadow-[0_0_14px_rgba(34,211,238,0.7)]' : 'bg-[#9ca3af]'
          )}
        />
        {'\u0420\u0435\u0430\u043B\u044C\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F'}
      </button>
    </div>
  );
}
