// ============================================================================
// SIMFI TELEGRAM BOT - GOD MODE VERSION
// Combined best practices from multiple security audits
// ============================================================================

console.log('[BOT] ✅ bot.js file is executing');

import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';

console.log('[BOT] ✅ Imports completed');

// ============================================================================
// CONFIGURATION
// ============================================================================

// Use dev token in development, production token in production
const BOT_TOKEN = process.env.NODE_ENV === 'development' 
  ? process.env.TELEGRAM_BOT_TOKEN_DEV 
  : process.env.TELEGRAM_BOT_TOKEN;

// ✅ SECURITY: Never use Telegram token for internal API auth
// Telegram tokens leak easily (logs, screenshots, env dumps)
const DEV_BOT_SECRET = 'simfi-dev-bot-secret-change-in-production';

let BOT_API_SECRET;
if (process.env.NODE_ENV === 'production') {
  if (!process.env.BOT_API_SECRET) {
    console.error('❌ FATAL: BOT_API_SECRET must be set in production');
    console.error('   This is required for secure communication with the API server');
    process.exit(1);
  }
  if (process.env.BOT_API_SECRET.length < 20) {
    console.error('❌ FATAL: BOT_API_SECRET must be at least 20 characters');
    process.exit(1);
  }
  BOT_API_SECRET = process.env.BOT_API_SECRET;
} else {
  // Development: Use BOT_API_SECRET if set, otherwise use dev-only default
  BOT_API_SECRET = process.env.BOT_API_SECRET || DEV_BOT_SECRET;

  if (!process.env.BOT_API_SECRET) {
    console.warn('⚠️  Using default dev bot secret. Set BOT_API_SECRET in .env for security.');
  }
}

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

console.log(`[BOT] NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`[BOT] Dev token present: ${!!process.env.TELEGRAM_BOT_TOKEN_DEV}`);
console.log(`[BOT] Prod token present: ${!!process.env.TELEGRAM_BOT_TOKEN}`);
console.log(`[BOT] BOT_TOKEN selected: ${!!BOT_TOKEN}`);

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required in environment variables');
  console.error(`Environment: ${process.env.NODE_ENV}`);
  console.error(`Dev token present: ${!!process.env.TELEGRAM_BOT_TOKEN_DEV}`);
  console.error(`Prod token present: ${!!process.env.TELEGRAM_BOT_TOKEN}`);
  process.exit(1);
}

console.log(`🤖 Starting bot in ${process.env.NODE_ENV} mode`);
console.log(`🔑 Using ${process.env.NODE_ENV === 'development' ? 'DEVELOPMENT' : 'PRODUCTION'} bot token`);

console.log('[BOT] ✅ Creating Telegraf instance...');
let bot;
try {
  bot = new Telegraf(BOT_TOKEN);
  console.log('[BOT] ✅ Telegraf instance created successfully');
} catch (err) {
  console.error('[BOT] ❌ Failed to create Telegraf instance:', err.message);
  console.error('[BOT] Stack:', err.stack);
  process.exit(1);
}

// ============================================================================
// ✅ SESSION MANAGEMENT WITH TTL (prevents memory leak)
// ============================================================================

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class SessionManager {
  constructor(ttlMs = SESSION_TTL_MS) {
    this.ttlMs = ttlMs;
    this.sessions = new Map();

    // Cleanup expired sessions every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60 * 60 * 1000);

    // Don't prevent process exit
    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  set(userId, data) {
    this.sessions.set(userId, {
      value: data,
      lastSeen: Date.now()
    });
  }

  get(userId) {
    const record = this.sessions.get(userId);
    if (!record) return null;

    // Check if expired
    const now = Date.now();
    if (now - record.lastSeen > this.ttlMs) {
      this.sessions.delete(userId);
      return null;
    }

    // Update last seen
    record.lastSeen = now;
    return record.value;
  }

  delete(userId) {
    this.sessions.delete(userId);
  }

  cleanupExpired() {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, record] of this.sessions.entries()) {
      if (now - record.lastSeen > this.ttlMs) {
        this.sessions.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired bot sessions`);
    }
  }
}

