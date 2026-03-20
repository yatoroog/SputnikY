'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useSatelliteStore } from '@/store/satelliteStore';
import type { SatellitePosition, WSMessage } from '@/types';
import { isRenderableAltitudeKm } from '@/lib/utils';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  process.env.NEXT_PUBLIC_API_URL?.replace(/^http/, 'ws') ||
  'ws://localhost:8080';
const MAX_RECONNECT_DELAY = 30000;

function isValidPositionUpdate(value: unknown): value is SatellitePosition {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const position = value as SatellitePosition;
  return (
    typeof position.id === 'string' &&
    Number.isFinite(position.lat) &&
    position.lat >= -90 &&
    position.lat <= 90 &&
    Number.isFinite(position.lng) &&
    position.lng >= -180 &&
    position.lng <= 180 &&
    isRenderableAltitudeKm(position.alt)
  );
}

export function useWebSocket() {
  const statusRef = useRef<ConnectionStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedIdsRef = useRef<string[]>([]);
  const shouldReconnectRef = useRef(true);
  const updatePositions = useSatelliteStore((state) => state.updatePositions);

  const connect = useCallback(() => {
    if (typeof WebSocket === 'undefined') return;
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    shouldReconnectRef.current = true;
    statusRef.current = 'connecting';

    try {
      const ws = new WebSocket(`${WS_BASE_URL}/ws/positions`);
      wsRef.current = ws;

      ws.onopen = () => {
        statusRef.current = 'connected';
        reconnectAttemptRef.current = 0;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        if (subscribedIdsRef.current.length > 0) {
          ws.send(
            JSON.stringify({
              type: 'subscribe',
              ids: subscribedIdsRef.current,
            })
          );
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as WSMessage;

          if (message.type === 'positions' && Array.isArray(message.data)) {
            updatePositions(message.data.filter(isValidPositionUpdate));
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        statusRef.current = 'error';
      };

      ws.onclose = () => {
        statusRef.current = 'disconnected';
        wsRef.current = null;
        if (!shouldReconnectRef.current) return;

        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttemptRef.current),
          MAX_RECONNECT_DELAY
        );
        reconnectAttemptRef.current += 1;

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connect();
        }, delay);
      };
    } catch {
      statusRef.current = 'error';
    }
  }, [updatePositions]);

  const subscribe = useCallback((ids: string[]) => {
    subscribedIdsRef.current = ids;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'subscribe',
          ids,
        })
      );
    }
  }, []);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) {
      wsRef.current.close(1000, 'Client disconnect');
    } else if (wsRef.current) {
      wsRef.current.close();
    }

    if (wsRef.current) {
      wsRef.current = null;
    }

    statusRef.current = 'disconnected';
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { subscribe, disconnect, connect };
}
