import fetch from 'node-fetch';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

export interface TokenMetadata {
  name: string;
  symbol: string;
  mint: string;
  decimals: number;
  logoURI?: string;
}

export interface TransactionSummary {
  signature: string;
  timestamp: number;
  type: string;
  description: string;
  fee: number;
  nativeTransfers?: {
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }[];
  tokenTransfers?: {
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
  }[];
}

export interface TokenAnalysis {
  metadata: TokenMetadata;
  totalSupply?: number;
  holders?: number;
  recentTransactions: TransactionSummary[];
  topHolders?: {
    address: string;
    balance: number;
    percentage: number;
  }[];
}

export class HeliusService {
  private async makeRpcCall(method: string, params: any[]) {
    const response = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'my-id',
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`Helius RPC call failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`Helius RPC error: ${JSON.stringify(data.error)}`);
    }

    return data.result;
  }

  async getTokenMetadata(mintAddress: string): Promise<TokenMetadata | null> {
    try {
      const response = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${HELIUS_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mintAccounts: [mintAddress],
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (data && data[0]) {
        const metadata = data[0];
        return {
          name: metadata.onChainMetadata?.metadata?.data?.name || 'Unknown',
          symbol: metadata.onChainMetadata?.metadata?.data?.symbol || 'UNKNOWN',
          mint: mintAddress,
          decimals: metadata.account?.data?.parsed?.info?.decimals || 9,
          logoURI: metadata.offChainMetadata?.metadata?.image,
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch token metadata:', error);
      return null;
    }
  }

  async getTransactionHistory(mintAddress: string, limit: number = 50): Promise<TransactionSummary[]> {
    try {
      const response = await fetch(`https://api.helius.xyz/v0/addresses/${mintAddress}/transactions?api-key=${HELIUS_API_KEY}&limit=${limit}`);
      
      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      
      return data.map((tx: any) => ({
        signature: tx.signature,
        timestamp: tx.timestamp,
        type: tx.type || 'UNKNOWN',
        description: tx.description || 'No description',
        fee: tx.fee || 0,
        nativeTransfers: tx.nativeTransfers || [],
        tokenTransfers: tx.tokenTransfers || [],
      }));
    } catch (error) {
      console.error('Failed to fetch transaction history:', error);
      return [];
    }
  }

  async getTokenHolders(mintAddress: string, limit: number = 20): Promise<{ address: string; balance: number; percentage: number; }[]> {
    try {
      const response = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${HELIUS_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mintAccounts: [mintAddress],
          includeOffChain: true,
        }),
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      
      // This is a simplified version - Helius doesn't directly provide holder info in basic metadata
      // For full holder data, you'd need to use other endpoints or services
      return [];
    } catch (error) {
      console.error('Failed to fetch token holders:', error);
      return [];
    }
  }

  async analyzeToken(mintAddress: string): Promise<TokenAnalysis> {
    const [metadata, transactions] = await Promise.all([
      this.getTokenMetadata(mintAddress),
      this.getTransactionHistory(mintAddress, 100),
    ]);

    if (!metadata) {
      throw new Error('Failed to fetch token metadata');
    }

    return {
      metadata,
      recentTransactions: transactions.slice(0, 50),
      topHolders: [],
    };
  }
}

export const heliusService = new HeliusService();