const userSessions = new SessionManager();
const userStates = new Map();
const pendingOperations = new Map(); // Track pending operations to prevent concurrent trades
let cachedSolPrice = 0;
let solPriceLastUpdated = 0;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// ✅ Escape Markdown special characters to prevent formatting issues
const escapeMarkdown = (input) => {
  const s = String(input ?? '');
  return s.replace(/([_*\[\]()`])/g, '\\$1');
};

// Helper to detect auth states (for log redaction)
const isAuthState = (state) => {
  return state === 'awaiting_login_credentials' || 
         state === 'awaiting_registration' || 
         state === 'login_password' || 
         state === 'register_password';
};

const formatSol = (lamports) => {
  const sol = Number(lamports) / 1_000_000_000;
  return sol.toFixed(4);
};

const formatTokenAmount = (lamports, decimals = 6) => {
  const tokens = Number(lamports) / (10 ** decimals);
  return tokens.toFixed(2);
};

// Convert lamports (SOL) to USD
const formatSolToUsd = (lamports, solPrice = cachedSolPrice) => {
  if (!solPrice || !Number.isFinite(solPrice)) return 'N/A';
  const sol = Number(lamports) / 1_000_000_000;
  const usd = sol * solPrice;
  if (!Number.isFinite(usd)) return 'N/A';
  return `$${usd.toFixed(2)}`;
};

// Get current SOL price - cached for 5 seconds to avoid repeated API calls
const getSolPrice = async (token) => {
  const now = Date.now();
  if (cachedSolPrice > 0 && (now - solPriceLastUpdated) < 5000) {
    return cachedSolPrice;
  }

  const result = await apiRequest('/api/solana/price', 'GET', null, token);
  if (result.success && result.data?.price) {
    cachedSolPrice = result.data.price;
    solPriceLastUpdated = now;
    return cachedSolPrice;
  }

  console.warn('Failed to fetch SOL price:', result.error || 'unavailable');
  return cachedSolPrice || null; // No magic fallback
};

// Helper function to detect Solana token addresses
const isSolanaAddress = (text) => {
  // Solana addresses are base58 encoded, typically 32-44 characters
  // They only contain: 1-9, A-H, J-N, P-Z, a-k, m-z (no 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(text.trim());
};

// ✅ IMPROVED: Deterministic idempotency key using Telegram update_id
// This ensures the same button press always generates the same key
const generateIdempotencyKey = (ctx, action, data = '') => {
  const userId = ctx.from?.id || 'unknown';
  const updateId = ctx.update?.update_id || Date.now();
  const sanitizedData = String(data).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
  return `tg_${userId}_${updateId}_${action}_${sanitizedData}`.substring(0, 256);
};

// ============================================================================
// API REQUEST HELPER
// ============================================================================

const apiRequest = async (endpoint, method = 'GET', data = null, token = null, isBotRequest = false, extraHeaders = {}) => {
  try {
    const headers = { ...extraHeaders };

    // Use standard Bearer token authentication
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add bot secret for telegram session endpoints
    if (isBotRequest) {
      headers['x-bot-secret'] = BOT_API_SECRET;
    }

    const config = {
      method,
      url: `${API_BASE_URL}${endpoint}`,
      headers,
      withCredentials: false,
      timeout: 15000 // 15 second timeout
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);

    if (response.data === undefined || response.data === null) {
      console.warn(`⚠️ API returned empty response for ${endpoint}`);
    }

    return { 
      success: true, 
      data: response.data,
      headers: response.headers 
    };
  } catch (error) {
    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      console.error('❌ Network Error:', error.code, error.message);
      return {
        success: false,
        error: 'Network error - cannot reach server. Please try again.'
      };
    }

    // Timeout errors
    if (error.code === 'ECONNABORTED') {
      console.error('❌ Request timeout:', endpoint);
      return {
        success: false,
        error: 'Request timeout - server took too long to respond.'
      };
    }

    console.error('API Error:', error.response?.data || error.message);

    // Robust error message extraction
    let errorMessage = 'Unknown error occurred';
    if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
    } else if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (typeof error.message === 'string') {
      errorMessage = error.message;
    }

    return { 
      success: false, 
      error: errorMessage
    };
  }
};

// ============================================================================
// ERROR HANDLING & MIDDLEWARE
// ============================================================================

// Global error handler
bot.catch((err, ctx) => {
  console.error('❌ Telegraf error:', err.message);
  try {
    ctx.reply('❌ An error occurred. Please try again or use /start to restart.');
  } catch (e) {
    console.error('Failed to send error message to user:', e);
  }
});

// Debug middleware with credential redaction
bot.use(async (ctx, next) => {
  const updateType = ctx.updateType;
  const userId = ctx.from?.id;
  const username = ctx.from?.username || ctx.from?.first_name;

  console.log(`[MIDDLEWARE] 📨 Received update: ${updateType} from user ${userId} (@${username})`);

  if (ctx.message?.text) {
    const st = userStates.get(userId);
    const redacted = st && isAuthState(st.state);
    console.log(`[MIDDLEWARE]    Message text: "${redacted ? '[REDACTED]' : ctx.message.text}"`);
  }
  if (ctx.callbackQuery) {
    console.log(`[MIDDLEWARE]    Callback data: "${ctx.callbackQuery.data}"`);
  }

  try {
    await next();
    console.log(`[MIDDLEWARE] ✅ Finished processing ${updateType}`);
  } catch (err) {
    console.error(`[MIDDLEWARE] ❌ Middleware error:`, err.message);
    throw err;
  }
});

// Cleanup old user states every 30 minutes
setInterval(() => {
  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;
  let deletedCount = 0;

  for (const [userId, state] of userStates.entries()) {
    if (state.lastActivity && (now - state.lastActivity) > THIRTY_MINUTES) {
      userStates.delete(userId);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    console.log(`🧹 Cleaned up ${deletedCount} inactive user states`);
  }
}, 30 * 60 * 1000);

// ============================================================================
// UI HELPERS
// ============================================================================

const getMainMenuKeyboard = (balance) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`💰 Balance: ${formatSol(balance)} SOL`, 'noop')],
    [
      Markup.button.callback('📈 Buy', 'buy'),
      Markup.button.callback('📊 Portfolio', 'portfolio')
    ],
    [
      Markup.button.callback('📉 Sell', 'sell'),
      Markup.button.callback('📜 History', 'history')
    ],
    [
      Markup.button.callback('🏆 Leaderboard', 'leaderboard'),
      Markup.button.callback('❌ Logout', 'logout')
    ]
  ]);
};

const showMainMenu = async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (!session) {
    return ctx.reply('❌ Session expired. Please /start to login again.');
  }

  const result = await apiRequest('/api/auth/profile', 'GET', null, session.token);

  if (!result.success) {
    return ctx.reply('❌ Error fetching profile. Please /start to login again.');
  }

  const balance = result.data.balance;
  session.balance = BigInt(balance);

  return ctx.reply(
    `🎮 *SimFi Trading Bot*\n\nWelcome back, *${escapeMarkdown(result.data.username)}*!`,
    {
      parse_mode: 'Markdown',
      ...getMainMenuKeyboard(balance)
    }
  );
};

// Helper function to show buy menu for a token
const showBuyMenu = async (ctx, tokenAddress, session) => {
  const userId = ctx.from.id;

  // Validate address format first
  if (!isSolanaAddress(tokenAddress)) {
    return ctx.reply('❌ Invalid Solana token address. Please paste a valid token mint address (base58, 32–44 chars).');
  }

  let loadingMsg;
  try {
    loadingMsg = await ctx.reply('🔍 Fetching token info...');
  } catch (e) {
    console.error('Failed to send loading message:', e);
  }

  // Fetch token price and metadata from server
  const result = await apiRequest(`/api/tokens/${tokenAddress}`, 'GET', null, session.token);

  try {
    if (loadingMsg?.message_id) {
      await ctx.deleteMessage(loadingMsg.message_id);
    }
  } catch (e) {
    console.log('ℹ️ Could not delete loading message:', e.message);
  }

  if (!result.success) {
    userStates.delete(userId);

    // Better error message for liquidity issues
    if (result.error && result.error.includes('liquidity')) {
      return ctx.reply(
        `❌ This token doesn't meet liquidity requirements.\n\n` +
        `Minimum: $1,000 liquidity, $500 daily volume\n\n` +
        `Try a more established token.`
      );
    }

    return ctx.reply(
      '❌ Could not fetch token info.\n\n' +
      'This token may not be listed on DexScreener or may not have a Solana trading pair.\n\n' +
      'Please try another token or use /start to return to the main menu.'
    );
  }

  const token = result.data.token;
  const priceLamports = BigInt(token.price);
  const priceInSol = Number(priceLamports) / 1_000_000_000;
  const solPrice = await getSolPrice(session.token);
  const priceInUsd = solPrice ? (priceInSol * solPrice) : null;

  // Store token data in user state
  userStates.set(userId, {
    state: 'awaiting_buy_amount',
    tokenAddress,
    token: {
      name: token.name,
      symbol: token.symbol,
      price: priceLamports.toString()
    },
    lastActivity: Date.now()
  });

  const priceUsdStr = priceInUsd ? `($${priceInUsd.toFixed(6)})` : '';

  await ctx.reply(
    `📊 *${escapeMarkdown(token.symbol)}*\n` +
    `${escapeMarkdown(token.name)}\n\n` +
    `💰 Price: ${priceInSol.toFixed(9)} SOL ${priceUsdStr}\n` +
    `⚠️ Note: ~0.5% slippage will be applied\n\n` +
    `How much SOL do you want to spend?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('0.1 SOL', 'buy_amt:0.1'),
          Markup.button.callback('0.5 SOL', 'buy_amt:0.5'),
        ],
        [
          Markup.button.callback('1 SOL', 'buy_amt:1'),
          Markup.button.callback('5 SOL', 'buy_amt:5'),
        ],
        [Markup.button.callback('✏️ Custom Amount', 'buy_custom')],
        [Markup.button.callback('« Back to Menu', 'main_menu')]
      ])
    }
  );
};

// ============================================================================
// BOT COMMANDS
// ============================================================================

bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name;

  console.log(`📱 User ${userId} (@${username}) started the bot`);

  // Check if user has an active session
  const session = userSessions.get(userId);

  if (session) {
    console.log(`✅ User ${userId} has active session`);
    return showMainMenu(ctx);
  }

  // Try to restore session from database
  const telegramUserId = userId.toString();
  const sessionResult = await apiRequest(`/api/telegram/session/${telegramUserId}`, 'GET', null, null, true);

  if (sessionResult.success && sessionResult.data.session) {
    const dbSession = sessionResult.data.session;

    // Validate token is still valid
    const profileTest = await apiRequest('/api/auth/profile', 'GET', null, dbSession.token);

    if (profileTest.success) {
      let balanceValue;
      if (typeof dbSession.balance === 'bigint') {
        balanceValue = dbSession.balance;
      } else if (typeof dbSession.balance === 'string' || typeof dbSession.balance === 'number') {
        balanceValue = BigInt(dbSession.balance);
      } else {
        balanceValue = BigInt(0);
      }

      userSessions.set(userId, {
        username: dbSession.username || profileTest.data.username,
        token: dbSession.token,
        balance: balanceValue
      });

      await ctx.reply('👋 Welcome back! Your session has been restored.');
      return showMainMenu(ctx);
    } else {
      // Token expired, delete session
      await apiRequest(`/api/telegram/session/${telegramUserId}`, 'DELETE', null, null, true);
    }
  }

  // No session - prompt for login
  await ctx.reply(
    `👋 Welcome to *SimFi Trading Bot*!\n\n` +
    `Paper trade Solana tokens with ease.\n\n` +
    `Please choose an option:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔐 Login', 'login')],
        [Markup.button.callback('📝 Register', 'register')]
      ])
    }
  );
});

