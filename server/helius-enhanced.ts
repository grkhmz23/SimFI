// server/helius-enhanced.ts
// Enhanced Helius service with 5 API key rotation and comprehensive methods

interface HeliusConfig {
  apiKeys: string[];
  currentKeyIndex: number;
  requestCount: number;
}

class HeliusService {
  private config: HeliusConfig;
  private baseUrl = 'https://api.helius.xyz/v0';
  private rpcUrl = 'https://mainnet.helius-rpc.com';

  constructor(apiKeys: string[]) {
    this.config = {
      apiKeys,
      currentKeyIndex: 0,
      requestCount: 0,
    };
  }

  // Rotate API keys for load balancing
  private getApiKey(): string {
    const key = this.config.apiKeys[this.config.currentKeyIndex];
    this.config.currentKeyIndex = (this.config.currentKeyIndex + 1) % this.config.apiKeys.length;
    this.config.requestCount++;
    return key;
  }

  // Generic request handler with error handling
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const apiKey = this.getApiKey();
    const url = `${this.baseUrl}${endpoint}?api-key=${apiKey}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Helius request error:', error);
      throw error;
    }
  }

  // RPC request handler
  private async rpcRequest<T>(method: string, params: any[]): Promise<T> {
    const apiKey = this.getApiKey();
    const url = `${this.rpcUrl}?api-key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    return data.result;
  }

  // ==================== TOKEN ANALYSIS ====================

  /**
   * Get comprehensive token metadata and info
   */
  async getTokenMetadata(mintAddress: string) {
    return this.request(`/token-metadata`, {
      method: 'POST',
      body: JSON.stringify({ mintAccounts: [mintAddress] }),
    });
  }

  /**
   * Get token supply information
   */
  async getTokenSupply(mintAddress: string) {
    return this.rpcRequest('getTokenSupply', [mintAddress]);
  }

  /**
   * Get token holders count and distribution
   */
  async getTokenHolders(mintAddress: string) {
    return this.rpcRequest('getTokenLargestAccounts', [mintAddress]);
  }

  /**
   * Get comprehensive token info (metadata + supply + holders)
   */
  async getTokenAnalysis(mintAddress: string) {
    try {
      const [metadata, supply, holders] = await Promise.all([
        this.getTokenMetadata(mintAddress),
        this.getTokenSupply(mintAddress),
        this.getTokenHolders(mintAddress),
      ]);

      return {
        metadata: metadata?.[0] || null,
        supply,
        topHolders: holders?.value || [],
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Token analysis error:', error);
      throw error;
    }
  }

  // ==================== WALLET EXPLORER ====================

  /**
   * Get all token balances for a wallet
   */
  async getWalletBalances(walletAddress: string) {
    return this.request(`/addresses/${walletAddress}/balances`, {
      method: 'GET',
    });
  }

  /**
   * Get wallet's NFTs
   */
  async getWalletNFTs(walletAddress: string) {
    return this.request(`/addresses/${walletAddress}/nfts`, {
      method: 'GET',
    });
  }

  /**
   * Get SOL balance
   */
  async getSolBalance(walletAddress: string) {
    const result = await this.rpcRequest('getBalance', [walletAddress]);
    return {
      lamports: result,
      sol: result / 1_000_000_000,
    };
  }

  /**
   * Get comprehensive wallet portfolio
   */
  async getWalletPortfolio(walletAddress: string) {
    try {
      const [balances, solBalance, nfts] = await Promise.all([
        this.getWalletBalances(walletAddress),
        this.getSolBalance(walletAddress),
        this.getWalletNFTs(walletAddress).catch(() => ({ nfts: [] })),
      ]);

      return {
        address: walletAddress,
        solBalance,
        tokens: balances?.tokens || [],
        nfts: nfts?.nfts || [],
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Wallet portfolio error:', error);
      throw error;
    }
  }

  // ==================== TRANSACTION HISTORY ====================

  /**
   * Get parsed transaction history for an address
   */
  async getTransactionHistory(address: string, options: {
    limit?: number;
    before?: string;
    type?: string;
  } = {}) {
    const { limit = 50, before, type } = options;
    
    const params = new URLSearchParams({
      limit: limit.toString(),
    });
    
    if (before) params.append('before', before);
    if (type) params.append('type', type);

    return this.request(`/addresses/${address}/transactions?${params.toString()}`, {
      method: 'GET',
    });
  }

  /**
   * Get detailed parsed transaction
   */
  async getParsedTransaction(signature: string) {
    return this.request(`/transactions?transactions=${signature}`, {
      method: 'GET',
    });
  }

  /**
   * Get transaction with enhanced parsing
   */
  async getTransactionDetails(signature: string) {
    try {
      const parsed = await this.getParsedTransaction(signature);
      return {
        signature,
        transaction: parsed?.[0] || null,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Transaction details error:', error);
      throw error;
    }
  }

  // ==================== REAL-TIME DATA ====================

  /**
   * Get multiple tokens info in batch
   */
  async getBatchTokenInfo(mintAddresses: string[]) {
    const chunks = [];
    for (let i = 0; i < mintAddresses.length; i += 100) {
      chunks.push(mintAddresses.slice(i, i + 100));
    }

    const results = await Promise.all(
      chunks.map(chunk =>
        this.request(`/token-metadata`, {
          method: 'POST',
          body: JSON.stringify({ mintAccounts: chunk }),
        })
      )
    );

    return results.flat();
  }

  /**
   * Search for tokens or addresses
   */
  async search(query: string) {
    // Validate if it's a valid Solana address (base58, 32-44 chars)
    const isAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query);
    
    if (!isAddress) {
      return { error: 'Invalid Solana address' };
    }

    // Try to determine if it's a token mint or wallet
    try {
      const accountInfo = await this.rpcRequest('getAccountInfo', [
        query,
        { encoding: 'jsonParsed' },
      ]);

      if (!accountInfo) {
        return { type: 'not_found', address: query };
      }

      // Check if it's a token mint
      const owner = accountInfo.value?.owner;
      if (owner === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
        return {
          type: 'token',
          address: query,
          data: accountInfo,
        };
      }

      // Otherwise it's likely a wallet
      return {
        type: 'wallet',
        address: query,
        data: accountInfo,
      };
    } catch (error) {
      console.error('Search error:', error);
      return { error: 'Failed to identify address type' };
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get current API usage stats
   */
  getUsageStats() {
    return {
      totalRequests: this.config.requestCount,
      currentKeyIndex: this.config.currentKeyIndex,
      apiKeysCount: this.config.apiKeys.length,
      requestsPerKey: Math.floor(this.config.requestCount / this.config.apiKeys.length),
    };
  }

  /**
   * Validate Solana address
   */
  isValidSolanaAddress(address: string): boolean {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }
}

// Export singleton instance - use existing HELIUS_API_KEY, fallback to empty array
export const heliusEnhancedService = new HeliusService([
  process.env.HELIUS_API_KEY || '',
  process.env.HELIUS_API_KEY_1 || '',
  process.env.HELIUS_API_KEY_2 || '',
  process.env.HELIUS_API_KEY_3 || '',
  process.env.HELIUS_API_KEY_4 || '',
  process.env.HELIUS_API_KEY_5 || '',
].filter(Boolean));

export default heliusEnhancedService;
