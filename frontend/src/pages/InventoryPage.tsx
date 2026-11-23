import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Snack,
  SnackCategoryType,
  SnackStatusType,
  PaginationData,
  WsConnectionStatus,
} from '../types';
import snackService from '../services/snackService';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import SnackCard from '../components/SnackCard';
import SnackDetailModal from '../components/SnackDetailModal';
import AddEditSnackModal from '../components/AddEditSnackModal';
import RestockModal from '../components/RestockModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';

interface InventoryPageProps {
  onOpenAddSnackRef?: (openFn: () => void) => void;
}

export const InventoryPage: React.FC<InventoryPageProps> = () => {
  const { isAdmin } = useAuth();
  const { status: wsStatus, subscribe } = useWebSocket();

  // Inventory state
  const [snacks, setSnacks] = useState<Snack[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'name' | 'quantity' | 'category'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState<number>(1);

  // Modals state
  const [selectedSnack, setSelectedSnack] = useState<Snack | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState<boolean>(false);
  const [editingSnack, setEditingSnack] = useState<Snack | null>(null);
  const [restockingSnack, setRestockingSnack] = useState<Snack | null>(null);
  const [isRestockModalOpen, setIsRestockModalOpen] = useState<boolean>(false);
  const [deletingSnack, setDeletingSnack] = useState<Snack | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);

  // In-flight voting state to prevent duplicate rapid clicks
  const [votingIds, setVotingIds] = useState<Record<string, boolean>>({});

  // Search debounce ref & WebSocket status tracker ref
  const searchTimeoutRef = useRef<number | null>(null);
  const prevWsStatusRef = useRef<WsConnectionStatus>(wsStatus);

  const fetchSnacks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await snackService.getSnacks({
        search: searchTerm || undefined,
        category: (selectedCategory as SnackCategoryType) || undefined,
        status: (selectedStatus as SnackStatusType) || undefined,
        sortBy,
        sortOrder,
        page,
        limit: 12,
      });

      if (res.success && res.data) {
        setSnacks(res.data.snacks);
        setPagination(res.data.pagination);
      } else {
        setError(res.message || 'Failed to load snacks.');
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to service.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedCategory, selectedStatus, sortBy, sortOrder, page]);

  useEffect(() => {
    fetchSnacks();
  }, [fetchSnacks]);

  // Real-time synchronization via WebSockets
  useEffect(() => {
    const unsubConsumed = subscribe('SNACK_CONSUMED', (event) => {
      const payload = event.payload;
      if (!payload || !payload.snackId) return;

      setSnacks((prev) =>
        prev.map((s) =>
          s.id === payload.snackId
            ? {
                ...s,
                quantity: payload.quantity,
                status: payload.status,
                voteCount: payload.voteCount !== undefined ? payload.voteCount : s.voteCount,
                updatedAt: payload.updatedAt || s.updatedAt,
              }
            : s
        )
      );

      setSelectedSnack((prev) =>
        prev && prev.id === payload.snackId
          ? {
              ...prev,
              quantity: payload.quantity,
              status: payload.status,
              voteCount: payload.voteCount !== undefined ? payload.voteCount : prev.voteCount,
              updatedAt: payload.updatedAt || prev.updatedAt,
            }
          : prev
      );
    });

    const unsubRestocked = subscribe('SNACK_RESTOCKED', (event) => {
      const payload = event.payload;
      if (!payload || !payload.snackId) return;

      setSnacks((prev) =>
        prev.map((s) =>
          s.id === payload.snackId
            ? {
                ...s,
                quantity: payload.quantity,
                status: payload.status,
                voteCount: payload.voteCount !== undefined ? payload.voteCount : s.voteCount,
                updatedAt: payload.updatedAt || s.updatedAt,
              }
            : s
        )
      );

      setSelectedSnack((prev) =>
        prev && prev.id === payload.snackId
          ? {
              ...prev,
              quantity: payload.quantity,
              status: payload.status,
              voteCount: payload.voteCount !== undefined ? payload.voteCount : prev.voteCount,
              updatedAt: payload.updatedAt || prev.updatedAt,
            }
          : prev
      );
    });

    const unsubVoted = subscribe('SNACK_VOTED', (event) => {
      const payload = event.payload;
      if (!payload || !payload.snackId) return;

      setSnacks((prev) =>
        prev.map((s) =>
          s.id === payload.snackId ? { ...s, voteCount: payload.totalVotes } : s
        )
      );

      setSelectedSnack((prev) =>
        prev && prev.id === payload.snackId ? { ...prev, voteCount: payload.totalVotes } : prev
      );
    });

    const unsubUnvoted = subscribe('SNACK_UNVOTED', (event) => {
      const payload = event.payload;
      if (!payload || !payload.snackId) return;

      setSnacks((prev) =>
        prev.map((s) =>
          s.id === payload.snackId ? { ...s, voteCount: payload.totalVotes } : s
        )
      );

      setSelectedSnack((prev) =>
        prev && prev.id === payload.snackId ? { ...prev, voteCount: payload.totalVotes } : prev
      );
    });

    const unsubCreated = subscribe('SNACK_CREATED', () => {
      fetchSnacks();
    });

    const unsubUpdated = subscribe('SNACK_UPDATED', (event) => {
      const payload = event.payload;
      if (!payload || !payload.snack) return;
      const updated = payload.snack;

      setSnacks((prev) =>
        prev.map((s) =>
          s.id === updated.id
            ? {
                ...s,
                ...updated,
                voteCount: updated.voteCount !== undefined ? updated.voteCount : s.voteCount,
              }
            : s
        )
      );

      setSelectedSnack((prev) =>
        prev && prev.id === updated.id ? { ...prev, ...updated } : prev
      );
    });

    const unsubDeleted = subscribe('SNACK_DELETED', (event) => {
      const snackId = event.snackId || event.payload?.snackId;
      if (!snackId) return;

      setSnacks((prev) => prev.filter((s) => s.id !== snackId));
      setSelectedSnack((prev) => (prev && prev.id === snackId ? null : prev));
      setPagination((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
    });

    return () => {
      unsubConsumed();
      unsubRestocked();
      unsubVoted();
      unsubUnvoted();
      unsubCreated();
      unsubUpdated();
      unsubDeleted();
    };
  }, [subscribe, fetchSnacks]);

  // Reconnection reconciliation
  useEffect(() => {
    if (
      wsStatus === 'connected' &&
      (prevWsStatusRef.current === 'reconnecting' || prevWsStatusRef.current === 'disconnected')
    ) {
      fetchSnacks();
    }
    prevWsStatusRef.current = wsStatus;
  }, [wsStatus, fetchSnacks]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = window.setTimeout(() => {
      setSearchTerm(value);
      setPage(1);
    }, 300);
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCategory(e.target.value);
    setPage(1);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedStatus(e.target.value);
    setPage(1);
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'name_asc') {
      setSortBy('name');
      setSortOrder('asc');
    } else if (value === 'quantity_desc') {
      setSortBy('quantity');
      setSortOrder('desc');
    } else if (value === 'quantity_asc') {
      setSortBy('quantity');
      setSortOrder('asc');
    } else {
      setSortBy('createdAt');
      setSortOrder('desc');
    }
    setPage(1);
  };

  /**
   * Optimistic Consumption with Automatic Rollback on Failure.
   * Member-only capability.
   */
  const handleQuickConsume = async (e: React.MouseEvent, snack: Snack) => {
    e.stopPropagation();
    if (snack.quantity <= 0) return;

    const previousSnacks = [...snacks];
    const targetSnack = snacks.find((s) => s.id === snack.id);
    if (!targetSnack) return;

    const newQuantity = Math.max(0, targetSnack.quantity - 1);
    const newStatus: SnackStatusType =
      newQuantity <= 0
        ? 'OUT_OF_STOCK'
        : newQuantity <= targetSnack.lowStockThreshold
        ? 'LOW_STOCK'
        : 'IN_STOCK';

    setSnacks((prev) =>
      prev.map((s) =>
        s.id === snack.id ? { ...s, quantity: newQuantity, status: newStatus } : s
      )
    );

    try {
      const res = await snackService.consumeSnack(snack.id, 1);
      if (res.success && res.data) {
        const serverSnack = res.data.snack;
        setSnacks((prev) =>
          prev.map((s) =>
            s.id === snack.id
              ? {
                  ...s,
                  quantity: serverSnack.quantity,
                  status: serverSnack.status,
                  voteCount: serverSnack.voteCount ?? s.voteCount,
                  updatedAt: serverSnack.updatedAt,
                }
              : s
          )
        );
      } else {
        setSnacks(previousSnacks);
        const errMsg =
          res.error?.code === 'INSUFFICIENT_STOCK' ||
          res.message?.includes('last packet') ||
          res.message?.includes('insufficient')
            ? 'Someone beat you to the last packet!'
            : res.message || 'Consumption failed.';
        alert(errMsg);
      }
    } catch (err: any) {
      setSnacks(previousSnacks);
      alert(err.message || 'Network error during consumption.');
    }
  };

  /**
   * Optimistic Voting with Automatic Rollback on Failure.
   * Member-only capability.
   */
  const handleVoteToggle = async (e: React.MouseEvent, snackId: string) => {
    e.stopPropagation();
    if (votingIds[snackId]) return;

    const targetSnack = snacks.find((s) => s.id === snackId);
    if (!targetSnack) return;

    const previousSnacks = [...snacks];
    const prevVoted = !!targetSnack.hasUserVoted;
    const prevCount = targetSnack.voteCount || 0;
    const nextVoted = !prevVoted;
    const nextCount = Math.max(0, prevCount + (prevVoted ? -1 : 1));

    setVotingIds((prev) => ({ ...prev, [snackId]: true }));

    setSnacks((prev) =>
      prev.map((s) =>
        s.id === snackId ? { ...s, hasUserVoted: nextVoted, voteCount: nextCount } : s
      )
    );

    try {
      const res = prevVoted
        ? await snackService.unvoteSnack(snackId)
        : await snackService.voteSnack(snackId);

      if (res.success && res.data) {
        const serverTotalVotes = res.data.totalVotes;
        const serverUserVoted = res.data.userVoted;
        setSnacks((prev) =>
          prev.map((s) =>
            s.id === snackId
              ? { ...s, voteCount: serverTotalVotes, hasUserVoted: serverUserVoted }
              : s
          )
        );
      } else {
        setSnacks(previousSnacks);
        alert(res.message || 'Voting operation failed.');
      }
    } catch (err: any) {
      setSnacks(previousSnacks);
      alert(err.message || 'Network error during vote update.');
    } finally {
      setVotingIds((prev) => {
        const next = { ...prev };
        delete next[snackId];
        return next;
      });
    }
  };

  const handleSelectSnack = (snack: Snack) => {
    setSelectedSnack(snack);
    setIsDetailModalOpen(true);
  };

  const handleOpenAdd = () => {
    setEditingSnack(null);
    setIsAddEditModalOpen(true);
  };

  const handleOpenEdit = (snack: Snack) => {
    setEditingSnack(snack);
    setIsAddEditModalOpen(true);
  };

  const handleOpenRestock = (snack: Snack) => {
    setRestockingSnack(snack);
    setIsRestockModalOpen(true);
  };

  const handleOpenDelete = (snack: Snack) => {
    setDeletingSnack(snack);
    setIsDeleteModalOpen(true);
  };

  return (
    <div className="page-container">
      {/* -------------------------------------------------------------
          Role-Specific Page Header
          ------------------------------------------------------------- */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isAdmin ? 'Snack Pantry Inventory' : 'Office Pantry'}
          </h1>
          <p className="page-subtitle">
            {isAdmin
              ? `Manage stock levels, categories, and snack catalog • ${pagination.total} snacks total`
              : `Browse, discover, and grab snacks from the team kitchen • ${pagination.total} snacks available`}
          </p>
        </div>

        {/* Add New Snack: STRICTLY ADMIN ONLY */}
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={handleOpenAdd}>
            + Add New Snack
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Toolbar: Search, Category, Status, Sort */}
      <div className="toolbar">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search snacks by name..."
            defaultValue={searchTerm}
            onChange={handleSearchChange}
          />
        </div>

        <div className="filters-group">
          <select
            className="select-filter"
            value={selectedCategory}
            onChange={handleCategoryChange}
            aria-label="Filter by Category"
          >
            <option value="">All Categories</option>
            <option value="SWEET">🍬 Sweet</option>
            <option value="SAVOURY">🥨 Savoury</option>
            <option value="DRINK">🥤 Drink</option>
            <option value="HEALTHY_ISH">🥗 Healthy-ish</option>
          </select>

          <select
            className="select-filter"
            value={selectedStatus}
            onChange={handleStatusChange}
            aria-label="Filter by Stock Status"
          >
            <option value="">All Statuses</option>
            <option value="IN_STOCK">In Stock</option>
            <option value="LOW_STOCK">Low Stock</option>
            <option value="OUT_OF_STOCK">Out of Stock</option>
          </select>

          <select
            className="select-filter"
            defaultValue="createdAt_desc"
            onChange={handleSortChange}
            aria-label="Sort snacks by"
          >
            <option value="createdAt_desc">Newest First</option>
            <option value="name_asc">Name (A–Z)</option>
            <option value="quantity_desc">Highest Stock</option>
            <option value="quantity_asc">Lowest Stock</option>
          </select>
        </div>
      </div>

      {/* Snack Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '5rem 1rem' }}>
          <div style={{ fontSize: '2.5rem', animation: 'bounce 1s infinite' }}>🍿</div>
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem', fontWeight: 500 }}>
            Loading snacks from pantry...
          </p>
        </div>
      ) : snacks.length === 0 ? (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '4rem 1.5rem',
            textAlign: 'center',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🍪</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.35rem' }}>
            No snacks found
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '420px', margin: '0 auto' }}>
            Try adjusting your search query, clearing your filters, or checking back later!
          </p>
        </div>
      ) : (
        <div className="snack-grid">
          {snacks.map((snack) => (
            <SnackCard
              key={snack.id}
              snack={snack}
              onSelect={handleSelectSnack}
              onVote={!isAdmin ? handleVoteToggle : undefined}
              onQuickConsume={!isAdmin ? handleQuickConsume : undefined}
              isAdmin={isAdmin}
              onRestockClick={
                isAdmin
                  ? (e, s) => {
                      e.stopPropagation();
                      handleOpenRestock(s);
                    }
                  : undefined
              }
              onEditClick={
                isAdmin
                  ? (e, s) => {
                      e.stopPropagation();
                      handleOpenEdit(s);
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Server-side Pagination Bar */}
      {pagination.totalPages > 1 && (
        <div className="pagination-bar">
          <div className="pagination-info">
            Showing Page {pagination.page} of {pagination.totalPages} ({pagination.total} total items)
          </div>
          <div className="pagination-controls">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              &larr; Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Snack Detail Modal */}
      <SnackDetailModal
        snack={selectedSnack}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedSnack(null);
        }}
        isAdmin={isAdmin}
        onSnackUpdated={fetchSnacks}
        onOpenEdit={handleOpenEdit}
        onOpenRestock={handleOpenRestock}
        onOpenDelete={handleOpenDelete}
      />

      {/* Admin Add/Edit Modal */}
      {isAdmin && (
        <AddEditSnackModal
          isOpen={isAddEditModalOpen}
          onClose={() => {
            setIsAddEditModalOpen(false);
            setEditingSnack(null);
          }}
          snack={editingSnack}
          onSaved={fetchSnacks}
        />
      )}

      {/* Admin Restock Modal */}
      {isAdmin && (
        <RestockModal
          snack={restockingSnack}
          isOpen={isRestockModalOpen}
          onClose={() => {
            setIsRestockModalOpen(false);
            setRestockingSnack(null);
          }}
          onRestocked={fetchSnacks}
        />
      )}

      {/* Admin Delete Confirmation Modal */}
      {isAdmin && (
        <DeleteConfirmModal
          snack={deletingSnack}
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setDeletingSnack(null);
          }}
          onDeleted={fetchSnacks}
        />
      )}
    </div>
  );
};

export default InventoryPage;