// ============================================================================
// ADDITIONAL SLASH COMMANDS
// ============================================================================

bot.command('help', async (ctx) => {
  const session = userSessions.get(ctx.from.id);
  const loggedIn = !!session;

  let message = `📚 *SimFi Bot Commands*\n\n`;
  message += `/start - Start bot & show main menu\n`;
  message += `/help - Show this help message\n\n`;

  if (loggedIn) {
    message += `*Trading:*\n`;
    message += `/buy - Buy a token by address\n`;
    message += `/sell - Sell your open positions\n\n`;
    message += `*Portfolio:*\n`;
    message += `/portfolio - View your holdings\n`;
    message += `/balance - Check your SOL balance\n`;
    message += `/history - View trade history\n\n`;
    message += `*Social:*\n`;
    message += `/leaderboard - View top traders\n\n`;
    message += `*Account:*\n`;
    message += `/logout - Log out of your account\n`;
  } else {
    message += `Please /start to login or register first.`;
  }

  await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('buy', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (!session) {
    return ctx.reply('❌ Please /start to login first.');
  }

  if (pendingOperations.get(userId)) {
    return ctx.reply('⏳ You already have a trade in progress. Please wait for it to complete.');
  }

  // Check if token address was provided with command
  const args = ctx.message.text.split(/\s+/).slice(1);

  if (args.length > 0 && isSolanaAddress(args[0])) {
    // Token address provided, go directly to buy menu
    await showBuyMenu(ctx, args[0], session);
  } else {
    // No address provided, ask for it
    userStates.set(userId, {
      state: 'awaiting_buy_token',
      lastActivity: Date.now()
    });

    await ctx.reply(
      '📈 *Buy Token*\n\n' +
      'Please send the Solana token address you want to buy.\n\n' +
      '💡 Tip: You can also use `/buy <address>` directly.',
      { parse_mode: 'Markdown' }
    );
  }
});

bot.command('sell', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (!session) {
    return ctx.reply('❌ Please /start to login first.');
  }

  if (pendingOperations.get(userId)) {
    return ctx.reply('⏳ You already have a trade in progress. Please wait for it to complete.');
  }

  const result = await apiRequest('/api/trades/positions', 'GET', null, session.token);

  if (!result.success) {
    return ctx.reply('❌ Error: ' + result.error);
  }

  const positions = result.data.positions || [];

  if (positions.length === 0) {
    return ctx.reply(
      '📉 *Sell Position*\n\n' +
      'You have no open positions to sell.',
      { parse_mode: 'Markdown' }
    );
  }

  const buttons = positions.map(pos => {
    const currentValue = BigInt(pos.currentValue || 0);
    const costBasis = BigInt(pos.solSpent || 0);
    const profitLoss = currentValue - costBasis;
    const profitEmoji = profitLoss > 0n ? '📈' : profitLoss < 0n ? '📉' : '➡️';

    return [Markup.button.callback(
      `${profitEmoji} ${pos.tokenSymbol} (${formatSol(currentValue)} SOL)`,
      `sell_pos:${pos.id}`
    )];
  });

  buttons.push([Markup.button.callback('« Back to Menu', 'main_menu')]);

  await ctx.reply(
    '📉 *Sell Position*\n\n' +
    'Select a position to sell:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    }
  );
});

