import { useRef, useEffect, useCallback, useState } from 'react';

function getWsUrl() {
  // Explicit env var always wins
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  // Production: same host, upgrade protocol
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT = 8;

export function useWebSocket({ onMessage }) {
  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef(null);
  const onMessageRef = useRef(onMessage);
  const [wsState, setWsState] = useState('disconnected');
  const connectRef = useRef(null);

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    setWsState('connecting');
    const url = getWsUrl();
    console.log('[WS] Connecting to:', url);

    let ws;
    try { ws = new WebSocket(url); } catch (e) { console.error('[WS] Failed to create:', e); return; }

    ws.onopen = () => {
      console.log('[WS] Connected ✓');
      setWsState('connected');
      reconnectAttempts.current = 0;
    };
    ws.onmessage = (ev) => {
      try { onMessageRef.current?.(JSON.parse(ev.data)); } catch {}
    };
    ws.onclose = (ev) => {
      console.log('[WS] Closed', ev.code);
      setWsState('disconnected');
      if (reconnectAttempts.current < MAX_RECONNECT) {
        const delay = Math.min(RECONNECT_DELAY * (reconnectAttempts.current + 1), 10000);
        reconnectAttempts.current++;
        reconnectTimer.current = setTimeout(() => connectRef.current?.(), delay);
      } else {
        setWsState('failed');
      }
    };
    ws.onerror = () => {}; // onclose handles reconnect
    wsRef.current = ws;
  }, []);

  useEffect(() => { connectRef.current = connect; }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((data) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(data)); return true; }
    console.warn('[WS] Not connected, cannot send');
    return false;
  }, []);

  return { wsRef, wsState, sendMessage };
}
