'use client';

import { useEffect } from 'react';
import { fetchAreaSatelliteApproaches } from '@/lib/api';
import {
  buildSatelliteNotification,
  canUseBrowserNotifications,
  NOTIFICATION_LOOKAHEAD_HOURS,
  NOTIFICATION_NOTIFY_BEFORE_MIN,
  NOTIFICATION_POLL_INTERVAL_MS,
  ROSTOV_OBSERVER,
} from '@/lib/notifications';
import { useNotificationStore } from '@/store/notificationStore';
import { useTimeStore } from '@/store/timeStore';

function showBrowserNotification(title: string, body: string, tag: string) {
  if (!canUseBrowserNotifications()) {
    return;
  }

  if (Notification.permission !== 'granted') {
    return;
  }

  const notification = new Notification(title, {
    body,
    tag,
  });

  notification.onclick = () => {
    window.focus();
    useNotificationStore.getState().openNotification(tag);
  };
}

export function useSatelliteNotifications() {
  const isRealTime = useTimeStore((state) => state.isRealTime);
  const addNotification = useNotificationStore((state) => state.addNotification);

  useEffect(() => {
    if (!isRealTime) {
      return;
    }

    let cancelled = false;

    const pollApproaches = async () => {
      try {
        const response = await fetchAreaSatelliteApproaches(
          ROSTOV_OBSERVER.lat,
          ROSTOV_OBSERVER.lng,
          ROSTOV_OBSERVER.radiusKm,
          NOTIFICATION_LOOKAHEAD_HOURS,
          NOTIFICATION_NOTIFY_BEFORE_MIN
        );

        if (cancelled) {
          return;
        }

        const nowUnix = Math.floor(Date.now() / 1000);

        for (const event of response.approaches) {
          const { satellite, approach } = event;

          if (approach.notifyAt > nowUnix || approach.startAt <= nowUnix) {
            continue;
          }

          const notification = buildSatelliteNotification(
            satellite,
            {
              ...response.observer,
              name: ROSTOV_OBSERVER.name,
            },
            approach
          );

          const added = addNotification(notification);
          if (added) {
            showBrowserNotification(notification.title, notification.summary, notification.id);
          }
        }
      } catch {
        // A future poll will retry. UI notifications stay local and resilient to transient API errors.
      }
    };

    void pollApproaches();

    const intervalId = setInterval(() => {
      void pollApproaches();
    }, NOTIFICATION_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [addNotification, isRealTime]);
}
