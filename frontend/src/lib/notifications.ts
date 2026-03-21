'use client';

import type {
  ObserverArea,
  SatelliteApproach,
  SatelliteNotification,
  TrackedSatellite,
} from '@/types';

export const ROSTOV_OBSERVER: ObserverArea = {
  name: 'Ростов-на-Дону',
  lat: 47.2357,
  lng: 39.7015,
  radiusKm: 100,
};

export const NOTIFICATION_LOOKAHEAD_HOURS = 4;
export const NOTIFICATION_NOTIFY_BEFORE_MIN = 60;
export const NOTIFICATION_POLL_INTERVAL_MS = 30_000;
export const MAX_STORED_NOTIFICATIONS = 50;

export function getSatelliteNotificationId(
  satelliteId: string,
  approach: SatelliteApproach
): string {
  return `${satelliteId}:${approach.startAt}:${approach.closestAt}`;
}

export function formatNotificationTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDurationMinutes(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  return `${totalMinutes} мин`;
}

export function buildSatelliteNotification(
  satellite: TrackedSatellite,
  observer: ObserverArea,
  approach: SatelliteApproach
): SatelliteNotification {
  return {
    id: getSatelliteNotificationId(satellite.id, approach),
    createdAt: Date.now(),
    readAt: null,
    title: `${satellite.name}: сближение с ${observer.name ?? 'зоной наблюдения'}`,
    summary: `Через 1 час спутник войдёт в радиус ${observer.radiusKm} км. Минимальная дистанция: ${approach.minDistanceKm.toFixed(1)} км.`,
    satellite,
    observer,
    approach,
  };
}

export function canUseBrowserNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}
