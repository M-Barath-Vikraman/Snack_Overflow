export type RoleType = 'ADMIN' | 'MEMBER';

export type SnackCategoryType = 'SWEET' | 'SAVOURY' | 'DRINK' | 'HEALTHY_ISH';

export type ActivityActionType = 'RESTOCKED' | 'CONSUMED';

export type SnackStatusType = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface User {
  id: string;
  name: string;
  email: string;
  role: RoleType;
}

export interface Snack {
  id: string;
  name: string;
  category: SnackCategoryType;
  quantity: number;
  lowStockThreshold: number;
  status: SnackStatusType;
  voteCount?: number;
  hasUserVoted?: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    details?: any;
  };
  timestamp: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  database: {
    configured: boolean;
    status: 'connected' | 'disconnected' | 'unconfigured';
    error?: string;
  };
}
