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
      // First, get token holders to find addresses with token activity
      const holdersResponse = await this.makeRpcCall('getTokenAccounts', [{
        mint: mintAddress,
        limit: 20,
        page: 1,
      }]);

      if (!holdersResponse || !holdersResponse.token_accounts || holdersResponse.token_accounts.length === 0) {
        console.log(`No token holders found for ${mintAddress}`);
        return [];
      }

      // Get top holder addresses
      const topHolders = holdersResponse.token_accounts
        .sort((a: any, b: any) => b.amount - a.amount)
        .slice(0, 5)
        .map((account: any) => account.owner);

      console.log(`Found ${topHolders.length} top holders for ${mintAddress}`);

      // Fetch transactions from top holders that involve this token
      const allTransactions: TransactionSummary[] = [];
      
      for (const holder of topHolders) {
        try {
          const response = await fetch(
            `https://api.helius.xyz/v0/addresses/${holder}/transactions?api-key=${HELIUS_API_KEY}&limit=20&type=TRANSFER&type=SWAP`
          );
          
          if (response.ok) {
            const data = await response.json();
            
            // Filter transactions that involve our mint
            const relevantTxs = data
              .filter((tx: any) => 
                tx.tokenTransfers?.some((transfer: any) => transfer.mint === mintAddress)
              )
              .map((tx: any) => ({
                signature: tx.signature,
                timestamp: tx.timestamp,
                type: tx.type || 'UNKNOWN',
                description: tx.description || 'No description',
                fee: tx.fee || 0,
                nativeTransfers: tx.nativeTransfers || [],
                tokenTransfers: tx.tokenTransfers?.filter((t: any) => t.mint === mintAddress) || [],
              }));
            
            allTransactions.push(...relevantTxs);
          }
        } catch (error) {
          console.error(`Failed to fetch transactions for holder ${holder}:`, error);
        }
      }

      // Remove duplicates and sort by timestamp
      const uniqueTxs = Array.from(
        new Map(allTransactions.map(tx => [tx.signature, tx])).values()
      ).sort((a, b) => b.timestamp - a.timestamp);

      return uniqueTxs.slice(0, limit);
    } catch (error) {
      console.error('Failed to fetch transaction history:', error);
      return [];
    }
  }

  async getTokenHolders(mintAddress: string, limit: number = 20): Promise<{ address: string; balance: number; percentage: number; }[]> {
    try {
      const response = await this.makeRpcCall('getTokenAccounts', [{
        mint: mintAddress,
        limit: limit,
        page: 1,
      }]);

      if (!response || !response.token_accounts) {
        return [];
      }

      const accounts = response.token_accounts;
      const totalSupply = accounts.reduce((sum: number, acc: any) => sum + (acc.amount || 0), 0);

      return accounts
        .sort((a: any, b: any) => b.amount - a.amount)
        .map((account: any) => ({
          address: account.owner,
          balance: account.amount || 0,
          percentage: totalSupply > 0 ? ((account.amount || 0) / totalSupply) * 100 : 0,
        }));
    } catch (error) {
      console.error('Failed to fetch token holders:', error);
      return [];
    }
  }

  async analyzeToken(mintAddress: string): Promise<TokenAnalysis> {
    const [metadata, transactions, holders] = await Promise.all([
      this.getTokenMetadata(mintAddress),
      this.getTransactionHistory(mintAddress, 100),
      this.getTokenHolders(mintAddress, 10),
    ]);

    if (!metadata) {
      throw new Error('Failed to fetch token metadata');
    }

    console.log(`✅ Analyzed token ${mintAddress}: ${transactions.length} transactions, ${holders.length} holders`);

    return {
      metadata,
      recentTransactions: transactions.slice(0, 50),
      topHolders: holders,
    };
  }
}

export const heliusService = new HeliusService();
