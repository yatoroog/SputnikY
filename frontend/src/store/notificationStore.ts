import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SatelliteNotification } from '@/types';
import { MAX_STORED_NOTIFICATIONS } from '@/lib/notifications';

interface NotificationStore {
  notifications: SatelliteNotification[];
  seenNotificationIds: string[];
  isPanelOpen: boolean;
  activeNotificationId: string | null;
  addNotification: (notification: SatelliteNotification) => boolean;
  togglePanel: () => void;
  closePanel: () => void;
  openNotification: (id: string) => void;
  closeNotification: () => void;
}

function createSafeStorage(): Storage {
  if (typeof window === 'undefined') {
    return {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };
  }

  try {
    const storage = window.localStorage;
    const probeKey = '__sputnikx_storage_probe__';
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };
  }
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      notifications: [],
      seenNotificationIds: [],
      isPanelOpen: false,
      activeNotificationId: null,

      addNotification: (notification) => {
        const exists = get().seenNotificationIds.includes(notification.id);
        if (exists) {
          return false;
        }

        set((state) => ({
          notifications: [notification, ...state.notifications].slice(
            0,
            MAX_STORED_NOTIFICATIONS
          ),
          seenNotificationIds: [notification.id, ...state.seenNotificationIds].slice(0, 1000),
        }));

        return true;
      },

      togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

      closePanel: () => set({ isPanelOpen: false }),

      openNotification: (id) =>
        set((state) => ({
          activeNotificationId: id,
          isPanelOpen: false,
          notifications: state.notifications.map((notification) =>
            notification.id === id && notification.readAt === null
              ? { ...notification, readAt: Date.now() }
              : notification
          ),
        })),

      closeNotification: () => set({ activeNotificationId: null }),
    }),
    {
      name: 'sputnikx-notifications',
      storage: createJSONStorage(createSafeStorage),
      partialize: (state) => ({
        notifications: state.notifications,
        seenNotificationIds: state.seenNotificationIds,
      }),
    }
  )
);
