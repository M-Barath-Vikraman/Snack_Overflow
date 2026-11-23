import React, { useState, useEffect, useRef } from 'react';
import { Snack, SnackCategoryType } from '../types';
import Modal from './Modal';
import snackService from '../services/snackService';

interface AddEditSnackModalProps {
  isOpen: boolean;
  onClose: () => void;
  snack: Snack | null; // null for Add, Snack object for Edit
  onSaved: () => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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

  // Image upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeExistingImage, setRemoveExistingImage] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (snack) {
      setName(snack.name);
      setCategory(snack.category);
      setQuantity(snack.quantity);
      setThreshold(snack.lowStockThreshold);
      setRemoveExistingImage(false);
    } else {
      setName('');
      setCategory('SWEET');
      setQuantity(10);
      setThreshold(5);
      setRemoveExistingImage(false);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
  }, [snack, isOpen]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError('Invalid image format. Only JPEG, PNG, and WebP are allowed.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('Image file exceeds the 5 MB maximum limit.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
    setRemoveExistingImage(false);
  };

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
        // 1. Update basic details
        const res = await snackService.updateSnack(snack.id, {
          name: name.trim(),
          category,
          lowStockThreshold: threshold,
        });

        if (!res.success) {
          setError(res.message || 'Failed to update snack.');
          setSubmitting(false);
          return;
        }

        // 2. Handle image upload or removal
        if (selectedFile) {
          const uploadRes = await snackService.uploadImage(snack.id, selectedFile);
          if (!uploadRes.success) {
            setError(`Snack updated, but image upload failed: ${uploadRes.message}`);
            setSubmitting(false);
            return;
          }
        } else if (removeExistingImage && snack.imageUrl) {
          const deleteRes = await snackService.deleteImage(snack.id);
          if (!deleteRes.success) {
            setError(`Snack updated, but image removal failed: ${deleteRes.message}`);
            setSubmitting(false);
            return;
          }
        }

        onSaved();
        onClose();
      } else {
        // 1. Create snack
        const res = await snackService.createSnack({
          name: name.trim(),
          category,
          quantity,
          lowStockThreshold: threshold,
        });

        if (!res.success || !res.data) {
          setError(res.message || 'Failed to create snack.');
          setSubmitting(false);
          return;
        }

        const newSnack = res.data;

        // 2. If image selected, upload image
        if (selectedFile) {
          const uploadRes = await snackService.uploadImage(newSnack.id, selectedFile);
          if (!uploadRes.success) {
            setError(`Snack created, but image upload failed: ${uploadRes.message}`);
            setSubmitting(false);
            return;
          }
        }

        onSaved();
        onClose();
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

        {/* Image Upload Field */}
        <div className="form-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <label className="form-label" htmlFor="snack-image-input">
            {isEditing ? 'Snack Image (Optional)' : 'Upload Snack Photo (Optional)'}
          </label>

          {isEditing && snack?.imageUrl && !removeExistingImage && !selectedFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <img
                src={snack.imageUrl}
                alt={snack.name}
                style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Current photo uploaded</div>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  style={{ marginTop: '0.25rem', color: '#dc2626' }}
                  onClick={() => setRemoveExistingImage(true)}
                >
                  Remove current photo
                </button>
              </div>
            </div>
          )}

          {removeExistingImage && (
            <div className="alert alert-info" style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem', marginBottom: '0.75rem' }}>
              Current photo will be deleted on save.{' '}
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer' }}
                onClick={() => setRemoveExistingImage(false)}
              >
                Undo
              </button>
            </div>
          )}

          <input
            id="snack-image-input"
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={submitting}
            className="form-input"
            style={{ fontSize: '0.85rem' }}
          />
          <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            Supports JPEG, PNG, or WebP up to 5 MB.
          </small>

          {previewUrl && selectedFile && (
            <div className="image-upload-preview">
              <img src={previewUrl} alt="Selected preview" className="image-upload-preview-img" />
              <div className="image-upload-preview-info">
                <div className="image-upload-preview-name">{selectedFile.name}</div>
                <div className="image-upload-preview-size">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={submitting}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
};

export default AddEditSnackModal;
