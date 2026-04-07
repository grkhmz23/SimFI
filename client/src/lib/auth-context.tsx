import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '@shared/schema';
import type { Chain } from './chain-context';
import { apiRequest } from './queryClient';

interface UserBalance {
  chain: Chain;
  balance: string;
  totalProfit: string;
  updatedAt: string;
}

interface UserWallet {
  chain: Chain;
  address: string;
  isPrimary: boolean;
  explorerUrl: string;
}

interface AuthContextType {
  user: Omit<User, 'password'> | null;
  balances: UserBalance[];
  wallets: UserWallet[];
  setAuth: (user: Omit<User, 'password'>) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  refreshWallets: () => Promise<void>;
  updateWallet: (chain: Chain, address: string) => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Omit<User, 'password'> | null>(null);
  const [balances, setBalances] = useState<UserBalance[]>([]);
  const [wallets, setWallets] = useState<UserWallet[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch user profile, balances, and wallets on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const [profileRes, balancesRes, walletsRes] = await Promise.all([
          fetch('/api/auth/profile', { credentials: 'include' }),
          fetch('/api/user/balances', { credentials: 'include' }),
          fetch('/api/user/wallets', { credentials: 'include' }),
        ]);

        if (profileRes.ok) {
          const userData = await profileRes.json();
          setUser(userData);
        }

        if (balancesRes.ok) {
          const balancesData = await balancesRes.json();
          setBalances(balancesData.balances || []);
        }

        if (walletsRes.ok) {
          const walletsData = await walletsRes.json();
          setWallets(walletsData.wallets || []);
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
    // Also refresh balances and wallets for new user
    refreshBalances();
    refreshWallets();
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

  const refreshBalances = async () => {
    try {
      const response = await fetch('/api/user/balances', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setBalances(data.balances || []);
      }
    } catch (error) {
      console.error('Refresh balances failed:', error);
    }
  };

  const refreshWallets = async () => {
    try {
      const response = await fetch('/api/user/wallets', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setWallets(data.wallets || []);
      }
    } catch (error) {
      console.error('Refresh wallets failed:', error);
    }
  };

  const updateWallet = async (chain: Chain, address: string) => {
    await apiRequest('POST', '/api/user/wallet', { chain, address });
    await refreshWallets();
    await refreshUser(); // Also refresh user as primary wallet may have changed
  };

  const logout = async () => {
    try {
      await apiRequest('POST', '/api/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    }
    setUser(null);
    setBalances([]);
    setWallets([]);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      balances, 
      wallets,
      setAuth, 
      refreshUser, 
      refreshBalances,
      refreshWallets,
      updateWallet,
      logout, 
      isAuthenticated: !!user,
      isLoading: loading,
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

// Helper hook to get balance for a specific chain
export function useChainBalance(chain: Chain) {
  const { balances } = useAuth();
  return balances.find(b => b.chain === chain)?.balance ?? '0';
}

// Helper hook to get wallet for a specific chain
export function useChainWallet(chain: Chain) {
  const { wallets } = useAuth();
  return wallets.find(w => w.chain === chain);
}
