import { useEffect, useRef, useState, useCallback } from 'react';

const MAX_HISTORY = 60; // keep last 60 seconds

export function useWeatherSocket() {
  const [data, setData]       = useState(null);
  const [history, setHistory] = useState([]);
  const [status, setStatus]   = useState('connecting');
  const wsRef = useRef(null);
  const retryRef = useRef(null);

  const connect = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url   = `${proto}://${window.location.host}/ws/weather`;
    const ws    = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen  = () => setStatus('connected');
    ws.onclose = () => {
      setStatus('reconnecting');
      retryRef.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        setData(parsed);
        setHistory(h => {
          const next = [...h, { ...parsed, t: new Date(parsed.timestamp * 1000).toLocaleTimeString() }];
          return next.slice(-MAX_HISTORY);
        });
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { data, history, status };
}
