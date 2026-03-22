'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Eye, MapPin, RefreshCw, X, Loader2 } from 'lucide-react';
import { cn, getOrbitTypeColor } from '@/lib/utils';
import { useSatelliteStore } from '@/store/satelliteStore';
import type { Satellite } from '@/types';

interface VisibleSatellite {
  satellite: Satellite;
  elevation: number;
  azimuth: number;
  distance: number;
}

function calculateLookAngles(
  satLat: number, satLng: number, satAlt: number,
  obsLat: number, obsLng: number
): { elevation: number; azimuth: number; distance: number } {
  const R = 6371;
  const toRad = Math.PI / 180;

  const obsLatR = obsLat * toRad;
  const obsLngR = obsLng * toRad;
  const satLatR = satLat * toRad;
  const satLngR = satLng * toRad;

  const dLat = satLatR - obsLatR;
  const dLng = satLngR - obsLngR;

  // Haversine for ground distance
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(obsLatR) * Math.cos(satLatR) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const groundDist = R * c;

  // Elevation angle approximation
  const elevation = Math.atan2(satAlt - 0, groundDist) * (180 / Math.PI) - (groundDist / (2 * R)) * (180 / Math.PI);

  // Azimuth
  const y = Math.sin(dLng) * Math.cos(satLatR);
  const x = Math.cos(obsLatR) * Math.sin(satLatR) - Math.sin(obsLatR) * Math.cos(satLatR) * Math.cos(dLng);
  const azimuth = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;

  // Slant distance
  const distance = Math.sqrt(groundDist ** 2 + satAlt ** 2);

  return { elevation, azimuth, distance };
}

interface WhatsOverheadProps {
  className?: string;
}

export default function WhatsOverhead({ className }: WhatsOverheadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [visibleSats, setVisibleSats] = useState<VisibleSatellite[]>([]);
  const satellites = useSatelliteStore((state) => state.satellites);
  const selectSatellite = useSatelliteStore((state) => state.selectSatellite);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Геолокация не поддерживается');
      return;
    }
    setLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocationError(err.code === 1 ? 'Доступ к геолокации запрещён' : 'Не удалось определить местоположение');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, []);

  const computeVisible = useCallback(() => {
    if (!userLocation || satellites.length === 0) return;

    const visible: VisibleSatellite[] = [];
    for (const sat of satellites) {
      const { elevation, azimuth, distance } = calculateLookAngles(
        sat.latitude, sat.longitude, sat.altitude,
        userLocation.lat, userLocation.lng
      );
      if (elevation > 0) {
        visible.push({ satellite: sat, elevation, azimuth, distance });
      }
    }

    visible.sort((a, b) => b.elevation - a.elevation);
    setVisibleSats(visible);
  }, [userLocation, satellites]);

  useEffect(() => {
    if (!isOpen) return;
    if (!userLocation) {
      requestLocation();
    }
  }, [isOpen, userLocation, requestLocation]);

  useEffect(() => {
    if (!userLocation || !isOpen) return;
    computeVisible();
    intervalRef.current = setInterval(computeVisible, 10000);
    return () => clearInterval(intervalRef.current);
  }, [userLocation, isOpen, computeVisible]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          'premium-icon-button flex items-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-medium text-[#94a3c0] hover:text-accent-cyan transition-all',
          'panel-base',
          className
        )}
        title="Что над головой?"
      >
        <Eye size={14} />
        <span className="hidden lg:inline">Над головой</span>
      </button>
    );
  }

  const formatAz = (deg: number) => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
    return `${deg.toFixed(0)}° ${dirs[idx]}`;
  };

  return (
    <div className={cn(
      'panel-base glass-shimmer flex flex-col w-[min(340px,calc(100vw-1rem))] max-h-[70vh] overflow-hidden animate-fade-in',
      className
    )}>
      <div className="pointer-events-none absolute inset-x-6 top-0 z-10 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-accent-cyan/10">
            <Eye size={14} className="text-accent-cyan" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Над головой</h3>
            <p className="text-[10px] text-[#637196]">
              {visibleSats.length} {visibleSats.length === 1 ? 'спутник' : visibleSats.length < 5 ? 'спутника' : 'спутников'} видно
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={computeVisible}
            className="premium-icon-button flex h-7 w-7 items-center justify-center rounded-xl text-[#637196] hover:text-accent-cyan transition-all"
            title="Обновить"
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="premium-icon-button flex h-7 w-7 items-center justify-center rounded-xl text-[#637196] hover:text-white transition-all"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {userLocation && (
        <div className="px-4 pb-2 flex items-center gap-1.5 text-[10px] text-[#4a5578]">
          <MapPin size={10} />
          {userLocation.lat.toFixed(4)}°, {userLocation.lng.toFixed(4)}°
        </div>
      )}

      <div className="mx-4 h-px glass-divider-h" />

      <div className="flex-1 overflow-y-auto">
        {locating ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 size={24} className="text-accent-cyan animate-spin" />
            <p className="text-xs text-[#637196]">Определение местоположения...</p>
          </div>
        ) : locationError ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center px-4">
            <MapPin size={24} className="text-red-400 opacity-60" />
            <p className="text-xs text-red-400">{locationError}</p>
            <button
              type="button"
              onClick={requestLocation}
              className="text-xs text-accent-cyan hover:underline"
            >
              Попробовать снова
            </button>
          </div>
        ) : visibleSats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-[#637196]">
            <Eye size={28} className="mb-3 opacity-40" />
            <p className="text-sm">Нет видимых спутников</p>
            <p className="text-[10px] text-[#4a5578] mt-1">Автообновление каждые 10 сек</p>
          </div>
        ) : (
          <div className="py-1">
            {visibleSats.map(({ satellite, elevation, azimuth, distance }) => {
              const orbitColor = getOrbitTypeColor(satellite.orbitType);
              return (
                <button
                  type="button"
                  key={satellite.id}
                  onClick={() => { selectSatellite(satellite); setIsOpen(false); }}
                  className="w-full text-left border-b border-white/5 px-4 py-2.5 transition-colors duration-200 hover:bg-white/[0.03]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 shrink-0 rounded-full shadow-[0_0_6px_currentColor]"
                          style={{ backgroundColor: orbitColor }}
                        />
                        <span className="truncate text-[13px] font-medium text-[#eef2ff]">
                          {satellite.name}
                        </span>
                      </div>
                      <div className="ml-4 mt-0.5 flex items-center gap-2 text-[10px] text-[#4a5578]">
                        <span>El: {elevation.toFixed(1)}°</span>
                        <span>Az: {formatAz(azimuth)}</span>
                        <span>{distance.toFixed(0)} км</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-[#637196]">{satellite.altitude.toFixed(0)} км</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
