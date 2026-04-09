import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User, Chain } from '@shared/schema';
import { apiRequest } from './queryClient';

interface AuthContextType {
  user: Omit<User, 'password'> | null;
  setAuth: (user: Omit<User, 'password'>) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  // Helper methods for dual balance
  getBalance: (chain: Chain) => bigint;
  getWalletAddress: (chain: Chain) => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Omit<User, 'password'> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try to fetch user profile on mount (cookie-based auth)
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/profile', {
          credentials: 'include'
        });
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const setAuth = (newUser: Omit<User, 'password'>) => {
    setUser(newUser);
  };

  const refreshUser = async () => {
    try {
      const response = await fetch('/api/auth/profile', {
        credentials: 'include'
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (error) {
      console.error('Refresh user failed:', error);
    }
  };

  const logout = async () => {
    try {
      await apiRequest('POST', '/api/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    }
    setUser(null);
  };

  // Helper to get balance for specific chain
  const getBalance = (chain: Chain): bigint => {
    if (!user) return 0n;
    if (chain === 'solana') {
      return BigInt(user.balance || 0);
    } else {
      return BigInt(user.baseBalance || 0);
    }
  };

  // Helper to get wallet address for specific chain
  const getWalletAddress = (chain: Chain): string | null => {
    if (!user) return null;
    if (chain === 'solana') {
      return user.solanaWalletAddress || user.walletAddress || null;
    } else {
      return user.baseWalletAddress || null;
    }
  };

  if (loading) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      setAuth, 
      refreshUser, 
      logout, 
      isAuthenticated: !!user,
      getBalance,
      getWalletAddress,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
