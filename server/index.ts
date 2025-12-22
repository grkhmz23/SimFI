import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { spawn } from "child_process";
import { leaderboardService } from "./leaderboardService";

const app = express();

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

  // HSTS - force HTTPS (only in production)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
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

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
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

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error('❌ Unhandled error:', err);
    res.status(status).json({ message });
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

  // ✅ HIGH FIX: Do NOT spawn Telegram bot from web server
  // This prevents multiple bot instances when horizontally scaling
  // Bot should be run separately: node bot.js
  const botToken = app.get("env") === "development" 
    ? process.env.TELEGRAM_BOT_TOKEN_DEV 
    : process.env.TELEGRAM_BOT_TOKEN;

  if (botToken) {
    // Only auto-start bot in development for convenience
    // In production, run the bot as a separate singleton process
    if (app.get("env") === "development" && process.env.AUTO_START_BOT !== 'false') {
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
      console.log(`   (Set AUTO_START_BOT=true to auto-start in development)`);

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