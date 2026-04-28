import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import crypto from "crypto";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { createBot, setupWebhook, getWebhookCallback } from "./telegram-bot";
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

// Trust proxy only when explicitly configured
// Set TRUST_PROXY=true for Nginx/Cloudflare/Render/Fly deployments
app.set('trust proxy', process.env.TRUST_PROXY === 'true');

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
  const isDev = process.env.NODE_ENV === 'development';
  const cspDirectives = [
    "default-src 'self'",
    isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com"
      : "script-src 'self' https://cdnjs.cloudflare.com",
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

async function gracefulShutdown(signal: string, server: any, botProcess?: any) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);

  // Stop accepting new connections
  try {
    console.log('   Closing HTTP server...');
    server.close(() => {
      console.log('   ✅ HTTP server closed');
    });
  } catch (e) {
    console.error('   ❌ Error closing HTTP server:', e);
  }

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

  // Force exit after timeout
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);

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
    const isDev = process.env.NODE_ENV === 'development';
    const status = err?.status || 500;
    const message = isDev ? (err?.message || 'Internal server error') : 'Internal server error';
    return res.status(status).json({ error: message });
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

  // ============================================================================
  // TELEGRAM BOT — WEBHOOK MODE (production) / POLLING MODE (dev)
  // ============================================================================
  // MUST be registered BEFORE static/Vite catch-all middleware so that
  // POST requests to /telegram/webhook/* reach the handler instead of
  // falling through to the SPA index.html.
  const botToken = app.get("env") === "development" 
    ? process.env.TELEGRAM_BOT_TOKEN_DEV 
    : process.env.TELEGRAM_BOT_TOKEN;

  if (botToken) {
    const bot = createBot(botToken);

    if (app.get("env") === "production") {
      // Production: webhook only — no polling, no 409 conflicts on deploy
      const publicUrl = process.env.PUBLIC_URL || process.env.API_BASE_URL;
      const secretPath = process.env.TELEGRAM_WEBHOOK_SECRET_PATH || crypto.randomBytes(16).toString('hex');
      const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN || crypto.randomBytes(32).toString('hex');
      const webhookUrl = `${publicUrl}/telegram/webhook/${secretPath}`;

      console.log('🤖 Initializing Telegram bot in webhook mode...');

      try {
        if (!publicUrl) {
          throw new Error('PUBLIC_URL or API_BASE_URL must be set for webhook mode');
        }
        // Register the route BEFORE static/Vite middleware installs its catch-all
        app.post(`/telegram/webhook/${secretPath}`, getWebhookCallback(bot, secretToken));
        await setupWebhook(bot, webhookUrl, secretToken);
        console.log(`✅ Telegram webhook set: ${webhookUrl}`);
        console.log(`📱 Bot active: @${(await bot.telegram.getMe()).username}`);
      } catch (err: any) {
        console.error('❌ Failed to set Telegram webhook:', err.message);
      }
    } else {
      // Development: polling mode via bot.launch()
      console.log('🤖 Starting Telegram bot in polling mode (dev)...');
      bot.launch().catch((err: any) => {
        console.error('❌ Failed to start Telegram bot:', err.message);
      });
    }
  } else {
    console.warn(`⚠️  No Telegram bot token found - bot will not start`);
  }

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

  // Register graceful shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM', server));
  process.on('SIGINT', () => gracefulShutdown('SIGINT', server));
})();