'use client';

import { useCallback, useEffect, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Clock } from 'lucide-react';
import { useTimeControl } from '@/hooks/useTimeControl';
import { formatTimeUTC, formatDateUTC, cn } from '@/lib/utils';

const SPEED_OPTIONS = [1, 2, 5, 10, 50, 100, 1000];
const MOBILE_SPEED_OPTIONS = [1, 2, 5, 10];

export default function TimelineControl() {
  const [isMounted, setIsMounted] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
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

    if (typeof window === 'undefined') return;

    const syncCompact = () => {
      setIsCompact(window.innerWidth < 640);
    };

    syncCompact();
    window.addEventListener('resize', syncCompact);
    window.addEventListener('orientationchange', syncCompact);

    return () => {
      window.removeEventListener('resize', syncCompact);
      window.removeEventListener('orientationchange', syncCompact);
    };
  }, []);

  if (isCompact) {
    return (
      <div className="panel-base flex w-[calc(100vw-1rem)] max-w-[340px] flex-col items-center gap-2 rounded-[20px] px-2.5 py-2.5">
        <div className="pointer-events-none absolute inset-x-8 top-0 z-10 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="premium-icon-button flex h-8 w-8 items-center justify-center rounded-[16px] text-accent-cyan">
              <Clock size={13} />
            </div>
            <div className="flex flex-col">
              <span
                className="font-mono text-[15px] font-medium leading-none text-white"
                suppressHydrationWarning
              >
                {isMounted ? formatTimeUTC(currentTime) : '--:--:--'}
              </span>
              <span
                className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#637196]"
                suppressHydrationWarning
              >
                UTC • {isMounted ? formatDateUTC(currentTime) : '-- --- ----'}
              </span>
            </div>
          </div>

          <button
            onClick={resetToRealTime}
            className={cn(
              'flex items-center justify-center gap-2 rounded-[16px] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] transition-all duration-300',
              isRealTime
                ? 'border border-accent-cyan/20 bg-accent-cyan/12 text-accent-cyan shadow-[0_0_20px_rgba(6,182,212,0.1)]'
                : 'premium-icon-button text-[#637196] hover:text-accent-cyan'
            )}
          >
            <div
              className={cn(
                'h-2 w-2 rounded-full transition-all duration-300',
                isRealTime
                  ? 'animate-pulse bg-accent-cyan shadow-[0_0_10px_rgba(6,182,212,0.6)]'
                  : 'bg-[#4a5578]'
              )}
            />
            Live
          </button>
        </div>

        <div className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-white/6 bg-white/[0.03] p-1">
          <button
            onClick={stepBackward}
            className="premium-icon-button flex h-7 w-7 items-center justify-center rounded-[14px] text-[#637196] transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
            title="Назад"
          >
            <SkipBack size={13} />
          </button>
          <button
            onClick={togglePlay}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-[14px] transition-all duration-300',
              isPlaying
                ? 'border border-accent-cyan/25 bg-accent-cyan/15 text-accent-cyan shadow-[0_0_16px_rgba(6,182,212,0.12)]'
                : 'premium-icon-button text-[#637196] hover:-translate-y-0.5 hover:text-white'
            )}
            title={isPlaying ? 'Пауза' : 'Воспроизведение'}
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button
            onClick={stepForward}
            className="premium-icon-button flex h-7 w-7 items-center justify-center rounded-[14px] text-[#637196] transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
            title="Вперёд"
          >
            <SkipForward size={13} />
          </button>
        </div>

        <div className="flex w-full items-center justify-between gap-1 rounded-[16px] border border-white/6 bg-white/[0.03] p-1">
          {MOBILE_SPEED_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => handleSpeedChange(option)}
              className={cn(
                'flex-1 rounded-[12px] px-2 py-1.5 text-[9px] font-semibold tracking-[0.06em] transition-all duration-300',
                speed === option
                  ? 'border border-white/12 bg-white/10 text-accent-blue shadow-[0_0_12px_rgba(59,130,246,0.1)]'
                  : 'text-[#637196] hover:bg-white/[0.05] hover:text-[#eef2ff]'
              )}
            >
              {option}x
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="panel-base flex w-[min(680px,calc(100vw-2rem))] flex-wrap items-center justify-center gap-2 px-2.5 py-2 sm:px-3 lg:flex-nowrap lg:justify-between">
      <div className="pointer-events-none absolute inset-x-8 top-0 z-10 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

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

      <div className="premium-divider hidden h-9 w-px lg:block" />

      <button
        onClick={resetToRealTime}
        className={cn(
          'flex min-w-[118px] items-center justify-center gap-2 rounded-2xl px-2.5 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] transition-all duration-300',
          isRealTime
            ? 'border border-accent-cyan/20 bg-accent-cyan/12 text-accent-cyan shadow-[0_0_20px_rgba(6,182,212,0.1)]'
            : 'premium-icon-button text-[#637196] hover:-translate-y-0.5 hover:text-accent-cyan'
        )}
      >
        <div
          className={cn(
            'h-2 w-2 rounded-full transition-all duration-300',
            isRealTime
              ? 'animate-pulse bg-accent-cyan shadow-[0_0_10px_rgba(6,182,212,0.6)]'
              : 'bg-[#4a5578]'
          )}
        />
        Реальное время
      </button>

      <div className="premium-divider hidden h-9 w-px lg:block" />

      <div className="flex items-center gap-1 rounded-2xl border border-white/6 bg-white/[0.03] p-1">
        <button
          onClick={stepBackward}
          className="premium-icon-button flex h-8 w-8 items-center justify-center rounded-xl text-[#637196] transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
          title="Назад (1 мин)"
        >
          <SkipBack size={13} />
        </button>
        <button
          onClick={togglePlay}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300',
            isPlaying
              ? 'border border-accent-cyan/25 bg-accent-cyan/15 text-accent-cyan shadow-[0_0_16px_rgba(6,182,212,0.12)]'
              : 'premium-icon-button text-[#637196] hover:-translate-y-0.5 hover:text-white'
          )}
          title={isPlaying ? 'Пауза' : 'Воспроизведение'}
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button
          onClick={stepForward}
          className="premium-icon-button flex h-8 w-8 items-center justify-center rounded-xl text-[#637196] transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
          title="Вперёд (1 мин)"
        >
          <SkipForward size={13} />
        </button>
      </div>

      <div className="premium-divider hidden h-9 w-px lg:block" />

      <div className="flex items-center gap-0.5 rounded-2xl border border-white/6 bg-white/[0.03] p-1">
        {SPEED_OPTIONS.map((option) => (
          <button
            key={option}
            onClick={() => handleSpeedChange(option)}
            className={cn(
              'rounded-xl px-1.5 py-1.5 text-[9px] font-semibold tracking-[0.1em] transition-all duration-300',
              speed === option
                ? 'border border-white/12 bg-white/10 text-accent-blue shadow-[0_0_12px_rgba(59,130,246,0.1)]'
                : 'text-[#637196] hover:bg-white/[0.05] hover:text-[#eef2ff]'
            )}
          >
            {option}x
          </button>
        ))}
      </div>
    </div>
  );
}
