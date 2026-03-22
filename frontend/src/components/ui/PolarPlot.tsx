'use client';

import { useEffect, useState, useMemo } from 'react';
import { X, Loader2 } from 'lucide-react';
import { fetchPassTrack } from '@/lib/api';
import type { PassTrackPoint, AreaPass } from '@/types';
import { cn } from '@/lib/utils';

interface PolarPlotProps {
  pass: AreaPass;
  observerLat: number;
  observerLng: number;
  onClose: () => void;
  className?: string;
}

const PLOT_SIZE = 280;
const CENTER = PLOT_SIZE / 2;
const RADIUS = (PLOT_SIZE - 40) / 2;

function polarToXY(azimuth: number, elevation: number): { x: number; y: number } {
  const r = RADIUS * (1 - elevation / 90);
  const azRad = ((azimuth - 90) * Math.PI) / 180;
  return {
    x: CENTER + r * Math.cos(azRad),
    y: CENTER + r * Math.sin(azRad),
  };
}

export default function PolarPlot({ pass, observerLat, observerLng, onClose, className }: PolarPlotProps) {
  const [points, setPoints] = useState<PassTrackPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchPassTrack(pass.satelliteId, observerLat, observerLng, pass.aos, pass.los)
      .then((data) => {
        if (!cancelled) setPoints(data);
      })
      .catch((err) => {
        console.warn('Failed to fetch pass track:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [pass.satelliteId, pass.aos, pass.los, observerLat, observerLng]);

  const pathData = useMemo(() => {
    if (points.length < 2) return '';
    return points
      .filter((p) => p.elevation > 0)
      .map((p, i) => {
        const { x, y } = polarToXY(p.azimuth, p.elevation);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points]);

  const aosPoint = points.length > 0 ? polarToXY(points[0].azimuth, Math.max(0, points[0].elevation)) : null;
  const losPoint = points.length > 1 ? polarToXY(points[points.length - 1].azimuth, Math.max(0, points[points.length - 1].elevation)) : null;

  const tcaPoint = useMemo(() => {
    if (points.length === 0) return null;
    const tca = points.reduce((max, p) => (p.elevation > max.elevation ? p : max), points[0]);
    return { ...polarToXY(tca.azimuth, tca.elevation), elevation: tca.elevation };
  }, [points]);

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={cn('panel-base glass-shimmer p-4 animate-fade-in', className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white truncate">{pass.satelliteName}</h3>
          <p className="text-[10px] text-[#637196]">
            {formatTime(pass.aos)} – {formatTime(pass.los)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="premium-icon-button flex h-7 w-7 items-center justify-center rounded-xl text-[#637196] hover:text-white transition-all"
        >
          <X size={14} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center" style={{ height: PLOT_SIZE }}>
          <Loader2 size={24} className="text-accent-cyan animate-spin" />
        </div>
      ) : (
        <svg width={PLOT_SIZE} height={PLOT_SIZE} className="mx-auto">
          {/* Background circles */}
          {[0, 30, 60, 90].map((elev) => {
            const r = RADIUS * (1 - elev / 90);
            return (
              <g key={elev}>
                <circle cx={CENTER} cy={CENTER} r={r} fill="none" stroke="#1e293b" strokeWidth={1} />
                {elev > 0 && (
                  <text x={CENTER + 3} y={CENTER - r + 12} fontSize={9} fill="#4a5578">
                    {elev}°
                  </text>
                )}
              </g>
            );
          })}

          {/* Cardinal directions */}
          {[
            { label: 'N', angle: 0 },
            { label: 'E', angle: 90 },
            { label: 'S', angle: 180 },
            { label: 'W', angle: 270 },
          ].map(({ label, angle }) => {
            const azRad = ((angle - 90) * Math.PI) / 180;
            const lx = CENTER + (RADIUS + 14) * Math.cos(azRad);
            const ly = CENTER + (RADIUS + 14) * Math.sin(azRad);
            return (
              <g key={label}>
                <line
                  x1={CENTER}
                  y1={CENTER}
                  x2={CENTER + RADIUS * Math.cos(azRad)}
                  y2={CENTER + RADIUS * Math.sin(azRad)}
                  stroke="#1e293b"
                  strokeWidth={1}
                />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={11}
                  fontWeight={600}
                  fill="#94a3c0"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Pass trajectory */}
          {pathData && (
            <path d={pathData} fill="none" stroke="#06b6d4" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          )}

          {/* AOS marker */}
          {aosPoint && (
            <g>
              <circle cx={aosPoint.x} cy={aosPoint.y} r={4} fill="#22c55e" />
              <text x={aosPoint.x} y={aosPoint.y - 8} textAnchor="middle" fontSize={9} fontWeight={600} fill="#22c55e">
                AOS
              </text>
            </g>
          )}

          {/* TCA marker */}
          {tcaPoint && (
            <g>
              <circle cx={tcaPoint.x} cy={tcaPoint.y} r={4} fill="#f59e0b" />
              <text x={tcaPoint.x + 10} y={tcaPoint.y + 4} textAnchor="start" fontSize={9} fontWeight={600} fill="#f59e0b">
                TCA {tcaPoint.elevation.toFixed(1)}°
              </text>
            </g>
          )}

          {/* LOS marker */}
          {losPoint && (
            <g>
              <circle cx={losPoint.x} cy={losPoint.y} r={4} fill="#ef4444" />
              <text x={losPoint.x} y={losPoint.y + 14} textAnchor="middle" fontSize={9} fontWeight={600} fill="#ef4444">
                LOS
              </text>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
