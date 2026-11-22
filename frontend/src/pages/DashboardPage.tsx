import React, { useEffect, useState, useCallback } from 'react';
import { DashboardSummaryData, Snack } from '../types';
import snackService from '../services/snackService';
import CategoryBadge from '../components/CategoryBadge';
import StatusBadge from '../components/StatusBadge';

interface DashboardPageProps {
  onNavigateToInventory: () => void;
  onSelectSnack?: (snack: Snack) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigateToInventory,
}) => {
  const [summary, setSummary] = useState<DashboardSummaryData | null>(null);
  const [recentSnacks, setRecentSnacks] = useState<Snack[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryRes, snacksRes] = await Promise.all([
        snackService.getSummary(),
        snackService.getSnacks({ limit: 4, sortBy: 'createdAt', sortOrder: 'desc' }),
      ]);

      if (summaryRes.success && summaryRes.data) {
        setSummary(summaryRes.data);
      } else {
        setError(summaryRes.message || 'Failed to fetch inventory summary.');
      }

      if (snacksRes.success && snacksRes.data) {
        setRecentSnacks(snacksRes.data.snacks);
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (loading && !summary) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🍿</div>
        <p style={{ color: 'var(--text-muted)' }}>Loading inventory dashboard...</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Office Snack Dashboard</h1>
          <p className="page-subtitle">Live pantry inventory overview and team preferences</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={fetchDashboardData}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : '↻ Refresh Data'}
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* 4 Metrics Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-card-title">Total Snack Varieties</span>
          <span className="stat-card-value">{summary?.totalSnacks || 0}</span>
        </div>

        <div className="stat-card">
          <span className="stat-card-title" style={{ color: 'var(--status-in-stock)' }}>
            Fully Stocked
          </span>
          <span className="stat-card-value" style={{ color: 'var(--status-in-stock)' }}>
            {summary?.inStockCount || 0}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-card-title" style={{ color: 'var(--status-low-stock)' }}>
            Low Stock Alert
          </span>
          <span className="stat-card-value" style={{ color: 'var(--status-low-stock)' }}>
            {summary?.lowStockCount || 0}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-card-title" style={{ color: 'var(--status-out-stock)' }}>
            Out of Stock
          </span>
          <span className="stat-card-value" style={{ color: 'var(--status-out-stock)' }}>
            {summary?.outOfStockCount || 0}
          </span>
        </div>
      </div>

      {/* Snack of the Week Feature */}
      {summary?.snackOfTheWeek ? (
        <div className="snack-of-week-card">
          <div className="snack-of-week-info">
            <div className="snack-of-week-badge">
              <span>👑</span> Official Snack of the Week
            </div>
            <h3>{summary.snackOfTheWeek.name}</h3>
            <p style={{ opacity: 0.9, fontSize: '0.95rem' }}>
              Elected by the team with {summary.snackOfTheWeek.voteCount} community votes!
            </p>
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
              <CategoryBadge category={summary.snackOfTheWeek.category} />
              <StatusBadge status={summary.snackOfTheWeek.status} />
            </div>
          </div>
          <div>
            <button
              type="button"
              className="btn"
              style={{ background: '#ffffff', color: 'var(--primary)', fontWeight: 700 }}
              onClick={onNavigateToInventory}
            >
              Browse in Pantry &rarr;
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            background: 'var(--surface)',
            border: '2px dashed var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '2rem',
            textAlign: 'center',
            marginBottom: '2rem',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗳️</div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            No Snack of the Week Yet
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '420px', margin: '0 auto 1.25rem auto' }}>
            Cast your vote in the pantry to help elect your office favorite for the week!
          </p>
          <button type="button" className="btn btn-primary" onClick={onNavigateToInventory}>
            Go Vote in Inventory &rarr;
          </button>
        </div>
      )}

      {/* Quick Overview Section */}
      <div style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Recently Added Snacks</h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onNavigateToInventory}
          >
            View All Snacks &rarr;
          </button>
        </div>

        {recentSnacks.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No snacks registered yet.</p>
        ) : (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}
          >
            {recentSnacks.map((snack, idx) => (
              <div
                key={snack.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem 1.25rem',
                  borderBottom: idx < recentSnacks.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div>
                  <strong style={{ fontSize: '1rem' }}>{snack.name}</strong>
                  <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <CategoryBadge category={snack.category} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Stock: {snack.quantity}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <StatusBadge status={snack.status} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    ❤️ {snack.voteCount || 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
