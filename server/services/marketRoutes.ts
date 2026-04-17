// server/routes/market.ts
// New market data endpoints - frontend calls these instead of external APIs
// Multi-chain support: solana and base

import type { Express, RequestHandler } from 'express';
import { marketDataService } from '../services/marketData';
import { quoteService } from '../services/quoteService';
import type { Chain } from '@shared/schema';

// Valid chains
const VALID_CHAINS: Chain[] = ['solana', 'base'];

function isValidChain(chain: string): chain is Chain {
  return VALID_CHAINS.includes(chain as Chain);
}

export function registerMarketRoutes(
  app: Express,
  deps: {
    authenticateToken: RequestHandler;
    searchLimiter: RequestHandler;
  }
): void {
  const { authenticateToken, searchLimiter } = deps;

  // =========================================================================
  // MARKET DATA ENDPOINTS (cached, rate-limit friendly)
  // =========================================================================

  /**
   * GET /api/market/token/:address?chain=solana|base
   * Get single token data (cached)
   * Replaces frontend DexScreener calls
   */
  app.get('/api/market/token/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const chainParam = (req.query.chain as string) || 'solana';

      if (!address || address.length < 32) {
        return res.status(400).json({ error: 'Invalid token address' });
      }

      const token = isValidChain(chainParam)
        ? await marketDataService.getToken(address, chainParam)
        : await marketDataService.getTokenByChainId(address, chainParam);

      if (!token) {
        return res.status(404).json({ error: 'Token not found' });
      }

      // Serialize BigInt values for JSON and map to frontend Token shape
      const serializedToken = {
        ...token,
        price: Number(token.priceNative),
        priceNative: token.priceNative.toString(),
      };

      res.json({
        ...serializedToken,
        cached: true,
        ageMs: Date.now() - token.lastUpdated,
      });
    } catch (error: any) {
      console.error('Market token error:', error);
      res.status(500).json({ error: 'Failed to fetch token data' });
    }
  });

  /**
   * GET /api/market/tokens?addresses=addr1,addr2,addr3&chain=solana|base
   * Batch endpoint for positions page
   * Much more efficient than individual calls
   */
  app.get('/api/market/tokens', async (req, res) => {
    try {
      const addressesParam = req.query.addresses as string;
      const chainParam = (req.query.chain as string) || 'solana';

      if (!addressesParam) {
        return res.status(400).json({ error: 'addresses query param required' });
      }

      if (!isValidChain(chainParam)) {
        return res.status(400).json({ error: 'Invalid chain. Must be "solana" or "base"' });
      }

      const addresses = addressesParam.split(',').filter(a => a.length >= 32);

      if (addresses.length === 0) {
        return res.json({ tokens: {} });
      }

      if (addresses.length > 50) {
        return res.status(400).json({ error: 'Maximum 50 addresses per request' });
      }

      const tokensMap = await marketDataService.getTokensBatch(addresses, chainParam);

      // Convert Map to object for JSON response (serialize BigInt values)
      const tokens: Record<string, any> = {};
      tokensMap.forEach((data, addr) => {
        tokens[addr] = {
          ...data,
          priceNative: data.priceNative.toString(),
          ageMs: Date.now() - data.lastUpdated,
        };
      });

      res.json({ 
        tokens,
        found: tokensMap.size,
        requested: addresses.length,
      });
    } catch (error: any) {
      console.error('Market tokens batch error:', error);
      res.status(500).json({ error: 'Failed to fetch tokens data' });
    }
  });

  /**
   * GET /api/market/trending?chain=solana|base&limit=20
   * Get trending tokens (cached 30s)
   */
  app.get('/api/market/trending', async (req, res) => {
    try {
      const chainParam = (req.query.chain as string) || 'solana';
      const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

      if (!isValidChain(chainParam)) {
        return res.status(400).json({ error: 'Invalid chain. Must be "solana" or "base"' });
      }

      const trending = await marketDataService.getTrending(limit, chainParam);

      // Serialize BigInt values
      const serializedTrending = trending.map(token => ({
        ...token,
        priceNative: token.priceNative.toString(),
      }));

      res.json({
        trending: serializedTrending,
        count: trending.length,
        cachedAt: Date.now(),
      });
    } catch (error: any) {
      console.error('Market trending error:', error);
      res.status(500).json({ error: 'Failed to fetch trending tokens' });
    }
  });

  /**
   * GET /api/market/new-pairs?chain=solana|base&age=1|6|24
   * Recently launched pairs
   */
  app.get('/api/market/new-pairs', async (req, res) => {
    try {
      const chainParam = (req.query.chain as string) || 'solana';
      const ageHours = Math.min(168, Math.max(1, parseInt(req.query.age as string) || 24));

      if (!isValidChain(chainParam)) {
        return res.status(400).json({ error: 'Invalid chain. Must be "solana" or "base"' });
      }

      const newPairs = await marketDataService.getNewPairs(ageHours, chainParam);

      const serialized = newPairs.map(token => ({
        ...token,
        priceNative: token.priceNative.toString(),
      }));

      res.json({
        newPairs: serialized,
        ageHours,
        count: newPairs.length,
        cachedAt: Date.now(),
      });
    } catch (error: any) {
      console.error('Market new-pairs error:', error);
      res.status(500).json({ error: 'Failed to fetch new pairs' });
    }
  });

  /**
   * GET /api/market/hot?chain=solana|base&limit=20
   * Hot tokens by volume/liquidity momentum
   */
  app.get('/api/market/hot', async (req, res) => {
    try {
      const chainParam = (req.query.chain as string) || 'solana';
      const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

      if (!isValidChain(chainParam)) {
        return res.status(400).json({ error: 'Invalid chain. Must be "solana" or "base"' });
      }

      const hot = await marketDataService.getHotTokens(limit, chainParam);

      const serialized = hot.map(token => ({
        ...token,
        priceNative: token.priceNative.toString(),
      }));

      res.json({
        hot: serialized,
        count: hot.length,
        cachedAt: Date.now(),
      });
    } catch (error: any) {
      console.error('Market hot error:', error);
      res.status(500).json({ error: 'Failed to fetch hot tokens' });
    }
  });

  /**
   * GET /api/market/search?q=bonk&chain=solana|base
   * Search tokens (cached 60s per query)
   */
  app.get('/api/market/search', searchLimiter, async (req, res) => {
    try {
      const query = req.query.q as string;
      const chainParam = (req.query.chain as string) || 'solana';

      if (!query || query.length < 2) {
        return res.json({ results: [] });
      }

      if (query.length > 100) {
        return res.status(400).json({ error: 'Query too long' });
      }

      const results = await marketDataService.search(query, chainParam);

      // Serialize BigInt values
      const serializedResults = results.map(result => ({
        ...result,
        price: result.price.toString(),
      }));

      res.json({
        results: serializedResults,
        count: results.length,
        query,
      });
    } catch (error: any) {
      console.error('Market search error:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  /**
   * GET /api/market/stats
   * Get cache statistics (for monitoring)
   */
  app.get('/api/market/stats', (req, res) => {
    const marketStats = marketDataService.getStats();
    const quoteStats = quoteService.getStats();

    res.json({
      market: marketStats,
      quotes: quoteStats,
      timestamp: Date.now(),
    });
  });

  // =========================================================================
  // QUOTE ENDPOINTS (server-authoritative execution)
  // =========================================================================

  /**
   * GET /api/quote
   * Get a server-authoritative quote for trade execution
   * 
   * Query params:
   * - token: token address (required)
   * - chain: 'solana' or 'base' (required)
   * - side: 'buy' or 'sell' (required)
   * - amountNative: Native amount for buys (required for buy) - in SOL or ETH
   * - amountTokens: token amount for sells (required for sell)
   */
  app.get('/api/quote', authenticateToken, async (req, res) => {
    try {
      const { token, chain, side, amountNative, amountTokens } = req.query;

      // Validate inputs
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'token address required' });
      }

      const chainParam = (chain as string) || 'solana';
      if (!isValidChain(chainParam)) {
        return res.status(400).json({ error: 'chain must be "solana" or "base"' });
      }

      if (side !== 'buy' && side !== 'sell') {
        return res.status(400).json({ error: 'side must be "buy" or "sell"' });
      }

      if (side === 'buy' && !amountNative) {
        return res.status(400).json({ error: 'amountNative required for buy quotes' });
      }

      if (side === 'sell' && !amountTokens) {
        return res.status(400).json({ error: 'amountTokens required for sell quotes' });
      }

      // Create quote
      const quote = await quoteService.createQuote({
        userId: req.userId!,
        tokenAddress: token,
        chain: chainParam,
        side: side as 'buy' | 'sell',
        amountNative: amountNative as string | undefined,
        amountTokens: amountTokens as string | undefined,
      });

      res.json(quote);
    } catch (error: any) {
      console.error('Quote error:', error);
      res.status(400).json({ error: error.message || 'Failed to create quote' });
    }
  });

  /**
   * GET /api/quote/:quoteId
   * Check quote status (without consuming it)
   */
  app.get('/api/quote/:quoteId', authenticateToken, async (req, res) => {
    try {
      const { quoteId } = req.params;
      const quote = quoteService.getQuote(quoteId, req.userId!);

      if (!quote) {
        return res.status(404).json({ error: 'Quote not found or expired' });
      }

      res.json({
        quoteId: quote.quoteId,
        tokenAddress: quote.tokenAddress,
        chain: quote.chain,
        side: quote.side,
        priceNative: quote.priceNative.toString(),
        estimatedOutput: quote.estimatedOutput.toString(),
        expiresAt: quote.expiresAt,
        expiresInMs: quote.expiresAt - Date.now(),
        valid: true,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
}
