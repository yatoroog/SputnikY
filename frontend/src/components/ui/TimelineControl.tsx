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
      {/* Top specular line */}
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent z-10" />

      {/* Time display */}
      <div className="flex min-w-[118px] items-center gap-2">
        <div className="premium-icon-button flex h-8 w-8 items-center justify-center rounded-xl text-accent-cyan">
          <Clock size={13} />
        </div>
        <div className="flex flex-col">
          <span
            className="font-mono text-[18px] font-medium leading-none text-white"
            suppressHydrationWarning
          >
            {isMounted ? formatTimeUTC(currentTime) : '--:--:--'}
          </span>
          <span
            className="mt-1 font-mono text-[8px] uppercase tracking-[0.18em] text-[#637196]"
            suppressHydrationWarning
          >
            UTC • {isMounted ? formatDateUTC(currentTime) : '-- --- ----'}
          </span>
        </div>
      </div>

      {/* Separator */}
      <div className="premium-divider hidden h-9 w-px lg:block" />

      {/* Playback controls */}
      <div className="flex items-center gap-1 rounded-2xl border border-white/6 bg-white/[0.03] p-1">
        <button
          onClick={stepBackward}
          className="premium-icon-button flex h-8 w-8 items-center justify-center rounded-xl text-[#637196] transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
          title={'Назад (1 мин)'}
        >
          <SkipBack size={13} />
        </button>
        <button
          onClick={togglePlay}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300',
            isPlaying
              ? 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/25 shadow-[0_0_16px_rgba(6,182,212,0.12)]'
              : 'premium-icon-button text-[#637196] hover:-translate-y-0.5 hover:text-white'
          )}
          title={isPlaying ? 'Пауза' : 'Воспроизведение'}
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button
          onClick={stepForward}
          className="premium-icon-button flex h-8 w-8 items-center justify-center rounded-xl text-[#637196] transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
          title={'Вперёд (1 мин)'}
        >
          <SkipForward size={13} />
        </button>
      </div>

      {/* Separator */}
      <div className="premium-divider hidden h-9 w-px lg:block" />

      {/* Speed selector */}
      <div className="flex items-center gap-0.5 rounded-2xl border border-white/6 bg-white/[0.03] p-1">
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => handleSpeedChange(s)}
            className={cn(
              'rounded-xl px-1.5 py-1.5 text-[9px] font-semibold tracking-[0.1em] transition-all duration-300',
              speed === s
                ? 'bg-white/10 text-accent-blue border border-white/12 shadow-[0_0_12px_rgba(59,130,246,0.1)]'
                : 'text-[#637196] hover:bg-white/[0.05] hover:text-[#eef2ff]'
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
          'flex min-w-[118px] items-center justify-center gap-2 rounded-2xl px-2.5 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] transition-all duration-300',
          isRealTime
            ? 'bg-accent-cyan/12 text-accent-cyan border border-accent-cyan/20 shadow-[0_0_20px_rgba(6,182,212,0.1)]'
            : 'premium-icon-button text-[#637196] hover:-translate-y-0.5 hover:text-accent-cyan'
        )}
      >
        <div
          className={cn(
            'h-2 w-2 rounded-full transition-all duration-300',
            isRealTime ? 'bg-accent-cyan animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.6)]' : 'bg-[#4a5578]'
          )}
        />
        {'Реальное время'}
      </button>
    </div>
  );
}
