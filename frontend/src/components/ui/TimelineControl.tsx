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

const SPEED_OPTIONS = [1, 2, 5, 10, 50, 100];

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
    <div className="panel-base px-6 py-3 flex items-center gap-6">
      {/* Time display */}
      <div className="flex items-center gap-2">
        <Clock size={16} className="text-accent-cyan" />
        <div className="flex flex-col">
          <span className="text-sm font-mono text-[#e5e7eb] font-medium" suppressHydrationWarning>
            {isMounted ? `${formatTimeUTC(currentTime)} UTC` : '--:--:-- UTC'}
          </span>
          <span className="text-[10px] text-[#9ca3af] font-mono" suppressHydrationWarning>
            {isMounted ? formatDateUTC(currentTime) : '-- --- ----'}
          </span>
        </div>
      </div>

      {/* Separator */}
      <div className="w-px h-8 bg-cosmos-border" />

      {/* Playback controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={stepBackward}
          className="p-2 text-[#9ca3af] hover:text-[#e5e7eb] transition-colors duration-200 rounded-lg hover:bg-cosmos-surface/50"
          title={'\u041D\u0430\u0437\u0430\u0434 (1 \u043C\u0438\u043D)'}
        >
          <SkipBack size={16} />
        </button>
        <button
          onClick={togglePlay}
          className={cn(
            'p-2 rounded-lg transition-all duration-200',
            isPlaying
              ? 'text-accent-cyan bg-accent-cyan/10 hover:bg-accent-cyan/20'
              : 'text-[#9ca3af] hover:text-[#e5e7eb] hover:bg-cosmos-surface/50'
          )}
          title={isPlaying ? '\u041F\u0430\u0443\u0437\u0430' : '\u0412\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u0435'}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          onClick={stepForward}
          className="p-2 text-[#9ca3af] hover:text-[#e5e7eb] transition-colors duration-200 rounded-lg hover:bg-cosmos-surface/50"
          title={'\u0412\u043F\u0435\u0440\u0451\u0434 (1 \u043C\u0438\u043D)'}
        >
          <SkipForward size={16} />
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-8 bg-cosmos-border" />

      {/* Speed selector */}
      <div className="flex items-center gap-1">
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => handleSpeedChange(s)}
            className={cn(
              'px-2 py-1 rounded text-xs font-medium transition-all duration-200',
              speed === s
                ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/40'
                : 'text-[#9ca3af] hover:text-[#e5e7eb] hover:bg-cosmos-surface/50'
            )}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="w-px h-8 bg-cosmos-border" />

      {/* Real-time button */}
      <button
        onClick={resetToRealTime}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
          isRealTime
            ? 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30'
            : 'text-[#9ca3af] hover:text-accent-cyan hover:bg-cosmos-surface/50 border border-transparent'
        )}
      >
        <div
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            isRealTime ? 'bg-accent-cyan animate-pulse' : 'bg-[#9ca3af]'
          )}
        />
        {'\u0420\u0435\u0430\u043B\u044C\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F'}
      </button>
    </div>
  );
}
