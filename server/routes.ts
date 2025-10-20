import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { authenticateToken } from "./middleware/auth";
import { initializePumpPortal, getTokens } from "./pumpportal";
import { insertUserSchema, type LoginRequest, type RegisterRequest, type BuyRequest, type SellRequest } from "@shared/schema";

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
      
      // Return user without password
      const { password, ...userWithoutPassword } = user;
      res.status(201).json({ token, user: userWithoutPassword });
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
      
      const { password: _, ...userWithoutPassword } = user;
      res.json({ token, user: userWithoutPassword });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.get('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId!);
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
      
      await storage.updateUser(req.userId!, updates);
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
      const positions = await storage.getPositions(req.userId!);
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
      
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const solSpent = amount * price;
      
      if (user.balance < solSpent) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      
      // Deduct balance
      await storage.updateUserBalance(req.userId!, -solSpent, 0);
      
      // Create position
      const position = await storage.createPosition({
        userId: req.userId!,
        tokenAddress,
        tokenName,
        tokenSymbol,
        entryPrice: price,
        amount,
        solSpent,
      });
      
      res.json({ 
        message: 'Position opened successfully',
        positionId: position.id,
        newBalance: user.balance - solSpent
      });
    } catch (error: any) {
      console.error('Buy error:', error);
      res.status(500).json({ error: 'Could not execute buy order' });
    }
  });

  app.post('/api/trades/sell', authenticateToken, async (req, res) => {
    try {
      const { positionId, exitPrice } = req.body as SellRequest;
      
      if (!positionId || exitPrice <= 0) {
        return res.status(400).json({ error: 'Invalid sell data' });
      }
      
      const position = await storage.getPosition(positionId, req.userId!);
      if (!position) {
        return res.status(404).json({ error: 'Position not found' });
      }
      
      const solReceived = position.amount * exitPrice;
      const profitLoss = solReceived - position.solSpent;
      
      // Update user balance and profit
      await storage.updateUserBalance(req.userId!, solReceived, profitLoss);
      
      // Create trade history entry
      await storage.createTrade({
        userId: req.userId!,
        tokenAddress: position.tokenAddress,
        tokenName: position.tokenName,
        tokenSymbol: position.tokenSymbol,
        entryPrice: position.entryPrice,
        exitPrice,
        amount: position.amount,
        solSpent: position.solSpent,
        solReceived,
        profitLoss,
        openedAt: position.openedAt,
      });
      
      // Delete position
      await storage.deletePosition(positionId);
      
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
      
      const { trades, total } = await storage.getTrades(req.userId!, page, limit);
      
      res.json({
        trades,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
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
      const leaders = await storage.getOverallLeaderboard();
      res.json({ leaders });
    } catch (error: any) {
      console.error('Get overall leaderboard error:', error);
      res.status(500).json({ error: 'Could not fetch leaderboard' });
    }
  });

  app.get('/api/leaderboard/current-period', async (req, res) => {
    try {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      const leaders = await storage.getCurrentPeriodLeaderboard(sixHoursAgo);
      res.json({ leaders, periodStart: sixHoursAgo.toISOString() });
    } catch (error: any) {
      console.error('Get period leaderboard error:', error);
      res.status(500).json({ error: 'Could not fetch period leaderboard' });
    }
  });

  app.get('/api/leaderboard/winners', async (req, res) => {
    try {
      // For now, return empty array as we don't have snapshots yet
      res.json({ winners: [] });
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
