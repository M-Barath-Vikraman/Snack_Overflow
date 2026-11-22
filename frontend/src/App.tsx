import React, { useEffect, useState } from 'react';
import { getApiBaseUrl } from './config/env';
import { apiClient } from './services/apiClient';
import { HealthStatus } from './types';

export const App: React.FC = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  let activeApiUrl = '';
  let configError: string | null = null;

  try {
    activeApiUrl = getApiBaseUrl();
  } catch (err: any) {
    configError = err.message;
  }

  useEffect(() => {
    async function fetchHealth() {
      if (configError) {
        setLoading(false);
        setError(configError);
        return;
      }

      try {
        setLoading(true);
        // Uses the centralized API client foundation
        const res = await apiClient.get<HealthStatus>('/health');
        if (res.success && res.data) {
          setHealth(res.data);
          setError(null);
        } else {
          setError(res.message || 'Failed to reach backend service');
        }
      } catch (err: any) {
        setError(err.message || 'Error connecting to backend');
      } finally {
        setLoading(false);
      }
    }

    fetchHealth();
  }, [configError]);

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', margin: '2rem auto', maxWidth: '800px', padding: '0 1rem', color: '#1e293b' }}>
      <header style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '2rem' }}>
        <h1 style={{ color: '#0f172a', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🍿 Snack Overflow
        </h1>
        <p style={{ color: '#64748b', margin: 0 }}>
          Phase 2: Backend Core APIs Completed
        </p>
      </header>

      <main>
        <section style={{ background: '#f8fafc', borderRadius: '8px', padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '1.25rem', marginTop: 0, color: '#334155' }}>
            Runtime Environment Configuration
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', rowGap: '0.5rem', fontSize: '0.95rem' }}>
            <strong>Active API Base URL:</strong>
            {configError ? (
              <span style={{ color: '#dc2626', fontWeight: 600 }}>{configError}</span>
            ) : (
              <code>{activeApiUrl}</code>
            )}
            <strong>Config Mode:</strong>
            <span>Runtime Window Object (public/config.js is source of truth)</span>
          </div>
        </section>

        <section style={{ background: '#f8fafc', borderRadius: '8px', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '1.25rem', marginTop: 0, color: '#334155' }}>
            Backend Service Status
          </h2>
          {loading && <p style={{ color: '#64748b' }}>Checking backend health...</p>}
          {error && (
            <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b' }}>
              <strong>Backend Offline or Unreachable:</strong> {error}
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem' }}>
                Start the backend server on <code>http://localhost:3000</code> to verify connectivity.
              </p>
            </div>
          )}
          {health && (
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', rowGap: '0.5rem', fontSize: '0.95rem' }}>
              <strong>Status:</strong>
              <span style={{ color: health.status === 'healthy' ? '#16a34a' : '#d97706', fontWeight: 600 }}>
                {health.status.toUpperCase()}
              </span>
              <strong>Environment:</strong>
              <span>{health.environment}</span>
              <strong>Database:</strong>
              <span>
                {health.database.status} {health.database.configured ? '(Connected to Railway)' : '(Unconfigured)'}
              </span>
              <strong>Uptime:</strong>
              <span>{health.uptimeSeconds}s</span>
            </div>
          )}
        </section>
      </main>

      <footer style={{ marginTop: '3rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.875rem' }}>
        Snack Overflow &copy; 2026 &bull; Ready for Phase 3
      </footer>
    </div>
  );
};

export default App;
