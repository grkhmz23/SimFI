import { type User, type InsertUser, type Position, type InsertPosition, type Trade, type InsertTrade } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<Omit<User, 'id'>>): Promise<void>;
  updateUserBalance(id: string, balanceChange: number, profitChange: number): Promise<void>;
  
  // Position operations
  getPositions(userId: string): Promise<Position[]>;
  getPosition(id: string, userId: string): Promise<Position | undefined>;
  createPosition(position: InsertPosition & { userId: string }): Promise<Position>;
  deletePosition(id: string): Promise<void>;
  
  // Trade history operations
  getTrades(userId: string, page: number, limit: number): Promise<{ trades: Trade[]; total: number }>;
  createTrade(trade: InsertTrade & { userId: string }): Promise<Trade>;
  
  // Leaderboard operations
  getOverallLeaderboard(): Promise<Array<{ id: string; username: string; totalProfit: number; balance: number }>>;
  getCurrentPeriodLeaderboard(periodStart: Date): Promise<Array<{ id: string; username: string; periodProfit: number }>>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private positions: Map<string, Position>;
  private trades: Map<string, Trade>;

  constructor() {
    this.users = new Map();
    this.positions = new Map();
    this.trades = new Map();
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email.toLowerCase() === email.toLowerCase(),
    );
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      ...insertUser,
      id,
      balance: 10.0,
      totalProfit: 0.0,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<Omit<User, 'id'>>): Promise<void> {
    const user = this.users.get(id);
    if (!user) throw new Error('User not found');
    
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
  }

  async updateUserBalance(id: string, balanceChange: number, profitChange: number): Promise<void> {
    const user = this.users.get(id);
    if (!user) throw new Error('User not found');
    
    user.balance += balanceChange;
    user.totalProfit += profitChange;
    this.users.set(id, user);
  }

  // Position operations
  async getPositions(userId: string): Promise<Position[]> {
    return Array.from(this.positions.values())
      .filter(pos => pos.userId === userId)
      .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
  }

  async getPosition(id: string, userId: string): Promise<Position | undefined> {
    const position = this.positions.get(id);
    if (position && position.userId === userId) {
      return position;
    }
    return undefined;
  }

  async createPosition(data: InsertPosition & { userId: string }): Promise<Position> {
    const id = randomUUID();
    const position: Position = {
      ...data,
      id,
      openedAt: new Date(),
    };
    this.positions.set(id, position);
    return position;
  }

  async deletePosition(id: string): Promise<void> {
    this.positions.delete(id);
  }

  // Trade history operations
  async getTrades(userId: string, page: number = 1, limit: number = 50): Promise<{ trades: Trade[]; total: number }> {
    const userTrades = Array.from(this.trades.values())
      .filter(trade => trade.userId === userId)
      .sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());
    
    const total = userTrades.length;
    const offset = (page - 1) * limit;
    const trades = userTrades.slice(offset, offset + limit);
    
    return { trades, total };
  }

  async createTrade(data: InsertTrade & { userId: string }): Promise<Trade> {
    const id = randomUUID();
    const trade: Trade = {
      ...data,
      id,
      closedAt: new Date(),
    };
    this.trades.set(id, trade);
    return trade;
  }

  // Leaderboard operations
  async getOverallLeaderboard(): Promise<Array<{ id: string; username: string; totalProfit: number; balance: number }>> {
    return Array.from(this.users.values())
      .filter(user => user.totalProfit !== 0)
      .map(user => ({
        id: user.id,
        username: user.username,
        totalProfit: user.totalProfit,
        balance: user.balance,
      }))
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, 100);
  }

  async getCurrentPeriodLeaderboard(periodStart: Date): Promise<Array<{ id: string; username: string; periodProfit: number }>> {
    const periodTrades = new Map<string, number>();
    
    Array.from(this.trades.values())
      .filter(trade => new Date(trade.closedAt) >= periodStart)
      .forEach(trade => {
        const current = periodTrades.get(trade.userId) || 0;
        periodTrades.set(trade.userId, current + trade.profitLoss);
      });
    
    return Array.from(periodTrades.entries())
      .map(([userId, periodProfit]) => {
        const user = this.users.get(userId);
        return user ? {
          id: userId,
          username: user.username,
          periodProfit,
        } : null;
      })
      .filter((entry): entry is { id: string; username: string; periodProfit: number } => entry !== null && entry.periodProfit !== 0)
      .sort((a, b) => b.periodProfit - a.periodProfit)
      .slice(0, 10);
  }
}

export const storage = new MemStorage();
