import React, { useState, useEffect } from 'react';
import { Snack } from '../types';
import StatusBadge from './StatusBadge';
import CategoryBadge from './CategoryBadge';

interface SnackCardProps {
  snack: Snack;
  onSelect: (snack: Snack) => void;
  onVote?: (e: React.MouseEvent, snackId: string) => void;
  onQuickConsume?: (e: React.MouseEvent, snack: Snack) => void;
  isAdmin: boolean;
  onRestockClick?: (e: React.MouseEvent, snack: Snack) => void;
  onEditClick?: (e: React.MouseEvent, snack: Snack) => void;
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

export const SnackCard: React.FC<SnackCardProps> = ({
  snack,
  onSelect,
  onVote,
  onQuickConsume,
  isAdmin,
  onRestockClick,
  onEditClick,
}) => {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [snack.imageUrl]);

  // Compute stock fill percentage based on quantity relative to benchmark
  const maxBenchmark = Math.max(snack.lowStockThreshold * 2, 10);
  const percentage = Math.min(Math.round((snack.quantity / maxBenchmark) * 100), 100);

  const getMeterColor = () => {
    if (snack.status === 'IN_STOCK') return 'var(--status-in-stock)';
    if (snack.status === 'LOW_STOCK') return 'var(--status-low-stock)';
    return 'var(--status-out-stock)';
  };

  return (
    <div
      className="snack-card"
      onClick={() => onSelect(snack)}
      style={{ cursor: 'pointer' }}
      title={`Click to view details for ${snack.name}`}
    >
      {/* 16:10 Aspect Ratio Image Container */}
      <div className="snack-card-image-container">
        {snack.imageUrl && !imageError ? (
          <img
            src={snack.imageUrl}
            alt={snack.name}
            className="snack-card-image"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="snack-image-placeholder">
            <span className="snack-placeholder-icon" role="img" aria-label={snack.category}>
              {getCategoryEmoji(snack.category)}
            </span>
          </div>
        )}
      </div>

      <div className="snack-card-header">
        <h4 className="snack-name">{snack.name}</h4>
        <CategoryBadge category={snack.category} />
      </div>

      <div style={{ margin: '0.2rem 0' }}>
        <StatusBadge status={snack.status} />
      </div>

      {/* Stock Progress Meter */}
      <div className="stock-meter">
        <div className="stock-meter-label">
          <span>Available Stock</span>
          <strong style={{ color: snack.quantity === 0 ? 'var(--status-out-stock)' : 'inherit' }}>
            {snack.quantity} {snack.quantity === 1 ? 'packet' : 'packets'}
          </strong>
        </div>
        <div className="stock-bar-track">
          <div
            className="stock-bar-fill"
            style={{
              width: `${snack.quantity === 0 ? 0 : Math.max(percentage, 5)}%`,
              backgroundColor: getMeterColor(),
            }}
          />
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          Alert threshold: {snack.lowStockThreshold}
        </div>
      </div>

      {/* Role-Specific Actions:
          Members: Vote button + Grab One button.
          Admins: Restock button + Edit button.
          Strictly NO consumption or voting for Admins! */}
      <div className="snack-card-actions" onClick={(e) => e.stopPropagation()}>
        {isAdmin ? (
          /* Admin Actions: Restock & Edit */
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'flex-end' }}>
            {onEditClick && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={(e) => onEditClick(e, snack)}
                title="Edit snack properties"
              >
                ✏️ Edit
              </button>
            )}
            {onRestockClick && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={(e) => onRestockClick(e, snack)}
                title="Restock packets"
              >
                📦 Restock
              </button>
            )}
          </div>
        ) : (
          /* Member Actions: Vote & Grab One */
          <>
            {onVote && (
              <button
                type="button"
                className={`vote-btn ${snack.hasUserVoted ? 'voted' : ''}`}
                onClick={(e) => onVote(e, snack.id)}
                title={snack.hasUserVoted ? 'Click to remove vote' : 'Click to vote'}
              >
                <span>{snack.hasUserVoted ? '❤️' : '🤍'}</span>
                <span>{snack.voteCount || 0}</span>
              </button>
            )}

            {onQuickConsume && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={(e) => onQuickConsume(e, snack)}
                disabled={snack.quantity <= 0}
                title={snack.quantity <= 0 ? 'Out of stock' : 'Grab 1 packet'}
              >
                {snack.quantity <= 0 ? 'Sold Out' : 'Grab One'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SnackCard;
