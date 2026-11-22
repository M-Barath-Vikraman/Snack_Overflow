import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ActivityRecord, ActivityActionType, PaginationData, WsConnectionStatus } from '../types';
import activityService from '../services/activityService';
import { useWebSocket } from '../context/WebSocketContext';
import CategoryBadge from '../components/CategoryBadge';

export const ActivityPage: React.FC = () => {
  const { status: wsStatus, subscribe } = useWebSocket();
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Sorting state
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'amount'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);

  const prevWsStatusRef = useRef<WsConnectionStatus>(wsStatus);
  const debounceTimerRef = useRef<number | null>(null);

  // Debounce search input changes (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setCurrentPage(1); // Reset to page 1 on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Main data fetcher
  const fetchActivities = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await activityService.getActivities({
        page: currentPage,
        limit: 20,
        action: actionFilter !== 'ALL' ? (actionFilter as ActivityActionType) : undefined,
        search: debouncedSearch.trim() || undefined,
        sortBy,
        sortOrder,
      });

      if (res.success && res.data) {
        setActivities(res.data.activities);
        setPagination(res.data.pagination);
      } else {
        setError(res.message || 'Failed to fetch activity records.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while loading activities.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, actionFilter, debouncedSearch, sortBy, sortOrder]);

  // Initial and reactive fetch
  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Debounced refresh for real-time WebSocket events
  const triggerDebouncedRefresh = useCallback(() => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      fetchActivities();
    }, 250);
  }, [fetchActivities]);

  // Real-time synchronization on consumption and restocking
  useEffect(() => {
    const unsubConsumed = subscribe('SNACK_CONSUMED', () => {
      triggerDebouncedRefresh();
    });
    const unsubRestocked = subscribe('SNACK_RESTOCKED', () => {
      triggerDebouncedRefresh();
    });

    return () => {
      unsubConsumed();
      unsubRestocked();
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [subscribe, triggerDebouncedRefresh]);

  // Reconnection reconciliation: refresh data when connection recovers
  useEffect(() => {
    if (
      wsStatus === 'connected' &&
      (prevWsStatusRef.current === 'reconnecting' || prevWsStatusRef.current === 'disconnected')
    ) {
      fetchActivities();
    }
    prevWsStatusRef.current = wsStatus;
  }, [wsStatus, fetchActivities]);

  const handleSortChange = (value: string) => {
    switch (value) {
      case 'newest':
        setSortBy('createdAt');
        setSortOrder('desc');
        break;
      case 'oldest':
        setSortBy('createdAt');
        setSortOrder('asc');
        break;
      case 'highest_amount':
        setSortBy('amount');
        setSortOrder('desc');
        break;
      case 'lowest_amount':
        setSortBy('amount');
        setSortOrder('asc');
        break;
      default:
        setSortBy('createdAt');
        setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  const currentSortValue =
    sortBy === 'createdAt' && sortOrder === 'desc'
      ? 'newest'
      : sortBy === 'createdAt' && sortOrder === 'asc'
      ? 'oldest'
      : sortBy === 'amount' && sortOrder === 'desc'
      ? 'highest_amount'
      : 'lowest_amount';

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Activity History</h1>
          <p className="page-subtitle">
            Audit log of snack consumption and inventory restocks across the team
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => fetchActivities()}
          disabled={loading}
          title="Refresh activity logs"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Toolbar: Search, Action Filter, Sorting */}
      <div className="toolbar">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search by user name, email, or snack..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              style={{
                position: 'absolute',
                right: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              &times;
            </button>
          )}
        </div>

        <div className="filters-group">
          {/* Action Filter */}
          <select
            className="select-filter"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter by action"
          >
            <option value="ALL">All Actions</option>
            <option value="CONSUMED">Consumed</option>
            <option value="RESTOCKED">Restocked</option>
          </select>

          {/* Sort By */}
          <select
            className="select-filter"
            value={currentSortValue}
            onChange={(e) => handleSortChange(e.target.value)}
            aria-label="Sort activities"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="highest_amount">Highest Amount</option>
            <option value="lowest_amount">Lowest Amount</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div
          className="alert alert-danger"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <span>⚠️ {error}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fetchActivities()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state indicator */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem 0', color: '#64748b' }}>
          <div style={{ fontSize: '2rem', animation: 'spin 1s linear infinite', display: 'inline-block' }}>
            ⏳
          </div>
          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Loading activity logs...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && activities.length === 0 && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '3rem 1.5rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
          <h3 style={{ color: 'var(--text-main)', margin: '0 0 0.5rem 0', fontSize: '1.2rem' }}>
            No activity records found
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '420px', margin: '0 auto 1.25rem auto' }}>
            {searchInput || actionFilter !== 'ALL'
              ? 'No activity matches your current filters. Try clearing your search or selecting all actions.'
              : 'No snack consumption or restock activities have been recorded yet.'}
          </p>
          {(searchInput || actionFilter !== 'ALL') && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSearchInput('');
                setActionFilter('ALL');
                setCurrentPage(1);
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* Activity Table */}
      {!loading && !error && activities.length > 0 && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Snack</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((act) => {
                const isConsumed = act.action === 'CONSUMED';
                return (
                  <tr key={act.id}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {formatDate(act.createdAt)}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                        {act.user ? act.user.name : 'Unknown User'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {act.user ? act.user.email : '—'}
                      </div>
                    </td>
                    <td>
                      <span className={`action-badge ${isConsumed ? 'consumed' : 'restocked'}`}>
                        {isConsumed ? '😋 Consumed' : '📦 Restocked'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                          {act.snack ? act.snack.name : 'Deleted Snack'}
                        </span>
                        {act.snack && <CategoryBadge category={act.snack.category} />}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      <span style={{ color: isConsumed ? '#dc2626' : '#059669' }}>
                        {isConsumed ? `-${act.amount}` : `+${act.amount}`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && !error && pagination.totalPages > 1 && (
        <div className="pagination-bar">
          <div className="pagination-info">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            <strong>{pagination.total}</strong> activities
          </div>
          <div className="pagination-controls">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={pagination.page <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              &larr; Previous
            </button>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0 0.75rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--text-main)',
              }}
            >
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityPage;
