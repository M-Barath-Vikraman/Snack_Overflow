import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Snack,
  SnackCategoryType,
  SnackStatusType,
  PaginationData,
} from '../types';
import snackService from '../services/snackService';
import { useAuth } from '../context/AuthContext';
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

  // Search debounce ref
  const searchTimeoutRef = useRef<number | null>(null);

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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = window.setTimeout(() => {
      setSearchTerm(value);
      setPage(1); // Reset to page 1 on new search
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

  // Quick Consume from card
  const handleQuickConsume = async (e: React.MouseEvent, snack: Snack) => {
    e.stopPropagation();
    try {
      const res = await snackService.consumeSnack(snack.id, 1);
      if (res.success) {
        fetchSnacks();
      } else {
        alert(
          res.error?.code === 'INSUFFICIENT_STOCK' || res.message?.includes('last packet')
            ? 'Someone beat you to the last packet!'
            : res.message || 'Consumption failed.'
        );
      }
    } catch (err: any) {
      alert(err.message || 'Network error.');
    }
  };

  // Vote / Unvote from card
  const handleVoteToggle = async (e: React.MouseEvent, snackId: string) => {
    e.stopPropagation();
    const snack = snacks.find((s) => s.id === snackId);
    if (!snack) return;

    try {
      if (snack.hasUserVoted) {
        await snackService.unvoteSnack(snackId);
      } else {
        await snackService.voteSnack(snackId);
      }
      fetchSnacks();
    } catch (err: any) {
      console.error('Voting error:', err);
    }
  };

  // Card select -> Open Details Modal
  const handleSelectSnack = (snack: Snack) => {
    setSelectedSnack(snack);
    setIsDetailModalOpen(true);
  };

  // Admin open Add modal
  const handleOpenAdd = () => {
    setEditingSnack(null);
    setIsAddEditModalOpen(true);
  };

  // Admin open Edit modal
  const handleOpenEdit = (snack: Snack) => {
    setEditingSnack(snack);
    setIsAddEditModalOpen(true);
  };

  // Admin open Restock modal
  const handleOpenRestock = (snack: Snack) => {
    setRestockingSnack(snack);
    setIsRestockModalOpen(true);
  };

  // Admin open Delete modal
  const handleOpenDelete = (snack: Snack) => {
    setDeletingSnack(snack);
    setIsDeleteModalOpen(true);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Snack Pantry Inventory</h1>
          <p className="page-subtitle">
            Showing {pagination.total} snacks &bull; Page {pagination.page} of {pagination.totalPages}
          </p>
        </div>
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
        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>Loading snacks from pantry...</p>
        </div>
      ) : snacks.length === 0 ? (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '4rem 1rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🍪</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            No snacks found
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Try adjusting your search query or removing active filters.
          </p>
        </div>
      ) : (
        <div className="snack-grid">
          {snacks.map((snack) => (
            <SnackCard
              key={snack.id}
              snack={snack}
              onSelect={handleSelectSnack}
              onVote={handleVoteToggle}
              onQuickConsume={handleQuickConsume}
              isAdmin={isAdmin}
              onRestockClick={(e, s) => {
                e.stopPropagation();
                handleOpenRestock(s);
              }}
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
      <AddEditSnackModal
        isOpen={isAddEditModalOpen}
        onClose={() => {
          setIsAddEditModalOpen(false);
          setEditingSnack(null);
        }}
        snack={editingSnack}
        onSaved={fetchSnacks}
      />

      {/* Admin Restock Modal */}
      <RestockModal
        snack={restockingSnack}
        isOpen={isRestockModalOpen}
        onClose={() => {
          setIsRestockModalOpen(false);
          setRestockingSnack(null);
        }}
        onRestocked={fetchSnacks}
      />

      {/* Admin Delete Confirmation Modal */}
      <DeleteConfirmModal
        snack={deletingSnack}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingSnack(null);
        }}
        onDeleted={fetchSnacks}
      />
    </div>
  );
};

export default InventoryPage;
