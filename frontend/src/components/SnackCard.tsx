import React from 'react';
import { Snack } from '../types';
import StatusBadge from './StatusBadge';
import CategoryBadge from './CategoryBadge';

interface SnackCardProps {
  snack: Snack;
  onSelect: (snack: Snack) => void;
  onVote: (e: React.MouseEvent, snackId: string) => void;
  onQuickConsume: (e: React.MouseEvent, snack: Snack) => void;
  isAdmin: boolean;
  onRestockClick?: (e: React.MouseEvent, snack: Snack) => void;
}

export const SnackCard: React.FC<SnackCardProps> = ({
  snack,
  onSelect,
  onVote,
  onQuickConsume,
  isAdmin,
  onRestockClick,
}) => {
  // Compute stock fill percentage based on quantity relative to lowStockThreshold * 2 (as benchmark)
  const maxBenchmark = Math.max(snack.lowStockThreshold * 2, 10);
  const percentage = Math.min(Math.round((snack.quantity / maxBenchmark) * 100), 100);

  const getMeterColor = () => {
    if (snack.status === 'IN_STOCK') return 'var(--status-in-stock)';
    if (snack.status === 'LOW_STOCK') return 'var(--status-low-stock)';
    return 'var(--status-out-stock)';
  };

  return (
    <div className="snack-card" onClick={() => onSelect(snack)} style={{ cursor: 'pointer' }}>
      <div className="snack-card-header">
        <h4 className="snack-name">{snack.name}</h4>
        <CategoryBadge category={snack.category} />
      </div>

      <div style={{ margin: '0.25rem 0' }}>
        <StatusBadge status={snack.status} />
      </div>

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

      <div className="snack-card-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={`vote-btn ${snack.hasUserVoted ? 'voted' : ''}`}
          onClick={(e) => onVote(e, snack.id)}
          title={snack.hasUserVoted ? 'Click to remove vote' : 'Click to vote'}
        >
          <span>{snack.hasUserVoted ? '❤️' : '🤍'}</span>
          <span>{snack.voteCount || 0}</span>
        </button>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {isAdmin && onRestockClick && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={(e) => onRestockClick(e, snack)}
              title="Restock inventory"
            >
              Restock
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={(e) => onQuickConsume(e, snack)}
            disabled={snack.quantity <= 0}
            title={snack.quantity <= 0 ? 'Out of stock' : 'Consume 1 packet'}
          >
            {snack.quantity <= 0 ? 'Sold Out' : 'Grab One'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SnackCard;
