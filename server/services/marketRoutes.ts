// server/services/marketRoutes.ts
// Multi-chain market data endpoints

import type { Express, RequestHandler } from 'express';
import { marketDataService } from '../services/marketData';
import { quoteService } from '../services/quoteService';
import { isValidChain, type Chain } from '../lib/chain-utils';

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
   * GET /api/market/token/:chain/:address
   * Get single token data for a specific chain (cached)
   * Example: /api/market/token/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
   */
  app.get('/api/market/token/:chain/:address', async (req, res) => {
    try {
      const { chain, address } = req.params;

      // Validate chain
      if (!isValidChain(chain)) {
        return res.status(400).json({ error: `Invalid chain. Must be one of: solana, base` });
      }

      if (!address || address.length < 20) {
        return res.status(400).json({ error: 'Invalid token address' });
      }

      const token = await marketDataService.getToken(address, chain as Chain);

      if (!token) {
        return res.status(404).json({ error: 'Token not found' });
      }

      res.json({
        ...token,
        priceNative: token.priceNative.toString(),
        cached: true,
        ageMs: Date.now() - token.lastUpdated,
      });
    } catch (error: any) {
      console.error('Market token error:', error);
      res.status(500).json({ error: 'Failed to fetch token data' });
    }
  });

  /**
   * GET /api/market/tokens?chain=solana&addresses=addr1,addr2,addr3
   * Batch endpoint for positions page
   * Much more efficient than individual calls
   */
  app.get('/api/market/tokens', async (req, res) => {
    try {
      const addressesParam = req.query.addresses as string;
      const chain = (req.query.chain as string) || 'solana';

      // Validate chain
      if (!isValidChain(chain)) {
        return res.status(400).json({ error: `Invalid chain. Must be one of: solana, base` });
      }

      if (!addressesParam) {
        return res.status(400).json({ error: 'addresses query param required' });
      }

      const addresses = addressesParam.split(',').filter(a => a.length >= 20);

      if (addresses.length === 0) {
        return res.json({ tokens: {} });
      }

      if (addresses.length > 50) {
        return res.status(400).json({ error: 'Maximum 50 addresses per request' });
      }

      const tokensMap = await marketDataService.getTokensBatch(addresses, chain as Chain);

      // Convert Map to object for JSON response
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
        chain,
      });
    } catch (error: any) {
      console.error('Market tokens batch error:', error);
      res.status(500).json({ error: 'Failed to fetch tokens data' });
    }
  });

  /**
   * GET /api/market/trending?chain=solana&limit=20
   * Get trending tokens for a specific chain (cached 30s)
   */
  app.get('/api/market/trending', async (req, res) => {
    try {
      const chain = (req.query.chain as string) || 'solana';
      const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

      // Validate chain
      if (!isValidChain(chain)) {
        return res.status(400).json({ error: `Invalid chain. Must be one of: solana, base` });
      }

      const trending = await marketDataService.getTrending(chain as Chain, limit);

      res.json({
        trending: trending.map(t => ({
          ...t,
          priceNative: t.priceNative.toString(),
        })),
        count: trending.length,
        chain,
        cachedAt: Date.now(),
      });
    } catch (error: any) {
      console.error('Market trending error:', error);
      res.status(500).json({ error: 'Failed to fetch trending tokens' });
    }
  });

  /**
   * GET /api/market/search?chain=solana&q=bonk
   * Search tokens for a specific chain (cached 60s per query)
   */
  app.get('/api/market/search', searchLimiter, async (req, res) => {
    try {
      const query = req.query.q as string;
      const chain = (req.query.chain as string) || 'solana';

      // Validate chain
      if (!isValidChain(chain)) {
        return res.status(400).json({ error: `Invalid chain. Must be one of: solana, base` });
      }

      if (!query || query.length < 2) {
        return res.json({ results: [], chain });
      }

      if (query.length > 100) {
        return res.status(400).json({ error: 'Query too long' });
      }

      const results = await marketDataService.search(query, chain as Chain);

      res.json({
        results: results.map(r => ({
          ...r,
          price: r.price.toString(),
        })),
        count: results.length,
        query,
        chain,
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
   * - chain: 'solana' or 'base' (default: solana)
   * - token: token address (required)
   * - side: 'buy' or 'sell' (required)
   * - amountNative: native token amount for buys (required for buy)
   * - amountTokens: token amount for sells (required for sell)
   */
  app.get('/api/quote', authenticateToken, async (req, res) => {
    try {
      const { chain = 'solana', token, side, amountNative, amountTokens } = req.query;

      // Validate chain
      if (!isValidChain(chain as string)) {
        return res.status(400).json({ error: `Invalid chain. Must be one of: solana, base` });
      }

      // Validate inputs
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'token address required' });
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
        chain: chain as Chain,
        tokenAddress: token,
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
        side: quote.side,
        priceNative: quote.priceNative.toString(),
        estimatedOutput: quote.estimatedOutput.toString(),
        chain: quote.chain,
        expiresAt: quote.expiresAt,
        expiresInMs: quote.expiresAt - Date.now(),
        valid: true,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
}
