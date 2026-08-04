import { useCallback, useEffect, useRef, useState } from 'react';
import type { HealthResponse } from '../types';

type ConnectionState = 'checking' | 'connected' | 'disconnected';

export default function HealthStatus() {
  const [state, setState] = useState<ConnectionState>('checking');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const cancelledRef = useRef(false);

  const checkHealth = useCallback(async () => {
    setState('checking');
    try {
      const response = await fetch('/api/health');
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const data = (await response.json()) as HealthResponse;
      if (cancelledRef.current) return;
      setHealth(data);
      setCheckedAt(new Date());
      setState('connected');
    } catch {
      if (cancelledRef.current) return;
      setHealth(null);
      setCheckedAt(new Date());
      setState('disconnected');
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    checkHealth();
    return () => {
      cancelledRef.current = true;
    };
  }, [checkHealth]);

  return (
    <section className="status-card" aria-live="polite">
      <div className="status-row">
        <span className={`status-dot status-dot--${state}`} aria-hidden="true" />
        <span className="status-label">
          {state === 'checking' && 'Checking backend connection…'}
          {state === 'connected' && 'Backend connected'}
          {state === 'disconnected' && 'Backend unavailable'}
        </span>
      </div>

      {state === 'connected' && health && (
        <p className="status-meta">
          Version {health.version}
          {checkedAt && <> · Checked {checkedAt.toLocaleTimeString()}</>}
        </p>
      )}

      {state === 'disconnected' && (
        <>
          <p className="status-meta status-meta--error">
            Unable to reach the API. Check your connection and try again.
          </p>
          <button type="button" className="retry-button" onClick={checkHealth}>
            Retry
          </button>
        </>
      )}
    </section>
  );
}
