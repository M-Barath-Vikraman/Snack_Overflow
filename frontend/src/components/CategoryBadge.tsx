import React from 'react';
import { SnackCategoryType } from '../types';

interface CategoryBadgeProps {
  category: SnackCategoryType;
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({ category }) => {
  const getLabel = () => {
    switch (category) {
      case 'SWEET':
        return '🍬 Sweet';
      case 'SAVOURY':
        return '🥨 Savoury';
      case 'DRINK':
        return '🥤 Drink';
      case 'HEALTHY_ISH':
        return '🥗 Healthy-ish';
      default:
        return category;
    }
  };

  const className = `category-badge ${category.toLowerCase()}`;

  return <span className={className}>{getLabel()}</span>;
};

export default CategoryBadge;
