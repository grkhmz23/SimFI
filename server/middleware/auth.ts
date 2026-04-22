import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '@shared/schema';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      username?: string;
    }
  }
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  // Try cookie first (HttpOnly), fallback to Authorization header for backward compatibility
  const token = req.cookies.token || (req.headers['authorization']?.split(' ')[1]);

  if (!token) {
    console.log('❌ Auth failed: No token provided');
    return res.status(401).json({ error: 'Access denied - no token provided' });
  }

  try {
    // Use same secret resolution as routes.ts
    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET or SESSION_SECRET environment variable must be set');
    }
    const verified = jwt.verify(token, secret) as { id: string; username: string; tokenVersion?: number };

    // Verify tokenVersion matches current DB value (session invalidation check)
    const [user] = await db.select({ tokenVersion: users.tokenVersion })
      .from(users)
      .where(eq(users.id, verified.id))
      .limit(1);

    if (!user) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    if (verified.tokenVersion !== undefined && verified.tokenVersion !== user.tokenVersion) {
      console.log(`❌ Auth failed: Token version mismatch for user ${verified.id}`);
      return res.status(403).json({ error: 'Session expired. Please log in again.', code: 'SESSION_EXPIRED' });
    }

    req.userId = verified.id;
    req.username = verified.username;
    next();
  } catch (error: any) {
    console.log('❌ Auth failed: Token verification error:', error.message);
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}
