import React, { useState, useEffect } from 'react';
import { Snack, SnackCategoryType } from '../types';
import Modal from './Modal';
import snackService from '../services/snackService';

interface AddEditSnackModalProps {
  isOpen: boolean;
  onClose: () => void;
  snack: Snack | null; // null for Add, Snack object for Edit
  onSaved: () => void;
}

export const AddEditSnackModal: React.FC<AddEditSnackModalProps> = ({
  isOpen,
  onClose,
  snack,
  onSaved,
}) => {
  const isEditing = !!snack;

  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<SnackCategoryType>('SWEET');
  const [quantity, setQuantity] = useState<number>(10);
  const [threshold, setThreshold] = useState<number>(5);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (snack) {
      setName(snack.name);
      setCategory(snack.category);
      setQuantity(snack.quantity);
      setThreshold(snack.lowStockThreshold);
    } else {
      setName('');
      setCategory('SWEET');
      setQuantity(10);
      setThreshold(5);
    }
    setError(null);
  }, [snack, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Snack name is required.');
      return;
    }
    if (threshold < 0) {
      setError('Threshold cannot be negative.');
      return;
    }
    if (!isEditing && quantity < 0) {
      setError('Initial quantity cannot be negative.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      if (isEditing && snack) {
        const res = await snackService.updateSnack(snack.id, {
          name: name.trim(),
          category,
          lowStockThreshold: threshold,
        });
        if (res.success) {
          onSaved();
          onClose();
        } else {
          setError(res.message || 'Failed to update snack.');
        }
      } else {
        const res = await snackService.createSnack({
          name: name.trim(),
          category,
          quantity,
          lowStockThreshold: threshold,
        });
        if (res.success) {
          onSaved();
          onClose();
        } else {
          setError(res.message || 'Failed to create snack.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Snack Details' : 'Add New Snack Item'}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Snack'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="snack-name">
            Snack Name
          </label>
          <input
            id="snack-name"
            type="text"
            className="form-input"
            placeholder="e.g. Dark Chocolate Almonds"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="snack-category">
            Category
          </label>
          <select
            id="snack-category"
            className="form-input"
            value={category}
            onChange={(e) => setCategory(e.target.value as SnackCategoryType)}
            disabled={submitting}
          >
            <option value="SWEET">🍬 Sweet</option>
            <option value="SAVOURY">🥨 Savoury</option>
            <option value="DRINK">🥤 Drink</option>
            <option value="HEALTHY_ISH">🥗 Healthy-ish</option>
          </select>
        </div>

        {!isEditing && (
          <div className="form-group">
            <label className="form-label" htmlFor="snack-quantity">
              Initial Quantity
            </label>
            <input
              id="snack-quantity"
              type="number"
              min="0"
              className="form-input"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
              disabled={submitting}
              required
            />
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="snack-threshold">
            Low Stock Alert Threshold
          </label>
          <input
            id="snack-threshold"
            type="number"
            min="0"
            className="form-input"
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value, 10) || 0)}
            disabled={submitting}
            required
          />
          <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            When available packets drop to or below this amount, the item turns amber.
          </small>
        </div>
      </form>
    </Modal>
  );
};

export default AddEditSnackModal;
