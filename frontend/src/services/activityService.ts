import apiClient from './apiClient';
import {
  ApiResponse,
  ActivitiesListData,
  ActivityFilterParams,
} from '../types';

export const activityService = {
  async getActivities(params: ActivityFilterParams = {}): Promise<ApiResponse<ActivitiesListData>> {
    const query = new URLSearchParams();

    if (params.page !== undefined && params.page > 0) {
      query.append('page', params.page.toString());
    }
    if (params.limit !== undefined && params.limit > 0) {
      query.append('limit', params.limit.toString());
    }
    if (params.action) {
      query.append('action', params.action);
    }
    if (params.search && params.search.trim()) {
      query.append('search', params.search.trim());
    }
    if (params.sortBy) {
      query.append('sortBy', params.sortBy);
    }
    if (params.sortOrder) {
      query.append('sortOrder', params.sortOrder);
    }

    const queryString = query.toString();
    const endpoint = queryString ? `/activities?${queryString}` : '/activities';
    return apiClient.get<ActivitiesListData>(endpoint);
  },
};

export default activityService;
