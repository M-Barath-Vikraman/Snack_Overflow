import apiClient from './apiClient';
import {
  ApiResponse,
  Snack,
  SnacksListData,
  DashboardSummaryData,
  SnackFilterParams,
  SnackCategoryType,
} from '../types';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const snackService = {
  async getSnacks(params: SnackFilterParams = {}): Promise<ApiResponse<SnacksListData>> {
    const query = new URLSearchParams();

    if (params.search && params.search.trim()) {
      query.append('search', params.search.trim());
    }
    if (params.category) {
      query.append('category', params.category);
    }
    if (params.status) {
      query.append('status', params.status);
    }
    if (params.page !== undefined && params.page > 0) {
      query.append('page', params.page.toString());
    }
    if (params.limit !== undefined && params.limit > 0) {
      query.append('limit', params.limit.toString());
    }
    if (params.sortBy) {
      query.append('sortBy', params.sortBy);
    }
    if (params.sortOrder) {
      query.append('sortOrder', params.sortOrder);
    }

    const queryString = query.toString();
    const endpoint = queryString ? `/snacks?${queryString}` : '/snacks';
    return apiClient.get<SnacksListData>(endpoint);
  },

  async getSnackById(id: string): Promise<ApiResponse<Snack>> {
    return apiClient.get<Snack>(`/snacks/${encodeURIComponent(id)}`);
  },

  async getSummary(): Promise<ApiResponse<DashboardSummaryData>> {
    return apiClient.get<DashboardSummaryData>('/snacks/summary');
  },

  async createSnack(data: {
    name: string;
    category: SnackCategoryType;
    quantity: number;
    lowStockThreshold?: number;
  }): Promise<ApiResponse<Snack>> {
    return apiClient.post<Snack>('/snacks', data);
  },

  async updateSnack(
    id: string,
    data: Partial<{
      name: string;
      category: SnackCategoryType;
      lowStockThreshold: number;
    }>
  ): Promise<ApiResponse<Snack>> {
    return apiClient.patch<Snack>(`/snacks/${encodeURIComponent(id)}`, data);
  },

  async deleteSnack(id: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/snacks/${encodeURIComponent(id)}`);
  },

  async consumeSnack(
    id: string,
    amount: number = 1,
    idempotencyKey?: string
  ): Promise<ApiResponse<{ snack: Snack; activity: any }>> {
    const key = idempotencyKey || generateUuid();
    return apiClient.post<{ snack: Snack; activity: any }>(
      `/snacks/${encodeURIComponent(id)}/consume`,
      { amount },
      {
        headers: {
          'Idempotency-Key': key,
        },
      }
    );
  },

  async restockSnack(id: string, amount: number): Promise<ApiResponse<Snack>> {
    return apiClient.post<Snack>(`/snacks/${encodeURIComponent(id)}/restock`, {
      amount,
    });
  },

  async voteSnack(id: string): Promise<ApiResponse<{ snackId: string; totalVotes: number; userVoted: boolean }>> {
    return apiClient.post<{ snackId: string; totalVotes: number; userVoted: boolean }>(
      `/snacks/${encodeURIComponent(id)}/vote`
    );
  },

  async unvoteSnack(id: string): Promise<ApiResponse<{ snackId: string; totalVotes: number; userVoted: boolean }>> {
    return apiClient.delete<{ snackId: string; totalVotes: number; userVoted: boolean }>(
      `/snacks/${encodeURIComponent(id)}/vote`
    );
  },
};

export default snackService;
