import React, { useState } from 'react';
import { Snack } from '../types';
import Modal from './Modal';
import snackService from '../services/snackService';

interface DeleteConfirmModalProps {
  snack: Snack | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  snack,
  isOpen,
  onClose,
  onDeleted,
}) => {
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!snack) return null;

  const handleDelete = async () => {
    setError(null);
    setSubmitting(true);

    try {
      const res = await snackService.deleteSnack(snack.id);
      if (res.success) {
        onDeleted();
        onClose();
      } else {
        if (
          res.error?.code === 'RESTRICTED_BY_ACTIVITY_HISTORY' ||
          res.error?.code === 'RELATION_RESTRICTED' ||
          res.message?.includes('historical') ||
          res.message?.includes('RESTRICT') ||
          res.message?.includes('audit') ||
          res.message?.includes('activity')
        ) {
          setError(
            'Cannot delete this snack: Historical consumption or restock records exist for this item in the activity audit trail. ' +
            'Referential integrity preserves all historical data.'
          );
        } else {
          setError(res.message || 'Failed to delete snack.');
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
      title="Delete Snack Item"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={submitting}>
            {submitting ? 'Deleting...' : 'Confirm Delete'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-danger">{error}</div>}

      <p style={{ color: 'var(--text-main)', marginBottom: '1rem' }}>
        Are you sure you want to permanently delete <strong>{snack.name}</strong>?
      </p>

      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        Note: If any team members have already consumed or restocked this snack, the system will prevent deletion to preserve the audit log history.
      </p>
    </Modal>
  );
};

export default DeleteConfirmModal;
