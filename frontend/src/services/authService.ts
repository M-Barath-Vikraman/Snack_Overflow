import apiClient from './apiClient';
import { ApiResponse, AuthResponseData } from '../types';

export const authService = {
  async login(email: string, password: string): Promise<ApiResponse<AuthResponseData>> {
    const res = await apiClient.post<AuthResponseData>('/auth/login', {
      email,
      password,
    });
    if (res.success && res.data?.token) {
      apiClient.setToken(res.data.token);
      if (typeof window !== 'undefined') {
        localStorage.setItem('snack_overflow_user', JSON.stringify(res.data.user));
      }
    }
    return res;
  },

  async register(name: string, email: string, password: string): Promise<ApiResponse<AuthResponseData>> {
    const res = await apiClient.post<AuthResponseData>('/auth/register', {
      name,
      email,
      password,
    });
    if (res.success && res.data?.token) {
      apiClient.setToken(res.data.token);
      if (typeof window !== 'undefined') {
        localStorage.setItem('snack_overflow_user', JSON.stringify(res.data.user));
      }
    }
    return res;
  },

  logout(): void {
    apiClient.removeToken();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('snack_overflow_user');
    }
  },

  getCurrentUser(): any | null {
    if (typeof window === 'undefined') return null;
    const userStr = localStorage.getItem('snack_overflow_user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  },

  hasToken(): boolean {
    return !!apiClient.getToken();
  },
};

export default authService;
