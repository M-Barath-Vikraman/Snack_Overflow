import React, { useState, useEffect, useRef } from 'react';
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

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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

  // Image state
  const [imageError, setImageError] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const [imageOperationError, setImageOperationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImageError(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setImageOperationError(null);
    setError(null);
    setSuccessMsg(null);
    setAmount(1);
  }, [snack?.id, isOpen]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

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
        setSuccessMsg(`Successfully grabbed ${amount} ${amount === 1 ? 'packet' : 'packets'}! Enjoy your snack! 😋`);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageOperationError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setImageOperationError('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setImageOperationError('File size exceeds the 5 MB maximum limit.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
  };

  const handleUploadImage = async () => {
    if (!selectedFile) return;

    setImageLoading(true);
    setImageOperationError(null);

    try {
      const res = await snackService.uploadImage(snack.id, selectedFile);
      if (res.success && res.data) {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setImageError(false);
        setSuccessMsg('Snack image uploaded successfully.');
        onSnackUpdated();
      } else {
        setImageOperationError(res.message || 'Failed to upload snack image.');
      }
    } catch (err: any) {
      setImageOperationError(err.message || 'Network error uploading image.');
    } finally {
      setImageLoading(false);
    }
  };

  const handleDeleteImage = async () => {
    if (!window.confirm('Are you sure you want to remove the image for this snack?')) {
      return;
    }

    setImageLoading(true);
    setImageOperationError(null);

    try {
      const res = await snackService.deleteImage(snack.id);
      if (res.success) {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setImageError(false);
        setSuccessMsg('Snack image removed.');
        onSnackUpdated();
      } else {
        setImageOperationError(res.message || 'Failed to remove image.');
      }
    } catch (err: any) {
      setImageOperationError(err.message || 'Network error removing image.');
    } finally {
      setImageLoading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={snack.name}>
      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      {/* Snack Image / Category Fallback */}
      <div className="snack-detail-image-container">
        {snack.imageUrl && !imageError ? (
          <img
            src={snack.imageUrl}
            alt={snack.name}
            className="snack-detail-image"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="snack-image-placeholder">
            <span className="snack-placeholder-icon" style={{ fontSize: '3.5rem' }}>
              {getCategoryEmoji(snack.category)}
            </span>
            <span style={{ fontSize: '0.85rem' }}>No photo uploaded</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center' }}>
        <CategoryBadge category={snack.category} />
        <StatusBadge status={snack.status} />
      </div>

      {/* Stock Information Metric Box */}
      <div
        style={{
          background: 'var(--surface-subtle)',
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
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Current Available</span>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.2rem 0 0 0', color: snack.quantity === 0 ? 'var(--status-out-stock)' : 'inherit' }}>
            {snack.quantity} {snack.quantity === 1 ? 'packet' : 'packets'}
          </p>
        </div>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Alert Threshold</span>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.2rem 0 0 0' }}>
            {snack.lowStockThreshold}
          </p>
        </div>
      </div>

      {/* -------------------------------------------------------------
          MEMBER EXPERIENCE IN MODAL:
          1. Team Popularity with Vote Button
          2. Grab a Snack Consumption Form
          ------------------------------------------------------------- */}
      {!isAdmin && (
        <>
          {/* Member Voting Section */}
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Team Popularity</h4>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {snack.voteCount || 0} {(snack.voteCount || 0) === 1 ? 'team member votes for this' : 'team members vote for this'}
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

          {/* Member Consumption Section */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginBottom: '0.5rem' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem' }}>Grab a Snack</h4>
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
                {consuming ? 'Processing...' : snack.quantity <= 0 ? 'Out of Stock' : `Grab ${amount} ${amount === 1 ? 'Packet' : 'Packets'}`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* -------------------------------------------------------------
          ADMIN EXPERIENCE IN MODAL:
          1. Team Popularity (View Only - NO voting button)
          2. Image Management (Upload, Replace, Delete)
          3. Administrative Operations (Edit, Restock, Delete)
          ------------------------------------------------------------- */}
      {isAdmin && (
        <>
          {/* Admin Popularity View */}
          <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Team Popularity</h4>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {snack.voteCount || 0} total employee votes
              </span>
            </div>
          </div>

          {/* Admin Image Management Section */}
          <div className="image-management-section">
            <div className="image-management-header">
              <h4 className="image-management-title">Image Management</h4>
              {snack.imageUrl && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={handleDeleteImage}
                  disabled={imageLoading}
                >
                  {imageLoading ? 'Removing...' : 'Remove Photo'}
                </button>
              )}
            </div>

            {imageOperationError && (
              <div className="alert alert-danger" style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                {imageOperationError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                disabled={imageLoading}
                className="form-input"
                style={{ fontSize: '0.85rem' }}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Formats: JPEG, PNG, WebP. Maximum size: 5 MB.
              </small>

              {previewUrl && selectedFile && (
                <div className="image-upload-preview">
                  <img src={previewUrl} alt="Upload preview" className="image-upload-preview-img" />
                  <div className="image-upload-preview-info">
                    <div className="image-upload-preview-name">{selectedFile.name}</div>
                    <div className="image-upload-preview-size">{formatFileSize(selectedFile.size)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleUploadImage}
                      disabled={imageLoading}
                    >
                      {imageLoading ? 'Uploading...' : snack.imageUrl ? 'Replace' : 'Upload'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      disabled={imageLoading}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Admin Management Actions: Edit, Restock, Delete */}
          <div
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: '1.25rem',
              marginTop: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '0.5rem',
              flexWrap: 'wrap',
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
                  ✏️ Edit Details
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
                  📦 Restock Inventory
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
                🗑️ Delete
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
};

export default SnackDetailModal;