bot.command('portfolio', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (!session) {
    return ctx.reply('❌ Please /start to login first.');
  }

  const result = await apiRequest('/api/trades/positions', 'GET', null, session.token);

  if (!result.success) {
    return ctx.reply('❌ Error: ' + result.error);
  }

  const positions = result.data.positions || [];

  if (positions.length === 0) {
    return ctx.reply(
      '📊 *Your Portfolio*\n\n' +
      'You have no open positions.\n\n' +
      'Use /buy to start trading!',
      { parse_mode: 'Markdown' }
    );
  }

  let message = '📊 *Your Portfolio*\n\n';
  let totalValue = BigInt(0);

  for (const pos of positions) {
    const currentValue = BigInt(pos.currentValue || 0);
    const costBasis = BigInt(pos.solSpent || 0);
    const profitLoss = currentValue - costBasis;
    const profitPercent = costBasis > 0n
      ? (Number(profitLoss) / Number(costBasis)) * 100
      : 0;

    const profitEmoji = profitLoss > 0n ? '📈' : profitLoss < 0n ? '📉' : '➡️';
    const profitSign = profitLoss > 0n ? '+' : '';

    message += `${profitEmoji} *${escapeMarkdown(pos.tokenSymbol)}*\n`;
    message += `Amount: ${formatTokenAmount(pos.amount, pos.decimals || 6)} ${escapeMarkdown(pos.tokenSymbol)}\n`;
    message += `Value: ${formatSol(currentValue)} SOL\n`;
    message += `P/L: ${profitSign}${formatSol(profitLoss)} SOL (${profitSign}${profitPercent.toFixed(2)}%)\n\n`;

    totalValue += currentValue;
  }

  message += `💰 *Total Value:* ${formatSol(totalValue)} SOL`;

  await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('balance', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (!session) {
    return ctx.reply('❌ Please /start to login first.');
  }

  const result = await apiRequest('/api/auth/profile', 'GET', null, session.token);

  if (!result.success) {
    return ctx.reply('❌ Error fetching balance. Please /start to login again.');
  }

  const balance = result.data.balance;
  const solPrice = await getSolPrice(session.token);
  const balanceInSol = Number(balance) / 1_000_000_000;
  const balanceUsd = solPrice ? (balanceInSol * solPrice) : null;
  const usdStr = balanceUsd ? ` (~$${balanceUsd.toFixed(2)})` : '';

  await ctx.reply(
    `💰 *Your Balance*\n\n` +
    `Available: *${formatSol(balance)} SOL*${usdStr}\n\n` +
    `Use /buy to trade or /portfolio to see holdings.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('history', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (!session) {
    return ctx.reply('❌ Please /start to login first.');
  }

  const result = await apiRequest('/api/trades/history?page=1', 'GET', null, session.token);

  if (!result.success) {
    return ctx.reply('❌ Error: ' + result.error);
  }

  const trades = result.data.trades || [];

  if (trades.length === 0) {
    return ctx.reply(
      '📜 *Trade History*\n\n' +
      'No trades yet. Use /buy to start trading!',
      { parse_mode: 'Markdown' }
    );
  }

  let message = '📜 *Recent Trades*\n\n';

  for (const trade of trades.slice(0, 10)) {
    const profitLoss = BigInt(trade.profitLoss || 0);
    const profitEmoji = profitLoss > 0n ? '📈' : profitLoss < 0n ? '📉' : '➡️';
    const profitSign = profitLoss > 0n ? '+' : '';

    message += `${profitEmoji} *${escapeMarkdown(trade.tokenSymbol)}*\n`;
    message += `Amount: ${formatTokenAmount(trade.amount, trade.decimals || 6)}\n`;
    message += `P/L: ${profitSign}${formatSol(profitLoss)} SOL\n`;
    message += `Date: ${new Date(trade.closedAt).toLocaleDateString()}\n\n`;
  }

  await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('leaderboard', async (ctx) => {
  await ctx.reply(
    '🏆 *Leaderboard*\n\n' +
    'Choose a leaderboard:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌍 Overall', 'lb_overall')],
        [Markup.button.callback('📅 Current Period', 'lb_period')],
        [Markup.button.callback('« Back to Menu', 'main_menu')]
      ])
    }
  );
});

bot.command('logout', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (!session) {
    return ctx.reply('❌ You are not logged in. Use /start to login.');
  }

  // Delete session from database
  const telegramUserId = userId.toString();
  await apiRequest(`/api/telegram/session/${telegramUserId}`, 'DELETE', null, null, true);

  userSessions.delete(userId);
  userStates.delete(userId);

  await ctx.reply(
    '👋 You have been logged out.\n\n' +
    'Use /start to login again.'
  );
});

// ============================================================================
// AUTH ACTIONS
// ============================================================================

bot.action('login', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;

  userStates.set(userId, {
    state: 'awaiting_login_credentials',
    lastActivity: Date.now()
  });

  await ctx.reply(
    '🔐 *Login*\n\n' +
    'Please send your credentials in this format:\n' +
    '`email password`\n' +
    'or\n' +
    '`username password`\n\n' +
    'Example: `user@example.com mypassword`',
    { parse_mode: 'Markdown' }
  );
});

bot.action('register', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;

  userStates.set(userId, {
    state: 'awaiting_registration',
    lastActivity: Date.now()
  });

  await ctx.reply(
    '📝 *Registration*\n\n' +
    'Please send your details in this format:\n' +
    '`email username password`\n\n' +
    'Example: `user@example.com myusername mypassword`',
    { parse_mode: 'Markdown' }
  );
});

bot.action('logout', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;

  // Delete session from database
  const telegramUserId = userId.toString();
  await apiRequest(`/api/telegram/session/${telegramUserId}`, 'DELETE', null, null, true);

  userSessions.delete(userId);
  userStates.delete(userId);

  await ctx.reply(
    '👋 You have been logged out.\n\n' +
    'Use /start to login again.'
  );
});

// ============================================================================
// TRADING ACTIONS
// ============================================================================

bot.action('buy', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (!session) {
    return ctx.reply('❌ Session expired. Please /start to login again.');
  }

  if (pendingOperations.get(userId)) {
    return ctx.reply('⏳ You already have a trade in progress. Please wait for it to complete.');
  }

  userStates.set(userId, {
    state: 'awaiting_buy_token',
    lastActivity: Date.now()
  });

  await ctx.reply(
    '📈 *Buy Token*\n\n' +
    'Please send the Solana token address you want to buy.',
    { parse_mode: 'Markdown' }
  );
});

bot.action('buy_custom', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;

  const state = userStates.get(userId);
  if (!state || !state.token) {
    return ctx.reply('❌ Session expired. Please try again.');
  }

  userStates.set(userId, {
    ...state,
    state: 'awaiting_buy_amount_custom',
    lastActivity: Date.now()
  });

  await ctx.reply(
    '✏️ Enter the amount of SOL you want to spend:\n\n' +
    'Example: 0.25',
    { parse_mode: 'Markdown' }
  );
});

// ✅ CRITICAL FIX: Quick buy buttons handler with race condition protection
bot.action(/^buy_amt:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const amount = parseFloat(ctx.match[1]);
  const userId = ctx.from.id;
  const state = userStates.get(userId);
  const session = userSessions.get(userId);

  if (!session) {
    userStates.delete(userId);
    return ctx.reply('❌ Session expired. Please /start to login again.');
  }

  if (!state || !state.token) {
    return ctx.reply('❌ Session expired. Please try again.');
  }

  // ✅ CRITICAL: Prevent race condition - check for pending operations
  if (pendingOperations.get(userId)) {
    return ctx.reply('⏳ You already have a trade in progress. Please wait for it to complete.');
  }

  // Mark operation as pending
  pendingOperations.set(userId, true);

  try {
    const loadingMsg = await ctx.reply('⏳ Processing buy order...');

    // ✅ Deterministic idempotency key using update_id
    const idempotencyKey = generateIdempotencyKey(ctx, 'buy', `${state.tokenAddress}_${amount}`);

    // ✅ Only send what server needs (server fetches price itself)
    const result = await apiRequest('/api/trades/buy', 'POST', {
      tokenAddress: state.tokenAddress,
      tokenName: state.token.name,
      tokenSymbol: state.token.symbol,
      solAmount: amount,
      chain: 'solana',
    }, session.token, false, {
      'x-idempotency-key': idempotencyKey
    });

    try {
      if (loadingMsg?.message_id) {
        await ctx.deleteMessage(loadingMsg.message_id);
      }
    } catch (e) {
      console.log('ℹ️ Could not delete loading message:', e.message);
    }

    if (!result.success) {
      userStates.delete(userId);

      // Better error message for liquidity issues
      if (result.error && result.error.includes('liquidity')) {
        return ctx.reply(
          `❌ This token doesn't meet liquidity requirements.\n\n` +
          `Minimum: $1,000 liquidity, $500 daily volume\n\n` +
          `Try a more established token.`
        );
      }

      return ctx.reply('❌ Error: ' + result.error);
    }

    userStates.delete(userId);
    const tokenAmount = result.data.tokensReceived || 0;
    const decimals = result.data.decimals || 6;

    await ctx.reply(
      `✅ Successfully bought *${escapeMarkdown(state.token.symbol)}*!\n\n` +
      `Amount: *${formatTokenAmount(tokenAmount, decimals)} ${escapeMarkdown(state.token.symbol)}*\n` +
      `Spent: *${amount} SOL*`,
      { parse_mode: 'Markdown' }
    );

    await showMainMenu(ctx);
  } finally {
    // Always clear pending operation
    pendingOperations.delete(userId);
  }
});

