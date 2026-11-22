import React from 'react';
import { SnackStatusType } from '../types';

interface StatusBadgeProps {
  status: SnackStatusType;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getLabel = () => {
    switch (status) {
      case 'IN_STOCK':
        return 'In Stock';
      case 'LOW_STOCK':
        return 'Low Stock';
      case 'OUT_OF_STOCK':
        return 'Out of Stock';
      default:
        return status;
    }
  };

  const className = `status-badge ${status.toLowerCase()}`;

  return <span className={className}>{getLabel()}</span>;
};

export default StatusBadge;
