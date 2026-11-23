import React, { useEffect, useState, useCallback, useRef } from 'react';
import { DashboardSummaryData, Snack, ActivityRecord, WsConnectionStatus } from '../types';
import snackService from '../services/snackService';
import activityService from '../services/activityService';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import CategoryBadge from '../components/CategoryBadge';
import StatusBadge from '../components/StatusBadge';
import RestockModal from '../components/RestockModal';

interface DashboardPageProps {
  onNavigateToInventory: () => void;
  onNavigateToActivity?: () => void;
  onOpenAddSnack?: () => void;
}

const getCategoryEmoji = (category: string) => {
  switch (category) {
    case 'SWEET':
      return '🍬';
    case 'SAVOURY':
      return '🥨';
    case 'DRINK':
      return '🥤';
    case 'HEALTHY_ISH':
      return '🥗';
    default:
      return '🍿';
  }
};

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigateToInventory,
  onNavigateToActivity,
  onOpenAddSnack,
}) => {
  const { user, isAdmin } = useAuth();
  const { status: wsStatus, subscribe } = useWebSocket();

  const [summary, setSummary] = useState<DashboardSummaryData | null>(null);
  const [recentSnacks, setRecentSnacks] = useState<Snack[]>([]);
  const [lowStockSnacks, setLowStockSnacks] = useState<Snack[]>([]);
  const [recentActivities, setRecentActivities] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Restock modal state on Admin Dashboard
  const [restockTargetSnack, setRestockTargetSnack] = useState<Snack | null>(null);
  const [isRestockModalOpen, setIsRestockModalOpen] = useState<boolean>(false);

  const prevWsStatusRef = useRef<WsConnectionStatus>(wsStatus);
  const debounceTimerRef = useRef<number | null>(null);

  // Compute time-based greeting for Member
  const getTimeGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const calls: Promise<any>[] = [
        snackService.getSummary(),
        snackService.getSnacks({ limit: 6, sortBy: 'createdAt', sortOrder: 'desc' }),
      ];

      // Admin also fetches low-stock items and recent activity preview
      if (isAdmin) {
        calls.push(snackService.getSnacks({ status: 'LOW_STOCK', limit: 8 }));
        calls.push(activityService.getActivities({ limit: 5, sortBy: 'createdAt', sortOrder: 'desc' }));
      }

      const results = await Promise.all(calls);
      const summaryRes = results[0];
      const snacksRes = results[1];

      if (summaryRes.success && summaryRes.data) {
        setSummary(summaryRes.data);
      } else {
        setError(summaryRes.message || 'Failed to fetch inventory summary.');
      }

      if (snacksRes.success && snacksRes.data) {
        setRecentSnacks(snacksRes.data.snacks);
      }

      if (isAdmin) {
        const lowStockRes = results[2];
        const activityRes = results[3];

        if (lowStockRes && lowStockRes.success && lowStockRes.data) {
          setLowStockSnacks(lowStockRes.data.snacks);
        }
        if (activityRes && activityRes.success && activityRes.data) {
          setRecentActivities(activityRes.data.activities);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred while loading dashboard.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Debounced refresh when real-time updates arrive
  const triggerDebouncedRefresh = useCallback(() => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      fetchDashboardData();
    }, 200);
  }, [fetchDashboardData]);

  // Real-time synchronization
  useEffect(() => {
    const unsubWildcard = subscribe('*', () => {
      triggerDebouncedRefresh();
    });

    return () => {
      unsubWildcard();
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [subscribe, triggerDebouncedRefresh]);

  // Reconnection reconciliation
  useEffect(() => {
    if (
      wsStatus === 'connected' &&
      (prevWsStatusRef.current === 'reconnecting' || prevWsStatusRef.current === 'disconnected')
    ) {
      fetchDashboardData();
    }
    prevWsStatusRef.current = wsStatus;
  }, [wsStatus, fetchDashboardData]);

  const handleOpenRestock = (snack: Snack) => {
    setRestockTargetSnack(snack);
    setIsRestockModalOpen(true);
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  // Inventory Health calculation
  const total = summary?.totalSnacks || 0;
  const inStockPct = total > 0 ? Math.round(((summary?.inStockCount || 0) / total) * 100) : 0;
  const lowStockPct = total > 0 ? Math.round(((summary?.lowStockCount || 0) / total) * 100) : 0;
  const outStockPct = total > 0 ? Math.max(0, 100 - inStockPct - lowStockPct) : 0;

  if (loading && !summary) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '5rem 1rem' }}>
        <div style={{ fontSize: '2.5rem', animation: 'bounce 1s infinite' }}>🍿</div>
        <p style={{ color: 'var(--text-muted)', marginTop: '1rem', fontWeight: 500 }}>
          Loading your office snack stash...
        </p>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* -------------------------------------------------------------
          Role-Specific Welcome Banner
          ------------------------------------------------------------- */}
      {isAdmin ? (
        /* Admin Welcome Banner (Compact 100-110px) */
        <div className="welcome-banner">
          <div>
            <h1 className="welcome-banner-title">
              Welcome back, {user?.name || 'Admin'}
            </h1>
            <p className="welcome-banner-subtitle">
              Pantry Operations &bull; Real-time inventory monitoring, low-stock alerts, and restocking
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {onOpenAddSnack && (
              <button type="button" className="btn btn-primary" onClick={onOpenAddSnack}>
                + Add New Snack
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onNavigateToInventory}>
              Manage Inventory &rarr;
            </button>
          </div>
        </div>
      ) : (
        /* Member Welcome Banner (Compact 100-110px) */
        <div className="welcome-banner">
          <div>
            <h1 className="welcome-banner-title">
              {getTimeGreeting()}, {user?.name || 'Snacker'}!
            </h1>
            <p className="welcome-banner-subtitle">
              Here is what is currently available in the office kitchen today. Grab a quick bite or vote for your favorites!
            </p>
          </div>
          <div>
            <button type="button" className="btn btn-primary btn-lg" onClick={onNavigateToInventory}>
              Browse All Snacks &rarr;
            </button>
          </div>
        </div>
      )}

      {error && <div className="alert alert-danger">{error}</div>}

      {/* -------------------------------------------------------------
          Pantry Metric Cards (Horizontal Row of 4 on Desktop)
          ------------------------------------------------------------- */}
      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-card-header">
            <span className="stat-card-title">Total Snack Varieties</span>
            <span className="stat-card-icon">📦</span>
          </div>
          <div className="stat-card-value">{summary?.totalSnacks || 0}</div>
          <div className="stat-card-desc">Active items in pantry catalog</div>
        </div>

        <div className="stat-card success">
          <div className="stat-card-header">
            <span className="stat-card-title" style={{ color: 'var(--status-in-stock)' }}>
              Fully Stocked
            </span>
            <span className="stat-card-icon">✅</span>
          </div>
          <div className="stat-card-value" style={{ color: 'var(--status-in-stock)' }}>
            {summary?.inStockCount || 0}
          </div>
          <div className="stat-card-desc">Optimal inventory levels</div>
        </div>

        <div className="stat-card warning">
          <div className="stat-card-header">
            <span className="stat-card-title" style={{ color: 'var(--status-low-stock)' }}>
              Running Low
            </span>
            <span className="stat-card-icon">⚠️</span>
          </div>
          <div className="stat-card-value" style={{ color: 'var(--status-low-stock)' }}>
            {summary?.lowStockCount || 0}
          </div>
          <div className="stat-card-desc">At or below alert threshold</div>
        </div>

        <div className="stat-card danger">
          <div className="stat-card-header">
            <span className="stat-card-title" style={{ color: 'var(--status-out-stock)' }}>
              Out of Stock
            </span>
            <span className="stat-card-icon">🚨</span>
          </div>
          <div className="stat-card-value" style={{ color: 'var(--status-out-stock)' }}>
            {summary?.outOfStockCount || 0}
          </div>
          <div className="stat-card-desc">Needs immediate replenishment</div>
        </div>
      </div>

      {/* -------------------------------------------------------------
          ADMIN SPECIFIC TWO-COLUMN LAYOUT:
          LEFT: Stock Health Overview + Recent Activity Log
          RIGHT: Low Stock & Restock Priorities Panel
          ------------------------------------------------------------- */}
      {isAdmin && (
        <div className="admin-dashboard-grid">
          {/* Left Column: Health Overview & Recent Activity */}
          <div className="admin-col-left">
            {/* Inventory Health Overview Card */}
            <div className="health-overview-card">
              <div className="health-overview-header">
                <h2 className="health-overview-title">Pantry Stock Health Overview</h2>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {total} Total Catalog Items
                </span>
              </div>

              <div className="health-bar-container">
                <div
                  className="health-bar-segment"
                  style={{ width: `${inStockPct}%`, backgroundColor: 'var(--status-in-stock)' }}
                  title={`Fully Stocked: ${inStockPct}%`}
                />
                <div
                  className="health-bar-segment"
                  style={{ width: `${lowStockPct}%`, backgroundColor: 'var(--status-low-stock)' }}
                  title={`Running Low: ${lowStockPct}%`}
                />
                <div
                  className="health-bar-segment"
                  style={{ width: `${outStockPct}%`, backgroundColor: 'var(--status-out-stock)' }}
                  title={`Out of Stock: ${outStockPct}%`}
                />
              </div>

              <div className="health-legend">
                <div className="health-legend-item">
                  <span className="health-legend-color" style={{ backgroundColor: 'var(--status-in-stock)' }} />
                  <span>Fully Stocked: <strong>{inStockPct}%</strong> ({summary?.inStockCount || 0})</span>
                </div>
                <div className="health-legend-item">
                  <span className="health-legend-color" style={{ backgroundColor: 'var(--status-low-stock)' }} />
                  <span>Running Low: <strong>{lowStockPct}%</strong> ({summary?.lowStockCount || 0})</span>
                </div>
                <div className="health-legend-item">
                  <span className="health-legend-color" style={{ backgroundColor: 'var(--status-out-stock)' }} />
                  <span>Out of Stock: <strong>{outStockPct}%</strong> ({summary?.outOfStockCount || 0})</span>
                </div>
              </div>
            </div>

            {/* Recent Administrative Activity Panel */}
            <div className="recent-activity-panel">
              <div className="recent-activity-header">
                <div>
                  <h2 className="recent-activity-title">Recent Activity Log</h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Live audit trail of snack consumption and restocking
                  </p>
                </div>
                {onNavigateToActivity && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={onNavigateToActivity}
                  >
                    View Full Audit Log &rarr;
                  </button>
                )}
              </div>

              {recentActivities.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', padding: '12px 0' }}>
                  No recent activity recorded yet.
                </p>
              ) : (
                <div
                  style={{
                    background: 'var(--surface-subtle)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                  }}
                >
                  {recentActivities.map((act, idx) => {
                    const isConsumed = act.action === 'CONSUMED';
                    return (
                      <div
                        key={act.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderBottom: idx < recentActivities.length - 1 ? '1px solid var(--border)' : 'none',
                          gap: '12px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className={`action-badge ${isConsumed ? 'consumed' : 'restocked'}`}>
                            {isConsumed ? '😋 Consumed' : '📦 Restocked'}
                          </span>
                          <div>
                            <strong style={{ fontSize: '14px', color: 'var(--text-main)' }}>
                              {act.snack ? act.snack.name : 'Unknown Snack'}
                            </strong>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              by {act.user ? act.user.name : 'Team member'} &bull; {formatDate(act.createdAt)}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>
                          <span style={{ color: isConsumed ? 'var(--status-out-stock)' : 'var(--status-in-stock)' }}>
                            {isConsumed ? `-${act.amount} packet` : `+${act.amount} packets`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Low Stock Alerts & Priority Restocks */}
          <div className="admin-col-right">
            <div className="low-stock-panel">
              <div className="low-stock-header">
                <div>
                  <h2 className="low-stock-title">Low Stock Priorities</h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Items at or below alert thresholds
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onNavigateToInventory}
                >
                  Pantry &rarr;
                </button>
              </div>

              {lowStockSnacks.length === 0 ? (
                <div
                  style={{
                    background: 'var(--surface-subtle)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '24px 16px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '1.75rem', marginBottom: '6px' }}>🎉</div>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 4px 0' }}>
                    Pantry is Fully Stocked!
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: 0 }}>
                    No items currently breach their alert thresholds.
                  </p>
                </div>
              ) : (
                <div className="low-stock-list">
                  {lowStockSnacks.map((snack) => (
                    <div key={snack.id} className="low-stock-item">
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {snack.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                          <CategoryBadge category={snack.category} />
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            Stock: <strong>{snack.quantity}</strong> / {snack.lowStockThreshold}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ height: '30px', fontSize: '12px' }}
                        onClick={() => handleOpenRestock(snack)}
                      >
                        Restock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          MEMBER SPECIFIC SECTIONS:
          1. Snack of the Week Spotlight
          2. Recently Added Snacks Grid
          ------------------------------------------------------------- */}
      {!isAdmin && (
        <>
          {/* Featured Snack of the Week */}
          {summary?.snackOfTheWeek ? (
            <div className="snack-of-week-card">
              <div className="snack-of-week-content">
                <div className="snack-of-week-thumb">
                  <span>{getCategoryEmoji(summary.snackOfTheWeek.category)}</span>
                </div>
                <div className="snack-of-week-info">
                  <div className="snack-of-week-badge">
                    <span>👑</span> Official Snack of the Week
                  </div>
                  <h3>{summary.snackOfTheWeek.name}</h3>
                  <p style={{ opacity: 0.95, fontSize: '13px', margin: '2px 0 6px 0' }}>
                    Elected by the office community with {summary.snackOfTheWeek.voteCount} team votes!
                  </p>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <CategoryBadge category={summary.snackOfTheWeek.category} />
                    <StatusBadge status={summary.snackOfTheWeek.status} />
                  </div>
                </div>
              </div>
              <div>
                <button
                  type="button"
                  className="btn"
                  style={{
                    background: '#ffffff',
                    color: 'var(--primary)',
                    fontWeight: 700,
                    boxShadow: 'var(--shadow-sm)',
                  }}
                  onClick={onNavigateToInventory}
                >
                  Find in Pantry &rarr;
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: 'var(--surface)',
                border: '1px dashed var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '24px',
                textAlign: 'center',
                marginBottom: '24px',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '6px' }}>🗳️</div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>
                Snack of the Week Voting Open!
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '440px', margin: '0 auto 12px auto' }}>
                Cast your vote in the pantry inventory to help elect this week's top office favorite!
              </p>
              <button type="button" className="btn btn-primary" onClick={onNavigateToInventory}>
                Go Vote in Inventory &rarr;
              </button>
            </div>
          )}

          {/* Member Recently Added Snacks Grid */}
          <div style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)' }}>
                  Fresh in the Pantry
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Recently registered snack items waiting for you in the kitchen
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onNavigateToInventory}
              >
                View Full Pantry &rarr;
              </button>
            </div>

            {recentSnacks.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                No snacks in the pantry yet.
              </p>
            ) : (
              <div className="snack-grid">
                {recentSnacks.map((snack) => (
                  <div
                    key={snack.id}
                    className="snack-card"
                    style={{ height: '260px', minHeight: '260px', cursor: 'pointer' }}
                    onClick={onNavigateToInventory}
                    title="Click to view in pantry"
                  >
                    <div className="snack-card-image-container" style={{ height: '130px' }}>
                      {snack.imageUrl ? (
                        <img
                          src={snack.imageUrl}
                          alt={snack.name}
                          className="snack-card-image"
                          loading="lazy"
                        />
                      ) : (
                        <div className="snack-image-placeholder">
                          <span className="snack-placeholder-icon">
                            {getCategoryEmoji(snack.category)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                      <h4 className="snack-name" style={{ minHeight: 'auto' }}>
                        {snack.name}
                      </h4>
                      <CategoryBadge category={snack.category} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                      <StatusBadge status={snack.status} />
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        ❤️ {snack.voteCount || 0}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Restock Modal Triggered from Dashboard */}
      {isAdmin && (
        <RestockModal
          snack={restockTargetSnack}
          isOpen={isRestockModalOpen}
          onClose={() => {
            setIsRestockModalOpen(false);
            setRestockTargetSnack(null);
          }}
          onRestocked={fetchDashboardData}
        />
      )}
    </div>
  );
};

export default DashboardPage;
