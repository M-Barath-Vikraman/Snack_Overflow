import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import apiClient from '../services/apiClient';
import authService from '../services/authService';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function parseJwt(token: string): any | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore authentication from localStorage on boot
  useEffect(() => {
    try {
      const storedToken = apiClient.getToken();
      const storedUser = authService.getCurrentUser();

      if (storedToken && storedUser) {
        // Verify token expiration if token includes exp claim
        const decoded = parseJwt(storedToken);
        if (decoded && decoded.exp && decoded.exp * 1000 < Date.now()) {
          // Token is expired; clean up
          authService.logout();
          setUser(null);
          setToken(null);
        } else {
          setToken(storedToken);
          setUser(storedUser);
        }
      }
    } catch {
      authService.logout();
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    const res = await authService.login(email, password);
    if (res.success && res.data) {
      setUser(res.data.user);
      setToken(res.data.token);
      return { success: true };
    }
    return {
      success: false,
      message: res.message || 'Invalid credentials',
    };
  };

  const register = async (name: string, email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    const res = await authService.register(name, email, password);
    if (res.success && res.data) {
      setUser(res.data.user);
      setToken(res.data.token);
      return { success: true };
    }
    return {
      success: false,
      message: res.message || 'Registration failed',
    };
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setToken(null);
  };

  const isAuthenticated = !!token && !!user;
  const isAdmin = user?.role === 'ADMIN';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isAdmin,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
