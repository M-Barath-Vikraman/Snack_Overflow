export type RoleType = 'ADMIN' | 'MEMBER';

export type SnackCategoryType = 'SWEET' | 'SAVOURY' | 'DRINK' | 'HEALTHY_ISH';

export type ActivityActionType = 'RESTOCKED' | 'CONSUMED';

export type SnackStatusType = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface User {
  id: string;
  name: string;
  email: string;
  role: RoleType;
  createdAt?: string;
  updatedAt?: string;
}

export interface Snack {
  id: string;
  name: string;
  category: SnackCategoryType;
  quantity: number;
  lowStockThreshold: number;
  status: SnackStatusType;
  imageUrl?: string | null;
  imagePath?: string | null;
  voteCount?: number;
  hasUserVoted?: boolean;
  createdAt?: string;
  updatedAt?: string;
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

export interface AuthResponseData {
  user: User;
  token: string;
}

export interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SnacksListData {
  snacks: Snack[];
  pagination: PaginationData;
}

export interface DashboardSummaryData {
  totalSnacks: number;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  snackOfTheWeek: {
    id: string;
    name: string;
    category: SnackCategoryType;
    quantity: number;
    lowStockThreshold: number;
    status: SnackStatusType;
    voteCount: number;
  } | null;
}

export interface SnackFilterParams {
  search?: string;
  category?: SnackCategoryType;
  status?: SnackStatusType;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'category' | 'quantity' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
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

export type WsConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface ActivityUser {
  id: string;
  name: string;
  email: string;
  role: RoleType;
}

export interface ActivitySnack {
  id: string;
  name: string;
  category: SnackCategoryType;
}

export interface ActivityRecord {
  id: string;
  userId: string;
  snackId: string;
  action: ActivityActionType;
  amount: number;
  createdAt: string;
  user: ActivityUser;
  snack: ActivitySnack;
}

export interface ActivitiesListData {
  activities: ActivityRecord[];
  pagination: PaginationData;
}

export interface ActivityFilterParams {
  page?: number;
  limit?: number;
  action?: ActivityActionType;
  search?: string;
  sortBy?: 'createdAt' | 'amount';
  sortOrder?: 'asc' | 'desc';
}

export interface WebSocketEvent<T = any> {
  id: string;
  type: string;
  snackId: string;
  timestamp: string;
  payload: T;
}

