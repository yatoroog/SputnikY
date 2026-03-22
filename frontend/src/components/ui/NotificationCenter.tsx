'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  MapPin,
  Orbit,
  Radio,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import { useSatelliteNotifications } from '@/hooks/useSatelliteNotifications';
import {
  canUseBrowserNotifications,
  formatDurationMinutes,
  formatNotificationTime,
  ROSTOV_OBSERVER,
} from '@/lib/notifications';
import { getOrbitTypeColor } from '@/lib/utils';

export default function NotificationCenter() {
  useSatelliteNotifications();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const notifications = useNotificationStore((state) => state.notifications);
  const isPanelOpen = useNotificationStore((state) => state.isPanelOpen);
  const activeNotificationId = useNotificationStore((state) => state.activeNotificationId);
  const togglePanel = useNotificationStore((state) => state.togglePanel);
  const closePanel = useNotificationStore((state) => state.closePanel);
  const openNotification = useNotificationStore((state) => state.openNotification);
  const closeNotification = useNotificationStore((state) => state.closeNotification);
  const satellitesCount = useSatelliteStore((state) => state.satellites.length);
  const isRealTime = useTimeStore((state) => state.isRealTime);
  const unreadCount = notifications.filter((notification) => notification.readAt === null).length;
  const activeNotification =
    notifications.find((notification) => notification.id === activeNotificationId) ?? null;
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(
    canUseBrowserNotifications() ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    if (!isPanelOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closePanel();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [closePanel, isPanelOpen]);

  const headerLabel = satellitesCount > 0
    ? `Мониторинг всех спутников каталога`
    : 'Каталог спутников загружается';

  const requestBrowserPermission = async () => {
    if (!canUseBrowserNotifications()) {
      setPermissionState('unsupported');
      return;
    }

    const nextPermission = await Notification.requestPermission();
    setPermissionState(nextPermission);
  };

  return (
    <>
      <div
        ref={rootRef}
        className="pointer-events-none absolute top-4 right-4 z-30 flex w-[min(360px,calc(100vw-2rem))] flex-col items-end"
      >
        <div className="pointer-events-auto relative h-14 w-14 shrink-0">
          <button
            type="button"
            onClick={togglePanel}
            className="panel-base flex h-14 w-14 items-center justify-center rounded-[20px] text-[#94a3c0] transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
            aria-label="Открыть уведомления"
          >
            {unreadCount > 0 ? (
              <BellRing size={18} className="text-accent-cyan" />
            ) : (
              <Bell size={18} />
            )}
          </button>

          {unreadCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex min-h-6 min-w-6 items-center justify-center rounded-full border border-accent-cyan/40 bg-[#08111f] px-1.5 text-[11px] font-semibold text-accent-cyan shadow-[0_0_20px_rgba(6,182,212,0.28)]">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>

        {isPanelOpen && (
          <div className="panel-base glass-shimmer pointer-events-auto mt-4 flex w-full max-h-[min(70vh,calc(100vh-7rem))] flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 p-5">
              <div>
                <div className="flex items-center gap-2">
                  <div className="premium-icon-button flex h-9 w-9 items-center justify-center rounded-xl text-accent-cyan">
                    <BellRing size={16} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-white">Уведомления</h2>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-[#637196]">
                      {headerLabel}
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="premium-icon-button flex h-8 w-8 items-center justify-center rounded-xl text-[#637196] transition-all hover:text-white"
                aria-label="Закрыть список уведомлений"
              >
                <X size={15} />
              </button>
            </div>

            <div className="mx-5 h-px glass-divider-h" />

            <div className="px-5 py-3">
              <div className="flex items-center gap-2 text-xs text-[#94a3c0]">
                <MapPin size={12} className="text-accent-cyan" />
                <span>
                  {ROSTOV_OBSERVER.name}, радиус {ROSTOV_OBSERVER.radiusKm} км
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-[#7f8ca7]">
                <Orbit size={12} />
                <span>
                  {isRealTime
                    ? 'Мониторинг активен для всего каталога спутников'
                    : 'Мониторинг приостановлен: сейчас включена симуляция времени'}
                </span>
              </div>
            </div>

            {permissionState === 'default' && (
              <>
                <div className="mx-5 h-px glass-divider-h" />
                <div className="px-5 py-3">
                  <button
                    type="button"
                    onClick={requestBrowserPermission}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-accent-cyan/20 bg-accent-cyan/10 px-4 py-3 text-xs font-medium text-accent-cyan transition-all hover:bg-accent-cyan/15"
                  >
                    <Radio size={13} />
                    Разрешить системные уведомления браузера
                  </button>
                </div>
              </>
            )}

            {permissionState === 'denied' && (
              <>
                <div className="mx-5 h-px glass-divider-h" />
                <div className="px-5 py-3 text-xs text-amber-300/90">
                  Системные уведомления браузера отключены. Встроенный список уведомлений продолжит работать.
                </div>
              </>
            )}

            <div className="mx-5 h-px glass-divider-h" />

            <div className="flex-1 overflow-y-auto py-1">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-12 text-center text-[#637196]">
                  <ShieldAlert size={28} className="mb-3 opacity-50" />
                  <p className="text-sm text-[#94a3c0]">Пока уведомлений нет</p>
                  <p className="mt-1 text-xs leading-relaxed">
                    Уведомления появятся автоматически, когда любой спутник каталога приблизится к Ростову-на-Дону за 1 час до входа в радиус.
                  </p>
                </div>
              ) : (
                notifications.map((notification) => {
                  const orbitColor = getOrbitTypeColor(notification.satellite.orbitType);
                  const isUnread = notification.readAt === null;

                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => openNotification(notification.id)}
                      className="flex w-full items-start gap-3 border-b border-white/5 px-5 py-4 text-left transition-colors duration-200 hover:bg-white/[0.03]"
                    >
                      <div
                        className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full shadow-[0_0_10px_currentColor]"
                        style={{ color: orbitColor, backgroundColor: orbitColor, opacity: isUnread ? 1 : 0.35 }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-medium text-[#eef2ff]">
                            {notification.satellite.name}
                          </p>
                          {isUnread && (
                            <span className="rounded-full border border-accent-cyan/25 bg-accent-cyan/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-cyan">
                              new
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-[#94a3c0]">
                          {notification.summary}
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-[11px] text-[#637196]">
                          <span>Уведомление: {formatNotificationTime(notification.approach.notifyAt)}</span>
                          <span>Сближение: {formatNotificationTime(notification.approach.startAt)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {activeNotification && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#040711]/70 p-4 backdrop-blur-sm sm:p-6"
          onClick={closeNotification}
        >
          <div
            className="panel-base glass-shimmer relative flex w-full max-w-[680px] max-h-[min(78vh,720px)] flex-col overflow-hidden rounded-[26px] animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-details-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-5 py-5 sm:px-6 sm:py-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#637196]">
                  Детали уведомления
                </p>
                <h3
                  id="notification-details-title"
                  className="mt-2 max-w-[520px] text-lg font-semibold text-white sm:text-xl"
                >
                  {activeNotification.title}
                </h3>
                <p className="mt-2 max-w-[520px] text-sm leading-relaxed text-[#94a3c0]">
                  {activeNotification.summary}
                </p>
              </div>
              <button
                type="button"
                onClick={closeNotification}
                className="premium-icon-button flex h-9 w-9 items-center justify-center rounded-xl text-[#637196] transition-all hover:text-white"
                aria-label="Закрыть детали уведомления"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mx-5 h-px glass-divider-h sm:mx-6" />

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-2.5 px-5 py-4 sm:px-6 sm:py-5 md:grid-cols-2 lg:grid-cols-3">
                <DetailRow
                  label="Спутник"
                  value={`${activeNotification.satellite.name} · NORAD ${activeNotification.satellite.noradId}`}
                />
                <DetailRow
                  label="Орбита"
                  value={activeNotification.satellite.orbitType || 'Не указана'}
                />
                <DetailRow
                  label="Страна"
                  value={activeNotification.satellite.country || 'Unknown'}
                />
                <DetailRow
                  label="Назначение"
                  value={activeNotification.satellite.purpose || 'Не указано'}
                />
                <DetailRow
                  label="Город"
                  value={`${activeNotification.observer.name} · радиус ${activeNotification.observer.radiusKm} км`}
                />
                <DetailRow
                  label="Уведомление создано"
                  value={formatNotificationTime(Math.floor(activeNotification.createdAt / 1000))}
                />
                <DetailRow
                  label="Вход в радиус"
                  value={formatNotificationTime(activeNotification.approach.startAt)}
                />
                <DetailRow
                  label="Выход из радиуса"
                  value={formatNotificationTime(activeNotification.approach.endAt)}
                />
                <DetailRow
                  label="Ближайшая точка"
                  value={formatNotificationTime(activeNotification.approach.closestAt)}
                />
                <DetailRow
                  label="Минимальная дистанция"
                  value={`${activeNotification.approach.minDistanceKm.toFixed(1)} км`}
                />
                <DetailRow
                  label="Высота в ближайшей точке"
                  value={`${activeNotification.approach.closestAltitudeKm.toFixed(1)} км`}
                />
                <DetailRow
                  label="Скорость"
                  value={`${activeNotification.approach.closestVelocityKmS.toFixed(2)} км/с`}
                />
                <DetailRow
                  label="Длительность сближения"
                  value={formatDurationMinutes(activeNotification.approach.duration)}
                />
                <DetailRow
                  label="Координаты ближайшей точки"
                  value={`${activeNotification.approach.closestLat.toFixed(2)}°, ${activeNotification.approach.closestLng.toFixed(2)}°`}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.035] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[#637196]">{label}</p>
      <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-[#eef2ff] sm:text-sm">
        {value}
      </p>
    </div>
  );
}
