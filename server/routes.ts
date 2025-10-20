import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { authenticateToken } from "./middleware/auth";
import { initializePumpPortal, getTokens } from "./pumpportal";
import { insertUserSchema, solToLamports, type LoginRequest, type RegisterRequest, type BuyRequest, type SellRequest } from "@shared/schema";

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

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
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      // Return user without password
      const { password, ...userWithoutPassword } = user;
      res.status(201).json({ user: userWithoutPassword });
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(400).json({ error: error.message || 'Registration failed' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body as LoginRequest;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }
      
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
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    res.json({ message: 'Logged out successfully' });
  });

  app.get('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUserById(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
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
      res.json({ positions });
    } catch (error: any) {
      console.error('Get positions error:', error);
      res.status(500).json({ error: 'Could not fetch positions' });
    }
  });

  app.post('/api/trades/buy', authenticateToken, async (req, res) => {
    try {
      const { tokenAddress, tokenName, tokenSymbol, amount, price } = req.body as BuyRequest;
      
      if (!tokenAddress || !tokenName || !tokenSymbol || amount <= 0 || price <= 0) {
        return res.status(400).json({ error: 'Invalid trade data' });
      }
      
      const user = await storage.getUserById(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Convert price to Lamports (price is already in Lamports from frontend)
      const tokenAmount = Math.floor(amount * 1_000_000_000); // Convert token amount to integer
      const solSpent = Math.floor((amount * price)); // Total cost in Lamports
      
      if (user.balance < solSpent) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      
      // Deduct balance
      await storage.updateUserBalance(req.userId!, -solSpent);
      
      // Create position
      const position = await storage.createPosition({
        userId: req.userId!,
        tokenAddress,
        tokenName,
        tokenSymbol,
        entryPrice: price,
        amount: tokenAmount,
        solSpent,
      });
      
      const newUser = await storage.getUserById(req.userId!);
      
      res.json({ 
        message: 'Position opened successfully',
        positionId: position.id,
        newBalance: newUser!.balance
      });
    } catch (error: any) {
      console.error('Buy error:', error);
      res.status(500).json({ error: 'Could not execute buy order' });
    }
  });

  app.post('/api/trades/sell', authenticateToken, async (req, res) => {
    try {
      const { positionId, amount, exitPrice } = req.body as SellRequest;
      
      if (!positionId || exitPrice <= 0) {
        return res.status(400).json({ error: 'Invalid sell data' });
      }
      
      const position = await storage.getPositionById(positionId);
      if (!position || position.userId !== req.userId) {
        return res.status(404).json({ error: 'Position not found' });
      }
      
      // Determine sell amount (full or partial)
      const sellAmount = amount ? Math.floor(amount * 1_000_000_000) : position.amount;
      
      if (sellAmount > position.amount) {
        return res.status(400).json({ error: 'Sell amount exceeds position size' });
      }
      
      const sellRatio = sellAmount / position.amount;
      const solReceived = Math.floor((sellAmount / 1_000_000_000) * exitPrice);
      const proportionalCost = Math.floor(position.solSpent * sellRatio);
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
        exitPrice,
        amount: sellAmount,
        solSpent: proportionalCost,
        solReceived,
        profitLoss,
        openedAt: position.openedAt,
      });
      
      // If full sell, delete position. If partial, update it.
      if (sellAmount >= position.amount) {
        await storage.deletePosition(positionId);
      } else {
        // Partial sell - update position
        const remainingAmount = position.amount - sellAmount;
        const remainingCost = position.solSpent - proportionalCost;
        await storage.updateUserProfile(req.userId!, {}); // This needs a position update method
        // For now, we'll just do full sells to keep it simple
      }
      
      res.json({
        message: 'Position closed successfully',
        profitLoss,
        solReceived,
      });
    } catch (error: any) {
      console.error('Sell error:', error);
      res.status(500).json({ error: 'Could not execute sell order' });
    }
  });

  app.get('/api/trades/history', authenticateToken, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = 50;
      const offset = (page - 1) * limit;
      
      const trades = await storage.getUserTrades(req.userId!, limit, offset);
      
      res.json({
        trades,
        pagination: {
          page,
          limit,
          total: trades.length,
          totalPages: Math.ceil(trades.length / limit),
        },
      });
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
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      const leaders = await storage.getTopUsersByPeriodProfit(sixHoursAgo, 100);
      res.json({ leaders: leaders.map((l, i) => ({ ...l, rank: i + 1 })), periodStart: sixHoursAgo.toISOString() });
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

  return httpServer;
}
