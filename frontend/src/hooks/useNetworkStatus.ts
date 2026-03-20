import { useState, useEffect, useCallback, useRef } from 'react';

export type NetworkMode = 'online' | 'offline' | 'local-only';

/**
 * Tracks browser connectivity **and** backend reachability.
 *
 * - `online`     – browser is online AND backend /health responds
 * - `local-only` – browser is online but backend is unreachable
 * - `offline`    – browser reports navigator.onLine === false
 */
export function useNetworkStatus(apiBaseUrl: string): NetworkMode {
  const [mode, setMode] = useState<NetworkMode>('online');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = useCallback(async () => {
    if (!navigator.onLine) {
      setMode('offline');
      return;
    }

    try {
      const healthURL = apiBaseUrl.replace(/\/?$/, '/health');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(healthURL, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);
      setMode(resp.ok ? 'online' : 'local-only');
    } catch {
      setMode('local-only');
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    // Initial check
    check();

    // Re-check every 30 seconds
    intervalRef.current = setInterval(check, 30_000);

    // Listen for browser online/offline events
    const handleOnline = () => check();
    const handleOffline = () => setMode('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [check]);

  return mode;
}
