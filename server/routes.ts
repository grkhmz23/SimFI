import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { storage } from "./storage";
import { authenticateToken } from "./middleware/auth";
import { initializePumpPortal, getTokens, fetchDexScreenerProfiles } from "./pumpportal";
import { leaderboardService } from "./leaderboardService";
import { insertUserSchema, solToLamports, type LoginRequest, type RegisterRequest, type BuyRequest, type SellRequest } from "@shared/schema";

// Require JWT_SECRET or SESSION_SECRET environment variable
const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('FATAL: JWT_SECRET or SESSION_SECRET environment variable must be set');
  }
  return secret;
})();

// Helper function for fetch with timeout
async function fetchWithTimeout(url: string, timeoutMs: number = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// Helper to serialize BigInt values for JSON responses
function serializeBigInts(obj: any): any {
  if (typeof obj === 'bigint') return obj.toString();
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(serializeBigInts);
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, serializeBigInts(v)])
  );
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ============================================================================
  // Auth Routes
  // ============================================================================
  
  app.post('/api/auth/register', async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      
      const existingUsername = await storage.getUserByUsername(data.username);
      if (existingUsername) {
        return res.status(400).json({ error: 'Username already taken' });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 10);
      
      // Create user
      const user = await storage.createUser({
        ...data,
        password: hashedPassword,
      });
      
      // Generate token
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
      
      // Set HttpOnly cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      console.log('✅ User registered, cookie set for:', user.username);
      
      // Return user without password
      const { password, ...userWithoutPassword } = user;
      res.status(201).json(serializeBigInts({ user: userWithoutPassword }));
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(400).json({ error: error.message || 'Registration failed' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      // Validate request body with Zod
      const loginSchema = z.object({
        email: z.string().email('Invalid email format'),
        password: z.string().min(1, 'Password is required'),
      });
      
      const validationResult = loginSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: validationResult.error.errors[0]?.message || 'Invalid login data' 
        });
      }
      
      const { email, password } = validationResult.data;
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }
      
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }
      
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
      
      // Set HttpOnly cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      console.log('✅ User logged in, cookie set for:', user.username);
      
      const { password: _, ...userWithoutPassword } = user;
      res.json(serializeBigInts({ user: userWithoutPassword }));
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
    });
    console.log('✅ User logged out, cookie cleared');
    res.json({ message: 'Logged out successfully' });
  });

  app.get('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUserById(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const { password, ...userWithoutPassword } = user;
      res.json(serializeBigInts(userWithoutPassword));
    } catch (error: any) {
      console.error('Profile error:', error);
      res.status(500).json({ error: 'Could not fetch profile' });
    }
  });

  app.put('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
      const { username, walletAddress, password } = req.body;
      const updates: any = {};
      
      if (username) {
        if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
          return res.status(400).json({ error: 'Invalid username format' });
        }
        const existing = await storage.getUserByUsername(username);
        if (existing && existing.id !== req.userId) {
          return res.status(400).json({ error: 'Username already taken' });
        }
        updates.username = username;
      }
      
      if (walletAddress) {
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
          return res.status(400).json({ error: 'Invalid Solana wallet address' });
        }
        updates.walletAddress = walletAddress;
      }
      
      if (password) {
        if (password.length < 6) {
          return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        updates.password = await bcrypt.hash(password, 10);
      }
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }
      
      await storage.updateUserProfile(req.userId!, updates);
      res.json({ message: 'Profile updated successfully' });
    } catch (error: any) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Could not update profile' });
    }
  });

  // ============================================================================
  // Trading Routes
  // ============================================================================
  
  app.get('/api/trades/positions', authenticateToken, async (req, res) => {
    try {
      const positions = await storage.getUserPositions(req.userId!);
      res.json(serializeBigInts({ positions }));
    } catch (error: any) {
      console.error('Get positions error:', error);
      res.status(500).json({ error: 'Could not fetch positions' });
    }
  });

  app.post('/api/trades/buy', authenticateToken, async (req, res) => {
    try {
      const { tokenAddress, tokenName, tokenSymbol, solAmount, price, tokenAmount: providedTokenAmount } = req.body;
      
      if (!tokenAddress || !tokenName || !tokenSymbol || solAmount <= 0 || price <= 0) {
        return res.status(400).json({ error: 'Invalid trade data' });
      }
      
      const user = await storage.getUserById(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Calculate how much SOL to spend in Lamports (convert to BigInt)
      const solSpent = BigInt(Math.floor(solAmount * 1_000_000_000)); // Convert SOL to Lamports
      const priceBigInt = BigInt(Math.floor(price)); // Price in Lamports per token
      
      // Always calculate tokens with BigInt arithmetic (no Jupiter quote usage)
      // tokenAmount = (solSpent * 1e9) / price
      const tokenAmount = (solSpent * BigInt(1_000_000_000)) / priceBigInt;
      console.log(`🔢 BigInt calculation: ${solAmount} SOL → ${Number(tokenAmount) / 1_000_000_000} tokens at ${price} Lamports/token`);
      
      if (tokenAmount <= 0n) {
        return res.status(400).json({ error: 'SOL amount too small to buy tokens' });
      }
      
      if (user.balance < solSpent) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      
      // Deduct balance first
      await storage.updateUserBalance(req.userId!, -solSpent);
      
      // Use INSERT ... ON CONFLICT to atomically create or aggregate position
      // This prevents race conditions by using database-level conflict resolution
      const position = await storage.createOrAggregatePosition({
        userId: req.userId!,
        tokenAddress,
        tokenName,
        tokenSymbol,
        entryPrice: priceBigInt,
        amount: tokenAmount,
        solSpent,
      });
      
      console.log(`💼 Position for ${tokenSymbol}: ${Number(position.amount) / 1_000_000_000} tokens (${position.id})`);
      
      const newUser = await storage.getUserById(req.userId!);
      
      res.json({ 
        message: 'Position processed successfully',
        positionId: position.id,
        newBalance: newUser!.balance.toString(),
        tokensReceived: tokenAmount.toString()
      });
    } catch (error: any) {
      console.error('Buy error:', error);
      res.status(500).json({ error: 'Could not execute buy order' });
    }
  });

  app.post('/api/trades/sell', authenticateToken, async (req, res) => {
    try {
      const { positionId, amountLamports, exitPriceLamports } = req.body as any;
      
      if (!positionId || !exitPriceLamports) {
        return res.status(400).json({ error: 'Invalid sell data' });
      }
      
      const position = await storage.getPositionById(positionId);
      if (!position || position.userId !== req.userId) {
        return res.status(404).json({ error: 'Position not found' });
      }
      
      // Parse both as BigInt (sent as strings from frontend for precision)
      const sellAmount = amountLamports ? BigInt(amountLamports) : position.amount;
      const exitPriceBigInt = BigInt(exitPriceLamports);
      
      // Validate sell amount is positive and not zero after rounding
      if (sellAmount <= 0n) {
        return res.status(400).json({ error: 'Sell amount must be greater than zero' });
      }
      
      if (sellAmount > position.amount) {
        return res.status(400).json({ error: 'Sell amount exceeds position size' });
      }
      
      // Use BigInt arithmetic to prevent overflow
      // solReceived = (sellAmount * exitPrice) / 1e9
      const solReceived = (sellAmount * exitPriceBigInt) / BigInt(1_000_000_000);
      
      // proportionalCost = (solSpent * sellAmount) / totalAmount
      const proportionalCost = (position.solSpent * sellAmount) / position.amount;
      const profitLoss = solReceived - proportionalCost;
      
      // Update user balance and profit
      await storage.updateUserBalance(req.userId!, solReceived);
      await storage.updateUserTotalProfit(req.userId!, profitLoss);
      
      // Create trade history entry
      await storage.createTrade({
        userId: req.userId!,
        tokenAddress: position.tokenAddress,
        tokenName: position.tokenName,
        tokenSymbol: position.tokenSymbol,
        entryPrice: position.entryPrice,
        exitPrice: exitPriceBigInt,
        amount: sellAmount,
        solSpent: proportionalCost,
        solReceived,
        profitLoss,
        openedAt: position.openedAt,
      });
      
      // Always delete position and create a new one for remaining if partial sell
      await storage.deletePosition(positionId);
      
      // If partial sell, create new position with remaining amount
      if (sellAmount < position.amount) {
        const remainingAmount = position.amount - sellAmount;
        const remainingCost = position.solSpent - proportionalCost;
        
        await storage.createPosition({
          userId: req.userId!,
          tokenAddress: position.tokenAddress,
          tokenName: position.tokenName,
          tokenSymbol: position.tokenSymbol,
          entryPrice: position.entryPrice,
          amount: remainingAmount,
          solSpent: remainingCost,
        });
      }
      
      res.json({
        message: 'Position closed successfully',
        profitLoss: profitLoss.toString(),
        solReceived: solReceived.toString(),
      });
    } catch (error: any) {
      console.error('Sell error:', error);
      res.status(500).json({ error: 'Could not execute sell order' });
    }
  });

  app.post('/api/trades/sell-all', authenticateToken, async (req, res) => {
    try {
      const { tokenAddress, exitPrice } = req.body;
      
      if (!tokenAddress || exitPrice <= 0) {
        return res.status(400).json({ error: 'Invalid sell data' });
      }
      
      // Get all positions for this token and user
      const allPositions = await storage.getUserPositions(req.userId!);
      const tokenPositions = allPositions.filter(p => p.tokenAddress === tokenAddress);
      
      if (tokenPositions.length === 0) {
        return res.status(404).json({ error: 'No positions found for this token' });
      }
      
      // Convert to BigInt for all accumulations
      let totalSolReceived = 0n;
      let totalProfit = 0n;
      let totalTokensSold = 0n;
      
      // Convert exitPrice to BigInt
      const exitPriceBigInt = BigInt(Math.floor(exitPrice));
      
      // Sell all positions
      for (const position of tokenPositions) {
        const sellAmount = position.amount;
        // Use BigInt arithmetic: (sellAmount * exitPrice) / 1e9
        const solReceived = (sellAmount * exitPriceBigInt) / BigInt(1_000_000_000);
        const profitLoss = solReceived - position.solSpent;
        
        totalSolReceived += solReceived;
        totalProfit += profitLoss;
        totalTokensSold += sellAmount;
        
        // Update user balance and profit
        await storage.updateUserBalance(req.userId!, solReceived);
        await storage.updateUserTotalProfit(req.userId!, profitLoss);
        
        // Create trade history entry
        await storage.createTrade({
          userId: req.userId!,
          tokenAddress: position.tokenAddress,
          tokenName: position.tokenName,
          tokenSymbol: position.tokenSymbol,
          entryPrice: position.entryPrice,
          exitPrice: exitPriceBigInt,
          amount: sellAmount,
          solSpent: position.solSpent,
          solReceived,
          profitLoss,
          openedAt: position.openedAt,
        });
        
        // Delete the position
        await storage.deletePosition(position.id);
      }
      
      console.log(`✅ Sold all ${tokenPositions.length} positions of ${tokenAddress}: ${Number(totalTokensSold) / 1_000_000_000} tokens for ${Number(totalSolReceived) / 1_000_000_000} SOL (P/L: ${Number(totalProfit) / 1_000_000_000} SOL)`);
      
      res.json({
        message: `Successfully sold ${tokenPositions.length} position(s)`,
        positionsClosed: tokenPositions.length,
        totalProfit: totalProfit.toString(),
        totalSolReceived: totalSolReceived.toString(),
      });
    } catch (error: any) {
      console.error('Sell all error:', error);
      res.status(500).json({ error: 'Could not execute sell all order' });
    }
  });

  app.get('/api/trades/history', authenticateToken, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = 50;
      const offset = (page - 1) * limit;
      
      const [trades, totalCount] = await Promise.all([
        storage.getUserTrades(req.userId!, limit, offset),
        storage.getUserTradesCount(req.userId!)
      ]);
      
      res.json(serializeBigInts({
        trades,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      }));
    } catch (error: any) {
      console.error('Get history error:', error);
      res.status(500).json({ error: 'Could not fetch trade history' });
    }
  });

  // ============================================================================
  // Token Routes
  // ============================================================================
  
  app.get('/api/tokens/pairs', (req, res) => {
    try {
      const { category = 'new' } = req.query;
      const allTokens = getTokens();
      
      let responseData;
      switch (category) {
        case 'graduating':
          responseData = allTokens.graduating;
          break;
        case 'graduated':
          responseData = allTokens.graduated;
          break;
        default:
          responseData = allTokens.new;
      }
      
      res.json({ pairs: responseData.slice(0, 100) });
    } catch (error: any) {
      console.error('Get pairs error:', error);
      res.status(500).json({ error: 'Could not fetch token pairs' });
    }
  });

  // IMPORTANT: Search route must come BEFORE :address route to avoid matching "search" as an address
  app.get('/api/tokens/search', async (req, res) => {
    try {
      const query = req.query.q as string || '';
      const searchTerm = query.toLowerCase().trim();
      
      console.log(`🔍 Search request: "${searchTerm}"`);

      if (!searchTerm || searchTerm.length < 3) {
        return res.json({ results: [] });
      }

      const results: any[] = [];

      // Search through local tokens from WebSocket
      const allTokens = getTokens();
      const localTokens = [...allTokens.new, ...allTokens.graduating, ...allTokens.graduated];
      
      for (const token of localTokens) {
        const address = token.tokenAddress.toLowerCase();
        const name = token.name?.toLowerCase() || '';
        const symbol = token.symbol?.toLowerCase() || '';
        
        if (address.includes(searchTerm) || name.includes(searchTerm) || symbol.includes(searchTerm)) {
          results.push({
            tokenAddress: token.tokenAddress,
            name: token.name || `${token.tokenAddress.slice(0, 4)}...${token.tokenAddress.slice(-4)}`,
            symbol: token.symbol || token.tokenAddress.slice(0, 4).toUpperCase(),
            marketCap: token.marketCap,
            price: token.price,
          });
        }
      }

      // Search DexScreener API for broader results (including historical tokens)
      try {
        const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(searchTerm)}`);
        if (dexResponse.ok) {
          const dexData = await dexResponse.json();
          
          // Filter for Solana pairs only
          const solanaPairs = dexData.pairs?.filter((pair: any) => pair.chainId === 'solana') || [];
          console.log(`📊 DexScreener returned ${solanaPairs.length} Solana pairs for "${searchTerm}"`);
          
          for (const pair of solanaPairs.slice(0, 15)) {
            const tokenAddress = pair.baseToken?.address;
            if (!tokenAddress) continue;
            
            // Skip if already found
            if (results.some(r => r.tokenAddress === tokenAddress)) continue;
            
            // Use native price (already in SOL) instead of USD price
            const priceNative = pair.priceNative ? parseFloat(pair.priceNative) : 0;
            const priceLamports = priceNative > 0 ? Math.floor(priceNative * 1_000_000_000) : 0;
            
            results.push({
              tokenAddress,
              name: pair.baseToken?.name || 'Unknown',
              symbol: pair.baseToken?.symbol || '???',
              marketCap: pair.marketCap || pair.fdv || 0,
              price: priceLamports,
              icon: pair.info?.imageUrl,
              dexId: pair.dexId,
              volume24h: pair.volume?.h24 || 0,
              priceChange24h: pair.priceChange?.h24 || 0,
            });
          }
        }
      } catch (dexError) {
        console.error('DexScreener API search error:', dexError);
        // Continue with local results
      }

      // Also search DexScreener profiles (for additional metadata)
      try {
        const profiles = await fetchDexScreenerProfiles();
        
        for (const p of profiles) {
          if (p.chainId !== 'solana') continue;
          
          const address = p.tokenAddress?.toLowerCase() || '';
          const description = p.description?.toLowerCase() || '';
          const url = p.url?.toLowerCase() || '';
          
          // Skip if already found
          if (results.some(r => r.tokenAddress === p.tokenAddress)) continue;
          
          if (address.includes(searchTerm) || description.includes(searchTerm) || url.includes(searchTerm)) {
            results.push({
              tokenAddress: p.tokenAddress,
              name: p.description?.split('\n')[0]?.trim() || 'Unknown',
              symbol: p.tokenAddress?.slice(0, 4).toUpperCase() || '???',
              icon: p.icon,
            });
          }
        }
      } catch (profileError) {
        console.error('DexScreener profiles error:', profileError);
      }

      const finalResults = results.slice(0, 20);
      console.log(`✅ Returning ${finalResults.length} search results for "${searchTerm}"`);
      res.json({ results: finalResults });
    } catch (error: any) {
      console.error('Search tokens error:', error);
      res.status(500).json({ error: 'Could not search tokens' });
    }
  });

  // Get historical OHLCV data for charting
  app.get('/api/tokens/:address/ohlcv', async (req, res) => {
    try {
      const { address } = req.params;
      const { timeframe = '1H' } = req.query;

      // First, find the pool address from DexScreener
      const poolResponse = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${address}`, 5000);
      if (!poolResponse.ok) {
        return res.status(404).json({ error: 'Token not found' });
      }

      const poolData = await poolResponse.json();
      if (!poolData.pairs || poolData.pairs.length === 0) {
        return res.status(404).json({ error: 'No trading pairs found' });
      }

      // Get the main pair (highest liquidity usually first)
      const pair = poolData.pairs[0];
      const pairAddress = pair.pairAddress;

      // Map timeframe to GeckoTerminal aggregate and time unit
      const timeframeMap: Record<string, { unit: string; aggregate: number; limit: number }> = {
        '5M': { unit: 'minute', aggregate: 5, limit: 60 },
        '15M': { unit: 'minute', aggregate: 15, limit: 60 },
        '1H': { unit: 'hour', aggregate: 1, limit: 60 },
        '4H': { unit: 'hour', aggregate: 4, limit: 48 },
        '1D': { unit: 'day', aggregate: 1, limit: 24 },
        '1W': { unit: 'day', aggregate: 7, limit: 24 }
      };

      const tfConfig = timeframeMap[timeframe as string] || timeframeMap['1H'];

      // Fetch OHLCV data from GeckoTerminal
      const geckoUrl = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/ohlcv/${tfConfig.unit}`;
      const geckoResponse = await fetchWithTimeout(
        `${geckoUrl}?aggregate=${tfConfig.aggregate}&limit=${tfConfig.limit}&currency=usd`,
        10000
      );

      if (!geckoResponse.ok) {
        console.warn(`GeckoTerminal API error: ${geckoResponse.status}`);
        return res.status(500).json({ error: 'Failed to fetch chart data' });
      }

      const ohlcvData = await geckoResponse.json();
      const candles = ohlcvData?.data?.attributes?.ohlcv_list || [];

      res.json({ 
        success: true,
        candles,
        pairAddress,
        timeframe
      });
    } catch (error: any) {
      console.error('OHLCV fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch chart data' });
    }
  });

  // Get trending tokens from DexScreener (must come BEFORE :address route)
  // Note: Using top boosts as proxy for trending since DexScreener doesn't have a dedicated trending endpoint
  app.get('/api/tokens/trending', async (req, res) => {
    try {
      // Fetch top boosted tokens (promoted tokens tend to be trending)
      const dexResponse = await fetchWithTimeout('https://api.dexscreener.com/token-boosts/top/v1', 5000);
      
      if (!dexResponse.ok) {
        console.error(`❌ DexScreener boosts API error: ${dexResponse.status}`);
        return res.status(500).json({ error: 'Failed to fetch trending tokens', tokens: [] });
      }
      
      const boostedTokens = await dexResponse.json();
      
      if (!Array.isArray(boostedTokens)) {
        console.error('❌ Invalid response format from DexScreener boosts API');
        return res.status(500).json({ error: 'Invalid API response', tokens: [] });
      }
      
      // Filter for Solana tokens and map to our format
      const trendingTokens = boostedTokens
        .filter((item: any) => item.chainId === 'solana' && item.tokenAddress)
        .slice(0, 50) // Top 50
        .map((item: any) => {
          // Boosted tokens have URL like dexscreener.com/solana/ADDRESS
          const url = item.url || '';
          const addressMatch = url.match(/solana\/([A-Za-z0-9]+)/);
          const pairAddress = addressMatch ? addressMatch[1] : item.tokenAddress;
          
          return {
            tokenAddress: item.tokenAddress,
            name: item.description?.split('\n')[0]?.trim() || 'Unknown',
            symbol: item.tokenAddress.slice(0, 4).toUpperCase(),
            price: 0, // Price not available in boosts endpoint
            marketCap: 0,
            volume24h: 0,
            priceChange24h: 0,
            creator: undefined,
            timestamp: new Date().toISOString(),
            icon: item.icon,
          };
        });
      
      console.log(`📈 Fetched ${trendingTokens.length} boosted tokens as trending from DexScreener`);
      res.json({ tokens: trendingTokens });
    } catch (error: any) {
      console.error('Get trending tokens error:', error);
      res.status(500).json({ error: 'Could not fetch trending tokens', tokens: [] });
    }
  });

  // Get individual token by address (must come AFTER search route and trending route)
  app.get('/api/tokens/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const allTokens = getTokens();
      
      // Search for token in all categories (local WebSocket feed)
      let token = allTokens.new.find(t => t.tokenAddress === address);
      if (!token) {
        token = allTokens.graduating.find(t => t.tokenAddress === address);
      }
      if (!token) {
        token = allTokens.graduated.find(t => t.tokenAddress === address);
      }
      
      // If not found locally, try DexScreener API for historical tokens
      if (!token) {
        console.log(`🔍 Token ${address} not in local feed, checking DexScreener...`);
        try {
          const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
          if (dexResponse.ok) {
            const dexData = await dexResponse.json();
            
            // Find the Solana pair for this token
            const solanaPair = dexData.pairs?.find((pair: any) => 
              pair.chainId === 'solana' && pair.baseToken?.address === address
            );
            
            if (solanaPair) {
              // Use native price (already in SOL) instead of USD price
              const priceNative = solanaPair.priceNative ? parseFloat(solanaPair.priceNative) : 0;
              
              // Validate price exists
              if (priceNative === 0) {
                console.warn(`⚠️ Token ${address} has no price data on DexScreener`);
                return res.status(404).json({ error: 'Token price data unavailable' });
              }
              
              // Convert SOL to Lamports
              const priceLamports = Math.floor(priceNative * 1_000_000_000);
              
              token = {
                tokenAddress: address,
                name: solanaPair.baseToken?.name || 'Unknown Token',
                symbol: solanaPair.baseToken?.symbol || '???',
                price: priceLamports,
                marketCap: solanaPair.marketCap || solanaPair.fdv || 0,
                creator: undefined,
                timestamp: new Date().toISOString(),
              };
              
              console.log(`✅ Found token ${address} on DexScreener: ${token.name} (${token.symbol}) - Price: ${priceNative} SOL`);
            }
          }
        } catch (dexError) {
          console.error('DexScreener API error for token:', dexError);
        }
      }
      
      if (!token) {
        return res.status(404).json({ error: 'Token not found' });
      }
      
      res.json({ token });
    } catch (error: any) {
      console.error('Get token error:', error);
      res.status(500).json({ error: 'Could not fetch token' });
    }
  });

  // Get Jupiter quote for buying tokens with SOL
  app.get('/api/tokens/quote/buy', async (req, res) => {
    try {
      const { tokenAddress, solAmount } = req.query;
      
      if (!tokenAddress || !solAmount) {
        return res.status(400).json({ error: 'tokenAddress and solAmount are required' });
      }

      const solAmountNum = parseFloat(solAmount as string);
      if (isNaN(solAmountNum) || solAmountNum <= 0) {
        return res.status(400).json({ error: 'Invalid SOL amount' });
      }

      // Convert SOL to Lamports for Jupiter API
      const inputAmountLamports = Math.floor(solAmountNum * 1_000_000_000);
      
      // SOL mint address (wrapped SOL)
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      
      // Call Jupiter V6 Quote API
      const jupiterUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${tokenAddress}&amount=${inputAmountLamports}&slippageBps=50`;
      
      console.log(`🔮 Fetching Jupiter quote for ${solAmountNum} SOL → ${tokenAddress}`);
      
      const response = await fetchWithTimeout(jupiterUrl, 5000);
      
      if (!response.ok) {
        console.error(`❌ Jupiter API error: ${response.status} ${response.statusText}`);
        return res.status(response.status).json({ error: 'Failed to get quote from Jupiter' });
      }
      
      const quoteData = await response.json();
      
      if (!quoteData || !quoteData.outAmount) {
        console.error('❌ Invalid Jupiter quote response:', quoteData);
        return res.status(500).json({ error: 'Invalid quote data from Jupiter' });
      }
      
      // Extract quote details
      const tokenAmountOut = parseInt(quoteData.outAmount); // In token's smallest unit
      const priceImpactPct = parseFloat(quoteData.priceImpactPct || '0');
      
      // Calculate effective price: SOL spent / tokens received = SOL per token
      // Both in their raw units (Lamports / token base units)
      const effectivePriceLamports = tokenAmountOut > 0 
        ? Math.floor(inputAmountLamports / (tokenAmountOut / 1_000_000_000))
        : 0;
      
      console.log(`✅ Jupiter quote: ${solAmountNum} SOL → ${tokenAmountOut / 1_000_000_000} tokens (impact: ${priceImpactPct}%)`);
      
      res.json({
        solAmount: solAmountNum,
        solAmountLamports: inputAmountLamports,
        tokenAmountOut: tokenAmountOut,
        tokenAmountDisplay: tokenAmountOut / 1_000_000_000,
        effectivePriceLamports: effectivePriceLamports,
        priceImpactPct: priceImpactPct,
        slippageBps: 50,
      });
    } catch (error: any) {
      console.error('Jupiter quote error:', error);
      res.status(500).json({ error: 'Could not fetch quote' });
    }
  });

  // Get Jupiter quote for selling tokens for SOL
  app.get('/api/tokens/quote/sell', async (req, res) => {
    try {
      const { tokenAddress, tokenAmount } = req.query;
      
      if (!tokenAddress || !tokenAmount) {
        return res.status(400).json({ error: 'tokenAddress and tokenAmount are required' });
      }

      const tokenAmountNum = parseFloat(tokenAmount as string);
      if (isNaN(tokenAmountNum) || tokenAmountNum <= 0) {
        return res.status(400).json({ error: 'Invalid token amount' });
      }

      // Convert token amount to smallest unit (assuming 9 decimals like most Solana tokens)
      const inputAmountTokenUnits = Math.floor(tokenAmountNum * 1_000_000_000);
      
      // SOL mint address (wrapped SOL)
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      
      // Call Jupiter V6 Quote API - now selling tokens for SOL
      const jupiterUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${tokenAddress}&outputMint=${SOL_MINT}&amount=${inputAmountTokenUnits}&slippageBps=50`;
      
      console.log(`🔮 Fetching Jupiter quote for ${tokenAmountNum} tokens → SOL (${tokenAddress})`);
      
      const response = await fetchWithTimeout(jupiterUrl, 5000);
      
      if (!response.ok) {
        console.error(`❌ Jupiter API error: ${response.status} ${response.statusText}`);
        return res.status(response.status).json({ error: 'Failed to get quote from Jupiter' });
      }
      
      const quoteData = await response.json();
      
      if (!quoteData || !quoteData.outAmount) {
        console.error('❌ Invalid Jupiter quote response:', quoteData);
        return res.status(500).json({ error: 'Invalid quote data from Jupiter' });
      }
      
      // Extract quote details
      const solAmountOut = parseInt(quoteData.outAmount); // In Lamports
      const priceImpactPct = parseFloat(quoteData.priceImpactPct || '0');
      
      // Calculate effective price: SOL received / tokens sold = SOL per token (in Lamports)
      const effectivePriceLamports = tokenAmountNum > 0 
        ? Math.floor(solAmountOut / tokenAmountNum)
        : 0;
      
      console.log(`✅ Jupiter quote: ${tokenAmountNum} tokens → ${solAmountOut / 1_000_000_000} SOL (impact: ${priceImpactPct}%)`);
      
      res.json({
        tokenAmount: tokenAmountNum,
        tokenAmountUnits: inputAmountTokenUnits,
        solAmountOut: solAmountOut,
        solAmountDisplay: solAmountOut / 1_000_000_000,
        effectivePriceLamports: effectivePriceLamports,
        priceImpactPct: priceImpactPct,
        slippageBps: 50,
      });
    } catch (error: any) {
      console.error('Jupiter sell quote error:', error);
      res.status(500).json({ error: 'Could not fetch quote' });
    }
  });

  // ============================================================================
  // Leaderboard Routes
  // ============================================================================
  
  app.get('/api/leaderboard/overall', async (req, res) => {
    try {
      const leaders = await storage.getTopUsersByTotalProfit(100);
      res.json({ leaders: leaders.map((l, i) => ({ ...l, rank: i + 1 })) });
    } catch (error: any) {
      console.error('Get overall leaderboard error:', error);
      res.status(500).json({ error: 'Could not fetch leaderboard' });
    }
  });

  app.get('/api/leaderboard/current-period', async (req, res) => {
    try {
      // Get the actual current period from storage
      const currentPeriod = await storage.getCurrentLeaderboardPeriod();
      
      if (!currentPeriod) {
        return res.json({ leaders: [], periodStart: new Date().toISOString(), periodEnd: new Date().toISOString() });
      }
      
      // Use the actual period boundaries for accurate calculations
      const leaders = await storage.getTopUsersByPeriodProfit(
        new Date(currentPeriod.startTime), 
        new Date(currentPeriod.endTime), 
        100
      );
      
      res.json({ 
        leaders: leaders.map((l, i) => ({ ...l, rank: i + 1 })), 
        periodStart: currentPeriod.startTime,
        periodEnd: currentPeriod.endTime
      });
    } catch (error: any) {
      console.error('Get period leaderboard error:', error);
      res.status(500).json({ error: 'Could not fetch period leaderboard' });
    }
  });

  app.get('/api/leaderboard/winners', async (req, res) => {
    try {
      const winners = await storage.getPastWinners(10);
      res.json({ winners });
    } catch (error: any) {
      console.error('Get winners error:', error);
      res.status(500).json({ error: 'Could not fetch winners' });
    }
  });

  const httpServer = createServer(app);
  
  // Initialize WebSocket for pump.fun integration
  initializePumpPortal(httpServer);
  
  // Initialize leaderboard service for period management
  leaderboardService.start();

  return httpServer;
}