bot.action('sell', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (!session) {
    return ctx.reply('❌ Session expired. Please /start to login again.');
  }

  if (pendingOperations.get(userId)) {
    return ctx.reply('⏳ You already have a trade in progress. Please wait for it to complete.');
  }

  const result = await apiRequest('/api/trades/positions', 'GET', null, session.token);

  if (!result.success) {
    return ctx.reply('❌ Error: ' + result.error);
  }

  const positions = result.data.positions || [];

  if (positions.length === 0) {
    return ctx.reply(
      '📉 *Sell Position*\n\n' +
      'You have no open positions to sell.',
      { parse_mode: 'Markdown' }
    );
  }

  const buttons = positions.map(pos => {
    const currentValue = BigInt(pos.currentValue || 0);
    const costBasis = BigInt(pos.solSpent || 0);
    const profitLoss = currentValue - costBasis;
    const profitEmoji = profitLoss > 0n ? '📈' : profitLoss < 0n ? '📉' : '➡️';

    return [Markup.button.callback(
      `${profitEmoji} ${pos.tokenSymbol} (${formatSol(currentValue)} SOL)`,
      `sell_pos:${pos.id}`
    )];
  });

  buttons.push([Markup.button.callback('« Back to Menu', 'main_menu')]);

  await ctx.reply(
    '📉 *Sell Position*\n\n' +
    'Select a position to sell:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    }
  );
});

bot.action(/^sell_pos:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const positionId = ctx.match[1];
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (!session) {
    return ctx.reply('❌ Session expired. Please /start to login again.');
  }

  if (pendingOperations.get(userId)) {
    return ctx.reply('⏳ You already have a trade in progress. Please wait for it to complete.');
  }

  pendingOperations.set(userId, true);

  try {
    const loadingMsg = await ctx.reply('⏳ Processing sell order...');

    const idempotencyKey = generateIdempotencyKey(ctx, 'sell', positionId);

    const result = await apiRequest('/api/trades/sell', 'POST', {
      positionId,
    }, session.token, false, {
      'x-idempotency-key': idempotencyKey
    });

    try {
      if (loadingMsg?.message_id) {
        await ctx.deleteMessage(loadingMsg.message_id);
      }
    } catch (e) {
      console.log('ℹ️ Could not delete loading message:', e.message);
    }

    if (!result.success) {
      return ctx.reply('❌ Error: ' + result.error);
    }

    const profitLoss = BigInt(result.data.profitLoss || 0);
    const solReceived = BigInt(result.data.solReceived || 0);
    const profitEmoji = profitLoss > 0n ? '📈' : profitLoss < 0n ? '📉' : '➡️';
    const profitSign = profitLoss > 0n ? '+' : '';

    await ctx.reply(
      `✅ *Position sold successfully!*\n\n` +
      `${profitEmoji} P/L: ${profitSign}${formatSol(profitLoss)} SOL\n` +
      `💰 Received: ${formatSol(solReceived)} SOL`,
      { parse_mode: 'Markdown' }
    );

    await showMainMenu(ctx);
  } finally {
    pendingOperations.delete(userId);
  }
});

