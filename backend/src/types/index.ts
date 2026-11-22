export type RoleType = 'ADMIN' | 'MEMBER';

export type SnackCategoryType = 'SWEET' | 'SAVOURY' | 'DRINK' | 'HEALTHY_ISH';

export type ActivityActionType = 'RESTOCKED' | 'CONSUMED';

export type SnackStatusType = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

/**
 * Derives the snack status dynamically from current quantity and lowStockThreshold.
 * Per requirements: status is never stored as a separate database field.
 */
export function deriveSnackStatus(quantity: number, lowStockThreshold: number = 5): SnackStatusType {
  if (quantity <= 0) {
    return 'OUT_OF_STOCK';
  }
  if (quantity <= lowStockThreshold) {
    return 'LOW_STOCK';
  }
  return 'IN_STOCK';
}

export interface UserPayload {
  userId: string;
  email: string;
  role: RoleType;
}

export interface ApiResponseFormat<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    details?: any;
  };
  timestamp: string;
}
