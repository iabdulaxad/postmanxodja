import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '../types';
import * as authService from '../services/auth';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const { accessToken } = authService.getStoredTokens();
      if (accessToken) {
        try {
          const currentUser = await authService.getCurrentUser(accessToken);
          authService.cacheUser(currentUser);
          setUser(currentUser);
        } catch (err: any) {
          // Distinguish network errors from genuine auth failures.
          // fetch() throws TypeError on network failure; our code throws
          // Error('Failed to get user') on 401/403.
          const isAuthError =
            err instanceof Error &&
            err.message === 'Failed to get user' &&
            err.name !== 'TypeError';

          if (isAuthError) {
            // Token is invalid / expired – clear everything
            authService.clearTokens();
          } else {
            // Network error – backend unreachable (offline).
            // Keep session alive using cached user data.
            const cached = authService.getCachedUser();
            if (cached) {
              setUser(cached);
            }
            // If no cached user exists, we still have a valid token – parse
            // minimal user info from it so the session isn't lost.
            if (!cached) {
              const minimalUser = authService.parseUserFromToken(accessToken);
              if (minimalUser) {
                authService.cacheUser(minimalUser);
                setUser(minimalUser);
              }
            }
          }
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authService.login({ email, password });
    authService.storeTokens(response.access_token, response.refresh_token);
    authService.cacheUser(response.user);
    setUser(response.user);
  };

  const register = async (email: string, password: string, name: string) => {
    const response = await authService.register({ email, password, name });
    authService.storeTokens(response.access_token, response.refresh_token);
    authService.cacheUser(response.user);
    setUser(response.user);
  };

  const loginWithTokens = async (accessToken: string, refreshToken: string) => {
    authService.storeTokens(accessToken, refreshToken);
    const currentUser = await authService.getCurrentUser(accessToken);
    authService.cacheUser(currentUser);
    setUser(currentUser);
  };

  const logout = () => {
    const { accessToken } = authService.getStoredTokens();
    if (accessToken) {
      authService.logout(accessToken).catch(() => {});
    }
    authService.clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        loginWithTokens,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
