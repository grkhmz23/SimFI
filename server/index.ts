import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { spawn } from "child_process";
import { leaderboardService } from "./leaderboardService";
import { startWorker as startAlphaDeskWorker } from "./services/alphaDesk/worker";

const app = express();

// ✅ Remove X-Powered-By header (information disclosure)
app.disable('x-powered-by');

// ============================================================================
// CORS CONFIGURATION
// ============================================================================
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || false // Restrict to specific origin in production
    : ['http://localhost:5000', 'http://localhost:5173'], // Allow dev servers
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  maxAge: 86400 // 24 hours
};
app.use(cors(corsOptions));

// ✅ CRITICAL: Trust first proxy for correct client IP detection
// Required for rate limiting to work correctly behind Nginx/Cloudflare/Render/Fly
app.set('trust proxy', 1);

// ============================================================================
// ✅ FIX #7: SECURITY HEADERS
// ============================================================================
app.use((req, res, next) => {
  // Prevent clickjacking - don't allow site to be embedded in iframes
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing - browser must respect Content-Type
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // XSS Protection (legacy, but still useful for older browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Control referrer information sent with requests
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy - restrict browser features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // HSTS - Enable in production for HTTPS-only sites
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Content Security Policy - prevent XSS and data injection
  // This is a moderate policy - adjust based on your needs
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.dexscreener.com https://public-api.birdeye.so https://api.coingecko.com https://quote-api.jup.ag https://api.binance.com https://price.jup.ag wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

  next();
});

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());

// ✅ MEDIUM FIX: Reduced logging - no response bodies (could contain PII)
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Only log path, method, status, duration - NO body
      const logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      // In production, only log errors or slow requests
      if (process.env.NODE_ENV === 'production') {
        if (res.statusCode >= 400 || duration > 1000) {
          log(logLine);
        }
      } else {
        log(logLine);
      }
    }
  });

  next();
});

// ✅ FIX: Track if shutdown is in progress to prevent duplicate cleanup
let isShuttingDown = false;

async function gracefulShutdown(signal: string, botProcess?: any) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);

  // Stop leaderboard service (releases advisory lock)
  try {
    console.log('   Stopping leaderboard service...');
    leaderboardService.stop();
    console.log('   ✅ Leaderboard service stopped');
  } catch (e) {
    console.error('   ❌ Error stopping leaderboard service:', e);
  }

  // Kill bot process if running
  if (botProcess) {
    try {
      console.log('   Stopping bot process...');
      botProcess.kill();
      console.log('   ✅ Bot process stopped');
    } catch (e) {
      console.error('   ❌ Error stopping bot:', e);
    }
  }

  console.log('✅ Graceful shutdown complete');
  process.exit(0);
}

(async () => {
  const server = await registerRoutes(app);

/**
 * API: never fall through to Vite/SPA for /api routes.
 * Must be after registerRoutes(app) and before Vite middleware/catch-all.
 */
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// API error handler (keeps API responses JSON even in dev)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (req.originalUrl && req.originalUrl.startsWith('/api/')) {
    console.error('API error:', err);
    return res.status(err?.status || 500).json({ error: err?.message || 'Internal server error' });
  }
  next(err);
});



  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    
    // Log full error internally
    console.error('❌ Unhandled error:', err);
    
    // Don't leak stack traces or internal details in production
    let message = "Internal Server Error";
    if (process.env.NODE_ENV !== 'production') {
      message = err.message || "Internal Server Error";
    } else {
      // In production, only expose client-safe messages for 4xx errors
      if (status < 500 && err.message) {
        message = err.message;
      }
    }
    
    res.status(status).json({ 
      message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
  });

  // Serve static files from client/public directory (for favicon, etc.) in development
  app.use(express.static("client/public"));

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });

  // ✅ Start Alpha Desk worker asynchronously (non-blocking)
  // This ensures daily meme/dev ideas are generated even if GitHub Actions
  // workflow is disabled or secrets are missing. Runs on server startup/wake.
  startAlphaDeskWorker().catch((err) => {
    console.error('[AlphaDesk] Worker failed to start:', err);
  });

  // ✅ HIGH FIX: Do NOT spawn Telegram bot from web server
  // This prevents multiple bot instances when horizontally scaling
  // Bot should be run separately: node bot.js
  const botToken = app.get("env") === "development" 
    ? process.env.TELEGRAM_BOT_TOKEN_DEV 
    : process.env.TELEGRAM_BOT_TOKEN;

  if (botToken) {
    // Auto-start bot if:
    // - Development mode (unless AUTO_START_BOT=false)
    // - Production mode with AUTO_START_BOT=true (for single-instance deployments like Replit)
    const shouldAutoStart = 
      (app.get("env") === "development" && process.env.AUTO_START_BOT !== 'false') ||
      (app.get("env") === "production" && process.env.AUTO_START_BOT === 'true');

    if (shouldAutoStart) {
      console.log(`🤖 Starting Telegram bot in ${app.get("env")} mode...`);
      const botProcess = spawn('node', ['bot.js'], {
        stdio: 'inherit',
        env: process.env
      });

      botProcess.on('error', (err) => {
        console.error('❌ Failed to start Telegram bot:', err);
      });

      botProcess.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) {
          console.error(`❌ Telegram bot exited with code ${code}`);
        }
      });

      // ✅ FIX: Use graceful shutdown with bot process
      process.on('SIGINT', () => gracefulShutdown('SIGINT', botProcess));
      process.on('SIGTERM', () => gracefulShutdown('SIGTERM', botProcess));
    } else {
      console.log(`ℹ️  Telegram bot should be run separately: node bot.js`);
      console.log(`   (Set AUTO_START_BOT=true to auto-start)`);

      // ✅ FIX: Graceful shutdown without bot process
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    }
  } else {
    console.warn(`⚠️  No Telegram bot token found for ${app.get("env")} environment - bot will not start`);

    // ✅ FIX: Graceful shutdown without bot
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  }
})();