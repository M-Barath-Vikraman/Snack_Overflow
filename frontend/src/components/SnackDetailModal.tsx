import React, { useState } from 'react';
import { Snack } from '../types';
import Modal from './Modal';
import StatusBadge from './StatusBadge';
import CategoryBadge from './CategoryBadge';
import snackService from '../services/snackService';

interface SnackDetailModalProps {
  snack: Snack | null;
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onSnackUpdated: () => void;
  onOpenEdit?: (snack: Snack) => void;
  onOpenRestock?: (snack: Snack) => void;
  onOpenDelete?: (snack: Snack) => void;
}

export const SnackDetailModal: React.FC<SnackDetailModalProps> = ({
  snack,
  isOpen,
  onClose,
  isAdmin,
  onSnackUpdated,
  onOpenEdit,
  onOpenRestock,
  onOpenDelete,
}) => {
  const [amount, setAmount] = useState<number>(1);
  const [consuming, setConsuming] = useState<boolean>(false);
  const [voting, setVoting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!snack) return null;

  const handleConsume = async () => {
    if (amount <= 0) {
      setError('Consumption amount must be at least 1.');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setConsuming(true);

    try {
      const res = await snackService.consumeSnack(snack.id, amount);
      if (res.success) {
        setSuccessMsg(`Successfully consumed ${amount} ${amount === 1 ? 'packet' : 'packets'}! Enjoy! 😋`);
        onSnackUpdated();
      } else {
        if (res.error?.code === 'INSUFFICIENT_STOCK' || res.message?.includes('last packet')) {
          setError('Someone beat you to the last packet! Inventory has run out.');
        } else {
          setError(res.message || 'Failed to consume snack.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred.');
    } finally {
      setConsuming(false);
    }
  };

  const handleToggleVote = async () => {
    setError(null);
    setSuccessMsg(null);
    setVoting(true);

    try {
      if (snack.hasUserVoted) {
        const res = await snackService.unvoteSnack(snack.id);
        if (res.success) {
          onSnackUpdated();
        } else {
          setError(res.message || 'Failed to remove vote.');
        }
      } else {
        const res = await snackService.voteSnack(snack.id);
        if (res.success) {
          onSnackUpdated();
        } else {
          setError(res.message || 'Failed to record vote.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network error.');
    } finally {
      setVoting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={snack.name}>
      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <CategoryBadge category={snack.category} />
        <StatusBadge status={snack.status} />
      </div>

      <div
        style={{
          background: '#f8fafc',
          borderRadius: 'var(--radius-sm)',
          padding: '1rem',
          marginBottom: '1.5rem',
          border: '1px solid var(--border)',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '1rem',
        }}
      >
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Current Stock</span>
          <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.2rem 0 0 0' }}>
            {snack.quantity}
          </p>
        </div>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Low Stock Alert</span>
          <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.2rem 0 0 0' }}>
            {snack.lowStockThreshold}
          </p>
        </div>
      </div>

      {/* Voting Section */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Team Popularity</h4>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {snack.voteCount || 0} {(snack.voteCount || 0) === 1 ? 'member loves this' : 'members love this'}
          </span>
        </div>
        <button
          type="button"
          className={`vote-btn ${snack.hasUserVoted ? 'voted' : ''}`}
          onClick={handleToggleVote}
          disabled={voting}
        >
          <span>{snack.hasUserVoted ? '❤️ Voted' : '🤍 Vote'}</span>
        </button>
      </div>

      {/* Consumption Section */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginBottom: '1.25rem' }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>Grab a Snack</h4>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ width: '90px' }}>
            <input
              type="number"
              min="1"
              max={Math.max(snack.quantity, 1)}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="form-input"
              disabled={snack.quantity <= 0 || consuming}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={handleConsume}
            disabled={snack.quantity <= 0 || consuming}
          >
            {consuming ? 'Processing...' : snack.quantity <= 0 ? 'Out of Stock' : `Consume (${amount})`}
          </button>
        </div>
      </div>

      {/* Admin Actions */}
      {isAdmin && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: '1rem',
            marginTop: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {onOpenEdit && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  onClose();
                  onOpenEdit(snack);
                }}
              >
                Edit Details
              </button>
            )}
            {onOpenRestock && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  onClose();
                  onOpenRestock(snack);
                }}
              >
                Restock Stock
              </button>
            )}
          </div>
          {onOpenDelete && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                onClose();
                onOpenDelete(snack);
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </Modal>
  );
};

export default SnackDetailModal;
