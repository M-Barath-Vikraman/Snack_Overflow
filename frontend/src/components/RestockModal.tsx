import React, { useState } from 'react';
import { Snack } from '../types';
import Modal from './Modal';
import snackService from '../services/snackService';

interface RestockModalProps {
  snack: Snack | null;
  isOpen: boolean;
  onClose: () => void;
  onRestocked: () => void;
}

export const RestockModal: React.FC<RestockModalProps> = ({
  snack,
  isOpen,
  onClose,
  onRestocked,
}) => {
  const [amount, setAmount] = useState<number>(10);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!snack) return null;

  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      setError('Restock amount must be a positive number.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await snackService.restockSnack(snack.id, amount);
      if (res.success) {
        onRestocked();
        onClose();
      } else {
        setError(res.message || 'Restock failed.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error.');
    } finally {
      setSubmitting(false);
    }
  };

  const previewNewStock = snack.quantity + (amount > 0 ? amount : 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Restock: ${snack.name}`}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleRestock} disabled={submitting}>
            {submitting ? 'Updating...' : `Add +${amount} Packets`}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-danger">{error}</div>}

      <div
        style={{
          background: '#f8fafc',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Current Stock</span>
          <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.2rem 0 0 0' }}>{snack.quantity}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Stock After Restock</span>
          <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.2rem 0 0 0', color: 'var(--status-in-stock)' }}>
            {previewNewStock}
          </p>
        </div>
      </div>

      <form onSubmit={handleRestock}>
        <div className="form-group">
          <label className="form-label" htmlFor="restock-amount">
            Packets to Add
          </label>
          <input
            id="restock-amount"
            type="number"
            min="1"
            className="form-input"
            value={amount}
            onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value, 10) || 1))}
            disabled={submitting}
            required
            autoFocus
          />
        </div>
      </form>
    </Modal>
  );
};

export default RestockModal;
