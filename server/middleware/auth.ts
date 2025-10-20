import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      username?: string;
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  // Try cookie first (HttpOnly), fallback to Authorization header for backward compatibility
  const token = req.cookies.token || (req.headers['authorization']?.split(' ')[1]);

  if (!token) {
    return res.status(401).json({ error: 'Access denied - no token provided' });
  }

  try {
    // Use same secret resolution as routes.ts
    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET or SESSION_SECRET environment variable must be set');
    }
    const verified = jwt.verify(token, secret) as { id: string; username: string };
    req.userId = verified.id;
    req.username = verified.username;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}
