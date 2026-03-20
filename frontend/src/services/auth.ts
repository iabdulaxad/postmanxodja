import type { AuthResponse, LoginRequest, RegisterRequest, User } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export const login = async (credentials: LoginRequest): Promise<AuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }

  return response.json();
};

export const register = async (data: RegisterRequest): Promise<AuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Registration failed');
  }

  return response.json();
};

export const getCurrentUser = async (token: string): Promise<User> => {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error('Failed to get user');
  }

  return response.json();
};

export const logout = async (token: string): Promise<void> => {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
};

export const getStoredTokens = () => {
  return {
    accessToken: localStorage.getItem('access_token'),
    refreshToken: localStorage.getItem('refresh_token'),
  };
};

export const getCachedUser = (): User | null => {
  try {
    const cached = localStorage.getItem('cached_user');
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

export const cacheUser = (user: User) => {
  localStorage.setItem('cached_user', JSON.stringify(user));
};

export const storeTokens = (accessToken: string, refreshToken: string) => {
  localStorage.setItem('access_token', accessToken);
  localStorage.setItem('refresh_token', refreshToken);
};

export const clearTokens = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('cached_user');
};

/**
 * Extract minimal user info from a JWT access token.
 * This is used as a fallback when offline and no cached user exists.
 * Returns null if the token can't be decoded.
 */
export const parseUserFromToken = (token: string): User | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return {
      id: payload.user_id || payload.sub || 0,
      email: payload.email || '',
      name: payload.name || payload.email || 'User',
      created_at: '',
    };
  } catch {
    return null;
  }
};

// Google OAuth
export const getGoogleAuthUrl = async (): Promise<string> => {
  const response = await fetch(`${API_BASE_URL}/auth/google`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Google OAuth not available');
  }

  const data = await response.json();
  return data.url;
};
