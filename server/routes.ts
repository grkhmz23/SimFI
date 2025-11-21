import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { positions, tradeHistory } from "@shared/schema";
import { storage } from "./storage";
import { authenticateToken } from "./middleware/auth";
import { fetchDexScreenerProfiles } from "./pumpportal";
import { leaderboardService } from "./leaderboardService";
import { heliusService as oldHeliusService } from "./helius";
import { heliusService } from "./helius-enhanced";
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

// Helper to find the best (highest liquidity) Solana pair from DexScreener pairs array
// This ensures we get the most accurate price from the most liquid market
function findBestSolanaPair(pairs: any[], tokenAddress: string): any | null {
  if (!pairs || pairs.length === 0) return null;
  
  // Filter for Solana pairs matching this token
  const solanaPairs = pairs.filter((pair: any) => 
    pair.chainId === 'solana' && 
    pair.baseToken?.address === tokenAddress &&
    pair.priceNative
  );
  
  if (solanaPairs.length === 0) return null;
  
  // Sort by liquidity (USD) descending - highest liquidity = most accurate price
  solanaPairs.sort((a: any, b: any) => {
    const liquidityA = parseFloat(a.liquidity?.usd || '0');
    const liquidityB = parseFloat(b.liquidity?.usd || '0');
    return liquidityB - liquidityA;
  });
  
  return solanaPairs[0]; // Return highest liquidity pair
}

// Helper to fetch current price from DexScreener (for price validation)
// Returns price in lamports per token (clamped to minimum 1 for sub-lamport tokens)
async function fetchDexScreenerPrice(tokenAddress: string): Promise<{ priceLamports: number } | null> {
  try {
    const dexResponse = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, 3000);
    if (dexResponse.ok) {
      const dexData = await dexResponse.json();
      const solanaPair = findBestSolanaPair(dexData.pairs, tokenAddress);
      
      if (solanaPair && solanaPair.priceNative) {
        // Convert to lamports, clamp to 1 minimum (sub-lamport tokens are <$0.0000002)
        const priceLamports = Math.max(1, Math.floor(parseFloat(solanaPair.priceNative) * 1_000_000_000));
        return { priceLamports };
      }
    }
  } catch (error) {
    console.log(`⚠️ DexScreener price fetch failed for ${tokenAddress}`);
  }
  return null;
}

