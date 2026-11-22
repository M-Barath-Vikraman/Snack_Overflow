import { getApiBaseUrl } from '../config/env';
import { ApiResponse } from '../types';

class ApiClient {
  private tokenKey = 'snack_overflow_token';

  public getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.tokenKey);
  }

  public setToken(token: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.tokenKey, token);
    }
  }

  public removeToken(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.tokenKey);
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const baseUrl = getApiBaseUrl().replace(/\/$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          success: false,
          message: data?.message || `HTTP ${response.status}: Request failed`,
          error: data?.error || { code: 'HTTP_ERROR', details: response.statusText },
          timestamp: new Date().toISOString(),
        };
      }

      return data as ApiResponse<T>;
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Network error occurred',
        error: { code: 'NETWORK_ERROR', details: error.toString() },
        timestamp: new Date().toISOString(),
      };
    }
  }

  public get<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public post<T>(endpoint: string, body?: any, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public put<T>(endpoint: string, body?: any, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public patch<T>(endpoint: string, body?: any, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public delete<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
export default apiClient;