// ============================================================================
// PORTFOLIO & HISTORY
// ============================================================================

bot.action('portfolio', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (!session) {
    return ctx.reply('❌ Session expired. Please /start to login again.');
  }

  const result = await apiRequest('/api/trades/positions', 'GET', null, session.token);

  if (!result.success) {
    return ctx.reply('❌ Error: ' + result.error);
  }

  const positions = result.data.positions || [];

  if (positions.length === 0) {
    return ctx.reply(
      '📊 *Your Portfolio*\n\n' +
      'You have no open positions.\n\n' +
      'Use the Buy button to start trading!',
      { parse_mode: 'Markdown' }
    );
  }

  let message = '📊 *Your Portfolio*\n\n';
  let totalValue = BigInt(0);

  for (const pos of positions) {
    const currentValue = BigInt(pos.currentValue || 0);
    const costBasis = BigInt(pos.solSpent || 0);
    const profitLoss = currentValue - costBasis;
    const profitPercent = costBasis > 0n
      ? (Number(profitLoss) / Number(costBasis)) * 100
      : 0;

    const profitEmoji = profitLoss > 0n ? '📈' : profitLoss < 0n ? '📉' : '➡️';
    const profitSign = profitLoss > 0n ? '+' : '';

    message += `${profitEmoji} *${escapeMarkdown(pos.tokenSymbol)}*\n`;
    message += `Amount: ${formatTokenAmount(pos.amount, pos.decimals || 6)} ${escapeMarkdown(pos.tokenSymbol)}\n`;
    message += `Value: ${formatSol(currentValue)} SOL\n`;
    message += `P/L: ${profitSign}${formatSol(profitLoss)} SOL (${profitSign}${profitPercent.toFixed(2)}%)\n\n`;

    totalValue += currentValue;
  }

  message += `💰 *Total Value:* ${formatSol(totalValue)} SOL`;

  await ctx.reply(message, { parse_mode: 'Markdown' });
  await showMainMenu(ctx);
});

bot.action('history', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (!session) {
    return ctx.reply('❌ Session expired. Please /start to login again.');
  }

  const result = await apiRequest('/api/trades/history?page=1', 'GET', null, session.token);

  if (!result.success) {
    return ctx.reply('❌ Error: ' + result.error);
  }

  const trades = result.data.trades || [];

  if (trades.length === 0) {
    return ctx.reply(
      '📜 *Trade History*\n\n' +
      'No trades yet.',
      { parse_mode: 'Markdown' }
    );
  }

  let message = '📜 *Recent Trades*\n\n';

  for (const trade of trades.slice(0, 10)) {
    const profitLoss = BigInt(trade.profitLoss || 0);
    const profitEmoji = profitLoss > 0n ? '📈' : profitLoss < 0n ? '📉' : '➡️';
    const profitSign = profitLoss > 0n ? '+' : '';

    message += `${profitEmoji} *${escapeMarkdown(trade.tokenSymbol)}*\n`;
    message += `Amount: ${formatTokenAmount(trade.amount, trade.decimals || 6)}\n`;
    message += `P/L: ${profitSign}${formatSol(profitLoss)} SOL\n`;
    message += `Date: ${new Date(trade.closedAt).toLocaleDateString()}\n\n`;
  }

  await ctx.reply(message, { parse_mode: 'Markdown' });
  await showMainMenu(ctx);
});

// ============================================================================
// LEADERBOARD (✅ FIXED ENDPOINTS)
// ============================================================================

bot.action('leaderboard', async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply(
    '🏆 *Leaderboard*\n\n' +
    'Choose a leaderboard:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌍 Overall', 'lb_overall')],
        [Markup.button.callback('📅 Current Period', 'lb_period')],
        [Markup.button.callback('« Back to Menu', 'main_menu')]
      ])
    }
  );
});

bot.action('lb_overall', async (ctx) => {
  await ctx.answerCbQuery();

  // ✅ FIXED: Correct endpoint
  const result = await apiRequest('/api/leaderboard/overall', 'GET');

  if (!result.success) {
    return ctx.reply('❌ Error: ' + result.error);
  }

  const leaders = result.data.leaders || [];

  if (leaders.length === 0) {
    return ctx.reply('🏆 No leaderboard data yet.');
  }

  let message = '🏆 *Overall Leaderboard*\n\n';
  const medals = ['🥇', '🥈', '🥉'];

  for (let i = 0; i < Math.min(leaders.length, 10); i++) {
    const leader = leaders[i];
    const profit = BigInt(leader.totalProfit || 0);
    const profitSign = profit > 0n ? '+' : '';
    const medal = medals[i] || `${i + 1}.`;

    message += `${medal} *${escapeMarkdown(leader.username)}*\n`;
    message += `   Profit: ${profitSign}${formatSol(profit)} SOL\n\n`;
  }

  await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.action('lb_period', async (ctx) => {
  await ctx.answerCbQuery();

  // ✅ FIXED: Correct endpoint
  const result = await apiRequest('/api/leaderboard/current-period', 'GET');

  if (!result.success) {
    return ctx.reply('❌ Error: ' + result.error);
  }

  const leaders = result.data.leaders || [];

  if (leaders.length === 0) {
    return ctx.reply('📅 No period leaderboard data yet.');
  }

  let message = '📅 *Current Period Leaderboard*\n\n';
  const medals = ['🥇', '🥈', '🥉'];

  for (let i = 0; i < Math.min(leaders.length, 10); i++) {
    const leader = leaders[i];
    const profit = BigInt(leader.periodProfit || leader.totalProfit || 0);
    const profitSign = profit > 0n ? '+' : '';
    const medal = medals[i] || `${i + 1}.`;

    message += `${medal} *${escapeMarkdown(leader.username)}*\n`;
    message += `   Profit: ${profitSign}${formatSol(profit)} SOL\n\n`;
  }

  await ctx.reply(message, { parse_mode: 'Markdown' });
});

// ============================================================================
// MISC ACTIONS
// ============================================================================

bot.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await showMainMenu(ctx);
});

