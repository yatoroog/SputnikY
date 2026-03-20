import { clsx, type ClassValue } from 'clsx';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export const MIN_RENDERABLE_ALTITUDE_KM = 0;
export const MAX_RENDERABLE_ALTITUDE_KM = 100000;

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function isRenderableAltitudeKm(km: number): boolean {
  return Number.isFinite(km) && km >= MIN_RENDERABLE_ALTITUDE_KM && km <= MAX_RENDERABLE_ALTITUDE_KM;
}

export function formatCoordinate(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}\u00B0${latDir}, ${Math.abs(lng).toFixed(1)}\u00B0${lngDir}`;
}

export function formatAltitude(km: number): string {
  return `${km.toFixed(1)} km`;
}

export function formatPeriod(min: number): string {
  return `${min.toFixed(1)} \u043C\u0438\u043D`;
}

export function getOrbitTypeColor(type?: string): string {
  switch (type?.toUpperCase()) {
    case 'LEO':
      return '#06b6d4';
    case 'MEO':
      return '#3b82f6';
    case 'GEO':
      return '#f59e0b';
    case 'HEO':
      return '#ef4444';
    default:
      return '#9ca3af';
  }
}

export function getOrbitTypeLabel(type?: string): string {
  switch (type?.toUpperCase()) {
    case 'LEO':
      return '\u041D\u0438\u0437\u043A\u0430\u044F (LEO)';
    case 'MEO':
      return '\u0421\u0440\u0435\u0434\u043D\u044F\u044F (MEO)';
    case 'GEO':
      return '\u0413\u0435\u043E\u0441\u0442\u0430\u0446. (GEO)';
    case 'HEO':
      return '\u0412\u044B\u0441\u043E\u043A\u043E\u044D\u043B\u043B. (HEO)';
    default:
      return type ?? '\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E';
  }
}

export function formatDateTime(timestamp: number | string | Date): string {
  const date = typeof timestamp === 'number'
    ? new Date(timestamp * 1000)
    : new Date(timestamp);
  return format(date, 'dd MMM yyyy, HH:mm:ss', { locale: ru });
}

export function formatTimeUTC(date: Date): string {
  return format(date, 'HH:mm:ss');
}

export function formatDateUTC(date: Date): string {
  return format(date, 'dd MMM yyyy', { locale: ru });
}