// Helper to fetch token metadata from multiple APIs with fallbacks
async function fetchTokenMetadata(tokenAddress: string): Promise<{ icon?: string; name?: string; symbol?: string } | null> {
  let dexMetadata: { icon?: string; name?: string; symbol?: string } | null = null;
  
  // Try DexScreener first (free, no API key needed)
  try {
    const dexResponse = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, 3000);
    if (dexResponse.ok) {
      const dexData = await dexResponse.json();
      const solanaPair = findBestSolanaPair(dexData.pairs, tokenAddress);
      
      if (solanaPair) {
        dexMetadata = {
          icon: solanaPair.info?.imageUrl,
          name: solanaPair.baseToken?.name,
          symbol: solanaPair.baseToken?.symbol,
        };
        
        // If DexScreener has icon, return immediately
        if (dexMetadata.icon) {
          console.log(`✅ DexScreener metadata for ${tokenAddress}: icon=Yes`);
          return dexMetadata;
        }
        
        console.log(`⚠️ DexScreener has metadata for ${tokenAddress} but NO icon, trying Birdeye...`);
      }
    }
  } catch (error) {
    console.log(`⚠️ DexScreener metadata fetch failed for ${tokenAddress}`);
  }

  // Try Birdeye API v3 (free tier available, no API key required for basic calls)
  try {
    console.log(`🔍 Trying Birdeye v3 for ${tokenAddress.slice(0, 8)}...`);
    const birdeyeResponse = await fetch(
      `https://public-api.birdeye.so/defi/v3/token/meta-data/single?address=${tokenAddress}`,
      {
        headers: {
          'accept': 'application/json',
          'x-chain': 'solana',
        },
        signal: AbortSignal.timeout(3000),
      }
    );
    
    if (birdeyeResponse.ok) {
      const birdeyeData = await birdeyeResponse.json();
      console.log(`📊 Birdeye v3 response for ${tokenAddress.slice(0, 8)}: success=${birdeyeData.success}`);
      
      if (birdeyeData.success && birdeyeData.data) {
        const birdeyeIcon = birdeyeData.data.logoURI || birdeyeData.data.icon;
        console.log(`✅ Birdeye v3 metadata for ${tokenAddress.slice(0, 8)}: icon=${birdeyeIcon ? 'Yes' : 'No'}`);
        
        return {
          icon: birdeyeIcon || dexMetadata?.icon,
          name: birdeyeData.data.name || dexMetadata?.name,
          symbol: birdeyeData.data.symbol || dexMetadata?.symbol,
        };
      }
    }
  } catch (error: any) {
    console.log(`⚠️ Birdeye v3 metadata fetch failed for ${tokenAddress.slice(0, 8)}: ${error.message}`);
  }

  // Fallback to older Birdeye token_overview endpoint
  try {
    console.log(`🔍 Trying Birdeye token_overview for ${tokenAddress.slice(0, 8)}...`);
    const birdeyeResponse = await fetch(
      `https://public-api.birdeye.so/defi/token_overview?address=${tokenAddress}`,
      {
        headers: {
          'accept': 'application/json',
          'x-chain': 'solana',
        },
        signal: AbortSignal.timeout(3000),
      }
    );
    
    if (birdeyeResponse.ok) {
      const birdeyeData = await birdeyeResponse.json();
      console.log(`📊 Birdeye token_overview response for ${tokenAddress.slice(0, 8)}: has data=${!!birdeyeData.data}`);
      
      if (birdeyeData.data) {
        const birdeyeIcon = birdeyeData.data.logoURI || birdeyeData.data.icon;
        console.log(`✅ Birdeye token_overview metadata for ${tokenAddress.slice(0, 8)}: icon=${birdeyeIcon ? 'Yes' : 'No'}`);
        
        return {
          icon: birdeyeIcon || dexMetadata?.icon,
          name: birdeyeData.data.name || dexMetadata?.name,
          symbol: birdeyeData.data.symbol || dexMetadata?.symbol,
        };
      }
    }
  } catch (error: any) {
    console.log(`⚠️ Birdeye token_overview fetch failed for ${tokenAddress.slice(0, 8)}: ${error.message}`);
  }

  // Return DexScreener metadata if we got it (even without icon)
  if (dexMetadata) {
    console.log(`📌 Returning DexScreener metadata for ${tokenAddress.slice(0, 8)} (no Birdeye data available)`);
    return dexMetadata;
  }

  console.log(`❌ No metadata found for ${tokenAddress.slice(0, 8)} from any source`);
  return null;
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
      const { email, username } = req.body;
      console.log('🔐 Login attempt:', { email, username });
      
      // Validate request body with Zod - accept either email OR username
      const loginSchema = z.object({
        email: z.string().optional(),
        username: z.string().optional(),
        password: z.string().min(1, 'Password is required'),
      }).refine(
        data => data.email || data.username,
        { message: 'Either email or username is required' }
      );
      
      const validationResult = loginSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: validationResult.error.errors[0]?.message || 'Invalid login data' 
        });
      }
      
      const { password } = validationResult.data;
      
      // Try to find user by email or username
      let user;
      if (email) {
        user = await storage.getUserByEmail(email);
      } else if (username) {
        user = await storage.getUserByUsername(username);
      }
      
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
  // Telegram Auth Routes (Bot-Only - Protected by shared secret)
  // ============================================================================

  // Middleware to verify telegram bot requests
  const verifyBotSecret = (req: any, res: any, next: any) => {
    const botSecret = req.headers['x-bot-secret'];
    // Use dev token in development, production token in production (same as bot.js)
    const expectedSecret = process.env.NODE_ENV === 'development' 
      ? process.env.TELEGRAM_BOT_TOKEN_DEV 
      : process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botSecret || botSecret !== expectedSecret) {
      return res.status(403).json({ error: 'Forbidden - Invalid bot secret' });
    }
    
    next();
  };

  // Telegram registration endpoint
  app.post('/api/telegram/auth/register', verifyBotSecret, async (req, res) => {
    try {
      const { email, username, password, walletAddress } = req.body;
      
      // Validate inputs
      if (!email || !username || !password) {
        return res.status(400).json({ error: 'Email, username, and password are required' });
      }

      // Use same registration validation as web app
      const validationSchema = insertUserSchema.extend({
        email: z.string().email('Invalid email'),
        username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid username format'),
        password: z.string().min(6, 'Password must be at least 6 characters'),
        walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana wallet'),
      });

      const validationResult = validationSchema.safeParse({
        email,
        username,
        password,
        walletAddress: walletAddress || 'So11111111111111111111111111111111111111112',
      });

      if (!validationResult.success) {
        return res.status(400).json({ error: validationResult.error.errors[0]?.message || 'Validation failed' });
      }

      // Check if email or username already exists
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({ error: 'Username already taken' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await storage.createUser({
        email,
        username,
        password: hashedPassword,
        walletAddress: walletAddress || 'So11111111111111111111111111111111111111112',
      });

      // Generate token
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

      console.log('✅ Telegram bot user registered:', user.username);

      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json(serializeBigInts({ 
        user: userWithoutPassword,
        token 
      }));
    } catch (error: any) {
      console.error('Telegram registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // Telegram login endpoint
  app.post('/api/telegram/auth/login', verifyBotSecret, async (req, res) => {
    try {
      const { email, password } = req.body;
      
      console.log(`🔐 Telegram login attempt for: ${email}`);
      
      if (!email || !password) {
        console.warn('Missing email or password in login request');
        return res.status(400).json({ error: 'Email and password are required' });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        console.warn(`❌ No user found with email: ${email}`);
        return res.status(400).json({ error: 'Invalid credentials - user not found' });
      }

      console.log(`✅ User found: ${user.username}, checking password...`);

      // Check password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        console.warn(`❌ Invalid password for user: ${user.username}`);
        return res.status(400).json({ error: 'Invalid credentials - wrong password' });
      }

      console.log(`✅ Password valid for user: ${user.username}`);

      // Generate token
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

      console.log('✅ Telegram bot user logged in:', user.username);

      const { password: _, ...userWithoutPassword } = user;
      res.json(serializeBigInts({ 
        user: userWithoutPassword,
        token 
      }));
    } catch (error: any) {
      console.error('❌ Telegram login error:', error.message || error);
      res.status(500).json({ error: 'Login failed - server error' });
    }
  });

  // ============================================================================
  // Telegram Session Routes (Bot-Only - Protected by shared secret)
  // ============================================================================

  app.post('/api/telegram/session', verifyBotSecret, async (req, res) => {
    try {
      const { telegramUserId, userId, token, balance } = req.body;
      
      if (!telegramUserId || !userId || !token || balance === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const session = await storage.saveTelegramSession(
        telegramUserId,
        userId,
        token,
        BigInt(balance)
      );
      
      res.json(serializeBigInts({ session }));
    } catch (error: any) {
      console.error('Save telegram session error:', error);
      res.status(500).json({ error: 'Could not save session' });
    }
  });

  app.get('/api/telegram/session/:telegramUserId', verifyBotSecret, async (req, res) => {
    try {
      const { telegramUserId } = req.params;
      const session = await storage.getTelegramSession(telegramUserId);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      res.json(serializeBigInts({ session }));
    } catch (error: any) {
      console.error('Get telegram session error:', error);
      res.status(500).json({ error: 'Could not fetch session' });
    }
  });

  app.delete('/api/telegram/session/:telegramUserId', verifyBotSecret, async (req, res) => {
    try {
      const { telegramUserId } = req.params;
      await storage.deleteTelegramSession(telegramUserId);
      res.json({ message: 'Session deleted successfully' });
    } catch (error: any) {
      console.error('Delete telegram session error:', error);
      res.status(500).json({ error: 'Could not delete session' });
    }
  });

  // ============================================================================
  // Trading Routes
  // ============================================================================
  
  app.get('/api/trades/positions', authenticateToken, async (req, res) => {
    try {
      const positions = await storage.getUserPositions(req.userId!);
      
      // Fetch current prices for all unique tokens
      const uniqueTokenAddresses = positions.map(p => p.tokenAddress);
      const uniqueTokens = Array.from(new Set(uniqueTokenAddresses));
      const priceMap = new Map<string, bigint>();
      
      if (uniqueTokens.length > 0) {
        try {
          // Fetch prices from DexScreener in batches of 30
          const batchSize = 30;
          for (let i = 0; i < uniqueTokens.length; i += batchSize) {
            const batch = uniqueTokens.slice(i, i + batchSize);
            const addressesParam = batch.join(',');
            
            const dexResponse = await fetchWithTimeout(
              `https://api.dexscreener.com/latest/dex/tokens/${addressesParam}`,
              8000
            );
            
            if (dexResponse.ok) {
              const dexData = await dexResponse.json();
              const pairs = dexData.pairs || [];
              
              // Build price map using best (highest liquidity) pair for each token
              for (const tokenAddr of batch) {
                const bestPair = findBestSolanaPair(pairs, tokenAddr);
                if (bestPair && bestPair.priceNative) {
                  // Clamp to 1 lamport minimum (sub-lamport tokens <$0.0000002 are negligible)
                  const priceLamports = BigInt(Math.max(1, Math.floor(parseFloat(bestPair.priceNative) * 1_000_000_000)));
                  priceMap.set(tokenAddr, priceLamports);
                }
              }
            }
          }
          console.log(`📊 Fetched ${priceMap.size} token profiles from DexScreener`);
        } catch (error) {
          console.warn('⚠️  Failed to fetch current prices for positions:', error);
        }
      }
      
      // Enrich positions with current prices (both entryPrice and currentPrice are BigInt)
      const enrichedPositions = positions.map(p => ({
        ...p,
        currentPrice: priceMap.get(p.tokenAddress) || p.entryPrice, // Both are BigInt now
      }));
      
      res.json(serializeBigInts({ positions: enrichedPositions }));
    } catch (error: any) {
      console.error('Get positions error:', error);
      res.status(500).json({ error: 'Could not fetch positions' });
    }
  });

  app.post('/api/trades/buy', authenticateToken, async (req, res) => {
    try {
      const { tokenAddress, tokenName, tokenSymbol, solAmount, price, decimals = 6 } = req.body;
      
      if (!tokenAddress || !tokenName || !tokenSymbol || solAmount <= 0 || price <= 0) {
        return res.status(400).json({ error: 'Invalid trade data' });
      }
      
      const user = await storage.getUserById(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Validate price hasn't changed significantly (5% threshold)
      // NOTE: Sub-lamport tokens (<1 lamport = <$0.0000002) are clamped to 1 lamport
      const currentTokenData = await fetchDexScreenerPrice(tokenAddress);
      if (currentTokenData && currentTokenData.priceLamports) {
        const currentPriceLamports = currentTokenData.priceLamports;
        const providedPriceLamports = Math.floor(price);
        
        const priceDiff = Math.abs(currentPriceLamports - providedPriceLamports);
        // Use safe denominator to avoid division by zero
        const denominator = Math.max(currentPriceLamports, providedPriceLamports, 1);
        const percentChange = (priceDiff * 100) / denominator;
        
        if (percentChange > 5) {
          return res.status(400).json({ 
            error: `Price changed by ${percentChange.toFixed(2)}%. Please refresh and try again.`,
            currentPrice: currentPriceLamports.toString(),
            providedPrice: providedPriceLamports.toString()
          });
        }
      }
      
      // Calculate how much SOL to spend in Lamports (convert to BigInt)
      const solSpent = BigInt(Math.floor(solAmount * 1_000_000_000)); // Convert SOL to Lamports
      const priceBigInt = BigInt(Math.floor(price)); // Price in Lamports per whole token
      
      // Calculate tokens using correct decimals (6 for pump.fun, 9 for SOL-like tokens)
      // tokenAmount = solSpent (lamports) * 10^decimals / price (lamports per whole token)
      const decimalMultiplier = BigInt(10 ** decimals);
      const tokenAmount = (solSpent * decimalMultiplier) / priceBigInt;
      const tokensDisplay = Number(tokenAmount) / (10 ** decimals);
      
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
        decimals,
        entryPrice: priceBigInt,
        amount: tokenAmount,
        solSpent,
      });
      
      console.log(`💼 Position for ${tokenSymbol}: ${tokensDisplay.toFixed(2)} tokens (${position.id})`);
      
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
      
      // Validate price hasn't changed significantly (5% threshold) - same as buy validation
      const currentTokenData = await fetchDexScreenerPrice(position.tokenAddress);
      if (currentTokenData && currentTokenData.priceLamports) {
        const currentPriceLamports = currentTokenData.priceLamports;
        const providedPriceLamports = Number(exitPriceBigInt); // Convert BigInt to number for comparison
        
        const priceDiff = Math.abs(currentPriceLamports - providedPriceLamports);
        const denominator = Math.max(currentPriceLamports, providedPriceLamports, 1);
        const percentChange = (priceDiff * 100) / denominator;
        
        if (percentChange > 5) {
          return res.status(400).json({ 
            error: `Price changed by ${percentChange.toFixed(2)}%. Please refresh and try again.`,
            currentPrice: currentPriceLamports.toString(),
            providedPrice: providedPriceLamports.toString()
          });
        }
      }
      
      // Use position's decimals (6 for pump.fun tokens, 9 for SOL-like tokens)
      const decimals = position.decimals || 6;
      const decimalDivisor = BigInt(10 ** decimals);
      
      // Validate sell amount is positive and not zero after rounding
      if (sellAmount <= 0n) {
        return res.status(400).json({ error: 'Sell amount must be greater than zero' });
      }
      
      if (sellAmount > position.amount) {
        return res.status(400).json({ error: 'Sell amount exceeds position size' });
      }
      
      // Use BigInt arithmetic to prevent overflow
      // solReceived = (sellAmount * exitPrice) / 10^decimals
      const solReceived = (sellAmount * exitPriceBigInt) / decimalDivisor;
      
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
        decimals,
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
          decimals,
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
      
      // Get decimals from first position (all positions of same token have same decimals)
      const decimals = tokenPositions[0].decimals || 6;
      const decimalDivisor = BigInt(10 ** decimals);
      
      // Sell all positions
      for (const position of tokenPositions) {
        const sellAmount = position.amount;
        // Use BigInt arithmetic: (sellAmount * exitPrice) / 10^decimals
        const solReceived = (sellAmount * exitPriceBigInt) / decimalDivisor;
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
          decimals,
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
      
      const tokensDisplay = Number(totalTokensSold) / (10 ** decimals);
      const solDisplay = Number(totalSolReceived) / 1_000_000_000;
      const profitDisplay = Number(totalProfit) / 1_000_000_000;
      console.log(`✅ Sold all ${tokenPositions.length} positions of ${tokenAddress}: ${tokensDisplay.toFixed(2)} tokens for ${solDisplay.toFixed(4)} SOL (P/L: ${profitDisplay.toFixed(4)} SOL)`);
      
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

  // IMPORTANT: Search route must come BEFORE :address route to avoid matching "search" as an address
  // Get trending tokens based on user activity (most bought/sold by user count)
  app.get('/api/trending', async (req, res) => {
    try {
      // Get top tokens by number of unique users who bought them
      const buyActivity = await db
        .select({
          tokenAddress: positions.tokenAddress,
          tokenName: positions.tokenName,
          tokenSymbol: positions.tokenSymbol,
          decimals: positions.decimals,
          buyerCount: sql`COUNT(DISTINCT ${positions.userId})`.as('buyerCount'),
        })
        .from(positions)
        .groupBy(positions.tokenAddress, positions.tokenName, positions.tokenSymbol, positions.decimals)
        .orderBy(sql`COUNT(DISTINCT ${positions.userId})`)
        .limit(30);

      // Get sell activity (users who closed positions)
      const sellActivity = await db
        .select({
          tokenAddress: tradeHistory.tokenAddress,
          sellerCount: sql`COUNT(DISTINCT ${tradeHistory.userId})`.as('sellerCount'),
        })
        .from(tradeHistory)
        .groupBy(tradeHistory.tokenAddress)
        .limit(100);

      // Merge and score tokens (weighted by activity)
      const trendingMap = new Map<string, any>();
      
      // Add buy activity
      for (const token of buyActivity) {
        const addr = token.tokenAddress;
        trendingMap.set(addr, {
          tokenAddress: addr,
          tokenName: token.tokenName,
          tokenSymbol: token.tokenSymbol,
          decimals: token.decimals,
          buyerCount: parseInt(token.buyerCount as string),
          sellerCount: 0,
          totalActivity: parseInt(token.buyerCount as string),
        });
      }

      // Add/update sell activity
      for (const item of sellActivity) {
        const addr = item.tokenAddress;
        const existing = trendingMap.get(addr);
        const sellerCount = parseInt(item.sellerCount as string);
        
        if (existing) {
          existing.sellerCount = sellerCount;
          existing.totalActivity = existing.buyerCount + sellerCount;
        } else {
          trendingMap.set(addr, {
            tokenAddress: addr,
            tokenName: '',
            tokenSymbol: '',
            decimals: 6,
            buyerCount: 0,
            sellerCount: sellerCount,
            totalActivity: sellerCount,
          });
        }
      }

      // Sort by total activity and get top 20
      const trending = Array.from(trendingMap.values())
        .sort((a, b) => b.totalActivity - a.totalActivity)
        .slice(0, 20);

      // Fetch current prices for trending tokens
      const trendingAddresses = trending.map(t => t.tokenAddress);
      const priceMap = new Map<string, bigint>();
      
      if (trendingAddresses.length > 0) {
        try {
          const batchSize = 30;
          for (let i = 0; i < trendingAddresses.length; i += batchSize) {
            const batch = trendingAddresses.slice(i, i + batchSize);
            const addressesParam = batch.join(',');
            
            const dexResponse = await fetchWithTimeout(
              `https://api.dexscreener.com/latest/dex/tokens/${addressesParam}`,
              8000
            );
            
            if (dexResponse.ok) {
              const dexData = await dexResponse.json();
              const pairs = dexData.pairs || [];
              
              for (const addr of batch) {
                const bestPair = findBestSolanaPair(pairs, addr);
                if (bestPair && bestPair.priceNative) {
                  const priceLamports = BigInt(Math.max(1, Math.floor(parseFloat(bestPair.priceNative) * 1_000_000_000)));
                  priceMap.set(addr, priceLamports);
                }
              }
            }
          }
        } catch (error) {
          console.warn('⚠️ Failed to fetch trending prices:', error);
        }
      }

      // Enrich with prices
      const enrichedTrending = trending.map(t => ({
        ...t,
        currentPrice: priceMap.get(t.tokenAddress)?.toString() || '0',
      }));

      res.json({ trending: enrichedTrending });
    } catch (error: any) {
      console.error('Trending fetch error:', error);
      res.status(500).json({ error: 'Could not fetch trending tokens' });
    }
  });

  app.get('/api/tokens/search', async (req, res) => {
    try {
      const query = req.query.q as string || '';
      const searchTerm = query.toLowerCase().trim();
      
      console.log(`🔍 Search request: "${searchTerm}"`);

      if (!searchTerm || searchTerm.length < 3) {
        return res.json({ results: [] });
      }

      const results: any[] = [];

      // Search DexScreener API for token results
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
      // Note: GeckoTerminal doesn't support sub-minute data, so we use 1-minute data for 5S, 15S, 30S
      const timeframeMap: Record<string, { unit: string; aggregate: number; limit: number }> = {
        '5S': { unit: 'minute', aggregate: 1, limit: 5 },   // ~5 minutes of 1-min candles
        '15S': { unit: 'minute', aggregate: 1, limit: 15 },  // ~15 minutes of 1-min candles
        '30S': { unit: 'minute', aggregate: 1, limit: 30 },  // ~30 minutes of 1-min candles
        '1M': { unit: 'minute', aggregate: 1, limit: 60 },   // 1 hour of 1-min candles
        '3M': { unit: 'minute', aggregate: 3, limit: 60 },   // 3 hours of 3-min candles
        '5M': { unit: 'minute', aggregate: 5, limit: 60 }    // 5 hours of 5-min candles
      };

      const tfConfig = timeframeMap[timeframe as string] || timeframeMap['1M'];

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
      
      // Debug: Log what we got from GeckoTerminal
      console.log(`📊 GeckoTerminal response structure for ${address}:`, {
        hasData: !!ohlcvData?.data,
        hasAttributes: !!ohlcvData?.data?.attributes,
        hasOhlcvList: !!ohlcvData?.data?.attributes?.ohlcv_list,
        ohlcvListLength: ohlcvData?.data?.attributes?.ohlcv_list?.length || 0,
        responseKeys: Object.keys(ohlcvData || {})
      });
      
      let candles = ohlcvData?.data?.attributes?.ohlcv_list || [];
      
      // Validate candles is an array and contains valid data
      if (!Array.isArray(candles)) {
        console.error(`⚠️ OHLCV candles is not an array for ${address}:`, typeof candles, candles);
        candles = [];
      }
      
      // Filter out any invalid candles
      candles = candles.filter((candle: any) => {
        if (!Array.isArray(candle) || candle.length < 5) {
          console.warn(`Skipping invalid candle: ${JSON.stringify(candle)}`);
          return false;
        }
        return true;
      });

      if (candles.length === 0) {
        console.warn(`⚠️ No valid OHLCV candles for ${address} after filtering`);
      }

      // Sort candles in ascending order by timestamp (required by TradingView Lightweight Charts)
      // GeckoTerminal returns them in descending order (newest first), we need ascending (oldest first)
      candles = [...candles].sort((a: number[], b: number[]) => a[0] - b[0]);

      // Debug: Log first and last timestamps to verify sort order
      if (candles.length >= 2) {
        console.log(`✅ OHLCV data for ${address}: ${candles.length} candles, timestamps ${candles[0][0]} to ${candles[candles.length - 1][0]} (${candles[0][0] < candles[candles.length - 1][0] ? 'ASC ✅' : 'DESC ❌'})`);
      } else if (candles.length === 1) {
        console.log(`✅ OHLCV data for ${address}: 1 candle at timestamp ${candles[0][0]}`);
      }

      // Prevent caching - chart data changes frequently and needs to be fresh
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.json({ 
        success: true,
        candles,
        pairAddress,
        timeframe,
        candleCount: candles.length
      });
    } catch (error: any) {
      console.error('❌ OHLCV fetch error:', error.message || error);
      console.error('Full error:', error);
      res.status(500).json({ error: 'Failed to fetch chart data', details: error.message });
    }
  });

  // Get individual token by address (must come AFTER search route)
  app.get('/api/tokens/:address', async (req, res) => {
    try {
      const { address } = req.params;
      let token = null;
      
      // Fetch token from DexScreener API
      console.log(`🔍 Fetching token ${address} from DexScreener...`);
      try {
          const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
          if (dexResponse.ok) {
            const dexData = await dexResponse.json();
            
            // Find the best (highest liquidity) Solana pair for this token
            const solanaPair = findBestSolanaPair(dexData.pairs, address);
            
            if (solanaPair) {
              // Get both native (SOL) and USD prices
              const priceNative = solanaPair.priceNative ? parseFloat(solanaPair.priceNative) : 0;
              const priceUsd = solanaPair.priceUsd ? parseFloat(solanaPair.priceUsd) : 0;
              
              // Validate price exists
              if (priceNative === 0 && priceUsd === 0) {
                console.warn(`⚠️ Token ${address} has no price data on DexScreener`);
                return res.status(404).json({ error: 'Token price data unavailable' });
              }
              
              // Convert SOL to Lamports (for trading calculations)
              const priceLamports = Math.floor(priceNative * 1_000_000_000);
              
              // Try to get enhanced metadata (icon, etc.)
              const metadata = await fetchTokenMetadata(address);
              
              token = {
                tokenAddress: address,
                name: metadata?.name || solanaPair.baseToken?.name || 'Unknown Token',
                symbol: metadata?.symbol || solanaPair.baseToken?.symbol || '???',
                price: priceLamports,
                priceUsd: priceUsd,
                marketCap: solanaPair.fdv || solanaPair.marketCap || 0,
                volume24h: solanaPair.volume?.h24 || 0,
                priceChange24h: solanaPair.priceChange?.h24 || 0,
                creator: undefined,
                timestamp: new Date().toISOString(),
                icon: metadata?.icon || solanaPair.info?.imageUrl,
              };
              
              console.log(`✅ Found token ${address} on DexScreener: ${token.name} (${token.symbol}) - Price: $${priceUsd} (${priceNative} SOL) - MCap: $${token.marketCap} - Icon: ${token.icon ? 'Yes' : 'No'}`);
            }
          }
        } catch (dexError) {
          console.error('DexScreener API error for token:', dexError);
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
      const { tokenAddress, solAmount, decimals } = req.query;
      
      if (!tokenAddress || !solAmount) {
        return res.status(400).json({ error: 'tokenAddress and solAmount are required' });
      }

      const solAmountNum = parseFloat(solAmount as string);
      if (isNaN(solAmountNum) || solAmountNum <= 0) {
        return res.status(400).json({ error: 'Invalid SOL amount' });
      }

      // Use provided decimals or default to 6 for pump.fun tokens
      const TOKEN_DECIMALS = decimals ? parseInt(decimals as string) : 6;

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
      
      // Convert using actual token decimals
      const tokenAmountDecimal = tokenAmountOut / (10 ** TOKEN_DECIMALS);
      const effectivePriceLamports = tokenAmountDecimal > 0 
        ? Math.floor(inputAmountLamports / tokenAmountDecimal)
        : 0;
      
      console.log(`✅ Jupiter quote: ${solAmountNum} SOL → ${tokenAmountDecimal.toFixed(2)} tokens (${TOKEN_DECIMALS} decimals, impact: ${priceImpactPct}%)`);
      
      res.json({
        solAmount: solAmountNum,
        solAmountLamports: inputAmountLamports,
        tokenAmountOut: tokenAmountOut,
        tokenAmountDisplay: tokenAmountDecimal,
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
      const { tokenAddress, tokenAmount, decimals } = req.query;
      
      if (!tokenAddress || !tokenAmount) {
        return res.status(400).json({ error: 'tokenAddress and tokenAmount are required' });
      }

      const tokenAmountNum = parseFloat(tokenAmount as string);
      if (isNaN(tokenAmountNum) || tokenAmountNum <= 0) {
        return res.status(400).json({ error: 'Invalid token amount' });
      }

      // Use provided decimals or default to 6 for pump.fun tokens
      const TOKEN_DECIMALS = decimals ? parseInt(decimals as string) : 6;
      const inputAmountTokenUnits = Math.floor(tokenAmountNum * (10 ** TOKEN_DECIMALS));
      
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
  // Token Analysis Routes (Helius)
  // ============================================================================
  
  app.get('/api/analyze/:mintAddress', async (req, res) => {
    try {
      const { mintAddress } = req.params;
      
      if (!mintAddress || mintAddress.length < 32) {
        return res.status(400).json({ error: 'Invalid mint address' });
      }
      
      const analysis = await oldHeliusService.analyzeToken(mintAddress);
      res.json(analysis);
    } catch (error: any) {
      console.error('Token analysis error:', error);
      res.status(500).json({ error: error.message || 'Could not analyze token' });
    }
  });

  // ============================================================================
  // Enhanced Study Section Routes
  // ============================================================================

  /**
   * Token Analysis Endpoint
   * GET /api/study/token/:mintAddress
   */
  app.get('/api/study/token/:mintAddress', async (req, res) => {
    try {
      const { mintAddress } = req.params;

      if (!heliusService.isValidSolanaAddress(mintAddress)) {
        return res.status(400).json({ error: 'Invalid token address' });
      }

      const analysis = await heliusService.getTokenAnalysis(mintAddress);
      res.json(analysis);
    } catch (error: any) {
      console.error('Token analysis error:', error);
      
      // Check if this is "not a Token mint" error (user entered a wallet address instead)
      if (error.message?.includes('not a Token mint')) {
        return res.status(400).json({ 
          error: 'Not a token address',
          message: 'This appears to be a wallet address, not a token mint address. Please use the Wallet Explorer tab instead.'
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to fetch token data',
        message: error.message || 'Unknown error occurred'
      });
    }
  });

  /**
   * Wallet Portfolio Endpoint
   * GET /api/study/wallet/:walletAddress
   */
  app.get('/api/study/wallet/:walletAddress', async (req, res) => {
    try {
      const { walletAddress } = req.params;

      if (!heliusService.isValidSolanaAddress(walletAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      const portfolio = await heliusService.getWalletPortfolio(walletAddress);
      res.json(portfolio);
    } catch (error: any) {
      console.error('Wallet portfolio error:', error);
      
      // Check if this is a Helius API error
      if (error.message?.includes('500 Internal Server Error')) {
        return res.status(503).json({ 
          error: 'Service temporarily unavailable',
          message: 'Helius API is having trouble fetching this wallet data. This could be due to API rate limits or the wallet being too large. Please try again in a moment.'
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to fetch wallet data',
        message: error.message || 'Unknown error occurred'
      });
    }
  });

  /**
   * Transaction History Endpoint
   * GET /api/study/transactions/:address
   */
  app.get('/api/study/transactions/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const { limit, before, type } = req.query;

      if (!heliusService.isValidSolanaAddress(address)) {
        return res.status(400).json({ error: 'Invalid address' });
      }

      const transactions = await heliusService.getTransactionHistory(address, {
        limit: limit ? parseInt(limit as string) : 50,
        before: before as string,
        type: type as string,
      });

      res.json(transactions);
    } catch (error: any) {
      console.error('Transaction history error:', error);
      
      // Check if this is a 401 Unauthorized (premium feature)
      if (error.message?.includes('401')) {
        return res.status(403).json({ 
          error: 'Premium feature',
          message: 'Transaction history requires a Helius premium API plan. Please upgrade your API key at https://helius.dev'
        });
      }
      
      res.status(500).json({ error: 'Failed to fetch transaction history' });
    }
  });

  /**
   * Transaction Details Endpoint
   * GET /api/study/transaction/:signature
   */
  app.get('/api/study/transaction/:signature', async (req, res) => {
    try {
      const { signature } = req.params;
      const details = await heliusService.getTransactionDetails(signature);
      res.json(details);
    } catch (error) {
      console.error('Transaction details error:', error);
      res.status(500).json({ error: 'Failed to fetch transaction details' });
    }
  });

  /**
   * Search Endpoint (Unified search for tokens/wallets)
   * GET /api/study/search?q=<address>
   */
  app.get('/api/study/search', async (req, res) => {
    try {
      const { q } = req.query;

      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Search query required' });
      }

      const result = await heliusService.search(q.trim());
      res.json(result);
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  /**
   * Batch Token Metadata Endpoint
   * POST /api/study/tokens/batch
   * Body: { mintAddresses: string[] }
   */
  app.post('/api/study/tokens/batch', async (req, res) => {
    try {
      const { mintAddresses } = req.body;

      if (!Array.isArray(mintAddresses) || mintAddresses.length === 0) {
        return res.status(400).json({ error: 'Invalid mint addresses array' });
      }

      if (mintAddresses.length > 100) {
        return res.status(400).json({ error: 'Maximum 100 addresses per request' });
      }

      const tokens = await heliusService.getBatchTokenInfo(mintAddresses);
      res.json(tokens);
    } catch (error) {
      console.error('Batch token info error:', error);
      res.status(500).json({ error: 'Failed to fetch batch token info' });
    }
  });

  /**
   * API Usage Stats Endpoint (for monitoring)
   * GET /api/study/stats
   */
  app.get('/api/study/stats', async (req, res) => {
    try {
      const stats = heliusService.getUsageStats();
      res.json(stats);
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // ============================================================================
  // Leaderboard Routes
  // ============================================================================
  
  app.get('/api/leaderboard/overall', async (req, res) => {
    try {
      const leaders = await storage.getTopUsersByTotalProfit(100);
      res.json(serializeBigInts({ leaders: leaders.map((l, i) => ({ ...l, rank: i + 1 })) }));
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
      
      res.json(serializeBigInts({ 
        leaders: leaders.map((l, i) => ({ ...l, rank: i + 1 })), 
        periodStart: currentPeriod.startTime,
        periodEnd: currentPeriod.endTime
      }));
    } catch (error: any) {
      console.error('Get period leaderboard error:', error);
      res.status(500).json({ error: 'Could not fetch period leaderboard' });
    }
  });

  app.get('/api/leaderboard/winners', async (req, res) => {
    try {
      const winners = await storage.getPastWinners(10);
      res.json(serializeBigInts({ winners }));
    } catch (error: any) {
      console.error('Get winners error:', error);
      res.status(500).json({ error: 'Could not fetch winners' });
    }
  });

  const httpServer = createServer(app);
  
  // Initialize leaderboard service for period management
  leaderboardService.start();

  return httpServer;
}