bot.action('noop', async (ctx) => {
  await ctx.answerCbQuery();
});

// ============================================================================
// TEXT MESSAGE HANDLER
// ============================================================================

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  const state = userStates.get(userId);

  if (!state) {
    return ctx.reply('Please use /start to begin.');
  }

  // Registration handler
  if (state.state === 'awaiting_registration') {
    const parts = text.split(/\s+/);

    if (parts.length !== 3) {
      return ctx.reply(
        '❌ Invalid format. Please use:\n' +
        '`email username password`\n\n' +
        'Example: `user@example.com myusername mypassword`',
        { parse_mode: 'Markdown' }
      );
    }

    const [email, username, password] = parts;

    const loadingMsg = await ctx.reply('⏳ Creating account...');

    const result = await apiRequest('/api/telegram/auth/register', 'POST', {
      email,
      username,
      password
    }, null, true);

    try {
      if (loadingMsg?.message_id) {
        await ctx.deleteMessage(loadingMsg.message_id);
      }
    } catch (e) {
      console.log('ℹ️ Could not delete loading message:', e.message);
    }

    if (!result.success) {
      userStates.delete(userId);

      const errorMsg = result.error || '';
      if (errorMsg.includes('already registered') || errorMsg.includes('Email already')) {
        return ctx.reply(
          `❌ Registration failed: This email is already registered!\n\n` +
          `💡 Use Login if you already have an account.`
        );
      }
      if (errorMsg.includes('already taken') || errorMsg.includes('Username already')) {
        return ctx.reply(
          `❌ Registration failed: This username is already taken!\n\n` +
          `💡 Try a different username.`
        );
      }

      return ctx.reply('❌ Registration failed: ' + result.error);
    }

    const user = result.data.user;
    const token = result.data.token;

    console.log(`✅ Bot user ${user.username} registered successfully`);

    let balanceValue;
    if (typeof user.balance === 'bigint') {
      balanceValue = user.balance;
    } else if (typeof user.balance === 'string' || typeof user.balance === 'number') {
      balanceValue = BigInt(user.balance);
    } else {
      balanceValue = BigInt(0);
    }

    userSessions.set(userId, {
      username: user.username,
      token,
      balance: balanceValue
    });

    const telegramUserId = userId.toString();
    await apiRequest('/api/telegram/session', 'POST', {
      telegramUserId,
      userId: user.id,
      token,
      balance: user.balance.toString()
    }, null, true);

    userStates.delete(userId);

    await ctx.reply(
      `✅ *Registration successful!*\n\n` +
      `Welcome, *${escapeMarkdown(user.username)}*!\n` +
      `💰 Starting balance: ${formatSol(user.balance)} SOL`,
      { parse_mode: 'Markdown' }
    );

    await showMainMenu(ctx);
    return;
  }

  // Login handler
  if (state.state === 'awaiting_login_credentials') {
    const parts = text.split(/\s+/);

    if (parts.length !== 2) {
      return ctx.reply(
        '❌ Invalid format. Please use:\n' +
        '`email password` or `username password`\n\n' +
        'Example: `user@example.com mypassword`',
        { parse_mode: 'Markdown' }
      );
    }

    const [identifier, password] = parts;
    const isEmail = identifier.includes('@');

    const loadingMsg = await ctx.reply('⏳ Logging in...');

    try {
      const result = await apiRequest('/api/telegram/auth/login', 'POST', {
        ...(isEmail ? { email: identifier } : { username: identifier }),
        password
      }, null, true);

      try {
        if (loadingMsg?.message_id) {
          await ctx.deleteMessage(loadingMsg.message_id);
        }
      } catch (e) {
        console.log('ℹ️ Could not delete loading message:', e.message);
      }

      if (!result.success) {
        userStates.delete(userId);

        const errorMsg = result.error || '';

        if (errorMsg.includes('Invalid credentials') || errorMsg.includes('not found') || errorMsg.includes('wrong password')) {
          return ctx.reply(
            `❌ Login failed: Email/username or password is incorrect.\n\n` +
            `💡 Please check:\n` +
            `• Email or username is correct\n` +
            `• Password is correct (case-sensitive)\n\n` +
            `Try again or use /start to restart.`
          );
        }
        if (errorMsg.includes('Invalid bot secret') || errorMsg.includes('Forbidden')) {
          return ctx.reply('❌ Bot authentication failed. Please contact support.');
        }

        return ctx.reply(`❌ Login failed: ${errorMsg}\n\nUse /start to try again.`);
      }

      if (!result.data || !result.data.user || !result.data.token) {
        console.error('❌ Invalid login response structure:', result.data);
        userStates.delete(userId);
        return ctx.reply('❌ Unexpected server response. Please try again.');
      }

      const user = result.data.user;
      const token = result.data.token;

      console.log(`✅ Bot user ${user.username} logged in successfully`);

      let balanceValue;
      if (typeof user.balance === 'bigint') {
        balanceValue = user.balance;
      } else if (typeof user.balance === 'string' || typeof user.balance === 'number') {
        balanceValue = BigInt(user.balance);
      } else {
        balanceValue = BigInt(0);
      }

      userSessions.set(userId, {
        username: user.username,
        token,
        balance: balanceValue
      });

      const telegramUserId = userId.toString();
      await apiRequest('/api/telegram/session', 'POST', {
        telegramUserId,
        userId: user.id,
        token,
        balance: user.balance.toString()
      }, null, true);

      userStates.delete(userId);

      await ctx.reply(
        `✅ *Welcome back, ${escapeMarkdown(user.username)}!*\n\n` +
        `💰 Balance: ${formatSol(user.balance)} SOL`,
        { parse_mode: 'Markdown' }
      );
      await showMainMenu(ctx);
    } catch (error) {
      userStates.delete(userId);
      console.error('❌ Bot login exception:', error);
      await ctx.reply(
        '❌ An unexpected error occurred during login.\n\n' +
        '💡 Please use /start to try again.'
      );
    }
    return;
  }

  // Buy token address handler
  if (state.state === 'awaiting_buy_token') {
    const session = userSessions.get(userId);
    if (!session) {
      userStates.delete(userId);
      return ctx.reply('❌ Session expired. Please /start to login again.');
    }

    const tokenAddress = text.trim();
    await showBuyMenu(ctx, tokenAddress, session);
    return;
  }

  // Custom buy amount handler
  if (state.state === 'awaiting_buy_amount_custom') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Invalid amount. Please enter a positive number.');
    }

    const session = userSessions.get(userId);

    if (!session) {
      userStates.delete(userId);
      return ctx.reply('❌ Session expired. Please /start to login again.');
    }

    // ✅ CRITICAL: Check for pending operations
    if (pendingOperations.get(userId)) {
      return ctx.reply('⏳ You already have a trade in progress. Please wait for it to complete.');
    }

    pendingOperations.set(userId, true);

    try {
      const loadingMsg = await ctx.reply('⏳ Processing buy order...');

      const idempotencyKey = generateIdempotencyKey(ctx, 'buy', `${state.tokenAddress}_${amount}`);

      const result = await apiRequest('/api/trades/buy', 'POST', {
        tokenAddress: state.tokenAddress,
        tokenName: state.token.name,
        tokenSymbol: state.token.symbol,
        solAmount: amount,
        chain: 'solana',
      }, session.token, false, {
        'x-idempotency-key': idempotencyKey
      });

      try {
        if (loadingMsg?.message_id) {
          await ctx.deleteMessage(loadingMsg.message_id);
        }
      } catch (e) {
        console.log('ℹ️ Could not delete loading message:', e.message);
      }

      if (!result.success) {
        userStates.delete(userId);

        if (result.error && result.error.includes('liquidity')) {
          return ctx.reply(
            `❌ This token doesn't meet liquidity requirements.\n\n` +
            `Minimum: $1,000 liquidity, $500 daily volume\n\n` +
            `Try a more established token.`
          );
        }

        return ctx.reply('❌ Error: ' + result.error);
      }

      userStates.delete(userId);
      const tokenAmount = result.data.tokensReceived || 0;
      const decimals = result.data.decimals || 6;

      await ctx.reply(
        `✅ Successfully bought *${escapeMarkdown(state.token.symbol)}*!\n\n` +
        `Amount: *${formatTokenAmount(tokenAmount, decimals)} ${escapeMarkdown(state.token.symbol)}*\n` +
        `Spent: *${amount} SOL*`,
        { parse_mode: 'Markdown' }
      );

      await showMainMenu(ctx);
    } finally {
      pendingOperations.delete(userId);
    }
    return;
  }
});

// ============================================================================
// BOT STARTUP - FIXED POLLING
// ============================================================================

console.log('🚀 Starting Telegram bot with polling...');

// Track polling state
let isPolling = false;
let pollOffset = 0;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 10;
const PROCESSED_UPDATES = new Set(); // Prevent duplicate processing

// Manual polling implementation - more reliable than Telegraf's built-in polling
async function startManualPolling() {
  if (isPolling) {
    console.log('⚠️ Polling already running, skipping...');
    return;
  }
  
  isPolling = true;
  console.log('[POLL] Starting manual polling loop...');
  
  while (isPolling) {
    try {
      // Get updates from Telegram
      const updates = await bot.telegram.getUpdates({
        offset: pollOffset,
        limit: 100,
        timeout: 30, // Long polling timeout
      });
      
      if (updates && updates.length > 0) {
        console.log(`[POLL] Received ${updates.length} update(s)`);
        
        for (const update of updates) {
          // Deduplication: Skip if we've already processed this update
          if (PROCESSED_UPDATES.has(update.update_id)) {
            console.log(`[POLL] Skipping duplicate update ${update.update_id}`);
            continue;
          }
          
          // Add to processed set and limit size
          PROCESSED_UPDATES.add(update.update_id);
          if (PROCESSED_UPDATES.size > 1000) {
            const iterator = PROCESSED_UPDATES.values();
            PROCESSED_UPDATES.delete(iterator.next().value);
          }
          
          console.log(`[POLL] Processing update ${update.update_id}: ${Object.keys(update).filter(k => k !== 'update_id').join(', ')}`);
          
          try {
            // Process the update through Telegraf
            await bot.handleUpdate(update);
            console.log(`[POLL] ✅ Processed update ${update.update_id}`);
          } catch (handlerError) {
            console.error(`[POLL] ❌ Error handling update ${update.update_id}:`, handlerError.message);
          }
          
          // Update offset to acknowledge this update
          pollOffset = update.update_id + 1;
        }
        
        consecutiveErrors = 0; // Reset error counter on success
      }
    } catch (error) {
      consecutiveErrors++;
      console.error(`[POLL] ❌ Polling error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error.message);
      
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error('[POLL] ❌ Too many consecutive errors, stopping polling');
        isPolling = false;
        process.exit(1);
      }
      
      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, consecutiveErrors - 1), 30000);
      console.log(`[POLL] Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

(async () => {
  try {
    // Validate bot token
    const botInfo = await bot.telegram.getMe();
    console.log(`✅ Bot token valid: @${botInfo.username} (${botInfo.first_name})`);

    // CRITICAL: Delete webhook and drop pending updates
    try {
      console.log('📡 Deleting webhook and dropping pending updates...');
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      console.log('✅ Webhook deleted and pending updates cleared');
    } catch (err) {
      console.warn('⚠️ Could not delete webhook:', err.message);
    }

    // Wait a moment for Telegram to process the webhook deletion
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start manual polling
    console.log('📡 Starting polling...');
    startManualPolling();

    console.log('✅ Telegram bot polling started!');
    console.log('🎯 Bot is now listening for messages');
    console.log(`📱 Try sending /start to @${botInfo.username}`);

  } catch (err) {
    console.error('❌ Failed to start bot:');
    console.error('Error:', err.message);
    if (err.code) console.error('Code:', err.code);
    if (err.code === 401) {
      console.error('\n💡 Your TELEGRAM_BOT_TOKEN is invalid or revoked.');
      console.error('   Get a new token from @BotFather on Telegram.');
    }
    process.exit(1);
  }
})();

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('\n📴 SIGINT received, stopping bot...');
  isPolling = false;
  bot.stop('SIGINT');
  process.exit(0);
});
process.once('SIGTERM', () => {
  console.log('\n📴 SIGTERM received, stopping bot...');
  isPolling = false;
  bot.stop('SIGTERM');
  process.exit(0);
});